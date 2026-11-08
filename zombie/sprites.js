/* Sprite-Engine von Outbreak Hero.
 * Alle Grafiken werden prozedural mit Canvas gezeichnet (keine Bilddateien, keine
 * Lizenzfragen) und einmalig in Geräteauflösung gecacht. Das Spiel zeichnet pro
 * Frame nur noch fertige Bitmaps – das hält es auch auf schwachen Handys flüssig.
 * Konvention: Figuren schauen nach +x (rechts) und werden beim Zeichnen gedreht.
 */
"use strict";
window.Sprites = (() => {
  const TAU = Math.PI * 2;
  const FRAMES = 8;
  let RES = 2;
  const cache = new Map();

  // ------------------------------------------------------------------
  // Grundlagen
  // ------------------------------------------------------------------
  function setRes(r) {
    const next = Math.max(1, Math.min(3, Math.round(r * 2) / 2));
    if (next !== RES) { RES = next; cache.clear(); iconCache.clear(); }
    return RES;
  }

  // readable: im Hauptspeicher zeichnen – für Bilder, die per toDataURL/getImageData ausgelesen werden
  // (bei GPU-Leinwänden müsste der Browser dafür erst alles von der Grafikkarte zurückholen)
  function canvas(w, h, res = RES, readable = false) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * res));
    c.height = Math.max(1, Math.ceil(h * res));
    const g = c.getContext("2d", readable ? { willReadFrequently: true } : undefined);
    g.scale(res, res);
    return { c, g };
  }

  function get(key, w, h, fn) {
    let s = cache.get(key);
    if (!s) {
      const { c, g } = canvas(w, h);
      fn(g, w, h);
      s = { c, w, h };
      cache.set(key, s);
    }
    return s;
  }

  // Zentriert zeichnen (optional gedreht/skaliert)
  function draw(ctx, s, x, y, ang = 0, sc = 1) {
    if (!ang && sc === 1) { ctx.drawImage(s.c, x - s.w / 2, y - s.h / 2, s.w, s.h); return; }
    ctx.save();
    ctx.translate(x, y);
    if (ang) ctx.rotate(ang);
    if (sc !== 1) ctx.scale(sc, sc);
    ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  // Deterministischer Zufall, damit alle Animations-Frames dieselben Details haben
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  // amt > 0 aufhellen, amt < 0 abdunkeln
  function mix(h, amt) {
    const [r, g, b] = hex2rgb(h);
    const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
    return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
  }
  const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };

  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // Volumen-Verlauf (Licht von oben links)
  function vol(g, x, y, r, base, hi = 0.28, lo = -0.4) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
    gr.addColorStop(0, mix(base, hi));
    gr.addColorStop(1, mix(base, lo));
    return gr;
  }
  function limb(g, x1, y1, x2, y2, w, color) {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = "round";
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  function blob(g, x, y, r, R, pts = 8) {
    g.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU, k = r * (0.65 + R() * 0.55);
      const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  // Zeichnet fn mit dunkler Umrisslinie (bessere Lesbarkeit auf dunklem Boden)
  function outlined(fn, ol = 1.2, color = "rgba(6,8,6,0.92)", res) {
    return (g, w, h) => {
      const t = canvas(w, h, res || RES); fn(t.g, w, h);
      // v2.7 Volumen: Mitte leicht aufgehellt, Rand abgedunkelt – wirkt wie Licht von oben, egal wie die Figur gedreht ist
      t.g.save(); t.g.globalCompositeOperation = "source-atop";
      const vg = t.g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5);
      vg.addColorStop(0, "rgba(255,248,230,0.1)"); vg.addColorStop(0.5, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.32)");
      t.g.fillStyle = vg; t.g.fillRect(0, 0, w, h); t.g.restore();
      const sil = canvas(w, h, res || RES);
      sil.g.drawImage(t.c, 0, 0, w, h);
      sil.g.globalCompositeOperation = "source-in";
      sil.g.fillStyle = color; sil.g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.drawImage(sil.c, Math.cos(a) * ol, Math.sin(a) * ol, w, h); }
      g.drawImage(t.c, 0, 0, w, h);
    };
  }

  // Einfarbige Silhouette (Treffer-Blitz, Eis, Leiche …)
  function tinted(key, base, color, alpha) {
    return get(key, base.w, base.h, (g, w, h) => {
      g.drawImage(base.c, 0, 0, w, h);
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, w, h);
    });
  }

  // ------------------------------------------------------------------
  // Licht & Glow
  // ------------------------------------------------------------------
  // rgb als "r,g,b"
  function glow(rgb) {
    return get(`glow:${rgb}`, 64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${rgb},1)`);
      gr.addColorStop(0.18, `rgba(${rgb},0.65)`);
      gr.addColorStop(0.45, `rgba(${rgb},0.2)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }

  let lightSprite = null;
  // Weicher Lichtkegel für die Dunkelheits-Maske (feste Auflösung)
  function light() {
    if (lightSprite) return lightSprite;
    const { c, g } = canvas(128, 128, 1);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.8)");
    gr.addColorStop(0.7, "rgba(255,255,255,0.3)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    lightSprite = { c, w: 128, h: 128 };
    return lightSprite;
  }

  function shadow() {
    return get("shadow", 64, 32, (g) => {
      const gr = g.createRadialGradient(32, 16, 0, 32, 16, 32);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(0.6, "rgba(0,0,0,0.3)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.save(); g.scale(1, 0.5); g.translate(0, 16);
      g.fillStyle = gr; g.beginPath(); g.arc(32, 16, 32, 0, TAU); g.fill();
      g.restore();
    });
  }

  function vignette(w, h) {
    return get(`vignette:${w}x${h}`, w, h, (g) => {
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(0,0,0,0.75)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }

  // ------------------------------------------------------------------
  // Zombies
  // ------------------------------------------------------------------
  const PAL = {
    walker: [
      { shirt: "#5d6e7e", pants: "#2f3b52", skin: "#8fa67a" },
      { shirt: "#7d5f45", pants: "#3a3328", skin: "#94a37c" },
      { shirt: "#6b3f57", pants: "#2b2f3a", skin: "#87a184" },
      { shirt: "#24324f", pants: "#1b2338", skin: "#8fa67a" },
      { shirt: "#e8701a", pants: "#3a3a40", skin: "#93a47c" },
      { shirt: "#2b2d33", pants: "#24262b", skin: "#9aa684" },
      { shirt: "#a9c3cf", pants: "#a9c3cf", skin: "#a3ad92" },
      { shirt: "#e8ecea", pants: "#5f7a8a", skin: "#99a88a" },
      { shirt: "#5f9a8a", pants: "#4f8678", skin: "#8fa67a" },
      { shirt: "#e4e6e0", pants: "#3a3d44", skin: "#8aa07c" },
      { shirt: "#4f5a38", pants: "#3e4630", skin: "#8a9c74" },
      { shirt: "#d9c21a", pants: "#c9b218", skin: "#7d9070" },
    ],
    rat: [{ shirt: "#5a5048", skin: "#8a6a6a" }],
    leaper: [{ shirt: "#3d3a44", pants: "#2a2730", skin: "#9fae8e", lean: 0.22, sleeveless: true }],
    burner: [{ shirt: "#2a1c14", pants: "#1c1612", skin: "#3a2a20", eye: "#ffb03a" }],
    screamer: [{ shirt: "#cfd8dc", pants: "#cfd8dc", skin: "#b9c4ad", eye: "#ff4af0" }],
    splitter: [{ shirt: "#5a3a62", pants: "#3a2a40", skin: "#8a6a9a", bloat: true, sleeveless: true, eye: "#ff6ad5" }],
    electro: [{ shirt: "#e4e6e0", pants: "#2a2f3a", skin: "#7f9474", eye: "#7fe7ff" }],
    runner: [{ shirt: "#8a2a2a", pants: "#1f2126", skin: "#a9b59c", hood: true, lean: 0.14 }],
    spitter: [{ shirt: "#5d7c3a", pants: "#4a3d2a", skin: "#7d9a48", bloat: true, sleeveless: true, eye: "#eaff00" }],
    bomber: [{ shirt: "#e8701a", pants: "#2e3440", skin: "#8fa27a", vest: true }],
    brute: [{ shirt: "#5a615b", pants: "#3a3a33", skin: "#7c8c6a", brute: true, sleeveless: true }],
    armored: [{ shirt: "#1f2a3d", pants: "#1a2130", skin: "#7f9474", armor: true, eye: "#ff5a3a" }],
    crawler: [{ shirt: "#4b4258", pants: "#2a2430", skin: "#8a7c9e" }],
    dog: [{ shirt: "#4f3f32", skin: "#6b5644" }],
    healer: [{ shirt: "#2b2a24", pants: "#22201b", skin: "#8fa67a", hood: true, robe: "#3a3326", staff: true, eye: "#8cff8a" }],
    thrower: [{ shirt: "#4a4f3a", pants: "#2f3326", skin: "#7c8c6a", brute: true, sleeveless: true, rock: true }],
    burrower: [{ shirt: "#5a4630", pants: "#3a3024", skin: "#8a9a72", miner: true, pick: true }],
    phantom: [{ shirt: "#26232c", pants: "#1c1a22", skin: "#c9cfd8", longHair: "#0e0c12", eye: "#e8f0ff", lean: 0.12 }],
    warden: [{ shirt: "#2f3a48", pants: "#232b36", skin: "#7f9474", gen: true, eye: "#8fd4ff" }],
    bloater: [{ shirt: "#6a7a3a", pants: "#4a4a2a", skin: "#9aa84a", bloat: true, sleeveless: true, eye: "#eaff00" }],
    gunner: [{ shirt: "#4f5a38", pants: "#3e4630", skin: "#8a9c74", rifle: true, helmet: true }],
    // v2.0: deutsche Gegner
    wiesn: [{ shirt: "#f2efe6", pants: "#5a3a1e", skin: "#94a37c", lederhosen: true, tracht: "#2f4a2a", krug: true, belly: true }],
    jeck: [{ shirt: "#d8202a", pants: "#f2efe6", skin: "#a3ad92", jester: true, nose: true, eye: "#ffd84a" }],
    schaffner: [{ shirt: "#1e2a4a", pants: "#1a2236", skin: "#8fa67a", conductor: true, kelle: true }],
    beamter: [{ shirt: "#6a6e72", pants: "#4a4e52", skin: "#9aa684", suit: true, glasses: true, folder: true }],
    zwerg: [{ shirt: "#2a5aa8", pants: "#5a3a1e", skin: "#c8b49a", gnome: true }],
    ultra: [{ shirt: "#1a1a1a", pants: "#2a2a30", skin: "#9caa8a", hood: true, scarf: ["#c8102e", "#f2efe6"], bengalo: true }],
    // v2.1: neue Gegner und Stadt-Bosse
    scooter: [{ shirt: "#2a6a5a", pants: "#1f2126", skin: "#9caa8a", lean: 0.2, scooter: true, headband: "#e8e8e0" }],
    paketbote: [{ shirt: "#24324f", pants: "#1b2338", skin: "#8fa67a", carry: true, cap: "#e8701a" }],
    rentner: [{ shirt: "#b8a888", pants: "#5a5448", skin: "#b9c4ad", umbrella: "#2a3a6a", grey: true }],
    // v2.4 Überlebende (keine Zombies: gesunde Haut, dunkle Augen)
    civilian: [
      { shirt: "#3a6ea5", pants: "#2a2c34", skin: "#e2b48e", eye: "#2a1a10", cap: "#c8402a" },
      { shirt: "#c8a23a", pants: "#3a3430", skin: "#c99572", eye: "#2a1a10", longHair: "#5a3a22", scarf: ["#a83a4a", "#e8e0d0"] },
      { shirt: "#e8e4dc", pants: "#4a5a6a", skin: "#f0c8a4", eye: "#2a1a10", glasses: true, grey: true },
    ],
    wengerter: [{ shirt: "#4a6a3a", pants: "#3a3a30", skin: "#94a37c", straw: true, butte: true, sprayer: true }],
    goetz: [{ shirt: "#8a1a1a", pants: "#4a4e56", skin: "#7f9474", big: true, knight: true, ironFist: true, sword: true, eye: "#ff5a3a" }],
    zugfuehrer: [{ shirt: "#1e2a4a", pants: "#1a2236", skin: "#7f9474", big: true, conductor: true, kelle: true, eye: "#ffcc33" }],
    krampus: [{ shirt: "#3a2a1e", pants: "#2a1e14", skin: "#5a4436", brute: true, sleeveless: true, horns: true, chains: true, eye: "#ffcc33" }],
    bierkoenig: [{ shirt: "#f2efe6", pants: "#5a3a1e", skin: "#94a37c", lederhosen: true, tracht: "#2f4a2a", krug: true, belly: true, crown: true, eye: "#ffcc33" }],
    narrenkoenig: [{ shirt: "#d8202a", pants: "#f2efe6", skin: "#a3ad92", jester: true, nose: true, zepter: true, cape: "#d8202a", eye: "#ffd84a" }],
    kapitaen: [{ shirt: "#1a2440", pants: "#141a2a", skin: "#7f9474", big: true, captain: true, beard2: true, anchorHand: true, eye: "#8cff8a" }],
    nest: [{ skin: "#6a3a5a" }],
    abom: [{ skin: "#8a4a6a" }],
    mother: [{ skin: "#3f5a3a" }],
  };
  // Sprite-Größe relativ zum Kollisionsradius
  const SPAN = { crawler: 4.4, dog: 4.8, rat: 5.2, abom: 3.6, mother: 4.0, nest: 3.0, healer: 4.6, gunner: 4.4, wiesn: 4.0, jeck: 4.2, schaffner: 4.2, beamter: 4.0, zwerg: 4.6, ultra: 4.2, scooter: 4.6, paketbote: 4.2, rentner: 4.4, wengerter: 4.4, goetz: 4.2, zugfuehrer: 4.0, krampus: 4.2, bierkoenig: 3.9, narrenkoenig: 4.4, kapitaen: 4.2 };
  const variants = (type) => (PAL[type] || PAL.walker).length;

  function humanoid(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU, sw = Math.sin(ph);
    const lean = P.lean ? r * P.lean : 0;
    if (P.scooter) {
      // E-Scooter unter den Füßen: Trittbrett, Räder, Lenkstange nach vorn
      g.fillStyle = "#1a1c20"; rr(g, c - r * 0.75, c - r * 0.22, r * 1.6, r * 0.44, r * 0.12); g.fill();
      g.fillStyle = "#3a3e46"; for (const x of [-0.8, 0.85]) { circ(g, c + x * r, c, r * 0.2); g.fill(); }
      limb(g, c + r * 0.85, c, c + r * 1.25, c, r * 0.08, "#9aa3ad");
      limb(g, c + r * 1.25, c - r * 0.45, c + r * 1.25, c + r * 0.45, r * 0.08, "#2a2e34");
      g.fillStyle = "#4ad0ff"; circ(g, c + r * 1.3, c, r * 0.07); g.fill();
    }
    if (P.butte) {
      // Butte (Traubenkiepe) auf dem Rücken, voller blauer Trauben
      g.fillStyle = vol(g, c - r * 0.75, c, r * 0.6, "#8a6a3a"); rr(g, c - r * 1.2, c - r * 0.5, r * 0.6, r * 1.0, r * 0.18); g.fill();
      g.strokeStyle = "#5a4020"; g.lineWidth = r * 0.04; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(c - r * 1.2, c - r * 0.3 + k * r * 0.3); g.lineTo(c - r * 0.6, c - r * 0.3 + k * r * 0.3); g.stroke(); }
      g.fillStyle = "#4a2a5a"; for (let k = 0; k < 5; k++) { circ(g, c - r * 1.05 + (k % 3) * r * 0.16, c - r * 0.3 + Math.floor(k / 3) * r * 0.25, r * 0.1); g.fill(); }
    }
    if (P.cape) {
      // Umhang weht hinter dem Narrenkönig
      g.fillStyle = vol(g, c - r * 0.6, c, r * 1.3, P.cape);
      g.beginPath(); g.moveTo(c + r * 0.1, c - r * 0.75); g.quadraticCurveTo(c - r * 1.4, c - r * 1.1 + Math.sin(ph) * r * 0.1, c - r * 1.55, c); g.quadraticCurveTo(c - r * 1.4, c + r * 1.1, c + r * 0.1, c + r * 0.75); g.closePath(); g.fill();
      g.strokeStyle = "#f2c21a"; g.lineWidth = r * 0.05; g.stroke();
    }
    const bulk = P.brute ? 1.14 : P.big ? 1.16 : P.bloat ? 1.1 : P.belly ? 1.08 : 1;
    // Beine (unter dem Körper, abwechselnd vor/zurück)
    for (const s of [-1, 1]) {
      const step = sw * s * r * 0.48;
      const lx = c - r * 0.12 + step, ly = c + s * r * 0.34 * bulk;
      g.fillStyle = mix(P.pants, -0.1); ell(g, lx, ly, r * 0.36, r * 0.2); g.fill();
      g.fillStyle = "#1a1a1a"; ell(g, lx + r * 0.27, ly, r * 0.16, r * 0.15); g.fill();
    }
    const tx = c + lean;
    if (P.robe) { g.fillStyle = vol(g, tx - r * 0.25, c, r * 1.1, P.robe); ell(g, tx - r * 0.25, c, r * 0.95, r * 0.95); g.fill(); }
    if (P.gen) {
      // Schildgenerator auf dem Rücken mit Antenne
      g.fillStyle = vol(g, tx - r * 0.75, c, r * 0.5, "#4a5568");
      rr(g, tx - r * 1.12, c - r * 0.45, r * 0.6, r * 0.9, r * 0.12); g.fill();
      const gr = g.createRadialGradient(tx - r * 0.82, c, 0, tx - r * 0.82, c, r * 0.32);
      gr.addColorStop(0, "#e8f8ff"); gr.addColorStop(0.5, "#7fd0ff"); gr.addColorStop(1, "rgba(60,140,220,0)");
      g.fillStyle = gr; circ(g, tx - r * 0.82, c, r * 0.32); g.fill();
      limb(g, tx - r * 1.0, c - r * 0.35, tx - r * 1.45, c - r * 0.7, r * 0.05, "#9aa3ad");
      g.fillStyle = "#ff4a3a"; circ(g, tx - r * 1.45, c - r * 0.7, r * 0.07); g.fill();
    }
    // Rücken: Gastank (Bomber) / Knochenstacheln (Koloss)
    if (P.vest) {
      g.fillStyle = vol(g, tx - r * 0.7, c, r * 0.45, "#7d8288");
      rr(g, tx - r * 1.0, c - r * 0.34, r * 0.55, r * 0.68, r * 0.2); g.fill();
      g.fillStyle = "#2c2f33"; rr(g, tx - r * 1.05, c - r * 0.1, r * 0.14, r * 0.2, r * 0.05); g.fill();
      g.fillStyle = "#ff2b1f"; circ(g, tx - r * 0.95, c - r * 0.22, r * 0.07); g.fill();
    }
    if (P.brute) {
      g.fillStyle = "#e3dcc8";
      for (let i = -2; i <= 2; i++) {
        const y = c + i * r * 0.32;
        g.beginPath(); g.moveTo(tx - r * 0.45, y - r * 0.1); g.lineTo(tx - r * 0.95, y + i * r * 0.05); g.lineTo(tx - r * 0.45, y + r * 0.1); g.closePath(); g.fill();
      }
    }
    // Torso
    g.fillStyle = vol(g, tx, c, r * 0.95 * bulk, P.armor ? "#26324a" : P.sleeveless && P.brute ? P.skin : P.bloat ? P.skin : P.shirt);
    ell(g, tx, c, r * 0.55 * bulk, r * 0.93 * bulk); g.fill();
    if (P.brute) {
      // zerrissenes Unterhemd + Muskeln
      g.fillStyle = vol(g, tx, c, r * 0.7, P.shirt);
      ell(g, tx - r * 0.05, c, r * 0.42, r * 0.62); g.fill();
      g.strokeStyle = mix(P.skin, -0.35); g.lineWidth = r * 0.04;
      for (const s of [-1, 1]) { g.beginPath(); g.arc(tx + r * 0.1, c + s * r * 0.62, r * 0.22, -1.2, 1.2); g.stroke(); }
    }
    // Risse in der Kleidung & Blut
    if (!P.armor) {
      for (let i = 0; i < 3; i++) {
        g.fillStyle = mix(P.skin, -0.28);
        blob(g, tx + (R() - 0.5) * r * 0.55, c + (R() - 0.5) * r * 1.2, r * (0.09 + R() * 0.1), R); g.fill();
      }
    }
    for (let i = 0; i < 2; i++) {
      g.fillStyle = "rgba(105,10,12,0.8)";
      blob(g, tx + (R() - 0.2) * r * 0.5, c + (R() - 0.5) * r * 1.1, r * (0.1 + R() * 0.12), R); g.fill();
    }
    if (P.bloat) {
      // leuchtende Eiterbeulen
      for (let i = 0; i < 6; i++) {
        const px = tx + (R() - 0.5) * r * 0.8, py = c + (R() - 0.5) * r * 1.4, pr = r * (0.1 + R() * 0.1);
        const gr = g.createRadialGradient(px, py, 0, px, py, pr);
        gr.addColorStop(0, "#f2ff9a"); gr.addColorStop(0.5, "#b7ff4a"); gr.addColorStop(1, "#4f7a1e");
        g.fillStyle = gr; circ(g, px, py, pr); g.fill();
      }
    }
    if (P.vest) {
      // Warnweste mit Reflexstreifen + Dynamit
      g.fillStyle = "rgba(240,240,200,0.85)";
      for (const dx of [-0.22, 0.18]) g.fillRect(tx + dx * r, c - r * 0.85, r * 0.1, r * 1.7);
      for (let i = -1; i <= 1; i++) {
        g.fillStyle = vol(g, tx + r * 0.32, c + i * r * 0.28, r * 0.2, "#c0281e");
        rr(g, tx + r * 0.22, c + i * r * 0.28 - r * 0.1, r * 0.26, r * 0.2, r * 0.05); g.fill();
      }
      g.strokeStyle = "#222"; g.lineWidth = r * 0.04;
      g.beginPath(); g.moveTo(tx + r * 0.35, c - r * 0.3); g.quadraticCurveTo(tx + r * 0.55, c, tx + r * 0.35, c + r * 0.3); g.stroke();
    }
    if (P.armor) {
      // Schutzplatten
      g.fillStyle = vol(g, tx + r * 0.05, c, r * 0.6, "#34445f");
      rr(g, tx - r * 0.25, c - r * 0.55, r * 0.55, r * 1.1, r * 0.18); g.fill();
      g.strokeStyle = "#5e7396"; g.lineWidth = r * 0.05; rr(g, tx - r * 0.25, c - r * 0.55, r * 0.55, r * 1.1, r * 0.18); g.stroke();
      for (const s of [-1, 1]) { g.fillStyle = vol(g, tx, c + s * r * 0.72, r * 0.3, "#2c3a52"); circ(g, tx, c + s * r * 0.72, r * 0.28); g.fill(); }
    }
    // v2.0: Tracht, Narrenkostüm, Uniform, Anzug, Zwergenkittel
    if (P.lederhosen || P.jester || P.suit || P.conductor) {
      g.save(); ell(g, tx, c, r * 0.55 * bulk, r * 0.93 * bulk); g.clip();
      if (P.lederhosen) {
        // kariertes Trachtenhemd
        g.fillStyle = "rgba(70,120,200,0.42)";
        for (let x = -1; x < 1; x += 0.24) for (let y = -1; y < 1; y += 0.24) if ((Math.round(x * 4.2) + Math.round(y * 4.2)) % 2 === 0) g.fillRect(tx + x * r, c + y * r, r * 0.12, r * 0.12);
      }
      if (P.jester) {
        // Kölsche Farben: rot-weiß geviertelt mit Rauten
        g.fillStyle = "#f2efe6"; g.fillRect(tx - r, c - r, r, r); g.fillRect(tx, c, r, r);
        g.fillStyle = "#f2c21a";
        for (let i = -2; i <= 2; i++) { const y = c + i * r * 0.36; g.beginPath(); g.moveTo(tx + r * 0.5, y - r * 0.1); g.lineTo(tx + r * 0.6, y); g.lineTo(tx + r * 0.5, y + r * 0.1); g.lineTo(tx + r * 0.4, y); g.closePath(); g.fill(); }
      }
      if (P.suit || P.conductor) {
        // Revers / Uniformjacke mit Knopfleiste
        g.fillStyle = mix(P.shirt, -0.25);
        for (const s2 of [-1, 1]) { g.beginPath(); g.moveTo(tx + r * 0.55, c); g.lineTo(tx + r * 0.1, c + s2 * r * 0.55); g.lineTo(tx + r * 0.55, c + s2 * r * 0.3); g.closePath(); g.fill(); }
        if (P.suit) { g.fillStyle = "#e8e8e0"; g.fillRect(tx + r * 0.3, c - r * 0.14, r * 0.3, r * 0.28); g.fillStyle = "#2a4a8a"; g.fillRect(tx + r * 0.34, c - r * 0.07, r * 0.26, r * 0.14); }
        if (P.conductor) { g.fillStyle = "#e8c64a"; for (const y of [-0.3, 0, 0.3]) { circ(g, tx + r * 0.42, c + y * r, r * 0.05); g.fill(); } g.fillStyle = "#c8102e"; g.fillRect(tx - r * 0.6, c - r * 0.04, r * 1.2, r * 0.08); }
      }
      g.restore();
    }
    if (P.lederhosen) {
      // Hosenträger mit Brustlatz
      g.fillStyle = "#4a2e16";
      for (const s2 of [-1, 1]) g.fillRect(tx - r * 0.5, c + s2 * r * 0.34 - r * 0.07, r * 1.0, r * 0.14);
      g.fillStyle = "#5a3a1e"; rr(g, tx + r * 0.22, c - r * 0.36, r * 0.2, r * 0.72, r * 0.05); g.fill();
      g.fillStyle = "#d8c8a0"; circ(g, tx + r * 0.32, c, r * 0.07); g.fill();
    }
    if (P.knight) {
      // Brustpanzer mit Nieten, roter Wappenrock darunter
      g.fillStyle = vol(g, tx + r * 0.1, c, r * 0.7, "#9aa3ad"); ell(g, tx + r * 0.05, c, r * 0.42, r * 0.7); g.fill();
      g.strokeStyle = "#5a6068"; g.lineWidth = r * 0.04; g.beginPath(); g.moveTo(tx + r * 0.45, c - r * 0.55); g.lineTo(tx + r * 0.45, c + r * 0.55); g.stroke();
      g.fillStyle = "#e8ecef"; for (const y of [-0.4, 0, 0.4]) { circ(g, tx + r * 0.32, c + y * r, r * 0.04); g.fill(); }
      for (const s2 of [-1, 1]) { g.fillStyle = vol(g, tx, c + s2 * r * 0.78, r * 0.3, "#8a929a"); circ(g, tx, c + s2 * r * 0.78, r * 0.26); g.fill(); }
    }
    if (P.chains) {
      // Krampus: rostige Ketten über Brust und Rücken
      g.strokeStyle = "#7a6a5a"; g.lineWidth = r * 0.06;
      for (let i = 0; i < 9; i++) { const u = i / 8, x = tx - r * 0.45 + u * r * 0.9, y = c - r * 0.8 + u * r * 1.6; g.beginPath(); g.ellipse(x, y, r * 0.09, r * 0.06, 0.8, 0, TAU); g.stroke(); }
    }
    // Arme nach vorn gestreckt
    for (const s of [-1, 1]) {
      const shx = tx + r * 0.05, shy = c + s * r * 0.74 * bulk;
      const reach = r * (1.22 + 0.07 * Math.sin(ph + s * 1.4)) * (P.brute ? 1.06 : 1);
      const hx = tx + reach, hy = c + s * r * (0.4 + 0.06 * Math.cos(ph + s));
      const mx = (shx + hx) / 2, my = (shy + hy) / 2 + s * r * 0.08;
      const sleeve = P.armor ? "#1b2433" : P.sleeveless ? P.skin : P.shirt;
      limb(g, shx, shy, mx, my, r * 0.32 * bulk, mix(sleeve, -0.08));
      limb(g, mx, my, hx, hy, r * 0.25 * bulk, P.armor ? "#2a3446" : mix(P.skin, -0.05));
      const hr = r * 0.15 * bulk * (P.brute ? 1.35 : 1);
      g.fillStyle = vol(g, hx + r * 0.05, hy, hr, P.armor ? "#1d2330" : P.skin); circ(g, hx + r * 0.05, hy, hr); g.fill();
      g.strokeStyle = mix(P.skin, -0.35); g.lineWidth = r * 0.055;
      for (let k = -1; k <= 1; k++) limb(g, hx + hr * 0.6, hy + k * hr * 0.45, hx + hr * 1.5, hy + k * hr * 0.6, r * 0.06, mix(P.skin, -0.3));
    }
    // Ausrüstung in den Händen (rechte Hand: s = +1)
    const handX = tx + r * 1.3, handR = c + r * 0.42, handL = c - r * 0.42;
    if (P.staff) {
      limb(g, handR > 0 ? handX - r * 0.5 : handX, handR, handX + r * 0.9, handR + r * 0.05, r * 0.07, "#5a4630");
      const gr = g.createRadialGradient(handX + r * 0.95, handR, 0, handX + r * 0.95, handR, r * 0.38);
      gr.addColorStop(0, "#f0ffe8"); gr.addColorStop(0.45, "#8cff8a"); gr.addColorStop(1, "rgba(60,200,80,0)");
      g.fillStyle = gr; circ(g, handX + r * 0.95, handR, r * 0.38); g.fill();
    }
    if (P.rifle) {
      g.fillStyle = "#1c1e1a"; rr(g, handX - r * 0.7, c + r * 0.05, r * 1.6, r * 0.2, r * 0.04); g.fill();
      g.fillStyle = "#2c2f28"; rr(g, handX - r * 0.2, c + r * 0.05, r * 0.3, r * 0.34, r * 0.05); g.fill();
      g.fillStyle = "#ff3020"; circ(g, handX + r * 0.85, c + r * 0.15, r * 0.06); g.fill();
    }
    if (P.rock) {
      g.fillStyle = vol(g, handX + r * 0.1, handR + r * 0.1, r * 0.5, "#7a756c");
      g.beginPath(); g.moveTo(handX - r * 0.3, handR - r * 0.2); g.lineTo(handX + r * 0.1, handR - r * 0.45); g.lineTo(handX + r * 0.55, handR - r * 0.15); g.lineTo(handX + r * 0.5, handR + r * 0.4); g.lineTo(handX, handR + r * 0.55); g.lineTo(handX - r * 0.35, handR + r * 0.25); g.closePath(); g.fill();
      g.strokeStyle = "#4a463f"; g.lineWidth = r * 0.04; g.beginPath(); g.moveTo(handX - r * 0.1, handR); g.lineTo(handX + r * 0.3, handR + r * 0.2); g.stroke();
    }
    if (P.pick) {
      limb(g, handX - r * 0.4, handL, handX + r * 0.6, handL - r * 0.05, r * 0.07, "#6a4a2a");
      g.strokeStyle = "#9aa3ad"; g.lineWidth = r * 0.1; g.lineCap = "round";
      g.beginPath(); g.moveTo(handX + r * 0.55, handL - r * 0.5); g.quadraticCurveTo(handX + r * 0.75, handL, handX + r * 0.55, handL + r * 0.45); g.stroke();
    }
    if (P.krug) {
      // Maßkrug in der rechten Hand
      g.strokeStyle = "#cfdde2"; g.lineWidth = r * 0.08; g.beginPath(); g.arc(handX + r * 0.05, handR + r * 0.42, r * 0.17, Math.PI, TAU); g.stroke();
      g.fillStyle = "rgba(215,230,236,0.9)"; rr(g, handX - r * 0.25, handR - r * 0.05, r * 0.6, r * 0.5, r * 0.08); g.fill();
      g.fillStyle = "#e0a42a"; rr(g, handX - r * 0.2, handR + r * 0.04, r * 0.5, r * 0.36, r * 0.05); g.fill();
      g.fillStyle = "#fff8e8"; ell(g, handX + r * 0.05, handR + r * 0.02, r * 0.3, r * 0.16); g.fill();
    }
    if (P.kelle) {
      // Signalkelle: grüne Scheibe mit weißem Rand
      limb(g, handX - r * 0.2, handR, handX + r * 0.5, handR + r * 0.05, r * 0.06, "#2a2a2a");
      g.fillStyle = "#f2f2ea"; circ(g, handX + r * 0.7, handR + r * 0.05, r * 0.26); g.fill();
      g.fillStyle = "#1f9a4a"; circ(g, handX + r * 0.7, handR + r * 0.05, r * 0.18); g.fill();
    }
    if (P.folder) {
      // Aktenordner unter dem Arm
      g.fillStyle = vol(g, handX - r * 0.1, handL, r * 0.5, "#c9b27a"); rr(g, handX - r * 0.5, handL - r * 0.3, r * 0.7, r * 0.5, r * 0.04); g.fill();
      g.fillStyle = "#e8e2d0"; g.fillRect(handX - r * 0.45, handL - r * 0.22, r * 0.6, r * 0.08);
      g.fillStyle = "#d02a2a"; g.fillRect(handX - r * 0.1, handL - r * 0.02, r * 0.18, r * 0.12);
    }
    if (P.bengalo) {
      // Bengalo in der linken Hand: Stab mit gleißender Flamme
      limb(g, handX - r * 0.2, handL, handX + r * 0.45, handL - r * 0.05, r * 0.09, "#b0201a");
      const fx = handX + r * 0.55, gr = g.createRadialGradient(fx, handL, 0, fx, handL, r * 0.55);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, "#ffd0b0"); gr.addColorStop(0.6, "rgba(255,60,40,0.7)"); gr.addColorStop(1, "rgba(255,40,30,0)");
      g.fillStyle = gr; circ(g, fx, handL, r * 0.55); g.fill();
    }
    if (P.sprayer) {
      // Spritzlanze der Rückenspritze
      limb(g, handX - r * 0.3, handR, handX + r * 0.85, handR - r * 0.02, r * 0.06, "#7a8088");
      g.fillStyle = "#c8ccd0"; circ(g, handX + r * 0.9, handR, r * 0.08); g.fill();
      limb(g, tx - r * 0.7, c + r * 0.2, handX - r * 0.3, handR, r * 0.04, "#2a2a2a");
    }
    if (P.ironFist) {
      // die eiserne Hand: übergroßer Stahlhandschuh mit Nieten
      g.fillStyle = vol(g, handX + r * 0.1, handR, r * 0.38, "#b8c0c8"); rr(g, handX - r * 0.2, handR - r * 0.28, r * 0.6, r * 0.56, r * 0.12); g.fill();
      g.strokeStyle = "#5a6068"; g.lineWidth = r * 0.04; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(handX + r * 0.15 + k * r * 0.1, handR - r * 0.25); g.lineTo(handX + r * 0.15 + k * r * 0.1, handR + r * 0.25); g.stroke(); }
      g.fillStyle = "#f0f4f6"; circ(g, handX, handR - r * 0.15, r * 0.04); g.fill(); circ(g, handX, handR + r * 0.15, r * 0.04); g.fill();
    }
    if (P.sword) {
      limb(g, handX - r * 0.2, handL, handX + r * 1.4, handL - r * 0.15, r * 0.09, "#d8dde2");
      limb(g, handX - r * 0.1, handL - r * 0.25, handX - r * 0.1, handL + r * 0.25, r * 0.07, "#8a6a2a");
    }
    if (P.carry) {
      // Paket in beiden Händen
      g.fillStyle = vol(g, tx + r * 1.15, c, r * 0.6, "#a07a4a"); rr(g, tx + r * 0.85, c - r * 0.42, r * 0.62, r * 0.84, r * 0.05); g.fill();
      g.fillStyle = "#d8c49a"; g.fillRect(tx + r * 0.85, c - r * 0.06, r * 0.62, r * 0.12);
    }
    if (P.umbrella) {
      // aufgespannter Schirm vor dem Körper (Frontalschild)
      const ux = tx + r * 1.15;
      g.fillStyle = vol(g, ux, c, r * 1.2, P.umbrella);
      g.beginPath(); g.ellipse(ux, c, r * 0.42, r * 1.25, 0, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill();
      g.strokeStyle = mix(P.umbrella, 0.3); g.lineWidth = r * 0.04;
      for (const k of [-0.6, 0, 0.6]) { g.beginPath(); g.moveTo(ux, c); g.lineTo(ux + r * 0.36 * Math.cos(k), c + r * 1.15 * Math.sin(k)); g.stroke(); }
      g.fillStyle = "#e8e0c8"; circ(g, ux + r * 0.05, c, r * 0.06); g.fill();
    }
    if (P.zepter) {
      limb(g, handX - r * 0.4, handR, handX + r * 0.8, handR + r * 0.05, r * 0.08, "#c9a227");
      const gr = g.createRadialGradient(handX + r * 0.9, handR, 0, handX + r * 0.9, handR, r * 0.32);
      gr.addColorStop(0, "#fff6c0"); gr.addColorStop(0.5, "#f2c21a"); gr.addColorStop(1, "rgba(200,150,20,0)");
      g.fillStyle = gr; circ(g, handX + r * 0.9, handR, r * 0.32); g.fill();
      g.fillStyle = "#d8202a"; circ(g, handX + r * 0.9, handR, r * 0.1); g.fill();
    }
    if (P.anchorHand) {
      // Anker in der rechten Hand
      g.strokeStyle = "#9aa3ad"; g.lineWidth = r * 0.12; g.lineCap = "round";
      g.beginPath(); g.moveTo(handX - r * 0.2, handR); g.lineTo(handX + r * 0.9, handR); g.moveTo(handX + r * 0.1, handR - r * 0.3); g.lineTo(handX + r * 0.1, handR + r * 0.3); g.stroke();
      g.beginPath(); g.arc(handX + r * 0.55, handR, r * 0.45, -1.2, 1.2); g.stroke();
    }
    // Kopf
    const hx = tx + r * 0.2 + lean * 0.3;
    const hr = r * (P.brute ? 0.4 : 0.44);
    if (P.longHair) { g.fillStyle = P.longHair; ell(g, hx - hr * 0.9, c, hr * 1.25, hr * 0.95); g.fill(); for (const s2 of [-1, 1]) { limb(g, hx - hr * 0.2, c + s2 * hr * 0.7, hx - hr * 1.8, c + s2 * hr * 1.0, r * 0.12, P.longHair); } }
    if (P.hood) { g.fillStyle = vol(g, hx - r * 0.06, c, hr * 1.3, P.shirt); circ(g, hx - r * 0.06, c, hr * 1.24); g.fill(); }
    g.fillStyle = vol(g, hx, c, hr, P.skin); circ(g, hx, c, hr); g.fill();
    if (P.armor) {
      g.fillStyle = vol(g, hx - r * 0.03, c, hr * 1.15, "#2b3548"); circ(g, hx - r * 0.03, c, hr * 1.12); g.fill();
      g.fillStyle = "rgba(80,170,230,0.9)"; g.beginPath(); g.arc(hx, c, hr * 1.02, -0.85, 0.85); g.arc(hx, c, hr * 0.6, 0.85, -0.85, true); g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.arc(hx, c, hr * 0.95, -0.7, -0.35); g.arc(hx, c, hr * 0.7, -0.35, -0.7, true); g.closePath(); g.fill();
    } else {
      // Haarbüschel / Wunde mit Knochen
      g.strokeStyle = mix(P.skin, -0.55); g.lineWidth = r * 0.05;
      for (let i = 0; i < 4; i++) { const a = Math.PI * (0.6 + R() * 0.8); limb(g, hx + Math.cos(a) * hr * 0.4, c + Math.sin(a) * hr * 0.4, hx + Math.cos(a) * hr * 0.95, c + Math.sin(a) * hr * 0.95, r * 0.05, mix(P.skin, -0.55)); }
      g.fillStyle = "#7a1416"; blob(g, hx - hr * 0.25, c - hr * 0.3, hr * 0.28, R); g.fill();
      g.fillStyle = "#e6dcc5"; circ(g, hx - hr * 0.25, c - hr * 0.3, hr * 0.1); g.fill();
      // Augen
      for (const s of [-1, 1]) {
        g.fillStyle = "#160404"; circ(g, hx + hr * 0.6, c + s * hr * 0.38, hr * 0.22); g.fill();
        g.fillStyle = P.eye || "#ff3030"; circ(g, hx + hr * 0.64, c + s * hr * 0.38, hr * 0.13); g.fill();
      }
      g.strokeStyle = "#2a0d0d"; g.lineWidth = r * 0.07;
      g.beginPath(); g.arc(hx, c, hr * 0.86, -0.42, 0.42); g.stroke();
    }
    if (P.miner || P.helmet) {
      g.fillStyle = vol(g, hx - r * 0.04, c, hr * 1.12, P.miner ? "#c9a21a" : "#4a5530"); circ(g, hx - r * 0.04, c, hr * 1.08); g.fill();
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(hx - hr * 1.0, c - hr * 0.08, hr * 2, hr * 0.16);
      if (P.miner) {
        const lx = hx + hr * 0.85, gr = g.createRadialGradient(lx, c, 0, lx, c, hr * 0.7);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.35, "#fff2a8"); gr.addColorStop(1, "rgba(255,230,120,0)");
        g.fillStyle = gr; circ(g, lx, c, hr * 0.7); g.fill();
      }
    }
    // v2.0: Kopfbedeckungen – die leuchtenden Augen bleiben sichtbar
    const eyes = () => { for (const s of [-1, 1]) { g.fillStyle = "#160404"; circ(g, hx + hr * 0.78, c + s * hr * 0.36, hr * 0.17); g.fill(); g.fillStyle = P.eye || "#ff3030"; circ(g, hx + hr * 0.8, c + s * hr * 0.36, hr * 0.1); g.fill(); } };
    if (P.scarf) {
      // Fanschal: gestreift um den Hals, Enden flattern nach hinten
      const [a, b] = P.scarf;
      for (let i = 0; i < 6; i++) { g.strokeStyle = i % 2 ? b : a; g.lineWidth = r * 0.16; g.beginPath(); g.arc(hx - hr * 0.35, c, hr * 1.05, -1.9 + i * 0.63, -1.27 + i * 0.63); g.stroke(); }
      for (const s2 of [-1, 1]) for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? b : a; const wv = Math.sin(ph + k) * r * 0.06; g.fillRect(hx - hr * 1.3 - k * r * 0.2, c + s2 * r * 0.18 + wv - r * 0.08, r * 0.2, r * 0.16); }
    }
    if (P.tracht) {
      // Trachtenhut mit Gamsbart
      g.fillStyle = vol(g, hx - hr * 0.15, c, hr * 1.3, P.tracht); circ(g, hx - hr * 0.15, c, hr * 1.22); g.fill();
      g.strokeStyle = "#1a1a14"; g.lineWidth = r * 0.06; circ(g, hx - hr * 0.2, c, hr * 0.78); g.stroke();
      g.fillStyle = vol(g, hx - hr * 0.2, c, hr * 0.8, P.tracht, 0.4, -0.2); circ(g, hx - hr * 0.2, c, hr * 0.72); g.fill();
      g.strokeStyle = "#d8c8a0"; g.lineWidth = r * 0.04;
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i - 4) * 0.16; limb(g, hx - hr * 0.7, c + hr * 0.3, hx - hr * 0.7 + Math.cos(a) * hr * 0.7, c + hr * 0.3 + Math.sin(a) * hr * 0.7, r * 0.035, i % 2 ? "#d8c8a0" : "#3a2a1a"); }
      eyes();
    }
    if (P.jester) {
      // Narrenkappe: drei Zipfel mit Glöckchen, Halskrause
      g.strokeStyle = "#f2efe6"; g.lineWidth = r * 0.1;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; g.beginPath(); g.arc(hx - hr * 0.5 + Math.cos(a) * hr * 1.0, c + Math.sin(a) * hr * 1.0, r * 0.1, 0, TAU); g.stroke(); }
      for (const [a, col] of [[Math.PI * 0.68, "#d8202a"], [Math.PI, "#f2efe6"], [Math.PI * 1.32, "#d8202a"]]) {
        const ex = hx + Math.cos(a) * hr * 1.9, ey = c + Math.sin(a) * hr * 1.9 + Math.sin(ph + a) * r * 0.06;
        g.fillStyle = vol(g, hx, c, hr * 1.5, col); g.beginPath(); g.moveTo(hx + Math.cos(a - 0.7) * hr * 0.8, c + Math.sin(a - 0.7) * hr * 0.8); g.quadraticCurveTo(ex, ey, ex, ey); g.lineTo(hx + Math.cos(a + 0.7) * hr * 0.8, c + Math.sin(a + 0.7) * hr * 0.8); g.closePath(); g.fill();
        g.fillStyle = vol(g, ex, ey, r * 0.16, "#f2c21a"); circ(g, ex, ey, r * 0.13); g.fill();
      }
      g.fillStyle = vol(g, hx - hr * 0.1, c, hr * 0.95, "#d8202a"); circ(g, hx - hr * 0.1, c, hr * 0.86); g.fill();
      eyes();
    }
    if (P.nose) { g.fillStyle = vol(g, hx + hr * 1.0, c, hr * 0.3, "#ff2020"); circ(g, hx + hr * 1.0, c, hr * 0.26); g.fill(); }
    if (P.straw) {
      // breiter Strohhut des Wengerters mit Hutband
      g.fillStyle = vol(g, hx - hr * 0.05, c, hr * 1.6, "#d8b860"); circ(g, hx - hr * 0.05, c, hr * 1.5); g.fill();
      g.strokeStyle = "rgba(120,90,30,0.4)"; g.lineWidth = r * 0.025; for (let k = 1; k < 4; k++) { circ(g, hx - hr * 0.05, c, hr * (0.5 + k * 0.32)); g.stroke(); }
      g.fillStyle = vol(g, hx - hr * 0.1, c, hr * 0.85, "#e4c878"); circ(g, hx - hr * 0.1, c, hr * 0.72); g.fill();
      g.strokeStyle = "#5a2a1a"; g.lineWidth = r * 0.06; circ(g, hx - hr * 0.1, c, hr * 0.75); g.stroke();
      eyes();
    }
    if (P.knight) {
      // Ritterhelm mit Sehschlitz und rotem Federbusch
      g.fillStyle = vol(g, hx, c, hr * 1.2, "#a8b0b8"); circ(g, hx, c, hr * 1.1); g.fill();
      g.fillStyle = "#1a1c20"; g.fillRect(hx + hr * 0.5, c - hr * 0.55, hr * 0.18, hr * 1.1);
      g.fillStyle = "#ff3a2a"; g.fillRect(hx + hr * 0.53, c - hr * 0.35, hr * 0.12, hr * 0.12); g.fillRect(hx + hr * 0.53, c + hr * 0.23, hr * 0.12, hr * 0.12);
      g.fillStyle = vol(g, hx - hr * 0.8, c, hr * 0.8, "#c81e1e");
      g.beginPath(); g.moveTo(hx - hr * 0.2, c - hr * 0.25); g.quadraticCurveTo(hx - hr * 1.6, c - hr * 0.5 + Math.sin(ph) * hr * 0.1, hx - hr * 2.0, c); g.quadraticCurveTo(hx - hr * 1.6, c + hr * 0.5, hx - hr * 0.2, c + hr * 0.25); g.closePath(); g.fill();
    }
    if (P.horns) {
      // Krampus-Hörner: geschwungen nach hinten, dazu Zottelfell
      for (const s2 of [-1, 1]) {
        g.fillStyle = vol(g, hx - hr * 0.6, c + s2 * hr * 0.9, hr * 0.9, "#d8ccb4");
        g.beginPath(); g.moveTo(hx + hr * 0.1, c + s2 * hr * 0.45); g.quadraticCurveTo(hx - hr * 0.9, c + s2 * hr * 1.5, hx - hr * 1.9, c + s2 * hr * 1.05); g.quadraticCurveTo(hx - hr * 0.9, c + s2 * hr * 1.1, hx - hr * 0.25, c + s2 * hr * 0.2); g.closePath(); g.fill();
      }
      g.fillStyle = "#c81e1e"; ell(g, hx + hr * 1.05, c, hr * 0.45, hr * 0.14); g.fill(); // heraushängende Zunge
    }
    if (P.crown) {
      // goldene Krone auf dem Trachtenhut
      g.fillStyle = vol(g, hx - hr * 0.2, c, hr * 0.8, "#f2c21a");
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, rr2 = i % 2 ? hr * 0.42 : hr * 0.75; g.lineTo(hx - hr * 0.2 + Math.cos(a) * rr2, c + Math.sin(a) * rr2); } g.closePath(); g.fill();
      g.fillStyle = "#d8202a"; circ(g, hx - hr * 0.2, c, hr * 0.18); g.fill();
    }
    if (P.captain) {
      // Kapitänsmütze: weiß mit schwarzem Schirm und goldenem Anker
      g.fillStyle = "#11141c"; ell(g, hx + hr * 0.75, c, hr * 0.48, hr * 0.8); g.fill();
      g.fillStyle = vol(g, hx - hr * 0.1, c, hr * 1.15, "#e8ecef"); circ(g, hx - hr * 0.1, c, hr * 1.05); g.fill();
      g.strokeStyle = "#1a1a1a"; g.lineWidth = r * 0.08; circ(g, hx - hr * 0.1, c, hr * 0.94); g.stroke();
      g.fillStyle = "#e8c64a"; circ(g, hx + hr * 0.6, c, hr * 0.16); g.fill();
      eyes();
    }
    if (P.beard2) { g.fillStyle = vol(g, hx + hr * 0.75, c, hr * 0.8, "#5a5a52"); ell(g, hx + hr * 0.8, c, hr * 0.6, hr * 0.75); g.fill(); }
    if (P.grey) { g.strokeStyle = "#d8d8d0"; g.lineWidth = r * 0.07; g.beginPath(); g.arc(hx - hr * 0.1, c, hr * 0.85, Math.PI * 0.55, Math.PI * 1.45); g.stroke(); }
    if (P.cap) {
      g.fillStyle = vol(g, hx - hr * 0.05, c, hr * 1.1, P.cap); circ(g, hx - hr * 0.05, c, hr * 1.0); g.fill();
      g.fillStyle = mix(P.cap, -0.3); ell(g, hx + hr * 0.85, c, hr * 0.45, hr * 0.65); g.fill();
      eyes();
    }
    if (P.conductor) {
      // Schaffnermütze: dunkelblau, rotes Band, Schirm nach vorn, goldenes Abzeichen
      g.fillStyle = "#11182c"; ell(g, hx + hr * 0.75, c, hr * 0.5, hr * 0.78); g.fill();
      g.fillStyle = vol(g, hx - hr * 0.1, c, hr * 1.15, P.shirt); circ(g, hx - hr * 0.1, c, hr * 1.05); g.fill();
      g.strokeStyle = "#c8102e"; g.lineWidth = r * 0.1; circ(g, hx - hr * 0.1, c, hr * 0.92); g.stroke();
      g.fillStyle = "#e8c64a"; circ(g, hx + hr * 0.62, c, hr * 0.14); g.fill();
      g.fillStyle = "#c9ced4"; rr(g, hx + hr * 0.9, c - hr * 0.62, hr * 0.32, hr * 0.18, hr * 0.06); g.fill(); // Trillerpfeife
      eyes();
    }
    if (P.glasses) {
      // Hornbrille und Seitenscheitel
      g.strokeStyle = "#1a1410"; g.lineWidth = r * 0.06;
      for (const s2 of [-1, 1]) { circ(g, hx + hr * 0.66, c + s2 * hr * 0.38, hr * 0.24); g.stroke(); }
      g.beginPath(); g.moveTo(hx + hr * 0.66, c - hr * 0.14); g.lineTo(hx + hr * 0.66, c + hr * 0.14); g.stroke();
      g.strokeStyle = "#8a8a84"; g.lineWidth = r * 0.04;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(hx - hr * 0.5, c - hr * 0.7 + i * hr * 0.12); g.quadraticCurveTo(hx, c - hr * 0.2 + i * hr * 0.1, hx + hr * 0.4, c + hr * 0.5 + i * hr * 0.05); g.stroke(); }
    }
    if (P.gnome) {
      // Gartenzwerg: weißer Rauschebart nach vorn, rote Zipfelmütze nach hinten gekippt
      g.fillStyle = vol(g, hx + hr * 0.7, c, hr * 0.9, "#f2efe6"); ell(g, hx + hr * 0.75, c, hr * 0.75, hr * 0.7); g.fill();
      g.fillStyle = "#d8d4c8"; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(hx + hr * 1.1, c + i * hr * 0.25); g.lineTo(hx + hr * 1.55, c + i * hr * 0.22); g.lineTo(hx + hr * 1.1, c + i * hr * 0.25 + hr * 0.12); g.fill(); }
      g.fillStyle = vol(g, hx - hr * 0.3, c, hr * 1.4, "#c0281e");
      g.beginPath(); g.arc(hx - hr * 0.1, c, hr * 1.02, -Math.PI / 2 - 0.2, Math.PI / 2 + 0.2, false); g.lineTo(hx - hr * 2.1, c + hr * 0.2); g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.25)"; ell(g, hx - hr * 0.2, c - hr * 0.3, hr * 0.5, hr * 0.22); g.fill();
      eyes();
    }
    if (P.bloat) {
      // pulsierender Giftsack am Hals
      const k = 1 + 0.12 * Math.sin(ph * 2);
      const sx = hx + hr * 0.95, gr = g.createRadialGradient(sx, c, 0, sx, c, hr * 0.5 * k);
      gr.addColorStop(0, "#f4ffb0"); gr.addColorStop(0.6, "#9eea3a"); gr.addColorStop(1, "#3f6a14");
      g.fillStyle = gr; circ(g, sx, c, hr * 0.5 * k); g.fill();
    }
  }

  function crawler(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU, sw = Math.sin(ph);
    // Gedärme schleifen hinterher
    g.strokeStyle = "#7a2030"; g.lineWidth = r * 0.28; g.lineCap = "round";
    g.beginPath(); g.moveTo(c - r * 0.5, c);
    g.bezierCurveTo(c - r * 1.0, c + sw * r * 0.35, c - r * 1.3, c - sw * r * 0.3, c - r * 1.7, c + sw * r * 0.2); g.stroke();
    g.strokeStyle = "#a33a48"; g.lineWidth = r * 0.12; g.stroke();
    g.fillStyle = vol(g, c - r * 0.1, c, r * 0.8, P.shirt); ell(g, c - r * 0.1, c, r * 0.78, r * 0.62); g.fill();
    g.fillStyle = "rgba(105,10,12,0.8)"; blob(g, c - r * 0.3, c + r * 0.15, r * 0.25, R); g.fill();
    for (const s of [-1, 1]) {
      const ext = 0.5 + 0.5 * Math.sin(ph + (s > 0 ? 0 : Math.PI));
      const ex = c + r * 0.25, ey = c + s * r * 1.05;
      const hx = c + r * (0.55 + 0.95 * ext), hy = c + s * r * (0.95 - 0.35 * ext);
      limb(g, c, c + s * r * 0.5, ex, ey, r * 0.3, mix(P.skin, -0.1));
      limb(g, ex, ey, hx, hy, r * 0.24, P.skin);
      g.fillStyle = mix(P.skin, -0.2); circ(g, hx, hy, r * 0.17); g.fill();
    }
    const hx = c + r * 0.6;
    g.fillStyle = vol(g, hx, c, r * 0.44, P.skin); circ(g, hx, c, r * 0.42); g.fill();
    for (const s of [-1, 1]) { g.fillStyle = "#ff3030"; circ(g, hx + r * 0.25, c + s * r * 0.16, r * 0.08); g.fill(); }
  }

  function dog(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU;
    // Beine im Galopp
    for (const [bx, off] of [[c + r * 0.55, 0], [c - r * 0.6, Math.PI]]) {
      for (const s of [-1, 1]) {
        const a = ph + off + (s > 0 ? 0.6 : 0);
        const fx = bx + Math.sin(a) * r * 0.5, fy = c + s * r * 0.72;
        limb(g, bx, c + s * r * 0.28, fx, fy, r * 0.2, mix(P.shirt, -0.2));
        g.fillStyle = "#1c1612"; circ(g, fx, fy, r * 0.12); g.fill();
      }
    }
    // Schwanz
    limb(g, c - r * 0.95, c, c - r * 1.55, c + Math.sin(ph * 2) * r * 0.35, r * 0.13, mix(P.shirt, -0.15));
    // Körper mit freiliegenden Rippen
    g.fillStyle = vol(g, c, c, r * 1.05, P.shirt); ell(g, c, c, r * 1.02, r * 0.46); g.fill();
    g.fillStyle = "#6e1a1c"; ell(g, c + r * 0.05, c + r * 0.12, r * 0.42, r * 0.22); g.fill();
    g.strokeStyle = "#e3d8c0"; g.lineWidth = r * 0.07;
    for (let i = 0; i < 4; i++) { const x = c - r * 0.25 + i * r * 0.17; g.beginPath(); g.moveTo(x, c - r * 0.05); g.quadraticCurveTo(x + r * 0.05, c + r * 0.2, x, c + r * 0.32); g.stroke(); }
    // Kopf
    const hx = c + r * 1.05;
    g.fillStyle = mix(P.shirt, -0.2);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(hx - r * 0.25, c + s * r * 0.15); g.lineTo(hx - r * 0.55, c + s * r * 0.42); g.lineTo(hx - r * 0.05, c + s * r * 0.3); g.closePath(); g.fill(); }
    g.fillStyle = vol(g, hx, c, r * 0.42, P.shirt); ell(g, hx, c, r * 0.42, r * 0.34); g.fill();
    g.fillStyle = vol(g, hx + r * 0.35, c, r * 0.25, P.skin); ell(g, hx + r * 0.38, c, r * 0.26, r * 0.19); g.fill();
    g.fillStyle = "#111"; circ(g, hx + r * 0.62, c, r * 0.08); g.fill();
    g.fillStyle = "#e8e0c8"; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(hx + r * 0.45, c + s * r * 0.15); g.lineTo(hx + r * 0.58, c + s * r * 0.22); g.lineTo(hx + r * 0.42, c + s * r * 0.24); g.fill(); }
    for (const s of [-1, 1]) { g.fillStyle = "#ff3a2a"; circ(g, hx + r * 0.12, c + s * r * 0.17, r * 0.08); g.fill(); }
  }

  function abom(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU, pulse = 1 + 0.04 * Math.sin(ph * 2);
    // Tentakel-Arme mit Klauen
    const arms = [-1.15, -0.5, 0.5, 1.15];
    arms.forEach((a0, i) => {
      const bx = c + Math.cos(a0) * r * 0.6, by = c + Math.sin(a0) * r * 0.6;
      const tx = c + Math.cos(a0 * 0.75) * r * 1.5 + Math.sin(ph + i) * r * 0.08;
      const ty = c + Math.sin(a0 * 0.75) * r * 1.5 + Math.cos(ph * 1.3 + i) * r * 0.14;
      const mx = (bx + tx) / 2 + Math.sin(ph + i * 2) * r * 0.2, my = (by + ty) / 2;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, it = 1 - t;
        const x = it * it * bx + 2 * it * t * mx + t * t * tx, y = it * it * by + 2 * it * t * my + t * t * ty;
        const w = r * (0.22 - 0.13 * t);
        g.fillStyle = vol(g, x, y, w, k % 3 === 0 ? "#6e3550" : P.skin); circ(g, x, y, w); g.fill();
      }
      g.fillStyle = "#efe6d0";
      for (let k = -1; k <= 1; k++) {
        const a = Math.atan2(ty - my, tx - mx) + k * 0.45;
        g.beginPath(); g.moveTo(tx + Math.cos(a + 1.4) * r * 0.05, ty + Math.sin(a + 1.4) * r * 0.05);
        g.lineTo(tx + Math.cos(a) * r * 0.3, ty + Math.sin(a) * r * 0.3);
        g.lineTo(tx + Math.cos(a - 1.4) * r * 0.05, ty + Math.sin(a - 1.4) * r * 0.05); g.closePath(); g.fill();
      }
    });
    // Knochenstacheln am Rücken
    g.fillStyle = "#ddd2b8";
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI + i * 0.32, bx = c + Math.cos(a) * r * 0.75, by = c + Math.sin(a) * r * 0.75;
      g.beginPath(); g.moveTo(bx + Math.cos(a + 1.57) * r * 0.08, by + Math.sin(a + 1.57) * r * 0.08);
      g.lineTo(c + Math.cos(a) * r * 1.15, c + Math.sin(a) * r * 1.15);
      g.lineTo(bx + Math.cos(a - 1.57) * r * 0.08, by + Math.sin(a - 1.57) * r * 0.08); g.closePath(); g.fill();
    }
    // Fleischlappen
    const lobes = [[0, 0, 0.82], [-0.35, -0.42, 0.5], [-0.35, 0.42, 0.5], [0.15, -0.52, 0.42], [0.15, 0.52, 0.42], [-0.55, 0, 0.45]];
    for (const [lx, ly, lr] of lobes) {
      const x = c + lx * r, y = c + ly * r, rad = lr * r * pulse;
      g.fillStyle = vol(g, x, y, rad, P.skin, 0.25, -0.45); circ(g, x, y, rad); g.fill();
    }
    // Adern
    g.strokeStyle = "rgba(60,10,40,0.75)"; g.lineWidth = r * 0.035;
    for (let i = 0; i < 9; i++) {
      let x = c + (R() - 0.6) * r * 1.1, y = c + (R() - 0.5) * r * 1.2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (R() - 0.5) * r * 0.35; y += (R() - 0.5) * r * 0.35; g.lineTo(x, y); }
      g.stroke();
    }
    // Riesenmaul
    const mx = c + r * 0.55;
    g.fillStyle = "#2a0812"; ell(g, mx, c, r * 0.3 * pulse, r * 0.44 * pulse); g.fill();
    const mg = g.createRadialGradient(mx, c, 0, mx, c, r * 0.4);
    mg.addColorStop(0, "rgba(255,90,140,0.7)"); mg.addColorStop(1, "rgba(255,90,140,0)");
    g.fillStyle = mg; ell(g, mx, c, r * 0.24, r * 0.36); g.fill();
    g.fillStyle = "#f2ead6";
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, ex = mx + Math.cos(a) * r * 0.3 * pulse, ey = c + Math.sin(a) * r * 0.44 * pulse;
      g.beginPath(); g.moveTo(ex + Math.cos(a + 1.57) * r * 0.04, ey + Math.sin(a + 1.57) * r * 0.04);
      g.lineTo(mx + Math.cos(a) * r * 0.17, c + Math.sin(a) * r * 0.27);
      g.lineTo(ex + Math.cos(a - 1.57) * r * 0.04, ey + Math.sin(a - 1.57) * r * 0.04); g.closePath(); g.fill();
    }
    // viele Augen
    for (const [ex, ey, er] of [[0.2, -0.55, 0.09], [0.32, -0.38, 0.07], [0.2, 0.55, 0.09], [0.32, 0.38, 0.07], [-0.05, -0.2, 0.06], [-0.05, 0.22, 0.06]]) {
      g.fillStyle = "#1a0505"; circ(g, c + ex * r, c + ey * r, er * r * 1.3); g.fill();
      g.fillStyle = "#ffd23a"; circ(g, c + ex * r, c + ey * r, er * r); g.fill();
      g.fillStyle = "#000"; circ(g, c + ex * r + er * r * 0.2, c + ey * r, er * r * 0.4); g.fill();
    }
  }

  function mother(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU;
    // 8 Spinnenbeine
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const a = s * (0.55 + k * 0.42) + Math.sin(ph + k * 1.57 + (s > 0 ? Math.PI : 0)) * 0.13;
        const bx = c + Math.cos(a) * r * 0.45, by = c + Math.sin(a) * r * 0.45;
        const kx = c + Math.cos(a - s * 0.18) * r * 1.2, ky = c + Math.sin(a - s * 0.18) * r * 1.2;
        const fx = c + Math.cos(a + s * 0.12) * r * 1.75, fy = c + Math.sin(a + s * 0.12) * r * 1.75;
        limb(g, bx, by, kx, ky, r * 0.13, "#22301f");
        limb(g, kx, ky, fx, fy, r * 0.08, "#2f402a");
        g.fillStyle = "#b8d48a"; circ(g, kx, ky, r * 0.07); g.fill();
      }
    }
    // Hinterleib mit leuchtenden Eiern
    const ax = c - r * 0.38;
    g.fillStyle = vol(g, ax, c, r * 0.9, "#4a6a3a"); ell(g, ax, c, r * 0.88, r * 0.76); g.fill();
    for (let i = 0; i < 9; i++) {
      const ex = ax + (R() - 0.5) * r * 1.1, ey = c + (R() - 0.5) * r * 1.0;
      const er = r * (0.12 + R() * 0.07) * (1 + 0.1 * Math.sin(ph * 2 + i));
      const gr = g.createRadialGradient(ex, ey, 0, ex, ey, er);
      gr.addColorStop(0, "#f2ffb8"); gr.addColorStop(0.5, "#a8ff5a"); gr.addColorStop(1, "#2f5a1a");
      g.fillStyle = gr; circ(g, ex, ey, er); g.fill();
    }
    g.strokeStyle = "rgba(20,40,15,0.7)"; g.lineWidth = r * 0.03;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(ax, c, r * (0.25 + i * 0.13), -1.2, 1.2); g.stroke(); }
    // Vorderkörper & Kopf
    g.fillStyle = vol(g, c + r * 0.38, c, r * 0.5, "#2f4a2c"); ell(g, c + r * 0.38, c, r * 0.46, r * 0.5); g.fill();
    const hx = c + r * 0.8;
    g.fillStyle = vol(g, hx, c, r * 0.3, "#3a5434"); circ(g, hx, c, r * 0.28); g.fill();
    g.strokeStyle = "#d8e8b0"; g.lineWidth = r * 0.07;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(hx + r * 0.2, c + s * r * 0.12); g.quadraticCurveTo(hx + r * 0.5, c + s * r * 0.25, hx + r * 0.42, c + s * r * 0.02); g.stroke(); }
    for (const [ex, ey] of [[0.12, -0.1], [0.12, 0.1], [0.05, -0.2], [0.05, 0.2], [0.18, 0]]) {
      g.fillStyle = "#ff3a2a"; circ(g, hx + ex * r, c + ey * r, r * 0.045); g.fill();
    }
  }

  function nest(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU;
    // Wurzelranken
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + R() * 0.3, l = r * (1.1 + R() * 0.35);
      limb(g, c + Math.cos(a) * r * 0.5, c + Math.sin(a) * r * 0.5, c + Math.cos(a + 0.2) * l, c + Math.sin(a + 0.2) * l, r * 0.12, "#3a1a30");
    }
    // Fleischsack mit Lappen
    for (const [lx, ly, lr] of [[0, 0, 0.82], [-0.3, -0.35, 0.5], [0.32, -0.28, 0.46], [-0.25, 0.4, 0.48], [0.3, 0.35, 0.45]]) {
      const k = 1 + 0.06 * Math.sin(ph + lx * 4);
      g.fillStyle = vol(g, c + lx * r, c + ly * r, lr * r * k, P.skin, 0.3, -0.45); circ(g, c + lx * r, c + ly * r, lr * r * k); g.fill();
    }
    // Adern & leuchtende Eier
    g.strokeStyle = "rgba(50,10,40,0.7)"; g.lineWidth = r * 0.04;
    for (let i = 0; i < 7; i++) { let x = c + (R() - 0.5) * r, y = c + (R() - 0.5) * r; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (R() - 0.5) * r * 0.4; y += (R() - 0.5) * r * 0.4; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 6; i++) {
      const ex = c + (R() - 0.5) * r * 1.1, ey = c + (R() - 0.5) * r * 1.1, er = r * (0.1 + R() * 0.07) * (1 + 0.15 * Math.sin(ph * 2 + i));
      const gr = g.createRadialGradient(ex, ey, 0, ex, ey, er);
      gr.addColorStop(0, "#ffe0ff"); gr.addColorStop(0.5, "#e070e0"); gr.addColorStop(1, "#5a1a50");
      g.fillStyle = gr; circ(g, ex, ey, er); g.fill();
    }
    // Öffnung
    g.fillStyle = "#1a0510"; ell(g, c, c, r * 0.22, r * 0.16 * (1 + 0.3 * Math.sin(ph))); g.fill();
  }

  function zombie(type, frame, variant = 0) {
    const f = ((frame % FRAMES) + FRAMES) % FRAMES;
    const v = variant % variants(type);
    const key = `z:${type}:${v}:${f}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const r = Z_R[type] || 15;
    const S = r * (SPAN[type] || 3.7);
    const P = (PAL[type] || PAL.walker)[v];
    const fn = type === "crawler" ? crawler : type === "dog" || type === "rat" ? dog : type === "abom" ? abom : type === "mother" ? mother : type === "nest" ? nest : humanoid;
    return get(key, S, S, outlined((g) => fn(g, S / 2, r, f, P, rng(hash(type) + v * 977)), r > 30 ? 2 : 1.2));
  }
  // Radien (müssen zu ZOMBIES in game.js passen; werden dort per register gesetzt)
  const Z_R = {};
  function registerRadius(type, r) { Z_R[type] = r; }

  function zombieFx(type, frame, variant, kind) {
    const base = zombie(type, frame, variant);
    const f = ((frame % FRAMES) + FRAMES) % FRAMES, v = variant % variants(type);
    const spec = { hit: ["#ffffff", 0.85], ice: ["#9fdcff", 0.5], corpse: ["#140404", 0.7], rage: ["#ff2a2a", 0.35] }[kind];
    return tinted(`z:${type}:${v}:${f}:${kind}`, base, spec[0], spec[1]);
  }

  // ------------------------------------------------------------------
  // Spieler & Waffen
  // ------------------------------------------------------------------
  // Skin-Farben für die 2D-Darstellung (3D-Details in render3d.js)
  const SKIN2D = {
    soldier: { torso: "#556640", pants: "#3a4430", pack: "#3d4630", pouch: "#46542f", pads: "#4c5a38", arm: "#4a5636", helmet: "#5d6e44", visor: "#6fe3ff", glow: "#8cff4a" },
    police: { torso: "#1e2a44", pants: "#1a2236", pack: "#18213a", pouch: "#141c2c", pads: "#2a3a5c", arm: "#22304e", helmet: "#151a24", visor: "#7fd8ff", glow: "#3a8cff" },
    firefighter: { torso: "#c9a043", pants: "#a8862f", pack: "#b01c18", pouch: "#7a5a20", pads: "#a0802f", arm: "#c9a043", helmet: "#c0201a", visor: "#ffd36a", glow: "#ff8a2a" },
    hazmat: { torso: "#e8c21a", pants: "#d9b218", pack: "#6a6a6a", pouch: "#2a2a2a", pads: "#c9a818", arm: "#e8c21a", helmet: "#e8c21a", visor: "#7fd8ff", glow: "#8cff4a" },
    ninja: { torso: "#16161a", pants: "#121216", pack: "#1a1a1e", pouch: "#2a0a0a", pads: "#202024", arm: "#16161a", helmet: "#141418", visor: "#ff2a2a", glow: "#ff2a2a" },
    cyber: { torso: "#1a1f2a", pants: "#14181f", pack: "#1c2230", pouch: "#11151c", pads: "#2a3344", arm: "#1f2632", helmet: "#20283a", visor: "#2bf0ff", glow: "#2bf0ff" },
    plague: { torso: "#1a1816", pants: "#151311", pack: "#2a2016", pouch: "#3a2a1a", pads: "#2a2622", arm: "#1a1816", helmet: "#121010", visor: "#e8c64a", glow: "#e8c64a" },
    gold: { torso: "#d4a52a", pants: "#a07a1a", pack: "#b08a2a", pouch: "#8a6a1a", pads: "#f2c84a", arm: "#c9982a", helmet: "#f2c84a", visor: "#fff2b0", glow: "#fff2b0" },
    hunter: { torso: "#262b30", pants: "#1c2024", pack: "#20262a", pouch: "#2a331f", pads: "#3c4a2c", arm: "#2a3036", helmet: "#1e2328", visor: "#8cff4a", glow: "#8cff4a" },
  };
  function playerBody(frame, pack, skin = "soldier") {
    const S = SKIN2D[skin] || SKIN2D.soldier;
    const key = `p:${frame}:${pack}:${skin}`;
    return get(key, 72, 72, outlined((g) => {
      const c = 36, r = 16;
      const sw = frame < 0 ? 0 : Math.sin((frame / FRAMES) * TAU);
      // Beine & Stiefel
      for (const s of [-1, 1]) {
        const lx = c - r * 0.1 + sw * s * r * 0.42, ly = c + s * r * 0.34;
        g.fillStyle = S.pants; ell(g, lx, ly, r * 0.36, r * 0.21); g.fill();
        g.fillStyle = "#1e211b"; ell(g, lx + r * 0.27, ly, r * 0.17, r * 0.16); g.fill();
      }
      // Rucksack bzw. Treibstofftanks
      if (pack === "tanks") {
        for (const s of [-1, 1]) {
          g.fillStyle = vol(g, c - r * 0.8, c + s * r * 0.32, r * 0.35, "#a3312a");
          rr(g, c - r * 1.12, c + s * r * 0.32 - r * 0.24, r * 0.7, r * 0.48, r * 0.22); g.fill();
          g.fillStyle = "#9aa3ab"; circ(g, c - r * 1.12, c + s * r * 0.32, r * 0.1); g.fill();
        }
      } else {
        g.fillStyle = vol(g, c - r * 0.8, c, r * 0.6, S.pack);
        rr(g, c - r * 1.15, c - r * 0.55, r * 0.75, r * 1.1, r * 0.2); g.fill();
        g.fillStyle = "#59633f"; rr(g, c - r * 1.22, c - r * 0.42, r * 0.28, r * 0.84, r * 0.12); g.fill(); // Schlafsack
        g.fillStyle = "#2c3322"; g.fillRect(c - r * 0.95, c - r * 0.5, r * 0.08, r * 1.0);
      }
      // Weste mit Taschen
      g.fillStyle = vol(g, c, c, r * 0.95, S.torso); ell(g, c, c, r * 0.52, r * 0.9); g.fill();
      g.fillStyle = S.pouch;
      for (let i = -1; i <= 1; i++) { rr(g, c + r * 0.1, c + i * r * 0.36 - r * 0.13, r * 0.3, r * 0.26, r * 0.06); g.fill(); }
      g.fillStyle = S.glow; circ(g, c - r * 0.05, c - r * 0.78, r * 0.07); g.fill(); // Schulterlicht
      for (const s of [-1, 1]) { g.fillStyle = vol(g, c, c + s * r * 0.78, r * 0.3, S.pads); circ(g, c, c + s * r * 0.76, r * 0.27); g.fill(); }
      // Arme zum Waffengriff
      const arm = (sx, sy, ex, ey, hx, hy) => {
        limb(g, sx, sy, ex, ey, r * 0.3, S.arm);
        limb(g, ex, ey, hx, hy, r * 0.25, S.arm);
        g.fillStyle = "#1f1f1f"; circ(g, hx, hy, r * 0.16); g.fill();
      };
      arm(c, c + r * 0.72, c + r * 0.4, c + r * 0.72, c + r * 0.72, c + r * 0.22);
      arm(c, c - r * 0.72, c + r * 0.62, c - r * 0.5, c + r * 1.15, c + r * 0.12);
      // Helm mit Brille
      const hx = c + r * 0.08;
      g.fillStyle = vol(g, hx, c, r * 0.52, S.helmet); circ(g, hx, c, r * 0.5); g.fill();
      g.strokeStyle = "#3f4b2d"; g.lineWidth = r * 0.06; circ(g, hx, c, r * 0.36); g.stroke();
      g.fillStyle = "#1b1f22"; g.beginPath(); g.arc(hx, c, r * 0.5, -0.9, 0.9); g.arc(hx, c, r * 0.3, 0.9, -0.9, true); g.closePath(); g.fill();
      g.fillStyle = S.visor; g.beginPath(); g.arc(hx, c, r * 0.47, -0.75, 0.75); g.arc(hx, c, r * 0.36, 0.75, -0.75, true); g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.85)"; g.beginPath(); g.arc(hx, c, r * 0.46, -0.6, -0.25); g.arc(hx, c, r * 0.4, -0.25, -0.6, true); g.closePath(); g.fill();
    }, 1.2));
  }

  // Waffen-Geometrie: Länge, Griffposition und Mündung (in Welt-Einheiten, von hinten gemessen)
  const WPN = {
    pistol: { len: 24, grip: 7, muzzle: 24 },
    smg: { len: 34, grip: 11, muzzle: 34 },
    shotgun: { len: 46, grip: 13, muzzle: 46 },
    crossbow: { len: 36, grip: 11, muzzle: 34 },
    flame: { len: 40, grip: 13, muzzle: 40 },
    sniper: { len: 58, grip: 15, muzzle: 58 },
    grenade: { len: 40, grip: 13, muzzle: 40 },
    tesla: { len: 42, grip: 13, muzzle: 42 },
    minigun: { len: 48, grip: 15, muzzle: 48 },
    magnum: { len: 30, grip: 8, muzzle: 30 },
    rifle: { len: 46, grip: 14, muzzle: 46 },
    disc: { len: 40, grip: 12, muzzle: 38 },
    cryo: { len: 42, grip: 13, muzzle: 42 },
    rocket: { len: 54, grip: 18, muzzle: 54 },
    laser: { len: 48, grip: 14, muzzle: 48 },
  };
  const TIER_COLOR = ["#7c8590", "#ffcf4a", "#ffcf4a"];

  function drawWeapon(g, id, tier, y, spin) {
    const accent = TIER_COLOR[tier];
    const steel = (x, w, h, base = "#2c3037") => { const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2); gr.addColorStop(0, mix(base, 0.35)); gr.addColorStop(0.5, base); gr.addColorStop(1, mix(base, -0.45)); g.fillStyle = gr; rr(g, x, y - h / 2, w, h, Math.min(2, h / 2)); g.fill(); };
    const wood = (x, w, h) => { steel(x, w, h, "#6b4a2b"); g.strokeStyle = "rgba(40,25,10,0.5)"; g.lineWidth = 0.5; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x + 1, y - h / 2 + (h * i) / 3); g.lineTo(x + w - 1, y - h / 2 + (h * i) / 3); g.stroke(); } };
    const stripe = (x, w) => { if (tier > 0) { g.fillStyle = accent; g.fillRect(x, y - 1, w, 2); } };
    const gem = (x) => { if (tier > 1) { g.fillStyle = "#b46bff"; circ(g, x, y, 2.2); g.fill(); g.fillStyle = "#fff"; circ(g, x - 0.6, y - 0.6, 0.7); g.fill(); } };
    switch (id) {
      case "pistol":
        steel(4, 9, 7, "#25282d"); steel(4, 20, 6); stripe(9, 12); gem(13);
        g.fillStyle = "#111"; circ(g, 23.5, y, 1.2); g.fill(); break;
      case "smg":
        steel(0, 10, 3, "#3a3d42"); steel(9, 17, 8); steel(25, 9, 4, "#3a3d42");
        steel(15, 5, 6, "#1e2024"); g.fillStyle = "#1e2024"; g.fillRect(16, y + 3, 4, 7); stripe(11, 13); gem(19); break;
      case "shotgun":
        wood(0, 14, 7); steel(13, 11, 7, "#2b2b2b"); steel(24, 22, 4, "#3a3d42");
        g.fillStyle = "#2a2d31"; g.fillRect(24, y + 1.5, 18, 2.4);
        wood(27, 9, 7); stripe(14, 9); gem(18); break;
      case "crossbow":
        wood(0, 22, 6); steel(20, 15, 4, "#3a3f46");
        g.strokeStyle = "#2f343b"; g.lineWidth = 2.6; g.beginPath(); g.moveTo(26, y - 15); g.quadraticCurveTo(35, y, 26, y + 15); g.stroke();
        g.strokeStyle = tier ? accent : "#5b636e"; g.lineWidth = 1; g.stroke();
        g.strokeStyle = "#d8d2c0"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(26, y - 15); g.lineTo(17, y); g.lineTo(26, y + 15); g.stroke();
        g.fillStyle = "#b08a58"; g.fillRect(14, y - 0.7, 20, 1.4);
        g.fillStyle = "#cfd6dc"; g.beginPath(); g.moveTo(34, y); g.lineTo(31, y - 2); g.lineTo(31, y + 2); g.fill();
        g.fillStyle = "#8cff4a"; g.beginPath(); g.moveTo(14, y); g.lineTo(18, y - 2.5); g.lineTo(18, y + 2.5); g.fill();
        stripe(3, 14); gem(8); break;
      case "flame":
        steel(4, 24, 9, "#8e2a22"); g.fillStyle = "rgba(0,0,0,0.35)"; for (const x of [10, 16, 22]) g.fillRect(x, y - 4.5, 1.2, 9);
        steel(27, 13, 5, "#5c6168"); steel(37, 3, 7, "#40454b");
        g.strokeStyle = "#202326"; g.lineWidth = 2; g.beginPath(); g.moveTo(5, y + 3); g.quadraticCurveTo(-2, y + 8, -6, y + 4); g.stroke();
        g.fillStyle = "#6fc8ff"; circ(g, 40, y + 2.5, 1.2); g.fill(); stripe(6, 18); gem(14); break;
      case "sniper":
        steel(0, 17, 7, "#4c5a35"); g.fillStyle = "#3a4428"; circ(g, 5, y - 1, 2); g.fill(); circ(g, 11, y + 1.5, 1.6); g.fill();
        steel(16, 15, 6); steel(30, 24, 3, "#3a3d42"); steel(53, 5, 5, "#25282d");
        g.fillStyle = "#16181b"; rr(g, 18, y - 6.5, 17, 4.6, 2); g.fill();
        g.fillStyle = "#4ab0ff"; circ(g, 35, y - 4.2, 1.5); g.fill();
        stripe(17, 12); gem(23); break;
      case "grenade":
        steel(0, 12, 6, "#3d4428"); steel(24, 16, 9, "#4d5a2a");
        g.fillStyle = vol(g, 18, y, 8.5, "#3a4026"); circ(g, 18, y, 8.5); g.fill();
        g.fillStyle = "#1c1f14"; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; circ(g, 18 + Math.cos(a) * 5, y + Math.sin(a) * 5, 1.5); g.fill(); }
        g.fillStyle = "#1a1d12"; circ(g, 39.5, y, 3); g.fill(); stripe(25, 12); gem(18); break;
      case "tesla":
        steel(4, 22, 9, "#2a2f38"); steel(24, 16, 3, "#596270");
        g.fillStyle = "#7fe7ff"; g.fillRect(24, y - 0.8, 16, 1.6);
        for (const x of [26, 31, 36]) { g.strokeStyle = "#c87533"; g.lineWidth = 2.4; ell(g, x, y, 1.6, 6.5); g.stroke(); g.strokeStyle = "#f0a860"; g.lineWidth = 0.8; ell(g, x - 0.4, y, 1.2, 5.6); g.stroke(); }
        g.strokeStyle = "#9aa3ab"; g.lineWidth = 1.2; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(39, y + s * 2.5); g.lineTo(42, y + s * 1.2); g.stroke(); }
        stripe(6, 16); gem(14); break;
      case "magnum":
        steel(2, 9, 8, "#3a2a1c"); steel(9, 9, 9, "#4a4f56");
        g.fillStyle = "#2a2d31"; for (const o of [-2.5, 0, 2.5]) { circ(g, 13.5, y + o, 1.4); g.fill(); }
        steel(17, 13, 4, "#5a5f66"); g.fillStyle = "#111"; circ(g, 29.5, y, 1.2); g.fill(); stripe(18, 10); gem(13); break;
      case "rifle":
        steel(0, 13, 6, "#3a3328"); steel(12, 16, 7, "#2c3037"); steel(27, 17, 3, "#3d4148");
        g.fillStyle = "#1e2024"; g.fillRect(18, y + 3, 4, 8); g.fillStyle = "#c9a043"; g.fillRect(19, y + 4, 2, 6);
        g.fillStyle = "#16181b"; rr(g, 15, y - 6.5, 9, 3, 1); g.fill(); stripe(13, 12); gem(20); break;
      case "disc":
        steel(2, 22, 8, "#4a5562"); g.fillStyle = vol(g, 30, y, 8, "#c9d1d9"); circ(g, 30, y, 8); g.fill();
        g.fillStyle = "#e5383b"; circ(g, 30, y, 2.2); g.fill();
        g.strokeStyle = "#8a939b"; g.lineWidth = 1; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(30 + Math.cos(a) * 6, y + Math.sin(a) * 6); g.lineTo(30 + Math.cos(a + 0.4) * 9, y + Math.sin(a + 0.4) * 9); g.stroke(); }
        stripe(4, 16); gem(12); break;
      case "cryo":
        steel(4, 20, 9, "#cfd8de"); g.fillStyle = "rgba(60,140,200,0.5)"; g.fillRect(8, y - 4.5, 12, 9);
        steel(23, 14, 5, "#596270"); g.fillStyle = "#9fe8ff"; g.fillRect(24, y - 1, 16, 2); g.fillStyle = "#e8fbff"; circ(g, 40, y, 2.2); g.fill();
        for (const x of [10, 15]) { g.fillStyle = "#9fe8ff"; g.fillRect(x, y - 6, 2, 12); } stripe(6, 14); gem(14); break;
      case "rocket":
        steel(0, 40, 9, "#4d5a2a"); g.fillStyle = "#2a3018"; g.fillRect(14, y + 4.5, 5, 7); g.fillRect(24, y - 9, 6, 4.5);
        steel(39, 8, 11, "#3a4026"); g.fillStyle = "#e5383b"; g.beginPath(); g.moveTo(47, y - 4); g.lineTo(53, y); g.lineTo(47, y + 4); g.fill();
        stripe(6, 20); gem(18); break;
      case "laser":
        steel(4, 22, 10, "#1e2228"); steel(25, 20, 4, "#3d4148");
        g.fillStyle = "#ff4a4a"; g.fillRect(8, y - 1.2, 16, 2.4); g.fillRect(26, y - 0.6, 20, 1.2);
        for (const x of [28, 34, 40]) { g.fillStyle = "#596270"; g.fillRect(x, y - 3.5, 2.5, 7); }
        g.fillStyle = "#ffb0b0"; circ(g, 46.5, y, 1.8); g.fill(); stripe(6, 16); gem(14); break;
      case "minigun": {
        steel(4, 20, 12, "#33363b"); g.fillStyle = "#24262a"; rr(g, 8, y - 9, 10, 4, 1); g.fill();
        g.fillStyle = "#c9a043"; for (let i = 0; i < 5; i++) g.fillRect(6 + i * 3, y + 5.5, 2, 4);
        const offs = [-3.5, -1.2, 1.2, 3.5];
        offs.forEach((o, i) => {
          const k = Math.cos(spin + i * 1.57);
          const bc = k > 0 ? "#4a4f56" : "#2a2d31";
          g.fillStyle = bc; g.fillRect(24, y + o - 0.9, 24, 1.8);
        });
        steel(24, 3, 10, "#3d4148"); steel(44, 3, 10, "#3d4148"); stripe(6, 16); gem(14);
        break;
      }
    }
  }

  function weapon(id, tier = 0, frame = 0) {
    const m = WPN[id] || WPN.pistol;
    const key = `w:${id}:${tier}:${id === "minigun" ? frame % 4 : 0}`;
    const s = get(key, m.len + 12, 34, outlined((g) => drawWeapon(g, id, tier, 17, ((frame % 4) / 4) * Math.PI), 0.9));
    s.grip = m.grip + 6; s.muzzle = m.muzzle + 6; // +6 = linker Rand
    return s;
  }

  const iconCache = new Map();
  // Waffen-Icon als Bild-URL für Menüs (Waffenkammer, Menü)
  function weaponIcon(id, tier = 0) {
    const key = `${id}:${tier}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const m = WPN[id] || WPN.pistol;
    const scale = 2.2;
    const { c, g } = canvas(64, 34, scale * 2, true);
    const sx = 60 / (m.len + 10);
    g.translate(2, 0); g.scale(sx, sx); g.translate(0, (34 / sx - 34) / 2);
    outlined((gg) => drawWeapon(gg, id, tier, 17, 0), 0.9, undefined, scale * 2 * sx)(g, m.len + 12, 34);
    const url = c.toDataURL();
    iconCache.set(key, url);
    return url;
  }

  // ------------------------------------------------------------------
  // Projektile & Effekt-Sprites
  // ------------------------------------------------------------------
  function streak(rgb) {
    return get(`streak:${rgb}`, 64, 8, (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.7, `rgba(${rgb},0.55)`); gr.addColorStop(1, "rgba(255,255,255,1)");
      g.fillStyle = gr; rr(g, 0, 2, 64, 4, 2); g.fill();
    });
  }

  function muzzleFlash(kind) {
    return get(`flash:${kind}`, 64, 48, (g) => {
      const col = kind === "tesla" ? ["#eaffff", "#7fe7ff", "rgba(60,160,255,0)"] : kind === "laser" ? ["#fff0f0", "#ff4a4a", "rgba(255,0,0,0)"] : kind === "flame" ? ["#fff1b0", "#ff9a2e", "rgba(255,60,0,0)"] : ["#ffffff", "#ffd36a", "rgba(255,120,20,0)"];
      const big = kind === "big";
      const gr = g.createRadialGradient(8, 24, 0, 8, 24, big ? 40 : 28);
      gr.addColorStop(0, col[0]); gr.addColorStop(0.35, col[1]); gr.addColorStop(1, col[2]);
      g.fillStyle = gr;
      g.beginPath();
      const spikes = [[big ? 56 : 40, 0], [16, 12], [20, -12], [12, 18], [12, -18]];
      g.moveTo(4, 24);
      for (const [lx, ly] of spikes) { g.lineTo(8 + lx * 0.5, 24 + ly * 0.25 - 3); g.lineTo(8 + lx, 24 + ly); g.lineTo(8 + lx * 0.5, 24 + ly * 0.25 + 3); }
      g.closePath(); g.fill();
      g.fillStyle = gr; circ(g, 8, 24, 9); g.fill();
    });
  }

  function bolt() {
    return get("bolt", 30, 8, outlined((g) => {
      g.fillStyle = "#b08a58"; g.fillRect(4, 3.3, 20, 1.4);
      g.fillStyle = "#dfe6ec"; g.beginPath(); g.moveTo(29, 4); g.lineTo(23, 1.5); g.lineTo(23, 6.5); g.closePath(); g.fill();
      g.fillStyle = "#8cff4a"; g.beginPath(); g.moveTo(2, 4); g.lineTo(8, 0.8); g.lineTo(9, 4); g.lineTo(8, 7.2); g.closePath(); g.fill();
    }, 0.6));
  }

  function grenadeShell() {
    return get("grenade", 16, 16, outlined((g) => {
      g.fillStyle = vol(g, 8, 8, 6, "#4d5a2a"); circ(g, 8, 8, 5.5); g.fill();
      g.fillStyle = "#c9a043"; g.fillRect(6.5, 2.6, 3, 10.8);
      g.fillStyle = "#ff3a2a"; circ(g, 8, 8, 1.2); g.fill();
    }, 0.7));
  }

  function acidGlob(rgbCore, rgbEdge) {
    return get(`acid:${rgbCore}`, 24, 24, (g) => {
      const gr = g.createRadialGradient(10, 10, 0, 12, 12, 11);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, `rgb(${rgbCore})`); gr.addColorStop(0.85, `rgb(${rgbEdge})`); gr.addColorStop(1, `rgba(${rgbEdge},0)`);
      g.fillStyle = gr; circ(g, 12, 12, 11); g.fill();
    });
  }

  function casing(shell) {
    return get(`casing:${shell ? 1 : 0}`, 8, 4, (g) => {
      if (shell) { g.fillStyle = "#b8322a"; g.fillRect(0.5, 0.6, 5, 2.8); g.fillStyle = "#d9b04a"; g.fillRect(5.3, 0.6, 2, 2.8); }
      else { g.fillStyle = "#d9b04a"; g.fillRect(1, 1, 5.5, 2); g.fillStyle = "#fff2b0"; g.fillRect(1.5, 1.2, 4, 0.6); }
    });
  }

  function gib(color, i) {
    return get(`gib:${color}:${i}`, 12, 12, outlined((g) => {
      const R = rng(i * 131 + hash(color));
      g.fillStyle = vol(g, 6, 6, 5, color); blob(g, 6, 6, 3.4 + R() * 1.4, R, 6); g.fill();
      if (i % 3 === 0) { g.fillStyle = "#e8dfc8"; g.fillRect(4, 5.2, 5, 1.4); }
    }, 0.6));
  }

  // Blutspritzer-Stempel (zeigt in +x-Richtung)
  function splat(color, i) {
    return get(`splat:${color}:${i}`, 72, 72, (g) => {
      const R = rng(i * 7919 + hash(color));
      g.fillStyle = color;
      blob(g, 30, 36, 10 + R() * 5, R, 11); g.fill();
      for (let k = 0; k < 4; k++) { blob(g, 30 + (R() - 0.3) * 18, 36 + (R() - 0.5) * 18, 4 + R() * 5, R, 7); g.fill(); }
      for (let k = 0; k < 12; k++) {
        const a = (R() - 0.5) * 1.6, d = 14 + R() * 22;
        circ(g, 30 + Math.cos(a) * d, 36 + Math.sin(a) * d, 0.8 + R() * 2.2); g.fill();
      }
      g.globalAlpha = 0.6;
      for (let k = 0; k < 3; k++) {
        const a = (R() - 0.5) * 0.9, d = 18 + R() * 14;
        g.save(); g.translate(30, 36); g.rotate(a); ell(g, d * 0.6, 0, d * 0.5, 1.4 + R()); g.fill(); g.restore();
      }
      g.globalAlpha = 1;
    });
  }

  function scorch() {
    return get("scorch", 96, 96, (g) => {
      const gr = g.createRadialGradient(48, 48, 0, 48, 48, 46);
      gr.addColorStop(0, "rgba(10,8,6,0.8)"); gr.addColorStop(0.55, "rgba(20,14,10,0.5)"); gr.addColorStop(1, "rgba(20,14,10,0)");
      g.fillStyle = gr; circ(g, 48, 48, 46); g.fill();
      const R = rng(99);
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) { const a = R() * TAU; g.beginPath(); g.moveTo(48 + Math.cos(a) * 12, 48 + Math.sin(a) * 12); g.lineTo(48 + Math.cos(a) * (28 + R() * 16), 48 + Math.sin(a) * (28 + R() * 16)); g.stroke(); }
    });
  }

  // Umgestürzter Maibaum (wird auf den Boden gestempelt): weiß-blau gedrehter Stamm mit Kranz
  function fallenPole() {
    return get("pole", 240, 40, (g) => {
      g.fillStyle = "rgba(0,0,0,0.35)"; rr(g, 8, 21, 226, 10, 5); g.fill();
      for (let x = 6; x < 214; x += 12) { g.fillStyle = (x / 12) % 2 ? "#3a7fd0" : "#f2f2ee"; g.beginPath(); g.moveTo(x, 13); g.lineTo(x + 12, 13); g.lineTo(x + 8, 25); g.lineTo(x - 4, 25); g.closePath(); g.fill(); }
      g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 1; g.strokeRect(4, 13, 210, 12);
      g.fillStyle = "#2f6a2a"; circ(g, 222, 19, 14); g.fill(); g.strokeStyle = "#4a9a3a"; g.lineWidth = 3; circ(g, 222, 19, 10); g.stroke();
      for (const [x, c] of [[60, "#c0281e"], [110, "#e8c21a"], [160, "#3a7fd0"]]) { g.fillStyle = "#6a4426"; g.fillRect(x, 4, 18, 9); g.fillStyle = c; g.fillRect(x + 2, 5, 14, 7); }
    });
  }

  function smoke() {
    return get("smoke", 48, 48, (g) => {
      const R = rng(7);
      for (let i = 0; i < 6; i++) {
        const x = 24 + (R() - 0.5) * 16, y = 24 + (R() - 0.5) * 16, r = 9 + R() * 8;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(120,120,115,0.35)"); gr.addColorStop(1, "rgba(120,120,115,0)");
        g.fillStyle = gr; circ(g, x, y, r); g.fill();
      }
    });
  }

  // Aufgebrochener Boden (Zombie kriecht heraus): Erdloch mit Brocken
  function crack() {
    return get("crack", 48, 48, (g) => {
      const R = rng(13);
      const gr = g.createRadialGradient(24, 24, 0, 24, 24, 20);
      gr.addColorStop(0, "rgba(30,22,14,0.9)"); gr.addColorStop(0.6, "rgba(50,38,26,0.6)"); gr.addColorStop(1, "rgba(50,38,26,0)");
      g.fillStyle = gr; blob(g, 24, 24, 18, R, 10); g.fill();
      for (let i = 0; i < 9; i++) {
        const a = R() * TAU, d = 10 + R() * 9;
        g.fillStyle = R() > 0.5 ? "rgba(70,56,40,0.9)" : "rgba(40,32,24,0.9)";
        blob(g, 24 + Math.cos(a) * d, 24 + Math.sin(a) * d, 1.6 + R() * 2.2, R, 5); g.fill();
      }
    });
  }

  function saw() {
    return get("saw", 26, 26, outlined((g) => {
      g.fillStyle = vol(g, 13, 13, 11, "#c9d1d9");
      g.beginPath();
      for (let k = 0; k < 16; k++) { const rad = k % 2 ? 8 : 11.5, a = (k / 16) * TAU; g.lineTo(13 + Math.cos(a) * rad, 13 + Math.sin(a) * rad); }
      g.closePath(); g.fill();
      g.fillStyle = "#5c636b"; circ(g, 13, 13, 3.4); g.fill();
      g.fillStyle = "#e5383b"; circ(g, 13, 13, 1.4); g.fill();
    }, 0.8));
  }

  function drone() {
    return get("drone", 34, 34, outlined((g) => {
      for (const [x, y] of [[7, 7], [27, 7], [7, 27], [27, 27]]) {
        limb(g, 17, 17, x, y, 2.4, "#3a4048");
        g.fillStyle = "rgba(200,230,255,0.35)"; circ(g, x, y, 6); g.fill();
        g.fillStyle = "#2a3038"; circ(g, x, y, 2); g.fill();
      }
      g.fillStyle = vol(g, 17, 17, 7, "#4a5562"); rr(g, 11, 12, 12, 10, 3); g.fill();
      g.fillStyle = "#7fe7ff"; circ(g, 21, 17, 2); g.fill();
    }, 0.8));
  }

  function coin(frame) {
    const f = frame % 6;
    return get(`coin:${f}`, 14, 14, outlined((g) => {
      const w = Math.max(1.2, 5.5 * Math.abs(Math.cos((f / 6) * Math.PI)));
      const gr = g.createLinearGradient(7 - w, 0, 7 + w, 0);
      gr.addColorStop(0, "#c98a1a"); gr.addColorStop(0.5, "#ffe27a"); gr.addColorStop(1, "#c98a1a");
      g.fillStyle = gr; ell(g, 7, 7, w, 5.5); g.fill();
      if (w > 3) { g.fillStyle = "#b07614"; g.fillRect(6.4, 4.2, 1.2, 5.6); }
    }, 0.7));
  }

  function supplyCrate() {
    return get("supply", 60, 60, outlined((g) => {
      g.fillStyle = vol(g, 30, 34, 26, "#2f5a8a"); rr(g, 8, 14, 44, 38, 5); g.fill();
      g.fillStyle = vol(g, 30, 22, 26, "#3f74ad"); rr(g, 8, 8, 44, 14, 4); g.fill();
      g.fillStyle = "#c9d6e4"; g.fillRect(8, 20, 44, 3);
      g.fillStyle = "#fff"; g.fillRect(26, 27, 8, 22); g.fillRect(19, 34, 22, 8);
      g.fillStyle = "#e5383b"; g.fillRect(27.5, 28.5, 5, 19); g.fillRect(20.5, 35.5, 19, 5);
    }, 1));
  }

  // ------------------------------------------------------------------
  // Hindernisse (je Kapitel-Thema)
  // ------------------------------------------------------------------
  const OBS_Z = { bretter: 16, car: 0, crate: 12, barrels: 0, barricade: 14, dumpster: 16, bed: 6, cabinet: 18, medcrate: 12, tank: 0, server: 18, labcrate: 12, bude: 16, bierbank: 4, fass: 0, maibaum: 0, brunnen: 6, boeller: 10, automat: 14, rebstock: 18, glascontainer: 16, dixi: 26, telefonzelle: 30, weihnachtsbaum: 0, strandkorb: 18, sandsack: 12, bus: 22, bauzaun: 30, feuertonne: 14, container: 24 };
  const CAR_COLORS = ["#7a2f2f", "#2f4f7a", "#6b6b6b", "#c9b48a", "#2f5f4a", "#d8d8d0"];

  const clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
  function box3d(g, x, y, w, h, z, top, front, edge) {
    g.fillStyle = front; g.fillRect(x, y + h - 0.5, w, z + 0.5);
    g.fillStyle = top; g.fillRect(x, y, w, h);
    if (edge) { g.strokeStyle = edge; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  }

  function carTop(g, w, h, R) {
    const col = CAR_COLORS[Math.floor(R() * CAR_COLORS.length)];
    g.fillStyle = vol(g, w / 2, h / 2, w * 0.6, col, 0.2, -0.35); rr(g, 2, 3, w - 4, h - 6, 12); g.fill();
    // Motorhaube & Kofferraum-Linien
    g.strokeStyle = mix(col, -0.4); g.lineWidth = 1;
    g.beginPath(); g.moveTo(w * 0.24, 6); g.lineTo(w * 0.24, h - 6); g.moveTo(w * 0.8, 6); g.lineTo(w * 0.8, h - 6); g.stroke();
    // Scheiben
    const glass = (x, ww) => { const gr = g.createLinearGradient(x, 0, x + ww, 0); gr.addColorStop(0, "#1b2733"); gr.addColorStop(1, "#3c5266"); g.fillStyle = gr; rr(g, x, 8, ww, h - 16, 4); g.fill(); };
    glass(w * 0.27, w * 0.14); glass(w * 0.62, w * 0.12);
    g.fillStyle = mix(col, -0.12); rr(g, w * 0.41, 7, w * 0.21, h - 14, 4); g.fill(); // Dach
    // gesprungene Scheibe
    g.strokeStyle = "rgba(220,235,255,0.7)"; g.lineWidth = 0.6;
    const cx = w * 0.33, cy = h * (0.3 + R() * 0.4);
    for (let i = 0; i < 6; i++) { const a = R() * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); g.stroke(); }
    // Lichter
    g.fillStyle = "#ffe9a8"; g.fillRect(w - 6, 6, 3, 6); g.fillRect(w - 6, h - 12, 3, 6);
    g.fillStyle = "#b3261e"; g.fillRect(3, 6, 3, 6); g.fillRect(3, h - 12, 3, 6);
    // Rost & Blut
    for (let i = 0; i < 4; i++) { g.fillStyle = "rgba(110,60,20,0.55)"; blob(g, R() * w, R() * h, 3 + R() * 4, R); g.fill(); }
    g.fillStyle = "rgba(100,10,12,0.6)"; blob(g, w * (0.3 + R() * 0.4), h * R(), 5, R); g.fill();
  }

  function obstacle(o, theme) {
    const z = OBS_Z[o.kind] || 0;
    const pad = 4;
    const W2 = o.w + pad * 2, H2 = o.h + z + pad * 2;
    const R = rng(o.seed || 1);
    const { c, g } = canvas(W2, H2);
    // Schlagschatten
    g.fillStyle = "rgba(0,0,0,0.38)"; rr(g, pad + 4, pad + z + 6, o.w, o.h, 6); g.fill();
    const x = pad, y = pad;
    const fn = (gg) => {
      switch (o.kind) {
        case "car": {
          gg.save(); gg.translate(x, y + z);
          if (o.vert) { gg.translate(o.w, 0); gg.rotate(Math.PI / 2); carTop(gg, o.h, o.w, R); } else carTop(gg, o.w, o.h, R);
          gg.restore(); break;
        }
        case "crate":
        case "medcrate":
        case "labcrate": {
          const base = o.kind === "crate" ? "#7a5a34" : o.kind === "medcrate" ? "#d9dcd6" : "#56606a";
          box3d(gg, x, y, o.w, o.h, z, mix(base, 0.08), mix(base, -0.35), mix(base, -0.45));
          gg.strokeStyle = mix(base, -0.3); gg.lineWidth = 1;
          if (o.kind === "crate") {
            for (let i = 1; i < 4; i++) { gg.beginPath(); gg.moveTo(x, y + (o.h * i) / 4); gg.lineTo(x + o.w, y + (o.h * i) / 4); gg.stroke(); }
            gg.lineWidth = 2.5; gg.beginPath(); gg.moveTo(x + 3, y + 3); gg.lineTo(x + o.w - 3, y + o.h - 3); gg.stroke();
            gg.fillStyle = "#c9c3b0"; for (const [nx, ny] of [[4, 4], [o.w - 4, 4], [4, o.h - 4], [o.w - 4, o.h - 4]]) { circ(gg, x + nx, y + ny, 1); gg.fill(); }
          } else if (o.kind === "medcrate") {
            gg.fillStyle = "#e5383b"; gg.fillRect(x + o.w / 2 - 3, y + o.h / 2 - 9, 6, 18); gg.fillRect(x + o.w / 2 - 9, y + o.h / 2 - 3, 18, 6);
          } else {
            for (let i = 0; i < o.w; i += 8) { gg.fillStyle = (i / 8) % 2 ? "#1c1c1c" : "#e8c21a"; gg.beginPath(); gg.moveTo(x + i, y + o.h + z); gg.lineTo(x + i + 6, y + o.h); gg.lineTo(x + i + 10, y + o.h); gg.lineTo(x + i + 4, y + o.h + z); gg.fill(); }
            gg.strokeStyle = "#3a434b"; gg.strokeRect(x + 4, y + 4, o.w - 8, o.h - 8);
          }
          break;
        }
        case "barrels": {
          const pos = [[0.28, 0.3], [0.72, 0.3], [0.5, 0.72]];
          for (const [px, py] of pos) {
            const bx = x + o.w * px, by = y + o.h * py, br = Math.min(o.w, o.h) * 0.26;
            gg.fillStyle = vol(gg, bx, by, br, theme === "lab" ? "#2f6a8a" : "#3d6b2a"); circ(gg, bx, by, br); gg.fill();
            gg.strokeStyle = "rgba(0,0,0,0.5)"; gg.lineWidth = 1.2; circ(gg, bx, by, br * 0.78); gg.stroke();
            const gr = gg.createRadialGradient(bx, by, 0, bx, by, br * 0.62);
            gr.addColorStop(0, "#f2ffb0"); gr.addColorStop(0.5, "#9eff3a"); gr.addColorStop(1, "#2d5a10");
            gg.fillStyle = gr; circ(gg, bx, by, br * 0.6); gg.fill();
          }
          break;
        }
        case "bretter": {
          // v3.3 vernagelte Gang-Barrikade (senkrecht in der Wandöffnung): Pfosten, quer genagelte Bretter, rotes Warn-X.
          // Schadensstufe o.stage 0–2: Bretter fehlen, Splitter, Lücken
          const st = o.stage || 0, n = 6 - st * 2;
          gg.fillStyle = "#3a2a1a"; gg.fillRect(x + o.w * 0.3, y, o.w * 0.4, o.h + z);
          for (const py of [y + 2, y + o.h - 8]) box3d(gg, x + o.w * 0.25, py, o.w * 0.5, 7, z, "#5a4028", "#3a2816", "#2a1c10");
          for (let i = 0; i < 6; i++) {
            if (i >= n && (i * 7 + st) % 3) continue; // fehlende Bretter
            const by = y + 6 + (i / 6) * (o.h - 12), tilt = (R() - 0.5) * 0.5, v = Math.floor(R() * 30) - 15;
            gg.save(); gg.translate(x + o.w / 2, by + 5); gg.rotate(Math.PI / 2 * 0 + tilt);
            gg.fillStyle = `rgb(${128 + v},${92 + v * 0.8},${54 + v * 0.5})`; gg.fillRect(-o.w / 2 - 2, -4, o.w + 4, 8);
            gg.fillStyle = "rgba(255,230,190,0.18)"; gg.fillRect(-o.w / 2 - 2, -4, o.w + 4, 1.4);
            gg.fillStyle = "rgba(0,0,0,0.35)"; gg.fillRect(-o.w / 2 - 2, 3, o.w + 4, 1.2);
            gg.fillStyle = "#c9ced4"; for (const nx of [-o.w / 2 + 3, o.w / 2 - 3]) { gg.beginPath(); gg.arc(nx, 0, 1.3, 0, TAU); gg.fill(); }
            gg.restore();
          }
          if (st < 2) { gg.strokeStyle = "rgba(200,30,24,0.75)"; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(x + 4, y + o.h * 0.25); gg.lineTo(x + o.w - 4, y + o.h * 0.75); gg.moveTo(x + o.w - 4, y + o.h * 0.25); gg.lineTo(x + 4, y + o.h * 0.75); gg.stroke(); }
          gg.fillStyle = "rgba(240,220,180,0.7)"; for (let i = 0; i < st * 6; i++) gg.fillRect(x + R() * o.w, y + R() * o.h, 2 + R() * 3, 1); // Splitter
          break;
        }
        case "barricade": {
          box3d(gg, x, y, o.w, o.h, z, "#8d8c86", "#5e5d58", "#4a4945");
          for (let i = 0; i < o.w; i += 10) { gg.fillStyle = (i / 10) % 2 ? "#151515" : "#f2c81a"; gg.beginPath(); gg.moveTo(x + i, y + o.h + z); gg.lineTo(x + i + 7, y + o.h); gg.lineTo(x + i + 12, y + o.h); gg.lineTo(x + i + 5, y + o.h + z); gg.fill(); }
          gg.fillStyle = "rgba(0,0,0,0.2)"; for (let i = 0; i < 6; i++) { blob(gg, x + R() * o.w, y + R() * o.h, 2 + R() * 3, R); gg.fill(); }
          break;
        }
        case "dumpster": {
          box3d(gg, x, y, o.w, o.h, z, "#2f5a3a", "#1f3d27", "#173020");
          gg.fillStyle = "#264a30"; gg.fillRect(x + 2, y + 2, o.w / 2 - 3, o.h - 4); gg.fillRect(x + o.w / 2 + 1, y + 2, o.w / 2 - 3, o.h - 4);
          gg.fillStyle = "rgba(200,200,200,0.15)"; gg.fillRect(x + 4, y + 4, o.w - 8, 2);
          gg.fillStyle = "#8a6e3a"; for (let i = 0; i < 3; i++) { blob(gg, x + R() * o.w, y + R() * o.h, 3, R); gg.fill(); }
          break;
        }
        case "bed": {
          gg.fillStyle = "#6f7880"; gg.fillRect(x, y + z, o.w, o.h);
          gg.fillStyle = vol(gg, x + o.w / 2, y + o.h / 2, o.w * 0.6, "#dfe6ea", 0.1, -0.2); rr(gg, x + 3, y + 3, o.w - 6, o.h - 6 + z * 0.4, 4); gg.fill();
          gg.fillStyle = "#f4f6f8"; rr(gg, x + 5, y + 5, o.w * 0.25, o.h - 10, 4); gg.fill(); // Kissen
          gg.fillStyle = "rgba(115,10,14,0.75)"; blob(gg, x + o.w * 0.6, y + o.h * 0.5, Math.min(o.w, o.h) * 0.22, R, 10); gg.fill();
          gg.strokeStyle = "#4d555c"; gg.lineWidth = 2; gg.strokeRect(x + 1, y + 1, o.w - 2, o.h - 2);
          break;
        }
        case "cabinet": {
          box3d(gg, x, y, o.w, o.h, z, "#b7bec2", "#7f878c", "#5d6468");
          gg.strokeStyle = "#6d7478"; gg.lineWidth = 1; gg.beginPath(); gg.moveTo(x + o.w / 2, y + o.h); gg.lineTo(x + o.w / 2, y + o.h + z); gg.stroke();
          gg.fillStyle = "#e5383b"; gg.fillRect(x + o.w / 2 - 2, y + o.h / 2 - 6, 4, 12); gg.fillRect(x + o.w / 2 - 6, y + o.h / 2 - 2, 12, 4);
          break;
        }
        case "tank": {
          const cx = x + o.w / 2, cy = y + o.h / 2, tr = Math.min(o.w, o.h) / 2 - 1;
          gg.fillStyle = vol(gg, cx, cy, tr, "#4a535a"); circ(gg, cx, cy, tr); gg.fill();
          const gr = gg.createRadialGradient(cx, cy, 0, cx, cy, tr * 0.8);
          gr.addColorStop(0, "#d8ff9a"); gr.addColorStop(0.5, "#6fd12a"); gr.addColorStop(1, "#1f4a10");
          gg.fillStyle = gr; circ(gg, cx, cy, tr * 0.78); gg.fill();
          gg.fillStyle = "rgba(30,60,20,0.7)"; blob(gg, cx, cy, tr * 0.32, R, 9); gg.fill(); // Präparat
          gg.strokeStyle = "rgba(220,255,240,0.55)"; gg.lineWidth = 1.5; gg.beginPath(); gg.arc(cx, cy, tr * 0.7, -2.4, -1.4); gg.stroke();
          gg.strokeStyle = "#2e3439"; gg.lineWidth = 3; circ(gg, cx, cy, tr * 0.85); gg.stroke();
          break;
        }
        case "server": {
          box3d(gg, x, y, o.w, o.h, z, "#22272c", "#15191d", "#0d1013");
          for (let i = 0; i < 5; i++) {
            const lx = x + 4 + (i * (o.w - 8)) / 5;
            gg.fillStyle = R() > 0.3 ? "#3cff7a" : "#ff4a3a"; gg.fillRect(lx, y + o.h + 3, 2, 2);
            gg.fillStyle = "#2c3238"; gg.fillRect(lx, y + 3, (o.w - 8) / 5 - 2, o.h - 6);
          }
          break;
        }
        case "bude": {
          // Marktbude von oben: Satteldach mit Schindeln, gestreifte Markise vorn, Lichterkette
          const v = o.vert;
          box3d(gg, x, y, o.w, o.h, z, "#6a4426", "#4a2e18", "#3a2210");
          const rc = o.fest === "weihnachten" ? "#7a2a1e" : o.fest === "wiesn" ? "#e8eef4" : "#5e2a1a";
          gg.fillStyle = rc; gg.fillRect(x + 2, y + 2, o.w - 4, (o.h - 4) / 2);
          gg.fillStyle = mix(rc, -0.2); gg.fillRect(x + 2, y + 2 + (o.h - 4) / 2, o.w - 4, (o.h - 4) / 2);
          gg.strokeStyle = "rgba(0,0,0,0.25)"; gg.lineWidth = 1; for (let k = 6; k < o.w - 4; k += 6) { gg.beginPath(); gg.moveTo(x + k, y + 3); gg.lineTo(x + k, y + o.h - 3); gg.stroke(); }
          if (o.fest === "wiesn") { gg.fillStyle = "#3a7fd0"; for (let k = 0; k < o.w - 8; k += 12) for (let j = 0; j < 2; j++) { gg.beginPath(); const bx = x + 6 + k, by = y + 6 + j * ((o.h - 12) / 2); gg.moveTo(bx, by); gg.lineTo(bx + 5, by + 4); gg.lineTo(bx, by + 8); gg.lineTo(bx - 5, by + 4); gg.fill(); } }
          for (let k = 0; k < o.w; k += 8) { gg.fillStyle = (k / 8) % 2 ? "#e8e4d8" : "#c0281e"; gg.fillRect(x + k, y + o.h, Math.min(8, o.w - k), z * 0.6); }
          for (let k = 4; k < o.w; k += 7) { gg.fillStyle = "#ffe08a"; circ(gg, x + k, y + o.h + 1, 1.3); gg.fill(); }
          void v; break;
        }
        case "bierbank": {
          // Bierzeltgarnitur: Tisch mit zwei Bänken, Maßkrüge drauf
          const hz = o.vert, L2 = hz ? o.h : o.w, S2 = hz ? o.w : o.h;
          gg.save(); gg.translate(x, y); if (hz) { gg.translate(o.w, 0); gg.rotate(Math.PI / 2); }
          gg.fillStyle = "#8a6238"; gg.fillRect(0, 0, L2, 7); gg.fillRect(0, S2 - 7, L2, 7);
          gg.fillStyle = vol(gg, L2 / 2, S2 / 2, L2 * 0.5, "#c89a62", 0.12, -0.2); gg.fillRect(0, 10, L2, S2 - 20);
          gg.strokeStyle = "rgba(60,40,20,0.35)"; gg.lineWidth = 0.8; for (let k = 13; k < S2 - 10; k += 4) { gg.beginPath(); gg.moveTo(1, k); gg.lineTo(L2 - 1, k); gg.stroke(); }
          for (let k = 12; k < L2 - 6; k += 22) { const my = S2 / 2 + (R() - 0.5) * 6; gg.fillStyle = "#f2c94a"; circ(gg, k, my, 4.2); gg.fill(); gg.fillStyle = "#fffaf0"; circ(gg, k, my, 2.6); gg.fill(); }
          gg.restore(); break;
        }
        case "fass": {
          const pos = [[0.3, 0.32], [0.72, 0.3], [0.5, 0.72]];
          for (const [px, py] of pos) {
            const bx = x + o.w * px, by = y + o.h * py, br = Math.min(o.w, o.h) * 0.27;
            gg.fillStyle = vol(gg, bx, by, br, "#8a5a2c"); circ(gg, bx, by, br); gg.fill();
            gg.strokeStyle = "#3a3a3e"; gg.lineWidth = 1.8; circ(gg, bx, by, br * 0.92); gg.stroke(); circ(gg, bx, by, br * 0.55); gg.stroke();
            gg.fillStyle = o.fest === "wein" ? "#7a1830" : "#5a3a1a"; circ(gg, bx, by, br * 0.18); gg.fill();
          }
          if (o.fest === "wein") { gg.fillStyle = "rgba(110,20,40,0.55)"; ell(gg, x + o.w * 0.55, y + o.h * 0.95, o.w * 0.22, 4); gg.fill(); } // Trollinger tropft
          break;
        }
        case "maibaum": {
          const cx = x + o.w / 2, cy = y + o.h / 2;
          gg.fillStyle = "#2f6a2a"; circ(gg, cx, cy, o.w * 0.5); gg.fill(); // Kranz
          gg.strokeStyle = "#4a9a3a"; gg.lineWidth = 2; circ(gg, cx, cy, o.w * 0.42); gg.stroke();
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; gg.strokeStyle = k % 2 ? "#3a7fd0" : "#f4f4f0"; gg.lineWidth = 2; gg.beginPath(); gg.moveTo(cx, cy); gg.lineTo(cx + Math.cos(a) * o.w * 0.7, cy + Math.sin(a) * o.w * 0.7); gg.stroke(); }
          gg.fillStyle = "#f4f4f0"; circ(gg, cx, cy, o.w * 0.2); gg.fill(); gg.fillStyle = "#3a7fd0"; circ(gg, cx, cy, o.w * 0.1); gg.fill();
          break;
        }
        case "brunnen": {
          const cx = x + o.w / 2, cy = y + o.h / 2, r0 = Math.min(o.w, o.h) / 2 - 1;
          gg.fillStyle = vol(gg, cx, cy, r0, "#8a847a"); circ(gg, cx, cy, r0); gg.fill();
          const gr = gg.createRadialGradient(cx, cy, 0, cx, cy, r0 * 0.8); gr.addColorStop(0, "#5fa8c8"); gr.addColorStop(1, "#1e4a5e");
          gg.fillStyle = gr; circ(gg, cx, cy, r0 * 0.8); gg.fill();
          gg.strokeStyle = "rgba(220,240,255,0.5)"; gg.lineWidth = 1; for (const rk of [0.35, 0.55]) { circ(gg, cx, cy, r0 * rk); gg.stroke(); }
          gg.fillStyle = vol(gg, cx, cy, r0 * 0.2, "#a49e94"); circ(gg, cx, cy, r0 * 0.2); gg.fill();
          break;
        }
        case "boeller": {
          box3d(gg, x, y, o.w, o.h, z, "#c0281e", "#8a1a14", "#6a120e");
          gg.fillStyle = "#ffd23a"; for (let k = 0; k < 5; k++) { const sx = x + 5 + R() * (o.w - 10), sy = y + 4 + R() * (o.h - 8); gg.beginPath(); for (let j = 0; j < 10; j++) { const a = (j / 10) * TAU - Math.PI / 2, rr2 = j % 2 ? 1.6 : 4; gg.lineTo(sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2); } gg.fill(); }
          gg.strokeStyle = "#222"; gg.lineWidth = 1.4; for (let k = 0; k < 3; k++) { gg.beginPath(); gg.moveTo(x + 8 + k * 10, y + 4); gg.quadraticCurveTo(x + 12 + k * 10, y - 4, x + 16 + k * 10, y + 2); gg.stroke(); }
          break;
        }
        case "rebstock": {
          // Rebzeile von oben: Pfähle, Drahtrahmen, Laub und blaue Trauben (Trollinger)
          const v = o.vert, L2 = v ? o.h : o.w;
          gg.fillStyle = "rgba(60,40,20,0.6)"; gg.fillRect(x, y + o.h - 2, o.w, z * 0.3);
          for (let k = 0; k < L2; k += 9) {
            const px = v ? x + o.w / 2 : x + k + 4, py = v ? y + k + 4 : y + o.h / 2;
            gg.fillStyle = mix("#3a7a2a", (R() - 0.5) * 0.3); circ(gg, px + (R() - 0.5) * 4, py + (R() - 0.5) * 4, 6 + R() * 3); gg.fill();
            gg.fillStyle = mix("#2a5a1e", (R() - 0.5) * 0.2); circ(gg, px + (R() - 0.5) * 6, py + (R() - 0.5) * 6, 4 + R() * 2); gg.fill();
            if (R() < 0.6) { gg.fillStyle = "#3a1a4a"; for (let j = 0; j < 4; j++) { circ(gg, px + (R() - 0.5) * 6, py + (R() - 0.5) * 6, 1.6); gg.fill(); } }
          }
          gg.fillStyle = "#6a4a2a"; for (let k = 2; k < L2; k += 30) { if (v) gg.fillRect(x + o.w / 2 - 1.5, y + k, 3, 3); else gg.fillRect(x + k, y + o.h / 2 - 1.5, 3, 3); }
          break;
        }
        case "glascontainer": {
          // Altglascontainer: grün, drei Einwurflöcher (Weiß, Braun, Grün)
          const v = o.vert, L2 = v ? o.h : o.w;
          box3d(gg, x, y, o.w, o.h, z, "#2f6a3a", "#1f4a28", "#173a1e");
          gg.fillStyle = "rgba(255,255,255,0.12)"; gg.fillRect(x + 2, y + 2, o.w - 4, 3);
          ["#e8f0f0", "#8a5a2a", "#3a8a4a"].forEach((col, i) => {
            const cx = v ? x + o.w / 2 : x + (L2 / 3) * (i + 0.5), cy = v ? y + (L2 / 3) * (i + 0.5) : y + o.h / 2;
            gg.fillStyle = "#0e1a10"; circ(gg, cx, cy, 6); gg.fill(); gg.strokeStyle = col; gg.lineWidth = 2.5; circ(gg, cx, cy, 7.5); gg.stroke();
          });
          gg.fillStyle = "#e8e8e0"; gg.fillRect(x + 4, y + o.h + 4, o.w - 8, 3);
          break;
        }
        case "dixi": {
          // Toilettenhäuschen: blaue Kabine, weißes Dach mit Lüfter
          box3d(gg, x, y, o.w, o.h, z, "#e8e8e0", "#2a5aa8", "#1a3a78");
          gg.fillStyle = "#2a5aa8"; gg.fillRect(x + 3, y + 3, o.w - 6, 4);
          gg.fillStyle = "#9aa3ad"; circ(gg, x + o.w * 0.7, y + o.h * 0.4, 5); gg.fill();
          gg.fillStyle = "#1a3a78"; gg.fillRect(x + o.w * 0.25, y + o.h + 3, o.w * 0.5, z - 5);
          gg.fillStyle = "#e8e8e0"; gg.beginPath(); gg.arc(x + o.w / 2, y + o.h + 8, 2.5, 0.6, Math.PI * 1.6); gg.fill();
          gg.fillStyle = "#c81e1e"; gg.fillRect(x + o.w * 0.62, y + o.h + z * 0.5, 4, 3);
          break;
        }
        case "telefonzelle": {
          // Telefonzelle: gelbes Dach, Glas ringsum, Leuchtschild
          box3d(gg, x, y, o.w, o.h, z, "#f2c21a", "#5a7a8a", "#a88a10");
          gg.fillStyle = "rgba(170,220,240,0.55)"; gg.fillRect(x + 4, y + o.h + 3, o.w - 8, z - 7);
          gg.strokeStyle = "#f2c21a"; gg.lineWidth = 2; gg.beginPath(); gg.moveTo(x + o.w / 2, y + o.h + 2); gg.lineTo(x + o.w / 2, y + o.h + z - 3); gg.stroke();
          gg.fillStyle = "#fff6c0"; gg.fillRect(x + 4, y + o.h / 2 - 3, o.w - 8, 6);
          gg.fillStyle = "#1a1a1a"; gg.fillRect(x + 7, y + o.h / 2 - 1, o.w - 14, 2);
          break;
        }
        case "weihnachtsbaum": {
          // Tannenbaum von oben: Zweig-Sterne in Lagen, Kugeln, Lichter, Stern an der Spitze
          const cx = x + o.w / 2, cy = y + o.h / 2;
          for (let k = 0; k < 4; k++) {
            const rr2 = o.w / 2 - k * 5, n = 9 - k;
            gg.fillStyle = mix("#1e5a2a", k * 0.06);
            gg.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU + k * 0.4, q = i % 2 ? rr2 : rr2 * 0.7; gg.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } gg.closePath(); gg.fill();
          }
          for (let i = 0; i < 9; i++) { const a = R() * TAU, q = 5 + R() * (o.w / 2 - 9); gg.fillStyle = ["#d8202a", "#f2c21a", "#3a7fd0", "#e8e8e0"][i % 4]; circ(gg, cx + Math.cos(a) * q, cy + Math.sin(a) * q, 2.6); gg.fill(); }
          for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU * 2, q = 4 + (i / 14) * (o.w / 2 - 6); gg.fillStyle = "#ffe8a0"; circ(gg, cx + Math.cos(a) * q, cy + Math.sin(a) * q, 1.2); gg.fill(); }
          gg.fillStyle = "#ffd84a"; gg.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, q = i % 2 ? 2.5 : 6; gg.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } gg.closePath(); gg.fill();
          break;
        }
        case "strandkorb": {
          // Strandkorb: Korbgeflecht, Haube mit blau-weißen Streifen
          box3d(gg, x, y, o.w, o.h, z, "#c8a46a", "#a07a44", "#7a5a30");
          gg.strokeStyle = "rgba(90,60,30,0.45)"; gg.lineWidth = 1; for (let k = 3; k < o.w; k += 4) { gg.beginPath(); gg.moveTo(x + k, y + o.h); gg.lineTo(x + k, y + o.h + z); gg.stroke(); }
          for (let k = 0; k < o.w - 4; k += 6) { gg.fillStyle = (k / 6) % 2 ? "#e8eef4" : "#2a5aa8"; gg.fillRect(x + 2 + k, y + 2, Math.min(6, o.w - 4 - k), o.h * 0.55); }
          gg.fillStyle = "#e8e0c8"; gg.fillRect(x + 4, y + o.h * 0.62, o.w - 8, o.h * 0.3);
          break;
        }
        case "automat": {
          box3d(gg, x, y, o.w, o.h, z, "#ec0016", "#a8000f", "#80000c");
          gg.fillStyle = "#1a2a3a"; gg.fillRect(x + 4, y + o.h + 3, o.w - 8, z * 0.45);
          gg.fillStyle = "#7fd0ff"; gg.fillRect(x + 6, y + o.h + 4, o.w - 12, z * 0.25);
          gg.fillStyle = "#fff"; gg.fillRect(x + 4, y + 4, o.w - 8, 3);
          break;
        }
        case "sandsack": {
          // v3.0 Sandsack-Stellung: Vorderseite mit Sackenden, oben zwei Reihen praller Säcke
          const v = o.vert, L2 = v ? o.h : o.w, D2 = v ? o.w : o.h;
          gg.fillStyle = "#5e5338"; gg.fillRect(x, y + o.h - 1, o.w, z + 1);
          const nf = Math.max(2, Math.round(o.w / 20)), fw = o.w / nf;
          for (let row = 0; row < 2; row++) for (let i = 0; i < nf; i++) {
            const fx = x + i * fw + (row ? fw / 2 : 0), fy = y + o.h + row * (z / 2);
            if (fx + fw > x + o.w + 1) continue;
            gg.fillStyle = mix("#8a7a54", (R() - 0.5) * 0.2); rr(gg, fx + 0.8, fy + 0.5, fw - 1.6, z / 2 - 0.6, 3); gg.fill();
            gg.fillStyle = "rgba(255,240,200,0.14)"; gg.fillRect(fx + 2, fy + 1.2, fw - 4, 1.2);
          }
          gg.save(); if (v) { gg.translate(x + o.w, y); gg.rotate(Math.PI / 2); } else gg.translate(x, y);
          const n = Math.max(3, Math.round(L2 / 22)), sl = L2 / n;
          for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
            const sx = i * sl + (row ? sl * 0.25 : 0), sy = row * (D2 / 2), sw = Math.min(sl, L2 - sx) - 1, sh = D2 / 2 - 0.8;
            if (sw < 6) continue;
            const col = ["#a2916a", "#988760", "#ad9c74", "#93835c"][Math.floor(R() * 4)];
            gg.fillStyle = vol(gg, sx + sw / 2, sy + sh / 2, Math.max(sw, sh) * 0.7, col, 0.16, -0.3); rr(gg, sx + 0.5, sy + 0.4, sw, sh, Math.min(5, sh / 2)); gg.fill();
            gg.strokeStyle = "rgba(60,48,26,0.55)"; gg.lineWidth = 0.7; gg.beginPath(); gg.moveTo(sx + sw * 0.15, sy + sh / 2); gg.lineTo(sx + sw * 0.85, sy + sh / 2); gg.stroke();
            gg.fillStyle = "rgba(60,48,26,0.6)"; gg.fillRect(sx + sw - 3, sy + sh / 2 - 1.5, 2, 3); // abgebundenes Ende
          }
          gg.fillStyle = "rgba(120,100,60,0.35)"; for (let i = 0; i < 5; i++) { blob(gg, R() * L2, R() * D2, 1.5 + R() * 2, R); gg.fill(); } // ausgelaufener Sand
          gg.restore();
          break;
        }
        case "bus": {
          // v3.0 Buswrack von oben: Dach mit Luken, Klimaanlage, Brandstelle, Fensterband, Zielanzeige
          const v = o.vert, L2 = v ? o.h : o.w, D2 = v ? o.w : o.h;
          const body = R() < 0.5 ? "#ddd3b4" : "#d4d8d0";
          box3d(gg, x, y, o.w, o.h, z, body, mix(body, -0.3), mix(body, -0.5));
          gg.fillStyle = "#1b2733"; gg.fillRect(x + 2, y + o.h + z * 0.15, o.w - 4, z * 0.42);
          gg.fillStyle = "#b0201a"; gg.fillRect(x, y + o.h + z * 0.68, o.w, 2.5);
          gg.save(); if (v) { gg.translate(x + o.w, y); gg.rotate(Math.PI / 2); } else gg.translate(x, y);
          gg.fillStyle = vol(gg, L2 / 2, D2 / 2, L2 * 0.6, "#c8cac4", 0.12, -0.22); rr(gg, 1, 1, L2 - 2, D2 - 2, 6); gg.fill();
          gg.fillStyle = "#1b2733"; gg.fillRect(4, 1, L2 - 14, 3); gg.fillRect(4, D2 - 4, L2 - 14, 3); // Fensterband seitlich
          for (let k = 16; k < L2 - 12; k += 24) { gg.fillStyle = mix(body, -0.1); gg.fillRect(k, 1, 2.4, 3); gg.fillRect(k, D2 - 4, 2.4, 3); }
          const gr = gg.createLinearGradient(L2 - 10, 0, L2, 0); gr.addColorStop(0, "#22323f"); gr.addColorStop(1, "#4a6478"); gg.fillStyle = gr; rr(gg, L2 - 10, 3, 8, D2 - 6, 3); gg.fill(); // Frontscheibe
          gg.fillStyle = "#ffa21a"; gg.fillRect(L2 - 12, D2 * 0.25, 1.6, D2 * 0.5); // Zielanzeige
          gg.fillStyle = "#9aa0a4"; gg.fillRect(L2 * 0.22, D2 * 0.2, L2 * 0.2, D2 * 0.6); // Klimaanlage
          gg.strokeStyle = "rgba(0,0,0,0.35)"; gg.lineWidth = 0.8; for (let k = 3; k < L2 * 0.2; k += 3) { gg.beginPath(); gg.moveTo(L2 * 0.22 + k, D2 * 0.22); gg.lineTo(L2 * 0.22 + k, D2 * 0.78); gg.stroke(); }
          for (const hx of [L2 * 0.55, L2 * 0.78]) { gg.fillStyle = "#a8aaa4"; gg.fillRect(hx, D2 * 0.32, 12, D2 * 0.36); gg.strokeStyle = "#7a7c78"; gg.strokeRect(hx + 0.5, D2 * 0.32 + 0.5, 11, D2 * 0.36 - 1); }
          const bx = L2 * (0.45 + R() * 0.25), by = D2 * 0.5, br = D2 * 0.55; const bg = gg.createRadialGradient(bx, by, 0, bx, by, br); bg.addColorStop(0, "rgba(16,10,6,0.95)"); bg.addColorStop(0.6, "rgba(40,24,12,0.6)"); bg.addColorStop(1, "rgba(40,24,12,0)"); gg.fillStyle = bg; gg.beginPath(); gg.ellipse(bx, by, br * 1.4, br * 0.8, 0, 0, TAU); gg.fill(); // Brandstelle
          for (let i = 0; i < 5; i++) { gg.fillStyle = "rgba(110,60,20,0.5)"; blob(gg, R() * L2, R() * D2, 2 + R() * 4, R); gg.fill(); }
          gg.fillStyle = "rgba(100,10,12,0.6)"; blob(gg, L2 * (0.1 + R() * 0.2), D2 * R(), 5, R); gg.fill();
          gg.restore();
          break;
        }
        case "bauzaun": {
          // v3.0 Bauzaun: Gitterfelder mit Rahmen, Kunststofffüße am Boden, Warnbanner
          const v = o.vert, gy = y + z;
          if (!v) {
            const top = y + o.h / 2, bot = top + z, n = Math.max(2, Math.round(o.w / 38)), pl = o.w / n;
            gg.strokeStyle = "rgba(190,196,202,0.55)"; gg.lineWidth = 0.6;
            for (let k = x + 3; k < x + o.w; k += 3.2) { gg.beginPath(); gg.moveTo(k, top); gg.lineTo(k, bot); gg.stroke(); }
            for (let k = top + 3; k < bot; k += 3.2) { gg.beginPath(); gg.moveTo(x, k); gg.lineTo(x + o.w, k); gg.stroke(); }
            gg.strokeStyle = "#c4c8cc"; gg.lineWidth = 1.6; gg.strokeRect(x + 0.8, top, o.w - 1.6, z);
            for (let i = 0; i <= n; i++) { const px = x + i * pl; gg.fillStyle = "#c8441a"; gg.fillRect(clamp2(px - 4, x, x + o.w - 8), gy, 8, o.h); gg.fillStyle = "#d8dcde"; gg.fillRect(clamp2(px - 1, x, x + o.w - 2), top, 2, z); }
            const bw = Math.min(o.w * 0.5, 60), bx = x + (o.w - bw) * (0.2 + R() * 0.6);
            for (let k = 0; k < bw; k += 8) { gg.fillStyle = (k / 8) % 2 ? "#f0ece0" : "#c8201a"; gg.fillRect(bx + k, top + z * 0.3, Math.min(8, bw - k), 7); }
          } else {
            const cx = x + o.w / 2, n = Math.max(2, Math.round(o.h / 38)), pl = o.h / n;
            gg.fillStyle = "rgba(190,196,202,0.45)"; gg.fillRect(cx - 2, y, 4, o.h + z);
            gg.strokeStyle = "#c4c8cc"; gg.lineWidth = 1.4; gg.beginPath(); gg.moveTo(cx - 2, y); gg.lineTo(cx - 2, y + o.h + z); gg.moveTo(cx + 2, y); gg.lineTo(cx + 2, y + o.h + z); gg.stroke();
            for (let i = 0; i <= n; i++) { const py = y + i * pl; gg.fillStyle = "#c8441a"; gg.fillRect(x, clamp2(py + z - 3, y, y + o.h + z - 6), o.w, 6); gg.fillStyle = "#d8dcde"; gg.fillRect(cx - 3, clamp2(py - 1, y, y + o.h + z - 2), 6, 2); }
          }
          break;
        }
        case "feuertonne": {
          // v3.0 Feuertonne: rostige Trommel, glühende Löcher, Glut oben (Flammen sind Partikel)
          const cx = x + o.w / 2, r0 = o.w / 2, cy = y + o.h / 2;
          gg.fillStyle = "#4a2e1c"; gg.fillRect(x, cy, o.w, z); gg.beginPath(); gg.ellipse(cx, cy + z, r0, r0 * 0.45, 0, 0, Math.PI); gg.fill();
          const sg = gg.createLinearGradient(x, 0, x + o.w, 0); sg.addColorStop(0, "rgba(0,0,0,0.35)"); sg.addColorStop(0.4, "rgba(255,200,150,0.12)"); sg.addColorStop(1, "rgba(0,0,0,0.45)"); gg.fillStyle = sg; gg.fillRect(x, cy, o.w, z);
          gg.fillStyle = "#2e1e12"; for (const ry of [0.3, 0.7]) gg.fillRect(x, cy + z * ry, o.w, 1.4);
          for (let i = 0; i < 4; i++) { gg.fillStyle = i % 2 ? "#ffb040" : "#ff7a1a"; circ(gg, x + 5 + i * (o.w - 10) / 3, cy + z * (0.45 + (i % 2) * 0.25), 1.4); gg.fill(); }
          gg.fillStyle = "#5a3a24"; circ(gg, cx, cy, r0); gg.fill();
          const eg = gg.createRadialGradient(cx, cy, 0, cx, cy, r0 * 0.85); eg.addColorStop(0, "#fff0b0"); eg.addColorStop(0.35, "#ffa030"); eg.addColorStop(0.8, "#a8300c"); eg.addColorStop(1, "#3a1608"); gg.fillStyle = eg; circ(gg, cx, cy, r0 * 0.85); gg.fill();
          for (let i = 0; i < 5; i++) { gg.fillStyle = "rgba(40,16,6,0.7)"; circ(gg, cx + (R() - 0.5) * r0, cy + (R() - 0.5) * r0, 1.6 + R() * 1.4); gg.fill(); }
          break;
        }
        case "container": {
          // v3.0 Schiffscontainer: Wellblech-Dach quer gerippt, Eckbeschläge, Rostläufer, Kennung
          const v = o.vert, L2 = v ? o.h : o.w, D2 = v ? o.w : o.h;
          const col = ["#a8321e", "#2a5a8a", "#c8861a", "#3a6a3a", "#6a6e72"][Math.floor(R() * 5)];
          box3d(gg, x, y, o.w, o.h, z, col, mix(col, -0.32), mix(col, -0.5));
          for (let k = x + 2; k < x + o.w - 1; k += 4) { gg.fillStyle = "rgba(0,0,0,0.22)"; gg.fillRect(k + 2, y + o.h, 1.5, z); }
          gg.save(); if (v) { gg.translate(x + o.w, y); gg.rotate(Math.PI / 2); } else gg.translate(x, y);
          for (let k = 3; k < L2 - 2; k += 4) { gg.fillStyle = "rgba(255,255,255,0.12)"; gg.fillRect(k, 2, 1.2, D2 - 4); gg.fillStyle = "rgba(0,0,0,0.2)"; gg.fillRect(k + 2, 2, 1.2, D2 - 4); }
          gg.fillStyle = "#222426"; for (const [cx, cy] of [[0, 0], [L2 - 5, 0], [0, D2 - 5], [L2 - 5, D2 - 5]]) gg.fillRect(cx, cy, 5, 5);
          for (let i = 0; i < 6; i++) { gg.fillStyle = "rgba(120,60,20,0.45)"; blob(gg, R() * L2, R() * D2, 2 + R() * 5, R); gg.fill(); }
          gg.fillStyle = "rgba(255,255,255,0.75)"; gg.font = "bold 7px monospace"; gg.fillText("OGXU 204811", 8, D2 / 2 + 2.5);
          gg.restore();
          break;
        }
        default:
          box3d(gg, x, y, o.w, o.h, z, "#555", "#333", "#222");
      }
    };
    outlined(fn, 0.8, "rgba(0,0,0,0.75)")(g, W2, H2);
    return { c, w: W2, h: H2, ox: -pad, oy: -pad - z };
  }

  // ------------------------------------------------------------------
  // Boden & Wände (je Kapitel-Thema)
  // ------------------------------------------------------------------
  const THEMES = {
    street: { wall: "#3a2c28", wallTop: "#5a463e", dark: [10, 14, 26] },
    hospital: { wall: "#6d877c", wallTop: "#b8c6be", dark: [10, 22, 18] },
    lab: { wall: "#2a3136", wallTop: "#48525a", dark: [6, 16, 10] },
    markt: { wall: "#4a3020", wallTop: "#e2d6bc", dark: [16, 12, 10] },
  };
  // Kopfsteinpflaster-Kachel (einmal gezeichnet, dann gekachelt – schneller als tausende Steine je Raum)
  const cobbleCache = {};
  function cobbleTile(res, gloss) {
    const key = `${res}|${gloss ? 1 : 0}`;
    if (cobbleCache[key]) return cobbleCache[key];
    const TW = 150, TH = 110, { c, g } = canvas(TW, TH, res), R = rng(77 + (gloss ? 1 : 0) * 0);
    g.fillStyle = gloss ? "#1c1c1c" : "#34302c"; g.fillRect(0, 0, TW, TH);
    const sw = 15, sh = 11;
    for (let y = -sh, row = 0; y < TH + sh; y += sh, row++) {
      for (let x = -sw - ((row % 2) * sw) / 2; x < TW + sw; x += sw) {
        const v = Math.floor(R() * 28) - 14, w2 = sw - 2 - R() * 1.6, h2 = sh - 2 - R() * 1.3, warm = R() < 0.28;
        if (gloss) { g.fillStyle = `rgb(${66 + v * 2},${66 + v * 2},${66 + v * 2})`; rr(g, x + 1, y + 1, w2, h2, 3.5); g.fill(); continue; }
        g.fillStyle = warm ? `rgb(${96 + v},${84 + v},${70 + v})` : `rgb(${86 + v},${86 + v},${88 + v})`;
        rr(g, x + 1, y + 1, w2, h2, 3.5); g.fill();
        g.fillStyle = "rgba(255,255,255,0.11)"; rr(g, x + 2, y + 1.6, w2 - 2.5, 2, 1.2); g.fill();
        g.fillStyle = "rgba(0,0,0,0.28)"; rr(g, x + 1.5, y + h2 - 0.8, w2 - 1, 1.8, 1); g.fill();
      }
    }
    return (cobbleCache[key] = c);
  }

  function noise(g, x, y, w, h, n, colors, R, size = 2) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[Math.floor(R() * colors.length)];
      g.fillRect(x + R() * w, y + R() * h, size * (0.5 + R()), size * (0.5 + R()));
    }
  }

  function floor(theme, D, seed, opts = {}) {
    const { W, H, L, T, R: RR, B } = D;
    const res = Math.min(RES, 2);
    const { c, g } = canvas(W, H, res);
    // Glanzkarte (für 3D: nasse/polierte Stellen glänzen im Licht), halbe Auflösung reicht
    const { c: gc, g: q } = canvas(W, H, 0.5);
    const R = rng(seed);
    const th = THEMES[theme];
    const aw = RR - L, ah = B - T;
    const gray = (v) => `rgb(${v},${v},${v})`;
    g.fillStyle = "#0d1210"; g.fillRect(0, 0, W, H);
    q.fillStyle = "#000"; q.fillRect(0, 0, W, H);
    // Kante mit Licht oben/links und Schatten unten/rechts → wirkt in 3D erhaben
    const bevel = (x, y, w, h, hi = 0.12, lo = 0.4, s = 1.5) => {
      g.fillStyle = `rgba(255,255,255,${hi})`; g.fillRect(x, y, w, s); g.fillRect(x, y, s, h);
      g.fillStyle = `rgba(0,0,0,${lo})`; g.fillRect(x, y + h - s, w, s); g.fillRect(x + w - s, y, s, h);
    };
    const shard = (x, y) => { g.fillStyle = "rgba(220,240,255,0.8)"; g.fillRect(x, y, 1.2, 1.2); q.fillStyle = "#fff"; q.fillRect(x - 1, y - 1, 3, 3); };

    if (theme === "street") {
      g.fillStyle = "#2a2d31"; g.fillRect(L, T, aw, ah);
      q.fillStyle = gray(34); q.fillRect(L, T, aw, ah);
      // Flickstellen mit Nähten
      for (let i = 0; i < 7; i++) {
        const x = L + R() * aw * 0.8, y = T + R() * ah * 0.85, w = 40 + R() * 120, h = 30 + R() * 90;
        g.fillStyle = `rgba(${R() > 0.5 ? "62,64,68" : "18,20,24"},0.4)`; g.fillRect(x, y, w, h);
        g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 1.4; g.strokeRect(x, y, w, h);
        q.fillStyle = gray(20); q.fillRect(x, y, w, h);
      }
      // Asphalt-Körnung
      noise(g, L, T, aw, ah, 9000, ["rgba(255,255,255,0.06)", "rgba(0,0,0,0.22)", "rgba(140,140,140,0.08)", "rgba(90,80,70,0.1)"], R, 1.1);
      noise(g, L, T, aw, ah, 2500, ["rgba(0,0,0,0.12)", "rgba(255,255,255,0.03)"], R, 3);
      // Reifenspuren
      for (let i = 0; i < 2; i++) {
        let x = L + 80 + R() * (aw - 160);
        g.strokeStyle = "rgba(8,8,10,0.28)"; g.lineWidth = 7; g.lineCap = "round";
        for (const off of [0, 30]) {
          g.beginPath(); g.moveTo(x + off, T + 20);
          g.bezierCurveTo(x + off + 60 * (R() - 0.5), T + ah * 0.3, x + off + 90 * (R() - 0.5), T + ah * 0.6, x + off + 40 * (R() - 0.5), B - 140);
          g.stroke();
        }
        x += 0;
      }
      // Bordsteine mit Rinnstein und Gullys
      for (const sx of [L, RR - 26]) {
        g.fillStyle = "#4a4a47"; g.fillRect(sx, T, 26, ah);
        for (let y = T; y < B; y += 26) { bevel(sx, y, 26, 26, 0.14, 0.45); g.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "0,0,0"},0.05)`; g.fillRect(sx + 2, y + 2, 22, 22); }
        g.fillStyle = "#6a6a65"; g.fillRect(sx === L ? sx + 24 : sx, T, 2, ah);
        q.fillStyle = gray(30); q.fillRect(sx, T, 26, ah);
        const gx = sx === L ? sx + 26 : sx - 12;
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(gx, T, 12, ah);
        q.fillStyle = gray(140); q.fillRect(gx, T, 12, ah);
        for (let k = 0; k < 2; k++) {
          const gy = T + 140 + k * 360 + R() * 80;
          g.fillStyle = "#121416"; g.fillRect(gx - 2, gy, 16, 34);
          g.fillStyle = "#3b3f43"; for (let yy = gy + 3; yy < gy + 32; yy += 5) g.fillRect(gx, yy, 12, 2);
          bevel(gx - 2, gy, 16, 34, 0.2, 0.5);
        }
      }
      // Mittellinie (abgefahren) – oder Straßenbahngleis mit glänzenden Schienen
      if (opts.tram) {
        g.fillStyle = "rgba(70,72,74,0.55)"; g.fillRect(W / 2 - 34, T, 68, ah);
        for (let y = T + 4; y < B; y += 22) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(W / 2 - 32, y, 64, 3); }
        for (const rx of [W / 2 - 20, W / 2 + 16]) {
          g.fillStyle = "#151617"; g.fillRect(rx, T, 4, ah);
          g.fillStyle = "#9aa0a6"; g.fillRect(rx + 4, T, 2.5, ah);
          g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(rx + 4.5, T, 1, ah);
          q.fillStyle = gray(220); q.fillRect(rx + 4, T, 2.5, ah);
        }
      } else for (let y = T + 10; y < B - 140; y += 46) {
        g.fillStyle = "rgba(230,190,40,0.55)"; g.fillRect(W / 2 - 3, y, 6, 26);
        q.fillStyle = gray(110); q.fillRect(W / 2 - 3, y, 6, 26);
      }
      for (let x = L + 40; x < RR - 50; x += 30) {
        g.fillStyle = "rgba(225,225,215,0.5)"; g.fillRect(x, B - 120, 16, 70);
        q.fillStyle = gray(110); q.fillRect(x, B - 120, 16, 70);
      }
      noise(g, L, B - 125, aw, 80, 900, ["rgba(42,45,49,0.9)"], R, 2.2);
      noise(g, W / 2 - 4, T, 8, ah, 300, ["rgba(42,45,49,0.85)"], R, 2);
      // Gullydeckel mit Rand
      const mx = L + 70 + R() * (aw - 140), my = T + 120 + R() * (ah - 300);
      g.fillStyle = "#3a3d40"; circ(g, mx, my, 18); g.fill();
      g.fillStyle = "#1c1e20"; circ(g, mx, my, 15); g.fill();
      g.strokeStyle = "#3a3d40"; g.lineWidth = 1.2; for (let i = -10; i <= 10; i += 5) { g.beginPath(); g.moveTo(mx - 12, my + i); g.lineTo(mx + 12, my + i); g.stroke(); }
      g.strokeStyle = "rgba(255,255,255,0.15)"; g.beginPath(); g.arc(mx, my, 17, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
      q.fillStyle = gray(150); circ(q, mx, my, 16); q.fill();
      // Schlaglöcher mit Wasser
      for (let i = 0; i < 3; i++) {
        const px = L + 50 + R() * (aw - 100), py = T + 60 + R() * (ah - 260), pr = 10 + R() * 12;
        g.fillStyle = "rgba(0,0,0,0.55)"; blob(g, px, py, pr, R, 10); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1.5; g.stroke();
        noise(g, px - pr, py - pr, pr * 2, pr * 2, 40, ["rgba(90,90,90,0.5)", "rgba(20,20,20,0.6)"], R, 1.6);
        g.fillStyle = "rgba(30,48,66,0.55)"; ell(g, px, py, pr * 0.6, pr * 0.45, R()); g.fill();
        q.fillStyle = "#fff"; ell(q, px, py, pr * 0.7, pr * 0.55, 0); q.fill();
      }
      // Pfützen (spiegeln das Licht)
      for (let i = 0; i < 6; i++) {
        const px = L + 40 + R() * (aw - 80), py = T + 40 + R() * (ah - 80), rx = 18 + R() * 34, ry = 8 + R() * 16, rot = R();
        g.fillStyle = "rgba(10,16,24,0.62)"; ell(g, px, py, rx, ry, rot); g.fill();
        g.strokeStyle = "rgba(160,190,220,0.2)"; g.lineWidth = 1; g.stroke();
        g.fillStyle = "rgba(150,180,220,0.12)"; ell(g, px - rx * 0.3, py - ry * 0.3, rx * 0.35, ry * 0.25, rot); g.fill();
        q.fillStyle = "#fff"; ell(q, px, py, rx, ry, rot); q.fill();
      }
      // Ölflecken mit Schimmer
      for (let i = 0; i < 4; i++) {
        const ox = L + R() * aw, oy = T + R() * ah, orr = 8 + R() * 14;
        g.fillStyle = "rgba(0,0,0,0.4)"; blob(g, ox, oy, orr, R, 9); g.fill();
        const gr = g.createRadialGradient(ox, oy, 0, ox, oy, orr);
        gr.addColorStop(0.5, "rgba(80,40,120,0)"); gr.addColorStop(0.75, "rgba(60,120,140,0.18)"); gr.addColorStop(1, "rgba(140,90,40,0)");
        g.fillStyle = gr; circ(g, ox, oy, orr); g.fill();
        q.fillStyle = gray(190); circ(q, ox, oy, orr * 0.8); q.fill();
      }
      for (let i = 0; i < 50; i++) { g.fillStyle = ["#7a4a1e", "#9a6a2a", "#5a3a1a"][i % 3]; ell(g, L + R() * aw, T + R() * ah, 2.5, 1.5, R() * 3); g.fill(); }
      for (let i = 0; i < 10; i++) { g.save(); g.translate(L + R() * aw, T + R() * ah); g.rotate(R() * 3); g.fillStyle = "rgba(220,215,200,0.55)"; g.fillRect(-4, -3, 8, 6); g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(-4, 1, 8, 2); g.restore(); }
      for (let i = 0; i < 60; i++) shard(L + R() * aw, T + R() * ah);
    } else if (theme === "hospital") {
      g.fillStyle = "#3e4a45"; g.fillRect(L, T, aw, ah);
      q.fillStyle = gray(15); q.fillRect(L, T, aw, ah);
      const ts = 36;
      for (let y = T; y < B; y += ts) for (let x = L; x < RR; x += ts) {
        if (R() < 0.025) { // fehlende Fliese: rohen Estrich zeigen
          g.fillStyle = "#3a3632"; g.fillRect(x + 1, y + 1, ts - 2, ts - 2);
          noise(g, x + 1, y + 1, ts - 2, ts - 2, 30, ["rgba(0,0,0,0.3)", "rgba(255,255,255,0.06)"], R, 2);
          bevel(x + 1, y + 1, ts - 2, ts - 2, 0, 0.5, 2);
          continue;
        }
        const v = Math.floor(R() * 12) - 6;
        g.fillStyle = `rgb(${112 + v},${128 + v},${122 + v})`; g.fillRect(x + 1, y + 1, ts - 2, ts - 2);
        bevel(x + 1, y + 1, ts - 2, ts - 2, 0.16, 0.22, 1.5);
        q.fillStyle = gray(130 + v * 4); q.fillRect(x + 2, y + 2, ts - 4, ts - 4);
        if (R() < 0.08) { g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + R() * ts, y); g.lineTo(x + R() * ts, y + ts); g.stroke(); }
      }
      // Leitlinien
      g.fillStyle = "rgba(180,50,50,0.55)"; g.fillRect(L + 34, T, 6, ah);
      g.fillStyle = "rgba(50,100,180,0.55)"; g.fillRect(L + 44, T, 6, ah);
      noise(g, L, T, aw, ah, 3000, ["rgba(0,0,0,0.08)", "rgba(255,255,255,0.05)"], R, 1.5);
      // Schmutz an den Wänden
      noise(g, L, T, 50, ah, 500, ["rgba(40,34,20,0.18)"], R, 3); noise(g, RR - 50, T, 50, ah, 500, ["rgba(40,34,20,0.18)"], R, 3);
      // Blutschleifspuren und blutige Fußabdrücke
      for (let i = 0; i < 3; i++) {
        let x = L + 60 + R() * (aw - 120), y = T + 60 + R() * (ah - 200);
        g.strokeStyle = "rgba(110,12,14,0.5)"; g.lineWidth = 6 + R() * 6; g.lineCap = "round";
        q.strokeStyle = "#ddd"; q.lineWidth = g.lineWidth; q.lineCap = "round";
        g.beginPath(); g.moveTo(x, y); q.beginPath(); q.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 60; y += 30 + R() * 40; g.lineTo(x, y); q.lineTo(x, y); }
        g.stroke(); q.stroke();
      }
      for (let i = 0; i < 2; i++) {
        let x = L + 80 + R() * (aw - 160), y = B - 60, a = -Math.PI / 2 + (R() - 0.5) * 0.8;
        for (let k = 0; k < 9; k++) {
          const side = k % 2 ? 1 : -1, fx = x + Math.cos(a + Math.PI / 2) * side * 6, fy = y + Math.sin(a + Math.PI / 2) * side * 6;
          g.fillStyle = `rgba(110,12,14,${0.5 - k * 0.05})`; ell(g, fx, fy, 3, 6, a + Math.PI / 2); g.fill();
          x += Math.cos(a) * 26; y += Math.sin(a) * 26; a += (R() - 0.5) * 0.3;
        }
      }
      for (let i = 0; i < 12; i++) { g.save(); g.translate(L + R() * aw, T + R() * ah); g.rotate(R() * 3); g.fillStyle = "rgba(235,235,225,0.7)"; g.fillRect(-5, -4, 10, 8); g.fillStyle = "rgba(60,60,80,0.4)"; for (let l = -2; l < 3; l += 2) g.fillRect(-4, l, 7, 0.6); g.restore(); }
      for (let i = 0; i < 14; i++) { g.save(); g.translate(L + R() * aw, T + R() * ah); g.rotate(R() * 3); g.fillStyle = ["#e8e8e0", "#d84a4a", "#4a8ad8"][i % 3]; rr(g, -2.5, -1, 5, 2, 1); g.fill(); g.restore(); }
      for (let i = 0; i < 40; i++) shard(L + R() * aw, T + R() * ah);
    } else if (theme === "markt") {
      // Altstadt: Kopfsteinpflaster, Rinne in der Mitte, Gullydeckel, nasse Stellen
      const tile = cobbleTile(res, false), gtile = cobbleTile(0.5, true);
      g.save(); g.beginPath(); g.rect(L, T, aw, ah); g.clip();
      for (let y = T; y < B; y += 110) for (let x = L; x < RR; x += 150) g.drawImage(tile, x, y, 150, 110);
      q.save(); q.beginPath(); q.rect(L, T, aw, ah); q.clip();
      for (let y = T; y < B; y += 110) for (let x = L; x < RR; x += 150) q.drawImage(gtile, x, y, 150, 110);
      q.restore();
      // einzelne Steine dunkler/heller, damit das Muster nicht kachelt
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${R() > 0.5 ? "0,0,0,0.22" : "255,240,220,0.08"})`; rr(g, L + R() * aw, T + R() * ah, 12, 8, 3); g.fill(); }
      // Rinne aus großen Platten
      const gx = (L + RR) / 2 - 9;
      for (let y = T; y < B; y += 20) { g.fillStyle = "#2c2a27"; g.fillRect(gx, y, 18, 20); g.fillStyle = "#5c5853"; rr(g, gx + 1, y + 1, 16, 18, 2); g.fill(); g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(gx + 2, y + 2, 14, 1.5); }
      q.fillStyle = gray(120); q.fillRect(gx, T, 18, ah);
      // Gullydeckel
      for (let i = 0; i < 2; i++) {
        const mx = L + 70 + R() * (aw - 140), my = T + 120 + R() * (ah - 260);
        g.fillStyle = "#1e1d1b"; circ(g, mx, my, 15); g.fill();
        g.strokeStyle = "#4a4743"; g.lineWidth = 2; circ(g, mx, my, 13); g.stroke();
        for (let k = -9; k <= 9; k += 4.5) { g.fillStyle = "#3a3835"; g.fillRect(mx - 10, my + k - 1, 20, 2); }
      }
      // Pfützen
      for (let i = 0; i < 5; i++) {
        const px = L + 40 + R() * (aw - 80), py = T + 60 + R() * (ah - 140), rx = 18 + R() * 26, ry = 9 + R() * 12, rot = R();
        g.fillStyle = "rgba(10,14,20,0.45)"; ell(g, px, py, rx, ry, rot); g.fill();
        q.fillStyle = "#fff"; ell(q, px, py, rx * 0.85, ry * 0.85, rot); q.fill();
      }
      g.restore();
    } else {
      g.fillStyle = "#1f2529"; g.fillRect(L, T, aw, ah);
      q.fillStyle = gray(20); q.fillRect(L, T, aw, ah);
      const ps = 80;
      for (let y = T; y < B; y += ps) for (let x = L; x < RR; x += ps) {
        const grate = R() < 0.18;
        const v = Math.floor(R() * 8);
        g.fillStyle = grate ? "#0c1012" : `rgb(${40 + v},${47 + v},${52 + v})`;
        g.fillRect(x + 1, y + 1, ps - 2, ps - 2);
        if (grate) {
          const gr = g.createRadialGradient(x + ps / 2, y + ps / 2, 4, x + ps / 2, y + ps / 2, ps * 0.6);
          gr.addColorStop(0, "rgba(120,255,80,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr; g.fillRect(x + 1, y + 1, ps - 2, ps - 2);
          for (let k = 6; k < ps; k += 8) { g.fillStyle = "#3a444a"; g.fillRect(x + k, y + 3, 2.4, ps - 6); g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x + k, y + 3, 0.8, ps - 6); }
          bevel(x + 1, y + 1, ps - 2, ps - 2, 0.15, 0.5, 2);
          q.fillStyle = gray(35); q.fillRect(x + 1, y + 1, ps - 2, ps - 2);
        } else {
          bevel(x + 1, y + 1, ps - 2, ps - 2, 0.1, 0.4, 2);
          q.fillStyle = gray(62 + v * 3); q.fillRect(x + 3, y + 3, ps - 6, ps - 6);
          for (const [nx, ny] of [[6, 6], [ps - 6, 6], [6, ps - 6], [ps - 6, ps - 6]]) {
            g.fillStyle = "#1a1e21"; circ(g, x + nx + 0.6, y + ny + 0.6, 2.2); g.fill();
            g.fillStyle = "#7a838a"; circ(g, x + nx, y + ny, 1.8); g.fill();
            g.fillStyle = "rgba(255,255,255,0.5)"; circ(g, x + nx - 0.5, y + ny - 0.5, 0.6); g.fill();
          }
          if (R() < 0.35) { // Riffelblech
            for (let yy = y + 10; yy < y + ps - 8; yy += 7) for (let xx = x + 10 + ((yy - y) % 14 ? 3.5 : 0); xx < x + ps - 10; xx += 7) {
              g.save(); g.translate(xx, yy); g.rotate(((xx + yy) % 14 < 7) ? 0.7 : -0.7);
              g.fillStyle = "rgba(255,255,255,0.13)"; g.fillRect(-2.6, -0.9, 5.2, 0.9); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(-2.6, 0, 5.2, 0.9);
              g.restore();
            }
          }
          for (let k = 0; k < 3; k++) { g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 0.6; g.beginPath(); const sx = x + R() * ps, sy = y + R() * ps; g.moveTo(sx, sy); g.lineTo(sx + (R() - 0.5) * 40, sy + (R() - 0.5) * 40); g.stroke(); }
        }
      }
      // Kabelstränge über den Boden
      for (let i = 0; i < 2; i++) {
        const y0 = T + 100 + R() * (ah - 300);
        g.lineCap = "round";
        for (const [col, w2] of [["#0a0c0e", 7], ["#2a3036", 5], ["rgba(255,255,255,0.15)", 1.2]]) {
          g.strokeStyle = col; g.lineWidth = w2; g.beginPath(); g.moveTo(L, y0);
          g.bezierCurveTo(L + aw * 0.3, y0 + 60 * (R() - 0.5), L + aw * 0.6, y0 + 80 * (R() - 0.5), RR, y0 + 40 * (R() - 0.5)); g.stroke();
        }
      }
      // Warnstreifen am Rand
      g.save(); g.beginPath(); g.rect(L, T, aw, ah); g.rect(L + 14, T + 14, aw - 28, ah - 28); g.clip("evenodd");
      for (let k = -ah; k < aw + ah; k += 18) { g.fillStyle = "#d9b21a"; g.beginPath(); g.moveTo(L + k, T); g.lineTo(L + k + 9, T); g.lineTo(L + k + 9 - ah, B); g.lineTo(L + k - ah, B); g.fill(); }
      g.restore();
      noise(g, L, T, aw, 14, 300, ["rgba(0,0,0,0.4)"], R, 2); noise(g, L, T, 14, ah, 500, ["rgba(0,0,0,0.4)"], R, 2);
      // Giftpfützen (leuchten und glänzen)
      for (let i = 0; i < 4; i++) {
        const px = L + 60 + R() * (aw - 120), py = T + 80 + R() * (ah - 200), rx = 22 + R() * 18, ry = 12 + R() * 8, rot = R();
        const gr = g.createRadialGradient(px, py, 0, px, py, rx);
        gr.addColorStop(0, "rgba(170,255,90,0.45)"); gr.addColorStop(0.7, "rgba(90,180,40,0.3)"); gr.addColorStop(1, "rgba(60,120,20,0)");
        g.fillStyle = gr; ell(g, px, py, rx, ry, rot); g.fill();
        q.fillStyle = "#fff"; ell(q, px, py, rx * 0.8, ry * 0.8, rot); q.fill();
      }
      noise(g, L, T, aw, ah, 2500, ["rgba(0,0,0,0.15)", "rgba(255,255,255,0.04)"], R, 1.5);
      for (let i = 0; i < 30; i++) shard(L + R() * aw, T + R() * ah);
    }

    // Risse mit Verästelung und heller Bruchkante
    for (let i = 0; i < 11; i++) {
      let x = L + R() * aw, y = T + R() * ah;
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; pts.push([x, y]); }
      for (const [col, lw, o] of [["rgba(255,255,255,0.08)", 1, 1], ["rgba(0,0,0,0.5)", 1.4, 0]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px + o, py + o) : g.moveTo(px + o, py + o)));
        g.stroke();
      }
      const [bx, by] = pts[3];
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 0.9; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (R() - 0.5) * 30, by + (R() - 0.5) * 30); g.stroke();
    }
    // Wetter & Feste auf dem Boden: Schnee (Weihnachtsmarkt), Konfetti (Karneval), Laub (Wiesn im Herbst)
    if (opts.snow) {
      for (let i = 0; i < 70; i++) {
        const nearWall = R() < 0.6, x = nearWall ? (R() < 0.5 ? L + R() * 50 : RR - R() * 50) : L + R() * aw, y = T + R() * ah, rad = 10 + R() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, "rgba(236,242,248,0.85)"); gr.addColorStop(1, "rgba(236,242,248,0)");
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      noise(g, L, T, aw, ah, 1600, ["rgba(240,246,255,0.5)"], R, 1.6);
    }
    if (opts.confetti) noise(g, L, T, aw, ah, 1100, ["#ff4a5a", "#ffd23a", "#4ad1ff", "#7dff6a", "#ff7ae0", "#ffffff"], R, 2.2);
    if (opts.leaves) for (let i = 0; i < 160; i++) { g.fillStyle = ["#b5651d", "#d4a017", "#8b3a1a", "#c97a2a"][Math.floor(R() * 4)]; ell(g, L + R() * aw, T + R() * ah, 3 + R() * 2.5, 1.6 + R(), R() * 3); g.fill(); }
    // Innenschatten an den Wänden
    const edge = (x0, y0, x1, y1, w, h) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
    edge(L, T, L, T + 40, aw, 40); edge(L, T, L + 30, T, 30, ah); edge(RR, T, RR - 30, T, 30, ah); edge(L, B, L, B - 26, aw, 26);

    // Wände mit Oberkante
    g.fillStyle = th.wall;
    g.fillRect(0, T - 22, W, 22); g.fillRect(0, T - 22, L, H); g.fillRect(RR, T - 22, W - RR, H); g.fillRect(0, B, W, H - B);
    g.fillStyle = th.wallTop;
    g.fillRect(0, T - 22, W, 6); g.fillRect(L - 6, T - 22, 6, ah + 22); g.fillRect(RR, T - 22, 6, ah + 22); g.fillRect(0, B, W, 5);
    // v3.0 Horden-Gänge: Öffnung in der Seitenwand, dunkler Gang nach draußen, Warnstreifen an den Kanten
    for (const gt of opts.gates || []) {
      const y0 = gt.y - gt.h / 2, x0 = gt.side < 0 ? 0 : RR, x1 = gt.side < 0 ? L : W;
      const gr = g.createLinearGradient(gt.side < 0 ? L : RR, 0, gt.side < 0 ? 0 : W, 0);
      gr.addColorStop(0, "#2a2622"); gr.addColorStop(1, "#050505");
      g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, gt.h);
      for (const yy of [y0 - 5, y0 + gt.h]) for (let i = 0; i * 8 < x1 - x0; i++) { g.fillStyle = i % 2 ? "#1a1a1a" : "#d8a01a"; g.fillRect(x0 + i * 8, yy, 8, 5); }
      g.fillStyle = "rgba(0,0,0,0.28)";
      for (let i = 0; i < 5; i++) g.fillRect(gt.side < 0 ? L : RR - 70, y0 + 10 + i * 13, 70, 2); // Schleifspuren in die Arena
    }
    if (theme === "street") {
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
      for (let y = T - 16; y < T; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let y = T - 16; y < T; y += 5) for (let x = ((y / 5) % 2) * 6; x < W; x += 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 5); g.stroke(); }
    } else if (theme === "markt") {
      // Fachwerk-Oberkante: Balken auf hellem Putz
      g.fillStyle = "#3a2416";
      g.fillRect(0, T - 22, W, 3); g.fillRect(0, T - 4, W, 3);
      for (let x = 0; x < W; x += 34) { g.fillRect(x, T - 22, 3, 22); g.save(); g.beginPath(); g.moveTo(x + 3, T - 19); g.lineTo(x + 34, T - 4); g.lineWidth = 2.5; g.strokeStyle = "#3a2416"; g.stroke(); g.restore(); }
    } else if (theme === "lab") {
      g.fillStyle = "#3d4850"; g.fillRect(0, T - 12, W, 4);
      g.fillStyle = "#d9b21a"; for (let x = 0; x < W; x += 16) g.fillRect(x, T - 4, 8, 4);
    } else {
      g.fillStyle = "#3a4a44"; g.fillRect(0, T - 5, W, 5);
    }
    // v2.8 Kleinkram am Boden: Papierfetzen, Kippen, Scherben, Flecken, Laub
    {
      const lr = rng(seed + 577), outdoor = theme === "street" || theme === "markt";
      for (let i = 0, n = outdoor ? 48 : 22; i < n; i++) {
        const px = L + 10 + lr() * (aw - 20), py = T + 14 + lr() * (ah - 28), k = outdoor ? lr() : lr() * 0.5;
        g.save(); g.translate(px, py); g.rotate(lr() * Math.PI * 2);
        if (k < 0.28) {
          const v = (theme === "hospital" ? 225 : 190) + lr() * 30;
          g.fillStyle = `rgba(${v | 0},${(v - 8) | 0},${(v - 24) | 0},0.5)`; g.fillRect(-4, -3, 6 + lr() * 5, 4 + lr() * 3);
          g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(-4, 1, 6, 1);
        } else if (k < 0.45) {
          g.fillStyle = "rgba(230,222,205,0.7)"; g.fillRect(-2.5, -0.6, 4, 1.2); g.fillStyle = "rgba(200,120,60,0.8)"; g.fillRect(1.5, -0.6, 1.4, 1.2);
        } else if (k < 0.62) {
          g.fillStyle = theme === "lab" ? "rgba(120,230,210,0.45)" : "rgba(150,200,170,0.45)";
          g.beginPath(); g.moveTo(0, -2.5); g.lineTo(2.5, 1.5); g.lineTo(-2, 2); g.closePath(); g.fill();
        } else if (k < 0.82) {
          g.fillStyle = "rgba(10,8,6,0.2)"; g.beginPath(); g.ellipse(0, 0, 6 + lr() * 10, 3 + lr() * 5, 0, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = theme === "markt" ? "rgba(150,96,40,0.6)" : "rgba(96,76,40,0.55)";
          g.beginPath(); g.ellipse(0, 0, 3, 1.6, 0, 0, Math.PI * 2); g.fill(); g.fillRect(-0.3, -3, 0.6, 3);
        }
        g.restore();
      }
    }
    if (opts.wet && gc) {
      const pr = rng(seed + 911), gcx = gc.getContext("2d");
      for (let i = 0; i < 6; i++) {
        const px = L + 40 + pr() * (RR - L - 80), py = T + 50 + pr() * (B - T - 100), rx = 18 + pr() * 40, ry = 8 + pr() * 16, rot = pr() * Math.PI;
        g.save(); g.translate(px, py); g.rotate(rot);
        const pg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        pg.addColorStop(0, "rgba(8,12,18,0.42)"); pg.addColorStop(0.8, "rgba(8,12,18,0.28)"); pg.addColorStop(1, "rgba(8,12,18,0)");
        g.fillStyle = pg; g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(180,200,220,0.12)"; g.lineWidth = 1.2; g.beginPath(); g.arc(-rx * 0.2, -rx * 0.15, rx * 0.55, 3.6, 5.2); g.stroke();
        g.restore();
        gcx.save(); gcx.setTransform(gc.width / W, 0, 0, gc.height / H, 0, 0); gcx.translate(px, py); gcx.rotate(rot); gcx.scale(1, ry / rx);
        const gg2 = gcx.createRadialGradient(0, 0, 0, 0, 0, rx); gg2.addColorStop(0, "rgba(255,255,255,0.9)"); gg2.addColorStop(1, "rgba(255,255,255,0)");
        gcx.fillStyle = gg2; gcx.beginPath(); gcx.arc(0, 0, rx, 0, Math.PI * 2); gcx.fill(); gcx.restore();
      }
    }
    c.gloss = gc;
    return c;
  }

  // Dunkelheit je Thema (rgb)
  const themeDark = (theme) => THEMES[theme].dark;

  return {
    FRAMES, setRes, get res() { return RES; }, draw, glow, light, shadow, vignette,
    zombie, zombieFx, registerRadius, variants, playerBody, weapon, weaponIcon, WPN,
    streak, muzzleFlash, bolt, grenadeShell, acidGlob, casing, gib, splat, scorch, smoke, crack, saw, drone, coin, supplyCrate, fallenPole,
    obstacle, floor, themeDark, OBS_Z,
  };
})();
