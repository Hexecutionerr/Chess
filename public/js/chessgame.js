/* ═══════════════════════════════════════════════════════════════
   ChessArena — Production Client Game Engine
   ═══════════════════════════════════════════════════════════════ */

const socket = io();
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
const btnFlip           = document.getElementById("btnFlip");
const btnQuickNewGame   = document.getElementById("btnQuickNewGame");
const btnNewGame        = document.getElementById("btnNewGame");

const chatLog           = document.getElementById("chatLog");
const chatForm          = document.getElementById("chatForm");
const chatInput         = document.getElementById("chatInput");

const gameOverModal     = document.getElementById("gameOverModal");
const modalIcon         = document.getElementById("modalIcon");
const modalTitle        = document.getElementById("modalTitle");
const modalMessage      = document.getElementById("modalMessage");

const drawOfferModal    = document.getElementById("drawOfferModal");
const btnAcceptDraw     = document.getElementById("btnAcceptDraw");
const btnDeclineDraw    = document.getElementById("btnDeclineDraw");
const toastEl           = document.getElementById("toast");

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
function updateCapturedPieces() {
    const currentPieces = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };

    const board = chess.board();
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

// ─── Turn Indicators & Status Pill ───────────────────────────
function updateTurnIndicators() {
    const turn = chess.turn();
    const isCheck = chess.isCheck();

    const isUserTurn = (playerRole === "w" && turn === "w") || (playerRole === "b" && turn === "b");
    const isOpponentTurn = (playerRole === "w" && turn === "b") || (playerRole === "b" && turn === "w");

    playerBar.classList.toggle("active-turn", isUserTurn);
    opponentBar.classList.toggle("active-turn", isOpponentTurn || (playerRole === null && turn === "b"));

    if (isGameOver) {
        turnStatusText.textContent = "Match Finished";
        return;
    }

    if (isCheck) {
        turnStatusText.textContent = turn === "w" ? "White in Check!" : "Black in Check!";
        gameTurnPill.style.borderColor = "var(--accent-danger)";
    } else {
        turnStatusText.textContent = turn === "w" ? "White's Turn" : "Black's Turn";
        gameTurnPill.style.borderColor = "var(--border-subtle)";
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

    if (isLive) {
        displayBoard = chess.board();
        displayTurn = chess.turn();
        displayCheck = chess.isCheck();
    } else {
        const tempChess = new Chess();
        const targetFen = moveFens[viewingMoveIndex + 1] || tempChess.fen();
        tempChess.load(targetFen);
        displayBoard = tempChess.board();
        displayTurn = tempChess.turn();
        displayCheck = tempChess.isCheck();

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
    updateCapturedPieces();
};

// ─── Player Info & Roles UI ──────────────────────────────────
function updatePlayerInfo(playersData) {
    renderLabels();

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

    updateClockDisplays();
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

// ─── Game Over Modal ─────────────────────────────────────────
function showGameOverModal(data) {
    isGameOver = true;
    clocks.active = false;
    btnResign.disabled = true;
    btnOfferDraw.disabled = true;

    if (data.type === "checkmate") {
        modalIcon.textContent = "👑";
        modalTitle.textContent = "Checkmate!";
    } else if (data.type === "timeout") {
        modalIcon.textContent = "⏱";
        modalTitle.textContent = "Time Out!";
    } else if (data.type === "resignation") {
        modalIcon.textContent = "⚑";
        modalTitle.textContent = "Resignation";
    } else {
        modalIcon.textContent = "🤝";
        modalTitle.textContent = "Draw";
    }

    modalMessage.textContent = data.message;
    gameOverModal.classList.add("visible");
    playSound("notify");
    updateTurnIndicators();
    updateClockDisplays();
}

function hideGameOverModal() {
    gameOverModal.classList.remove("visible");
}

// ─── Control Buttons ─────────────────────────────────────────
btnResign.addEventListener("click", () => {
    if (isGameOver || !playerRole) return;
    if (confirm("Are you sure you want to resign?")) {
        socket.emit("resign");
    }
});

btnOfferDraw.addEventListener("click", () => {
    if (isGameOver || !playerRole) return;
    socket.emit("offerDraw");
    showToast("Draw offer sent to opponent");
});

btnFlip.addEventListener("click", () => {
    isFlipped = !isFlipped;
    renderLabels();
    renderBoard();
    showToast(isFlipped ? "Board flipped" : "Board reset");
});

btnQuickNewGame.addEventListener("click", () => {
    socket.emit("newGame");
});

btnNewGame.addEventListener("click", () => {
    socket.emit("newGame");
    hideGameOverModal();
});

btnAcceptDraw.addEventListener("click", () => {
    socket.emit("acceptDraw");
    drawOfferModal.classList.remove("visible");
});

btnDeclineDraw.addEventListener("click", () => {
    socket.emit("declineDraw");
    drawOfferModal.classList.remove("visible");
});

// ─── Socket.IO Event Handlers ─────────────────────────────────

// Full game state
socket.on("gameState", (state) => {
    chess.load(state.fen);
    lastMove = null;
    selectedSquare = null;
    currentLegalMoves = [];
    viewingMoveIndex = null;

    if (state.history && state.history.length > 0) {
        const last = state.history[state.history.length - 1];
        lastMove = { from: last.from, to: last.to };
    }
    if (state.clocks) {
        syncServerClocks(state.clocks);
    }
    updateMoveHistory(state.history);
    updatePlayerInfo(state.players);
    renderBoard();
});

// Role assignment
socket.on("playerRole", (role) => {
    playerRole = role;
    selectedSquare = null;
    currentLegalMoves = [];
    updatePlayerInfo();
    renderBoard();
    showToast(`You are playing as ${role === "w" ? "White" : "Black"}`);
});

socket.on("spectatorRole", () => {
    playerRole = null;
    selectedSquare = null;
    currentLegalMoves = [];
    updatePlayerInfo();
    renderBoard();
    showToast("You are spectating this game");
});

// Player slot updates
socket.on("playersUpdate", (playersData) => {
    updatePlayerInfo(playersData);
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

    // If the user was in historical review mode, notify them with a toast
    if (viewingMoveIndex !== null) {
        showToast(`Move played: ${moveData.san}`);
    } else {
        renderBoard();
    }
});

// Draw offer
socket.on("drawOffered", (data) => {
    drawOfferModal.classList.add("visible");
    playSound("notify");
});

socket.on("drawDeclined", () => {
    showToast("Opponent declined the draw offer");
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
});

// New game
socket.on("newGame", (state) => {
    isGameOver = false;
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
    updatePlayerInfo();
    renderBoard();
    showToast("New game started!");
    playSound("notify");
});

// Connection state
socket.on("connect", () => {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    if (dot) dot.style.background = "var(--accent-emerald)";
    if (text) text.textContent = "Connected";
});

socket.on("disconnect", () => {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    if (dot) dot.style.background = "var(--accent-danger)";
    if (text) text.textContent = "Reconnecting...";
});

// ─── Initial Render & Start Local Clock Ticker ────────────────
renderLabels();
renderBoard();
updateClockDisplays();
startLocalClockTicker();