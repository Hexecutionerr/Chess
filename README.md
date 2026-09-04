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
- **Server-Side Move Validation** — All moves validated server-side to prevent cheating (server remains ultimate authority)
- **Phase 2 Legal Move Experience** — Complete dynamic visual feedback powered by `chess.js`:
  - **Selected Piece:** High-contrast illuminated square highlight with subtle inner glow
  - **Legal Empty Destinations:** Subtle circular dots with interactive hover scaling
  - **Legal Captures:** High-visibility capture rings framing enemy pieces (handles standard captures & en passant)
  - **Comprehensive Rules Respect:** Full support for Turn, Check, Checkmate, Absolute Pins, King Safety, Castling (O-O / O-O-O), En Passant, and Pawn Promotion
  - **Intuitive Interaction Flow:** Click to select, click again to deselect, click another own piece to switch selection instantly, click legal target to move, click illegal square for subtle feedback
- **Phase 3 Professional Chess Clocks** — Full server-authoritative time controls:
  - **Supported Formats:** `1+0`, `2+1` (Bullet), `3+0`, `3+2`, `5+0` (Blitz), `10+0`, `10+5`, `15+10` (Rapid), `30+0` (Classical)
  - **Immediate Turn Switching:** Clock switches immediately after each legal move with zero delay
  - **Server-Authoritative Timing:** High-precision millisecond tracking prevents client tampering or timer cheating
  - **Accurate Timeout Detection:** Server-side 100ms interval detects exact timeouts and awards wins or FIDE Article 6.9 insufficient material draws
  - **Move Increments:** Automatic addition of increment seconds (e.g. +1s, +2s, +5s, +10s) on move completion with floating badge animation
  - **Multi-Stage Low-Time Warnings:** Visual amber pulse (`< 30s`) and critical red glowing alert (`< 10s`)
  - **Sub-Second Precision Display:** Millisecond tenths display (`0:09.4`) under 20 seconds
  - **Disconnect / Reconnect Persistence:** Full clock snapshot synchronized immediately upon reconnecting
- **Phase 4 Move History & Interactive Review** — Comprehensive algebraic move notation with live position review:
  - **Move Numbers & Clean SAN Notation:** Clean numbered 2-column table (`1. e4 e5`, `2. Nf3 Nc6`) with complete Standard Algebraic Notation including check (`+`), checkmate (`#`), promotion (`=Q`), and castling (`O-O`, `O-O-O`)
  - **Interactive Board Scrubbing:** Click any past move cell to instantly display that exact historical board position
  - **Navigation Toolbar & Hotkeys:** Step forward/backward through moves using navigation buttons (`<<`, `<`, `>`, `>>`, `LIVE`) or keyboard arrows (`←`, `→`, `↑`, `↓`)
  - **Floating Review Banner:** Prominent on-board status badge showing current historical move with one-click return to live
  - **Non-Breaking Live Gameplay:** Background live match synchronization continues uninterrupted during position review; clicking any piece or clicking "LIVE" snaps back to live game instantly
  - **Auto-Scrolling:** Moves table automatically scrolls to keep active or viewed moves in view
- **Phase 5 Professional Game Controls & Confirmation Dialogs** — Complete match lifecycle controls:
  - **Offer, Accept & Decline Draw:** Full mutual consent protocol; opponent receives a styled prompt modal (`"Your opponent offered a draw"`) with Accept and Decline actions
  - **Resign Confirmation Dialog:** Protected surrender flow prompting `"Are you sure you want to resign?"` with explicit forfeit warning
  - **Leave Game & Abandonment Detection:** Allows players to vacate seats to spectate; warns and records forfeit if leaving an active match
  - **Rematch with Automatic Color Swapping:** Post-game rematch request protocol; accepting automatically swaps player colors (`White ⇄ Black`) per tournament standards
  - **Active-Match Reset Safeguards:** Starting a new game while moves are active triggers confirmation dialog to prevent accidental wipes
  - **Game-State-Enforced Actions:** Dynamic client and server validation automatically disables invalid actions based on game phase, turn, seated status, and move count
- **Phase 6 Captured Pieces & Material Advantage** — Real-time piece differential and material balance:
  - **Dual Captured Piece Trays:** Displays captured SVG pieces for both White and Black across player strips and match status summary
  - **Standard Piece Sorting:** Ordered by standard piece values (`♟ Pawns`, `♞ Knights`, `♝ Bishops`, `♜ Rooks`, `♛ Queens`)
  - **Material Lead Differential:** Subtle, clean real-time advantage badge (`+1`, `+2`, `+5`, etc.) showing exact point lead
  - **Historical Scrubber Synchronization:** Dynamically recalculates captured pieces and material lead when scrubbing through historical moves
