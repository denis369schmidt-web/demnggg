# Launch-Checkliste: vom Code zum ersten Euro

Alles, was im Code automatisierbar war, ist erledigt (Spiel, Werbung, Käufe, Consent,
Android-Build, Emulator-Test, Store-Grafiken, Datenschutzerklärung). Die folgenden
Schritte brauchen **deine Identität, deine Konten oder deine Unterschrift** – die
kann niemand für dich erledigen.

## 1. Rechtliches & Konten (einmalig)

- [ ] **Gewerbe anmelden** (Gewerbeamt, ca. 20–60 €). Einnahmen aus Werbung/Käufen sind gewerblich.
      Steuerliche Fragen (Kleinunternehmerregelung § 19 UStG, Einkommensteuer) mit Steuerberater/Finanzamt klären.
      Hinweis: Google Play führt die Umsatzsteuer auf In-App-Käufe an EU-Kunden selbst ab.
- [ ] **Google-Play-Entwicklerkonto** (einmalig 25 US-$): https://play.google.com/console – Identitätsprüfung dauert einige Tage.
      Als Händler (Trader) werden Name, Adresse, Telefon und E-Mail im Store angezeigt (EU-Pflicht).
- [ ] **Zahlungsprofil** in der Play Console anlegen (für Käufe) und Bankkonto hinterlegen.
- [ ] **AdMob-Konto**: https://admob.google.com – Zahlungs- und Steuerdaten hinterlegen.

## 2. Datenschutzerklärung veröffentlichen

- [ ] In `zombie/privacy.html` alle gelb markierten Felder (**BITTE AUSFÜLLEN**) ausfüllen: Name, Anschrift, E-Mail.
- [ ] GitHub Pages aktivieren: *Settings → Pages → Source: GitHub Actions*. Nach dem nächsten Push auf `main`
      ist das Spiel unter `https://<user>.github.io/<repo>/` und die Erklärung unter `…/privacy.html` online.
- [ ] Repository-Variable `PRIVACY_URL` auf diese URL setzen.

## 3. AdMob einrichten

- [ ] AdMob → *Apps → App hinzufügen* → Android → „Noch nicht im Store“ → Name „Outbreak Hero“.
- [ ] Zwei Anzeigenblöcke anlegen: **Prämie (Rewarded)** und **Interstitial**.
- [ ] Secrets setzen: `ADMOB_APP_ID` (`ca-app-pub-…~…`), `ADMOB_REWARDED_ID`, `ADMOB_INTERSTITIAL_ID` (`ca-app-pub-…/…`).
- [ ] AdMob → *Datenschutz & Mitteilungen* → **DSGVO-Mitteilung** erstellen und veröffentlichen
      (das Spiel zeigt sie über Googles UMP automatisch an).
- [ ] ⚠️ **Nie auf eigene echte Anzeigen klicken** – das führt zur Kontosperre. Eigene Testgeräte in AdMob als Testgerät eintragen.
- [ ] Nach dem Store-Release: App in AdMob mit dem Play-Store-Eintrag verknüpfen und `store/app-ads.txt` veröffentlichen.

## 4. Signatur-Schlüssel (einmalig – NIEMALS verlieren)

```bash
keytool -genkeypair -v -keystore outbreak-upload.jks -alias outbreak \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 outbreak-upload.jks > outbreak-upload.b64   # macOS: base64 -i outbreak-upload.jks
```

- [ ] Secrets setzen: `ANDROID_KEYSTORE_BASE64` (Inhalt der .b64-Datei), `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS` (= `outbreak`), `ANDROID_KEY_PASSWORD`.
- [ ] Keystore + Passwörter sicher sichern (Passwort-Manager + Offline-Kopie). Mit **Play App Signing** (Standard)
      ist es nur der Upload-Schlüssel – bei Verlust kann Google ihn zurücksetzen, es kostet aber Zeit.
- [ ] Workflow *Android Build* manuell starten (*Actions → Android Build → Run workflow*) →
      Artifact `outbreak-hero-release` enthält `app-release.aab`.

## 5. Play Console: App anlegen

- [ ] *App erstellen* → Name „Outbreak Hero: Zombie Shooter“, Standardsprache Deutsch, **Spiel**, **Kostenlos**.
- [ ] Paketname ist `de.outbreakhero.game` – **nach dem ersten Upload nicht mehr änderbar**.
      Anders gewünscht? Vorher `applicationId` in `android/app/build.gradle` und `appId` in `capacitor.config.json` ändern.
