# Outbreak Hero – Zombie-Roguelite

Room-Clearing-Shooter: Laufen = ausweichen, **Stehenbleiben = automatisch schießen**.
Räume säubern, durch die Tür nach oben, bei jedem Level-Up 1 von 3 Skills wählen.
Läuft im Browser, als installierbare PWA und als Android-App ([`../mobile`](../mobile)).

## Inhalt
- **9 Waffen** (Pistole, Schrotflinte, MP, Armbrust, Flammenwerfer, Scharfschützengewehr, Granatwerfer, Tesla-Gewehr mit Kettenblitz, Minigun mit Anlauf) – kaufen & bis Stufe 10 upgraden, Gold-Optik ab Stufe 5
- **24 Skills** pro Run, **8 Zombie-Typen** (inkl. Zombie-Hunde und gepanzerte Riot-Zombies), **2 Bosse** mit Phase 2
- **Kapitel à 20 Räume** mit Versorgungsräumen (5, 15) und Bossen (10, 20), danach endlos skalierend
- **3 Welten** im Wechsel: Straße → Krankenhaus → Geheimlabor
- **3D-Grafik** (WebGL über Three.js): schräge Kamera wie bei Archero, Low-Poly-Modelle für alle Zombies, Bosse, Waffen und Hindernisse, Echtzeit-Schatten, Taschenlampe und Punktlichter (Mündungsfeuer, Explosionen, Feuer, Blitze), Blut/Hülsen/Brandspuren bleiben am Boden
- **3 Grafikstufen** mit automatischer Anpassung: „3D + Schatten“ → „3D“ → „2D (schnell)“; ohne WebGL läuft das Spiel mit dem klassischen 2D-Renderer
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
| `sprites.js` | Sprite-Engine: zeichnet Zombies, Spieler, Waffen, Hindernisse, Böden und Effekte prozedural und cacht sie in Geräteauflösung |
| `render3d.js` | 3D-Renderer: baut Modelle aus Grundformen, synchronisiert sie jedes Frame mit dem Spielzustand, Licht/Schatten/Partikel |
| `vendor/three.min.js` | Three.js (MIT), nur die benötigten Teile – neu bauen mit `npm run build:three` in `../mobile` |
| `platform.js` | Werbung, Käufe, native Funktionen – Web und Android hinter einer Schnittstelle |
| `game.js` | Spiel-Logik, 2D-Rendering & HUD, Meta-Progression |
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
