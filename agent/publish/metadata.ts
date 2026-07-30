/**
 * YouTube-Metadaten: baut Titel, Beschreibung und Tags aus der
 * Channel-Edition und prüft sie gegen ein eigenes Qualitätsgate,
 * bevor irgendetwas die Plattform erreicht.
 */

import type { ChannelEdition, GateResult } from "../lib/types.ts";
import { BANNED_WORDS } from "../lib/data.ts";

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;
const MAX_TAGS_TOTAL = 480;

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
}

export function buildVideoMetadata(
  edition: ChannelEdition,
  privacyStatus = "public",
): VideoMetadata {
  const base =
    `FlowForge Daily – ${edition.theme.title}: ${edition.challenge.title} ` +
    `(${edition.beatPreset.bpm} BPM ${edition.beatPreset.pattern})`;
  const title = base.length <= MAX_TITLE
    ? base
    : `${base.slice(0, MAX_TITLE - 1)}…`;

  const packs = edition.wordPacks
    .map((pack) => `• ${pack.title}: ${pack.words.join(", ")}`)
    .join("\n");
  const rhymes = edition.rhymePairs
    .map((pair) => `${pair.a}/${pair.b}`)
    .join(" · ");
  const bars = edition.starterBars.map((bar) => `„${bar.line}“`).join("\n");

  const description = [
    `FlowForge Daily Channel – Edition ${edition.edition}`,
    ``,
    `🎯 Challenge des Tages: ${edition.challenge.title}`,
    edition.challenge.task,
    `Zusatzregel: ${edition.challenge.constraint}`,
    `${edition.challenge.bars} Bars · ${edition.beatPreset.bpm} BPM · ${edition.beatPreset.pattern}`,
    ``,
    `📦 Wortpakete:`,
    packs,
    ``,
    `🔗 Reimpaare: ${rhymes}`,
    ``,
    `🎤 Starter-Bars:`,
    bars,
    ``,
    `💡 ${edition.flowTip.title}: ${edition.flowTip.tip}`,
    ``,
    `„${edition.quote}“`,
    ``,
    `Dieser Übungs-Beat und alle Inhalte wurden automatisch vom FlowForge`,
    `Content-Agenten erstellt und redaktionell gegengeprüft.`,
    ``,
    `#Rap #Freestyle #Deutschrap #RapTraining #FlowForge`,
  ].join("\n").slice(0, MAX_DESCRIPTION);

  const tags: string[] = [];
  let total = 0;
  for (
    const tag of [
      "FlowForge",
      "Rap Training",
      "Freestyle üben",
      "Deutschrap",
      "Übungs-Beat",
      edition.beatPreset.pattern,
      ...edition.theme.keywords,
    ]
  ) {
    if (total + tag.length > MAX_TAGS_TOTAL) break;
    if (tags.includes(tag)) continue;
    tags.push(tag);
    total += tag.length;
  }

  return { title, description, tags, categoryId: "10", privacyStatus };
}

export function gateVideoMetadata(metadata: VideoMetadata): GateResult[] {
  const corpus = `${metadata.title} ${metadata.description}`.toLowerCase();
  const bannedHits = BANNED_WORDS.filter((word) => corpus.includes(word));

  return [
    {
      gate: "Titel",
      passed: metadata.title.length > 0 &&
        metadata.title.length <= MAX_TITLE &&
        !/[<>]/.test(metadata.title),
      details: `${metadata.title.length}/${MAX_TITLE} Zeichen, keine <>-Zeichen erlaubt.`,
    },
    {
      gate: "Beschreibung",
      passed: metadata.description.length > 0 &&
        metadata.description.length <= MAX_DESCRIPTION,
      details: `${metadata.description.length}/${MAX_DESCRIPTION} Zeichen.`,
    },
    {
      gate: "Tags",
      passed: metadata.tags.join("").length <= MAX_TAGS_TOTAL,
      details: `${metadata.tags.length} Tags, ${
        metadata.tags.join("").length
      }/${MAX_TAGS_TOTAL} Zeichen gesamt.`,
    },
    {
      gate: "Lexikon",
      passed: bannedHits.length === 0,
      details: bannedHits.length === 0
        ? "Keine gesperrten Begriffe in Titel/Beschreibung."
        : `Gesperrte Begriffe: ${bannedHits.join(", ")}.`,
    },
  ];
}
