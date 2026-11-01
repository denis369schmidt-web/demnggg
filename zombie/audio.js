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
  let master, sfxBus, musicBus, musicTone, ambBus, verb;
  let muted = false, musicOn = true;
  const layer = {};
  const LAYERS = ["pad", "bass", "drums", "arp", "boss", "rage", "pulse"];
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
    for (const k of LAYERS) { const g = ctx.createGain(); g.gain.value = 0; g.connect(musicTone); layer[k] = g; }
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

  function pad(t, notes, dur, dest, bright = 0.5, vol = 0.05) {
    const lp = filter("lowpass", 500 + bright * 1600, 0.6); lp.connect(dest);
    const g = ctx.createGain(); g.connect(lp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.9, dur * 0.35)); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    for (const n of notes) for (const d of [-7, 7]) osc("sawtooth", midi(n), t, dur + 0.45, g, d);
  }
  function bass(t, n, dur, dest, vol = 0.16, type = "sawtooth") {
    const lp = filter("lowpass", 900, 2); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(160, t + dur); lp.connect(dest);
    const g = env(t, 0.006, vol, dur); g.connect(lp);
    osc(type, midi(n), t, dur, g); osc("square", midi(n - 12), t, dur, g);
  }
  function kick(t, dest, vol = 0.9) {
    const g = env(t, 0.002, vol, 0.28); g.connect(dest);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    o.connect(g); o.start(t); o.stop(t + 0.32);
  }
  function snare(t, dest, vol = 0.32) {
    const bp = via(dest, "snare", () => { const f = filter("bandpass", 1900, 0.8); return [f, f]; });
    const g = env(t, 0.001, vol, 0.17); g.connect(bp); noiseSrc(t, 0.2, g);
    const gb = env(t, 0.001, vol * 0.6, 0.08); gb.connect(dest); osc("triangle", 190, t, 0.1, gb);
  }
  function hat(t, dest, open = false, vol = 0.09) {
    const hp = via(dest, "hat", () => { const f = filter("highpass", 7200, 0.8); return [f, f]; });
    const g = env(t, 0.001, vol, open ? 0.14 : 0.035); g.connect(hp); noiseSrc(t, open ? 0.16 : 0.05, g);
  }
  function tom(t, dest, f = 110, vol = 0.55) {
    const g = env(t, 0.002, vol, 0.42); g.connect(dest);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.35);
    o.connect(g); o.start(t); o.stop(t + 0.45);
  }
  function pluck(t, n, dest, vol = 0.07, decay = 0.7) {
    const g = env(t, 0.003, vol, decay); g.connect(dest);
    osc("triangle", midi(n), t, decay, g); osc("sine", midi(n + 12), t, decay * 0.6, g);
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

  // ------------------------------------------------------------------
  // Sequencer
  // ------------------------------------------------------------------
  const PROG = { play: [[38, 0], [34, 1], [43, 0], [33, 1]], boss: [[38, 0], [39, 1], [38, 0], [36, 1]], menu: [[38, 0], [34, 1], [41, 1], [33, 1]], over: [[38, 0]] };
  const chordOf = (root, major) => [root, root + (major ? 4 : 3), root + 7];
  const BPM = { menu: 76, play: 112, boss: 128, over: 60 };
  let nextT = 0, step = 0, bar = 0, ambT = 0;
  const lv = (k) => layer[k].gain.value > 0.01 || layerTarget[k] > 0.01; // nur hörbare Ebenen planen
  const layerTarget = {};

  function tick() {
    if (!ready || S.mode === "off" || ctx.state !== "running" || muted) return; // stumm: nichts planen (Akku)
    const now = ctx.currentTime;
    if (nextT < now - 0.1) nextT = now + 0.03; // nach langer Pause (Hintergrund) nicht alles nachholen
    while (musicOn && nextT < now + 0.25) {
      playStep(nextT);
      nextT += 60 / (BPM[S.mode] || 112) / 4;
      step = (step + 1) % 16; if (!step) bar++;
    }
    if (now > ambT) ambientEvent(now);
  }
  function playStep(t) {
    const m = S.mode, prog = PROG[m] || PROG.play, [root, major] = prog[bar % prog.length], ch = chordOf(root, major);
    const barDur = (60 / (BPM[m] || 112)) * 4, I = S.intensity;
    if (step === 0 && lv("pad")) pad(t, ch.map((n) => n + 24), barDur, layer.pad, m === "menu" ? 0.15 : 0.3 + I * 0.5, m === "menu" ? 0.035 : 0.045);
    if (m === "menu") {
      // Menü: Flächen, vereinzelte Töne wie ein verstimmtes Klavier im Regen, ab und zu ein ferner Schlag
      if (lv("arp") && (step === 0 || step === 6 || step === 10) && Math.random() < 0.7) pluck(t, ch[Math.floor(Math.random() * 3)] + 36, layer.arp, 0.05, 1.6);
      if (lv("pad") && step === 0 && bar % 4 === 0) { const lp = filter("lowpass", 120); lp.connect(layer.pad); kick(t, lp, 0.5); }
      return;
    }
    if (m === "over") return;
    // Bass: Achtel (ruhig: Viertel), bei Boss treibende 16tel
    if (lv("bass")) {
      if (m === "boss" ? step % 2 === 0 || step % 4 === 3 : I > 0.5 ? step % 2 === 0 : step % 4 === 0) bass(t, root + 12 + (step === 14 && I > 0.6 ? 7 : 0), 0.18, layer.bass);
    }
    if (lv("drums")) {
      const busy = I > 0.7 || m === "boss";
      if (step === 0 || step === 8 || (busy && (step === 6 || step === 11))) kick(t, layer.drums);
      if (step === 4 || step === 12) snare(t, layer.drums);
      if (busy && bar % 4 === 3 && step >= 13) snare(t, layer.drums, 0.2); // kleiner Wirbel vor dem Taktwechsel
      if (step % 2 === 0 || busy) hat(t, layer.drums, step % 8 === 6, busy ? 0.085 : 0.09);
    }
    if (lv("arp") && step % 2 === 0) { const k = (step / 2) % 4; pluck(t, ch[k % 3] + 48 + (k === 3 ? 12 : 0), layer.arp, 0.05, 0.4); }
    if (lv("boss")) {
      if (step === 0 && bar % 2 === 0) braam(t, root - 12, layer.boss, barDur * 1.3, 0.11);
      if ([0, 3, 6, 8, 11, 14].includes(step)) tom(t, layer.boss, step % 8 === 0 ? 90 : 130, 0.32);
      if (step === 0) choir(t, ch.map((n) => n + 36), barDur * 0.95, layer.boss);
    }
    if (lv("rage")) { distBass(t, root + 24 + (step % 4 === 2 ? 12 : 0), 0.09, layer.rage); if (step % 2 === 1) hat(t, layer.rage, false, 0.06); }
    // Herzschlag bei wenig Leben
    if (lv("pulse") && (step === 0 || step === 3)) { const lp = filter("lowpass", 140); lp.connect(layer.pulse); kick(t, lp, step === 0 ? 0.9 : 0.6); }
  }

  // Lautstärken der Ebenen folgen dem Spiel (weich überblendet)
  function update(dt, info = {}) {
    if (!ready) return;
    const mode = info.mode || "menu";
    if (mode !== S.mode) { const was = S.mode; S.mode = mode; if (was === "off" || mode === "menu") { bar = 0; step = 0; } }
    if (info.theme && info.theme !== S.theme) setTheme(info.theme);
    S.target = info.intensity ?? 0;
    S.intensity += (S.target - S.intensity) * Math.min(1, dt * (S.target > S.intensity ? 2.5 : 0.5)); // schnell rein, langsam raus
    S.hp = info.hp ?? 1; S.rage = !!info.rage; S.paused = !!info.paused;
    const I = S.intensity, m = S.mode, c = (x) => Math.max(0, Math.min(1, x));
    const T = {
      pad: m === "over" ? 0.4 : 0.8,
      bass: m === "boss" ? 0.9 : m === "play" ? c((I - 0.12) * 4) * 0.9 : 0,
      drums: m === "boss" ? 1 : m === "play" ? c((I - 0.3) * 3.5) : 0,
      arp: m === "menu" ? 0.9 : m === "boss" ? 0.35 : m === "play" ? c((I - 0.55) * 3) * 0.8 : 0,
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
    if (th === "street") {
      loopNoise("bandpass", 2600, 0.4, 0.09); // Regen
      loopNoise("lowpass", 380, 0.7, 0.05); // Rauschen der Stadt / Wind
    } else if (th === "hospital") {
      drone("sawtooth", 50, 160, 0.05); drone("square", 120, 300, 0.006); // Netzbrummen, Leuchtstoffröhren
      loopNoise("bandpass", 600, 0.6, 0.02); // Lüftung
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
    if (r < 0.45) {
      // fernes Stöhnen
      const t = now + 0.05, f0 = rnd(80, 120), bp = filter("bandpass", rnd(420, 700), 4); bp.connect(g);
      const e = env(t, 0.4, 0.05, 1.4); e.connect(bp);
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.75, t + 1.7); o.connect(e); o.start(t); o.stop(t + 1.9);
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

  function setMuted(m) { muted = m; if (ready) master.gain.setTargetAtTime(m ? 0 : 0.95, ctx.currentTime, 0.05); }
  function setMusic(on) { musicOn = on; if (ready) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.2); }

  return {
    init, update, setTheme, stinger, thunder, ui, setMuted, setMusic,
    get ready() { return ready; },
    sfxOut: () => (ready ? sfxBus : ctx && ctx.destination),
    get debug() { return { S: { ...S }, cut: musicTone ? Math.round(musicTone.frequency.value) : 0, layers: Object.fromEntries(LAYERS.map((k) => [k, layer[k] ? +layer[k].gain.value.toFixed(3) : 0])), bar, step }; },
  };
})();
