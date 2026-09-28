// Kopierar webbappens filer till www/ – mappen som Capacitor bygger in i iOS-appen.
// Allt körs lokalt i appen; service workern behövs inte där och registreras inte.
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";

const FILES = [
  "index.html", "style.css", "manifest.webmanifest", "privacy.html", "support.html",
  "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "js",
];
rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const f of FILES) {
  if (!existsSync(f)) throw new Error(`Saknar ${f}`);
  cpSync(f, `www/${f}`, { recursive: true });
}
console.log("Klart: www/ innehåller", FILES.length, "filer och mappar.");
