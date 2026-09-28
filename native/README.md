# Dagsprov – appen för iOS och Android (Expo)

Den här mappen är ett litet Expo-skal runt webbappen i repots rot. Webbappen byggs ihop till en
enda html-sträng och visas i en WebView, så allt ligger inbyggt och fungerar utan internet.
Skalet lägger till det som bara en riktig app kan:

- **Belöningsreklam (AdMob)** – bara när användaren själv väljer "Titta på en kort film" för en livlina.
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

1. Alla får **3 gratis livlinor per dag** (andra chans, 50/50, extra tips, bonusomgång, rädda sviten).
2. Är de slut visar webbappen knappen **"Titta på en kort film"**. Då anropas
   `window.DagsprovNative.showRewarded()` → skalet laddar och visar en AdMob-belöningsfilm → svarar
   `true` bara om filmen setts klart.
3. Ingen reklam visas någonsin automatiskt, och ingen banner ligger över innehållet.

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
det stämmer med dina AdMob-inställningar.

> Obs: skalet är skrivet och bryggan är testad i webbläsare, men själva iOS/Android-bygget har inte
> kunnat köras här. Testa noga på riktiga telefoner (TestFlight och en Android-telefon) innan du publicerar.
