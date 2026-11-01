# AGENTS.md

## Cursor Cloud specific instructions

### Product
`FlowForge – Rap Trainer` is a client-side static web app (German UI) plus an autonomous content-agent system (Deno/TypeScript):
- `index.html` — UI shell (trainer + "Daily Channel" panel)
- `style.css` — styling
- `game.js` — app logic (lyric generation, Web Audio beat, mic recording with FX)
- `channel.js` / `agents.html` / `agents.js` — channel feed and agent dashboard
- `agent/` — multi-agent content pipeline (research → draft → editor gates → maintenance → publisher) and YouTube publisher (`agent/publish/`)
- `content/` — generated channel editions, archive, and run logs (committed by CI)
- `.github/workflows/content-agent.yml` — daily cron that generates content, optionally uploads the daily video to YouTube (needs `YOUTUBE_*` secrets), and pushes to `main`

There is **no backend, no database, and no package manager**; the agent system runs on Deno (see `deno.json` tasks). `neon_workflow.yml` is unused boilerplate.

### Run (dev)
Serve the repo root as static files and open it over `http://localhost` (a secure context is required for the microphone/recording feature):
```
python3 -m http.server 8080 --directory /workspace
```
Then open `http://localhost:8080/index.html`.

### Lint / Test / Build
The static app has no build step. The agent system uses Deno (install via `curl -fsSL https://deno.land/install.sh | sh`):
- `deno task lint` — lints the TypeScript agent code (browser JS files are excluded via `deno.json`)
- `deno task test` — runs all agent/pipeline/publish tests
- `deno task agent` — generates today's channel edition into `content/`
- `YOUTUBE_DRY_RUN=1 deno task youtube` — renders beat + daily video without uploading (requires `ffmpeg`)

CI (`.github/workflows/deno.yml`) runs `deno lint` and `deno test -A` on pushes/PRs to `main`.

