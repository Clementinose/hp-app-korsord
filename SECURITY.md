# Säkerhetsgenomgång – Dagsprov (fas 1)

Senast uppdaterad: 2026-09-28. Gäller webbappen i repots rot och Expo-appen i `native/`.

## 1. Köp och premium

| Krav | Status | Hur |
|---|---|---|
| Premium verifieras via kvitton, inte en lokal flagga | ✅ | RevenueCat (`react-native-purchases`) verifierar kvitton mot App Store / Google Play på sin server. Appen kör med `entitlementVerificationMode: INFORMATIONAL` och räknar ett svar som inte gick att verifiera (`FAILED`) som *inget köp*. Webbappen håller Plus-status **bara i minnet** (`verifiedPlus`) och får den från appskalet – sparade flaggor som `plusNative` ignoreras. |
| Status hämtas om vid varje start | ✅ | `preparePlus()` → `Purchases.getCustomerInfo()` vid start + `addCustomerInfoUpdateListener` (förnyelser, uppsägningar). Offline används RevenueCats cachade, signerade kundinfo. |
| Återställ köp | ✅ | Inställningar → Dagsprov Plus → *Återställ köp* (`Purchases.restorePurchases()`). Återställer Plus, säsongspass och köpta djur. |
| Säsongspass | ✅ | Engångsköp `dagsprov_season`. Giltigt till och med nästa provdag efter köpdagen, beräknat i appskalet från kvittots köpdatum och **serverns** tid (`customerInfo.requestDate`). |
| Reklam av/på utifrån verifierad status | ✅ | Appskalet vägrar visa film när `plusActive` (verifierad) är sann – oavsett vad webbappen ber om. |
| Priser på ett ställe | ✅ | `js/config.js` (priser, produkt-id:n, provdagar). Appskalet får samma värden via `native/web/config.js` som byggs från den. |

## 2. Maskotar, uppdrag och livlinor

| Krav | Status | Hur |
|---|---|---|
| Klockfusk upptäcks | ✅ | `checkClock()`: högsta sedda tid sparas (signerat). Går klockan bakåt > 10 min, eller skiljer den > 1 h från köptjänstens servertid, pausas dagliga livlinor, provperioder och nya djur tills tiden stämmer. Framtida datum räknas aldrig i uppdragen och djur från en månad som inte har börjat tas bort. |
| Lagringen går inte att manipulera | ⚠️ delvis | Belöningsvärden (livlinor, djur, provperioder, uppdrag) signeras. I appen är nyckeln slumpad per installation och ligger i Keychain/Keystore (`expo-secure-store`), så den går inte att läsa ur lagringen. Ändringar medan appen körs används aldrig (värdena läses från minnet) och ändringar mellan starter upptäcks och nollställs. **Vattentätt blir det först med servervalidering i fas 3** – en användare med en jailbrokad telefon kan i teorin läsa nyckeln. |
| Säkerhetskopior | ✅ | Import tar aldrig med köp, livlinor, provperioder, djur eller klockdata. Importerade framsteg kan inte ge djur för tidigare månader. |
| Andra chans / dubbeltryck | ✅ | Ett belöningsark åt gången (`offerLifeline` returnerar nej om ett redan är öppet), lås i `useRetry`, kontroll att frågan är densamma efter svaret, en film åt gången (`adBusy`, och `busy` i appskalet). |
| Köpta livlinor | ⚠️ | Förbrukningsbara köp sparas lokalt (signerat). Följer inte med säkerhetskopior. Servervalidering i fas 3. |

## 3. Hemligheter och data

