// Dagsprov som app för iOS och Android.
// Själva appen är webbappen i repots rot, inbyggd som en html-sträng (web/app-html.js).
// Det här skalet lägger till det som bara en riktig app kan: belöningsreklam via AdMob med
// Googles samtyckesdialog (UMP), köp av Dagsprov Plus via RevenueCat (App Store / Google Play),
// riktig haptik och att externa länkar öppnas i webbläsaren.
//
// Reklam visas ALDRIG av sig själv. Webbappen anropar window.DagsprovNative.showRewarded()
// bara när användaren själv trycker på "Titta på en kort film". Med Plus visas ingen reklam alls.
import { useCallback, useEffect, useRef } from "react";
import { Linking, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import mobileAds, {
  AdEventType,
  AdsConsent,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";
import Purchases from "react-native-purchases";
import APP_HTML from "./web/app-html";

// Byt till dina egna annonsenheter från AdMob innan appen publiceras.
// I utvecklingsläge används alltid Googles testannonser.
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
const BRIDGE = `
  (function () {
    var callbacks = {};
    window.DagsprovNative = {
      platform: ${JSON.stringify(Platform.OS)},
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

// Visar en belöningsfilm. Svarar true bara om användaren har sett klart och fått belöningen.
function showRewarded() {
  return new Promise((resolve) => {
    if (!adsReady) return resolve(false);
    // Ej anpassade annonser: ingen spårning mellan appar, och därför ingen ATT-dialog.
    const ad = RewardedAd.createForAdRequest(REWARDED_UNIT, { requestNonPersonalizedAdsOnly: true });
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
const isPlusActive = (info) => !!(info && info.entitlements && info.entitlements.active[ENTITLEMENT]);
async function preparePlus(onChange) {
  try {
    Purchases.configure({ apiKey: REVENUECAT_KEY });
    plusReady = true;
    Purchases.addCustomerInfoUpdateListener((info) => onChange(isPlusActive(info)));
    onChange(isPlusActive(await Purchases.getCustomerInfo()));
  } catch {
    plusReady = false;
  }
}
const PLAN_TYPES = { annual: "ANNUAL", monthly: "MONTHLY", lifetime: "LIFETIME" };
async function currentPackages() {
  const offerings = await Purchases.getOfferings();
  return (offerings.current && offerings.current.availablePackages) || [];
}
// Priser i användarens egen valuta, direkt från App Store / Google Play.
async function plusOfferings() {
  if (!plusReady) return [];
  const pkgs = await currentPackages();
  const byType = (t) => pkgs.find((p) => p.packageType === t);
  const annual = byType("ANNUAL"), monthly = byType("MONTHLY"), lifetime = byType("LIFETIME");
  const out = [];
  if (annual) {
    const intro = annual.product.introPrice;
    const saving = monthly ? Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100) : 0;
    out.push({
      id: "annual",
      price: annual.product.priceString,
      sub: annual.product.pricePerMonthString ? `${annual.product.pricePerMonthString}/mån` : "per år",
      badge: saving >= 10 ? `Spara ${saving} %` : "Mest värde",
      trial: intro && intro.price === 0
        ? `${intro.periodNumberOfUnits} ${{ DAY: "dagar", WEEK: "veckor", MONTH: "månader" }[intro.periodUnit] || "dagar"} gratis, sedan ${annual.product.priceString}/år`
        : "",
    });
  }
  if (monthly) out.push({ id: "monthly", price: monthly.product.priceString, sub: "per månad" });
  if (lifetime) out.push({ id: "lifetime", price: lifetime.product.priceString, sub: "engångsköp" });
  return out;
}
async function purchasePlus(plan) {
  if (!plusReady) return false;
  const pkg = (await currentPackages()).find((p) => p.packageType === PLAN_TYPES[plan]);
  if (!pkg) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return isPlusActive(customerInfo);
  } catch {
    return false; // avbrutet av användaren eller misslyckat köp
  }
}
async function restorePlus() {
  if (!plusReady) return false;
  try { return isPlusActive(await Purchases.restorePurchases()); } catch { return false; }
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

  // Skickar köpstatusen till webbappen (vid start och när den ändras, t.ex. vid förnyelse).
  const sendPlus = useCallback((active) => {
    plusActive.current = active;
    web.current?.injectJavaScript(`window.DagsprovNative && (window.DagsprovNative.plusActive = ${active}); window.__dagsprovPlus && window.__dagsprovPlus(${active}); true;`);
  }, []);

  useEffect(() => { preparePlus(sendPlus); prepareAds(); }, [sendPlus]);

  const reply = (id, value) =>
    web.current?.injectJavaScript(`window.__dagsprovAdResult(${JSON.stringify(id)}, ${JSON.stringify(value)}); true;`);

  const onMessage = useCallback(async (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === "rewarded") {
      // Med Plus visas aldrig reklam.
      reply(msg.id, plusActive.current ? false : await showRewarded());
    } else if (msg.type === "offerings") {
      reply(msg.id, await plusOfferings().catch(() => []));
    } else if (msg.type === "purchase") {
      const ok = await purchasePlus(msg.plan);
      if (ok) sendPlus(true);
      reply(msg.id, ok);
    } else if (msg.type === "restore") {
      const ok = await restorePlus();
      if (ok) sendPlus(true);
      reply(msg.id, ok);
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
    if (req.url.startsWith("https://app.dagsprov.local") || req.url.startsWith("about:") || req.url.startsWith("data:") || req.url.startsWith("blob:")) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="auto" />
      <WebView
        ref={web}
        source={{ html: APP_HTML, baseUrl: "https://app.dagsprov.local/" }}
        originWhitelist={["*"]}
        injectedJavaScriptBeforeContentLoaded={BRIDGE}
        onMessage={onMessage}
        // När sidan har laddats: skicka köpstatusen (den kan ha hämtats innan webbappen var redo).
        onLoadEnd={() => { if (plusActive.current !== null) sendPlus(plusActive.current); }}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        javaScriptEnabled
        domStorageEnabled
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
