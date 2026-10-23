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

  function canvas(w, h, res = RES) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * res));
    c.height = Math.max(1, Math.ceil(h * res));
    const g = c.getContext("2d");
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
    ],
    runner: [{ shirt: "#8a2a2a", pants: "#1f2126", skin: "#a9b59c", hood: true, lean: 0.14 }],
    spitter: [{ shirt: "#5d7c3a", pants: "#4a3d2a", skin: "#7d9a48", bloat: true, sleeveless: true, eye: "#eaff00" }],
    bomber: [{ shirt: "#e8701a", pants: "#2e3440", skin: "#8fa27a", vest: true }],
    brute: [{ shirt: "#5a615b", pants: "#3a3a33", skin: "#7c8c6a", brute: true, sleeveless: true }],
    armored: [{ shirt: "#1f2a3d", pants: "#1a2130", skin: "#7f9474", armor: true, eye: "#ff5a3a" }],
    crawler: [{ shirt: "#4b4258", pants: "#2a2430", skin: "#8a7c9e" }],
    dog: [{ shirt: "#4f3f32", skin: "#6b5644" }],
    abom: [{ skin: "#8a4a6a" }],
    mother: [{ skin: "#3f5a3a" }],
  };
  // Sprite-Größe relativ zum Kollisionsradius
  const SPAN = { crawler: 4.4, dog: 4.8, abom: 3.6, mother: 4.0 };
  const variants = (type) => (PAL[type] || PAL.walker).length;

  function humanoid(g, c, r, f, P, R) {
    const ph = (f / FRAMES) * TAU, sw = Math.sin(ph);
    const lean = P.lean ? r * P.lean : 0;
    const bulk = P.brute ? 1.14 : P.bloat ? 1.1 : 1;
    // Beine (unter dem Körper, abwechselnd vor/zurück)
    for (const s of [-1, 1]) {
      const step = sw * s * r * 0.48;
      const lx = c - r * 0.12 + step, ly = c + s * r * 0.34 * bulk;
      g.fillStyle = mix(P.pants, -0.1); ell(g, lx, ly, r * 0.36, r * 0.2); g.fill();
      g.fillStyle = "#1a1a1a"; ell(g, lx + r * 0.27, ly, r * 0.16, r * 0.15); g.fill();
    }
    const tx = c + lean;
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
    // Kopf
    const hx = tx + r * 0.2 + lean * 0.3;
    const hr = r * (P.brute ? 0.4 : 0.44);
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

  function zombie(type, frame, variant = 0) {
    const f = ((frame % FRAMES) + FRAMES) % FRAMES;
    const v = variant % variants(type);
    const key = `z:${type}:${v}:${f}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const r = Z_R[type] || 15;
    const S = r * (SPAN[type] || 3.7);
    const P = (PAL[type] || PAL.walker)[v];
    const fn = type === "crawler" ? crawler : type === "dog" ? dog : type === "abom" ? abom : type === "mother" ? mother : humanoid;
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
  function playerBody(frame, pack) {
    const key = `p:${frame}:${pack}`;
    return get(key, 72, 72, outlined((g) => {
      const c = 36, r = 16;
      const sw = frame < 0 ? 0 : Math.sin((frame / FRAMES) * TAU);
      // Beine & Stiefel
      for (const s of [-1, 1]) {
        const lx = c - r * 0.1 + sw * s * r * 0.42, ly = c + s * r * 0.34;
        g.fillStyle = "#3a4430"; ell(g, lx, ly, r * 0.36, r * 0.21); g.fill();
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
        g.fillStyle = vol(g, c - r * 0.8, c, r * 0.6, "#3d4630");
        rr(g, c - r * 1.15, c - r * 0.55, r * 0.75, r * 1.1, r * 0.2); g.fill();
        g.fillStyle = "#59633f"; rr(g, c - r * 1.22, c - r * 0.42, r * 0.28, r * 0.84, r * 0.12); g.fill(); // Schlafsack
        g.fillStyle = "#2c3322"; g.fillRect(c - r * 0.95, c - r * 0.5, r * 0.08, r * 1.0);
      }
      // Weste mit Taschen
      g.fillStyle = vol(g, c, c, r * 0.95, "#556640"); ell(g, c, c, r * 0.52, r * 0.9); g.fill();
      g.fillStyle = "#46542f";
      for (let i = -1; i <= 1; i++) { rr(g, c + r * 0.1, c + i * r * 0.36 - r * 0.13, r * 0.3, r * 0.26, r * 0.06); g.fill(); }
      g.fillStyle = "#8cff4a"; circ(g, c - r * 0.05, c - r * 0.78, r * 0.07); g.fill(); // Schulterlicht
      for (const s of [-1, 1]) { g.fillStyle = vol(g, c, c + s * r * 0.78, r * 0.3, "#4c5a38"); circ(g, c, c + s * r * 0.76, r * 0.27); g.fill(); }
      // Arme zum Waffengriff
      const arm = (sx, sy, ex, ey, hx, hy) => {
        limb(g, sx, sy, ex, ey, r * 0.3, "#4a5636");
        limb(g, ex, ey, hx, hy, r * 0.25, "#4a5636");
        g.fillStyle = "#1f1f1f"; circ(g, hx, hy, r * 0.16); g.fill();
      };
      arm(c, c + r * 0.72, c + r * 0.4, c + r * 0.72, c + r * 0.72, c + r * 0.22);
      arm(c, c - r * 0.72, c + r * 0.62, c - r * 0.5, c + r * 1.15, c + r * 0.12);
      // Helm mit Brille
      const hx = c + r * 0.08;
      g.fillStyle = vol(g, hx, c, r * 0.52, "#5d6e44"); circ(g, hx, c, r * 0.5); g.fill();
      g.strokeStyle = "#3f4b2d"; g.lineWidth = r * 0.06; circ(g, hx, c, r * 0.36); g.stroke();
      g.fillStyle = "#1b1f22"; g.beginPath(); g.arc(hx, c, r * 0.5, -0.9, 0.9); g.arc(hx, c, r * 0.3, 0.9, -0.9, true); g.closePath(); g.fill();
      g.fillStyle = "#6fe3ff"; g.beginPath(); g.arc(hx, c, r * 0.47, -0.75, 0.75); g.arc(hx, c, r * 0.36, 0.75, -0.75, true); g.closePath(); g.fill();
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
    const { c, g } = canvas(64, 34, scale * 2);
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
      const col = kind === "tesla" ? ["#eaffff", "#7fe7ff", "rgba(60,160,255,0)"] : kind === "flame" ? ["#fff1b0", "#ff9a2e", "rgba(255,60,0,0)"] : ["#ffffff", "#ffd36a", "rgba(255,120,20,0)"];
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
  const OBS_Z = { car: 0, crate: 12, barrels: 0, barricade: 14, dumpster: 16, bed: 6, cabinet: 18, medcrate: 12, tank: 0, server: 18, labcrate: 12 };
  const CAR_COLORS = ["#7a2f2f", "#2f4f7a", "#6b6b6b", "#c9b48a", "#2f5f4a", "#d8d8d0"];

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
  };

  function noise(g, x, y, w, h, n, colors, R, size = 2) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[Math.floor(R() * colors.length)];
      g.fillRect(x + R() * w, y + R() * h, size * (0.5 + R()), size * (0.5 + R()));
    }
  }

  function floor(theme, D, seed) {
    const { W, H, L, T, R: RR, B } = D;
    const res = Math.min(RES, 2);
    const { c, g } = canvas(W, H, res);
    const R = rng(seed);
    const th = THEMES[theme];
    const aw = RR - L, ah = B - T;
    g.fillStyle = "#0d1210"; g.fillRect(0, 0, W, H);

    if (theme === "street") {
      g.fillStyle = "#2a2d31"; g.fillRect(L, T, aw, ah);
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${R() > 0.5 ? "60,62,66" : "20,22,26"},0.35)`; g.fillRect(L + R() * aw * 0.8, T + R() * ah * 0.85, 40 + R() * 120, 30 + R() * 90); }
      noise(g, L, T, aw, ah, 4500, ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.18)", "rgba(120,120,120,0.08)"], R, 1.6);
      // Bordsteine
      for (const sx of [L, RR - 26]) {
        g.fillStyle = "#4a4a47"; g.fillRect(sx, T, 26, ah);
        g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
        for (let y = T; y < B; y += 26) { g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + 26, y); g.stroke(); }
        g.fillStyle = "#6a6a65"; g.fillRect(sx === L ? sx + 24 : sx, T, 2, ah);
      }
      // Mittellinie (gelb, gestrichelt, abgefahren)
      g.fillStyle = "rgba(230,190,40,0.55)";
      for (let y = T + 10; y < B - 140; y += 46) g.fillRect(W / 2 - 3, y, 6, 26);
      // Zebrastreifen unten
      g.fillStyle = "rgba(225,225,215,0.5)";
      for (let x = L + 40; x < RR - 50; x += 30) g.fillRect(x, B - 120, 16, 70);
      noise(g, L, B - 125, aw, 80, 700, ["rgba(42,45,49,0.9)"], R, 2.2);
      // Gullydeckel
      const mx = L + 70 + R() * (aw - 140), my = T + 120 + R() * (ah - 300);
      g.fillStyle = "#1c1e20"; circ(g, mx, my, 15); g.fill();
      g.strokeStyle = "#3a3d40"; g.lineWidth = 1.2; for (let i = -10; i <= 10; i += 5) { g.beginPath(); g.moveTo(mx - 12, my + i); g.lineTo(mx + 12, my + i); g.stroke(); }
      // Pfützen, Ölflecken, Laub, Papier
      for (let i = 0; i < 4; i++) {
        const px = L + 40 + R() * (aw - 80), py = T + 40 + R() * (ah - 80);
        g.fillStyle = "rgba(40,60,80,0.45)"; ell(g, px, py, 18 + R() * 30, 8 + R() * 14, R()); g.fill();
        g.strokeStyle = "rgba(160,190,220,0.18)"; g.lineWidth = 1; g.stroke();
      }
      for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(0,0,0,0.35)"; blob(g, L + R() * aw, T + R() * ah, 8 + R() * 14, R, 9); g.fill(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = ["#7a4a1e", "#9a6a2a", "#5a3a1a"][i % 3]; ell(g, L + R() * aw, T + R() * ah, 2.5, 1.5, R() * 3); g.fill(); }
      for (let i = 0; i < 8; i++) { g.save(); g.translate(L + R() * aw, T + R() * ah); g.rotate(R() * 3); g.fillStyle = "rgba(220,215,200,0.55)"; g.fillRect(-4, -3, 8, 6); g.restore(); }
    } else if (theme === "hospital") {
      g.fillStyle = "#56645e"; g.fillRect(L, T, aw, ah);
      const ts = 36;
      for (let y = T; y < B; y += ts) for (let x = L; x < RR; x += ts) {
        const v = Math.floor(R() * 10) - 5;
        g.fillStyle = `rgb(${110 + v},${126 + v},${120 + v})`; g.fillRect(x + 1, y + 1, ts - 2, ts - 2);
        if (R() < 0.08) { g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + R() * ts, y); g.lineTo(x + R() * ts, y + ts); g.stroke(); }
      }
      // Leitlinien
      g.fillStyle = "rgba(180,50,50,0.55)"; g.fillRect(L + 34, T, 6, ah);
      g.fillStyle = "rgba(50,100,180,0.55)"; g.fillRect(L + 44, T, 6, ah);
      noise(g, L, T, aw, ah, 2500, ["rgba(0,0,0,0.08)", "rgba(255,255,255,0.05)"], R, 1.5);
      // Blutschleifspuren
      for (let i = 0; i < 3; i++) {
        let x = L + 60 + R() * (aw - 120), y = T + 60 + R() * (ah - 200);
        g.strokeStyle = "rgba(110,12,14,0.45)"; g.lineWidth = 6 + R() * 6; g.lineCap = "round";
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 60; y += 30 + R() * 40; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 10; i++) { g.save(); g.translate(L + R() * aw, T + R() * ah); g.rotate(R() * 3); g.fillStyle = "rgba(235,235,225,0.7)"; g.fillRect(-5, -4, 10, 8); g.restore(); }
    } else {
      g.fillStyle = "#1f2529"; g.fillRect(L, T, aw, ah);
      const ps = 80;
      for (let y = T; y < B; y += ps) for (let x = L; x < RR; x += ps) {
        const grate = R() < 0.18;
        const v = Math.floor(R() * 8);
        g.fillStyle = grate ? "#14191c" : `rgb(${40 + v},${47 + v},${52 + v})`;
        g.fillRect(x + 1, y + 1, ps - 2, ps - 2);
        if (grate) {
          g.strokeStyle = "rgba(140,255,74,0.16)"; g.lineWidth = 1.5;
          for (let k = 6; k < ps; k += 8) { g.beginPath(); g.moveTo(x + k, y + 3); g.lineTo(x + k, y + ps - 3); g.stroke(); }
        } else {
          g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(x + 1, y + 1, ps - 2, 2);
          g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + 1, y + ps - 3, ps - 2, 2);
          g.fillStyle = "#6a737a"; for (const [nx, ny] of [[6, 6], [ps - 6, 6], [6, ps - 6], [ps - 6, ps - 6]]) { circ(g, x + nx, y + ny, 1.6); g.fill(); }
          if (R() < 0.3) { g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2; for (let k = 10; k < ps * 2; k += 12) { g.beginPath(); g.moveTo(x + Math.max(0, k - ps), y + Math.min(ps, k)); g.lineTo(x + Math.min(ps, k), y + Math.max(0, k - ps)); g.stroke(); } }
        }
      }
      // Warnstreifen am Rand
      g.save(); g.beginPath(); g.rect(L, T, aw, ah); g.rect(L + 14, T + 14, aw - 28, ah - 28); g.clip("evenodd");
      for (let k = -ah; k < aw + ah; k += 18) { g.fillStyle = "#d9b21a"; g.beginPath(); g.moveTo(L + k, T); g.lineTo(L + k + 9, T); g.lineTo(L + k + 9 - ah, B); g.lineTo(L + k - ah, B); g.fill(); }
      g.restore();
      for (let i = 0; i < 3; i++) {
        const px = L + 60 + R() * (aw - 120), py = T + 80 + R() * (ah - 200);
        const gr = g.createRadialGradient(px, py, 0, px, py, 30);
        gr.addColorStop(0, "rgba(160,255,80,0.35)"); gr.addColorStop(1, "rgba(80,160,30,0)");
        g.fillStyle = gr; ell(g, px, py, 30, 16, R()); g.fill();
      }
      noise(g, L, T, aw, ah, 1500, ["rgba(0,0,0,0.15)", "rgba(255,255,255,0.04)"], R, 1.5);
    }

    // Risse
    g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) {
      let x = L + R() * aw, y = T + R() * ah;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    // Innenschatten an den Wänden
    const edge = (x0, y0, x1, y1, w, h) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
    edge(L, T, L, T + 40, aw, 40); edge(L, T, L + 30, T, 30, ah); edge(RR, T, RR - 30, T, 30, ah); edge(L, B, L, B - 26, aw, 26);

    // Wände mit Oberkante
    g.fillStyle = th.wall;
    g.fillRect(0, T - 22, W, 22); g.fillRect(0, T - 22, L, H); g.fillRect(RR, T - 22, W - RR, H); g.fillRect(0, B, W, H - B);
    g.fillStyle = th.wallTop;
    g.fillRect(0, T - 22, W, 6); g.fillRect(L - 6, T - 22, 6, ah + 22); g.fillRect(RR, T - 22, 6, ah + 22); g.fillRect(0, B, W, 5);
    if (theme === "street") {
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
      for (let y = T - 16; y < T; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let y = T - 16; y < T; y += 5) for (let x = ((y / 5) % 2) * 6; x < W; x += 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 5); g.stroke(); }
    } else if (theme === "lab") {
      g.fillStyle = "#3d4850"; g.fillRect(0, T - 12, W, 4);
      g.fillStyle = "#d9b21a"; for (let x = 0; x < W; x += 16) g.fillRect(x, T - 4, 8, 4);
    } else {
      g.fillStyle = "#3a4a44"; g.fillRect(0, T - 5, W, 5);
    }
    return c;
  }

  // Dunkelheit je Thema (rgb)
  const themeDark = (theme) => THEMES[theme].dark;

  return {
    FRAMES, setRes, get res() { return RES; }, draw, glow, light, shadow, vignette,
    zombie, zombieFx, registerRadius, variants, playerBody, weapon, weaponIcon, WPN,
    streak, muzzleFlash, bolt, grenadeShell, acidGlob, casing, gib, splat, scorch, smoke, crack, saw, drone, coin, supplyCrate,
    obstacle, floor, themeDark, OBS_Z,
  };
})();
