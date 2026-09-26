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
  let undoStack = []; // ändringar som kan ångras i det öppna korsordet
  let enterDir = ""; // "prev" / "next": från vilket håll rutnätet glider in
  let lastClue = -1;
  let combo = 0; // rätta ord/svar i rad
  let cur = { date: null, level: "medium" }; // dag och nivå som visas, i båda lägena
  let mek = null; // pågående omgång meningskomplettering
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Kort vibration där enheten stöder det (Android). iOS ignorerar anropet.
  let hapticLabel = null;
  function haptic(pattern) {
    try {
      if (navigator.vibrate) { navigator.vibrate(pattern); return; }
      if (prefs().haptics === false) return;
      // iPhone: Safari saknar vibrate(), men ett dolt iOS-reglage ger en lätt stöt när det slås om.
      // Hoppa över när tangentbordet används, så att fokus inte flyttas från textfältet.
      if (document.activeElement && document.activeElement.id === "kb-input") return;
      if (!hapticLabel) {
        hapticLabel = document.createElement("label");
        hapticLabel.className = "haptic";
        hapticLabel.setAttribute("aria-hidden", "true");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("switch", "");
        input.tabIndex = -1;
        hapticLabel.appendChild(input);
        document.body.appendChild(hapticLabel);
      }
      hapticLabel.click();
    } catch { /* ej stöd */ }
  }
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
  const mekId = (date, level, kind) => `${date}|${kind || mode()}-${level}`;
  const progressKey = (date, level) => (isQuiz() ? mekId(date, level) : puzzleId(date, level));
  const signature = (p) => p.rows + "x" + p.cols + ":" + p.words.map((w) => w.word).join(",");

  function save() {
    if (!state) return;
    const all = progressAll();
    const { entries, revealed, wrong, locked, seconds, hints, done, gaveUp, mcTried, mcMistakes } = state;
    all[puzzleId(state.date, state.level)] = {
      sig: state.sig, entries, revealed, wrong, locked, seconds, hints, done, gaveUp, mcTried, mcMistakes,
      words: state.puzzle.words.length,
    };
    store(PROGRESS_KEY, all);
    setPref("level", state.level);
  }

  const prefs = () => load(PREFS_KEY) || {};
  const MODES = ["cross", "ord", "mek", "eng", "mat"];
  const mode = () => (MODES.includes(prefs().mode) ? prefs().mode : "cross");
  const isQuiz = () => mode() !== "cross"; // Ord och Meningar är frågelägen
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
  function open(date, level, dir) {
    stopTimer();
    if (state) save();
    if (mek) saveMek();
    enterDir = dir || "";
    cur = { date, level };
    const puzzle = puzzleFor(date, level);
    const sig = signature(puzzle);
    const saved = progressAll()[puzzleId(date, level)];
    const blank = (v) => puzzle.grid.map((row) => row.map(() => v));
    const first = puzzle.words[0];
    state = {
      date, level, puzzle, sig,
      entries: blank(""), revealed: blank(false), wrong: blank(false), locked: blank(false),
      seconds: 0, hints: 0, done: false, gaveUp: false,
      mcTried: {}, mcMistakes: 0, // felaktiga val och fel ord/bokstäver
      sel: { r: first.row, c: first.col }, dir: first.dir, warnedFull: false,
    };
    if (saved && saved.sig === sig) {
      Object.assign(state, {
        entries: saved.entries, revealed: saved.revealed, wrong: saved.wrong,
        seconds: saved.seconds, hints: saved.hints, done: saved.done, gaveUp: saved.gaveUp,
        mcTried: saved.mcTried || {}, mcMistakes: saved.mcMistakes || 0,
        locked: saved.locked || blank(false),
      });
    }
    paused = false;
    undoStack = [];
    combo = 0;
    setHash();
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
    animate(boardEl, "enter" + (enterDir ? " from-" + enterDir : ""), 900);
  }

  // Startar om en CSS-animation genom att sätta klasser på nytt.
  function animate(el, classes, ms) {
    const list = classes.split(" ");
    el.classList.remove(...list, "from-prev", "from-next");
    void el.offsetWidth;
    el.classList.add(...list);
    clearTimeout(el._animTimer);
    el._animTimer = setTimeout(() => el.classList.remove(...list), ms);
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
  const fixed = (r, c) => state.revealed[r][c] || state.locked[r][c]; // får inte ändras
  function setHash() {
    try { history.replaceState(null, "", `#${cur.date}/${cur.level}${isQuiz() ? "/" + mode() : ""}`); } catch { /* inbäddad vy */ }
  }

  // ---------- Rendering ----------
  function renderHeader() {
    const isToday = cur.date === todayKey();
    const yesterday = cur.date === addDays(todayKey(), -1);
    const d = fromKey(cur.date);
    const weekday = d.toLocaleDateString("sv-SE", { weekday: "long" });
    const dateOpts = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) dateOpts.year = "numeric";
    const date = d.toLocaleDateString("sv-SE", dateOpts);
    $("date-title").textContent = isToday ? "Idag" : yesterday ? "Igår" : weekday.charAt(0).toUpperCase() + weekday.slice(1);
    if (renderHeader.last !== cur.date) {
      if (renderHeader.last) { animate($("date-title"), "swap", 400); animate($("kicker"), "swap", 400); }
      renderHeader.last = cur.date;
    }
    $("kicker").textContent = isToday || yesterday ? `${weekday} ${date}` : date;
    $("prev-day").disabled = cur.date <= FIRST_DAY;
    $("next-day").disabled = isToday;
    const all = progressAll();
    document.querySelectorAll("#difficulty button").forEach((b) => {
      const p = all[progressKey(cur.date, b.dataset.level)];
      b.setAttribute("aria-selected", b.dataset.level === cur.level);
      b.classList.toggle("is-solved", !!(p && p.done && !p.gaveUp));
    });
    $("difficulty").style.setProperty("--i", LEVEL_KEYS.indexOf(cur.level));
    renderModeSwitch();
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
        el.style.setProperty("--d", (r + c) * 16 + "ms");
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
        el.classList.toggle("locked", state.locked[r][c] && !revealed[r][c]);
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
    // Med svarsalternativ visas inte ordets längd, så att den inte avslöjar svaret.
    $("cc-clue").textContent = cw ? (mcOn() ? cw.clue : `${cw.clue} (${cw.word.length})`) : "";
    const ci = currentWordIndex();
    if (ci !== lastClue) {
      lastClue = ci;
      animate($("cc-open"), "swap", 400);
      if (cw && !state.done) cellsOf(cw).forEach(([r, c], i) => { cellEls[r][c].style.setProperty("--i", i); if (!cellEls[r][c].classList.contains("flash")) animate(cellEls[r][c], "word-in", 600); });
    }
    renderStrip(cw);
    const letters = puzzle.grid.flat().filter(Boolean).length;
    const filled = entries.flat().filter(Boolean).length;
    $("progress").style.setProperty("--p", Math.round((filled / letters) * 100) + "%");
    if (document.body.classList.contains("compact")) keepInView();
    $("btn-solve").textContent = state.done ? "Visa lösningen" : "Ge upp och visa lösningen";
    $("btn-undo").disabled = state.done || !undoStack.length;
    for (const id of ["btn-erase", "btn-check", "btn-letter"]) $(id).disabled = state.done;
    renderChoices();
  }

  // Ordets bokstäver i ledtrådskortet, så att hela ordet syns även när rutnätet är skrollat.
  function renderStrip(w) {
    const strip = $("cc-strip");
    if (!w) { strip.innerHTML = ""; return; }
    strip.innerHTML = cellsOf(w).map(([r, c]) => {
      const cls = r === state.sel.r && c === state.sel.c ? "cur" : state.locked[r][c] ? "ok" : state.wrong[r][c] ? "bad" : "";
      return `<b class="${cls}">${state.entries[r][c] || ""}</b>`;
    }).join("");
  }

  // I fokusläget (tangentbordet uppe) skrollas rutnätet så att hela ordet syns.
  function keepInView() {
    const area = $("board-area"), w = currentWord();
    if (!w) return;
    const cells = cellsOf(w).map(([r, c]) => cellEls[r][c].getBoundingClientRect());
    const a = area.getBoundingClientRect();
    const top = Math.min(...cells.map((x) => x.top)), bottom = Math.max(...cells.map((x) => x.bottom));
    const sel = cellEls[state.sel.r][state.sel.c].getBoundingClientRect();
    const pad = 10;
    let t = top, b = bottom;
    if (bottom - top > a.height - pad * 2) { t = sel.top; b = sel.bottom; }
    if (t < a.top + pad) area.scrollTop -= a.top + pad - t;
    else if (b > a.bottom - pad) area.scrollTop += b - (a.bottom - pad);
    // I sidled (när rutorna är förstorade): hela ordet om det får plats, annars rutan man står i.
    if (area.scrollWidth > area.clientWidth + 1) {
      let l = Math.min(...cells.map((x) => x.left)), r = Math.max(...cells.map((x) => x.right));
      if (r - l > a.width - pad * 2) { l = sel.left; r = sel.right; }
      if (l < a.left + pad) area.scrollLeft -= a.left + pad - l;
      else if (r > a.right - pad) area.scrollLeft += r - (a.right - pad);
    }
  }

  // ---------- Svarsalternativ (A–E), som på högskoleprovet ----------
  const LABELS = ["A", "B", "C", "D", "E"];
  const choiceCache = new Map();
  const mcOn = () => false; // flervalet är nu ett eget läge (Ord)
  // Hur fel visas i korsordet: "off", "word" (när ordet är ifyllt) eller "letter" (direkt).
  const checkMode = () => prefs().checkMode || (prefs().autocheck ? "letter" : "word");
  const showTime = () => prefs().showTime !== false;

  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Rätt ord plus fyra andra HP-ord, helst lika långa. Samma alternativ varje gång för samma ord.
  function choicesFor(w) {
    const key = `${state.date}|${state.level}|${w.word}`;
    if (!choiceCache.has(key)) {
      const rng = mulberry32(hashString(`${SEED_VERSION}|val|${key}`));
      const inPuzzle = new Set(state.puzzle.words.map((x) => x.word));
      // Inga ord med samma förklaring som rätt svar, annars finns två rätta alternativ.
      // Alla alternativ är lika långa (om det finns tillräckligt många), så längden avslöjar inget.
      const pool = shuffled(HP_WORDS.filter(([x, c]) => !inPuzzle.has(x) && c !== w.clue).map(([x]) => x), rng)
        .sort((a, b) => Math.abs(a.length - w.word.length) - Math.abs(b.length - w.word.length));
      choiceCache.set(key, shuffled([w.word, ...pool.slice(0, 4)], rng));
    }
    return choiceCache.get(key);
  }

  function renderChoices() {
    const box = $("choices");
    document.body.classList.toggle("mc", mcOn());
    if (!mcOn() || !state) { box.innerHTML = ""; return; }
    const w = currentWord();
    const solved = cellsOf(w).every(([r, c]) => state.entries[r][c] === state.puzzle.grid[r][c]);
    const tried = state.mcTried[w.word] || [];
    const html = choicesFor(w).map((word, i) => {
      const cls = word === w.word && solved ? "right" : tried.includes(word) ? "wrong" : "";
      const off = state.done || paused || solved || tried.includes(word);
      return `<button class="choice ${cls}" style="--i:${i}" data-word="${word}" ${off ? "disabled" : ""}>` +
        `<span class="opt">${LABELS[i]}</span><span class="opt-word">${word.toLowerCase()}</span></button>`;
    }).join("");
    if (box.dataset.html !== html) {
      const newWord = box.dataset.word !== w.word;
      box.innerHTML = html; box.dataset.html = html; box.dataset.word = w.word;
      if (newWord) animate(box, "rise", 700);
    }
  }

  function nextOpenWord() {
    const order = ["across", "down"].flatMap((d) =>
      state.puzzle.words.map((w, i) => [w, i]).filter(([w]) => w.dir === d).map(([, i]) => i)
    );
    const pos = order.indexOf(currentWordIndex());
    for (let k = 1; k < order.length; k++) {
      const i = order[(pos + k) % order.length];
      if (cellsOf(state.puzzle.words[i]).some(([r, c]) => !state.entries[r][c])) return i;
    }
    return -1;
  }

  function pickChoice(word) {
    if (!playable()) return;
    const w = currentWord();
    const btn = $("choices").querySelector(`[data-word="${word}"]`);
    if (word === w.word) {
      remember(cellsOf(w));
      cellsOf(w).forEach(([r, c], i) => {
        if (fixed(r, c)) return;
        state.entries[r][c] = w.word[i];
        state.wrong[r][c] = false;
        const el = cellEls[r][c];
        el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
      });
      lockWord(cellsOf(w));
      update();
      celebrateWord(cellsOf(w));
      afterChange();
      if (!state.done) {
        const next = nextOpenWord();
        if (next >= 0) setTimeout(() => { if (!state.done) selectWord(next); }, 450);
      }
    } else {
      state.mcTried[w.word] = [...(state.mcTried[w.word] || []), word];
      state.mcMistakes++;
      combo = 0;
      haptic(25);
      if (btn) { btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake"); }
      setTimeout(() => { update(); save(); }, 280);
      toast(`${word.toLowerCase()} betyder ${(HP_WORDS.find(([x]) => x === word) || ["", "något annat"])[1]}`);
    }
  }
  function pickIndex(i) {
    const w = currentWord();
    const word = choicesFor(w)[i];
    if (word && mcOn()) pickChoice(word);
  }
  $("choices").addEventListener("click", (e) => {
    const b = e.target.closest(".choice");
    if (b && !b.disabled) pickChoice(b.dataset.word);
  });

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
    focusInput();
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
    focusInput();
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
  // Sparar hur rutorna såg ut innan en ändring, så att den kan ångras.
  function remember(cells) {
    undoStack.push({
      cells: cells.map(([r, c]) => [r, c, state.entries[r][c], state.revealed[r][c], state.wrong[r][c]]),
      sel: { ...state.sel }, dir: state.dir, hints: state.hints,
    });
    if (undoStack.length > 200) undoStack.shift();
  }

  function undo() {
    if (state.done || paused || !undoStack.length) return;
    const step = undoStack.pop();
    for (const [r, c, entry, revealed, wrong] of step.cells) {
      if (state.locked[r][c]) continue; // rätt ord är låsta
      state.entries[r][c] = entry;
      state.revealed[r][c] = revealed;
      state.wrong[r][c] = wrong;
    }
    Object.assign(state, { sel: step.sel, dir: step.dir, hints: step.hints, warnedFull: false });
    update();
    save();
  }

  function typeLetter(ch) {
    if (!playable()) return;
    const { r, c } = state.sel;
    if (!fixed(r, c)) {
      const changed = state.entries[r][c] !== ch;
      if (changed) remember([[r, c]]);
      state.entries[r][c] = ch;
      state.wrong[r][c] = false;
      const el = cellEls[r][c];
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
      if (checkMode() === "letter" && ch !== state.puzzle.grid[r][c]) {
        state.wrong[r][c] = true;
        if (changed) state.mcMistakes++;
        combo = 0;
        animate(el, "shake", 400);
        haptic(25);
      }
    }
    moveWithinWord(1);
    // Hoppa förbi låsta rutor så att man kan skriva vidare direkt.
    while (fixed(state.sel.r, state.sel.c) && moveWithinWord(1)) { /* nästa */ }
    update();
    evaluateWordsAt(r, c);
    afterChange();
  }

  function lockWord(cells) {
    for (const [r, c] of cells) { state.locked[r][c] = true; state.wrong[r][c] = false; }
  }

  // Ett ord som visats som rätt: låses, blinkar grönt, gnistrar och räknas i "i rad".
  function celebrateWord(cells) {
    haptic(12);
    cells.forEach(([r, c], i) => {
      const el = cellEls[r][c];
      el.style.setProperty("--i", i);
      animate(el, "flash", 1000);
    });
    sparkle(cells);
    combo++;
    if (combo >= 2) comboToast(combo);
  }

  // När ett ord blir helt ifyllt avgör inställningen vad som visas:
  // "off": bara en neutral våg (avslöjar inget), "word"/"letter": rätt ord låses och firas,
  // och i läget "word" markeras ett felaktigt ord först nu.
  function evaluateWordsAt(r, c) {
    const how = checkMode();
    for (const dir of ["across", "down"]) {
      const wi = cellWords[r][c][dir];
      if (wi === undefined) continue;
      const cells = cellsOf(state.puzzle.words[wi]);
      if (!cells.every(([rr, cc]) => state.entries[rr][cc])) continue;
      if (cells.every(([rr, cc]) => fixed(rr, cc))) continue; // redan klart
      const right = cells.every(([rr, cc]) => state.entries[rr][cc] === state.puzzle.grid[rr][cc]);
      if (how === "off") {
        cells.forEach(([rr, cc], i) => { cellEls[rr][cc].style.setProperty("--i", i); animate(cellEls[rr][cc], "ripple", 900); });
      } else if (right) {
        lockWord(cells);
        update();
        celebrateWord(cells);
      } else if (how === "word") {
        cells.forEach(([rr, cc], i) => {
          if (fixed(rr, cc)) return;
          state.wrong[rr][cc] = true;
          cellEls[rr][cc].style.setProperty("--i", i);
          animate(cellEls[rr][cc], "shake", 450);
        });
        state.mcMistakes++;
        combo = 0;
        haptic(25);
        update();
      }
    }
  }

  function backspace() {
    if (!playable()) return;
    const { r, c } = state.sel;
    if (state.entries[r][c] && !fixed(r, c)) {
      remember([[r, c]]);
      state.entries[r][c] = "";
    } else if (moveWithinWord(-1)) {
      const { r: pr, c: pc } = state.sel;
      if (state.entries[pr][pc] && !fixed(pr, pc)) {
        remember([[pr, pc]]);
        state.entries[pr][pc] = "";
      }
      state.wrong[pr][pc] = false;
    }
    state.wrong[r][c] = false;
    update();
    save();
  }

  // Sudda: tömmer rutan, eller hela ordet om rutan redan är tom.
  function erase() {
    if (!playable()) return;
    const { r, c } = state.sel;
    const cells = (state.entries[r][c] ? [[r, c]] : cellsOf(currentWord()))
      .filter(([rr, cc]) => state.entries[rr][cc] && !fixed(rr, cc));
    if (!cells.length) return;
    remember(cells);
    for (const [rr, cc] of cells) { state.entries[rr][cc] = ""; state.wrong[rr][cc] = false; }
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
  // När man slår på "visa fel": lås redan rätta ord och markera fel enligt valt läge.
  function applyCheckMode() {
    if (!state || state.done) return;
    const how = checkMode();
    if (how === "off") return;
    const { puzzle, entries } = state;
    for (const w of puzzle.words) {
      const cells = cellsOf(w);
      if (!cells.every(([r, c]) => entries[r][c])) continue;
      if (cells.every(([r, c]) => entries[r][c] === puzzle.grid[r][c])) lockWord(cells);
      else if (how === "word") cells.forEach(([r, c]) => { if (!fixed(r, c)) state.wrong[r][c] = true; });
    }
    if (how === "letter")
      for (let r = 0; r < puzzle.rows; r++)
        for (let c = 0; c < puzzle.cols; c++)
          if (puzzle.grid[r][c] && entries[r][c] && entries[r][c] !== puzzle.grid[r][c]) state.wrong[r][c] = true;
    update();
    save();
  }

  function check() {
    let wrong = 0, empty = 0;
    const { puzzle, entries } = state;
    for (let r = 0; r < puzzle.rows; r++)
      for (let c = 0; c < puzzle.cols; c++) {
        if (!puzzle.grid[r][c]) continue;
        if (!entries[r][c]) empty++;
        else if (entries[r][c] !== puzzle.grid[r][c]) { state.wrong[r][c] = true; wrong++; }
      }
    // Hela ord som stämmer låses och får en grön blinkning.
    const newlyRight = [];
    for (const w of puzzle.words) {
      const cells = cellsOf(w);
      if (cells.every(([r, c]) => entries[r][c] === puzzle.grid[r][c]) && !cells.every(([r, c]) => fixed(r, c))) {
        lockWord(cells);
        newlyRight.push(cells);
      }
    }
    update();
    newlyRight.forEach((cells, k) => setTimeout(() => cells.forEach(([r, c], i) => {
      cellEls[r][c].style.setProperty("--i", i);
      animate(cellEls[r][c], "flash", 1000);
    }), k * 120));
    save();
    if (wrong) toast(`${wrong} ${wrong === 1 ? "bokstav är fel" : "bokstäver är fel"}`);
    else toast(empty ? "Inga fel hittills – fortsätt så! ✨" : "Allt rätt!");
  }

  function reveal(cells) {
    let changed = false;
    remember(cells);
    for (const [r, c] of cells) {
      if (state.entries[r][c] === state.puzzle.grid[r][c]) continue;
      state.entries[r][c] = state.puzzle.grid[r][c];
      state.revealed[r][c] = true;
      state.wrong[r][c] = false;
      changed = true;
    }
    if (changed) state.hints++;
    else undoStack.pop();
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
      entries: blank(""), revealed: blank(false), wrong: blank(false), locked: blank(false),
      seconds: 0, hints: 0, done: false, gaveUp: false, warnedFull: false,
      mcTried: {}, mcMistakes: 0,
    });
    boardEl.classList.remove("solved");
    undoStack = [];
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
      confetti();
      haptic([15, 60, 15, 60, 30]);
    }
    save();
    renderHeader();
    setTimeout(showWinDialog, gaveUp ? 0 : 1300);
  }

  const PARTY = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#007aff", "#af52de", "#ff2d55", "#5ac8fa"];
  function fxLayer(ms) {
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), ms);
    return layer;
  }

  // Konfetti som skjuts upp från båda nedre hörnen och en explosion i mitten.
  function confetti(amount = 1) {
    if (reduceMotion() || !document.body.animate) return;
    const layer = fxLayer(3600);
    const w = innerWidth, h = innerHeight;
    const shoot = (x, y, angleMin, angleMax, n, power) => {
      for (let i = 0; i < n; i++) {
        const p = document.createElement("i");
        p.style.background = PARTY[(Math.random() * PARTY.length) | 0];
        p.style.left = x + "px"; p.style.top = y + "px";
        const shape = i % 4;
        if (shape === 0) p.style.borderRadius = "50%";
        if (shape === 1) { p.style.width = "5px"; p.style.height = "14px"; }
        layer.appendChild(p);
        const a = (angleMin + Math.random() * (angleMax - angleMin)) * Math.PI / 180;
        const f = power * (0.55 + Math.random() * 0.6);
        const dx = Math.cos(a) * f, dy = -Math.sin(a) * f;
        const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720);
        p.animate([
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx * 0.8}px, ${dy}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${dx}px, ${dy + h * 0.75}px) rotate(${spin}deg)`, opacity: 0 },
        ], { duration: 2200 + Math.random() * 1200, easing: "cubic-bezier(.15,.7,.3,1)", fill: "forwards" });
      }
    };
    const power = Math.min(w, h) * 0.95;
    shoot(0, h, 50, 80, 55 * amount, power);
    shoot(w, h, 100, 130, 55 * amount, power);
    shoot(w / 2, h * 0.42, 0, 360, 40 * amount, power * 0.5);
  }

  // Små gnistor som sprutar ut från ett ord som blivit rätt.
  function sparkle(cells) {
    if (reduceMotion() || !document.body.animate || !cells.length) return;
    const a = cellEls[cells[0][0]][cells[0][1]].getBoundingClientRect();
    const b = cellEls[cells[cells.length - 1][0]][cells[cells.length - 1][1]].getBoundingClientRect();
    const layer = fxLayer(1200);
    const n = 10 + cells.length * 2;
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const x = a.left + (b.right - a.left) * t, y = a.top + (b.bottom - a.top) * t;
      const p = document.createElement("b");
      p.className = "spark";
      p.textContent = i % 3 === 0 ? "✦" : "";
      p.style.left = x + "px"; p.style.top = y + "px";
      p.style.color = i % 2 ? "#ffcc00" : "#34c759";
      if (!p.textContent) p.style.background = i % 2 ? "#ffcc00" : "#34c759";
      layer.appendChild(p);
      const ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 42;
      p.animate([
        { transform: "translate(-50%,-50%) scale(.2)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist * 1.4}px), calc(-50% + ${Math.sin(ang) * dist * 1.4 + 10}px)) scale(.3)`, opacity: 0 },
      ], { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
    }
  }

  function comboToast(n) {
    const el = $("combo");
    el.textContent = n >= 5 ? `🔥 ${n} i rad – grymt!` : n >= 3 ? `🔥 ${n} i rad!` : "✨ 2 i rad";
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1500);
  }

  function showWinDialog() {
    $("win-title").textContent = state.gaveUp ? "Här är lösningen" : "Snyggt löst!";
    $("win-icon").textContent = state.gaveUp ? "📖" : "🎉";
    const hints = state.hints ? ` med ${state.hints} ${state.hints === 1 ? "ledtråd" : "ledtrådar"}` : " helt utan hjälp";
    $("win-summary").textContent = state.gaveUp
      ? "Ingen fara – gå igenom orden nedan så sitter de nästa gång."
      : `${LEVELS[state.level].label}${showTime() ? " · " + formatTime(state.seconds) : ""}${hints}` +
        (state.mcMistakes ? ` och ${state.mcMistakes} fel.` : ".");
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

  // ---------- Statistik (räknas fram ur allt som sparats) ----------
  const AREA_NAMES = { cross: "Korsord", ord: "Ord", mek: "Meningar", eng: "Engelska", mat: "Matte" };
  // Korta tips per område, visas i "Öva på det här".
  const AREA_TIPS = {
    cross: "Lös korsordet utan tips först – och använd Ordlistan för ord du fastnar på.",
    ord: "Läs betydelsen efter varje fel och slå upp ordet i Ordlistan. Ordstammar och prefix hjälper dig att gissa smart.",
    mek: "Läs hela meningen innan du tittar på alternativen, och leta efter signalord som men, därför och trots.",
    eng: "Läs meningen högt i huvudet med varje alternativ. Tänk på vanliga ordpar (depend on, interested in).",
    mat: "Tryck på 💡 Visa hur man tänker efter varje uppgift du missar.",
    procent: "Procent av = gånger. Förändring jämförs alltid med det ursprungliga värdet.",
    brak: "Gemensam nämnare först – lägg aldrig ihop nämnarna.",
    ekv: "Gör samma sak på båda sidor och kontrollera svaret genom att sätta in det.",
    stat: "Medelvärde: summa / antal. Median: sortera först.",
    rakna: "Parenteser → potenser → gånger/delat → plus/minus.",
    geo: "Rita en figur. Vinkelsumma 180°, area π·r², Pythagoras a² + b² = c².",
    prop: "Räkna ut värdet för en del eller en enhet först.",
    fart: "Hastighet = sträcka / tid, och tid i timmar: 45 min = 0,75 h.",
    pot: "Samma bas: addera exponenter vid gånger, subtrahera vid delat.",
    alg: "Kvadreringsregeln har en mittenterm: (a + b)² = a² + 2ab + b².",
    fun: "Lutning k = Δy / Δx. Sätt parentes runt negativa tal.",
    sann: "Sannolikhet = gynnsamma / möjliga. \"Och\" betyder gånger.",
    kva: "Testa flera värden: 0, 1, ett bråk och ett negativt tal.",
    nog: "Lös inte – pröva (1) ensam, (2) ensam och sist båda tillsammans.",
  };
  const ACC_MIN = 3; // så få svar räcker inte för att dra slutsatser

  let wordClueMap = null, engClueMap = null;
  const wordClues = () => wordClueMap || (wordClueMap = new Map(HP_WORDS));
  const engClues = () => engClueMap || (engClueMap = new Map(HP_ENG_VOCAB));

  function computeStats() {
    const all = progressAll();
    const per = Object.fromEntries(LEVEL_KEYS.map((k) => [k, { solved: 0, clean: 0, best: null }]));
    const solvedDays = new Set();
    let words = 0, crossDone = 0, crossClean = 0;
    const quiz = Object.fromEntries(["ord", "mek", "eng", "mat"].map((k) => [k, { rounds: 0, right: 0, total: 0, perfect: 0, bolts: 0, helped: 0 }]));
    const cats = {}; // matteområden
    const missed = { ord: new Map(), eng: new Map() };
    const days = {}; // datum → { cross, ord, mek, eng, mat }
    const bump = (date, k, n) => { (days[date] = days[date] || {})[k] = (days[date][k] || 0) + n; };
    for (const [id, p] of Object.entries(all)) {
      const [date, level] = id.split("|");
      const qk = level.split("-")[0];
      if (quiz[qk]) {
        const st = quiz[qk];
        const ok = (a, i) => a !== null && p.correct && a === p.correct[i];
        const answered = p.answers.filter((a) => a !== null).length;
        const right = p.answers.filter(ok).length;
        // Träffsäkerhet räknas på alla besvarade frågor, även i omgångar som inte är klara.
        st.right += right; st.total += answered;
        if (answered) bump(date, qk, answered);
        if (p.helped) st.helped += p.helped.filter(Boolean).length;
        if (qk === "mat" && p.times) st.bolts += p.answers.filter((a, i) => ok(a, i) && !(p.helped && p.helped[i]) && p.times[i] !== null && p.times[i] <= 10).length;
        if (qk === "mat" && p.cats) p.cats.forEach((c, i) => {
          if (!c || p.answers[i] === null) return;
          const s = (cats[c] = cats[c] || { right: 0, total: 0 });
          s.total++; if (ok(p.answers[i], i)) s.right++;
        });
        // Missade ord i Ord och Engelska.
        if ((qk === "ord" || qk === "eng") && p.keys) p.keys.forEach((w, i) => {
          if (!w || p.answers[i] === null || ok(p.answers[i], i)) return;
          const clue = (qk === "ord" ? wordClues() : engClues()).get(w);
          if (clue) missed[qk].set(w, clue);
        });
        if (!p.done) continue;
        st.rounds++;
        if (right === p.answers.length) st.perfect++;
        solvedDays.add(date);
        continue;
      }
      if (!per[level] || !p.done || p.gaveUp) continue;
      const s = per[level];
      s.solved++; crossDone++;
      if (!p.hints) { s.clean++; crossClean++; if (s.best === null || p.seconds < s.best) s.best = p.seconds; }
      solvedDays.add(date);
      const n = p.words || puzzleFor(date, level).words.length;
      words += n;
      bump(date, "cross", n);
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
    // Träffsäkerhet per del (0–1, null = för lite data). Korsord: andel lösta utan tips.
    const acc = { cross: crossDone ? crossClean / crossDone : null };
    for (const k of ["ord", "mek", "eng", "mat"]) acc[k] = quiz[k].total >= ACC_MIN ? quiz[k].right / quiz[k].total : null;
    const answeredTotal = Object.values(quiz).reduce((s, q) => s + q.total, 0);
    const rightTotal = Object.values(quiz).reduce((s, q) => s + q.right, 0);
    return { per, streak, bestStreak: best, words, days: solvedDays.size, quiz, cats, missed, activity: days, acc, crossDone, answeredTotal, rightTotal };
  }

  // Förslag på vad man bör öva på: svagaste områdena först, sedan delar man inte provat.
  function recommendations(st) {
    const recs = [];
    const areas = [];
    for (const k of ["ord", "mek", "eng", "mat"]) if (st.acc[k] !== null) areas.push({ key: k, mode: k, name: AREA_NAMES[k], acc: st.acc[k], n: st.quiz[k].total });
    for (const [c, s] of Object.entries(st.cats)) if (s.total >= ACC_MIN) areas.push({ key: c, mode: "mat", name: "Matte · " + HP_MATH.CATS[c], acc: s.right / s.total, n: s.total });
    if (st.crossDone >= 2 && st.acc.cross < 0.5) areas.push({ key: "cross", mode: "cross", name: "Korsord utan tips", acc: st.acc.cross, n: st.crossDone });
    areas.sort((a, b) => a.acc - b.acc);
    for (const a of areas.filter((x) => x.acc < 0.8).slice(0, 3)) recs.push({ ...a, tip: AREA_TIPS[a.key] });
    for (const k of ["cross", "ord", "mek", "eng", "mat"]) {
      const tried = k === "cross" ? st.crossDone > 0 : st.quiz[k].total > 0;
      if (!tried && recs.length < 4) recs.push({ key: k, mode: k, name: AREA_NAMES[k], acc: null, tip: `Du har inte provat ${AREA_NAMES[k]} än – en omgång tar bara några minuter.` });
    }
    return recs;
  }

  const MODE_COLORS = { cross: "var(--c-cross)", ord: "var(--c-ord)", mek: "var(--c-mek)", eng: "var(--c-eng)", mat: "var(--c-mat)" };
  const pctText = (x) => (x === null ? "–" : Math.round(x * 100) + "%");

  // Radardiagram (spindeldiagram) över alla fem delar.
  function radarSvg(acc) {
    const keys = ["cross", "ord", "mek", "eng", "mat"], R = 78, cx = 110, cy = 100;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const ring = (f) => keys.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ");
    const shape = keys.map((k, i) => pt(i, R * Math.max(0.04, acc[k] || 0)).map((v) => v.toFixed(1)).join(",")).join(" ");
    const labels = keys.map((k, i) => {
      const [x, y] = pt(i, R + 16);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${x < cx - 5 ? "end" : x > cx + 5 ? "start" : "middle"}"><tspan class="r-name">${AREA_NAMES[k]}</tspan><tspan class="r-val" x="${x.toFixed(1)}" dy="13">${pctText(acc[k])}</tspan></text>`;
    }).join("");
    const dots = keys.map((k, i) => acc[k] === null ? "" : `<circle class="r-dot" style="--i:${i}" cx="${pt(i, R * Math.max(0.04, acc[k])).map((v) => v.toFixed(1)).join('" cy="')}" r="3.5" fill="${MODE_COLORS[k]}"/>`).join("");
    return `<svg class="radar" viewBox="0 0 220 215" role="img" aria-label="Träffsäkerhet per del">
      ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon class="r-ring" points="${ring(f)}"/>`).join("")}
      ${keys.map((_, i) => { const [x, y] = pt(i, R); return `<line class="r-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("")}
      <polygon class="r-shape" points="${shape}" style="transform-origin:${cx}px ${cy}px"/>${dots}${labels}</svg>`;
  }

  // Staplar för de senaste 14 dagarna, uppdelade per del.
  function activityHtml(activity) {
    const keys = ["cross", "ord", "mek", "eng", "mat"];
    const dayList = Array.from({ length: 14 }, (_, i) => addDays(todayKey(), i - 13));
    const totals = dayList.map((d) => keys.reduce((s, k) => s + ((activity[d] || {})[k] || 0), 0));
    const max = Math.max(10, ...totals);
    const bars = dayList.map((d, i) => {
      const a = activity[d] || {};
      const segs = keys.filter((k) => a[k]).map((k) => `<i style="height:${(a[k] / max) * 100}%;background:${MODE_COLORS[k]}"></i>`).join("");
      const wd = new Date(d + "T12:00").toLocaleDateString("sv-SE", { weekday: "narrow" });
      return `<div class="bar${d === todayKey() ? " today" : ""}" style="--i:${i}" title="${d}: ${totals[i]}"><div class="bar-stack">${segs}</div><span>${wd}</span></div>`;
    }).join("");
    const legend = keys.map((k) => `<span><i style="background:${MODE_COLORS[k]}"></i>${AREA_NAMES[k]}</span>`).join("");
    const sum = totals.reduce((s, v) => s + v, 0);
    return `<div class="chart-card"><div class="chart-head"><b>Senaste två veckorna</b><span>${sum} ord och frågor</span></div><div class="bars">${bars}</div><div class="legend">${legend}</div></div>`;
  }

  function hbar(name, acc, n, color, i) {
    return `<div class="hbar" style="--i:${i}"><div class="hbar-top"><span>${name}</span><span>${n ? `<small>${n} svar</small>` : ""}<b>${pctText(acc)}</b></span></div>
      <div class="hbar-track"><i style="--w:${acc === null ? 0 : Math.round(acc * 100)}%;background:${color}"></i></div></div>`;
  }

  function showStats() {
    const st = computeStats();
    const empty = !st.answeredTotal && !st.crossDone;
    let html = `<div class="stat-grid">
      <div class="stat hero-stat"><div class="v">🔥 ${st.streak}</div><div class="l">${st.streak === 1 ? "dag" : "dagar"} i rad<br><small>Längsta svit: ${st.bestStreak}</small></div></div>
      <div class="stat"><div class="v">${st.days}</div><div class="l">Dagar spelade</div></div>
      <div class="stat"><div class="v">${st.answeredTotal + st.words}</div><div class="l">Ord och frågor</div></div>
      <div class="stat"><div class="v">${st.answeredTotal ? Math.round((st.rightTotal / st.answeredTotal) * 100) : 0}%</div><div class="l">Rätt totalt</div></div></div>`;
    if (empty) {
      html += `<div class="chart-card empty-stats"><div class="big-emoji">📊</div><b>Här samlas allt du gör</b><p>Spela ett korsord eller en omgång Ord, Meningar, Engelska eller Matte så visas diagram och förslag på vad du bör öva på.</p></div>`;
    } else {
      html += activityHtml(st.activity);
      html += `<div class="chart-card"><div class="chart-head"><b>Din profil</b><span>andel rätt per del</span></div>${radarSvg(st.acc)}</div>`;
      // Öva på det här
      const recs = recommendations(st);
      if (recs.length) {
        html += `<div class="list-title">Öva på det här</div><div class="recs">` + recs.map((r, i) => `
          <div class="rec" style="--i:${i}">
            <div class="rec-top"><span class="rec-dot" style="background:${MODE_COLORS[r.mode]}"></span><b>${r.name}</b>${r.acc !== null ? `<span class="rec-pct">${pctText(r.acc)} rätt</span>` : ""}</div>
            <p>${r.tip}</p>
            <button class="rec-go" data-go="${r.mode}">Öva nu</button>
          </div>`).join("") + `</div>`;
      } else {
        html += `<div class="list-title">Öva på det här</div><div class="chart-card"><p class="all-good">🌟 Du har minst 80 % rätt överallt – höj nivån till Svår!</p></div>`;
      }
      // Matte per område
      const catRows = Object.entries(st.cats).filter(([, s]) => s.total).sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total);
      if (catRows.length) {
        html += `<div class="list-title">Matte per område</div><div class="chart-card hbars two">` +
          catRows.map(([c, s], i) => hbar(HP_MATH.CATS[c], s.right / s.total, s.total, "var(--c-mat)", i)).join("") + `</div>`;
      }
      // Delarna
      html += `<div class="list-title">Frågelägen</div><div class="chart-card hbars">` +
        ["ord", "mek", "eng", "mat"].map((k, i) => hbar(AREA_NAMES[k] + (st.quiz[k].rounds ? ` · ${st.quiz[k].rounds} omg.` : ""), st.quiz[k].total ? st.quiz[k].right / st.quiz[k].total : null, st.quiz[k].total, MODE_COLORS[k], i)).join("") +
        `<div class="mini-stats"><span>⚡ ${st.quiz.mat.bolts} blixtsvar</span><span>💡 ${st.quiz.mat.helped} med tankehjälp</span><span>🏆 ${Object.values(st.quiz).reduce((s, q) => s + q.perfect, 0)} omgångar med alla rätt</span></div></div>`;
      // Missade ord
      const missOrd = [...st.missed.ord.keys()].slice(-12).reverse(), missEng = [...st.missed.eng.keys()].slice(-12).reverse();
      if (missOrd.length || missEng.length) {
        html += `<div class="list-title">Ord att repetera</div><div class="chart-card"><ul class="miss">` +
          missOrd.map((w) => `<li><b>${escapeHtml(w.toLowerCase())}</b><span>${escapeHtml(st.missed.ord.get(w))}</span></li>`).join("") +
          missEng.map((w) => `<li class="en"><b>${escapeHtml(w)}</b><span>${escapeHtml(st.missed.eng.get(w))}</span></li>`).join("") + `</ul></div>`;
      }
    }
    // Korsord per nivå
    html += `<div class="list-title">Korsord</div><div class="stat-grid">` + Object.entries(LEVELS).map(([key, lvl]) => {
      const s = st.per[key];
      return `<div class="stat"><div class="v">${s.solved}</div><div class="l">${lvl.label}${s.best !== null ? `<br><small>Bäst ${formatTime(s.best)}</small>` : ""}</div></div>`;
    }).join("") + `</div>`;
    $("stats-body").innerHTML = html;
    $("stats-body").classList.remove("anim"); void $("stats-body").offsetWidth; $("stats-body").classList.add("anim");
    $("stats-body").querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      $("stats-dialog").close();
      if (b.dataset.go !== mode()) setMode(b.dataset.go);
      haptic(10);
    }));
    if (!reduceMotion()) {
      $("stats-body").querySelectorAll(".stat .v").forEach((el) => {
        const m = el.textContent.match(/^(\D*)(\d+)(%?)$/);
        if (!m) return;
        const [, prefix, target, suffix] = m;
        const start = performance.now();
        const tick = (t) => {
          const k = Math.min(1, (t - start) / 700);
          el.textContent = prefix + Math.round(+target * (1 - Math.pow(1 - k, 3))) + suffix;
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
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
        const p = all[progressKey(k, l)];
        const started = p && (p.done || (p.entries ? p.entries.some((row) => row.some(Boolean)) : p.answers.some((a) => a !== null)));
        const cls = p && p.done && !p.gaveUp ? "solved" : started ? "started" : "";
        return `<i class="dot ${l} ${cls}"></i>`;
      }).join("");
      const cls = ["day", k === today ? "today" : "", k === cur.date ? "current" : ""].join(" ");
      html += `<button class="${cls}" data-date="${k}" ${enabled ? "" : "disabled"}><span>${day}</span><span class="dots">${enabled ? dots : ""}</span></button>`;
    }
    const cal = $("calendar");
    cal.innerHTML = html;
    cal.querySelectorAll("button.day").forEach((b) =>
      b.addEventListener("click", () => { $("archive-dialog").close(); openCurrent(b.dataset.date, cur.level); })
    );
  }

  function showArchive() {
    const d = fromKey(cur.date);
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
  const active = () => (isQuiz() ? mek : state); // det som tiden räknas för
  const saveActive = () => (isQuiz() ? saveMek() : save());
  function renderTimer() { const a = active(); $("timer").textContent = formatTime(a ? a.seconds : 0); }
  function startTimer() {
    stopTimer();
    renderTimer();
    const a = active();
    if (!a || a.done || paused) return;
    timerId = setInterval(() => {
      if (document.hidden) return;
      a.seconds++;
      renderTimer();
      if (a.seconds % 5 === 0) saveActive();
    }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  function setPaused(value) {
    const a = active();
    if (!a || (a.done && value)) return;
    paused = value;
    if (paused) kbInput.blur();
    renderPause();
    if (paused) { stopTimer(); saveActive(); } else startTimer();
  }
  function renderPause() {
    if (state) renderChoices();
    const inMek = isQuiz();
    $("paused").hidden = !paused || inMek;
    $("mek-paused").hidden = !paused || !inMek;
    document.body.classList.toggle("is-paused", paused);
    boardEl.classList.toggle("blurred", paused && !inMek);
    const a = active();
    $("btn-pause").disabled = !a || a.done;
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

  // ---------- Ordlista med sökning och dagens ord ----------
  const normalize = (t) => t.toLowerCase();
  function wordOfDay(date) {
    const rng = mulberry32(hashString(`${SEED_VERSION}|dagens-ord|${date}`));
    return HP_WORDS[Math.floor(rng() * HP_WORDS.length)];
  }
  function renderWordList() {
    const q = normalize($("word-search").value.trim());
    const hl = (t) => {
      const safe = escapeHtml(t);
      if (!q) return safe;
      const i = t.toLowerCase().indexOf(q);
      return i < 0 ? safe : escapeHtml(t.slice(0, i)) + "<mark>" + escapeHtml(t.slice(i, i + q.length)) + "</mark>" + escapeHtml(t.slice(i + q.length));
    };
    const hits = HP_WORDS.filter(([w, c]) => !q || w.toLowerCase().includes(q) || c.toLowerCase().includes(q));
    $("word-count").textContent = q ? `${hits.length} träffar` : `${HP_WORDS.length} ord`;
    let html = "", letter = "";
    for (const [w, c] of hits.slice(0, 400)) {
      if (w[0] !== letter) { letter = w[0]; html += `<div class="letter-head">${letter}</div>`; }
      html += `<div class="w"><b>${hl(w.toLowerCase())}</b> <span>– ${hl(c)}</span></div>`;
    }
    if (hits.length > 400) html += `<div class="empty">Visar 400 av ${hits.length}. Sök för att hitta fler.</div>`;
    $("word-list").innerHTML = html || `<div class="empty">Inga ord hittades.</div>`;
  }
  function showWords() {
    kbInput.blur();
    const [w, c] = wordOfDay(cur.date || todayKey());
    $("word-of-day").innerHTML = `<div class="wod-label">Dagens ord</div><div class="wod-word">${escapeHtml(w)}</div><div class="wod-clue">${escapeHtml(c)}</div>`;
    $("word-search").value = "";
    renderWordList();
    $("words-dialog").showModal();
    animate($("word-of-day"), "enter", 700);
    $("word-list").scrollTop = 0;
  }
  let searchTimer;
  $("word-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderWordList, 120); });
  $("btn-words").addEventListener("click", showWords);
  $("open-words").addEventListener("click", () => { $("settings-dialog").close(); showWords(); });

  // ---------- Lägen: korsord och frågelägen (Ord, Meningar, Engelska, Matte) ----------
  const MODE_NAMES = { cross: "Korsord", ord: "Ord", mek: "Meningar", eng: "Engelska", mat: "Matte" };
  const SEEN_KEYS = { ord: "seenOrd", mek: "seenMek", eng: "seenEng", mat: "seenMat" };
  function openCurrent(date, level, dir) {
    if (isQuiz()) openMek(date, level, dir);
    else open(date, level, dir);
  }
  function renderModeSwitch() {
    const m = mode();
    if (SEEN_KEYS[m] && !prefs()[SEEN_KEYS[m]]) setPref(SEEN_KEYS[m], true);
    // Samma knappar finns i navigationsfältet (iPad) och i flikraden (iPhone).
    document.querySelectorAll("[data-mode]").forEach((b) => {
      b.setAttribute("aria-selected", b.dataset.mode === m);
      b.classList.toggle("is-new", !!SEEN_KEYS[b.dataset.mode] && !prefs()[SEEN_KEYS[b.dataset.mode]]);
    });
    placeModeThumb();
    $("nav-title").textContent = MODE_NAMES[m];
  }
  // Tummen i lägesväljaren följer den valda knappen (segmenten är olika breda).
  function placeModeThumb() {
    const sw = $("mode-switch"), btn = sw.querySelector("button[aria-selected=true]");
    if (!btn || !btn.offsetWidth) return;
    sw.style.setProperty("--tw", btn.offsetWidth + "px");
    sw.style.setProperty("--tx", btn.offsetLeft - 2 + "px");
  }
  addEventListener("resize", placeModeThumb);
  if (document.fonts) document.fonts.ready.then(placeModeThumb);

  function applyMode(anim) {
    const inQuiz = isQuiz();
    document.body.classList.toggle("mode-mek", inQuiz);
    for (const k of ["ord", "mek", "eng", "mat"]) document.body.classList.toggle("quiz-" + k, mode() === k);
    $("mek").hidden = !inQuiz;
    if (inQuiz) { kbInput.blur(); setCluesOpen(false); }
    renderModeSwitch();
    renderHeader();
    renderPause();
    if (anim) animate(document.querySelector(".play"), "mode-in", 500);
  }
  function setMode(m) {
    if (m === mode()) return;
    stopTimer();
    paused = false;
    if (isQuiz()) saveMek(); else save();
    setPref("mode", m);
    if (m !== "cross") openMek(cur.date, cur.level);
    else open(cur.date, cur.level);
    applyMode(true);
    setHash();
  }

  // ---------- Frågeomgångar ----------
  // Alla frågelägen byggs som en lista frågor: { label, prompt(svar, rätt), options[], correct, explain, review }.
  // Omgången räknas fram ur datum och nivå, så bara svaren behöver sparas.
  const MEK_SETS = { easy: { 1: 8 }, medium: { 1: 3, 2: 7 }, hard: { 2: 4, 3: 6 } };
  const ENG_SETS = { easy: { vocab: 6, 1: 4 }, medium: { vocab: 5, 1: 2, 2: 3 }, hard: { vocab: 4, 2: 2, 3: 4 } };
  const MEK_LABELS = ["A", "B", "C", "D", "E"];
  const escapeHtml = (t) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  // Delar upp en mening i text och luckor; luckorna fylls med rätt ord när frågan är besvarad.
  function gapSentence(text, fill, cls) {
    const parts = text.split("___");
    return parts.map((t, i) => {
      if (i === parts.length - 1) return escapeHtml(t);
      const word = fill ? fill[i] : "";
      return `${escapeHtml(t)}<span class="gap ${word ? "filled " + (cls || "") : ""}" style="--g:${i}"><span class="gap-word">${escapeHtml(word) || "&nbsp;"}</span></span>`;
    }).join("");
  }

  function gapQuestion(q, rng, label) {
    const order = shuffled(q[1].map((_, i) => i), rng);
    return {
      label,
      prompt: (answered, right) => gapSentence(q[0], answered ? q[1][0] : null, right ? "ok" : "fixed"),
      options: order.map((src) => q[1][src].map(escapeHtml).join(" – ")),
      correct: order.indexOf(0),
      review: gapSentence(q[0], q[1][0], "plain"),
    };
  }

  // Ord: som ORD-delen – ett ord och fem betydelser. Svår nivå har felsvar från ord som liknar rätt ord.
  function ordRound(rng, level) {
    const lenOk = { easy: (L) => L <= 7, medium: (L) => L >= 6 && L <= 10, hard: (L) => L >= 8 }[level];
    const all = HP_WORDS.map((_, i) => i);
    return shuffled(all.filter((i) => lenOk(HP_WORDS[i][0].length)), rng).slice(0, 10).map((id) => {
      const [w, clue] = HP_WORDS[id];
      let cand = all.filter((j) => j !== id && HP_WORDS[j][1] !== clue);
      const near = level === "hard"
        ? cand.filter((j) => HP_WORDS[j][0].slice(0, 2) === w.slice(0, 2) || HP_WORDS[j][0].length === w.length)
        : level === "medium" ? cand.filter((j) => Math.abs(HP_WORDS[j][0].length - w.length) <= 1) : [];
      if (near.length >= 4) cand = near;
      const opts = shuffled([id, ...shuffled(cand, rng).slice(0, 4)], rng);
      return {
        id, key: w, label: "Vad betyder ordet?", big: true,
        prompt: () => `<span class="ord-word">${escapeHtml(w.toLowerCase())}</span>`,
        options: opts.map((j) => escapeHtml(HP_WORDS[j][1])),
        correct: opts.indexOf(id),
        explain: `${escapeHtml(w.toLowerCase())} = ${escapeHtml(clue)}`,
        review: `<b>${escapeHtml(w.toLowerCase())}</b> – ${escapeHtml(clue)}`,
      };
    });
  }

  function mekRound(rng, level) {
    let ids = [];
    for (const [d, n] of Object.entries(MEK_SETS[level])) {
      const pool = HP_MEK.map((q, i) => [q, i]).filter(([q]) => q[2] === +d).map(([, i]) => i);
      ids = ids.concat(shuffled(pool, rng).slice(0, n));
    }
    return shuffled(ids, rng).map((id) => ({ id, ...gapQuestion(HP_MEK[id], rng, "Välj det som passar bäst") }));
  }

  // Engelska (ELF): ordförråd och meningar med luckor, fyra alternativ som på provet.
  function engRound(rng, level) {
    const set = ENG_SETS[level];
    const vocab = shuffled(HP_ENG_VOCAB.map((_, i) => i), rng).slice(0, set.vocab).map((id) => {
      const [w, meaning] = HP_ENG_VOCAB[id];
      const others = shuffled(HP_ENG_VOCAB.map((_, j) => j).filter((j) => j !== id), rng).slice(0, 3);
      const opts = shuffled([id, ...others], rng);
      return {
        id: "v" + id, key: w, label: "Which is closest in meaning?", big: true,
        prompt: () => `<span class="ord-word eng">${escapeHtml(w)}</span>`,
        options: opts.map((j) => escapeHtml(HP_ENG_VOCAB[j][1])),
        correct: opts.indexOf(id),
        explain: `${escapeHtml(w)} = ${escapeHtml(meaning)}`,
        review: `<b>${escapeHtml(w)}</b> – ${escapeHtml(meaning)}`,
      };
    });
    let gaps = [];
    for (const [d, n] of Object.entries(set)) {
      if (d === "vocab") continue;
      const pool = HP_ENG_GAP.map((q, i) => [q, i]).filter(([q]) => q[2] === +d).map(([, i]) => i);
      gaps = gaps.concat(shuffled(pool, rng).slice(0, n).map((id) => ({ id: "g" + id, ...gapQuestion(HP_ENG_GAP[id], rng, "Choose the best alternative") })));
    }
    return shuffled(vocab.concat(gaps), rng);
  }

  // Matte: nya uppgifter varje dag från generatorn i mat.js.
  function matRound(rng, level) {
    return HP_MATH.round(rng, level, shuffled).map((t, i) => ({
      id: t.type + i, label: { kva: "KVA · Jämför kvantiteterna", nog: "NOG · Räcker informationen?" }[t.type] || "XYZ · Beräkna",
      prompt: () => `<span class="math">${t.prompt}</span>`,
      options: t.options, correct: t.correct, fixed: t.fixed, cat: t.cat, steps: t.steps,
      explain: t.why, review: `<span class="math">${t.prompt}</span> <b>${t.options[t.correct]}</b>`,
    }));
  }

  const ROUNDS = { ord: ordRound, mek: mekRound, eng: engRound, mat: matRound };
  function quizRound(kind, date, level) {
    const rng = mulberry32(hashString(`${SEED_VERSION}|${kind}|${date}|${level}`));
    const qs = ROUNDS[kind](rng, level);
    return { qs, sig: qs.map((q) => q.id).join(","), correct: qs.map((q) => q.correct) };
  }

  function openMek(date, level, dir) {
    stopTimer();
    if (state) save();
    if (mek) saveMek();
    cur = { date, level };
    const kind = mode();
    const round = quizRound(kind, date, level);
    const saved = progressAll()[mekId(date, level, kind)];
    mek = { kind, date, level, ...round, answers: round.qs.map(() => null), times: round.qs.map(() => null), helped: round.qs.map(() => false), shown: 0, seconds: 0, done: false };
    if (saved && saved.sig === round.sig) Object.assign(mek, { answers: saved.answers, times: saved.times || mek.times, helped: saved.helped || mek.helped, seconds: saved.seconds, done: saved.done });
    mek.idx = Math.max(0, mek.answers.findIndex((a) => a === null));
    if (mek.done || mek.answers.every((a) => a !== null)) mek.idx = mek.qs.length - 1;
    paused = false;
    combo = 0;
    setHash();
    renderHeader();
    renderPause();
    renderMek(dir ? "from-" + dir : "");
    startTimer();
  }

  function saveMek() {
    if (!mek) return;
    const all = progressAll();
    all[mekId(mek.date, mek.level, mek.kind)] = {
      sig: mek.sig, answers: mek.answers, correct: mek.correct, times: mek.times, helped: mek.helped, seconds: mek.seconds, done: mek.done,
      cats: mek.qs.map((q) => q.cat || null),
      keys: mek.qs.map((q) => q.key || null), // ordet självt, så att statistiken tål att ordlistan växer
    };
    store(PROGRESS_KEY, all);
    setPref("level", mek.level);
  }

  function renderMekDots() {
    $("mek-dots").innerHTML = mek.qs.map((_, i) => {
      const a = mek.answers[i];
      const cls = a === null ? (i === mek.idx && !mek.done ? "current" : "") : a === mek.correct[i] ? "right" : "wrong";
      return `<i class="${cls}"></i>`;
    }).join("");
    $("mek-count").textContent = mek.done ? "Klart" : `Fråga ${mek.idx + 1} av ${mek.qs.length}`;
  }

  let questionShownAt = 0;
  function renderMek(enter) {
    renderMekDots();
    if (mek.done) return showMekResult(false);
    $("mek-body").hidden = false;
    $("mek-result").hidden = true;
    const i = mek.idx, q = mek.qs[i], answered = mek.answers[i];
    $("mek-label").textContent = q.label;
    $("mek-card").classList.toggle("big", !!q.big);
    $("mek-text").innerHTML = q.prompt(answered !== null, answered === q.correct);
    $("mek-options").classList.toggle("fixed", !!q.fixed);
    $("mek-options").innerHTML = q.options.map((text, k) => {
      let cls = "";
      if (answered !== null) cls = k === q.correct ? "right" : k === answered ? "wrong" : "dim";
      return `<button class="mek-opt ${cls}" data-k="${k}" style="--i:${k}" ${answered !== null ? "disabled" : ""}>` +
        `<span class="opt">${MEK_LABELS[k]}</span><span class="opt-word">${text}</span></button>`;
    }).join("");
    renderMekFeedback();
    mek.shown = answered === null && !mek.helped[i] ? 0 : mek.shown;
    renderSteps(false);
    if (answered === null) questionShownAt = performance.now();
    if (enter !== undefined) {
      animate($("mek-card"), "enter" + (enter ? " " + enter : ""), 600);
      animate($("mek-options"), "rise", 800);
    }
  }

  // Blixtsvar i Matte: rätt svar inom 10 sekunder, utan att ha tittat på stegen först.
  const BOLT_SECONDS = 10;
  const isBolt = (i) => mek.kind === "mat" && mek.answers[i] === mek.correct[i] && !mek.helped[i] && mek.times[i] !== null && mek.times[i] <= BOLT_SECONDS;

  // "Visa hur man tänker": stegen visas ett i taget. Före svaret räknas det som hjälp (inget blixtsvar).
  function renderSteps(animLast) {
    const q = mek.qs[mek.idx], box = $("mek-think");
    box.hidden = !q.steps;
    if (!q.steps) return;
    const answered = mek.answers[mek.idx] !== null;
    const n = q.steps.length, shown = Math.min(mek.shown, n);
    $("mek-steps").innerHTML = q.steps.slice(0, shown).map((s, k) =>
      `<li class="${animLast && (k === shown - 1 || animLast === "all") ? "in" : ""}${k === n - 1 ? " final" : ""}" style="--i:${animLast === "all" ? k : 0}"><span class="step-n">${k + 1}</span><span class="step-t">${s}</span></li>`).join("");
    const btn = $("mek-think-btn");
    btn.hidden = shown >= n;
    $("mek-think-label").textContent = shown === 0 ? (answered ? "Visa lösningen steg för steg" : "Visa hur man tänker") : answered ? "Visa resten av lösningen" : `Nästa steg (${shown + 1}/${n})`;
    box.classList.toggle("open", shown > 0);
  }
  function showStep() {
    const q = mek.qs[mek.idx];
    if (!q || !q.steps || paused) return;
    const answered = mek.answers[mek.idx] !== null;
    if (!answered && !mek.helped[mek.idx]) { mek.helped[mek.idx] = true; saveMek(); }
    // Efter svaret visas alla steg på en gång (med animation), före svaret ett i taget.
    const all = answered && mek.shown === 0;
    mek.shown = answered ? q.steps.length : mek.shown + 1;
    renderSteps(all ? "all" : true);
    haptic(8);
    const last = $("mek-steps").lastElementChild;
    if (last) requestAnimationFrame(() => ($("mek-think-btn").hidden ? last : $("mek-think-btn")).scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" }));
  }

  function renderMekFeedback() {
    const i = mek.idx, a = mek.answers[i], q = mek.qs[i];
    const fb = $("mek-feedback"), next = $("mek-next");
    if (a === null) { fb.innerHTML = ""; next.hidden = true; return; }
    const right = a === q.correct;
    const bolt = isBolt(i) ? ` <span class="bolt">⚡ Blixtsvar på ${mek.times[i]} s</span>` : "";
    const note = q.explain ? `<span class="fb-note">${q.explain}</span>` : "";
    fb.innerHTML = (right ? `<span class="fb ok">✓ Rätt!</span>${bolt}` : `<span class="fb bad">✕ Fel – rätt svar är ${MEK_LABELS[q.correct]}</span>`) + note;
    next.hidden = false;
    next.textContent = i === mek.qs.length - 1 ? "Se resultatet" : "Nästa fråga";
  }

  function answerMek(k) {
    if (!mek || mek.done || paused || mek.answers[mek.idx] !== null) return;
    const i = mek.idx;
    if (k < 0 || k >= mek.qs[i].options.length) return;
    mek.answers[i] = k;
    mek.times[i] = Math.max(1, Math.round((performance.now() - questionShownAt) / 1000));
    const right = k === mek.correct[i];
    renderMek();
    const btn = $("mek-options").querySelector(`[data-k="${k}"]`);
    if (right) {
      combo++;
      haptic(12);
      if (btn) animate(btn, "pulse", 700);
      if (isBolt(i)) boltFx(btn);
      else if (combo >= 2) comboToast(combo);
      sparkleAt($("mek-card"));
    } else {
      combo = 0;
      haptic(25);
      if (btn) animate(btn, "shake", 400);
    }
    animate($("mek-feedback"), "pop", 500);
    saveMek();
    renderMekDots();
    if (matchMedia("(pointer: fine)").matches) $("mek-next").focus({ preventScroll: true });
    // På iPhone: se till att förklaringen och Nästa-knappen syns.
    requestAnimationFrame(() => $("mek-next").scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" }));
  }

  // En blixt som slår ner vid ett snabbt, rätt svar.
  function boltFx(btn) {
    const el = $("combo");
    el.textContent = combo >= 3 ? `⚡ Blixt! ${combo} i rad` : "⚡ Blixtsvar!";
    el.classList.add("bolt-toast");
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.classList.remove("show", "bolt-toast"); }, 1500);
    if (btn) animate(btn, "zap", 700);
  }

  function nextMek() {
    if (!mek || mek.answers[mek.idx] === null) return;
    if (mek.idx < mek.qs.length - 1) {
      mek.idx++;
      mek.shown = 0;
      renderMek("from-next");
      $("mek").scrollTop = 0;
      return;
    }
    mek.done = true;
    stopTimer();
    saveMek();
    renderHeader();
    renderPause();
    showMekResult(true);
    $("mek").scrollTop = 0;
  }

  function showMekResult(celebrate) {
    renderMekDots();
    const n = mek.qs.length;
    const right = mek.answers.filter((a, i) => a === mek.correct[i]).length;
    const bolts = mek.qs.filter((_, i) => isBolt(i)).length;
    const pct = right / n;
    const msg = right === n ? "Alla rätt – perfekt!" : pct >= 0.8 ? "Riktigt bra!" : pct >= 0.5 ? "Bra jobbat!" : "Fortsätt öva – det sitter snart!";
    const circ = 2 * Math.PI * 54;
    const items = mek.qs.map((q, i) => {
      const ok = mek.answers[i] === mek.correct[i];
      return `<li class="${ok ? "ok" : "bad"}" style="--i:${i}"><span class="mark">${ok ? "✓" : "✕"}</span><span>${q.review || q.explain}${isBolt(i) ? " ⚡" : ""}${mek.helped[i] ? " 💡" : ""}</span></li>`;
    }).join("");
    const nextLevel = LEVEL_KEYS.slice(LEVEL_KEYS.indexOf(mek.level) + 1).find((l) => { const p = progressAll()[mekId(mek.date, l, mek.kind)]; return !(p && p.done); });
    $("mek-result").innerHTML = `
      <div class="result-card">
        <div class="ring" style="--circ:${circ};--off:${circ * (1 - pct)}">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="bar" cx="60" cy="60" r="54"/></svg>
          <div class="ring-num"><b id="mek-score">${right}</b><span>av ${n}</span></div>
        </div>
        <h2>${msg}</h2>
        <p>${MODE_NAMES[mek.kind]} · ${LEVELS[mek.level].label}${showTime() ? " · " + formatTime(mek.seconds) : ""}</p>
        ${mek.kind === "mat" ? `<p class="bolts">${"⚡".repeat(Math.min(bolts, 10)) || "–"} <span>${bolts} blixtsvar</span></p>` : ""}
        ${nextLevel ? `<button class="pill" id="mek-next-level">Spela ${LEVELS[nextLevel].label.toLowerCase()}</button>` : ""}
      </div>
      <div class="list-title">${mek.kind === "mat" ? "Uppgifter och svar" : "Rätt svar"}</div>
      <ul class="list mek-review">${items}</ul>`;
    $("mek-body").hidden = true;
    $("mek-result").hidden = false;
    const nl = $("mek-next-level");
    if (nl) nl.addEventListener("click", () => openCurrent(mek.date, nextLevel, "next"));
    if (celebrate) {
      animate($("mek-result"), "enter", 900);
      if (!reduceMotion()) {
        const el = $("mek-score"), start = performance.now();
        const tick = (t) => { const k = Math.min(1, (t - start) / 900); el.textContent = Math.round(right * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
      if (pct >= 0.8) { confetti(right === n ? 1 : 0.5); haptic([15, 60, 15, 60, 30]); }
    }
  }

  // Gnistor runt en textruta (meningsläget).
  function sparkleAt(el) {
    if (reduceMotion() || !document.body.animate) return;
    const r = el.getBoundingClientRect();
    const layer = fxLayer(1200);
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("b");
      p.className = "spark";
      p.textContent = i % 3 === 0 ? "✦" : "";
      const x = r.left + Math.random() * r.width, y = r.top + Math.random() * r.height;
      p.style.left = x + "px"; p.style.top = y + "px";
      p.style.color = i % 2 ? "#ffcc00" : "#34c759";
      if (!p.textContent) p.style.background = i % 2 ? "#ffcc00" : "#34c759";
      layer.appendChild(p);
      const ang = Math.random() * Math.PI * 2, dist = 20 + Math.random() * 40;
      p.animate([
        { transform: "translate(-50%,-50%) scale(.2)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(1)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 300, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
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

  // Rutstil, färgtema och typsnitt sparas som inställningar och sätts som attribut på <html>.
  const STYLE_DEFAULTS = { cells: "rounded", accent: "blue", font: "standard" };
  function applyStyle() {
    for (const key of Object.keys(STYLE_DEFAULTS)) document.documentElement.dataset[key] = prefs()[key] || STYLE_DEFAULTS[key];
  }
  function renderStylePickers() {
    for (const [key, picker] of [["cells", "cell-picker"], ["accent", "accent-picker"], ["font", "font-picker"]]) {
      const value = prefs()[key] || STYLE_DEFAULTS[key];
      document.querySelectorAll(`#${picker} button`).forEach((b) => b.setAttribute("aria-checked", b.dataset[key] === value));
    }
  }
  // Små förhandsvisningar av rutstilarna.
  document.querySelectorAll(".mini").forEach((m) => {
    m.innerHTML = ["s", "w", "w", "b", "", "b", "", "", "b"].map((c) => `<i class="${c}"></i>`).join("");
  });
  for (const [key, picker] of [["cells", "cell-picker"], ["accent", "accent-picker"], ["font", "font-picker"]]) {
    document.querySelectorAll(`#${picker} button`).forEach((b) => b.addEventListener("click", () => {
      setPref(key, b.dataset[key]);
      applyStyle();
      renderStylePickers();
      haptic(8);
      if (key !== "accent" && state && mode() === "cross") animate(boardEl, "enter", 900);
    }));
  }

  // ---------- Ledtrådsark (telefon) ----------
  function setCluesOpen(open) {
    document.body.classList.toggle("clues-open", open);
    if (open) {
      const li = document.querySelector(`.clues li[data-index="${currentWordIndex()}"]`);
      if (li) li.scrollIntoView({ block: "center" });
    }
  }

  // ---------- Tangentbord (iOS-tangentbordet och externa tangentbord) ----------
  // Ett osynligt textfält tar emot det som skrivs. Det innehåller alltid ett mellanslag,
  // så att även radering på ett tomt fält ger en händelse på iOS.
  const kbInput = $("kb-input");
  const SENTINEL = " ";
  const vv = window.visualViewport;

  function resetInput() {
    if (kbInput.value !== SENTINEL) kbInput.value = SENTINEL;
    try { kbInput.setSelectionRange(1, 1); } catch { /* äldre webbläsare */ }
  }
  function focusInput(force) {
    if (!state || !playable()) return;
    if (mcOn() && !force && matchMedia("(pointer: coarse)").matches) return;
    if (document.activeElement !== kbInput) kbInput.focus({ preventScroll: true });
    resetInput();
  }
  function toLetter(ch) {
    const up = ch.toUpperCase();
    if (/^[A-ZÅÄÖ]$/.test(up)) return up;
    const base = up.normalize("NFD")[0]; // é → E, ü → U
    return /^[A-Z]$/.test(base) ? base : null;
  }
  function handleText(text) {
    for (const ch of text) {
      if (ch === " ") selectCell(state.sel.r, state.sel.c);
      else if (/^[1-5]$/.test(ch)) pickIndex(+ch - 1);
      else { const l = toLetter(ch); if (l) typeLetter(l); }
    }
  }
  // Reserv för när webbläsaren inte låter oss stoppa inmatningen (t.ex. under komposition).
  function flushInput() {
    const v = kbInput.value;
    if (v === SENTINEL) return;
    if (v.length < SENTINEL.length) backspace();
    else handleText(v.startsWith(SENTINEL) ? v.slice(SENTINEL.length) : v);
    resetInput();
  }
  kbInput.addEventListener("beforeinput", (e) => {
    const t = e.inputType || "";
    if (t === "insertText" || t === "insertReplacementText") {
      e.preventDefault();
      handleText(e.data || (e.dataTransfer ? e.dataTransfer.getData("text") : ""));
    } else if (t.startsWith("delete")) {
      e.preventDefault();
      backspace();
    } else if (t === "insertLineBreak" || t === "insertParagraph") {
      e.preventDefault();
      stepWord(1);
    }
  });
  kbInput.addEventListener("input", (e) => { if (!e.isComposing) flushInput(); });
  kbInput.addEventListener("compositionend", flushInput);
  kbInput.addEventListener("focus", () => { document.body.classList.add("typing"); resetInput(); syncViewport(); });
  kbInput.addEventListener("blur", () => { document.body.classList.remove("typing"); syncViewport(); });

  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || !state) return;
    const k = e.key;
    if (isQuiz()) {
      if (e.ctrlKey || e.metaKey || e.altKey || paused || !mek) return;
      const n = mek.qs[mek.idx].options.length;
      const idx = "12345".slice(0, n).indexOf(k) >= 0 ? "12345".indexOf(k) : "abcde".slice(0, n).indexOf(k.toLowerCase());
      if (k.length === 1 && idx >= 0) { answerMek(idx); e.preventDefault(); }
      else if ((k === "h" || k === "?") && mek.qs[mek.idx].steps) { showStep(); e.preventDefault(); }
      else if ((k === "Enter" || k === " " || k === "ArrowRight") && mek.answers[mek.idx] !== null && !mek.done) { nextMek(); e.preventDefault(); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && k.toLowerCase() === "z") { undo(); e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || paused || e.isComposing) return;
    const fromInput = e.target === kbInput;
    if (k === "Escape") { if (document.body.classList.contains("clues-open")) setCluesOpen(false); else kbInput.blur(); return; }
    if (k === "ArrowRight") { arrow(0, 1); e.preventDefault(); }
    else if (k === "ArrowLeft") { arrow(0, -1); e.preventDefault(); }
    else if (k === "ArrowDown") { arrow(1, 0); e.preventDefault(); }
    else if (k === "ArrowUp") { arrow(-1, 0); e.preventDefault(); }
    else if (k === "Tab" || k === "Enter") { stepWord(e.shiftKey ? -1 : 1); e.preventDefault(); }
    else if (k === " ") { selectCell(state.sel.r, state.sel.c); e.preventDefault(); }
    else if (!fromInput && (k === "Backspace" || k === "Delete")) { backspace(); e.preventDefault(); }
    else if (!fromInput && k.length === 1 && toLetter(k)) { typeLetter(toLetter(k)); e.preventDefault(); }
    else if (!fromInput && /^[1-5]$/.test(k)) { pickIndex(+k - 1); e.preventDefault(); }
  });

  // Anpassa appens höjd efter det som syns när iOS-tangentbordet är uppe.
  // Höjden utan tangentbord (för aktuell orientering). Behövs eftersom iOS ibland krymper även
  // layoutens höjd när tangentbordet visas, t.ex. när appen körs från hemskärmen.
  let fullHeight = 0, fullWidth = 0;
  function syncViewport() {
    const typing = document.activeElement === kbInput;
    if (vv && Math.abs(vv.scale - 1) < 0.01) {
      if (vv.width !== fullWidth) { fullWidth = vv.width; fullHeight = 0; } // ny orientering
      if (!typing || vv.height > fullHeight) fullHeight = Math.max(vv.height, typing ? fullHeight : 0);
      document.documentElement.style.setProperty("--app-h", Math.round(vv.height) + "px");
      const kbOpen = typing && (Math.max(document.documentElement.clientHeight, fullHeight) - vv.height > 120);
      document.body.classList.toggle("kb-open", kbOpen);
      const wasCompact = document.body.classList.contains("compact");
      document.body.classList.toggle("compact", kbOpen && vv.height < 720);
      if (wasCompact && !document.body.classList.contains("compact")) { $("board-area").scrollTop = 0; $("board-area").scrollLeft = 0; }
      if (!wasCompact && document.body.classList.contains("compact") && state) requestAnimationFrame(keepInView);
    }
    if (window.scrollY) window.scrollTo(0, 0);
  }
  if (vv) { vv.addEventListener("resize", syncViewport); vv.addEventListener("scroll", syncViewport); }
  window.addEventListener("resize", syncViewport);

  // Knappar under rutnätet ska inte ta fokus från fältet, annars stängs tangentbordet.
  document.querySelectorAll(".tool, .cc-nav, .cc-text").forEach((b) =>
    b.addEventListener("pointerdown", (e) => { if (document.activeElement === kbInput) e.preventDefault(); })
  );
  $("kb-toggle").addEventListener("click", () => (document.activeElement === kbInput ? kbInput.blur() : focusInput(true)));
  // Tryck bredvid rutnätet för att fälla ner tangentbordet.
  $("board-area").addEventListener("click", (e) => { if (!e.target.closest(".cell.letter, .paused")) kbInput.blur(); });

  // ---------- Händelser ----------
  document.querySelectorAll("#difficulty button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.level === cur.level) return;
      const dir = LEVEL_KEYS.indexOf(b.dataset.level) > LEVEL_KEYS.indexOf(cur.level) ? "next" : "prev";
      openCurrent(cur.date, b.dataset.level, dir);
    })
  );
  $("prev-day").addEventListener("click", () => cur.date > FIRST_DAY && openCurrent(addDays(cur.date, -1), cur.level, "prev"));
  $("next-day").addEventListener("click", () => cur.date < todayKey() && openCurrent(addDays(cur.date, 1), cur.level, "next"));
  document.querySelectorAll("button[data-mode]").forEach((b) => b.addEventListener("click", () => { setMode(b.dataset.mode); haptic(8); }));
  $("mek-options").addEventListener("click", (e) => { const b = e.target.closest(".mek-opt"); if (b && !b.disabled) answerMek(+b.dataset.k); });
  $("mek-next").addEventListener("click", () => nextMek());
  $("mek-think-btn").addEventListener("click", showStep);
  $("mek-resume").addEventListener("click", () => setPaused(false));
  $("btn-check").addEventListener("click", () => playable() && check());
  $("btn-letter").addEventListener("click", () => { if (!playable()) return; animate($("btn-letter"), "used", 900); reveal([[state.sel.r, state.sel.c]]); });
  $("btn-undo").addEventListener("click", undo);
  $("btn-erase").addEventListener("click", erase);
  $("btn-word").addEventListener("click", () => { $("more-dialog").close(); if (playable()) reveal(cellsOf(currentWord())); });
  $("btn-more").addEventListener("click", () => { kbInput.blur(); $("more-dialog").showModal(); });
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
  $("btn-settings").addEventListener("click", () => { renderThemePicker(); renderCheckPicker(); renderStylePickers(); $("time-toggle").checked = showTime(); $("settings-dialog").showModal(); });
  function renderCheckPicker() {
    const keys = ["off", "word", "letter"];
    document.querySelectorAll("#check-picker button").forEach((b) => b.setAttribute("aria-checked", b.dataset.check === checkMode()));
    $("check-picker").style.setProperty("--i", keys.indexOf(checkMode()));
  }
  document.querySelectorAll("#check-picker button").forEach((b) =>
    b.addEventListener("click", () => { setPref("checkMode", b.dataset.check); renderCheckPicker(); applyCheckMode(); })
  );
  $("time-toggle").addEventListener("change", (e) => { setPref("showTime", e.target.checked); applyTimeSetting(); });
  function applyTimeSetting() { document.body.classList.toggle("hide-time", !showTime()); }
  applyTimeSetting();
  $("open-help").addEventListener("click", () => { $("settings-dialog").close(); $("help-dialog").showModal(); });
  document.querySelectorAll("#theme-picker button").forEach((b) =>
    b.addEventListener("click", () => { setPref("theme", b.dataset.themeValue); applyTheme(); renderThemePicker(); })
  );
  $("btn-clues").addEventListener("click", () => { $("more-dialog").close(); setCluesOpen(true); });
  $("cc-open").addEventListener("click", () => { kbInput.blur(); setCluesOpen(true); });
  $("clues-close").addEventListener("click", () => setCluesOpen(false));
  $("scrim").addEventListener("click", () => setCluesOpen(false));
  // Stäng ark med "Klar"/"Avbryt" eller genom att trycka utanför.
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("dialog.sheet").forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); })
  );
  $("cal-prev").addEventListener("click", () => shiftMonth(-1));
  $("cal-next").addEventListener("click", () => shiftMonth(1));
  $("archive-today").addEventListener("click", () => { $("archive-dialog").close(); openCurrent(todayKey(), cur.level); });
  window.addEventListener("pagehide", () => { save(); saveMek(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { save(); saveMek(); }
    else if (cur.date) renderHeader(); // "Idag"/"Igår" stämmer även om appen legat öppen över midnatt
  });

  // ---------- Tips om hemskärmen (bara i Safari på iPhone/iPad, en gång) ----------
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  function maybeShowInstallHint(delay) {
    if (!isIOS || standalone || prefs().installHint || window.top !== window) return;
    setTimeout(() => { if (!document.querySelector("dialog[open]")) $("install-hint").hidden = false; }, delay);
  }
  maybeShowInstallHint(2500);
  $("help-dialog").addEventListener("close", () => maybeShowInstallHint(700));
  $("install-close").addEventListener("click", () => { $("install-hint").hidden = true; setPref("installHint", true); });
  window.addEventListener("hashchange", () => {
    const t = fromHash();
    if (!t) return;
    if (t.mode && t.mode !== mode()) setPref("mode", t.mode);
    if (t.date !== cur.date || t.level !== cur.level || t.mode) openCurrent(t.date, t.level);
  });

  function fromHash() {
    const [date, level, m] = location.hash.slice(1).split("/");
    if (!validDate(date)) return null;
    return { date, level: LEVELS[level] ? level : LEVELS[prefs().level] ? prefs().level : "medium", mode: MODES.includes(m) && m !== "cross" ? m : null };
  }

  // ---------- Start ----------
  applyTheme();
  applyStyle();
  const firstVisit = !load(PREFS_KEY);
  const startAt = fromHash() || { date: todayKey(), level: LEVELS[prefs().level] ? prefs().level : "medium" };
  if (startAt.mode) setPref("mode", startAt.mode);
  open(startAt.date, startAt.level); // korsordet finns alltid i bakgrunden
  if (isQuiz()) openMek(startAt.date, startAt.level);
  applyMode(false);
  syncViewport();
  if (firstVisit) $("help-dialog").showModal();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
