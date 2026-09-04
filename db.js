const mongoose = require("mongoose");
const Game = require("./models/Game");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chess";

let isConnected = false;

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
                { upsert: true, new: true, setDefaultsOnInsert: true }
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
                { new: true }
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

module.exports = {
    connectDB,
    syncActiveGame,
    recordMove,
    finalizeGame,
    getGameById,
    getRecentGames,
    Game
};
