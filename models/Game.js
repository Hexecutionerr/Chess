const mongoose = require("mongoose");

const moveSchema = new mongoose.Schema({
    from: { type: String, required: true },
    to: { type: String, required: true },
    san: { type: String, required: true },
    promotion: { type: String, default: null },
    captured: { type: String, default: null },
    color: { type: String, enum: ["w", "b"], required: true },
    timeSpentMs: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const playerSubSchema = new mongoose.Schema({
    id: { type: String, default: null },
    username: { type: String, default: "Anonymous" },
    rating: { type: Number, default: 1500 },
    sessionToken: { type: String, default: null }
}, { _id: false });

const gameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
    },
    whitePlayer: {
        type: playerSubSchema,
        default: () => ({ username: "White Player", rating: 1500 })
    },
    blackPlayer: {
        type: playerSubSchema,
        default: () => ({ username: "Black Player", rating: 1500 })
    },
    spectators: [{
        socketId: String,
        sessionToken: String,
        joinedAt: { type: Date, default: Date.now }
    }],
    timeControl: {
        type: String,
        required: true,
        default: "10+0"
    },
    initialTime: {
        type: Number, // in seconds (e.g. 600 for 10 min)
        required: true,
        default: 600
    },
    increment: {
        type: Number, // in seconds (e.g. 0, 1, 2, 5)
        required: true,
        default: 0
    },
    moves: [moveSchema],
    PGN: {
        type: String,
        default: ""
    },
    isRated: {
        type: Boolean,
        default: true
    },
    ratingChanges: {
        white: { type: Number, default: 0 },
        black: { type: Number, default: 0 }
    },
    result: {
        type: String,
        enum: ["1-0", "0-1", "1/2-1/2", "*"],
        default: "*"
    },
    status: {
        type: String,
        enum: [
            "WAITING",
            "STARTING",
            "ACTIVE",
            "CHECK",
            "CHECKMATE",
            "TIMEOUT",
            "RESIGNED",
            "DRAW",
            "STALEMATE",
            "ABORTED",
            "ABANDONMENT",
            "FINISHED"
        ],
        default: "WAITING",
        index: true
    },
    winner: {
        type: String,
        enum: ["w", "b", null],
        default: null
    },
    startTime: {
        type: Date,
        default: null
    },
    endTime: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Proper indexes where needed
gameSchema.index({ "whitePlayer.username": 1, createdAt: -1 });
gameSchema.index({ "blackPlayer.username": 1, createdAt: -1 });
gameSchema.index({ "whitePlayer.sessionToken": 1, createdAt: -1 });
gameSchema.index({ "blackPlayer.sessionToken": 1, createdAt: -1 });
gameSchema.index({ status: 1, timeControl: 1, createdAt: -1 });

const Game = mongoose.models.Game || mongoose.model("Game", gameSchema);

module.exports = Game;
