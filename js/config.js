// Dagsprov – priser, produkter och provdagar på ETT ställe.
//
// Priserna här visas i förhandsvisningen och som reserv innan butiken har svarat. I appen hämtas
// alltid de riktiga priserna från App Store / Google Play, i användarens valuta. Ändrar du ett pris:
// ändra det här OCH i App Store Connect / Google Play Console (samma belopp).
(function (root) {
  var CONFIG = {
    currency: "kr",
    prices: {
      season: 79,      // Säsongspass: engångsköp som gäller till och med nästa provdag
      annual: 199,     // Årsabonnemang, förnyas automatiskt
      lifeline1: 5,    // 1 livlina
      lifeline5: 19,   // 5 livlinor
      lifeline15: 45,  // 15 livlinor
      pet: 25,         // ett djur
    },
    annualTrialDays: 7,
    // Produkt-id:n i App Store Connect / Google Play (och RevenueCat).
    products: {
      season: "dagsprov_season",
      annual: "dagsprov_plus_annual",
      lifelines: { lifelines_1: "dagsprov_lifelines_1", lifelines_5: "dagsprov_lifelines_5", lifelines_15: "dagsprov_lifelines_15" },
      petPrefix: "dagsprov_pet_", // + 01 … 54 (1–12 månadens djur, 13–54 äggdjuren – se js/pets.js)
      petCount: 54,
    },
    // Högskoleprovets provdagar. PRELIMINÄRA – kontrollera mot studera.nu och uppdatera varje år.
    // Säsongspasset gäller till och med den första provdagen på eller efter köpdagen.
    hpDates: ["2026-03-28", "2026-10-25", "2027-04-10", "2027-10-24", "2028-04-08", "2028-10-22"],
    // Om köpet görs efter den sista provdagen ovan gäller passet så här många dagar.
    seasonFallbackDays: 183,
  };
  // Nästa provdag på eller efter ett datum (ÅÅÅÅ-MM-DD), eller null.
  CONFIG.nextHpDate = function (dateKey) {
    for (var i = 0; i < CONFIG.hpDates.length; i++) if (CONFIG.hpDates[i] >= dateKey) return CONFIG.hpDates[i];
    return null;
  };
  // Sista giltiga ögonblick (ms) för ett säsongspass köpt vid tidpunkten ms (lokal tid).
  CONFIG.seasonEnd = function (purchasedMs) {
    var d = new Date(purchasedMs);
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var hp = CONFIG.nextHpDate(key);
    if (!hp) return purchasedMs + CONFIG.seasonFallbackDays * 864e5;
    var p = hp.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59).getTime();
  };
  CONFIG.price = function (k) { return CONFIG.prices[k] + " " + CONFIG.currency; };
  if (typeof module === "object" && module.exports) module.exports = CONFIG;
  root.DAGSPROV_CONFIG = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
