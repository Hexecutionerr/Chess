const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = socket(server);

// Connect to MongoDB
db.connectDB();

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

// ─── GameRoom Class (Multi-room & Private Games) ───────────────
class GameRoom {
    constructor(id, options = {}) {
        this.id = id;
        this.chess = new Chess();
        this.isGameOverState = false;
        this.players = { white: null, black: null }; // socket IDs
        this.playerSessions = {
            white: null, // { sessionToken, socketId, connected: true, disconnectedAt: null, disconnectTimeout: null }
            black: null
        };
        this.playerProfiles = {
            white: { name: options.whiteName || "Magnus_G", rating: 1540, avatarColor: "#3b82f6" },
            black: { name: options.blackName || "Hikaru_K", rating: 1515, avatarColor: "#10b981" }
        };
        this.currentTimeControlKey = options.timeControl || "10+0";
        const tc = TIME_CONTROLS[this.currentTimeControlKey] || TIME_CONTROLS["10+0"];
        this.clockState = {
            w: tc.base * 1000,
            b: tc.base * 1000,
            active: false,
            lastTurnTimestamp: null,
            timer: null
        };
        this.lastSyncTimestamp = 0;
        this.drawOffer = null; // 'w' or 'b'
        this.rematchOffer = null; // 'w' or 'b'
        this.chatMessages = [];
        this.spectators = new Set();
        this.isPrivate = !!options.isPrivate;
        this.createdAt = Date.now();
    }

    isGameFinished() {
        return this.isGameOverState || this.chess.isGameOver();
    }

    getClockSnapshot() {
        let w = this.clockState.w;
        let b = this.clockState.b;

        if (this.clockState.active && this.clockState.lastTurnTimestamp) {
            const currentTurn = this.chess.turn();
            const elapsed = Date.now() - this.clockState.lastTurnTimestamp;
            if (currentTurn === "w") w = Math.max(0, w - elapsed);
            else if (currentTurn === "b") b = Math.max(0, b - elapsed);
        }

        const tc = TIME_CONTROLS[this.currentTimeControlKey] || TIME_CONTROLS["10+0"];
        return {
            wMs: Math.max(0, w),
            bMs: Math.max(0, b),
            w: Math.max(0, Math.ceil(w / 1000)),
            b: Math.max(0, Math.ceil(b / 1000)),
            active: this.clockState.active,
            turn: this.chess.turn(),
            lastTurnTimestamp: this.clockState.lastTurnTimestamp,
            timeControl: {
                key: this.currentTimeControlKey,
                base: tc.base,
                increment: tc.increment,
                category: tc.category,
                label: tc.label,
            }
        };
    }

    startClock() {
        if (this.clockState.timer) return;
        this.clockState.active = true;
        this.clockState.lastTurnTimestamp = Date.now();
        this.lastSyncTimestamp = Date.now();

        this.clockState.timer = setInterval(() => {
            if (!this.clockState.active || this.isGameFinished()) {
                this.stopClock();
                return;
            }

            const currentTurn = this.chess.turn();
            const now = Date.now();
            const elapsed = now - this.clockState.lastTurnTimestamp;
            const remaining = this.clockState[currentTurn] - elapsed;

            if (remaining <= 0) {
                this.clockState[currentTurn] = 0;
                this.isGameOverState = true;
                this.stopClock();
                const winner = currentTurn === "w" ? "b" : "w";

                // FIDE Article 6.9: Draw if opponent cannot checkmate by any legal move series
                const hasInsufficient = this.chess.isInsufficientMaterial();
                const gameOverData = hasInsufficient ? {
                    gameOver: true,
                    type: "timeout",
                    winner: null,
                    message: "Draw — timeout with insufficient material!"
                } : {
                    gameOver: true,
                    type: "timeout",
                    winner: winner,
                    message: currentTurn === "w" ? "Black wins on time!" : "White wins on time!"
                };
                io.to(this.id).emit("gameOver", gameOverData);
                db.finalizeGame(this.id, gameOverData, this.chess.pgn());
                io.to(this.id).emit("clockSync", this.getClockSnapshot());
                return;
            }

            // Periodic authoritative sync (1 sec)
            if (now - this.lastSyncTimestamp >= 1000) {
                this.lastSyncTimestamp = now;
                io.to(this.id).emit("clockSync", this.getClockSnapshot());
            }
        }, 100);
    }

    stopClock() {
        this.clockState.active = false;
        if (this.clockState.timer) {
            clearInterval(this.clockState.timer);
            this.clockState.timer = null;
        }
    }

    resetClocks() {
        this.stopClock();
        const tc = TIME_CONTROLS[this.currentTimeControlKey] || TIME_CONTROLS["10+0"];
        this.clockState.w = tc.base * 1000;
        this.clockState.b = tc.base * 1000;
        this.clockState.active = false;
        this.clockState.lastTurnTimestamp = null;
        this.lastSyncTimestamp = 0;
    }

    getPlayersSnapshot() {
        return {
            white: this.playerSessions.white
                ? { ...this.playerProfiles.white, connected: this.playerSessions.white.connected }
                : null,
            black: this.playerSessions.black
                ? { ...this.playerProfiles.black, connected: this.playerSessions.black.connected }
                : null,
        };
    }

