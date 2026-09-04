// ─── Session Identity & Persistent Reconnection (Phase 8) ──────
function getOrCreateSessionToken() {
    let token = localStorage.getItem("chess_session_token");
    if (!token) {
        token = "sess_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
        localStorage.setItem("chess_session_token", token);
    }
    return token;
}

const sessionToken = getOrCreateSessionToken();
const socket = io({
    auth: {
        sessionToken: sessionToken
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 15000
});
const chess = new Chess();
const boardElement = document.getElementById("chessboard");

// ─── State ────────────────────────────────────────────────────
let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;          // "w", "b", or null (spectator)
let selectedSquare = null;      // { row, col } for click-to-move
let currentLegalMoves = [];     // Array of Chess.js verbose move objects for selectedSquare
let lastMove = null;            // { from, to } algebraic notation
let isGameOver = false;
let isFlipped = false;
let moveHistory = [];
let moveFens = [];              // Cached FEN strings: [startFen, afterMove0, afterMove1, ...]
let viewingMoveIndex = null;    // null = LIVE; -1 = start position; 0..n-1 = historical move

// ─── Clocks State (Server-Authoritative) ───────────────────────
let clocks = {
    wMs: 600000,
    bMs: 600000,
    active: false,
    turn: "w",
    lastSyncTime: Date.now(),
    timeControl: { key: "10+0", base: 600, increment: 0, label: "10+0 • Rapid" }
};
let localClockTimer = null;

// ─── Piece Values for Material Evaluation ─────────────────────
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_PIECES = { p: 8, n: 2, b: 2, r: 2, q: 1 };

// ─── DOM References ───────────────────────────────────────────
const opponentBar       = document.getElementById("opponentBar");
const playerBar         = document.getElementById("playerBar");
const opponentName      = document.getElementById("opponentName");
const playerName        = document.getElementById("playerName");
const opponentRating    = document.getElementById("opponentRating");
const playerRating      = document.getElementById("playerRating");
const opponentLabel     = document.getElementById("opponentLabel");
const playerLabel       = document.getElementById("playerLabel");
const opponentAvatarText= document.getElementById("opponentAvatarText");
const playerAvatarText  = document.getElementById("playerAvatarText");
const opponentOnlineDot = document.getElementById("opponentOnlineDot");
const playerOnlineDot   = document.getElementById("playerOnlineDot");
const opponentClock     = document.getElementById("opponentClock");
const playerClock       = document.getElementById("playerClock");
const opponentIncrement = document.getElementById("opponentIncrement");
const playerIncrement   = document.getElementById("playerIncrement");
const timeControlSelect = document.getElementById("timeControlSelect");

const opponentCapturedPieces = document.getElementById("opponentCapturedPieces");
const playerCapturedPieces   = document.getElementById("playerCapturedPieces");
const opponentMaterialLead   = document.getElementById("opponentMaterialLead");
const playerMaterialLead     = document.getElementById("playerMaterialLead");

const whiteCapturesList = document.getElementById("whiteCapturesList");
const blackCapturesList = document.getElementById("blackCapturesList");

const rankLabelsEl      = document.getElementById("rankLabels");
const fileLabelsEl      = document.getElementById("fileLabels");
const gameTurnPill      = document.getElementById("gameTurnPill");
const turnStatusText    = document.getElementById("turnStatusText");

const movesBody         = document.getElementById("movesBody");
const movesTableWrap    = document.getElementById("movesTableWrap");
const noMovesMsg        = document.getElementById("noMovesMsg");
const moveCountBadge    = document.getElementById("moveCountBadge");

// Navigation & Review Toolbar References
const btnNavFirst       = document.getElementById("btnNavFirst");
const btnNavPrev        = document.getElementById("btnNavPrev");
const btnNavNext        = document.getElementById("btnNavNext");
const btnNavLast        = document.getElementById("btnNavLast");
const btnNavLive        = document.getElementById("btnNavLive");
const reviewBanner      = document.getElementById("reviewBanner");
const reviewStatusText  = document.getElementById("reviewStatusText");
const btnExitReview     = document.getElementById("btnExitReview");

const btnOfferDraw      = document.getElementById("btnOfferDraw");
const btnResign         = document.getElementById("btnResign");
const btnRematch        = document.getElementById("btnRematch");
const btnQuickNewGame   = document.getElementById("btnQuickNewGame");
const btnLeaveGame      = document.getElementById("btnLeaveGame");
const btnFlip           = document.getElementById("btnFlip");

const chatLog           = document.getElementById("chatLog");
const chatForm          = document.getElementById("chatForm");
const chatInput         = document.getElementById("chatInput");

const gameOverModal     = document.getElementById("gameOverModal");
const modalIcon         = document.getElementById("modalIcon");
const modalOutcome      = document.getElementById("modalOutcome");
const modalTitle        = document.getElementById("modalTitle");
const modalMessage      = document.getElementById("modalMessage");
const btnModalRematch   = document.getElementById("btnModalRematch");
const btnModalNewGame   = document.getElementById("btnModalNewGame");
const btnModalReview    = document.getElementById("btnModalReview");
const btnModalLeave     = document.getElementById("btnModalLeave");

const drawOfferModal    = document.getElementById("drawOfferModal");
const btnAcceptDraw     = document.getElementById("btnAcceptDraw");
const btnDeclineDraw    = document.getElementById("btnDeclineDraw");

const resignConfirmModal= document.getElementById("resignConfirmModal");
const btnConfirmResign  = document.getElementById("btnConfirmResign");
const btnCancelResign   = document.getElementById("btnCancelResign");

const rematchOfferModal = document.getElementById("rematchOfferModal");
const btnAcceptRematch  = document.getElementById("btnAcceptRematch");
const btnDeclineRematch = document.getElementById("btnDeclineRematch");

const leaveGameConfirmModal = document.getElementById("leaveGameConfirmModal");
const btnConfirmLeave   = document.getElementById("btnConfirmLeave");
const btnCancelLeave    = document.getElementById("btnCancelLeave");
const leaveGameMessage  = document.getElementById("leaveGameMessage");

const newGameConfirmModal   = document.getElementById("newGameConfirmModal");
const btnConfirmNewGame = document.getElementById("btnConfirmNewGame");
const btnCancelNewGame  = document.getElementById("btnCancelNewGame");

const toastEl           = document.getElementById("toast");

// ─── Phase 9: Lobby & Matchmaking DOM Elements ─────────────────
const lobbyView           = document.getElementById("lobbyView");
const gameView            = document.getElementById("gameView");
const navLobby            = document.getElementById("navLobby");
const navPlay             = document.getElementById("navPlay");
const navPuzzles          = document.getElementById("navPuzzles");
const navHistory          = document.getElementById("navHistory");
const btnNavActiveGame    = document.getElementById("btnNavActiveGame");
const btnReturnToLobby    = document.getElementById("btnReturnToLobby");
const btnFindOpponent     = document.getElementById("btnFindOpponent");
const selectedTcBadge     = document.getElementById("selectedTcBadge");
const tcChoiceButtons     = document.querySelectorAll(".tc-choice-btn");

const matchmakingModal    = document.getElementById("matchmakingModal");
const matchmakingTcTag    = document.getElementById("matchmakingTcTag");
const matchmakingTimer    = document.getElementById("matchmakingTimer");
const btnCancelSearch     = document.getElementById("btnCancelSearch");

const playFriendModal     = document.getElementById("playFriendModal");
const btnCloseFriendModal = document.getElementById("btnCloseFriendModal");
const btnCopyInviteLink   = document.getElementById("btnCopyInviteLink");
const friendInviteLink    = document.getElementById("friendInviteLink");
const friendRoomCode      = document.getElementById("friendRoomCode");

const joinGameModal       = document.getElementById("joinGameModal");
const btnCloseJoinModal   = document.getElementById("btnCloseJoinModal");
const btnConfirmJoinGame  = document.getElementById("btnConfirmJoinGame");
const joinRoomInput       = document.getElementById("joinRoomInput");

const vsComputerModal     = document.getElementById("vsComputerModal");
const btnCloseBotModal    = document.getElementById("btnCloseBotModal");
const btnStartBotGame     = document.getElementById("btnStartBotGame");

const puzzlesModal        = document.getElementById("puzzlesModal");
const btnClosePuzzleModal = document.getElementById("btnClosePuzzleModal");
const btnSolvePuzzle      = document.getElementById("btnSolvePuzzle");

const historyModal        = document.getElementById("historyModal");
const btnCloseHistoryModal= document.getElementById("btnCloseHistoryModal");

const profileModal        = document.getElementById("profileModal");
const btnCloseProfileModal= document.getElementById("btnCloseProfileModal");
const userMenu            = document.getElementById("userMenu");

let selectedLobbyTc = "10+0";
let matchmakingTimerInterval = null;
let matchmakingStartSeconds = 0;

// Control & Game State tracking (Phase 7 & 8)
let drawOfferedByMe = false;
let rematchOfferedByMe = false;
let currentGameState = "WAITING"; // WAITING, STARTING, ACTIVE, CHECK, CHECKMATE, DRAW, STALEMATE, TIMEOUT, RESIGNED, ABORTED, DISCONNECTED, FINISHED
let activePlayers = { white: null, black: null };

// ─── Sound System ─────────────────────────────────────────────
const sounds = {
    move: new Audio("/sounds/Move.mp3"),
    capture: new Audio("/sounds/Capture.mp3"),
    notify: new Audio("/sounds/GenericNotify.mp3"),
};
Object.values(sounds).forEach(s => { s.load(); s.volume = 0.6; });

function playSound(type) {
    const s = sounds[type];
    if (s) {
        s.currentTime = 0;
        s.play().catch(() => {});
    }
}

// ─── Turn Verification Helper ─────────────────────────────────
function isPlayerTurn() {
    return !isGameOver && Boolean(playerRole) && chess.turn() === playerRole;
}

// ─── Subtle Invalid Feedback ──────────────────────────────────
function triggerSubtleFeedback(row, col) {
    if (row === undefined || col === undefined) return;
    const el = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (el) {
        el.classList.remove("invalid-feedback");
        void el.offsetWidth; // Force CSS reflow to re-trigger animation
        el.classList.add("invalid-feedback");
        setTimeout(() => el.classList.remove("invalid-feedback"), 250);
    }
}

// ─── Piece Image Helper ───────────────────────────────────────
function getPieceImage(piece) {
    if (!piece) return null;
    const colorPrefix = piece.color === "w" ? "w" : "b";
    const typeMap = { p: "P", r: "R", n: "N", b: "B", q: "Q", k: "K" };
    return `/img/pieces/${colorPrefix}${typeMap[piece.type]}.svg`;
}

// ─── Professional Clock Formatting & Interpolation ───────────
function formatClockTime(ms) {
    const totalSeconds = Math.max(0, ms) / 1000;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);

    // If under 20 seconds, show decimal tenths (e.g. 0:09.4, 0:03.1)
    if (totalSeconds < 20 && totalSeconds > 0) {
        const tenths = Math.floor((ms % 1000) / 100);
        return `${mins}:${secs < 10 ? "0" : ""}${secs}.${tenths}`;
    }

    // Standard format (e.g. 10:00, 09:58)
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function updateClockDisplays() {
    let currentWMs = clocks.wMs;
    let currentBMs = clocks.bMs;

    // Local high-precision interpolation for whichever player's clock is actively ticking
    if (clocks.active && !isGameOver) {
        const elapsed = Date.now() - clocks.lastSyncTime;
        const currentTurn = clocks.turn || chess.turn();
        if (currentTurn === "w") {
            currentWMs = Math.max(0, clocks.wMs - elapsed);
        } else if (currentTurn === "b") {
            currentBMs = Math.max(0, clocks.bMs - elapsed);
        }
    }

    const isUserWhite = (playerRole === "w" || playerRole === null);
    const userMs = isUserWhite ? currentWMs : currentBMs;
    const oppMs  = isUserWhite ? currentBMs : currentWMs;

    if (playerClock) playerClock.textContent = formatClockTime(userMs);
    if (opponentClock) opponentClock.textContent = formatClockTime(oppMs);

    // Multi-stage low-time visual warnings:
    // Warning: <= 30 seconds (amber)
    // Critical: <= 10 seconds (intense red pulse)
    const userTotalSec = userMs / 1000;
    const oppTotalSec  = oppMs / 1000;

    if (playerClock) {
        playerClock.classList.toggle("low-time-warning", userTotalSec <= 30 && userTotalSec > 10);
        playerClock.classList.toggle("low-time-critical", userTotalSec <= 10);
    }

    if (opponentClock) {
        opponentClock.classList.toggle("low-time-warning", oppTotalSec <= 30 && oppTotalSec > 10);
        opponentClock.classList.toggle("low-time-critical", oppTotalSec <= 10);
    }
}

function startLocalClockTicker() {
    if (localClockTimer) return;
    localClockTimer = setInterval(() => {
        if (clocks.active && !isGameOver) {
            updateClockDisplays();
        }
    }, 50);
}

function syncServerClocks(clockData) {
    if (!clockData) return;
    clocks.wMs = clockData.wMs !== undefined ? clockData.wMs : (clockData.w * 1000);
    clocks.bMs = clockData.bMs !== undefined ? clockData.bMs : (clockData.b * 1000);
    clocks.active = Boolean(clockData.active);
    clocks.turn = clockData.turn || chess.turn();
    clocks.lastSyncTime = Date.now();

    if (clockData.timeControl) {
        clocks.timeControl = clockData.timeControl;
        if (timeControlSelect && timeControlSelect.value !== clockData.timeControl.key) {
            timeControlSelect.value = clockData.timeControl.key;
        }
    }

    updateClockDisplays();
}

function showIncrementBadge(color, amount) {
    if (!amount) return;
    const isUser = (playerRole === color || (playerRole === null && color === "w"));
    const badge = isUser ? playerIncrement : opponentIncrement;
    if (badge) {
        badge.textContent = `+${amount}s`;
        badge.classList.remove("pop");
        void badge.offsetWidth;
        badge.classList.add("pop");
        setTimeout(() => badge.classList.remove("pop"), 1200);
    }
}

// Time control selector
if (timeControlSelect) {
    timeControlSelect.addEventListener("change", () => {
        const val = timeControlSelect.value;
        socket.emit("setTimeControl", val);
    });
}

// ─── Coordinate Labels ───────────────────────────────────────
function renderLabels() {
    rankLabelsEl.innerHTML = "";
    fileLabelsEl.innerHTML = "";

    const activeFlipped = isFlipped || playerRole === "b";
    const ranks = activeFlipped
        ? ["1","2","3","4","5","6","7","8"]
        : ["8","7","6","5","4","3","2","1"];
    const files = activeFlipped
        ? ["h","g","f","e","d","c","b","a"]
        : ["a","b","c","d","e","f","g","h"];

    ranks.forEach(r => {
        const span = document.createElement("span");
        span.textContent = r;
        rankLabelsEl.appendChild(span);
    });

    files.forEach(f => {
        const span = document.createElement("span");
        span.textContent = f;
        fileLabelsEl.appendChild(span);
    });
}

// ─── Material & Captured Pieces Calculation ──────────────────
function updateCapturedPieces(boardSource = chess) {
    const currentPieces = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };

    const board = (boardSource && typeof boardSource.board === "function") ? boardSource.board() : chess.board();
    board.forEach(row => {
        row.forEach(sq => {
            if (sq && sq.type !== "k") {
                currentPieces[sq.color][sq.type]++;
            }
        });
    });

    // Captured by White (Black pieces missing)
    const capturedByWhite = [];
    // Captured by Black (White pieces missing)
    const capturedByBlack = [];

    let whiteMaterial = 0;
    let blackMaterial = 0;

    ["p", "n", "b", "r", "q"].forEach(type => {
        const missingWhite = Math.max(0, START_PIECES[type] - currentPieces.w[type]);
        const missingBlack = Math.max(0, START_PIECES[type] - currentPieces.b[type]);

        for (let i = 0; i < missingWhite; i++) {
            capturedByBlack.push({ color: "w", type });
        }
        for (let i = 0; i < missingBlack; i++) {
            capturedByWhite.push({ color: "b", type });
        }

        whiteMaterial += currentPieces.w[type] * PIECE_VALUES[type];
        blackMaterial += currentPieces.b[type] * PIECE_VALUES[type];
    });

    const diff = whiteMaterial - blackMaterial;

    function renderPieces(container, pieces) {
        container.innerHTML = "";
        pieces.forEach(p => {
            const img = document.createElement("div");
            img.className = "captured-mini-piece";
            img.style.backgroundImage = `url('${getPieceImage(p)}')`;
            container.appendChild(img);
        });
    }

    renderPieces(whiteCapturesList, capturedByWhite);
    renderPieces(blackCapturesList, capturedByBlack);

    const isUserWhite = (playerRole === "w" || playerRole === null);
    const userCaptures = isUserWhite ? capturedByWhite : capturedByBlack;
    const oppCaptures  = isUserWhite ? capturedByBlack : capturedByWhite;

    renderPieces(playerCapturedPieces, userCaptures);
    renderPieces(opponentCapturedPieces, oppCaptures);

    // Material differential badge
    if (diff > 0) {
        if (isUserWhite) {
            playerMaterialLead.textContent = `+${diff}`;
            opponentMaterialLead.textContent = "";
        } else {
            opponentMaterialLead.textContent = `+${diff}`;
            playerMaterialLead.textContent = "";
        }
    } else if (diff < 0) {
        if (isUserWhite) {
            opponentMaterialLead.textContent = `+${Math.abs(diff)}`;
            playerMaterialLead.textContent = "";
        } else {
            playerMaterialLead.textContent = `+${Math.abs(diff)}`;
            opponentMaterialLead.textContent = "";
        }
    } else {
        playerMaterialLead.textContent = "";
        opponentMaterialLead.textContent = "";
    }
}

