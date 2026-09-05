# ♟️ ChessArena

### Real-Time Multiplayer Chess Platform

<p align="center">
  <strong>A production-style, real-time multiplayer chess platform built for competitive online gameplay.</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## 🚀 Overview

**ChessArena** is a full-stack real-time chess platform designed to deliver the experience of a modern online chess application.

It combines a **server-authoritative chess engine**, **real-time multiplayer networking**, **persistent game storage**, **Elo-based competitive ratings**, **private matchmaking**, **spectator mode**, **game history**, **leaderboards**, and a polished responsive interface.

Unlike a basic chess demo, ChessArena focuses on the engineering challenges behind a real multiplayer game:

* ⚡ Real-time state synchronization
* 🔐 Server-side move and action validation
* ⏱️ Server-authoritative chess clocks
* 🔄 Reconnection and session persistence
* 🎯 Matchmaking and private rooms
* 💾 Persistent game history
* 📊 Elo rating calculations
* 🏆 Competitive leaderboards
* 💬 Secure real-time game chat
* 👁️ Spectator mode and access control

> **Goal:** Build a chess platform that feels like a real product rather than a classroom demonstration.

---

## 📸 Screenshots

<p align="center">
  <img src="screenshots/board-white.png" alt="ChessArena White Player View" width="850">
</p>

<p align="center">
  <em>Live multiplayer board with professional pieces, clocks, move history and game controls.</em>
</p>

<br>

<p align="center">
  <img src="screenshots/gameplay.png" alt="ChessArena Black Player View" width="850">
</p>

<p align="center">
  <em>Black-player perspective with automatic board orientation and synchronized game state.</em>
</p>

---

# ✨ Key Features

## ♟️ Complete Chess Experience

ChessArena uses `chess.js` as the core rules engine while maintaining authoritative game state on the server.

### Move System

* Full legal chess move validation
* Server-authoritative move verification
* Click-to-move interaction
* Drag-and-drop support
* Legal move indicators
* Capture indicators
* Last-move highlighting
* Check highlighting
* Automatic pawn promotion
* Board orientation switching

### Supported Chess Rules

* Castling — `O-O` / `O-O-O`
* En passant
* Pawn promotion
* Check
* Checkmate
* Stalemate
* Threefold repetition
* Fifty-move rule
* Insufficient material
* Absolute pins
* King safety

---

# ⏱️ Professional Chess Clocks

ChessArena implements **server-authoritative chess clocks** to prevent client-side timer manipulation.

### Supported Time Controls

| Category      | Time Controls           |
| ------------- | ----------------------- |
| 🚅 Bullet     | `1+0`, `2+1`            |
| ⚡ Blitz       | `3+0`, `3+2`, `5+0`     |
| ⏱️ Rapid      | `10+0`, `10+5`, `15+10` |
| 🏛️ Classical | `30+0`                  |

### Clock System

* Millisecond-precision server timing
* Immediate turn switching
* Increment support
* Automatic timeout detection
* Insufficient-material timeout handling
* Low-time warnings
* Critical-time alerts
* Sub-second display under 20 seconds
* Clock persistence across reconnections

> The client displays the clock — **the server owns the clock.**

---

# 🎯 Interactive Move Review

ChessArena provides a complete post-move analysis experience.

### Move History

* Standard Algebraic Notation (SAN)
* Move numbering
* Check / checkmate notation
* Castling notation
* Promotion notation
* Capture information

### Historical Board Scrubbing

Players can:

* Jump to any previous move
* Navigate backward and forward
* Use keyboard arrow controls
* Return instantly to the live position
* Review historical positions without interrupting the active game

### Navigation

```text
<<   <   >   >>   LIVE
```

Keyboard shortcuts:

```text
← / ↓   Previous move
→ / ↑   Next move
```

Live gameplay continues independently while reviewing previous positions.

---

# 🎮 Match Lifecycle

ChessArena implements a complete multiplayer game lifecycle.

