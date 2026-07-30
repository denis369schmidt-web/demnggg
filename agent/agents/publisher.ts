/**
 * PublisherAgent – der einzige Agent mit Schreibrechten auf den Channel.
 *
 * Schreibt die freigegebene Edition nach content/channel.json, legt sie
 * im Archiv ab und führt das Lauf-Protokoll (content/agent-log.json).
 * Idempotent: Existiert dieselbe Edition mit identischem Inhalt bereits,
 * wird nichts überschrieben und der Lauf als "unverändert" markiert.
 */

import type { ChannelEdition, RunLogEntry } from "../lib/types.ts";
import { fnv1a } from "../lib/rng.ts";

const LOG_LIMIT = 50;

export interface PublishResult {
  changed: boolean;
  contentHash: string;
}

function editionFingerprint(edition: ChannelEdition): string {
  // generatedAt und health absichtlich ausgenommen: nur inhaltliche
  // Änderungen sollen als "neu" gelten.
  const { generatedAt: _g, health: _h, editorial: _e, ...content } = edition;
  return fnv1a(JSON.stringify(content)).toString(16);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

export async function runPublisher(
  edition: ChannelEdition,
  channelPath: string,
  archiveDir: string,
): Promise<PublishResult> {
  const contentHash = editionFingerprint(edition);
  const existing = await readJson<ChannelEdition>(channelPath);

  if (
    existing &&
    existing.edition === edition.edition &&
    editionFingerprint(existing) === contentHash
  ) {
    return { changed: false, contentHash };
  }

  await Deno.mkdir(archiveDir, { recursive: true });

  const payload = `${JSON.stringify(edition, null, 2)}\n`;
  await Deno.writeTextFile(channelPath, payload);
  await Deno.writeTextFile(`${archiveDir}/${edition.edition}.json`, payload);

  return { changed: true, contentHash };
}

export async function appendRunLog(
  logPath: string,
  entry: RunLogEntry,
): Promise<void> {
  const log = (await readJson<RunLogEntry[]>(logPath)) ?? [];
  log.unshift(entry);
  await Deno.writeTextFile(
    logPath,
    `${JSON.stringify(log.slice(0, LOG_LIMIT), null, 2)}\n`,
  );
}
