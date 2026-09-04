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

const SEED_PLAYERS = [
    {
        sessionToken: "seed_magnus_carlsen",
        username: "Magnus_Carlsen",
        title: "GM",
        avatarColor: "#eab308",
        ratings: {
            bullet: { current: 2885, peak: 2905, games: 420, wins: 310, losses: 50, draws: 60 },
            blitz: { current: 2890, peak: 2915, games: 560, wins: 415, losses: 70, draws: 75 },
            rapid: { current: 2840, peak: 2865, games: 340, wins: 250, losses: 35, draws: 55 },
            classical: { current: 2832, peak: 2882, games: 210, wins: 140, losses: 15, draws: 55 }
        },
        daysAgo: 0.2
    },
    {
        sessionToken: "seed_hikaru_nakamura",
        username: "Hikaru_Nakamura",
        title: "GM",
        avatarColor: "#3b82f6",
        ratings: {
            bullet: { current: 2915, peak: 2940, games: 610, wins: 460, losses: 75, draws: 75 },
            blitz: { current: 2880, peak: 2900, games: 590, wins: 430, losses: 80, draws: 80 },
            rapid: { current: 2825, peak: 2850, games: 320, wins: 230, losses: 40, draws: 50 },
            classical: { current: 2802, peak: 2816, games: 195, wins: 125, losses: 20, draws: 50 }
        },
        daysAgo: 1
    },
    {
        sessionToken: "seed_alireza_firouzja",
        username: "Alireza_Firouzja",
        title: "GM",
        avatarColor: "#10b981",
        ratings: {
            bullet: { current: 2845, peak: 2870, games: 380, wins: 270, losses: 60, draws: 50 },
            blitz: { current: 2825, peak: 2850, games: 410, wins: 295, losses: 65, draws: 50 },
            rapid: { current: 2785, peak: 2810, games: 260, wins: 180, losses: 40, draws: 40 },
            classical: { current: 2805, peak: 2805, games: 180, wins: 110, losses: 25, draws: 45 }
        },
        daysAgo: 3
    },
    {
        sessionToken: "seed_fabiano_caruana",
        username: "Fabiano_Caruana",
        title: "GM",
        avatarColor: "#8b5cf6",
        ratings: {
            bullet: { current: 2720, peak: 2750, games: 240, wins: 160, losses: 45, draws: 35 },
            blitz: { current: 2805, peak: 2830, games: 390, wins: 270, losses: 60, draws: 60 },
            rapid: { current: 2800, peak: 2820, games: 295, wins: 205, losses: 40, draws: 50 },
            classical: { current: 2805, peak: 2844, games: 220, wins: 140, losses: 20, draws: 60 }
        },
        daysAgo: 4
    },
    {
        sessionToken: "seed_gukesh_d",
        username: "Gukesh_D",
        title: "GM",
        avatarColor: "#ec4899",
        ratings: {
            bullet: { current: 2680, peak: 2710, games: 190, wins: 125, losses: 35, draws: 30 },
            blitz: { current: 2740, peak: 2765, games: 270, wins: 185, losses: 45, draws: 40 },
            rapid: { current: 2765, peak: 2785, games: 210, wins: 145, losses: 30, draws: 35 },
            classical: { current: 2798, peak: 2802, games: 175, wins: 115, losses: 18, draws: 42 }
        },
        daysAgo: 6
    },
    {
        sessionToken: "seed_arjun_erigaisi",
        username: "Arjun_Erigaisi",
        title: "GM",
        avatarColor: "#06b6d4",
        ratings: {
            bullet: { current: 2790, peak: 2815, games: 280, wins: 195, losses: 45, draws: 40 },
            blitz: { current: 2795, peak: 2820, games: 340, wins: 240, losses: 50, draws: 50 },
            rapid: { current: 2770, peak: 2790, games: 230, wins: 160, losses: 35, draws: 35 },
            classical: { current: 2797, peak: 2805, games: 190, wins: 125, losses: 22, draws: 43 }
        },
        daysAgo: 10
    },
    {
        sessionToken: "seed_ian_nepomniachtchi",
        username: "Nepo_I",
        title: "GM",
        avatarColor: "#f97316",
        ratings: {
            bullet: { current: 2765, peak: 2795, games: 310, wins: 215, losses: 50, draws: 45 },
            blitz: { current: 2800, peak: 2825, games: 380, wins: 265, losses: 55, draws: 60 },
            rapid: { current: 2780, peak: 2805, games: 270, wins: 185, losses: 40, draws: 45 },
            classical: { current: 2770, peak: 2795, games: 185, wins: 115, losses: 20, draws: 50 }
        },
        daysAgo: 14
    },
    {
        sessionToken: "seed_nodirbek_abdusattorov",
        username: "Nodirbek_A",
        title: "GM",
        avatarColor: "#14b8a6",
        ratings: {
            bullet: { current: 2795, peak: 2820, games: 260, wins: 180, losses: 45, draws: 35 },
            blitz: { current: 2780, peak: 2805, games: 310, wins: 215, losses: 50, draws: 45 },
            rapid: { current: 2775, peak: 2795, games: 240, wins: 165, losses: 35, draws: 40 },
            classical: { current: 2777, peak: 2785, games: 160, wins: 100, losses: 20, draws: 40 }
        },
        daysAgo: 18
    },
    {
        sessionToken: "seed_ding_liren",
        username: "Ding_Liren",
        title: "GM",
        avatarColor: "#ef4444",
        ratings: {
            bullet: { current: 2710, peak: 2740, games: 180, wins: 115, losses: 35, draws: 30 },
            blitz: { current: 2750, peak: 2775, games: 250, wins: 170, losses: 40, draws: 40 },
            rapid: { current: 2780, peak: 2836, games: 220, wins: 150, losses: 30, draws: 40 },
            classical: { current: 2760, peak: 2816, games: 190, wins: 118, losses: 22, draws: 50 }
        },
        daysAgo: 22
    },
    {
        sessionToken: "seed_wesley_so",
        username: "Wesley_So",
        title: "GM",
        avatarColor: "#6366f1",
        ratings: {
            bullet: { current: 2770, peak: 2800, games: 320, wins: 220, losses: 50, draws: 50 },
            blitz: { current: 2785, peak: 2815, games: 390, wins: 270, losses: 55, draws: 65 },
            rapid: { current: 2780, peak: 2805, games: 290, wins: 200, losses: 40, draws: 50 },
            classical: { current: 2757, peak: 2822, games: 210, wins: 130, losses: 18, draws: 62 }
        },
        daysAgo: 26
    },
    {
        sessionToken: "seed_pragg_r",
        username: "Praggnanandhaa_R",
        title: "GM",
        avatarColor: "#f59e0b",
        ratings: {
            bullet: { current: 2720, peak: 2745, games: 220, wins: 150, losses: 38, draws: 32 },
            blitz: { current: 2745, peak: 2770, games: 290, wins: 200, losses: 45, draws: 45 },
            rapid: { current: 2755, peak: 2775, games: 215, wins: 145, losses: 32, draws: 38 },
            classical: { current: 2755, peak: 2765, games: 170, wins: 105, losses: 20, draws: 45 }
        },
        daysAgo: 35
    },
    {
        sessionToken: "seed_vincent_keymer",
        username: "Vincent_Keymer",
        title: "GM",
        avatarColor: "#84cc16",
        ratings: {
            bullet: { current: 2690, peak: 2715, games: 170, wins: 110, losses: 32, draws: 28 },
            blitz: { current: 2730, peak: 2755, games: 240, wins: 160, losses: 40, draws: 40 },
            rapid: { current: 2740, peak: 2760, games: 195, wins: 130, losses: 30, draws: 35 },
            classical: { current: 2738, peak: 2745, games: 155, wins: 95, losses: 20, draws: 40 }
        },
        daysAgo: 45
    },
    {
        sessionToken: "seed_anish_giri",
        username: "Anish_Giri",
        title: "GM",
        avatarColor: "#0ea5e9",
        ratings: {
            bullet: { current: 2740, peak: 2770, games: 290, wins: 195, losses: 45, draws: 50 },
            blitz: { current: 2770, peak: 2795, games: 360, wins: 245, losses: 55, draws: 60 },
            rapid: { current: 2760, peak: 2785, games: 260, wins: 175, losses: 38, draws: 47 },
            classical: { current: 2735, peak: 2802, games: 210, wins: 125, losses: 18, draws: 67 }
        },
        daysAgo: 50
    },
    {
        sessionToken: "seed_vidit_gujrathi",
        username: "Vidit_Gujrathi",
        title: "GM",
        avatarColor: "#d946ef",
        ratings: {
            bullet: { current: 2700, peak: 2725, games: 210, wins: 140, losses: 38, draws: 32 },
            blitz: { current: 2730, peak: 2755, games: 280, wins: 190, losses: 45, draws: 45 },
            rapid: { current: 2735, peak: 2755, games: 205, wins: 138, losses: 32, draws: 35 },
            classical: { current: 2720, peak: 2740, games: 165, wins: 100, losses: 22, draws: 43 }
        },
        daysAgo: 60
    }
];

