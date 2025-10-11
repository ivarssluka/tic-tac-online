let gameMode = "pvc";
let currentPlayer = "X";
let computerStartsFirst = false;
let playerXStartsFirst = true;
let difficulty = "medium";

// Multiplayer wiring
let socket = null;
let onlineMode = false;
let currentLobbyId = null;
let myMark = null;

const toggleModeBtn = document.getElementById("toggleModeBtn");
const currentModeDisplay = document.getElementById("currentMode");
const difficultyBtn = document.getElementById("difficultyBtn");
const toggleStartBtn = document.getElementById("toggleStartBtn");

const gameBoard = document.getElementById("gameBoard");
const gameStatus = document.getElementById("gameStatus");
const player1Wins = document.getElementById("player1Wins");
const player2Wins = document.getElementById("player2Wins");
const player1Label = document.getElementById("player1Label");
const player2Label = document.getElementById("player2Label");
const draws = document.getElementById("draws");
const totalGames = document.getElementById("totalGames");
const newGameBtn = document.getElementById("newGameBtn");
const resetStatsBtn = document.getElementById("resetStatsBtn");
const joinLobbyBtn = document.getElementById("joinLobbyBtn");
const lobbyIdInput = document.getElementById("lobbyIdInput");
const yourMarkDisplay = document.getElementById("yourMark");

let currentGameBoard = Array(9).fill(null);
let isGameCurrentlyActive = true;
let isProcessingMove = false;

const winningCombinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let gameStatistics = {
  player: 0,
  computer: 0,
  playerX: 0,
  playerO: 0,
  draws: 0,
  totalGames: 0,
};

function enablePlayerClicks() {
  [...gameBoard.children].forEach((cell) => {
    cell.addEventListener("click", handlePlayerMove);
  });
}

function disablePlayerClicks() {
  [...gameBoard.children].forEach((cell) => {
    cell.removeEventListener("click", handlePlayerMove);
  });
}

function updateModeDisplay() {
  if (onlineMode && currentLobbyId) {
    currentModeDisplay.textContent = `Mode: Online PvP (Lobby ${currentLobbyId})`;
  } else if (gameMode === "pvp") {
    currentModeDisplay.textContent = "Mode: Player vs Player";
  } else {
    currentModeDisplay.textContent = "Mode: Player vs Computer";
  }

  if (difficultyBtn) {
    if (gameMode === "pvc" && !onlineMode) {
      difficultyBtn.style.display = "inline-block";
      difficultyBtn.disabled = false;
    } else {
      difficultyBtn.style.display = "none";
      difficultyBtn.disabled = true;
    }
  }

  if (toggleStartBtn) {
    toggleStartBtn.disabled = onlineMode;
  }

  if (toggleModeBtn) {
    toggleModeBtn.textContent =
      gameMode === "pvc" ? "Switch to PvP" : "Switch to PvC";
  }

  if (!onlineMode && yourMarkDisplay) {
    yourMarkDisplay.textContent = "";
  }
}

function toggleGameMode() {
  if (onlineMode) {
    leaveLobby();
  }

  if (gameMode === "pvc") {
    gameMode = "pvp";
  } else {
    gameMode = "pvc";
  }

  gameStatistics = {
    player: 0,
    computer: 0,
    playerX: 0,
    playerO: 0,
    draws: 0,
    totalGames: 0,
  };

  updateModeDisplay();
  updateToggleButtonText();
  updateStatLabels();
  updateStatistics();
  creategameBoard();
}

function updateStatLabels() {
  if (gameMode === "pvp") {
    player1Label.innerHTML = "<strong>Player 'X'</strong>";
    player2Label.innerHTML = "<strong>Player 'O'</strong>";
  } else {
    player1Label.innerHTML = "<strong>Player</strong>";
    player2Label.innerHTML = "<strong>Computer</strong>";
  }
}

function togglePvPStarter() {
  playerXStartsFirst = !playerXStartsFirst;
  updateToggleButtonText();
  if (gameMode === "pvp") {
    creategameBoard();
  }
}

function toggleComputerStarter() {
  computerStartsFirst = !computerStartsFirst;
  updateToggleButtonText();
  if (gameMode === "pvc") {
    creategameBoard();
  }
}

