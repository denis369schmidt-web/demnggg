/**
 * Redaktionelle Content-Pools des Channels.
 *
 * Der ResearchAgent und der DraftAgent kombinieren diese Bausteine
 * datumsgeseedet zu täglich neuen Editionen. Neue Themen, Challenges
 * oder Wortpakete werden hier ergänzt – die Pipeline nutzt sie
 * automatisch ab dem nächsten Lauf.
 */

import type { Technique, Theme } from "./types.ts";

export const THEMES: readonly Theme[] = [
  {
    id: "strassen-traeume",
    title: "Straßenträume",
    mood: "hungrig",
    description: "Vom Bordstein zur Skyline – Zeilen über den Weg nach oben.",
    keywords: ["Straße", "Träume", "Asphalt", "Skyline", "Aufstieg", "Beton"],
  },
  {
    id: "nachtschicht",
    title: "Nachtschicht",
    mood: "fokussiert",
    description: "Wenn die Stadt schläft, läuft dein Mic heiß.",
    keywords: ["Nacht", "Neonlicht", "Schatten", "Stille", "Mond", "Session"],
  },
  {
    id: "fokus-modus",
    title: "Fokus-Modus",
    mood: "ruhig",
    description: "Alles ausblenden, nur der Beat und du.",
    keywords: ["Fokus", "Ruhe", "Atem", "Ziel", "Klarheit", "Disziplin"],
  },
  {
    id: "gewitterfront",
    title: "Gewitterfront",
    mood: "energisch",
    description: "Druck ablassen – jede Silbe ein Donnerschlag.",
    keywords: ["Gewitter", "Blitz", "Druck", "Sturm", "Energie", "Beben"],
  },
  {
    id: "heimathafen",
    title: "Heimathafen",
    mood: "warm",
    description: "Wurzeln, alte Freunde und der Block, der dich geprägt hat.",
    keywords: ["Heimat", "Wurzeln", "Block", "Familie", "Erinnerung", "Anker"],
  },
  {
    id: "neon-horizont",
    title: "Neon-Horizont",
    mood: "verträumt",
    description: "Zukunftsbilder zwischen Synthesizern und Stadtlichtern.",
    keywords: ["Neon", "Horizont", "Zukunft", "Lichter", "Vision", "Signal"],
  },
  {
    id: "spiegelbild",
    title: "Spiegelbild",
    mood: "ehrlich",
    description: "Selbstreflexion ohne Filter – die härteste Battle-Runde.",
    keywords: ["Spiegel", "Wahrheit", "Zweifel", "Stolz", "Wandel", "Kern"],
  },
  {
    id: "vollgas",
    title: "Vollgas",
    mood: "hoch",
    description: "Double-Time, keine Bremsen, der Takt gibt die Richtung.",
    keywords: ["Tempo", "Motor", "Turbo", "Strecke", "Adrenalin", "Start"],
  },
  {
    id: "goldene-stunde",
    title: "Goldene Stunde",
    mood: "dankbar",
    description: "Der Moment, in dem alles kurz still steht und glänzt.",
    keywords: ["Sonne", "Gold", "Moment", "Frieden", "Licht", "Dank"],
  },
  {
    id: "labyrinth",
    title: "Labyrinth",
    mood: "suchend",
    description: "Verwinkelte Gedanken, aber der Flow findet den Ausgang.",
    keywords: ["Labyrinth", "Wege", "Nebel", "Kompass", "Suche", "Ausgang"],
  },
  {
    id: "eiszeit",
    title: "Eiszeit",
    mood: "kalt",
    description: "Kühler Kopf, messerscharfe Punchlines.",
    keywords: ["Eis", "Frost", "Kälte", "Klinge", "Kristall", "Atemwolke"],
  },
  {
    id: "phoenix",
    title: "Phönix",
    mood: "trotzig",
    description: "Rückschläge in Treibstoff verwandeln und neu starten.",
    keywords: ["Asche", "Feuer", "Neustart", "Flügel", "Glut", "Comeback"],
  },
  {
    id: "tiefsee",
    title: "Tiefsee",
    mood: "dunkel",
    description: "Abtauchen in die tiefsten Gedanken, Druck aushalten.",
    keywords: ["Tiefe", "Ozean", "Druck", "Strömung", "Leuchten", "Grund"],
  },
  {
    id: "marktplatz",
    title: "Marktplatz",
    mood: "wach",
    description: "Beobachtungen aus der Stadt – Storytelling in Echtzeit.",
    keywords: ["Stadt", "Stimmen", "Menschen", "Ecken", "Geschichten", "Puls"],
  },
  {
    id: "gipfelsturm",
    title: "Gipfelsturm",
    mood: "entschlossen",
    description: "Schritt für Schritt nach oben, der Rückweg ist gesperrt.",
    keywords: ["Gipfel", "Seil", "Höhe", "Wille", "Schritt", "Aussicht"],
  },
  {
    id: "zeitkapsel",
    title: "Zeitkapsel",
    mood: "nostalgisch",
    description: "Briefe an das frühere und das zukünftige Ich.",
    keywords: ["Zeit", "Kapsel", "Brief", "Jugend", "Morgen", "Spuren"],
  },
] as const;

