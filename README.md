# HP-Korsord

Ett nytt korsord varje dag med över 1 400 ord från högskoleprovets ORD-del – upplagt som sudokuaday.com. Ledtrådarna är synonymer eller korta förklaringar, precis som på provet. Dagens korsord räknas fram ur datumet, så alla får samma korsord samma dag.

## Funktioner

- Tre nya korsord varje dag (Lätt / Medel / Svår), med pilar för att bläddra mellan dagar
- Arkiv med kalender där du ser vilka dagar du löst och kan spela missade korsord
- Timer med paus, och en svit (🔥 dagar i rad) i statistiken
- Skriv med iPhonens/iPadens eget tangentbord eller ett externt tangentbord som Magic Keyboard (piltangenter, Tab/Enter för nästa ord, mellanslag byter riktning, ⌘Z ångrar)
- Två lägen: **Korsord** och **Meningar** (meningskomplettering som i MEK-delen, med en ny omgång varje dag på tre nivåer)
- Visa fel: av, per ord (när ordet är ifyllt) eller direkt. Ord som visats som rätt låses
- Svarsalternativ A–E som på högskoleprovet (slå på under Inställningar): välj rätt ord bland fem lika långa (ordets längd visas inte), eller tryck 1–5 på tangentbordet
- Inställningar för att visa fel direkt och för att visa eller dölja tiden
- Animationer: rutnätet byggs upp, bokstäver poppar in, rätt ord blinkar grönt, fel bokstav skakar och konfetti när korsordet är löst
- Verktyg som i en sudoku-app: ångra, sudda, kontrollera, tips, visa ord, börja om eller ge upp
- En ordlista med alla ord och deras betydelser när korsordet är klart
- Statistik: lösta korsord, lösta utan hjälp, bästa tid och antal HP-ord
- Sparar varje dags korsord automatiskt, även halvfärdiga
- Minimal design i iOS-stil som anpassar sig efter iPhone (stående och liggande), iPad (även delad skärm) och dator
- Ljust och mörkt läge: följer systemet eller väljs under Inställningar
- Beter sig som en app: lägg den på hemskärmen (Dela → Lägg till på hemskärmen) så öppnas den i helskärm med egen ikon och fungerar helt utan nät

## Kör lokalt

Inga beroenden, bara statiska filer. Öppna `index.html` direkt, eller starta en server:

```sh
python3 -m http.server 8000
# öppna http://localhost:8000
```

## Publicera

Aktivera **GitHub Pages** (Settings → Pages → Deploy from a branch, välj branch och `/ (root)`). Då ligger appen på `https://<användare>.github.io/hp-app-korsord/`.

## Lägg till fler ord

Orden finns i [`js/words.js`](js/words.js) som `["ORD", "ledtråd"]`. Skriv ordet i versaler (Å, Ä och Ö går bra) och utan mellanslag.

Obs: om du ändrar ordlistan kan dagarnas korsord bli andra än förut. Sparade framsteg för ett korsord som ändrats nollställs då.