    checkGameOver() {
        if (!this.chess.isGameOver()) return null;

        let result = { gameOver: true };

        if (this.chess.isCheckmate()) {
            const winner = this.chess.turn() === "w" ? "b" : "w";
            result.type = "checkmate";
            result.winner = winner;
            result.message =
                winner === "w" ? "White wins by checkmate!" : "Black wins by checkmate!";
        } else if (this.chess.isStalemate()) {
            result.type = "stalemate";
            result.winner = null;
            result.message = "Draw by stalemate!";
        } else if (this.chess.isThreefoldRepetition()) {
            result.type = "repetition";
            result.winner = null;
            result.message = "Draw by threefold repetition!";
        } else if (this.chess.isInsufficientMaterial()) {
            result.type = "insufficient";
            result.winner = null;
            result.message = "Draw — insufficient material!";
        } else if (this.chess.isDraw()) {
            result.type = "draw";
            result.winner = null;
            result.message = "Draw by 50-move rule!";
        }

        return result;
    }

    getGameState() {
        return {
            roomId: this.id,
            isPrivate: this.isPrivate,
            fen: this.chess.fen(),
            turn: this.chess.turn(),
            isCheck: this.chess.isCheck(),
            isGameOver: this.isGameFinished(),
            history: this.chess.history({ verbose: true }),
            clocks: this.getClockSnapshot(),
            timeControl: {
                key: this.currentTimeControlKey,
                ...TIME_CONTROLS[this.currentTimeControlKey]
            },
            players: this.getPlayersSnapshot()
        };
    }
}

// ─── Room Registry ────────────────────────────────────────────
const rooms = new Map();
const defaultRoom = new GameRoom("default");
rooms.set("default", defaultRoom);

let matchmakingQueue = []; // { socketId, sessionToken, timeControl, enqueuedAt }

function getSocketRoom(uniquesocket) {
    const rId = uniquesocket.currentRoomId || "default";
    let r = rooms.get(rId);
    if (!r) {
        r = new GameRoom(rId);
        rooms.set(rId, r);
    }
    return r;
}

// ─── Express Routing ──────────────────────────────────────────
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.use(express.json());

// Serve chess.js from node_modules so client and server share identical version
app.use(
    "/vendor/chess.js",
    express.static(
        path.join(__dirname, "node_modules", "chess.js", "dist", "cjs"),
        { maxAge: "1d" }
    )
);

app.get(["/", "/game/:gameId"], (req, res) => {
    res.render("index", { title: "ChessArena — Professional Online Chess" });
});

