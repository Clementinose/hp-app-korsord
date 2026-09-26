// Matte i högskoleprovets stil (XYZ, KVA och NOG). Uppgifterna skapas av en slumpgenerator med frö,
// så att alla får samma uppgifter samma dag. Varje uppgift har alternativ, en kort lösning (why)
// och en steg-för-steg-förklaring (steps) som visar hur man kan tänka.
(function (root) {
  const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const num = (x) => String(Math.round(x * 1000) / 1000).replace(".", ",").replace("-", "−");
  const frac = (a, b) => {
    const g = gcd(a, b) || 1; a /= g; b /= g;
    if (b < 0) { a = -a; b = -b; }
    if (b === 1) return num(a);
    return `${a < 0 ? "−" : ""}<span class="frac"><i>${Math.abs(a)}</i><i>${b}</i></span>`;
  };
  const pow = (b, e) => `${b}<sup>${String(e).replace("-", "−")}</sup>`;
  const sq = (b) => pow(b, 2);
  const sgn = (v) => (v < 0 ? `− ${num(-v)}` : `+ ${num(v)}`);
  const par = (v) => (v < 0 ? `(${num(v)})` : num(v));
  const b = (t) => `<b>${t}</b>`;
  const fr = (a, c) => `<span class="frac"><i>${a}</i><i>${c}</i></span>`; // oförkortat bråk
  const cx = (c, v = "x") => (c === 1 ? v : `${c}${v}`); // 1x skrivs x

  // Fyller på med rimliga felsvar tills det finns tre unika.
  function withWrong(rng, answer, wrong, fallback) {
    const out = [];
    for (const w of wrong) if (w !== answer && !out.includes(w)) out.push(w);
    let guard = 0;
    while (out.length < 3 && guard++ < 60) { const w = fallback(); if (w !== answer && !out.includes(w)) out.push(w); }
    return out.slice(0, 3);
  }

  // Kategorier används i statistiken ("vad du bör öva på").
  const CATS = {
    procent: "Procent", brak: "Bråk", ekv: "Ekvationer", stat: "Medelvärde och median", rakna: "Räkneregler",
    geo: "Geometri", prop: "Proportioner", fart: "Hastighet och tid", pot: "Potenser och rötter",
    alg: "Algebra", fun: "Funktioner", sann: "Sannolikhet och kombinatorik", kva: "KVA – jämförelser", nog: "NOG – tillräcklig information",
  };

  const T = {
    // ---------- Procent ----------
    percentOf(rng) {
      const p = pick(rng, [5, 10, 12, 15, 20, 25, 30, 40, 60, 75]);
      const base = 100 / gcd(p, 100);
      const n = base * ri(rng, 1, Math.max(1, Math.floor(600 / base)));
      const ans = (p * n) / 100;
      return {
        cat: "procent",
        q: `Vad är ${p} % av ${num(n)}?`,
        a: num(ans),
        w: withWrong(rng, num(ans), [num((p * n) / 10), num(n - ans), num(ans + p)], () => num(ans + ri(rng, -9, 9))),
        why: `${p} % = ${num(p / 100)}, och ${num(p / 100)} · ${num(n)} = ${num(ans)}.`,
        steps: [
          `"Procent" betyder hundradelar. ${p} % = ${frac(p, 100)} = ${num(p / 100)}.`,
          `"Av" betyder gånger: ${num(p / 100)} · ${num(n)}.`,
          `Tips: räkna 10 % först (${num(n / 10)}) och skala om det går lättare.`,
          `${num(p / 100)} · ${num(n)} = ${b(num(ans))}.`,
        ],
      };
    },
    percentChange(rng) {
      const old = 20 * ri(rng, 2, 10);
      const pct = pick(rng, [10, 20, 25, 40, 50, 60, 75]);
      const up = rng() < 0.5;
      const nw = up ? old * (1 + pct / 100) : old * (1 - pct / 100);
      const diff = Math.abs(nw - old);
      return {
        cat: "procent",
        q: `Ett pris ${up ? "höjs" : "sänks"} från ${num(old)} kr till ${num(nw)} kr. Med hur många procent ${up ? "höjs" : "sänks"} priset?`,
        a: `${num(pct)} %`,
        w: withWrong(rng, `${num(pct)} %`, [`${num(Math.round((diff / nw) * 1000) / 10)} %`, `${num(diff)} %`, `${num(pct + 5)} %`], () => `${num(pct + ri(rng, -15, 15))} %`),
        why: `Ändringen är ${num(diff)} kr. ${num(diff)} / ${num(old)} = ${num(pct / 100)} = ${pct} %.`,
        steps: [
          `Räkna ut hur mycket priset ändrats: ${num(Math.max(old, nw))} − ${num(Math.min(old, nw))} = ${num(diff)} kr.`,
          `Procentuell förändring = förändring / ${b("ursprungligt")} värde. Jämför alltid med priset före ändringen.`,
          `${num(diff)} / ${num(old)} = ${num(pct / 100)}.`,
          `${num(pct / 100)} = ${b(pct + " %")}.`,
        ],
      };
    },
    percentBack(rng) {
      const pct = pick(rng, [10, 20, 25, 50]);
      const up = rng() < 0.6;
      const f = up ? 1 + pct / 100 : 1 - pct / 100;
      const orig = 20 * ri(rng, 2, 15);
      const nw = orig * f;
      if (nw % 1) return T.percentBack(rng);
      const wrongOrig = up ? nw * (1 - pct / 100) : nw * (1 + pct / 100);
      return {
        cat: "procent",
        q: `Efter en ${up ? "höjning" : "sänkning"} med ${pct} % kostar en vara ${num(nw)} kr. Vad kostade den före ${up ? "höjningen" : "sänkningen"}?`,
        a: `${num(orig)} kr`,
        w: withWrong(rng, `${num(orig)} kr`, [`${num(wrongOrig)} kr`, `${num(up ? nw - pct : nw + pct)} kr`, `${num(orig + 10)} kr`], () => `${num(orig + 5 * ri(rng, -6, 6))} kr`),
        why: `Nya priset är ${num(f)} gånger det gamla, så det gamla är ${num(nw)} / ${num(f)} = ${num(orig)} kr.`,
        steps: [
          `Fällan: att ${up ? "dra av" : "lägga på"} ${pct} % på ${num(nw)} kr ger fel svar (${num(wrongOrig)} kr), eftersom procenten gäller det ${b("gamla")} priset.`,
          `En ${up ? "höjning" : "sänkning"} med ${pct} % betyder att nya priset = gamla priset · ${num(f)}.`,
          `Ställ upp: gamla · ${num(f)} = ${num(nw)}.`,
          `Gamla = ${num(nw)} / ${num(f)} = ${b(num(orig) + " kr")}.`,
        ],
      };
    },
    compound(rng) {
      const p = pick(rng, [10, 20, 25, 30, 50]);
      const ans = -(p * p) / 100;
      return {
        cat: "procent",
        q: `Ett pris höjs med ${p} % och sänks sedan med ${p} %. Hur har priset ändrats totalt?`,
        a: `Sänkts med ${num(-ans)} %`,
        w: [`Oförändrat`, `Sänkts med ${p} %`, `Höjts med ${num(-ans)} %`],
        why: `${num(1 + p / 100)} · ${num(1 - p / 100)} = ${num(1 + ans / 100)}, alltså ${num(-ans)} % lägre än från början.`,
        steps: [
          `Procentändringar ${b("multipliceras")}, de adderas inte. Därför blir det inte oförändrat.`,
          `Höjning med ${p} %: gånger ${num(1 + p / 100)}. Sänkning med ${p} %: gånger ${num(1 - p / 100)}.`,
          `Tänk dig att priset var 100 kr: 100 · ${num(1 + p / 100)} = ${num(100 + p)}, och ${num(100 + p)} · ${num(1 - p / 100)} = ${num(100 + ans)}.`,
          `${num(100 + ans)} kr är ${b(num(-ans) + " % lägre")} än 100 kr.`,
        ],
      };
    },

    // ---------- Bråk ----------
    fractionsAdd(rng) {
      const bb = pick(rng, [2, 3, 4, 5, 6, 8]); let d = pick(rng, [2, 3, 4, 5, 6, 8]);
      if (d === bb) d = bb === 8 ? 3 : bb + 1;
      const a = ri(rng, 1, bb - 1), c = ri(rng, 1, d - 1);
      const sub = rng() < 0.35;
      const numr = sub ? a * d - c * bb : a * d + c * bb, den = bb * d;
      return {
        cat: "brak",
        q: `Vad är ${frac(a, bb)} ${sub ? "−" : "+"} ${frac(c, d)}?`,
        a: frac(numr, den),
        w: withWrong(rng, frac(numr, den), [frac(sub ? a - c : a + c, bb + d || 1), frac(sub ? a - c : a + c, bb * d), frac(numr + 1, den)], () => frac(numr + ri(rng, -3, 3) || 1, den)),
        why: `Gemensam nämnare ${den}: ${a}·${d} ${sub ? "−" : "+"} ${c}·${bb} = ${num(numr)}, alltså ${frac(numr, den)}.`,
        steps: [
          `Bråk kan bara adderas eller subtraheras när de har ${b("samma nämnare")}. Man får aldrig lägga ihop nämnarna.`,
          `En gemensam nämnare är ${bb} · ${d} = ${den}.`,
          `Förläng: ${fr(a, bb)} = ${fr(a * d, den)} och ${fr(c, d)} = ${fr(c * bb, den)}.`,
          `Täljarna: ${a * d} ${sub ? "−" : "+"} ${c * bb} = ${num(numr)}, så svaret är ${fr(num(numr), den)}${gcd(numr, den) > 1 ? " = " + b(frac(numr, den)) + " (förkortat)" : " = " + b(frac(numr, den))}.`,
        ],
      };
    },
    fractionOf(rng) {
      const d = pick(rng, [3, 4, 5, 6, 8]), n = ri(rng, 1, d - 1), k = ri(rng, 2, 12), whole = d * k;
      return {
        cat: "brak",
        q: `Vad är ${frac(n, d)} av ${whole}?`,
        a: num(n * k),
        w: withWrong(rng, num(n * k), [num(k), num(whole - n * k), num(Math.round((whole * d) / n))], () => num(n * k + ri(rng, -6, 6))),
        why: `${whole} / ${d} = ${k}, och ${n} · ${k} = ${n * k}.`,
        steps: [
          `Nämnaren säger hur många lika delar helheten delas i: ${whole} / ${d} = ${k}.`,
          `Täljaren säger hur många delar vi tar: ${n} delar.`,
          `${n} · ${k} = ${b(num(n * k))}.`,
        ],
      };
    },

    // ---------- Ekvationer ----------
    simpleEq(rng) {
      const a = ri(rng, 2, 9), x = ri(rng, -5, 12), c0 = ri(rng, -20, 20) || 3, c = a * x + c0;
      return {
        cat: "ekv",
        q: `Om ${a}x ${sgn(c0)} = ${num(c)}, vad är x?`,
        a: num(x),
        w: withWrong(rng, num(x), [num(x + 1), num((c + c0) / a), num(-x)], () => num(x + ri(rng, -4, 4))),
        why: `${a}x = ${num(c)} ${sgn(-c0)} = ${num(c - c0)}, så x = ${num(c - c0)} / ${a} = ${num(x)}.`,
        steps: [
          `Målet är att få x ensamt. Gör samma sak på båda sidor.`,
          `${c0 < 0 ? "Addera " + num(-c0) : "Subtrahera " + num(c0)} på båda sidor: ${a}x = ${num(c - c0)}.`,
          `Dela båda sidor med ${a}: x = ${num(c - c0)} / ${a}.`,
          `x = ${b(num(x))}. Kontroll: ${a} · ${par(x)} ${sgn(c0)} = ${num(c)} ✓`,
        ],
      };
    },
    eqBoth(rng) {
      const x = ri(rng, -6, 9), a = ri(rng, 3, 9), c = ri(rng, 1, a - 1), c0 = ri(rng, -15, 15), d = (a - c) * x + c0;
      return {
        cat: "ekv",
        q: `Lös ekvationen ${a}x ${sgn(c0)} = ${c}x ${sgn(d)}.`,
        a: `x = ${num(x)}`,
        w: withWrong(rng, `x = ${num(x)}`, [`x = ${num(-x)}`, `x = ${num(x + 1)}`, `x = ${num(Math.round((d + c0) / (a - c)))}`], () => `x = ${num(x + ri(rng, -5, 5))}`),
        why: `Samla x på ena sidan: ${a - c}x = ${num(d - c0)}, så x = ${num(x)}.`,
        steps: [
          `Samla alla x på vänster sida: subtrahera ${c}x från båda sidor → ${a - c}x ${sgn(c0)} = ${num(d)}.`,
          `Flytta talen till höger: ${a - c}x = ${num(d)} ${sgn(-c0)} = ${num(d - c0)}.`,
          `Dela med ${a - c}: x = ${num(d - c0)} / ${a - c} = ${b(num(x))}.`,
        ],
      };
    },
    system(rng) {
      const x = ri(rng, 2, 14), y = ri(rng, 1, x - 1);
      return {
        cat: "ekv",
        q: `x + y = ${x + y} och x − y = ${x - y}. Vad är x · y?`,
        a: num(x * y),
        w: withWrong(rng, num(x * y), [num(x + y), num((x + y) * (x - y)), num(x * (y + 1))], () => num(x * y + ri(rng, -8, 8))),
        why: `Addera ekvationerna: 2x = ${2 * x}, x = ${x}. Då är y = ${y} och x · y = ${x * y}.`,
        steps: [
          `Addera ekvationerna – då tar y ut varandra: (x + y) + (x − y) = ${x + y} + ${x - y}.`,
          `2x = ${2 * x}, alltså x = ${x}.`,
          `Sätt in i första ekvationen: ${x} + y = ${x + y}, så y = ${y}.`,
          `x · y = ${x} · ${y} = ${b(num(x * y))}.`,
        ],
      };
    },

    // ---------- Statistik ----------
    average(rng) {
      const k = pick(rng, [3, 4, 5]);
      const m = ri(rng, 4, 20);
      const vals = Array.from({ length: k - 1 }, () => ri(rng, 1, 30));
      const s = vals.reduce((t, v) => t + v, 0);
      const x = m * k - s;
      if (x < -20) return T.average(rng);
      return {
        cat: "stat",
        q: `Medelvärdet av ${vals.map(num).join(", ")} och x är ${m}. Vad är x?`,
        a: num(x),
        w: withWrong(rng, num(x), [num(m), num(x + m), num(m * (k - 1) - s)], () => num(x + ri(rng, -6, 6))),
        why: `Summan måste vara ${k} · ${m} = ${m * k}. x = ${m * k} − ${s} = ${num(x)}.`,
        steps: [
          `Medelvärde = summa / antal. Alltså är summan = medelvärde · antal.`,
          `Det är ${k} tal, så summan ska vara ${k} · ${m} = ${m * k}.`,
          `De kända talen blir tillsammans ${vals.join(" + ")} = ${s}.`,
          `x = ${m * k} − ${s} = ${b(num(x))}.`,
        ],
      };
    },
    median(rng) {
      const n = pick(rng, [5, 6, 7]);
      const vals = Array.from({ length: n }, () => ri(rng, 1, 40));
      const sorted = vals.slice().sort((p, q) => p - q);
      const med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      const mean = vals.reduce((t, v) => t + v, 0) / n;
      return {
        cat: "stat",
        q: `Vad är medianen av talen ${vals.join(", ")}?`,
        a: num(med),
        w: withWrong(rng, num(med), [num(vals[Math.floor(n / 2)]), num(Math.round(mean * 10) / 10), num(sorted[Math.floor(n / 2) + 1] || med + 1)], () => num(med + ri(rng, -5, 5))),
        why: `Sorterat: ${sorted.join(", ")}. Medianen är ${num(med)}.`,
        steps: [
          `Medianen är ${b("mittersta")} värdet när talen är sorterade. Talens ordning i frågan spelar ingen roll.`,
          `Sortera: ${sorted.join(", ")}.`,
          n % 2 ? `Det är ${n} tal, så det mittersta är tal nummer ${(n + 1) / 2}: ${b(num(med))}.` : `Det är ${n} tal (jämnt antal), så medianen är medelvärdet av de två mittersta: (${sorted[n / 2 - 1]} + ${sorted[n / 2]}) / 2 = ${b(num(med))}.`,
        ],
      };
    },

    // ---------- Räkneregler ----------
    orderOps(rng) {
      const a = ri(rng, 2, 12), bb = ri(rng, 2, 6), c = ri(rng, 1, 9), d = ri(rng, 2, 12);
      const ans = a - bb * (c - d);
      return {
        cat: "rakna",
        q: `Vad är ${a} − ${bb} · (${c} − ${d})?`,
        a: num(ans),
        w: withWrong(rng, num(ans), [num((a - bb) * (c - d)), num(a - bb * c - d), num(a + bb * (c - d))], () => num(ans + ri(rng, -8, 8))),
        why: `Parentesen först: ${num(c - d)}. Sedan ${bb} · ${par(c - d)} = ${num(bb * (c - d))}. Sist ${a} − ${par(bb * (c - d))} = ${num(ans)}.`,
        steps: [
          `Räkneordning: ${b("parenteser")} → potenser → multiplikation/division → addition/subtraktion.`,
          `Parentesen: ${c} − ${d} = ${num(c - d)}.`,
          `Multiplikationen: ${bb} · ${par(c - d)} = ${num(bb * (c - d))}.`,
          `Sist subtraktionen: ${a} − ${par(bb * (c - d))} = ${b(num(ans))}.${bb * (c - d) < 0 ? " Minus ett negativt tal blir plus." : ""}`,
        ],
      };
    },

    // ---------- Geometri ----------
    rectArea(rng) {
      const w = ri(rng, 2, 12), l = ri(rng, w + 1, w + 14), P = 2 * (w + l);
      return {
        cat: "geo",
        q: `En rektangel har omkretsen ${P} cm och bredden ${w} cm. Vad är rektangelns area?`,
        a: `${w * l} cm²`,
        w: withWrong(rng, `${w * l} cm²`, [`${P * w} cm²`, `${w * (P - w)} cm²`, `${(w * P) / 2} cm²`], () => `${w * l + ri(rng, -10, 10)} cm²`),
        why: `Längden är ${P}/2 − ${w} = ${l} cm. Arean är ${w} · ${l} = ${w * l} cm².`,
        steps: [
          `Omkretsen är alla fyra sidor: 2 · bredd + 2 · längd = ${P}.`,
          `Bredd + längd = ${P} / 2 = ${P / 2}, så längden är ${P / 2} − ${w} = ${l} cm.`,
          `Area = bredd · längd = ${w} · ${l} = ${b(w * l + " cm²")}.`,
        ],
      };
    },
    triangleAngle(rng) {
      const iso = rng() < 0.5;
      if (iso) {
        const top = 2 * ri(rng, 10, 70);
        const base = (180 - top) / 2;
        return {
          cat: "geo",
          q: `I en likbent triangel är toppvinkeln ${top}°. Hur stor är var och en av basvinklarna?`,
          a: `${num(base)}°`,
          w: withWrong(rng, `${num(base)}°`, [`${180 - top}°`, `${num(top / 2)}°`, `${num(90 - top / 2 + 10)}°`], () => `${num(base + ri(rng, -12, 12))}°`),
          why: `Vinkelsumman är 180°. (180° − ${top}°) / 2 = ${num(base)}°.`,
          steps: [
            `Vinkelsumman i en triangel är alltid ${b("180°")}.`,
            `I en likbent triangel är de två basvinklarna lika stora.`,
            `De två basvinklarna tillsammans: 180° − ${top}° = ${180 - top}°.`,
            `Var och en: ${180 - top}° / 2 = ${b(num(base) + "°")}.`,
          ],
        };
      }
      const [p, q] = [ri(rng, 1, 3), ri(rng, 2, 5)];
      const parts = 1 + p + q;
      if (180 % parts) return T.triangleAngle(rng);
      const x = 180 / parts;
      return {
        cat: "geo",
        q: `En triangels vinklar är x, ${p === 1 ? "" : p}x och ${q}x. Hur stor är den största vinkeln?`,
        a: `${num(Math.max(p, q) * x)}°`,
        w: withWrong(rng, `${num(Math.max(p, q) * x)}°`, [`${num(x)}°`, `${num(Math.max(p, q) * 30)}°`, `${num(180 - x)}°`], () => `${num(Math.max(p, q) * x + ri(rng, -20, 20))}°`),
        why: `x + ${p}x + ${q}x = ${parts}x = 180°, så x = ${num(x)}° och största vinkeln är ${num(Math.max(p, q) * x)}°.`,
        steps: [
          `Vinklarna i en triangel är tillsammans ${b("180°")}.`,
          `x + ${p === 1 ? "" : p}x + ${q}x = ${parts}x = 180°.`,
          `x = 180° / ${parts} = ${num(x)}°.`,
          `Största vinkeln är ${Math.max(p, q)}x = ${b(num(Math.max(p, q) * x) + "°")}.`,
        ],
      };
    },
    circle(rng) {
      const r = ri(rng, 2, 9);
      const byCirc = rng() < 0.5;
      const C = 2 * r;
      return {
        cat: "geo",
        q: byCirc ? `En cirkel har omkretsen ${C}π cm. Vad är cirkelns area?` : `En cirkel har diametern ${2 * r} cm. Vad är cirkelns area?`,
        a: `${r * r}π cm²`,
        w: withWrong(rng, `${r * r}π cm²`, [`${4 * r * r}π cm²`, `${2 * r}π cm²`, `${r}π cm²`], () => `${r * r + ri(rng, -6, 6)}π cm²`),
        why: `Radien är ${r} cm, och arean är π · ${r}² = ${r * r}π cm².`,
        steps: [
          `Cirkelns area = π · r², där r är ${b("radien")}. Omkrets = 2πr, diameter = 2r.`,
          byCirc ? `2πr = ${C}π ger r = ${r} cm.` : `Radien är halva diametern: ${2 * r} / 2 = ${r} cm.`,
          `Area = π · ${r}² = ${b(r * r + "π cm²")}.`,
        ],
      };
    },
    pythagoras(rng) {
      const [p, q, r] = pick(rng, [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17]]);
      const k = ri(rng, 1, 3);
      return {
        cat: "geo",
        q: `En rätvinklig triangel har kateterna ${p * k} cm och ${q * k} cm. Hur lång är hypotenusan?`,
        a: `${r * k} cm`,
        w: withWrong(rng, `${r * k} cm`, [`${(p + q) * k} cm`, `${(r + 1) * k} cm`, `${q * k + 1} cm`], () => `${r * k + ri(rng, -4, 4)} cm`),
        why: `Pythagoras sats: ${p * k}² + ${q * k}² = ${(p * k) ** 2 + (q * k) ** 2} = ${r * k}².`,
        steps: [
          `Pythagoras sats: a² + b² = c², där c är hypotenusan (sidan mitt emot den räta vinkeln).`,
          `${sq(p * k)} + ${sq(q * k)} = ${(p * k) ** 2} + ${(q * k) ** 2} = ${(p * k) ** 2 + (q * k) ** 2}.`,
          `c = √${(p * k) ** 2 + (q * k) ** 2} = ${b(r * k + " cm")}.`,
          `Tips: känn igen trianglarna 3-4-5, 5-12-13 och 8-15-17 (och multiplar av dem).`,
        ],
      };
    },
    volume(rng) {
      const a = ri(rng, 2, 6), bb = ri(rng, 2, 6), c = ri(rng, 2, 10);
      const f = pick(rng, [2, 3]);
      return {
        cat: "geo",
        q: `Ett rätblock har måtten ${a} × ${bb} × ${c} cm. Hur många gånger större blir volymen om alla tre måtten ${f === 2 ? "fördubblas" : "tredubblas"}?`,
        a: `${f ** 3} gånger`,
        w: withWrong(rng, `${f ** 3} gånger`, [`${f} gånger`, `${f ** 2} gånger`, `${f * 3} gånger`, `${f ** 3 * 2} gånger`], () => `${ri(rng, 2, 30)} gånger`),
        why: `Volymen är längd · bredd · höjd, så den blir ${f} · ${f} · ${f} = ${f ** 3} gånger större.`,
        steps: [
          `Volym = längd · bredd · höjd = ${a} · ${bb} · ${c} = ${a * bb * c} cm³.`,
          `Nya måtten: ${f * a} · ${f * bb} · ${f * c} = ${f ** 3 * a * bb * c} cm³.`,
          `Varje mått bidrar med en faktor ${f}: ${f} · ${f} · ${f} = ${b(f ** 3)}. (Area skalas med ${f}², volym med ${f}³.)`,
        ],
      };
    },

    // ---------- Proportioner ----------
    ratio(rng) {
      const a = ri(rng, 1, 7), bb = ri(rng, a + 1, 9), k = ri(rng, 2, 9), total = (a + bb) * k;
      return {
        cat: "prop",
        q: `I en klass är förhållandet mellan pojkar och flickor ${a}:${bb}. Klassen har ${total} elever. Hur många är pojkar?`,
        a: num(a * k),
        w: withWrong(rng, num(a * k), [num(bb * k), num(Math.round(total / a)), num(a * k + k)], () => num(a * k + ri(rng, -5, 5))),
        why: `${a} + ${bb} = ${a + bb} delar, och en del är ${total}/${a + bb} = ${k} elever. Pojkar: ${a} · ${k} = ${a * k}.`,
        steps: [
          `Förhållandet ${a}:${bb} betyder att klassen består av ${a} + ${bb} = ${a + bb} lika stora delar.`,
          `En del = ${total} / ${a + bb} = ${k} elever.`,
          `Pojkarna är ${a} delar: ${a} · ${k} = ${b(num(a * k))}.`,
        ],
      };
    },
    unitPrice(rng) {
      const unit = ri(rng, 4, 30), n1 = ri(rng, 2, 6), n2 = ri(rng, 3, 12);
      if (n1 === n2) return T.unitPrice(rng);
      const thing = pick(rng, [["kg äpplen", "kg"], ["liter mjölk", "liter"], ["meter tyg", "meter"]]);
      return {
        cat: "prop",
        q: `${n1} ${thing[0]} kostar ${n1 * unit} kr. Vad kostar ${n2} ${thing[1]}?`,
        a: `${n2 * unit} kr`,
        w: withWrong(rng, `${n2 * unit} kr`, [`${n1 * unit + (n2 - n1)} kr`, `${Math.round((n1 * unit * n1) / n2)} kr`, `${(n2 + 1) * unit} kr`], () => `${n2 * unit + ri(rng, -9, 9)} kr`),
        why: `En ${thing[1]} kostar ${n1 * unit} / ${n1} = ${unit} kr, så ${n2} kostar ${n2 * unit} kr.`,
        steps: [
          `Räkna ut priset för ${b("en")} ${thing[1]}: ${n1 * unit} / ${n1} = ${unit} kr.`,
          `Multiplicera med antalet: ${n2} · ${unit} = ${b(n2 * unit + " kr")}.`,
        ],
      };
    },

    // ---------- Hastighet och tid ----------
    speed(rng) {
      const v = 5 * ri(rng, 8, 24);
      const t = pick(rng, [30, 45, 75, 90, 105, 120, 135, 150]);
      const d = (v * t) / 60;
      if (d % 1) return T.speed(rng);
      const h = Math.floor(t / 60), m = t % 60;
      const tt = h ? `${h} h${m ? " " + m + " min" : ""}` : `${m} min`;
      return {
        cat: "fart",
        q: `En bil kör ${d} km på ${tt}. Vad är bilens medelhastighet?`,
        a: `${v} km/h`,
        w: withWrong(rng, `${v} km/h`, [`${Math.round(d / (h + m / 100))} km/h`, `${v + 10} km/h`, `${Math.round(d / (t / 100))} km/h`], () => `${v + 5 * ri(rng, -3, 3)} km/h`),
        why: `${tt} = ${num(t / 60)} h. Hastighet = ${d} / ${num(t / 60)} = ${v} km/h.`,
        steps: [
          `Hastighet = sträcka / tid. Tiden måste vara i ${b("timmar")} när svaret är i km/h.`,
          `${tt} = ${t} min = ${frac(t, 60)} h = ${num(t / 60)} h. (Fällan är att skriva ${h},${m || "0"} h.)`,
          `${d} / ${num(t / 60)} = ${b(v + " km/h")}.`,
        ],
      };
    },
    unitConv(rng) {
      const ms = pick(rng, [5, 10, 15, 20, 25, 30]);
      const kmh = ms * 3.6;
      const toKmh = rng() < 0.5;
      return {
        cat: "fart",
        q: toKmh ? `En löpare springer ${ms} m/s. Hur snabbt är det i km/h?` : `Ett tåg kör i ${num(kmh)} km/h. Hur många meter per sekund är det?`,
        a: toKmh ? `${num(kmh)} km/h` : `${ms} m/s`,
        w: toKmh ? withWrong(rng, `${num(kmh)} km/h`, [`${ms * 60} km/h`, `${num(ms / 3.6)} km/h`, `${ms * 6} km/h`], () => `${num(kmh + ri(rng, -9, 9))} km/h`)
          : withWrong(rng, `${ms} m/s`, [`${num(kmh * 3.6)} m/s`, `${num(kmh / 60)} m/s`, `${ms * 2} m/s`], () => `${ms + ri(rng, -6, 6)} m/s`),
        why: `1 m/s = 3,6 km/h. ${ms} · 3,6 = ${num(kmh)}.`,
        steps: [
          `1 m/s betyder 1 meter varje sekund. På en timme (3 600 s) blir det 3 600 m = 3,6 km.`,
          `Alltså: 1 m/s = ${b("3,6 km/h")}.`,
          toKmh ? `${ms} m/s = ${ms} · 3,6 = ${b(num(kmh) + " km/h")}.` : `${num(kmh)} km/h = ${num(kmh)} / 3,6 = ${b(ms + " m/s")}.`,
        ],
      };
    },
    work(rng) {
      const [p, q] = pick(rng, [[3, 6], [4, 12], [6, 12], [2, 6], [6, 3], [10, 15], [12, 4], [5, 20]]);
      const t = (p * q) / (p + q);
      return {
        cat: "fart",
        q: `En pump fyller en bassäng på ${p} timmar och en annan pump på ${q} timmar. Hur lång tid tar det om båda pumparna används samtidigt?`,
        a: `${num(t)} h`,
        w: withWrong(rng, `${num(t)} h`, [`${num((p + q) / 2)} h`, `${num(p + q)} h`, `${num(Math.abs(p - q))} h`], () => `${num(t + ri(rng, 1, 4))} h`),
        why: `Per timme fylls ${frac(1, p)} + ${frac(1, q)} = ${frac(p + q, p * q)} av bassängen, så det tar ${num(t)} h.`,
        steps: [
          `Tänk "hur mycket per timme". Första pumpen fyller ${frac(1, p)} av bassängen per timme, andra ${frac(1, q)}.`,
          `Tillsammans per timme: ${frac(1, p)} + ${frac(1, q)} = ${frac(p + q, p * q)}.`,
          `Tiden är det omvända: 1 / ${frac(p + q, p * q)} = ${b(num(t) + " h")}. (Svaret måste vara kortare än den snabbaste pumpens tid.)`,
        ],
      };
    },

    // ---------- Potenser och rötter ----------
    powers(rng, hard) {
      const a = ri(rng, 2, 6), e2 = hard ? ri(rng, -4, 3) : ri(rng, 1, 4), c = ri(rng, 1, 4);
      const e = a + e2 - c;
      const ans = e >= 0 ? num(2 ** e) : frac(1, 2 ** -e);
      const show = (x) => (x >= 0 ? num(2 ** x) : frac(1, 2 ** -x));
      return {
        cat: "pot",
        q: `Vad är ${pow(2, a)} · ${pow(2, e2)} / ${pow(2, c)}?`,
        a: ans,
        w: withWrong(rng, ans, [show(a * e2 - c), show(a + e2 + c), show(e + 1)], () => show(e + ri(rng, -3, 3))),
        why: `Exponenterna: ${a} + ${par(e2)} − ${c} = ${num(e)}, så svaret är ${pow(2, e)} = ${ans}.`,
        steps: [
          `Samma bas: vid multiplikation ${b("adderas")} exponenterna, vid division ${b("subtraheras")} de.`,
          `${a} + ${par(e2)} − ${c} = ${num(e)}, alltså ${pow(2, e)}.`,
          e >= 0 ? `${pow(2, e)} = ${b(ans)}.` : `En negativ exponent betyder "ett genom": ${pow(2, e)} = 1 / ${pow(2, -e)} = ${b(ans)}.`,
        ],
      };
    },
    roots(rng) {
      const k = pick(rng, [2, 3, 5]), m = ri(rng, 2, 6), n = m * m * k;
      return {
        cat: "pot",
        q: `Vilket tal är lika med √${n}?`,
        a: `${m}√${k}`,
        w: withWrong(rng, `${m}√${k}`, [`${k}√${m}`, `${m * m}√${k}`, `${m}√${k * 2}`], () => `${m + ri(rng, -2, 2) || 1}√${k}`),
        why: `${n} = ${m * m} · ${k}, och √${m * m} = ${m}. Alltså √${n} = ${m}√${k}.`,
        steps: [
          `Leta efter en kvadrat (4, 9, 16, 25, 36 …) som är en faktor i ${n}.`,
          `${n} = ${m * m} · ${k}.`,
          `√(a · b) = √a · √b, så √${n} = √${m * m} · √${k} = ${b(m + "√" + k)}.`,
        ],
      };
    },

    // ---------- Algebra ----------
    expand(rng) {
      const a = ri(rng, 1, 9), minus = rng() < 0.5;
      const s = minus ? "−" : "+";
      return {
        cat: "alg",
        q: `Förenkla (x ${s} ${a})².`,
        a: `x² ${s} ${2 * a}x + ${a * a}`,
        w: withWrong(rng, `x² ${s} ${2 * a}x + ${a * a}`, [`x² + ${a * a}`, `x² ${s} ${cx(a)} + ${a * a}`, `x² ${s} ${2 * a}x ${minus ? "+" : "−"} ${a * a}`], () => `x² ${s} ${2 * a}x + ${a * a + ri(rng, 1, 9)}`),
        why: `Kvadreringsregeln: (x ${s} ${a})² = x² ${s} 2 · ${a} · x + ${a}² = x² ${s} ${2 * a}x + ${a * a}.`,
        steps: [
          `Kvadreringsregeln: (a ${s} b)² = a² ${s} 2ab + b². Vanligaste felet är att glömma mittentermen.`,
          `Här är a = x och b = ${a}.`,
          `x² ${s} 2 · x · ${a} + ${a}² = ${b(`x² ${s} ${2 * a}x + ${a * a}`)}.`,
        ],
      };
    },
    simplify(rng) {
      const p = ri(rng, 2, 6), q = ri(rng, 1, p - 1), a = ri(rng, 1, 8), c = ri(rng, 1, 8);
      const xc = p - q, k = -p * a - q * c;
      const xs = cx(xc);
      const ans = `${xs} ${sgn(k)}`;
      return {
        cat: "alg",
        q: `Förenkla ${p}(x − ${a}) − ${q}(x + ${c}).`,
        a: ans,
        w: withWrong(rng, ans, [`${xs} ${sgn(-p * a + q * c)}`, `${xs} ${sgn(-a - c)}`, `${cx(p + q)} ${sgn(k)}`], () => `${xs} ${sgn(k + ri(rng, -6, 6))}`),
        why: `${p}x − ${p * a} − ${q}x − ${q * c} = ${ans}.`,
        steps: [
          `Multiplicera in i parenteserna. Minustecknet framför ${q}(…) ändrar tecken på ${b("båda")} termerna.`,
          `${p}(x − ${a}) = ${p}x − ${p * a} och −${q}(x + ${c}) = −${q}x − ${q * c}.`,
          `x-termer: ${p}x − ${q}x = ${xs}. Tal: −${p * a} − ${q * c} = ${num(k)}.`,
          `Svar: ${b(ans)}.`,
        ],
      };
    },

    // ---------- Funktioner ----------
    slope(rng) {
      const k = pick(rng, [-3, -2, -1, 1, 2, 3, 4]) * (rng() < 0.3 ? 0.5 : 1), m = ri(rng, -5, 5);
      const x1 = ri(rng, -4, 2) * 2, x2 = x1 + 2 * ri(rng, 1, 4);
      const y1 = k * x1 + m, y2 = k * x2 + m;
      return {
        cat: "fun",
        q: `En rät linje går genom punkterna (${num(x1)}, ${num(y1)}) och (${num(x2)}, ${num(y2)}). Vad är linjens lutning (k-värde)?`,
        a: num(k),
        w: withWrong(rng, num(k), [num(-k), num(k === 0 ? 1 : 1 / k), num(k + 1)], () => num(k + ri(rng, -3, 3))),
        why: `k = (${num(y2)} − ${par(y1)}) / (${num(x2)} − ${par(x1)}) = ${num(y2 - y1)} / ${num(x2 - x1)} = ${num(k)}.`,
        steps: [
          `Lutningen k = Δy / Δx = (y₂ − y₁) / (x₂ − x₁): hur mycket y ändras när x ökar med 1.`,
          `Δy = ${num(y2)} − ${par(y1)} = ${num(y2 - y1)}.`,
          `Δx = ${num(x2)} − ${par(x1)} = ${num(x2 - x1)}.`,
          `k = ${num(y2 - y1)} / ${num(x2 - x1)} = ${b(num(k))}.`,
        ],
      };
    },
    fvalue(rng) {
      const a = ri(rng, 1, 4), c = ri(rng, -6, 6), x = ri(rng, -4, 4) || 2;
      const val = a * x * x + c;
      return {
        cat: "fun",
        q: `f(x) = ${a === 1 ? "" : a}x² ${sgn(c)}. Vad är f(${num(x)})?`,
        a: num(val),
        w: withWrong(rng, num(val), [num(-a * x * x + c), num(a * 2 * x + c), num((a * x) ** 2 + c)], () => num(val + ri(rng, -7, 7))),
        why: `f(${num(x)}) = ${a === 1 ? "" : a + " · "}${par(x)}² ${sgn(c)} = ${num(val)}.`,
        steps: [
          `Byt ut varje x mot ${num(x)} – sätt parentes runt negativa tal.`,
          `${par(x)}² = ${x * x}${x < 0 ? " (minus gånger minus blir plus)" : ""}.`,
          `${a === 1 ? "" : a + " · "}${x * x} ${sgn(c)} = ${b(num(val))}.`,
        ],
      };
    },

    // ---------- Sannolikhet och kombinatorik ----------
    probability(rng, hard) {
      const r = ri(rng, 2, 6), bl = ri(rng, 2, 7), n = r + bl;
      if (!hard) {
        return {
          cat: "sann",
          q: `I en påse finns ${r} röda och ${bl} blå kulor. Man tar en kula utan att titta. Hur stor är sannolikheten att den är röd?`,
          a: frac(r, n),
          w: withWrong(rng, frac(r, n), [frac(r, bl), frac(bl, n), frac(1, r)], () => frac(ri(rng, 1, n - 1), n)),
          why: `Gynnsamma / möjliga = ${r} / ${n}.`,
          steps: [
            `Sannolikhet = antal gynnsamma utfall / antal möjliga utfall.`,
            `Möjliga: alla ${n} kulor. Gynnsamma: de ${r} röda.`,
            `P(röd) = ${r}/${n} = ${b(frac(r, n))}.`,
          ],
        };
      }
      const p = frac(r * (r - 1), n * (n - 1));
      return {
        cat: "sann",
        q: `I en påse finns ${r} röda och ${bl} blå kulor. Man tar två kulor utan återläggning. Hur stor är sannolikheten att båda är röda?`,
        a: p,
        w: withWrong(rng, p, [frac(r * r, n * n), frac(r, n), frac(r - 1, n - 1)], () => frac(ri(rng, 1, 12), n * (n - 1))),
        why: `${r}/${n} · ${r - 1}/${n - 1} = ${r * (r - 1)}/${n * (n - 1)}.`,
        steps: [
          `Första kulan röd: ${r} av ${n}, alltså ${frac(r, n)}.`,
          `Utan återläggning finns nu ${r - 1} röda av ${n - 1}: ${frac(r - 1, n - 1)}.`,
          `"Och" betyder gånger: ${r}/${n} · ${r - 1}/${n - 1} = ${r * (r - 1)}/${n * (n - 1)} = ${b(p)}.`,
        ],
      };
    },
    handshake(rng) {
      const n = ri(rng, 4, 12);
      const ans = (n * (n - 1)) / 2;
      return {
        cat: "sann",
        q: `${n} personer hälsar på varandra. Alla skakar hand med alla andra exakt en gång. Hur många handskakningar blir det?`,
        a: num(ans),
        w: withWrong(rng, num(ans), [num(n * (n - 1)), num(n * n), num(n * 2)], () => num(ans + ri(rng, -6, 6))),
        why: `Varje person skakar hand med ${n - 1} andra: ${n} · ${n - 1} / 2 = ${ans}.`,
        steps: [
          `Varje person skakar hand med de ${n - 1} andra: ${n} · ${n - 1} = ${n * (n - 1)}.`,
          `Men då räknas varje handskakning två gånger (A–B och B–A).`,
          `${n * (n - 1)} / 2 = ${b(num(ans))}.`,
        ],
      };
    },

    // ---------- KVA: jämför två kvantiteter (fasta alternativ, som på provet) ----------
    kva(rng, hard) {
      const opts = ["I är större än II", "II är större än I", "I är lika med II", "Informationen är otillräcklig"];
      const cmp = (x, y) => (x > y ? 0 : x < y ? 1 : 2);
      const cases = [
        () => { const a = ri(rng, 1, 7), d = ri(rng, 1, 9) / 10, v = a / 8; return { I: frac(a, 8), II: num(d), c: cmp(v, d), steps: [`Skriv båda som decimaltal.`, `${frac(a, 8)} = ${a} / 8 = ${num(v)}.`, `Jämför ${num(v)} med ${num(d)}.`] }; },
        () => { const p = pick(rng, [10, 20, 25, 40]), n = pick(rng, [30, 50, 60, 80]); return { I: `${p} % av ${n}`, II: `${n} % av ${p}`, c: 2, steps: [`${p} % av ${n} = ${num(p / 100)} · ${n} = ${num((p * n) / 100)}.`, `${n} % av ${p} = ${num(n / 100)} · ${p} = ${num((p * n) / 100)}.`, `Båda är ${p} · ${n} / 100 – p % av n är alltid lika med n % av p.`] }; },
        () => { const bb = ri(rng, 2, 5), e = pick(rng, [2, 3]); return { I: `(−${bb})<sup>${e}</sup>`, II: `−${bb}<sup>${e}</sup>`, c: e % 2 ? 2 : 0, steps: [`Parentesen avgör: (−${bb})<sup>${e}</sup> betyder (−${bb}) · (−${bb})${e === 3 ? ` · (−${bb})` : ""} = ${num((-bb) ** e)}.`, `−${bb}<sup>${e}</sup> betyder −(${pow(bb, e)}) = ${num(-(bb ** e))}.`, `Jämför ${num((-bb) ** e)} med ${num(-(bb ** e))}.`] }; },
        () => { const n = pick(rng, [16, 25, 36, 49, 64, 81]), s = Math.sqrt(n), d = s + pick(rng, [-1, 0, 1]); return { I: `√${n}`, II: num(d), c: cmp(s, d), steps: [`√${n} är det positiva tal som gånger sig självt blir ${n}.`, `${s} · ${s} = ${n}, så √${n} = ${s}.`, `Jämför ${s} med ${num(d)}.`] }; },
        () => { const a = ri(rng, 2, 7), bb = a + ri(rng, 1, 3), c = ri(rng, 2, 7), d = c + ri(rng, 1, 3); return { I: frac(a, bb), II: frac(c, d), c: cmp(a * d, c * bb), steps: [`Korsmultiplicera: jämför ${a} · ${d} med ${c} · ${bb}.`, `${a} · ${d} = ${a * d} och ${c} · ${bb} = ${c * bb}.`, `Den största produkten hör till det största bråket.`] }; },
        () => ({ I: pow(2, 10), II: pow(10, 3), c: 0, steps: [`${pow(2, 10)} = 1 024.`, `${pow(10, 3)} = 1 000.`, `1 024 > 1 000.`] }),
        () => { const r = ri(rng, 2, 5); const s = Math.floor(r * r * 3.14) + pick(rng, [-2, 1, 3]); return { I: `Arean av en cirkel med radien ${r}`, II: num(s), c: cmp(Math.PI * r * r, s), steps: [`Arean = π · ${r}² = ${r * r}π.`, `π ≈ 3,14, så ${r * r}π ≈ ${num(Math.round(r * r * 314) / 100)}.`, `Jämför med ${s}.`] }; },
        () => { const x = ri(rng, 2, 5); return { pre: `x = ${x}`, I: "2x + 1", II: "x²", c: cmp(2 * x + 1, x * x), steps: [`Sätt in x = ${x}.`, `I: 2 · ${x} + 1 = ${2 * x + 1}. II: ${x}² = ${x * x}.`, `Jämför ${2 * x + 1} och ${x * x}.`] }; },
      ];
      const hardCases = [
        () => ({ pre: "x > 0", I: "x²", II: "x", c: 3, steps: [`Testa ett tal mellan 0 och 1: x = ½ ger x² = ¼, som är ${b("mindre")} än x.`, `Testa x = 2: x² = 4, som är ${b("större")} än x.`, `Olika svar beroende på x – informationen är otillräcklig.`] }),
        () => ({ pre: "x < 0", I: "x³", II: "x²", c: 1, steps: [`x är negativt. Ett negativt tal upphöjt till udda exponent är negativt: x³ < 0.`, `Upphöjt till jämn exponent blir det positivt: x² > 0.`, `Ett positivt tal är alltid större än ett negativt – II är större.`] }),
        () => { const a = ri(rng, 3, 9); return { pre: `x + y = ${a * 2} och x − y = ${a * 2 - 4}`, I: "x", II: "y", c: 0, steps: [`Addera ekvationerna: 2x = ${a * 4 - 4}, så x = ${a * 2 - 2}.`, `Då är y = ${a * 2} − ${a * 2 - 2} = 2.`, `${a * 2 - 2} > 2 – I är större.`] }; },
        () => ({ pre: "n är ett heltal", I: "n²", II: "n", c: 3, steps: [`Testa n = 0 eller 1: n² = n.`, `Testa n = 2: n² = 4 > 2.`, `Olika svar – informationen är otillräcklig.`] }),
        () => { const s = pick(rng, [8, 10, 12]); return { pre: `a och b är positiva tal och a + b = ${s}`, I: "a · b", II: num((s / 2) ** 2), c: 3, steps: [`Produkten a · b är som störst när a = b = ${s / 2}: då är a · b = ${(s / 2) ** 2}.`, `Om a = 1 och b = ${s - 1} är a · b = ${s - 1}, alltså mindre.`, `a · b kan vara lika med eller mindre än ${(s / 2) ** 2} – otillräcklig information.`] }; },
        () => ({ pre: "Vinklarna i en triangel är x, 2x och 3x", I: "x", II: "30°", c: 2, steps: [`Vinkelsumman: x + 2x + 3x = 6x = 180°.`, `x = 30°.`, `Lika.`] }),
        () => { const k = pick(rng, [4, 9, 16, 25]); return { pre: `x² = ${k}`, I: "x", II: num(Math.sqrt(k)), c: 3, steps: [`x² = ${k} har ${b("två")} lösningar: x = ${Math.sqrt(k)} och x = −${Math.sqrt(k)}.`, `Om x = ${Math.sqrt(k)} är de lika, om x = −${Math.sqrt(k)} är II större.`, `Otillräcklig information.`] }; },
        () => { const [p, q] = pick(rng, [[3, 4], [2, 5], [5, 7]]); return { pre: `x och y är positiva och x / y = ${p}/${q}`, I: "x", II: "y", c: 1, steps: [`x / y = ${p}/${q} betyder att x = ${frac(p, q)} · y.`, `Eftersom ${frac(p, q)} < 1 och y > 0 är x mindre än y.`, `II är större.`] }; },
      ];
      const k = (hard && rng() < 0.6 ? pick(rng, hardCases) : pick(rng, cases))();
      return {
        cat: "kva",
        q: `${k.pre ? `<span class="kva-pre">${k.pre}</span>` : ""}<span class="kva"><span><small>Kvantitet I</small>${k.I}</span><span><small>Kvantitet II</small>${k.II}</span></span>`,
        a: opts[k.c], w: opts.filter((_, i) => i !== k.c), fixed: opts,
        why: k.steps[k.steps.length - 1],
        steps: [`Räkna ut eller uppskatta båda kvantiteterna var för sig${k.pre ? " med hjälp av informationen överst" : ""}.`, ...k.steps, `Svar: ${b(opts[k.c])}.`],
      };
    },

    // ---------- NOG: räcker informationen? (fem fasta alternativ, som på provet) ----------
    nog(rng) {
      const opts = ["i (1) men ej i (2)", "i (2) men ej i (1)", "i (1) tillsammans med (2)", "i (1) och (2) var för sig", "ej genom de båda påståendena"];
      const cases = [
        () => { const x = ri(rng, 2, 9), y = ri(rng, 1, 9); return { q: "Vad är x?", s1: `2x + y = ${2 * x + y}`, s2: `y = ${y}`, c: 2, steps: [`(1) ensam: en ekvation med två okända – går inte.`, `(2) säger bara något om y – går inte.`, `Tillsammans: 2x + ${y} = ${2 * x + y}, x = ${x}. Det räcker.`] }; },
        () => { const d = ri(rng, 2, 6), s = 2 * ri(rng, 12, 30) + d; return { q: "Hur gammal är Anna?", s1: `Anna är ${d} år äldre än Bo.`, s2: `Tillsammans är Anna och Bo ${s} år.`, c: 2, steps: [`(1) ensam ger bara skillnaden – okänd ålder.`, `(2) ensam ger bara summan – okänd ålder.`, `Tillsammans: A − B = ${d} och A + B = ${s} ger A = ${(s + d) / 2}. Det räcker.`] }; },
        () => { const x = ri(rng, 2, 8); return { q: "Vad är x?", s1: `3x − 5 = ${3 * x - 5}`, s2: `x² = ${x * x} och x > 0`, c: 3, steps: [`(1): 3x = ${3 * x}, x = ${x}. Räcker.`, `(2): x² = ${x * x} och x > 0 ger x = ${x}. Räcker också.`, `Båda räcker var för sig.`] }; },
        () => { const d = ri(rng, 2, 6); return { q: "Vad är x + y?", s1: `x − y = ${d}`, s2: `2x − 2y = ${2 * d}`, c: 4, steps: [`(1) ger skillnaden, inte summan.`, `(2) är samma sak som (1) multiplicerat med 2 – ingen ny information.`, `Inte ens tillsammans går det att få x + y.`] }; },
        () => { const pen = ri(rng, 3, 9); return { q: "Vad kostar en penna?", s1: `En penna och ett sudd kostar tillsammans ${pen + ri(rng, 2, 8)} kr.`, s2: `Tre pennor kostar ${3 * pen} kr.`, c: 1, steps: [`(1): två okända priser i en ekvation – går inte.`, `(2): en penna kostar ${3 * pen} / 3 = ${pen} kr. Räcker.`, `Bara (2) räcker.`] }; },
        () => ({ q: "Vilket tal är n?", s1: "n är ett primtal mellan 20 och 28.", s2: "n är udda.", c: 0, steps: [`(1): talen 21–27. Primtal: bara 23. Räcker.`, `(2): n är udda – oändligt många möjligheter.`, `Bara (1) räcker.`] }),
        () => { const w = ri(rng, 2, 9); return { q: "Vad är rektangelns area?", s1: "Längden är dubbelt så stor som bredden.", s2: `Bredden är ${w} cm.`, c: 2, steps: [`(1) ger bara formen, inte storleken.`, `(2) ger bredden men inte längden.`, `Tillsammans: längd ${2 * w} cm, area ${w} · ${2 * w} = ${2 * w * w} cm². Det räcker.`] }; },
        () => { const pct = pick(rng, [20, 30, 40]), diff = pick(rng, [4, 6, 8]); return { q: "Hur många elever går i klassen?", s1: `${pct} % av eleverna är pojkar.`, s2: `Det är ${diff} fler flickor än pojkar.`, c: 2, steps: [`(1) ger bara andelar – inget antal.`, `(2) ger bara skillnaden.`, `Tillsammans: flickor − pojkar = ${100 - pct} % − ${pct} % = ${100 - 2 * pct} % av klassen = ${diff} elever, så klassen har ${diff} / ${num((100 - 2 * pct) / 100)} = ${num((diff * 100) / (100 - 2 * pct))} elever.`] }; },
        () => { const s = ri(rng, 30, 90); return { q: "Vad är medelvärdet av a, b och c?", s1: `a + b + c = ${s}`, s2: `a = ${ri(rng, 3, 12)}`, c: 0, steps: [`(1): medelvärdet = summan / 3 = ${s} / 3 = ${num(s / 3)}. Räcker.`, `(2) ger bara ett av talen.`, `Bara (1) räcker.`] }; },
        () => { const v = 10 * ri(rng, 4, 9); return { q: "Hur lång tid tar resan?", s1: `Sträckan är ${v * 2} km.`, s2: `Medelhastigheten är ${v} km/h.`, c: 2, steps: [`Tid = sträcka / hastighet – vi behöver båda.`, `(1) ger bara sträckan, (2) bara hastigheten.`, `Tillsammans: ${v * 2} / ${v} = 2 h. Det räcker.`] }; },
        () => ({ q: "Är x > y?", s1: "x = 2y", s2: "y > 0", c: 2, steps: [`(1): om y = 1 är x = 2 > y, men om y = −1 är x = −2 < y. Räcker inte.`, `(2) säger inget om x.`, `Tillsammans: y > 0 ger 2y > y, alltså x > y. Det räcker.`] }),
        () => { const k = ri(rng, 3, 9); return { q: "Vad är x?", s1: `x² = ${k * k}`, s2: `x < 0`, c: 2, steps: [`(1): x = ${k} eller x = −${k}. Räcker inte.`, `(2): bara att x är negativt.`, `Tillsammans: x = −${k}. Det räcker.`] }; },
      ];
      const k = pick(rng, cases)();
      return {
        cat: "nog",
        q: `<span class="nog"><span class="nog-q">${k.q}</span><span class="nog-s"><b>(1)</b> ${k.s1}</span><span class="nog-s"><b>(2)</b> ${k.s2}</span><small class="nog-hint">Tillräcklig information för lösningen erhålls …</small></span>`,
        a: opts[k.c], w: opts.filter((_, i) => i !== k.c), fixed: opts,
        why: k.steps[k.steps.length - 1],
        steps: [`Du ska inte lösa uppgiften – bara avgöra ${b("om")} den går att lösa. Pröva (1) ensam, sedan (2) ensam, och sist båda tillsammans.`, ...k.steps, `Svar: ${b(opts[k.c])}.`],
      };
    },
  };

  // Uppgiftstyper per nivå. En omgång: 6 XYZ, 3 KVA och 1 NOG – i den ordningen, som på provet.
  const POOL = {
    easy: ["percentOf", "fractionOf", "simpleEq", "average", "median", "orderOps", "rectArea", "triangleAngle", "ratio", "unitPrice", "probability", "fvalue", "handshake"],
    medium: ["percentChange", "percentBack", "fractionsAdd", "simpleEq", "system", "average", "median", "triangleAngle", "circle", "ratio", "speed", "unitConv", "powers", "roots", "simplify", "slope", "fvalue", "probability", "handshake"],
    hard: ["percentChange", "percentBack", "compound", "fractionsAdd", "eqBoth", "system", "circle", "pythagoras", "volume", "speed", "unitConv", "work", "powers", "roots", "expand", "simplify", "slope", "probability"],
  };

  // En omgång med tio uppgifter. rng styr både urval och siffror.
  function round(rng, level, shuffle) {
    const hard = level === "hard";
    const types = shuffle(POOL[level], rng).slice(0, 6).concat(["kva", "kva", "kva", "nog"]);
    const seen = new Set();
    return types.map((type) => {
      let t, guard = 0;
      // Undvik två identiska KVA/NOG-uppgifter i samma omgång.
      do { t = T[type](rng, hard); } while (seen.has(t.q) && guard++ < 10);
      seen.add(t.q);
      const options = t.fixed ? t.fixed.slice() : shuffle([t.a, ...t.w], rng);
      return { type, cat: t.cat, prompt: t.q, options, correct: options.indexOf(t.a), why: t.why, steps: t.steps, fixed: !!t.fixed };
    });
  }

  const api = { round, types: Object.keys(T), CATS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HP_MATH = api;
})(this);
