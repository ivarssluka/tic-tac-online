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
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of wins) {
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

    io.to(lobbyId).emit("roomState", { ...room, lobbyId });
  });

  // Start a fresh game in the same lobby (keep stats)
  socket.on("newGame", () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) return;
    const room = getRoom(lobbyId);
    room.board = Array(9).fill(null);
    room.currentPlayer = "X";
    room.isActive = true;
    io.to(lobbyId).emit("roomState", { ...room, lobbyId });
  });

  // Reset stats (host-only in real projects; here anyone can)
  socket.on("resetStats", () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) return;
    const room = getRoom(lobbyId);
    room.stats = { xWins: 0, oWins: 0, draws: 0, totalGames: 0 };
    io.to(lobbyId).emit("roomState", { ...room, lobbyId });
  });

  socket.on("disconnect", () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId || !rooms[lobbyId]) return;
    rooms[lobbyId].players.delete(socket.id);
    // Auto-cleanup empty rooms after a while
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
