const mongoose = require("mongoose");

const categoryRatingSchema = new mongoose.Schema({
    current: { type: Number, default: 1500 },
    peak: { type: Number, default: 1500 },
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 }
}, { _id: false });

const ratingHistoryItemSchema = new mongoose.Schema({
    category: { type: String, required: true },
    ratingBefore: { type: Number, required: true },
    ratingAfter: { type: Number, required: true },
    delta: { type: Number, required: true },
    gameId: { type: String, default: null },
    opponent: { type: String, default: "Opponent" },
    outcome: { type: String, enum: ["win", "loss", "draw"], required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const playerSchema = new mongoose.Schema({
    sessionToken: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        default: "Magnus_G",
        index: true
    },
    title: {
        type: String,
        default: null
    },
    avatarColor: {
        type: String,
        default: "#3b82f6"
    },
    ratings: {
        bullet: { type: categoryRatingSchema, default: () => ({ current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 }) },
        blitz: { type: categoryRatingSchema, default: () => ({ current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 }) },
        rapid: { type: categoryRatingSchema, default: () => ({ current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 }) },
        classical: { type: categoryRatingSchema, default: () => ({ current: 1500, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 }) }
    },
    ratingHistory: [ratingHistoryItemSchema],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for player lookups
playerSchema.index({ username: 1, sessionToken: 1 });
playerSchema.index({ "ratings.rapid.current": -1 });
playerSchema.index({ "ratings.blitz.current": -1 });
playerSchema.index({ "ratings.bullet.current": -1 });
playerSchema.index({ "ratings.classical.current": -1 });

const Player = mongoose.models.Player || mongoose.model("Player", playerSchema);

module.exports = Player;
