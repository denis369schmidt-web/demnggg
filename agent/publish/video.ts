/**
 * Video-Renderer: baut mit ffmpeg das Daily-Video (1080p) aus dem
 * synthetisierten Beat und den Texten der Edition. Texte werden über
 * drawtext-Textdateien eingebunden (kein Escaping-Risiko), Layout im
 * FlowForge-Look (dunkler Hintergrund, Akzentfarben).
 */

import type { ChannelEdition } from "../lib/types.ts";

const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

export function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current && (current.length + 1 + word.length) > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

async function fontOrDefault(path: string): Promise<string> {
  try {
    await Deno.stat(path);
    return `fontfile=${path}:`;
  } catch {
    return "";
  }
}

export interface RenderVideoOptions {
  edition: ChannelEdition;
  audioPath: string;
  outPath: string;
  workDir: string;
}

export async function renderVideo(options: RenderVideoOptions): Promise<void> {
  const { edition, audioPath, outPath, workDir } = options;

  const files = {
    kicker: `${workDir}/kicker.txt`,
    title: `${workDir}/title.txt`,
    body: `${workDir}/body.txt`,
    constraint: `${workDir}/constraint.txt`,
    meta: `${workDir}/meta.txt`,
  };

  await Deno.writeTextFile(files.kicker, "FLOWFORGE DAILY CHANNEL");
  await Deno.writeTextFile(files.title, edition.theme.title);
  await Deno.writeTextFile(
    files.body,
    `${edition.challenge.title}\n${wrapText(edition.challenge.task, 52)}`,
  );
  await Deno.writeTextFile(
    files.constraint,
    wrapText(`Zusatzregel: ${edition.challenge.constraint}`, 64),
  );
  await Deno.writeTextFile(
    files.meta,
    `Edition ${edition.edition}  ·  ${edition.beatPreset.bpm} BPM  ·  ` +
      `${edition.beatPreset.pattern}  ·  ${edition.challenge.bars} Bars`,
  );

  const bold = await fontOrDefault(FONT_BOLD);
  const regular = await fontOrDefault(FONT_REGULAR);

  const drawtext = (
    font: string,
    textfile: string,
    size: number,
    color: string,
    y: string,
  ) =>
    `drawtext=${font}textfile=${textfile}:expansion=none:fontsize=${size}:` +
    `fontcolor=${color}:x=(w-text_w)/2:y=${y}:line_spacing=16`;

  const filters = [
    drawtext(regular, files.kicker, 38, "0x62a3ff", "150"),
    drawtext(bold, files.title, 104, "0xeef1ff", "230"),
    drawtext(regular, files.body, 46, "0xd8def5", "430"),
    drawtext(regular, files.constraint, 36, "0xffcd70", "760"),
    drawtext(bold, files.meta, 38, "0x5cd6a9", "930"),
  ].join(",");

  const command = new Deno.Command("ffmpeg", {
    args: [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x0b0e14:s=1920x1080:r=30",
      "-i",
      audioPath,
      "-vf",
      filters,
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "21",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outPath,
    ],
    stdout: "null",
    stderr: "piped",
  });

  const result = await command.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`ffmpeg fehlgeschlagen:\n${stderr.slice(-1500)}`);
  }
}