// ─── Rebuild Historical FEN Snapshots ─────────────────────────
function rebuildMoveFens(history) {
    const replayChess = new Chess();
    moveFens = [replayChess.fen()];
    (history || []).forEach(m => {
        try {
            replayChess.move({ from: m.from, to: m.to, promotion: m.promotion });
            moveFens.push(replayChess.fen());
        } catch (e) {
            try {
                replayChess.move(m.san || m);
                moveFens.push(replayChess.fen());
            } catch (err) {}
        }
    });
}

// ─── Historical Position Navigation (Phase 4) ─────────────────
function navigateToMove(index) {
    if (moveHistory.length === 0) return;

    // -1 = Start position; moveHistory.length - 1 = live position
    const clampedIndex = Math.max(-1, Math.min(index, moveHistory.length - 1));

    if (clampedIndex === moveHistory.length - 1) {
        returnToLive();
        return;
    }

    viewingMoveIndex = clampedIndex;
    renderBoard();
    updateMoveHistoryUI();
}

function returnToLive() {
    viewingMoveIndex = null;
    selectedSquare = null;
    currentLegalMoves = [];
    renderBoard();
    updateMoveHistoryUI();
}

// ─── Move Notation Table & History Panel UI ───────────────────
function updateMoveHistory(history) {
    moveHistory = history || chess.history({ verbose: true });
    rebuildMoveFens(moveHistory);
    updateMoveHistoryUI();
}

