const mongoose = require("mongoose");
const Game = require("./models/Game");
const Player = require("./models/Player");
const {
    calculateElo,
    validateRatedGame,
    getRatingCategory,
    DEFAULT_K_FACTOR
} = require("./elo");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chess";

let isConnected = false;
const inMemoryPlayers = new Map();

async function connectDB() {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        isConnected = true;
        console.log(`[Database] MongoDB connected successfully to ${MONGODB_URI}`);
    } catch (err) {
        console.warn(`[Database] MongoDB connection warning: ${err.message}. Operating with in-memory sync.`);
    }
}

// ─── Game Persistence Operations ──────────────────────────────

/**
 * Initialize or update active game record
 */
async function syncActiveGame(room) {
    if (!room || !room.id) return null;
    const initialTime = room.clockState ? Math.floor(room.clockState.w / 1000) : 600;
    const increment = (room.currentTimeControlKey && room.currentTimeControlKey.includes("+"))
        ? parseInt(room.currentTimeControlKey.split("+")[1], 10) || 0
        : 0;

    const spectatorsList = room.spectators ? Array.from(room.spectators).map(s => {
        if (typeof s === "string") return { socketId: s, joinedAt: new Date() };
        return { socketId: s.socketId || s.id, sessionToken: s.sessionToken || null, joinedAt: s.joinedAt || new Date() };
    }) : [];

    const isFinished = room.isGameFinished && room.isGameFinished();
    const hasMoves = room.chess && room.chess.history().length > 0;
    const currentStatus = isFinished ? "FINISHED" : (hasMoves ? "ACTIVE" : "WAITING");

    const gameDoc = {
        gameId: room.id,
        whitePlayer: {
            username: (room.playerProfiles && room.playerProfiles.white && room.playerProfiles.white.name) || "White",
            rating: (room.playerProfiles && room.playerProfiles.white && room.playerProfiles.white.rating) || 1500,
            sessionToken: (room.playerSessions && room.playerSessions.white && room.playerSessions.white.sessionToken) || null
        },
        blackPlayer: {
            username: (room.playerProfiles && room.playerProfiles.black && room.playerProfiles.black.name) || "Black",
            rating: (room.playerProfiles && room.playerProfiles.black && room.playerProfiles.black.rating) || 1500,
            sessionToken: (room.playerSessions && room.playerSessions.black && room.playerSessions.black.sessionToken) || null
        },
        spectators: spectatorsList,
        timeControl: room.currentTimeControlKey || "10+0",
        initialTime: initialTime,
        increment: increment,
        isRated: room.isRated !== false,
        status: currentStatus,
        PGN: room.chess ? room.chess.pgn() : "",
        createdAt: room.createdAt ? new Date(room.createdAt) : new Date()
    };

    if (room.startTime) {
        gameDoc.startTime = room.startTime;
    } else if (hasMoves) {
        room.startTime = new Date();
        gameDoc.startTime = room.startTime;
    }

    if (isConnected) {
        try {
            return await Game.findOneAndUpdate(
                { gameId: room.id },
                { $set: gameDoc },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            );
        } catch (e) {
            console.error(`[Database] Failed to sync active game ${room.id}:`, e.message);
        }
    }
    return gameDoc;
}

/**
 * Record a move to the database
 */
async function recordMove(gameId, moveData, pgn) {
    if (!gameId || !moveData) return;

    if (isConnected) {
        try {
            const moveEntry = {
                from: moveData.from,
                to: moveData.to,
                san: moveData.san,
                promotion: moveData.promotion || null,
                captured: moveData.captured || null,
                color: moveData.color,
                timestamp: new Date()
            };

            await Game.updateOne(
                { gameId: gameId },
                {
                    $push: { moves: moveEntry },
                    $set: {
                        PGN: pgn || "",
                        status: "ACTIVE"
                    }
                },
                { upsert: true }
            );

            // Set startTime on first move if not yet recorded
            await Game.updateOne(
                { gameId: gameId, startTime: null },
                { $set: { startTime: new Date() } }
            );
        } catch (e) {
            console.error(`[Database] Failed to record move for ${gameId}:`, e.message);
        }
    }
}

/**
 * Finalize completed game with result, winner, PGN, and end timestamp
 */
