# Lägga ut Dagsprov på App Store

Dagsprov är en webbapp. För att komma in på App Store paketeras den som en riktig iOS-app med
[Capacitor](https://capacitorjs.com). Alla filer byggs in i appen, så den fungerar helt utan internet.
Konfigurationen finns redan i repot (`package.json`, `capacitor.config.json` och `scripts/build-www.mjs`).

## Det här behöver du

- En Mac med den senaste versionen av **Xcode** (gratis i Mac App Store).
- **Node.js** 20 eller senare.
- Ett **Apple Developer Program**-medlemskap (99 USD per år): <https://developer.apple.com/programs/>.
- Om du är under 18 år måste en förälder eller vårdnadshavare stå för avtalet med Apple.

## Bygga appen

```bash
npm install
npx cap add ios      # bara första gången – skapar mappen ios/
npm run ios          # bygger www/, synkar och öppnar projektet i Xcode
```

I Xcode:

1. Välj projektet **App** → **Signing & Capabilities** → välj ditt team. Bundle ID är `com.clementinose.dagsprov`
   (ändra i `capacitor.config.json` om du vill ha ett annat – det måste vara unikt och kan inte bytas efter publicering).
2. **App Icon**: dra in `icon-1024.png` i `Assets.xcassets → AppIcon` (1024 × 1024, utan genomskinlighet).
3. **Info.plist**: lägg till `ITSAppUsesNonExemptEncryption` = `NO` (appen använder ingen egen kryptering).
4. **General → Minimum Deployments**: iOS 16.4.
5. Kör på en riktig iPhone och iPad och testa alla lägen, inställningar, säkerhetskopia och delning.
6. **Product → Archive** och sedan **Distribute App → App Store Connect**.

Efter ändringar i webbappen: kör `npm run sync` och bygg igen i Xcode.

## App Store Connect – uppgifter att fylla i

| Fält | Förslag |
|---|---|
| Namn | Dagsprov |
| Underrubrik | Korsord, ord, engelska och matte |
| Kategori | Utbildning (andra: Ord) |
| Pris | Gratis |
| Åldersgräns | 4+ (inga känsliga inslag) |
| Upphovsrätt | © 2026 Clementinose |
| Supportadress | `https://clementinose.github.io/hp-app-korsord/support.html` |
| Integritetspolicy | `https://clementinose.github.io/hp-app-korsord/privacy.html` |

Kontrollera att adresserna öppnas innan du skickar in appen (GitHub Pages måste vara aktiverat för repot).

**Nyckelord** (max 100 tecken, kommaseparerade):
`högskoleprov,ordförråd,korsord,synonymer,engelska,matte,plugg,övning,ord,meningar,studier`

**Beskrivning** (förslag):

> Dagsprov hjälper dig att öva inför högskoleprovet varje dag – en stund i taget.
>
> • Korsord med ord och ledtrådar av den typ som kommer på ORD-delen
> • Ord: ett ord och fem betydelser, som på provet
> • Meningar: meningskomplettering i MEK-stil
> • Engelska: ordförråd och meningar i ELF-stil
> • Matte: nya XYZ-, KVA- och NOG-uppgifter varje dag, med lösning steg för steg
> • Fyra nivåer: Lätt, Medel, Svår och Expert
> • Dagens ord med exempelmening
> • Statistik som visar vad du bör öva på
> • Fungerar utan internet, med ljust och mörkt läge
>
> Inga konton, ingen reklam och ingen datainsamling – allt sparas bara på din enhet.
>
> Dagsprov är ett fristående övningsverktyg och har ingen koppling till Universitets- och högskolerådet (UHR).
> Alla uppgifter är egenskrivna och inte hämtade från riktiga prov.

**App Privacy (integritetsetiketten):** välj **Data Not Collected**. Appen samlar inte in något, har
ingen analys eller reklam och skickar inget till någon server.

**Skärmdumpar:** minst iPhone 6,9" (1320 × 2868) och iPad 13" (2064 × 2752). Ta dem i simulatorn
(⌘S) i ljust läge, till exempel av korsordet, Ord, Matte med steg-för-steg, Dagens ord och statistiken.

**Anteckning till granskaren** (App Review Information → Notes):

> Dagsprov is a free, offline study app for the Swedish university entrance exam (högskoleprovet).
> It contains daily crosswords, vocabulary, sentence completion, English and math practice with
> step-by-step solutions, four difficulty levels, a word of the day and statistics. No account,
> no ads, no data collection. All content is original and bundled in the app.

## Juridisk checklista

- [x] Inget innehåll är kopierat från riktiga högskoleprov – allt är egenskrivet eller genererat.
- [x] Appen säger tydligt att den inte har någon koppling till UHR (hjälp, inställningar, support, beskrivning).
- [x] Inga tredjepartsresurser: inga externa typsnitt, skript, bilder, SDK:er eller spårning.
- [x] Integritetspolicy och supportsida finns (`privacy.html`, `support.html`) och i appen.
- [x] Ingen datainsamling → "Data Not Collected", ingen samtyckesruta behövs.
- [x] Inga köp, prenumerationer eller annonser.
- [x] Licens: alla rättigheter förbehållna (`LICENSE`).
- [ ] Undvik ordet "högskoleprovet" och förkortningen "HP" i **appnamnet** och i skärmdumparnas rubriker –
      använd det bara beskrivande i texten, som ovan. Det minskar risken för varumärkesfrågor och
      att appen uppfattas som officiell.
- [ ] Kontrollera att ingen annan app redan heter "Dagsprov" (sök i App Store och hos PRV) innan du registrerar namnet.

## Vanliga orsaker till avslag – och hur Dagsprov möter dem

- **4.2 Minimum functionality** (appen får inte bara vara en inpackad webbsida): Dagsprov fungerar helt
  offline, har egna lägen, haptik, ljud, statistik och inställningar som i en riktig app.
  Beskriv gärna detta i anteckningen till granskaren.
- **2.1 App completeness:** testa alla lägen och nivåer på riktig enhet innan inskick.
- **5.1.1 Privacy:** integritetspolicyn måste gå att öppna från både App Store och appen – det gör den.
