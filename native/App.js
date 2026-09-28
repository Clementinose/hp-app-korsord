// Dagsprov som app för iOS och Android.
// Själva appen är webbappen i repots rot, inbyggd som en html-sträng (web/app-html.js).
// Det här skalet lägger till det som bara en riktig app kan: belöningsreklam via AdMob med
// Googles samtyckesdialog (UMP), köp av Dagsprov Plus via RevenueCat (App Store / Google Play),
// riktig haptik och att externa länkar öppnas i webbläsaren.
//
// Reklam visas ALDRIG av sig själv. Webbappen anropar window.DagsprovNative.showRewarded()
// bara när användaren själv trycker på "Titta på en kort film". Med Plus visas ingen reklam alls.
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import mobileAds, {
  AdEventType,
  AdsConsent,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";
import Purchases from "react-native-purchases";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import APP_HTML from "./web/app-html";
import { hpDates, seasonFallbackDays, products } from "./web/config"; // från js/config.js

// Byt till dina egna annonsenheter från AdMob innan appen publiceras.
// I utvecklingsläge används alltid Googles testannonser.
const APP_ORIGIN = "https://app.dagsprov.local/";

const REWARDED_UNIT = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: "ca-app-pub-XXXXXXXXXXXXXXXX/IIIIIIIIII",
      android: "ca-app-pub-XXXXXXXXXXXXXXXX/AAAAAAAAAA",
    });

// RevenueCat: dina publika SDK-nycklar (Project settings → API keys) och namnet på rättigheten
// ("entitlement") som alla Plus-produkter ger. Se README.md.
const REVENUECAT_KEY = Platform.select({ ios: "appl_XXXXXXXXXXXXXXXXXXXXXXXXXXX", android: "goog_XXXXXXXXXXXXXXXXXXXXXXXXXXX" });
const ENTITLEMENT = "plus";

// Brygga mellan webbappen och appskalet. Körs innan webbappens egen kod.
// stateKey: slumpad nyckel per installation (sparad i Keychain/Keystore) som webbappen signerar
// sina belöningar med, så att ändrad lokal lagring upptäcks.
const bridge = (stateKey) => `
  (function () {
    var callbacks = {};
    window.DagsprovNative = {
      platform: ${JSON.stringify(Platform.OS)},
      stateKey: ${JSON.stringify(stateKey)},
      showRewarded: function () {
        return new Promise(function (resolve) {
          var id = String(Date.now()) + Math.random();
          callbacks[id] = resolve;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "rewarded", id: id }));
        });
      },
      privacyOptions: function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "privacyOptions" }));
      },
      haptic: function (style) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "haptic", style: style || "light" }));
      },
      notify: {
        permission: function () { return call("notifyPermission"); },
        schedule: function (list) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "notifySchedule", list: list })); },
        test: function (n) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "notifyTest", title: n.title, body: n.body })); }
      },
      pets: {
        price: function () { return call("petPrice"); },
        buy: function (i) { return call("petBuy", { pet: i }); }
      },
      shop: {
        products: function () { return call("shopProducts"); },
        buy: function (id) { return call("shopBuy", { pack: id }); }
      },
      plus: {
        offerings: function () { return call("offerings"); },
        purchase: function (plan) { return call("purchase", { plan: plan }); },
        restore: function () { return call("restore"); },
        manage: function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "manage" })); }
      }
    };
    function call(type, extra) {
      return new Promise(function (resolve) {
        var id = String(Date.now()) + Math.random();
        callbacks[id] = resolve;
        var msg = extra || {};
        msg.type = type; msg.id = id;
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      });
    }
    window.__dagsprovAdResult = function (id, ok) {
      var cb = callbacks[id];
      if (cb) { delete callbacks[id]; cb(ok); }
    };
  })();
  true;
`;

let adsReady = false;
async function prepareAds() {
  try {
    // Googles samtyckesdialog (krävs i EU/EES). Visas bara när det behövs.
    await AdsConsent.gatherConsent();
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) return;
    await mobileAds().setRequestConfiguration({
      // Appen används av många tonåringar: bara annonser som passar för dem.
      maxAdContentRating: MaxAdContentRating.T,
    });
    await mobileAds().initialize();
    adsReady = true;
  } catch {
    adsReady = false;
  }
}

