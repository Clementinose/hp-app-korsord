// Dagsprov som app för iOS och Android.
// Själva appen är webbappen i repots rot, inbyggd som en html-sträng (web/app-html.js).
// Det här skalet lägger till det som bara en riktig app kan: belöningsreklam via AdMob med
// Googles samtyckesdialog (UMP), riktig haptik och att externa länkar öppnas i webbläsaren.
//
// Reklam visas ALDRIG av sig själv. Webbappen anropar window.DagsprovNative.showRewarded()
// bara när användaren själv trycker på "Titta på en kort film" för att få en livlina.
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
import APP_HTML from "./web/app-html";

// Byt till dina egna annonsenheter från AdMob innan appen publiceras.
// I utvecklingsläge används alltid Googles testannonser.
const REWARDED_UNIT = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: "ca-app-pub-XXXXXXXXXXXXXXXX/IIIIIIIIII",
      android: "ca-app-pub-XXXXXXXXXXXXXXXX/AAAAAAAAAA",
    });

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
      }
    };
    window.__dagsprovAdResult = function (id, ok) {
      var cb = callbacks[id];
      if (cb) { delete callbacks[id]; cb(!!ok); }
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

const HAPTIC = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export default function App() {
  const web = useRef(null);

  useEffect(() => { prepareAds(); }, []);

  const onMessage = useCallback(async (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === "rewarded") {
      const ok = await showRewarded();
      web.current?.injectJavaScript(`window.__dagsprovAdResult(${JSON.stringify(msg.id)}, ${ok}); true;`);
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
