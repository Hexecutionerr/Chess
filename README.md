# ♟️ ChessArena — Real-Time Multiplayer Chess Platform

A polished, production-quality, real-time multiplayer chess platform built with **Node.js**, **Express**, **Socket.IO**, and **Chess.js**. Features server-authoritative move validation, professional SVG pieces, move highlighting, sound effects, game-over detection, and a modern dark-themed UI.

> **This is not a demo** — it's designed to feel like a real product.

---

## 📸 Screenshots

<p align="center">
  <img src="screenshots/board-white.png" alt="White Player View" width="700">
</p>
<p align="center"><em>White player's perspective — SVG pieces, last-move highlighting, turn indicator</em></p>

<br>

<p align="center">
  <img src="screenshots/gameplay.png" alt="Black Player View" width="700">
</p>
<p align="center"><em>Black player's perspective — board auto-flips, rank/file labels adapt</em></p>

---

## 🚀 Features

### 🎮 Gameplay & Chess Mechanics
- **Full Chess Rules Engine** — Powered by `chess.js` on both client and server
- **Server-Side Move Validation** — All moves validated server-side to prevent cheating
- **Pawn Promotion** — Automatic queen promotion on reaching the opposite rank
- **Game-Over Detection** — Checkmate, stalemate, threefold repetition, insufficient material, 50-move rule
- **Resign** — Players can resign with confirmation dialog
- **New Game** — Reset and play again without refreshing

### 🌐 Real-Time Multiplayer
- **WebSocket Architecture** — Instant synchronization via Socket.IO
- **Dynamic Role Assignment** — 1st player = White, 2nd = Black, 3rd+ = Spectators
- **Player Disconnect Handling** — Seats freed automatically on disconnect
- **Live Board Sync** — Spectators and reconnecting players receive current game state immediately

### 🎨 Professional UI/UX
- **Dark Theme** — Custom design system with Inter font, layered backgrounds, and accent colors
- **SVG Chess Pieces** — High-quality cburnett piece set (same set used by Lichess)
- **Dual Input Controls** — Drag & drop **and** click-to-move
- **Last-Move Highlighting** — Yellow highlight on the two squares of the most recent move
- **Selected Piece Highlighting** — Green highlight + legal move indicators (dots and capture rings)
- **Check Highlighting** — Red radial glow on the king's square when in check
- **Turn Indicators** — Active turn shown with green badge + left border accent on player bar
- **File/Rank Labels** — a-h and 1-8 labels that adapt based on player perspective
- **Sound Effects** — Distinct sounds for moves, captures, and notifications
- **Game-Over Modal** — Glassmorphism overlay with result, icon, and New Game button
- **Toast Notifications** — Role assignment, invalid move, and new game alerts
- **Connection Status** — Live indicator in header (green = connected, red = reconnecting)
- **Responsive Design** — Scales cleanly from desktop to mobile

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js, Express.js 5.x |
| **Real-time** | Socket.IO 4.8 |
| **Game Engine** | chess.js 1.4 (same version on client and server) |
| **Templating** | EJS |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5 Drag & Drop API |
| **Styling** | Custom CSS design system (Inter font, CSS custom properties) |
| **Assets** | cburnett SVG pieces, Lichess sound effects |

---

## 📁 Project Structure

```
ChessArena/
├── public/
│   ├── css/
│   │   └── styles.css          # Design system — tokens, board, layout, modal, responsive
│   ├── img/
│   │   └── pieces/             # 12 SVG chess pieces (wP, wR, wN, wB, wQ, wK, bP, bR, bN, bB, bQ, bK)
│   ├── js/
│   │   ├── chess-shim.js       # CJS-to-browser shim for chess.js
│   │   └── chessgame.js        # Client game engine — rendering, input, sockets, sounds, UI
│   └── sounds/
│       ├── Move.mp3            # Piece movement sound
│       ├── Capture.mp3         # Piece capture sound
│       └── GenericNotify.mp3   # Game event notification sound
├── views/
│   └── index.ejs               # Main page — header, player bars, board, controls, modal
├── screenshots/
│   ├── board-white.png         # White player perspective screenshot
│   └── gameplay.png            # Black player perspective screenshot
├── app.js                      # Express server — Socket.IO events, game state, validation
├── package.json                # Dependencies and scripts
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v16 or higher

### Installation
```bash
git clone https://github.com/Hexecutionerr/multiplayer-chess-game.git
cd multiplayer-chess-game
npm install
```

### Run
```bash
# Production
npm start

# Development (auto-reload with nodemon)
npm run dev
```

### Play
Open your browser at **[http://localhost:3000](http://localhost:3000)**

> **Multiplayer Testing:**
> 1. Open `localhost:3000` in a browser tab → Joins as **White**
> 2. Open `localhost:3000` in incognito / separate browser → Joins as **Black**
> 3. Any additional tab → Joins as **Spectator**

---

## 🔌 Socket.IO Event Architecture

```
Client → Server              Server → Client
─────────────────            ─────────────────
move {from, to, promotion}   playerRole ("w"/"b")
resign                       spectatorRole
newGame                      gameState {fen, turn, isCheck, history}
                             boardState (FEN string)
                             move {from, to, san, captured, isCheck}
                             invalidMove
                             gameOver {type, winner, message}
                             newGame {fen, turn, ...}
```

---

## 🗺️ Roadmap

| Phase | Features | Status |
|-------|----------|--------|
| **Phase 1** | Professional UI, SVG pieces, sounds, game-over, resign, new game | ✅ Complete |
| **Phase 2** | Chess clocks, move history sidebar, captured pieces, draw offers, pawn promotion UI | 🔜 Planned |
| **Phase 3** | Game rooms, lobby, authentication, matchmaking, private games | 📋 Planned |
| **Phase 4** | ELO ratings, leaderboards, game history, player profiles | 📋 Planned |
| **Phase 5** | AI opponent (Stockfish), game review, analysis board | 📋 Planned |
| **Phase 6** | Chess puzzles, responsive mobile app, PWA | 📋 Planned |

---

## 👨‍💻 Author

**Hasnain Khan**  
*Lead Developer & Architect*

- [GitHub](https://github.com/Hexecutionerr)
- [LinkedIn](https://www.linkedin.com/in/hasnain-khan-0ab3b2320)
