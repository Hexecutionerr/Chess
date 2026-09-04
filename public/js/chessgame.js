/* ═══════════════════════════════════════════════════════════════
   Chess Platform — Client-Side Game Engine
   ═══════════════════════════════════════════════════════════════ */

// ─── Dependencies (loaded via <script> tags) ──────────────────
// chess.js (CJS build served from /vendor/chess.js/chess.js)
// socket.io-client (CDN)

const socket = io();
const chess = new Chess();
const boardElement = document.getElementById("chessboard");

// ─── State ────────────────────────────────────────────────────
let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;       // "w", "b", or null (spectator)
let selectedSquare = null;   // { row, col } for click-to-move
let lastMove = null;         // { from, to } algebraic notation
let isGameOver = false;

// ─── DOM References ───────────────────────────────────────────
const opponentBar   = document.getElementById("opponentBar");
const playerBar     = document.getElementById("playerBar");
const opponentName  = document.getElementById("opponentName");
const playerName    = document.getElementById("playerName");
const opponentLabel = document.getElementById("opponentLabel");
const playerLabel   = document.getElementById("playerLabel");
const opponentIcon  = document.getElementById("opponentIcon");
const playerIcon    = document.getElementById("playerIcon");
const btnResign     = document.getElementById("btnResign");
const btnNewGame    = document.getElementById("btnNewGame");
const gameOverModal = document.getElementById("gameOverModal");
const modalIcon     = document.getElementById("modalIcon");
const modalTitle    = document.getElementById("modalTitle");
const modalMessage  = document.getElementById("modalMessage");
const toastEl       = document.getElementById("toast");
const rankLabelsEl  = document.getElementById("rankLabels");
const fileLabelsEl  = document.getElementById("fileLabels");

// ─── Sound System ─────────────────────────────────────────────
const sounds = {
    move: new Audio("/sounds/Move.mp3"),
    capture: new Audio("/sounds/Capture.mp3"),
    notify: new Audio("/sounds/GenericNotify.mp3"),
};

// Preload sounds
Object.values(sounds).forEach(s => { s.load(); s.volume = 0.6; });

function playSound(type) {
    const s = sounds[type];
    if (s) {
        s.currentTime = 0;
        s.play().catch(() => {});
    }
}

// ─── Piece Image Mapping ──────────────────────────────────────
function getPieceImage(piece) {
    if (!piece) return null;
    const colorPrefix = piece.color === "w" ? "w" : "b";
    const typeMap = { p: "P", r: "R", n: "N", b: "B", q: "Q", k: "K" };
    const pieceName = typeMap[piece.type];
    return `/img/pieces/${colorPrefix}${pieceName}.svg`;
}

// ─── Coordinate Labels ───────────────────────────────────────
function renderLabels() {
    rankLabelsEl.innerHTML = "";
    fileLabelsEl.innerHTML = "";

    const ranks = playerRole === "b"
        ? ["1","2","3","4","5","6","7","8"]
        : ["8","7","6","5","4","3","2","1"];
    const files = playerRole === "b"
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

// ─── Board Rendering ─────────────────────────────────────────
const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";

    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            const isLight = (rowindex + squareindex) % 2 === 0;
            squareElement.classList.add("square", isLight ? "light" : "dark");
            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            // Last-move highlighting
            if (lastMove) {
                const algebraic = toAlgebraic(rowindex, squareindex);
                if (algebraic === lastMove.from || algebraic === lastMove.to) {
                    squareElement.classList.add("last-move");
                }
            }

            // Check highlighting on king
            if (chess.isCheck() && square && square.type === "k" && square.color === chess.turn()) {
                squareElement.classList.add("in-check");
            }

            // Piece rendering
            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece");
                pieceElement.style.backgroundImage = `url('${getPieceImage(square)}')`;

                const canDrag = !isGameOver && playerRole === square.color;
                pieceElement.draggable = canDrag;
                if (canDrag) pieceElement.classList.add("draggable");

                // Click — select piece for click-to-move
                pieceElement.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!isGameOver && playerRole === square.color) {
                        selectPiece(rowindex, squareindex);
                    } else if (selectedSquare) {
                        // Clicking opponent piece = attempt capture via click-to-move
                        handleMove(selectedSquare, { row: rowindex, col: squareindex });
                    }
                });

                // Drag start
                pieceElement.addEventListener("dragstart", (e) => {
                    if (canDrag) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareindex };
                        e.dataTransfer.effectAllowed = "move";
                        // Use a small timeout so the dragging class applies after the drag image is captured
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

            // Click on square — move destination (click-to-move)
            squareElement.addEventListener("click", () => {
                if (selectedSquare && !isGameOver) {
                    handleMove(selectedSquare, { row: rowindex, col: squareindex });
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
                if (draggedPiece) {
                    const targetSquare = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col),
                    };
                    handleMove(sourceSquare, targetSquare);
                }
            });

            boardElement.appendChild(squareElement);
        });
    });

    // Highlight selected square and valid moves
    if (selectedSquare) {
        highlightValidMoves(selectedSquare);
    }

    // Board flip for black player
    if (playerRole === "b") {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }

    // Update turn indicators on player bars
    updateTurnIndicators();
};