async function finalizeGame(gameId, gameOverData, pgn) {
    if (!gameId) return;

    let resultNotation = "*";
    let winner = gameOverData.winner || null;

    if (winner === "w") resultNotation = "1-0";
    else if (winner === "b") resultNotation = "0-1";
    else if (gameOverData.type === "draw" || gameOverData.type === "stalemate" || gameOverData.type === "insufficient" || gameOverData.type === "repetition") {
        resultNotation = "1/2-1/2";
    }

    let status = "FINISHED";
    if (gameOverData.type) {
        const t = gameOverData.type.toUpperCase();
        if (t === "RESIGNATION") status = "RESIGNED";
        else if (t === "CHECKMATE") status = "CHECKMATE";
        else if (t === "TIMEOUT") status = "TIMEOUT";
        else if (t === "DRAW" || t === "STALEMATE" || t === "REPETITION" || t === "INSUFFICIENT") status = t === "STALEMATE" ? "STALEMATE" : "DRAW";
        else if (t === "ABORTED") status = "ABORTED";
        else if (t === "ABANDONMENT") status = "ABANDONMENT";
        else status = t;
    }

    const updateFields = {
        status: status,
        winner: winner,
        result: resultNotation,
        PGN: pgn || "",
        endTime: new Date()
    };

    if (isConnected) {
        try {
            const updated = await Game.findOneAndUpdate(
                { gameId: gameId },
                { $set: updateFields },
                { returnDocument: 'after' }
            );
            console.log(`[Database] Finalized game ${gameId}: Result ${resultNotation} (${status})`);
            return updated;
        } catch (e) {
            console.error(`[Database] Failed to finalize game ${gameId}:`, e.message);
        }
    }
    return updateFields;
}

/**
 * Fetch a single game by gameId
 */
async function getGameById(gameId) {
    if (!gameId) return null;
    if (isConnected) {
        try {
            return await Game.findOne({ gameId: gameId }).lean();
        } catch (e) {
            console.error(`[Database] Failed to get game ${gameId}:`, e.message);
        }
    }
    return null;
}

/**
 * Fetch recent games with optional filtering
 */
async function getRecentGames({ limit = 20, status, timeControl, username } = {}) {
    if (!isConnected) return [];

    const query = {};
    if (status) query.status = status;
    if (timeControl) query.timeControl = timeControl;
    if (username) {
        query.$or = [
            { "whitePlayer.username": username },
            { "blackPlayer.username": username }
        ];
    }

    try {
        return await Game.find(query)
            .sort({ createdAt: -1 })
            .limit(Math.min(limit, 100))
            .lean();
    } catch (e) {
        console.error(`[Database] Failed to fetch recent games:`, e.message);
        return [];
    }
}

/**
 * Get or create player document by session token
 */
async function getOrCreatePlayer(sessionToken, defaultUsername = "Magnus_G") {
    if (!sessionToken) return null;

    if (isConnected) {
        try {
            let player = await Player.findOne({ sessionToken });
            if (!player) {
                player = new Player({
                    sessionToken,
                    username: defaultUsername,
                    ratings: {
                        bullet: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 },
                        blitz: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 },
                        rapid: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 },
                        classical: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 }
                    }
                });
                await player.save();
            } else if (defaultUsername && defaultUsername !== "Anonymous" && defaultUsername !== "White" && defaultUsername !== "Black") {
                player.username = defaultUsername;
                await player.save();
            }
            return player;
        } catch (e) {
            console.error(`[Database] Error in getOrCreatePlayer:`, e.message);
        }
    }

    // In-memory fallback
    if (!inMemoryPlayers.has(sessionToken)) {
        inMemoryPlayers.set(sessionToken, {
            sessionToken,
            username: defaultUsername,
            ratings: {
                bullet: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 },
                blitz: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 },
                rapid: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 },
                classical: { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 }
            },
            ratingHistory: [],
            save: async function () { return this; }
        });
    }
    const memPlayer = inMemoryPlayers.get(sessionToken);
    if (defaultUsername && defaultUsername !== "Anonymous" && defaultUsername !== "White" && defaultUsername !== "Black") {
        memPlayer.username = defaultUsername;
    }
    return memPlayer;
}

/**
 * Fetch player profile by sessionToken or username
 */
async function getPlayerByIdentifier(identifier) {
    if (!identifier) return null;
    if (isConnected) {
        try {
            return await Player.findOne({
                $or: [{ sessionToken: identifier }, { username: identifier }]
            }).lean();
        } catch (e) {
            console.error(`[Database] Error getting player ${identifier}:`, e.message);
        }
    }
    for (const p of inMemoryPlayers.values()) {
        if (p.sessionToken === identifier || p.username === identifier) return p;
    }
    return null;
}

/**
 * Process Elo rating updates for a completed match
 * Validates eligibility (casual, aborted, invalid games are rejected)
 * Calculates category Elo delta and updates player records & game document.
 */
