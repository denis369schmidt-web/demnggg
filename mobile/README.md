# Outbreak Hero – Android-App (Capacitor)

Dieses Verzeichnis verpackt das Web-Spiel aus [`../zombie`](../zombie) als native
Android-App mit **AdMob-Werbung**, **Google-Play-Käufen**, Haptik, Zurück-Taste und
In-App-Bewertung. Release-Schritte bis zum Geldverdienen: [LAUNCH.md](LAUNCH.md).

## Aufbau

```
mobile/
├─ src/native.js            Brücke zu den Capacitor-Plugins (wird gebündelt)
├─ scripts/build-web.mjs    kopiert ../zombie nach www/, erzeugt config.js aus Env
├─ scripts/smoke-test.sh    Start-Test im Android-Emulator (CI)
├─ capacitor.config.json    App-ID de.outbreakhero.game, Splash-Screen
├─ android/                 natives Android-Projekt (Gradle, targetSdk 36)
├─ assets/                  Quellgrafiken für Icons & Splash (npm run assets)
└─ store/                   Store-Texte, Screenshots, Feature-Grafik, app-ads.txt
```

Das Spiel selbst kennt keine Plugins – es spricht nur mit `window.Platform`
(`zombie/platform.js`). Im Browser gibt es Test-Werbung (localhost oder `?fakeads=1`),
in der App echte AdMob-Anzeigen.

## Bauen

**Ohne lokale Installation (empfohlen):** Jeder Push auf `zombie/` oder `mobile/`
startet den Workflow *Android Build*. Ergebnis unter *Actions → Lauf → Artifacts*:

| Artifact | Inhalt |
|---|---|
| `outbreak-hero-debug-apk` | `app-debug.apk` – direkt aufs Handy laden und installieren |
| `outbreak-hero-release` | `app-release.aab` (Play Store) + `app-release.apk` – nur mit Keystore-Secrets |
| `smoke-test` | Screenshot + Logcat aus dem Emulator-Test |

**Lokal** (Node 22+, JDK 21, Android SDK / Android Studio):

```bash
cd mobile
npm ci
npm run apk:debug        # -> android/app/build/outputs/apk/debug/app-debug.apk
npx cap open android     # in Android Studio öffnen
```

## Konfiguration über GitHub-Secrets

*Settings → Secrets and variables → Actions*

| Name | Art | Zweck |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Secret | Upload-Schlüssel (Base64), aktiviert signierte Release-Builds |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Passwort des Keystores |
| `ANDROID_KEY_ALIAS` | Secret | Alias des Schlüssels |
| `ANDROID_KEY_PASSWORD` | Secret | Passwort des Schlüssels |
| `ADMOB_APP_ID` | Secret | `ca-app-pub-…~…` – ohne: Google-Test-App-ID |
| `ADMOB_REWARDED_ID` | Secret | Anzeigenblock „Rewarded“ |
| `ADMOB_INTERSTITIAL_ID` | Secret | Anzeigenblock „Interstitial“ |
| `PRIVACY_URL` | Variable | öffentliche Datenschutz-URL (GitHub Pages) |
| `PLAY_STORE_URL` | Variable | Link zum Store-Eintrag (für die Web-Version) |

Echte Anzeigen werden erst ausgeliefert, wenn **beide** Anzeigenblock-IDs gesetzt sind –
vorher immer Google-Test-Anzeigen. So kann nie versehentlich mit Test-Konfiguration
Geld verloren gehen oder mit echter Konfiguration getestet werden.

Versionsnummern: `versionName` = `version` in `package.json`, `versionCode` = laufende
Workflow-Nummer (steigt automatisch, wie vom Play Store verlangt).

## Monetarisierung im Spiel

| Platzierung | Typ | Wann |
|---|---|---|
| Wiederbeleben | Rewarded | nach dem Tod, 1× pro Run, 5-s-Countdown |
| Münzen ×2 | Rewarded | Game-Over-Bildschirm |
| Skill neu würfeln | Rewarded | Level-Up-Auswahl |
| Gratis-Münzen | Rewarded | Shop, max. 5×/Tag |
| Tagesbonus ×2 | Rewarded | Tägliche Belohnung |
| Vollbild-Werbung | Interstitial | jede 3. Runde beim Verlassen des Game-Over-Screens – nie nach einem freiwilligen Video, nie für „Werbefrei“-Käufer |
| `starter_pack` | Einmalkauf | Werbefrei + 3.000 Münzen + Armbrust |
| `no_ads` | Einmalkauf | keine Interstitials |
| `coins_1200`, `coins_7000` | Verbrauchsgut | Münzpakete |

Käufe werden ohne eigenen Server direkt nach Freigabe durch Google Play ausgeliefert
(cordova-plugin-purchase); Einmalkäufe werden beim Start wiederhergestellt.
