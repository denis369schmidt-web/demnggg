/**
 * YouTube-Publisher-CLI (deno task youtube).
 *
 * Liest die aktuelle Channel-Edition, synthetisiert den Übungs-Beat,
 * rendert das Daily-Video, prüft die Metadaten-Gates und lädt das
 * Ergebnis auf YouTube hoch. Verhält sich in jeder Situation gutmütig:
 *
 *  - Ohne Secrets:            sauberer Skip (Exit 0) – der Rest der
 *                             Pipeline läuft unbeeinflusst weiter.
 *  - Auth/Config kaputt:      Soft-Skip (Exit 0) mit Hinweis – Channel
 *                             darf nie an YouTube hängenbleiben.
 *  - Edition schon online:    Skip (Idempotenz über content/youtube-log.json).
 *  - YOUTUBE_DRY_RUN=1:       rendert alles, lädt aber nichts hoch.
 *  - Gate verletzt:           Abbruch mit Exit 1, nichts wird hochgeladen.
 */

import type { ChannelEdition } from "../lib/types.ts";
import { renderBeatWav } from "./audio.ts";
import { renderVideo } from "./video.ts";
import { buildVideoMetadata, gateVideoMetadata } from "./metadata.ts";
import {
  credentialsFromEnv,
  isRecoverableAuthError,
  refreshAccessToken,
  uploadVideo,
} from "./youtube.ts";

interface UploadLogEntry {
  edition: string;
  uploadedAt: string;
  videoId: string;
  url: string;
  privacy: string;
}

const contentDir = new URL("../../content", import.meta.url).pathname;
const channelPath = `${contentDir}/channel.json`;
const uploadLogPath = `${contentDir}/youtube-log.json`;

const dryRun = Deno.env.get("YOUTUBE_DRY_RUN") === "1";
const privacy = Deno.env.get("YOUTUBE_PRIVACY") ?? "public";

const credentials = credentialsFromEnv();
if (!credentials && !dryRun) {
  console.log(
    "YouTube-Upload übersprungen: Secrets fehlen (YOUTUBE_CLIENT_ID, " +
      "YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN).",
  );
  console.log(
    "Einrichtung: `deno task setup:youtube` lokal ausführen – siehe README.",
  );
  Deno.exit(0);
}

let edition: ChannelEdition;
try {
  edition = JSON.parse(await Deno.readTextFile(channelPath)) as ChannelEdition;
} catch {
  console.error(`Keine Channel-Edition gefunden (${channelPath}).`);
  console.error("Zuerst `deno task agent` ausführen.");
  Deno.exit(1);
}

let uploadLog: UploadLogEntry[] = [];
try {
  uploadLog = JSON.parse(
    await Deno.readTextFile(uploadLogPath),
  ) as UploadLogEntry[];
} catch {
  // Noch kein Upload-Log vorhanden.
}

if (uploadLog.some((entry) => entry.edition === edition.edition)) {
  console.log(
    `Edition ${edition.edition} ist bereits auf YouTube – nichts zu tun.`,
  );
  Deno.exit(0);
}

console.log(`YouTube-Publisher – Edition ${edition.edition}`);
console.log("─".repeat(56));

// 1) Beat synthetisieren
const beat = renderBeatWav(edition.beatPreset.bpm, edition.edition);
console.log(
  `✔ Audio        ${edition.beatPreset.bpm} BPM, ${beat.bars} Bars, ${
    beat.seconds.toFixed(1)
  } s`,
);

// 2) Video rendern
const workDir = await Deno.makeTempDir({ prefix: "flowforge-video-" });
const audioPath = `${workDir}/beat.wav`;
const videoPath = `${workDir}/daily.mp4`;
await Deno.writeFile(audioPath, beat.wav);
await renderVideo({ edition, audioPath, outPath: videoPath, workDir });
const videoSize = (await Deno.stat(videoPath)).size;
console.log(
  `✔ Video        1080p, ${(videoSize / 1024 / 1024).toFixed(1)} MB (${videoPath})`,
);

// 3) Metadaten bauen und Gates prüfen
const metadata = buildVideoMetadata(edition, privacy);
const gates = gateVideoMetadata(metadata);
for (const gate of gates) {
  console.log(`${gate.passed ? "✔" : "✘"} Gate ${gate.gate.padEnd(12)} ${gate.details}`);
}
if (gates.some((gate) => !gate.passed)) {
  console.error("Metadaten-Gate verletzt – Upload abgebrochen.");
  Deno.exit(1);
}

// 4) Upload
if (dryRun) {
  console.log("─".repeat(56));
  console.log(`Dry-Run: Upload übersprungen. Titel wäre: „${metadata.title}“`);
  Deno.exit(0);
}

let accessToken: string;
try {
  accessToken = await refreshAccessToken(credentials!);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (isRecoverableAuthError(message)) {
    console.error("YouTube-Upload übersprungen (Auth/Config):");
    console.error(message);
    console.error(
      "Channel-Edition bleibt davon unberührt. Secrets neu einrichten: " +
        "`deno task setup:youtube` → GitHub Secrets aktualisieren.",
    );
    Deno.exit(0);
  }
  throw error;
}

try {
  const result = await uploadVideo(accessToken, videoPath, metadata);

  uploadLog.unshift({
    edition: edition.edition,
    uploadedAt: new Date().toISOString(),
    videoId: result.videoId,
    url: result.url,
    privacy,
  });
  await Deno.writeTextFile(
    uploadLogPath,
    `${JSON.stringify(uploadLog.slice(0, 100), null, 2)}\n`,
  );

  console.log("─".repeat(56));
  console.log(`✔ Hochgeladen: ${result.url} (${privacy})`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (isRecoverableAuthError(message)) {
    console.error("YouTube-Upload übersprungen (Auth/Config):");
    console.error(message);
    Deno.exit(0);
  }
  throw error;
}
