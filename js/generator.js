// Bygger ett korsord av en ordlista genom att greedily korsa ord med befintliga bokstäver.
(function (root) {
  const DIRS = { across: [0, 1], down: [1, 0] };

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function build(pool, count, maxSize, rng) {
    const cells = new Map(); // "r,c" -> { ch, across: bool, down: bool }
    const placed = [];
    let minR = 0, maxR = 0, minC = 0, maxC = 0;
    const key = (r, c) => r + "," + c;
    const at = (r, c) => cells.get(key(r, c));

    function check(word, r, c, dir) {
      const [dr, dc] = DIRS[dir];
      const len = word.length;
      if (at(r - dr, c - dc) || at(r + dr * len, c + dc * len)) return -1;
      const nMinR = Math.min(minR, r), nMaxR = Math.max(maxR, r + dr * (len - 1));
      const nMinC = Math.min(minC, c), nMaxC = Math.max(maxC, c + dc * (len - 1));
      if (nMaxR - nMinR + 1 > maxSize || nMaxC - nMinC + 1 > maxSize) return -1;
      let crossings = 0;
      for (let i = 0; i < len; i++) {
        const rr = r + dr * i, cc = c + dc * i;
        const cell = at(rr, cc);
        if (cell) {
          if (cell.ch !== word[i] || cell[dir]) return -1;
          crossings++;
        } else if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) {
          return -1;
        }
      }
      return crossings;
    }

    function place(entry, r, c, dir) {
      const [word] = entry;
      const [dr, dc] = DIRS[dir];
      for (let i = 0; i < word.length; i++) {
        const rr = r + dr * i, cc = c + dc * i;
        const k = key(rr, cc);
        const cell = cells.get(k) || { ch: word[i], across: false, down: false };
        cell[dir] = true;
        cells.set(k, cell);
      }
      minR = Math.min(minR, r); maxR = Math.max(maxR, r + dr * (word.length - 1));
      minC = Math.min(minC, c); maxC = Math.max(maxC, c + dc * (word.length - 1));
      placed.push({ word, clue: entry[1], row: r, col: c, dir });
    }

    function tryPlace(entry) {
      const word = entry[0];
      let best = null, bestScore = -Infinity;
      for (const [k, cell] of cells) {
        const [r, c] = k.split(",").map(Number);
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== cell.ch) continue;
          for (const dir of ["across", "down"]) {
            if (cell[dir]) continue;
            const sr = dir === "down" ? r - i : r;
            const sc = dir === "across" ? c - i : c;
            const crossings = check(word, sr, sc, dir);
            if (crossings < 1) continue;
            // Föredra fler korsningar och ett kompakt, kvadratiskt rutnät.
            const [dr, dc] = DIRS[dir];
            const h = Math.max(maxR, sr + dr * (word.length - 1)) - Math.min(minR, sr) + 1;
            const w = Math.max(maxC, sc + dc * (word.length - 1)) - Math.min(minC, sc) + 1;
            const score = crossings * 10 - h * w * 0.05 - Math.abs(h - w) * 0.5 + rng();
            if (score > bestScore) { bestScore = score; best = [sr, sc, dir]; }
          }
        }
      }
      if (!best) return false;
      place(entry, ...best);
      return true;
    }

    const first = pool[0];
    place(first, 0, 0, rng() < 0.5 ? "across" : "down");
    let pending = pool.slice(1);
    for (let pass = 0; pass < 2 && placed.length < count; pass++) {
      const skipped = [];
      for (const entry of pending) {
        if (placed.length >= count) break;
        if (!tryPlace(entry)) skipped.push(entry);
      }
      pending = skipped;
    }
    return { placed, minR, maxR, minC, maxC };
  }

  function finalize({ placed, minR, maxR, minC, maxC }) {
    const rows = maxR - minR + 1, cols = maxC - minC + 1;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    const words = placed.map((w) => ({ ...w, row: w.row - minR, col: w.col - minC }));
    for (const w of words) {
      const [dr, dc] = DIRS[w.dir];
      for (let i = 0; i < w.word.length; i++) grid[w.row + dr * i][w.col + dc * i] = w.word[i];
    }
    // Numrera startrutor i läsordning.
    const starts = [...new Set(words.map((w) => w.row * cols + w.col))].sort((a, b) => a - b);
    for (const w of words) w.number = starts.indexOf(w.row * cols + w.col) + 1;
    words.sort((a, b) => a.number - b.number || (a.dir === "across" ? -1 : 1));
    return { rows, cols, grid, words };
  }

  function generate(entries, opts = {}) {
    const { count = 12, minLen = 3, maxLen = 15, maxSize = 13, attempts = 60, rng = Math.random } = opts;
    const candidates = entries.filter(([w]) => w.length >= minLen && w.length <= maxLen && w.length <= maxSize);
    let best = null, bestScore = -Infinity;
    for (let a = 0; a < attempts; a++) {
      // Ett slumpat urval räcker för ett bra korsord och håller det snabbt även med en stor ordlista.
      const result = build(shuffle(candidates, rng).slice(0, Math.max(count * 10, 160)), count, maxSize, rng);
      const area = (result.maxR - result.minR + 1) * (result.maxC - result.minC + 1);
      const score = result.placed.length * 1000 - area;
      if (score > bestScore) { bestScore = score; best = result; }
    }
    return finalize(best);
  }

  const api = { generate, DIRS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Crossword = api;
})(this);