function updateMoveHistoryUI() {
    movesBody.innerHTML = "";

    if (moveHistory.length === 0) {
        noMovesMsg.style.display = "flex";
        moveCountBadge.textContent = "0 moves";
        if (btnNavFirst) btnNavFirst.disabled = true;
        if (btnNavPrev) btnNavPrev.disabled = true;
        if (btnNavNext) btnNavNext.disabled = true;
        if (btnNavLast) btnNavLast.disabled = true;
        if (btnNavLive) btnNavLive.classList.remove("active");
        if (reviewBanner) reviewBanner.classList.remove("visible");
        return;
    }

    noMovesMsg.style.display = "none";
    moveCountBadge.textContent = `${moveHistory.length} moves`;

    const isLive = (viewingMoveIndex === null || viewingMoveIndex === moveHistory.length - 1);
    const activeIndex = isLive ? (moveHistory.length - 1) : viewingMoveIndex;

    // Navigation buttons state
    if (btnNavFirst) btnNavFirst.disabled = (activeIndex === -1);
    if (btnNavPrev) btnNavPrev.disabled = (activeIndex <= -1);
    if (btnNavNext) btnNavNext.disabled = isLive;
    if (btnNavLast) btnNavLast.disabled = isLive;
    if (btnNavLive) btnNavLive.classList.toggle("active", isLive);

    // Review banner visibility and description
    if (reviewBanner) {
        if (!isLive) {
            reviewBanner.classList.add("visible");
            if (activeIndex === -1) {
                reviewStatusText.textContent = "Viewing Starting Position";
            } else {
                const moveNum = Math.floor(activeIndex / 2) + 1;
                const m = moveHistory[activeIndex];
                const prefix = m.color === "w" ? `${moveNum}.` : `${moveNum}...`;
                reviewStatusText.textContent = `Viewing ${prefix} ${m.san}`;
            }
        } else {
            reviewBanner.classList.remove("visible");
        }
    }

    // Build SAN notation table: 1. e4 e5
    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = moveHistory[i];
        const blackMove = moveHistory[i + 1];

        const row = document.createElement("tr");

        const tdNum = document.createElement("td");
        tdNum.className = "move-num";
        tdNum.textContent = `${moveNum}.`;

        // White Move Cell
        const tdWhite = document.createElement("td");
        tdWhite.className = "move-san";
        tdWhite.textContent = whiteMove ? whiteMove.san : "";
        tdWhite.title = `Move ${moveNum}: White played ${whiteMove ? whiteMove.san : ""}`;

        if (i === activeIndex) {
            tdWhite.classList.add(isLive ? "active-san" : "viewing-san");
        }

        tdWhite.addEventListener("click", () => {
            navigateToMove(i);
        });

        // Black Move Cell
        const tdBlack = document.createElement("td");
        tdBlack.className = "move-san";
        tdBlack.textContent = blackMove ? blackMove.san : "";
        if (blackMove) {
            tdBlack.title = `Move ${moveNum}: Black played ${blackMove.san}`;
            if (i + 1 === activeIndex) {
                tdBlack.classList.add(isLive ? "active-san" : "viewing-san");
            }
            tdBlack.addEventListener("click", () => {
                navigateToMove(i + 1);
            });
        }

        row.appendChild(tdNum);
        row.appendChild(tdWhite);
        row.appendChild(tdBlack);
        movesBody.appendChild(row);
    }

    // Auto-scroll to active or viewed move
    const targetCell = movesBody.querySelector(".active-san, .viewing-san");
    if (targetCell) {
        targetCell.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
}

// ─── History Navigation Button Listeners ──────────────────────
if (btnNavFirst) btnNavFirst.addEventListener("click", () => navigateToMove(-1));
if (btnNavPrev) btnNavPrev.addEventListener("click", () => {
    const currentIdx = (viewingMoveIndex === null) ? (moveHistory.length - 1) : viewingMoveIndex;
    navigateToMove(currentIdx - 1);
});
if (btnNavNext) btnNavNext.addEventListener("click", () => {
    const currentIdx = (viewingMoveIndex === null) ? (moveHistory.length - 1) : viewingMoveIndex;
    navigateToMove(currentIdx + 1);
});
if (btnNavLast) btnNavLast.addEventListener("click", () => returnToLive());
if (btnNavLive) btnNavLive.addEventListener("click", () => returnToLive());
if (btnExitReview) btnExitReview.addEventListener("click", () => returnToLive());

// Keyboard Arrow Navigation (Left = Prev, Right = Next, Up = Start, Down = Live)
window.addEventListener("keydown", (e) => {
    if (document.activeElement === chatInput) return;
    if (e.key === "ArrowLeft") {
        e.preventDefault();
        const currentIdx = (viewingMoveIndex === null) ? (moveHistory.length - 1) : viewingMoveIndex;
        navigateToMove(currentIdx - 1);
    } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const currentIdx = (viewingMoveIndex === null) ? (moveHistory.length - 1) : viewingMoveIndex;
        navigateToMove(currentIdx + 1);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateToMove(-1);
    } else if (e.key === "ArrowDown") {
        e.preventDefault();
        returnToLive();
    }
});

// ─── Game State Machine (Phase 7) ─────────────────────────────
function setGameState(state, details = {}) {
    currentGameState = state;
    if (!gameTurnPill || !turnStatusText) return;

    // Reset previous state classes
    const stateClasses = [
        "pill-waiting", "pill-starting", "pill-active", "pill-check",
        "pill-checkmate", "pill-draw", "pill-stalemate", "pill-timeout",
        "pill-resigned", "pill-aborted", "pill-disconnected", "pill-finished"
    ];
    stateClasses.forEach(cls => gameTurnPill.classList.remove(cls));

    const turn = chess.turn();
    const isWhiteTurn = turn === "w";
    const isMyTurn = (playerRole === "w" && isWhiteTurn) || (playerRole === "b" && !isWhiteTurn);

    switch (state) {
        case "WAITING":
            gameTurnPill.classList.add("pill-waiting");
            turnStatusText.textContent = "⏳ Waiting for Opponent";
            break;

        case "STARTING":
            gameTurnPill.classList.add("pill-starting");
            turnStatusText.textContent = "⚔️ Ready • White to Move";
            break;

        case "ACTIVE":
            gameTurnPill.classList.add("pill-active");
            turnStatusText.textContent = isMyTurn ? "Your Turn" : (isWhiteTurn ? "White's Turn" : "Black's Turn");
            break;

        case "CHECK":
            gameTurnPill.classList.add("pill-check");
            turnStatusText.textContent = isMyTurn ? "⚠️ You are in Check!" : (isWhiteTurn ? "⚠️ White in Check!" : "⚠️ Black in Check!");
            break;

        case "CHECKMATE":
            gameTurnPill.classList.add("pill-checkmate");
            turnStatusText.textContent = `👑 Checkmate • ${details.winner === "w" ? "White" : "Black"} Won`;
            break;

        case "DRAW":
            gameTurnPill.classList.add("pill-draw");
            turnStatusText.textContent = "🤝 Draw Agreed";
            break;

        case "STALEMATE":
            gameTurnPill.classList.add("pill-stalemate");
            turnStatusText.textContent = "🔒 Stalemate • Draw";
            break;

        case "TIMEOUT":
            gameTurnPill.classList.add("pill-timeout");
            turnStatusText.textContent = `⏱️ Time Out • ${details.winner === "w" ? "White" : "Black"} Won`;
            break;

        case "RESIGNED":
            gameTurnPill.classList.add("pill-resigned");
            turnStatusText.textContent = `⚑ ${details.resigner || (details.winner === "w" ? "Black" : "White")} Resigned`;
            break;

        case "ABORTED":
            gameTurnPill.classList.add("pill-aborted");
            turnStatusText.textContent = "🚫 Game Aborted";
            break;

        case "DISCONNECTED":
            gameTurnPill.classList.add("pill-disconnected");
            turnStatusText.textContent = details.message || "⚡ Opponent Disconnected";
            break;

        case "FINISHED":
        default:
            gameTurnPill.classList.add("pill-finished");
            turnStatusText.textContent = "🏁 Match Concluded";
            break;
    }
}