// App Tracking Transparency (iOS): frågan visas vid ett naturligt tillfälle – första gången
// användaren själv väljer att titta på en film, efter Googles samtyckesdialog. Säger man ja får
// annonserna anpassas (bättre intäkt), annars visas bara ej anpassade annonser.
// Sätt ASK_TRACKING = false för att aldrig fråga och alltid köra ej anpassade annonser.
const ASK_TRACKING = true;
async function trackingAllowed() {
  if (Platform.OS !== "ios") return true; // Android: styrs av Googles samtycke (UMP)
  if (!ASK_TRACKING) return false;
  try {
    let { status } = await getTrackingPermissionsAsync();
    if (status === "undetermined") ({ status } = await requestTrackingPermissionsAsync());
    return status === "granted";
  } catch {
    return false;
  }
}

// Visar en belöningsfilm. Svarar true bara om användaren har sett klart och fått belöningen.
async function showRewarded() {
  if (!adsReady) return false;
  const personalized = ASK_TRACKING && (await trackingAllowed());
  return new Promise((resolve) => {
    // Utan ATT-tillstånd: bara ej anpassade annonser. Googles samtycke (UMP/TCF) gäller alltid ovanpå.
    const ad = RewardedAd.createForAdRequest(REWARDED_UNIT, { requestNonPersonalizedAdsOnly: !personalized });
    let earned = false, done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      unsubscribe.forEach((u) => u());
      clearTimeout(timer);
      resolve(ok);
    };
    const unsubscribe = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show().catch(() => finish(false))),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned)),
      ad.addAdEventListener(AdEventType.ERROR, () => finish(false)),
    ];
    // Laddas ingen film inom 15 sekunder (t.ex. utan internet) får användaren ett tydligt nej.
    const timer = setTimeout(() => finish(false), 15000);
    ad.load();
  });
}

