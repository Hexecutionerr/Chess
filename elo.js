/**
 * Elo Rating System for ChessArena
 * Implements FIDE/USCF Elo rating calculation, validation, and category management.
 */

const DEFAULT_K_FACTOR = 32;

/**
 * Calculate expected score for player A against player B
 * Formula: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number} Expected score between 0 and 1
 */
function getExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate Elo rating changes for a match
 * @param {number} whiteRating - White player's current rating
 * @param {number} blackRating - Black player's current rating
 * @param {"w" | "b" | null} winner - "w" (white win), "b" (black win), null (draw)
 * @param {Object} [options]
 * @param {number} [options.kFactor=32] - K-factor (sensitivity weight)
 * @returns {{
 *   whiteDelta: number,
 *   blackDelta: number,
 *   whiteNewRating: number,
 *   blackNewRating: number,
 *   expectedWhite: number,
 *   expectedBlack: number
 * }}
 */
function calculateElo(whiteRating, blackRating, winner, options = {}) {
    const K = options.kFactor || DEFAULT_K_FACTOR;

    const expectedWhite = getExpectedScore(whiteRating, blackRating);
    const expectedBlack = 1 - expectedWhite;

    let scoreWhite = 0.5;
    let scoreBlack = 0.5;

    if (winner === "w") {
        scoreWhite = 1;
        scoreBlack = 0;
    } else if (winner === "b") {
        scoreWhite = 0;
        scoreBlack = 1;
    }

    const whiteDelta = Math.round(K * (scoreWhite - expectedWhite));
    const blackDelta = Math.round(K * (scoreBlack - expectedBlack));

    return {
        whiteDelta,
        blackDelta,
        whiteNewRating: Math.max(100, Math.round(whiteRating + whiteDelta)),
        blackNewRating: Math.max(100, Math.round(blackRating + blackDelta)),
        expectedWhite: parseFloat(expectedWhite.toFixed(4)),
        expectedBlack: parseFloat(expectedBlack.toFixed(4))
    };
}

/**
 * Validate whether a match is eligible for Elo rating updates
 * Prevents updates for:
 *  1. Casual / unrated games
 *  2. Aborted games
 *  3. Invalid games (< 2 moves played, self-play / duplicate sessionToken)
 * 
 * @param {Object} game - Room or game document object
 * @returns {{ isEligible: boolean, reason?: string }}
 */
function validateRatedGame(game) {
    if (!game) {
        return { isEligible: false, reason: "Game object not provided" };
    }

    // 1. Prevent rating update for casual / unrated games
    if (game.isRated === false || game.casual === true) {
        return { isEligible: false, reason: "Casual/unrated game" };
    }

    // 2. Prevent rating update for aborted games
    const status = (game.status || "").toUpperCase();
    const type = (game.type || (game.gameOverData && game.gameOverData.type) || "").toLowerCase();
    if (status === "ABORTED" || type === "aborted") {
        return { isEligible: false, reason: "Aborted game" };
    }

    // 3. Prevent rating update for invalid games: fewer than 2 completed moves (1 move per side minimum)
    let movesCount = 0;
    if (Array.isArray(game.moves)) {
        movesCount = game.moves.length;
    } else if (game.chess && typeof game.chess.history === "function") {
        movesCount = game.chess.history().length;
    }
    if (movesCount < 2) {
        return { isEligible: false, reason: "Invalid game: fewer than 2 moves played" };
    }

    // 4. Prevent rating update for invalid games: self-play between identical session tokens
    const whiteToken = game.whitePlayer?.sessionToken || game.playerSessions?.white?.sessionToken;
    const blackToken = game.blackPlayer?.sessionToken || game.playerSessions?.black?.sessionToken;
    if (whiteToken && blackToken && whiteToken === blackToken) {
        return { isEligible: false, reason: "Invalid game: self-play on identical session token" };
    }

    return { isEligible: true };
}

/**
 * Standard category normalizer for time controls
 * Maps time control string or key to category: "bullet", "blitz", "rapid", "classical"
 */
function getRatingCategory(timeControlKey) {
    if (!timeControlKey) return "rapid";
    const key = timeControlKey.toLowerCase().trim();
    if (key.includes("bullet") || key === "1+0" || key === "2+1") return "bullet";
    if (key.includes("blitz") || key === "3+0" || key === "3+2" || key === "5+0") return "blitz";
    if (key.includes("classical") || key === "30+0") return "classical";
    return "rapid"; // default rapid for 10+0, 10+5, 15+10, etc.
}

module.exports = {
    DEFAULT_K_FACTOR,
    getExpectedScore,
    calculateElo,
    validateRatedGame,
    getRatingCategory
};
