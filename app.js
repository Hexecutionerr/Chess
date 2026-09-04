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
let players = {
    white: null,
    black: null,
};
let playerProfiles = {
    white: { name: "Magnus_G", rating: 1540, avatarColor: "#3b82f6" },
    black: { name: "Hikaru_K", rating: 1515, avatarColor: "#10b981" }
};

// Clocks: 10 minutes (600s) default
const START_TIME = 600;
let clocks = {
    w: START_TIME,
    b: START_TIME,
    active: false,
    timer: null,
};
let drawOffer = null; // 'w' or 'b'
let chatMessages = [];

// ─── Clock Management ─────────────────────────────────────────
function startClock() {
    if (clocks.timer) return;
    clocks.active = true;
    clocks.timer = setInterval(() => {
        if (!clocks.active || chess.isGameOver()) {
            stopClock();
            return;
        }
        const turn = chess.turn();
        if (clocks[turn] > 0) {
            clocks[turn]--;
            io.emit("clockTick", {
                w: clocks.w,
                b: clocks.b,
                turn: chess.turn()
            });
            if (clocks[turn] <= 0) {
                stopClock();
                const winner = turn === "w" ? "b" : "w";
                io.emit("gameOver", {
                    gameOver: true,
                    type: "timeout",
                    winner: winner,
                    message: turn === "w" ? "Black wins on time!" : "White wins on time!"
                });
            }
        }
    }, 1000);
}

function stopClock() {
    clocks.active = false;
    if (clocks.timer) {
        clearInterval(clocks.timer);
        clocks.timer = null;
    }
}

function resetClocks() {
    stopClock();
    clocks.w = START_TIME;
    clocks.b = START_TIME;
    clocks.active = false;
}

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
    res.render("index", { title: "ChessArena — Professional Online Chess" });
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
        clocks: {
            w: clocks.w,
            b: clocks.b,
            active: clocks.active,
        },
        players: {
            white: players.white ? playerProfiles.white : null,
            black: players.black ? playerProfiles.black : null,
        }
    };
}

// ─── Socket.IO ────────────────────────────────────────────────
io.on("connection", function (uniquesocket) {
    console.log(`[connect] ${uniquesocket.id}`);

    // Assign role
    let assignedRole = null;
    if (!players.white) {
        players.white = uniquesocket.id;
        assignedRole = "w";
        uniquesocket.emit("playerRole", "w");
    } else if (!players.black) {
        players.black = uniquesocket.id;
        assignedRole = "b";
        uniquesocket.emit("playerRole", "b");
    } else {
        uniquesocket.emit("spectatorRole");
    }

    // Broadcast updated player slots to everyone
    io.emit("playersUpdate", {
        white: players.white ? playerProfiles.white : null,
        black: players.black ? playerProfiles.black : null,
    });

    // Send current game state immediately
    uniquesocket.emit("gameState", getGameState());
    uniquesocket.emit("chatHistory", chatMessages.slice(-30));

    // Send system announcement
    const roleText = assignedRole === "w" ? "White (Magnus_G)" : assignedRole === "b" ? "Black (Hikaru_K)" : "Spectator";
    const joinMsg = {
        sender: "System",
        role: "sys",
        text: `New user joined as ${roleText}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    io.emit("chatMessage", joinMsg);

    // ── Disconnect ────────────────────────────────────────────
    uniquesocket.on("disconnect", function () {
        console.log(`[disconnect] ${uniquesocket.id}`);
        let leftRole = null;
        if (uniquesocket.id === players.white) {
            players.white = null;
            leftRole = "White";
        } else if (uniquesocket.id === players.black) {
            players.black = null;
            leftRole = "Black";
        }

        if (leftRole) {
            io.emit("playersUpdate", {
                white: players.white ? playerProfiles.white : null,
                black: players.black ? playerProfiles.black : null,
            });
            io.emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `${leftRole} disconnected`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
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
                // Start clock on first move if both players are present
                if (!clocks.active && !chess.isGameOver()) {
                    startClock();
                }

                // Reset any pending draw offer on move
                drawOffer = null;

                // Broadcast move with metadata to all clients
                io.emit("move", {
                    from: result.from,
                    to: result.to,
                    promotion: result.promotion,
                    san: result.san,
                    captured: result.captured || null,
                    color: result.color,
                    isCheck: chess.isCheck(),
                    fen: chess.fen(),
                    history: chess.history({ verbose: true }),
                    clocks: { w: clocks.w, b: clocks.b }
                });

                io.emit("boardState", chess.fen());

                // Check for game-over
                const gameOverResult = checkGameOver();
                if (gameOverResult) {
                    stopClock();
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

        stopClock();
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

    // ── Draw Offer ────────────────────────────────────────────
    uniquesocket.on("offerDraw", () => {
        let offerColor = null;
        if (uniquesocket.id === players.white) offerColor = "w";
        else if (uniquesocket.id === players.black) offerColor = "b";
        else return;

        if (drawOffer && drawOffer !== offerColor) {
            // Both offered draw -> draw agreed
            stopClock();
            io.emit("gameOver", {
                gameOver: true,
                type: "draw",
                winner: null,
                message: "Draw agreed by both players!"
            });
            drawOffer = null;
        } else {
            drawOffer = offerColor;
            const targetSocket = offerColor === "w" ? players.black : players.white;
            if (targetSocket) {
                io.to(targetSocket).emit("drawOffered", { by: offerColor });
            }
            io.emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `${offerColor === "w" ? "White" : "Black"} offered a draw`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    uniquesocket.on("acceptDraw", () => {
        let acceptColor = null;
        if (uniquesocket.id === players.white) acceptColor = "w";
        else if (uniquesocket.id === players.black) acceptColor = "b";
        else return;

        if (drawOffer && drawOffer !== acceptColor) {
            stopClock();
            io.emit("gameOver", {
                gameOver: true,
                type: "draw",
                winner: null,
                message: "Draw agreed by both players!"
            });
            drawOffer = null;
        }
    });

    uniquesocket.on("declineDraw", () => {
        if (drawOffer) {
            const offerer = drawOffer === "w" ? players.white : players.black;
            if (offerer) {
                io.to(offerer).emit("drawDeclined");
            }
            drawOffer = null;
        }
    });

    // ── Chat Message ──────────────────────────────────────────
    uniquesocket.on("chatMessage", (text) => {
        if (!text || typeof text !== "string" || !text.trim()) return;

        let senderName = "Spectator";
        let senderRole = "spectator";

        if (uniquesocket.id === players.white) {
            senderName = playerProfiles.white.name;
            senderRole = "white";
        } else if (uniquesocket.id === players.black) {
            senderName = playerProfiles.black.name;
            senderRole = "black";
        }

        const messageObj = {
            sender: senderName,
            role: senderRole,
            text: text.trim().slice(0, 200), // prevent huge messages
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        chatMessages.push(messageObj);
        if (chatMessages.length > 100) chatMessages.shift();

        io.emit("chatMessage", messageObj);
    });

    // ── New Game ──────────────────────────────────────────────
    uniquesocket.on("newGame", () => {
        if (
            uniquesocket.id !== players.white &&
            uniquesocket.id !== players.black
        )
            return;

        chess = new Chess();
        resetClocks();
        drawOffer = null;
        io.emit("newGame", getGameState());
        io.emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: "New game started! 10:00 Rapid on the clock.",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        console.log("[newGame] Game reset");
    });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
    console.log(`Chess server listening on port ${PORT}`);
});