async function seedLeaderboardIfEmpty() {
    // Populate in-memory
    for (const seed of SEED_PLAYERS) {
        if (!inMemoryPlayers.has(seed.sessionToken)) {
            const updatedAt = new Date(Date.now() - (seed.daysAgo || 0) * 24 * 60 * 60 * 1000);
            inMemoryPlayers.set(seed.sessionToken, {
                ...seed,
                ratingHistory: [],
                updatedAt,
                createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                save: async function () { return this; }
            });
        }
    }

    if (isConnected) {
        try {
            const count = await Player.countDocuments({ sessionToken: { $regex: /^seed_/ } });
            if (count < SEED_PLAYERS.length) {
                for (const seed of SEED_PLAYERS) {
                    const updatedAt = new Date(Date.now() - (seed.daysAgo || 0) * 24 * 60 * 60 * 1000);
                    await Player.findOneAndUpdate(
                        { sessionToken: seed.sessionToken },
                        {
                            $set: {
                                username: seed.username,
                                title: seed.title,
                                avatarColor: seed.avatarColor,
                                ratings: seed.ratings,
                                updatedAt,
                                createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                            }
                        },
                        { upsert: true, returnDocument: 'after' }
                    );
                }
                console.log(`[Leaderboard] Seeded ${SEED_PLAYERS.length} grandmasters in MongoDB`);
            }
        } catch (err) {
            console.error(`[Leaderboard] Error seeding grandmasters:`, err.message);
        }
    }
}

