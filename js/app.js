(function () {
  "use strict";

  const LEVELS = {
    easy: { label: "Lätt", count: 8, minLen: 3, maxLen: 8, maxSize: 11 },
    medium: { label: "Medel", count: 12, minLen: 4, maxLen: 10, maxSize: 13 },
    hard: { label: "Svår", count: 16, minLen: 4, maxLen: 14, maxSize: 15 },
  };
  const DIR_NAME = { across: "vågrätt", down: "lodrätt" };
  const STATE_KEY = "hpk-state-v1";
  const STATS_KEY = "hpk-stats-v1";

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");

  let state = null;
  let cellEls = [];
  let cellWords = []; // [r][c] -> { across: wordIndex, down: wordIndex }
  let timerId = null;

  // ---------- Lagring ----------
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat läge etc. */ }
  }
  const save = () => store(STATE_KEY, state);

  // ---------- Nytt spel ----------
  function newPuzzle(level) {
    const opts = LEVELS[level];
    const previous = new Set(state ? state.puzzle.words.map((w) => w.word) : []);
    let pool = HP_WORDS.filter(([w]) => !previous.has(w));
    if (pool.length < opts.count * 4) pool = HP_WORDS;
    const puzzle = Crossword.generate(pool, opts);
    const blank = () => puzzle.grid.map((row) => row.map(() => ""));
    const first = puzzle.words[0];
    state = {
      level,
      puzzle,
      entries: blank(),
      revealed: puzzle.grid.map((row) => row.map(() => false)),
      wrong: puzzle.grid.map((row) => row.map(() => false)),
      sel: { r: first.row, c: first.col },
      dir: first.dir,
      seconds: 0,
      hints: 0,
      done: false,
      gaveUp: false,
      warnedFull: false,
    };
    boardEl.classList.remove("solved");
    setup();
    save();
  }

  function setup() {
    const { puzzle } = state;
    cellWords = puzzle.grid.map((row) => row.map(() => ({})));
    puzzle.words.forEach((w, i) => {
      forEachCell(w, (r, c) => (cellWords[r][c][w.dir] = i));
    });
    renderBoard();
    renderClues();
    renderDifficulty();
    update();
    startTimer();
  }

  function forEachCell(w, fn) {
    const [dr, dc] = Crossword.DIRS[w.dir];
    for (let i = 0; i < w.word.length; i++) fn(w.row + dr * i, w.col + dc * i, i);
  }
  const cellsOf = (w) => { const out = []; forEachCell(w, (r, c) => out.push([r, c])); return out; };
  const isLetter = (r, c) => r >= 0 && c >= 0 && r < state.puzzle.rows && c < state.puzzle.cols && !!state.puzzle.grid[r][c];
  const currentWordIndex = () => cellWords[state.sel.r][state.sel.c][state.dir];
  const currentWord = () => state.puzzle.words[currentWordIndex()];

  // ---------- Rendering ----------
  function renderBoard() {
    const { rows, cols, grid, words } = state.puzzle;
    boardEl.style.setProperty("--cols", cols);
    boardEl.style.setProperty("--rows", rows);
    boardEl.innerHTML = "";
    const numbers = {};
    words.forEach((w) => (numbers[w.row + "," + w.col] = w.number));
    cellEls = [];
    for (let r = 0; r < rows; r++) {
      cellEls.push([]);
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("div");
        el.className = "cell";
        if (grid[r][c]) {
          el.classList.add("letter");
          const num = numbers[r + "," + c];
          el.innerHTML = (num ? `<span class="num">${num}</span>` : "") + `<span class="ch"></span>`;
          el.addEventListener("click", () => selectCell(r, c));
        }
        boardEl.appendChild(el);
        cellEls[r].push(el);
      }
    }
  }

  function renderClues() {
    for (const dir of ["across", "down"]) {
      const list = $("clues-" + dir);
      list.innerHTML = "";
      state.puzzle.words.forEach((w, i) => {
        if (w.dir !== dir) return;
        const li = document.createElement("li");
        li.dataset.index = i;
        li.innerHTML = `<span class="n">${w.number}</span><span class="clue-text">${w.clue} <span class="len">(${w.word.length})</span></span>`;
        li.addEventListener("click", () => selectWord(i));
        list.appendChild(li);
      });
    }
  }

  function renderDifficulty() {
    document.querySelectorAll("#difficulty button").forEach((b) => b.setAttribute("aria-checked", b.dataset.level === state.level));
  }

  function update() {
    const { puzzle, entries, revealed, wrong, sel } = state;
    const active = new Set(currentWord() ? cellsOf(currentWord()).map(([r, c]) => r + "," + c) : []);
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c]) continue;
        const el = cellEls[r][c];
        el.querySelector(".ch").textContent = entries[r][c];
        el.classList.toggle("in-word", active.has(r + "," + c));
        el.classList.toggle("selected", r === sel.r && c === sel.c && !state.done);
        el.classList.toggle("revealed", revealed[r][c]);
        el.classList.toggle("wrong", wrong[r][c]);
      }
    }
    const idx = currentWordIndex();
    document.querySelectorAll(".clues li").forEach((li) => {
      const i = +li.dataset.index;
      li.classList.toggle("active", i === idx);
      li.classList.toggle("filled", cellsOf(puzzle.words[i]).every(([r, c]) => entries[r][c]));
    });
    const w = currentWord();
    $("cc-num").textContent = w ? `${w.number} ${DIR_NAME[w.dir]}` : "";
    $("cc-clue").textContent = w ? `${w.clue} (${w.word.length})` : "";
  }

  function scrollClueIntoView() {
    if (!matchMedia("(min-width: 900px)").matches) return;
    const li = document.querySelector(`.clues li[data-index="${currentWordIndex()}"]`);
    if (li) li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------- Navigering ----------
  function selectCell(r, c) {
    if (!isLetter(r, c)) return;
    const words = cellWords[r][c];
    if (state.sel.r === r && state.sel.c === c) {
      const other = state.dir === "across" ? "down" : "across";
      if (words[other] !== undefined) state.dir = other;
    } else {
      state.sel = { r, c };
      if (words[state.dir] === undefined) state.dir = state.dir === "across" ? "down" : "across";
    }
    update();
    scrollClueIntoView();
  }

  function selectWord(i) {
    const w = state.puzzle.words[i];
    const cells = cellsOf(w);
    const empty = cells.find(([r, c]) => !state.entries[r][c]);
    const [r, c] = empty || cells[0];
    state.sel = { r, c };
    state.dir = w.dir;
    update();
    scrollClueIntoView();
  }

  function stepWord(delta) {
    const order = ["across", "down"].flatMap((d) =>
      state.puzzle.words.map((w, i) => [w, i]).filter(([w]) => w.dir === d).map(([, i]) => i)
    );
    const pos = order.indexOf(currentWordIndex());
    selectWord(order[(pos + delta + order.length) % order.length]);
  }

  function moveWithinWord(delta) {
    const w = currentWord();
    const cells = cellsOf(w);
    const pos = cells.findIndex(([r, c]) => r === state.sel.r && c === state.sel.c);
    const next = cells[pos + delta];
    if (next) state.sel = { r: next[0], c: next[1] };
    return !!next;
  }

  function arrow(dr, dc) {
    const dir = dr ? "down" : "across";
    if (state.dir !== dir && cellWords[state.sel.r][state.sel.c][dir] !== undefined) {
      state.dir = dir;
      return update();
    }
    let r = state.sel.r + dr, c = state.sel.c + dc;
    while (r >= 0 && c >= 0 && r < state.puzzle.rows && c < state.puzzle.cols) {
      if (isLetter(r, c)) {
        state.sel = { r, c };
        if (cellWords[r][c][state.dir] === undefined) state.dir = dir;
        return update();
      }
      r += dr; c += dc;
    }
  }

  // ---------- Inmatning ----------
  function typeLetter(ch) {
    if (state.done) return;
    const { r, c } = state.sel;
    if (!state.revealed[r][c]) {
      state.entries[r][c] = ch;
      state.wrong[r][c] = false;
      const el = cellEls[r][c];
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    }
    moveWithinWord(1);
    update();
    afterChange();
  }

  function backspace() {
    if (state.done) return;
    const { r, c } = state.sel;
    if (state.entries[r][c] && !state.revealed[r][c]) {
      state.entries[r][c] = "";
    } else if (moveWithinWord(-1)) {
      const { r: pr, c: pc } = state.sel;
      if (!state.revealed[pr][pc]) state.entries[pr][pc] = "";
      state.wrong[pr][pc] = false;
    }
    state.wrong[r][c] = false;
    update();
    save();
  }

  function afterChange() {
    const { puzzle, entries } = state;
    let full = true, correct = true;
    for (let r = 0; r < puzzle.rows; r++)
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c]) continue;
        if (!entries[r][c]) full = false;
        if (entries[r][c] !== puzzle.grid[r][c]) correct = false;
      }
    if (correct) return win(false);
    if (full && !state.warnedFull) {
      state.warnedFull = true;
      toast("Allt är ifyllt – men något stämmer inte än 🤔");
    }
    if (!full) state.warnedFull = false;
    save();
  }

  // ---------- Hjälp ----------
  function check() {
    let wrong = 0, empty = 0;
    const { puzzle, entries } = state;
    for (let r = 0; r < puzzle.rows; r++)
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c]) continue;
        if (!entries[r][c]) empty++;
        else if (entries[r][c] !== puzzle.grid[r][c]) { state.wrong[r][c] = true; wrong++; }
      }
    update();
    save();
    if (wrong) toast(`${wrong} ${wrong === 1 ? "bokstav är fel" : "bokstäver är fel"}`);
    else toast(empty ? "Inga fel hittills – fortsätt så! ✨" : "Allt rätt!");
  }

  function reveal(cells) {
    let changed = false;
    for (const [r, c] of cells) {
      if (state.entries[r][c] === state.puzzle.grid[r][c]) continue;
      state.entries[r][c] = state.puzzle.grid[r][c];
      state.revealed[r][c] = true;
      state.wrong[r][c] = false;
      changed = true;
    }
    if (changed) state.hints++;
    update();
    afterChange();
  }

  function solveAll() {
    const { puzzle } = state;
    const all = [];
    for (let r = 0; r < puzzle.rows; r++) for (let c = 0; c < puzzle.cols; c++) if (puzzle.grid[r][c]) all.push([r, c]);
    for (const [r, c] of all) {
      if (state.entries[r][c] !== puzzle.grid[r][c]) state.revealed[r][c] = true;
      state.entries[r][c] = puzzle.grid[r][c];
      state.wrong[r][c] = false;
    }
    win(true);
  }

  // ---------- Vinst & statistik ----------
  function win(gaveUp) {
    state.done = true;
    state.gaveUp = gaveUp;
    stopTimer();
    update();
    if (!gaveUp) {
      boardEl.classList.add("solved");
      boardEl.querySelectorAll(".cell.letter").forEach((el, i) => (el.style.animationDelay = i * 12 + "ms"));
      recordStats();
    }
    save();
    setTimeout(() => showWinDialog(), gaveUp ? 0 : 900);
  }

  function recordStats() {
    const stats = load(STATS_KEY) || {};
    const s = stats[state.level] || { solved: 0, best: null, clean: 0 };
    s.solved++;
    if (state.hints === 0) {
      s.clean++;
      if (s.best === null || state.seconds < s.best) s.best = state.seconds;
    }
    stats[state.level] = s;
    stats.words = (stats.words || 0) + state.puzzle.words.length;
    store(STATS_KEY, stats);
  }

  function showWinDialog() {
    $("win-title").textContent = state.gaveUp ? "Här är lösningen" : "Snyggt löst! ";
    document.querySelector("#win-dialog .confetti").textContent = state.gaveUp ? "📖" : "🎉";
    const hints = state.hints ? ` med ${state.hints} ${state.hints === 1 ? "ledtråd" : "ledtrådar"}` : " helt utan hjälp";
    $("win-summary").textContent = state.gaveUp
      ? "Ingen fara – gå igenom orden nedan så sitter de nästa gång."
      : `${LEVELS[state.level].label} · ${formatTime(state.seconds)}${hints}.`;
    $("win-words").innerHTML = state.puzzle.words
      .slice()
      .sort((a, b) => a.word.localeCompare(b.word, "sv"))
      .map((w) => `<li><b>${w.word.toLowerCase()}</b> – ${w.clue}</li>`)
      .join("");
    $("win-dialog").showModal();
  }

  function showStats() {
    const stats = load(STATS_KEY) || {};
    let html = "";
    for (const [key, lvl] of Object.entries(LEVELS)) {
      const s = stats[key] || { solved: 0, best: null, clean: 0 };
      html += `<div class="head">${lvl.label}</div>
        <div class="stat"><div class="v">${s.solved}</div><div class="l">Lösta</div></div>
        <div class="stat"><div class="v">${s.clean}</div><div class="l">Utan hjälp</div></div>
        <div class="stat"><div class="v">${s.best === null ? "–" : formatTime(s.best)}</div><div class="l">Bästa tid</div></div>`;
    }
    html += `<div class="head">Totalt</div>
      <div class="stat" style="grid-column: 1 / -1"><div class="v">${stats.words || 0}</div><div class="l">HP-ord lösta</div></div>`;
    $("stats-grid").innerHTML = html;
    $("stats-dialog").showModal();
  }

  // ---------- Timer ----------
  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }
  function renderTimer() { $("timer").textContent = formatTime(state.seconds); }
  function startTimer() {
    stopTimer();
    renderTimer();
    if (state.done) return;
    timerId = setInterval(() => {
      if (document.hidden) return;
      state.seconds++;
      renderTimer();
      if (state.seconds % 5 === 0) save();
    }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  // ---------- UI-hjälpare ----------
  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function confirmBox(title, text, yesLabel) {
    return new Promise((resolve) => {
      const dlg = $("confirm-dialog");
      $("confirm-title").textContent = title;
      $("confirm-text").textContent = text;
      $("confirm-yes").textContent = yesLabel;
      const done = (v) => { dlg.close(); cleanup(); resolve(v); };
      const yes = () => done(true), no = () => done(false), cancel = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        $("confirm-yes").removeEventListener("click", yes);
        $("confirm-no").removeEventListener("click", no);
        dlg.removeEventListener("cancel", cancel);
      };
      $("confirm-yes").addEventListener("click", yes);
      $("confirm-no").addEventListener("click", no);
      dlg.addEventListener("cancel", cancel);
      dlg.showModal();
    });
  }

  const hasProgress = () => !state.done && state.entries.some((row) => row.some(Boolean));

  async function requestNew(level) {
    if (hasProgress() && !(await confirmBox("Starta nytt korsord?", "Du tappar det du fyllt i på det nuvarande korsordet.", "Nytt korsord"))) return;
    newPuzzle(level);
  }

  function buildKeyboard() {
    const rows = ["QWERTYUIOPÅ", "ASDFGHJKLÖÄ", "ZXCVBNM⌫"];
    const kb = $("keyboard");
    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      for (const k of row) {
        const b = document.createElement("button");
        b.className = "key" + (k === "⌫" ? " wide" : "");
        b.textContent = k;
        b.setAttribute("aria-label", k === "⌫" ? "Sudda" : k);
        b.addEventListener("click", () => (k === "⌫" ? backspace() : typeLetter(k)));
        rowEl.appendChild(b);
      }
      kb.appendChild(rowEl);
    }
  }

  // ---------- Händelser ----------
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[a-zåäö]$/i.test(k)) { typeLetter(k.toUpperCase()); e.preventDefault(); }
    else if (k === "Backspace" || k === "Delete") { backspace(); e.preventDefault(); }
    else if (k === "ArrowRight") { arrow(0, 1); e.preventDefault(); }
    else if (k === "ArrowLeft") { arrow(0, -1); e.preventDefault(); }
    else if (k === "ArrowDown") { arrow(1, 0); e.preventDefault(); }
    else if (k === "ArrowUp") { arrow(-1, 0); e.preventDefault(); }
    else if (k === "Tab" || k === "Enter") { stepWord(e.shiftKey ? -1 : 1); e.preventDefault(); }
    else if (k === " ") { selectCell(state.sel.r, state.sel.c); e.preventDefault(); }
  });

  $("btn-new").addEventListener("click", () => requestNew(state.level));
  document.querySelectorAll("#difficulty button").forEach((b) =>
    b.addEventListener("click", () => b.dataset.level !== state.level && requestNew(b.dataset.level))
  );
  $("btn-check").addEventListener("click", () => !state.done && check());
  $("btn-letter").addEventListener("click", () => !state.done && reveal([[state.sel.r, state.sel.c]]));
  $("btn-word").addEventListener("click", () => !state.done && reveal(cellsOf(currentWord())));
  $("btn-solve").addEventListener("click", async () => {
    if (state.done) return showWinDialog();
    if (await confirmBox("Ge upp?", "Hela lösningen visas och korsordet räknas inte i statistiken.", "Visa lösningen")) solveAll();
  });
  $("prev-clue").addEventListener("click", () => stepWord(-1));
  $("next-clue").addEventListener("click", () => stepWord(1));
  $("btn-stats").addEventListener("click", showStats);
  $("stats-close").addEventListener("click", () => $("stats-dialog").close());
  $("win-close").addEventListener("click", () => $("win-dialog").close());
  $("win-new").addEventListener("click", () => { $("win-dialog").close(); newPuzzle(state.level); });
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => document.hidden && save());

  // ---------- Start ----------
  buildKeyboard();
  const saved = load(STATE_KEY);
  if (saved && saved.puzzle && LEVELS[saved.level]) {
    state = saved;
    setup();
    if (state.done && !state.gaveUp) boardEl.classList.add("solved");
  } else {
    newPuzzle("medium");
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