- **Phase 9 Game Lobby & Real-Time Matchmaking System** — Complete homepage experience replacing direct board drop-in:
  - **Lobby Homepage:** Dedicated `#lobbyView` showcasing platform statistics, quick-action cards, and real-time game mode launchers
  - **Play Online with Grouped Time Controls:**
    - **BULLET:** `1+0` (Ultra Bullet), `2+1` (Bullet with Increment)
    - **BLITZ:** `3+0` (Super Blitz), `3+2` (Blitz Tournament Standard), `5+0` (Classic Blitz)
    - **RAPID:** `10+0` (Rapid Championship), `10+5` (Rapid with Increment)
    - **CLASSICAL:** `30+0` (Standard Classical)
  - **FIND OPPONENT Action & Radar Matchmaking State:**
    - Dedicated matchmaking modal featuring animated pulsating radar concentric circles
    - Real-time search stopwatch (`Searching for opponent... 00:12`)
    - One-click `[ Cancel ]` button to gracefully withdraw from the matchmaking queue
  - **Interactive Lobby Mode Suite:**
    - **Play with Friend / Create Game:** Shareable room code and one-click clipboard invite link generator
    - **Join Game:** Room ID / private code entry dialog
    - **Play vs Computer:** Bot challenge selector with Easy, Intermediate, and Master difficulties
    - **Puzzles:** Tactical puzzles module with rating progression
    - **Game History:** Match review archive with outcomes, dates, and PGN export
    - **Profile:** Comprehensive stats card with Blitz/Rapid/Bullet ratings, win rates, and achievements
  - **Seamless View Switching & Active Match Indicator:**
    - Instant switching between `#lobbyView` and `#gameView` without page reload or socket disruption
    - Persistent glowing **"Active Match ➔"** navbar button allowing players to browse the lobby and return to ongoing games at any time
- **Phase 10 Private Games & Anti-Interference Security** — Complete private room and friend match architecture:
  - **Create Game Flow:**
    - Time Control & Preferred Color selection (White / Black / Random)
    - Generates unique Game ID (`ARENA-XXXX`) and direct invite link (`http://localhost:3000/?game=ARENA-XXXX`)
    - Modal presents:
      ```
      Game created.
      Share with your friend:
      [ COPY INVITE LINK ]
      ```
    - Live waiting indicator: `Waiting for your friend to join...`
  - **Friend Joins & Correct Role Assignment:**
    - Friend joins via direct link or code entry in **Join Game** modal
    - Creator & Friend assigned correctly (e.g. Creator = White, Friend = Black)
    - Automatically launches match and alerts both players: `Friend connected! Match starting.`
  - **Unauthorized Spectator & Player Interference Protection:**
    - Any 3rd+ visitor joining the private game is placed into **Spectator Mode**
    - Spectators are completely blocked from piece movements, drag-and-drop, resigning, draw offers, and resetting clocks
    - Explicit server-side validation strictly verifies socket identity against seated players, returning `unauthorizedAction` on any illicit action
    - Active game banner displays private room code, one-click copy button, and `👁️ Spectator Mode` status badge
- **Pawn Promotion** — Automatic queen promotion on reaching the opposite rank
- **Game-Over Detection** — Checkmate, stalemate, timeout, resignation, threefold repetition, insufficient material, 50-move rule
- **Board Flip** — On-demand perspective toggle for analysis or spectator convenience

### 🌐 Real-Time Multiplayer & Social
- **WebSocket Architecture** — Instant synchronization via Socket.IO
- **Live In-Game Chat** — Real-time communication channel with role badges and system activity logs
- **Dynamic Role Assignment** — 1st player = White, 2nd = Black, 3rd+ = Spectators
- **Player Disconnect Handling** — Seats freed automatically on disconnect with chat announcements
- **Live Board Sync** — Spectators and reconnecting players receive current game state and move history immediately

