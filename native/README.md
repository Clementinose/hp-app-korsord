# Dagsprov – appen för iOS och Android (Expo)

Den här mappen är ett litet Expo-skal runt webbappen i repots rot. Webbappen byggs ihop till en
enda html-sträng och visas i en WebView, så allt ligger inbyggt och fungerar utan internet.
Skalet lägger till det som bara en riktig app kan:

- **Belöningsreklam (AdMob)** – bara när användaren själv väljer "Titta på en kort film".
- **Dagsprov Plus** – köp via App Store och Google Play, skött av **RevenueCat**.
- **Googles samtyckesdialog (UMP)** för EU/EES.
- **Riktig haptik** och att externa länkar öppnas i webbläsaren.

Med **EAS Build** byggs iOS-appen i molnet – du behöver ingen Mac.

## 1. Förberedelser

- Node.js 20 eller senare.
- Ett gratis konto på [expo.dev](https://expo.dev) och `npm install -g eas-cli`, sedan `eas login`.
- **Apple Developer Program** (99 USD/år) för iOS och **Google Play Console** (25 USD en gång) för Android.
  Är du under 18 måste en vårdnadshavare stå för avtalen.
- Ett **AdMob-konto** på [admob.google.com](https://admob.google.com). Skapa en app för iOS och en för
  Android, och i varje app en annonsenhet av typen **Belöning (Rewarded)**.

## 2. Installera

```bash
cd native
npm install
npx expo install --fix     # sätter versioner som passar varandra
npm run build:web          # bygger web/app-html.js från webbappen
```

## 3. Lägg in dina AdMob-uppgifter

- `app.json` → `androidAppId` och `iosAppId` (app-id:n, de med `~`). Nu står Googles test-id:n där.
- `App.js` → `REWARDED_UNIT` (annonsenheternas id:n, de med `/`).

I utvecklingsläge används alltid Googles testannonser. Klicka aldrig på dina egna riktiga annonser –
då kan AdMob-kontot stängas av.

## 3b. Dagsprov Plus med RevenueCat

1. **App Store Connect → din app**: skapa (priserna står i `js/config.js` – ett ställe):
   - Prenumerationsgruppen *Dagsprov Plus* med ett automatiskt förnyat abonnemang `dagsprov_plus_annual`
     (1 år, 199 kr, introduktionserbjudande *Gratis provperiod 1 vecka*).
   - **Säsongspass** `dagsprov_season` (79 kr) som *Non-Consumable* eller *Non-Renewing Subscription*.
     Det gäller till och med nästa provdag efter köpet (provdagarna står i `js/config.js` – uppdatera varje år).
   - **Djur** `dagsprov_pet_01` … `dagsprov_pet_12` (25 kr st, Non-Consumable).
   Fyll i visningsnamn, beskrivning och granskningsskärmdump för varje produkt. Skriv under avtalet
   *Paid Apps* och fyll i bank och skatt.
2. **Google Play Console → Tjäna pengar → Produkter**: samma produkter (årsprenumeration med gratisvecka,
   säsongspass och djur som engångsprodukter).
3. **[app.revenuecat.com](https://app.revenuecat.com)** (gratis upp till 2 500 USD i månadsintäkt):
   - Skapa ett projekt och lägg till en iOS-app och en Android-app (App Store Connect-nyckeln och
     Google Play-tjänstkontot enligt RevenueCats guide).
   - **Entitlements** → skapa `plus` och koppla `dagsprov_plus_annual` till den. (Säsongspasset kopplas
     *inte* – dess giltighet räknas fram i appen från kvittots köpdatum.)
   - **Offerings** → skapa `default` med paketet *Annual*.
   - Slå på **Trusted Entitlements** (kvittoverifiering) i projektets inställningar.
   - Kopiera de publika SDK-nycklarna (`appl_…` och `goog_…`) till `REVENUECAT_KEY` i `App.js`.
4. **Köpta livlinor**: skapa tre köp av typen **Consumable** i App Store Connect (och engångsprodukter
   i Google Play): `dagsprov_lifelines_1` (5 kr), `dagsprov_lifelines_5` (19 kr) och
   `dagsprov_lifelines_15` (45 kr). Lägg till dem som produkter i RevenueCat (de ska *inte* kopplas
   till `plus`). Köpta livlinor går aldrig ut och staplas; appen använder dagens gratis livlinor först.
5. Testa köpen med en **Sandbox-användare** (iOS) och en **licenstestare** (Android) innan du publicerar.

Priserna i appen hämtas alltid från butiken, i användarens valuta. Texterna om provperiod och
besparing räknas fram automatiskt.

### Priser

| Produkt | Pris | Tanke |
|---|---|---|
| År | 199 kr, 7 dagar gratis | Förvalt. Ger mest per användare. |
| Säsongspass | 79 kr engångsköp | För den som pluggar inför ett visst prov och inte vill ha abonnemang. |
| Livlinor | 5 / 19 / 45 kr | 1, 5 eller 15 st, går aldrig ut. |
| Djur | 25 kr st | Alternativ till att vinna djuret via månadens uppdrag. |

Plus visas där användaren redan vill ha mer (livlinorna slut, en låst arkivdag, en Plus-färg),
aldrig som en ruta av sig själv. En gång i veckan kan man prova Plus i 24 timmar genom att titta
på en film – det ger reklamintäkt och visar vad Plus är värt, vilket brukar öka köpen.

## 4. Bygga och testa

```bash
eas build --profile preview --platform android   # .apk att installera direkt på en Android-telefon
eas build --profile production --platform ios    # för TestFlight och App Store
eas submit --platform ios                        # laddar upp till App Store Connect
```

iOS-bygget testar du via **TestFlight** på din iPhone – ingen Mac behövs. Första gången frågar EAS om
ditt Apple-konto och skapar certifikat och profiler åt dig.

Efter ändringar i webbappen: kör `npm run build:web` innan du bygger igen, och räkna upp `version`
(och `buildNumber`/`versionCode`) i `app.json`.

## Hur reklamen fungerar

1. Alla får **3 gratis livlinor per dag** (andra chans, 50/50, extra tips, ledtråd före svaret,
   bonusomgång, rädda sviten).
2. Är de slut visar webbappen knappen **"Titta på en kort film · +2 livlinor"** (en används direkt,
   en sparas till senare samma dag). Filmer kan också låsa upp en arkivdag äldre än 7 dagar eller ge
   24 timmar Plus en gång i veckan. Högst 10 filmer per dag. Då anropas
   `window.DagsprovNative.showRewarded()` → skalet laddar och visar en AdMob-belöningsfilm → svarar
   `true` bara om filmen setts klart.
3. Ingen reklam visas någonsin automatiskt, och ingen banner ligger över innehållet.
4. Med Plus visas ingen reklam alls – skalet säger nej till filmer när Plus är aktivt.

Annonserna är **ej anpassade** (`requestNonPersonalizedAdsOnly`) och begränsade till innehåll som passar
tonåringar. Appen spårar inte användare mellan appar, och därför behövs ingen ATT-dialog
("Tillåt appen att spåra"). Googles samtyckesdialog visas ändå i EU/EES, eftersom AdMob använder
enhetsdata för att visa och mäta annonser.

## Innan du publicerar – ändra integritetsuppgifterna

När appen har reklam gäller **inte längre "Data Not Collected"**. Fyll i App Store Connects och Google
Plays integritetsformulär enligt Googles egen vägledning för AdMob:

- Apple: <https://developers.google.com/admob/ios/privacy/data-disclosure>
- Google Play: <https://developers.google.com/admob/android/privacy/play-data-disclosure>

Integritetspolicyn (`privacy.html`) har redan ett avsnitt om reklamen i appversionen – kontrollera att
det stämmer med dina AdMob-inställningar. Den beskriver också RevenueCat. I Apples integritetsetikett
lägger du för RevenueCat till **Purchases → Purchase History** och **Identifiers → User ID**
(används för appens funktion, inte kopplat till spårning).

> Obs: skalet är skrivet och bryggan är testad i webbläsare, men själva iOS/Android-bygget har inte
> kunnat köras här. Testa noga på riktiga telefoner (TestFlight och en Android-telefon) innan du publicerar.
