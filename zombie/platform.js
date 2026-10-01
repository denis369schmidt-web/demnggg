/* Plattform-Schicht von Outbreak Hero.
 * Kapselt alles, was sich zwischen Web und Android unterscheidet:
 *  - Werbung: AdMob (Android) | Test-Werbung (lokal / ?fakeads=1) | keine (Web)
 *  - Käufe:   Google Play Billing via cordova-plugin-purchase (nur Android)
 *  - Native:  Vibration, Zurück-Taste, App-Pausierung, Statusleiste, Bewertung
 * Das Spiel spricht nur mit window.Platform und kennt keine Plugins direkt.
 */
"use strict";
// Fehler mit Präfix loggen – der Emulator-Smoke-Test in der CI sucht danach.
window.addEventListener("error", (e) => console.error("[Outbreak] JS-Fehler", e.message, e.filename, e.lineno));
window.addEventListener("unhandledrejection", (e) => console.error("[Outbreak] JS-Fehler (Promise)", e.reason && (e.reason.message || e.reason)));

window.Platform = (() => {
  const cfg = window.OUTBREAK_CONFIG || {};
  const N = window.OutbreakNative || null; // wird im Android-Build von native.js gesetzt
  const isNative = !!(N && N.Capacitor && N.Capacitor.isNativePlatform());
  const params = new URLSearchParams(location.search);
  const fakeAds = !isNative && (params.has("fakeads") || ["localhost", "127.0.0.1"].includes(location.hostname));

  const listeners = { pause: [], back: [], iap: [], adStart: [], adEnd: [] };
  const emit = (name, ...args) => listeners[name].forEach((fn) => { try { fn(...args); } catch (e) { console.error(e); } });
  const on = (name, fn) => listeners[name].push(fn);

  // ------------------------------------------------------------------
  // Werbung
  // ------------------------------------------------------------------
  const ads = {
    available: false,
    privacyOptionsRequired: false,
    busy: false,
  };
  let rewardedLoaded = false;
  let rewardedLoading = null;
  let interLoaded = false;
  let interLoading = null;

  async function initNativeAds() {
    const { AdMob, AdmobConsentStatus } = N;
    try {
      await AdMob.initialize({ initializeForTesting: !!cfg.admob.testing });
    } catch (e) {
      console.warn("AdMob-Initialisierung fehlgeschlagen", e);
      return;
    }
    // DSGVO: Einwilligung über Googles UMP-Formular einholen (Pflicht in der EU).
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        await AdMob.showConsentForm();
      }
      const after = await AdMob.requestConsentInfo();
      ads.privacyOptionsRequired = after.privacyOptionsRequirementStatus === "REQUIRED";
    } catch (e) {
      console.warn("Consent-Abfrage fehlgeschlagen", e);
    }
    ads.available = true;
    console.log("[Outbreak] AdMob bereit", cfg.admob.testing ? "(Test-Anzeigen)" : "(echte Anzeigen)");
    preloadRewarded();
    preloadInterstitial();
  }

  function preloadRewarded() {
    if (rewardedLoaded || rewardedLoading) return rewardedLoading;
    rewardedLoading = N.AdMob.prepareRewardVideoAd({ adId: cfg.admob.rewarded, isTesting: !!cfg.admob.testing, immersiveMode: true })
      .then(() => { rewardedLoaded = true; console.log("[Outbreak] Rewarded-Video geladen"); })
      .catch((e) => console.warn("Rewarded nicht geladen", e))
      .finally(() => { rewardedLoading = null; });
    return rewardedLoading;
  }

  function preloadInterstitial() {
    if (interLoaded || interLoading) return interLoading;
    interLoading = N.AdMob.prepareInterstitial({ adId: cfg.admob.interstitial, isTesting: !!cfg.admob.testing, immersiveMode: true })
      .then(() => { interLoaded = true; console.log("[Outbreak] Interstitial geladen"); })
      .catch((e) => console.warn("Interstitial nicht geladen", e))
      .finally(() => { interLoading = null; });
    return interLoading;
  }

  function listenOnce(events, handlers) {
    const handles = events.map((ev, i) => N.AdMob.addListener(ev, handlers[i]));
    return () => handles.forEach((h) => Promise.resolve(h).then((x) => x && x.remove()).catch(() => {}));
  }

  async function showNativeRewarded() {
    if (!rewardedLoaded) {
      await preloadRewarded();
      if (!rewardedLoaded) return false;
    }
    rewardedLoaded = false;
    const E = N.RewardAdPluginEvents;
    const result = await new Promise((resolve) => {
      let earned = false;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(ok);
      };
      const cleanup = listenOnce(
        [E.Rewarded, E.Dismissed, E.FailedToShow],
        [
          () => { earned = true; },
          // Belohnung kann minimal nach dem Schließen gemeldet werden.
          () => setTimeout(() => finish(earned), 250),
          () => finish(false),
        ],
      );
      // Resolved erst, wenn die Belohnung verdient wurde (siehe Plugin-Quelltext).
      N.AdMob.showRewardVideoAd().then(() => { earned = true; }).catch(() => finish(false));
    });
    preloadRewarded();
    return result;
  }

  async function showNativeInterstitial() {
    if (!interLoaded) { preloadInterstitial(); return; }
    interLoaded = false;
    const E = N.InterstitialAdPluginEvents;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; cleanup(); resolve(); } };
      const cleanup = listenOnce([E.Dismissed, E.FailedToShow], [finish, finish]);
      N.AdMob.showInterstitial().catch(finish);
      setTimeout(finish, 120000); // Sicherheitsnetz
    });
    preloadInterstitial();
  }

  // Test-Werbung für die Entwicklung im Browser
  function showFakeAd(kind) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "fake-ad";
      let left = kind === "rewarded" ? 3 : 2;
      el.innerHTML = `<div class="fake-ad-box"><b>TEST-WERBUNG</b><span>${kind === "rewarded" ? "Belohnung in" : "Schließbar in"} <i>${left}</i> s</span><button class="btn" disabled>Schließen</button></div>`;
      document.body.appendChild(el);
      const btn = el.querySelector("button");
      const t = setInterval(() => {
        left--;
        el.querySelector("i").textContent = Math.max(0, left);
        if (left <= 0) { clearInterval(t); btn.disabled = false; }
      }, 1000);
      btn.addEventListener("click", () => { clearInterval(t); el.remove(); resolve(true); });
    });
  }

  ads.showRewarded = async function (placement) {
    if (ads.busy || !ads.available) return false;
    ads.busy = true;
    emit("adStart", "rewarded", placement);
    let ok = false;
    try {
      ok = isNative ? await showNativeRewarded() : await showFakeAd("rewarded");
    } catch (e) {
      console.warn("Rewarded-Fehler", e);
    }
    ads.busy = false;
    emit("adEnd", "rewarded", placement, ok);
    return ok;
  };

  ads.showInterstitial = async function () {
    if (ads.busy || !ads.available) return;
    ads.busy = true;
    emit("adStart", "interstitial");
    try {
      if (isNative) await showNativeInterstitial(); else await showFakeAd("interstitial");
    } catch (e) {
      console.warn("Interstitial-Fehler", e);
    }
    ads.busy = false;
    emit("adEnd", "interstitial");
  };

  ads.showPrivacyOptions = async function () {
    if (!isNative) return;
    try { await N.AdMob.showPrivacyOptionsForm(); } catch (e) { console.warn(e); }
  };

  // ------------------------------------------------------------------
  // In-App-Käufe (Google Play)
  // ------------------------------------------------------------------
  const ids = cfg.iap || {};
  const NON_CONSUMABLE = [ids.noAds, ids.starter];
  const iap = { available: false };
  let store = null;
  let CP = null;
  let deliverFn = () => false;

  function initIAP() {
    CP = window.CdvPurchase;
    if (!CP || !CP.store) return false;
    store = CP.store;
    const { ProductType, Platform: P, LogLevel } = CP;
    store.verbosity = LogLevel.WARNING;
    store.register([
      { id: ids.noAds, type: ProductType.NON_CONSUMABLE, platform: P.GOOGLE_PLAY },
      { id: ids.starter, type: ProductType.NON_CONSUMABLE, platform: P.GOOGLE_PLAY },
      { id: ids.coinsSmall, type: ProductType.CONSUMABLE, platform: P.GOOGLE_PLAY },
      { id: ids.coinsBig, type: ProductType.CONSUMABLE, platform: P.GOOGLE_PLAY },
    ]);
    store.when()
      .productUpdated(() => emit("iap"))
      // Ohne eigenen Validierungs-Server: im approved-Callback ausliefern und abschließen.
      // Bei Verbrauchsgütern konsumiert finish() den Kauf bei Google Play.
      .approved((t) => {
        for (const p of t.products) deliverFn(p.id, t.transactionId);
        t.finish();
        emit("iap");
      })
      .receiptUpdated((receipt) => {
        // Wiederherstellung: bereits besessene Einmalkäufe (z. B. nach Neuinstallation)
        for (const t of receipt.transactions || []) {
          if (t.state !== CP.TransactionState.APPROVED && t.state !== CP.TransactionState.FINISHED) continue;
          for (const p of t.products) if (NON_CONSUMABLE.includes(p.id)) deliverFn(p.id, `restore:${p.id}`);
        }
        emit("iap");
      });
    store.error((e) => console.warn("Store-Fehler", e && e.message));
    store.initialize([P.GOOGLE_PLAY]).then((errors) => {
      if (errors && errors.length) console.warn("[Outbreak] Google Play Billing:", errors.map((e) => e.message).join("; "));
      else console.log("[Outbreak] Google Play Billing bereit");
      iap.available = true;
      emit("iap");
    });
    return true;
  }

  iap.onDeliver = (fn) => { deliverFn = fn; };
  iap.product = (id) => {
    if (!store) return null;
    const p = store.get(id, CP.Platform.GOOGLE_PLAY);
    if (!p) return null;
    return { id, title: p.title, price: p.pricing ? p.pricing.price : "", canPurchase: p.canPurchase, owned: store.owned(id) };
  };
  iap.buy = async (id) => {
    if (!store) return false;
    const p = store.get(id, CP.Platform.GOOGLE_PLAY);
    const offer = p && p.getOffer();
    if (!offer) return false;
    const err = await offer.order();
    return !err;
  };
  iap.restore = async () => { if (store) await store.restorePurchases(); };

  // ------------------------------------------------------------------
  // Native Kleinigkeiten
  // ------------------------------------------------------------------
  function vibrate(ms) {
    if (isNative && N.Haptics) { N.Haptics.vibrate({ duration: ms }).catch(() => {}); return; }
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* egal */ } }
  }

  async function requestReview() {
    if (!isNative || !N.InAppReview) return;
    try { await N.InAppReview.requestReview(); } catch (e) { console.warn(e); }
  }

  function openUrl(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener");
  }

  function exitApp() { if (isNative && N.App) N.App.exitApp(); }

  function init() {
    if (isNative) {
      N.App.addListener("backButton", () => emit("back"));
      N.App.addListener("pause", () => emit("pause"));
      if (N.StatusBar) N.StatusBar.hide().catch(() => {});
      if (N.SplashScreen) N.SplashScreen.hide().catch(() => {});
      initNativeAds();
      // Cordova-Plugins sind erst nach "deviceready" verfügbar.
      if (!initIAP()) {
        document.addEventListener("deviceready", initIAP, { once: true });
      }
    } else if (fakeAds) {
      ads.available = true;
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden) emit("pause"); });
    console.log(`[Outbreak] Plattform: ${isNative ? "android" : "web"}${fakeAds ? " (Test-Werbung)" : ""}`);
  }

  return { isNative, fakeAds, cfg, ads, iap, on, init, vibrate, requestReview, openUrl, exitApp };
})();
