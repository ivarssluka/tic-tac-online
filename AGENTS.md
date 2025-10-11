# AGENTS.md — Make This Tic‑Tac‑Toe Multiplayer With Lobbies (and No Progress Lost on Refresh)

This guide turns your current single‑page Tic‑Tac‑Toe into an **online multiplayer** game with **lobbies/rooms** and **state persistence** on refresh. It keeps your neon UI and most of your existing code, and adds a tiny Node.js + Socket.IO backend.

---

## Overview

- **Frontend:** Your existing `index.html`, `styles.css`, `script.js` served as static files.
- **Backend:** A small `server.js` with [Express](https://expressjs.com/) + [Socket.IO](https://socket.io/).
- **Transport:** WebSockets for real‑time updates, rooms for lobbies.
- **Persistence on refresh:** The server is the source of truth for each room. When a player refreshes, the client re‑joins the room and asks the server for the latest room state.

> You’ll be able to host on Render/Railway/Fly.io/Heroku‑like platforms (server) and Netlify/Vercel/GitHub Pages (static) — or just deploy **both** on Render/Railway for simplicity.

---

## 1) Add the Backend

Create a new file at the project root: **`server.js`**

```js
// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// --- Serve static files (optional if you deploy client separately) ---
app.use(express.static(path.join(__dirname)));

// --- In-memory room store ---
// Structure: rooms[lobbyId] = { board: Array(9).fill(null), currentPlayer: "X"/"O",
//   isActive: true, mode: "pvp-online", stats: {...}, players: Set(socketId), createdAt: Date.now() }
const rooms = Object.create(null);

function newRoomState() {
  return {
    board: Array(9).fill(null),
    currentPlayer: "X",
    isActive: true,
    stats: {
      xWins: 0,
      oWins: 0,
      draws: 0,
      totalGames: 0,
    },
    createdAt: Date.now(),
  };
}

function getRoom(lobbyId) {
  if (!rooms[lobbyId]) rooms[lobbyId] = { ...newRoomState(), players: new Set() };
  return rooms[lobbyId];
}

function checkWinner(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

io.on("connection", (socket) => {
  // Client asks to join a lobby (create if missing)
  socket.on("joinLobby", ({ lobbyId, requestedMark }) => {
    lobbyId = (lobbyId || "").trim();
    if (!lobbyId) return socket.emit("errorMsg", "Lobby ID required.");

    const room = getRoom(lobbyId);
    socket.join(lobbyId);
    room.players.add(socket.id);

    // Assign marks: first player gets X, second gets O
    let assignedMark = "X";
    const socketsInRoom = io.sockets.adapter.rooms.get(lobbyId) || new Set();
    if (socketsInRoom.size >= 2) assignedMark = "O";
    if (requestedMark && (requestedMark === "X" || requestedMark === "O")) {
      assignedMark = requestedMark;
    }

    socket.data.lobbyId = lobbyId;
    socket.data.mark = assignedMark;

    // Send current room state to the new client
    socket.emit("roomState", { ...room, yourMark: assignedMark, lobbyId });
    // Notify others someone joined
    socket.to(lobbyId).emit("playerJoined", { playerId: socket.id });

    // Optional: cap to 2 players
    if ((io.sockets.adapter.rooms.get(lobbyId) || new Set()).size > 2) {
      socket.emit("errorMsg", "Room is full (2 players). Spectators not allowed.");
    }
  });

  // A player attempts a move
  socket.on("makeMove", ({ index }) => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) return;
    const room = getRoom(lobbyId);
    if (!room.isActive) return;

    const mark = socket.data.mark; // "X" or "O"
    if (!Number.isInteger(index) || index < 0 || index > 8) return;
    if (room.board[index]) return; // already filled

    // Enforce turn order
    if (room.currentPlayer !== mark) return;

    room.board[index] = mark;

    const winner = checkWinner(room.board);
    const isDraw = room.board.every((c) => c !== null) && !winner;

    if (winner) {
      room.isActive = false;
      if (winner === "X") room.stats.xWins += 1;
      else room.stats.oWins += 1;
      room.stats.totalGames += 1;
    } else if (isDraw) {
      room.isActive = false;
      room.stats.draws += 1;
      room.stats.totalGames += 1;
    } else {
      room.currentPlayer = mark === "X" ? "O" : "X";
    }

    io.to(lobbyId).emit("roomState", { ...room });
  });

  // Start a fresh game in the same lobby (keep stats)
  socket.on("newGame", () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) return;
    const room = getRoom(lobbyId);
    room.board = Array(9).fill(null);
    room.currentPlayer = "X";
    room.isActive = true;
    io.to(lobbyId).emit("roomState", { ...room });
  });

  // Reset stats (host-only in real projects; here anyone can)
  socket.on("resetStats", () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) return;
    const room = getRoom(lobbyId);
    room.stats = { xWins: 0, oWins: 0, draws: 0, totalGames: 0 };
    io.to(lobbyId).emit("roomState", { ...room });
  });

  socket.on("disconnect", () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId || !rooms[lobbyId]) return;
    rooms[lobbyId].players.delete(socket.id);
    // Auto‑cleanup empty rooms after a while
    if ((io.sockets.adapter.rooms.get(lobbyId) || new Set()).size === 0) {
      setTimeout(() => {
        const stillEmpty = !(io.sockets.adapter.rooms.get(lobbyId) || new Set()).size;
        if (stillEmpty) delete rooms[lobbyId];
      }, 60_000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));
```

Create a **`package.json`**:

```json
{
  "name": "tictactoe-mp",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  }
}
```

Install dependencies:

```bash
npm install
```

---

## 2) Wire the Frontend to the Lobby/Server

### 2.1 Add Socket.IO client (in `index.html`)

Add this before your `script.js`:
```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js" crossorigin="anonymous"></script>
```

Add a simple lobby join UI (just above the board or in the header):

```html
<div class="lobby-bar">
  <input id="lobbyIdInput" placeholder="Lobby ID (e.g., 1234 or friends-room)">
  <button class="btn" id="joinLobbyBtn">Join Lobby</button>
  <span id="yourMark"></span>
</div>
```

> Keep your existing buttons and layout. The online mode will ignore the computer AI.

### 2.2 Update `styles.css` (optional)

Add a tiny style to align the lobby bar (or reuse your existing button styles):

```css
.lobby-bar {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  margin: 10px 0 20px;
}
.lobby-bar input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 2px solid #00ffff;
  background: #0a0a0a;
  color: #00ffff;
  font-family: inherit;
}
```

### 2.3 Patch `script.js` for Online PvP

Keep your UI logic and animations, but add an **online mode** that:
- Joins a lobby,
- Renders the board from server state,
- Emits moves, and
- Disables the local AI when in online mode.

Add at the top of `script.js`:
```js
// Multiplayer wiring
let socket = null;
let onlineMode = false;
let currentLobbyId = null;
let myMark = null;
```

Add helpers near your existing board functions:
```js
function renderFromRoomState(room) {
  // Apply board
  for (let i = 0; i < 9; i++) {
    currentGameBoard[i] = room.board[i];
    const cell = gameBoard.children[i];
    cell.innerHTML = "";
    if (currentGameBoard[i]) {
      const mark = document.createElement("span");
      mark.classList.add("mark");
      mark.textContent = currentGameBoard[i];
      cell.appendChild(mark);
    }
  }
  // Status
  isGameCurrentlyActive = room.isActive;
  currentPlayer = room.currentPlayer;
  // Stats
  if (gameMode === "pvp") {
    player1Wins.textContent = room.stats.xWins;
    player2Wins.textContent = room.stats.oWins;
    draws.textContent = room.stats.draws;
    totalGames.textContent = room.stats.totalGames;
  }
  // Labels
  gameStatus.textContent = room.isActive
    ? (room.currentPlayer === myMark ? "Your turn!" : "Opponent's turn...")
    : "Game over — start a New Game";
}
```

Join logic (run when clicking **Join Lobby**):
```js
function joinLobby(lobbyId) {
  if (!socket) socket = io(); // from the CDN script
  currentLobbyId = lobbyId;
  onlineMode = true;
  gameMode = "pvp"; // online is always PvP
  updateStatLabels();
  updateStatistics();
  creategameBoard(); // build 9 cells if not present

  socket.off(); // clear old listeners
  socket.emit("joinLobby", { lobbyId });

  socket.on("roomState", (room) => {
    myMark = room.yourMark || myMark;
    const ym = document.getElementById("yourMark");
    if (ym && myMark) ym.textContent = `Your mark: ${myMark}`;
    renderFromRoomState(room);
    // Prevent local clicks if it's not our turn
    if (room.currentPlayer === myMark && room.isActive) enablePlayerClicks();
    else disablePlayerClicks();
  });

  socket.on("playerJoined", () => {
    // Could show a toast
  });

  socket.on("errorMsg", (msg) => {
    alert(msg);
  });
}
```

Hook your lobby bar button (put this near your existing listeners):
```js
const joinLobbyBtn = document.getElementById("joinLobbyBtn");
const lobbyIdInput = document.getElementById("lobbyIdInput");
if (joinLobbyBtn && lobbyIdInput) {
  joinLobbyBtn.addEventListener("click", () => {
    const id = lobbyIdInput.value.trim();
    if (id) joinLobby(id);
  });
}
```

Modify your click handler to emit moves when `onlineMode` is true. Inside `handlePlayerMove` **replace** the part where you write to `currentGameBoard` directly with:

```js
if (onlineMode) {
  // In online mode, only act on our turn and let server validate
  if (currentPlayer !== myMark) return;
  socket.emit("makeMove", { index: Number(index) });
  // Let server broadcast the authoritative state; do not mutate locally here
  return;
}

// offline (existing single‑device logic) continues below...
```

Wire your **New Game** and **Reset Stats** buttons to the server when online:
```js
newGameBtn.addEventListener("click", () => {
  if (onlineMode && socket && currentLobbyId) {
    socket.emit("newGame");
  } else {
    creategameBoard();
  }
});

resetStatsBtn.addEventListener("click", () => {
  if (onlineMode && socket && currentLobbyId) {
    socket.emit("resetStats");
  } else {
    gameStatistics = { player:0, computer:0, playerX:0, playerO:0, draws:0, totalGames:0 };
    updateStatistics();
  }
});
```

Finally, disable the AI when online:
```js
// At the top of handleComputerMove, early‑return in online mode
function handleComputerMove() {
  if (onlineMode) return;
  // ...existing AI code...
}
```

> **Refresh Persistence:** After a browser refresh, the player hits **Join Lobby** again with the same lobby ID. The server still holds the latest state for that lobby and will send it back immediately via `roomState`. You can auto‑remember the last lobby ID in `localStorage` and auto‑rejoin on load for an even smoother UX.

Example auto‑remember:
```js
// Save on successful join
localStorage.setItem("lastLobbyId", currentLobbyId);

// On page load
const last = localStorage.getItem("lastLobbyId");
if (last) {
  // optionally prefill the input:
  const inp = document.getElementById("lobbyIdInput");
  if (inp) inp.value = last;
  // auto‑join:
  // joinLobby(last);
}
```

---

## 3) Run Locally

```bash
# Terminal 1 — start the server
npm start

# Terminal 2 — serve the static files (optional if server.js serves them)
# You can also open index.html directly; but CORS is simpler if you let server.js serve it.
# If serving via server.js, open http://localhost:3000
```

> If you host the static site separately (e.g., Netlify), change `socket = io("https://YOUR-SERVER-URL")` to point to your deployed server.

---

## 4) Deploy

### Option A — Deploy both (server + static) on the same host (simple)

- Push this repo to GitHub.
- On **Railway** or **Render**, create a new service from your repo.
- Set the **Start Command** to `node server.js` (or use the `start` script).
- Ensure a **PORT** env is provided by the platform (most do).
- Access the provided URL — it will serve your `index.html` and the WebSocket server at the same origin. No extra CORS or client changes needed.

### Option B — Split hosting

- **Server:** Deploy `server.js` to Render/Railway/Fly.io/Heroku‑like. Note the URL, e.g. `https://ttt-server.onrender.com`.
- **Client:** Deploy the static files to Netlify/Vercel/GitHub Pages.
- In `script.js` change `socket = io("https://ttt-server.onrender.com")` so the client can reach your server.

> If using Vercel for static hosting, **do not** try to run Socket.IO serverless; keep the WebSocket server on a service that supports long‑lived connections (Render/Railway/Fly).

---

## 5) Optional Enhancements

- **Room locks/host controls:** Track the first socket as “host” and only allow host to `resetStats` or `newGame`.
- **Spectators:** Allow >2 connections to the room in read‑only mode.
- **Invite links & QR:** `?lobby=ROOMID` to prefill/auto‑join.
- **Anti‑cheat:** Server already validates turn order; you can also ignore impossible moves.
- **Persistence across server restarts:** Replace in‑memory `rooms` with Redis or a small database. The API doesn’t change.
- **Rematch flow:** When a game ends, show a “Rematch” button that just emits `newGame`.

---

## 6) Minimal Client Diff Summary

- Add Socket.IO client script tag.
- Add lobby bar (`#lobbyIdInput`, `#joinLobbyBtn`, `#yourMark`).
- Add `joinLobby()`, `renderFromRoomState()`, and wire buttons/events to emit or consume Socket.IO messages.
- Gate AI and local mutations behind `onlineMode` checks.
- (Optional) Save/restore last lobby in `localStorage` for instant recovery after refresh.

That’s it — you’ll have global lobbies, real‑time play, and **no lost progress** on refresh.
