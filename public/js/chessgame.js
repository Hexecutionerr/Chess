// const socket = io(); // jesehi yeh line chlegi tmhr system se direct req chle jygi backend me
// const chess = new Chess();
// const boardElement = document.querySelector(".chessboard"); // # lgadege toh id and . lgadenge toh class

// let draggedPiece = null;
// let sourceSquare = null;
// let playerRole = null;

// const renderBoard = () => {
//     let board = chess.board();
    
//     // Black player ke liye board flip
//     if(playerRole === "b"){
//         board = board.slice().reverse().map(row => row.slice().reverse());
//     }

//     boardElement.innerHTML = ""; // agar naya board bnega toh jo pichla wala khali krega phir dalega

//     board.forEach((row, rowindex) => {
//         row.forEach((square, squareindex) => {
//             const squareElement = document.createElement("div");
//             squareElement.classList.add(
//                 "square",
//                 (rowindex + squareindex) % 2 === 0 ? "light" : "dark"
//             );
//             squareElement.dataset.row = rowindex;
//             squareElement.dataset.col = squareindex;

//             if(square){
//                 const pieceElement = document.createElement("div");
//                 pieceElement.classList.add(
//                     "piece",
//                     square.color === "w" ? "white" : "black"
//                 );
//                 pieceElement.innerText = getPieceUnicode(square);
//                 pieceElement.draggable = playerRole === square.color;

//                 pieceElement.addEventListener("dragstart",(e) => {
//                     if (pieceElement.draggable){
//                         draggedPiece = pieceElement;
//                         sourceSquare ={row : rowindex, col: squareindex};
//                         e.dataTransfer.setData("text/plain","");
//                     }
//                 });

//                 pieceElement.addEventListener("dragend",(e) => {
//                     draggedPiece = null;
//                     sourceSquare = null;
//                 });

//                 squareElement.appendChild(pieceElement);
//             }

//             squareElement.addEventListener("dragover", function (e){
//                 e.preventDefault();
//             });

//             squareElement.addEventListener("drop",function(e){
//                 e.preventDefault();
//                 if(draggedPiece){
//                     const targetSquare = {
//                         row:parseInt(squareElement.dataset.row),
//                         col:parseInt(squareElement.dataset.col),
//                     };
//                     handleMove(sourceSquare,targetSquare);
//                 }
//             });

//             boardElement.appendChild(squareElement);
//         });
//     });

//     // CSS flip optional
//     if(playerRole === "b"){
//         boardElement.classList.add("flipped");
//     } else {
//         boardElement.classList.remove("flipped");
//     }
// };

// // Move handler
// const handleMove = (source, target) => {
//     const move = {
//         from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
//         to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
//         promotion: "q",
//     };
//     socket.emit("move", move);
// };

// // Unicode pieces
// const getPieceUnicode = (piece) => {
//     const unicodePieces = {
//         P: "♙",
//         R: "♖",
//         N: "♘",
//         B: "♗",
//         Q: "♕",
//         K: "♔",

//         p: "♟",
//         r: "♜",
//         n: "♞",
//         b: "♝",
//         q: "♛",
//         k: "♚",
//     };
//     return unicodePieces[piece.type] || "";
// };

// // Socket events
// socket.on("playerRole", function(role){
//     playerRole = role;
//     renderBoard();
// });

// socket.on("spectatorRole", function(){
//     playerRole = null;
//     renderBoard();
// });

// socket.on("boardState", function(fen){
//     chess.load(fen);
//     renderBoard();
// });

// socket.on("move", function(move){
//     chess.move(move);
//     renderBoard();
// });

// // Initial render
// renderBoard();
const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null; // Selected piece track karne ke liye

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";

    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add(
                "square",
                (rowindex + squareindex) % 2 === 0 ? "light" : "dark"
            );
            
            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add(
                    "piece",
                    square.color === "w" ? "white" : "black"
                );
                pieceElement.innerText = getPieceUnicode(square);
                pieceElement.draggable = playerRole === square.color;

                // Click event - piece select karne ke liye
                pieceElement.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (playerRole === square.color) {
                        selectPiece(rowindex, squareindex);
                    }
                });

                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareindex };
                        e.dataTransfer.effectAllowed = "move";
                    }
                });

                pieceElement.addEventListener("dragend", (e) => {
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareElement.appendChild(pieceElement);
            }

            // Click event - move karne ke liye
            squareElement.addEventListener("click", () => {
                if (selectedSquare) {
                    handleMove(selectedSquare, { row: rowindex, col: squareindex });
                }
            });

            squareElement.addEventListener("dragover", function (e) {
                e.preventDefault();
            });

            squareElement.addEventListener("drop", function (e) {
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

    // Selected piece ke liye highlight dikhao
    if (selectedSquare) {
        highlightValidMoves(selectedSquare);
    }

    if (playerRole === "b") {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }
};

// Piece select karne ka function
const selectPiece = (row, col) => {
    // Agar same piece dobara click ho toh deselect karo
    if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        selectedSquare = null;
        renderBoard();
        return;
    }

    selectedSquare = { row: row, col: col };
    renderBoard();
};

// Valid moves highlight karne ka function
const highlightValidMoves = (square) => {
    const from = `${String.fromCharCode(97 + square.col)}${8 - square.row}`;
    const moves = chess.moves({ square: from, verbose: true });

    // Selected square ko highlight karo
    const selectedElement = boardElement.querySelector(
        `[data-row="${square.row}"][data-col="${square.col}"]`
    );
    if (selectedElement) {
        selectedElement.style.backgroundColor = "#baca44";
    }

    // Valid moves ko highlight karo
    moves.forEach(move => {
        const toCol = move.to.charCodeAt(0) - 97;
        const toRow = 8 - parseInt(move.to[1]);
        
        const targetElement = boardElement.querySelector(
            `[data-row="${toRow}"][data-col="${toCol}"]`
        );
        
        if (targetElement) {
            // Agar empty square hai
            if (!targetElement.querySelector('.piece')) {
                const dot = document.createElement('div');
                dot.style.width = '15px';
                dot.style.height = '15px';
                dot.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                dot.style.borderRadius = '50%';
                dot.style.position = 'absolute';
                targetElement.style.position = 'relative';
                targetElement.appendChild(dot);
            } else {
                // Agar opponent ka piece hai (capture move)
                targetElement.style.backgroundColor = "#f44336";
                targetElement.style.opacity = "0.8";
            }
        }
    });
};

const handleMove = (source, target) => {
    const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
    const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;
    
    const piece = chess.get(from);
    const isPromotion = piece && 
                        piece.type === 'p' && 
                        ((piece.color === 'w' && target.row === 0) || 
                         (piece.color === 'b' && target.row === 7));
    
    const move = {
        from: from,
        to: to
    };
    
    if (isPromotion) {
        move.promotion = 'q';
    }
    
    socket.emit("move", move);
    
    // Move ke baad selection clear karo
    selectedSquare = null;
};

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: "♙",
        r: "♖",
        n: "♘",
        b: "♗",
        q: "♕",
        k: "♔",
    };
    
    return unicodePieces[piece.type.toLowerCase()] || "";
};

socket.on("playerRole", function (role) {
    playerRole = role;
    renderBoard();
});

socket.on("spectatorRole", function () {
    playerRole = null;
    renderBoard();
});

socket.on("boardState", function (fen) {
    chess.load(fen);
    selectedSquare = null; // New board state pe selection clear karo
    renderBoard();
});

socket.on("move", function (move) {
    chess.move(move);
    selectedSquare = null;
    renderBoard();
});

renderBoard();