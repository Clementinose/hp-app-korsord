// Matte i högskoleprovets stil (XYZ och KVA). Uppgifterna skapas av en slumpgenerator med frö,
// så att alla får samma uppgifter samma dag. Varje uppgift har fyra alternativ och en kort lösning.
(function (root) {
  const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const num = (x) => String(Math.round(x * 1000) / 1000).replace(".", ",").replace("-", "−");
  const frac = (a, b) => {
    const g = gcd(a, b); a /= g; b /= g;
    if (b < 0) { a = -a; b = -b; }
    if (b === 1) return num(a);
    return `${a < 0 ? "−" : ""}<span class="frac"><i>${Math.abs(a)}</i><i>${b}</i></span>`;
  };
  const pow = (b, e) => `${b}<sup>${String(e).replace("-", "−")}</sup>`;

  // Fyller på med rimliga felsvar tills det finns tre unika.
  function withWrong(rng, answer, wrong, fallback) {
    const out = [];
    for (const w of wrong) if (w !== answer && !out.includes(w)) out.push(w);
    let guard = 0;
    while (out.length < 3 && guard++ < 50) { const w = fallback(); if (w !== answer && !out.includes(w)) out.push(w); }
    return out.slice(0, 3);
  }

  const T = {
    percentOf(rng) {
      const p = pick(rng, [5, 10, 12, 15, 20, 25, 30, 40, 60, 75]);
      const base = 100 / gcd(p, 100);
      const n = base * ri(rng, 1, Math.max(1, Math.floor(600 / base)));
      const ans = (p * n) / 100;
      return {
        q: `Vad är ${p} % av ${num(n)}?`,
        a: num(ans),
        w: withWrong(rng, num(ans), [num((p * n) / 10), num(n - ans), num(ans + p)], () => num(ans + ri(rng, -9, 9))),
        why: `${p} % = ${frac(p, 100)}, och ${frac(p, 100)} · ${num(n)} = ${num(ans)}.`,
      };
    },
    percentChange(rng) {
      const old = 20 * ri(rng, 2, 10);
      const pct = pick(rng, [10, 20, 25, 40, 50, 60, 75]);
      const up = rng() < 0.5;
      const nw = up ? old * (1 + pct / 100) : old * (1 - pct / 100);
      const diff = Math.abs(nw - old);
      return {
        q: `Ett pris ${up ? "höjs" : "sänks"} från ${num(old)} kr till ${num(nw)} kr. Med hur många procent ${up ? "höjs" : "sänks"} priset?`,
        a: `${num(pct)} %`,
        w: withWrong(rng, `${num(pct)} %`, [`${num(Math.round((diff / nw) * 1000) / 10)} %`, `${num(diff)} %`, `${num(pct + 5)} %`], () => `${num(pct + ri(rng, -15, 15))} %`),
        why: `Ändringen är ${num(diff)} kr. ${num(diff)} / ${num(old)} = ${num(pct / 100)} = ${pct} %. Jämför alltid med det ursprungliga priset.`,
      };
    },
    fractionsAdd(rng) {
      const b = pick(rng, [2, 3, 4, 5, 6, 8]); let d = pick(rng, [2, 3, 4, 5, 6, 8]);
      if (d === b) d = b === 8 ? 3 : b + 1;
      const a = ri(rng, 1, b - 1), c = ri(rng, 1, d - 1);
      const sub = rng() < 0.35;
      const numr = sub ? a * d - c * b : a * d + c * b, den = b * d;
      return {
        q: `Vad är ${frac(a, b)} ${sub ? "−" : "+"} ${frac(c, d)}?`,
        a: frac(numr, den),
        w: withWrong(rng, frac(numr, den), [frac(sub ? a - c : a + c, b + d || 1), frac(sub ? a - c : a + c, b * d), frac(numr + 1, den)], () => frac(numr + ri(rng, -3, 3) || 1, den)),
        why: `Gemensam nämnare ${den}: täljaren blir ${a}·${d} ${sub ? "−" : "+"} ${c}·${b} = ${num(numr)}, alltså ${frac(numr, den)}.`,
      };
    },
    simpleEq(rng) {
      const a = ri(rng, 2, 9), x = ri(rng, -5, 12), b = ri(rng, -20, 20) || 3, c = a * x + b;
      const bs = b < 0 ? `− ${-b}` : `+ ${b}`;
      return {
        q: `Om ${a}x ${bs} = ${num(c)}, vad är x?`,
        a: num(x),
        w: withWrong(rng, num(x), [num(x + 1), num((c + b) / a), num(-x)], () => num(x + ri(rng, -4, 4))),
        why: `${a}x = ${num(c)} ${b < 0 ? "+ " + -b : "− " + b} = ${num(c - b)}, så x = ${num(c - b)} / ${a} = ${num(x)}.`,
      };
    },
    eqBoth(rng) {
      const x = ri(rng, -6, 9), a = ri(rng, 3, 9), c = ri(rng, 1, a - 1), b = ri(rng, -15, 15), d = (a - c) * x + b;
      const s = (v) => (v < 0 ? `− ${-v}` : `+ ${v}`);
      return {
        q: `Lös ekvationen ${a}x ${s(b)} = ${c}x ${s(d)}.`,
        a: `x = ${num(x)}`,
        w: withWrong(rng, `x = ${num(x)}`, [`x = ${num(-x)}`, `x = ${num(x + 1)}`, `x = ${num(Math.round((d + b) / (a - c)))}`], () => `x = ${num(x + ri(rng, -5, 5))}`),
        why: `Samla x på ena sidan: ${a - c}x = ${num(d - b)}, så x = ${num(x)}.`,
      };
    },
    average(rng) {
      const k = pick(rng, [3, 4, 5]);
      const m = ri(rng, 4, 20);
      const vals = Array.from({ length: k - 1 }, () => ri(rng, 1, 30));
      const x = m * k - vals.reduce((s, v) => s + v, 0);
      if (x < -20) return T.average(rng);
      return {
        q: `Medelvärdet av ${vals.map(num).join(", ")} och x är ${m}. Vad är x?`,
        a: num(x),
        w: withWrong(rng, num(x), [num(m), num(x + m), num(m * (k - 1) - vals.reduce((s, v) => s + v, 0))], () => num(x + ri(rng, -6, 6))),
        why: `Summan måste vara ${k} · ${m} = ${m * k}. x = ${m * k} − ${vals.reduce((s, v) => s + v, 0)} = ${num(x)}.`,
      };
    },
    orderOps(rng) {
      const a = ri(rng, 2, 12), b = ri(rng, 2, 6), c = ri(rng, 1, 9), d = ri(rng, 2, 12);
      const ans = a - b * (c - d);
      return {
        q: `Vad är ${a} − ${b} · (${c} − ${d})?`,
        a: num(ans),
        w: withWrong(rng, num(ans), [num((a - b) * (c - d)), num(a - b * c - d), num(a + b * (c - d))], () => num(ans + ri(rng, -8, 8))),
        why: `Parentesen först: ${c} − ${d} = ${num(c - d)}. Sedan multiplikation: ${b} · (${num(c - d)}) = ${num(b * (c - d))}. Sist ${a} − (${num(b * (c - d))}) = ${num(ans)}.`,
      };
    },
    rectArea(rng) {
      const w = ri(rng, 2, 12), l = ri(rng, w + 1, w + 14), P = 2 * (w + l);
      return {
        q: `En rektangel har omkretsen ${P} cm och bredden ${w} cm. Vad är rektangelns area?`,
        a: `${w * l} cm²`,
        w: withWrong(rng, `${w * l} cm²`, [`${P * w} cm²`, `${w * (P - w)} cm²`, `${(w * P) / 2} cm²`], () => `${w * l + ri(rng, -10, 10)} cm²`),
        why: `Längden är ${P}/2 − ${w} = ${l} cm. Arean är ${w} · ${l} = ${w * l} cm².`,
      };
    },
    ratio(rng) {
      const a = ri(rng, 1, 7), b = ri(rng, a + 1, 9), k = ri(rng, 2, 9), total = (a + b) * k;
      return {
        q: `I en klass är förhållandet mellan pojkar och flickor ${a}:${b}. Klassen har ${total} elever. Hur många är pojkar?`,
        a: num(a * k),
        w: withWrong(rng, num(a * k), [num(b * k), num(Math.round(total / a)), num(a * k + k)], () => num(a * k + ri(rng, -5, 5))),
        why: `${a} + ${b} = ${a + b} delar, och en del är ${total}/${a + b} = ${k} elever. Pojkar: ${a} · ${k} = ${a * k}.`,
      };
    },
    speed(rng) {
      const v = 5 * ri(rng, 8, 24);
      const t = pick(rng, [30, 45, 75, 90, 105, 120, 135, 150]);
      const d = (v * t) / 60;
      if (d % 1) return T.speed(rng);
      const h = Math.floor(t / 60), m = t % 60;
      const tt = h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
      return {
        q: `En bil kör ${d} km på ${tt}. Vad är bilens medelhastighet?`,
        a: `${v} km/h`,
        w: withWrong(rng, `${v} km/h`, [`${Math.round(d / (h + m / 100))} km/h`, `${v + 10} km/h`, `${Math.round(d / (t / 100))} km/h`], () => `${v + 5 * ri(rng, -3, 3)} km/h`),
        why: `${tt} = ${num(t / 60)} h. Hastighet = sträcka / tid = ${d} / ${num(t / 60)} = ${v} km/h.`,
      };
    },
    powers(rng, hard) {
      const a = ri(rng, 2, 6), b = hard ? ri(rng, -4, 3) : ri(rng, 1, 4), c = ri(rng, 1, 4);
      const e = a + b - c;
      const ans = e >= 0 ? num(2 ** e) : frac(1, 2 ** -e);
      const show = (x) => (x >= 0 ? num(2 ** x) : frac(1, 2 ** -x));
      return {
        q: `Vad är ${pow(2, a)} · ${pow(2, b)} / ${pow(2, c)}?`,
        a: ans,
        w: withWrong(rng, ans, [show(a * b - c), show(a + b + c), show(e + 1)], () => show(e + ri(rng, -3, 3))),
        why: `Addera och subtrahera exponenterna: ${a} + (${num(b)}) − ${c} = ${num(e)}, så svaret är ${pow(2, e)} = ${ans}.`,
      };
    },
    pythagoras(rng) {
      const [p, q, r] = pick(rng, [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17]]);
      const k = ri(rng, 1, 3);
      return {
        q: `En rätvinklig triangel har kateterna ${p * k} cm och ${q * k} cm. Hur lång är hypotenusan?`,
        a: `${r * k} cm`,
        w: withWrong(rng, `${r * k} cm`, [`${(p + q) * k} cm`, `${(r + 1) * k} cm`, `${q * k + 1} cm`], () => `${r * k + ri(rng, -4, 4)} cm`),
        why: `Pythagoras sats: ${p * k}² + ${q * k}² = ${(p * k) ** 2 + (q * k) ** 2} = ${r * k}².`,
      };
    },
    compound(rng) {
      const p = pick(rng, [10, 20, 25, 30, 50]);
      const ans = -(p * p) / 100;
      return {
        q: `Ett pris höjs med ${p} % och sänks sedan med ${p} %. Hur har priset ändrats totalt?`,
        a: `Sänkts med ${num(-ans)} %`,
        w: [`Oförändrat`, `Sänkts med ${p} %`, `Höjts med ${num(-ans)} %`],
        why: `${num(1 + p / 100)} · ${num(1 - p / 100)} = ${num(1 + ans / 100)}, alltså ${num(-ans)} % lägre än från början.`,
      };
    },
    // KVA: jämför två kvantiteter. Alternativen står alltid i samma ordning, som på provet.
    kva(rng, hard) {
      const opts = ["I är större än II", "II är större än I", "I är lika med II", "Informationen är otillräcklig"];
      const cases = [
        () => { const a = ri(rng, 1, 7), b = 8; const d = ri(rng, 1, 9) / 10; const v = a / b; return { I: frac(a, b), II: num(d), c: v > d ? 0 : v < d ? 1 : 2, why: `${frac(a, b)} = ${num(v)}.` }; },
        () => { const p = pick(rng, [10, 20, 25, 40]), n = pick(rng, [30, 50, 60, 80]); return { I: `${p} % av ${n}`, II: `${n} % av ${p}`, c: 2, why: `Båda blir ${num((p * n) / 100)} – p % av n är alltid lika med n % av p.` }; },
        () => { const b = ri(rng, 2, 5), e = pick(rng, [2, 3]); return { I: `(−${b})<sup>${e}</sup>`, II: `−${b}<sup>${e}</sup>`, c: e % 2 ? 2 : 0, why: `(−${b})<sup>${e}</sup> = ${num((-b) ** e)} och −${b}<sup>${e}</sup> = ${num(-(b ** e))}.` }; },
        () => { const n = pick(rng, [16, 25, 36, 49, 64, 81]), s = Math.sqrt(n), d = s + pick(rng, [-1, 0, 1]); return { I: `√${n}`, II: num(d), c: s > d ? 0 : s < d ? 1 : 2, why: `√${n} = ${s}.` }; },
      ];
      const hardCases = [
        () => ({ pre: "x > 0", I: "x²", II: "x", c: 3, why: "Om 0 < x < 1 är x² mindre än x, men om x > 1 är x² större. Det går inte att avgöra." }),
        () => ({ pre: "x < 0", I: "x³", II: "x²", c: 1, why: "För negativa x är x³ negativt och x² positivt, så II är alltid större." }),
        () => { const a = ri(rng, 2, 9); return { pre: `x + y = ${a * 2} och x − y = ${a * 2 - 4}`, I: "x", II: "y", c: 0, why: `Addera: 2x = ${a * 4 - 4}, x = ${a * 2 - 2} och y = 2. I är större.` }; },
        () => ({ pre: "n är ett heltal", I: "n²", II: "n", c: 3, why: "För n = 0 eller 1 är de lika, för n = 2 är n² större. Det går inte att avgöra." }),
      ];
      const k = (hard && rng() < 0.6 ? pick(rng, hardCases) : pick(rng, cases))();
      return {
        q: `${k.pre ? `<span class="kva-pre">${k.pre}</span>` : ""}<span class="kva"><span><small>Kvantitet I</small>${k.I}</span><span><small>Kvantitet II</small>${k.II}</span></span>`,
        a: opts[k.c], w: opts.filter((_, i) => i !== k.c), fixed: opts, why: k.why,
      };
    },
  };

  const MIX = {
    easy: ["percentOf", "simpleEq", "average", "orderOps", "rectArea", "ratio", "kva", "percentOf", "simpleEq", "kva"],
    medium: ["percentChange", "fractionsAdd", "simpleEq", "ratio", "speed", "powers", "kva", "average", "percentOf", "kva"],
    hard: ["percentChange", "fractionsAdd", "eqBoth", "speed", "powers", "pythagoras", "compound", "kva", "kva", "average"],
  };

  // En omgång med tio uppgifter. rng styr både urval och siffror.
  function round(rng, level, shuffle) {
    return shuffle(MIX[level], rng).map((type) => {
      const hard = level === "hard";
      const t = T[type](rng, hard);
      const options = t.fixed ? t.fixed.slice() : shuffle([t.a, ...t.w], rng);
      return { type, prompt: t.q, options, correct: options.indexOf(t.a), why: t.why, fixed: !!t.fixed };
    });
  }

  const api = { round, types: Object.keys(T) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HP_MATH = api;
})(this);
