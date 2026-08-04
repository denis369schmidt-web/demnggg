# FlowForge – Rap Trainer mit autonomem Content-Agenten

FlowForge ist ein browserbasierter Rap-Trainer (Lyrics-Generator, Beat-Engine,
Aufnahme mit Live-Effekten). Seit dieser Version pflegt ein **autonomes
Multi-Agent-System** den „Daily Channel“ der App: Es erstellt jeden Tag neuen
Trainings-Content, prüft ihn gegen Qualitätsgates, veröffentlicht ihn
selbstständig ins Repository und hält Archiv & Protokoll aktuell – ganz ohne
manuelle Arbeit.

## Architektur des Agent-Systems

Das Design folgt den Best Practices produktiver Content-Ops-Systeme:
**spezialisierte Agents statt eines Generalisten, strukturierte Übergaben,
harte Qualitätsgates vor dem Publishing und ein Scheduler als Orchestrator.**

```
              GitHub Actions (Cron, täglich 05:17 UTC)
                              │
                              ▼
┌────────────┐   Brief   ┌────────────┐   Entwurf  ┌────────────┐
│  Research  │──────────▶│   Draft    │───────────▶│   Editor   │
│  Agent     │           │   Agent    │            │   Agent    │
└────────────┘           └────────────┘            └─────┬──────┘
      ▲                                                  │
      │          abgelehnt: neuer Versuch (max. 5)       │
      └──────────────────────────────────────────────────┤
                                                         │ freigegeben
                                                         ▼
                        ┌──────────────┐        ┌────────────┐
                        │ Maintenance  │───────▶│ Publisher  │
                        │ Agent        │        │ Agent      │
                        └──────────────┘        └────────────┘
                        Archiv & Health         channel.json,
                        pflegen                 Archiv, Log
```

| Agent | Aufgabe |
| --- | --- |
| **ResearchAgent** | Wählt Thema (mit 5-Tage-Cooldown), Trend-Wörter, Flow-Technik und Beat-Richtung. |
| **DraftAgent** | Baut die Edition: Tages-Challenge, 3 Wortpakete, Reimpaare, Starter-Bars, Zitat, Beat-Preset. |
| **EditorAgent** | 6 Qualitätsgates: Vollständigkeit, Frische (Dedupe gegen Archiv), Lexikon, Silbendichte, Reimpaare, Wortpakete. Fällt eines, wird der Entwurf verworfen und neu generiert. |
| **MaintenanceAgent** | Rolling-Window-Archiv (30 Editionen), bereinigt Altbestand, erstellt den Health-Report. |
| **PublisherAgent** | Einziger Agent mit Schreibrecht auf den Channel. Schreibt `content/channel.json` + Archiv, führt das Lauf-Protokoll. Idempotent per Content-Hash. |

### Eigenschaften

- **Deterministisch & idempotent:** Jede Edition wird aus dem Datum geseedet.
  Re-Runs am selben Tag erzeugen identischen Content; der Publisher erkennt
  das und ändert nichts (kein Commit-Rauschen).
- **Qualität vor Volumen:** Veröffentlicht wird nur, was alle Gates besteht.
  Besteht nach 5 Versuchen kein Entwurf, schlägt der Lauf sichtbar fehl.
- **Selbstpflegend:** Archiv-Pruning, Health-Report und Lauf-Protokoll laufen
  in jeder Ausführung mit („den Channel pflegen und aktualisieren“).
- **Doppeltes Gate in CI:** Der Publishing-Workflow führt vor jedem Lauf
  `deno lint` und `deno test -A` aus – dieselben Checks wie die CI.

## Dateien

```
agent/
  mod.ts                  CLI-Einstieg (deno task agent)
  pipeline.ts             Orchestrator (Research → … → Publisher)
  agents/                 Die fünf spezialisierten Agents
  lib/                    Typen, seeded RNG, Content-Pools
  *_test.ts               Tests für Gates und Pipeline
content/
  channel.json            Aktuelle Edition (wird vom Frontend geladen)
  archive/                Letzte 30 Editionen
  agent-log.json          Protokoll der letzten 50 Läufe
.github/workflows/
  content-agent.yml       Täglicher Publishing-Workflow (Cron + manuell)
  deno.yml                CI: Lint + Tests
index.html / game.js      Rap-Trainer inkl. „Daily Channel“-Panel
agents.html / agents.js   Agent-Dashboard (Pipeline, Health, Gates, Log)
```

