# HP-Korsord

Ett nytt korsord varje dag med ord från högskoleprovets ORD-del – upplagt som sudokuaday.com. Ledtrådarna är synonymer eller korta förklaringar, precis som på provet. Dagens korsord räknas fram ur datumet, så alla får samma korsord samma dag.

## Funktioner

- Tre nya korsord varje dag (Lätt / Medel / Svår), med pilar för att bläddra mellan dagar
- Arkiv med kalender där du ser vilka dagar du löst och kan spela missade korsord
- Timer med paus, och en svit (🔥 dagar i rad) i statistiken
- Svenskt tangentbord med Å, Ä och Ö på mobilen, och vanligt tangentbord på datorn (piltangenter, Tab/Enter för nästa ord, mellanslag byter riktning)
- Hjälp: kontrollera, visa bokstav, visa ord, rensa eller ge upp
- En ordlista med alla ord och deras betydelser när korsordet är klart
- Statistik: lösta korsord, lösta utan hjälp, bästa tid och antal HP-ord
- Sparar varje dags korsord automatiskt, även halvfärdiga
- Mörkt läge, går att lägga till på hemskärmen och fungerar offline

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