// ─── Turn Indicators & Status Pill ───────────────────────────
function updateTurnIndicators() {
    const turn = chess.turn();
    const isUserTurn = (playerRole === "w" && turn === "w") || (playerRole === "b" && turn === "b");
    const isOpponentTurn = (playerRole === "w" && turn === "b") || (playerRole === "b" && turn === "w");

    playerBar.classList.toggle("active-turn", isUserTurn);
    opponentBar.classList.toggle("active-turn", isOpponentTurn || (playerRole === null && turn === "b"));

    // If game is over, retain the current game-over state representation
    if (isGameOver) {
        return;
    }

    // Determine current active state
    if (!activePlayers.white || !activePlayers.black) {
        setGameState("WAITING");
    } else if (moveHistory.length === 0 && !clocks.active) {
        setGameState("STARTING");
    } else if (chess.isCheck()) {
        setGameState("CHECK");
    } else {
        setGameState("ACTIVE");
    }
}

// ─── Algebraic Notation Helpers ──────────────────────────────
function toAlgebraic(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
}

// ─── Piece Selection (Phase 2 & 3 Experience) ─────────────────
const selectPiece = (row, col) => {
    if (isGameOver) return;

    // Must be player's turn to select a piece
    if (!isPlayerTurn()) {
        triggerSubtleFeedback(row, col);
        showToast("Wait for your turn!");
        return;
    }

    const from = toAlgebraic(row, col);
    const piece = chess.get(from);
    if (!piece || piece.color !== playerRole) {
        triggerSubtleFeedback(row, col);
        return;
    }

    // Click selected piece again → deselect
    if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        selectedSquare = null;
        currentLegalMoves = [];
        renderBoard();
        return;
    }

    // Switch selection to new own piece
    selectedSquare = { row, col };
    currentLegalMoves = chess.moves({ square: from, verbose: true });
    renderBoard();
};

// ─── Valid Move Highlighting ─────────────────────────────────
const highlightValidMoves = (square) => {
    const selectedEl = boardElement.querySelector(
        `[data-row="${square.row}"][data-col="${square.col}"]`
    );
    if (selectedEl) {
        selectedEl.classList.add("selected");
    }

    currentLegalMoves.forEach(move => {
        const toCol = move.to.charCodeAt(0) - 97;
        const toRow = 8 - parseInt(move.to[1]);
        const targetEl = boardElement.querySelector(
            `[data-row="${toRow}"][data-col="${toCol}"]`
        );

        if (targetEl) {
            const isCapture = Boolean(
                move.captured ||
                (move.flags && (move.flags.includes("c") || move.flags.includes("e")))
            );

            if (isCapture) {
                targetEl.classList.add("has-valid-capture");
                const ring = document.createElement("div");
                ring.className = "valid-capture-ring";
                targetEl.appendChild(ring);
            } else {
                targetEl.classList.add("has-valid-move");
                const dot = document.createElement("div");
                dot.className = "valid-move-dot";
                targetEl.appendChild(dot);
            }
        }
    });
};

// ─── Attempt Move (Client Validation & Immediate Clock Switch) ─
const attemptMove = (source, target) => {
    if (!isPlayerTurn()) {
        triggerSubtleFeedback(target.row, target.col);
        return;
    }

    const from = toAlgebraic(source.row, source.col);
    const to = toAlgebraic(target.row, target.col);

    const legalMove = currentLegalMoves.find(m => m.from === from && m.to === to);

    if (legalMove) {
        handleMove(source, target, legalMove);
    } else {
        triggerSubtleFeedback(target.row, target.col);
        selectedSquare = null;
        currentLegalMoves = [];
        renderBoard();
    }
};

// ─── Handle Move (Emit to Server with Immediate Clock Switch) ──
const handleMove = (source, target, legalMove) => {
    const from = toAlgebraic(source.row, source.col);
    const to = toAlgebraic(target.row, target.col);

    const piece = chess.get(from);
    const isPromotion = Boolean(
        (legalMove && legalMove.promotion) ||
        (piece && piece.type === "p" &&
            ((piece.color === "w" && target.row === 0) ||
             (piece.color === "b" && target.row === 7)))
    );

    const move = { from, to };
    if (isPromotion) {
        move.promotion = "q";
    }

    // Immediately switch clock turn optimistically so there is ZERO perceived lag!
    const currentTurn = chess.turn();
    clocks.turn = (currentTurn === "w" ? "b" : "w");
    clocks.lastSyncTime = Date.now();

    socket.emit("move", move);

    selectedSquare = null;
    currentLegalMoves = [];
    updateClockDisplays();
};

// ─── Board Rendering (Supports Historical Position Review) ────
const renderBoard = () => {
    const isLive = (viewingMoveIndex === null || viewingMoveIndex === moveHistory.length - 1);

    // Determine board position to display
    let displayBoard;
    let displayTurn;
    let displayCheck;
    let displayLastMove = lastMove;
    let activeChess = chess;

    if (isLive) {
        displayBoard = chess.board();
        displayTurn = chess.turn();
        displayCheck = chess.isCheck();
        activeChess = chess;
    } else {
        const tempChess = new Chess();
        const targetFen = moveFens[viewingMoveIndex + 1] || tempChess.fen();
        tempChess.load(targetFen);
        displayBoard = tempChess.board();
        displayTurn = tempChess.turn();
        displayCheck = tempChess.isCheck();
        activeChess = tempChess;

        if (viewingMoveIndex >= 0 && moveHistory[viewingMoveIndex]) {
            displayLastMove = {
                from: moveHistory[viewingMoveIndex].from,
                to: moveHistory[viewingMoveIndex].to
            };
        } else {
            displayLastMove = null;
        }
    }

    boardElement.innerHTML = "";

    displayBoard.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            const isLight = (rowindex + squareindex) % 2 === 0;
            squareElement.classList.add("square", isLight ? "light" : "dark");
            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            // Last-move highlighting
            if (displayLastMove) {
                const algebraic = toAlgebraic(rowindex, squareindex);
                if (algebraic === displayLastMove.from || algebraic === displayLastMove.to) {
                    squareElement.classList.add("last-move");
                }
            }

            // Check highlighting on king
            if (displayCheck && square && square.type === "k" && square.color === displayTurn) {
                squareElement.classList.add("in-check");
            }

            // Piece rendering
            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece");
                pieceElement.style.backgroundImage = `url('${getPieceImage(square)}')`;

                // Pieces are only draggable in LIVE mode when it's player's turn
                const canDrag = isLive && !isGameOver && playerRole === square.color && chess.turn() === playerRole;
                pieceElement.draggable = canDrag;
                if (canDrag) pieceElement.classList.add("draggable");

                // Click on piece
                pieceElement.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!isLive) {
                        // Clicking a piece in review mode returns to live position
                        returnToLive();
                        showToast("Returned to live position");
                        return;
                    }

                    if (isGameOver) return;

                    if (playerRole === square.color) {
                        selectPiece(rowindex, squareindex);
                    } else if (selectedSquare) {
                        attemptMove(selectedSquare, { row: rowindex, col: squareindex });
                    } else {
                        triggerSubtleFeedback(rowindex, squareindex);
                    }
                });

                // Drag start
                pieceElement.addEventListener("dragstart", (e) => {
                    if (canDrag) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareindex };
                        selectPiece(rowindex, squareindex);
                        e.dataTransfer.effectAllowed = "move";
                        setTimeout(() => pieceElement.classList.add("dragging"), 0);
                    }
                });

                // Drag end
                pieceElement.addEventListener("dragend", () => {
                    if (draggedPiece) draggedPiece.classList.remove("dragging");
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareElement.appendChild(pieceElement);
            }

            // Click on square
            squareElement.addEventListener("click", () => {
                if (!isLive) {
                    returnToLive();
                    return;
                }

                if (isGameOver) return;

                if (selectedSquare) {
                    attemptMove(selectedSquare, { row: rowindex, col: squareindex });
                }
            });

            // Drag over
            squareElement.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
            });

            // Drop
            squareElement.addEventListener("drop", (e) => {
                e.preventDefault();
                if (isLive && draggedPiece && sourceSquare) {
                    const targetSquare = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col),
                    };
                    attemptMove(sourceSquare, targetSquare);
                }
            });

            boardElement.appendChild(squareElement);
        });
    });

    if (isLive && selectedSquare) {
        highlightValidMoves(selectedSquare);
    }

    const activeFlipped = isFlipped || playerRole === "b";
    if (activeFlipped) {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }

    updateTurnIndicators();
    updateCapturedPieces(activeChess);
};