export const IMAGE_WORDS: readonly string[] = [
  "Neonlicht",
  "Asphalt",
  "Skyline",
  "Echo",
  "Funken",
  "Schatten",
  "Tinte",
  "Kompass",
  "Magnet",
  "Radar",
  "Spiegel",
  "Anker",
  "Satellit",
  "Leuchtturm",
  "Fundament",
  "Silhouette",
  "Antenne",
  "Tresor",
] as const;

export const FEELING_WORDS: readonly string[] = [
  "Fokus",
  "Hunger",
  "Stolz",
  "Ruhe",
  "Mut",
  "Zweifel",
  "Glut",
  "Instinkt",
  "Balance",
  "Frieden",
  "Feuer",
  "Geduld",
  "Respekt",
  "Haltung",
] as const;

export const MOTION_WORDS: readonly string[] = [
  "sprinten",
  "schweben",
  "klettern",
  "tauchen",
  "driften",
  "steigen",
  "kreisen",
  "landen",
  "starten",
  "gleiten",
  "pushen",
  "grinden",
] as const;

export interface ChallengeTemplate {
  id: string;
  title: string;
  task: string;
}

export const CHALLENGE_TEMPLATES: readonly ChallengeTemplate[] = [
  {
    id: "silben-sprint",
    title: "Silben-Sprint",
    task:
      "Schreibe {bars} Bars zum Thema „{theme}“ und lande jede Punchline exakt auf der Snare (Zählzeit 3).",
  },
  {
    id: "punchline-schmiede",
    title: "Punchline-Schmiede",
    task:
      "Baue in {bars} Bars mindestens vier Punchlines zum Thema „{theme}“ – jede zweite Zeile muss sitzen.",
  },
  {
    id: "storytelling-run",
    title: "Storytelling-Run",
    task:
      "Erzähle in {bars} Bars eine Mini-Geschichte über „{theme}“ mit Anfang, Wendepunkt und Schlusszeile.",
  },
  {
    id: "hook-labor",
    title: "Hook-Labor",
    task:
      "Entwirf eine 4-Bar-Hook zum Thema „{theme}“ und wiederhole sie nach jeweils {bars} Bars Strophe.",
  },
  {
    id: "freestyle-zirkel",
    title: "Freestyle-Zirkel",
    task:
      "Freestyle {bars} Bars über „{theme}“ – nutze alle Wörter aus dem Wortpaket „{pack}“ mindestens einmal.",
  },
  {
    id: "doubletime-drill",
    title: "Double-Time-Drill",
    task:
      "Rappe {bars} Bars zu „{theme}“: erst halbes Tempo, ab der Hälfte Double-Time ohne Textänderung.",
  },
  {
    id: "vokal-fessel",
    title: "Vokal-Fessel",
    task:
      "Schreibe {bars} Bars über „{theme}“, in denen jede Zeile auf denselben Vokalklang endet.",
  },
  {
    id: "cypher-staffel",
    title: "Cypher-Staffel",
    task:
      "Nimm {bars} Bars zu „{theme}“ auf, höre sie an und antworte dir selbst mit {bars} Kontra-Bars.",
  },
  {
    id: "atem-marathon",
    title: "Atem-Marathon",
    task:
      "Performe {bars} Bars über „{theme}“ mit maximal einem Atemzug pro zwei Zeilen – Pausen bewusst setzen.",
  },
  {
    id: "flip-the-beat",
    title: "Flip the Beat",
    task:
      "Rappe {bars} Bars zu „{theme}“ einmal on-beat und direkt danach bewusst im Offbeat – vergleiche beide Takes.",
  },
  {
    id: "ein-wort-anker",
    title: "Ein-Wort-Anker",
    task:
      "Wähle ein Wort aus dem Paket „{pack}“ und lasse es in {bars} Bars zu „{theme}“ in jeder Zeile auftauchen.",
  },
  {
    id: "leiser-lauter",
    title: "Leiser & Lauter",
    task:
      "Performe {bars} Bars über „{theme}“ und steigere die Dynamik von Flüstern bis volle Energie.",
  },
] as const;