// ---------- Dagsprov Plus (RevenueCat) ----------
let plusReady = false;
// Plus räknas bara som aktivt om RevenueCat har verifierat kvittot (signerade svar från servern).
// Svar som inte gick att verifiera ("FAILED") räknas som inget köp.
// Säsongspasset är ett engångsköp som gäller till och med nästa provdag efter köpdagen.
// Köpdatumet kommer från RevenueCats verifierade kvitto och jämförs med serverns tid.
function seasonEnd(purchasedMs) {
  const d = new Date(purchasedMs);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hp = hpDates.find((x) => x >= key);
  if (!hp) return purchasedMs + seasonFallbackDays * 864e5;
  const [y, m, dd] = hp.split("-").map(Number);
  return new Date(y, m - 1, dd, 23, 59, 59).getTime();
}
function seasonActive(info) {
  if (!info || (info.entitlements && info.entitlements.verification === "FAILED")) return false;
  const now = Date.parse(info.requestDate) || Date.now();
  return (info.nonSubscriptionTransactions || []).some((t) =>
    t.productIdentifier === products.season && seasonEnd(Date.parse(t.purchaseDate)) >= now);
}
const isPlusActive = (info) => {
  const ent = info && info.entitlements && info.entitlements.active[ENTITLEMENT];
  return (!!ent && ent.verification !== "FAILED") || seasonActive(info);
};
const PET_PRODUCT = (i) => `${products.petPrefix}${String(i + 1).padStart(2, "0")}`;
const ownedPets = (info) => {
  if (!info || (info.entitlements && info.entitlements.verification === "FAILED")) return [];
  const ids = info.allPurchasedProductIdentifiers || [];
  return Array.from({ length: 12 }, (_, i) => i).filter((i) => ids.includes(PET_PRODUCT(i)));
};
async function preparePlus(onChange) {
  try {
    Purchases.configure({
      apiKey: REVENUECAT_KEY,
      entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
    });
    if (!__DEV__) Purchases.setLogLevel(Purchases.LOG_LEVEL.ERROR);
    plusReady = true;
    Purchases.addCustomerInfoUpdateListener((info) => onChange(info));
    onChange(await Purchases.getCustomerInfo());
  } catch {
    plusReady = false;
  }
}
const PLAN_TYPES = { annual: "ANNUAL", season: "SEASON" }; // säsongspasset köps som produkt, inte paket
async function currentPackages() {
  const offerings = await Purchases.getOfferings();
  return (offerings.current && offerings.current.availablePackages) || [];
}
// Priser i användarens egen valuta, direkt från App Store / Google Play.
async function seasonProduct() {
  const [prod] = await Purchases.getProducts([products.season], Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return prod || null;
}
async function plusOfferings() {
  if (!plusReady) return [];
  const pkgs = await currentPackages();
  const annual = pkgs.find((p) => p.packageType === "ANNUAL");
  const season = await seasonProduct().catch(() => null);
  const out = [];
  if (annual) {
    const intro = annual.product.introPrice;
    out.push({
      id: "annual",
      price: annual.product.priceString,
      sub: annual.product.pricePerMonthString ? `${annual.product.pricePerMonthString}/mån` : "per år",
      badge: "Mest värde",
      trial: intro && intro.price === 0
        ? `${intro.periodNumberOfUnits} ${{ DAY: "dagar", WEEK: "veckor", MONTH: "månader" }[intro.periodUnit] || "dagar"} gratis, sedan ${annual.product.priceString}/år`
        : "",
    });
  }
  if (season) out.push({ id: "season", price: season.priceString, sub: "engångsköp" });
  return out;
}
async function purchasePlus(plan) {
  if (!plusReady) return null;
  try {
    if (plan === "season") {
      const prod = await seasonProduct();
      if (!prod) return null;
      return (await Purchases.purchaseStoreProduct(prod)).customerInfo;
    }
    const pkg = (await currentPackages()).find((p) => p.packageType === PLAN_TYPES[plan]);
    if (!pkg) return null;
    return (await Purchases.purchasePackage(pkg)).customerInfo;
  } catch {
    return null; // avbrutet av användaren eller misslyckat köp
  }
}
async function restorePlus() {
  if (!plusReady) return null;
  try { return await Purchases.restorePurchases(); } catch { return null; }
}

// ---------- Köpta djur (engångsköp, 25 kr st) ----------
// Skapa 12 köp av typen "Non-Consumable" (dagsprov_pet_01 … dagsprov_pet_12). Ägandet läses alltid
// från RevenueCat (verifierade kvitton) och återställs med "Återställ köp".
async function petPrice() {
  if (!plusReady) return "";
  const [prod] = await Purchases.getProducts([PET_PRODUCT(0)], Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return prod ? prod.priceString : "";
}
async function buyPet(i) {
  if (!plusReady || !Number.isInteger(i) || i < 0 || i > 11) return null;
  const [prod] = await Purchases.getProducts([PET_PRODUCT(i)], Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  if (!prod) return null;
  try {
    const { customerInfo } = await Purchases.purchaseStoreProduct(prod);
    return customerInfo;
  } catch {
    return null;
  }
}

// ---------- Köpta livlinor (förbrukningsbara köp) ----------
// Skapa produkterna som "Consumable" i App Store Connect och som engångsprodukter i Google Play.
// Webbappen sparar livlinorna; skalet svarar bara med hur många som köptes.
const PACKS = {
  lifelines_1: { product: products.lifelines.lifelines_1, n: 1 },
  lifelines_5: { product: products.lifelines.lifelines_5, n: 5 },
  lifelines_15: { product: products.lifelines.lifelines_15, n: 15 },
};
async function storeProducts() {
  const ids = Object.values(PACKS).map((p) => p.product);
  return Purchases.getProducts(ids, Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
}
async function shopProducts() {
  if (!plusReady) return [];
  const products = await storeProducts();
  return Object.entries(PACKS).map(([id, p]) => {
    const prod = products.find((x) => x.identifier === p.product);
    return prod ? { id, price: prod.priceString } : null;
  }).filter(Boolean);
}
async function buyPack(id) {
  const pack = PACKS[id];
  if (!plusReady || !pack) return 0;
  const prod = (await storeProducts()).find((x) => x.identifier === pack.product);
  if (!prod) return 0;
  try {
    await Purchases.purchaseStoreProduct(prod);
    return pack.n;
  } catch {
    return 0; // avbrutet eller misslyckat köp
  }
}

// ---------- Påminnelser (lokala notiser, ingen server) ----------
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});
async function notifyPermission() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("paminnelser", { name: "Påminnelser", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return !!res.granted;
}
const cleanText = (t, max) => String(t || "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);
let scheduling = Promise.resolve();
function scheduleReminders(list) {
  // Körs i tur och ordning så att två snabba anrop inte blandas ihop.
  scheduling = scheduling.then(async () => {
    const { granted } = await Notifications.getPermissionsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!granted || !Array.isArray(list)) return;
    const now = Date.now();
    for (const n of list.slice(0, 10)) {
      const at = Number(n && n.at);
      if (!Number.isFinite(at) || at < now || at > now + 8 * 864e5) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: cleanText(n.title, 60), body: cleanText(n.body, 180) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: "paminnelser" },
      });
    }
  }).catch(() => {});
}