// ─── Player Info & Roles UI ──────────────────────────────────
function updatePlayerInfo(playersData) {
    renderLabels();

    if (playersData) {
        activePlayers = {
            white: playersData.white || null,
            black: playersData.black || null
        };
    }

    const myWhite = playersData && playersData.white ? playersData.white : { name: "Magnus_G", rating: 1540 };
    const myBlack = playersData && playersData.black ? playersData.black : { name: "Hikaru_K", rating: 1515 };

    if (playerRole === "w") {
        playerName.textContent = `${myWhite.name} (You)`;
        playerRating.textContent = myWhite.rating;
        playerLabel.textContent = "White";
        playerAvatarText.textContent = myWhite.name.slice(0, 2).toUpperCase();

        opponentName.textContent = myBlack.name;
        opponentRating.textContent = myBlack.rating;
        opponentLabel.textContent = "Black";
        opponentAvatarText.textContent = myBlack.name.slice(0, 2).toUpperCase();

        btnResign.disabled = false;
        btnOfferDraw.disabled = false;
    } else if (playerRole === "b") {
        playerName.textContent = `${myBlack.name} (You)`;
        playerRating.textContent = myBlack.rating;
        playerLabel.textContent = "Black";
        playerAvatarText.textContent = myBlack.name.slice(0, 2).toUpperCase();

        opponentName.textContent = myWhite.name;
        opponentRating.textContent = myWhite.rating;
        opponentLabel.textContent = "White";
        opponentAvatarText.textContent = myWhite.name.slice(0, 2).toUpperCase();

        btnResign.disabled = false;
        btnOfferDraw.disabled = false;
    } else {
        playerName.textContent = myWhite.name;
        playerRating.textContent = myWhite.rating;
        playerLabel.textContent = "White";
        playerAvatarText.textContent = "W";

        opponentName.textContent = myBlack.name;
        opponentRating.textContent = myBlack.rating;
        opponentLabel.textContent = "Black";
        opponentAvatarText.textContent = "B";

        btnResign.disabled = true;
        btnOfferDraw.disabled = true;
    }

    // Update connection status indicators on player strips (Phase 8)
    const isWhiteConnected = myWhite.connected !== false;
    const isBlackConnected = myBlack.connected !== false;

    if (playerRole === "w") {
        if (playerOnlineDot) {
            playerOnlineDot.classList.toggle("offline", !isWhiteConnected);
            playerOnlineDot.title = isWhiteConnected ? "Online" : "Disconnected";
        }
        if (opponentOnlineDot) {
            opponentOnlineDot.classList.toggle("offline", !isBlackConnected);
            opponentOnlineDot.title = isBlackConnected ? "Online" : "Disconnected";
        }
    } else if (playerRole === "b") {
        if (playerOnlineDot) {
            playerOnlineDot.classList.toggle("offline", !isBlackConnected);
            playerOnlineDot.title = isBlackConnected ? "Online" : "Disconnected";
        }
        if (opponentOnlineDot) {
            opponentOnlineDot.classList.toggle("offline", !isWhiteConnected);
            opponentOnlineDot.title = isWhiteConnected ? "Online" : "Disconnected";
        }
    } else {
        if (playerOnlineDot) {
            playerOnlineDot.classList.toggle("offline", !isWhiteConnected);
            playerOnlineDot.title = isWhiteConnected ? "White Online" : "White Disconnected";
        }
        if (opponentOnlineDot) {
            opponentOnlineDot.classList.toggle("offline", !isBlackConnected);
            opponentOnlineDot.title = isBlackConnected ? "Black Online" : "Black Disconnected";
        }
    }

    updateClockDisplays();
    updateTurnIndicators();
}

// ─── Toast Notifications ─────────────────────────────────────
function showToast(message, duration = 2500) {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), duration);
}

// ─── Chat Functions ──────────────────────────────────────────
function appendChatMessage(msg) {
    const msgEl = document.createElement("div");
    msgEl.className = `chat-msg msg-${msg.role}`;

    const headerEl = document.createElement("div");
    headerEl.className = "chat-msg-header";

    const senderEl = document.createElement("span");
    senderEl.className = `chat-sender sender-${msg.role}`;
    senderEl.textContent = msg.sender;

    const timeEl = document.createElement("span");
    timeEl.className = "chat-time";
    timeEl.textContent = msg.time || "";

    headerEl.appendChild(senderEl);
    headerEl.appendChild(timeEl);

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "chat-bubble";
    bubbleEl.textContent = msg.text;

    msgEl.appendChild(headerEl);
    msgEl.appendChild(bubbleEl);

    chatLog.appendChild(msgEl);
    chatLog.scrollTop = chatLog.scrollHeight;
}

chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
        socket.emit("chatMessage", text);
        chatInput.value = "";
    }
});

// ─── Modal Helpers ───────────────────────────────────────────
function openModal(modalEl) {
    if (modalEl) modalEl.classList.add("visible");
}

function closeModal(modalEl) {
    if (modalEl) modalEl.classList.remove("visible");
}

function closeAllConfirmModals() {
    closeModal(drawOfferModal);
    closeModal(resignConfirmModal);
    closeModal(rematchOfferModal);
    closeModal(leaveGameConfirmModal);
    closeModal(newGameConfirmModal);
}

// ─── Control Buttons State & Validation ──────────────────────
function updateActionButtonsState() {
    const isPlayer = playerRole === "w" || playerRole === "b";
    const movesPlayed = (moveHistory && moveHistory.length) || (chess.history && chess.history().length) || 0;

    // 1. Resign: Only for seated players, in an active game with at least 1 move played
    if (btnResign) {
        btnResign.disabled = !isPlayer || isGameOver || movesPlayed === 0;
    }

    // 2. Offer Draw: Only for seated players, in active game with at least 1 move, not already offered
    if (btnOfferDraw) {
        if (drawOfferedByMe) {
            btnOfferDraw.disabled = true;
            btnOfferDraw.textContent = "Offered...";
        } else {
            btnOfferDraw.disabled = !isPlayer || isGameOver || movesPlayed === 0;
            btnOfferDraw.textContent = "½ Draw";
        }
    }

    // 3. Rematch: Only enabled when game is over and player is seated
    if (btnRematch) {
        if (rematchOfferedByMe) {
            btnRematch.disabled = true;
            btnRematch.textContent = "Offered...";
        } else {
            btnRematch.disabled = !isPlayer || !isGameOver;
            btnRematch.textContent = "🔄 Rematch";
        }
    }
    if (btnModalRematch) {
        if (rematchOfferedByMe) {
            btnModalRematch.disabled = true;
            btnModalRematch.textContent = "Rematch Sent...";
        } else {
            btnModalRematch.disabled = !isPlayer || !isGameOver;
            btnModalRematch.textContent = "🔄 Rematch";
        }
    }

    // 4. Leave Game: Only enabled for seated players
    if (btnLeaveGame) {
        btnLeaveGame.disabled = !isPlayer;
    }
    if (btnModalLeave) {
        btnModalLeave.disabled = !isPlayer;
    }
}