// ─── Algebraic Notation Helpers ──────────────────────────────
function toAlgebraic(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
}

// ─── Piece Selection (Click-to-Move) ─────────────────────────
const selectPiece = (row, col) => {
    // Toggle: deselect if same piece clicked again
    if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        selectedSquare = null;
        renderBoard();
        return;
    }
    selectedSquare = { row, col };
    renderBoard();
};

// ─── Valid Move Highlighting ─────────────────────────────────
const highlightValidMoves = (square) => {
    const from = toAlgebraic(square.row, square.col);
    const moves = chess.moves({ square: from, verbose: true });

    // Highlight selected square
    const selectedEl = boardElement.querySelector(
        `[data-row="${square.row}"][data-col="${square.col}"]`
    );
    if (selectedEl) {
        selectedEl.classList.add("selected");
    }

    // Highlight valid destination squares
    moves.forEach(move => {
        const toCol = move.to.charCodeAt(0) - 97;
        const toRow = 8 - parseInt(move.to[1]);

        const targetEl = boardElement.querySelector(
            `[data-row="${toRow}"][data-col="${toCol}"]`
        );

        if (targetEl) {
            if (move.captured) {
                // Capture indicator — ring around square
                const ring = document.createElement("div");
                ring.classList.add("valid-capture-ring");
                targetEl.appendChild(ring);
            } else {
                // Empty square — dot indicator
                const dot = document.createElement("div");
                dot.classList.add("valid-move-dot");
                targetEl.appendChild(dot);
            }
        }
    });
};

// ─── Handle Move ──────────────────────────────────────────────
const handleMove = (source, target) => {
    const from = toAlgebraic(source.row, source.col);
    const to = toAlgebraic(target.row, target.col);

    const piece = chess.get(from);
    const isPromotion = piece &&
        piece.type === "p" &&
        ((piece.color === "w" && target.row === 0) ||
         (piece.color === "b" && target.row === 7));

    const move = { from, to };
    if (isPromotion) {
        move.promotion = "q";
    }

    socket.emit("move", move);

    // Clear selection after move attempt
    selectedSquare = null;
};

// ─── Turn Indicators ─────────────────────────────────────────
function updateTurnIndicators() {
    const turn = chess.turn();

    if (playerRole === "w") {
        playerBar.classList.toggle("active-turn", turn === "w");
        opponentBar.classList.toggle("active-turn", turn === "b");
    } else if (playerRole === "b") {
        playerBar.classList.toggle("active-turn", turn === "b");
        opponentBar.classList.toggle("active-turn", turn === "w");
    } else {
        // Spectator — show white's perspective
        playerBar.classList.toggle("active-turn", turn === "w");
        opponentBar.classList.toggle("active-turn", turn === "b");
    }
}

