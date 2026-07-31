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

### Non-obvious notes
- Core flows that work headlessly in-browser: entering keywords -> "Text generieren" generates timed lyrics, and "Beat starten" plays a synthesized beat with a live `Takt-Position` counter.
- The **recording** feature (`Aufnahme starten`) calls `getUserMedia`, so it needs microphone access. In a headless/cloud VM without a mic, recording will fail with "Mikrofonzugriff verweigert" — this is expected and does not indicate a broken environment.
