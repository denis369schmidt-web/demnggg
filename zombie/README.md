# Outbreak Hero – Zombie-Roguelite

Room-Clearing-Shooter: Laufen = ausweichen, **Stehenbleiben = automatisch schießen**.
Räume säubern, durch die Tür nach oben, bei jedem Level-Up 1 von 3 Skills wählen.
Läuft im Browser, als installierbare PWA und als Android-App ([`../mobile`](../mobile)).

## Inhalt
- **7 Waffen** (Pistole, Schrotflinte, MP, Armbrust, Flammenwerfer, Scharfschützengewehr, Granatwerfer) – kaufen & bis Stufe 10 upgraden
- **24 Skills** pro Run, **6 Zombie-Typen**, **2 Bosse** mit Phase 2
- **Kapitel à 20 Räume** mit Versorgungsräumen (5, 15) und Bossen (10, 20), danach endlos skalierend
- **Meta-Progression**: Talente, Waffen-Upgrades, 7-Tage-Login-Bonus, Shop
- **Monetarisierung** (Android): Rewarded Videos (Wiederbeleben, Münzen ×2, Skill neu würfeln, Gratis-Münzen, Tagesbonus ×2),
  Interstitial jede 3. Runde, In-App-Käufe (Starterpaket, Werbefrei, Münzpakete)
- **Deutsch & Englisch** (automatisch nach Gerätesprache, umschaltbar in den Einstellungen)
- Tutorial, Touch-Joystick, Tastatur (WASD/Pfeile, P = Pause), Haptik, synthetischer Sound, offline-fähig

## Dateien
| Datei | Aufgabe |
|---|---|
| `index.html`, `style.css` | Oberfläche & Menüs |
| `config.js` | Versionsnummer, AdMob-IDs, Produkt-IDs (für Android aus Secrets erzeugt) |
| `i18n.js` | Übersetzungen (Deutsch ist Schlüssel, Englisch für alle anderen Sprachen) |
| `platform.js` | Werbung, Käufe, native Funktionen – Web und Android hinter einer Schnittstelle |
| `game.js` | Spiel-Logik, Rendering, Meta-Progression |
| `privacy.html` | Datenschutzerklärung (vor Release ausfüllen!) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA / Offline |

## Lokal starten
```
python3 -m http.server 8080
# http://localhost:8080/zombie/            (auf localhost mit Test-Werbung)
# http://localhost:8080/zombie/?lang=en    (Englisch erzwingen)
```

## Veröffentlichen
- **Web**: Workflow `.github/workflows/pages.yml` deployt bei jedem Push auf `main` nach GitHub Pages.
- **Android / Play Store**: siehe [`../mobile/README.md`](../mobile/README.md) und die Checkliste [`../mobile/LAUNCH.md`](../mobile/LAUNCH.md).
