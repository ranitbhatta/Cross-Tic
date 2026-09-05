(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const cells = $$(".cell");

  const ui = {
    modePill: $("#modePill"), turnTimer: $("#turnTimer"), turnProgress: $("#turnProgress"),
    statusText: $("#statusText"), turnValue: $("#turnValue"), turnSymbol: $("#turnSymbol"),
    xScore: $("#xScore"), oScore: $("#oScore"), drawScore: $("#drawScore"),
    xLabel: $("#xLabel"), oLabel: $("#oLabel"), difficultyField: $("#difficultyField"),
    modeSelect: $("#modeSelect"), difficultySelect: $("#difficultySelect"),
    timerOptions: $("#timerOptions"), streakValue: $("#streakValue"), roundsValue: $("#roundsValue"),
    gamesMetric: $("#gamesMetric"), bestStreakMetric: $("#bestStreakMetric"),
    newRoundBtn: $("#newRoundBtn"), undoBtn: $("#undoBtn"), resetBtn: $("#resetBtn"),
    soundBtn: $("#soundBtn"), themeBtn: $("#themeBtn"), fullscreenBtn: $("#fullscreenBtn"),
    helpBtn: $("#helpBtn"), clearHistoryBtn: $("#clearHistoryBtn"),
    roundLabel: $("#roundLabel"), comboIndicator: $("#comboIndicator"),
    board: $("#board"), winningLine: $("#winningLine"), moveCount: $("#moveCount"),
    tipText: $("#tipText"), historyList: $("#historyList"), progressText: $("#progressText"),
    resultOverlay: $("#resultOverlay"), resultIcon: $("#resultIcon"), resultTitle: $("#resultTitle"),
    resultMessage: $("#resultMessage"), resultX: $("#resultX"), resultO: $("#resultO"),
    resultDraw: $("#resultDraw"), nextRoundBtn: $("#nextRoundBtn"), closeResultBtn: $("#closeResultBtn"),
    confetti: $("#confetti"), helpOverlay: $("#helpOverlay"), closeHelpBtn: $("#closeHelpBtn"),
    helpDoneBtn: $("#helpDoneBtn"), toast: $("#toast")
  };

  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  const TIPS = [
    "Control the center and create two threats at once.",
    "Corners can create stronger forks than edges.",
    "Watch for an opponent's open two-in-a-row.",
    "Create threats before your opponent can react.",
    "Against hard AI, a draw can be a tactical victory."
  ];

  const STORAGE = "cross-tic-ultimate-v2";
  const state = {
    board: Array(9).fill(""),
    player: "X",
    active: true,
    locked: false,
    mode: "pvp",
    difficulty: "medium",
    timerSeconds: 15,
    remaining: 15,
    timerId: null,
    cpuId: null,
    sound: true,
    light: false,
    scores: { X: 0, O: 0, draws: 0 },
    rounds: 0,
    streak: 0,
    bestStreak: 0,
    roundNumber: 1,
    history: [],
    moveHistory: []
  };

  let audioCtx = null;
  let toastTimer = null;

  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({
        scores: state.scores, rounds: state.rounds, streak: state.streak,
        bestStreak: state.bestStreak, roundNumber: state.roundNumber,
        history: state.history.slice(0, 12), sound: state.sound, light: state.light,
        mode: state.mode, difficulty: state.difficulty, timerSeconds: state.timerSeconds
      }));
    } catch (_) {}
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (!raw) return;
      if (raw.scores && Number.isFinite(raw.scores.X) && Number.isFinite(raw.scores.O) && Number.isFinite(raw.scores.draws)) state.scores = raw.scores;
      state.rounds = Number(raw.rounds) || 0;
      state.streak = Number(raw.streak) || 0;
      state.bestStreak = Number(raw.bestStreak) || 0;
      state.roundNumber = Math.max(1, Number(raw.roundNumber) || 1);
      state.history = Array.isArray(raw.history) ? raw.history.slice(0, 12) : [];
      state.sound = raw.sound !== false;
      state.light = raw.light === true;
      state.mode = raw.mode === "cpu" ? "cpu" : "pvp";
      state.difficulty = ["easy", "medium", "hard"].includes(raw.difficulty) ? raw.difficulty : "medium";
      state.timerSeconds = [0,15,30,60].includes(Number(raw.timerSeconds)) ? Number(raw.timerSeconds) : 15;
    } catch (_) {}
  }

  function beep(freq, duration = 0.08, type = "sine", volume = 0.045) {
    if (!state.sound) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + duration + 0.02);
    } catch (_) {}
  }

  function toast(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1700);
  }

  function winnerOf(board = state.board) {
    for (const line of WIN_LINES) {
      const [a,b,c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line };
    }
    return board.every(Boolean) ? { winner: "draw", line: [] } : null;
  }

  function nameOf(player) {
    return player === "X" ? "Player X" : state.mode === "cpu" ? "Computer" : "Player O";
  }

  function renderScores() {
    ui.xScore.textContent = state.scores.X;
    ui.oScore.textContent = state.scores.O;
    ui.drawScore.textContent = state.scores.draws;
    ui.streakValue.textContent = state.streak;
    ui.roundsValue.textContent = state.rounds;
    ui.gamesMetric.textContent = state.rounds;
    ui.bestStreakMetric.textContent = state.bestStreak;
    ui.resultX.textContent = state.scores.X;
    ui.resultO.textContent = state.scores.O;
    ui.resultDraw.textContent = state.scores.draws;
  }

  function updateTimer() {
    if (!state.timerSeconds) {
      ui.turnTimer.textContent = "∞";
      ui.turnProgress.style.width = "100%";
      return;
    }
    ui.turnTimer.textContent = `${Math.max(0, state.remaining)}s`;
    ui.turnProgress.style.width = `${Math.max(0, Math.min(100, state.remaining / state.timerSeconds * 100))}%`;
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function startTimer() {
    stopTimer();
    if (!state.active || !state.timerSeconds) return;
    state.remaining = state.timerSeconds;
    updateTimer();
    state.timerId = setInterval(() => {
      if (!state.active) return stopTimer();
      state.remaining -= 1;
      updateTimer();
      if (state.remaining <= 0) {
        stopTimer();
        timeoutTurn();
      }
    }, 1000);
  }

  function renderBoard() {
    cells.forEach((cell, index) => {
      const value = state.board[index];
      cell.textContent = value;
      cell.dataset.player = value;
      cell.disabled = !state.active || state.locked || Boolean(value) || (state.mode === "cpu" && state.player === "O");
      cell.setAttribute("aria-label", value ? `Cell ${index + 1}, ${value}` : `Cell ${index + 1}, empty`);
    });
    ui.moveCount.textContent = state.board.filter(Boolean).length;
  }

  function renderUI() {
    ui.modeSelect.value = state.mode;
    ui.difficultySelect.value = state.difficulty;
    ui.difficultyField.style.display = state.mode === "cpu" ? "" : "none";
    ui.modePill.textContent = state.mode === "cpu" ? `VS COMPUTER • ${state.difficulty.toUpperCase()}` : "LOCAL MULTIPLAYER";
    ui.xLabel.textContent = state.mode === "cpu" ? "YOU • X" : "PLAYER X";
    ui.oLabel.textContent = state.mode === "cpu" ? "COMPUTER • O" : "PLAYER O";
    ui.roundLabel.textContent = `ROUND ${String(state.roundNumber).padStart(2,"0")}`;

    if (state.active) {
      const n = nameOf(state.player);
      ui.statusText.textContent = `${n}'s turn`;
      ui.turnValue.textContent = n;
      ui.turnSymbol.textContent = state.player;
      ui.turnSymbol.dataset.player = state.player;
    }
    ui.comboIndicator.textContent = state.locked ? "AI THINKING" : state.active ? "READY" : "ROUND OVER";
    ui.comboIndicator.classList.toggle("hot", state.active && !state.locked);
    updateTimer();
    renderBoard();
    renderScores();
    renderHistory();
  }

  function clearWinningState() {
    cells.forEach(cell => cell.classList.remove("winner"));
    ui.winningLine.classList.remove("show");
    ui.winningLine.style.cssText = "";
  }

  function showWinningLine(line) {
    if (!line.length) return;
    line.forEach(i => cells[i].classList.add("winner"));
    const [a,,c] = line;
    const rowA = Math.floor(a/3), colA = a%3;
    const rowC = Math.floor(c/3), colC = c%3;
    const width = "80%";
    if (rowA === rowC) {
      ui.winningLine.style.width = width;
      ui.winningLine.style.height = "6px";
      ui.winningLine.style.left = "50%";
      ui.winningLine.style.top = `${rowA * 33.333 + 16.666}%`;
      ui.winningLine.style.transform = "translate(-50%,-50%)";
      ui.winningLine.style.rotate = "0deg";
    } else if (colA === colC) {
      ui.winningLine.style.width = "6px";
      ui.winningLine.style.height = width;
      ui.winningLine.style.left = `${colA * 33.333 + 16.666}%`;
      ui.winningLine.style.top = "50%";
      ui.winningLine.style.transform = "translate(-50%,-50%)";
      ui.winningLine.style.rotate = "0deg";
    } else {
      ui.winningLine.style.width = width;
      ui.winningLine.style.height = "6px";
      ui.winningLine.style.left = "50%";
      ui.winningLine.style.top = "50%";
      ui.winningLine.style.transform = "translate(-50%,-50%)";
      ui.winningLine.style.rotate = a === 0 ? "45deg" : "-45deg";
    }
    requestAnimationFrame(() => ui.winningLine.classList.add("show"));
  }

  function addHistory(result, reason) {
    const isPlayerWin = result.winner === "X";
    const outcome = result.winner === "draw" ? "tie" : (isPlayerWin ? "good" : "bad");
    const title = result.winner === "draw" ? "Draw round" : `${nameOf(result.winner)} wins`;
    state.history.unshift({
      winner: result.winner,
      title,
      outcome,
      reason,
      mode: state.mode,
      difficulty: state.difficulty,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });
    state.history = state.history.slice(0, 12);
  }

  function renderHistory() {
    if (!state.history.length) {
      ui.historyList.innerHTML = '<div class="history-empty">Complete a round to populate the mission log.</div>';
      ui.progressText.textContent = "Start a match and build your streak.";
      return;
    }
    ui.historyList.innerHTML = state.history.map(item => `
      <div class="history-item">
        <div class="history-badge ${item.outcome}">${item.winner === "draw" ? "=" : item.winner}</div>
        <div><strong>${item.title}</strong><small>${item.mode === "cpu" ? `${item.difficulty.toUpperCase()} AI` : "2 PLAYERS"} • ${item.time}</small></div>
        <em>${item.reason === "timeout" ? "TIME" : "BOARD"}</em>
      </div>
    `).join("");
    ui.progressText.textContent = state.streak > 1
      ? `${state.streak} consecutive player wins. Keep the streak alive.`
      : "Recent rounds are saved locally on this device.";
  }

  function confetti() {
    ui.confetti.replaceChildren();
    for (let i = 0; i < 45; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random()*100}%`;
      piece.style.setProperty("--d", `${650 + Math.random()*650}ms`);
      piece.style.setProperty("--delay", `${Math.random()*170}ms`);
      ui.confetti.appendChild(piece);
    }
  }

  function showResult(result, reason) {
    state.active = false;
    state.locked = false;
    stopTimer();

    if (result.winner === "draw") {
      state.scores.draws += 1;
      state.streak = 0;
      ui.resultIcon.textContent = "🤝";
      ui.resultTitle.textContent = "It's a draw!";
      ui.resultMessage.textContent = "Perfectly matched. Reset the arena and try again.";
      beep(220,.18,"triangle",.035);
    } else {
      state.scores[result.winner] += 1;
      if (result.winner === "X") {
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
      } else {
        state.streak = 0;
      }
      ui.resultIcon.textContent = result.winner === "X" ? "✖" : "◯";
      ui.resultTitle.textContent = `${nameOf(result.winner)} wins!`;
      ui.resultMessage.textContent = reason === "timeout"
        ? "The timer expired before the final move."
        : "Beautiful finish. Your winning line is locked in.";
      if (result.line.length) showWinningLine(result.line);
      confetti();
      beep(523.25,.08,"sine",.05);
      setTimeout(() => beep(659.25,.1,"sine",.045),80);
      setTimeout(() => beep(783.99,.13,"sine",.04),165);
    }

    state.rounds += 1;
    addHistory(result, reason);
    save();
    renderUI();
    setTimeout(() => {
      ui.resultOverlay.hidden = false;
      ui.nextRoundBtn.focus();
    }, 300);
  }

  function timeoutTurn() {
    if (!state.active || state.locked) return;
    const winner = state.player === "X" ? "O" : "X";
    toast(`${nameOf(state.player)} ran out of time`);
    showResult({ winner, line: [] }, "timeout");
  }

  function makeMove(index, player) {
    if (!state.active || state.locked || state.board[index]) return false;
    state.board[index] = player;
    state.moveHistory.push({ index, player });

    const cell = cells[index];
    cell.classList.remove("pop");
    void cell.offsetWidth;
    cell.classList.add("pop");
    beep(player === "X" ? 440 : 350,.065);

    const result = winnerOf();
    if (result) {
      showResult(result, "board");
      return true;
    }

    state.player = player === "X" ? "O" : "X";
    startTimer();
    renderUI();
    return true;
  }

  function startRound(advance = true) {
    clearTimeout(state.cpuId);
    stopTimer();
    state.board.fill("");
    state.moveHistory = [];
    state.player = "X";
    state.active = true;
    state.locked = false;
    clearWinningState();
    ui.resultOverlay.hidden = true;
    if (advance) state.roundNumber += 1;
    ui.tipText.textContent = TIPS[Math.floor(Math.random()*TIPS.length)];
    renderUI();
    startTimer();
  }

  function resetMatch() {
    clearTimeout(state.cpuId);
    stopTimer();
    state.scores = {X:0,O:0,draws:0};
    state.rounds = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.roundNumber = 1;
    state.history = [];
    startRound(false);
    save();
    renderUI();
    toast("Match data reset");
  }

  function undo() {
    if (!state.active || state.locked || !state.moveHistory.length) return;
    const last = state.moveHistory.pop();
    state.board[last.index] = "";

    if (state.mode === "cpu" && state.moveHistory.length) {
      const previous = state.moveHistory.pop();
      state.board[previous.index] = "";
      state.player = "X";
    } else {
      state.player = last.player === "X" ? "X" : "O";
    }

    clearWinningState();
    startTimer();
    renderUI();
    toast("Move undone");
    beep(300,.06,"triangle");
  }

  function emptyIndexes(board) {
    return board.map((v,i) => v ? null : i).filter(i => i !== null);
  }

  function tacticalMove(board) {
    const empty = emptyIndexes(board);
    if (!empty.length) return -1;

    for (const i of empty) {
      board[i] = "O";
      if (winnerOf(board)?.winner === "O") { board[i] = ""; return i; }
      board[i] = "";
    }
    for (const i of empty) {
      board[i] = "X";
      if (winnerOf(board)?.winner === "X") { board[i] = ""; return i; }
      board[i] = "";
    }
    const priority = [4,0,2,6,8,1,3,5,7];
    return priority.find(i => empty.includes(i)) ?? empty[0];
  }

  function minimax(board, maximizing, depth = 0) {
    const result = winnerOf(board);
    if (result?.winner === "O") return 10 - depth;
    if (result?.winner === "X") return depth - 10;
    if (result?.winner === "draw") return 0;

    const empty = emptyIndexes(board);
    if (maximizing) {
      let best = -Infinity;
      for (const i of empty) {
        board[i] = "O";
        best = Math.max(best, minimax(board,false,depth+1));
        board[i] = "";
      }
      return best;
    }
    let best = Infinity;
    for (const i of empty) {
      board[i] = "X";
      best = Math.min(best, minimax(board,true,depth+1));
      board[i] = "";
    }
    return best;
  }

  function bestComputerMove() {
    const empty = emptyIndexes(state.board);
    if (!empty.length) return -1;
    if (state.difficulty === "easy") return empty[Math.floor(Math.random()*empty.length)];

    if (state.difficulty === "medium") {
      if (Math.random() < .52) return tacticalMove(state.board);
    }

    let best = -Infinity;
    let chosen = empty[0];
    for (const i of empty) {
      state.board[i] = "O";
      const score = minimax(state.board,false,0);
      state.board[i] = "";
      if (score > best) { best = score; chosen = i; }
    }
    return chosen;
  }

  function scheduleCPU() {
    clearTimeout(state.cpuId);
    if (!state.active || state.mode !== "cpu" || state.player !== "O") return;
    state.locked = true;
    renderUI();
    ui.statusText.textContent = "Computer is thinking…";
    ui.comboIndicator.textContent = "AI THINKING";
    state.cpuId = setTimeout(() => {
      if (!state.active || state.mode !== "cpu" || state.player !== "O") return;
      state.locked = false;
      makeMove(bestComputerMove(),"O");
    }, state.difficulty === "easy" ? 330 : state.difficulty === "medium" ? 550 : 780);
  }

  function onCell(index) {
    if (state.mode === "cpu" && state.player === "O") return;
    if (makeMove(index,state.player) && state.active && state.mode === "cpu" && state.player === "O") scheduleCPU();
  }

  function setTimer(seconds) {
    state.timerSeconds = Number(seconds);
    $$("#timerOptions button").forEach(btn => btn.classList.toggle("selected", Number(btn.dataset.seconds) === state.timerSeconds));
    save();
    startRound(false);
  }

  cells.forEach(cell => cell.addEventListener("click", () => onCell(Number(cell.dataset.index))));

  ui.modeSelect.addEventListener("change", () => {
    state.mode = ui.modeSelect.value;
    state.streak = 0;
    save();
    startRound(false);
    toast(state.mode === "cpu" ? "Computer mode enabled" : "Two-player mode enabled");
  });

  ui.difficultySelect.addEventListener("change", () => {
    state.difficulty = ui.difficultySelect.value;
    save();
    toast(`${state.difficulty[0].toUpperCase()+state.difficulty.slice(1)} AI selected`);
    if (state.active) renderUI();
  });

  ui.timerOptions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-seconds]");
    if (button) setTimer(button.dataset.seconds);
  });

  ui.newRoundBtn.addEventListener("click", () => startRound(true));
  ui.nextRoundBtn.addEventListener("click", () => startRound(true));
  ui.closeResultBtn.addEventListener("click", () => { ui.resultOverlay.hidden = true; renderUI(); });
  ui.resultOverlay.addEventListener("click", (e) => { if (e.target === ui.resultOverlay) ui.resultOverlay.hidden = true; });
  ui.resetBtn.addEventListener("click", resetMatch);
  ui.undoBtn.addEventListener("click", undo);

  ui.soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    ui.soundBtn.textContent = state.sound ? "🔊" : "🔇";
    ui.soundBtn.setAttribute("aria-pressed", String(state.sound));
    save();
    if (state.sound) beep(560,.06);
  });

  ui.themeBtn.addEventListener("click", () => {
    state.light = !state.light;
    document.body.classList.toggle("light",state.light);
    ui.themeBtn.textContent = state.light ? "☾" : "☼";
    save();
  });

  ui.fullscreenBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { toast("Fullscreen is unavailable"); }
  });

  function openHelp() { ui.helpOverlay.hidden = false; ui.closeHelpBtn.focus(); }
  function closeHelp() { ui.helpOverlay.hidden = true; ui.helpBtn.focus(); }
  ui.helpBtn.addEventListener("click",openHelp);
  ui.closeHelpBtn.addEventListener("click",closeHelp);
  ui.helpDoneBtn.addEventListener("click",closeHelp);
  ui.helpOverlay.addEventListener("click",(e)=>{ if(e.target===ui.helpOverlay) closeHelp(); });

  ui.clearHistoryBtn.addEventListener("click",() => {
    state.history = [];
    save();
    renderHistory();
    toast("Mission log cleared");
  });

  document.addEventListener("keydown",(e) => {
    if (e.key === "Escape") {
      if (!ui.resultOverlay.hidden) ui.resultOverlay.hidden = true;
      else if (!ui.helpOverlay.hidden) closeHelp();
    }
    if ((e.key === "u" || e.key === "U") && !e.ctrlKey && !e.metaKey) undo();
    if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && state.active && !state.locked) onCell(Number(e.key)-1);
  });

  load();
  document.body.classList.toggle("light",state.light);
  ui.soundBtn.textContent = state.sound ? "🔊" : "🔇";
  ui.themeBtn.textContent = state.light ? "☾" : "☼";
  renderUI();
  startTimer();
})();
