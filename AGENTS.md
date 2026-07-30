# AGENTS.md

## Cursor Cloud specific instructions

### Product
`FlowForge – Rap Trainer` is a single, client-side static web app (German UI). All logic lives in the repo root:
- `index.html` — UI shell
- `style.css` — styling
- `game.js` — all app logic (lyric generation, Web Audio beat, mic recording with FX)

There is **no backend, no database, no build step, and no package manager** (no `package.json`, `Makefile`, etc.). The `.github/workflows/deno.yml` and `neon_workflow.yml` files are unused CI boilerplate that do not match this codebase; ignore them for local development.

### Run (dev)
Serve the repo root as static files and open it over `http://localhost` (a secure context is required for the microphone/recording feature):
```
python3 -m http.server 8080 --directory /workspace
```
Then open `http://localhost:8080/index.html`.

### Lint / Test / Build
None are defined for the app (no lint config, no tests, no build). Serve the files as-is.

### Non-obvious notes
- Core flows that work headlessly in-browser: entering keywords -> "Text generieren" generates timed lyrics, and "Beat starten" plays a synthesized beat with a live `Takt-Position` counter.
- The **recording** feature (`Aufnahme starten`) calls `getUserMedia`, so it needs microphone access. In a headless/cloud VM without a mic, recording will fail with "Mikrofonzugriff verweigert" — this is expected and does not indicate a broken environment.
