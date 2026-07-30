/**
 * MaintenanceAgent – pflegt den Channel.
 *
 * Räumt das Archiv auf (Rolling Window), prüft die Datenlage und
 * erstellt den Health-Report, der im Dashboard angezeigt wird.
 */

import type { HealthReport } from "../lib/types.ts";

export const ARCHIVE_LIMIT = 30;

export interface MaintenanceResult {
  health: HealthReport;
  prunedFiles: string[];
}

export async function runMaintenance(
  archiveDir: string,
  currentEdition: string,
): Promise<MaintenanceResult> {
  const editions: string[] = [];

  try {
    for await (const entry of Deno.readDir(archiveDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        editions.push(entry.name.replace(/\.json$/, ""));
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  editions.sort().reverse();

  const toPrune = editions.slice(ARCHIVE_LIMIT);
  for (const edition of toPrune) {
    await Deno.remove(`${archiveDir}/${edition}.json`);
  }

  const kept = editions.slice(0, ARCHIVE_LIMIT);
  const notes: string[] = [];

  const latestArchived = kept[0];
  let status: HealthReport["status"] = "gruen";

  if (kept.length === 0) {
    notes.push("Erster Lauf: Archiv wird neu aufgebaut.");
    status = "gelb";
  } else if (latestArchived < isoDaysAgo(currentEdition, 2)) {
    notes.push(
      `Letzte archivierte Edition (${latestArchived}) ist älter als 2 Tage.`,
    );
    status = "gelb";
  } else {
    notes.push("Archiv ist aktuell und vollständig.");
  }

  if (toPrune.length > 0) {
    notes.push(
      `${toPrune.length} alte Edition(en) aus dem Archiv entfernt (Limit: ${ARCHIVE_LIMIT}).`,
    );
  }

  return {
    health: {
      status,
      editionCount: kept.length + 1,
      latestEdition: currentEdition,
      archivedEditions: kept.length,
      prunedEditions: toPrune.length,
      notes,
    },
    prunedFiles: toPrune.map((edition) => `${edition}.json`),
  };
}

function isoDaysAgo(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