async function connectDB() {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        isConnected = true;
        console.log(`[Database] MongoDB connected successfully to ${MONGODB_URI}`);
        await seedLeaderboardIfEmpty();
    } catch (err) {
        console.warn(`[Database] MongoDB connection warning: ${err.message}. Operating with in-memory sync.`);
        await seedLeaderboardIfEmpty();
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

/**
 * Get Leaderboard across categories and timeframes (Phase 15)
 * @param {Object} options
 * @param {string} options.category - "bullet" | "blitz" | "rapid" | "classical"
 * @param {string} options.timeframe - "global" | "weekly" | "monthly"
 * @param {number} options.limit - Max items to return (default 50)
 * @param {string} options.currentUserToken - Optional sessionToken to identify current user
 * @param {string} options.currentUsername - Optional username to identify current user
 */
async function getLeaderboard({
    category = "rapid",
    timeframe = "global",
    limit = 50,
    currentUserToken = null,
    currentUsername = null
} = {}) {
    const validCategory = ["bullet", "blitz", "rapid", "classical"].includes(category) ? category : "rapid";
    const validTimeframe = ["global", "weekly", "monthly"].includes(timeframe) ? timeframe : "global";
    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    // Ensure seed players exist
    await seedLeaderboardIfEmpty();

    let docs = [];
    let userRank = null;

    if (isConnected) {
        try {
            const query = {};
            if (validTimeframe === "weekly") {
                query.updatedAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
            } else if (validTimeframe === "monthly") {
                query.updatedAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
            }

            const sortField = `ratings.${validCategory}.current`;
            const gamesField = `ratings.${validCategory}.games`;

            docs = await Player.find(query)
                .sort({ [sortField]: -1, [gamesField]: -1 })
                .limit(maxLimit)
                .lean();

            // Calculate user rank if token or username provided
            if (currentUserToken || currentUsername) {
                const userDoc = await Player.findOne({
                    $or: [
                        ...(currentUserToken ? [{ sessionToken: currentUserToken }] : []),
                        ...(currentUsername ? [{ username: currentUsername }] : [])
                    ]
                }).lean();

                if (userDoc) {
                    const userCat = (userDoc.ratings && userDoc.ratings[validCategory]) || { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 };
                    const userRating = userCat.current || 1500;
                    const higherCount = await Player.countDocuments({
                        ...query,
                        [sortField]: { $gt: userRating }
                    });
                    const rank = higherCount + 1;
                    const winRate = userCat.games > 0 ? `${((userCat.wins / userCat.games) * 100).toFixed(1)}%` : "0.0%";
                    userRank = {
                        rank,
                        username: userDoc.username,
                        sessionToken: userDoc.sessionToken,
                        avatarColor: userDoc.avatarColor || "#3b82f6",
                        title: userDoc.title || (userRating >= 2700 ? "GM" : userRating >= 2400 ? "IM" : (userCat.games > 20 ? "PRO" : null)),
                        rating: userRating,
                        peak: userCat.peak || userRating,
                        games: userCat.games || 0,
                        wins: userCat.wins || 0,
                        losses: userCat.losses || 0,
                        draws: userCat.draws || 0,
                        winRate,
                        category: validCategory,
                        timeframe: validTimeframe
                    };
                }
            }
        } catch (err) {
            console.error("[Leaderboard] MongoDB query failed, falling back to memory:", err.message);
            docs = [];
        }
    }

    if (!docs || docs.length === 0) {
        // In-memory calculation
        let allMem = Array.from(inMemoryPlayers.values());
        if (validTimeframe === "weekly") {
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            allMem = allMem.filter(p => p.updatedAt && new Date(p.updatedAt).getTime() >= cutoff);
        } else if (validTimeframe === "monthly") {
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            allMem = allMem.filter(p => p.updatedAt && new Date(p.updatedAt).getTime() >= cutoff);
        }

        allMem.sort((a, b) => {
            const rA = (a.ratings && a.ratings[validCategory] && a.ratings[validCategory].current) || 1500;
            const rB = (b.ratings && b.ratings[validCategory] && b.ratings[validCategory].current) || 1500;
            if (rB !== rA) return rB - rA;
            const gA = (a.ratings && a.ratings[validCategory] && a.ratings[validCategory].games) || 0;
            const gB = (b.ratings && b.ratings[validCategory] && b.ratings[validCategory].games) || 0;
            return gB - gA;
        });

        docs = allMem.slice(0, maxLimit);

        if ((currentUserToken || currentUsername) && !userRank) {
            const uIndex = allMem.findIndex(p =>
                (currentUserToken && p.sessionToken === currentUserToken) ||
                (currentUsername && p.username === currentUsername)
            );
            if (uIndex !== -1) {
                const uDoc = allMem[uIndex];
                const uCat = (uDoc.ratings && uDoc.ratings[validCategory]) || { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 };
                userRank = {
                    rank: uIndex + 1,
                    username: uDoc.username,
                    sessionToken: uDoc.sessionToken,
                    avatarColor: uDoc.avatarColor || "#3b82f6",
                    title: uDoc.title || (uCat.current >= 2700 ? "GM" : uCat.current >= 2400 ? "IM" : (uCat.games > 20 ? "PRO" : null)),
                    rating: uCat.current,
                    peak: uCat.peak || uCat.current,
                    games: uCat.games || 0,
                    wins: uCat.wins || 0,
                    losses: uCat.losses || 0,
                    draws: uCat.draws || 0,
                    winRate: uCat.games > 0 ? `${((uCat.wins / uCat.games) * 100).toFixed(1)}%` : "0.0%",
                    category: validCategory,
                    timeframe: validTimeframe
                };
            }
        }
    }

    const leaderboard = docs.map((doc, idx) => {
        const cat = (doc.ratings && doc.ratings[validCategory]) || { current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 };
        const winRate = cat.games > 0 ? `${((cat.wins / cat.games) * 100).toFixed(1)}%` : "0.0%";
        const isCurrentUser = (currentUserToken && doc.sessionToken === currentUserToken) ||
                              (currentUsername && doc.username === currentUsername);
        return {
            rank: idx + 1,
            username: doc.username || "Anonymous",
            sessionToken: doc.sessionToken,
            avatarColor: doc.avatarColor || "#3b82f6",
            title: doc.title || (cat.current >= 2700 ? "GM" : cat.current >= 2400 ? "IM" : (cat.games > 50 ? "PRO" : null)),
            rating: cat.current,
            peak: cat.peak || cat.current,
            games: cat.games,
            wins: cat.wins,
            losses: cat.losses,
            draws: cat.draws,
            winRate,
            isCurrentUser: !!isCurrentUser,
            lastActive: doc.updatedAt || doc.createdAt
        };
    });

    // If userRank was found in docs, ensure isCurrentUser is marked
    if (!userRank && (currentUserToken || currentUsername)) {
        const found = leaderboard.find(p => p.isCurrentUser);
        if (found) {
            userRank = { ...found, category: validCategory, timeframe: validTimeframe };
        }
    }

    return {
        category: validCategory,
        timeframe: validTimeframe,
        total: leaderboard.length,
        userRank,
        leaderboard
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
    getLeaderboard,
    calculateElo,
    validateRatedGame,
    getRatingCategory,
    Game,
    Player
};