## Bedienung

**Lokal ausführen** (benötigt [Deno](https://deno.com) 2.x):

```bash
deno task agent                      # Edition für heute erzeugen
AGENT_DATE=2026-08-01 deno task agent   # Edition für ein bestimmtes Datum
deno task test                       # Tests
deno task lint                       # Lint
```

**Website lokal ansehen:**

```bash
deno run -A jsr:@std/http/file-server .
# dann http://localhost:8000 öffnen
```

**Automatik:** Der Workflow `.github/workflows/content-agent.yml` läuft täglich
um 05:17 UTC (und manuell über „Run workflow“). Er generiert die Edition,
committet sie als `chore(agent): Channel-Edition YYYY-MM-DD` und pusht auf
`main`. Das Frontend zeigt den neuen Content beim nächsten Seitenaufruf.

## Content erweitern

Alle redaktionellen Bausteine liegen in `agent/lib/data.ts`: Themen,
Challenge-Vorlagen, Zusatzregeln, Reimpaare, Flow-Tipps, Zitate, Wort-Pools
und Beat-Patterns. Neue Einträge dort werden ab dem nächsten Lauf automatisch
in Editionen eingemischt – die Tests sichern ab, dass die Gates weiter halten.

## YouTube-Autopilot

Der Workflow kann jede Edition zusätzlich als **Daily-Video auf YouTube**
veröffentlichen: Die Pipeline synthetisiert den Übungs-Beat der Edition als
Audio (gleiche Drum-Logik wie die App: Kick-Sweep, Bandpass-Snare, Hi-Hat),
rendert daraus per ffmpeg ein 1080p-Video mit Challenge, Zusatzregel und
Beat-Infos im FlowForge-Look und lädt es über die YouTube Data API hoch –
inklusive eigenem Metadaten-Gate (Titel-/Beschreibungs-/Tag-Limits, Lexikon).

Der Upload ist idempotent (`content/youtube-log.json` merkt sich jede
Edition) und wird **sauber übersprungen**, wenn keine Secrets hinterlegt
sind **oder** die OAuth-Credentials ungültig sind (z. B. gelöschter
Client / `deleted_client`). In beiden Fällen läuft der Channel-Publish
unbeeindruckt weiter – YouTube blockiert den Daily Content nie.

Im Workflow wird die Channel-Edition **vor** dem optionalen YouTube-Schritt
committed; Auth-Fehler können den Push nicht mehr verhindern.

### Einmalige Einrichtung (~10 Minuten)

1. In der [Google Cloud Console](https://console.cloud.google.com) ein
   Projekt anlegen, die **YouTube Data API v3** aktivieren und unter
   „APIs & Dienste → Anmeldedaten“ einen **OAuth-Client** vom Typ
   „Desktop-App“ erstellen.
2. Lokal das Setup-Skript ausführen und den Google-Login bestätigen:

   ```bash
   deno task setup:youtube
   ```

   Das Skript gibt die drei fertigen Werte aus.
3. Die Werte im GitHub-Repo unter **Settings → Secrets and variables →
   Actions** als Secrets anlegen:
   `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.

Ab dem nächsten Lauf lädt der Workflow das Daily-Video automatisch hoch.
Optional steuert die Repository-Variable `YOUTUBE_PRIVACY`
(`public` | `unlisted` | `private`, Standard `public`) die Sichtbarkeit.

**Lokal testen ohne Upload:**

```bash
YOUTUBE_DRY_RUN=1 deno task youtube   # rendert Beat + Video, lädt nichts hoch
```

## Ausbaustufen (optional)

- **Weitere Kanäle:** Instagram/TikTok/X analog zum YouTube-Publisher – pro
  Zielplattform ein eigener Publisher mit eigenem Gate unter `agent/publish/`.
- **Review-Modus:** Statt direkt auf `main` zu pushen, kann der Workflow auf
  Pull-Request-Publishing umgestellt werden (menschliches Freigabe-Gate).
