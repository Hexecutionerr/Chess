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
let isGameOverState = false;

function isGameFinished() {
    return isGameOverState || chess.isGameOver();
}

let players = {
    white: null,
    black: null,
};
let playerProfiles = {
    white: { name: "Magnus_G", rating: 1540, avatarColor: "#3b82f6" },
    black: { name: "Hikaru_K", rating: 1515, avatarColor: "#10b981" }
};

// ─── Supported Time Controls ──────────────────────────────────
const TIME_CONTROLS = {
    "1+0":   { base: 60,   increment: 0,  category: "Bullet",    label: "1+0 • Bullet" },
    "2+1":   { base: 120,  increment: 1,  category: "Bullet",    label: "2+1 • Bullet" },
    "3+0":   { base: 180,  increment: 0,  category: "Blitz",     label: "3+0 • Blitz" },
    "3+2":   { base: 180,  increment: 2,  category: "Blitz",     label: "3+2 • Blitz" },
    "5+0":   { base: 300,  increment: 0,  category: "Blitz",     label: "5+0 • Blitz" },
    "10+0":  { base: 600,  increment: 0,  category: "Rapid",     label: "10+0 • Rapid" },
    "10+5":  { base: 600,  increment: 5,  category: "Rapid",     label: "10+5 • Rapid" },
    "15+10": { base: 900,  increment: 10, category: "Rapid",     label: "15+10 • Rapid" },
    "30+0":  { base: 1800, increment: 0,  category: "Classical", label: "30+0 • Classical" },
};

let currentTimeControlKey = "10+0";
let clockState = {
    w: TIME_CONTROLS["10+0"].base * 1000, // in milliseconds
    b: TIME_CONTROLS["10+0"].base * 1000, // in milliseconds
    active: false,
    lastTurnTimestamp: null,
    timer: null,
};
let lastSyncTimestamp = 0;
let drawOffer = null; // 'w' or 'b'
let rematchOffer = null; // 'w' or 'b'
let chatMessages = [];

// ─── Authoritative Clock Management ───────────────────────────
function getClockSnapshot() {
    let w = clockState.w;
    let b = clockState.b;

    if (clockState.active && clockState.lastTurnTimestamp) {
        const currentTurn = chess.turn();
        const elapsed = Date.now() - clockState.lastTurnTimestamp;
        if (currentTurn === "w") w = Math.max(0, w - elapsed);
        else if (currentTurn === "b") b = Math.max(0, b - elapsed);
    }

    const tc = TIME_CONTROLS[currentTimeControlKey] || TIME_CONTROLS["10+0"];
    return {
        wMs: Math.max(0, w),
        bMs: Math.max(0, b),
        w: Math.max(0, Math.ceil(w / 1000)),
        b: Math.max(0, Math.ceil(b / 1000)),
        active: clockState.active,
        turn: chess.turn(),
        lastTurnTimestamp: clockState.lastTurnTimestamp,
        timeControl: {
            key: currentTimeControlKey,
            base: tc.base,
            increment: tc.increment,
            category: tc.category,
            label: tc.label,
        }
    };
}

function startClock() {
    if (clockState.timer) return;
    clockState.active = true;
    clockState.lastTurnTimestamp = Date.now();
    lastSyncTimestamp = Date.now();

    // High frequency server check (100ms) to guarantee cheating prevention & exact timeout detection
    clockState.timer = setInterval(() => {
        if (!clockState.active || isGameFinished()) {
            stopClock();
            return;
        }

        const currentTurn = chess.turn();
        const now = Date.now();
        const elapsed = now - clockState.lastTurnTimestamp;
        const remaining = clockState[currentTurn] - elapsed;

        if (remaining <= 0) {
            clockState[currentTurn] = 0;
            isGameOverState = true;
            stopClock();
            const winner = currentTurn === "w" ? "b" : "w";

            // FIDE Article 6.9: Draw if opponent cannot checkmate by any series of legal moves
            const hasInsufficient = chess.isInsufficientMaterial();
            if (hasInsufficient) {
                io.emit("gameOver", {
                    gameOver: true,
                    type: "timeout",
                    winner: null,
                    message: "Draw — timeout with insufficient material!"
                });
            } else {
                io.emit("gameOver", {
                    gameOver: true,
                    type: "timeout",
                    winner: winner,
                    message: currentTurn === "w" ? "Black wins on time!" : "White wins on time!"
                });
            }
            io.emit("clockSync", getClockSnapshot());
            return;
        }

        // Broadcast authoritative synchronization packet every 1 second
        if (now - lastSyncTimestamp >= 1000) {
            lastSyncTimestamp = now;
            io.emit("clockSync", getClockSnapshot());
        }
    }, 100);
}

function stopClock() {
    clockState.active = false;
    if (clockState.timer) {
        clearInterval(clockState.timer);
        clockState.timer = null;
    }
}

