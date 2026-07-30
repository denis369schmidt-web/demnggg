/**
 * EditorAgent – das Qualitätsgate der Pipeline.
 *
 * Kein Entwurf wird veröffentlicht, bevor nicht alle Gates grün sind:
 * Vollständigkeit, Frische (Dedupe gegen das Archiv), Lexikon-Check,
 * Silbendichte der Starter-Bars und saubere Reimpaare.
 * Fällt ein Gate, verwirft der Orchestrator den Entwurf und lässt
 * einen neuen Versuch mit anderem Seed generieren.
 */

import type {
  DraftContent,
  EditorReport,
  GateResult,
  HistoryEntry,
} from "../lib/types.ts";
import { BANNED_WORDS } from "../lib/data.ts";

const CHALLENGE_COOLDOWN = 5;
const MIN_SYLLABLES = 6;
const MAX_SYLLABLES = 18;

function gateCompleteness(draft: DraftContent): GateResult {
  const missing: string[] = [];
  if (!draft.challenge.task.trim()) missing.push("Challenge-Text");
  if (draft.challenge.task.includes("{")) missing.push("offene Platzhalter");
  if (draft.wordPacks.length < 3) missing.push("Wortpakete");
  if (draft.rhymePairs.length < 4) missing.push("Reimpaare");
  if (draft.starterBars.length < 4) missing.push("Starter-Bars");
  if (!draft.quote.trim()) missing.push("Zitat");

  return {
    gate: "Vollständigkeit",
    passed: missing.length === 0,
    details: missing.length === 0
      ? "Alle Bestandteile der Edition sind vorhanden."
      : `Fehlend/fehlerhaft: ${missing.join(", ")}.`,
  };
}

function gateFreshness(
  draft: DraftContent,
  history: HistoryEntry[],
): GateResult {
  const recent = history.slice(0, CHALLENGE_COOLDOWN);
  const repeatedChallenge = recent.some((entry) =>
    entry.challengeId === draft.challenge.id
  );
  const repeatedTheme = recent.some((entry) =>
    entry.themeId === draft.theme.id
  );

  const problems: string[] = [];
  if (repeatedChallenge) {
    problems.push(`Challenge „${draft.challenge.title}“ lief kürzlich`);
  }
  if (repeatedTheme) problems.push(`Thema „${draft.theme.title}“ lief kürzlich`);

  return {
    gate: "Frische",
    passed: problems.length === 0,
    details: problems.length === 0
      ? `Thema und Challenge sind neu gegenüber den letzten ${CHALLENGE_COOLDOWN} Editionen.`
      : `${problems.join("; ")}.`,
  };
}

function gateLexicon(draft: DraftContent): GateResult {
  const corpus = [
    draft.challenge.task,
    draft.challenge.constraint,
    draft.quote,
    ...draft.starterBars.map((bar) => bar.line),
    ...draft.wordPacks.flatMap((pack) => pack.words),
  ]
    .join(" ")
    .toLowerCase();

  const hits = BANNED_WORDS.filter((word) => corpus.includes(word));

  return {
    gate: "Lexikon",
    passed: hits.length === 0,
    details: hits.length === 0
      ? "Keine gesperrten Begriffe gefunden."
      : `Gesperrte Begriffe: ${hits.join(", ")}.`,
  };
}

function gateDensity(draft: DraftContent): GateResult {
  const outliers = draft.starterBars.filter(
    (bar) => bar.syllables < MIN_SYLLABLES || bar.syllables > MAX_SYLLABLES,
  );

  return {
    gate: "Silbendichte",
    passed: outliers.length === 0,
    details: outliers.length === 0
      ? `Alle Starter-Bars liegen im Zielfenster (${MIN_SYLLABLES}–${MAX_SYLLABLES} Silben).`
      : `Außerhalb des Fensters: ${
        outliers.map((bar) => `„${bar.line}“ (${bar.syllables})`).join("; ")
      }.`,
  };
}

function gateRhymes(draft: DraftContent): GateResult {
  const broken = draft.rhymePairs.filter((pair) => {
    const a = pair.a.toLowerCase();
    const b = pair.b.toLowerCase();
    return a === b || a.slice(-2) !== b.slice(-2);
  });

  return {
    gate: "Reimpaare",
    passed: broken.length === 0,
    details: broken.length === 0
      ? "Alle Reimpaare klingen auf derselben Endung."
      : `Unsaubere Paare: ${
        broken.map((pair) => `${pair.a}/${pair.b}`).join(", ")
      }.`,
  };
}

function gateWordPacks(draft: DraftContent): GateResult {
  const thin = draft.wordPacks.filter(
    (pack) => new Set(pack.words.map((w) => w.toLowerCase())).size < 5,
  );

  return {
    gate: "Wortpakete",
    passed: thin.length === 0,
    details: thin.length === 0
      ? "Jedes Wortpaket enthält mindestens fünf einzigartige Wörter."
      : `Zu dünn: ${thin.map((pack) => pack.title).join(", ")}.`,
  };
}

export function runEditor(
  draft: DraftContent,
  history: HistoryEntry[],
): EditorReport {
  const gates = [
    gateCompleteness(draft),
    gateFreshness(draft, history),
    gateLexicon(draft),
    gateDensity(draft),
    gateRhymes(draft),
    gateWordPacks(draft),
  ];

  const passedCount = gates.filter((gate) => gate.passed).length;

  // Bonuspunkte für Varianz: Anteil einzigartiger Wörter über alle Pakete.
  const allWords = draft.wordPacks.flatMap((pack) =>
    pack.words.map((w) => w.toLowerCase())
  );
  const variety = new Set(allWords).size / Math.max(1, allWords.length);

  const score = Math.round(
    (passedCount / gates.length) * 90 + variety * 10,
  );

  return {
    passed: passedCount === gates.length,
    score,
    gates,
  };
}
