/** Gemeinsame Datentypen: strukturierte Übergaben zwischen den Agents. */

export interface Theme {
  id: string;
  title: string;
  mood: string;
  description: string;
  keywords: string[];
}

export interface Technique {
  id: string;
  title: string;
  tip: string;
}

export interface WordPack {
  id: string;
  title: string;
  words: string[];
}

export interface DailyChallenge {
  id: string;
  title: string;
  task: string;
  constraint: string;
  bars: number;
  bpm: number;
}

export interface RhymePair {
  a: string;
  b: string;
}

export interface StarterBar {
  line: string;
  syllables: number;
}

export interface BeatPreset {
  bpm: number;
  pattern: string;
  energy: "chill" | "mittel" | "hoch";
}

/** Strukturierter Handoff: ResearchAgent -> DraftAgent. */
export interface ResearchBrief {
  edition: string;
  theme: Theme;
  trendWords: string[];
  technique: Technique;
  beatPattern: string;
  bpm: number;
}

/** Strukturierter Handoff: DraftAgent -> EditorAgent. */
export interface DraftContent {
  edition: string;
  attempt: number;
  theme: Theme;
  challenge: DailyChallenge;
  wordPacks: WordPack[];
  rhymePairs: RhymePair[];
  starterBars: StarterBar[];
  flowTip: Technique;
  quote: string;
  beatPreset: BeatPreset;
}

export interface GateResult {
  gate: string;
  passed: boolean;
  details: string;
}

export interface EditorReport {
  passed: boolean;
  score: number;
  gates: GateResult[];
}

export interface HealthReport {
  status: "gruen" | "gelb" | "rot";
  editionCount: number;
  latestEdition: string;
  archivedEditions: number;
  prunedEditions: number;
  notes: string[];
}

/** Vollständige, veröffentlichte Channel-Edition (content/channel.json). */
export interface ChannelEdition {
  schemaVersion: number;
  edition: string;
  generatedAt: string;
  attempt: number;
  theme: Theme;
  challenge: DailyChallenge;
  wordPacks: WordPack[];
  rhymePairs: RhymePair[];
  starterBars: StarterBar[];
  flowTip: Technique;
  quote: string;
  beatPreset: BeatPreset;
  editorial: {
    score: number;
    gates: GateResult[];
  };
  health: HealthReport;
}

/** Kompakte Sicht auf vergangene Editionen für Dedupe-Gates. */
export interface HistoryEntry {
  edition: string;
  themeId: string;
  challengeId: string;
  wordPackIds: string[];
}

export interface StageResult {
  name: string;
  ok: boolean;
  summary: string;
}

export interface RunLogEntry {
  runAt: string;
  edition: string;
  attempt: number;
  status: "veröffentlicht" | "unverändert" | "abgelehnt";
  score: number;
  durationMs: number;
  stages: StageResult[];
}
