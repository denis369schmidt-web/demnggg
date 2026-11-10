// Deutscher Reim-Coach für FlowForge. Läuft lokal, ohne Netz.
// Der Schlüssel ist die hörbare Endung: Schwa-Endungen (e/en/er/el/em)
// ziehen die Silbe davor mit, ß wird zu ss, Doppelkonsonanten fallen zusammen.

(function initFlowRhymes() {
  const VOWEL = /[aeiouyäöü]+/g;

  const BANK = [
    "Takt", "exakt", "Kontakt", "intakt", "Pakt", "Abstrakt",
    "Pause", "Zuhause", "Brause", "Sause", "Klause",
    "Licht", "Gesicht", "Gewicht", "Pflicht", "Schicht", "Gedicht", "Bericht", "Verzicht", "Gericht", "bricht", "spricht",
    "Traum", "Raum", "Baum", "Schaum", "Saum", "Flaum",
    "Nacht", "Macht", "Pracht", "Jacht", "Tracht", "Andacht", "gebracht", "gedacht", "gemacht", "lacht", "wacht",
    "Straße", "Klasse", "Gasse", "Kasse", "Maße", "Masse", "Passe", "fasse", "lasse", "nasse",
    "Fokus", "Lotus", "Modus", "Bonus", "Schluss", "Genuss", "Bus",
    "Feuer", "teuer", "Steuer", "Abenteuer", "Heuer",
    "Zeit", "weit", "bereit", "schneit", "schreit", "Neid", "Kleid", "Bescheid", "gescheit",
    "Plan", "Mann", "kann", "dran", "Bann",
    "Bahn", "Wahn", "Zahn", "Hahn", "fahnen",
    "Blatt", "glatt", "satt", "Rat", "Tat", "Draht", "Saat", "statt", "matt", "platt",
    "Fall", "Ball", "Knall", "Schall", "Metall", "überall", "hall", "prall",
    "Block", "Rock", "Dock", "Stock", "Lock", "Knock",
    "Herz", "Schmerz", "Scherz", "März",
    "Glanz", "Tanz", "ganz", "Kranz",
    "Flow", "Show", "Mikro", "Studio", "Radio",
    "Stadt", "satt", "hat", "Pfad",
    "Kopf", "Zopf", "Topf", "Stoff", "doof",
    "Hand", "Wand", "Band", "Land", "Rand", "Sand", "Verstand", "bekannt",
    "Haus", "raus", "Maus", "laut", "Haut", "gebaut", "vertraut", "geschaut",
    "Weg", "Steg", "Degen", "Regen", "gelegen", "entgegen", "bewegen", "Pflege",
    "Sinn", "hin", "Gewinn", "Beginn", "drin", "Zinn",
    "Mut", "gut", "Hut", "Wut", "Blut", "Mut", "tut",
    "Ziel", "viel", "Spiel", "Gefühl", "stil", "Kiel", "April",
    "Wort", "Ort", "fort", "dort", "Sport", "Report",
    "Tag", "sag", "lag", "mag", "Schlag", "Vertrag", "Alltag", "zerbrach",
    "Blick", "Glück", "Stück", "zurück", "Druck", "Schluck",
    "Leben", "geben", "heben", "schweben", "neben", "Streben", "begeben",
    "laufen", "saufen", "kaufen", "verkaufen", "gelaufen", "raufen",
    "gegangen", "fangen", "verlangen", "Stange", "lange",
  ];

  const CUES = [
    "Neon", "Aufzug", "Regen", "Schlüssel", "Markt", "Nachtbus", "Spiegel", "Treppe",
    "Hafen", "Kamera", "Brief", "Fenster", "Asphalt", "Küche", "Radio", "Mond",
    "Jacke", "Park", "Ampel", "Kaffee", "U-Bahn", "Dach", "Brücke", "Schatten",
    "Hof", "Winter", "Gleis", "Poster", "Flur", "Münze", "Vorhang", "Lautsprecher",
    "Taschenlampe", "Fahrplan", "Hinterhof", "Pfütze", "Schaufenster", "Treppenhaus",
  ];

  function clean(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[^a-zäöüß\-]/g, "")
      .replace(/^-|-$/g, "");
  }

  function fold(word) {
    return clean(word)
      .replace(/ß/g, "ss")
      .replace(/ph/g, "f")
      .replace(/ie/g, "i")
      .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, "$1");
  }

  function vowelSpans(word) {
    const spans = [];
    VOWEL.lastIndex = 0;
    let match = VOWEL.exec(word);
    while (match) {
      spans.push({ start: match.index, text: match[0] });
      match = VOWEL.exec(word);
    }
    return spans;
  }

  function lastWord(text) {
    const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return parts[parts.length - 1].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  }

  function rhymeKey(raw, depth = 1) {
    const word = fold(raw);
    if (!word) return "";
    const spans = vowelSpans(word);
    if (!spans.length) return word;
    let index = spans.length - 1;
    if (/e[nrlm]?$/.test(word) && spans.length >= 2 && spans[index].text === "e") {
      index -= 1;
    }
    const from = spans[Math.max(0, index - (depth - 1))].start;
    return word.slice(from);
  }

  function unique(list, limit) {
    const seen = new Set();
    const out = [];
    list.forEach((word) => {
      const token = clean(word);
      if (!token || seen.has(token)) return;
      seen.add(token);
      out.push(word);
    });
    return out.slice(0, limit);
  }

  function suggest(raw, extra = []) {
    const query = lastWord(raw) || raw;
    const key = rhymeKey(query, 1);
    const key2 = rhymeKey(query, 2);
    const vowel = (key.match(VOWEL) || [""])[0];
    const rich = key2.length > key.length + 1;
    const corpus = unique([...extra, ...BANK], 800);
    const multi = [];
    const perfect = [];
    const family = [];
    const self = clean(query);

    corpus.forEach((candidate) => {
      if (clean(candidate) === self) return;
      const their = rhymeKey(candidate, 1);
      const their2 = rhymeKey(candidate, 2);
      const theirRich = their2.length > their.length + 1;
      if (rich && theirRich && their2 === key2) multi.push(candidate);
      else if (their && their === key) perfect.push(candidate);
      else if (vowel && (their.match(VOWEL) || [""])[0] === vowel) family.push(candidate);
    });

    return {
      word: query,
      key,
      multi: unique(multi, 8),
      perfect: unique(perfect, 8),
      family: unique(family, 6),
    };
  }

  function scheme(lines) {
    const map = new Map();
    let n = 0;
    const letters = "ABCDEFGH";
    return lines.map((line) => {
      const key = rhymeKey(lastWord(line), 1);
      if (!key) return "·";
      if (!map.has(key)) {
        map.set(key, letters[n] || "·");
        n += 1;
      }
      return map.get(key);
    });
  }

  function cueFor(seed, bar) {
    const a = CUES[(seed + bar * 3) % CUES.length];
    let b = CUES[(seed + bar * 7 + 5) % CUES.length];
    if (b === a) b = CUES[(CUES.indexOf(a) + 1) % CUES.length];
    return `${a} · ${b}`;
  }

  globalThis.FlowRhymes = {
    BANK,
    CUES,
    lastWord,
    rhymeKey,
    suggest,
    scheme,
    cueFor,
  };

  const isNode = typeof process !== "undefined" && process.versions && process.versions.node;
  if (isNode && /rhymes\.js$/.test(process.argv[1] || "")) {
    const checks = [
      ["Straße", "Klasse"],
      ["Nacht", "Macht"],
      ["Feuer", "teuer"],
      ["Traum", "Raum"],
      ["Takt", "exakt"],
      ["Pause", "Zuhause"],
      ["Fokus", "Lotus"],
    ];
    checks.forEach(([a, b]) => {
      const ka = rhymeKey(a, 1);
      const kb = rhymeKey(b, 1);
      if (ka !== kb) throw new Error(`${a} (${ka}) reimt nicht auf ${b} (${kb})`);
    });
    const straße = suggest("Straße");
    if (!straße.perfect.some((word) => clean(word) === "klasse")) {
      throw new Error(`Straße-Reime ohne Klasse: ${straße.perfect.join(", ")}`);
    }
    const letters = scheme(["ich halt den Takt", "jeder Schritt sitzt exakt"]);
    if (letters[0] !== "A" || letters[1] !== "A") {
      throw new Error(`Schema falsch: ${letters.join(" ")}`);
    }
    console.log(`ok reime ${BANK.length} wörter, schlüssel ${rhymeKey("Straße")}`);
  }
})();
