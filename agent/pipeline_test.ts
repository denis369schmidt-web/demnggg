import { assertEquals, assertExists } from "@std/assert";
import { runPipeline } from "./pipeline.ts";
import type { ChannelEdition, RunLogEntry } from "./lib/types.ts";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(path)) as T;
}

Deno.test("Pipeline veröffentlicht eine vollständige Edition", async () => {
  const contentDir = await Deno.makeTempDir();

  const result = await runPipeline({
    contentDir,
    date: new Date("2026-07-30T00:00:00Z"),
  });

  assertExists(result.edition);
  assertEquals(result.log.status, "veröffentlicht");

  const channel = await readJson<ChannelEdition>(`${contentDir}/channel.json`);
  assertEquals(channel.edition, "2026-07-30");
  assertEquals(channel.wordPacks.length, 3);
  assertEquals(channel.starterBars.length, 4);
  assertEquals(channel.editorial.gates.every((gate) => gate.passed), true);

  const archived = await readJson<ChannelEdition>(
    `${contentDir}/archive/2026-07-30.json`,
  );
  assertEquals(archived.edition, channel.edition);

  const log = await readJson<RunLogEntry[]>(`${contentDir}/agent-log.json`);
  assertEquals(log.length, 1);
  assertEquals(log[0].stages.some((stage) => stage.name === "Publisher"), true);
});

Deno.test("Pipeline ist idempotent: Re-Run am selben Tag ändert nichts", async () => {
  const contentDir = await Deno.makeTempDir();
  const date = new Date("2026-07-30T00:00:00Z");

  const first = await runPipeline({ contentDir, date });
  const before = await Deno.readTextFile(`${contentDir}/channel.json`);

  const second = await runPipeline({ contentDir, date });
  const after = await Deno.readTextFile(`${contentDir}/channel.json`);

  assertEquals(first.log.status, "veröffentlicht");
  assertEquals(second.log.status, "unverändert");
  assertEquals(before, after);
});

Deno.test("Aufeinanderfolgende Tage bekommen frische Themen", async () => {
  const contentDir = await Deno.makeTempDir();
  const themes: string[] = [];

  for (let day = 1; day <= 5; day += 1) {
    const date = new Date(
      `2026-08-${String(day).padStart(2, "0")}T00:00:00Z`,
    );
    const result = await runPipeline({ contentDir, date });
    assertExists(result.edition);
    themes.push(result.edition.theme.id);
  }

  assertEquals(new Set(themes).size, themes.length);
});