### 🎨 Professional UI & Complete Layout
- **Brand Navbar** — Platform header featuring Play, Puzzles, Learn, Watch, and User Profile menu with rating badges
- **Dual Player Strips** — Opponent & Player cards with avatars, ratings, online indicators, and active turn pulses
- **Live Chess Clocks** — High-legibility monospaced digital timers with active glowing states
- **Material Evaluation & Captured Trays** — Visual trays of captured pieces with real-time material lead calculations (+1, +2, etc.)
- **Comprehensive 12 Game States & UI Representations** — Real-time state machine supporting `WAITING`, `STARTING`, `ACTIVE`, `CHECK`, `CHECKMATE`, `DRAW`, `STALEMATE`, `TIMEOUT`, `RESIGNED`, `ABORTED`, `DISCONNECTED`, and `FINISHED`
- **Production Real-Time Reconnection (Phase 8)** — Persistent session-based reconnection (`localStorage` token + socket auth), preserving player roles, board state, authoritative clocks, and active games with zero duplication or resets
- **Dynamic Game Over Modal & Action Flow** — Result header (`YOU WON! 🏆` / `YOU LOST` / `DRAW 🤝` / `GAME ABORTED 🚫`), game details, Rematch, New Game, Review Board, and Leave Seat actions
- **Algebraic Move Notation Panel** — Two-column moves table (`#`, `White`, `Black`) with active-move highlighting, history navigation buttons, and auto-scroll
- **Action Control Toolbar** — Integrated Draw, Resign, Flip, and New Game controls
- **SVG Chess Pieces** — High-quality cburnett piece set with smooth drag-and-drop & click-to-move
- **Highlights & Indicators** — Last-move highlight, check glow, legal move dots, and capture target rings
- **Sound Effects & Haptics** — Move, capture, and notification audio feedback
- **Responsive Layout** — Desktop 2-column split with responsive folding for smaller screens

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
│   │   └── styles.css          # Design system — tokens, board, layout, history nav, modal, responsive
│   ├── img/
│   │   └── pieces/             # 12 SVG chess pieces (wP, wR, wN, wB, wQ, wK, bP, bR, bN, bB, bQ, bK)
│   ├── js/
│   │   ├── chess-shim.js       # CJS-to-browser shim for chess.js
│   │   └── chessgame.js        # Client game engine — rendering, history scrubber, sockets, sounds, UI
│   └── sounds/
│       ├── Move.mp3            # Piece movement sound
│       ├── Capture.mp3         # Piece capture sound
│       └── GenericNotify.mp3   # Game event notification sound
├── views/
│   └── index.ejs               # Main page — header, player bars, board, history panel, controls, modal
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
git clone https://github.com/Hexecutionerr/Chess.git
cd Chess
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
Client → Server                   Server → Client
─────────────────                 ─────────────────
move {from, to, promotion}        playerRole ("w"/"b")
resign                            spectatorRole
offerDraw / acceptDraw            gameState {fen, turn, isCheck, history, players, clocks}
offerRematch / acceptRematch      playersUpdate {white, black}
leaveGame                         move {from, to, san, captured, clocks, increment}
newGame                           playerDisconnected {role, roleName}
setTimeControl                    playerReconnected {role, roleName}
identify {sessionToken}           reconnected {role, roleName}
findMatch {timeControl, token}    matchmakingStarted {timeControl, label}
cancelMatchmaking                 matchmakingCancelled
createPrivateGame {tc, color}     privateGameCreated {roomId, inviteUrl, role, tc}
joinPrivateGame {roomId, token}   privateGameJoined {roomId, role, isSpectator}
                                  privateGameReady {roomId, message, timeControl}
                                  privateGameError {message}
                                  unauthorizedAction {message}
                                  matchFound {role, opponent, timeControl}
                                  gameOver {type, winner, message}
                                  newGame {fen, turn, ...}
```

---

## 🗺️ Roadmap

| Phase | Features | Status |
|-------|----------|--------|
| **Phase 1** | Professional UI, Complete Desktop Layout (Navbar, Clocks, Moves, Captured, Chat, Controls) | ✅ Complete |
| **Phase 2** | Chess Move Experience (Dynamic Legal Moves, Selection Switching, Dots, Rings, Pins, Castling, En Passant) | ✅ Complete |
| **Phase 3** | Professional Chess Clocks (1+0 to 30+0, Increments, Server Authority, Anti-Cheat, Sub-Second Decimals, Timeout Detection) | ✅ Complete |
| **Phase 4** | Professional Move History (SAN Notation, Historical Position Review, Navigation Toolbar, Keyboard Controls, Non-Breaking Live Gameplay) | ✅ Complete |
| **Phase 5** | Professional Game Controls (Offer/Accept/Decline Draw, Resign Modal, Leave Game Forfeit, Rematch with Color Swap, Reset Safeguards) | ✅ Complete |
| **Phase 6** | Captured Pieces & Material Advantage (Visual Piece Trays, Subtle Differential +1/+2, Historical Scrubber Sync) | ✅ Complete |
| **Phase 7** | Comprehensive Game States (Waiting, Starting, Active, Check, Checkmate, Draw, Stalemate, Timeout, Resigned, Aborted, Disconnected, Finished) | ✅ Complete |
| **Phase 8** | Real-Time Reconnection (Persistent Session Tokens, Preserved Game State & Clocks, Resynchronization, Anti-Duplicate Architecture) | ✅ Complete |
| **Phase 9** | Game Lobby & Matchmaking (Homepage Lobby, Time Control Selectors, Radar Search, Friendly Games, Puzzles, History, Profile) | ✅ Complete |
| **Phase 10** | Private Games & Anti-Interference (Create Game, Shareable Invite Link, Join Game, Correct Roles, Spectator Lockout) | ✅ Complete |
| **Phase 11** | ELO ratings, leaderboards, player profiles | 📋 Planned |
| **Phase 12** | AI opponent (Stockfish), game review, analysis board | 📋 Planned |

---

## 👨‍💻 Author

**Hasnain Khan**  
*Lead Developer & Architect*

- [GitHub](https://github.com/Hexecutionerr)
- [LinkedIn](https://www.linkedin.com/in/hasnain-khan-0ab3b2320)
