// Dagsprov – djuren: utseende, ljud och var man får dem.
//
// Alla djur ritas av samma lilla ritmotor (svg), i samma gulliga stil: stort runt huvud, stora
// glansiga ögon, rosa kinder och en liten kropp. Varje art beskrivs med några få egenskaper
// (färger, öron, nos, extra detaljer) – så är det lätt att lägga till fler.
(function (root) {
  // ---------- Arterna ----------
  // ear: round | pointy | long | floppy | mouse | small | none | tufted | horse
  // face: muzzle | mask | patches | disk | none | heart | band
  // nose: dot | beak | snout | smile | trunk | duck | teeth | hook | big
  // x (extra): whiskers, horns, antlers, stripes, spots, crest, antenna, wings, fin, tentacles, spikes,
  //   mane, wool, gills, shell, ossicones, horn, tuft, fangs, beard, tail-fan, flames, spout, cheeks, teeth, sleepy
  const S = {
    // Månadens djur
    penguin: { e: "🐧", body: "#34384a", belly: "#ffffff", ear: "none", face: "heart", nose: "beak", beak: "#ff9f0a", x: ["wings"], voice: "squeak" },
    fox: { e: "🦊", body: "#ff8a3d", belly: "#fff4e6", ear: "pointy", earIn: "#3a2a24", face: "muzzle", nose: "dot", x: ["whiskers"], voice: "yip" },
    hare: { e: "🐰", body: "#f3e5d8", belly: "#ffffff", ear: "long", earIn: "#ffb3c7", face: "muzzle", nose: "dot", noseC: "#ff7aa2", x: ["whiskers", "teeth"], voice: "boing" },
    hedgehog: { e: "🦔", body: "#b08968", belly: "#f6e3cf", ear: "small", face: "muzzle", nose: "dot", x: ["spikes"], spike: "#7f5539", voice: "squeak" },
    koala: { e: "🐨", body: "#a7a9b4", belly: "#e9eaf0", ear: "round", earIn: "#f2f2f7", earBig: true, face: "none", nose: "big", voice: "hum" },
    turtle: { e: "🐢", body: "#7ccf6b", belly: "#e8f7d8", ear: "none", face: "none", nose: "smile", x: ["shell"], shell: "#5c8a3a", voice: "bubble" },
    dolphin: { e: "🐬", body: "#5ab0f0", belly: "#e3f3ff", ear: "none", face: "muzzle", nose: "smile", x: ["fin"], voice: "click" },
    otter: { e: "🦦", body: "#9c6b43", belly: "#f1d9bd", ear: "small", face: "muzzle", nose: "dot", x: ["whiskers"], voice: "chitter" },
    owl: { e: "🦉", body: "#8e6fbf", belly: "#efe4ff", ear: "tufted", face: "disk", nose: "beak", beak: "#ffb340", x: ["wings"], voice: "hoot" },
    squirrel: { e: "🐿️", body: "#e0782f", belly: "#fde6cf", ear: "tufted", face: "muzzle", nose: "dot", x: ["cheeks", "teeth"], voice: "chitter" },
    bear: { e: "🐻", body: "#9a6a44", belly: "#e9c9a5", ear: "round", earIn: "#e9c9a5", face: "muzzle", nose: "dot", voice: "growl" },
    reindeer: { e: "🦌", body: "#a8744f", belly: "#f3dcc4", ear: "pointy", earIn: "#f3dcc4", face: "muzzle", nose: "dot", noseC: "#e8413c", x: ["antlers"], voice: "hum" },
    // Ur ägg
    cat: { e: "🐱", body: "#f5b971", belly: "#fff3e3", ear: "pointy", earIn: "#ffb3c7", face: "muzzle", nose: "dot", noseC: "#ff8fab", x: ["whiskers", "stripes"], stripe: "#e0913f", voice: "meow" },
    dog: { e: "🐶", body: "#e8c39e", belly: "#fff8ee", ear: "floppy", earC: "#9a6a44", face: "muzzle", nose: "dot", voice: "woof" },
    mouse: { e: "🐭", body: "#b9bcc8", belly: "#f2f2f7", ear: "mouse", earIn: "#ffb3c7", face: "none", nose: "dot", noseC: "#ff8fab", x: ["whiskers"], voice: "squeak" },
    hamster: { e: "🐹", body: "#f0b27a", belly: "#fff6ea", ear: "small", earIn: "#ffb3c7", face: "muzzle", nose: "dot", noseC: "#ff8fab", x: ["cheeks"], voice: "squeak" },
    frog: { e: "🐸", body: "#6fcf5f", belly: "#d9f7c9", ear: "none", face: "none", nose: "smile", x: ["frogeyes"], voice: "croak" },
    chick: { e: "🐥", body: "#ffd84a", belly: "#fff3b0", ear: "none", face: "none", nose: "beak", beak: "#ff9500", x: ["crest", "wings"], voice: "chirp" },
    duck: { e: "🦆", body: "#fafafa", belly: "#ffffff", ear: "none", face: "none", nose: "duck", beak: "#ffb020", x: ["crest", "wings"], voice: "honk" },
    pig: { e: "🐷", body: "#ffb3c1", belly: "#ffd6de", ear: "pointy", earIn: "#ff8fa6", face: "none", nose: "snout", voice: "oink" },
    cow: { e: "🐮", body: "#ffffff", belly: "#ffd6de", ear: "floppy", earC: "#3a3a44", face: "none", nose: "snout", snoutC: "#ffc2cf", x: ["horns", "spots"], spot: "#3a3a44", voice: "moo" },
    sheep: { e: "🐑", body: "#5b4a42", belly: "#fffaf0", ear: "floppy", earC: "#5b4a42", face: "none", nose: "dot", noseC: "#2b2320", x: ["wool"], voice: "baa" },
    panda: { e: "🐼", body: "#ffffff", belly: "#f7f7f7", ear: "round", earC: "#26262e", earIn: "#26262e", face: "patches", nose: "dot", arms: "#26262e", voice: "growl" },
    raccoon: { e: "🦝", body: "#9ea3ad", belly: "#eceef2", ear: "pointy", earIn: "#eceef2", face: "mask", nose: "dot", voice: "chitter" },
    giraffe: { e: "🦒", body: "#ffcf5c", belly: "#fff1c9", ear: "small", face: "muzzle", nose: "dot", x: ["ossicones", "spots"], spot: "#c9862e", voice: "hum" },
    zebra: { e: "🦓", body: "#ffffff", belly: "#f2f2f2", ear: "horse", earIn: "#3a3a44", face: "muzzle", faceC: "#5a5a66", nose: "dot", x: ["stripes", "mane"], stripe: "#2b2b33", maneC: "#2b2b33", voice: "whinny" },
    sloth: { e: "🦥", body: "#a58b6f", belly: "#e8d6bf", ear: "none", face: "mask", maskC: "#e8d6bf", nose: "big", x: ["sleepy"], voice: "yawn" },
    seal: { e: "🦭", body: "#a9b6c4", belly: "#e7eef5", ear: "none", face: "muzzle", nose: "dot", x: ["whiskers", "dots"], voice: "arf" },
    whale: { e: "🐳", body: "#4f8fe0", belly: "#dcecff", ear: "none", face: "none", nose: "smile", x: ["spout"], voice: "song" },
    octopus: { e: "🐙", body: "#c77dff", belly: "#efd9ff", ear: "none", face: "none", nose: "smile", x: ["tentacles"], voice: "bubble" },
    ladybug: { e: "🐞", body: "#ff3b30", belly: "#2b2b33", ear: "none", face: "none", nose: "smile", x: ["antenna", "dots"], dotC: "#2b2b33", headC: "#2b2b33", voice: "tick" },
    bee: { e: "🐝", body: "#ffcc00", belly: "#fff3b0", ear: "none", face: "none", nose: "smile", x: ["antenna", "stripes", "beewings"], stripe: "#2b2b33", voice: "buzz" },
    axolotl: { e: "🦎", body: "#ffb3d1", belly: "#ffe3ef", ear: "none", face: "none", nose: "smile", x: ["gills"], gill: "#ff5fa2", voice: "bubble" },
    capybara: { e: "🦫", body: "#b98458", belly: "#e3c3a0", ear: "small", face: "muzzle", nose: "big", x: ["sleepy"], voice: "hum" },
    redpanda: { e: "🦊", body: "#d9542b", belly: "#fff1e6", ear: "pointy", earIn: "#ffffff", face: "band", nose: "dot", voice: "squeak" },
    wolf: { e: "🐺", body: "#8d99ae", belly: "#edf0f5", ear: "pointy", earIn: "#edf0f5", face: "muzzle", nose: "dot", voice: "howl" },
    lynx: { e: "🐱", body: "#d6b48a", belly: "#fbf0e1", ear: "tufted", earIn: "#fbf0e1", face: "muzzle", nose: "dot", noseC: "#c26b5a", x: ["whiskers", "dots"], dotC: "#8a6a4a", voice: "purr" },
    beaver: { e: "🦫", body: "#8b5a3c", belly: "#d9b08c", ear: "small", face: "muzzle", nose: "dot", x: ["teeth", "whiskers"], voice: "chitter" },
    badger: { e: "🦡", body: "#6b6f7a", belly: "#f2f2f2", ear: "small", face: "band", faceC: "#ffffff", nose: "dot", voice: "growl" },
    mole: { e: "🐭", body: "#4a4550", belly: "#6c6674", ear: "none", face: "none", nose: "big", noseC: "#ff8fab", x: ["sleepy", "whiskers"], voice: "squeak" },
    bat: { e: "🦇", body: "#7b6d8d", belly: "#c9bedb", ear: "pointy", earBig: true, earIn: "#e6b3cc", face: "none", nose: "dot", x: ["fangs", "batwings"], voice: "chirp" },
    alpaca: { e: "🦙", body: "#f5e6d3", belly: "#fffaf3", ear: "long", earIn: "#e6c9a8", face: "none", nose: "dot", x: ["wool"], woolC: "#fff6ea", voice: "hum" },
    flamingo: { e: "🦩", body: "#ff8fb1", belly: "#ffd1df", ear: "none", face: "none", nose: "hook", beak: "#2b2b33", x: ["wings"], voice: "honk" },
    parrot: { e: "🦜", body: "#34c759", belly: "#ffd84a", ear: "none", face: "disk", faceC: "#ffffff", nose: "hook", beak: "#ffb020", x: ["crest", "wings"], crestC: "#ff3b30", voice: "squawk" },
    crocodile: { e: "🐊", body: "#5fae57", belly: "#d8f0c8", ear: "none", face: "none", nose: "smile", x: ["frogeyes", "teeth", "spikes"], spike: "#3f8a3a", voice: "croak" },
    dino: { e: "🦖", body: "#6ccf8a", belly: "#e1f7e7", ear: "none", face: "none", nose: "smile", x: ["spikes", "teeth"], spike: "#ff9f0a", voice: "roar" },
    pony: { e: "🐴", body: "#c7b8ff", belly: "#efe9ff", ear: "horse", earIn: "#ffb3c7", face: "muzzle", nose: "dot", x: ["mane"], maneC: "#ff8fd0", voice: "whinny" },
    goat: { e: "🐐", body: "#f2f2f2", belly: "#ffffff", ear: "floppy", earC: "#d9d9d9", face: "none", nose: "dot", x: ["horns", "beard"], voice: "baa" },
    moose: { e: "🫎", body: "#7a5230", belly: "#b98a5a", ear: "pointy", earIn: "#b98a5a", face: "muzzle", nose: "big", x: ["antlers"], antlerC: "#e9d2a8", voice: "moo" },
    arcticfox: { e: "🦊", body: "#f4f7fb", belly: "#ffffff", ear: "pointy", earIn: "#cfd8e6", face: "muzzle", nose: "dot", x: ["whiskers"], voice: "yip" },
    snowowl: { e: "🦉", body: "#f4f7fb", belly: "#ffffff", ear: "tufted", face: "disk", nose: "beak", beak: "#3a3a44", x: ["wings", "dots"], dotC: "#9aa6b8", voice: "hoot" },
    guineapig: { e: "🐹", body: "#e9a86b", belly: "#ffffff", ear: "small", earIn: "#ffb3c7", face: "patches", patchC: "#ffffff", nose: "dot", noseC: "#ff8fab", voice: "squeak" },
    bunny: { e: "🐇", body: "#b9835a", belly: "#f3dcc4", ear: "floppy", earC: "#9c6b43", face: "muzzle", nose: "dot", noseC: "#ff8fab", x: ["teeth"], voice: "boing" },
    chameleon: { e: "🦎", body: "#46c98b", belly: "#c9f5df", ear: "none", face: "none", nose: "smile", x: ["frogeyes", "crest"], crestC: "#ffcc00", voice: "click" },
    // Milstolpar
    elephant: { e: "🐘", body: "#a7b6cc", belly: "#dde5f0", ear: "elephant", earIn: "#f4c7d6", face: "none", nose: "trunk", voice: "trumpet" },
    kangaroo: { e: "🦘", body: "#d19a66", belly: "#f6dfc2", ear: "long", earIn: "#f6dfc2", face: "muzzle", nose: "dot", voice: "boing" },
    lion: { e: "🦁", body: "#f7c55a", belly: "#fff0c9", ear: "round", earIn: "#fff0c9", face: "muzzle", nose: "dot", noseC: "#b5654a", x: ["mane", "whiskers"], maneC: "#d9822b", voice: "roar" },
    tiger: { e: "🐯", body: "#ff9f43", belly: "#ffffff", ear: "round", earIn: "#ffffff", face: "muzzle", nose: "dot", noseC: "#ff7aa2", x: ["stripes", "whiskers"], stripe: "#2b2b33", voice: "roar" },
    panther: { e: "🐈‍⬛", body: "#3a3a48", belly: "#5a5a6a", ear: "pointy", earIn: "#ff9fb8", face: "none", nose: "dot", noseC: "#ff9fb8", eyeC: "#8be36a", x: ["whiskers"], voice: "purr" },
    polarbear: { e: "🐻‍❄️", body: "#f7f9fc", belly: "#ffffff", ear: "round", earIn: "#dfe6f0", face: "muzzle", faceC: "#ffffff", nose: "dot", voice: "growl" },
    peacock: { e: "🦚", body: "#2f7de1", belly: "#9fd3ff", ear: "none", face: "none", nose: "beak", beak: "#ffcc00", x: ["tailfan", "crest"], crestC: "#34c759", voice: "sparkle" },
    dragon: { e: "🐉", body: "#8fd16a", belly: "#f7f2b8", ear: "pointy", earIn: "#ffcc00", face: "none", nose: "smile", x: ["horns", "spikes", "batwings"], spike: "#ff9500", legendary: true, voice: "roar" },
    unicorn: { e: "🦄", body: "#ffffff", belly: "#fff5fb", ear: "horse", earIn: "#ffb3d9", face: "none", nose: "dot", noseC: "#ffb3d9", x: ["horn", "mane"], maneC: "#b983ff", legendary: true, voice: "sparkle" },
    phoenix: { e: "🐦‍🔥", body: "#ff6a3d", belly: "#ffd24a", ear: "none", face: "none", nose: "beak", beak: "#ffcc00", x: ["flames", "wings"], legendary: true, voice: "sparkle" },
  };

  // ---------- Djuren man kan få ----------
  const pets = [];
  const add = (id, species, name, source, extra) => pets.push(Object.assign({ id, species, name, source, e: S[species].e }, extra || {}));
  // Månadens djur (köp-nummer 1–12 = månad)
  [["penguin", "Pingvinen Pim"], ["fox", "Räven Frida"], ["hare", "Haren Hilda"], ["hedgehog", "Igelkotten Ivar"],
   ["koala", "Koalan Kiki"], ["turtle", "Sköldpaddan Sigge"], ["dolphin", "Delfinen Doris"], ["otter", "Uttern Otto"],
   ["owl", "Ugglan Ugo"], ["squirrel", "Ekorren Ella"], ["bear", "Björnen Bruno"], ["reindeer", "Renen Rolf"]]
    .forEach(([sp, name], i) => add(sp, sp, name, "month", { month: i, sku: i + 1 }));
  // Ur ägg (köp-nummer 13 och uppåt)
  [["cat", "Katten Misse"], ["dog", "Hunden Bosse"], ["mouse", "Musen Pip"], ["hamster", "Hamstern Hampus"],
   ["frog", "Grodan Grodis"], ["chick", "Kycklingen Kyckan"], ["duck", "Ankan Agda"], ["pig", "Grisen Nisse"],
   ["cow", "Kon Majken"], ["sheep", "Fåret Molly"], ["panda", "Pandan Pax"], ["raccoon", "Tvättbjörnen Rasmus"],
   ["giraffe", "Giraffen Gösta"], ["zebra", "Zebran Zelda"], ["sloth", "Sengångaren Sam"], ["seal", "Sälen Selma"],
   ["whale", "Valen Viggo"], ["octopus", "Bläckfisken Blixa"], ["ladybug", "Nyckelpigan Nora"], ["bee", "Biet Bella"],
   ["axolotl", "Axolotln Axel"], ["capybara", "Kapybaran Kaj"], ["redpanda", "Rödpandan Rudi"], ["wolf", "Vargen Vilja"],
   ["lynx", "Lodjuret Lo"], ["beaver", "Bävern Bengt"], ["badger", "Grävlingen Greta"], ["mole", "Mullvaden Molle"],
   ["bat", "Fladdermusen Fladdra"], ["alpaca", "Alpackan Paco"], ["flamingo", "Flamingon Flora"], ["parrot", "Papegojan Polly"],
   ["crocodile", "Krokodilen Kroko"], ["dino", "Dinosaurien Rex"], ["pony", "Ponnyn Pia"], ["goat", "Geten Gunnar"],
   ["moose", "Älgen Algot"], ["arcticfox", "Fjällräven Frost"], ["snowowl", "Snöugglan Snöa"], ["guineapig", "Marsvinet Mimmi"],
   ["bunny", "Kaninen Kanel"], ["chameleon", "Kameleonten Kamo"]]
    .forEach(([sp, name], i) => add(sp, sp, name, "egg", { sku: 13 + i, rarity: i % 7 === 6 ? "rare" : "common" }));
  // Milstolpar
  const MILESTONES = [
    ["elephant", "Elefanten Ellie", { kind: "cross", n: 1, text: "Lös ditt första korsord" }],
    ["kangaroo", "Kängurun Kenta", { kind: "streak", n: 7, text: "Öva 7 dagar i rad" }],
    ["tiger", "Tigern Tiko", { kind: "expert", n: 1, text: "Klara en omgång på Expert" }],
    ["polarbear", "Isbjörnen Isak", { kind: "trophy", n: 1, text: "Klara alla nivåer samma dag" }],
    ["peacock", "Påfågeln Paula", { kind: "perfect", n: 10, text: "10 omgångar med alla rätt" }],
    ["panther", "Pantern Pelle", { kind: "right", n: 500, text: "Svara rätt 500 gånger" }],
    ["lion", "Lejonet Leo", { kind: "streak", n: 30, text: "Öva 30 dagar i rad" }],
    ["unicorn", "Enhörningen Stella", { kind: "right", n: 2000, text: "Svara rätt 2 000 gånger" }],
    ["phoenix", "Fenixen Fia", { kind: "days", n: 100, text: "Öva 100 olika dagar" }],
    ["dragon", "Draken Drago", { kind: "streak", n: 100, text: "Öva 100 dagar i rad" }],
  ];
  MILESTONES.forEach(([sp, name, goal]) => add(sp, sp, name, "milestone", { goal, rarity: S[sp].legendary ? "legendary" : "epic" }));
  // Glittriga varianter av alla djur – sällsynta, bara ur ägg
  pets.slice().forEach((p) => add(p.id + "-glitter", p.species, `Glitter-${p.name.split(" ").slice(1).join(" ")}`, "glitter", { base: p.id, rarity: "glitter", glitter: true, typeName: p.name.split(" ")[0] }));

  const byId = Object.fromEntries(pets.map((p) => [p.id, p]));

  // ---------- Ritmotorn ----------
  const esc = (c) => String(c).replace(/[^#a-zA-Z0-9(),.% -]/g, "");
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
  }
  const GEAR = {
    scarf: (c) => `<path d="M30 82c10 8 50 8 60 0l3 7c-12 9-54 9-66 0z" fill="#ff3b30"/><path d="M74 86l6 18-9 1-3-16z" fill="#e0302a"/><path d="M36 86h4M48 88h4M60 89h4M72 88h4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`,
    bow: () => `<g transform="translate(86 26) rotate(18)"><path d="M0 0l-12-8v16zM0 0l12-8v16z" fill="#ff5fa2"/><circle r="4" fill="#ff2d87"/></g>`,
    glasses: () => `<g fill="#bfe3ff" fill-opacity=".25" stroke="#26262e" stroke-width="2.6"><circle cx="46" cy="54" r="10"/><circle cx="74" cy="54" r="10"/></g><path d="M56 53h8M36 52l-8-3M84 52l8-3" stroke="#26262e" stroke-width="2.6" stroke-linecap="round"/>`,
    hat: () => `<path d="M60 -2l16 30H44z" fill="#5856d6"/><path d="M52 14l14-5M48 22l20-7" stroke="#ffcc00" stroke-width="2.4"/><circle cx="60" cy="-2" r="5" fill="#ffcc00"/>`,
    crown: () => `<path d="M40 24l6-16 8 11 6-14 6 14 8-11 6 16z" fill="#ffcc00" stroke="#e0a800" stroke-width="1.5" stroke-linejoin="round"/><circle cx="60" cy="16" r="2.6" fill="#ff3b30"/><circle cx="47" cy="19" r="2" fill="#34c759"/><circle cx="73" cy="19" r="2" fill="#007aff"/>`,
  };
  const GEAR_LIST = [
    { id: "scarf", name: "Halsduk", level: 2 },
    { id: "bow", name: "Rosett", level: 3 },
    { id: "glasses", name: "Glasögon", level: 5 },
    { id: "hat", name: "Partyhatt", level: 7 },
    { id: "crown", name: "Krona", level: 10 },
  ];

  function svg(pet, opts) {
    opts = opts || {};
    const s = S[pet.species];
    const B = esc(s.body), L = esc(s.belly), D = shade(s.body, 0.72), ink = "#2b2630";
    const x = new Set(s.x || []);
    const eyeC = esc(s.eyeC || ink);
    let back = "", ears = "", head = "", face = "", top = "", front = "";
    // Bakom huvudet
    if (x.has("tailfan")) back += [0, 1, 2, 3, 4, 5, 6].map((i) => { const a = -150 + i * 20; const r = (a * Math.PI) / 180; const cx = 60 + Math.cos(r) * 46, cy = 70 + Math.sin(r) * 46; return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="10" ry="16" transform="rotate(${a + 90} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="#34c759"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="#2f7de1"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.4" fill="#ffcc00"/>`; }).join("");
    if (x.has("mane")) back += s.ear === "horse"
      ? `<path d="M60 16c-10 0-20 6-24 16 6-4 12-5 16-4-6 4-10 10-10 16 6-6 12-8 18-8z" fill="${esc(s.maneC)}"/>`
      : `<circle cx="60" cy="54" r="46" fill="${esc(s.maneC)}"/>` + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => { const r = (i / 12) * Math.PI * 2; return `<circle cx="${(60 + Math.cos(r) * 44).toFixed(1)}" cy="${(54 + Math.sin(r) * 42).toFixed(1)}" r="9" fill="${esc(s.maneC)}"/>`; }).join("");
    if (x.has("batwings")) back += `<path d="M30 80c-14-6-26-2-28 8 6-2 10 0 12 4 3-4 7-5 10-3 1-4 4-6 8-6z" fill="${D}"/><path d="M90 80c14-6 26-2 28 8-6-2-10 0-12 4-3-4-7-5-10-3-1-4-4-6-8-6z" fill="${D}"/>`;
    if (x.has("beewings")) back += `<ellipse cx="34" cy="76" rx="12" ry="8" fill="#e6f4ff" opacity=".85" transform="rotate(-30 34 76)"/><ellipse cx="86" cy="76" rx="12" ry="8" fill="#e6f4ff" opacity=".85" transform="rotate(30 86 76)"/>`;
    if (x.has("shell")) back += `<ellipse cx="60" cy="90" rx="38" ry="24" fill="${esc(s.shell)}"/><path d="M36 84l12-8 12 6 12-6 12 8M48 76v-4M72 76v-4M60 82v18" stroke="${shade(s.shell, 0.75)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    if (x.has("flames")) back += `<path d="M60 0c-6 10 4 12-4 22 10-2 6-12 14-16-2 8 6 10 2 20 8-6 6-16 0-26z" fill="#ffcc00"/><path d="M44 8c-2 8 4 10 0 18 6-2 4-8 8-12zM76 8c2 8-4 10 0 18-6-2-4-8-8-12z" fill="#ff9500"/>`;
    // Kropp
    let body = `<ellipse cx="60" cy="96" rx="28" ry="20" fill="${B}"/><ellipse cx="60" cy="100" rx="17" ry="13" fill="${L}"/>`;
    if (x.has("tentacles")) body = [0, 1, 2, 3, 4].map((i) => `<path d="M${36 + i * 12} 86c-2 10 -6 16 0 22 4 3 8 0 6-4" stroke="${B}" stroke-width="8" fill="none" stroke-linecap="round"/>`).join("") + `<ellipse cx="60" cy="88" rx="26" ry="12" fill="${B}"/>`;
    if (x.has("shell")) body = `<ellipse cx="42" cy="110" rx="8" ry="5" fill="${B}"/><ellipse cx="78" cy="110" rx="8" ry="5" fill="${B}"/>`;
    if (x.has("stripes") && pet.species === "bee") body += `<path d="M36 92h48M36 102h48" stroke="${esc(s.stripe)}" stroke-width="6"/>`;
    if (x.has("spots") && pet.species !== "giraffe") body += `<circle cx="42" cy="92" r="5" fill="${esc(s.spot || s.dotC || D)}"/><circle cx="78" cy="98" r="6" fill="${esc(s.spot || s.dotC || D)}"/>`;
    if (x.has("dots")) body += `<circle cx="46" cy="94" r="3.5" fill="${esc(s.dotC || D)}"/><circle cx="72" cy="90" r="3" fill="${esc(s.dotC || D)}"/><circle cx="64" cy="104" r="3" fill="${esc(s.dotC || D)}"/>`;
    const arms = esc(s.arms || D);
    if (!x.has("tentacles") && !x.has("shell")) body += `<ellipse cx="34" cy="92" rx="7" ry="10" fill="${arms}" transform="rotate(20 34 92)"/><ellipse cx="86" cy="92" rx="7" ry="10" fill="${arms}" transform="rotate(-20 86 92)"/><ellipse cx="47" cy="113" rx="9" ry="5" fill="${arms}"/><ellipse cx="73" cy="113" rx="9" ry="5" fill="${arms}"/>`;
    if (x.has("wings")) body += `<path d="M32 84c-8 6-10 16-4 22 4-6 8-10 10-18z" fill="${D}"/><path d="M88 84c8 6 10 16 4 22-4-6-8-10-10-18z" fill="${D}"/>`;
    // Öron
    const eIn = esc(s.earIn || L), eC = esc(s.earC || B);
    switch (s.ear) {
      case "round": { const r = s.earBig ? 16 : 11; ears = `<circle cx="${s.earBig ? 24 : 30}" cy="26" r="${r}" fill="${eC}"/><circle cx="${s.earBig ? 96 : 90}" cy="26" r="${r}" fill="${eC}"/><circle cx="${s.earBig ? 24 : 30}" cy="26" r="${r / 2}" fill="${eIn}"/><circle cx="${s.earBig ? 96 : 90}" cy="26" r="${r / 2}" fill="${eIn}"/>`; break; }
      case "pointy": { const h = s.earBig ? 30 : 22; ears = `<path d="M28 ${40 - h}L20 42l24-8z" fill="${eC}" stroke="${eC}" stroke-width="6" stroke-linejoin="round"/><path d="M92 ${40 - h}L100 42l-24-8z" fill="${eC}" stroke="${eC}" stroke-width="6" stroke-linejoin="round"/><path d="M29 ${46 - h}L25 38l14-5z" fill="${eIn}"/><path d="M91 ${46 - h}L95 38l-14-5z" fill="${eIn}"/>`; break; }
      case "tufted": ears = `<path d="M30 12L22 40l22-8z" fill="${eC}" stroke="${eC}" stroke-width="5" stroke-linejoin="round"/><path d="M90 12L98 40l-22-8z" fill="${eC}" stroke="${eC}" stroke-width="5" stroke-linejoin="round"/><path d="M30 12l-3-8M90 12l3-8" stroke="${D}" stroke-width="3" stroke-linecap="round"/><path d="M30 20L26 36l12-4z" fill="${eIn}"/><path d="M90 20L94 36l-12-4z" fill="${eIn}"/>`; break;
      case "long": ears = `<ellipse cx="44" cy="12" rx="8" ry="22" fill="${eC}" transform="rotate(-10 44 12)"/><ellipse cx="76" cy="12" rx="8" ry="22" fill="${eC}" transform="rotate(10 76 12)"/><ellipse cx="44" cy="14" rx="4" ry="15" fill="${eIn}" transform="rotate(-10 44 14)"/><ellipse cx="76" cy="14" rx="4" ry="15" fill="${eIn}" transform="rotate(10 76 14)"/>`; break;
      case "floppy": ears = `<ellipse cx="22" cy="52" rx="10" ry="20" fill="${eC}" transform="rotate(18 22 52)"/><ellipse cx="98" cy="52" rx="10" ry="20" fill="${eC}" transform="rotate(-18 98 52)"/>`; break;
      case "mouse": ears = `<circle cx="24" cy="24" r="17" fill="${eC}"/><circle cx="96" cy="24" r="17" fill="${eC}"/><circle cx="24" cy="24" r="10" fill="${eIn}"/><circle cx="96" cy="24" r="10" fill="${eIn}"/>`; break;
      case "small": ears = `<circle cx="32" cy="28" r="8" fill="${eC}"/><circle cx="88" cy="28" r="8" fill="${eC}"/><circle cx="32" cy="28" r="4" fill="${eIn}"/><circle cx="88" cy="28" r="4" fill="${eIn}"/>`; break;
      case "horse": ears = `<path d="M36 26l-4-18 14 12z" fill="${eC}" stroke="${eC}" stroke-width="4" stroke-linejoin="round"/><path d="M84 26l4-18-14 12z" fill="${eC}" stroke="${eC}" stroke-width="4" stroke-linejoin="round"/><path d="M37 22l-2-9 7 6z" fill="${eIn}"/><path d="M83 22l2-9-7 6z" fill="${eIn}"/>`; break;
      case "elephant": ears = `<ellipse cx="18" cy="54" rx="18" ry="24" fill="${eC}"/><ellipse cx="102" cy="54" rx="18" ry="24" fill="${eC}"/><ellipse cx="20" cy="54" rx="11" ry="16" fill="${eIn}"/><ellipse cx="100" cy="54" rx="11" ry="16" fill="${eIn}"/>`; break;
    }
    if (x.has("gills")) ears += [-1, 1].map((d) => [0, 1, 2].map((i) => `<path d="M${60 + d * 34} ${42 + i * 10}l${d * 16} ${-8 + i * 6}" stroke="${esc(s.gill)}" stroke-width="6" stroke-linecap="round"/>`).join("")).join("");
    if (x.has("horns")) ears += `<path d="M38 26c-4-8-2-16 4-18-1 6 1 11 5 14z" fill="#f4e3c1"/><path d="M82 26c4-8 2-16-4-18 1 6-1 11-5 14z" fill="#f4e3c1"/>`;
    if (x.has("antlers")) { const a = esc(s.antlerC || "#8a5a36"); ears += `<path d="M40 24c-4-8-6-14-4-20M38 14l-8-4M38 10l2-8M80 24c4-8 6-14 4-20M82 14l8-4M82 10l-2-8" stroke="${a}" stroke-width="5" stroke-linecap="round" fill="none"/>`; }
    if (x.has("ossicones")) ears += `<path d="M46 24V8M74 24V8" stroke="${D}" stroke-width="5" stroke-linecap="round"/><circle cx="46" cy="7" r="4.5" fill="#8a5a36"/><circle cx="74" cy="7" r="4.5" fill="#8a5a36"/>`;
    if (x.has("antenna")) ears += `<path d="M48 24c-4-8-8-12-12-14M72 24c4-8 8-12 12-14" stroke="#2b2b33" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="36" cy="10" r="4" fill="#2b2b33"/><circle cx="84" cy="10" r="4" fill="#2b2b33"/>`;
    if (x.has("spikes")) ears += `<path d="M22 50L14 38l14 2-4-14 14 8 2-16 10 12 6-16 6 16 10-12 2 16 14-8-4 14 14-2-8 12z" fill="${esc(s.spike || D)}"/>`;
    if (x.has("wool")) ears += [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => { const r = (i / 10) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(60 + Math.cos(r) * 34).toFixed(1)}" cy="${(50 + Math.sin(r) * 30).toFixed(1)}" r="12" fill="${esc(s.woolC || L)}"/>`; }).join("");
    if (x.has("mane") && s.ear === "horse") top += `<path d="M40 30c2-10 12-14 20-12 6-6 16-4 20 4-6-1-10 1-12 5-3-4-9-5-13-1-4-3-10-2-15 4z" fill="${esc(s.maneC)}"/><path d="M92 34c6 4 8 14 4 22" stroke="${esc(s.maneC)}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    if (x.has("horn")) top += `<path d="M60 -4l7 26H53z" fill="#ffd84a" stroke="#f5b800" stroke-width="1.5" stroke-linejoin="round"/><path d="M55 16l10-3M56 9l8-2" stroke="#f5b800" stroke-width="1.6"/>`;
    if (x.has("crest")) top += `<path d="M56 20c-2-8 2-14 6-16-1 5 1 8 4 10 1-4 4-6 7-6-3 3-3 8-3 12z" fill="${esc(s.crestC || D)}"/>`;
    if (x.has("fin")) top += `<path d="M58 20c4-10 12-14 18-14-6 6-6 12-4 16z" fill="${D}"/>`;
    if (x.has("spout")) top += `<path d="M60 18c0-8-6-10-10-8M60 18c0-8 6-10 10-8M60 18v-12" stroke="#7cc7ff" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="48" cy="9" r="3" fill="#7cc7ff"/><circle cx="72" cy="9" r="3" fill="#7cc7ff"/><circle cx="60" cy="4" r="3" fill="#7cc7ff"/>`;
    // Huvud
    const headC = esc(s.headC || B);
    head = `<ellipse cx="60" cy="54" rx="36" ry="32" fill="${headC}"/>`;
    if (x.has("stripes") && pet.species !== "bee") head += `<path d="M60 23v10M50 25l2 8M70 25l-2 8M25 48h8M25 58h7M95 48h-8M95 58h-7" stroke="${esc(s.stripe)}" stroke-width="3.5" stroke-linecap="round"/>`;
    if (x.has("spots") && pet.species === "giraffe") head += `<circle cx="36" cy="38" r="5" fill="${esc(s.spot)}"/><circle cx="84" cy="36" r="4" fill="${esc(s.spot)}"/><circle cx="80" cy="72" r="3.5" fill="${esc(s.spot)}"/>`;
    if (x.has("spots") && pet.species === "cow") head += `<ellipse cx="38" cy="40" rx="9" ry="7" fill="${esc(s.spot)}"/>`;
    if (x.has("dots") && pet.species === "ladybug") head += "";
    // Ansikte
    const fC = esc(s.faceC || L);
    switch (s.face) {
      case "muzzle": face += `<ellipse cx="60" cy="67" rx="17" ry="12" fill="${fC}"/>`; break;
      case "heart": face += `<path d="M60 36c-8-10-30-8-30 12 0 18 16 32 30 32s30-14 30-32c0-20-22-22-30-12z" fill="${fC}"/>`; break;
      case "disk": face += `<circle cx="46" cy="54" r="13" fill="${fC}"/><circle cx="74" cy="54" r="13" fill="${fC}"/>`; break;
      case "patches": face += `<ellipse cx="45" cy="54" rx="10" ry="12" fill="${esc(s.patchC || "#26262e")}" transform="rotate(-20 45 54)"/><ellipse cx="75" cy="54" rx="10" ry="12" fill="${esc(s.patchC || "#26262e")}" transform="rotate(20 75 54)"/>`; break;
      case "mask": face += `<path d="M26 52c8-10 22-8 34 0 12-8 26-10 34 0-6 10-20 12-34 6-14 6-28 4-34-6z" fill="${esc(s.maskC || "#3a3a44")}"/><ellipse cx="60" cy="68" rx="14" ry="10" fill="${L}"/>`; break;
      case "band": face += `<path d="M60 24c6 10 6 22 0 30-6-8-6-20 0-30z" fill="${fC}"/><ellipse cx="60" cy="68" rx="16" ry="11" fill="${fC}"/><circle cx="40" cy="64" r="6" fill="${fC}"/><circle cx="80" cy="64" r="6" fill="${fC}"/>`; break;
    }
    // Ögon
    const eyeY = 54;
    if (x.has("frogeyes")) face += `<circle cx="44" cy="30" r="12" fill="${B}"/><circle cx="76" cy="30" r="12" fill="${B}"/>`;
    const ey = x.has("frogeyes") ? 30 : eyeY;
    if (x.has("sleepy")) face += `<g class="pet-eyes"><path d="M40 ${ey}q6 5 12 0M68 ${ey}q6 5 12 0" stroke="${eyeC}" stroke-width="3.2" fill="none" stroke-linecap="round"/></g>`;
    else face += `<g class="pet-eyes"><ellipse cx="46" cy="${ey}" rx="6.5" ry="7.5" fill="${eyeC === ink ? ink : "#1b1b22"}"/><ellipse cx="74" cy="${ey}" rx="6.5" ry="7.5" fill="${eyeC === ink ? ink : "#1b1b22"}"/>${eyeC !== ink ? `<ellipse cx="46" cy="${ey}" rx="4.5" ry="6" fill="${eyeC}"/><ellipse cx="74" cy="${ey}" rx="4.5" ry="6" fill="${eyeC}"/><ellipse cx="46" cy="${ey}" rx="1.6" ry="5" fill="#1b1b22"/><ellipse cx="74" cy="${ey}" rx="1.6" ry="5" fill="#1b1b22"/>` : ""}
      <circle cx="48.5" cy="${ey - 3}" r="2.6" fill="#fff"/><circle cx="76.5" cy="${ey - 3}" r="2.6" fill="#fff"/><circle cx="44" cy="${ey + 3}" r="1.2" fill="#fff"/><circle cx="72" cy="${ey + 3}" r="1.2" fill="#fff"/></g>`;
    // Kinder
    face += `<ellipse cx="34" cy="68" rx="6.5" ry="4" fill="#ff7a8a" opacity=".45"/><ellipse cx="86" cy="68" rx="6.5" ry="4" fill="#ff7a8a" opacity=".45"/>`;
    if (x.has("cheeks")) face += `<circle cx="32" cy="70" r="9" fill="${L}"/><circle cx="88" cy="70" r="9" fill="${L}"/><ellipse cx="32" cy="70" rx="5" ry="3" fill="#ff7a8a" opacity=".45"/><ellipse cx="88" cy="70" rx="5" ry="3" fill="#ff7a8a" opacity=".45"/>`;
    // Nos och mun
    const nC = esc(s.noseC || ink), bk = esc(s.beak || "#ff9f0a");
    const mouth = `<path d="M54 70q3 4 6 0q3 4 6 0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    switch (s.nose) {
      case "dot": face += `<path d="M55 62q5-3 10 0q-1 5-5 6q-4-1-5-6z" fill="${nC}"/>` + mouth; break;
      case "big": face += `<ellipse cx="60" cy="64" rx="9" ry="6.5" fill="${esc(s.noseC || "#3a3440")}"/><ellipse cx="57" cy="62" rx="2.6" ry="1.6" fill="#fff" opacity=".5"/>` + `<path d="M55 74q5 4 10 0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`; break;
      case "beak": face += `<path d="M52 62l8-4 8 4-8 9z" fill="${bk}"/><path d="M52 62l8 3 8-3" stroke="${shade(s.beak || "#ff9f0a", 0.8)}" stroke-width="1.4" fill="none"/>`; break;
      case "hook": face += `<path d="M52 60q8-6 16 0q2 8-6 14q2-6-2-8q-6 0-8-6z" fill="${bk}"/>`; break;
      case "duck": face += `<ellipse cx="60" cy="67" rx="14" ry="7" fill="${bk}"/><path d="M48 67q12 4 24 0" stroke="${shade(s.beak || "#ffb020", 0.8)}" stroke-width="1.6" fill="none"/>`; break;
      case "snout": face += `<ellipse cx="60" cy="67" rx="12" ry="9" fill="${esc(s.snoutC || shade(s.body, 0.9))}"/><ellipse cx="55.5" cy="67" rx="2.3" ry="3.2" fill="${shade(s.body, 0.55)}"/><ellipse cx="64.5" cy="67" rx="2.3" ry="3.2" fill="${shade(s.body, 0.55)}"/>`; break;
      case "smile": face += `<path d="M46 68q14 12 28 0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M52 71q8 7 16 0z" fill="#ff7a8a" opacity=".7"/>`; break;
      case "trunk": face += `<path d="M60 60c0 14-2 24 6 30 6 4 12 0 12-6" stroke="${B}" stroke-width="12" fill="none" stroke-linecap="round" class="pet-trunk"/><path d="M60 60c0 14-2 24 6 30 6 4 12 0 12-6" stroke="${D}" stroke-width="2" stroke-dasharray="2 5" fill="none" stroke-linecap="round" opacity=".5"/><path d="M47 70q4 3 7 1M73 70q-4 3-7 1" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`; break;
    }
    if (x.has("teeth")) face += `<rect x="56.5" y="${s.nose === "smile" ? 69 : 72}" width="7" height="5.5" rx="1.5" fill="#fff" stroke="#e6e6e6" stroke-width=".8"/>`;
    if (x.has("fangs")) face += `<path d="M55 72l2 4 2-4M61 72l2 4 2-4" fill="#fff"/>`;
    if (x.has("whiskers")) face += `<path d="M40 66l-14-2M40 70l-13 3M80 66l14-2M80 70l13 3" stroke="${ink}" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>`;
    if (x.has("beard")) face += `<path d="M54 80q6 12 12 0z" fill="#e6e6e6"/>`;
    // Accessoar
    const gear = opts.gear && GEAR[opts.gear] ? GEAR[opts.gear]() : "";
    const gearBehind = opts.gear === "scarf" ? gear : "";
    const gearFront = opts.gear && opts.gear !== "scarf" ? gear : "";
    // Glitter: glittrande stjärnor runt djuret
    const sparkle = pet.glitter ? `<g class="pet-sparkles"><path d="M14 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffd84a"/><path d="M104 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" /><path d="M100 96l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#ffd84a"/></g>` : "";
    const cls = ["pet-svg", pet.glitter ? "glitter" : "", opts.cls || ""].join(" ").trim();
    return `<svg class="${cls}" viewBox="-6 -8 132 132" aria-hidden="true"><g class="pet-bob">${back}${ears}${body}${gearBehind}${head}${face}${top}${gearFront}</g>${sparkle}</svg>`;
  }

  // ---------- Röster ----------
  // Varje art har en egen röst som spelas upp (syntetiserat, inga ljudfiler) när du klarar något.
  const VOICE_NAMES = {
    trumpet: "trumpetar", meow: "jamar", woof: "skäller glatt", hoot: "hoar", chirp: "kvittrar", squeak: "piper",
    croak: "kväker", growl: "brummar", boing: "skuttar", purr: "spinner", bubble: "bubblar", honk: "snattrar",
    moo: "råmar", baa: "bräker", oink: "nöffar", buzz: "surrar", roar: "ryter", sparkle: "glittrar", click: "klickar",
    howl: "ylar", yip: "gläfser", chitter: "kvittrar", hum: "nynnar", whinny: "gnäggar", yawn: "gäspar",
    arf: "skäller", song: "sjunger", tick: "tickar", squawk: "skriar", monkey: "tjoar",
  };

  const api = { S, pets, byId, svg, GEAR, GEAR_LIST, VOICE_NAMES, MILESTONES };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DAGSPROV_PETS = api;
})(typeof window !== "undefined" ? window : globalThis);