const HAPTIC = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export default function App() {
  const web = useRef(null);

  const plusActive = useRef(null);
  const lastInfo = useRef(null);
  const busy = useRef(false); // ett köp eller en film i taget
  const [stateKey, setStateKey] = useState(null);

  // Nyckeln för webbappens integritetskontroll: skapas en gång och sparas i Keychain/Keystore.
  useEffect(() => {
    (async () => {
      try {
        let key = await SecureStore.getItemAsync("dagsprov-state-key");
        if (!key) {
          const bytes = await Crypto.getRandomBytesAsync(32);
          key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
          await SecureStore.setItemAsync("dagsprov-state-key", key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
        }
        setStateKey(key);
      } catch {
        setStateKey(""); // webbappen använder då sin inbyggda nyckel
      }
    })();
  }, []);

  // Skickar verifierad köpstatus, köpta djur och serverns tid till webbappen
  // (vid start och när något ändras, t.ex. vid förnyelse eller återställning).
  const sendInfo = useCallback((info) => {
    if (!info) return;
    lastInfo.current = info;
    const active = isPlusActive(info);
    plusActive.current = active;
    const pets = JSON.stringify(ownedPets(info));
    const t = Date.parse(info.requestDate);
    web.current?.injectJavaScript(`(function(){var n=window.DagsprovNative; if(n){n.plusActive=${active}; n.petsOwned=${pets};}
      window.__dagsprovPlus && window.__dagsprovPlus(${active}); window.__dagsprovPets && window.__dagsprovPets(${pets});
      ${Number.isFinite(t) ? `window.__dagsprovServerTime && window.__dagsprovServerTime(${t});` : ""}})(); true;`);
  }, []);

  useEffect(() => { preparePlus(sendInfo); prepareAds(); }, [sendInfo]);

  const reply = (id, value) =>
    web.current?.injectJavaScript(`window.__dagsprovAdResult(${JSON.stringify(id)}, ${JSON.stringify(value)}); true;`);

  const onMessage = useCallback(async (event) => {
    // Ta bara emot meddelanden från den inbyggda appen, aldrig från någon annan sida.
    if (!String(event.nativeEvent.url || "").startsWith(APP_ORIGIN)) return;
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "rewarded") {
      // Med Plus visas aldrig reklam. Bara en film åt gången.
      if (plusActive.current || busy.current) return reply(msg.id, false);
      busy.current = true;
      reply(msg.id, await showRewarded().finally(() => { busy.current = false; }));
    } else if (msg.type === "notifyPermission") {
      reply(msg.id, await notifyPermission().catch(() => false));
    } else if (msg.type === "notifySchedule") {
      scheduleReminders(msg.list);
    } else if (msg.type === "notifyTest") {
      if (await notifyPermission().catch(() => false)) {
        Notifications.scheduleNotificationAsync({
          content: { title: cleanText(msg.title, 60), body: cleanText(msg.body, 180) },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: "paminnelser" },
        }).catch(() => {});
      }
    } else if (msg.type === "offerings") {
      reply(msg.id, await plusOfferings().catch(() => []));
    } else if (msg.type === "purchase") {
      if (!PLAN_TYPES[msg.plan] || busy.current) return reply(msg.id, false);
      busy.current = true;
      const info = await purchasePlus(msg.plan).finally(() => { busy.current = false; });
      sendInfo(info);
      reply(msg.id, isPlusActive(info));
    } else if (msg.type === "restore") {
      if (busy.current) return reply(msg.id, false);
      busy.current = true;
      const info = await restorePlus().finally(() => { busy.current = false; });
      sendInfo(info);
      reply(msg.id, isPlusActive(info));
    } else if (msg.type === "petPrice") {
      reply(msg.id, await petPrice().catch(() => ""));
    } else if (msg.type === "petBuy") {
      if (!Number.isInteger(msg.pet) || msg.pet < 0 || msg.pet > 11 || busy.current) return reply(msg.id, false);
      busy.current = true;
      const info = await buyPet(msg.pet).finally(() => { busy.current = false; });
      sendInfo(info);
      reply(msg.id, ownedPets(info).includes(msg.pet));
    } else if (msg.type === "shopProducts") {
      reply(msg.id, await shopProducts().catch(() => []));
    } else if (msg.type === "shopBuy") {
      if (!Object.prototype.hasOwnProperty.call(PACKS, msg.pack) || busy.current) return reply(msg.id, 0);
      busy.current = true;
      reply(msg.id, await buyPack(msg.pack).finally(() => { busy.current = false; }));
    } else if (msg.type === "manage") {
      Purchases.showManageSubscriptions().catch(() => Linking.openURL(Platform.OS === "ios"
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions"));
    } else if (msg.type === "privacyOptions") {
      // Googles dialog där användaren kan ändra sitt samtycke till reklam.
      AdsConsent.showPrivacyOptionsForm().catch(() => {});
    } else if (msg.type === "haptic") {
      (HAPTIC[msg.style] || HAPTIC.light)().catch(() => {});
    }
  }, []);

  // Länkar till andra webbplatser (t.ex. support) öppnas i webbläsaren, inte i appen.
  const onShouldStartLoad = useCallback((req) => {
    if (req.url.startsWith(APP_ORIGIN) || req.url.startsWith("about:") || req.url.startsWith("data:") || req.url.startsWith("blob:")) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  // Vänta tills nyckeln är hämtad, så att bryggan finns innan webbappen startar.
  if (stateKey === null) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="auto" />
      <WebView
        ref={web}
        source={{ html: APP_HTML, baseUrl: "https://app.dagsprov.local/" }}
        originWhitelist={["*"]}
        injectedJavaScriptBeforeContentLoaded={bridge(stateKey)}
        onMessage={onMessage}
        // När sidan har laddats: skicka köpstatusen (den kan ha hämtats innan webbappen var redo).
        onLoadEnd={() => { if (lastInfo.current) sendInfo(lastInfo.current); }}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        javaScriptEnabled
        domStorageEnabled
        // Säkerhet: ingen filåtkomst, inga popup-fönster, ingen blandning av http och https och
        // ingen felsökning av webbvyn i den publicerade appen.
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mixedContentMode="never"
        webviewDebuggingEnabled={__DEV__}
        cacheEnabled={false}
        // Tangentbordet ska kunna öppnas när man trycker på en ruta i korsordet.
        keyboardDisplayRequiresUserAction={false}
        // Ingen verktygsrad ovanför tangentbordet på iOS – mer plats åt korsordet.
        hideKeyboardAccessoryView
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        bounces={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        textZoom={100}
        style={{ flex: 1, backgroundColor: "transparent" }}
      />
    </View>
  );
}
