// Outbreak Hero – Audio-Engine (alles synthetisch, keine Dateien)
//
// Mischpult:  Effekte ─┐
//             Musik ───┼─► Master ─► Kompressor ─► Lautsprecher
//             Ambiente ┘      ▲
//             (Hall-Sends) ───┘
//
// Interaktiver Soundtrack: ein Step-Sequencer (16tel-Raster, Vorausplanung 120 ms) spielt
// Ebenen, deren Lautstärke dem Spielgeschehen folgt – Flächen immer, Bass ab etwas Druck,
// Schlagzeug ab mittlerer, Arpeggio ab hoher Intensität; Boss- und Rausch-Ebenen eigens.
// Pause und wenig Leben dämpfen die Musik (Tiefpass), bei wenig Leben schlägt ein Herz.
window.GameAudio = (() => {
  let ctx = null, ready = false;
  let master, sfxBus, musicBus, musicTone, ambBus, verb, duck, delay, pulseLP, menuLP;
  let muted = false, musicOn = true;
  const layer = {};
  const LAYERS = ["pad", "bass", "drums", "arp", "lead", "boss", "rage", "pulse"];
  const S = { mode: "off", theme: "street", intensity: 0, target: 0, hp: 1, rage: false, paused: false };
  let noiseBuf = null, drive = null;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init(actx) {
    if (ready || !actx) return;
    ctx = actx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.95;
    master.connect(comp).connect(ctx.destination);
    // Hall: künstliche Impulsantwort (abklingendes Rauschen, Stereo)
    verb = ctx.createConvolver(); verb.buffer = impulse(2.8, 2.4);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.5; verb.connect(verbOut).connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    send(sfxBus, 0.1);
    musicTone = ctx.createBiquadFilter(); musicTone.type = "lowpass"; musicTone.frequency.value = 16000; musicTone.Q.value = 0.4;
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0;
    musicTone.connect(musicBus).connect(master);
    send(musicTone, 0.32);
    ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
    send(ambBus, 0.25);
    // v3.0 Sidechain: Fläche, Bass, Arpeggio und Leitstimme ducken sich unter die Bassdrum (pumpender Groove)
    duck = ctx.createGain(); duck.connect(musicTone);
    // Echo (punktierte Achtel) für Leitstimme und Arpeggio, mit Tiefpass in der Rückkopplung
    delay = ctx.createDelay(2); delay.delayTime.value = 0.75 * 60 / 118;
    const fb = ctx.createGain(); fb.gain.value = 0.33; const dlp = filter("lowpass", 2400, 0.5);
    delay.connect(dlp).connect(fb).connect(delay);
    const dOut = ctx.createGain(); dOut.gain.value = 0.32; dlp.connect(dOut).connect(musicTone);
    const dIn = ctx.createGain(); dIn.gain.value = 0.55; dIn.connect(delay);
    for (const k of LAYERS) {
      const g = ctx.createGain(); g.gain.value = 0; layer[k] = g;
      g.connect(["pad", "bass", "arp", "lead"].includes(k) ? duck : musicTone);
      if (k === "lead" || k === "arp") g.connect(dIn);
    }
    pulseLP = filter("lowpass", 140); pulseLP.connect(layer.pulse);
    menuLP = filter("lowpass", 110); menuLP.connect(layer.pad);
    // Verzerrer für den Rausch-Bass
    drive = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; drive[i] = Math.tanh(x * 4); }
    ready = true;
    setInterval(tick, 25);
  }
  function send(node, amt) { const g = ctx.createGain(); g.gain.value = amt; node.connect(g).connect(verb); }
  function impulse(dur, decay) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // ------------------------------------------------------------------
  // Instrumente: planen einen Ton zum Zeitpunkt t auf den Ausgang dest
  // ------------------------------------------------------------------
  function env(t, a, peak, d, sustain = 0.0001) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
    return g;
  }
  function osc(type, f, t, dur, dest, detune = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noiseSrc(t, dur, dest, off = Math.random()) {
    const s = ctx.createBufferSource(); s.buffer = noise(); s.connect(dest); s.start(t, off); s.stop(t + dur + 0.05);
    return s;
  }
  function filter(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  // Ein Filter pro Ziel und Art statt einem pro Ton: halbiert die Zahl der Audio-Knoten (Handy-CPU)
  const shared = new Map();
  function via(dest, key, make) {
    let m = shared.get(dest);
    if (!m) { m = {}; shared.set(dest, m); }
    if (!m[key]) { const [input, output] = make(); output.connect(dest); m[key] = input; }
    return m[key];
  }

  // v3.0 Instrumente: breiter, druckvoller, mit Stereo, Sidechain und Echo
  const pan = (dest, v) => { if (!ctx.createStereoPanner) return dest; const p = ctx.createStereoPanner(); p.pan.value = v; p.connect(dest); return p; };
  function pad(t, notes, dur, dest, bright = 0.5, vol = 0.05) {
    // je Ton zwei verstimmte Sägezähne links/rechts plus Dreieck eine Oktave tiefer; der Filter atmet über den Takt
    const lp = filter("lowpass", 420 + bright * 1500, 0.7); lp.connect(dest);
    lp.frequency.setValueAtTime(320 + bright * 900, t); lp.frequency.linearRampToValueAtTime(520 + bright * 1700, t + dur * 0.6); lp.frequency.linearRampToValueAtTime(380 + bright * 1100, t + dur + 0.4);
    const g = ctx.createGain(); g.connect(lp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(1.1, dur * 0.4)); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    const gl = pan(g, -0.55), gr = pan(g, 0.55);
    for (const n of notes) { osc("sawtooth", midi(n), t, dur + 0.55, gl, -11); osc("sawtooth", midi(n), t, dur + 0.55, gr, 11); osc("triangle", midi(n - 12), t, dur + 0.55, g); }
  }
  function bass(t, n, dur, dest, vol = 0.16, type = "sawtooth") {
    // Sub-Sinus für den Druck, gefilterter Doppel-Sägezahn für die Kontur (hörbar auch auf Handy-Lautsprechern)
    const lp = filter("lowpass", 1500, 3); lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(190, t + Math.max(0.08, dur * 0.9)); lp.connect(dest);
    const g = env(t, 0.004, vol, dur); g.connect(lp);
    osc(type, midi(n), t, dur, g); osc(type, midi(n), t, dur, g, 9);
    const gs = env(t, 0.004, vol * 1.1, dur); gs.connect(dest); osc("sine", midi(n - 12), t, dur, gs);
  }
  function kick(t, dest, vol = 0.9) {
    // Tonhöhen-Sturz + Klick zum Durchsetzen, leicht gesättigt
    const sat = via(dest, "kickSat", () => { const w = ctx.createWaveShaper(); w.curve = drive; const gg = ctx.createGain(); gg.gain.value = 0.62; w.connect(gg); return [w, gg]; });
    const g = env(t, 0.002, vol * 0.5, 0.34); g.connect(sat);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.1); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    o.connect(g); o.start(t); o.stop(t + 0.36);
    const hp = via(dest, "click", () => { const f = filter("highpass", 2500, 0.7); return [f, f]; });
    const c = env(t, 0.0005, vol * 0.3, 0.012); c.connect(hp); noiseSrc(t, 0.02, c);
  }
  function snare(t, dest, vol = 0.32, clap = false) {
    const bp = via(dest, "snare", () => { const f = filter("bandpass", 1900, 0.7), h = filter("highpass", 900, 0.7); f.connect(h); return [f, h]; });
    const g = env(t, 0.001, vol, 0.2); g.connect(bp); noiseSrc(t, 0.24, g);
    const gb = env(t, 0.001, vol * 0.7, 0.09); gb.connect(dest);
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(165, t + 0.08); o.connect(gb); o.start(t); o.stop(t + 0.12);
    if (clap) for (let i = 0; i < 3; i++) { const e = env(t + i * 0.009, 0.0008, vol * 0.5, 0.03 + i * 0.02); e.connect(bp); noiseSrc(t + i * 0.009, 0.06, e); }
  }
  function hat(t, dest, open = false, vol = 0.09) {
    const hp = via(dest, "hat", () => { const f = filter("highpass", 7600, 0.9); if (!ctx.createStereoPanner) return [f, f]; const p = ctx.createStereoPanner(); p.pan.value = 0.28; f.connect(p); return [f, p]; });
    const g = env(t, 0.0008, vol, open ? 0.22 : 0.04); g.connect(hp); noiseSrc(t, open ? 0.26 : 0.06, g);
  }
  function crash(t, dest, vol = 0.1) {
    const hp = via(dest, "crash", () => { const f = filter("highpass", 4800, 0.6); return [f, f]; });
    const g = env(t, 0.002, vol, 1.7); g.connect(hp); noiseSrc(t, 1.8, g);
  }
  function tom(t, dest, f = 110, vol = 0.55) {
    const g = env(t, 0.002, vol, 0.42); g.connect(dest);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.35);
    o.connect(g); o.start(t); o.stop(t + 0.45);
  }
  function braam(t, root, dest, dur = 2.2, vol = 0.22) {
    const lp = filter("lowpass", 180, 3); lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.35); lp.frequency.exponentialRampToValueAtTime(220, t + dur); lp.connect(dest);
    const g = env(t, 0.04, vol, dur); g.connect(lp);
    for (const [k, d] of [[0, -9], [0, 9], [7, 0], [12, -5], [-12, 0]]) osc("sawtooth", midi(root + k), t, dur, g, d);
  }
  function choir(t, notes, dur, dest, vol = 0.03) {
    const g = ctx.createGain(); g.connect(filter("lowpass", 2200, 0.5)).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    const lfo = ctx.createOscillator(), ld = ctx.createGain(); lfo.frequency.value = 5.2; ld.gain.value = 9; lfo.connect(ld);
    lfo.start(t); lfo.stop(t + dur + 0.7);
    for (const n of notes) { const o = osc("triangle", midi(n), t, dur + 0.6, g); ld.connect(o.detune); }
  }
  function distBass(t, n, dur, dest, vol = 0.07) {
    const ws = via(dest, "drive", () => { const w = ctx.createWaveShaper(); w.curve = drive; const lp = filter("lowpass", 1800, 1); w.connect(lp); return [w, lp]; });
    const g = env(t, 0.004, vol, dur); g.connect(ws); osc("sawtooth", midi(n), t, dur, g);
  }
  function pluck(t, n, dest, vol = 0.07, decay = 0.7) {
    // gezupft: der Filter schließt nach dem Anschlag, Grundton + Oktave
    const lp = filter("lowpass", 4200, 1.5); lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + decay * 0.8); lp.connect(dest);
    const g = env(t, 0.002, vol, decay); g.connect(lp);
    osc("triangle", midi(n), t, decay, g); osc("sawtooth", midi(n), t, decay * 0.5, g, 6); osc("sine", midi(n + 12), t, decay * 0.6, g);
  }
  function keys(t, n, dest, vol = 0.07, decay = 2.2) {
    // Klavier-artig für das Menü-Thema: Anschlag mit Obertönen, langes Ausklingen
    const g = env(t, 0.003, vol, decay); const lp = filter("lowpass", 2600, 0.5); g.connect(lp).connect(dest);
    osc("triangle", midi(n), t, decay, g); osc("sine", midi(n + 12), t, decay * 0.5, g, 3); osc("sine", midi(n + 19), t, decay * 0.18, g, -4);
  }
  let leadPrev = 0;
  function lead(t, n, dur, dest, vol = 0.06) {
    // Leitstimme: Rechteck + Sägezahn leicht verstimmt, gleitet vom vorigen Ton, Vibrato setzt verzögert ein
    const lp = filter("lowpass", 2800, 1.2); lp.connect(dest);
    const g = ctx.createGain(); g.connect(lp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.02, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const lfo = ctx.createOscillator(), ld = ctx.createGain(); lfo.frequency.value = 5.6; ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(14, t + Math.min(0.3, dur)); lfo.connect(ld); lfo.start(t); lfo.stop(t + dur + 0.12);
    for (const d of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = d < 0 ? "square" : "sawtooth"; o.detune.value = d;
      o.frequency.setValueAtTime(midi(leadPrev || n), t); o.frequency.exponentialRampToValueAtTime(midi(n), t + 0.045);
      ld.connect(o.detune); o.connect(g); o.start(t); o.stop(t + dur + 0.12);
    }
    leadPrev = n;
  }

  // ------------------------------------------------------------------
  // v3.0 Soundtrack: d-Moll, Strophe/Refrain mit Leitmelodie, Menü-Klavierthema, Boss-Riff in harmonisch Moll
  // ------------------------------------------------------------------
  const CH = { Dm: [38, "m"], F: [41, "M"], C: [36, "M"], Bb: [34, "M"], Am: [33, "m"], Gm: [43, "m"], Eb: [39, "M"], Csd: [37, "d"] };
  const SONG = {
    menu: { prog: [["Dm", "Bb", "F", "C"]], len: 8 },
    play: { prog: [["Dm", "Bb", "C", "Am"], ["Dm", "F", "C", "Bb"]], len: 8 }, // Strophe, Refrain
    boss: { prog: [["Dm", "Eb", "Dm", "Csd"]], len: 8 },
    over: { prog: [["Dm", "Bb", "Gm", "Am"]], len: 4 },
  };
  const chordOf = (root, kind) => [root, root + (kind === "M" ? 4 : 3), root + (kind === "d" ? 6 : 7)];
  // Melodien je Takt: [16tel-Schritt, MIDI-Ton, Länge in 16teln]; der 8. Takt einer Phrase löst auf
  const HOOK = [
    [[0, 74, 3], [3, 77, 3], [6, 81, 2], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
    [[0, 77, 3], [3, 81, 3], [6, 84, 2], [8, 81, 4], [12, 79, 4]],
    [[0, 76, 3], [3, 79, 3], [6, 84, 2], [8, 82, 2], [10, 81, 2], [12, 79, 4]],
    [[0, 77, 4], [4, 74, 4], [8, 77, 2], [10, 79, 2], [12, 81, 4]],
  ];
  const HOOK_END = [[0, 77, 4], [4, 76, 4], [8, 74, 8]];
  const THEME = [
    [[0, 74, 4], [4, 72, 4], [8, 69, 8]],
    [[0, 70, 4], [4, 72, 4], [8, 74, 8]],
    [[0, 72, 4], [4, 69, 4], [8, 65, 8]],
    [[0, 67, 6], [6, 69, 2], [8, 64, 8]],
  ];
  const THEME_END = [[0, 67, 4], [4, 69, 4], [8, 62, 8]];
  const BOSS_LEAD = [[[0, 74, 2], [2, 75, 2], [4, 74, 2], [6, 73, 2], [8, 74, 6], [14, 69, 2]], [[0, 75, 4], [4, 74, 4], [8, 70, 4], [12, 69, 4]]];
  const BOSS_RIFF = [0, 0, 12, 0, 1, 0, -1, 0, 0, 0, 12, 0, 3, 1, 0, -1];
  const BPM = { menu: 78, play: 118, boss: 132, over: 64 };
  let nextT = 0, step = 0, bar = 0, ambT = 0;
  const lv = (k) => layer[k].gain.value > 0.01 || layerTarget[k] > 0.01; // nur hörbare Ebenen planen
  const layerTarget = {};
  const phrase = (list, end, b) => { const i = b % 8; return i === 7 && end ? end : list[i % list.length]; };

  function tick() {
    if (!ready || S.mode === "off" || ctx.state !== "running" || muted) return; // stumm: nichts planen (Akku)
    const now = ctx.currentTime;
    if (nextT < now - 0.1) nextT = now + 0.03; // nach langer Pause (Hintergrund) nicht alles nachholen
    while (musicOn && nextT < now + 0.25) {
      playStep(nextT);
      nextT += 60 / (BPM[S.mode] || 118) / 4;
      step = (step + 1) % 16; if (!step) bar++;
    }
    if (now > ambT) ambientEvent(now);
  }
  function duckAt(t) { duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.55, t); duck.gain.setTargetAtTime(1, t + 0.015, 0.07); }
  function playStep(t) {
    const m = S.mode, song = SONG[m] || SONG.play, I = S.intensity;
    const sec = song.prog.length > 1 ? Math.floor(bar / song.len) % song.prog.length : 0;
    const [root, kind] = CH[song.prog[sec][bar % 4]], ch = chordOf(root, kind);
    const st = 60 / (BPM[m] || 118) / 4, barDur = st * 16;
    const sw = step % 2 === 1 ? st * 0.12 : 0; // leichter Swing auf den ungeraden 16teln
    const sectionStart = step === 0 && bar % song.len === 0 && bar > 0, fillBar = bar % song.len === song.len - 1;
    if (step === 0 && lv("pad")) pad(t, ch.map((n) => n + 24), barDur, layer.pad, m === "menu" ? 0.2 : m === "over" ? 0.1 : 0.3 + I * 0.5, m === "menu" ? 0.04 : 0.045);
    if (m === "menu") {
      // Menü: Klavier-Thema im Regen, darunter tiefer Grundton und ein ferner Puls alle zwei Takte
      if (lv("lead")) for (const [s0, n, len] of phrase(THEME, THEME_END, bar)) if (s0 === step) keys(t, n, layer.lead, 0.075, Math.max(1.2, len * st * 1.6));
      if (lv("arp") && step % 4 === 2 && Math.random() < 0.3) pluck(t, ch[(step >> 2) % 3] + 60, layer.arp, 0.03, 1.1);
      if (lv("bass") && step === 0) bass(t, root, barDur * 0.9, layer.bass, 0.05, "triangle");
      if (lv("pad") && step === 0 && bar % 2 === 0) kick(t, menuLP, 0.45);
      return;
    }
    if (m === "over") { if (lv("lead") && step % 8 === 0) keys(t, ch[(bar + step / 8) % 3] + 48, layer.lead, 0.05, 2.4); return; }
    const chorus = sec === 1 || m === "boss";
    if (lv("bass")) {
      if (m === "boss") { const off = BOSS_RIFF[step]; if (step % 2 === 0 || off) bass(t, root + 12 + off, st * 0.9, layer.bass, 0.15); }
      else if (chorus ? step % 2 === 0 : (step % 4 === 0 || step === 6 || step === 14)) bass(t + sw, root + 12 + (chorus && step % 4 === 2 ? 12 : 0) + (step === 14 && I > 0.6 ? 7 : 0), st * (chorus ? 1.6 : 2.4), layer.bass);
    }
    if (lv("drums")) {
      const busy = I > 0.7 || m === "boss";
      if (sectionStart) crash(t, layer.drums);
      const kickHit = chorus ? step % 4 === 0 : step === 0 || step === 6 || step === 10 || (busy && step === 14);
      if (kickHit) { kick(t, layer.drums); duckAt(t); }
      if (step === 4 || step === 12) snare(t, layer.drums, 0.3, chorus);
      else if (busy && (step === 7 || step === 15) && Math.random() < 0.5) snare(t + sw, layer.drums, 0.07);
      if (fillBar && step >= 12) snare(t, layer.drums, 0.12 + (step - 12) * 0.05); // Wirbel vor dem Teilwechsel
      const hv = [0.09, 0.04, 0.06, 0.04][step % 4] * (busy ? 1.1 : 0.9);
      if (chorus || step % 2 === 0 || busy) hat(t + sw, layer.drums, chorus && step % 8 === 6, hv);
    }
    if (lv("arp") && step % 2 === 0 && (!chorus || step % 4 === 0)) { const k = (step / 2) % 4; pluck(t + sw, ch[k % 3] + 48 + (k === 3 ? 12 : 0), layer.arp, chorus ? 0.035 : 0.05, 0.35); }
    if (lv("lead")) {
      const mel = m === "boss" ? BOSS_LEAD[bar % 2] : chorus ? phrase(HOOK, HOOK_END, bar) : null;
      if (mel) for (const [s0, n, len] of mel) if (s0 === step) lead(t, n - (m === "boss" ? 12 : 0), len * st * 0.95, layer.lead, m === "boss" ? 0.05 : 0.06);
    }
    if (lv("boss")) {
      if (step === 0 && bar % 2 === 0) braam(t, root - 12, layer.boss, barDur * 1.3, 0.11);
      if ([0, 3, 6, 8, 11, 14].includes(step)) tom(t, layer.boss, step % 8 === 0 ? 90 : 130, 0.3);
      if (step === 0) choir(t, ch.map((n) => n + 36), barDur * 0.95, layer.boss);
    }
    if (lv("rage")) { distBass(t, root + 24 + (step % 4 === 2 ? 12 : 0), 0.09, layer.rage); if (step % 2 === 1) hat(t, layer.rage, false, 0.06); }
    // Herzschlag bei wenig Leben
    if (lv("pulse") && (step === 0 || step === 3)) kick(t, pulseLP, step === 0 ? 0.9 : 0.6);
  }

  // Lautstärken der Ebenen folgen dem Spiel (weich überblendet)
  function update(dt, info = {}) {
    if (!ready) return;
    const mode = info.mode || "menu";
    if (mode !== S.mode) {
      S.mode = mode; leadPrev = 0;
      bar = 0; step = 0; // jeder Modus beginnt mit Takt 1 seines Songs (Strophe, dann Refrain)
      if (delay) delay.delayTime.setTargetAtTime(0.75 * 60 / (BPM[mode] || 118), ctx.currentTime, 0.2); // punktierte Achtel
    }
    if (info.theme && info.theme !== S.theme) setTheme(info.theme);
    S.target = info.intensity ?? 0;
    S.intensity += (S.target - S.intensity) * Math.min(1, dt * (S.target > S.intensity ? 2.5 : 0.5)); // schnell rein, langsam raus
    S.hp = info.hp ?? 1; S.rage = !!info.rage; S.paused = !!info.paused;
    const I = S.intensity, m = S.mode, c = (x) => Math.max(0, Math.min(1, x));
    const T = {
      pad: m === "over" ? 0.45 : m === "menu" ? 0.75 : 0.7,
      bass: m === "boss" ? 0.9 : m === "play" ? c((I - 0.1) * 4) * 0.9 : m === "menu" ? 0.6 : 0,
      drums: m === "boss" ? 1 : m === "play" ? c((I - 0.25) * 3.2) : 0,
      arp: m === "menu" ? 0.5 : m === "boss" ? 0.3 : m === "play" ? c((I - 0.4) * 3) * 0.8 : 0,
      lead: m === "menu" ? 0.9 : m === "over" ? 0.7 : m === "boss" ? 0.65 : m === "play" ? c((I - 0.55) * 3) * 0.9 : 0,
      boss: m === "boss" ? 1 : 0,
      rage: (m === "play" || m === "boss") && S.rage ? 1 : 0,
      pulse: (m === "play" || m === "boss") && S.hp < 0.3 ? 1 : 0,
    };
    const now = ctx.currentTime;
    for (const k of LAYERS) { layerTarget[k] = T[k]; layer[k].gain.setTargetAtTime(T[k], now, 0.4); }
    // gedämpft in der Pause und wenn das Leben knapp wird
    const cut = S.paused ? 700 : (m === "play" || m === "boss") && S.hp < 0.3 ? 1400 : m === "over" ? 900 : 16000;
    musicTone.frequency.setTargetAtTime(cut, now, 0.25);
    ambBus.gain.setTargetAtTime(m === "off" ? 0 : S.paused ? 0.25 : 0.6, now, 0.5);
    rotorOn(m === "menu");
  }

  // v2.1: Hubschrauber über dem Menü – gefiltertes Rauschen, rhythmisch moduliert (Rotorblätter),
  // dazu ein langsames An- und Abschwellen, wenn er seine Kreise zieht
  let rotor = null;
  function rotorOn(on) {
    const now = ctx.currentTime;
    if (on && !rotor) {
      const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
      const lp = filter("lowpass", 240, 0.9), am = ctx.createGain(), out = ctx.createGain();
      am.gain.value = 0.55; out.gain.value = 0.0001;
      const lfo = ctx.createOscillator(); lfo.type = "triangle"; lfo.frequency.value = 12.5;
      const depth = ctx.createGain(); depth.gain.value = 0.45; lfo.connect(depth).connect(am.gain);
      const swell = ctx.createOscillator(); swell.frequency.value = 0.16 / (2 * Math.PI) * 2;
      const sDepth = ctx.createGain(); sDepth.gain.value = 0.08; swell.connect(sDepth).connect(out.gain);
      src.connect(lp).connect(am).connect(out).connect(ambBus);
      src.start(now, Math.random()); lfo.start(now); swell.start(now);
      out.gain.setTargetAtTime(0.16, now, 1.5);
      rotor = { src, lfo, swell, sDepth, out };
    } else if (!on && rotor) {
      const r = rotor; rotor = null;
      r.sDepth.disconnect(); r.out.gain.cancelScheduledValues(now); r.out.gain.setTargetAtTime(0.0001, now, 0.4);
      setTimeout(() => { for (const n of [r.src, r.lfo, r.swell]) { try { n.stop(); } catch { /* schon gestoppt */ } } }, 2500);
    }
  }

  // ------------------------------------------------------------------
  // Ambiente je Welt: Dauerschleifen + zufällige Ereignisse
  // ------------------------------------------------------------------
  let amb = null;
  function setTheme(th) {
    S.theme = th;
    if (!ready) return;
    const now = ctx.currentTime;
    if (amb) { const old = amb; old.g.gain.setTargetAtTime(0.0001, now, 0.6); setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch { /* schon gestoppt */ } }), 3000); }
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ambBus); g.gain.setTargetAtTime(1, now, 1.2);
    const nodes = [];
    const loopNoise = (type, f, q, vol) => { const s = ctx.createBufferSource(); s.buffer = noise(); s.loop = true; const fl = filter(type, f, q), gg = ctx.createGain(); gg.gain.value = vol; s.connect(fl).connect(gg).connect(g); s.start(now, Math.random()); nodes.push(s); return fl; };
    const drone = (type, f, cut, vol) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const fl = filter("lowpass", cut), gg = ctx.createGain(); gg.gain.value = vol; o.connect(fl).connect(gg).connect(g); o.start(now); nodes.push(o); };
    const gusts = (fl, depth, rate) => { const o = ctx.createOscillator(), d = ctx.createGain(); o.frequency.value = rate; d.gain.value = depth; o.connect(d).connect(fl.frequency); o.start(now); nodes.push(o); };
    if (th === "street") {
      loopNoise("bandpass", 2600, 0.4, 0.09); // Regen
      loopNoise("lowpass", 380, 0.7, 0.05); // Rauschen der Stadt
      gusts(loopNoise("bandpass", 460, 1.2, 0.035), 260, 0.07); // v3.0 Windböen: Filter wandert langsam
    } else if (th === "hospital") {
      drone("sawtooth", 50, 160, 0.05); drone("square", 120, 300, 0.006); // Netzbrummen, Leuchtstoffröhren
      loopNoise("bandpass", 600, 0.6, 0.02); // Lüftung
    } else if (th === "markt") {
      loopNoise("lowpass", 260, 0.85, 0.045); // Kneipenwärme
      drone("triangle", 98, 420, 0.018);
      loopNoise("bandpass", 1400, 0.5, 0.02); // Stimmen-Gemurmel
      gusts(loopNoise("bandpass", 520, 1.1, 0.025), 200, 0.05);
    } else {
      drone("sawtooth", 41, 140, 0.06); drone("triangle", 82.5, 400, 0.02); // Maschinen
      loopNoise("highpass", 5000, 0.7, 0.012); // Dampfzischen
    }
    amb = { g, nodes };
  }
  function ambientEvent(now) {
    ambT = now + rnd(6, 14);
    if (muted || S.mode === "off") return;
    const g = ambBus, th = S.theme, r = Math.random();
    if (r < 0.36) {
      // v3.0 fernes Stöhnen mit zwei Formanten (klingt nach Kehle statt nach Synthesizer) und Zittern
      const t = now + 0.05, f0 = rnd(85, 125), dur = rnd(1.4, 2.2), e = env(t, 0.35, 0.045, dur), pn = pan(g, rnd(-0.8, 0.8));
      const f1 = filter("bandpass", rnd(480, 650), 5), f2 = filter("bandpass", rnd(1000, 1250), 6), g2 = ctx.createGain(); g2.gain.value = 0.5;
      e.connect(f1).connect(pn); e.connect(f2).connect(g2).connect(pn);
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.72, t + dur);
      const vib = ctx.createOscillator(), vd = ctx.createGain(); vib.frequency.value = rnd(6, 9); vd.gain.value = f0 * 0.04; vib.connect(vd).connect(o.frequency);
      o.connect(e); o.start(t); o.stop(t + dur + 0.3); vib.start(t); vib.stop(t + dur + 0.3);
    } else if (r < 0.5) {
      // ferne Explosion: dumpfer Schlag mit langem Nachhall
      const t = now + 0.05, lp = filter("lowpass", 220, 0.6); lp.connect(pan(g, rnd(-0.7, 0.7)));
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.22, t + 0.04); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); e.connect(lp);
      noiseSrc(t, 2.5, e);
    } else if (r < 0.6 && (th === "street" || th === "markt")) {
      // ferne Schüsse, kurze Salve
      const n = 2 + Math.floor(Math.random() * 4), pn = pan(g, rnd(-0.9, 0.9)), bp = filter("bandpass", 900, 0.8); bp.connect(pn);
      for (let i = 0; i < n; i++) { const t = now + 0.05 + i * rnd(0.09, 0.16), e = env(t, 0.001, 0.05, 0.12); e.connect(bp); noiseSrc(t, 0.14, e); }
    } else if (th === "street") {
      // ferne Sirene
      const t = now + 0.05, lp = filter("lowpass", 1100); lp.connect(g);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.02, t + 1.5); e.gain.exponentialRampToValueAtTime(0.0001, t + 6); e.connect(lp);
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 760;
      const lfo = ctx.createOscillator(), ld = ctx.createGain(); lfo.frequency.value = 0.45; ld.gain.value = 140; lfo.connect(ld).connect(o.frequency);
      o.connect(e); o.start(t); lfo.start(t); o.stop(t + 6.2); lfo.stop(t + 6.2);
    } else if (th === "hospital") {
      for (let i = 0; i < 3; i++) { const t = now + i * rnd(0.6, 1.2), e = env(t, 0.002, 0.03, 0.08); e.connect(g); const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(1900, t); o.frequency.exponentialRampToValueAtTime(800, t + 0.06); o.connect(e); o.start(t); o.stop(t + 0.1); }
    } else {
      for (let i = 0; i < 2; i++) { const t = now + i * 0.32, e = env(t, 0.01, 0.025, 0.2, 0.0001); e.connect(g); osc("square", 880, t, 0.22, e); }
    }
  }
  // Donner nach einem Blitz (mit Laufzeitverzögerung)
  function thunder(delay = 0.6, power = 1) {
    if (!ready || muted) return;
    const t = ctx.currentTime + delay, lp = filter("lowpass", 420, 0.5); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + 3); lp.connect(sfxBus);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.08); e.gain.exponentialRampToValueAtTime(0.18 * power, t + 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + 3.6); e.connect(lp);
    noiseSrc(t, 3.8, e);
  }

  // ------------------------------------------------------------------
  // Stinger (kurze Musikakzente) und Bedien-Klänge
  // ------------------------------------------------------------------
  function stinger(name) {
    if (!ready || muted) return;
    const t = ctx.currentTime + 0.02, out = ctx.createGain(); out.gain.value = musicOn ? 1 : 0.5; out.connect(master);
    const v = ctx.createGain(); v.gain.value = 0.3; out.connect(v).connect(verb);
    if (name === "boss") {
      // Rauschen schwillt an, dann der „Braam“
      const bp = filter("bandpass", 400, 0.8); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3000, t + 1.1); bp.connect(out);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.25, t + 1.1); e.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); e.connect(bp); noiseSrc(t, 1.25, e);
      braam(t + 1.15, 26, out, 3, 0.32); kick(t + 1.15, out, 1);
    } else if (name === "clear") {
      [62, 66, 69, 74, 78].forEach((n, i) => pluck(t + i * 0.07, n, out, 0.08, 1.2));
      pad(t, [50, 54, 57], 1.6, out, 0.6, 0.03);
    } else if (name === "level") {
      [69, 72, 76, 81, 84].forEach((n, i) => pluck(t + i * 0.055, n, out, 0.07, 0.6));
    } else if (name === "victory") {
      braam(t, 38, out, 2.4, 0.2); pad(t, [62, 66, 69, 74], 2.6, out, 0.9, 0.05); kick(t, out, 1);
      const hp = filter("highpass", 3000); hp.connect(out); const e = env(t, 0.005, 0.2, 1.8); e.connect(hp); noiseSrc(t, 2, e);
    } else if (name === "death") {
      const e = env(t, 0.02, 0.2, 2.6); const lp = filter("lowpass", 900); e.connect(lp).connect(out);
      for (const d of [-10, 10]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.detune.value = d; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(36, t + 2.6); o.connect(e); o.start(t); o.stop(t + 2.8); }
      kick(t, out, 1);
    } else if (name === "horde") {
      // anrollende Masse: tiefes Rauschen schwillt an, dazu Trommeln und am Ende ein dumpfer Braam
      const lp = filter("lowpass", 160, 0.8); lp.frequency.setValueAtTime(120, t); lp.frequency.exponentialRampToValueAtTime(600, t + 2.2); lp.connect(out);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.45, t + 2.2); e.gain.exponentialRampToValueAtTime(0.0001, t + 3.2); e.connect(lp); noiseSrc(t, 3.3, e);
      for (let i = 0; i < 6; i++) tom(t + 0.4 + i * 0.36, out, 70 + i * 6, 0.35);
      braam(t + 2.4, 33, out, 2.2, 0.22);
    } else if (name === "radio") {
      // Funkgerät: Rauschen mit Bandpass, dann zwei Pieptöne
      const bp = filter("bandpass", 1800, 1.6); bp.connect(out);
      const e = env(t, 0.01, 0.12, 0.45); e.connect(bp); noiseSrc(t, 0.5, e);
      for (let i = 0; i < 2; i++) { const b = env(t + 0.5 + i * 0.16, 0.003, 0.05, 0.1); b.connect(out); osc("sine", 1320, t + 0.5 + i * 0.16, 0.12, b); }
    } else if (name === "start") {
      kick(t, out, 1); const lp = filter("lowpass", 600); lp.connect(out); const e = env(t, 0.005, 0.35, 1.2); e.connect(lp); noiseSrc(t, 1.3, e);
      braam(t, 38, out, 1.6, 0.16);
    }
  }
  function ui(kind) {
    if (!ready || muted) return;
    const t = ctx.currentTime + 0.005;
    if (kind === "swipe") { const bp = filter("bandpass", 600, 1.2); bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(3500, t + 0.18); bp.connect(sfxBus); const e = env(t, 0.02, 0.12, 0.18); e.connect(bp); noiseSrc(t, 0.22, e); return; }
    const e = env(t, 0.002, kind === "confirm" ? 0.12 : 0.07, kind === "confirm" ? 0.25 : 0.06); e.connect(sfxBus);
    if (kind === "confirm") { osc("triangle", 660, t, 0.25, e); osc("triangle", 990, t + 0.06, 0.2, e); }
    else if (kind === "back") osc("triangle", 520, t, 0.07, e).frequency.exponentialRampToValueAtTime(300, t + 0.06);
    else osc("square", 1250, t, 0.04, e).frequency.exponentialRampToValueAtTime(900, t + 0.035);
  }

  // ------------------------------------------------------------------
  // Waffen-Identität: jede Waffe hat eigenen Körper, Knall und Schweif
  // ------------------------------------------------------------------
  let lastGunT = 0, lastFootT = 0, lastMeatT = 0;
  function gun(kind) {
    if (!ready || muted) return;
    const t = ctx.currentTime + 0.001;
    const gap = { smg: 0.038, minigun: 0.032, flame: 0.07, rifle: 0.042, laser: 0.048, pistol: 0.05 }[kind] || 0.055;
    if (t - lastGunT < gap) return;
    lastGunT = t;
    const out = sfxBus;
    const body = (f0, f1, dur, vol, type = "sine") => {
      const g = env(t, 0.001, vol, dur); g.connect(out);
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(22, f1), t + dur);
      o.connect(g); o.start(t); o.stop(t + dur + 0.03);
    };
    const crack = (hi, lo, dur, vol) => {
      const hp = filter("highpass", 1600, 0.55); hp.connect(out);
      const g = env(t, 0.0007, vol, dur); g.connect(hp); noiseSrc(t, dur + 0.02, g);
      const bp = filter("bandpass", hi, 1.2); bp.frequency.setValueAtTime(hi, t); bp.frequency.exponentialRampToValueAtTime(Math.max(80, lo), t + dur); bp.connect(out);
      const g2 = env(t, 0.0007, vol * 0.65, dur * 0.75); g2.connect(bp); noiseSrc(t, dur, g2);
    };
    const tail = (cut, dur, vol) => {
      const lp = filter("lowpass", cut, 0.6); lp.frequency.setValueAtTime(cut, t); lp.frequency.exponentialRampToValueAtTime(80, t + dur); lp.connect(out);
      const g = env(t, 0.004, vol, dur); g.connect(lp); noiseSrc(t, dur + 0.05, g);
    };
    switch (kind) {
      case "shotgun": body(170, 38, 0.24, 0.62); crack(2200, 280, 0.18, 0.32); tail(900, 0.28, 0.16); break;
      case "magnum": body(110, 32, 0.28, 0.7); crack(2800, 220, 0.14, 0.28); tail(700, 0.32, 0.18); break;
      case "sniper": body(90, 28, 0.32, 0.72); crack(5200, 400, 0.2, 0.3); tail(500, 0.45, 0.2); break;
      case "smg": body(280, 90, 0.055, 0.2); crack(5000, 1400, 0.045, 0.16); break;
      case "rifle": body(200, 55, 0.1, 0.32); crack(3600, 700, 0.08, 0.2); break;
      case "minigun": body(240, 80, 0.045, 0.18); crack(3800, 1100, 0.04, 0.14); break;
      case "pistol": body(240, 70, 0.09, 0.3); crack(4400, 900, 0.07, 0.2); break;
      case "flame": {
        const bp = filter("bandpass", 700, 0.7); bp.connect(out);
        const g = env(t, 0.01, 0.16, 0.22); g.connect(bp); noiseSrc(t, 0.24, g);
        body(90, 50, 0.18, 0.08, "sawtooth");
        break;
      }
      case "tesla": body(80, 40, 0.08, 0.12, "square"); crack(8000, 1800, 0.1, 0.18); break;
      case "grenade": body(150, 45, 0.16, 0.4); crack(900, 200, 0.1, 0.14); break;
      case "rocket": body(70, 28, 0.22, 0.5, "sawtooth"); tail(600, 0.35, 0.18); break;
      case "laser": {
        const g = env(t, 0.002, 0.16, 0.12); g.connect(out);
        osc("sawtooth", 1680, t, 0.14, g); osc("sine", 3360, t, 0.1, g);
        crack(7000, 2500, 0.06, 0.1);
        break;
      }
      case "cryo": {
        const hp = filter("highpass", 2400, 0.8); hp.connect(out);
        const g = env(t, 0.004, 0.14, 0.16); g.connect(hp); noiseSrc(t, 0.18, g);
        body(420, 180, 0.12, 0.1, "triangle");
        break;
      }
      case "disc": body(180, 70, 0.1, 0.22, "square"); crack(3200, 800, 0.08, 0.12); break;
      case "crossbow": body(140, 60, 0.12, 0.22, "triangle"); crack(1800, 600, 0.06, 0.1); break;
      default: body(220, 70, 0.09, 0.28); crack(4000, 800, 0.07, 0.18);
    }
  }
  function foot() {
    if (!ready || muted) return;
    const t = ctx.currentTime;
    if (t - lastFootT < 0.16) return;
    lastFootT = t;
    const lp = filter("lowpass", 420, 0.8); lp.connect(sfxBus);
    const g = env(t, 0.002, 0.07, 0.09); g.connect(lp);
    noiseSrc(t, 0.1, g);
    osc("sine", rnd(70, 95), t, 0.08, g);
  }
  function meat(heavy) {
    if (!ready || muted) return;
    const t = ctx.currentTime;
    if (t - lastMeatT < (heavy ? 0.05 : 0.04)) return;
    lastMeatT = t;
    const lp = filter("lowpass", heavy ? 380 : 700, 0.7); lp.connect(sfxBus);
    const g = env(t, 0.001, heavy ? 0.22 : 0.12, heavy ? 0.16 : 0.08); g.connect(lp);
    noiseSrc(t, heavy ? 0.18 : 0.09, g);
    osc("sine", heavy ? 70 : 140, t, heavy ? 0.14 : 0.07, g);
  }

  function setMuted(m) { muted = m; if (ready) master.gain.setTargetAtTime(m ? 0 : 0.95, ctx.currentTime, 0.05); }
  function setMusic(on) { musicOn = on; if (ready) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.2); }

  return {
    init, update, setTheme, stinger, thunder, ui, gun, foot, meat, setMuted, setMusic,
    get ready() { return ready; },
    sfxOut: () => (ready ? sfxBus : ctx && ctx.destination),
    get debug() { return { song: { bpm: BPM[S.mode], section: SONG[S.mode] && SONG[S.mode].prog.length > 1 ? Math.floor(bar / 8) % 2 : 0 }, rotor: !!rotor, S: { ...S }, cut: musicTone ? Math.round(musicTone.frequency.value) : 0, layers: Object.fromEntries(LAYERS.map((k) => [k, layer[k] ? +layer[k].gain.value.toFixed(3) : 0])), bar, step }; },
  };
})();