```text
LOBBY
  │
  ├── Find Opponent
  ├── Create Private Game
  ├── Join Game
  └── Play vs Computer
          │
          ▼
      WAITING
          │
          ▼
      STARTING
          │
          ▼
       ACTIVE
          │
     ┌────┼───────────────┐
     ▼    ▼               ▼
 CHECK  DRAW          DISCONNECTED
     │    │               │
     ▼    ▼               ▼
 CHECKMATE              RECONNECT
     │                    │
     └────────┬───────────┘
              ▼
          FINISHED
              │
        ┌─────┴─────┐
        ▼           ▼
     REMATCH      REVIEW
```

Supported game states include:

`WAITING` • `STARTING` • `ACTIVE` • `CHECK` • `CHECKMATE` • `DRAW` • `STALEMATE` • `TIMEOUT` • `RESIGNED` • `ABORTED` • `DISCONNECTED` • `FINISHED`

---

# 🌐 Real-Time Multiplayer

Powered by **Socket.IO**, the platform synchronizes game state between players and spectators in real time.

### Player Roles

```text
Player #1 → White
Player #2 → Black
Player #3+ → Spectator
```

### Real-Time Synchronization

The server synchronizes:

* Board state
* Player roles
* Moves
* Clocks
* Game status
* Captured pieces
* Draw offers
* Rematch requests
* Disconnect/reconnect events
* Chat messages
* Rating updates

---

# 🔐 Security & Server Authority

Security is treated as a core architectural requirement.

### Server-Side Validation

The server validates:

* Legal chess moves
* Player identity
* Player role
* Current turn
* Game state
* Draw actions
* Resignation
* Rematch requests
* Private-room access
* Clock state
* Chat sender identity

### Anti-Interference Protection

Private games support strict role enforcement:

```text
Creator ───────────► Player
Friend ────────────► Player
3rd+ Connection ───► Spectator
```

Spectators cannot:

* Move pieces
* Resign
* Offer draws
* Reset games
* Manipulate clocks
* Perform player-only actions

Unauthorized requests are rejected server-side.

---

# 🔄 Reconnection System

Players can reconnect to an active match without losing their game session.

### Session Flow

```text
Browser
   │
   ├── sessionToken
   │
   ▼
Socket.IO Authentication
   │
   ▼
Server Session Lookup
   │
   ▼
Restore Player Role
   │
   ▼
Restore Game State
   │
   ▼
Restore Clock Snapshot
   │
   ▼
Resume Match
```

This prevents accidental game resets caused by temporary network interruptions or browser reconnections.

---

# 🏠 Game Lobby

The platform provides a dedicated lobby instead of dropping players directly into a board.

### Lobby Modules

* 🎮 Play Online
* 🤝 Play with Friend
* 🔑 Join Private Game
* 🤖 Play vs Computer
* 🧩 Puzzles
* 📜 Game History
* 👤 Player Profile
* 🏆 Leaderboard

### Online Matchmaking

Players can search for opponents using predefined time controls.

```text
FIND OPPONENT
      │
      ▼
Matchmaking Queue
      │
      ▼
Real-Time Search
      │
      ▼
Opponent Found
      │
      ▼
Match Created
      │
      ▼
Game Starts
```

A radar-style matchmaking interface provides visual feedback while searching.

---

# 🔗 Private Games

Players can create invite-only games using unique room IDs.

Example:

```text
ARENA-9264
```

Private games support:

* Time-control selection
* Preferred color
* Random color
* Shareable invite links
* Room-code joining
* Automatic player assignment
* Spectator protection

Example invite:

```text
/?game=ARENA-9264
```

---

# 💬 Real-Time Game Chat

ChessArena includes an in-game communication system.

### Features

* Real-time Socket.IO messaging
* Verified sender identity
* Message timestamps
* Quick sportsmanship messages
* Duplicate suppression
* Message normalization
* Flood protection
* Rate limiting

### Quick Messages

```text
🍀 Good luck!
🎉 Have fun!
👏 Well played!
🤝 Thanks!
```

