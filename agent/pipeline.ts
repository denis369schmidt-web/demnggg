/**
 * Orchestrator der Content-Pipeline.
 *
 * Ablauf pro Lauf (eine Edition pro Kalendertag, UTC):
 *
 *   ResearchAgent ──> DraftAgent ──> EditorAgent (Qualitätsgates)
 *        ▲                                │ abgelehnt: neuer Seed
 *        └────────── bis zu 5 Versuche ◄──┘
 *                                         │ freigegeben
 *   MaintenanceAgent (Archiv & Health) ──> PublisherAgent (Channel + Log)
 *
 * Die Pipeline ist deterministisch pro Datum und damit idempotent:
 * Mehrfache Läufe am selben Tag ändern den Channel nicht erneut.
 */

import type {
  ChannelEdition,
  DraftContent,
  EditorReport,
  HistoryEntry,
  RunLogEntry,
  StageResult,
} from "./lib/types.ts";
import { Rng } from "./lib/rng.ts";
import { runResearch } from "./agents/research.ts";
import { runDraft } from "./agents/draft.ts";
import { runEditor } from "./agents/editor.ts";
import { runMaintenance } from "./agents/maintenance.ts";
import { appendRunLog, runPublisher } from "./agents/publisher.ts";

export const SCHEMA_VERSION = 1;
const MAX_ATTEMPTS = 5;

export interface PipelineOptions {
  contentDir: string;
  /** Editionsdatum (UTC). Standard: heute. */
  date?: Date;
  now?: Date;
}

export interface PipelineResult {
  edition: ChannelEdition | undefined;
  log: RunLogEntry;
}

async function loadHistory(archiveDir: string): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];

  try {
    for await (const file of Deno.readDir(archiveDir)) {
      if (!file.isFile || !file.name.endsWith(".json")) continue;
      const raw = await Deno.readTextFile(`${archiveDir}/${file.name}`);
      const parsed = JSON.parse(raw) as ChannelEdition;
      entries.push({
        edition: parsed.edition,
        themeId: parsed.theme.id,
        challengeId: parsed.challenge.id,
        wordPackIds: parsed.wordPacks.map((pack) => pack.id),
      });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  return entries.sort((a, b) => b.edition.localeCompare(a.edition));
}

export async function runPipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const startedAt = performance.now();
  const now = options.now ?? new Date();
  const editionDate = (options.date ?? now).toISOString().slice(0, 10);

  const contentDir = options.contentDir.replace(/\/$/, "");
  const archiveDir = `${contentDir}/archive`;
  const channelPath = `${contentDir}/channel.json`;
  const logPath = `${contentDir}/agent-log.json`;

  await Deno.mkdir(archiveDir, { recursive: true });

  const stages: StageResult[] = [];
  const history = await loadHistory(archiveDir);
  // Die eigene Edition zählt bei Re-Runs nicht als "kürzlich gelaufen".
  const dedupeHistory = history.filter((entry) =>
    entry.edition !== editionDate
  );

  let draft: DraftContent | undefined;
  let report: EditorReport | undefined;
  let attempt = 0;

  for (attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rng = new Rng(`${editionDate}#${attempt}`);
    const brief = runResearch(editionDate, rng, dedupeHistory);
    const candidate = runDraft(brief, rng, attempt);
    const review = runEditor(candidate, dedupeHistory);

    if (review.passed) {
      draft = candidate;
      report = review;
      stages.push({
        name: "Research",
        ok: true,
        summary:
          `Thema „${brief.theme.title}“, ${brief.beatPattern} @ ${brief.bpm} BPM.`,
      });
      stages.push({
        name: "Draft",
        ok: true,
        summary:
          `Challenge „${candidate.challenge.title}“ (${candidate.challenge.bars} Bars), Versuch ${
            attempt + 1
          }.`,
      });
      stages.push({
        name: "Editor",
        ok: true,
        summary: `${review.gates.length}/${review.gates.length} Gates grün, Score ${review.score}.`,
      });
      break;
    }

    const failed = review.gates
      .filter((gate) => !gate.passed)
      .map((gate) => gate.gate)
      .join(", ");
    stages.push({
      name: "Editor",
      ok: false,
      summary: `Versuch ${attempt + 1} abgelehnt (${failed}).`,
    });
  }

  if (!draft || !report) {
    const log: RunLogEntry = {
      runAt: now.toISOString(),
      edition: editionDate,
      attempt,
      status: "abgelehnt",
      score: 0,
      durationMs: Math.round(performance.now() - startedAt),
      stages,
    };
    await appendRunLog(logPath, log);
    return { edition: undefined, log };
  }

  const maintenance = await runMaintenance(archiveDir, editionDate);
  stages.push({
    name: "Maintenance",
    ok: true,
    summary: `Archiv: ${maintenance.health.archivedEditions} Editionen, ${
      maintenance.prunedFiles.length
    } bereinigt, Status ${maintenance.health.status}.`,
  });

  const edition: ChannelEdition = {
    schemaVersion: SCHEMA_VERSION,
    edition: editionDate,
    generatedAt: now.toISOString(),
    attempt: draft.attempt,
    theme: draft.theme,
    challenge: draft.challenge,
    wordPacks: draft.wordPacks,
    rhymePairs: draft.rhymePairs,
    starterBars: draft.starterBars,
    flowTip: draft.flowTip,
    quote: draft.quote,
    beatPreset: draft.beatPreset,
    editorial: {
      score: report.score,
      gates: report.gates,
    },
    health: maintenance.health,
  };

  const publish = await runPublisher(edition, channelPath, archiveDir);
  stages.push({
    name: "Publisher",
    ok: true,
    summary: publish.changed
      ? `Edition ${editionDate} veröffentlicht (Hash ${publish.contentHash}).`
      : `Edition ${editionDate} unverändert – kein erneutes Publishing.`,
  });

  const log: RunLogEntry = {
    runAt: now.toISOString(),
    edition: editionDate,
    attempt: draft.attempt,
    status: publish.changed ? "veröffentlicht" : "unverändert",
    score: report.score,
    durationMs: Math.round(performance.now() - startedAt),
    stages,
  };
  await appendRunLog(logPath, log);

  return { edition, log };
}
