// Lizenzfreie Original-Beats für FlowForge.
// Alles wird im Browser synthetisiert (keine fremden Samples, kein Download
// geschützter Musik). Dieselben Muster laufen live und im WAV-Export.

(function initFlowBeats() {
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  const CHORDS = {
    Am: ["A3", "C4", "E4"],
    Am7: ["A3", "C4", "E4", "G4"],
    Dm: ["D3", "F4", "A4"],
    Dm7: ["D3", "F3", "A3", "C4"],
    Em: ["E3", "G3", "B3"],
    F: ["F3", "A3", "C4"],
    G: ["G3", "B3", "D4"],
    C: ["C3", "E3", "G3"],
    Cm: ["C3", "Eb3", "G3"],
    Gm: ["G2", "Bb2", "D3"],
    Fm: ["F3", "Ab3", "C4"],
    A: ["A2", "C#3", "E3"],
    D: ["D3", "F#3", "A3"],
  };

  const KITS = {
    bap: {
      kickF: 168, kickEnd: 52, kickDecay: 0.16, kickClick: 0.2,
      snare: "acoustic", snareTone: 196, snareDecay: 0.15, snareGain: 0.52,
      hatDecay: 0.028, hatOpen: 0.14, hatHp: 6800, hatGain: 0.15,
      bassType: "triangle", bassDecay: 0.28, bassGain: 0.32,
      stabGain: 0.065, stabDecay: 0.18, perc: "rim",
    },
    eight: {
      kickF: 148, kickEnd: 34, kickDecay: 0.5, kickClick: 0.1,
      snare: "clap", snareTone: 210, snareDecay: 0.12, snareGain: 0.46,
      hatDecay: 0.02, hatOpen: 0.11, hatHp: 7800, hatGain: 0.12,
      bassType: "sine", bassDecay: 0.58, bassGain: 0.48,
      stabGain: 0.05, stabDecay: 0.14, perc: "rim",
    },
    lofi: {
      kickF: 124, kickEnd: 58, kickDecay: 0.2, kickClick: 0.07,
      snare: "acoustic", snareTone: 168, snareDecay: 0.18, snareGain: 0.38,
      hatDecay: 0.045, hatOpen: 0.16, hatHp: 4800, hatGain: 0.08,
      bassType: "triangle", bassDecay: 0.42, bassGain: 0.24,
      stabGain: 0.085, stabDecay: 0.32, perc: "rim", ambience: "vinyl",
    },
    afro: {
      kickF: 156, kickEnd: 62, kickDecay: 0.14, kickClick: 0.18,
      snare: "acoustic", snareTone: 250, snareDecay: 0.09, snareGain: 0.4,
      hatDecay: 0.035, hatOpen: 0.15, hatHp: 6200, hatGain: 0.14,
      bassType: "sine", bassDecay: 0.24, bassGain: 0.34,
      stabGain: 0.07, stabDecay: 0.16, perc: "tom",
    },
    garage: {
      kickF: 178, kickEnd: 70, kickDecay: 0.09, kickClick: 0.16,
      snare: "clap", snareTone: 240, snareDecay: 0.08, snareGain: 0.38,
      hatDecay: 0.018, hatOpen: 0.1, hatHp: 8000, hatGain: 0.16,
      bassType: "square", bassDecay: 0.16, bassGain: 0.2,
      stabGain: 0.11, stabDecay: 0.12, perc: "rim",
    },
    phonk: {
      kickF: 136, kickEnd: 30, kickDecay: 0.62, kickClick: 0.14,
      snare: "clap", snareTone: 180, snareDecay: 0.14, snareGain: 0.44,
      hatDecay: 0.018, hatOpen: 0.1, hatHp: 7400, hatGain: 0.13,
      bassType: "sawtooth", bassDecay: 0.42, bassGain: 0.28,
      stabGain: 0.045, stabDecay: 0.12, perc: "rim",
    },
    funk: {
      kickF: 110, kickEnd: 48, kickDecay: 0.22, kickClick: 0.12,
      snare: "clap", snareTone: 200, snareDecay: 0.12, snareGain: 0.4,
      hatDecay: 0.03, hatOpen: 0.14, hatHp: 6000, hatGain: 0.11,
      bassType: "sawtooth", bassDecay: 0.32, bassGain: 0.26,
      stabGain: 0.09, stabDecay: 0.2, perc: "rim",
    },
    dance: {
      kickF: 160, kickEnd: 50, kickDecay: 0.2, kickClick: 0.22,
      snare: "clap", snareTone: 220, snareDecay: 0.11, snareGain: 0.48,
      hatDecay: 0.03, hatOpen: 0.16, hatHp: 7000, hatGain: 0.13,
      bassType: "sine", bassDecay: 0.3, bassGain: 0.38,
      stabGain: 0.065, stabDecay: 0.14, perc: "tom",
    },
  };

  function noteFreq(name) {
    const match = /^([A-G])([#b])?(-?\d)$/.exec(name);
    if (!match) {
      throw new Error(`Unbekannte Note ${name}`);
    }
    let semi = SEMI[match[1]];
    if (match[2] === "#") semi += 1;
    if (match[2] === "b") semi -= 1;
    const midi = semi + (Number(match[3]) + 1) * 12;
    return 440 * 2 ** ((midi - 69) / 12);
  }

  function parseHits(str) {
    return str.replace(/\s+/g, "").split("").map((ch) => {
      if (ch === "x") return 1;
      if (ch === "X") return 2;
      if (ch === "o" || ch === "O") return 3;
      return 0;
    });
  }

  function parseTokens(str) {
    return str.trim().split(/\s+/).map((token) => (token === "." || token === "-" ? null : token));
  }

  function zeros(length) {
    return Array(length).fill(0);
  }

  function compile(def) {
    const kick = parseHits(def.kick);
    const length = kick.length;
    const beat = {
      id: def.id,
      name: def.name,
      genre: def.genre,
      pattern: def.pattern,
      bpm: def.bpm,
      swing: def.swing || 0,
      kit: def.kit,
      kick,
      snare: parseHits(def.snare),
      hat: parseHits(def.hat),
      perc: def.perc ? parseHits(def.perc) : zeros(length),
      bell: def.bell ? parseHits(def.bell) : zeros(length),
      bass: parseTokens(def.bass),
      chord: parseTokens(def.chord),
    };

    ["snare", "hat", "perc", "bell", "bass", "chord"].forEach((key) => {
      if (beat[key].length !== length) {
        throw new Error(`${def.id} ${key} hat ${beat[key].length} Schritte, erwartet ${length}`);
      }
    });
    if (!KITS[beat.kit]) {
      throw new Error(`${def.id} unbekanntes Kit ${beat.kit}`);
    }
    beat.bass.forEach((note) => {
      if (note) noteFreq(note);
    });
    beat.chord.forEach((chord) => {
      if (chord && !CHORDS[chord]) {
        throw new Error(`${def.id} unbekannter Akkord ${chord}`);
      }
    });
    return beat;
  }

  const RAW = [
    {
      id: "nacht-asphalt",
      name: "Nachtasphalt",
      genre: "Boom Bap",
      pattern: "Boom Bap",
      bpm: 91,
      swing: 0.12,
      kit: "bap",
      kick: "x... .... ..x. .... x... .... ..x. ..x.",
      snare: ".... x... .... x... .... x... .... x..x",
      hat: "x.x. x.x. x.xx x.x. x.x. x.x. x.xx x.xo",
      perc: ".... ..x. .... ..x. .... ..x. .... ....",
      bass: "A1 . . . . . . . G1 . . . . . . . C2 . . . . . . . A1 . . . E1 . . .",
      chord: "Am . . . . . . . . . . . . . . . F . . . . . . . . . . . . . . .",
    },
    {
      id: "hofeinfahrt",
      name: "Hofeinfahrt",
      genre: "Boom Bap",
      pattern: "Boom Bap",
      bpm: 87,
      swing: 0.16,
      kit: "bap",
      kick: "x... .... ..x. .... x... .... .x.. ....",
      snare: ".... x... .... x... .... x... .... x...",
      hat: "x.x. ..x. x.x. ..x. x.x. x..x x.x. ..xo",
      perc: "..x. .... ..x. .... .... ..x. .... ..x.",
      bass: "A1 . . . C2 . . . G1 . . . . . . . F1 . . . G1 . . . A1 . . . E1 . . A1",
      chord: "Dm . . . . . . . . . . . . . . . Am . . . . . . . G . . . . . . .",
    },
    {
      id: "kellerlicht",
      name: "Kellerlicht",
      genre: "Trap",
      pattern: "Trap Halftime",
      bpm: 140,
      swing: 0,
      kit: "eight",
      kick: "x... ..x. .... ..x. x... .... ..x. .x..",
      snare: ".... .... x... .... .... .... x... ....",
      hat: "xxxx xxxx xXxX xxxx xxxx xxXx xxxx xxxx",
      bass: "A1 . . . . . . . A1 . . G1 . . . . F1 . . . . . E1 . A1 . . . C2 . . .",
      chord: "Am . . . . . . . . . . . . . . . F . . . . . . . . . . . . . . .",
    },
    {
      id: "glasfront",
      name: "Glasfront",
      genre: "Trap",
      pattern: "Trap Halftime",
      bpm: 134,
      swing: 0,
      kit: "eight",
      kick: "x... .... ..x. .... x..x .... ..x. ....",
      snare: ".... .... x... .... .... .... x... ..x.",
      hat: "x.xx x.xx xxxx x.x. x.xx xxxx x.xx x.xo",
      bass: "F1 . . . . . . . C2 . . . G1 . . . D#1 . . . . . F1 . C2 . . . . . . .",
      chord: "Fm . . . . . . . . . . . . . . . Cm . . . . . . . . . . . . . . .",
    },
    {
      id: "seitengasse",
      name: "Seitengasse",
      genre: "Drill",
      pattern: "Double-Time Drill",
      bpm: 144,
      swing: 0,
      kit: "eight",
      kick: "x... .... ..x. .x.. .... x... ..x. ....",
      snare: ".... .... x... .... .... .... x... ....",
      hat: "xxxx xXxX xxxx xxxx xXXx xxxx xxxx XxXx",
      bass: "G1 . . . . . D#1 . F1 . . . . . . . A1 . . . G1 . . . D#1 . . F1 . . . .",
      chord: "Gm . . . . . . . . . . . . . . . Cm . . . . . . . . . . . . . . .",
    },
    {
      id: "dachregen",
      name: "Dachregen",
      genre: "Lo-Fi",
      pattern: "Lo-Fi Chill",
      bpm: 76,
      swing: 0.14,
      kit: "lofi",
      kick: "x... .... ..x. .... x... .... ..x. ....",
      snare: ".... x... .... x..x .... x... .... x...",
      hat: "x.x. x..x x.x. ..x. x.x. x.x. x..x x.x.",
      perc: ".... ..x. .... .... .... ..x. .... ....",
      bass: "C2 . . . . . . . A1 . . . . . B1 . C2 . . . G1 . . . A1 . . . . . . .",
      chord: "Am7 . . . . . . . . . . . . . . . Dm7 . . . . . . . . . . . . . . .",
    },
    {
      id: "nachtbus",
      name: "Nachtbus",
      genre: "Lo-Fi",
      pattern: "Lo-Fi Chill",
      bpm: 82,
      swing: 0.1,
      kit: "lofi",
      kick: "x... .... ..x. ..x. x... .... .x.. ....",
      snare: ".... x... .... .x.. .... x... .... x...",
      hat: "x..x x.x. ..x. x.x. x.x. ..x. x.x. x.xo",
      bass: "F1 . . . . . A1 . C2 . . . . . . . D2 . . . C2 . . . A1 . . . G1 . . .",
      chord: "Dm7 . . . . . . . . . . . . . . . Am7 . . . . . . . . . . . G . . .",
    },
    {
      id: "marktplatz",
      name: "Marktplatz",
      genre: "Afro",
      pattern: "Afro",
      bpm: 104,
      swing: 0.05,
      kit: "afro",
      kick: "x..x ..x. ..x. ..x. x..x ..x. x..x ..x.",
      snare: ".... x... .... x... .... x... .... x..x",
      hat: "x.x. x.x. xxxx x.x. x.x. xx.x x.x. x.xo",
      perc: "..x. x..x ..x. .xx. ..x. x.x. ..x. x..x",
      bass: "A1 . . C2 . . . . G1 . . . . A1 . . F1 . . . G1 . . . A1 . . E1 . . . .",
      chord: "Am . . . . . . . F . . . . . . . C . . . . . . . G . . . . . . .",
    },
    {
      id: "kuestenwind",
      name: "Küstenwind",
      genre: "Afro",
      pattern: "Afro",
      bpm: 112,
      swing: 0.03,
      kit: "afro",
      kick: "x... ..x. x... ..x. x... .x.. x... ..x.",
      snare: ".... x... .... x... .... x..x .... x...",
      hat: "xxx. xx.x x.xx x.x. xxx. x.xx xx.x x.xo",
      perc: "x..x ..x. .x.. x... ..x. x... .x.x ..x.",
      bass: "E1 . . . G1 . . . A1 . . . . . B1 . E1 . . . . . G1 . D2 . . . A1 . . .",
      chord: "Em . . . . . . . . . . . . . . . Am . . . . . . . D . . . . . . .",
    },
    {
      id: "hafenstep",
      name: "Hafenstep",
      genre: "Dancehall",
      pattern: "Uptempo Battle",
      bpm: 100,
      swing: 0.06,
      kit: "dance",
      kick: "x..x ..x. ..x. .x.. x..x ..x. ..x. ..x.",
      snare: ".... x... .... x... .... x... .... x..x",
      hat: "x.x. x.xx x.x. x.x. x.xx x.x. x.x. x.xo",
      perc: "..x. .... x..x .... ..x. .... ..x. x...",
      bass: "A1 . . . . . G1 . A1 . . . F1 . . . G1 . . . . . E1 . A1 . . . C2 . . .",
      chord: "Am . . . . . . . . . . . . . . . Dm . . . . . . . . . . . . . . .",
    },
    {
      id: "zweisprung",
      name: "Zweisprung",
      genre: "Garage",
      pattern: "Garage",
      bpm: 132,
      swing: 0.2,
      kit: "garage",
      kick: "x... .... ..x. .... x... .... ..x. .x..",
      snare: ".... .... x... .... .... .... x... ....",
      hat: "x.x. x.x. x.xx x.x. x.x. xx.x x.x. x.xo",
      perc: ".... x... .... .... .... .x.. .... ....",
      bass: "C2 . . . . . . . A1 . . . . . F1 . G1 . . . . . . . C2 . . . D2 . . .",
      chord: "Am . . . . . F . . . . . . . . . C . . . . . . . G . . . . . . .",
    },
    {
      id: "nachtmetall",
      name: "Nachtmetall",
      genre: "Phonk",
      pattern: "Phonk",
      bpm: 128,
      swing: 0,
      kit: "phonk",
      kick: "x... .... ..x. .... x... ..x. .... .x..",
      snare: ".... .... x... .... .... .... x... ....",
      hat: "xxxx x.xx xxxx xxxx xx.x xxxx xXxX xxxx",
      bell: "x..x ..x. x..x ..x. x..x .x.. x..x ..x.",
      bass: "F1 . . . . . . . F1 . . C2 . . . . D#1 . . . . . . . F1 . . . G1 . . .",
      chord: "Fm . . . . . . . . . . . . . . . Cm . . . . . . . . . . . . . . .",
    },
    {
      id: "lowrider",
      name: "Lowrider",
      genre: "Funk",
      pattern: "West Coast Bounce",
      bpm: 96,
      swing: 0.08,
      kit: "funk",
      kick: "x... .... ..x. .... x... ..x. .... ..x.",
      snare: ".... x... .... x... .... x... .... x...",
      hat: "x.x. x.x. x.x. x..x x.x. x.xx x.x. x.x.",
      perc: ".... ..x. .... .... .... ..x. .... ..x.",
      bass: "A1 . . C2 . . . A1 G1 . . . E1 . . . F1 . . . G1 . . A1 A1 . . . E1 . . .",
      chord: "Am . . . . . . . . . . . . . . . G . . . . . . . . . . . . . . .",
    },
    {
      id: "palmenallee",
      name: "Palmenallee",
      genre: "Funk",
      pattern: "West Coast Bounce",
      bpm: 94,
      swing: 0.1,
      kit: "funk",
      kick: "x... ..x. .... ..x. x... .... ..x. ....",
      snare: ".... x... .... .x.. .... x... .... x..x",
      hat: "x.xx x.x. x.x. x.x. x..x x.x. x.xx x.xo",
      bass: "D2 . . . . . C2 . A1 . . . . . B1 . G1 . . . A1 . . . D2 . . . . . . .",
      chord: "Dm . . . . . . . . . . . . . . . G . . . . . . . A . . . . . . .",
    },
    {
      id: "lagerhalle",
      name: "Lagerhalle",
      genre: "Club",
      pattern: "Club",
      bpm: 150,
      swing: 0,
      kit: "dance",
      kick: "x... x... x... x... x... x... x... x..x",
      snare: ".... x... .... x... .... x... .... x...",
      hat: "x.x. x.x. xoxo x.x. x.x. x.xx xoxo x.x.",
      perc: ".... .... ..x. .... .... .... ..x. ....",
      bass: "A1 . . . A1 . . . G1 . . . G1 . . . F1 . . . E1 . . . A1 . . . C2 . . .",
      chord: "Am . . . . . . . . . . . . . . . F . . . . . . . . . . . . . . .",
    },
    {
      id: "stromkasten",
      name: "Stromkasten",
      genre: "Trap",
      pattern: "Trap Halftime",
      bpm: 156,
      swing: 0,
      kit: "eight",
      kick: "x... .... ..x. .... .... x... ..x. .x..",
      snare: ".... .... x... .... .... .... x... ....",
      hat: "xXxX xxxx xXxx xxxx xxxx XxXx xxxx xXXx",
      bass: "C2 . . . . . . . C2 . . G1 . . . . A#1 . . . . . C2 . G1 . . . . . . .",
      chord: "Cm . . . . . . . . . . . . . . . Gm . . . . . . . . . . . . . . .",
    },
  ];

  const BEATS = RAW.map(compile);
  const ids = new Set();
  BEATS.forEach((beat) => {
    if (ids.has(beat.id)) throw new Error(`Doppelte Beat-Id ${beat.id}`);
    ids.add(beat.id);
  });

  const byIdMap = new Map(BEATS.map((beat) => [beat.id, beat]));

  const PATTERN_MAP = {
    "Boom Bap": "nacht-asphalt",
    "Trap Halftime": "glasfront",
    "Lo-Fi Chill": "dachregen",
    "West Coast Bounce": "lowrider",
    "Double-Time Drill": "seitengasse",
    "Uptempo Battle": "hafenstep",
  };

  const noises = new WeakMap();

  function noiseBuf(ctx, seconds) {
    let bag = noises.get(ctx);
    if (!bag) {
      bag = new Map();
      noises.set(ctx, bag);
    }
    const key = seconds.toFixed(3);
    if (!bag.has(key)) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      bag.set(key, buffer);
    }
    return bag.get(key);
  }

  function gainEnv(ctx, time, peak, decay, dest) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, peak), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.02, decay));
    gain.connect(dest);
    return gain;
  }

  function kickVoice(ctx, dest, kit, time, accent) {
    const osc = ctx.createOscillator();
    const amp = gainEnv(ctx, time, accent ? 0.9 : 0.75, kit.kickDecay, dest);
    osc.type = "sine";
    osc.frequency.setValueAtTime(kit.kickF, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, kit.kickEnd), time + Math.min(kit.kickDecay, 0.14));
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + kit.kickDecay + 0.02);
    if (kit.kickClick) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 0.03);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const click = gainEnv(ctx, time, kit.kickClick, 0.03, dest);
      src.connect(hp).connect(click);
      src.start(time);
      src.stop(time + 0.03);
    }
  }

  function snareVoice(ctx, dest, kit, time, accent) {
    const peak = kit.snareGain * (accent ? 1.2 : 1);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf(ctx, 0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const noiseAmp = gainEnv(ctx, time, peak, kit.snareDecay, dest);
    noise.connect(bp).connect(noiseAmp);
    noise.start(time);
    noise.stop(time + kit.snareDecay + 0.02);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = kit.snareTone;
    const toneAmp = gainEnv(ctx, time, peak * 0.32, kit.snareDecay * 0.55, dest);
    osc.connect(toneAmp);
    osc.start(time);
    osc.stop(time + kit.snareDecay);
  }

  function clapVoice(ctx, dest, kit, time, accent) {
    const peak = kit.snareGain * (accent ? 1.15 : 1);
    [0, 0.011, 0.023].forEach((offset, index) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1500;
      const amp = gainEnv(ctx, time + offset, peak * (index === 2 ? 1 : 0.5), kit.snareDecay, dest);
      src.connect(bp).connect(amp);
      src.start(time + offset);
      src.stop(time + offset + kit.snareDecay + 0.02);
    });
  }

  function hatVoice(ctx, dest, kit, time, value, step) {
    const open = value >= 3;
    const accent = value === 2;
    const decay = open ? kit.hatOpen : kit.hatDecay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.2);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = kit.hatHp * (1 + Math.sin(step * 1.7) * 0.04);
    const amp = gainEnv(ctx, time, kit.hatGain * (accent ? 1.45 : open ? 0.85 : 1), decay, dest);
    src.connect(hp).connect(amp);
    src.start(time);
    src.stop(time + decay + 0.02);
  }

  function bassVoice(ctx, dest, kit, note, time) {
    const freq = noteFreq(note);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(freq, time);
    const subAmp = gainEnv(ctx, time, kit.bassGain, kit.bassDecay, dest);
    sub.connect(subAmp);
    sub.start(time);
    sub.stop(time + kit.bassDecay + 0.02);

    if (kit.bassType !== "sine") {
      const osc = ctx.createOscillator();
      osc.type = kit.bassType;
      osc.frequency.setValueAtTime(freq, time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const open = kit.bassType === "triangle" ? Math.min(900, freq * 5) : Math.min(480, freq * 4);
      filter.frequency.setValueAtTime(open, time);
      filter.frequency.exponentialRampToValueAtTime(Math.max(90, freq * 1.5), time + kit.bassDecay);
      const amp = gainEnv(ctx, time, kit.bassGain * 0.55, kit.bassDecay * 0.85, dest);
      osc.connect(filter).connect(amp);
      osc.start(time);
      osc.stop(time + kit.bassDecay + 0.02);
    }
  }

  function stabVoice(ctx, dest, kit, chord, time) {
    const notes = CHORDS[chord];
    if (!notes) return;
    notes.forEach((name, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = noteFreq(name) * (1 + index * 0.004);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(380, time);
      filter.frequency.exponentialRampToValueAtTime(1800, time + 0.045);
      filter.frequency.exponentialRampToValueAtTime(520, time + kit.stabDecay);
      const amp = gainEnv(ctx, time, kit.stabGain, kit.stabDecay, dest);
      osc.connect(filter).connect(amp);
      osc.start(time);
      osc.stop(time + kit.stabDecay + 0.02);
    });
  }

  function percVoice(ctx, dest, kit, time, accent) {
    if (kit.perc === "tom") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(accent ? 210 : 170, time);
      osc.frequency.exponentialRampToValueAtTime(70, time + 0.12);
      const amp = gainEnv(ctx, time, 0.32, 0.14, dest);
      osc.connect(amp);
      osc.start(time);
      osc.stop(time + 0.16);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 460;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 280;
    const amp = gainEnv(ctx, time, 0.1, 0.035, dest);
    osc.connect(hp).connect(amp);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function bellVoice(ctx, dest, time, accent) {
    [540, 812].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      const amp = gainEnv(ctx, time, (accent ? 0.11 : 0.07) * (index === 0 ? 1 : 0.55), 0.08, dest);
      osc.connect(amp);
      osc.start(time);
      osc.stop(time + 0.09);
    });
  }

  function hit(ctx, dest, beat, step, time) {
    const kit = KITS[beat.kit];
    const index = ((step % beat.kick.length) + beat.kick.length) % beat.kick.length;
    const info = { kick: beat.kick[index], snare: beat.snare[index], hat: beat.hat[index] };
    if (beat.kick[index]) kickVoice(ctx, dest, kit, time, beat.kick[index] >= 2);
    if (beat.snare[index]) {
      if (kit.snare === "clap") clapVoice(ctx, dest, kit, time, beat.snare[index] >= 2);
      else snareVoice(ctx, dest, kit, time, beat.snare[index] >= 2);
    }
    if (beat.hat[index]) hatVoice(ctx, dest, kit, time, beat.hat[index], step);
    if (beat.perc[index]) percVoice(ctx, dest, kit, time, beat.perc[index] >= 2);
    if (beat.bell[index]) bellVoice(ctx, dest, time, beat.bell[index] >= 2);
    if (beat.bass[index]) bassVoice(ctx, dest, kit, beat.bass[index], time);
    if (beat.chord[index]) stabVoice(ctx, dest, kit, beat.chord[index], time);
    return info;
  }

  function startAmbience(ctx, dest, beat) {
    const kit = KITS[beat.kit];
    if (!kit || !kit.ambience) {
      return function stop() {};
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 2);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1500;
    filter.Q.value = 0.45;
    const gain = ctx.createGain();
    gain.gain.value = 0.03;
    src.connect(filter).connect(gain).connect(dest);
    src.start();
    return function stop() {
      try {
        src.stop();
      } catch (_error) {
        // already stopped
      }
    };
  }

  function normalize(buffer) {
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
    }
    if (peak < 0.0008) return buffer;
    const gain = Math.min(2.2, 0.89 / peak);
    if (gain > 0.98 && gain < 1.02) return buffer;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) data[i] *= gain;
    }
    return buffer;
  }

  async function renderWav(beat, bpm, bars) {
    const safeBpm = Math.min(180, Math.max(60, Number(bpm) || beat.bpm));
    const safeBars = Math.min(16, Math.max(1, Number(bars) || 8));
    const seconds = safeBars * 4 * (60 / safeBpm) + 0.8;
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
    const comp = offline.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 2.4;
    comp.attack.value = 0.008;
    comp.release.value = 0.18;
    const out = offline.createGain();
    out.gain.value = 0.92;
    comp.connect(out);
    out.connect(offline.destination);
    startAmbience(offline, comp, beat);
    const stepDur = (60 / safeBpm) / 4;
    const total = safeBars * 16;
    for (let step = 0; step < total; step += 1) {
      let time = 0.05 + step * stepDur;
      if (step % 2 === 1) time += stepDur * (beat.swing || 0);
      hit(offline, comp, beat, step, time);
    }
    return audioBufferToWav(normalize(await offline.startRendering()));
  }

  function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const blockAlign = channels * 2;
    const dataSize = samples * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    function writeStr(offset, text) {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    }
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    const data = [];
    for (let channel = 0; channel < channels; channel += 1) {
      data.push(buffer.getChannelData(channel));
    }
    let offset = 44;
    for (let i = 0; i < samples; i += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, data[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  globalThis.FlowBeats = {
    BEATS,
    PATTERN_MAP,
    byId(id) {
      return byIdMap.get(id) || null;
    },
    hit,
    startAmbience,
    renderWav,
    audioBufferToWav,
  };

  const isNode = typeof process !== "undefined" && process.versions && process.versions.node;
  if (isNode && /beats\.js$/.test(process.argv[1] || "")) {
    console.log(`ok ${BEATS.length} beats`);
  }
})();
