# Dagsprov

Öva inför högskoleprovet varje dag. Ett nytt korsord varje dag med över 2 300 egenskrivna ordförklaringar av den typ som förekommer i högskoleprovets ORD-del – med dagliga pussel på samma sätt som populära sajter för dagliga sudokun. Ledtrådarna är synonymer eller korta förklaringar, precis som på provet. Dagens korsord räknas fram ur datumet, så alla får samma korsord samma dag.

## Funktioner

- Tre nya korsord varje dag (Lätt / Medel / Svår), med pilar för att bläddra mellan dagar
- Arkiv med kalender där du ser vilka dagar du löst och kan spela missade korsord
- Timer med paus, och en svit (🔥 dagar i rad) i statistiken
- Skriv med iPhonens/iPadens eget tangentbord eller ett externt tangentbord som Magic Keyboard (piltangenter, Tab/Enter för nästa ord, mellanslag byter riktning, ⌘Z ångrar)
- Fem lägen: **Korsord**, **Ord** (som ORD-delen: ett ord och fem betydelser, A–E), **Meningar** (meningskomplettering som i MEK-delen), **Engelska** (som ELF-delen: ordförråd och meningar med luckor) och **Matte** (XYZ-, KVA- och NOG-uppgifter). En ny omgång varje dag på fyra nivåer
- Matte genereras varje dag med nya siffror: 32 uppgiftstyper i XYZ-, KVA- och NOG-stil (procent, bråk, ekvationer, statistik, geometri, potenser, algebra, funktioner, sannolikhet m.m.). Knappen 💡 Visa hur man tänker visar lösningen steg för steg. Rätt svar inom 10 sekunder utan hjälp ger ⚡ blixtsvar
- Statistik med diagram: aktivitet senaste två veckorna, profil per del (radardiagram), träffsäkerhet per matteområde, ord att repetera och förslag på vad du bör öva på
- Inställningar som i iOS med undersidor: utseende med förhandsvisning (tema, färg, rutor, bokstäver, textstorlek), visa fel, hoppa över ifyllda rutor, nästa fråga automatiskt, förklaringar, blixtsvarstid, ljudeffekter, haptik, minska rörelse, säkerhetskopia (exportera/återställ) och nollställning
- Ark kan dras ner för att stängas och undersidor i inställningarna kan svepas tillbaka från vänsterkanten
- Fyra nivåer i alla lägen: Lätt, Medel, Svår och **Expert** – orden har svårighetsnivåer 1–4, och Expert använder ovanliga ord, de svåraste meningarna och fler KVA/NOG
- **Dagens ord** med betydelse, egenskriven exempelmening, vändbart kort, delning och tidigare dagars ord
- Pokal när alla nivåer i ett läge är klara samma dag
- Produktionsklar: uppdateringsbanner när en ny version finns, felåterställning, kontroll av gamla webbläsare, säkerhetspolicy (CSP), tillgänglighetsetiketter
- Innehåll: 2 987 HP-ord (varav 622 expertord), 224 dagens ord med exempelmeningar, 188 MEK-frågor, 118 engelska meningar och 481 engelska ord
- Kan paketeras för App Store med Capacitor – se [APP_STORE.md](APP_STORE.md)
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

## Rättigheter, integritet och ansvar

- **Fristående.** Dagsprov har ingen koppling till, och är inte godkänt av, Universitets- och högskolerådet (UHR), som anordnar högskoleprovet. Namnet högskoleprovet används bara för att beskriva vad appen övar inför.
- **Eget innehåll.** Alla ledtrådar, MEK-meningar, engelska uppgifter och förklaringar är egenskrivna, och matteuppgifterna genereras av appen. Inga frågor är hämtade från publicerade högskoleprov; appen följer bara provdelarnas upplägg.
- **Inga tredjepartsresurser.** Ikoner och grafik är egenritade. Appen laddar inga typsnitt, skript eller bilder från andra webbplatser och använder enhetens systemtypsnitt.
- **Integritet.** Ingen inloggning, ingen analys, ingen spårning, inga annonser och inga cookies från tredje part. Framsteg och inställningar sparas bara lokalt i webbläsarens lagring (nödvändigt för att appen ska fungera) och skickas aldrig till någon server. GitHub Pages kan som webbhotell registrera tekniska uppgifter som IP-adress enligt GitHubs integritetspolicy. Allt kan raderas med *Nollställ alla framsteg* eller genom att rensa webbplatsdata.
- **Varumärken.** Apple, iPhone, iPad och Magic Keyboard är varumärken som tillhör Apple Inc. och nämns bara för att beskriva vilka enheter appen fungerar på.
- **Licens.** Alla rättigheter förbehållna – se [LICENSE](LICENSE). Appen får användas gratis via webbplatsen för eget studiebruk, men koden och innehållet får inte kopieras eller återanvändas utan tillstånd.
- Samma information finns i appen under Inställningar → Integritet och Villkor och ansvar.

### Om appen byggs ut

Appen behöver i dag ingen cookie-banner eller samtyckesruta eftersom den inte samlar in något. Det ändras om något av följande läggs till – då krävs samtycke **innan** datan samlas in och en utförligare integritetspolicy med kontaktuppgifter till den som ansvarar:

- statistik- eller analysverktyg (till exempel Google Analytics),
- reklam eller spårningspixlar,
- inloggning, konton eller synk mellan enheter,
- typsnitt, skript eller bilder som hämtas från andra webbplatser (till exempel Google Fonts), eftersom de skickar besökarens IP-adress vidare.

Uppdatera i så fall också sidorna Integritet och Villkor och ansvar i appen.