function resetClocks() {
    stopClock();
    const tc = TIME_CONTROLS[currentTimeControlKey] || TIME_CONTROLS["10+0"];
    clockState.w = tc.base * 1000;
    clockState.b = tc.base * 1000;
    clockState.active = false;
    clockState.lastTurnTimestamp = null;
    lastSyncTimestamp = 0;
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
        isGameOver: isGameFinished(),
        history: chess.history({ verbose: true }),
        clocks: getClockSnapshot(),
        timeControl: {
            key: currentTimeControlKey,
            ...TIME_CONTROLS[currentTimeControlKey]
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

    // ── Set Time Control ──────────────────────────────────────
    uniquesocket.on("setTimeControl", (key) => {
        if (!TIME_CONTROLS[key]) return;
        // Allow time control change if game hasn't started (no moves played and clocks idle)
        if (chess.history().length === 0 && !clockState.active) {
            currentTimeControlKey = key;
            resetClocks();
            const snapshot = getClockSnapshot();
            io.emit("timeControlChanged", snapshot);
            io.emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `Time control set to ${TIME_CONTROLS[key].label}`,
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

            // Deduct elapsed time from moving player
            const movingColor = chess.turn();
            if (clockState.active && clockState.lastTurnTimestamp) {
                const elapsed = Date.now() - clockState.lastTurnTimestamp;
                clockState[movingColor] = Math.max(0, clockState[movingColor] - elapsed);

                // Detect timeout before move can complete
                if (clockState[movingColor] <= 0) {
                    stopClock();
                    const winner = movingColor === "w" ? "b" : "w";
                    const hasInsufficient = chess.isInsufficientMaterial();
                    io.emit("gameOver", {
                        gameOver: true,
                        type: "timeout",
                        winner: hasInsufficient ? null : winner,
                        message: hasInsufficient
                            ? "Draw — timeout with insufficient material!"
                            : `${movingColor === "w" ? "Black" : "White"} wins on time!`
                    });
                    io.emit("clockSync", getClockSnapshot());
                    return;
                }
            }

            const result = chess.move(move);
            if (result) {
                const tc = TIME_CONTROLS[currentTimeControlKey] || TIME_CONTROLS["10+0"];

                // Add increment to the player who just made a move
                if (tc.increment > 0 && clockState.active) {
                    clockState[result.color] += tc.increment * 1000;
                }

                // Start clock if not already active
                if (!clockState.active && !chess.isGameOver()) {
                    startClock();
                } else {
                    // Update turn timestamp for the opponent
                    clockState.lastTurnTimestamp = Date.now();
                }

                // Reset any pending draw offer on move
                drawOffer = null;

                // Broadcast move with authoritative clock snapshot
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
                    clocks: getClockSnapshot(),
                    increment: tc.increment > 0 ? { color: result.color, amount: tc.increment } : null
                });

                io.emit("boardState", chess.fen());

                // Check for game-over
                const gameOverResult = checkGameOver();
                if (gameOverResult) {
                    isGameOverState = true;
                    stopClock();
                    io.emit("gameOver", gameOverResult);
                }
            } else {
                console.log("invalid move:", move);
                uniquesocket.emit("invalidMove", move);
            }
        } catch (err) {
            console.log(err);
        }
    });

    // ── Resign ────────────────────────────────────────────────
    uniquesocket.on("resign", () => {
        let resignColor = null;
        if (uniquesocket.id === players.white) resignColor = "w";
        else if (uniquesocket.id === players.black) resignColor = "b";
        else return; // Spectators can't resign

        if (isGameFinished()) return; // Game already over

        isGameOverState = true;
        stopClock();
        const winner = resignColor === "w" ? "b" : "w";
        const resignerName = resignColor === "w" ? playerProfiles.white.name : playerProfiles.black.name;
        
        io.emit("gameOver", {
            gameOver: true,
            type: "resignation",
            winner: winner,
            message:
                resignColor === "w"
                    ? `Black wins — ${resignerName} resigned!`
                    : `White wins — ${resignerName} resigned!`,
        });

        io.emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `${resignerName} (${resignColor === "w" ? "White" : "Black"}) resigned`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // ── Draw Offer ────────────────────────────────────────────
    uniquesocket.on("offerDraw", () => {
        let offerColor = null;
        if (uniquesocket.id === players.white) offerColor = "w";
        else if (uniquesocket.id === players.black) offerColor = "b";
        else return;

        if (isGameFinished() || chess.history().length === 0) return;

        if (drawOffer && drawOffer !== offerColor) {
            // Both offered draw -> draw agreed
            isGameOverState = true;
            stopClock();
            io.emit("gameOver", {
                gameOver: true,
                type: "draw",
                winner: null,
                message: "Draw agreed by both players!"
            });
            drawOffer = null;
        } else if (!drawOffer) {
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

        if (isGameFinished()) return;

        if (drawOffer && drawOffer !== acceptColor) {
            isGameOverState = true;
            stopClock();
            io.emit("gameOver", {
                gameOver: true,
                type: "draw",
                winner: null,
                message: "Draw agreed by both players!"
            });
            drawOffer = null;
            io.emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Draw accepted by mutual agreement",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    uniquesocket.on("declineDraw", () => {
        if (drawOffer) {
            const offerer = drawOffer === "w" ? players.white : players.black;
            if (offerer) {
                io.to(offerer).emit("drawDeclined");
            }
            drawOffer = null;
            io.emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Draw offer declined",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // ── Leave Game ────────────────────────────────────────────
    uniquesocket.on("leaveGame", () => {
        let leftColor = null;
        if (uniquesocket.id === players.white) leftColor = "w";
        else if (uniquesocket.id === players.black) leftColor = "b";
        else return;

        const leftRoleName = leftColor === "w" ? "White" : "Black";
        const opponentColor = leftColor === "w" ? "b" : "w";
        const opponentRoleName = opponentColor === "w" ? "White" : "Black";

        // If game was actively underway, handle forfeit
        if (!isGameFinished() && chess.history().length > 0) {
            isGameOverState = true;
            stopClock();
            io.emit("gameOver", {
                gameOver: true,
                type: "abandonment",
                winner: opponentColor,
                message: `${opponentRoleName} wins — ${leftRoleName} left the game!`
            });
        }

        // Vacate seat
        if (leftColor === "w") players.white = null;
        else players.black = null;

        drawOffer = null;
        rematchOffer = null;

        // Transition leaver to spectator
        uniquesocket.emit("spectatorRole");
        uniquesocket.emit("leftGameSuccess");

        // Broadcast updated seats
        io.emit("playersUpdate", {
            white: players.white ? playerProfiles.white : null,
            black: players.black ? playerProfiles.black : null,
        });

        io.emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `${leftRoleName} left their seat and is now spectating`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // ── Rematch ───────────────────────────────────────────────
    uniquesocket.on("offerRematch", () => {
        let callerColor = null;
        if (uniquesocket.id === players.white) callerColor = "w";
        else if (uniquesocket.id === players.black) callerColor = "b";
        else return;

        // Rematch only valid when current game is finished
        if (!isGameFinished()) return;

        const targetSocket = callerColor === "w" ? players.black : players.white;
        if (!targetSocket) {
            uniquesocket.emit("rematchDeclined", { reason: "Opponent has left the game." });
            return;
        }

        rematchOffer = callerColor;
        io.to(targetSocket).emit("rematchOffered", { by: callerColor });

        io.emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `${callerColor === "w" ? "White" : "Black"} offered a rematch`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    uniquesocket.on("acceptRematch", () => {
        let acceptColor = null;
        if (uniquesocket.id === players.white) acceptColor = "w";
        else if (uniquesocket.id === players.black) acceptColor = "b";
        else return;

        if (!isGameFinished() || !rematchOffer || rematchOffer === acceptColor) return;

        // Swap seats (standard rematch convention: colors switch)
        const oldWhite = players.white;
        const oldBlack = players.black;
        players.white = oldBlack;
        players.black = oldWhite;

        // Also swap profiles for player bar display
        const tempProf = playerProfiles.white;
        playerProfiles.white = playerProfiles.black;
        playerProfiles.black = tempProf;

        chess = new Chess();
        isGameOverState = false;
        resetClocks();
        drawOffer = null;
        rematchOffer = null;

        if (players.white) io.to(players.white).emit("playerRole", "w");
        if (players.black) io.to(players.black).emit("playerRole", "b");

        io.emit("playersUpdate", {
            white: players.white ? playerProfiles.white : null,
            black: players.black ? playerProfiles.black : null,
        });

        io.emit("newGame", getGameState());
        io.emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `Rematch started with swapped colors! ${TIME_CONTROLS[currentTimeControlKey].label} on the clock.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    uniquesocket.on("declineRematch", () => {
        if (rematchOffer) {
            const offerer = rematchOffer === "w" ? players.white : players.black;
            if (offerer) {
                io.to(offerer).emit("rematchDeclined");
            }
            rematchOffer = null;
            io.emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Rematch offer declined",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
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
            players.white &&
            players.black &&
            uniquesocket.id !== players.white &&
            uniquesocket.id !== players.black
        ) {
            return;
        }

        chess = new Chess();
        isGameOverState = false;
        resetClocks();
        drawOffer = null;
        rematchOffer = null;
        io.emit("newGame", getGameState());
        io.emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `New game started! ${TIME_CONTROLS[currentTimeControlKey].label} on the clock.`,
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