### Anti-Spam

The server applies sliding-window rate limiting and cooldown protection to prevent chat flooding.

---

# ♟️ Captured Pieces & Material Evaluation

The interface provides real-time material information.

### Captured Piece Trays

Captured pieces are displayed using the same SVG piece system as the board.

### Material Advantage

Standard piece values are used:

```text
Pawn    = 1
Knight  = 3
Bishop  = 3
Rook    = 5
Queen   = 9
```

Example:

```text
White: +5
```

The material evaluation is synchronized with historical board positions during game review.

---

# 👤 Player Profiles

Players have dedicated profiles containing competitive statistics.

### Rating Categories

```text
🚅 Bullet
⚡ Blitz
⏱️ Rapid
🏛️ Classical
```

Each category maintains an independent rating pool.

### Profile Statistics

* Current rating
* Peak rating
* Games played
* Wins
* Losses
* Draws
* Win rate
* Current streak
* Recent games
* Rating progression

### Rating History

A vector-based rating progression chart visualizes rating changes across competitive games.

---

# 📊 Elo Rating Engine

ChessArena implements a category-based Elo rating system.

### Formula

```text
E = 1 / (1 + 10^((Rb - Ra) / 400))
```

Rating update:

```text
New Rating = Old Rating + K × (Actual Score − Expected Score)
```

Current implementation uses:

```text
K = 32
```

### Supported Outcomes

```text
Win  → 1.0
Draw → 0.5
Loss → 0.0
```

### Rating Isolation

Each category has its own rating:

```text
Bullet
   │
   └── Independent Rating

Blitz
   │
   └── Independent Rating

Rapid
   │
   └── Independent Rating

Classical
   │
   └── Independent Rating
```

Casual, aborted, invalid, and insufficiently played games are prevented from affecting competitive ratings.

---

# 🏆 Global Leaderboards

ChessArena includes competitive ranking ladders.

### Categories

* Bullet
* Blitz
* Rapid
* Classical

### Timeframes

* 🌎 Global
* 📅 Weekly
* 🗓️ Monthly

### Ranking Interface

```text
┌──────┬──────────────┬────────┬──────────┐
│ Rank │ Player       │ Rating │ Win Rate │
├──────┼──────────────┼────────┼──────────┤
│  #1  │ Player One   │ 2145   │ 68.4%    │
│  #2  │ Player Two   │ 2098   │ 65.1%    │
│  #3  │ Player Three │ 2057   │ 63.7%    │
└──────┴──────────────┴────────┴──────────┘
```

Includes:

* Top-3 podium
* Player ranking
* Rating
* Games played
* Win rate
* Personal standing
* Scroll-to-rank interaction

---

# 💾 Game Persistence

MongoDB provides persistent storage for active and completed matches.

### Game Data

A match stores information such as:

```text
gameId
whitePlayer
blackPlayer
spectators
timeControl
initialTime
increment
moves
PGN
result
status
winner
startTime
endTime
createdAt
```

### Move Storage

Instead of storing unnecessary full-board snapshots after every move, the system keeps compact move information and authoritative PGN data.

### Database Indexing

Indexes are used for common query patterns including:

* Game ID lookup
* Recent games
* Player history
* Game status
* Time-control filtering

---

# 🔌 REST API

ChessArena exposes REST endpoints for persistent game and player data.

### Games

```http
GET /api/games
GET /api/games/:gameId
```

Supported filtering includes:

```text
limit
status
timeControl
username
```

### Players

```http
GET /api/players/:identifier
```

Supports lookup using player identifiers such as username or session token.

### Ratings

```http
POST /api/ratings/calculate
```

Used for Elo calculation and rating testing.

### Leaderboards

```http
GET /api/leaderboard
```

Supports:

```text
category
timeframe
limit
token
username
```

---

# 🏗️ Architecture