export const CONSTRAINTS: readonly string[] = [
  "Kein Wort darf doppelt als Zeilenende vorkommen.",
  "Mindestens zwei Zeilen enthalten einen Doppelreim.",
  "Die letzte Bar zitiert die erste Bar mit neuem Kontext.",
  "Baue genau eine bewusste Pause von einem halben Takt ein.",
  "Jede vierte Zeile beginnt mit demselben Wort.",
  "Verwende mindestens ein Bild aus der Natur.",
  "Eine Zeile darf maximal zehn Silben haben – finde sie beim Proben.",
  "Nutze mindestens einen internen Reim pro Doppelzeile.",
  "Die Hook-Zeile muss eine Frage sein.",
  "Wechsle einmal die Perspektive (Ich → Du oder Wir).",
] as const;

/** Kuratiert: beide Wörter enden auf denselben Laut (Editor-Gate prüft die Endung). */
export const RHYME_PAIRS: readonly [string, string][] = [
  ["Takt", "exakt"],
  ["Zeit", "bereit"],
  ["Nacht", "gemacht"],
  ["Glut", "Mut"],
  ["Licht", "Sicht"],
  ["Traum", "Raum"],
  ["Herz", "Schmerz"],
  ["Stein", "allein"],
  ["Feuer", "teuer"],
  ["Leben", "geben"],
  ["Zeilen", "eilen"],
  ["Beben", "schweben"],
  ["Klang", "Drang"],
  ["Spur", "pur"],
  ["Wort", "Ort"],
  ["Kette", "Wette"],
  ["Hallen", "knallen"],
  ["Fluss", "Schluss"],
  ["Druck", "Ruck"],
  ["Ton", "davon"],
  ["Nebel", "Pegel"],
  ["Wind", "geschwind"],
  ["Rauch", "auch"],
  ["Boden", "Methoden"],
  ["Weite", "Seite"],
  ["Welle", "Schwelle"],
  ["Blick", "Genick"],
  ["Hand", "Verstand"],
  ["Meer", "schwer"],
  ["Kern", "fern"],
] as const;

export const FLOW_TIPS: readonly Technique[] = [
  {
    id: "snare-anker",
    title: "Snare als Anker",
    tip:
      "Setze betonte Silben bewusst auf Zählzeit 2 und 4 – die Snare trägt deine Betonung, nicht umgekehrt.",
  },
  {
    id: "pausen-power",
    title: "Pausen sind Punchlines",
    tip:
      "Eine gut gesetzte Pause vor der Punchline verdoppelt ihre Wirkung. Stille ist Teil des Flows.",
  },
  {
    id: "vokal-farben",
    title: "Vokalfarben mischen",
    tip:
      "Dunkle Vokale (o, u) klingen schwer, helle (i, e) schnell. Wähle Reimwörter passend zur Stimmung.",
  },
  {
    id: "atem-mapping",
    title: "Atem-Mapping",
    tip:
      "Markiere beim Schreiben, wo du atmest. Wer die Atmung plant, verliert am Ende der Bars keine Energie.",
  },
  {
    id: "silben-budget",
    title: "Silben-Budget",
    tip:
      "Zähle Silben pro Zeile: 10–14 bei mittlerem Tempo. Über 16 wird es Double-Time, darunter entsteht Raum.",
  },
  {
    id: "call-response",
    title: "Call & Response",
    tip:
      "Lass Zeile 2 auf Zeile 1 antworten – Frage/Antwort-Strukturen halten Zuhörer automatisch im Takt.",
  },
  {
    id: "offbeat-wuerze",
    title: "Offbeat als Würze",
    tip:
      "Rappe eine von acht Zeilen bewusst neben dem Raster. Der Kontrast macht die On-Beat-Zeilen stärker.",
  },
  {
    id: "hook-erst",
    title: "Hook zuerst",
    tip:
      "Schreibe die Hook vor den Strophen. Sie definiert Tempo, Ton und Thema – die Bars folgen ihr.",
  },
  {
    id: "aufnahme-check",
    title: "Der 24-Stunden-Check",
    tip:
      "Höre jede Aufnahme erst am nächsten Tag erneut. Frische Ohren erkennen Timing-Fehler sofort.",
  },
  {
    id: "doppelreim-leiter",
    title: "Doppelreim-Leiter",
    tip:
      "Übe Reimketten: ein Wort, dann zwei Silben, dann drei. Mehrsilbige Reime heben jeden Flow an.",
  },
  {
    id: "tempo-treppe",
    title: "Tempo-Treppe",
    tip:
      "Trainiere denselben Text bei 85, 95 und 110 BPM. Wer die Treppe hochkommt, sitzt bei jedem Beat.",
  },
  {
    id: "stimme-instrument",
    title: "Stimme als Instrument",
    tip:
      "Variiere Tonhöhe pro Abschnitt: Strophe tief, Pre-Hook mittig, Hook oben. Melodie entsteht nebenbei.",
  },
] as const;

