(function () {
  "use strict";

  const LEVELS = {
    easy: { label: "Lätt", count: 8, minLen: 3, maxLen: 8, maxSize: 11 },
    medium: { label: "Medel", count: 12, minLen: 4, maxLen: 10, maxSize: 13 },
    hard: { label: "Svår", count: 16, minLen: 4, maxLen: 14, maxSize: 15 },
  };
  const LEVEL_KEYS = Object.keys(LEVELS);
  const DIR_NAME = { across: "vågrätt", down: "lodrätt" };
  const FIRST_DAY = "2026-01-01"; // Arkivet börjar här.
  const PROGRESS_KEY = "hpk-progress-v2";
  const PREFS_KEY = "hpk-prefs-v2";
  const SEED_VERSION = "v2"; // Ändras bara om alla dagars korsord ska bytas ut.

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");

  let state = null;
  let cellEls = [];
  let cellWords = []; // [r][c] -> { across: wordIndex, down: wordIndex }
  let timerId = null;
  let paused = false;
  let calMonth = null; // { y, m } som visas i arkivet
  const puzzleCache = new Map();

  // ---------- Lagring ----------
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat läge etc. */ }
  }
  const progressAll = () => load(PROGRESS_KEY) || {};
  const puzzleId = (date, level) => date + "|" + level;
  const signature = (p) => p.rows + "x" + p.cols + ":" + p.words.map((w) => w.word).join(",");

  function save() {
    if (!state) return;
    const all = progressAll();
    const { entries, revealed, wrong, seconds, hints, done, gaveUp } = state;
    all[puzzleId(state.date, state.level)] = { sig: state.sig, entries, revealed, wrong, seconds, hints, done, gaveUp };
    store(PROGRESS_KEY, all);
    setPref("level", state.level);
  }

  const prefs = () => load(PREFS_KEY) || {};
  function setPref(key, value) { store(PREFS_KEY, { ...prefs(), [key]: value }); }

  // ---------- Datum ----------
  const pad = (n) => String(n).padStart(2, "0");
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => toKey(new Date());
  const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
  const validDate = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(fromKey(k)) === k && k >= FIRST_DAY && k <= todayKey();
  function longDate(k) {
    const d = fromKey(k);
    const opts = { weekday: "long", day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    const s = d.toLocaleDateString("sv-SE", opts);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- Dagens korsord (samma för alla samma dag) ----------
  function hashString(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function puzzleFor(date, level) {
    const id = puzzleId(date, level);
    if (!puzzleCache.has(id)) {
      const rng = mulberry32(hashString(`${SEED_VERSION}|${id}`));
      puzzleCache.set(id, Crossword.generate(HP_WORDS, { ...LEVELS[level], rng, attempts: 40 }));
    }
    return puzzleCache.get(id);
  }

  // ---------- Öppna ett korsord ----------
  function open(date, level) {
    if (state) { stopTimer(); save(); }
    const puzzle = puzzleFor(date, level);
    const sig = signature(puzzle);
    const saved = progressAll()[puzzleId(date, level)];
    const blank = (v) => puzzle.grid.map((row) => row.map(() => v));
    const first = puzzle.words[0];
    state = {
      date, level, puzzle, sig,
      entries: blank(""), revealed: blank(false), wrong: blank(false),
      seconds: 0, hints: 0, done: false, gaveUp: false,
      sel: { r: first.row, c: first.col }, dir: first.dir, warnedFull: false,
    };
    if (saved && saved.sig === sig) {
      Object.assign(state, {
        entries: saved.entries, revealed: saved.revealed, wrong: saved.wrong,
        seconds: saved.seconds, hints: saved.hints, done: saved.done, gaveUp: saved.gaveUp,
      });
    }
    paused = false;
    try { history.replaceState(null, "", `#${date}/${level}`); } catch { /* inbäddad vy */ }
    setup();
  }

  function setup() {
    const { puzzle } = state;
    cellWords = puzzle.grid.map((row) => row.map(() => ({})));
    puzzle.words.forEach((w, i) => forEachCell(w, (r, c) => (cellWords[r][c][w.dir] = i)));
    boardEl.classList.toggle("solved", state.done && !state.gaveUp);
    renderBoard();
    renderClues();
    renderHeader();
    renderPause();
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
  const playable = () => !state.done && !paused;

  // ---------- Rendering ----------
  function renderHeader() {
    const isToday = state.date === todayKey();
    const yesterday = state.date === addDays(todayKey(), -1);
    $("kicker").textContent = isToday ? "Idag" : yesterday ? "Igår" : "Arkiv";
    $("date-title").textContent = longDate(state.date);
    $("prev-day").disabled = state.date <= FIRST_DAY;
    $("next-day").disabled = isToday;
    const all = progressAll();
    document.querySelectorAll("#difficulty button").forEach((b) => {
      const p = all[puzzleId(state.date, b.dataset.level)];
      b.setAttribute("aria-selected", b.dataset.level === state.level);
      b.classList.toggle("is-solved", !!(p && p.done && !p.gaveUp));
    });
    $("difficulty").style.setProperty("--i", LEVEL_KEYS.indexOf(state.level));
  }

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
        } else {
          el.classList.add("block");
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
        li.addEventListener("click", () => { selectWord(i); setCluesOpen(false); });
        list.appendChild(li);
      });
    }
  }

  function update() {
    const { puzzle, entries, revealed, wrong, sel } = state;
    const cw = currentWord();
    const active = new Set(cw ? cellsOf(cw).map(([r, c]) => r + "," + c) : []);
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c]) continue;
        const el = cellEls[r][c];
        el.querySelector(".ch").textContent = entries[r][c];
        el.classList.toggle("in-word", active.has(r + "," + c) && !state.done);
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
    $("cc-num").textContent = cw ? `${cw.number} ${DIR_NAME[cw.dir]}` : "";
    $("cc-clue").textContent = cw ? `${cw.clue} (${cw.word.length})` : "";
    $("btn-solve").textContent = state.done ? "Visa lösningen" : "Ge upp och visa lösningen";
  }

  function scrollClueIntoView() {
    if (!matchMedia("(min-width: 740px) and (min-height: 560px)").matches) return;
    const li = document.querySelector(`.clues li[data-index="${currentWordIndex()}"]`);
    if (li) li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------- Navigering i rutnätet ----------
  function selectCell(r, c) {
    if (!isLetter(r, c) || paused) return;
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
    if (paused) return;
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
    const cells = cellsOf(currentWord());
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
    if (!playable()) return;
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
    if (!playable()) return;
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
    for (let r = 0; r < puzzle.rows; r++)
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c]) continue;
        if (state.entries[r][c] !== puzzle.grid[r][c]) state.revealed[r][c] = true;
        state.entries[r][c] = puzzle.grid[r][c];
        state.wrong[r][c] = false;
      }
    win(true);
  }

  function resetPuzzle() {
    const blank = (v) => state.puzzle.grid.map((row) => row.map(() => v));
    Object.assign(state, {
      entries: blank(""), revealed: blank(false), wrong: blank(false),
      seconds: 0, hints: 0, done: false, gaveUp: false, warnedFull: false,
    });
    boardEl.classList.remove("solved");
    save();
    renderHeader();
    update();
    startTimer();
  }

  // ---------- Klart ----------
  function nextTarget() {
    const all = progressAll();
    const open = (d, l) => { const p = all[puzzleId(d, l)]; return !(p && p.done); };
    const nextLevel = LEVEL_KEYS.slice(LEVEL_KEYS.indexOf(state.level) + 1).find((l) => open(state.date, l));
    if (nextLevel) return { date: state.date, level: nextLevel, label: `Spela ${LEVELS[nextLevel].label.toLowerCase()}` };
    for (let d = state.date === todayKey() ? addDays(state.date, -1) : todayKey(); d >= FIRST_DAY; d = addDays(d, -1)) {
      if (open(d, state.level)) return { date: d, level: state.level, label: d === todayKey() ? "Dagens korsord" : "Ett från arkivet" };
    }
    return null;
  }

  function win(gaveUp) {
    state.done = true;
    state.gaveUp = gaveUp;
    stopTimer();
    update();
    if (!gaveUp) {
      boardEl.classList.add("solved");
      boardEl.querySelectorAll(".cell.letter").forEach((el, i) => (el.style.animationDelay = i * 12 + "ms"));
    }
    save();
    renderHeader();
    setTimeout(showWinDialog, gaveUp ? 0 : 900);
  }

  function showWinDialog() {
    $("win-title").textContent = state.gaveUp ? "Här är lösningen" : "Snyggt löst!";
    $("win-icon").textContent = state.gaveUp ? "📖" : "🎉";
    const hints = state.hints ? ` med ${state.hints} ${state.hints === 1 ? "ledtråd" : "ledtrådar"}` : " helt utan hjälp";
    $("win-summary").textContent = state.gaveUp
      ? "Ingen fara – gå igenom orden nedan så sitter de nästa gång."
      : `${LEVELS[state.level].label} · ${formatTime(state.seconds)}${hints}.`;
    $("win-words").innerHTML = state.puzzle.words
      .slice()
      .sort((a, b) => a.word.localeCompare(b.word, "sv"))
      .map((w) => `<li><b>${w.word.toLowerCase()}</b> – ${w.clue}</li>`)
      .join("");
    const next = nextTarget();
    $("win-next").hidden = !next;
    if (next) $("win-next").textContent = next.label;
    $("win-next").onclick = () => { $("win-dialog").close(); if (next) open(next.date, next.level); };
    $("win-dialog").showModal();
  }

  // ---------- Statistik (räknas fram ur sparade korsord) ----------
  function computeStats() {
    const all = progressAll();
    const per = Object.fromEntries(LEVEL_KEYS.map((k) => [k, { solved: 0, clean: 0, best: null }]));
    const solvedDays = new Set();
    let words = 0;
    for (const [id, p] of Object.entries(all)) {
      const [date, level] = id.split("|");
      if (!per[level] || !p.done || p.gaveUp) continue;
      const s = per[level];
      s.solved++;
      if (!p.hints) { s.clean++; if (s.best === null || p.seconds < s.best) s.best = p.seconds; }
      solvedDays.add(date);
      words += puzzleFor(date, level).words.length;
    }
    let streak = 0;
    let d = solvedDays.has(todayKey()) ? todayKey() : addDays(todayKey(), -1);
    while (solvedDays.has(d)) { streak++; d = addDays(d, -1); }
    let best = 0, run = 0, prev = null;
    for (const day of [...solvedDays].sort()) {
      run = prev && addDays(prev, 1) === day ? run + 1 : 1;
      best = Math.max(best, run);
      prev = day;
    }
    return { per, streak, bestStreak: best, words, days: solvedDays.size };
  }

  function showStats() {
    const st = computeStats();
    let html = `<div class="stat-grid">
      <div class="stat hero-stat"><div class="v">🔥 ${st.streak}</div><div class="l">${st.streak === 1 ? "dag" : "dagar"} i rad</div></div>
      <div class="stat"><div class="v">${st.bestStreak}</div><div class="l">Längsta svit</div></div>
      <div class="stat"><div class="v">${st.days}</div><div class="l">Dagar spelade</div></div>
      <div class="stat"><div class="v">${st.words}</div><div class="l">HP-ord lösta</div></div></div>`;
    for (const [key, lvl] of Object.entries(LEVELS)) {
      const s = st.per[key];
      html += `<div class="list-title">${lvl.label}</div><div class="stat-grid">
        <div class="stat"><div class="v">${s.solved}</div><div class="l">Lösta</div></div>
        <div class="stat"><div class="v">${s.clean}</div><div class="l">Utan hjälp</div></div>
        <div class="stat"><div class="v">${s.best === null ? "–" : formatTime(s.best)}</div><div class="l">Bästa tid</div></div></div>`;
    }
    $("stats-body").innerHTML = html;
    $("stats-dialog").showModal();
  }

  // ---------- Arkiv ----------
  function renderCalendar() {
    const { y, m } = calMonth;
    const all = progressAll();
    const first = new Date(y, m, 1);
    const title = first.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
    $("cal-title").textContent = title.charAt(0).toUpperCase() + title.slice(1);
    const today = todayKey();
    $("cal-prev").disabled = toKey(first) <= FIRST_DAY;
    $("cal-next").disabled = toKey(new Date(y, m + 1, 1)) > today;
    let html = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"].map((d) => `<div class="dow">${d}</div>`).join("");
    const offset = (first.getDay() + 6) % 7;
    html += "<div></div>".repeat(offset);
    const days = new Date(y, m + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const k = toKey(new Date(y, m, day));
      const enabled = k >= FIRST_DAY && k <= today;
      const dots = LEVEL_KEYS.map((l) => {
        const p = all[puzzleId(k, l)];
        const cls = p && p.done && !p.gaveUp ? "solved" : p && (p.done || p.entries.some((row) => row.some(Boolean))) ? "started" : "";
        return `<i class="dot ${l} ${cls}"></i>`;
      }).join("");
      const cls = ["day", k === today ? "today" : "", k === state.date ? "current" : ""].join(" ");
      html += `<button class="${cls}" data-date="${k}" ${enabled ? "" : "disabled"}><span>${day}</span><span class="dots">${enabled ? dots : ""}</span></button>`;
    }
    const cal = $("calendar");
    cal.innerHTML = html;
    cal.querySelectorAll("button.day").forEach((b) =>
      b.addEventListener("click", () => { $("archive-dialog").close(); open(b.dataset.date, state.level); })
    );
  }

  function showArchive() {
    const d = fromKey(state.date);
    calMonth = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
    $("archive-dialog").showModal();
  }
  function shiftMonth(delta) {
    const d = new Date(calMonth.y, calMonth.m + delta, 1);
    calMonth = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  }

  // ---------- Timer & paus ----------
  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }
  function renderTimer() { $("timer").textContent = formatTime(state.seconds); }
  function startTimer() {
    stopTimer();
    renderTimer();
    if (state.done || paused) return;
    timerId = setInterval(() => {
      if (document.hidden) return;
      state.seconds++;
      renderTimer();
      if (state.seconds % 5 === 0) save();
    }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  function setPaused(value) {
    if (state.done && value) return;
    paused = value;
    renderPause();
    if (paused) { stopTimer(); save(); } else startTimer();
  }
  function renderPause() {
    $("paused").hidden = !paused;
    boardEl.classList.toggle("blurred", paused);
    $("btn-pause").disabled = state.done;
    $("btn-pause").innerHTML = paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="solid" d="M8 5.5v13l10-6.5z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
    $("btn-pause").setAttribute("aria-label", paused ? "Fortsätt" : "Pausa");
  }

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

  function buildKeyboard() {
    const rows = ["QWERTYUIOPÅ", "ASDFGHJKLÖÄ", "ZXCVBNM⌫"];
    const kb = $("keyboard");
    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      for (const k of row) {
        const b = document.createElement("button");
        b.className = "key" + (k === "⌫" ? " wide" : "");
        if (k === "⌫") b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5H20a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H8.5L2.5 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/></svg>';
        else b.textContent = k;
        b.setAttribute("aria-label", k === "⌫" ? "Sudda" : k);
        b.addEventListener("click", () => (k === "⌫" ? backspace() : typeLetter(k)));
        rowEl.appendChild(b);
      }
      kb.appendChild(rowEl);
    }
  }

  // ---------- Tema ----------
  function applyTheme() {
    const t = prefs().theme;
    const root = document.documentElement;
    if (t === "light" || t === "dark") { root.dataset.theme = t; root.dataset.themeByApp = ""; }
    else if ("themeByApp" in root.dataset) { delete root.dataset.theme; delete root.dataset.themeByApp; }
    const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = dark ? "#000000" : "#f2f2f7"));
  }
  function renderThemePicker() {
    const t = prefs().theme || "auto";
    const keys = ["auto", "light", "dark"];
    document.querySelectorAll("#theme-picker button").forEach((b) => b.setAttribute("aria-checked", b.dataset.themeValue === t));
    $("theme-picker").style.setProperty("--i", keys.indexOf(t));
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

  // ---------- Ledtrådsark (telefon) ----------
  function setCluesOpen(open) {
    document.body.classList.toggle("clues-open", open);
    if (open) {
      const li = document.querySelector(`.clues li[data-index="${currentWordIndex()}"]`);
      if (li) li.scrollIntoView({ block: "center" });
    }
  }

  // ---------- Händelser ----------
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey || paused) return;
    const k = e.key;
    if (k === "Escape") return setCluesOpen(false);
    if (/^[a-zåäö]$/i.test(k)) { typeLetter(k.toUpperCase()); e.preventDefault(); }
    else if (k === "Backspace" || k === "Delete") { backspace(); e.preventDefault(); }
    else if (k === "ArrowRight") { arrow(0, 1); e.preventDefault(); }
    else if (k === "ArrowLeft") { arrow(0, -1); e.preventDefault(); }
    else if (k === "ArrowDown") { arrow(1, 0); e.preventDefault(); }
    else if (k === "ArrowUp") { arrow(-1, 0); e.preventDefault(); }
    else if (k === "Tab" || k === "Enter") { stepWord(e.shiftKey ? -1 : 1); e.preventDefault(); }
    else if (k === " ") { selectCell(state.sel.r, state.sel.c); e.preventDefault(); }
  });

  document.querySelectorAll("#difficulty button").forEach((b) =>
    b.addEventListener("click", () => b.dataset.level !== state.level && open(state.date, b.dataset.level))
  );
  $("prev-day").addEventListener("click", () => state.date > FIRST_DAY && open(addDays(state.date, -1), state.level));
  $("next-day").addEventListener("click", () => state.date < todayKey() && open(addDays(state.date, 1), state.level));
  $("btn-check").addEventListener("click", () => playable() && check());
  $("btn-letter").addEventListener("click", () => playable() && reveal([[state.sel.r, state.sel.c]]));
  $("btn-word").addEventListener("click", () => playable() && reveal(cellsOf(currentWord())));
  $("btn-more").addEventListener("click", () => $("more-dialog").showModal());
  $("btn-reset").addEventListener("click", async () => {
    $("more-dialog").close();
    if (await confirmBox("Börja om?", "Allt du fyllt i rensas och tiden nollställs.", "Börja om")) resetPuzzle();
  });
  $("btn-solve").addEventListener("click", async () => {
    $("more-dialog").close();
    if (state.done) return showWinDialog();
    if (await confirmBox("Ge upp?", "Lösningen visas och korsordet räknas inte som löst.", "Ge upp")) { setPaused(false); solveAll(); }
  });
  $("btn-pause").addEventListener("click", () => setPaused(!paused));
  $("btn-resume").addEventListener("click", () => setPaused(false));
  $("prev-clue").addEventListener("click", () => stepWord(-1));
  $("next-clue").addEventListener("click", () => stepWord(1));
  $("btn-stats").addEventListener("click", showStats);
  $("btn-archive").addEventListener("click", showArchive);
  $("btn-settings").addEventListener("click", () => { renderThemePicker(); $("settings-dialog").showModal(); });
  $("open-help").addEventListener("click", () => { $("settings-dialog").close(); $("help-dialog").showModal(); });
  document.querySelectorAll("#theme-picker button").forEach((b) =>
    b.addEventListener("click", () => { setPref("theme", b.dataset.themeValue); applyTheme(); renderThemePicker(); })
  );
  $("btn-clues").addEventListener("click", () => setCluesOpen(true));
  $("cc-open").addEventListener("click", () => setCluesOpen(true));
  $("clues-close").addEventListener("click", () => setCluesOpen(false));
  $("scrim").addEventListener("click", () => setCluesOpen(false));
  // Stäng ark med "Klar"/"Avbryt" eller genom att trycka utanför.
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("dialog.sheet").forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); })
  );
  $("cal-prev").addEventListener("click", () => shiftMonth(-1));
  $("cal-next").addEventListener("click", () => shiftMonth(1));
  $("archive-today").addEventListener("click", () => { $("archive-dialog").close(); open(todayKey(), state.level); });
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => document.hidden && save());
  window.addEventListener("hashchange", () => {
    const t = fromHash();
    if (t && (t.date !== state.date || t.level !== state.level)) open(t.date, t.level);
  });

  function fromHash() {
    const [date, level] = location.hash.slice(1).split("/");
    return validDate(date) ? { date, level: LEVELS[level] ? level : LEVELS[prefs().level] ? prefs().level : "medium" } : null;
  }

  // ---------- Start ----------
  applyTheme();
  buildKeyboard();
  const firstVisit = !load(PREFS_KEY);
  const startAt = fromHash() || { date: todayKey(), level: LEVELS[prefs().level] ? prefs().level : "medium" };
  open(startAt.date, startAt.level);
  if (firstVisit) $("help-dialog").showModal();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