```text
                         ┌─────────────────────┐
                         │      Browser        │
                         │                     │
                         │  Chess UI           │
                         │  Board              │
                         │  Clocks             │
                         │  Move History       │
                         │  Chat               │
                         └──────────┬──────────┘
                                    │
                         HTTP / WebSocket
                                    │
                    ┌───────────────▼───────────────┐
                    │        Node.js Server         │
                    │                               │
                    │        Express.js             │
                    │        Socket.IO              │
                    │        Game Manager            │
                    │        Validation Layer        │
                    │        Clock Engine             │
                    │        Rating Engine            │
                    └───────────────┬───────────────┘
                                    │
                              Mongoose ODM
                                    │
                    ┌───────────────▼───────────────┐
                    │           MongoDB              │
                    │                               │
                    │  Games                        │
                    │  Players                      │
                    │  Ratings                      │
                    │  Match History                │
                    └───────────────────────────────┘
```

### Architectural Principle

> **The client renders the game. The server owns the game.**

This principle is applied to move validation, player permissions, game state, clocks, ratings, and sensitive multiplayer actions.

---

# 🛠️ Tech Stack

| Layer        | Technology                 |
| ------------ | -------------------------- |
| Runtime      | Node.js                    |
| Backend      | Express.js 5               |
| Real-Time    | Socket.IO 4.8              |
| Database     | MongoDB                    |
| ODM          | Mongoose 8                 |
| Chess Engine | Chess.js                   |
| Frontend     | HTML5, JavaScript          |
| Styling      | Vanilla CSS3               |
| Templates    | EJS                        |
| Chess Pieces | SVG / Cburnett             |
| Icons        | Font Awesome               |
| Audio        | Lichess-style chess sounds |

---

# 📁 Project Structure

```text
ChessArena/
│
├── public/
│   ├── css/
│   │   └── styles.css
│   │
│   ├── img/
│   │   └── pieces/
│   │       ├── wP.svg
│   │       ├── wR.svg
│   │       ├── wN.svg
│   │       ├── wB.svg
│   │       ├── wQ.svg
│   │       ├── wK.svg
│   │       ├── bP.svg
│   │       ├── bR.svg
│   │       ├── bN.svg
│   │       ├── bB.svg
│   │       ├── bQ.svg
│   │       └── bK.svg
│   │
│   ├── js/
│   │   ├── chess-shim.js
│   │   └── chessgame.js
│   │
│   └── sounds/
│       ├── Move.mp3
│       ├── Capture.mp3
│       └── GenericNotify.mp3
│
├── views/
│   └── index.ejs
│
├── screenshots/
│   ├── board-white.png
│   └── gameplay.png
│
├── app.js
├── package.json
└── README.md
```

---

# ⚡ Getting Started

## Prerequisites

Make sure you have:

* Node.js `16+`
* npm
* MongoDB / MongoDB Atlas

---

## Installation

```bash
git clone https://github.com/Hexecutionerr/Chess.git
cd Chess
npm install
```

---

## Environment Variables

Create a `.env` file:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
```

> Never commit `.env` or database credentials to GitHub.

---

## Run the Application

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

Open:

```text
http://localhost:3000
```

---

# 🎮 Multiplayer Testing

You can test multiplayer locally using multiple browser sessions.

### Player 1

```text
Browser Tab
     ↓
White
```

### Player 2

```text
Incognito / Separate Browser
     ↓
Black
```

### Player 3+

```text
Additional Browser Sessions
     ↓