- **Inga hemligheter i koden.** Det som finns är *publika* id:n som ska ligga i appen: AdMob app-/annons-id:n och RevenueCats publika SDK-nycklar (`appl_…`, `goog_…`). Inga server-nycklar, tokens eller lösenord.
- **SecureStore:** nyckeln för integritetskontrollen. Appen har ingen annan känslig data (inga konton, inga personuppgifter).
- **Debug av i produktion:** `webviewDebuggingEnabled={__DEV__}`, RevenueCat-loggnivå `ERROR`, testannonser bara i `__DEV__`. Förhandsvisningens låtsasköp och exempelfilmer är avstängda så fort appskalet finns (`window.DagsprovNative`). Inga `console.log` i koden.
- **WebView-härdning:** ingen filåtkomst, inga popup-fönster, `mixedContentMode="never"`, meddelanden tas bara emot från appens egen adress och varje meddelande valideras (plan-, paket- och djur-id kontrolleras mot listor). Egen strikt CSP i appen (`default-src 'none'`, `connect-src 'none'`). Android: `allowBackup: false` och onödiga behörigheter blockerade.

## 4. Nätverk och tredjepart

All trafik går över HTTPS: webbappen hämtar ingenting utifrån (CSP `connect-src 'self'`), appen har allt inbyggt, och SDK:erna använder bara HTTPS (iOS ATS och Androids standard blockerar klartext).

| Bibliotek / SDK | Syfte | Samlar in data? |
|---|---|---|
| `react-native-google-mobile-ads` (Google AdMob + UMP) | Belöningsfilmer, samtycke i EU | **Ja** – enhets-/annons-id (IDFA/GAID om tillåtet), IP-adress, ungefärlig plats, enhetsinfo, annonsinteraktioner |
| `react-native-purchases` (RevenueCat) | Köp och kvittoverifiering | **Ja** – slumpat användar-id, köphistorik, land, appversion |
| `expo-tracking-transparency` | ATT-frågan på iOS | Nej (frågar bara) |
| `expo-notifications` | Lokala påminnelser | Nej – bara lokala notiser, ingen push-token hämtas |
| `expo-secure-store`, `expo-crypto` | Nyckel för integritetskontroll | Nej |
| `expo-haptics`, `expo-status-bar`, `react-native-webview`, `expo`, `react`, `react-native` | App-grund | Nej |

Ingen analys, ingen kraschrapportering, inga sociala SDK:er.

## 5. App Privacy i App Store Connect

**Data Used to Track You** (bara om användaren säger ja till ATT – annars ej anpassade annonser):
- Identifiers → Device ID · Usage Data → Advertising Data

**Data Linked to You:** inget.

**Data Not Linked to You:**
| Typ | Från | Syfte |
|---|---|---|
| Identifiers → Device ID | AdMob | Third-Party Advertising, Analytics (AdMobs egen mätning) |
| Usage Data → Advertising Data | AdMob | Third-Party Advertising |
| Location → Coarse Location | AdMob (via IP) | Third-Party Advertising |
| Diagnostics → Performance Data | AdMob | Third-Party Advertising |
| Purchases → Purchase History | RevenueCat | App Functionality |
| Identifiers → User ID (slumpat) | RevenueCat | App Functionality |

Kontrollera mot Googles vägledning: <https://developers.google.com/admob/ios/privacy/data-disclosure>.

**ATT och GDPR:** Googles samtyckesdialog (UMP) visas i EU/EES vid start. ATT-frågan visas först när användaren själv väljer att titta på en film (naturligt tillfälle), efter UMP. Nej → ej anpassade annonser. Vill du aldrig fråga: `ASK_TRACKING = false` i `native/App.js`.

**Notiser:** frågan ställs efter första avklarade passet (”Ska Olle påminna dig?”), aldrig vid start. Högst en påminnelse per dag, i vald maskots namn, vänlig ton, går att stänga av under Inställningar → Påminnelser.

## 6. Tester

Körs med Playwright mot webbappen och den inbyggda appversionen (se PR-beskrivningen för resultat):
- tidsfusk (klocka bakåt, fel mot servertid, framtida datum ger inga djur)
- ändrad lagring (medan appen körs, mellan starter, med raderad signatur) och att ärliga köp överlever
- dubbeltryck på Andra chans, livlina och film
- premium bara via verifierad status; säsongspass och år; Återställ köp
- notiser: ingen fråga vid start, högst en per dag, maskotens namn
- offline (webb med service worker, appen utan nätverk)
