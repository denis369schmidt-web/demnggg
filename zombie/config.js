// Zentrale Konfiguration von Outbreak Hero.
// Für den Android-Build erzeugt mobile/scripts/build-web.mjs diese Datei neu –
// die Werte kommen dann aus Umgebungsvariablen bzw. GitHub-Secrets.
window.OUTBREAK_CONFIG = {
  version: "1.0.0",
  // Link zur Play-Store-Seite (für den "Hol dir die App"-Button der Web-Version).
  playStoreUrl: "",
  privacyUrl: "privacy.html",
  admob: {
    // Offizielle Google-Test-Anzeigenblöcke. Für den Release eigene IDs als
    // GitHub-Secrets ADMOB_REWARDED_ID / ADMOB_INTERSTITIAL_ID hinterlegen.
    rewarded: "ca-app-pub-3940256099942544/5224354917",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    testing: true,
  },
  // Produkt-IDs – müssen 1:1 so in der Google Play Console angelegt werden.
  iap: {
    noAds: "no_ads",
    starter: "starter_pack",
    coinsSmall: "coins_1200",
    coinsBig: "coins_7000",
  },
  // Vollbild-Werbung frühestens ab der n-ten Runde und dann jede n-te Runde.
  interstitialEvery: 3,
};
