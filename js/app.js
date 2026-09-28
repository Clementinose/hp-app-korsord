(function () {
  "use strict";

  const LEVELS = {
    easy: { label: "Lätt", count: 8, minLen: 3, maxLen: 8, maxSize: 11 },
    medium: { label: "Medel", count: 12, minLen: 4, maxLen: 10, maxSize: 13 },
    hard: { label: "Svår", count: 16, minLen: 4, maxLen: 14, maxSize: 15 },
    expert: { label: "Expert", count: 18, minLen: 5, maxLen: 15, maxSize: 15 },
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
  const reduceMotion = () => !!prefs().reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Kort vibration där enheten stöder det (Android). iOS ignorerar anropet.
  let hapticLabel = null;
  function haptic(pattern) {
    try {
      if (prefs().haptics === false) return;
      // I mobilappen: riktig haptik från telefonen.
      if (window.DagsprovNative && window.DagsprovNative.haptic) {
        window.DagsprovNative.haptic(Array.isArray(pattern) ? "success" : pattern >= 20 ? "error" : pattern >= 12 ? "medium" : "light");
        return;
      }
      if (navigator.vibrate) { navigator.vibrate(pattern); return; }
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
    const { entries, revealed, wrong, locked, seconds, hints, done, gaveUp, mcTried, mcMistakes } = state; // extraHints sparas separat
    all[puzzleId(state.date, state.level)] = {
      sig: state.sig, entries, revealed, wrong, locked, seconds, hints, done, gaveUp, mcTried, mcMistakes, extraHints: state.extraHints || 0,
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
  // Ordens svårighet 1–4. Expertord är markerade i ordlistan (4); övriga bedöms efter längd
  // och om de är lånord med typiska ändelser (-era, -ism, -tet, -tion …), som oftast är svårare.
  const FOREIGN = /(ERA|ISM|IST|TET|TION|SION|ÖS|ELL|ANT|ENT|ISK|ATIV|IV|ANS|ENS|ÄR|ARD|ATOR|ÖR)$/;
  // Korta ord som ändå är ovanliga och svåra.
  const HARD_SHORT = new Set(`
    AKRIBI AMORF ANLETE ANNEX ANRIKA APROPÅ ARMOD ASKES ASKET AUGUR AVBÖN AVLAT AVMÄTT AVOG BIGOTT BITSK
    BRAVAD BRAVUR BRYSK BURDUS BÄVAN BÖRD DOCERA DREGEL EFEMÄR ELEGI ELOGE EMFAS EMOTSE EMPIRI ENKLAV EPIGON
    EPITET ESPRIT FADD FAGER FALANG FEBRIL FEJD FELBAR FERM FINESS FLÄRD FRUGAL FRÄNDE FROMMA FRÖJD GAGNA
    GEMEN GISSEL GRAMSE GÄCKA GÄLD GÄNGSE HABIL HASARD HOVSAM HUTLÖS HYBRIS HÖVISK IDOG INFAM INERT KAPRIS
    KAUSAL KAVAT KOKETT KONFYS KOPIÖS KRASS KRUX KUTYM KYSK LABIL LAPPRI LEGIO LISMA LOJ LUMPEN LÄGLIG MUNDÄN
    NEJD NIDING NÄNNS NÄPST NÄSVIS ODÅGA PIETET PONERA POSTUM PREKÄR PUERIL PÅBUD REDBAR SAKRAL SCHISM SFÄR
    SMÄDA SMÄLEK STINN STURSK SUBLIM TIRAD TRÄGEN UNISON VAKANS VEKLIG YMNIG ZENIT ÅLÄGGA ÄRBAR ÖMSINT OBSKYR
  `.trim().split(/\s+/));
  function wordTier(e) {
    if (e[2]) return e[2];
    if (HARD_SHORT.has(e[0])) return 3;
    const L = e[0].length;
    let t = L <= 6 ? 1 : L <= 9 ? 2 : 3;
    if (L >= 7 && FOREIGN.test(e[0])) t = Math.min(3, t + 1);
    return t;
  }
  const TIERS = HP_WORDS.map(wordTier);
  // Vilka ord som får användas i korsorden på varje nivå.
  const POOL_TIERS = { easy: [1, 2], medium: [1, 2, 3], hard: [2, 3], expert: [3, 4] };
  const poolCache = {};
  function wordPool(level) {
    const ok = POOL_TIERS[level] || POOL_TIERS.medium;
    return poolCache[level] || (poolCache[level] = HP_WORDS.filter((_, i) => ok.includes(TIERS[i])));
  }

  function puzzleFor(date, level) {
    const id = puzzleId(date, level);
    if (!puzzleCache.has(id)) {
      const rng = mulberry32(hashString(`${SEED_VERSION}|${id}`));
      puzzleCache.set(id, Crossword.generate(wordPool(level), { ...LEVELS[level], rng, attempts: 40 }));
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
        seconds: saved.seconds, hints: saved.hints, done: saved.done, gaveUp: saved.gaveUp, extraHints: saved.extraHints || 0,
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
    if (document.body.classList.contains("compact")) requestAnimationFrame(fitCompactBoard);
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
    renderHintCount();
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
  // Räknar med rutornas plats i layouten (offsetTop/offsetLeft), inte på skärmen, så att
  // pågående animationer och skrollningar inte ger fel mål.
  function keepInView() {
    const area = $("board-area"), w = currentWord();
    if (!w) return;
    const box = (el) => {
      let t = 0, l = 0, n = el;
      while (n && n !== area) { t += n.offsetTop; l += n.offsetLeft; n = n.offsetParent; }
      return { top: t, left: l, bottom: t + el.offsetHeight, right: l + el.offsetWidth };
    };
    const cells = cellsOf(w).map(([r, c]) => box(cellEls[r][c]));
    const sel = box(cellEls[state.sel.r][state.sel.c]);
    const pad = 10, vh = area.clientHeight, vw = area.clientWidth;
    let t = Math.min(...cells.map((x) => x.top)), b = Math.max(...cells.map((x) => x.bottom));
    if (b - t > vh - pad * 2) { t = sel.top; b = sel.bottom; }
    let top = area.scrollTop, left = area.scrollLeft;
    if (t < top + pad) top = t - pad;
    else if (b > top + vh - pad) top = b - vh + pad;
    // I sidled (när rutorna är förstorade): hela ordet om det får plats, annars rutan man står i.
    if (area.scrollWidth > vw + 1) {
      let l = Math.min(...cells.map((x) => x.left)), r = Math.max(...cells.map((x) => x.right));
      if (r - l > vw - pad * 2) { l = sel.left; r = sel.right; }
      if (l < left + pad) left = l - pad;
      else if (r > left + vw - pad) left = r - vw + pad;
    }
    // Alltid ett (och bara ett) anrop: det avbryter en tidigare skrollning som annars fortsätter förbi ordet,
    // och två separata mjuka skrollningar skulle avbryta varandra.
    area.scrollTo({ top, left, behavior: reduceMotion() ? "auto" : "smooth" });
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
        sound("bad");
      }
    }
    sound("tap");
    moveWithinWord(1);
    // Hoppa förbi låsta rutor så att man kan skriva vidare direkt.
    while (fixed(state.sel.r, state.sel.c) && moveWithinWord(1)) { /* nästa */ }
    // Inställningen "Hoppa över ifyllda rutor": gå till nästa tomma ruta i ordet, om det finns någon.
    if (prefs().skipFilled && state.entries[state.sel.r][state.sel.c]) {
      const from = { ...state.sel };
      while ((state.entries[state.sel.r][state.sel.c] || fixed(state.sel.r, state.sel.c)) && moveWithinWord(1)) { /* nästa */ }
      if (state.entries[state.sel.r][state.sel.c]) state.sel = from;
    }
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
    sound("word");
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
        sound("bad");
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
    eraseFx(cells);
    for (const [rr, cc] of cells) { state.entries[rr][cc] = ""; state.wrong[rr][cc] = false; }
    update();
    save();
  }
  // Suddgummit sveper över rutorna: bokstäverna smular sönder och blåser bort, en i taget.
  function eraseFx(cells) {
    const tool = $("btn-erase").querySelector("svg");
    animate(tool, "rub", 500);
    haptic(cells.length > 1 ? [6, 30, 6, 30, 6] : 8);
    sound("erase");
    if (reduceMotion()) return;
    cells.forEach(([r, c], i) => {
      const el = cellEls[r] && cellEls[r][c];
      if (!el) return;
      const ch = state.entries[r][c], b = el.getBoundingClientRect();
      const ghost = document.createElement("div");
      ghost.className = "erase-ghost";
      ghost.textContent = ch;
      ghost.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;font-size:${b.height * 0.55}px;--d:${i * 45}ms;--x:${(i % 2 ? 1 : -1) * (6 + (i * 7) % 10)}px`;
      for (let k = 0; k < 5; k++) {
        const dust = document.createElement("i");
        dust.style.cssText = `--dx:${Math.round(Math.cos(k * 1.3 + i) * 22)}px;--dy:${Math.round(-8 - Math.abs(Math.sin(k * 2.1 + i)) * 22)}px;--k:${k}`;
        ghost.appendChild(dust);
      }
      document.body.appendChild(ghost);
      animate(el, "erased", 500 + i * 45);
      setTimeout(() => ghost.remove(), 800 + i * 45);
    });
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
    if (!gaveUp) { const d = state.date; setTimeout(() => maybeTrophy(d, "cross"), 1600); }
  }

  // Pokal när alla fyra nivåerna i ett läge är klara samma dag – visas en gång per dag och läge.
  function allLevelsDone(date, kind) {
    const all = progressAll();
    return LEVEL_KEYS.every((l) => {
      const p = all[kind === "cross" ? puzzleId(date, l) : mekId(date, l, kind)];
      return p && p.done && !p.gaveUp;
    });
  }
  function maybeTrophy(date, kind) {
    setTimeout(checkPets, 3900); // månadens uppdrag kan ha blivit klara
    const key = `${date}|${kind}`;
    const got = prefs().trophies || {};
    if (got[key] || !allLevelsDone(date, kind)) return;
    setPref("trophies", { ...got, [key]: true });
    const el = document.createElement("div");
    el.className = "trophy";
    el.setAttribute("role", "status");
    el.innerHTML = `<div class="trophy-cup">🏆</div><b>Alla nivåer klara!</b><span>${MODE_NAMES[kind]} · ${longDate(date)}</span>`;
    document.body.appendChild(el);
    confetti(1.3);
    sound("win");
    haptic([20, 80, 20, 80, 40]);
    el.addEventListener("click", () => el.remove());
    setTimeout(() => el.classList.add("out"), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  // ---------- Maskotar och månadens uppdrag ----------
  // Varje månad har ett eget djur. Klarar man minst 4 av månadens 6 uppdrag får man djuret för alltid
  // (missar man ett djur kommer det tillbaka samma månad nästa år). Djuren går att använda:
  // - Välj en följeslagare: den syns i menyraden, hejar på dig efter varje omgång och ger
  //   1 extra gratis livlina varje dag.
  // - Varje nytt djur ger 3 livlinor i present (de sparas som köpta livlinor).
  const PETS = [
    { e: "🐧", name: "Pingvinen Pim", c: "#5ac8fa", cheer: ["Isande bra!", "Pim glider vidare – du med!", "Kallt och klart: snyggt!"], nudge: "Pim väntar vid isflaket." },
    { e: "🦊", name: "Räven Frida", c: "#ff9500", cheer: ["Listigt löst!", "Frida är imponerad!", "Slugt tänkt!"], nudge: "Frida har sniffat upp dagens korsord." },
    { e: "🐰", name: "Haren Hilda", c: "#ff9ec7", cheer: ["Hopp hopp – snabbt jobbat!", "Hilda skuttar av glädje!", "Snabbtänkt!"], nudge: "Hilda skuttar otåligt." },
    { e: "🦔", name: "Igelkotten Ivar", c: "#a2845e", cheer: ["Vasst!", "Ivar rullar ihop sig av stolthet.", "Taggad inför nästa?"], nudge: "Ivar har rullat fram till dagens uppgifter." },
    { e: "🐨", name: "Koalan Kiki", c: "#8e8e93", cheer: ["Kiki kramar dig!", "Mysigt jobbat!", "Lugnt och klokt."], nudge: "Kiki har vaknat ur sin tupplur." },
    { e: "🐢", name: "Sköldpaddan Sigge", c: "#34c759", cheer: ["Sakta men säkert – det lönar sig!", "Sigge nickar gillande.", "Uthållighet vinner!"], nudge: "Sigge har kommit fram – nu är det din tur." },
    { e: "🐬", name: "Delfinen Doris", c: "#007aff", cheer: ["Plask! Superbra!", "Doris gör en volt!", "Du simmar igenom det här!"], nudge: "Doris har plaskat fram nya frågor." },
    { e: "🦦", name: "Uttern Otto", c: "#bf8a4d", cheer: ["Otto klappar med tassarna!", "Utterst bra!", "Lekande lätt!"], nudge: "Otto har letat fram dagens ord." },
    { e: "🦉", name: "Ugglan Ugo", c: "#af52de", cheer: ["Klokt tänkt!", "Ugo hoar av glädje!", "Visdom på riktigt."], nudge: "Ugo har vässat pennan." },
    { e: "🐿️", name: "Ekorren Ella", c: "#ff6b00", cheer: ["Ella samlar dina poäng i boet!", "Nötigt bra!", "Kvickt!"], nudge: "Ella har samlat nötter – och nya frågor." },
    { e: "🐻", name: "Björnen Bruno", c: "#8b5a2b", cheer: ["Björnstarkt!", "Bruno brummar belåtet.", "Stark insats!"], nudge: "Bruno har vaknat ur idet och vill plugga." },
    { e: "🦌", name: "Renen Rolf", c: "#c0392b", cheer: ["Rolf drar dig framåt!", "Ren glädje!", "Stjärnklart!"], nudge: "Rolf står redo med släden." },
  ];
  // Olle är appens egen maskot och startkompis: en liten orangutang med glasögon. Han är alltid med,
  // hejar på dig och skickar påminnelserna – tills du väljer ett annat djur som följeslagare.
  const OLLE_SVG = `<svg class="olle" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="10" cy="35" r="7.5" fill="#c05f1c"/><circle cx="54" cy="35" r="7.5" fill="#c05f1c"/>
    <circle cx="10" cy="35" r="3.8" fill="#f2b98a"/><circle cx="54" cy="35" r="3.8" fill="#f2b98a"/>
    <ellipse cx="32" cy="35" rx="22.5" ry="21.5" fill="#d9772b"/>
    <path d="M23 17c1-6 5-10 8-10-1 3 0 5 2 6 1-3 4-5 7-5-2 2-2 5-1 9z" fill="#d9772b"/>
    <path d="M32 22.5c-9.5 0-15.5 5.2-15.5 12.3 0 9 7 15.2 15.5 15.2s15.5-6.2 15.5-15.2c0-7.1-6-12.3-15.5-12.3z" fill="#f4c49a"/>
    <circle cx="19" cy="42" r="2.6" fill="#ff7a6e" fill-opacity=".45"/><circle cx="45" cy="42" r="2.6" fill="#ff7a6e" fill-opacity=".45"/>
    <g class="olle-eyes"><circle cx="24.8" cy="33" r="2.5" fill="#26262e"/><circle cx="39.2" cy="33" r="2.5" fill="#26262e"/>
    <circle cx="25.7" cy="32.1" r=".85" fill="#fff"/><circle cx="40.1" cy="32.1" r=".85" fill="#fff"/></g>
    <circle cx="24.5" cy="32.5" r="6.6" fill="#bfe3ff" fill-opacity=".28" stroke="#26262e" stroke-width="2.4"/>
    <circle cx="39.5" cy="32.5" r="6.6" fill="#bfe3ff" fill-opacity=".28" stroke="#26262e" stroke-width="2.4"/>
    <path d="M31.1 32h1.8M17.9 31l-3.6-1.6M46.1 31l3.6-1.6" stroke="#26262e" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M21 29.3a3.4 3.4 0 0 1 3-2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".8"/>
    <ellipse cx="32" cy="41" rx="2.3" ry="1.5" fill="#8a4a1c"/>
    <path d="M27 45c3 2.8 7 2.8 10 0" fill="none" stroke="#8a4a1c" stroke-width="1.9" stroke-linecap="round"/>
  </svg>`;
  const OLLE = { e: "🦧", svg: OLLE_SVG, name: "Orangutangen Olle", c: "#d9772b", starter: true,
    cheer: ["Olle putsar glasögonen – imponerande!", "Smart! Olle är stolt.", "Hjärngympa deluxe!", "Olle gör en liten glädjedans!"],
    nudge: "Olle har putsat glasögonen och är redo att plugga." };
  const petName = (p) => p.name.split(" ").slice(1).join(" ");
  const petFace = (p) => p.svg || escapeHtml(p.e);
  const mascot = () => companion() || OLLE; // Olle tar över när inget djur är valt
  const PET_GIFT = 3, PET_NEED = 4;
  const MISSIONS = {
    days: { t: 12, label: "Öva 12 dagar", icon: "📅" },
    streak: { t: 5, label: "Öva 5 dagar i rad", icon: "🔥" },
    cross: { t: 6, label: "Lös 6 korsord", icon: "▦" },
    right: { t: 80, label: "Svara rätt 80 gånger", icon: "✓" },
    expert: { t: 2, label: "Klara 2 omgångar på Expert", icon: "🎓" },
    perfect: { t: 3, label: "3 omgångar med alla rätt", icon: "💯" },
    bolt: { t: 8, label: "8 blixtsvar i Matte", icon: "⚡" },
    modes: { t: 5, label: "Öva i alla fem lägen", icon: "🧭" },
    mat: { t: 4, label: "Klara 4 matteomgångar", icon: "➗" },
    ord: { t: 4, label: "Klara 4 omgångar Ord", icon: "Ab" },
    eng: { t: 4, label: "Klara 4 omgångar Engelska", icon: "EN" },
  };
  const monthKey = (d) => d.slice(0, 7);
  const petFor = (month) => PETS[+month.slice(5, 7) - 1];
  function missionsFor(month) {
    return shuffled(Object.keys(MISSIONS), mulberry32(hashString(`${SEED_VERSION}|uppdrag|${month}`))).slice(0, 6);
  }
  // Räknar ihop allt man gjort under en månad.
  function monthStats(month) {
    const out = { days: 0, streak: 0, cross: 0, right: 0, expert: 0, perfect: 0, bolt: 0, modes: 0, mat: 0, ord: 0, eng: 0 };
    const played = new Set(), modes = new Set();
    for (const [id, p] of Object.entries(progressAll())) {
      if (!id.startsWith(month) || !p) continue;
      const [date, rest] = id.split("|");
      if (!rest) continue;
      const [kindOrLevel, lvlRaw] = rest.split("-");
      if (lvlRaw !== undefined && Array.isArray(p.answers)) {
        const kind = kindOrLevel, level = lvlRaw.split("+")[0];
        const ok = (a, i) => a !== null && p.correct && a === p.correct[i];
        const right = p.answers.filter(ok).length;
        if (p.answers.some((a) => a !== null)) { played.add(date); modes.add(kind); }
        out.right += right;
        if (kind === "mat" && p.times) out.bolt += p.answers.filter((a, i) => ok(a, i) && !(p.helped && p.helped[i]) && p.times[i] !== null && p.times[i] <= boltSeconds()).length;
        if (!p.done) continue;
        if (out[kind] !== undefined && kind !== "cross") out[kind]++;
        if (level === "expert") out.expert++;
        if (right === p.answers.length) out.perfect++;
      } else {
        const started = p.done || (Array.isArray(p.entries) && p.entries.some((row) => Array.isArray(row) && row.some(Boolean)));
        if (started) { played.add(date); modes.add("cross"); }
        if (p.done && !p.gaveUp) { out.cross++; if (kindOrLevel === "expert") out.expert++; }
      }
    }
    out.days = played.size;
    out.modes = modes.size;
    let run = 0;
    const [y, m] = month.split("-").map(Number);
    for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
      run = played.has(`${month}-${String(d).padStart(2, "0")}`) ? run + 1 : 0;
      out.streak = Math.max(out.streak, run);
    }
    return out;
  }
  function monthProgress(month) {
    const st = monthStats(month);
    const list = missionsFor(month).map((k) => ({ k, ...MISSIONS[k], v: Math.min(st[k], MISSIONS[k].t), done: st[k] >= MISSIONS[k].t }));
    return { list, done: list.filter((x) => x.done).length };
  }
  const ownedPets = () => { const o = prefs().pets; return o && typeof o === "object" && !Array.isArray(o) ? o : {}; };
  const ownsPet = (idx) => Object.keys(ownedPets()).some((m) => +m.slice(5, 7) - 1 === idx);
  function companion() {
    const c = prefs().companion;
    return Number.isInteger(c) && c >= 0 && c < 12 && ownsPet(c) ? PETS[c] : null;
  }
  // Delar ut djur för alla månader där minst 4 uppdrag är klara (även tidigare månader).
  function checkPets() {
    const owned = ownedPets(), fresh = [];
    for (let m = monthKey(FIRST_DAY); m <= monthKey(todayKey()); m = monthKey(addDays(m + "-28", 7))) {
      if (owned[m]) continue;
      if (monthProgress(m).done >= PET_NEED) { owned[m] = Date.now(); fresh.push(m); }
    }
    if (!fresh.length) return;
    setPref("pets", owned);
    setPref("bank", bankLeft() + PET_GIFT * fresh.length);
    renderPetButton();
    if (!document.querySelector("dialog[open]")) showPetWon(fresh[fresh.length - 1]);
    else setPref("petNew", fresh[fresh.length - 1]);
  }
  function showPetWon(month) {
    const pet = petFor(month);
    const idx = PETS.indexOf(pet);
    $("petwon-emoji").innerHTML = petFace(pet);
    $("petwon-emoji").style.setProperty("--c", pet.c);
    $("petwon-name").textContent = pet.name;
    $("petwon-text").textContent = `Du klarade månadens uppdrag och fick ${pet.name}! Som present får du ${PET_GIFT} livlinor.`;
    $("petwon-use").hidden = companion() === pet;
    $("petwon-use").onclick = () => { setCompanion(idx); $("petwon-dialog").close(); };
    setPref("petNew", null);
    $("petwon-dialog").showModal();
    confetti(1.4); sound("win"); haptic([20, 80, 20, 80, 40]);
  }
  function setCompanion(idx) {
    setPref("companion", idx);
    scheduleReminders();
    renderPetButton();
    const pet = PETS[idx];
    rewardBurst(`${pet.e} ${petName(pet)} följer med dig!`);
    haptic([10, 30, 10]);
    if ($("pets-dialog").open) renderPets();
  }
  function petCheer(seed) {
    const pet = mascot();
    const line = pet.cheer[hashString(String(seed)) % pet.cheer.length];
    return `<div class="pet-cheer" style="--c:${pet.c}"><span class="pet-mini" aria-hidden="true">${petFace(pet)}</span><span class="bubble">${line}</span></div>`;
  }
  function renderPetButton() {
    const pet = mascot(), btn = $("btn-pets");
    btn.querySelector(".pet-face").innerHTML = petFace(pet);
    btn.classList.add("has-pet");
    btn.setAttribute("aria-label", `Maskotar och månadens uppdrag – ${pet.name}`);
  }
  function renderPets() {
    const month = monthKey(todayKey()), pet = petFor(month), prog = monthProgress(month), owned = ownsPet(PETS.indexOf(pet));
    const comp = companion();
    $("pets-hero").innerHTML = `
      <div class="pet-big${owned ? "" : " locked"}" style="--c:${pet.c}"><span>${petFace(pet)}</span></div>
      <h3>${owned ? `${pet.name} är din!` : `Månadens djur: ${pet.name}`}</h3>
      <p>${owned ? "Du har klarat månadens uppdrag. Snyggt!" : `Klara ${PET_NEED} av 6 uppdrag före månadsskiftet så får du ${pet.name.split(" ")[1]} – och ${PET_GIFT} livlinor i present.`}</p>
      <div class="pet-meter"><i style="--w:${Math.min(1, prog.done / PET_NEED)}"></i></div>
      <small>${prog.done} av 6 uppdrag klara · ${PET_NEED} behövs</small>`;
    $("pets-missions").innerHTML = prog.list.map((x, i) => `<li class="${x.done ? "done" : ""}" style="--i:${i}">
      <span class="m-ico" aria-hidden="true">${x.done ? "✓" : x.icon}</span>
      <span class="m-t"><b>${x.label}</b><span class="m-bar"><i style="--w:${x.v / x.t}"></i></span></span>
      <span class="m-v">${x.v}/${x.t}</span></li>`).join("");
    const thisMonth = +month.slice(5, 7) - 1;
    const olle = `<button class="pet-tile owned starter${comp ? "" : " active"}" data-pet="olle" style="--c:${OLLE.c};--i:0">
        <span class="pet-e" aria-hidden="true">${OLLE_SVG}</span><b>Olle</b><small>${comp ? "Startkompis" : "Följer med"}</small></button>`;
    $("pets-grid").innerHTML = olle + PETS.map((p, i) => {
      const has = ownsPet(i);
      return `<button class="pet-tile${has ? " owned" : ""}${comp === p ? " active" : ""}${i === thisMonth ? " now" : ""}" data-pet="${i}" style="--c:${p.c};--i:${i}" ${has ? "" : "aria-disabled=\"true\""}>
        <span class="pet-e" aria-hidden="true">${p.e}</span><b>${has ? petName(p) : MONTH_SHORT[i]}</b>${comp === p ? "<small>Följer med</small>" : has ? "<small>Välj</small>" : ""}</button>`;
    }).join("");
    $("pets-grid").querySelectorAll(".pet-tile").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.pet === "olle") {
        if (companion()) { setPref("companion", null); renderPetButton(); renderPets(); rewardBurst("🦧 Olle följer med dig!"); haptic([10, 30, 10]); scheduleReminders(); }
        return;
      }
      const i = +b.dataset.pet;
      if (!ownsPet(i)) { animate(b, "shake", 500); toast(`${PETS[i].name} kan vinnas i ${MONTH_LONG[i]}`); return; }
      if (companion() === PETS[i]) { setPref("companion", null); renderPetButton(); renderPets(); toast("Olle tar över som följeslagare"); scheduleReminders(); return; }
      setCompanion(i);
    }));
    $("pets-perk").textContent = comp
      ? `${comp.name} följer med dig: hejar efter varje omgång, skickar dina påminnelser och ger 1 extra gratis livlina varje dag.`
      : "Olle, appens egen orangutang, följer med dig tills du vinner ett djur. Djur du vinner ger dessutom 1 extra gratis livlina varje dag när de följer med.";
  }
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
  const MONTH_LONG = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
  function openPets() {
    renderPets();
    $("pets-dialog").showModal();
    const big = $("pets-hero").querySelector(".pet-big");
    if (big) animate(big, "bounce", 900);
  }
  $("btn-pets").addEventListener("click", openPets);

  // ---------- Påminnelser (som i Duolingo, fast med din maskot) ----------
  // Webbappen räknar fram texterna för de kommande 7 dagarna och ber appskalet schemalägga dem som
  // lokala notiser (expo-notifications). Allt sker på enheten – ingen server, ingen push-token.
  // Varje gång appen öppnas eller stängs schemaläggs de om, så att dagens påminnelse hoppas över
  // om man redan har övat.
  const notifyBridge = () => (window.DagsprovNative && window.DagsprovNative.notify) || null;
  const remindSupported = () => !!notifyBridge() || demoAds();
  const remindOn = () => prefs().remind === true;
  const remindTime = () => (/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs().remindTime || "") ? prefs().remindTime : "18:00");
  const REMIND_LINES = [
    "{nudge} Dagens korsord väntar. 🧩",
    "Fem minuter om dagen räcker långt. Kör vi en runda?",
    "Dagens ord är ”{wotd}”. Vet du vad det betyder? 🤔",
    "Jag har sparat en klurig matteuppgift åt dig. ➗",
    "Tio snabba frågor – perfekt på bussen eller tåget. 🚆",
    "Varje dag du övar gör provdagen lite lättare. 💪",
    "{nudge} Ska vi slå förra veckans resultat?",
  ];
  function notifTitle() {
    const m = mascot();
    return `${m.e} ${petName(m)}`;
  }
  function notifBody(date, i) {
    const m = mascot(), month = monthKey(date), prog = monthProgress(month), pet = petFor(month);
    const left = PET_NEED - prog.done;
    if (i % 3 === 2 && left > 0 && !ownsPet(PETS.indexOf(pet)))
      return `Bara ${left} ${left === 1 ? "uppdrag" : "uppdrag"} kvar till ${pet.name}! ${pet.e}`;
    const line = REMIND_LINES[hashString(`${date}|påminn`) % REMIND_LINES.length];
    return line.replace("{nudge}", m.nudge || "").replace("{wotd}", wotdFor(date).word.toLowerCase()).trim();
  }
  function buildReminders() {
    if (!remindOn()) return [];
    const st = computeStats(), today = todayKey(), now = Date.now(), out = [];
    const practiced = st.playedDays.has(today);
    const [hh, mm] = remindTime().split(":").map(Number);
    for (let d = 0; d < 7; d++) {
      const date = addDays(today, d);
      if (d === 0 && practiced) continue;
      const at = fromKey(date); at.setHours(hh, mm, 0, 0);
      if (at.getTime() < now + 60000) continue;
      out.push({ id: `dagsprov-${date}`, title: notifTitle(), body: notifBody(date, d), at: at.getTime() });
    }
    if (prefs().remindStreak !== false && !practiced && st.streak >= 2) {
      const at = fromKey(today); at.setHours(21, 30, 0, 0);
      if (at.getTime() > now + 60000) out.push({ id: `dagsprov-svit-${today}`, title: notifTitle(), body: `Din svit på ${st.streak} dagar försvinner vid midnatt! Ett par minuter räddar den. 🔥`, at: at.getTime() });
    }
    return out;
  }
  function scheduleReminders() {
    const nb = notifyBridge();
    if (!nb || !nb.schedule) return;
    try { nb.schedule(buildReminders()); } catch { /* inget att göra */ }
  }
  // Visar en notis som den ser ut på låsskärmen (testknappen och förhandsvisningen).
  function notifCardHtml(title, body) {
    return `<div class="notif-card"><span class="notif-app"><img src="${document.querySelector(".set-hero img").getAttribute("src")}" alt=""></span>
      <span class="notif-t"><span class="notif-top"><b>DAGSPROV</b><small>nu</small></span><b>${escapeHtml(title)}</b><span>${escapeHtml(body)}</span></span>
      <span class="notif-pet" aria-hidden="true">${petFace(mascot())}</span></div>`;
  }
  let mockTimer = 0;
  function showNotifMock(title, body) {
    const el = $("notif-mock");
    el.innerHTML = notifCardHtml(title, body);
    el.hidden = false;
    el.classList.remove("out");
    haptic([8, 40, 8]);
    clearTimeout(mockTimer);
    mockTimer = setTimeout(() => { el.classList.add("out"); setTimeout(() => (el.hidden = true), 400); }, 4200);
    el.onclick = () => { el.classList.add("out"); setTimeout(() => (el.hidden = true), 400); };
  }
  function renderRemind() {
    const on = remindOn();
    $("remind-toggle").checked = on;
    $("remind-streak").checked = prefs().remindStreak !== false;
    const sel = $("remind-time");
    if (!sel.options.length) {
      for (let h = 6; h <= 22; h++) for (const m of [0, 30]) {
        const v = `${String(h).padStart(2, "0")}:${m ? "30" : "00"}`;
        sel.add(new Option(v.replace(":", "."), v));
      }
    }
    sel.value = remindTime();
    sel.disabled = !on; $("remind-streak").disabled = !on;
    $("remind-toggle").disabled = !remindSupported();
    $("notif-preview").innerHTML = notifCardHtml(notifTitle(), notifBody(todayKey(), 0));
    const note = $("remind-note");
    note.dataset.base = note.dataset.base || note.textContent;
    note.textContent = (remindSupported() ? "" : "Påminnelser finns i appen för iPhone och Android. ") + note.dataset.base;
  }
  $("remind-toggle").addEventListener("change", async (e) => {
    const want = e.target.checked;
    if (want && notifyBridge() && notifyBridge().permission) {
      let ok = false;
      try { ok = !!(await notifyBridge().permission()); } catch { ok = false; }
      if (!ok) { e.target.checked = false; toast("Tillåt notiser för Dagsprov i telefonens inställningar"); return; }
    }
    setPref("remind", want);
    haptic(8);
    renderRemind();
    scheduleReminders();
    if (want) showNotifMock(notifTitle(), notifBody(todayKey(), 0));
  });
  $("remind-streak").addEventListener("change", (e) => { setPref("remindStreak", e.target.checked); scheduleReminders(); });
  $("remind-time").addEventListener("change", (e) => { setPref("remindTime", e.target.value); scheduleReminders(); toast(`Påminnelse kl. ${e.target.value.replace(":", ".")} varje dag`); });
  $("remind-test").addEventListener("click", () => {
    const title = notifTitle(), body = notifBody(todayKey(), 1);
    const nb = notifyBridge();
    if (nb && nb.test) { try { nb.test({ title, body }); toast("Testnotisen kommer om 5 sekunder – lås gärna skärmen"); } catch { /* */ } }
    else showNotifMock(title, body);
  });

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
    if (!state.gaveUp) sound("win");
    $("win-title").textContent = state.gaveUp ? "Här är lösningen" : "Snyggt löst!";
    $("win-icon").textContent = state.gaveUp ? "📖" : "🎉";
    const hints = state.hints ? ` med ${state.hints} ${state.hints === 1 ? "ledtråd" : "ledtrådar"}` : " helt utan hjälp";
    $("win-summary").textContent = state.gaveUp
      ? "Ingen fara – gå igenom orden nedan så sitter de nästa gång."
      : `${LEVELS[state.level].label}${showTime() ? " · " + formatTime(state.seconds) : ""}${hints}` +
        (state.mcMistakes ? ` och ${state.mcMistakes} fel.` : ".");
    $("win-pet").innerHTML = state.gaveUp ? "" : petCheer(state.date + state.level);
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
        if (qk === "mat" && p.times) st.bolts += p.answers.filter((a, i) => ok(a, i) && !(p.helped && p.helped[i]) && p.times[i] !== null && p.times[i] <= boltSeconds()).length;
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
    // Räddade dagar (livlinan "Rädda sviten") räknas med i sviten men inte som spelade dagar.
    const frozen = new Set(prefs().frozen || []);
    const inStreak = (x) => solvedDays.has(x) || frozen.has(x);
    let streak = 0;
    let d = inStreak(todayKey()) ? todayKey() : addDays(todayKey(), -1);
    while (inStreak(d)) { streak++; d = addDays(d, -1); }
    let best = 0, run = 0, prev = null;
    for (const day of [...new Set([...solvedDays, ...frozen])].sort()) {
      run = prev && addDays(prev, 1) === day ? run + 1 : 1;
      best = Math.max(best, run);
      prev = day;
    }
    // Träffsäkerhet per del (0–1, null = för lite data). Korsord: andel lösta utan tips.
    const acc = { cross: crossDone ? crossClean / crossDone : null };
    for (const k of ["ord", "mek", "eng", "mat"]) acc[k] = quiz[k].total >= ACC_MIN ? quiz[k].right / quiz[k].total : null;
    const answeredTotal = Object.values(quiz).reduce((s, q) => s + q.total, 0);
    const rightTotal = Object.values(quiz).reduce((s, q) => s + q.right, 0);
    return { per, streak, bestStreak: best, words, days: solvedDays.size, playedDays: solvedDays, quiz, cats, missed, activity: days, acc, crossDone, answeredTotal, rightTotal };
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
      <div class="stat hero-stat"><div class="v"><span class="flame${st.streak ? " lit" : ""}">🔥</span> <span class="num">${st.streak}</span></div><div class="l">${st.streak === 1 ? "dag" : "dagar"} i rad<br><small>Längsta svit: ${st.bestStreak}</small>${brokenStreak() ? `<br><button class="mini-rescue" id="stats-rescue">🔥 Rädda sviten</button>` : ""}</div></div>
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
    if ($("stats-rescue")) $("stats-rescue").addEventListener("click", async () => { $("stats-dialog").close(); await rescueStreak(); });
    $("stats-body").classList.remove("anim"); void $("stats-body").offsetWidth; $("stats-body").classList.add("anim");
    $("stats-body").querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      $("stats-dialog").close();
      if (b.dataset.go !== mode()) setMode(b.dataset.go);
      haptic(10);
    }));
    if (!reduceMotion()) {
      $("stats-body").querySelectorAll(".stat .v").forEach((box) => {
        const el = box.querySelector(".num") || box;
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
      const cls = ["day", k === today ? "today" : "", k === cur.date ? "current" : "", enabled && dayLocked(k) ? "locked" : ""].join(" ");
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
  // Dagens ord: en fast, blandad ordning genom listan med exempelmeningar, så att inget ord
  // kommer tillbaka förrän alla har visats. Samma ord för alla samma dag.
  let wotdOrder = null;
  function wotdFor(date) {
    if (!wotdOrder) wotdOrder = shuffled(HP_WOTD.map((_, i) => i), mulberry32(hashString(`${SEED_VERSION}|dagens-ord`)));
    const day = Math.round((fromKey(date) - fromKey(FIRST_DAY)) / 864e5);
    const [word, example] = HP_WOTD[wotdOrder[((day % wotdOrder.length) + wotdOrder.length) % wotdOrder.length]];
    const clue = (wordClues().get(word) || "");
    return { word, clue, example };
  }
  const wordOfDay = (date) => { const w = wotdFor(date); return [w.word, w.clue]; };
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
    for (const [w, c, t] of hits.slice(0, 400)) {
      if (w[0] !== letter) { letter = w[0]; html += `<div class="letter-head">${letter}</div>`; }
      html += `<div class="w"><b>${hl(w.toLowerCase())}</b>${t === 4 ? ' <i class="tag">Expert</i>' : ""} <span>– ${hl(c)}</span></div>`;
    }
    if (hits.length > 400) html += `<div class="empty">Visar 400 av ${hits.length}. Sök för att hitta fler.</div>`;
    $("word-list").innerHTML = html || `<div class="empty">Inga ord hittades.</div>`;
  }
  function showWords() {
    kbInput.blur();
    const [w, c] = wordOfDay(todayKey());
    $("word-of-day").innerHTML = `<div class="wod-label">Dagens ord · tryck för exempel</div><div class="wod-word">${escapeHtml(w)}</div><div class="wod-clue">${escapeHtml(c)}</div>`;
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
    // Äldre arkivdagar ingår i Plus (eller låses upp med en film). Dagar man redan spelat är alltid öppna.
    if (dayLocked(date)) {
      unlockDay(date).then((ok) => { if (ok) openCurrent(date, level, dir); else setHash(); });
      return;
    }
    if (isQuiz()) openMek(date, level, dir);
    else open(date, level, dir);
  }
  let lastRenderedMode = null;
  function renderModeSwitch() {
    const m = mode();
    // Liten studs på den nya fliken och en mjuk övergång i rubriken när läget byts.
    if (lastRenderedMode && lastRenderedMode !== m) {
      document.querySelectorAll(`#tabbar [data-mode="${m}"] svg`).forEach((s) => animate(s, "tab-pop", 500));
      animate($("nav-title"), "title-swap", 400);
    }
    lastRenderedMode = m;
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
  const MEK_SETS = { easy: { 1: 8 }, medium: { 1: 3, 2: 7 }, hard: { 2: 4, 3: 6 }, expert: { 3: 10 } };
  const ENG_SETS = { easy: { vocab: 6, 1: 4 }, medium: { vocab: 5, 1: 2, 2: 3 }, hard: { vocab: 4, 2: 2, 3: 4 }, expert: { vocab: 4, 3: 6 } };
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

  // Ord: som ORD-delen – ett ord och fem betydelser. Nivån styr vilka ord som frågas (ordnivå 1–4)
  // och hur lika felsvaren är: på Svår och Expert kommer felsvaren från ord som liknar rätt ord.
  const ORD_TIERS = { easy: [1], medium: [2], hard: [3], expert: [4] };
  const ORD_DISTRACT = { easy: [1, 2], medium: [1, 2, 3], hard: [2, 3, 4], expert: [3, 4] };
  function ordRound(rng, level) {
    const all = HP_WORDS.map((_, i) => i);
    const ask = all.filter((i) => (ORD_TIERS[level] || ORD_TIERS.medium).includes(TIERS[i]));
    const pool = all.filter((i) => (ORD_DISTRACT[level] || ORD_DISTRACT.medium).includes(TIERS[i]));
    return shuffled(ask, rng).slice(0, 10).map((id) => {
      const [w, clue] = HP_WORDS[id];
      let cand = pool.filter((j) => j !== id && HP_WORDS[j][1] !== clue);
      const other = (j) => HP_WORDS[j][0];
      const near = level === "expert"
        ? cand.filter((j) => other(j).slice(0, 2) === w.slice(0, 2) || other(j).slice(-3) === w.slice(-3))
        : level === "hard"
          ? cand.filter((j) => other(j).slice(0, 2) === w.slice(0, 2) || other(j).length === w.length)
          : level === "medium" ? cand.filter((j) => Math.abs(other(j).length - w.length) <= 1) : [];
      if (near.length >= 4) cand = near;
      const opts = shuffled([id, ...shuffled(cand, rng).slice(0, 4)], rng);
      return {
        id, key: w, label: level === "expert" ? "Expert · Vad betyder ordet?" : "Vad betyder ordet?", big: true,
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
  // Bonusomgångar (livlina) får egna frön: samma nivå, nya frågor.
  function quizRound(kind, date, level, bonus = 0) {
    const rng = mulberry32(hashString(`${SEED_VERSION}|${kind}|${date}|${level}${bonus ? "|bonus" + bonus : ""}`));
    const qs = ROUNDS[kind](rng, level);
    return { qs, sig: qs.map((q) => q.id).join(","), correct: qs.map((q) => q.correct) };
  }

  function openMek(date, level, dir, bonus = 0) {
    stopTimer();
    if (state) save();
    if (mek) saveMek();
    cur = { date, level };
    const kind = mode();
    const round = quizRound(kind, date, level, bonus);
    const saved = progressAll()[mekId(date, level, kind) + (bonus ? `+b${bonus}` : "")];
    const blank = () => round.qs.map(() => null);
    mek = { kind, date, level, bonus, ...round, answers: blank(), times: blank(), helped: round.qs.map(() => false), retried: blank(), removed: blank(), halved: blank(), shown: 0, seconds: 0, done: false };
    if (saved && saved.sig === round.sig) {
      Object.assign(mek, { answers: saved.answers, times: saved.times || mek.times, helped: saved.helped || mek.helped, seconds: saved.seconds, done: saved.done });
      for (const k of ["retried", "removed", "halved"]) if (Array.isArray(saved[k])) mek[k] = saved[k];
    }
    mek.idx = Math.max(0, mek.answers.findIndex((a, i) => a === null || retryPending(i)));
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
    all[mekId(mek.date, mek.level, mek.kind) + (mek.bonus ? `+b${mek.bonus}` : "")] = {
      sig: mek.sig, answers: mek.answers, correct: mek.correct, times: mek.times, helped: mek.helped, seconds: mek.seconds, done: mek.done,
      retried: mek.retried, removed: mek.removed, halved: mek.halved,
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

  // Fel svar där andra chans fortfarande erbjuds: rätt svar hålls hemligt tills man väljer.
  // Andra chans kan användas flera gånger på samma fråga – så länge man har livlinor och minst två
  // alternativ finns kvar (annars vore svaret givet).
  const retries = (i) => (mek.retried[i] === true ? 1 : typeof mek.retried[i] === "number" ? mek.retried[i] : 0);
  const optionsLeft = (i) => mek.qs[i].options.length - new Set([...(mek.removed[i] || []), mek.answers[i]].filter((x) => x !== null)).size;
  const retryPending = (i) => !mek.done && mek.answers[i] !== null && mek.answers[i] !== mek.correct[i] && mek.retried[i] !== "seen" && optionsLeft(i) >= 2;
  let questionShownAt = 0;
  function renderMek(enter) {
    renderMekDots();
    if (mek.done) return showMekResult(false);
    $("mek-body").hidden = false;
    $("mek-result").hidden = true;
    const i = mek.idx, q = mek.qs[i], answered = mek.answers[i];
    const pending = retryPending(i);
    $("mek-label").textContent = q.label;
    $("mek-card").classList.toggle("big", !!q.big);
    $("mek-text").innerHTML = q.prompt(answered !== null && !pending, answered === q.correct);
    $("mek-options").classList.toggle("fixed", !!q.fixed);
    // Korta svar (siffror, enstaka ord) visas två och två så att alla får plats utan skroll på små skärmar.
    const plain = q.options.map((o) => o.replace(/<[^>]+>/g, "").trim());
    $("mek-options").classList.toggle("short", !q.fixed && q.options.length === 4 && plain.every((t) => t.length <= 14));
    const gone = new Set(mek.removed[i] || []);
    $("mek-options").innerHTML = q.options.map((text, k) => {
      let cls = "";
      if (pending) cls = k === answered ? "wrong" : gone.has(k) ? "gone" : "dim";
      else if (answered !== null) cls = k === q.correct ? "right" : k === answered ? "wrong" : "dim";
      else if (gone.has(k)) cls = "gone";
      return `<button class="mek-opt ${cls}" data-k="${k}" style="--i:${k}" ${answered !== null || gone.has(k) ? "disabled" : ""}>` +
        `<span class="opt">${MEK_LABELS[k]}</span><span class="opt-word">${text}</span></button>`;
    }).join("");
    renderMekFeedback();
    renderLifelineBar();
    mek.shown = answered === null && !mek.helped[i] ? 0 : mek.shown;
    renderSteps(false);
    if (answered === null) questionShownAt = performance.now();
    if (enter !== undefined) {
      animate($("mek-card"), "enter" + (enter ? " " + enter : ""), 600);
      animate($("mek-options"), "rise", 800);
    }
  }

  // Blixtsvar i Matte: rätt svar inom 10 sekunder, utan att ha tittat på stegen först.
  const boltSeconds = () => (prefs().bolt === undefined ? 10 : prefs().bolt);
  const isBolt = (i) => mek.kind === "mat" && boltSeconds() > 0 && mek.answers[i] === mek.correct[i] && !mek.helped[i] && mek.times[i] !== null && mek.times[i] <= boltSeconds();

  // "Visa hur man tänker": stegen visas ett i taget. Före svaret räknas det som hjälp (inget blixtsvar).
  function renderSteps(animLast) {
    const q = mek.qs[mek.idx], box = $("mek-think");
    box.hidden = !q.steps || retryPending(mek.idx);
    if (!q.steps) return;
    const answered = mek.answers[mek.idx] !== null;
    const n = q.steps.length, shown = Math.min(mek.shown, n);
    $("mek-steps").innerHTML = q.steps.slice(0, shown).map((s, k) =>
      `<li class="${animLast && (k === shown - 1 || animLast === "all") ? "in" : ""}${k === n - 1 ? " final" : ""}" style="--i:${animLast === "all" ? k : 0}"><span class="step-n">${k + 1}</span><span class="step-t">${s}</span></li>`).join("");
    const btn = $("mek-think-btn");
    btn.hidden = shown >= n;
    const paid = !answered && shown === 0 && !mek.helped[mek.idx] && monetized() && !isPlus();
    $("mek-think-label").textContent = shown === 0 ? (answered ? "Visa lösningen steg för steg" : paid ? "Ledtråd: visa hur man tänker · ♥" : "Visa hur man tänker") : answered ? "Visa resten av lösningen" : `Nästa steg (${shown + 1}/${n})`;
    box.classList.toggle("open", shown > 0);
  }
  async function showStep() {
    const q = mek.qs[mek.idx];
    if (!q || !q.steps || paused) return;
    const answered = mek.answers[mek.idx] !== null;
    // Hela lösningen efter svaret är alltid gratis. Före svaret är stegen en ledtråd och kostar en
    // livlina (en gång per fråga) – med Plus ingår det.
    if (!answered && mek.shown === 0 && !mek.helped[mek.idx] && monetized()) {
      const i = mek.idx, kind = mek.kind, date = mek.date;
      if (!(await offerLifeline("steps"))) return;
      if (!mek || mek.idx !== i || mek.kind !== kind || mek.date !== date || mek.answers[i] !== null) return;
    }
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
    const note = q.explain && prefs().notes !== false ? `<span class="fb-note">${q.explain}</span>` : "";
    // Fel svar: erbjud en andra chans (livlina) innan rätt svar avslöjas.
    if (!right && retryPending(i)) {
      const n = retries(i), left = isPlus() ? "∞" : lifelinesLeft();
      fb.innerHTML = `<span class="fb bad">✕ Fel svar${n ? ` igen` : ""}</span><button class="retry-btn" id="retry-btn"><span aria-hidden="true">↺</span> ${n ? "Försök igen" : "Andra chans"} <small>♥ ${left}</small></button><button class="reveal-btn" id="reveal-btn">Visa rätt svar</button>`;
      $("retry-btn").addEventListener("click", useRetry);
      $("reveal-btn").addEventListener("click", () => { mek.retried[i] = "seen"; saveMek(); renderMek(); });
      next.hidden = true;
      return;
    }
    fb.innerHTML = (right ? `<span class="fb ok">✓ Rätt!${retries(i) === 1 ? " (andra chans)" : retries(i) > 1 ? ` (efter ${retries(i) + 1} försök)` : ""}</span>${bolt}` : `<span class="fb bad">✕ Fel – rätt svar är ${MEK_LABELS[q.correct]}</span>`) + note;
    next.hidden = false;
    next.textContent = i === mek.qs.length - 1 ? "Se resultatet" : "Nästa fråga";
  }

  let autoNextTimer = 0;
  function answerMek(k) {
    if (!mek || mek.done || paused || mek.answers[mek.idx] !== null) return;
    const i = mek.idx;
    if (k < 0 || k >= mek.qs[i].options.length || (mek.removed[i] || []).includes(k)) return;
    mek.answers[i] = k;
    mek.times[i] = Math.max(1, Math.round((performance.now() - questionShownAt) / 1000));
    const right = k === mek.correct[i];
    renderMek();
    const btn = $("mek-options").querySelector(`[data-k="${k}"]`);
    const rightBtn = $("mek-options").querySelector(`[data-k="${mek.correct[i]}"]`);
    if (rightBtn && !retryPending(i)) animate(rightBtn, "ring", 900);
    if (right) {
      combo++;
      haptic(12);
      if (btn) animate(btn, "pulse", 700);
      if (isBolt(i)) { boltFx(btn); sound("bolt"); }
      else { sound("ok"); if (combo >= 2) comboToast(combo); }
      sparkleAt($("mek-card"));
      // Inställningen "Nästa fråga automatiskt": gå vidare efter en kort stund om man inte läser stegen.
      if (prefs().autoNext) {
        clearTimeout(autoNextTimer);
        autoNextTimer = setTimeout(() => { if (mek && mek.idx === i && !mek.done && !paused && mek.shown === 0 && !document.querySelector("dialog[open]")) nextMek(); }, 1300);
      }
    } else {
      combo = 0;
      haptic(25);
      sound("bad");
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
    if (retryPending(mek.idx)) { mek.retried[mek.idx] = "seen"; saveMek(); renderMek(); return; }
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
    { const d = mek.date, k = mek.kind; setTimeout(() => maybeTrophy(d, k), 1800); }
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
      return `<li class="${ok ? "ok" : "bad"}" style="--i:${i}"><span class="mark">${ok ? "✓" : "✕"}</span><span>${q.review || q.explain}${isBolt(i) ? " ⚡" : ""}${retries(i) ? " ↺" : mek.helped[i] ? " 💡" : ""}</span></li>`;
    }).join("");
    const nextLevel = LEVEL_KEYS.slice(LEVEL_KEYS.indexOf(mek.level) + 1).find((l) => { const p = progressAll()[mekId(mek.date, l, mek.kind)]; return !(p && p.done); });
    $("mek-result").innerHTML = `
      <div class="result-card">
        <div class="ring" style="--circ:${circ};--off:${circ * (1 - pct)}">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"/><circle class="bar" cx="60" cy="60" r="54"/></svg>
          <div class="ring-num"><b id="mek-score">${right}</b><span>av ${n}</span></div>
        </div>
        <h2>${msg}</h2>
        ${petCheer(mek.date + mek.kind + mek.level + right)}
        <p>${MODE_NAMES[mek.kind]} · ${LEVELS[mek.level].label}${mek.bonus ? ` · bonusomgång ${mek.bonus}` : ""}${showTime() ? " · " + formatTime(mek.seconds) : ""}</p>
        ${mek.kind === "mat" ? `<p class="bolts">${"⚡".repeat(Math.min(bolts, 10)) || "–"} <span>${bolts} blixtsvar</span></p>` : ""}
        <div class="result-actions">
          ${nextLevel && !mek.bonus ? `<button class="pill" id="mek-next-level">Spela ${LEVELS[nextLevel].label.toLowerCase()}</button>` : ""}
          <button class="pill ghost bonus-btn" id="mek-bonus"><span aria-hidden="true">🎁</span> Bonusomgång</button>
        </div>
      </div>
      <div class="list-title">${mek.kind === "mat" ? "Uppgifter och svar" : "Rätt svar"}</div>
      <ul class="list mek-review">${items}</ul>`;
    $("mek-body").hidden = true;
    $("mek-result").hidden = false;
    const nl = $("mek-next-level");
    if (nl) nl.addEventListener("click", () => openCurrent(mek.date, nextLevel, "next"));
    $("mek-bonus").addEventListener("click", async () => {
      if (!(await offerLifeline("bonus"))) return;
      // Nästa lediga bonusomgång för samma dag, läge och nivå.
      const all = progressAll(), base = mekId(mek.date, mek.level, mek.kind);
      let n = 1;
      while (all[`${base}+b${n}`] && all[`${base}+b${n}`].done) n++;
      openMek(mek.date, mek.level, "next", n);
    });
    if (celebrate) {
      animate($("mek-result"), "enter", 900);
      if (!reduceMotion()) {
        const el = $("mek-score"), start = performance.now();
        const tick = (t) => { const k = Math.min(1, (t - start) / 900); el.textContent = Math.round(right * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
      if (pct >= 0.8) { confetti(right === n ? 1 : 0.5); haptic([15, 60, 15, 60, 30]); sound("win"); }
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

  // ---------- Livlinor och frivillig reklam ----------
  // Alla får 3 gratis livlinor per dag. I App Store- och Google Play-versionen kan man dessutom
  // välja att titta på en kort reklamfilm – varje film ger 2 livlinor (en används direkt, en sparas
  // till senare i dag). Reklam visas aldrig automatiskt, och med Dagsprov Plus är livlinorna obegränsade.
  // Appskalet (Expo) lägger in window.DagsprovNative.showRewarded() som visar en riktig film och
  // svarar true om filmen har setts klart. I förhandsvisningen (eller med ?reklamdemo=1) visas en exempelfilm.
  const FREE_LIFELINES = 3;
  const AD_LIFELINES = 2;      // livlinor per film
  const MAX_ADS_PER_DAY = 10;  // tak, så att ingen fastnar i filmer
  const LIFELINES = {
    retry: { icon: "↺", color: "#ff9500", title: "Andra chans", text: "Ta bort ditt felsvar och försök igen. Frågan räknas som vanligt om du svarar rätt." },
    half: { icon: "✂️", color: "#af52de", title: "50/50", text: "Alla felaktiga alternativ utom ett försvinner – kvar blir rätt svar och ett fel." },
    hint: { icon: "💡", color: "#ffcc00", title: "Extra tips", text: "Du har använt korsordets gratis tips. Få ett tips till." },
    streak: { icon: "🔥", color: "#ff3b30", title: "Rädda sviten", text: "Du missade i går. Rädda sviten så räknas i går som en övningsdag." },
    bonus: { icon: "🎁", color: "#34c759", title: "Bonusomgång", text: "Tio nya frågor på samma nivå – perfekt när du vill öva mer." },
    steps: { icon: "✎", color: "#30b0c7", title: "Ledtråd steg för steg", text: "Se hur man tänker innan du svarar. Efter ditt svar visas hela lösningen alltid gratis." },
  };
  function lifelineState() {
    const p = prefs().lifelines;
    return p && p.date === todayKey() ? { used: p.used || 0, extra: p.extra || 0 } : { used: 0, extra: 0 };
  }
  const freeToday = () => FREE_LIFELINES + (companion() ? 1 : 0); // följeslagaren ger en extra
  const lifelineCap = () => freeToday() + lifelineState().extra;
  // Dagens livlinor (gratis + från filmer) går ut vid midnatt. Köpta livlinor ligger i en egen
  // "bank" som aldrig går ut och kan staplas hur högt som helst.
  function dailyLeft() {
    const s = lifelineState();
    return Math.max(0, freeToday() + s.extra - s.used);
  }
  const bankLeft = () => Math.max(0, Math.floor(+prefs().bank || 0));
  const lifelinesLeft = () => dailyLeft() + bankLeft();
  function spendFreeLifeline() {
    if (dailyLeft()) {
      const s = lifelineState();
      setPref("lifelines", { date: todayKey(), used: s.used + 1, extra: s.extra });
      return true;
    }
    if (bankLeft()) { setPref("bank", bankLeft() - 1); return true; }
    return false;
  }
  function addLifelines(n) {
    const s = lifelineState();
    setPref("lifelines", { date: todayKey(), used: s.used, extra: s.extra + n });
  }
  const adsToday = () => { const a = prefs().adsToday; return a && a.date === todayKey() ? a.n : 0; };
  const nativeAds = () => !!(window.DagsprovNative && typeof window.DagsprovNative.showRewarded === "function");
  const demoAds = () => !nativeAds() && (window.top !== window || /[?&]reklamdemo=1/.test(location.search));
  const adsAvailable = () => (nativeAds() || demoAds()) && adsToday() < MAX_ADS_PER_DAY;
  async function showRewardedAd() {
    let ok = false;
    if (nativeAds()) {
      try { ok = !!(await window.DagsprovNative.showRewarded()); } catch { ok = false; }
    } else if (demoAds()) ok = await demoAd();
    if (ok) {
      setPref("adsWatched", (prefs().adsWatched || 0) + 1);
      setPref("adsToday", { date: todayKey(), n: adsToday() + 1 });
    }
    return ok;
  }
  // Exempelfilm: 5 sekunder med nedräkning. Stänger man tidigare ges ingen belöning.
  function demoAd() {
    return new Promise((resolve) => {
      const el = $("ad-demo"), secs = 5;
      el.hidden = false;
      el.classList.remove("done");
      const start = performance.now();
      let raf = 0;
      const tick = (t) => {
        const k = Math.min(1, (t - start) / (secs * 1000));
        $("ad-secs").textContent = k < 1 ? Math.ceil(secs * (1 - k)) : "✓";
        $("ad-bar").style.strokeDashoffset = String(107 * (1 - k));
        if (k < 1) raf = requestAnimationFrame(tick);
        else el.classList.add("done");
      };
      raf = requestAnimationFrame(tick);
      $("ad-close").onclick = () => {
        cancelAnimationFrame(raf);
        el.hidden = true;
        resolve(el.classList.contains("done"));
      };
    });
  }
  function renderLives(box, left, bank = 0) {
    box.innerHTML = Array.from({ length: Math.max(FREE_LIFELINES, left) }, (_, i) => `<i class="${i < left ? "on" : ""}" style="--i:${i}">♥</i>`).join("") +
      (bank ? `<b class="bank-chip" style="--i:${Math.max(FREE_LIFELINES, left)}">+${bank} köpta</b>` : "");
  }
  // Frågar om en livlina ska användas. Svarar true om användaren fick den (gratis, via film eller Plus).
  let rewardResolve = null;
  function offerLifeline(kind) {
    // Med Plus är livlinorna obegränsade – inget ark behövs.
    if (isPlus()) { plusBurst(LIFELINES[kind].title); return Promise.resolve(true); }
    const ll = LIFELINES[kind], daily = dailyLeft(), bank = bankLeft(), left = daily + bank, ads = adsAvailable();
    $("reward-icon").textContent = ll.icon;
    $("reward-icon").style.setProperty("--c", ll.color);
    $("reward-title").textContent = ll.title;
    $("reward-text").textContent = ll.text;
    renderLives($("reward-lives"), daily, bank);
    const free = $("reward-free"), ad = $("reward-ad");
    free.hidden = !left;
    free.textContent = daily ? `Använd livlina (${daily} kvar i dag${bank ? ` + ${bank} köpta` : ""})` : bank ? `Använd köpt livlina (${bank} kvar)` : "";
    $("reward-buy").hidden = !shopAvailable() || daily > 0;
    ad.hidden = !ads;
    ad.classList.toggle("primary", !left);
    $("reward-ad-t").innerHTML = `Titta på en kort film · +${AD_LIFELINES} livlinor<small>En används nu, en sparas till senare i dag</small>`;
    $("reward-note").textContent = !left && !ads
      ? "Dagens livlinor är slut. Nya kommer i morgon."
      : !left ? "Dagens gratis livlinor är slut." : "";
    $("reward-plus").hidden = !plusAvailable();
    kbInput.blur();
    $("reward-dialog").showModal();
    animate($("reward-icon"), "bounce", 900);
    haptic(8);
    return new Promise((resolve) => { rewardResolve = resolve; });
  }
  function finishReward(ok, msg) {
    const done = rewardResolve;
    rewardResolve = null;
    if ($("reward-dialog").open) $("reward-dialog").close();
    if (ok) { sound("ok"); haptic([12, 40, 12]); rewardBurst(msg); }
    if (mek && !$("mek").hidden) renderLifelineBar();
    if (done) done(ok);
  }
  function rewardBurst(msg, cls) {
    const el = document.createElement("div");
    el.className = "reward-burst" + (cls ? " " + cls : "");
    el.textContent = msg || "✓ Livlina aktiverad";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  $("reward-free").addEventListener("click", () => finishReward(spendFreeLifeline()));
  $("reward-ad").addEventListener("click", async () => {
    $("reward-dialog").close();
    const ok = await showRewardedAd();
    if (ok) { addLifelines(AD_LIFELINES); spendFreeLifeline(); }
    else toast("Filmen avbröts – ingen livlina den här gången");
    finishReward(ok, ok ? `✓ +${AD_LIFELINES} livlinor · 1 sparad` : "");
  });
  $("reward-cancel").addEventListener("click", () => finishReward(false));
  // Köp livlinor direkt från belöningsarket: köpet läggs i banken och en används direkt.
  $("reward-buy").addEventListener("click", async () => {
    $("reward-dialog").close();
    const got = await openShop();
    if (got && isPlus()) finishReward(true, "★ Plus är aktiverat");
    else if (got && spendFreeLifeline()) finishReward(true, `✓ +${got} livlinor · ${bankLeft()} sparade`);
    else if (rewardResolve) $("reward-dialog").showModal(); // tillbaka till valet
  });
  // Plus från belöningsarket: köper man Plus får man livlinan direkt.
  $("reward-plus").addEventListener("click", async () => {
    $("reward-dialog").close();
    const got = await openPlus("lifelines");
    finishReward(got, got ? "★ Plus är aktiverat" : "");
  });
  $("ad-privacy").addEventListener("click", () => { if (window.DagsprovNative && window.DagsprovNative.privacyOptions) window.DagsprovNative.privacyOptions(); });
  $("reward-dialog").addEventListener("cancel", (e) => { if (rewardResolve) finishReward(false); else e.preventDefault(); });

  // ---------- Köpa livlinor ----------
  // Förbrukningsbara köp (App Store / Google Play). Köpta livlinor går aldrig ut och staplas.
  // Bryggan: DagsprovNative.shop = { products(), buy(id) } där buy svarar med antalet livlinor.
  const SHOP_PACKS = [
    { id: "lifelines_1", n: 1, price: "5 kr" },
    { id: "lifelines_5", n: 5, price: "19 kr", badge: "Spara 24 %" },
    { id: "lifelines_15", n: 15, price: "45 kr", badge: "Bäst värde · spara 40 %" },
  ];
  const shopBridge = () => (window.DagsprovNative && window.DagsprovNative.shop) || null;
  const shopAvailable = () => !!shopBridge() || (!shopBridge() && demoAds());
  let shopResolve = null;
  function renderShop() {
    $("shop-bank").textContent = bankLeft() ? `Du har ${bankLeft()} köpta livlinor` : "Köpta livlinor går aldrig ut och kan sparas hur länge du vill.";
    $("shop-packs").innerHTML = SHOP_PACKS.map((pk) => `<button class="plan pack" data-pack="${pk.id}">
      ${pk.badge ? `<span class="plan-badge">${pk.badge}</span>` : ""}<span class="pack-hearts" aria-hidden="true">${"♥".repeat(Math.min(pk.n, 3))}</span>
      <span class="plan-t"><b>${pk.n} ${pk.n === 1 ? "livlina" : "livlinor"}</b><small>${pk.n > 1 ? `${(parseFloat(pk.price.replace(",", ".")) / pk.n).toFixed(2).replace(".", ",")} kr st` : "Engångsköp"}</small></span>
      <span class="plan-p"><b>${pk.price}</b></span></button>`).join("");
    $("shop-packs").querySelectorAll(".pack").forEach((b) => b.addEventListener("click", () => buyPack(b.dataset.pack, b)));
    $("shop-plus").hidden = !plusAvailable();
    $("shop-demo").hidden = !!shopBridge();
  }
  // Öppnar butiken. Svarar med antalet köpta livlinor (0 om inget köptes).
  let shopStay = false;
  function openShop(stay) {
    shopStay = !!stay;
    renderShop();
    kbInput.blur();
    $("shop-dialog").showModal();
    animate($("shop-dialog").querySelector(".reward-icon"), "bounce", 900);
    if (shopBridge() && shopBridge().products) {
      Promise.resolve(shopBridge().products()).then((list) => {
        if (!Array.isArray(list)) return;
        for (const o of list) { const pk = SHOP_PACKS.find((x) => o && x.id === o.id); if (pk && typeof o.price === "string") pk.price = escapeHtml(o.price.slice(0, 30)); }
        if ($("shop-dialog").open) renderShop();
      }).catch(() => {});
    }
    return new Promise((resolve) => { shopResolve = resolve; });
  }
  function finishShop(n) {
    const done = shopResolve;
    shopResolve = null;
    if ($("shop-dialog").open) $("shop-dialog").close();
    if (done) done(n);
  }
  async function buyPack(id, btn) {
    const pk = SHOP_PACKS.find((x) => x.id === id);
    if (!pk || btn.disabled) return;
    btn.disabled = true;
    let n = 0;
    try {
      if (shopBridge()) n = Math.max(0, Math.floor(+(await shopBridge().buy(id)) || 0));
      else if (demoAds() && await confirmBox("Förhandsvisning", `I appen öppnas App Stores eller Google Plays köpruta här (${pk.n} ${pk.n === 1 ? "livlina" : "livlinor"} för ${pk.price}). Vill du låtsasköpa?`, "Köp")) n = pk.n;
    } catch { n = 0; }
    btn.disabled = false;
    if (!n) { if ($("shop-dialog").open) renderShop(); return; }
    setPref("bank", bankLeft() + n);
    setPref("bought", (prefs().bought || 0) + n);
    sound("ok"); haptic([12, 40, 12]);
    if (shopResolve && !shopStay) finishShop(n);
    else { rewardBurst(`✓ +${n} livlinor`); renderShop(); }
    if ($("settings-dialog").open) renderSettings();
    if (mek && !$("mek").hidden) renderLifelineBar();
  }
  $("shop-cancel").addEventListener("click", () => finishShop(0));
  $("shop-dialog").addEventListener("cancel", () => finishShop(0));
  $("shop-plus").addEventListener("click", async () => {
    const done = shopResolve;
    shopResolve = null;
    $("shop-dialog").close();
    const got = await openPlus("lifelines");
    if (done) done(got ? Infinity : 0);
  });

  // ---------- Dagsprov Plus ----------
  // Frivilligt köp via App Store / Google Play (RevenueCat i appskalet). Allt som behövs för att lära sig
  // – dagens övningar, förklaringar och hela lösningen efter svaret – är alltid gratis. Plus ger
  // obegränsade livlinor, hela arkivet, ledtrådar före svaret, inga filmer och extra färgteman.
  //
  // Bryggan i appskalet: DagsprovNative.plus = { offerings(), purchase(id), restore(), manage() } och
  // window.__dagsprovPlus(active) när köpstatusen ändras. I förhandsvisningen går köpen att prova på
  // låtsas. På den vanliga webben finns inga köp – där visas att Plus finns i appen.
  const PLUS_PLANS = [
    { id: "annual", title: "12 månader", price: "199 kr", sub: "16,58 kr/mån", badge: "Spara 53 %", trial: "7 dagar gratis, sedan 199 kr/år" },
    { id: "monthly", title: "1 månad", price: "35 kr", sub: "per månad" },
    { id: "lifetime", title: "För alltid", price: "399 kr", sub: "engångsköp" },
  ];
  const FREE_ARCHIVE_DAYS = 7;
  const TRIAL_HOURS = 24;
  const plusBridge = () => (window.DagsprovNative && window.DagsprovNative.plus) || null;
  const demoPlus = () => !plusBridge() && demoAds();
  const plusAvailable = () => !!plusBridge() || demoPlus();
  function plusTrialLeft() {
    const until = prefs().plusTrial || 0;
    return Math.max(0, until - Date.now());
  }
  function isPlus() {
    const p = prefs();
    if (plusTrialLeft() > 0) return true;
    if (plusBridge()) return p.plusNative === true;
    return demoPlus() && p.plusDemo === true;
  }
  let plusPlan = "annual", plusResolve = null, plusFocus = null;
  let storePlans = null; // planerna som butiken faktiskt erbjuder (null = inte hämtade än)
  function mergeOfferings(list) {
    if (!Array.isArray(list) || !list.length) return;
    storePlans = new Set(list.map((o) => o && o.id));
    if (!storePlans.has(plusPlan)) plusPlan = PLUS_PLANS.find((x) => storePlans.has(x.id))?.id || plusPlan;
    for (const o of list) {
      const plan = PLUS_PLANS.find((x) => o && x.id === o.id);
      if (!plan) continue;
      for (const k of ["price", "sub", "trial", "badge"]) if (typeof o[k] === "string") plan[k] = escapeHtml(o[k].slice(0, 60));
      plan.native = true;
    }
  }
  function renderPlus() {
    const plus = isPlus(), trial = plusTrialLeft(), owned = plus && !trial;
    const bridge = plusBridge();
    $("plus-sub").textContent = owned ? "Tack för att du stöttar Dagsprov! Allt i Plus är upplåst."
      : trial ? `Du provar Plus – ${Math.ceil(trial / 36e5)} h kvar.`
      : "Öva utan gränser – och stöd en app utan spårning.";
    document.querySelectorAll("#plus-feats li").forEach((li) => li.classList.toggle("focus", li.dataset.f === plusFocus));
    $("plus-plans").hidden = owned;
    $("plus-plans").innerHTML = PLUS_PLANS.filter((pl) => !storePlans || storePlans.has(pl.id)).map((pl) => `<button class="plan" role="radio" data-plan="${pl.id}" aria-checked="${pl.id === plusPlan}">
      ${pl.badge ? `<span class="plan-badge">${pl.badge}</span>` : ""}<span class="radio"></span>
      <span class="plan-t"><b>${pl.title}</b><small>${pl.trial || (pl.id === "lifetime" ? "Betala en gång, behåll för alltid" : "Förnyas varje månad")}</small></span>
      <span class="plan-p"><b>${pl.price}</b><small>${pl.sub}</small></span></button>`).join("");
    $("plus-plans").querySelectorAll(".plan").forEach((b) => b.addEventListener("click", () => { plusPlan = b.dataset.plan; haptic(6); renderPlus(); }));
    const plan = PLUS_PLANS.find((x) => x.id === plusPlan);
    const buy = $("plus-buy");
    buy.hidden = owned;
    buy.disabled = !plusAvailable();
    buy.textContent = !plusAvailable() ? "Plus finns i appen för iPhone och Android"
      : plan.trial ? `Starta ${plan.trial.split(" gratis")[0]} gratis` : plan.id === "lifetime" ? `Köp för ${plan.price}` : `Fortsätt – ${plan.price}/mån`;
    $("plus-status").hidden = !owned;
    $("plus-status").textContent = owned ? "✓ Du har Dagsprov Plus" + (demoPlus() ? " (förhandsvisning)" : "") : "";
    const canTrial = !plus && adsAvailable() && Date.now() - (prefs().plusTrialAt || 0) > 7 * 864e5;
    $("plus-trial").hidden = !canTrial;
    $("plus-restore").hidden = !plusAvailable() || owned;
    $("plus-manage").hidden = !owned || !(bridge && bridge.manage) && !demoPlus();
    $("plus-manage").textContent = demoPlus() ? "Avsluta Plus (förhandsvisning)" : "Hantera abonnemang";
    const store = window.DagsprovNative && window.DagsprovNative.platform === "android" ? "Google Play" : "App Store";
    $("plus-legal").textContent = owned || !plusAvailable() ? ""
      : plan.id === "lifetime" ? `Engångsköp via ${store}. Inget abonnemang.`
      : `${plan.trial ? "Efter provperioden förnyas" : "Förnyas"} abonnemanget automatiskt för ${plan.price} per ${plan.id === "annual" ? "år" : "månad"} tills du säger upp det. ` +
        `Betalningen dras från ditt ${store}-konto. Säg upp när som helst, senast 24 timmar före nästa period, i kontoinställningarna i ${store}.` +
        (demoPlus() ? " Förhandsvisning: inga riktiga köp görs här." : "");
  }
  // Öppnar Plus-arket. Svarar true om användaren har Plus när arket stängs.
  function openPlus(focus) {
    plusFocus = focus || null;
    renderPlus();
    kbInput.blur();
    const dlg = $("plus-dialog");
    if (!dlg.open) dlg.showModal();
    dlg.querySelector(".sheet-body").scrollTop = 0;
    const f = focus && dlg.querySelector(`#plus-feats [data-f="${focus}"]`);
    if (f) animate(f, "pulse", 900);
    haptic(8);
    if (plusBridge() && plusBridge().offerings) {
      Promise.resolve(plusBridge().offerings()).then((list) => { mergeOfferings(list); if (dlg.open) renderPlus(); }).catch(() => {});
    }
    return new Promise((resolve) => { plusResolve = resolve; });
  }
  $("plus-dialog").addEventListener("close", () => {
    const done = plusResolve;
    plusResolve = null;
    if (done) done(isPlus());
  });
  function plusChanged(celebrate) {
    document.documentElement.classList.toggle("has-plus", isPlus());
    document.documentElement.classList.toggle("no-plus", !plusAvailable() && !isPlus());
    // Utan Plus återgår en Plus-färg till standard.
    if (!isPlus() && ["gold", "mint", "graphite"].includes(prefs().accent)) { setPref("accent", "blue"); applyStyle(); }
    if ($("plus-dialog").open) renderPlus();
    if ($("settings-dialog").open) renderSettings();
    if (mek && !mek.done && !$("mek").hidden) renderLifelineBar();
    if (celebrate) {
      sound("win"); haptic([12, 40, 12, 40, 20]);
      rewardBurst("★ Välkommen till Plus!", "plus-burst");
      if (typeof confetti === "function" && !reduceMotion()) confetti();
    }
  }
  // Appskalet anropar denna när köpstatusen hämtats eller ändrats.
  window.__dagsprovPlus = (active) => {
    const was = isPlus();
    setPref("plusNative", !!active);
    plusChanged(!was && isPlus() && $("plus-dialog").open);
  };
  if (window.DagsprovNative && typeof window.DagsprovNative.plusActive === "boolean") setPref("plusNative", window.DagsprovNative.plusActive);
  $("plus-buy").addEventListener("click", async () => {
    const btn = $("plus-buy");
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Ett ögonblick …";
    let ok = false;
    try {
      if (plusBridge()) ok = !!(await plusBridge().purchase(plusPlan));
      else if (demoPlus()) {
        const pl = PLUS_PLANS.find((x) => x.id === plusPlan);
        ok = await confirmBox("Förhandsvisning", `I appen öppnas App Stores eller Google Plays köpruta här (${pl.trial || pl.price + " " + pl.sub}). Vill du prova Plus på låtsas?`, "Prova Plus");
      }
    } catch { ok = false; }
    btn.disabled = false;
    btn.textContent = label;
    if (!ok) return;
    if (demoPlus()) setPref("plusDemo", true);
    else setPref("plusNative", true);
    plusChanged(true);
  });
  $("plus-restore").addEventListener("click", async () => {
    let ok = false;
    try { if (plusBridge()) ok = !!(await plusBridge().restore()); } catch { ok = false; }
    if (ok) { setPref("plusNative", true); plusChanged(true); }
    else toast(plusBridge() ? "Hittade inget tidigare köp på det här kontot" : "Inga köp att återställa i förhandsvisningen");
  });
  $("plus-manage").addEventListener("click", () => {
    if (demoPlus()) { setPref("plusDemo", false); setPref("plusTrial", 0); plusChanged(false); toast("Plus är avslutat i förhandsvisningen"); return; }
    try { plusBridge().manage(); } catch { /* inget att göra */ }
  });
  // Provdag: en film ger 24 timmar Plus, en gång i veckan. Så ser man vad Plus är värt.
  $("plus-trial").addEventListener("click", async () => {
    const dlg = $("plus-dialog");
    dlg.close();
    const ok = await showRewardedAd();
    if (!ok) { toast("Filmen avbröts – prova igen när du vill"); return; }
    setPref("plusTrial", Date.now() + TRIAL_HOURS * 36e5);
    setPref("plusTrialAt", Date.now());
    plusChanged(true);
    toast(`★ Plus i ${TRIAL_HOURS} timmar – mycket nöje!`);
  });
  function plusBurst(what) {
    haptic(10);
    rewardBurst(`★ ${what}`, "plus-burst");
  }

  // --- Arkivet: de senaste 7 dagarna är gratis, äldre dagar ingår i Plus ---
  // En enskild dag kan också låsas upp med en film. Dagar man redan har spelat är alltid öppna.
  function dayStarted(date) {
    const all = progressAll();
    return Object.keys(all).some((k) => k.startsWith(date + "|"));
  }
  // På den vanliga webben finns varken köp eller reklam – där är arkivet och ledtrådarna helt fria.
  const monetized = () => plusAvailable() || adsAvailable();
  function dayLocked(date) {
    if (!monetized() || isPlus() || date >= addDays(todayKey(), -FREE_ARCHIVE_DAYS)) return false;
    if ((prefs().unlockedDays || []).includes(date)) return false;
    return !dayStarted(date);
  }
  let dayResolve = null;
  function offerDay(date) {
    $("day-title").textContent = longDate(date);
    $("day-ad").hidden = !adsAvailable();
    $("day-plus").hidden = !plusAvailable();
    $("day-note").textContent = plusAvailable() ? "" : "Äldre dagar ingår i Dagsprov Plus i appen för iPhone och Android.";
    $("day-dialog").showModal();
    animate($("day-dialog").querySelector(".reward-icon"), "bounce", 900);
    return new Promise((resolve) => { dayResolve = resolve; });
  }
  function finishDay(ok) {
    const done = dayResolve;
    dayResolve = null;
    if ($("day-dialog").open) $("day-dialog").close();
    if (done) done(ok);
  }
  $("day-ad").addEventListener("click", async () => {
    $("day-dialog").close();
    const ok = await showRewardedAd();
    if (!ok) { toast("Filmen avbröts – dagen är fortfarande låst"); return finishDay(false); }
    finishDay(true);
  });
  $("day-plus").addEventListener("click", async () => {
    $("day-dialog").close();
    finishDay(await openPlus("archive"));
  });
  $("day-cancel").addEventListener("click", () => finishDay(false));
  $("day-dialog").addEventListener("cancel", () => finishDay(false));
  async function unlockDay(date) {
    if (!dayLocked(date)) return true;
    const ok = await offerDay(date);
    if (ok && !isPlus()) setPref("unlockedDays", [...(prefs().unlockedDays || []), date].slice(-60));
    if (ok) rewardBurst("🔓 Dagen är upplåst");
    return ok;
  }

  // --- Andra chans och 50/50 i frågelägena ---
  async function useRetry() {
    const i = mek.idx;
    if (!retryPending(i)) return;
    if (!(await offerLifeline("retry"))) return;
    const wrong = mek.answers[i];
    mek.retried[i] = retries(i) + 1;
    mek.removed[i] = [...new Set([...(mek.removed[i] || []), wrong])];
    mek.answers[i] = null;
    mek.times[i] = null;
    mek.helped[i] = true; // inget blixtsvar efter en andra chans
    saveMek();
    renderMek("from-next");
    renderMekDots();
  }
  async function useHalf() {
    const i = mek.idx, q = mek.qs[i];
    if (mek.done || mek.answers[i] !== null || mek.halved[i]) return;
    if (!(await offerLifeline("half"))) return;
    const removed = new Set(mek.removed[i] || []);
    const wrong = q.options.map((_, k) => k).filter((k) => k !== q.correct && !removed.has(k));
    const drop = shuffled(wrong, mulberry32(hashString(`${mek.date}|${mek.kind}|${i}|half`))).slice(0, Math.max(0, wrong.length - 1)); // kvar: rätt svar + ett fel
    mek.removed[i] = [...removed, ...drop];
    mek.halved[i] = true;
    mek.helped[i] = true;
    saveMek();
    renderMek();
    drop.forEach((k) => { const b = $("mek-options").querySelector(`[data-k="${k}"]`); if (b) animate(b, "vanish", 600); });
  }
  function renderLifelineBar() {
    const i = mek.idx, answered = mek.answers[i] !== null;
    $("lifeline-bar").hidden = mek.done;
    $("ll-half").disabled = answered || !!mek.halved[i];
    $("ll-left").textContent = isPlus() ? "★ Plus · ∞" : `♥ ${dailyLeft()} i dag${bankLeft() ? ` · ${bankLeft()} köpta` : ""}`;
  }
  $("ll-half").addEventListener("click", useHalf);

  // --- Rädda sviten ---
  // Missade man i går men övade i förrgår kan i går räknas som en övningsdag (en gång per dag).
  function brokenStreak() {
    const st = computeStats(), today = todayKey(), y = addDays(today, -1);
    if (st.playedDays.has(today) || st.playedDays.has(y) || (prefs().frozen || []).includes(y)) return 0;
    let n = 0, d = addDays(today, -2);
    while (st.playedDays.has(d) || (prefs().frozen || []).includes(d)) { n++; d = addDays(d, -1); }
    return n >= 2 ? n : 0;
  }
  async function rescueStreak() {
    const n = brokenStreak();
    if (!n) return;
    if (!(await offerLifeline("streak"))) return;
    setPref("frozen", [...(prefs().frozen || []), addDays(todayKey(), -1)].slice(-30));
    $("streak-banner").hidden = true;
    toast(`🔥 Sviten på ${n + 1} dagar är räddad!`);
  }
  function maybeOfferStreak() {
    const n = brokenStreak();
    if (!n || prefs().streakOffered === todayKey()) return;
    setPref("streakOffered", todayKey());
    $("streak-text").textContent = `Sviten på ${n} dagar bröts i går`;
    $("streak-banner").hidden = false;
  }
  $("streak-rescue").addEventListener("click", rescueStreak);
  $("streak-close").addEventListener("click", () => ($("streak-banner").hidden = true));

  // --- Extra tips i korsordet ---
  const FREE_HINTS = { easy: 5, medium: 4, hard: 3, expert: 3 };
  const hintsLeft = () => (state ? FREE_HINTS[state.level] + (state.extraHints || 0) - state.hints : 0);
  function renderHintCount() {
    if (!state) return;
    const left = Math.max(0, hintsLeft());
    $("hint-count").textContent = left ? left : "+";
    $("hint-count").classList.toggle("empty", !left);
  }
  async function withHint(fn) {
    if (!playable()) return;
    if (hintsLeft() <= 0) {
      if (!(await offerLifeline("hint"))) return;
      state.extraHints = (state.extraHints || 0) + 1;
    }
    fn();
    renderHintCount();
  }

  // ---------- Dagens ord (eget ark med vändbart kort) ----------
  let wotdShown = null;
  const exampleHtml = (s) => escapeHtml(s).replace(/\*([^*]+)\*/g, "<mark>$1</mark>");
  function showWotdCard(date, anim) {
    const w = wotdFor(date);
    wotdShown = { ...w, date };
    $("wotd-date").textContent = date === todayKey() ? longDate(date) : `${longDate(date)} · tidigare ord`;
    $("wotd-word").textContent = w.word.toLowerCase();
    $("wotd-word2").textContent = w.word.toLowerCase();
    $("wotd-meaning").textContent = w.clue;
    $("wotd-example").innerHTML = exampleHtml(w.example);
    $("wotd-card").classList.remove("flipped");
    $("wotd-card").setAttribute("aria-label", `Dagens ord: ${w.word.toLowerCase()}. Tryck för att visa betydelsen.`);
    if (anim) animate($("wotd-card"), "deal", 700);
    document.querySelectorAll("#wotd-history [data-date]").forEach((b) => b.classList.toggle("current", b.dataset.date === date));
  }
  function openWotd() {
    const today = todayKey();
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i)).filter((d) => d >= FIRST_DAY);
    $("wotd-history").innerHTML = days.map((d, i) => {
      const w = wotdFor(d);
      const label = i === 0 ? "I går" : fromKey(d).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "short" });
      return `<li><button class="row" data-date="${d}" style="--i:${i}"><span class="lbl"><b>${escapeHtml(w.word.toLowerCase())}</b><small>${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</small></span><svg class="chev-r" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></li>`;
    }).join("");
    $("wotd-history").querySelectorAll("[data-date]").forEach((b) => b.addEventListener("click", () => {
      showWotdCard(b.dataset.date, true);
      $("wotd-dialog").querySelector(".sheet-body").scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
      haptic(8);
    }));
    showWotdCard(today, true);
    setPref("wotdSeen", today);
    renderWotdBadge();
    $("wotd-dialog").showModal();
  }
  function flipWotd() {
    const card = $("wotd-card");
    const flipped = card.classList.toggle("flipped");
    card.setAttribute("aria-label", flipped ? `${wotdShown.word.toLowerCase()} betyder ${wotdShown.clue}. ${wotdShown.example.replace(/\*/g, "")}` : `Dagens ord: ${wotdShown.word.toLowerCase()}. Tryck för att visa betydelsen.`);
    haptic(10);
    if (flipped) { sound("ok"); setTimeout(() => sparkleAt(card), 250); }
  }
  function renderWotdBadge() {
    $("btn-wotd").classList.toggle("has-badge", prefs().wotdSeen !== todayKey());
  }
  $("btn-wotd").addEventListener("click", openWotd);
  $("word-of-day").addEventListener("click", () => { $("words-dialog").close(); openWotd(); });
  renderWotdBadge();
  $("wotd-card").addEventListener("click", flipWotd);
  $("wotd-share").addEventListener("click", async () => {
    if (!wotdShown) return;
    const text = `Dagens ord i Dagsprov: ${wotdShown.word.toLowerCase()} – ${wotdShown.clue}. ”${wotdShown.example.replace(/\*/g, "")}”`;
    try {
      if (navigator.share) { await navigator.share({ title: "Dagens ord", text }); return; }
      await navigator.clipboard.writeText(text);
      toast("Dagens ord är kopierat");
    } catch (e) {
      if (!(e && e.name === "AbortError")) toast("Det gick inte att dela just nu");
    }
  });
  $("wotd-practice").addEventListener("click", () => {
    $("wotd-dialog").close();
    if (mode() !== "ord") setMode("ord");
  });

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
    document.querySelectorAll(`#${picker} button`).forEach((b) => b.addEventListener("click", async () => {
      if (b.classList.contains("plus-only") && !isPlus() && !(await openPlus("accent"))) return;
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
      // iOS kan skjuta upp sidan när tangentbordet öppnas – appen följer den synliga ytan i stället.
      document.documentElement.style.setProperty("--vv-top", Math.max(0, Math.round(vv.offsetTop)) + "px");
      const kbOpen = typing && (Math.max(document.documentElement.clientHeight, fullHeight) - vv.height > 120);
      document.body.classList.toggle("kb-open", kbOpen);
      const wasCompact = document.body.classList.contains("compact");
      document.body.classList.toggle("compact", kbOpen && vv.height < 720);
      const isCompact = document.body.classList.contains("compact");
      if (wasCompact && !isCompact) { $("board-area").scrollTop = 0; $("board-area").scrollLeft = 0; boardEl.style.width = ""; document.body.classList.remove("board-fits"); }
      if (isCompact && state) requestAnimationFrame(() => { fitCompactBoard(); keepInView(); });
    }
    if (window.scrollY) window.scrollTo(0, 0);
  }
  // När tangentbordet är uppe: visa hela rutnätet om rutorna då blir minst 24 px (man skriver ju
  // med tangentbordet, så rutorna behöver inte vara stora att träffa). Annars fyll bredden och
  // skrolla bara i höjdled, och bara för riktigt stora korsord i båda led.
  function fitCompactBoard() {
    if (!state || !document.body.classList.contains("compact")) return;
    const area = $("board-area"), cs = getComputedStyle(boardEl), as = getComputedStyle(area);
    const { rows, cols } = state.puzzle;
    const pad = parseFloat(cs.paddingLeft) || 0, gap = parseFloat(cs.columnGap) || 0;
    const w = area.clientWidth - 4 - 2 * pad - (cols - 1) * gap;
    const h = area.clientHeight - parseFloat(as.paddingTop) - parseFloat(as.paddingBottom) - 2 * pad - (rows - 1) * gap;
    const wFit = w / cols, hFit = h / rows;
    let cell = Math.min(wFit, hFit);
    const fits = cell >= 20;
    if (!fits) cell = wFit >= 26 ? wFit : 30;
    cell = Math.min(cell, 52);
    boardEl.style.width = Math.floor(cell * cols + (cols - 1) * gap + 2 * pad) + "px";
    // Syns hela rutnätet behövs inte bokstavsraden i ledtrådskortet – då får rutnätet mer plats.
    document.body.classList.toggle("board-fits", fits);
  }
  if (vv) { vv.addEventListener("resize", syncViewport); vv.addEventListener("scroll", syncViewport); }
  // Ytan för rutnätet ändras också när ledtråden byter antal rader – anpassa då igen.
  if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(fitCompactBoard)).observe($("board-area"));
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
  $("btn-letter").addEventListener("click", () => withHint(() => { animate($("btn-letter"), "used", 900); reveal([[state.sel.r, state.sel.c]]); }));
  $("btn-undo").addEventListener("click", undo);
  $("btn-erase").addEventListener("click", erase);
  $("btn-word").addEventListener("click", () => { $("more-dialog").close(); withHint(() => reveal(cellsOf(currentWord()))); });
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
  // ---------- Inställningar (som i iOS: en startsida med undersidor) ----------
  const APP_VERSION = "3.0";
  const CHECK_NAMES = { off: "Av", word: "Per ord", letter: "Direkt" };
  const THEME_NAMES = { auto: "Auto", light: "Ljust", dark: "Mörkt" };
  const ACCENT_NAMES = { blue: "Blå", indigo: "Indigo", purple: "Lila", pink: "Rosa", orange: "Orange", teal: "Turkos", gold: "Guld", mint: "Mint", graphite: "Grafit" };
  const TEXT_KEYS = ["s", "m", "l", "xl"];
  const setStack = [];

  function renderSettings() {
    const p = prefs();
    renderThemePicker(); renderCheckPicker(); renderStylePickers(); renderTextPicker(); renderBoltPicker();
    $("time-toggle").checked = showTime();
    $("skip-toggle").checked = !!p.skipFilled;
    $("autonext-toggle").checked = !!p.autoNext;
    $("notes-toggle").checked = p.notes !== false;
    $("sound-toggle").checked = soundOn();
    $("haptic-toggle").checked = p.haptics !== false;
    $("motion-toggle").checked = !!p.reduceMotion;
    $("val-appearance").textContent = `${THEME_NAMES[p.theme || "auto"]} · ${ACCENT_NAMES[p.accent || "blue"]}`;
    $("val-check").textContent = CHECK_NAMES[checkMode()];
    $("val-bolt").textContent = boltSeconds() ? boltSeconds() + " s" : "Av";
    $("ad-privacy-row").hidden = !(window.DagsprovNative && window.DagsprovNative.privacyOptions);
    const plus = isPlus(), left = lifelinesLeft(), trial = plusTrialLeft();
    const daily = dailyLeft(), bank = bankLeft();
    $("val-lifelines").textContent = plus ? "∞ Obegränsat" : `${"♥".repeat(Math.min(daily, 9))}${"♡".repeat(Math.max(0, lifelineCap() - daily))}  ${daily} i dag${bank ? ` + ${bank} köpta` : ""}`;
    $("shop-row").hidden = plus || !shopAvailable();
    $("lifeline-note").textContent = plus ? "Med Plus är livlinorna obegränsade – andra chans, 50/50, tips, ledtrådar före svaret, bonusomgångar och att rädda sviten."
      : `Varje dag får du ${FREE_LIFELINES} gratis livlinor: andra chans, 50/50, extra tips, ledtrådar före svaret, bonusomgångar och att rädda en bruten svit.` +
        (adsAvailable() ? ` Är de slut kan du titta på en kort film för ${AD_LIFELINES} till – helt frivilligt. Reklam visas aldrig av sig själv.` : "");
    $("set-plus").classList.toggle("active", plus);
    $("val-remind").textContent = remindOn() ? `Kl. ${remindTime().replace(":", ".")}` : "Av";
    renderRemind();
    $("val-plus").textContent = trial ? `Provperiod – ${Math.ceil(trial / 36e5)} h kvar` : plus ? "Aktivt – tack för ditt stöd!" : "Obegränsade livlinor, hela arkivet och mer";
    $("set-plus").hidden = !plus && !plusAvailable() && !demoPlus();
    const st = computeStats();
    $("set-hero-sub").textContent = st.days
      ? `🔥 ${st.streak} ${st.streak === 1 ? "dag" : "dagar"} i rad · ${st.answeredTotal + st.words} ord och frågor`
      : "Öva inför högskoleprovet varje dag";
  }
  function renderCheckPicker() {
    document.querySelectorAll("#check-picker [data-check]").forEach((b) => b.setAttribute("aria-checked", b.dataset.check === checkMode()));
  }
  function renderBoltPicker() {
    document.querySelectorAll("#bolt-picker [data-bolt]").forEach((b) => b.setAttribute("aria-checked", +b.dataset.bolt === boltSeconds()));
  }
  function renderTextPicker() {
    const t = prefs().textSize || "m";
    document.querySelectorAll("#text-picker [data-text]").forEach((b) => b.setAttribute("aria-checked", b.dataset.text === t));
    $("text-picker").querySelector(".segmented").style.setProperty("--i", TEXT_KEYS.indexOf(t));
  }

  // Liten förhandsvisning av rutnätet i Utseende, så att man ser valen direkt.
  (function buildPreview() {
    const rows = ["FYNDIG", "#Ö##N#", "#R##K#"];
    const el = $("preview-board");
    el.style.setProperty("--cols", 6); el.style.setProperty("--rows", 3);
    el.innerHTML = rows.flatMap((row, r) => [...row].map((ch, c) => {
      if (ch === "#") return `<div class="cell block"></div>`;
      const cls = r === 0 ? (c === 2 ? "selected" : "in-word") : c === 4 && r === 2 ? "" : "locked";
      const show = r === 0 ? (c < 2 ? ch : "") : ch;
      return `<div class="cell letter ${cls}">${r === 0 && c === 0 ? '<span class="num">1</span>' : ""}<span class="ch">${show}</span></div>`;
    })).join("");
  })();

  // Navigering mellan sidorna i inställningsarket.
  function showSetPage(name, dir) {
    const pages = [...document.querySelectorAll(".set-page")];
    const next = pages.find((p) => p.dataset.page === name);
    const prev = pages.find((p) => !p.hidden && p !== next);
    next.hidden = false;
    $("set-title").textContent = next.dataset.title;
    const inSub = name !== "root";
    $("set-back").classList.toggle("show", inSub);
    $("set-back-label").textContent = inSub ? pages.find((p) => p.dataset.page === (setStack[setStack.length - 2] || "root")).dataset.title : "";
    if (!prev) return;
    if (!dir || reduceMotion() || !next.animate) { prev.hidden = true; if (dir !== "pop") next.scrollTop = 0; return; }
    const ease = "cubic-bezier(.3, .7, .2, 1)", ms = 380;
    if (dir === "push") {
      next.scrollTop = 0;
      next.animate([{ transform: "translateX(100%)" }, { transform: "none" }], { duration: ms, easing: ease });
      prev.animate([{ transform: "none", opacity: 1 }, { transform: "translateX(-30%)", opacity: 0 }], { duration: ms, easing: ease }).onfinish = () => (prev.hidden = true);
    } else {
      next.animate([{ transform: "translateX(-30%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: ms, easing: ease });
      prev.style.zIndex = 2;
      prev.animate([{ transform: "none" }, { transform: "translateX(100%)" }], { duration: ms, easing: ease }).onfinish = () => { prev.hidden = true; prev.style.zIndex = ""; };
    }
  }
  function pushSet(name) { setStack.push(name); showSetPage(name, "push"); haptic(6); }
  function popSet() { if (setStack.length < 2) return; setStack.pop(); renderSettings(); showSetPage(setStack[setStack.length - 1], "pop"); }
  function openSettings(page) {
    setStack.length = 0; setStack.push("root");
    document.querySelectorAll(".set-page").forEach((p) => (p.hidden = p.dataset.page !== "root"));
    renderSettings();
    showSetPage("root");
    $("set-stack").querySelector('[data-page="root"]').scrollTop = 0;
    $("settings-dialog").showModal();
    if (page) pushSet(page);
  }
  $("btn-settings").addEventListener("click", () => openSettings());
  $("set-plus").addEventListener("click", () => openPlus());
  $("open-shop").addEventListener("click", () => openShop(true).then(() => renderSettings()));
  $("set-back").addEventListener("click", popSet);
  document.querySelectorAll("[data-push]").forEach((b) => b.addEventListener("click", () => pushSet(b.dataset.push)));
  // Svep från vänsterkanten för att gå tillbaka, som i iOS.
  (function edgeSwipe() {
    let x0 = null, y0 = 0, page = null;
    $("set-stack").addEventListener("touchstart", (e) => {
      const t = e.touches[0], box = $("set-stack").getBoundingClientRect();
      if (setStack.length < 2 || t.clientX - box.left > 28) return;
      x0 = t.clientX; y0 = t.clientY; page = document.querySelector(`.set-page[data-page="${setStack[setStack.length - 1]}"]`);
    }, { passive: true });
    $("set-stack").addEventListener("touchmove", (e) => {
      if (x0 === null) return;
      const dx = e.touches[0].clientX - x0;
      if (Math.abs(e.touches[0].clientY - y0) > 40 && dx < 20) { x0 = null; page.style.transform = ""; return; }
      page.style.transform = `translateX(${Math.max(0, dx)}px)`;
    }, { passive: true });
    $("set-stack").addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      page.style.transform = "";
      x0 = null;
      if (dx > 80) popSet();
    });
  })();

  document.querySelectorAll("#check-picker [data-check]").forEach((b) =>
    b.addEventListener("click", () => { setPref("checkMode", b.dataset.check); renderSettings(); applyCheckMode(); haptic(8); })
  );
  document.querySelectorAll("#bolt-picker [data-bolt]").forEach((b) =>
    b.addEventListener("click", () => { setPref("bolt", +b.dataset.bolt); renderSettings(); haptic(8); })
  );
  document.querySelectorAll("#text-picker [data-text]").forEach((b) =>
    b.addEventListener("click", () => { setPref("textSize", b.dataset.text); applyTextSize(); renderTextPicker(); haptic(8); })
  );
  const bindSwitch = (id, key, after) => $(id).addEventListener("change", (e) => { setPref(key, e.target.checked); if (after) after(); renderSettings(); haptic(8); });
  bindSwitch("time-toggle", "showTime", () => applyTimeSetting());
  bindSwitch("skip-toggle", "skipFilled");
  bindSwitch("autonext-toggle", "autoNext");
  bindSwitch("notes-toggle", "notes", () => { if (mek && isQuiz() && !mek.done) renderMekFeedback(); });
  bindSwitch("sound-toggle", "sound", () => { if (soundOn()) sound("ok"); });
  bindSwitch("haptic-toggle", "haptics");
  bindSwitch("motion-toggle", "reduceMotion", () => applyMotion());
  function applyTimeSetting() { document.body.classList.toggle("hide-time", !showTime()); }
  function applyTextSize() { document.documentElement.dataset.text = prefs().textSize || "m"; }
  function applyMotion() { document.documentElement.classList.toggle("reduce-motion", !!prefs().reduceMotion); }
  applyTimeSetting(); applyTextSize(); applyMotion();
  $("open-help").addEventListener("click", () => { $("settings-dialog").close(); $("help-dialog").showModal(); });
  document.querySelectorAll("#theme-picker button").forEach((b) =>
    b.addEventListener("click", () => { setPref("theme", b.dataset.themeValue); applyTheme(); renderThemePicker(); haptic(8); })
  );

  // Om appen: version och hur mycket innehåll som finns.
  function renderAbout() {
    const rows = [
      ["HP-ord", HP_WORDS.length.toLocaleString("sv-SE")],
      ["Meningar (MEK)", HP_MEK.length],
      ["Engelska meningar", HP_ENG_GAP.length],
      ["Engelska ord", HP_ENG_VOCAB.length],
      ["Mattetyper", HP_MATH.types.length],
      ["Sparat på enheten", ((n) => `${n} ${n === 1 ? "omgång" : "omgångar"}`)(Object.keys(progressAll()).length)],
    ];
    $("about-list").innerHTML = rows.map(([k, v]) => `<li class="kv"><span>${k}</span><span>${v}</span></li>`).join("");
    $("about-version").textContent = "Version " + APP_VERSION;
  }
  document.querySelector('[data-push="about"]').addEventListener("click", renderAbout);

  // Säkerhetskopia: exportera och återställ framsteg och inställningar som en JSON-fil.
  $("export-data").addEventListener("click", async () => {
    const data = { app: "dagsprov", version: 2, exported: new Date().toISOString(), progress: progressAll(), prefs: prefs() };
    const name = `dagsprov-${todayKey()}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Dagsprov – säkerhetskopia" });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Säkerhetskopian är sparad");
  });
  $("import-data").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { data = null; }
    if (!data || !["dagsprov", "hp-korsord"].includes(data.app) || !isPlainObject(data.progress)) { toast("Filen är ingen säkerhetskopia från Dagsprov"); return; }
    // Ta bara med poster som ser ut som Dagsprovs egna, så att en ändrad fil inte kan ställa till det.
    data.progress = Object.fromEntries(Object.entries(data.progress).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}\|[a-z-]{2,20}$/.test(k) && isPlainObject(v)));
    data.prefs = isPlainObject(data.prefs) ? Object.fromEntries(Object.entries(data.prefs).filter(([k, v]) => /^[a-zA-Z]{1,24}$/.test(k) && ["string", "number", "boolean"].includes(typeof v) || (k === "trophies" && isPlainObject(v)))) : null;
    // Köp, livlinor, provperioder och vunna djur kan aldrig komma från en fil – annars skulle man kunna
    // skriva in obegränsat med livlinor eller Plus. De behåller sina värden från den här enheten
    // (Plus återställs i stället via "Återställ köp", djuren räknas fram igen ur framstegen).
    if (data.prefs) {
      const PROTECTED = ["plusNative", "plusDemo", "plusTrial", "plusTrialAt", "bank", "bought", "adsToday", "adsWatched", "lifelines", "unlockedDays", "pets", "petNew", "companion", "frozen"];
      const current = prefs();
      for (const k of PROTECTED) { delete data.prefs[k]; if (current[k] !== undefined) data.prefs[k] = current[k]; }
    }
    const n = Object.keys(data.progress).length;
    if (!(await confirmBox("Återställa framsteg?", `Säkerhetskopian innehåller ${n} omgångar. Dina nuvarande framsteg på den här enheten ersätts.`, "Återställ"))) return;
    store(PROGRESS_KEY, data.progress);
    if (data.prefs && typeof data.prefs === "object") store(PREFS_KEY, data.prefs);
    reloadAfterData("Framstegen är återställda");
    setTimeout(checkPets, 800);
  });
  $("reset-data").addEventListener("click", async () => {
    if (!(await confirmBox("Nollställa allt?", "Alla lösta korsord, omgångar och all statistik raderas från den här enheten. Det går inte att ångra.", "Nollställ"))) return;
    store(PROGRESS_KEY, {});
    reloadAfterData("Allt är nollställt");
  });
  function reloadAfterData(msg) {
    state = null; mek = null; puzzleCache.clear();
    applyTheme(); applyStyle(); applyTimeSetting(); applyTextSize(); applyMotion();
    openCurrent(cur.date, cur.level);
    applyMode(false);
    renderSettings();
    toast(msg);
  }

  // Dra ner ett ark i rubrikraden för att stänga det, som i iOS (bara när arket kommer underifrån).
  document.querySelectorAll("dialog.sheet").forEach((dlg) => {
    const bar = dlg.querySelector(".sheet-bar");
    if (!bar) return;
    let y0 = null, dy = 0, t0 = 0;
    bar.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || innerWidth >= 740 || e.target.closest("button")) return;
      y0 = e.clientY; dy = 0; t0 = performance.now();
      dlg.classList.add("dragging");
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      dlg.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      dlg.classList.remove("dragging");
      const fast = dy / Math.max(1, performance.now() - t0) > 0.6;
      if (dy > 120 || (fast && dy > 40)) {
        dlg.classList.add("closing");
        dlg.style.transform = "translateY(100%)";
        setTimeout(() => { dlg.close(); dlg.classList.remove("closing"); dlg.style.transform = ""; }, 240);
      } else {
        dlg.classList.add("closing");
        dlg.style.transform = "";
        setTimeout(() => dlg.classList.remove("closing"), 260);
      }
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  });

  function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  // ---------- Ljudeffekter (Web Audio, inga ljudfiler) ----------
  const soundOn = () => prefs().sound !== false;
  let audioCtx = null;
  function sound(kind) {
    if (!soundOn()) return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        // På iPhone: följ ringlägesknappen i stället för att alltid spela.
        if (navigator.audioSession) navigator.audioSession.type = "ambient";
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t0 = audioCtx.currentTime + 0.01;
      const tone = (freq, start, dur, vol, type = "sine") => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0 + start);
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + start); o.stop(t0 + start + dur + 0.02);
      };
      if (kind === "tap") tone(1400, 0, 0.035, 0.025, "triangle");
      else if (kind === "erase") { tone(900, 0, 0.05, 0.02, "sawtooth"); tone(640, 0.04, 0.06, 0.018, "sawtooth"); tone(460, 0.09, 0.08, 0.015, "triangle"); }
      else if (kind === "ok") { tone(880, 0, 0.14, 0.08); tone(1318.5, 0.08, 0.22, 0.07); }
      else if (kind === "word") { tone(784, 0, 0.12, 0.07); tone(988, 0.07, 0.12, 0.07); tone(1318.5, 0.14, 0.28, 0.07); }
      else if (kind === "bad") { tone(220, 0, 0.16, 0.07, "triangle"); tone(185, 0.09, 0.2, 0.06, "triangle"); }
      else if (kind === "bolt") { tone(1568, 0, 0.08, 0.06, "square"); tone(2093, 0.06, 0.18, 0.05, "triangle"); }
      else if (kind === "win") [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.35 + (i === 4 ? 0.3 : 0), 0.07));
    } catch { /* inget ljud */ }
  }
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
    if (document.hidden) { save(); saveMek(); scheduleReminders(); }
    else { if (cur.date) renderHeader(); renderWotdBadge(); } // "Idag"/"Igår" och dagens ord stämmer även efter midnatt
  });

  // ---------- Tips om hemskärmen (bara i Safari på iPhone/iPad, en gång) ----------
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // I App Store-versionen (Capacitor) körs appen redan som en riktig app – då ska inget hemskärmstips visas.
  const isNativeApp = !!window.DagsprovNative || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const standalone = isNativeApp || navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
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
    const modeChanged = !!t.mode && t.mode !== mode();
    if (modeChanged) setPref("mode", t.mode);
    if (t.date !== cur.date || t.level !== cur.level || t.mode) openCurrent(t.date, t.level);
    if (modeChanged) applyMode(true);
  });

  function fromHash() {
    const [date, level, m] = location.hash.slice(1).split("/");
    if (!validDate(date)) return null;
    return { date, level: LEVELS[level] ? level : LEVELS[prefs().level] ? prefs().level : "medium", mode: MODES.includes(m) && m !== "cross" ? m : null };
  }

  // ---------- Start ----------
  applyTheme();
  plusChanged(false);
  applyStyle();
  const firstVisit = !load(PREFS_KEY);
  let startAt = fromHash() || { date: todayKey(), level: LEVELS[prefs().level] ? prefs().level : "medium" };
  if (dayLocked(startAt.date)) startAt = { ...startAt, date: todayKey() }; // låsta arkivdagar öppnas via arkivet
  if (startAt.mode) setPref("mode", startAt.mode);
  open(startAt.date, startAt.level); // korsordet finns alltid i bakgrunden
  if (isQuiz()) openMek(startAt.date, startAt.level);
  applyMode(false);
  syncViewport();
  if (firstVisit) $("help-dialog").showModal();

  // Offline och uppdateringar: när en ny version har installerats i bakgrunden visas en
  // diskret banner med "Ladda om" (inte första gången appen installeras).
  // I mobilappen (Expo-skalet) ligger allt redan inbyggt – där behövs ingen service worker.
  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.DagsprovNative) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
      setInterval(check, 60 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) $("update-banner").hidden = false;
    });
  }
  // Erbjud att rädda en bruten svit en gång per dag, efter att appen har startat.
  setTimeout(() => { if (!document.querySelector("dialog[open]")) maybeOfferStreak(); }, 1500);
  renderPetButton();
  setTimeout(scheduleReminders, 3000);
  setTimeout(() => {
    if (document.querySelector("dialog[open]")) return;
    const pending = prefs().petNew;
    if (pending && /^\d{4}-\d{2}$/.test(pending)) showPetWon(pending); else checkPets();
  }, 2600);
  window.__dagsprovReady = true;
})();