Spectator
```

---

# 🔌 Socket.IO Event Architecture

### Client → Server

```text
move
resign
offerDraw
acceptDraw
offerRematch
acceptRematch
leaveGame
newGame
setTimeControl
identify
findMatch
cancelMatchmaking
createPrivateGame
joinPrivateGame
```

### Server → Client

```text
playerRole
spectatorRole
gameState
playersUpdate
move
ratingUpdate
playerDisconnected
playerReconnected
reconnected
matchmakingStarted
matchmakingCancelled
matchFound
privateGameCreated
privateGameJoined
privateGameReady
privateGameError
unauthorizedAction
gameOver
newGame
```

---

# 🗺️ Development Roadmap

| Phase | Module                               | Status |
| ----: | ------------------------------------ | :----: |
|    01 | Professional Chess UI                |    ✅   |
|    02 | Legal Move Experience                |    ✅   |
|    03 | Server-Authoritative Chess Clocks    |    ✅   |
|    04 | Move History & Position Review       |    ✅   |
|    05 | Game Controls & Confirmation Flows   |    ✅   |
|    06 | Captured Pieces & Material Advantage |    ✅   |
|    07 | Game State Machine                   |    ✅   |
|    08 | Reconnection & Session Persistence   |    ✅   |
|    09 | Lobby & Matchmaking                  |    ✅   |
|    10 | Private Games & Spectator Protection |    ✅   |
|    12 | Player Profiles                      |    ✅   |
|    13 | MongoDB Game Persistence             |    ✅   |
|    14 | Elo Rating Engine                    |    ✅   |
|    15 | Global Leaderboards                  |    ✅   |
|    16 | Real-Time Game Chat                  |    ✅   |
|    17 | Stockfish AI & Deep Game Analysis    |   📋   |

---

# 🔮 Future Improvements

Planned improvements include:

* 🤖 Stockfish-powered AI opponents
* 🧠 Computer difficulty levels
* 🔍 Engine-based game analysis
* 📈 Advanced accuracy metrics
* 🧩 Daily tactical puzzles
* 🎓 Chess learning modules
* 📺 Live game watching
* 🏟️ Tournaments
* 🔔 Notifications
* 🛡️ Advanced anti-cheat detection
* ☁️ Production cloud deployment
* 📱 Enhanced mobile experience

---

# 🧪 Engineering Highlights

ChessArena demonstrates practical implementation of:

```text
Real-Time Systems
        ↓
WebSocket Communication
        ↓
Authoritative Server State
        ↓
Concurrency & Synchronization
        ↓
Persistent Data Modeling
        ↓
Authentication / Authorization
        ↓
Competitive Rating Systems
        ↓
Scalable API Design
```

### Core Engineering Challenges Solved

**1. Multiplayer Synchronization**

Maintaining a consistent board state between players and spectators.

**2. Server Authority**

Preventing clients from directly controlling sensitive game state.

**3. Real-Time Clocks**

Keeping timers authoritative despite network latency and client manipulation.

**4. Reconnection**

Restoring an interrupted player's session without duplicating seats or resetting the game.

**5. Private Match Security**

Ensuring unauthorized clients cannot execute player-only actions.

**6. Persistent Competitive Data**

Separating game history, player profiles, ratings, and leaderboard queries efficiently.

---

# 📈 Project Status

### Current Status

**🟢 Production-Style MVP / Advanced Full-Stack Project**

The core multiplayer, matchmaking, private games, game persistence, rating, leaderboard, chat, and gameplay systems are implemented.

The next major milestone is integrating **Stockfish-based AI and deep game analysis**.

---

# 👨‍💻 Author

## Hasnain Khan

**Lead Developer & Architect**

Computer Engineering Student • Full-Stack Developer • Software Engineering Enthusiast

<p align="left">
  <a href="https://github.com/Hexecutionerr">
    <img src="https://img.shields.io/badge/GitHub-Hexecutionerr-black?style=for-the-badge&logo=github">
  </a>
  <a href="https://www.linkedin.com/in/hasnain-khan-0ab3b2320">
    <img src="https://img.shields.io/badge/LinkedIn-Hasnain%20Khan-blue?style=for-the-badge&logo=linkedin">
  </a>
</p>

---

# ⭐ If You Like This Project

If ChessArena helped you understand real-time multiplayer architecture, consider giving the repository a ⭐.

```text
♟️ Play
   ↓
⚡ Synchronize
   ↓
🔐 Validate
   ↓
💾 Persist
   ↓
📊 Rate
   ↓
🏆 Compete
```

**ChessArena — Where chess meets real-time engineering.**
