# Escape from Germany – Zombie-Roguelite

Deutschland ist gefallen. Eine Zombie-Seuche hat das Land überrannt, und dein Plan ist einfach: raus hier.
Von Heilbronn quer durch die Republik bis nach Hamburg, wo die letzte Fähre – die ARCHE – ablegt.

Room-Clearing-Shooter: Laufen = ausweichen, **Stehenbleiben = automatisch schießen**.
Bezirke säubern, durch die Tür nach oben, bei jedem Level-Up 1 von 3 Skills wählen.
(Interne Kennungen wie Paket-ID `de.outbreakhero.game`, Speicherstand `outbreak-hero-v1` und `window.__outbreak` stammen vom früheren Namen „Outbreak Hero“ und bleiben, damit Spielstände und Store-Eintrag erhalten bleiben.)
Läuft im Browser, als installierbare PWA und als Android-App ([`../mobile`](../mobile)).

## Inhalt
- **Story & Fluchtroute** (v2.0): Prolog als Funkprotokoll, Fluchtplan-Karte von Deutschland mit Infektionszonen und Route, Funkspruch beim Erreichen jeder Stadt; neun Städte (Heilbronn, Stuttgart, München, Nürnberg, Leipzig, Berlin, Frankfurt, Köln, Hamburg) mit je **10 echten Stadtteilen** als Räumen – Versorgung in Bezirk 5, Boss in Bezirk 10, danach wechselt die Stadt (+Münzbonus); nach Hamburg geht es mit der ARCHE weiter durch Europa (Amsterdam, Paris, Wien, Prag)
- **Deutsche Welt**: Altstadt-Thema mit Fachwerk, Kopfsteinpflaster, Biberschwanz-Dächern, Lichterketten, Litfaßsäulen und Gartenzwergen; jede Stadt mit eigenem Fest und Wetter (Weihnachtsmarkt im Schnee in Nürnberg, Wiesn in München, Karneval mit Konfetti in Köln, Nebel am Hamburger Hafen …); interaktive Traditionen: Bierfass anzapfen (Schaumlache bremst Zombies, „O'zapft is!“), Maibaum umschießen (fällt auf Zombies), Böllerkiste zündet ein Feuerwerk, Fahrkartenautomat spuckt Kleingeld, Marktbuden geben Currywurst, Brezel, Glühwein & Co. als Heilung, Pfandflaschen als Bonus
- **6 deutsche Gegner** (v2.0) je nach Stadt: Wiesn-Zombie wirft Maßkrüge (Bierlache bremst), Jeck wirft Kamelle im Fächer, Schaffner pfeift ab („Verspätung“ = halbe Feuerrate), Beamter wirft Formulare („Ausgebremst“), Gartenzwerge im Rudel, Ultra kickt abprallende Fußbälle und zündet Bengalos
- **Hauptmenü**: Eilmeldungs-Ticker, Fluchtroute als Fortschrittsleiste mit Kfz-Kennzeichen (HN, S, M, N, L, B, F, K, HH) und Vorschau auf den nächsten Boss, saisonale Altstadt-Kulisse (Weihnachtsmarkt im Winter, Karneval im Februar, Wiesn im Herbst), Polizeihubschrauber mit Suchscheinwerfer und Rotorgeräusch, tropfendes Logo mit gelegentlichem Glitch
- **Startstadt Heilbronn** (v2.2): Hauptbahnhof, Neckarmeile, Marktplatz, Klinikum Gesundbrunnen, Kiliansplatz, Böckingen, Experimenta, Theresienwiese, Neckarhafen und Wartberg; Heilbronner Weindorf mit Weinfässern (Trollinger-Lache, „Proscht!“), Rebzeilen (Trauben heilen) und Zwiebelkuchen, Herbstlaub und Stadtbahngleise; der Kiliansturm mit dem „Männle“ ragt über die Dächer, am Marktplatz läuft die Kunstuhr des Rathauses; neuer Gegner Wengerter (Weingärtner mit Rückenspritze – lila Sprühkegel bremst) und Boss Götz von Berlichingen, der Ritter mit der eisernen Hand (Faustschlag im Kegel, Ritter-Ansturm, Armbrust-Salve) am Wartberg
- **Stadt-Bosse** (v2.1): jede Stadt hat ihren eigenen Endgegner mit drei Attacken, Warnflächen (Linie, Kegel, Kreis) und Phase 2 mit Helfern – Zugführer (Lok-Ansturm, Kohlewürfe, Pfiff), Krampus (Kettenpeitsche, explodierende Geschenke, Sprung), Bierkönig (rollende Fässer, Bauchklatscher, Maßkrug-Salven), Narrenkönig (Kamelle-Spirale, Konfettikanone, Sprünge), Klabautermann (zurückkehrender Anker, Harpunen, Nebelhorn); dazu Abscheulichkeit und Brutmutter; Boss-Auftritt mit Beinamen; im Überlebensmodus täglich wechselnde Bosse
- **3 neue Gegner** (v2.1): E-Scooter-Fahrer (Sprint entlang einer angekündigten Linie), Paketbote (Pakete piepen und explodieren), Rentner (Schirm blockt Schüsse von vorn – flankieren!)
- **Neue Objekte & Texturen** (v2.1): Altglascontainer (Scherbenteppich schneidet Zombies), Toilettenhäuschen (Gestank vergiftet Zombies), Telefonzelle (Lichtquelle), Tannenbaum (Kugeln, Lichter, Münzen), Strandkorb (Hamburg); Straßenbahngleise im Asphalt, Graffiti an den Häuserwänden- **15 Waffen** (Pistole, Schrotflinte, MP, Magnum, Armbrust, Flammenwerfer, Sturmgewehr, Scharfschützengewehr, Sägeblattwerfer mit Abprallern, Granatwerfer, Kryo-Kanone, Tesla-Gewehr mit Kettenblitz, zielsuchender Raketenwerfer, Minigun mit Anlauf, Laserkanone) – kaufen & bis Stufe 10 upgraden, Gold-Optik ab Stufe 5
- **24 Skills** pro Run, **32 Zombie-Typen + 8 Bosse** (u. a. Springer, Brenner mit Feuerspur, Kreischer, der Gegner rasend macht, Teiler, Elektro-Zombie, Seuchenratten) mit 12 Walker-Outfits je nach Welt (Polizist, Bauarbeiter, Patient, Ärztin, Forscher, Soldat …), **Elite-Zombies** (goldene Aura, 3× Leben, mehr Beute), **8 Bosse** mit Phase 2
- **Physik & Tode**: Rückstoß als Impuls, Leichen fliegen, prallen ab, rollen und bleiben bis zum nächsten Raum liegen (in 3D zu einem Mesh zusammengefasst); Todesart je Ursache – Kopfschuss, Zerplatzen, Wegsprengen, Verbrennen, Einfrieren & Zersplittern, Stromschlag, Zerteilen; abgetrennte Köpfe und Gliedmaßen
- **8 neue Gegner mit eigener Mechanik** (v1.9): Seuchenpriester heilt Zombies per Strahl, Brocken wirft Beton im Bogen (roter Zielkreis), Wühler gräbt sich ein und bricht unter dem Helden hervor, Schemen wird unsichtbar und taucht woanders auf, Schildwächter verteilt Energieschilde, Gasbläher platzt zur Giftwolke, Brutnest spuckt Ratten und Kriecher, Zombie-Schütze zielt mit rotem Laser und feuert Salven; **Bestiarium** im Kodex mit Bild, Taktik-Tipp und Abschusszähler
- **Interaktiver Soundtrack** (`audio.js`, alles synthetisch): Step-Sequencer mit Ebenen, die dem Kampf folgen (Flächen → Bass → Schlagzeug → Arpeggio), eigene Boss-Ebene (Braam, Taikos, Chor), Rausch-Ebene im Adrenalin, Herzschlag bei wenig Leben, Dämpfung in der Pause; Stinger für Boss, Raum frei, Level-up, Sieg, Tod; Ambiente je Welt (Regen, Netzbrummen, Maschinen, Sirenen, Stöhnen) über Hall und Kompressor; Bedien-Klänge; Musik separat abschaltbar
- **Kino-Atmosphäre**: Regen mit Spritzern und Blitzen samt Donner (Straße), flackernde Leuchtstoffröhren und Stromausfälle (Krankenhaus), Alarm-Rundumleuchten (Labor), Bodennebel, volumetrische Lichtkegel, 3D-Requisiten an den Wänden, Filmkorn und Vignette (Einstellung „Kino-Effekte“)
- **AAA-Hauptmenü**: Kamera fliegt ein und kreist um den beleuchteten Helden, der im Regen Zombies niederschießt; Streifenwagen mit Blaulicht; Held, Waffe und Einsatzart direkt im Menü wählen (Pfeile oder Wischen, zweites Antippen startet), Kamera per Ziehen drehen
- **4D-Effekte**: Vibrationsmuster zu Explosionen, Bossen, Donner, Rückstoß und Herzschlag; Handy neigen schwenkt die Menükamera (Einstellung „4D-Bewegung“)
- **Kombo & Adrenalin**: Abschüsse in Folge (2,4 s Fenster) bauen eine Kombo auf; Stufen 5/10/20/35/50/75/100 bringen Ansage, Münzbonus und Sound, jede 20er-Stufe einen 6-s-Adrenalinrausch (+40 % Feuerrate, +15 % Tempo, kurze Zeitlupe); beste Kombo im Bericht, als Erfolg und Mission
- **Treffer auf Körper**: Schüsse schieben liegende Leichen weg und zerfetzen sie nach einigen Treffern; Köpfe und Gliedmaßen am Boden werden weggekickt; Krits und wuchtige Treffer schießen menschlichen Zombies einen Arm ab (in 3D fehlt er am Modell, der Stumpf spritzt im Herzschlag, der Zombie schlägt schwächer zu)
- **Blut**: Lachen wachsen unter Leichen und Körperteilen langsam auf, frisches Blut glänzt in 3D nass (gedeckelte Glanz-Map), Austrittswunden sprühen nach hinten, Blutnebel, Halsschlagader-Fontänen, Tropfspuren schwer verletzter Zombies, schnelle Tropfen als Streifen, Blutspritzer auf dem Bildschirm bei schweren Treffern und Zerplatzen in der Nähe
- **2 Spielmodi**: Kampagne (Kapitel à 20 Räume mit Versorgungsräumen 5/15 und Bossen 10/20, danach endlos skalierend) und **Überlebensmodus** (5-Minuten-Countdown, immer dichtere Wellen, Zwischenboss bei 2:30, Endboss bei 4:20, Welt wechselt täglich, Rekordzeit)
- **8 Skill-Evolutionen** (Kugelhagel, Inferno, Absoluter Nullpunkt, Klingensturm, Drohnenschwarm, Blutrausch, Kettenreaktion, Seuche): zwei Skills auf Stufe verschmelzen; jede Skill-Karte zeigt Rezept und Fortschritt, die fertige Evolution erscheint garantiert; Kodex im Menü
- **Engel & Teufel** nach jedem Boss: Heilung + max. HP, Extra-Skill – oder Teufelspakt (2 epische Skills gegen 25 % max. HP)
- **4 Welten**: Straße, Altstadt, Krankenhaus und Geheimlabor – welche, bestimmt der jeweilige Stadtteil
- **3D-Grafik** (WebGL über Three.js): schräge Kamera wie bei Archero, Low-Poly-Modelle mit Cartoon-Umrissen, gemalter Schattierung, Blutflecken und Details (Haare, Rippen, Ausrüstung), Echtzeit-Schatten, Taschenlampe mit Lichtkegel, Wandlampen, Punktlichter
- **Detaillierte Texturen**: prozedurale Böden und Wände mit Normal-Maps (Fugen, Risse, Schlaglöcher werfen Streiflicht) und Glanz-Maps (nasse Pfützen, polierte Fliesen, Giftlachen); Wände, Dächer und Hindernisse in doppelter Auflösung mit Gebrauchsspuren (Holzmaserung, Rost, Kratzer, Einschusslöcher, Schmutzfahnen, Blutspritzer)
- **Effekte**: Feuerball-Explosionen mit Rauchpilz, 3D-Fleischbrocken, Trümmer und Patronenhülsen, Level-up-Lichtsäule mit Zeitlupe, Lichtvorhang an der offenen Tür
- **Cinematics**: Kameraflug vom 3D-Hauptmenü ins Spiel, Kinobalken und Kamerazoom bei Boss-Auftritt und Boss-Tod, Abblende beim Raumwechsel, umkippende und versinkende Zombies
- **Interaktive Umgebung**: Giftfässer explodieren bei Beschuss (Kettenreaktionen!), Kisten zersplittern und lassen Münzen oder Medikits fallen; Hit-Stop bei wuchtigen Treffern
- **3 Grafikstufen** mit automatischer Anpassung: unter Last sinkt zuerst die 3D-Auflösung in Stufen (100 % → 85 % → 72 %, kaum sichtbar), erst danach die Stufe „3D + Schatten“ → „3D“ → „2D (schnell)“; läuft es wieder flüssig, steigt die Auflösung zurück. Ohne WebGL läuft das Spiel mit dem klassischen 2D-Renderer
- **Leistung & Akku**: höchstens 60 Bilder/s auch auf 90/120-Hz-Displays, Einstellung „Akku sparen (30 FPS)“, kein Rendern hinter undurchsichtigen Menüs und in der Pause; Figuren in 3D mit starrem Skinning im Vertex-Shader (2 Draw Calls statt ~13 je Figur), alle Shader werden beim Raumaufbau vorab übersetzt (keine Ruckler bei der ersten Explosion), die Boden-Normal-Map entsteht per Shader auf der GPU (Raumwechsel ~10 ms statt ~1 s), HUD und Banner als gecachte Ebenen; das Startbild der App verschwindet erst nach dem ersten fertigen Bild
- **Meta-Progression**: Talente, Waffen-Upgrades, 7-Tage-Login-Bonus
- **Missionen**: 3 Tagesmissionen + Tagesbonus, 4 Wochenmissionen (für alle Spieler am selben Tag gleich), **Erfolge** in Bronze/Silber/Gold, Statistik
- **Saisonpass**: 28-Tage-Saisons, 30 Stufen, Gratis-Spur für alle, Premium-Spur per In-App-Kauf (doppelte Belohnungen + exklusiver Skin „Seuchenjäger“)
- **Patrouille**: Münzen sammeln sich offline an (bis 12 h, Ertrag steigt mit dem Rekordkapitel), ×2 per Video, 2 Schnellpatrouillen pro Tag
- **Kein Energiesystem**: spielen, so lange man will – bewusster Unterschied zur Konkurrenz
- **Shop** mit Reitern: Angebote, **8 Helden-Skins** mit drehbarer 3D-Vorschau (7 für Münzen, „Goldener Held“ per In-App-Kauf mit +10 % Münzen), **Boosts** für den nächsten Run (Zähigkeit+, Glücksbringer, Startvorteil, Schutzengel) und Überraschungskiste mit angezeigten Gewinnchancen (`mysteryOdds()` = Ziehung und Anzeige)
- **Monetarisierung** (Android): Rewarded Videos (Wiederbeleben, Münzen ×2, Skill neu würfeln, Gratis-Münzen, Tagesbonus ×2),
  Interstitial jede 3. Runde, In-App-Käufe (Starterpaket, Werbefrei, Münzpakete, Gold-Skin, Saisonpass)
- **Deutsch & Englisch** (automatisch nach Gerätesprache, umschaltbar in den Einstellungen)
- **Eigenes Design-System** „Quarantäne-Einsatzkommando“: abgeschrägte Ecken, Warnstreifen, Sechseck-Medaillen, segmentierte Fortschrittsbalken, einheitliche Icons statt Emojis, eigene Schriften – Menüs, Fenster und Canvas-HUD sprechen dieselbe Formensprache
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
| `vendor/fonts/` | Schriften Teko, Barlow Condensed, Barlow, Saira Stencil One (SIL OFL, Lizenztexte liegen bei) |
| `vendor/icons.js` | Icon-Sprite aus [game-icons.net](https://game-icons.net) (CC BY 3.0) für HTML (`GameIcons.html`) und Canvas (`GameIcons.path2d`) – Schriften und Icons neu bauen mit `npm run build:ui` in `../mobile` |
| `platform.js` | Werbung, Käufe, native Funktionen (inkl. Vibrationsmuster `haptic`) – Web und Android hinter einer Schnittstelle |
| `audio.js` | Audio-Engine: Mischpult mit Hall, interaktiver Soundtrack, Stinger, Ambiente, Bedien-Klänge (`window.GameAudio`) |
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

## Lizenzen & Danksagung
- Icons: [game-icons.net](https://game-icons.net) von Lorc, Delapouite und Mitwirkenden – [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Die Namensnennung steht im Spiel unter Einstellungen.
- Schriften: Teko, Barlow, Barlow Condensed, Saira Stencil One – [SIL Open Font License 1.1](https://openfontlicense.org) (Lizenztexte in `vendor/fonts/`).
- Three.js – MIT-Lizenz.
