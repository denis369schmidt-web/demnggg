/**
 * DraftAgent
 *
 * Baut aus dem Research-Brief den kompletten Editionsentwurf:
 * Tages-Challenge, Wortpakete, Reimpaare, Starter-Bars, Flow-Tipp,
 * Zitat und Beat-Preset.
 */

import type {
  DraftContent,
  ResearchBrief,
  StarterBar,
  WordPack,
} from "../lib/types.ts";
import type { Rng } from "../lib/rng.ts";
import {
  BEAT_PATTERNS,
  CHALLENGE_TEMPLATES,
  CONSTRAINTS,
  FEELING_WORDS,
  IMAGE_WORDS,
  MOTION_WORDS,
  QUOTES,
  RHYME_PAIRS,
  STARTER_TEMPLATES,
} from "../lib/data.ts";

export function estimateSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words.reduce((sum, word) => {
    const vowelGroups = word.match(/[aeiouyäöü]+/g);
    return sum + Math.max(1, vowelGroups ? vowelGroups.length : 1);
  }, 0);
}

function buildWordPacks(brief: ResearchBrief, rng: Rng): WordPack[] {
  return [
    {
      id: `${brief.theme.id}-thema`,
      title: `Thema: ${brief.theme.title}`,
      words: rng.sample(brief.theme.keywords, 6),
    },
    {
      id: `${brief.edition}-bilder`,
      title: "Bilder & Metaphern",
      words: rng.sample(IMAGE_WORDS, 6),
    },
    {
      id: `${brief.edition}-energie`,
      title: "Gefühl & Bewegung",
      words: [
        ...rng.sample(FEELING_WORDS, 3),
        ...rng.sample(MOTION_WORDS, 3),
      ],
    },
  ];
}

function buildStarterBars(brief: ResearchBrief, rng: Rng): StarterBar[] {
  const templates = rng.sample(STARTER_TEMPLATES, 4);
  return templates.map((template) => {
    const line = template
      .replaceAll("{k0}", brief.trendWords[0])
      .replaceAll("{k1}", brief.trendWords[1])
      .replaceAll("{k2}", brief.trendWords[2]);
    return { line, syllables: estimateSyllables(line) };
  });
}

export function runDraft(
  brief: ResearchBrief,
  rng: Rng,
  attempt: number,
): DraftContent {
  const wordPacks = buildWordPacks(brief, rng);
  const template = rng.pick(CHALLENGE_TEMPLATES);
  const bars = rng.pick([8, 8, 12, 16]);

  const task = template.task
    .replaceAll("{theme}", brief.theme.title)
    .replaceAll("{bars}", String(bars))
    .replaceAll("{pack}", wordPacks[2].title);

  const beat = BEAT_PATTERNS.find((entry) =>
    entry.pattern === brief.beatPattern
  ) ?? BEAT_PATTERNS[0];

  return {
    edition: brief.edition,
    attempt,
    theme: brief.theme,
    challenge: {
      id: template.id,
      title: template.title,
      task,
      constraint: rng.pick(CONSTRAINTS),
      bars,
      bpm: brief.bpm,
    },
    wordPacks,
    rhymePairs: rng.sample(RHYME_PAIRS, 6).map(([a, b]) => ({ a, b })),
    starterBars: buildStarterBars(brief, rng),
    flowTip: brief.technique,
    quote: rng.pick(QUOTES),
    beatPreset: {
      bpm: brief.bpm,
      pattern: beat.pattern,
      energy: beat.energy,
    },
  };
}