function toggleStarter() {
  if (gameMode === "pvp") {
    togglePvPStarter();
  } else {
    toggleComputerStarter();
  }
}

function updateToggleButtonText() {
  const toggleStartBtn = document.getElementById("toggleStartBtn");
  if (toggleStartBtn) {
    if (gameMode === "pvp") {
      toggleStartBtn.textContent = playerXStartsFirst
        ? "'X' Starts"
        : "'O' Starts";

      if (!playerXStartsFirst) {
        toggleStartBtn.classList.add("switch");
      } else {
        toggleStartBtn.classList.remove("switch");
      }
    } else {
      toggleStartBtn.textContent = computerStartsFirst
        ? "Computer Starts"
        : "Player Starts";

      if (computerStartsFirst) {
        toggleStartBtn.classList.add("switch");
      } else {
        toggleStartBtn.classList.remove("switch");
      }
    }
  }
}

function toggleDifficulty() {
  if (onlineMode) return;
  const difficulties = ["easy", "medium", "hard"];
  const currentIndex = difficulties.indexOf(difficulty);
  difficulty = difficulties[(currentIndex + 1) % 3];

  difficultyBtn.textContent =
    difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  difficultyBtn.className = "btn";
  if (difficulty === "easy") difficultyBtn.classList.add("difficulty-easy");
  else if (difficulty === "hard")
    difficultyBtn.classList.add("difficulty-hard");
}

toggleModeBtn.addEventListener("click", toggleGameMode);
difficultyBtn.addEventListener("click", toggleDifficulty);

function leaveLobby() {
  onlineMode = false;
  currentLobbyId = null;
  myMark = null;
  if (socket) {
    socket.off();
    if (socket.connected) {
      socket.disconnect();
    }
    socket = null;
  }
  updateModeDisplay();
}

function renderFromRoomState(room) {
  if (!room) return;

  for (let i = 0; i < 9; i++) {
    currentGameBoard[i] = room.board ? room.board[i] : null;
    const cell = gameBoard.children[i];
    if (!cell) continue;
    cell.innerHTML = "";
    cell.classList.remove("winning-cell", "winning-cell-x", "winning-cell-o");
    if (currentGameBoard[i]) {
      const mark = document.createElement("span");
      mark.classList.add("mark");
      mark.textContent = currentGameBoard[i];
      cell.appendChild(mark);
    }
  }

  isGameCurrentlyActive = Boolean(room.isActive);
  currentPlayer = room.currentPlayer || "X";
  isProcessingMove = false;

  const stats = room.stats || {};
  gameStatistics.playerX = stats.xWins ?? 0;
  gameStatistics.playerO = stats.oWins ?? 0;
  gameStatistics.draws = stats.draws ?? 0;
  gameStatistics.totalGames = stats.totalGames ?? 0;
  updateStatistics();

  gameStatus.classList.remove(
    "game-status-x-win",
    "game-status-o-win",
    "game-status-draw"
  );

  const winner = checkWinner(currentGameBoard);
  const isDraw = currentGameBoard.every((cell) => cell !== null);

  if (!room.isActive && winner) {
    const winningCombo = getWinningCombination(winner);
    if (winningCombo) {
      winningCombo.forEach((index) => {
        const cell = gameBoard.children[index];
        if (!cell) return;
        cell.classList.add(
          "winning-cell",
          winner === "X" ? "winning-cell-x" : "winning-cell-o"
        );
      });
    }
    if (winner === "X") {
      gameStatus.classList.add("game-status-x-win");
      gameStatus.textContent = "Player 'X' wins!";
    } else {
      gameStatus.classList.add("game-status-o-win");
      gameStatus.textContent = "Player 'O' wins!";
    }
  } else if (!room.isActive && isDraw && !winner) {
    gameStatus.classList.add("game-status-draw");
    gameStatus.textContent = "It's a draw!";
  } else if (myMark && currentPlayer === myMark) {
    gameStatus.textContent = "Your turn!";
  } else if (!room.isActive) {
    gameStatus.textContent = "Game over — start a New Game";
  } else {
    gameStatus.textContent = "Opponent's turn...";
  }

  disablePlayerClicks();
  if (room.isActive && myMark && currentPlayer === myMark) {
    enablePlayerClicks();
  }
}

