/**
 * CLI-Einstiegspunkt der Content-Pipeline.
 *
 *   deno task agent                    # Edition für heute (UTC)
 *   AGENT_DATE=2026-08-01 deno task agent   # Backfill/Vorschau für ein Datum
 */

import { runPipeline } from "./pipeline.ts";

const dateOverride = Deno.env.get("AGENT_DATE");
const date = dateOverride ? new Date(`${dateOverride}T00:00:00Z`) : undefined;

if (date && Number.isNaN(date.getTime())) {
  console.error(`Ungültiges AGENT_DATE: ${dateOverride} (erwartet YYYY-MM-DD)`);
  Deno.exit(1);
}

const contentDir = new URL("../content", import.meta.url).pathname;
const result = await runPipeline({ contentDir, date });

console.log(`\nFlowForge Content-Agent – Edition ${result.log.edition}`);
console.log("─".repeat(56));
for (const stage of result.log.stages) {
  console.log(`${stage.ok ? "✔" : "✘"} ${stage.name.padEnd(12)} ${stage.summary}`);
}
console.log("─".repeat(56));
console.log(
  `Status: ${result.log.status} | Score: ${result.log.score} | Dauer: ${result.log.durationMs} ms`,
);

if (result.log.status === "abgelehnt") {
  console.error(
    "Kein Entwurf hat die Qualitätsgates bestanden – nichts veröffentlicht.",
  );
  Deno.exit(1);
}