async function processGameRatings(room, gameOverData) {
    if (!room || !gameOverData) return { updated: false, reason: "Incomplete match data" };

    const validation = validateRatedGame({
        isRated: room.isRated !== false,
        casual: !!room.isCasual,
        status: gameOverData.type,
        type: gameOverData.type,
        chess: room.chess,
        whitePlayer: room.playerSessions?.white,
        blackPlayer: room.playerSessions?.black
    });

    if (!validation.isEligible) {
        console.log(`[ELO] Rating calculation skipped for room ${room.id}: ${validation.reason}`);
        return { updated: false, reason: validation.reason };
    }

    const category = getRatingCategory(room.currentTimeControlKey);
    const whiteToken = room.playerSessions?.white?.sessionToken;
    const blackToken = room.playerSessions?.black?.sessionToken;

    if (!whiteToken || !blackToken) {
        return { updated: false, reason: "Missing player session tokens" };
    }

    const whitePlayer = await getOrCreatePlayer(whiteToken, room.playerProfiles?.white?.name || "White");
    const blackPlayer = await getOrCreatePlayer(blackToken, room.playerProfiles?.black?.name || "Black");

    const whiteRating = (whitePlayer.ratings[category] && whitePlayer.ratings[category].current) || 1500;
    const blackRating = (blackPlayer.ratings[category] && blackPlayer.ratings[category].current) || 1500;

    const elo = calculateElo(whiteRating, blackRating, gameOverData.winner);

    let outcomeWhite = "draw";
    let outcomeBlack = "draw";
    if (gameOverData.winner === "w") {
        outcomeWhite = "win";
        outcomeBlack = "loss";
    } else if (gameOverData.winner === "b") {
        outcomeWhite = "loss";
        outcomeBlack = "win";
    }

    // Update White player
    whitePlayer.ratings[category].current = elo.whiteNewRating;
    whitePlayer.ratings[category].peak = Math.max(whitePlayer.ratings[category].peak || 1500, elo.whiteNewRating);
    whitePlayer.ratings[category].games = (whitePlayer.ratings[category].games || 0) + 1;
    if (outcomeWhite === "win") whitePlayer.ratings[category].wins = (whitePlayer.ratings[category].wins || 0) + 1;
    else if (outcomeWhite === "loss") whitePlayer.ratings[category].losses = (whitePlayer.ratings[category].losses || 0) + 1;
    else whitePlayer.ratings[category].draws = (whitePlayer.ratings[category].draws || 0) + 1;

    whitePlayer.ratingHistory.push({
        category,
        ratingBefore: whiteRating,
        ratingAfter: elo.whiteNewRating,
        delta: elo.whiteDelta,
        gameId: room.id,
        opponent: blackPlayer.username,
        outcome: outcomeWhite,
        timestamp: new Date()
    });
    if (whitePlayer.save) await whitePlayer.save();

    // Update Black player
    blackPlayer.ratings[category].current = elo.blackNewRating;
    blackPlayer.ratings[category].peak = Math.max(blackPlayer.ratings[category].peak || 1500, elo.blackNewRating);
    blackPlayer.ratings[category].games = (blackPlayer.ratings[category].games || 0) + 1;
    if (outcomeBlack === "win") blackPlayer.ratings[category].wins = (blackPlayer.ratings[category].wins || 0) + 1;
    else if (outcomeBlack === "loss") blackPlayer.ratings[category].losses = (blackPlayer.ratings[category].losses || 0) + 1;
    else blackPlayer.ratings[category].draws = (blackPlayer.ratings[category].draws || 0) + 1;

    blackPlayer.ratingHistory.push({
        category,
        ratingBefore: blackRating,
        ratingAfter: elo.blackNewRating,
        delta: elo.blackDelta,
        gameId: room.id,
        opponent: whitePlayer.username,
        outcome: outcomeBlack,
        timestamp: new Date()
    });
    if (blackPlayer.save) await blackPlayer.save();

    // Update room memory profiles
    if (room.playerProfiles?.white) room.playerProfiles.white.rating = elo.whiteNewRating;
    if (room.playerProfiles?.black) room.playerProfiles.black.rating = elo.blackNewRating;

    // Update Game document in DB
    if (isConnected) {
        try {
            await Game.updateOne(
                { gameId: room.id },
                {
                    $set: {
                        isRated: true,
                        "whitePlayer.rating": elo.whiteNewRating,
                        "blackPlayer.rating": elo.blackNewRating,
                        ratingChanges: {
                            white: elo.whiteDelta,
                            black: elo.blackDelta
                        }
                    }
                }
            );
        } catch (e) {
            console.error(`[Database] Failed to record rating changes on game ${room.id}:`, e.message);
        }
    }

    console.log(`[ELO] Processed ${category.toUpperCase()} rating update for game ${room.id}: White (${whitePlayer.username}) ${whiteRating} -> ${elo.whiteNewRating} (${elo.whiteDelta >= 0 ? "+" : ""}${elo.whiteDelta}), Black (${blackPlayer.username}) ${blackRating} -> ${elo.blackNewRating} (${elo.blackDelta >= 0 ? "+" : ""}${elo.blackDelta})`);

    return {
        updated: true,
        category,
        white: {
            sessionToken: whiteToken,
            username: whitePlayer.username,
            oldRating: whiteRating,
            newRating: elo.whiteNewRating,
            delta: elo.whiteDelta,
            outcome: outcomeWhite
        },
        black: {
            sessionToken: blackToken,
            username: blackPlayer.username,
            oldRating: blackRating,
            newRating: elo.blackNewRating,
            delta: elo.blackDelta,
            outcome: outcomeBlack
        }
    };
}

module.exports = {
    connectDB,
    syncActiveGame,
    recordMove,
    finalizeGame,
    getGameById,
    getRecentGames,
    getOrCreatePlayer,
    getPlayerByIdentifier,
    processGameRatings,
    calculateElo,
    validateRatedGame,
    getRatingCategory,
    Game,
    Player
};
