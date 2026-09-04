const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socket(server);

// ─── Game State ───────────────────────────────────────────────
let chess = new Chess();
let players = {};

// ─── Express Config ───────────────────────────────────────────
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Serve chess.js from node_modules so client and server use the same version
app.use(
    "/vendor/chess.js",
    express.static(
        path.join(__dirname, "node_modules", "chess.js", "dist", "cjs"),
        { maxAge: "1d" }
    )
);

app.get("/", (req, res) => {
    res.render("index", { title: "Chess — Real-Time Multiplayer" });
});

// ─── Helper: Check Game-Over Conditions ───────────────────────
function checkGameOver() {
    if (!chess.isGameOver()) return null;

    let result = { gameOver: true };

    if (chess.isCheckmate()) {
        const winner = chess.turn() === "w" ? "b" : "w";
        result.type = "checkmate";
        result.winner = winner;
        result.message =
            winner === "w" ? "White wins by checkmate!" : "Black wins by checkmate!";
    } else if (chess.isStalemate()) {
        result.type = "stalemate";
        result.winner = null;
        result.message = "Draw by stalemate!";
    } else if (chess.isThreefoldRepetition()) {
        result.type = "repetition";
        result.winner = null;
        result.message = "Draw by threefold repetition!";
    } else if (chess.isInsufficientMaterial()) {
        result.type = "insufficient";
        result.winner = null;
        result.message = "Draw — insufficient material!";
    } else if (chess.isDraw()) {
        result.type = "draw";
        result.winner = null;
        result.message = "Draw by 50-move rule!";
    }

    return result;
}

// ─── Helper: Build Game Snapshot ──────────────────────────────
function getGameState() {
    return {
        fen: chess.fen(),
        turn: chess.turn(),
        isCheck: chess.isCheck(),
        isGameOver: chess.isGameOver(),
        history: chess.history({ verbose: true }),
    };
}

// ─── Socket.IO ────────────────────────────────────────────────
io.on("connection", function (uniquesocket) {
    console.log(`[connect] ${uniquesocket.id}`);

    // Assign role
    if (!players.white) {
        players.white = uniquesocket.id;
        uniquesocket.emit("playerRole", "w");
    } else if (!players.black) {
        players.black = uniquesocket.id;
        uniquesocket.emit("playerRole", "b");
    } else {
        uniquesocket.emit("spectatorRole");
    }

    // Send current game state immediately (fixes spectator/reconnect bug)
    uniquesocket.emit("gameState", getGameState());

    // ── Disconnect ────────────────────────────────────────────
    uniquesocket.on("disconnect", function () {
        console.log(`[disconnect] ${uniquesocket.id}`);
        if (uniquesocket.id === players.white) {
            delete players.white;
        } else if (uniquesocket.id === players.black) {
            delete players.black;
        }
    });

    // ── Move ──────────────────────────────────────────────────
    uniquesocket.on("move", (move) => {
        try {
            // Validate correct player's turn
            if (chess.turn() === "w" && uniquesocket.id !== players.white) return;
            if (chess.turn() === "b" && uniquesocket.id !== players.black) return;

            const result = chess.move(move);
            if (result) {
                // Broadcast move with metadata to all clients
                io.emit("move", {
                    from: result.from,
                    to: result.to,
                    promotion: result.promotion,
                    san: result.san,
                    captured: result.captured || null,
                    color: result.color,
                    isCheck: chess.isCheck(),
                });

                io.emit("boardState", chess.fen());

                // Check for game-over
                const gameOverResult = checkGameOver();
                if (gameOverResult) {
                    io.emit("gameOver", gameOverResult);
                }
            } else {
                console.log("invalid move:", move);
                uniquesocket.emit("invalidMove", move);
            }
        } catch (err) {
            console.log(err);
            uniquesocket.emit("invalidMove", move);
        }
    });

    // ── Resign ────────────────────────────────────────────────
    uniquesocket.on("resign", () => {
        let resignColor = null;
        if (uniquesocket.id === players.white) resignColor = "w";
        else if (uniquesocket.id === players.black) resignColor = "b";
        else return; // Spectators can't resign

        const winner = resignColor === "w" ? "b" : "w";
        io.emit("gameOver", {
            gameOver: true,
            type: "resignation",
            winner: winner,
            message:
                resignColor === "w"
                    ? "Black wins — White resigned!"
                    : "White wins — Black resigned!",
        });
    });

    // ── New Game ──────────────────────────────────────────────
    uniquesocket.on("newGame", () => {
        // Only players can start a new game
        if (
            uniquesocket.id !== players.white &&
            uniquesocket.id !== players.black
        )
            return;

        chess = new Chess();
        io.emit("newGame", getGameState());
        console.log("[newGame] Game reset");
    });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
    console.log(`Chess server listening on port ${PORT}`);
});