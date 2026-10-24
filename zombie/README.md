# Outbreak Hero – Zombie-Roguelite

Room-Clearing-Shooter: Laufen = ausweichen, **Stehenbleiben = automatisch schießen**.
Räume säubern, durch die Tür nach oben, bei jedem Level-Up 1 von 3 Skills wählen.
Läuft im Browser, als installierbare PWA und als Android-App ([`../mobile`](../mobile)).

## Inhalt
- **15 Waffen** (Pistole, Schrotflinte, MP, Magnum, Armbrust, Flammenwerfer, Sturmgewehr, Scharfschützengewehr, Sägeblattwerfer mit Abprallern, Granatwerfer, Kryo-Kanone, Tesla-Gewehr mit Kettenblitz, zielsuchender Raketenwerfer, Minigun mit Anlauf, Laserkanone) – kaufen & bis Stufe 10 upgraden, Gold-Optik ab Stufe 5
- **24 Skills** pro Run, **14 Zombie-Typen** (u. a. Springer, Brenner mit Feuerspur, Kreischer, der Gegner rasend macht, Teiler, Elektro-Zombie, Seuchenratten) mit 12 Walker-Outfits je nach Welt (Polizist, Bauarbeiter, Patient, Ärztin, Forscher, Soldat …), **Elite-Zombies** (goldene Aura, 3× Leben, mehr Beute), **2 Bosse** mit Phase 2
- **Physik & Tode**: Rückstoß als Impuls, Leichen fliegen, prallen ab, rollen und bleiben bis zum nächsten Raum liegen (in 3D zu einem Mesh zusammengefasst); Todesart je Ursache – Kopfschuss, Zerplatzen, Wegsprengen, Verbrennen, Einfrieren & Zersplittern, Stromschlag, Zerteilen; abgetrennte Köpfe und Gliedmaßen
- **Kapitel à 20 Räume** mit Versorgungsräumen (5, 15) und Bossen (10, 20), danach endlos skalierend
- **3 Welten** im Wechsel: Straße → Krankenhaus → Geheimlabor
- **3D-Grafik** (WebGL über Three.js): schräge Kamera wie bei Archero, Low-Poly-Modelle mit Cartoon-Umrissen, gemalter Schattierung, Blutflecken und Details (Haare, Rippen, Ausrüstung), Echtzeit-Schatten, Taschenlampe mit Lichtkegel, Wandlampen, Punktlichter
- **Detaillierte Texturen**: prozedurale Böden und Wände mit Normal-Maps (Fugen, Risse, Schlaglöcher werfen Streiflicht) und Glanz-Maps (nasse Pfützen, polierte Fliesen, Giftlachen)
- **Effekte**: Feuerball-Explosionen mit Rauchpilz, 3D-Fleischbrocken, Trümmer und Patronenhülsen, Level-up-Lichtsäule mit Zeitlupe, Lichtvorhang an der offenen Tür
- **Cinematics**: Kameraflug vom 3D-Hauptmenü ins Spiel, Kinobalken und Kamerazoom bei Boss-Auftritt und Boss-Tod, Abblende beim Raumwechsel, umkippende und versinkende Zombies
- **Interaktive Umgebung**: Giftfässer explodieren bei Beschuss (Kettenreaktionen!), Kisten zersplittern und lassen Münzen oder Medikits fallen; Hit-Stop bei wuchtigen Treffern
- **3 Grafikstufen** mit automatischer Anpassung: „3D + Schatten“ → „3D“ → „2D (schnell)“; ohne WebGL läuft das Spiel mit dem klassischen 2D-Renderer
- **Meta-Progression**: Talente, Waffen-Upgrades, 7-Tage-Login-Bonus
- **Shop** mit Reitern: Angebote, **8 Helden-Skins** mit drehbarer 3D-Vorschau (7 für Münzen, „Goldener Held“ per In-App-Kauf mit +10 % Münzen), **Boosts** für den nächsten Run (Zähigkeit+, Glücksbringer, Startvorteil, Schutzengel) und Überraschungskiste mit angezeigten Gewinnchancen (`mysteryOdds()` = Ziehung und Anzeige)
- **Monetarisierung** (Android): Rewarded Videos (Wiederbeleben, Münzen ×2, Skill neu würfeln, Gratis-Münzen, Tagesbonus ×2),
  Interstitial jede 3. Runde, In-App-Käufe (Starterpaket, Werbefrei, Münzpakete, Gold-Skin)
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
| `icon.svg` | Vektor-Vorlage des App-Symbols; daraus exportiert: `icons/*.png` und `../mobile/assets/*.png` (Android-Ressourcen dann per `npm run assets` in `../mobile`) |

## Lokal starten
```
python3 -m http.server 8080
# http://localhost:8080/zombie/            (auf localhost mit Test-Werbung)
# http://localhost:8080/zombie/?lang=en    (Englisch erzwingen)
```

## Veröffentlichen
- **Web**: Workflow `.github/workflows/pages.yml` deployt bei jedem Push auf `main` nach GitHub Pages.
- **Android / Play Store**: siehe [`../mobile/README.md`](../mobile/README.md) und die Checkliste [`../mobile/LAUNCH.md`](../mobile/LAUNCH.md).
