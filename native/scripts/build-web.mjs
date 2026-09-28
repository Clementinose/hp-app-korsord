// Bygger ihop webbappen (index.html, style.css och js/*) till EN html-sträng som appen visar
// i en WebView. Allt ligger alltså inbyggt i appen och fungerar utan internet.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(root, f), "utf8");

let html = read("index.html");
// Byt ut länkade filer mot inbäddat innehåll.
html = html.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${read("style.css")}\n</style>`);
html = html.replace(/<script src="(js\/[a-z]+\.js)"><\/script>/g, (_, f) => `<script>\n${read(f).replace(/<\/script/gi, "<\\/script")}\n</script>`);
// Ikoner som bilder i appen (inbäddade som data-URL), manifest och ikonlänkar behövs inte.
const png = "data:image/png;base64," + readFileSync(join(root, "icon-180.png")).toString("base64");
html = html.replace(/src="icon-180.png"/g, `src="${png}"`);
html = html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, "");
// Säkerhetspolicy för appen: allt är inbäddat, så inget får hämtas utifrån alls.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "app-html.js");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `// Genereras av scripts/build-web.mjs – ändra inte för hand.\nexport default ${JSON.stringify(html)};\n`);
// Samma priser och provdagar i appskalet (för säsongspassets giltighet).
const require_ = (await import("node:module")).createRequire(import.meta.url);
const config = require_(join(root, "js", "config.js"));
writeFileSync(join(dirname(out), "config.js"), `// Genereras från js/config.js – ändra där.\nexport const hpDates = ${JSON.stringify(config.hpDates)};\nexport const seasonFallbackDays = ${config.seasonFallbackDays};\nexport const products = ${JSON.stringify(config.products)};\n`);
console.log(`Klart: web/app-html.js (${Math.round(html.length / 1024)} kB)`);
