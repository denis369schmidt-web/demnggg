/**
 * ResearchAgent
 *
 * Wählt Thema, Trend-Wörter, Technik-Fokus und Beat-Richtung für die
 * Edition. Themen, die in den letzten Editionen liefen, werden gemieden,
 * damit der Channel abwechslungsreich bleibt.
 */

import type { HistoryEntry, ResearchBrief } from "../lib/types.ts";
import type { Rng } from "../lib/rng.ts";
import {
  BEAT_PATTERNS,
  FEELING_WORDS,
  FLOW_TIPS,
  IMAGE_WORDS,
  THEMES,
} from "../lib/data.ts";

const THEME_COOLDOWN = 5;

export function runResearch(
  edition: string,
  rng: Rng,
  history: HistoryEntry[],
): ResearchBrief {
  const recentThemeIds = new Set(
    history.slice(0, THEME_COOLDOWN).map((entry) => entry.themeId),
  );

  const freshThemes = THEMES.filter((theme) => !recentThemeIds.has(theme.id));
  const theme = rng.pick(freshThemes.length > 0 ? freshThemes : THEMES);

  const trendWords = [
    ...rng.sample(theme.keywords, 2),
    rng.pick(IMAGE_WORDS),
    rng.pick(FEELING_WORDS),
  ];

  const beat = rng.pick(BEAT_PATTERNS);

  return {
    edition,
    theme,
    trendWords,
    technique: rng.pick(FLOW_TIPS),
    beatPattern: beat.pattern,
    bpm: Math.min(180, Math.max(70, rng.int(beat.minBpm, beat.maxBpm))),
  };
}