- [ ] **Store-Eintrag**: Texte aus `store/listing.md`, Grafiken aus `store/de` und `store/en`, Icon `zombie/icons/icon-512.png`.
- [ ] **App-Inhalte** (*Richtlinien → App-Inhalte*):
  - Datenschutzerklärung: URL aus Schritt 2
  - Werbung: **Ja, enthält Werbung**
  - App-Zugriff: alle Funktionen ohne Anmeldung verfügbar
  - Einstufung (IARC-Fragebogen): Fantasy-Gewalt gegen nicht-menschliche Kreaturen, stilisiertes Blut, keine echten Waffen-Käufe, keine Glücksspiele → voraussichtlich USK/PEGI 12
  - Zielgruppe: **16–17 und 18+** (vermeidet die strengeren Familien-Richtlinien; passt zur Datenschutzerklärung)
  - Datensicherheit: Angaben für das Google Mobile Ads SDK gemäß
    https://developers.google.com/admob/android/privacy/play-data-disclosure übernehmen
    (u. a. Geräte-IDs, ungefährer Standort, App-Interaktionen, Diagnosedaten; Übertragung verschlüsselt; kein Konto → keine Kontolöschung nötig).
    Käufe wickelt Google Play ab.
- [ ] **In-App-Produkte** (*Monetarisieren → Produkte → In-App-Produkte*) – IDs exakt so anlegen und aktivieren:

| Produkt-ID | Name | Typ im Spiel | Preisvorschlag |
|---|---|---|---|
| `starter_pack` | Starterpaket | Einmalkauf | 3,99 € |
| `no_ads` | Werbefrei | Einmalkauf | 2,99 € |
| `coins_1200` | Münzbeutel | Verbrauchsgut | 0,99 € |
| `coins_7000` | Münztruhe | Verbrauchsgut | 4,99 € |

  (In der Play Console sind alle vier „In-App-Produkte“; ob verbrauchbar oder nicht, regelt das Spiel.)

## 6. Testen & Freigabe

- [ ] **Interner Test**: AAB hochladen, dich selbst als Tester eintragen, über den Opt-in-Link installieren.
      Unter *Einstellungen → Lizenztests* deine Google-Adresse eintragen → Testkäufe kosten nichts.
- [ ] Prüfen: Consent-Dialog erscheint (in der EU), Rewarded-Video → Belohnung, Kauf → Münzen/Werbefrei, App neu installieren → „Käufe wiederherstellen“.
- [ ] **Geschlossener Test**: Neue private Entwicklerkonten brauchen vor der Produktion einen geschlossenen Test mit
      **mindestens 12 Testern über 14 Tage am Stück**. Freunde/Familie/Communitys (z. B. Reddit r/AndroidClosedTesting) einladen.
- [ ] Danach *Produktion → Zugriff beantragen* → Release erstellen → Länder wählen (Spiel ist DE + EN, also weltweit sinnvoll).

## 7. Nach dem Launch: Wachstum = Umsatz

Umsatz ≈ **täglich aktive Spieler × Einnahmen pro Spieler**. Der Code liefert die Einnahmen pro Spieler –
die Spieler musst du holen:

- **Kurzvideos** (TikTok, YouTube Shorts, Instagram Reels): 15–30 s Gameplay mit vielen Projektilen/Bossen,
  1 Video pro Tag. Das ist für Solo-Entwickler der günstigste Kanal.
- **Bewertungen**: Das Spiel fragt nach dem ersten Bosssieg automatisch nach einer Bewertung (Google In-App Review).
- **Store-Eintrag optimieren**: Play Console → *Store-Eintrag-Tests* (A/B-Test von Icon und Screenshots).
- **Kennzahlen beobachten** (Play Console + AdMob): Tag-1-Retention (Ziel > 35 %), Rewarded-Views pro Spieler,
  eCPM nach Land. Balancing anpassen, wenn Spieler früh abbrechen.
- **Updates**: alle 2–4 Wochen neue Inhalte (Kapitel, Waffe, Boss) – Updates bringen Spieler zurück und verbessern das Ranking.

Realistische Erwartung: Die ersten Wochen bringen meist Cent- bis niedrige Euro-Beträge pro Tag. Spürbare Einnahmen
entstehen erst ab einigen tausend täglich aktiven Spielern – das ist eine Marketing-Aufgabe, keine Code-Aufgabe.