// ─── Game Database REST Endpoints (Phase 13) ──────────────────
app.get("/api/games/:gameId", async (req, res) => {
    try {
        const game = await db.getGameById(req.params.gameId);
        if (!game) {
            return res.status(404).json({ error: "Game not found" });
        }
        res.json(game);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/games", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 20;
        const status = req.query.status;
        const timeControl = req.query.timeControl;
        const username = req.query.username;

        const games = await db.getRecentGames({ limit, status, timeControl, username });
        res.json(games);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Socket.IO Handler ────────────────────────────────────────
io.on("connection", function (uniquesocket) {
    console.log(`[connect] Socket ${uniquesocket.id}`);

    const sessionToken = uniquesocket.handshake.auth?.sessionToken || uniquesocket.handshake.query?.sessionToken;
    const requestedRoom = uniquesocket.handshake.query?.room || uniquesocket.handshake.query?.game;

    let targetRoomId = (requestedRoom && typeof requestedRoom === "string") ? requestedRoom.trim().toUpperCase() : "default";
    if (!rooms.has(targetRoomId)) {
        if (targetRoomId === "default") {
            rooms.set("default", defaultRoom);
        } else {
            // If requested room doesn't exist yet, place them in default room
            targetRoomId = "default";
        }
    }

    uniquesocket.join(targetRoomId);
    uniquesocket.currentRoomId = targetRoomId;
    const room = getSocketRoom(uniquesocket);

    let assignedRole = null;
    let isReconnection = false;

    function handlePlayerIdentification(token, targetRoom) {
        if (!token || !targetRoom) return false;

        // Check if token matches White player session in this room
        if (targetRoom.playerSessions.white && targetRoom.playerSessions.white.sessionToken === token) {
            assignedRole = "w";
            isReconnection = true;
            if (targetRoom.playerSessions.white.disconnectTimeout) {
                clearTimeout(targetRoom.playerSessions.white.disconnectTimeout);
                targetRoom.playerSessions.white.disconnectTimeout = null;
            }
            targetRoom.playerSessions.white.socketId = uniquesocket.id;
            targetRoom.playerSessions.white.connected = true;
            targetRoom.playerSessions.white.disconnectedAt = null;
            targetRoom.players.white = uniquesocket.id;

            uniquesocket.emit("playerRole", "w");
            uniquesocket.emit("reconnected", { role: "w", roleName: "White", roomId: targetRoom.id });
            uniquesocket.emit("gameState", targetRoom.getGameState());
            uniquesocket.emit("chatHistory", targetRoom.chatMessages.slice(-30));

            io.to(targetRoom.id).emit("playersUpdate", targetRoom.getPlayersSnapshot());
            io.to(targetRoom.id).emit("playerReconnected", { role: "w", roleName: "White" });
            io.to(targetRoom.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "White reconnected to the match.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            db.syncActiveGame(targetRoom);
            console.log(`[reconnect] White reconnected in room ${targetRoom.id} (${uniquesocket.id})`);
            return true;
        }

        // Check if token matches Black player session in this room
        if (targetRoom.playerSessions.black && targetRoom.playerSessions.black.sessionToken === token) {
            assignedRole = "b";
            isReconnection = true;
            if (targetRoom.playerSessions.black.disconnectTimeout) {
                clearTimeout(targetRoom.playerSessions.black.disconnectTimeout);
                targetRoom.playerSessions.black.disconnectTimeout = null;
            }
            targetRoom.playerSessions.black.socketId = uniquesocket.id;
            targetRoom.playerSessions.black.connected = true;
            targetRoom.playerSessions.black.disconnectedAt = null;
            targetRoom.players.black = uniquesocket.id;

            uniquesocket.emit("playerRole", "b");
            uniquesocket.emit("reconnected", { role: "b", roleName: "Black", roomId: targetRoom.id });
            uniquesocket.emit("gameState", targetRoom.getGameState());
            uniquesocket.emit("chatHistory", targetRoom.chatMessages.slice(-30));

            io.to(targetRoom.id).emit("playersUpdate", targetRoom.getPlayersSnapshot());
            io.to(targetRoom.id).emit("playerReconnected", { role: "b", roleName: "Black" });
            io.to(targetRoom.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Black reconnected to the match.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            db.syncActiveGame(targetRoom);
            console.log(`[reconnect] Black reconnected in room ${targetRoom.id} (${uniquesocket.id})`);
            return true;
        }

        return false;
    }

    // Try reconnecting via token
    if (sessionToken && handlePlayerIdentification(sessionToken, room)) {
        // Player reconnected via handshake session token
    } else {
        // Assign available seats in default room, or spectator if full
        if (!room.playerSessions.white) {
            assignedRole = "w";
            room.playerSessions.white = {
                sessionToken: sessionToken || ("sess_" + uniquesocket.id),
                socketId: uniquesocket.id,
                connected: true,
                disconnectedAt: null,
                disconnectTimeout: null
            };
            room.players.white = uniquesocket.id;
            uniquesocket.emit("playerRole", "w");
        } else if (!room.playerSessions.black) {
            assignedRole = "b";
            room.playerSessions.black = {
                sessionToken: sessionToken || ("sess_" + uniquesocket.id),
                socketId: uniquesocket.id,
                connected: true,
                disconnectedAt: null,
                disconnectTimeout: null
            };
            room.players.black = uniquesocket.id;
            uniquesocket.emit("playerRole", "b");
        } else {
            room.spectators.add(uniquesocket.id);
            uniquesocket.emit("spectatorRole");
        }

        io.to(room.id).emit("playersUpdate", room.getPlayersSnapshot());
        uniquesocket.emit("gameState", room.getGameState());
        uniquesocket.emit("chatHistory", room.chatMessages.slice(-30));
        db.syncActiveGame(room);

        const roleText = assignedRole === "w" ? "White (Magnus_G)" : assignedRole === "b" ? "Black (Hikaru_K)" : "Spectator";
        io.to(room.id).emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `User joined as ${roleText}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }

    // Re-identification listener
    uniquesocket.on("identify", (data) => {
        if (data && data.sessionToken) {
            const currentR = getSocketRoom(uniquesocket);
            handlePlayerIdentification(data.sessionToken, currentR);
        }
    });

    // ── Phase 10: Create Private Game ─────────────────────────
    uniquesocket.on("createPrivateGame", (data) => {
        const tcKey = (data && data.timeControl && TIME_CONTROLS[data.timeControl]) ? data.timeControl : "10+0";
        const token = (data && data.sessionToken) || ("sess_" + uniquesocket.id);
        let preferredColor = (data && data.preferredColor) || "w";
        if (preferredColor === "random") {
            preferredColor = Math.random() < 0.5 ? "w" : "b";
        }

        // Generate unique room ID e.g. ARENA-7821
        let newRoomId;
        do {
            newRoomId = "ARENA-" + Math.floor(1000 + Math.random() * 9000);
        } while (rooms.has(newRoomId));

        const newRoom = new GameRoom(newRoomId, {
            isPrivate: true,
            timeControl: tcKey
        });
        rooms.set(newRoomId, newRoom);

        // Transition socket to new room
        if (uniquesocket.currentRoomId) {
            uniquesocket.leave(uniquesocket.currentRoomId);
        }
        uniquesocket.join(newRoomId);
        uniquesocket.currentRoomId = newRoomId;

        // Assign creator seat correctly
        const creatorRole = preferredColor === "b" ? "b" : "w";
        const creatorRoleKey = creatorRole === "w" ? "white" : "black";

        newRoom.players[creatorRoleKey] = uniquesocket.id;
        newRoom.playerSessions[creatorRoleKey] = {
            sessionToken: token,
            socketId: uniquesocket.id,
            connected: true,
            disconnectedAt: null,
            disconnectTimeout: null
        };

        uniquesocket.emit("playerRole", creatorRole);
        uniquesocket.emit("privateGameCreated", {
            roomId: newRoomId,
            inviteUrl: `/?game=${newRoomId}`,
            role: creatorRole,
            timeControl: TIME_CONTROLS[tcKey]
        });

        uniquesocket.emit("gameState", newRoom.getGameState());
        uniquesocket.emit("playersUpdate", newRoom.getPlayersSnapshot());
        uniquesocket.emit("chatHistory", newRoom.chatMessages);
        db.syncActiveGame(newRoom);

        console.log(`[privateGame] Created ${newRoomId} by ${uniquesocket.id} as ${creatorRole} (${tcKey})`);
    });

    // ── Phase 10: Join Private Game ───────────────────────────
    uniquesocket.on("joinPrivateGame", (data) => {
        let inputCode = (data && data.roomId) ? data.roomId.trim().toUpperCase() : null;
        const token = (data && data.sessionToken) || ("sess_" + uniquesocket.id);

        if (!inputCode) {
            uniquesocket.emit("privateGameError", { message: "Please provide a valid Game ID." });
            return;
        }

        // Handle full URL inputs: extract query param or path ID
        if (inputCode.includes("GAME=")) {
            const match = inputCode.match(/GAME=([A-Z0-9_-]+)/i);
            if (match) inputCode = match[1].toUpperCase();
        } else if (inputCode.includes("ROOM=")) {
            const match = inputCode.match(/ROOM=([A-Z0-9_-]+)/i);
            if (match) inputCode = match[1].toUpperCase();
        } else if (inputCode.includes("/GAME/")) {
            const match = inputCode.match(/\/GAME\/([A-Z0-9_-]+)/i);
            if (match) inputCode = match[1].toUpperCase();
        }

        const targetRoom = rooms.get(inputCode);
        if (!targetRoom) {
            uniquesocket.emit("privateGameError", { message: `Game "${inputCode}" was not found. Please verify the code.` });
            return;
        }

        // Leave previous room and join target room
        if (uniquesocket.currentRoomId && uniquesocket.currentRoomId !== targetRoom.id) {
            uniquesocket.leave(uniquesocket.currentRoomId);
        }
        uniquesocket.join(targetRoom.id);
        uniquesocket.currentRoomId = targetRoom.id;

        let roleAssigned = null;
        let isReconnected = false;

        // 1. Check if token matches existing White or Black player
        if (targetRoom.playerSessions.white && targetRoom.playerSessions.white.sessionToken === token) {
            roleAssigned = "w";
            isReconnected = true;
            targetRoom.playerSessions.white.socketId = uniquesocket.id;
            targetRoom.playerSessions.white.connected = true;
            targetRoom.players.white = uniquesocket.id;
            if (targetRoom.playerSessions.white.disconnectTimeout) {
                clearTimeout(targetRoom.playerSessions.white.disconnectTimeout);
                targetRoom.playerSessions.white.disconnectTimeout = null;
            }
        } else if (targetRoom.playerSessions.black && targetRoom.playerSessions.black.sessionToken === token) {
            roleAssigned = "b";
            isReconnected = true;
            targetRoom.playerSessions.black.socketId = uniquesocket.id;
            targetRoom.playerSessions.black.connected = true;
            targetRoom.players.black = uniquesocket.id;
            if (targetRoom.playerSessions.black.disconnectTimeout) {
                clearTimeout(targetRoom.playerSessions.black.disconnectTimeout);
                targetRoom.playerSessions.black.disconnectTimeout = null;
            }
        } else {
            // 2. Not reconnecting: Assign remaining player seat correctly
            if (!targetRoom.playerSessions.white) {
                roleAssigned = "w";
                targetRoom.players.white = uniquesocket.id;
                targetRoom.playerSessions.white = {
                    sessionToken: token,
                    socketId: uniquesocket.id,
                    connected: true,
                    disconnectedAt: null,
                    disconnectTimeout: null
                };
            } else if (!targetRoom.playerSessions.black) {
                roleAssigned = "b";
                targetRoom.players.black = uniquesocket.id;
                targetRoom.playerSessions.black = {
                    sessionToken: token,
                    socketId: uniquesocket.id,
                    connected: true,
                    disconnectedAt: null,
                    disconnectTimeout: null
                };
            } else {
                // 3. Prevent unauthorized spectators/players from interfering
                // Both seats occupied -> assign Spectator!
                roleAssigned = null;
                targetRoom.spectators.add(uniquesocket.id);
            }
        }

        if (roleAssigned) {
            uniquesocket.emit("playerRole", roleAssigned);
        } else {
            uniquesocket.emit("spectatorRole");
        }

        uniquesocket.emit("privateGameJoined", {
            roomId: targetRoom.id,
            role: roleAssigned,
            isSpectator: roleAssigned === null,
            timeControl: TIME_CONTROLS[targetRoom.currentTimeControlKey]
        });

        uniquesocket.emit("gameState", targetRoom.getGameState());
        uniquesocket.emit("chatHistory", targetRoom.chatMessages.slice(-30));
        io.to(targetRoom.id).emit("playersUpdate", targetRoom.getPlayersSnapshot());
        db.syncActiveGame(targetRoom);

        // When both White and Black are seated, broadcast game ready to start
        if (targetRoom.playerSessions.white && targetRoom.playerSessions.black && !isReconnected) {
            io.to(targetRoom.id).emit("privateGameReady", {
                roomId: targetRoom.id,
                message: "Friend connected! White and Black are seated.",
                timeControl: TIME_CONTROLS[targetRoom.currentTimeControlKey]
            });
            io.to(targetRoom.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `Friend joined! White: ${targetRoom.playerProfiles.white.name} vs. Black: ${targetRoom.playerProfiles.black.name}`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }

        console.log(`[privateGame] Socket ${uniquesocket.id} joined ${targetRoom.id} as ${roleAssigned || "Spectator"}`);
    });

    // ── Disconnect ────────────────────────────────────────────
    uniquesocket.on("disconnect", function () {
        console.log(`[disconnect] ${uniquesocket.id}`);
        const room = getSocketRoom(uniquesocket);

        let leftRole = null;
        let session = null;
        let roleKey = null;

        if (room.playerSessions.white && room.playerSessions.white.socketId === uniquesocket.id) {
            leftRole = "White";
            session = room.playerSessions.white;
            roleKey = "white";
        } else if (room.playerSessions.black && room.playerSessions.black.socketId === uniquesocket.id) {
            leftRole = "Black";
            session = room.playerSessions.black;
            roleKey = "black";
        } else {
            room.spectators.delete(uniquesocket.id);
        }

        if (leftRole && session) {
            session.connected = false;
            session.disconnectedAt = Date.now();
            const roleChar = leftRole === "White" ? "w" : "b";
            const opponentChar = leftRole === "White" ? "b" : "w";
            const opponentRoleName = leftRole === "White" ? "Black" : "White";

            io.to(room.id).emit("playersUpdate", room.getPlayersSnapshot());
            io.to(room.id).emit("playerDisconnected", { role: roleChar, roleName: leftRole });
            io.to(room.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `${leftRole} disconnected. Waiting for reconnection...`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            const movesCount = room.chess.history().length;
            const graceMs = (!room.isGameFinished() && movesCount === 0) ? 20000 : 60000;

            if (session.disconnectTimeout) {
                clearTimeout(session.disconnectTimeout);
            }

            session.disconnectTimeout = setTimeout(() => {
                if (!session.connected) {
                    console.log(`[grace timeout] ${leftRole} failed to reconnect in ${room.id}`);
                    if (!room.isGameFinished()) {
                        room.isGameOverState = true;
                        room.stopClock();
                        const isAborted = movesCount === 0;
                        const discGameOverData = isAborted ? {
                            gameOver: true,
                            type: "aborted",
                            winner: null,
                            message: `Game aborted — ${leftRole} disconnected before the first move.`
                        } : {
                            gameOver: true,
                            type: "abandonment",
                            winner: opponentChar,
                            message: `${opponentRoleName} wins — ${leftRole} abandoned the game!`
                        };
                        io.to(room.id).emit("gameOver", discGameOverData);
                        db.finalizeGame(room.id, discGameOverData, room.chess.pgn());
                    }
                    room.playerSessions[roleKey] = null;
                    room.players[roleKey] = null;
                    io.to(room.id).emit("playersUpdate", room.getPlayersSnapshot());
                    db.syncActiveGame(room);
                }
            }, graceMs);
        }

        // Clean up from matchmaking queue
        matchmakingQueue = matchmakingQueue.filter(q => q.socketId !== uniquesocket.id);
    });

    // ── Matchmaking System (Phase 9) ──────────────────────────
    uniquesocket.on("findMatch", (data) => {
        const tcKey = (data && data.timeControl && TIME_CONTROLS[data.timeControl]) ? data.timeControl : "10+0";
        const token = (data && data.sessionToken) || ("sess_" + uniquesocket.id);

        matchmakingQueue = matchmakingQueue.filter(q => q.socketId !== uniquesocket.id && q.sessionToken !== token);
        const oppIdx = matchmakingQueue.findIndex(q => q.sessionToken !== token && q.socketId !== uniquesocket.id && q.timeControl === tcKey);

        if (oppIdx !== -1) {
            const matchedOpponent = matchmakingQueue.splice(oppIdx, 1)[0];
            const oppSocket = io.sockets.sockets.get(matchedOpponent.socketId);

            // Create dedicated match room for paired players
            const matchRoomId = "MATCH-" + Date.now().toString(36).toUpperCase();
            const matchRoom = new GameRoom(matchRoomId, {
                timeControl: tcKey
            });
            rooms.set(matchRoomId, matchRoom);

            if (oppSocket) {
                if (oppSocket.currentRoomId) oppSocket.leave(oppSocket.currentRoomId);
                oppSocket.join(matchRoomId);
                oppSocket.currentRoomId = matchRoomId;
            }

            if (uniquesocket.currentRoomId) uniquesocket.leave(uniquesocket.currentRoomId);
            uniquesocket.join(matchRoomId);
            uniquesocket.currentRoomId = matchRoomId;

            // Assign White to opponent, Black to current player
            matchRoom.playerSessions.white = {
                sessionToken: matchedOpponent.sessionToken,
                socketId: matchedOpponent.socketId,
                connected: true,
                disconnectedAt: null,
                disconnectTimeout: null
            };
            matchRoom.playerSessions.black = {
                sessionToken: token,
                socketId: uniquesocket.id,
                connected: true,
                disconnectedAt: null,
                disconnectTimeout: null
            };

            matchRoom.players.white = matchedOpponent.socketId;
            matchRoom.players.black = uniquesocket.id;

            if (oppSocket) {
                oppSocket.emit("playerRole", "w");
                oppSocket.emit("matchFound", {
                    role: "w",
                    opponent: matchRoom.playerProfiles.black,
                    timeControl: TIME_CONTROLS[tcKey],
                    roomId: matchRoomId
                });
            }

            uniquesocket.emit("playerRole", "b");
            uniquesocket.emit("matchFound", {
                role: "b",
                opponent: matchRoom.playerProfiles.white,
                timeControl: TIME_CONTROLS[tcKey],
                roomId: matchRoomId
            });

            io.to(matchRoomId).emit("playersUpdate", matchRoom.getPlayersSnapshot());
            io.to(matchRoomId).emit("newGame", matchRoom.getGameState());
            db.syncActiveGame(matchRoom);
            io.to(matchRoomId).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `Match found! White: ${matchRoom.playerProfiles.white.name} vs. Black: ${matchRoom.playerProfiles.black.name} (${TIME_CONTROLS[tcKey].label})`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            console.log(`[matchmaking] Paired ${matchedOpponent.socketId} (w) with ${uniquesocket.id} (b) in ${matchRoomId}`);
        } else {
            matchmakingQueue.push({
                socketId: uniquesocket.id,
                sessionToken: token,
                timeControl: tcKey,
                enqueuedAt: Date.now()
            });

            uniquesocket.emit("matchmakingStarted", {
                timeControl: tcKey,
                label: TIME_CONTROLS[tcKey].label
            });
            console.log(`[matchmaking] Socket ${uniquesocket.id} queued for ${tcKey}. Queue size: ${matchmakingQueue.length}`);
        }
    });

    uniquesocket.on("cancelMatchmaking", () => {
        matchmakingQueue = matchmakingQueue.filter(q => q.socketId !== uniquesocket.id);
        uniquesocket.emit("matchmakingCancelled");
    });

    // ── Set Time Control ──────────────────────────────────────
    uniquesocket.on("setTimeControl", (key) => {
        const room = getSocketRoom(uniquesocket);
        if (!TIME_CONTROLS[key] || !room) return;

        // Security check: Prevent spectators from changing time control
        const isPlayer = uniquesocket.id === room.players.white || uniquesocket.id === room.players.black;
        if (!isPlayer) return;

        if (room.chess.history().length === 0 && !room.clockState.active) {
            room.currentTimeControlKey = key;
            room.resetClocks();
            const snapshot = room.getClockSnapshot();
            io.to(room.id).emit("timeControlChanged", snapshot);
            io.to(room.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `Time control set to ${TIME_CONTROLS[key].label}`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // ── Move (With Security & Spectator Isolation) ────────────
    uniquesocket.on("move", (move) => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        // Security check: Prevent unauthorized spectators or non-players from interfering
        const isPlayer = uniquesocket.id === room.players.white || uniquesocket.id === room.players.black;
        if (!isPlayer) {
            uniquesocket.emit("unauthorizedAction", { message: "Spectators are not permitted to make moves." });
            return;
        }

        // Validate correct player's turn
        if (room.chess.turn() === "w" && uniquesocket.id !== room.players.white) return;
        if (room.chess.turn() === "b" && uniquesocket.id !== room.players.black) return;

        // Deduct elapsed time from moving player
        const movingColor = room.chess.turn();
        if (room.clockState.active && room.clockState.lastTurnTimestamp) {
            const elapsed = Date.now() - room.clockState.lastTurnTimestamp;
            room.clockState[movingColor] = Math.max(0, room.clockState[movingColor] - elapsed);

            if (room.clockState[movingColor] <= 0) {
                room.stopClock();
                const winner = movingColor === "w" ? "b" : "w";
                const hasInsufficient = room.chess.isInsufficientMaterial();
                const moveTimeoutData = {
                    gameOver: true,
                    type: "timeout",
                    winner: hasInsufficient ? null : winner,
                    message: hasInsufficient
                        ? "Draw — timeout with insufficient material!"
                        : `${movingColor === "w" ? "Black" : "White"} wins on time!`
                };
                io.to(room.id).emit("gameOver", moveTimeoutData);
                db.finalizeGame(room.id, moveTimeoutData, room.chess.pgn());
                io.to(room.id).emit("clockSync", room.getClockSnapshot());
                return;
            }
        }

        try {
            const result = room.chess.move(move);
            if (result) {
                db.recordMove(room.id, result, room.chess.pgn());
                const tc = TIME_CONTROLS[room.currentTimeControlKey] || TIME_CONTROLS["10+0"];

                if (tc.increment > 0 && room.clockState.active) {
                    room.clockState[result.color] += tc.increment * 1000;
                }

                if (!room.clockState.active && !room.chess.isGameOver()) {
                    room.startClock();
                } else {
                    room.clockState.lastTurnTimestamp = Date.now();
                }

                room.drawOffer = null;

                io.to(room.id).emit("move", {
                    from: result.from,
                    to: result.to,
                    promotion: result.promotion,
                    san: result.san,
                    captured: result.captured || null,
                    color: result.color,
                    isCheck: room.chess.isCheck(),
                    fen: room.chess.fen(),
                    history: room.chess.history({ verbose: true }),
                    clocks: room.getClockSnapshot(),
                    increment: tc.increment > 0 ? { color: result.color, amount: tc.increment } : null
                });

                io.to(room.id).emit("boardState", room.chess.fen());

                const gameOverResult = room.checkGameOver();
                if (gameOverResult) {
                    room.isGameOverState = true;
                    room.stopClock();
                    io.to(room.id).emit("gameOver", gameOverResult);
                    db.finalizeGame(room.id, gameOverResult, room.chess.pgn());
                }
            } else {
                uniquesocket.emit("invalidMove", move);
            }
        } catch (err) {
            console.log(err);
        }
    });

    // ── Resign (Security Protected) ───────────────────────────
    uniquesocket.on("resign", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        let resignColor = null;
        if (uniquesocket.id === room.players.white) resignColor = "w";
        else if (uniquesocket.id === room.players.black) resignColor = "b";
        else return; // Unauthorized spectator cannot resign

        if (room.isGameFinished()) return;

        room.isGameOverState = true;
        room.stopClock();
        const winner = resignColor === "w" ? "b" : "w";
        const resignerName = resignColor === "w" ? room.playerProfiles.white.name : room.playerProfiles.black.name;

        const resignGameOverData = {
            gameOver: true,
            type: "resignation",
            winner: winner,
            message:
                resignColor === "w"
                    ? `Black wins — ${resignerName} resigned!`
                    : `White wins — ${resignerName} resigned!`,
        };
        io.to(room.id).emit("gameOver", resignGameOverData);
        db.finalizeGame(room.id, resignGameOverData, room.chess.pgn());

        io.to(room.id).emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `${resignerName} (${resignColor === "w" ? "White" : "Black"}) resigned`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // ── Draw Offer (Security Protected) ───────────────────────
    uniquesocket.on("offerDraw", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        let offerColor = null;
        if (uniquesocket.id === room.players.white) offerColor = "w";
        else if (uniquesocket.id === room.players.black) offerColor = "b";
        else return; // Unauthorized spectator

        if (room.isGameFinished() || room.chess.history().length === 0) return;

        if (room.drawOffer && room.drawOffer !== offerColor) {
            room.isGameOverState = true;
            room.stopClock();
            const drawGameOverData = {
                gameOver: true,
                type: "draw",
                winner: null,
                message: "Draw agreed by both players!"
            };
            io.to(room.id).emit("gameOver", drawGameOverData);
            db.finalizeGame(room.id, drawGameOverData, room.chess.pgn());
            room.drawOffer = null;
        } else if (!room.drawOffer) {
            room.drawOffer = offerColor;
            const targetSocket = offerColor === "w" ? room.players.black : room.players.white;
            if (targetSocket) {
                io.to(targetSocket).emit("drawOffered", { by: offerColor });
            }
            io.to(room.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: `${offerColor === "w" ? "White" : "Black"} offered a draw`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    uniquesocket.on("acceptDraw", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        let acceptColor = null;
        if (uniquesocket.id === room.players.white) acceptColor = "w";
        else if (uniquesocket.id === room.players.black) acceptColor = "b";
        else return;

        if (room.isGameFinished()) return;

        if (room.drawOffer && room.drawOffer !== acceptColor) {
            room.isGameOverState = true;
            room.stopClock();
            const drawGameOverData = {
                gameOver: true,
                type: "draw",
                winner: null,
                message: "Draw agreed by both players!"
            };
            io.to(room.id).emit("gameOver", drawGameOverData);
            db.finalizeGame(room.id, drawGameOverData, room.chess.pgn());
            room.drawOffer = null;
            io.to(room.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Draw accepted by mutual agreement",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    uniquesocket.on("declineDraw", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        if (room.drawOffer) {
            const offerer = room.drawOffer === "w" ? room.players.white : room.players.black;
            if (offerer) {
                io.to(offerer).emit("drawDeclined");
            }
            room.drawOffer = null;
            io.to(room.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Draw offer declined",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // ── Leave Game (Security Protected) ───────────────────────
    uniquesocket.on("leaveGame", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        let leftColor = null;
        if (uniquesocket.id === room.players.white) leftColor = "w";
        else if (uniquesocket.id === room.players.black) leftColor = "b";
        else return;

        const leftRoleName = leftColor === "w" ? "White" : "Black";
        const opponentColor = leftColor === "w" ? "b" : "w";
        const opponentRoleName = opponentColor === "w" ? "White" : "Black";

        if (!room.isGameFinished()) {
            room.isGameOverState = true;
            room.stopClock();
            const isAborted = room.chess.history().length === 0;
            const leaveGameOverData = isAborted ? {
                gameOver: true,
                type: "aborted",
                winner: null,
                message: `Game aborted — ${leftRoleName} left before the match began.`
            } : {
                gameOver: true,
                type: "abandonment",
                winner: opponentColor,
                message: `${opponentRoleName} wins — ${leftRoleName} left the game!`
            };
            io.to(room.id).emit("gameOver", leaveGameOverData);
            db.finalizeGame(room.id, leaveGameOverData, room.chess.pgn());
        }

        const roleKey = leftColor === "w" ? "white" : "black";
        if (room.playerSessions[roleKey] && room.playerSessions[roleKey].disconnectTimeout) {
            clearTimeout(room.playerSessions[roleKey].disconnectTimeout);
        }
        room.playerSessions[roleKey] = null;
        room.players[roleKey] = null;
        room.spectators.add(uniquesocket.id);

        room.drawOffer = null;
        room.rematchOffer = null;

        uniquesocket.emit("spectatorRole");
        uniquesocket.emit("leftGameSuccess");

        io.to(room.id).emit("playersUpdate", room.getPlayersSnapshot());
        db.syncActiveGame(room);
        io.to(room.id).emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `${leftRoleName} left their seat and is now spectating`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // ── Rematch (Security Protected) ──────────────────────────
    uniquesocket.on("offerRematch", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        let callerColor = null;
        if (uniquesocket.id === room.players.white) callerColor = "w";
        else if (uniquesocket.id === room.players.black) callerColor = "b";
        else return;

        if (!room.isGameFinished()) return;

        const targetSocket = callerColor === "w" ? room.players.black : room.players.white;
        if (!targetSocket) {
            uniquesocket.emit("rematchDeclined", { reason: "Opponent has left the game." });
            return;
        }

        room.rematchOffer = callerColor;
        io.to(targetSocket).emit("rematchOffered", { by: callerColor });

        io.to(room.id).emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `${callerColor === "w" ? "White" : "Black"} offered a rematch`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    uniquesocket.on("acceptRematch", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        let acceptColor = null;
        if (uniquesocket.id === room.players.white) acceptColor = "w";
        else if (uniquesocket.id === room.players.black) acceptColor = "b";
        else return;

        if (!room.isGameFinished() || !room.rematchOffer || room.rematchOffer === acceptColor) return;

        // Swap seats (standard rematch convention: colors switch)
        const oldWhiteSession = room.playerSessions.white;
        const oldBlackSession = room.playerSessions.black;
        room.playerSessions.white = oldBlackSession;
        room.playerSessions.black = oldWhiteSession;

        room.players.white = room.playerSessions.white ? room.playerSessions.white.socketId : null;
        room.players.black = room.playerSessions.black ? room.playerSessions.black.socketId : null;

        const tempProf = room.playerProfiles.white;
        room.playerProfiles.white = room.playerProfiles.black;
        room.playerProfiles.black = tempProf;

        room.chess = new Chess();
        room.isGameOverState = false;
        room.resetClocks();
        room.drawOffer = null;
        room.rematchOffer = null;

        if (room.players.white) io.to(room.players.white).emit("playerRole", "w");
        if (room.players.black) io.to(room.players.black).emit("playerRole", "b");

        io.to(room.id).emit("playersUpdate", room.getPlayersSnapshot());
        io.to(room.id).emit("newGame", room.getGameState());
        db.syncActiveGame(room);
        io.to(room.id).emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `Rematch started with swapped colors! ${TIME_CONTROLS[room.currentTimeControlKey].label} on the clock.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    uniquesocket.on("declineRematch", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        if (room.rematchOffer) {
            const offerer = room.rematchOffer === "w" ? room.players.white : room.players.black;
            if (offerer) {
                io.to(offerer).emit("rematchDeclined");
            }
            room.rematchOffer = null;
            io.to(room.id).emit("chatMessage", {
                sender: "System",
                role: "sys",
                text: "Rematch offer declined",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // ── Chat Message ──────────────────────────────────────────
    uniquesocket.on("chatMessage", (text) => {
        const room = getSocketRoom(uniquesocket);
        if (!room || !text || typeof text !== "string" || !text.trim()) return;

        let senderName = "Spectator";
        let senderRole = "spectator";

        if (uniquesocket.id === room.players.white) {
            senderName = room.playerProfiles.white.name;
            senderRole = "white";
        } else if (uniquesocket.id === room.players.black) {
            senderName = room.playerProfiles.black.name;
            senderRole = "black";
        }

        const messageObj = {
            sender: senderName,
            role: senderRole,
            text: text.trim().slice(0, 200),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        room.chatMessages.push(messageObj);
        if (room.chatMessages.length > 100) room.chatMessages.shift();

        io.to(room.id).emit("chatMessage", messageObj);
    });

    // ── New Game (Security Protected) ─────────────────────────
    uniquesocket.on("newGame", () => {
        const room = getSocketRoom(uniquesocket);
        if (!room) return;

        // Only seated players can trigger new game if players are seated
        const isWhite = uniquesocket.id === room.players.white;
        const isBlack = uniquesocket.id === room.players.black;
        if (room.players.white && room.players.black && !isWhite && !isBlack) {
            return;
        }

        room.chess = new Chess();
        room.isGameOverState = false;
        room.resetClocks();
        room.drawOffer = null;
        room.rematchOffer = null;

        io.to(room.id).emit("newGame", room.getGameState());
        db.syncActiveGame(room);
        io.to(room.id).emit("chatMessage", {
            sender: "System",
            role: "sys",
            text: `New game started! ${TIME_CONTROLS[room.currentTimeControlKey].label} on the clock.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
    console.log(`Chess server listening on port ${PORT}`);
});