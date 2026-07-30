import { assertEquals } from "@std/assert";
import { runEditor } from "./agents/editor.ts";
import { runDraft } from "./agents/draft.ts";
import { runResearch } from "./agents/research.ts";
import { Rng } from "./lib/rng.ts";
import type { DraftContent, HistoryEntry } from "./lib/types.ts";

function buildDraft(seed = "2026-07-30#0"): DraftContent {
  const rng = new Rng(seed);
  const brief = runResearch("2026-07-30", rng, []);
  return runDraft(brief, rng, 0);
}

function gate(draft: DraftContent, history: HistoryEntry[], name: string) {
  const report = runEditor(draft, history);
  const result = report.gates.find((entry) => entry.gate === name);
  if (!result) throw new Error(`Gate ${name} fehlt im Report`);
  return result;
}

Deno.test("Editor gibt einen sauberen Entwurf frei", () => {
  const report = runEditor(buildDraft(), []);
  assertEquals(report.passed, true);
  assertEquals(report.gates.every((entry) => entry.passed), true);
  assertEquals(report.score >= 90, true);
});

Deno.test("Frische-Gate blockt kürzlich gelaufene Themen und Challenges", () => {
  const draft = buildDraft();
  const history: HistoryEntry[] = [{
    edition: "2026-07-29",
    themeId: draft.theme.id,
    challengeId: draft.challenge.id,
    wordPackIds: [],
  }];

  const result = gate(draft, history, "Frische");
  assertEquals(result.passed, false);
});

Deno.test("Lexikon-Gate blockt gesperrte Begriffe", () => {
  const draft = buildDraft();
  draft.quote = "Zeilen über Gewalt gehören nicht in den Channel.";

  const result = gate(draft, [], "Lexikon");
  assertEquals(result.passed, false);
});

Deno.test("Reim-Gate blockt Paare ohne gemeinsame Endung", () => {
  const draft = buildDraft();
  draft.rhymePairs = [
    { a: "Takt", b: "exakt" },
    { a: "Flow", b: "Anker" },
  ];

  const result = gate(draft, [], "Reimpaare");
  assertEquals(result.passed, false);
});

Deno.test("Dichte-Gate blockt überlange Starter-Bars", () => {
  const draft = buildDraft();
  draft.starterBars = [{
    line:
      "Diese Zeile hat absichtlich viel zu viele Silben für eine einzige saubere Bar im mittleren Tempo eines Beats",
    syllables: 34,
  }, ...draft.starterBars.slice(1)];

  const result = gate(draft, [], "Silbendichte");
  assertEquals(result.passed, false);
});

Deno.test("Vollständigkeits-Gate blockt offene Platzhalter", () => {
  const draft = buildDraft();
  draft.challenge = { ...draft.challenge, task: "Schreibe {bars} Bars." };

  const result = gate(draft, [], "Vollständigkeit");
  assertEquals(result.passed, false);
});
