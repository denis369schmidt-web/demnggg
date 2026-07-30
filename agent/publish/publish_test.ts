import { assertEquals } from "@std/assert";
import { renderBeatWav } from "./audio.ts";
import { buildVideoMetadata, gateVideoMetadata } from "./metadata.ts";
import { wrapText } from "./video.ts";
import { runPipeline } from "../pipeline.ts";
import type { ChannelEdition } from "../lib/types.ts";

async function sampleEdition(): Promise<ChannelEdition> {
  const contentDir = await Deno.makeTempDir();
  const result = await runPipeline({
    contentDir,
    date: new Date("2026-07-30T00:00:00Z"),
  });
  if (!result.edition) throw new Error("Pipeline lieferte keine Edition");
  return result.edition;
}

Deno.test("Beat-Renderer erzeugt gültiges, deterministisches WAV", () => {
  const first = renderBeatWav(92, "2026-07-30");
  const second = renderBeatWav(92, "2026-07-30");

  const header = new TextDecoder().decode(first.wav.slice(0, 4));
  assertEquals(header, "RIFF");
  assertEquals(new TextDecoder().decode(first.wav.slice(8, 12)), "WAVE");

  const view = new DataView(first.wav.buffer);
  assertEquals(view.getUint32(24, true), 44100);

  assertEquals(first.seconds > 40 && first.seconds < 90, true);
  assertEquals(first.wav.length, second.wav.length);

  // Nicht stumm: mindestens ein Sample deutlich über Null.
  let peak = 0;
  for (let i = 44; i < first.wav.length; i += 2) {
    peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  }
  assertEquals(peak > 8000, true);
});

Deno.test("Video-Metadaten respektieren YouTube-Limits", async () => {
  const edition = await sampleEdition();
  const metadata = buildVideoMetadata(edition, "unlisted");

  assertEquals(metadata.title.length <= 100, true);
  assertEquals(metadata.description.length <= 5000, true);
  assertEquals(metadata.tags.join("").length <= 480, true);
  assertEquals(metadata.privacyStatus, "unlisted");
  assertEquals(metadata.description.includes(edition.challenge.task), true);

  const gates = gateVideoMetadata(metadata);
  assertEquals(gates.every((gate) => gate.passed), true);
});

Deno.test("Metadaten-Gate blockt gesperrte Begriffe", async () => {
  const edition = await sampleEdition();
  const metadata = buildVideoMetadata(edition);
  metadata.description += "\nGewalt";

  const lexikon = gateVideoMetadata(metadata).find((g) => g.gate === "Lexikon");
  assertEquals(lexikon?.passed, false);
});

Deno.test("wrapText bricht lange Zeilen sauber um", () => {
  const wrapped = wrapText(
    "Dies ist ein ziemlich langer Satz der definitiv umgebrochen werden muss",
    24,
  );
  const lines = wrapped.split("\n");
  assertEquals(lines.length >= 3, true);
  assertEquals(lines.every((line) => line.length <= 24), true);
});