export const QUOTES: readonly string[] = [
  "Der Beat wartet nicht – aber er verzeiht jedem, der wiederkommt.",
  "Erst kommt die Übung, dann der Flow, dann der Moment, in dem beides verschwindet.",
  "Schreib die Zeile, die du morgen hören willst.",
  "Ein ruhiger Atem ist die beste Punchline-Versicherung.",
  "Talent startet den Motor, Routine fährt die Strecke.",
  "Jede krumme Bar von heute ist das Fundament der geraden von morgen.",
  "Wer den Takt fühlt, muss ihn nicht mehr zählen.",
  "Deine Stimme ist das einzige Instrument, das du immer dabei hast.",
  "Lieber acht ehrliche Bars als sechzehn geliehene.",
  "Der Unterschied zwischen Probe und Performance ist nur das Publikum.",
  "Große Hooks entstehen oft aus kleinen Selbstgesprächen.",
  "Bleib im Takt, auch wenn der Tag es nicht ist.",
] as const;

export interface BeatPattern {
  pattern: string;
  minBpm: number;
  maxBpm: number;
  energy: "chill" | "mittel" | "hoch";
}

export const BEAT_PATTERNS: readonly BeatPattern[] = [
  { pattern: "Boom Bap", minBpm: 86, maxBpm: 96, energy: "mittel" },
  { pattern: "Trap Halftime", minBpm: 130, maxBpm: 150, energy: "mittel" },
  { pattern: "Lo-Fi Chill", minBpm: 72, maxBpm: 84, energy: "chill" },
  { pattern: "West Coast Bounce", minBpm: 92, maxBpm: 102, energy: "mittel" },
  { pattern: "Double-Time Drill", minBpm: 138, maxBpm: 160, energy: "hoch" },
  { pattern: "Uptempo Battle", minBpm: 100, maxBpm: 118, energy: "hoch" },
] as const;

/** Zeilen-Templates für Starter-Bars; {k0}-{k2} werden mit Trend-Wörtern gefüllt. */
export const STARTER_TEMPLATES: readonly string[] = [
  "{k0} im Blick, ich bleib ruhig auf der Eins",
  "{k1} in der Hand und der Zweifel wird kleiner",
  "Aus {k0} wird ein Plan, aus dem Plan wird ein Schritt",
  "{k2} in den Zeilen, jede Silbe nimmt mich mit",
  "Ich zähl die Beats wie {k1}, alles landet exakt",
  "{k0} als Kompass und die Snare gibt den Takt",
  "Zwischen {k1} und {k2} find ich Raum für den Reim",
  "Der Tag war {k0}, doch die Nacht macht ihn zu meinem",
  "{k2} auf Repeat, bis die Hook von alleine läuft",
  "Ich stapel Silben auf {k0}, bis der Pegel sich häuft",
  "{k1} bleibt der Anker, wenn der Offbeat mich ruft",
  "Mit {k2} in der Stimme klingt selbst Stille wie ein Ruf",
] as const;

/** Wörter, die der Editor niemals in den Channel lässt. */
export const BANNED_WORDS: readonly string[] = [
  "hass",
  "gewalt",
  "waffe",
  "droge",
] as const;
