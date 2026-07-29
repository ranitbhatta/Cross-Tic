// Select elements
const cells = document.querySelectorAll(".cell");
const xScoreEl = document.getElementById("xScore");
const oScoreEl = document.getElementById("oScore");
const drawScoreEl = document.getElementById("drawScore");

const btnRestart = document.getElementById("btnRestart");
const btnReset = document.getElementById("btnReset");
const btnModeToggle = document.getElementById("btnModeToggle");

// Game variables
let board = ["", "", "", "", "", "", "", "", ""];
let currentPlayer = "X";
let gameActive = true;
let vsComputer = false;

// Score tracking
let xScore = 0;
let oScore = 0;
let drawScore = 0;

// Winning combinations
const winningConditions = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

// Handle cell click
function handleCellClick(e) {
  const index = Array.from(cells).indexOf(e.target);

  if (board[index] !== "" || !gameActive) return;

  makeMove(index, currentPlayer);

  if (vsComputer && gameActive && currentPlayer === "O") {
    setTimeout(computerMove, 500); // Delay for realism
  }
}

// Make a move
function makeMove(index, player) {
  board[index] = player;
  cells[index].textContent = player === "X" ? "✖" : "◯";
  cells[index].style.color = player === "X" ? "#d32f2f" : "#388e3c";

  checkResult();
  currentPlayer = currentPlayer === "X" ? "O" : "X";
}

// Computer move (simple AI: random empty cell)
function computerMove() {
  const emptyCells = board.map((val, i) => (val === "" ? i : null)).filter(v => v !== null);
  if (emptyCells.length === 0) return;

  const randomIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  makeMove(randomIndex, "O");
}

// Check winner or draw
function checkResult() {
  let roundWon = false;

  for (let condition of winningConditions) {
    const [a, b, c] = condition;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      roundWon = true;
      highlightWinner(condition);
      break;
    }
  }

  if (roundWon) {
    gameActive = false;
    if (currentPlayer === "X") {
      xScore++;
      xScoreEl.textContent = `✖: ${xScore}`;
    } else {
      oScore++;
      oScoreEl.textContent = `◯: ${oScore}`;
    }
    return;
  }

  if (!board.includes("")) {
    gameActive = false;
    drawScore++;
    drawScoreEl.textContent = `Draws: ${drawScore}`;
  }
}

// Highlight winning cells
function highlightWinner(condition) {
  condition.forEach(i => {
    cells[i].style.background = "#ffeb3b";
  });
}

// Restart game (keep scores)
function restartGame() {
  board = ["", "", "", "", "", "", "", "", ""];
  cells.forEach(cell => {
    cell.textContent = "";
    cell.style.background = "linear-gradient(145deg, #f0f0f0, #dcdcdc)";
  });
  currentPlayer = "X";
  gameActive = true;
}

// Reset game (clear scores too)
function resetGame() {
  restartGame();
  xScore = 0;
  oScore = 0;
  drawScore = 0;
  xScoreEl.textContent = "✖: 0";
  oScoreEl.textContent = "◯: 0";
  drawScoreEl.textContent = "Draws: 0";
}

// Toggle mode (Player vs Player / Computer)
function toggleMode() {
  vsComputer = !vsComputer;
  btnModeToggle.textContent = vsComputer ? "2 Players" : "Computer";
  restartGame();
}

// Event listeners
cells.forEach(cell => cell.addEventListener("click", handleCellClick));
btnRestart.addEventListener("click", restartGame);
btnReset.addEventListener("click", resetGame);
btnModeToggle.addEventListener("click", toggleMode);
