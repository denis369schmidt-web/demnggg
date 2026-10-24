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

### Outbreak Hero (Zombie-Spiel)
- `zombie/` — eigenständiges Canvas-Spiel (Vanilla JS, keine Abhängigkeiten): `game.js` (Logik, 2D-Renderer, HUD), `render3d.js` (3D-Renderer mit Three.js aus `vendor/three.min.js`, gebaut per `npm run build:three` in `mobile/`), `sprites.js` (prozedurale, gecachte Grafiken), `platform.js` (Werbung/Käufe/native Funktionen hinter `window.Platform`), `i18n.js` (DE/EN), `config.js`. Oberfläche: Design-Tokens in `style.css`, Schriften (`vendor/fonts/`, SIL OFL) und Icon-Sprite (`vendor/icons.js`, game-icons.net CC BY 3.0) werden per `npm run build:ui` in `mobile/` erzeugt und committet – neue Icons in `mobile/scripts/build-ui.mjs` (Map `ICONS`) eintragen, im Code `GameIcons.html(name)` bzw. `<i data-ic="name">`, im Canvas `GameIcons.path2d(name)`; keine Emojis in der UI. Lokal: `http://localhost:8080/zombie/` – auf localhost erscheint Test-Werbung statt AdMob.
- `mobile/` — Capacitor-8-Android-Projekt (Node 22, JDK 21). `npm ci && npm run sync` kopiert `zombie/` nach `mobile/www` und bündelt die Plugins. Ein Android-SDK ist in der Cloud-VM nicht verfügbar; gebaut und im Emulator getestet wird über `.github/workflows/android.yml`.
- `mobile/` ist per `deno.json` von Deno ausgeschlossen; `zombie/` von Lint/Format.
- Test-Hook im Browser: `window.__outbreak` (state, run, player, enemies, bullets, particles, zaps, save, hurt, spawn, freeze, mode3d, setGfx(q, lock), obstacles, orbs, corpses, pieces, boom(x, y, r), levelUp(), hit(e, dmg, opts), evolve(id), passInfo); auf localhost simuliert `Platform.iap.simulate(id)` eine Kaufbestätigung (z. B. `season_pass`). Grafikstufen `save.gfx`: 2 = 3D + Schatten, 1 = 3D, 0 = 2D; das Spiel senkt sie bei niedriger FPS automatisch (`setGfx(q, true)` sperrt das für Tests). Headless-Chromium rendert WebGL nur per SwiftShader (CPU) – für 3D-Screenshots mit `--use-angle=swiftshader --enable-unsafe-swiftshader` starten; die FPS dort sind kein Maßstab für echte Geräte. Weil dort nur wenige Bilder pro Sekunde laufen, vergeht die Spielzeit viel langsamer als die Echtzeit: Tests sollten auf Spielzeit warten (`run.time`, `run.survT`, `corpse.t`), nicht auf feste Millisekunden. `Render3D.debug` gibt Szene, Kamera und Renderer frei.

### Non-obvious notes
- Core flows that work headlessly in-browser: entering keywords -> "Text generieren" generates timed lyrics, and "Beat starten" plays a synthesized beat with a live `Takt-Position` counter.
- The **recording** feature (`Aufnahme starten`) calls `getUserMedia`, so it needs microphone access. In a headless/cloud VM without a mic, recording will fail with "Mikrofonzugriff verweigert" — this is expected and does not indicate a broken environment.