// ─── Player Info UI ──────────────────────────────────────────
function updatePlayerInfo() {
    renderLabels();

    if (playerRole === "w") {
        playerName.textContent = "You";
        playerLabel.textContent = "Playing as White";
        playerIcon.textContent = "♔";
        playerIcon.className = "player-color-icon white-icon";

        opponentName.textContent = "Opponent";
        opponentLabel.textContent = "Playing as Black";
        opponentIcon.textContent = "♚";
        opponentIcon.className = "player-color-icon black-icon";

        btnResign.disabled = false;
    } else if (playerRole === "b") {
        playerName.textContent = "You";
        playerLabel.textContent = "Playing as Black";
        playerIcon.textContent = "♚";
        playerIcon.className = "player-color-icon black-icon";

        opponentName.textContent = "Opponent";
        opponentLabel.textContent = "Playing as White";
        opponentIcon.textContent = "♔";
        opponentIcon.className = "player-color-icon white-icon";

        btnResign.disabled = false;
    } else {
        playerName.textContent = "Spectating";
        playerLabel.textContent = "White";
        playerIcon.textContent = "♔";
        playerIcon.className = "player-color-icon white-icon";

        opponentName.textContent = "Spectating";
        opponentLabel.textContent = "Black";
        opponentIcon.textContent = "♚";
        opponentIcon.className = "player-color-icon black-icon";

        btnResign.disabled = true;
    }
}

// ─── Toast Notifications ─────────────────────────────────────
function showToast(message, duration = 2500) {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), duration);
}

// ─── Game Over Modal ─────────────────────────────────────────
function showGameOverModal(data) {
    isGameOver = true;
    btnResign.disabled = true;

    if (data.type === "checkmate") {
        modalIcon.textContent = "👑";
        modalTitle.textContent = "Checkmate!";
    } else if (data.type === "resignation") {
        modalIcon.textContent = "⚑";
        modalTitle.textContent = "Resignation";
    } else if (data.type === "stalemate") {
        modalIcon.textContent = "🤝";
        modalTitle.textContent = "Stalemate";
    } else {
        modalIcon.textContent = "🤝";
        modalTitle.textContent = "Draw";
    }

    modalMessage.textContent = data.message;
    gameOverModal.classList.add("visible");

    playSound("notify");
}

function hideGameOverModal() {
    gameOverModal.classList.remove("visible");
}

// ─── Button Handlers ─────────────────────────────────────────
btnResign.addEventListener("click", () => {
    if (isGameOver || !playerRole) return;
    if (confirm("Are you sure you want to resign?")) {
        socket.emit("resign");
    }
});

btnNewGame.addEventListener("click", () => {
    socket.emit("newGame");
    hideGameOverModal();
});

// ─── Socket.IO Event Handlers ─────────────────────────────────

// Initial full game state (on connect or reconnect)
socket.on("gameState", (state) => {
    chess.load(state.fen);
    lastMove = null;
    if (state.history && state.history.length > 0) {
        const last = state.history[state.history.length - 1];
        lastMove = { from: last.from, to: last.to };
    }
    renderBoard();
});

// Role assignment
socket.on("playerRole", (role) => {
    playerRole = role;
    updatePlayerInfo();
    renderBoard();
    showToast(`You are playing as ${role === "w" ? "White" : "Black"}`);
});

socket.on("spectatorRole", () => {
    playerRole = null;
    updatePlayerInfo();
    renderBoard();
    showToast("You are spectating this game");
});

// Board state sync (FEN)
socket.on("boardState", (fen) => {
    chess.load(fen);
    renderBoard();
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

    // Play appropriate sound
    if (moveData.captured) {
        playSound("capture");
    } else {
        playSound("move");
    }

    renderBoard();
});

// Invalid move feedback
socket.on("invalidMove", () => {
    showToast("Invalid move!");
});

// Game over
socket.on("gameOver", (data) => {
    showGameOverModal(data);
    renderBoard();
});

// New game
socket.on("newGame", (state) => {
    isGameOver = false;
    lastMove = null;
    selectedSquare = null;
    chess.load(state.fen);
    hideGameOverModal();
    updatePlayerInfo();
    renderBoard();
    showToast("New game started!");
    playSound("notify");
});

// Connection events
socket.on("connect", () => {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    dot.style.background = "var(--accent-primary)";
    text.textContent = "Connected";
});

socket.on("disconnect", () => {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    dot.style.background = "var(--accent-danger)";
    text.textContent = "Reconnecting...";
});

// ─── Initial Render ───────────────────────────────────────────
renderLabels();
renderBoard();