function joinLobby(lobbyId) {
  if (!lobbyId) return;

  if (onlineMode && currentLobbyId === lobbyId) {
    return;
  }

  if (!socket) {
    if (typeof io === "undefined") {
      alert("Socket.IO client not loaded.");
      return;
    }
    socket = io();
  }

  if (!socket.connected) {
    socket.connect();
  }

  socket.off();

  onlineMode = true;
  gameMode = "pvp";
  currentLobbyId = lobbyId;
  updateModeDisplay();
  updateStatLabels();
  updateStatistics();
  creategameBoard();
  gameStatus.textContent = "Connecting to lobby...";
  disablePlayerClicks();

  socket.on("connect_error", () => {
    gameStatus.textContent = "Unable to connect to lobby.";
  });

  socket.on("roomState", (room) => {
    if (room.lobbyId) {
      currentLobbyId = room.lobbyId;
      updateModeDisplay();
      try {
        localStorage.setItem("lastLobbyId", currentLobbyId);
      } catch (err) {
        // Ignore storage errors (e.g., privacy mode)
      }
    }
    if (room.yourMark) {
      myMark = room.yourMark;
      if (yourMarkDisplay) {
        yourMarkDisplay.textContent = `Your mark: ${myMark}`;
      }
    }
    renderFromRoomState(room);
  });

  socket.on("playerJoined", () => {
    if (!onlineMode) return;
    if (!isGameCurrentlyActive) {
      gameStatus.textContent = "Game over — start a New Game";
    }
  });

  socket.on("errorMsg", (msg) => {
    gameStatus.textContent = msg;
    alert(msg);
  });

  socket.on("disconnect", () => {
    if (!onlineMode) return;
    disablePlayerClicks();
    gameStatus.textContent = "Disconnected from lobby";
  });

  socket.emit("joinLobby", { lobbyId });
}

function creategameBoard() {
  gameBoard.innerHTML = "";
  currentGameBoard = Array(9).fill(null);
  isGameCurrentlyActive = true;
  isProcessingMove = false;
  currentPlayer = "X";

  if (gameMode === "pvp") {
    currentPlayer = onlineMode ? "X" : playerXStartsFirst ? "X" : "O";
  }

  for (let i = 0; i < 9; i++) {
    const singleCell = document.createElement("div");
    singleCell.classList.add("cell");
    singleCell.dataset.index = i;
    gameBoard.appendChild(singleCell);
    if (gameMode === "pvp" || (gameMode === "pvc" && !computerStartsFirst)) {
      singleCell.addEventListener("click", handlePlayerMove);
    }
  }

  gameStatus.classList.remove("game-status-x-win");
  gameStatus.classList.remove("game-status-draw");
  gameStatus.classList.remove("game-status-o-win");

  [...gameBoard.children].forEach((cell) => {
    cell.classList.remove("winning-cell");
    cell.classList.remove("winning-cell-x");
    cell.classList.remove("winning-cell-o");
  });

  if (gameMode === "pvp") {
    if (onlineMode) {
      gameStatus.textContent = currentLobbyId
        ? "Waiting for lobby state..."
        : "Online PvP - join a lobby to start.";
      disablePlayerClicks();
    } else {
      gameStatus.textContent = `Player ${currentPlayer}'s turn - click a cell`;
      enablePlayerClicks();
    }
  } else {
    if (computerStartsFirst) {
      gameStatus.textContent = "Computer is thinking...";
      setTimeout(() => {
        handleComputerMove();
      }, 1000);
    } else {
      gameStatus.textContent = "Your turn!";
      enablePlayerClicks();
    }
  }
}

function drawMarkOnBoard(boardPosition, playerMark) {
  const targetCell = gameBoard.children[boardPosition];

  if (targetCell.querySelector(".scanning")) return;
  const scanningAnimation = document.createElement("div");
  scanningAnimation.classList.add("scanning");
  targetCell.appendChild(scanningAnimation);

  setTimeout(() => {
    scanningAnimation.remove();
    const mark = document.createElement("span");
    mark.classList.add("mark");
    mark.textContent = playerMark;
    targetCell.appendChild(mark);
  }, 1000);
}