// ─── Game Over Modal (Phase 7) ────────────────────────────────
function showGameOverModal(data) {
    isGameOver = true;
    clocks.active = false;
    drawOfferedByMe = false;
    rematchOfferedByMe = false;
    closeAllConfirmModals();

    const isWinner = playerRole && data.winner === playerRole;
    const isLoser = playerRole && data.winner && data.winner !== playerRole;

    if (modalOutcome) {
        modalOutcome.className = "modal-outcome";
    }

    if (data.type === "checkmate") {
        setGameState("CHECKMATE", data);
        modalIcon.textContent = "👑";
        modalIcon.className = "modal-icon text-blue";
        modalTitle.textContent = "CHECKMATE";
        if (modalOutcome) {
            if (isWinner) {
                modalOutcome.textContent = "YOU WON! 🏆";
                modalOutcome.classList.add("outcome-win");
            } else if (isLoser) {
                modalOutcome.textContent = "YOU LOST";
                modalOutcome.classList.add("outcome-loss");
            } else {
                modalOutcome.textContent = `${data.winner === "w" ? "WHITE" : "BLACK"} WON!`;
                modalOutcome.classList.add("outcome-neutral");
            }
        }
    } else if (data.type === "timeout") {
        setGameState("TIMEOUT", data);
        modalIcon.textContent = "⏱";
        modalIcon.className = "modal-icon text-amber";
        modalTitle.textContent = "TIME OUT";
        if (modalOutcome) {
            if (isWinner) {
                modalOutcome.textContent = "YOU WON ON TIME! ⏱️";
                modalOutcome.classList.add("outcome-win");
            } else if (isLoser) {
                modalOutcome.textContent = "TIME OUT — YOU LOST";
                modalOutcome.classList.add("outcome-loss");
            } else {
                modalOutcome.textContent = `${data.winner === "w" ? "WHITE" : "BLACK"} WON ON TIME`;
                modalOutcome.classList.add("outcome-neutral");
            }
        }
    } else if (data.type === "resignation") {
        setGameState("RESIGNED", data);
        modalIcon.textContent = "⚑";
        modalIcon.className = "modal-icon text-danger";
        modalTitle.textContent = "RESIGNED";
        if (modalOutcome) {
            if (isWinner) {
                modalOutcome.textContent = "VICTORY BY RESIGNATION ⚑";
                modalOutcome.classList.add("outcome-win");
            } else if (isLoser) {
                modalOutcome.textContent = "YOU RESIGNED";
                modalOutcome.classList.add("outcome-loss");
            } else {
                modalOutcome.textContent = "MATCH CONCLUDED";
                modalOutcome.classList.add("outcome-neutral");
            }
        }
    } else if (data.type === "aborted") {
        setGameState("ABORTED", data);
        modalIcon.textContent = "🚫";
        modalIcon.className = "modal-icon text-amber";
        modalTitle.textContent = "ABORTED";
        if (modalOutcome) {
            modalOutcome.textContent = "GAME ABORTED 🚫";
            modalOutcome.classList.add("outcome-neutral");
        }
    } else if (data.type === "abandonment") {
        setGameState("FINISHED", data);
        modalIcon.textContent = "🚪";
        modalIcon.className = "modal-icon text-danger";
        modalTitle.textContent = "OPPONENT LEFT";
        if (modalOutcome) {
            if (isWinner) {
                modalOutcome.textContent = "YOU WON BY FORFEIT 🚪";
                modalOutcome.classList.add("outcome-win");
            } else {
                modalOutcome.textContent = "MATCH ABANDONED";
                modalOutcome.classList.add("outcome-loss");
            }
        }
    } else if (data.type === "stalemate") {
        setGameState("STALEMATE", data);
        modalIcon.textContent = "🔒";
        modalIcon.className = "modal-icon text-amber";
        modalTitle.textContent = "STALEMATE";
        if (modalOutcome) {
            modalOutcome.textContent = "DRAW 🔒";
            modalOutcome.classList.add("outcome-draw");
        }
    } else {
        // Generic draw, repetition, insufficient
        setGameState("DRAW", data);
        modalIcon.textContent = "🤝";
        modalIcon.className = "modal-icon text-amber";
        modalTitle.textContent = "DRAW";
        if (modalOutcome) {
            modalOutcome.textContent = "DRAW 🤝";
            modalOutcome.classList.add("outcome-draw");
        }
    }

    modalMessage.textContent = data.message;
    openModal(gameOverModal);
    playSound("notify");
    updateClockDisplays();
    updateActionButtonsState();
}

function hideGameOverModal() {
    closeModal(gameOverModal);
}

// ─── Control Buttons Event Listeners ─────────────────────────

// 1. Resign (With Confirmation Dialog)
btnResign.addEventListener("click", () => {
    if (btnResign.disabled) return;
    openModal(resignConfirmModal);
});

btnConfirmResign.addEventListener("click", () => {
    closeModal(resignConfirmModal);
    socket.emit("resign");
});

btnCancelResign.addEventListener("click", () => {
    closeModal(resignConfirmModal);
});

// 2. Offer Draw
btnOfferDraw.addEventListener("click", () => {
    if (btnOfferDraw.disabled) return;
    drawOfferedByMe = true;
    socket.emit("offerDraw");
    updateActionButtonsState();
    showToast("Draw offer sent to opponent");
});

btnAcceptDraw.addEventListener("click", () => {
    closeModal(drawOfferModal);
    socket.emit("acceptDraw");
});

btnDeclineDraw.addEventListener("click", () => {
    closeModal(drawOfferModal);
    socket.emit("declineDraw");
});

// 3. Rematch
function handleRematchRequest() {
    const isPlayer = playerRole === "w" || playerRole === "b";
    if (!isGameOver || !isPlayer || rematchOfferedByMe) return;
    rematchOfferedByMe = true;
    socket.emit("offerRematch");
    updateActionButtonsState();
    showToast("Rematch offer sent to opponent");
}

btnRematch.addEventListener("click", handleRematchRequest);
btnModalRematch.addEventListener("click", handleRematchRequest);

btnAcceptRematch.addEventListener("click", () => {
    closeModal(rematchOfferModal);
    socket.emit("acceptRematch");
});

btnDeclineRematch.addEventListener("click", () => {
    closeModal(rematchOfferModal);
    socket.emit("declineRematch");
});

// 4. Leave Game (With Confirmation Dialog)
function handleLeavePrompt() {
    if (btnLeaveGame.disabled) return;
    const movesPlayed = (moveHistory && moveHistory.length) || 0;
    if (!isGameOver && movesPlayed > 0) {
        leaveGameMessage.textContent = "An active match is underway. Leaving your seat will forfeit the match and grant victory to your opponent.";
    } else {
        leaveGameMessage.textContent = "Are you sure you want to vacate your seat and become a spectator?";
    }
    openModal(leaveGameConfirmModal);
}

btnLeaveGame.addEventListener("click", handleLeavePrompt);
btnModalLeave.addEventListener("click", handleLeavePrompt);

btnConfirmLeave.addEventListener("click", () => {
    closeModal(leaveGameConfirmModal);
    closeModal(gameOverModal);
    localStorage.removeItem("chess_session_token");
    socket.emit("leaveGame");
});

btnCancelLeave.addEventListener("click", () => {
    closeModal(leaveGameConfirmModal);
});

// 5. New Game (With Confirmation if Game in Progress)
btnQuickNewGame.addEventListener("click", () => {
    const isPlayer = playerRole === "w" || playerRole === "b";
    const movesPlayed = (moveHistory && moveHistory.length) || 0;
    if (!isGameOver && movesPlayed > 0 && isPlayer) {
        openModal(newGameConfirmModal);
    } else {
        socket.emit("newGame");
    }
});

btnConfirmNewGame.addEventListener("click", () => {
    closeModal(newGameConfirmModal);
    socket.emit("newGame");
});

btnCancelNewGame.addEventListener("click", () => {
    closeModal(newGameConfirmModal);
});

btnModalNewGame.addEventListener("click", () => {
    closeModal(gameOverModal);
    socket.emit("newGame");
});

btnModalReview.addEventListener("click", () => {
    closeModal(gameOverModal);
    showToast("Review mode: click moves in the notation table to inspect");
});

// 6. Flip Board
btnFlip.addEventListener("click", () => {
    isFlipped = !isFlipped;
    renderLabels();
    renderBoard();
    showToast(isFlipped ? "Board perspective flipped" : "Board perspective reset");
});

// ─── Phase 9: Lobby & View Management ─────────────────────────
function showLobby() {
    if (lobbyView) lobbyView.style.display = "flex";
    if (gameView) gameView.style.display = "none";
    if (navLobby) navLobby.classList.add("active");
    if (navPlay) navPlay.classList.remove("active");
    if (navPuzzles) navPuzzles.classList.remove("active");
    if (navHistory) navHistory.classList.remove("active");
    updateActiveGameNavButton();
}

function showGame() {
    if (lobbyView) lobbyView.style.display = "none";
    if (gameView) gameView.style.display = "grid";
    if (navPlay) navPlay.classList.add("active");
    if (navLobby) navLobby.classList.remove("active");
    if (navPuzzles) navPuzzles.classList.remove("active");
    if (navHistory) navHistory.classList.remove("active");
    renderLabels();
    renderBoard();
    updateClockDisplays();
    updateActionButtonsState();
    updateActiveGameNavButton();
}

function updateActiveGameNavButton() {
    if (!btnNavActiveGame) return;
    const movesCount = (moveHistory && moveHistory.length) || (chess.history && chess.history().length) || 0;
    const isPlayer = playerRole === "w" || playerRole === "b";
    if (isPlayer && !isGameOver && movesCount > 0) {
        btnNavActiveGame.style.display = "inline-flex";
    } else {
        btnNavActiveGame.style.display = "none";
    }
}

// Navigation Bar Listeners
if (navLobby) navLobby.addEventListener("click", (e) => { e.preventDefault(); showLobby(); });
if (navPlay)  navPlay.addEventListener("click", (e) => { e.preventDefault(); showGame(); });
if (navPuzzles) navPuzzles.addEventListener("click", (e) => { e.preventDefault(); openModal(puzzlesModal); });
if (navHistory) navHistory.addEventListener("click", (e) => { e.preventDefault(); openModal(historyModal); });
if (btnNavActiveGame) btnNavActiveGame.addEventListener("click", () => showGame());
if (btnReturnToLobby) btnReturnToLobby.addEventListener("click", () => showLobby());
const brandEl = document.querySelector(".brand");
if (brandEl) brandEl.addEventListener("click", (e) => { e.preventDefault(); showLobby(); });

// Time Control Choices in Lobby
const TC_LABELS = {
    "1+0": "1+0 • Bullet",
    "2+1": "2+1 • Bullet",
    "3+0": "3+0 • Blitz",
    "3+2": "3+2 • Blitz",
    "5+0": "5+0 • Blitz",
    "10+0": "10+0 • Rapid",
    "10+5": "10+5 • Rapid",
    "30+0": "30+0 • Classical",
};

tcChoiceButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        tcChoiceButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedLobbyTc = btn.dataset.tc;
        if (selectedTcBadge) {
            selectedTcBadge.textContent = TC_LABELS[selectedLobbyTc] || selectedLobbyTc;
        }
        if (timeControlSelect) {
            timeControlSelect.value = selectedLobbyTc;
        }
    });
});

// Matchmaking Logic
function formatSeconds(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function startMatchmakingSearch() {
    openModal(matchmakingModal);
    if (matchmakingTcTag) {
        matchmakingTcTag.textContent = TC_LABELS[selectedLobbyTc] || selectedLobbyTc;
    }
    matchmakingStartSeconds = 0;
    if (matchmakingTimer) matchmakingTimer.textContent = "00:00";

    if (matchmakingTimerInterval) clearInterval(matchmakingTimerInterval);
    matchmakingTimerInterval = setInterval(() => {
        matchmakingStartSeconds++;
        if (matchmakingTimer) {
            matchmakingTimer.textContent = formatSeconds(matchmakingStartSeconds);
        }
    }, 1000);

    socket.emit("findMatch", {
        timeControl: selectedLobbyTc,
        sessionToken: sessionToken
    });
}

function cancelMatchmakingSearch() {
    if (matchmakingTimerInterval) {
        clearInterval(matchmakingTimerInterval);
        matchmakingTimerInterval = null;
    }
    closeModal(matchmakingModal);
    socket.emit("cancelMatchmaking");
    showToast("Matchmaking cancelled");
}

if (btnFindOpponent) btnFindOpponent.addEventListener("click", startMatchmakingSearch);
if (btnCancelSearch) btnCancelSearch.addEventListener("click", cancelMatchmakingSearch);

// ─── Mode Cards & Interactive Modals ───────────────────────────
const modeFriend             = document.getElementById("modeFriend");
const modeCreateGame         = document.getElementById("modeCreateGame");
const modeJoinGame           = document.getElementById("modeJoinGame");
const modeVsBot              = document.getElementById("modeVsBot");
const modePuzzles            = document.getElementById("modePuzzles");
const modeHistory            = document.getElementById("modeHistory");
const modeProfile            = document.getElementById("modeProfile");

const createGameModal        = document.getElementById("createGameModal");
const createGameTcSelect     = document.getElementById("createGameTcSelect");
const btnSubmitCreateGame    = document.getElementById("btnSubmitCreateGame");
const btnCloseCreateModal    = document.getElementById("btnCloseCreateModal");
const btnColorPicks          = document.querySelectorAll(".btn-color-pick");
const friendModalTc          = document.getElementById("friendModalTc");
const waitingFriendText      = document.getElementById("waitingFriendText");
const privateRoomBar         = document.getElementById("privateRoomBar");
const gameRoomCode           = document.getElementById("gameRoomCode");
const btnCopyRoomCode        = document.getElementById("btnCopyRoomCode");
const spectatorIndicatorPill = document.getElementById("spectatorIndicatorPill");

let selectedCreateColor = "w";
let activeGameRoomId = "default";

// Color selection in Create Game Modal
btnColorPicks.forEach(btn => {
    btn.addEventListener("click", () => {
        btnColorPicks.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedCreateColor = btn.dataset.color || "w";
    });
});

// Mode Card Click Listeners
if (modeFriend) modeFriend.addEventListener("click", () => openModal(createGameModal));
if (modeCreateGame) modeCreateGame.addEventListener("click", () => openModal(createGameModal));
if (modeJoinGame) modeJoinGame.addEventListener("click", () => openModal(joinGameModal));
if (modeVsBot) modeVsBot.addEventListener("click", () => openModal(vsComputerModal));
if (modePuzzles) modePuzzles.addEventListener("click", () => openModal(puzzlesModal));
if (modeHistory) modeHistory.addEventListener("click", () => openModal(historyModal));
if (modeProfile) modeProfile.addEventListener("click", () => openModal(profileModal));
if (userMenu) userMenu.addEventListener("click", () => openModal(profileModal));

// Create Game Form Handlers
if (btnCloseCreateModal) btnCloseCreateModal.addEventListener("click", () => closeModal(createGameModal));
if (btnSubmitCreateGame) {
    btnSubmitCreateGame.addEventListener("click", () => {
        const tc = createGameTcSelect ? createGameTcSelect.value : "10+0";
        closeModal(createGameModal);
        openModal(playFriendModal);
        if (waitingFriendText) waitingFriendText.textContent = "Creating room & generating link...";
        socket.emit("createPrivateGame", {
            timeControl: tc,
            preferredColor: selectedCreateColor,
            sessionToken: sessionToken
        });
    });
}

// Play Friend Modal Handlers
if (btnCloseFriendModal) btnCloseFriendModal.addEventListener("click", () => closeModal(playFriendModal));
if (btnCopyInviteLink) {
    btnCopyInviteLink.addEventListener("click", () => {
        if (friendInviteLink) {
            friendInviteLink.select();
            navigator.clipboard.writeText(friendInviteLink.value).then(() => {
                btnCopyInviteLink.textContent = "✔ COPIED!";
                setTimeout(() => { btnCopyInviteLink.textContent = "📋 COPY INVITE LINK"; }, 2500);
                showToast("Invite link copied to clipboard!");
            }).catch(() => {
                showToast("Link copied!");
            });
        }
    });
}

// Compact Copy Button in Active Game Banner
if (btnCopyRoomCode) {
    btnCopyRoomCode.addEventListener("click", () => {
        const inviteUrl = window.location.origin + "/?game=" + (activeGameRoomId || "default");
        navigator.clipboard.writeText(inviteUrl).then(() => {
            btnCopyRoomCode.textContent = "✔ Copied";
            setTimeout(() => { btnCopyRoomCode.textContent = "📋 Copy Link"; }, 2500);
            showToast("Game invite link copied!");
        });
    });
}

// Join Game Modal Handlers
if (btnCloseJoinModal) btnCloseJoinModal.addEventListener("click", () => closeModal(joinGameModal));
if (btnConfirmJoinGame) {
    btnConfirmJoinGame.addEventListener("click", () => {
        const code = joinRoomInput.value.trim();
        if (!code) {
            showToast("Please enter a Game ID or invite link");
            return;
        }
        closeModal(joinGameModal);
        showToast(`Connecting to match ${code}...`);
        socket.emit("joinPrivateGame", {
            roomId: code,
            sessionToken: sessionToken
        });
    });
}

if (btnCloseBotModal) btnCloseBotModal.addEventListener("click", () => closeModal(vsComputerModal));
if (btnStartBotGame) {
    btnStartBotGame.addEventListener("click", () => {
        closeModal(vsComputerModal);
        showGame();
        showToast("Starting match vs Computer Bot!");
    });
}

const botDiffButtons = document.querySelectorAll(".btn-diff");
botDiffButtons.forEach(b => {
    b.addEventListener("click", () => {
        botDiffButtons.forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
    });
});

if (btnClosePuzzleModal) btnClosePuzzleModal.addEventListener("click", () => closeModal(puzzlesModal));
if (btnSolvePuzzle) {
    btnSolvePuzzle.addEventListener("click", () => {
        closeModal(puzzlesModal);
        showGame();
        showToast("Puzzle #482 loaded on board!");
    });
}

if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener("click", () => closeModal(historyModal));
if (btnCloseProfileModal) btnCloseProfileModal.addEventListener("click", () => closeModal(profileModal));

// ─── Socket.IO Event Handlers ─────────────────────────────────

// Full game state
socket.on("gameState", (state) => {
    chess.load(state.fen);
    lastMove = null;
    selectedSquare = null;
    currentLegalMoves = [];
    viewingMoveIndex = null;
    isGameOver = !!state.isGameOver;

    if (state.history && state.history.length > 0) {
        const last = state.history[state.history.length - 1];
        lastMove = { from: last.from, to: last.to };
    }
    if (state.clocks) {
        syncServerClocks(state.clocks);
    }
    updateMoveHistory(state.history);
    updatePlayerInfo(state.players);
    updateActionButtonsState();
    updateActiveGameNavButton();
    renderBoard();
});

// Role assignment
socket.on("playerRole", (role) => {
    playerRole = role;
    selectedSquare = null;
    currentLegalMoves = [];
    updatePlayerInfo();
    updateActionButtonsState();
    renderBoard();
    showToast(`You are playing as ${role === "w" ? "White" : "Black"}`);
});

socket.on("spectatorRole", () => {
    playerRole = null;
    selectedSquare = null;
    currentLegalMoves = [];
    updatePlayerInfo();
    updateActionButtonsState();
    renderBoard();
    showToast("You are spectating this game");
});

// Player slot updates
socket.on("playersUpdate", (playersData) => {
    updatePlayerInfo(playersData);
    updateActionButtonsState();
});

// Server authoritative periodic clock sync
socket.on("clockSync", (clockData) => {
    syncServerClocks(clockData);
});

// Time control changed
socket.on("timeControlChanged", (snapshot) => {
    syncServerClocks(snapshot);
    showToast(`Time control set to ${snapshot.timeControl.label}`);
});

// Move broadcast
socket.on("move", (moveData) => {
    chess.move({
        from: moveData.from,
        to: moveData.to,
        promotion: moveData.promotion,
    });
    lastMove = { from: moveData.from, to: moveData.to };
    selectedSquare = null;
    currentLegalMoves = [];
    drawOfferedByMe = false;
    closeModal(drawOfferModal);

    // Synchronize authoritative clocks from server
    if (moveData.clocks) {
        syncServerClocks(moveData.clocks);
    }

    // Trigger increment pop badge if increment was awarded
    if (moveData.increment) {
        showIncrementBadge(moveData.increment.color, moveData.increment.amount);
    }

    if (moveData.captured) {
        playSound("capture");
    } else {
        playSound("move");
    }

    // Update history
    updateMoveHistory(moveData.history);
    updateActionButtonsState();
    updateActiveGameNavButton();

    // If the user was in historical review mode, notify them with a toast
    if (viewingMoveIndex !== null) {
        showToast(`Move played: ${moveData.san}`);
    } else {
        renderBoard();
    }
});

// Draw offer
socket.on("drawOffered", (data) => {
    openModal(drawOfferModal);
    playSound("notify");
});

socket.on("drawDeclined", () => {
    drawOfferedByMe = false;
    updateActionButtonsState();
    showToast("Opponent declined the draw offer");
});

// Rematch offer
socket.on("rematchOffered", (data) => {
    openModal(rematchOfferModal);
    playSound("notify");
});

socket.on("rematchDeclined", (data) => {
    rematchOfferedByMe = false;
    updateActionButtonsState();
    showToast((data && data.reason) ? data.reason : "Opponent declined the rematch offer");
});

// Left game
socket.on("leftGameSuccess", () => {
    playerRole = null;
    drawOfferedByMe = false;
    rematchOfferedByMe = false;
    updatePlayerInfo();
    updateActionButtonsState();
    showToast("You vacated your seat and are now spectating");
});

// Chat history and new messages
socket.on("chatHistory", (history) => {
    chatLog.innerHTML = "";
    history.forEach(msg => appendChatMessage(msg));
});

socket.on("chatMessage", (msg) => {
    appendChatMessage(msg);
});

// Invalid move
socket.on("invalidMove", () => {
    showToast("Invalid move!");
    selectedSquare = null;
    currentLegalMoves = [];
    renderBoard();
});

// Game over
socket.on("gameOver", (data) => {
    selectedSquare = null;
    currentLegalMoves = [];
    showGameOverModal(data);
    renderBoard();
    updateActiveGameNavButton();
});

// Player disconnected
socket.on("playerDisconnected", (data) => {
    setGameState("DISCONNECTED", {
        message: (data && data.roleName) ? `${data.roleName} Disconnected` : "⚡ Opponent Disconnected"
    });
    showToast((data && data.roleName) ? `${data.roleName} disconnected` : "Opponent disconnected");
});

// New game
socket.on("newGame", (state) => {
    isGameOver = false;
    drawOfferedByMe = false;
    rematchOfferedByMe = false;
    lastMove = null;
    selectedSquare = null;
    currentLegalMoves = [];
    viewingMoveIndex = null;
    chess.load(state.fen);
    if (state.clocks) {
        syncServerClocks(state.clocks);
    }
    updateMoveHistory([]);
    hideGameOverModal();
    closeAllConfirmModals();
    updatePlayerInfo();
    updateActionButtonsState();
    updateActiveGameNavButton();
    renderBoard();
    showToast("New game started!");
    playSound("notify");
});

// Phase 9: Matchmaking Socket Handlers
socket.on("matchmakingStarted", (data) => {
    openModal(matchmakingModal);
    if (matchmakingTcTag) {
        matchmakingTcTag.textContent = (data && data.label) ? data.label : (TC_LABELS[selectedLobbyTc] || selectedLobbyTc);
    }
});

socket.on("matchmakingCancelled", () => {
    if (matchmakingTimerInterval) {
        clearInterval(matchmakingTimerInterval);
        matchmakingTimerInterval = null;
    }
    closeModal(matchmakingModal);
});

socket.on("matchFound", (data) => {
    if (matchmakingTimerInterval) {
        clearInterval(matchmakingTimerInterval);
        matchmakingTimerInterval = null;
    }
    closeModal(matchmakingModal);
    showGame();
    const tcLabel = (data && data.timeControl) ? data.timeControl.label : (TC_LABELS[selectedLobbyTc] || selectedLobbyTc);
    showToast(`Opponent found! Match starting (${tcLabel})`, 3500);
    playSound("notify");
});

// Phase 10: Private Game Socket Handlers
socket.on("privateGameCreated", (data) => {
    activeGameRoomId = data.roomId;
    openModal(playFriendModal);
    if (friendRoomCode) friendRoomCode.textContent = data.roomId;
    if (friendModalTc && data.timeControl) friendModalTc.textContent = data.timeControl.label;
    if (friendInviteLink) {
        friendInviteLink.value = window.location.origin + (data.inviteUrl || `/?game=${data.roomId}`);
    }
    if (waitingFriendText) waitingFriendText.textContent = "Waiting for your friend to join...";
    if (gameRoomCode) gameRoomCode.textContent = data.roomId;
    if (privateRoomBar) privateRoomBar.style.display = "flex";
    showToast(`Game created! Share the invite link with your friend.`, 4000);
});

socket.on("privateGameJoined", (data) => {
    activeGameRoomId = data.roomId;
    closeModal(joinGameModal);
    showGame();
    if (gameRoomCode) gameRoomCode.textContent = data.roomId;
    if (privateRoomBar) privateRoomBar.style.display = "flex";

    if (data.isSpectator) {
        playerRole = null;
        if (spectatorIndicatorPill) spectatorIndicatorPill.style.display = "inline-flex";
        showToast(`Spectating private match ${data.roomId}`, 3500);
    } else {
        if (spectatorIndicatorPill) spectatorIndicatorPill.style.display = "none";
        showToast(`Joined match as ${data.role === "w" ? "White" : "Black"}!`, 3500);
    }
    playSound("notify");
});

socket.on("privateGameReady", (data) => {
    activeGameRoomId = data.roomId;
    closeModal(playFriendModal);
    closeModal(createGameModal);
    showGame();
    if (gameRoomCode) gameRoomCode.textContent = data.roomId;
    if (privateRoomBar) privateRoomBar.style.display = "flex";
    if (spectatorIndicatorPill) spectatorIndicatorPill.style.display = "none";
    showToast(data.message || "Friend joined! White and Black are seated. Good luck!", 4000);
    playSound("notify");
});

socket.on("privateGameError", (data) => {
    showToast((data && data.message) ? data.message : "Private game error", 4000);
});

socket.on("unauthorizedAction", (data) => {
    showToast((data && data.message) ? data.message : "Unauthorized action: Spectators cannot move pieces.", 3000);
});

// Connection state & Real-time Reconnection (Phase 8)
socket.on("connect", () => {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    if (dot) dot.style.background = "var(--accent-emerald)";
    if (text) text.textContent = "Connected";

    // Re-identify with persistent session token
    socket.emit("identify", { sessionToken });

    // Phase 10: Auto-join if URL contains game ID or room param
    const urlParams = new URLSearchParams(window.location.search);
    let urlGame = urlParams.get("game") || urlParams.get("room");
    if (!urlGame && window.location.pathname.startsWith("/game/")) {
        urlGame = window.location.pathname.split("/")[2];
    }
    if (urlGame) {
        urlGame = urlGame.trim().toUpperCase();
        socket.emit("joinPrivateGame", { roomId: urlGame, sessionToken });
        showToast(`Connecting to game ${urlGame}...`, 3000);
    }
});

socket.on("reconnected", (data) => {
    showToast(`Reconnected to match as ${data.role === "w" ? "White" : "Black"}! Synchronized.`, 3000);
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    if (dot) dot.style.background = "var(--accent-emerald)";
    if (text) text.textContent = "Connected";
    updateTurnIndicators();
    updateActiveGameNavButton();

    // If reconnecting to an active game in progress, transition straight to board
    const movesCount = (moveHistory && moveHistory.length) || (chess.history && chess.history().length) || 0;
    if (!isGameOver && movesCount > 0) {
        showGame();
    }
});

socket.on("playerReconnected", (data) => {
    showToast(`${data.roleName} has reconnected to the match!`, 3000);
    updateTurnIndicators();
});

socket.on("disconnect", () => {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    if (dot) dot.style.background = "var(--accent-danger)";
    if (text) text.textContent = "Reconnecting...";
    showToast("Connection lost. Reconnecting to game...", 2500);
});

// ─── Initial Render & Start Local Clock Ticker ────────────────
renderLabels();
renderBoard();
updateClockDisplays();
updateActionButtonsState();
startLocalClockTicker();

// Phase 9: Initialize to Lobby homepage view instead of showing chessboard directly
showLobby();