# HP-Korsord

Ett nytt korsord varje dag med över 2 000 ord från högskoleprovets ORD-del – upplagt som sudokuaday.com. Ledtrådarna är synonymer eller korta förklaringar, precis som på provet. Dagens korsord räknas fram ur datumet, så alla får samma korsord samma dag.

## Funktioner

- Tre nya korsord varje dag (Lätt / Medel / Svår), med pilar för att bläddra mellan dagar
- Arkiv med kalender där du ser vilka dagar du löst och kan spela missade korsord
- Timer med paus, och en svit (🔥 dagar i rad) i statistiken
- Skriv med iPhonens/iPadens eget tangentbord eller ett externt tangentbord som Magic Keyboard (piltangenter, Tab/Enter för nästa ord, mellanslag byter riktning, ⌘Z ångrar)
- Fem lägen: **Korsord**, **Ord** (som ORD-delen: ett ord och fem betydelser, A–E), **Meningar** (meningskomplettering som i MEK-delen), **Engelska** (som ELF-delen: ordförråd och meningar med luckor) och **Matte** (XYZ- och KVA-uppgifter). En ny omgång varje dag på tre nivåer
- Matte genereras varje dag med nya siffror: 26 uppgiftstyper i XYZ-, KVA- och NOG-stil (procent, bråk, ekvationer, statistik, geometri, potenser, algebra, funktioner, sannolikhet m.m.). Knappen 💡 Visa hur man tänker visar lösningen steg för steg. Rätt svar inom 10 sekunder utan hjälp ger ⚡ blixtsvar
- Statistik med diagram: aktivitet senaste två veckorna, profil per del (radardiagram), träffsäkerhet per matteområde, ord att repetera och förslag på vad du bör öva på
- Innehåll: 2 365 HP-ord, 188 MEK-frågor, 118 engelska meningar och 481 engelska ord
- Visa fel: per ord (standard – rätt eller fel visas först när ordet är ifyllt), direkt eller av. Ord som visats som rätt låses
- Stilval: fyra rutformer (Rundad, Bubblor, Mjuk, Klassisk), sex färgteman och fyra typsnitt
- Flikrad i botten på iPhone som i iOS-appar
- Fokusläge på iPhone: när tangentbordet är uppe får rutnätet hela bredden och skrollar till ordet, och ledtrådskortet visar hela ledtråden och ordets bokstäver
- Ordlista med sökning och Dagens ord
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