function handlePlayerMove(click) {
  const index = click.target.dataset.index;
  if (!isGameCurrentlyActive || currentGameBoard[index] || isProcessingMove)
    return;

  if (onlineMode) {
    if (currentPlayer !== myMark || !socket) return;
    isProcessingMove = true;
    disablePlayerClicks();
    socket.emit("makeMove", { index: Number(index) });
    return;
  }

  isProcessingMove = true;
  disablePlayerClicks();

  const playerMark = gameMode === "pvp" ? currentPlayer : "X";

  currentGameBoard[index] = playerMark;
  drawMarkOnBoard(index, playerMark);

  setTimeout(() => {
    if (determineWinner(playerMark)) {
      const winningCombo = getWinningCombination(playerMark);

      if (gameMode === "pvp") {
        gameStatus.textContent = `Player '${playerMark}' wins!`;
        if (playerMark === "X") {
          gameStatistics.playerX++;
          gameStatus.classList.add("game-status-x-win");
        } else {
          gameStatistics.playerO++;
          gameStatus.classList.add("game-status-o-win");
        }
      } else {
        gameStatus.textContent = "You win!";
        gameStatistics.player++;
        gameStatus.classList.add("game-status-x-win");
      }

      if (winningCombo) {
        winningCombo.forEach((index) => {
          gameBoard.children[index].classList.add(
            "winning-cell",
            playerMark === "X" ? "winning-cell-x" : "winning-cell-o"
          );
        });
      }

      gameStatistics.totalGames++;
      isGameCurrentlyActive = false;
      updateStatistics();
      return;
    }

    if (isGameOver()) {
      gameStatus.textContent = "It's a draw!";
      gameStatus.classList.add("game-status-draw");
      gameStatistics.draws++;
      gameStatistics.totalGames++;
      isGameCurrentlyActive = false;
      updateStatistics();
      return;
    }

    if (gameMode === "pvp") {
      currentPlayer = currentPlayer === "X" ? "O" : "X";
      gameStatus.textContent = `Player ${currentPlayer}'s turn - click a cell`;
      isProcessingMove = false;
      enablePlayerClicks();
    } else {
      gameStatus.textContent = "Computer is thinking...";
      setTimeout(handleComputerMove, 500);
    }
  }, 1000);
}

function findCriticalMove(targetPlayer, count) {
  for (let combination of winningCombinations) {
    let [a, b, c] = combination;
    let positions = [
      currentGameBoard[a],
      currentGameBoard[b],
      currentGameBoard[c],
    ];

    let playerCount = positions.filter(
      (position) => position === targetPlayer
    ).length;
    let emptyCount = positions.filter((position) => position === null).length;

    if (playerCount === count && emptyCount === 1) {
      for (let i = 0; i < 3; i++) {
        if (currentGameBoard[combination[i]] === null) {
          return combination[i];
        }
      }
    }
  }
  return null;
}

function minimax(board, depth, isMaximizing, maxPlayer = "O") {
  const minPlayer = maxPlayer === "X" ? "O" : "X";
  const winner = checkWinner(board);

  if (winner === maxPlayer) return { score: 10 - depth };
  if (winner === minPlayer) return { score: depth - 10 };
  if (isBoardFull(board)) return { score: 0 };

  const moves = [];
  const emptyIndices = getEmptyIndices(board);

  for (let i = 0; i < emptyIndices.length; i++) {
    const move = {};
    move.index = emptyIndices[i];

    board[emptyIndices[i]] = isMaximizing ? maxPlayer : minPlayer;

    const result = minimax(board, depth + 1, !isMaximizing, maxPlayer);
    move.score = result.score;

    board[emptyIndices[i]] = null;

    moves.push(move);
  }

  let bestMove;
  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].score > bestScore) {
        bestScore = moves[i].score;
        bestMove = i;
      }
    }
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].score < bestScore) {
        bestScore = moves[i].score;
        bestMove = i;
      }
    }
  }

  return moves[bestMove];
}

