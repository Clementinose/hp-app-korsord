# HP-Korsord

Ett korsord med ord från högskoleprovets ORD-del. Ledtrådarna är synonymer eller korta förklaringar, precis som på provet, och varje nytt korsord skapas slumpmässigt av ordlistan.

## Funktioner

- Nytt korsord varje gång, i tre svårighetsgrader (Lätt / Medel / Svår)
- Svenskt tangentbord med Å, Ä och Ö på mobilen, och vanligt tangentbord på datorn (piltangenter, Tab/Enter för nästa ord, mellanslag byter riktning)
- Hjälp: kontrollera, visa bokstav, visa ord eller ge upp
- En ordlista med alla ord och deras betydelser när korsordet är klart
- Statistik: lösta korsord, lösta utan hjälp och bästa tid
- Sparar pågående korsord automatiskt
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