### Escape from Germany (Zombie-Spiel, früher „Outbreak Hero“)
- `zombie/` — eigenständiges Canvas-Spiel (Vanilla JS, keine Abhängigkeiten): `game.js` (Logik, 2D-Renderer, HUD), `render3d.js` (3D-Renderer mit Three.js aus `vendor/three.min.js`, gebaut per `npm run build:three` in `mobile/`), `sprites.js` (prozedurale, gecachte Grafiken), `platform.js` (Werbung/Käufe/native Funktionen hinter `window.Platform`), `audio.js` (synthetische Audio-Engine `window.GameAudio`: Mischpult, interaktiver Soundtrack, Ambiente), `i18n.js` (DE/EN), `config.js`. Oberfläche: Design-Tokens in `style.css`, Schriften (`vendor/fonts/`, SIL OFL) und Icon-Sprite (`vendor/icons.js`, game-icons.net CC BY 3.0) werden per `npm run build:ui` in `mobile/` erzeugt und committet – neue Icons in `mobile/scripts/build-ui.mjs` (Map `ICONS`) eintragen, im Code `GameIcons.html(name)` bzw. `<i data-ic="name">`, im Canvas `GameIcons.path2d(name)`; keine Emojis in der UI. Lokal: `http://localhost:8080/zombie/` – auf localhost erscheint Test-Werbung statt AdMob.
- Story & Städte (v2.0): Interne Kapitel haben weiter 20 Räume; jedes Kapitel umfasst zwei Städte aus `CITIES` (`cityIdx = (chapter-1)*2 + (room>10)`, `districtIdx = (room-1)%10`, Versorgung = Bezirk 5, Boss = Bezirk 10). Jeder Bezirk bestimmt das Thema (`street`, `markt` = Altstadt, `hospital`, `lab`); Stadt-Feste/-Wetter (`curFest()`, `curWeather()`) steuern Hindernis-Mischung, Boden (Schnee/Konfetti/Laub) und 3D-Atmosphäre. Beim Stadtwechsel pausiert das Spiel im Zustand `"story"` (Overlay `#route` mit Funkspruch und Karte); beim Einsatzstart erscheint der Prolog nur, solange `save.storySeen` false ist – Tests setzen `storySeen: true` im Spielstand, sonst wartet der Run auf „Weiter“. Interne Kennungen (`outbreak-hero-v1`, `de.outbreakhero.game`, `OUTBREAK_CONFIG`, `window.__outbreak`, `[Outbreak]`-Logs) bleiben unverändert – der Smoke-Test greift die Logs ab.
- Deutsche Gegner (`wiesn`, `jeck`, `schaffner`, `beamter`, `zwerg`, `ultra`) kommen über `curCity().foes` ab Bezirk 2 in den Wellen-Pool; ihre Sonderprojektile sind `eBullets` mit `kind` (`candy`, `paper`, `ball` – Ball prallt nur beim Eintreten in ein Hindernis ab), der Maßkrug ist ein `lobs`-Eintrag mit `kind: "krug"`. Spieler-Schwächungen: `player.slowT` (Tempo ×0,55) und `player.jamT` (Feuerrate ×0,5), gesetzt über `debuff()`.
- `mobile/` — Capacitor-8-Android-Projekt (Node 22, JDK 21). `npm ci && npm run sync` kopiert `zombie/` nach `mobile/www` und bündelt die Plugins. Ein Android-SDK ist in der Cloud-VM nicht verfügbar; gebaut und im Emulator getestet wird über `.github/workflows/android.yml`.
- `mobile/` ist per `deno.json` von Deno ausgeschlossen; `zombie/` von Lint/Format.
- Test-Hook im Browser: `window.__outbreak` (state, run, player, enemies, bullets, eBullets, particles, zaps, save, hurt, spawn, freeze, mode3d, setGfx(q, lock), obstacles, orbs, corpses, pieces, pools, screenBlood, lobs, beams, hazards, shoot(x, y, ang, opts), boom(x, y, r), levelUp(), nextRoom(), unfreeze(), hit(e, dmg, opts), evolve(id), passInfo); auf localhost simuliert `Platform.iap.simulate(id)` eine Kaufbestätigung (z. B. `season_pass`). Grafikstufen `save.gfx`: 2 = 3D + Schatten, 1 = 3D, 0 = 2D; das Spiel senkt sie bei niedriger FPS automatisch (`setGfx(q, true)` sperrt das für Tests). Headless-Chromium rendert WebGL nur per SwiftShader (CPU) – für 3D-Screenshots mit `--use-angle=swiftshader --enable-unsafe-swiftshader` starten; die FPS dort sind kein Maßstab für echte Geräte. Weil dort nur wenige Bilder pro Sekunde laufen, vergeht die Spielzeit viel langsamer als die Echtzeit: Tests sollten auf Spielzeit warten (`run.time`, `run.survT`, `corpse.t`), nicht auf feste Millisekunden. `Render3D.debug` gibt Szene, Kamera, Renderer, `models` (Gegner → Modell) und `atmo` (Regen/Blitz-Zustand; `atmo.bolt = 0` löst einen Blitz aus) frei; `GameAudio.debug` zeigt Musikmodus, Intensität und Ebenen-Lautstärken (Headless-Tests mit `--autoplay-policy=no-user-gesture-required`). Unsichtbare Gegnerzustände (eingegrabener Wühler, verschwundener Schemen) nutzen `e.under` plus `spawnT = 9` als Sperre – alles, was `spawnT > 0` überspringt (Zielen, Treffer, Kollision), behandelt sie automatisch richtig. Blut-Glanz wird mit `lighten` auf `BLOOD_GLOSS` gedeckelt – voller Glanz wäscht das Rot im Spekularlicht zu Rosa aus. Wand-/Dach-/Hindernis-Texturen (`tex()` in `render3d.js`) entstehen in doppelter Auflösung (`TEX_SCALE`), gezeichnet wird weiter in logischen Pixeln. Figuren werden in `bakeParts` zu einem Mesh mit Knoten-Index je Vertex verschmolzen (Animation über `partMat`-Uniforms im Vertex-Shader, `updateParts` vor jedem Zeichnen); Modelle mit mehr als 8 Knoten (Bosse) nutzen den alten Weg je Knoten. Die Boden-Normal-Map entsteht in `gpuNormalMap` als Render-Textur (nicht klonbar – Wand-/Hindernis-Normal-Maps bleiben deshalb auf der CPU, ihre Quell-Leinwände sind `willReadFrequently`); nie `getImageData`/`toDataURL` auf GPU-Leinwänden im Spielablauf (blockierendes Zurücklesen). Neue three.js-Klassen in `render3d.js` müssen in `mobile/scripts/build-three.mjs` (Liste `names`) stehen, dann `npm run build:three`. Shader-Fehlerprüfung (`checkShaderErrors`) ist nur auf localhost im Browser aktiv; Leistungsmessungen daher mit `Render3D.debug.renderer.debug.checkShaderErrors = false`. Der Bildtakt ist auf 60 (Einstellung `save.fps30`: 30) begrenzt, hinter `.screen`-Overlays und in der Pause wird nicht gezeichnet – Tests, die Canvas-Bilder erwarten, müssen im Spiel bzw. im Menü messen.

### Non-obvious notes
- Core flows that work headlessly in-browser: entering keywords -> "Text generieren" generates timed lyrics, and "Beat starten" plays a synthesized beat with a live `Takt-Position` counter.
- The **recording** feature (`Aufnahme starten`) calls `getUserMedia`, so it needs microphone access. In a headless/cloud VM without a mic, recording will fail with "Mikrofonzugriff verweigert" — this is expected and does not indicate a broken environment.