function checkWinner(board) {
  for (let combo of winningCombinations) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

function getEmptyIndices(board) {
  return board
    .map((value, index) => (value === null ? index : null))
    .filter((index) => index !== null);
}

function handleComputerMove() {
  if (onlineMode) return;
  if (!isGameCurrentlyActive) return;

  const emptyIndices = getEmptyIndices(currentGameBoard);
  if (emptyIndices.length === 0) return;

  let moveIndex = null;

  if (difficulty === "easy") {
    moveIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  } else if (difficulty === "medium") {
    moveIndex = findCriticalMove("O", 2);

    if (moveIndex === null) {
      moveIndex = findCriticalMove("X", 2);
    }

    if (moveIndex === null) {
      const center = 4;
      const corners = [0, 2, 6, 8];
      const sides = [1, 3, 5, 7];

      if (currentGameBoard[center] === null) {
        moveIndex = center;
      } else {
        const freeCorners = corners.filter((i) => currentGameBoard[i] === null);
        if (freeCorners.length > 0) {
          moveIndex =
            freeCorners[Math.floor(Math.random() * freeCorners.length)];
        } else {
          const freeSides = sides.filter((i) => currentGameBoard[i] === null);
          moveIndex = freeSides[Math.floor(Math.random() * freeSides.length)];
        }
      }
    }
  } else if (difficulty === "hard") {
    const result = minimax(currentGameBoard, 0, true, "O");
    moveIndex = result.index;
  }

  currentGameBoard[moveIndex] = "O";
  drawMarkOnBoard(moveIndex, "O");

  setTimeout(() => {
    if (determineWinner("O")) {
      const winningCombo = getWinningCombination("O");
      gameStatus.textContent = "Computer wins!";
      gameStatus.classList.add("game-status-o-win");
      if (winningCombo) {
        winningCombo.forEach((index) => {
          gameBoard.children[index].classList.add(
            "winning-cell",
            "winning-cell-o"
          );
        });
      }
      gameStatistics.computer++;
      gameStatistics.totalGames++;
      isGameCurrentlyActive = false;
      updateStatistics();
      return;
    }

    if (isGameOver()) {
      gameStatus.textContent = "It's a draw!";
      gameStatus.classList.add("game-status-draw");
      gameStatistics.draws++;
      gameStatistics.totalGames++;
      isGameCurrentlyActive = false;
      updateStatistics();
      return;
    }

    gameStatus.textContent = "Your turn!";
    isProcessingMove = false;
    enablePlayerClicks();
  }, 1000);
}

function determineWinner(player) {
  return winningCombinations.some((combo) =>
    combo.every((index) => currentGameBoard[index] === player)
  );
}

function getWinningCombination(player) {
  for (let combo of winningCombinations) {
    if (combo.every((index) => currentGameBoard[index] === player)) {
      return combo;
    }
  }
  return null;
}

function isGameOver() {
  return currentGameBoard.every((cell) => cell !== null);
}

function updateStatistics() {
  if (gameMode === "pvp") {
    player1Wins.textContent = gameStatistics.playerX;
    player2Wins.textContent = gameStatistics.playerO;
  } else {
    player1Wins.textContent = gameStatistics.player;
    player2Wins.textContent = gameStatistics.computer;
  }
  draws.textContent = gameStatistics.draws;
  totalGames.textContent = gameStatistics.totalGames;
}

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
    return;
  }
  gameStatistics = {
    player: 0,
    computer: 0,
    playerX: 0,
    playerO: 0,
    draws: 0,
    totalGames: 0,
  };
  updateStatistics();
});

if (toggleStartBtn) {
  updateToggleButtonText();
  toggleStartBtn.addEventListener("click", toggleStarter);
}

if (joinLobbyBtn && lobbyIdInput) {
  joinLobbyBtn.addEventListener("click", () => {
    const id = lobbyIdInput.value.trim();
    if (id) {
      joinLobby(id);
    }
  });
}

if (lobbyIdInput) {
  try {
    const last = localStorage.getItem("lastLobbyId");
    if (last) {
      lobbyIdInput.value = last;
    }
  } catch (err) {
    // ignore storage issues
  }
}

updateStatLabels();
updateStatistics();
updateModeDisplay();
creategameBoard();
