/* 3D-Renderer von Outbreak Hero (WebGL über Three.js).
 * Liest den Spielzustand aus game.js und stellt ihn als echte 3D-Szene dar:
 * schräge Kamera wie bei Archero, Mond- und Taschenlampenlicht, Schatten,
 * Low-Poly-Modelle aus Grundformen (keine fremden Assets).
 * Spiellogik und Kollision bleiben 2D: Spiel-(x, y) → Three-(x, Höhe, z = y).
 * Figuren schauen lokal nach +x und werden mit rotation.y = -Blickwinkel gedreht.
 */
"use strict";
window.Render3D = (() => {
  const T3 = window.THREE;
  if (!T3) return null;
  const TAU = Math.PI * 2;
  let renderer = null;
  let scene = null;
  let camera = null;
  let D = null; // Arena-Maße aus game.js
  let ready = false;
  let quality = 2;
  let time = 0;
  const pv = new T3.Vector3();

  // ------------------------------------------------------------------
  // Geteilte Geometrien, Materialien, Texturen
  // ------------------------------------------------------------------
  const geoCache = new Map();
  const r1 = (n) => Math.round(n * 10) / 10;
  let uncached = false; // beim Raumbau: Geometrien mit Zufallsmaßen nicht cachen (werden beim Raumwechsel freigegeben)
  function geo(key, make) {
    if (uncached) return make();
    let g = geoCache.get(key);
    if (!g) { g = make(); geoCache.set(key, g); }
    return g;
  }
  const box = (w, h, d) => geo(`b${r1(w)},${r1(h)},${r1(d)}`, () => new T3.BoxGeometry(w, h, d));
  // v3.5 gefaster Kasten: 6 Flächen, 12 Kantenstreifen, 8 Eckdreiecke (44 statt 12 Dreiecke, ohne Index).
  // Die Kanten tragen die Normalen der Nachbarflächen – glatt schattiert wirken sie rund, flach schattiert
  // fangen sie als schmale Fase das Licht (Kantenlicht macht Kästen plastisch).
  function chamferBox(w, h, d, k) {
    const A = [w / 2, h / 2, d / 2], r = Math.min(w, h, d) * k, B = A.map((v) => v - r);
    const pos = [], nrm = [], ax = (i, s) => { const v = [0, 0, 0]; v[i] = s; return v; };
    const pt = (vals) => vals; // [x, y, z]
    const tri = (p, n) => {
      const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2], vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const out = cx * (n[0][0] + n[1][0] + n[2][0]) + cy * (n[0][1] + n[1][1] + n[2][1]) + cz * (n[0][2] + n[1][2] + n[2][2]);
      for (const i of out >= 0 ? [0, 1, 2] : [0, 2, 1]) { pos.push(p[i][0], p[i][1], p[i][2]); nrm.push(n[i][0], n[i][1], n[i][2]); }
    };
    const quad = (p, n) => { tri([p[0], p[1], p[2]], [n[0], n[1], n[2]]); tri([p[0], p[2], p[3]], [n[0], n[2], n[3]]); };
    const P = (i, vi, j, vj, k2, vk) => { const v = [0, 0, 0]; v[i] = vi; v[j] = vj; v[k2] = vk; return pt(v); };
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, k2 = (i + 2) % 3;
      for (const s of [1, -1]) { // Fläche
        const n = ax(i, s);
        quad([P(i, s * A[i], j, B[j], k2, B[k2]), P(i, s * A[i], j, -B[j], k2, B[k2]), P(i, s * A[i], j, -B[j], k2, -B[k2]), P(i, s * A[i], j, B[j], k2, -B[k2])], [n, n, n, n]);
      }
      for (const si of [1, -1]) for (const sj of [1, -1]) { // Kante zwischen Fläche i und Fläche j, entlang k2
        const ni = ax(i, si), nj = ax(j, sj);
        quad([P(i, si * A[i], j, sj * B[j], k2, B[k2]), P(i, si * A[i], j, sj * B[j], k2, -B[k2]), P(i, si * B[i], j, sj * A[j], k2, -B[k2]), P(i, si * B[i], j, sj * A[j], k2, B[k2])], [ni, ni, nj, nj]);
      }
    }
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) // Ecke
      tri([[sx * A[0], sy * B[1], sz * B[2]], [sx * B[0], sy * A[1], sz * B[2]], [sx * B[0], sy * B[1], sz * A[2]]], [ax(0, sx), ax(1, sy), ax(2, sz)]);
    const g = new T3.BufferGeometry();
    g.setAttribute("position", new T3.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("normal", new T3.BufferAttribute(new Float32Array(nrm), 3));
    return g;
  }
  // Kastenteil beim Verschmelzen gegen die gefaste Form tauschen (Kleinstteile bleiben scharf und billig)
  const SOFT_K = 0.22, SOFT_MIN = 0.7; // v3.6: auch Handflächen, Kiefer und Mundhöhle der Figuren gerundet
  function softGeo(g, k = SOFT_K, min = SOFT_MIN) {
    if (g.type !== "BoxGeometry") return g;
    const { width: w, height: h, depth: d } = g.parameters;
    if (Math.min(w, h, d) < min || g.parameters.widthSegments > 1) return g;
    return geo(`cb${r1(w)},${r1(h)},${r1(d)},${k}`, () => chamferBox(w, h, d, k));
  }
  const cap = (r, len) => geo(`c${r1(r)},${r1(len)}`, () => new T3.CapsuleGeometry(r, len, 4, 14)); // v3.3: 14 Segmente – glatt schattiert sollen Rumpf und Köpfe rund wirken
  const ico = (r, d = 1) => geo(`i${r1(r)},${d}`, () => new T3.IcosahedronGeometry(r, d));
  const cyl = (rt, rb, h, seg = 10) => geo(`y${r1(rt)},${r1(rb)},${r1(h)},${seg}`, () => new T3.CylinderGeometry(rt, rb, h, seg));
  const cone = (r, h, seg = 6) => geo(`k${r1(r)},${r1(h)},${seg}`, () => new T3.ConeGeometry(r, h, seg));
  const torus = (R, t, arc = TAU) => geo(`t${r1(R)},${r1(t)},${r1(arc)}`, () => new T3.TorusGeometry(R, t, 5, 16, arc));
  const ring = (R, t) => geo(`R${r1(R)},${r1(t)}`, () => new T3.TorusGeometry(R, t, 4, 10)); // v3.2: sparsamer Ring (Kragen)

  const lam = (c, extra) => new T3.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
  const basic = (c, extra) => new T3.MeshBasicMaterial({ color: c, ...extra });
  const shared = new Map();
  const sharedSet = new Set(); // geteilte Materialien werden beim Raumwechsel nicht freigegeben
  const smat = (key, make) => { let m = shared.get(key); if (!m) { m = make(); shared.set(key, m); sharedSet.add(m); } return m; };
  const slam = (c) => smat(`l${c}`, () => lam(c));
  const sbasic = (c) => smat(`b${c}`, () => basic(c));
  // v3.2: geteiltes Material mit Oberflächen-Klasse (Haut, Stoff, Leder, Metall, Haare, Knochen – siehe surf im Figuren-Shader)
  const tlam = (c, tex) => smat(`l${tex}:${c}`, () => { const m = lam(c); m.userData.tex = tex; return m; });
  // schlanke Gliedmaßen-Kapsel (weniger Ecken als cap, die Glieder sind dünn)
  const limb = (r, len) => geo(`L${r1(r)},${r1(len)}`, () => new T3.CapsuleGeometry(r, len, 3, 10));
  // kleines Detailteil: wird ohne Umrisslinie gebacken
  const fine = (o) => { o.userData.fine = true; return o; };
  const strHash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

  function mesh(g, m, x = 0, y = 0, z = 0) {
    const o = new T3.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  }
  function group(x = 0, y = 0, z = 0) { const g = new T3.Group(); g.position.set(x, y, z); return g; }

  function canvasTex(w, h, draw, repeat = false, scale = 1) {
    const c = document.createElement("canvas");
    c.width = w * scale; c.height = h * scale;
    // Kleine Texturen im Hauptspeicher zeichnen: die Normal-Map liest sie per getImageData aus –
    // bei einer GPU-Leinwand müsste der Browser dafür erst alles von der Grafikkarte zurückholen
    const g = c.getContext("2d", { willReadFrequently: true });
    if (scale !== 1) g.scale(scale, scale); // Zeichencode bleibt in logischen Pixeln
    draw(g, w, h);
    const t = new T3.CanvasTexture(c);
    t.colorSpace = T3.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = T3.RepeatWrapping;
    return t;
  }
  const texCache = new Map();
  // Wand-, Dach- und Hindernis-Texturen in doppelter Auflösung: aus der Nähe scharf statt verwaschen
  // (einmalig je Sorte erzeugt und zwischengespeichert, Klone teilen sich den GPU-Speicher)
  const TEX_SCALE = 2;
  const tex = (key, w, h, draw, repeat) => { let t = texCache.get(key); if (!t) { t = canvasTex(w, h, /^(wall|roof|obs):/.test(key) ? (g, ww, hh) => { draw(g, ww, hh); weather(g, ww, hh, key); } : draw, repeat, TEX_SCALE); texCache.set(key, t); } return t; };
  // v2.7 Verwitterung: Regenschlieren, Schmutz am Fuß, Moos, Risse und Kratzer – einmal je Textur, danach aus dem Cache
  function weather(g, w, h, key, noDetail = false) {
    let s = 0;
    for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const wall = key.startsWith("wall:"), roof = key.startsWith("roof:");
    g.save();
    if (wall) {
      for (let i = 0; i < 22; i++) {
        const x = R() * w, len = h * (0.2 + R() * 0.6), gr = g.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, `rgba(0,0,0,${0.12 + R() * 0.16})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x, 0, 0.6 + R() * 2.2, len);
      }
      const gb = g.createLinearGradient(0, h, 0, h * 0.62);
      gb.addColorStop(0, "rgba(22,17,12,0.42)"); gb.addColorStop(1, "rgba(22,17,12,0)");
      g.fillStyle = gb; g.fillRect(0, h * 0.62, w, h * 0.38);
      for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(${56 + R() * 20},${74 + R() * 24},${36 + R() * 12},${0.12 + R() * 0.12})`; g.beginPath(); g.ellipse(R() * w, h - R() * h * 0.22, 4 + R() * 14, 2 + R() * 6, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (roof) for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${150 + R() * 60},${150 + R() * 40},${60 + R() * 30},${0.08 + R() * 0.1})`; g.beginPath(); g.arc(R() * w, R() * h, 0.8 + R() * 2.6, 0, Math.PI * 2); g.fill(); } // Flechten
    g.strokeStyle = "rgba(0,0,0,0.38)"; g.lineWidth = 0.7;
    for (let i = 0; i < (wall ? 4 : 2); i++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 10; y += 3 + R() * 7; g.lineTo(x, y); } g.stroke(); } // Risse
    g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 0.6;
    for (let i = 0; i < (wall ? 10 : 14); i++) { const x = R() * w, y = R() * h, a = R() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (3 + R() * 9), y + Math.sin(a) * (3 + R() * 9)); g.stroke(); } // Kratzer
    if (!noDetail) detailPass(g, w, h, key, R); // v3.5: Fassaden haben eigene Details (Läden statt Plakate/Schablonen)
    g.restore();
  }
  // v3.3 Detail-Ebene für alle Wand-, Dach- und Hindernis-Texturen: Geschichten der Seuche an jeder Fläche
  function handprint(g, x, y, sz, a, R, col = "110,10,14") {
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = `rgba(${col},${0.55 + R() * 0.25})`;
    g.beginPath(); g.ellipse(0, 0, sz * 0.42, sz * 0.5, 0, 0, TAU); g.fill();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(-sz * 0.3 + k * sz * 0.2, -sz * 0.72 - (k === 1 || k === 2 ? sz * 0.08 : 0), sz * 0.08, sz * 0.24, 0, 0, TAU); g.fill(); }
    g.beginPath(); g.ellipse(sz * 0.48, -sz * 0.1, sz * 0.09, sz * 0.22, -0.8, 0, TAU); g.fill();
    for (let k = 0; k < 3; k++) g.fillRect(-sz * 0.3 + R() * sz * 0.6, sz * 0.3, 0.9, sz * (0.4 + R() * 1.2)); // herablaufende Tropfen
    g.restore();
  }
  function poster(g, x, y, pw, ph, R, title, col) {
    g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.12);
    const paper = `rgb(${212 + R() * 20 | 0},${200 + R() * 18 | 0},${170 + R() * 16 | 0})`;
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(1.5, 1.5, pw, ph);
    g.fillStyle = paper; g.beginPath(); g.moveTo(0, 0); g.lineTo(pw, 0); g.lineTo(pw, ph * 0.7); g.lineTo(pw * 0.72, ph); g.lineTo(0, ph); g.closePath(); g.fill(); // eine Ecke abgerissen
    g.fillStyle = col; g.fillRect(2, 2, pw - 4, ph * 0.18);
    g.fillStyle = "#f4efe2"; g.font = `bold ${Math.max(4, ph * 0.13)}px sans-serif`; g.textBaseline = "middle"; g.fillText(title, 4, 2 + ph * 0.09, pw - 8);
    g.fillStyle = "rgba(60,60,60,0.55)"; g.fillRect(4, ph * 0.26, pw * 0.42, ph * 0.36); // Foto
    g.fillStyle = "rgba(30,30,30,0.5)"; for (let l = 0; l < 5; l++) g.fillRect(pw * 0.5, ph * 0.28 + l * ph * 0.07, pw * (0.3 + R() * 0.15), 0.9);
    for (let l = 0; l < 3; l++) g.fillRect(4, ph * 0.7 + l * ph * 0.08, pw * (0.4 + R() * 0.35), 0.9);
    g.fillStyle = "rgba(230,220,170,0.55)"; g.fillRect(-2, -2, 8, 4); g.fillRect(pw - 6, -2, 8, 4); // Klebeband
    const st = g.createLinearGradient(0, 0, 0, ph); st.addColorStop(0, "rgba(0,0,0,0)"); st.addColorStop(1, "rgba(60,40,20,0.25)"); g.fillStyle = st; g.fillRect(0, 0, pw, ph); // vergilbt, Regenwasser
    g.restore();
  }
  function stencil(g, txt, x, y, size, col, R) {
    g.save(); g.font = `900 ${size}px "Arial Black", Impact, sans-serif`; g.textBaseline = "middle";
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${col},${0.05 + R() * 0.08})`; g.beginPath(); g.arc(x + R() * g.measureText(txt).width, y + (R() - 0.5) * size * 1.4, 0.6 + R() * 1.6, 0, TAU); g.fill(); } // Sprühnebel
    g.fillStyle = `rgba(${col},0.88)`; g.fillText(txt, x, y);
    g.fillStyle = "rgba(0,0,0,0.25)"; for (let k = 0; k < txt.length; k++) g.fillRect(x + k * size * 0.62 + size * 0.28, y - size * 0.5, 1, size); // Schablonenstege
    g.restore();
  }
  function detailPass(g, w, h, key, R) {
    const kind = key.split(":")[1] || "";
    if (key.startsWith("wall:")) {
      if (kind !== "lab") poster(g, 18 + R() * (w - 80), 14 + R() * 30, 26 + R() * 8, 34 + R() * 8, R, kind === "hospital" ? "HYGIENE" : R() < 0.5 ? "VERMISST" : "EVAKUIERUNG", R() < 0.5 ? "#a8241c" : "#1f4a8a");
      if (kind === "street" || kind === "markt") poster(g, w * 0.55 + R() * 40, 18 + R() * 24, 22, 30, R, "N-17", "#2a2a2a");
      stencil(g, kind === "hospital" ? "QUARANTÄNE" : kind === "lab" ? "BIOGEFAHR N-17" : "SPERRZONE", 12 + R() * (w * 0.35), h * 0.6 + R() * 8, 12, kind === "hospital" ? "170,30,30" : "230,120,30", R);
      for (let k = 0; k < 3; k++) handprint(g, 20 + R() * (w - 40), 50 + R() * 40, 7 + R() * 3, (R() - 0.5) * 0.9, R);
      // Salzausblühungen und abgeplatzter Putz
      if (kind !== "lab") for (let k = 0; k < 3; k++) { const x = R() * w, y = 30 + R() * 50, gr = g.createRadialGradient(x, y, 0, x, y, 10 + R() * 12); gr.addColorStop(0, "rgba(235,235,225,0.22)"); gr.addColorStop(1, "rgba(235,235,225,0)"); g.fillStyle = gr; g.fillRect(x - 24, y - 24, 48, 48); }
      // Einschuss-Krater: Gruppe mit Abplatzungen
      const cx = 30 + R() * (w - 60), cy = 30 + R() * 40;
      for (let k = 0; k < 6; k++) { const x = cx + (R() - 0.5) * 26, y = cy + (R() - 0.5) * 16; g.fillStyle = "rgba(200,190,170,0.3)"; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); g.fillStyle = "rgba(0,0,0,0.8)"; g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 0.5; for (let j = 0; j < 4; j++) { const a = R() * TAU; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke(); } }
      // Efeu von unten (draußen)
      if (kind === "street" || kind === "markt") for (let v = 0; v < 3; v++) {
        let x = R() * w, y = h - 2; g.strokeStyle = "rgba(40,60,26,0.8)"; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 9; k++) { x += (R() - 0.5) * 10; y -= 4 + R() * 6; g.lineTo(x, y); g.save(); g.fillStyle = `rgba(${50 + R() * 30},${90 + R() * 40},${36},0.85)`; g.beginPath(); g.ellipse(x + (R() - 0.5) * 6, y, 2.2, 1.4, R() * 3, 0, TAU); g.fill(); g.restore(); }
        g.stroke();
      }
      // Verteilerkasten mit Kabel
      const bx = R() * (w - 30), by = 20 + R() * 30;
      g.fillStyle = "#5a6066"; g.fillRect(bx, by, 14, 18); g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(bx, by, 14, 1.5); g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(bx, by + 16.5, 14, 1.5);
      g.fillStyle = "#e8c21a"; g.beginPath(); g.moveTo(bx + 7, by + 5); g.lineTo(bx + 10, by + 10); g.lineTo(bx + 4, by + 10); g.closePath(); g.fill();
      g.strokeStyle = "rgba(20,20,20,0.8)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(bx + 7, by + 18); g.lineTo(bx + 7, h); g.stroke();
    } else if (key.startsWith("roof:")) {
      for (let k = 0; k < 4; k++) { const x = R() * w, y = R() * h, r = 6 + R() * 12; for (let j = 0; j < 30; j++) { g.fillStyle = `rgba(${60 + R() * 30},${84 + R() * 40},${34},${0.18 + R() * 0.2})`; g.beginPath(); g.arc(x + (R() - 0.5) * r * 2, y + (R() - 0.5) * r * 1.4, 0.8 + R() * 2, 0, TAU); g.fill(); } } // Moos
      for (let k = 0; k < 2; k++) { const x = R() * w, y = R() * h; g.fillStyle = "rgba(10,14,20,0.4)"; g.beginPath(); g.ellipse(x, y, 8 + R() * 10, 4 + R() * 5, R() * 3, 0, TAU); g.fill(); g.strokeStyle = "rgba(200,220,240,0.18)"; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x - 2, y - 1, 5, 2, 0, 3.4, 5.4); g.stroke(); } // Pfützen
      if (kind !== "markt") { const vx = 20 + R() * (w - 50), vy = 20 + R() * (h - 50); g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(vx + 2, vy + 2, 18, 14); g.fillStyle = "#6a7076"; g.fillRect(vx, vy, 18, 14); g.fillStyle = "rgba(0,0,0,0.45)"; for (let k = 0; k < 4; k++) g.fillRect(vx + 2, vy + 2 + k * 3, 14, 1.2); } // Lüftungshaube
    } else if (key.startsWith("obs:")) {
      if (R() < 0.7) handprint(g, 20 + R() * 88, 30 + R() * 60, 6 + R() * 3, (R() - 0.5), R);
      for (let k = 0; k < 2; k++) { g.fillStyle = ["#e8c21a", "#d8d8d0", "#c8302a", "#2a8ad8"][Math.floor(R() * 4)]; g.save(); g.translate(R() * 110, R() * 110); g.rotate((R() - 0.5) * 0.6); g.fillRect(0, 0, 9 + R() * 6, 5 + R() * 4); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(1.5, 1.5, 6, 0.8); g.fillRect(1.5, 3, 4, 0.8); g.restore(); } // Aufkleber
      for (let k = 0; k < 3; k++) { const x = R() * 128, y = R() * 128, r = 4 + R() * 6, gr = g.createRadialGradient(x - 1, y - 1, 0, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.12)"); gr.addColorStop(0.6, "rgba(0,0,0,0.18)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } // Dellen
      for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(40,30,18,${0.1 + R() * 0.25})`; g.beginPath(); g.arc(R() * 128, 104 + R() * 24, 0.6 + R() * 2.4, 0, TAU); g.fill(); } // Spritzschmutz unten
      if (R() < 0.6) for (let k = 0; k < 2; k++) { const x = R() * 128, y = R() * 70, len = 12 + R() * 30, gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, "rgba(130,62,22,0.4)"); gr.addColorStop(1, "rgba(130,62,22,0)"); g.fillStyle = gr; g.fillRect(x, y, 2 + R() * 3, len); } // Rostläufer
    }
  }
  const seededR = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  // Gebrauchsspuren: feines Korn, Kratzer, Schmutzflecken und dunklere Kanten
  function grunge(g, w, h, R, o = {}) {
    const { grain = 0.07, scratches = 8, dirt = 5, edge = 0.35, rust = 0 } = o;
    for (let k = 0, n = (w * h) / 18; k < n; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "0,0,0"},${grain * (0.4 + R())})`; g.fillRect(R() * w, R() * h, 0.5 + R(), 0.5 + R()); }
    for (let k = 0; k < dirt; k++) {
      const x = R() * w, y = R() * h, r = 8 + R() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(20,16,10,${0.12 + R() * 0.16})`); gr.addColorStop(1, "rgba(20,16,10,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < rust; k++) {
      // Rostfahnen laufen nach unten
      const x = R() * w, y = R() * h * 0.6, len = 14 + R() * 40, gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, "rgba(120,58,22,0.55)"); gr.addColorStop(1, "rgba(120,58,22,0)");
      g.fillStyle = gr; g.fillRect(x, y, 1.5 + R() * 3, len);
    }
    g.lineCap = "round";
    for (let k = 0; k < scratches; k++) {
      const x = R() * w, y = R() * h, a = R() * TAU, l = 4 + R() * 18;
      g.strokeStyle = `rgba(255,255,255,${0.1 + R() * 0.12})`; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.moveTo(x + 0.5, y + 0.5); g.lineTo(x + 0.5 + Math.cos(a) * l, y + 0.5 + Math.sin(a) * l); g.stroke();
    }
    if (edge > 0) for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, 10, 0, 0, w, 10], [0, h, 0, h - 10, 0, h - 10, w, 10], [0, 0, 10, 0, 0, 0, 10, h], [w, 0, w - 10, 0, w - 10, 0, 10, h]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(0,0,0,${edge})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    }
  }
  // Blutspritzer mit Tropfen und Laufspuren (für Wände und Matratzen)
  function bloodSplat(g, x, y, size, R, a = 0.7) {
    g.fillStyle = `rgba(110,8,12,${a})`;
    for (let j = 0; j < 18; j++) { const d = R() * size, an = R() * TAU; g.beginPath(); g.arc(x + Math.cos(an) * d, y + Math.sin(an) * d * 0.8, 0.6 + R() * (size / 6) * (1 - d / size), 0, TAU); g.fill(); }
    g.beginPath(); g.arc(x, y, size * 0.35, 0, TAU); g.fill();
    for (let j = 0; j < 3; j++) { const dx = (R() - 0.5) * size * 0.6; g.fillRect(x + dx, y, 1 + R() * 1.2, size * (0.6 + R() * 1.4)); }
  }

  // sRGB-"r,g,b" → lineare Farbwerte für Vertexfarben
  const linCache = new Map();
  const tmpColor = new T3.Color();
  function lin(rgb) {
    let c = linCache.get(rgb);
    if (!c) {
      const [r, g, b] = rgb.split(",").map(Number);
      tmpColor.setRGB(r / 255, g / 255, b / 255, T3.SRGBColorSpace);
      c = [tmpColor.r, tmpColor.g, tmpColor.b];
      linCache.set(rgb, c);
    }
    return c;
  }
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

  // ------------------------------------------------------------------
  // Partikel & Leuchteffekte: Quads in zwei Batches (additiv / normal)
  // ------------------------------------------------------------------
  // v3.3 Seltenheitsfarben der Beutekisten (gewöhnlich, selten, episch, legendär)
  const LOOT_CSS = ["200,205,210", "74,168,255", "176,122,255", "255,194,58"];
  const LOOT_RGB = LOOT_CSS.map((c) => c.split(",").map((v) => v / 255));
  const CELL = { glow: 0, smoke: 1, streak: 2, ring: 3, star: 4, blob: 5, chevron: 6, band: 7, gib: 8, casing: 9, bolt: 10, fire: 11, flare: 12, shock: 13, fireball: 14, puff: 15 };
  function makeAtlas() {
    // v3.5 doppelte Auflösung (1024²), plastischer Rauch, Flammenzungen, Linsenblitz, Druckring, Feuerball, Staubwolke
    return canvasTex(512, 512, (g) => {
      const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128, Math.floor(i / 4) * 128); fn(g); g.restore(); };
      const radial = (stops) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62); stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`)); return gr; };
      cell(CELL.glow, () => { g.fillStyle = radial([[0, 1], [0.18, 0.65], [0.45, 0.2], [1, 0]]); g.fillRect(0, 0, 128, 128); });
      // Rauch: blumenkohlartige Wolke aus vielen Ballen, oben heller (Licht von oben), unten schattig, weicher Rand
      const puffy = (seed, n, spread, rMin, rMax, alpha, shade) => {
        let sd = seed; const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, d = Math.sqrt(R()) * spread, x = 64 + Math.cos(a) * d, y = 66 + Math.sin(a) * d * 0.85;
          const r = Math.min(60 - Math.hypot(x - 64, y - 64), rMin + R() * (rMax - rMin) * (1 - d / (spread + 16)));
          if (r < 3) continue;
          const lit = Math.min(1, Math.max(0.35, 1 - shade * (y - 28) / 80)), v = Math.round(255 * lit), v2 = Math.round(v * 0.72);
          const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
          gr.addColorStop(0, `rgba(${v},${v},${v},${alpha})`); gr.addColorStop(0.65, `rgba(${v2},${v2},${v2},${alpha * 0.55})`); gr.addColorStop(1, `rgba(${v2},${v2},${v2},0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
      };
      cell(CELL.smoke, () => puffy(77, 48, 34, 10, 26, 0.42, 0.75));
      cell(CELL.streak, () => {
        const gr = g.createLinearGradient(0, 0, 128, 0);
        gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.75, "rgba(255,255,255,0.6)"); gr.addColorStop(1, "rgba(255,255,255,1)");
        g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 63, 22, 0, 0, TAU); g.fill();
      });
      cell(CELL.ring, () => { g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.stroke(); });
      cell(CELL.star, () => {
        g.fillStyle = radial([[0, 1], [0.3, 0.8], [1, 0]]);
        g.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? 18 : 62; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
        g.closePath(); g.fill();
      });
      cell(CELL.blob, () => { g.fillStyle = radial([[0, 1], [0.7, 1], [1, 0]]); g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill(); });
      cell(CELL.chevron, () => { g.strokeStyle = "#fff"; g.lineWidth = 18; g.lineCap = "round"; g.beginPath(); g.moveTo(20, 84); g.lineTo(64, 40); g.lineTo(108, 84); g.stroke(); });
      cell(CELL.band, () => { g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(4, 4, 120, 120); g.strokeStyle = "#fff"; g.lineWidth = 6; g.strokeRect(5, 5, 118, 118); });
      cell(CELL.gib, () => {
        g.fillStyle = "#ffffff";
        g.beginPath();
        for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, r = 34 + ((i * 37) % 19); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
        g.closePath(); g.fill();
        g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.arc(74, 74, 20, 0, TAU); g.fill();
      });
      cell(CELL.casing, () => { g.fillStyle = "#d9b04a"; g.fillRect(24, 48, 80, 32); g.fillStyle = "#fff2b0"; g.fillRect(30, 52, 64, 8); });
      cell(CELL.bolt, () => { g.fillStyle = "#fff"; g.fillRect(8, 60, 112, 8); });
      // Flammenzunge: heißer Kern unten, Zungen nach oben (Billboard „oben“ = Bild-oben)
      cell(CELL.fire, () => {
        const tongue = (cx, w, h, a) => {
          const gr = g.createLinearGradient(0, 122, 0, 122 - h);
          gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.6})`); gr.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = gr; g.beginPath(); g.moveTo(cx - w, 120);
          g.bezierCurveTo(cx - w * 1.15, 120 - h * 0.35, cx - w * 0.25, 120 - h * 0.62, cx + w * 0.1, 120 - h);
          g.bezierCurveTo(cx + w * 0.35, 120 - h * 0.6, cx + w * 1.15, 120 - h * 0.3, cx + w, 120); g.closePath(); g.fill();
        };
        tongue(64, 30, 104, 0.5); tongue(46, 14, 72, 0.5); tongue(82, 15, 84, 0.5); tongue(64, 16, 66, 0.85);
        const gr = g.createRadialGradient(64, 100, 0, 64, 100, 24); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.fillRect(28, 70, 72, 56);
        // Ränder der Zelle sicher ausblenden (sonst harte Quad-Kanten) – Clip, sonst löscht destination-in den ganzen Atlas
        g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.clip();
        g.globalCompositeOperation = "destination-in";
        const fv = g.createLinearGradient(0, 0, 0, 128); fv.addColorStop(0, "rgba(0,0,0,1)"); fv.addColorStop(0.78, "rgba(0,0,0,1)"); fv.addColorStop(0.97, "rgba(0,0,0,0)");
        g.fillStyle = fv; g.fillRect(0, 0, 128, 128);
        const fh = g.createLinearGradient(0, 0, 128, 0); fh.addColorStop(0, "rgba(0,0,0,0)"); fh.addColorStop(0.12, "rgba(0,0,0,1)"); fh.addColorStop(0.88, "rgba(0,0,0,1)"); fh.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = fh; g.fillRect(0, 0, 128, 128);
        g.restore();
      });
      // Linsenblitz: heller Kern, lange waagerechte und kürzere senkrechte/schräge Strahlen
      cell(CELL.flare, () => {
        g.fillStyle = radial([[0, 1], [0.1, 0.75], [0.3, 0.16], [1, 0]]); g.fillRect(0, 0, 128, 128);
        const ray = (ang, len, wid, a) => { g.save(); g.translate(64, 64); g.rotate(ang); const gr = g.createLinearGradient(-len, 0, len, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, TAU); g.fill(); g.restore(); };
        ray(0, 62, 3.4, 1); ray(Math.PI / 2, 44, 2.6, 0.75); ray(Math.PI / 4, 28, 1.8, 0.45); ray(-Math.PI / 4, 28, 1.8, 0.45);
      });
      // Druckring: weicher Rand mit hellem Saum (Boden-Druckwelle, Ringe)
      cell(CELL.shock, () => { const gr = g.createRadialGradient(64, 64, 26, 64, 64, 62); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.62, "rgba(255,255,255,0.12)"); gr.addColorStop(0.86, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      // Feuerball: brodelnde, ungleichmäßig helle Kugel
      cell(CELL.fireball, () => {
        let sd = 4242; const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
        for (let i = 0; i < 44; i++) {
          const a = R() * TAU, d = Math.sqrt(R()) * 36, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = Math.min(60 - Math.hypot(x - 64, y - 64), 9 + R() * 18);
          if (r < 3) continue;
          const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.3 + 0.35 * (1 - d / 40)})`); gr.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
      });
      // Staubwolke: dichter, gleichmäßiger als Rauch (Einschläge, Trümmer)
      cell(CELL.puff, () => puffy(913, 30, 26, 9, 20, 0.5, 0.4));
    }, false, 2);
  }

  class QuadBatch {
    constructor(max, map, additive, depthTest = !additive) {
      this.max = max;
      this.n = 0;
      const g = new T3.BufferGeometry();
      this.pos = new Float32Array(max * 12);
      this.uv = new Float32Array(max * 8);
      this.col = new Float32Array(max * 16);
      const idx = new Uint16Array(max * 6);
      for (let i = 0; i < max; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a, a + 2, a + 3], i * 6); }
      g.setIndex(new T3.BufferAttribute(idx, 1));
      this.aPos = new T3.BufferAttribute(this.pos, 3).setUsage(T3.DynamicDrawUsage);
      this.aUv = new T3.BufferAttribute(this.uv, 2).setUsage(T3.DynamicDrawUsage);
      this.aCol = new T3.BufferAttribute(this.col, 4).setUsage(T3.DynamicDrawUsage);
      g.setAttribute("position", this.aPos);
      g.setAttribute("uv", this.aUv);
      g.setAttribute("color", this.aCol);
      this.geo = g;
      this.mesh = new T3.Mesh(g, new T3.MeshBasicMaterial({
        map, vertexColors: true, transparent: true, depthWrite: false, depthTest,
        blending: additive ? T3.AdditiveBlending : T3.NormalBlending, side: T3.DoubleSide, fog: false,
      }));
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = additive ? (depthTest ? 15 : 30) : 20;
    }
    begin() { this.n = 0; }
    // Quad um Mittelpunkt c mit Halbachsen u und v
    add(cx, cy, cz, ux, uy, uz, vx, vy, vz, cell, r, g, b, a) {
      if (this.n >= this.max || a <= 0.003) return;
      const i = this.n++, p = i * 12, t = i * 8, c = i * 16, P = this.pos, U = this.uv, C = this.col;
      P[p] = cx - ux - vx; P[p + 1] = cy - uy - vy; P[p + 2] = cz - uz - vz;
      P[p + 3] = cx + ux - vx; P[p + 4] = cy + uy - vy; P[p + 5] = cz + uz - vz;
      P[p + 6] = cx + ux + vx; P[p + 7] = cy + uy + vy; P[p + 8] = cz + uz + vz;
      P[p + 9] = cx - ux + vx; P[p + 10] = cy - uy + vy; P[p + 11] = cz - uz + vz;
      const u0 = (cell % 4) / 4 + 0.004, u1 = (cell % 4 + 1) / 4 - 0.004;
      const row = Math.floor(cell / 4), v1 = 1 - row / 4 - 0.004, v0 = 1 - (row + 1) / 4 + 0.004;
      U[t] = u0; U[t + 1] = v0; U[t + 2] = u1; U[t + 3] = v0; U[t + 4] = u1; U[t + 5] = v1; U[t + 6] = u0; U[t + 7] = v1;
      for (let k = 0; k < 4; k++) { C[c + k * 4] = r; C[c + k * 4 + 1] = g; C[c + k * 4 + 2] = b; C[c + k * 4 + 3] = a; }
    }
    end() {
      this.aPos.needsUpdate = true; this.aUv.needsUpdate = true; this.aCol.needsUpdate = true;
      this.geo.setDrawRange(0, this.n * 6);
    }
  }

  let addB = null; // additiv: Glows, Feuer, Funken, Leuchtspuren, Blitze
  let floorB = null; // additiv mit Tiefentest: Lichtinseln, Ringe, Pfeile am Boden
  let normB = null; // normal: Rauch, Blut, Gibs, Hülsen, Warnflächen
  let shadeB = null; // v3.8 normal, NACH dem Lichtkegel gezeichnet: Taschenlampen-Schatten dunkeln auch den Kegel ab
  const camR = new T3.Vector3(), camU = new T3.Vector3();

  // Kamera-zugewandtes Quad
  function bill(B, x, y, z, size, cell, rgb, a, rot = 0) {
    const [r, g, b] = lin(rgb);
    let ux = camR.x * size, uy = camR.y * size, uz = camR.z * size, vx = camU.x * size, vy = camU.y * size, vz = camU.z * size;
    if (rot) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const nux = ux * c + vx * s, nuy = uy * c + vy * s, nuz = uz * c + vz * s;
      vx = vx * c - ux * s; vy = vy * c - uy * s; vz = vz * c - uz * s;
      ux = nux; uy = nuy; uz = nuz;
    }
    B.add(x, y, z, ux, uy, uz, vx, vy, vz, cell, r, g, b, a);
  }
  // v3.5 gestrecktes Billboard (Flammen: schmal und hoch)
  function billS(B, x, y, z, sx, sy, cell, rgb, a) {
    const [r, g, b] = lin(rgb);
    B.add(x, y, z, camR.x * sx, camR.y * sx, camR.z * sx, camU.x * sy, camU.y * sy, camU.z * sy, cell, r, g, b, a);
  }
  // Waagerechtes Quad (liegt auf dem Boden bzw. in Flughöhe), Länge entlang Winkel ang
  // v3.8 Taschenlampen-Schatten: Figuren und kleine Hindernisse im Lichtkegel werfen lange weiche Schatten vom Helden weg.
  // Kein zusätzlicher Schatten-Durchgang – je Körper ein gestreckter dunkler Fleck in einem eigenen kleinen Batch (alle 3D-Stufen),
  // der mit der Blickrichtung wandert: zum Kegelrand und mit der Entfernung blasser, weiter weg länger.
  const FLASH_SH = { range: 520, cos0: 0.8, cos1: 0.93, max: 64 };
  function flashShadows(w) {
    const p = w.player, ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    let n = 0;
    const cast = (x, z, r, h) => {
      const dx = x - p.x, dz = z - p.y, d = Math.hypot(dx, dz);
      if (d < 26 || d > FLASH_SH.range || n >= FLASH_SH.max) return;
      const cosA = (dx * ca + dz * sa) / d;
      if (cosA < FLASH_SH.cos0) return;
      const k = Math.min(1, (cosA - FLASH_SH.cos0) / (FLASH_SH.cos1 - FLASH_SH.cos0)) * (1 - d / FLASH_SH.range);
      if (k < 0.05) return;
      const L = Math.min(190, (34 + d * 0.55) * h), ux = dx / d, uz = dz / d, off = L * 0.36 + r * 0.3;
      flat(shadeB, x + ux * off, 0.62, z + uz * off, Math.atan2(dz, dx), L * 0.5, r * (1.05 + L / 280), CELL.blob, "0,0,0", Math.min(0.72, k));
      n++;
    };
    for (const e of w.enemies) if (!e.dead && e.spawnT <= 0 && !e.under) cast(e.x, e.y, e.r * (e.scale || 1), e.def && e.def.boss ? 1.3 : 1);
    for (const sv of w.survivors || []) if (sv.state === "wait" || sv.state === "run") cast(sv.x, sv.y, 12, 0.9);
    for (const o of w.obstacles) if (!o.dead && !o.gateBar && !o.landmark && Math.max(o.w, o.h) <= 96) cast(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h) * 0.42, 0.8);
    return n;
  }
  function flat(B, x, y, z, ang, halfLen, halfW, cell, rgb, a) {
    const [r, g, b] = lin(rgb);
    const c = Math.cos(ang), s = Math.sin(ang);
    B.add(x, y, z, c * halfLen, 0, s * halfLen, -s * halfW, 0, c * halfW, cell, r, g, b, a);
  }

  // ------------------------------------------------------------------
  // Initialisierung, Kamera, Licht
  // ------------------------------------------------------------------
  let hemi, moon, fill, flashlight, beam, outlineMat;
  const pool = [];
  const CAM = { elev: 60 * Math.PI / 180, dist: 1200, fov: 34, tx: 0, tz: 0, offY: 0, fx: 0, fz: 0, boss: 0 };
  // v3.1 Kamera-Perspektiven: „top“ = ganze Arena (Standard), „close“ = folgt dem Helden von schräg oben,
  // „tp“ = Third Person (v3.2 Schulterkamera, siehe placeShoulderCamera). Eine 3D-Ansicht mit ganzer Arena UND nahem Helden
  // geht im Hochformat geometrisch nicht (die Arena-Breite erzwingt den Abstand) – die ganze Karte zeigt deshalb die Minikarte.
  const CAM_MODES = {
    close: { eye: 520, back: 330, lookH: 10, ahead: 80, fov: 40, follow: 5 },
    tp: { shoulderCam: true, ray: 37, dist: 300, heroNdc: -0.4, fov: 64, shoulder: 26, follow: 6, sMax: 2.1, danger: 230, hud: 112 },
  };
  let camMode = "top", camOff = null;
  const camPos = new T3.Vector3(), camLook = new T3.Vector3();
  // Figuren wirken in 3D kleiner als Sprites → sichtbar größer als ihr Kollisionskreis
  const CHAR_SCALE = 1.45, BOSS_SCALE = 1.12, PLAYER_SCALE = 1.5;

  function init(canvas, dims) {
    D = dims;
    try {
      renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) {
      console.warn("[Outbreak] WebGL nicht verfügbar – 2D-Darstellung", e && e.message);
      return false;
    }
    if (!renderer.getContext()) return false;
    // Nach einem Kontextverlust ist die auf der GPU erzeugte Boden-Normal-Map leer: Raum neu bauen
    canvas.addEventListener("webglcontextrestored", () => { builtFloor = null; warmPending = true; });
    // Shader-Fehlerprüfung liest Logs synchron aus (blockiert) – nur beim Entwickeln im Browser
    renderer.debug.checkShaderErrors = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !(window.Platform && Platform.isNative);
    renderer.toneMapping = T3.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T3.PCFShadowMap;
    renderer.setClearColor(0x05080a, 1);

    scene = new T3.Scene();
    scene.fog = new T3.Fog(0x0b1018, 1500, 2700);
    camera = new T3.PerspectiveCamera(CAM.fov, D.W / D.H, 20, 5000);

    hemi = new T3.HemisphereLight(0x8090b8, 0x2a2420, 2.4);
    scene.add(hemi);
    // Hauptlicht von hinten links (Schatten fallen nach vorn rechts, gut lesbar)
    moon = new T3.DirectionalLight(0xa8b8ff, 2.4);
    moon.position.set(D.L - 300, 1100, D.T - 120);
    moon.target.position.set((D.L + D.R) / 2, 0, (D.T + D.B) / 2);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera;
    sc.left = -650; sc.right = 650; sc.top = 650; sc.bottom = -650; sc.near = 200; sc.far = 2600;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 1.5;
    moon.shadow.radius = 2.4; // v3.6 weichere Schattenkanten (gleiche 5 PCF-Abtastungen, nur weiter gestreut)
    scene.add(moon, moon.target);
    // Aufhelllicht aus Kamerarichtung, damit die Vorderseiten der Figuren nicht absaufen
    fill = new T3.DirectionalLight(0xffe2c4, 1.1);
    fill.position.set((D.L + D.R) / 2 + 250, 800, D.B + 900);
    fill.target = moon.target;
    scene.add(fill);
    flashlight = new T3.SpotLight(0xfff0d0, 8, 720, 0.52, 0.85, 0);
    scene.add(flashlight, flashlight.target);
    for (let i = 0; i < 4; i++) {
      const l = new T3.PointLight(0xffaa55, 0, 260, 0);
      scene.add(l);
      pool.push(l);
    }

    const atlas = makeAtlas();
    addB = new QuadBatch(2600, atlas, true);
    normB = new QuadBatch(1600, atlas, false);
    floorB = new QuadBatch(900, atlas, true, true); // v3.6: Platz für Spiegelungen und Lichtschein der Läden
    shadeB = new QuadBatch(96, atlas, false);
    shadeB.mesh.renderOrder = 27; // Lichtkegel (beam) hat 26
    scene.add(addB.mesh, normB.mesh, floorB.mesh, shadeB.mesh);
    // Sichtbarer Lichtkegel der Taschenlampe (staubige Luft)
    const beamGeo = new T3.ConeGeometry(120, 300, 28, 1, true);
    beamGeo.translate(0, -150, 0);
    beamGeo.rotateZ(Math.PI / 2);
    beam = new T3.Mesh(beamGeo, new T3.MeshBasicMaterial({
      map: canvasTex(4, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#fff"); gr.addColorStop(0.35, "#6a6458"); gr.addColorStop(1, "#000"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); }),
      color: 0xfff0d0, transparent: true, opacity: 0.13, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false,
    }));
    beam.renderOrder = 26;
    beam.frustumCulled = false;
    scene.add(beam);
    // Umrisslinien (Cartoon-Look wie bei Archero): Rückseiten, entlang der Normalen aufgebläht
    outlineMat = new T3.MeshBasicMaterial({ color: 0x07090b, side: T3.BackSide, fog: false });
    outlineMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  transformed += normal * 1.0;"); };
    setupInstanced();
    setupCorpseBatch();
    fitCamera();
    ready = true;
    console.log(`[Outbreak] 3D bereit (Three.js ${T3.REVISION})`);
    return true;
  }

  // Menü: langsame Kamerafahrt um den Helden, flacher Blickwinkel
  let menuMode = false;
  // Hauptmenü-Kamera: Einflug von oben, dann langsame Kreisfahrt um den Helden in Nahaufnahme.
  // Ziehen dreht (menuOrbit), der Bewegungssensor neigt (setTilt), dazu leichtes Handkamera-Wackeln.
  // Bildausschnitt (setMenuFrame): cy = Bühnenmitte, h = Bühnenhöhe, beides als Anteil der Bildhöhe.
  const MENU_FOV = 36, MENU_HERO = 58; // Heldenhöhe samt etwas Luft in Welt-Einheiten
  const menuCam = { yaw: 0, drag: false, tiltX: 0, tiltY: 0, t0: -1, cy: 0.425, h: 0.2, dist: 400, dirty: true };
  function setMenuFrame(cy, h) {
    menuCam.cy = Math.max(0.25, Math.min(0.6, cy));
    menuCam.h = Math.max(0.19, Math.min(0.34, h * 1.05)); // Anteil der Bildhöhe, den der Held füllt
    menuCam.dist = MENU_HERO / (2 * Math.tan((MENU_FOV * Math.PI) / 360) * menuCam.h);
    menuCam.dirty = true;
  }
  function placeMenuCamera(t, w) {
    if (!menuMode) { menuMode = true; menuCam.t0 = t; menuCam.dirty = true; camOff = null; }
    if (menuCam.dirty) {
      menuCam.dirty = false; camera.fov = MENU_FOV;
      camera.setViewOffset(D.W, D.H, 0, D.H * (0.5 - menuCam.cy), D.W, D.H); camera.updateProjectionMatrix();
    }
    const k = Math.min(1, (t - menuCam.t0) / 3.4), ease = 1 - Math.pow(1 - k, 3);
    if (!menuCam.drag) menuCam.yaw *= Math.exp(-0.35 * Math.min(0.1, frameDt)); // lässt man los, schwingt sie langsam zurück
    const yaw = Math.PI + 0.42 + Math.sin(t * 0.07) * 0.32 + menuCam.yaw + menuCam.tiltX * 0.3;
    const elev = 0.24 + menuCam.tiltY * 0.1 + (1 - ease) * 0.55, d = menuCam.dist + (1 - ease) * 520;
    const tx = w.player.x, tz = w.player.y;
    camera.position.set(tx + Math.sin(yaw) * d * Math.cos(elev), 20 + Math.sin(elev) * d, tz + Math.cos(yaw) * d * Math.cos(elev));
    camera.lookAt(tx, 27, tz);
    camera.rotateZ(Math.sin(t * 0.83) * 0.007 + Math.sin(t * 1.9) * 0.003);
    camera.updateMatrixWorld();
  }
  let frameDt = 0.016;
  // Spielstart: Kamera fliegt aus der Menü-Perspektive in die Spielansicht
  let fly = null;
  function placeCamera(dist, sx = 0, sz = 0, raw = false) {
    camPos.set(CAM.tx + sx, Math.sin(CAM.elev) * dist, CAM.tz + Math.cos(CAM.elev) * dist + sz);
    camLook.set(CAM.tx + sx, 0, CAM.tz + sz);
    if (raw) { camera.position.copy(camPos); camera.lookAt(camLook); camera.updateMatrixWorld(); return; } // nur zum Ausmessen (fitCamera)
    applyCam(CAM.fov, CAM.offY);
  }
  // Nah-/Third-Person-Kamera: folgt dem Helden; Ziel (tx, tz) ist bereits geglättet
  function placeFollowCamera(P, tx, tz, lift = 0) {
    camPos.set(tx, P.eye * (1 + lift), tz + P.back * (1 + lift * 0.6));
    camLook.set(tx, P.lookH, tz - P.ahead);
    applyCam(P.fov, 0);
  }
  function applyCam(fov, offY) {
    if (menuMode) {
      menuMode = false;
      fly = { t0: performance.now(), pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, off: D.H * (0.5 - menuCam.cy) };
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (fly) {
      // Echtzeit statt Spielzeit: dauert auf jedem Gerät gleich lang
      const x = Math.min(1, (performance.now() - fly.t0) / 1300), k = x * x * (3 - 2 * x);
      camera.position.lerpVectors(fly.pos, camera.position.clone(), k);
      camera.quaternion.slerpQuaternions(fly.quat, camera.quaternion.clone(), k);
      camera.fov = fly.fov + (fov - fly.fov) * k;
      camera.setViewOffset(D.W, D.H, 0, fly.off + (offY - fly.off) * k, D.W, D.H);
      camera.updateProjectionMatrix();
      camOff = null;
      if (x >= 1) fly = null;
    } else if (camOff !== offY) {
      // Moduswechsel: Bildversatz (Arena unter dem HUD) nur in der Übersicht
      camOff = offY;
      camera.setViewOffset(D.W, D.H, 0, offY, D.W, D.H);
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
  // Third Person: Gegner direkt zwischen Kamera und Held werden durchscheinend (Umriss aus), damit der Held sichtbar bleibt.
  // Verdeckt wird, wer höher ist als die Sichtlinie (Neigung der Schulterkamera) an seiner Stelle.
  function ghostOccluders(P, pl, dt) {
    const slope = Math.tan((P.ray || 40) * Math.PI / 180);
    for (const [e, M] of models) {
      if (!M.parts) continue;
      const dz = e.y - pl.y, reach = P.shoulderCam ? (heightOf(e) * 1.15 - 22) / slope : P.back + 40;
      const hit = camMode === "tp" && !e.dead && dz > 4 && dz < reach && Math.abs(e.x - pl.x) < e.r * 1.5 + 16;
      setGhost(M, (M.ghost || 0) + ((hit ? 1 : 0) - (M.ghost || 0)) * Math.min(1, dt * 8));
    }
  }
  function setGhost(M, g) {
    if (!M.parts) return;
    if (g < 0.02) g = 0;
    if (g === (M.ghost || 0) && g === 0) return;
    M.ghost = g;
    const mat = M.parts.body.material;
    mat.transparent = g > 0; mat.opacity = 1 - 0.68 * g; mat.depthWrite = g === 0;
    for (const c of M.root.children) if (c.userData.outline) c.visible = g < 0.3;
  }
  function setCamMode(m) { camMode = CAM_MODES[m] ? m : "top"; CAM.fol = null; shCam.s = 1; camOff = null; if (camMode !== "tp") for (const [, M] of models) setGhost(M, 0); }

  // v3.2 Schulterkamera: tief hinter der rechten Schulter, Blick nach vorn bis zur Stirnwand. Nur Neigung, kein Gieren
  // (Norden bleibt oben) → Projektion ohne Matrizen. Die Kamera sitzt auf einem Strahl unter P.ray Grad hinter dem Helden;
  // der Zoom s (1 … P.sMax) wird so gewählt, dass alle Gegner im Gefahrenradius im Bild bleiben – die ganze Karte zeigt die Minikarte.
  const shCam = { s: 1, pitch: 0 };
  function shoulderPose(P, hx, hz, s) {
    const r = P.ray * Math.PI / 180, d = P.dist * s, mx = (D.L + D.R) / 2;
    return { x: hx + P.shoulder * s + (mx - hx) * 0.2, y: Math.sin(r) * d, z: hz + Math.cos(r) * d };
  }
  function shoulderSees(P, C, x, z, h, tv, th) {
    const sp = Math.sin(shCam.pitch), cp = Math.cos(shCam.pitch), ry = h - C.y, rz = z - C.z, depth = -ry * sp - rz * cp;
    if (depth < 40) return false;
    const nx = (x - C.x) / (depth * th), ny = (ry * cp - rz * sp) / (depth * tv);
    return nx > -0.9 && nx < 0.9 && ny > -0.9 && ny < 1 - (2 * P.hud) / D.H;
  }
  // Zoom so klein wie möglich, aber jeder nahe Gegner (Rumpfhöhe) muss ins Bild passen
  function shoulderZoom(P, w, hx, hz, fov) {
    const tv = Math.tan(fov * Math.PI / 360), th = tv * (D.W / D.H);
    shCam.pitch = (P.ray * Math.PI / 180) - Math.atan(-P.heroNdc * tv); // Held liegt immer auf derselben Bildhöhe
    const near = [];
    for (const e of w.enemies) {
      if (e.dead || e.spawnT > 0 || e.under) continue;
      const dd = Math.hypot(e.x - hx, e.y - hz);
      if (dd < (e.def.boss ? P.danger * 1.8 : P.danger)) near.push(e);
    }
    let s = 1;
    for (; s < P.sMax; s += 0.08) {
      const C = shoulderPose(P, hx, hz, s);
      if (near.every((e) => shoulderSees(P, C, e.x, e.y, 20, tv, th))) break;
    }
    return Math.min(P.sMax, s);
  }
  function placeShoulderCamera(P, hx, hz, s) {
    const C = shoulderPose(P, hx, hz, s);
    camPos.set(C.x, C.y, C.z);
    camLook.set(C.x, C.y - Math.sin(shCam.pitch) * 100, C.z - Math.cos(shCam.pitch) * 100);
    applyCam(P.fov, 0);
  }
  // sichtbarer Bodenausschnitt (für die Minikarte): Bildecken auf den Boden projiziert
  const viewQuadPts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  const vqV = new T3.Vector3();
  function viewQuad() {
    if (!ready || !camera) return null;
    const top = 1 - (2 * 104) / D.H;
    [[-1, top], [1, top], [1, -1], [-1, -1]].forEach(([nx, ny], i) => {
      vqV.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
      // Strahl, der nicht nach unten zeigt (über dem Horizont), endet weit hinten
      const t = vqV.y < -0.02 ? -camera.position.y / vqV.y : 3000;
      viewQuadPts[i].x = camera.position.x + vqV.x * Math.min(t, 3000);
      viewQuadPts[i].y = camera.position.z + vqV.z * Math.min(t, 3000);
    });
    return viewQuadPts;
  }

  // Kamera so weit zurückziehen, dass die ganze Arena unter das HUD passt
  // v3.4: gemessen wird ein Fenster von VIEW_Z Einheiten (die alte Arena) – die Übersicht folgt dem Helden dann längs der Arena
  const VIEW_Z = 800;
  const topZ = (y) => Math.max(D.T + VIEW_Z / 2 + 30, Math.min(D.B - VIEW_Z / 2 + 30, y - 100));
  function fitCamera() {
    const hud = 104 / D.H;
    CAM.tx = (D.L + D.R) / 2;
    CAM.tz = D.T + VIEW_Z / 2 + 30;
    camera.fov = CAM.fov;
    camera.aspect = D.W / D.H;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const corners = [[D.L - 14, D.T - 60], [D.R + 14, D.T - 60], [D.L - 14, D.T + VIEW_Z + 30], [D.R + 14, D.T + VIEW_Z + 30]];
    let dist = 500, minY = 0, maxY = 0;
    for (; dist < 4000; dist += 10) {
      placeCamera(dist, 0, 0, true);
      let ok = true;
      minY = 9; maxY = -9;
      for (const [x, z] of corners) {
        pv.set(x, 0, z).project(camera);
        if (Math.abs(pv.x) > 1.0) ok = false;
        minY = Math.min(minY, pv.y); maxY = Math.max(maxY, pv.y);
      }
      if (ok && maxY - minY <= 2 - hud * 2) break;
    }
    CAM.dist = dist;
    const mid = (minY + maxY) / 2, bandMid = -hud;
    CAM.offY = ((bandMid - mid) / 2) * D.H;
    camera.setViewOffset(D.W, D.H, 0, CAM.offY, D.W, D.H);
    camera.updateProjectionMatrix();
    camOff = CAM.offY;
    placeCamera(dist);
  }

  function resize(cssW, cssH, pixelRatio) {
    if (!ready) return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssW, cssH, false);
  }

  function setBloom(on) { postWanted = !!on; } // gleiche Shader-Programme wie direkt – Umschalten kostet nichts
  function setQuality(q) {
    quality = q;
    if (!ready) return;
    const shadows = q >= 2;
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      const upd = (o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); };
      scene.traverse(upd);
      for (const list of pools.values()) for (const M of list) M.root.traverse(upd); // v3.2: auch geparkte Figuren wechseln zwischen vollem und sparsamem Oberflächen-Shader
      warmPending = true;
    }
    renderer.shadowMap.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // Raum: Boden, Wände, Tür, Hindernisse
  // ------------------------------------------------------------------
  const THEME = {
    street: { sky: 0x8090b8, ground: 0x2a2420, hemi: 2.4, moon: 0xa8b8ff, moonI: 2.4, fog: 0x0b1018, wall: "street" },
    hospital: { sky: 0xa8c8b8, ground: 0x30302a, hemi: 2.8, moon: 0xd8f0e8, moonI: 2.0, fog: 0x0e1612, wall: "hospital" },
    lab: { sky: 0x7fae90, ground: 0x1c2420, hemi: 2.2, moon: 0x9fffc8, moonI: 1.7, fog: 0x08100c, wall: "lab" },
    markt: { sky: 0xa89a88, ground: 0x2a2018, hemi: 2.5, moon: 0xffd9b4, moonI: 1.9, fog: 0x120e0b, wall: "markt" },
  };
  // Stadt-Look: München muss in zwei Sekunden anders wirken als Hamburg
  const CITY_GRADE = {
    heilbronn: { fog: 0x1c140c, sky: 0xc4a878, moon: 0xffd09a, hemiMul: 1.04, exposure: 1.08, fogNear: 1350, fogFar: 2450 },
    stuttgart: { fog: 0x0c1014, sky: 0x8aa0b8, moon: 0xc0d4ff, hemiMul: 0.94, exposure: 1.05, fogNear: 1450, fogFar: 2550 },
    muenchen: { fog: 0x181208, sky: 0xd4b888, moon: 0xffe0a8, hemiMul: 1.1, exposure: 1.18, fogNear: 1500, fogFar: 2700 },
    nuernberg: { fog: 0x0e141c, sky: 0xa8c0d8, moon: 0xe8f0ff, hemiMul: 0.9, exposure: 1.02, fogNear: 1200, fogFar: 2300 },
    leipzig: { fog: 0x121018, sky: 0x908898, moon: 0xd0c8d8, hemiMul: 0.92, exposure: 1.0, fogNear: 1400, fogFar: 2500 },
    berlin: { fog: 0x0a1018, sky: 0x6a88b0, moon: 0x88a8ff, hemiMul: 0.86, exposure: 0.98, fogNear: 1300, fogFar: 2400 },
    frankfurt: { fog: 0x0c1218, sky: 0x88b0c4, moon: 0xa8e0ff, hemiMul: 1.0, exposure: 1.12, fogNear: 1500, fogFar: 2700 },
    koeln: { fog: 0x1a1014, sky: 0xc898b0, moon: 0xffc0d8, hemiMul: 1.06, exposure: 1.14, fogNear: 1450, fogFar: 2600 },
    hamburg: { fog: 0x0c1414, sky: 0x88a8a0, moon: 0xc8e0d8, hemiMul: 0.84, exposure: 0.96, fogNear: 900, fogFar: 2100 },
    amsterdam: { fog: 0x0c1418, sky: 0x88a0b0, moon: 0xb0d0e0, hemiMul: 0.9, exposure: 1.0, fogNear: 1200, fogFar: 2300 },
    paris: { fog: 0x141018, sky: 0xb090a8, moon: 0xffd0e0, hemiMul: 1.02, exposure: 1.1, fogNear: 1400, fogFar: 2500 },
    wien: { fog: 0x10141c, sky: 0xb8c8d8, moon: 0xe8f0ff, hemiMul: 0.92, exposure: 1.04, fogNear: 1250, fogFar: 2350 },
    prag: { fog: 0x12100c, sky: 0xb8a078, moon: 0xffd8a0, hemiMul: 1.0, exposure: 1.08, fogNear: 1400, fogFar: 2500 },
  };
  const ROOF = { street: "#221d1a", hospital: "#2b322e", lab: "#1b2125", markt: "#6e2a1c" };
  const EDGE = { street: "#6b5a50", hospital: "#c9d4ce", lab: "#56626a", markt: "#8a7a62" };
  const PROP = { street: "#3a3532", hospital: "#5b6661", lab: "#38434a" };
  const LAMP = { street: "255,176,90", hospital: "205,255,235", lab: "130,255,150", markt: "255,196,120" };
  let room = null; // { group, floorTex, door: {...}, builtFor }
  let builtFloor = null;
  let warmPending = true; // Shader beim nächsten Bild vorab übersetzen (siehe warmShaders)

  // Normal-Map aus der Helligkeit eines Bildes (hell = erhaben): Fugen, Risse und Nieten
  // fangen so echtes Streiflicht von Taschenlampe und Lampen.
  function normalCanvas(src, strength, maxW = 1024) {
    const sc = Math.min(1, maxW / src.width);
    const w = Math.max(2, Math.round(src.width * sc)), h = Math.max(2, Math.round(src.height * sc));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), px = d.data, n = w * h;
    const lum = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) lum[i] = (px[j] * 0.3 + px[j + 1] * 0.59 + px[j + 2] * 0.11) / 255;
    for (let y = 0; y < h; y++) {
      const ya = (y > 0 ? y - 1 : y) * w, yb = (y < h - 1 ? y + 1 : y) * w, yr = y * w;
      for (let x = 0; x < w; x++) {
        const xa = x > 0 ? x - 1 : x, xb = x < w - 1 ? x + 1 : x;
        const dx = (lum[yr + xb] - lum[yr + xa]) * strength, dy = (lum[yb + x] - lum[ya + x]) * strength;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), j = (yr + x) * 4;
        px[j] = (0.5 - dx * inv * 0.5) * 255;
        px[j + 1] = (0.5 + dy * inv * 0.5) * 255;
        px[j + 2] = (0.5 + inv * 0.5) * 255;
        px[j + 3] = 255;
      }
    }
    g.putImageData(d, 0, 0);
    return c;
  }
  // Boden-Normal-Map auf der GPU: ein Shader-Durchgang in eine Render-Textur. Die CPU-Variante
  // musste die große Boden-Leinwand (720×1280) per getImageData von der Grafikkarte zurücklesen –
  // das blockierte jeden Raumwechsel rund eine Sekunde.
  let nm = null;
  function gpuNormalMap(src, strength, maxW, wrap, anisotropy) {
    if (!nm) {
      const mat = new T3.ShaderMaterial({
        uniforms: { src: { value: null }, texel: { value: new T3.Vector2() }, strength: { value: 1 } },
        vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        // Helligkeit wie auf der CPU aus den gespeicherten (sRGB-)Werten; Zeile darunter = kleineres v
        fragmentShader: `uniform sampler2D src; uniform vec2 texel; uniform float strength; varying vec2 vUv;
float lum(vec2 o) { return dot(texture2D(src, vUv + o * texel).rgb, vec3(0.3, 0.59, 0.11)); }
void main() {
  float dx = (lum(vec2(1.0, 0.0)) - lum(vec2(-1.0, 0.0))) * strength;
  float dy = (lum(vec2(0.0, -1.0)) - lum(vec2(0.0, 1.0))) * strength;
  gl_FragColor = vec4(normalize(vec3(-dx, dy, 1.0)) * 0.5 + 0.5, 1.0);
}`,
        depthTest: false, depthWrite: false,
      });
      const sc = new T3.Scene(), quad = new T3.Mesh(new T3.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      sc.add(quad);
      nm = { mat, sc, cam: new T3.Camera() };
    }
    const k = Math.min(1, maxW / src.width), w = Math.max(2, Math.round(src.width * k)), h = Math.max(2, Math.round(src.height * k));
    const input = new T3.CanvasTexture(src); // ohne sRGB-Umrechnung, nur für diesen Durchgang
    input.wrapS = input.wrapT = wrap;
    const rt = new T3.WebGLRenderTarget(w, h, { generateMipmaps: true, minFilter: T3.LinearMipmapLinearFilter, depthBuffer: false });
    rt.texture.wrapS = rt.texture.wrapT = wrap;
    rt.texture.anisotropy = anisotropy;
    rt.texture.userData.rt = rt;
    nm.mat.uniforms.src.value = input;
    nm.mat.uniforms.texel.value.set(1 / w, 1 / h);
    nm.mat.uniforms.strength.value = strength;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(nm.sc, nm.cam);
    renderer.setRenderTarget(prev);
    nm.mat.uniforms.src.value = null;
    input.dispose();
    return rt.texture;
  }
  // Render-Texturen gehören zu einem Render-Target – beide freigeben
  const disposeTex = (t) => (t.userData.rt ? t.userData.rt.dispose() : t.dispose());
  // Wände und Hindernisse: kleine Quellbilder im Hauptspeicher (siehe canvasTex), einmal je Art –
  // hier bleibt die CPU-Variante, weil diese Normal-Maps je Wand mit eigener Wiederholung geklont werden
  function normalTexFor(key, strength) {
    return texCache.get(`n:${key}`) || (() => {
      const src = texCache.get(key);
      const t = new T3.CanvasTexture(normalCanvas(src.image, strength));
      t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = 4;
      texCache.set(`n:${key}`, t);
      return t;
    })();
  }

  // Wände: 256×128 Pixel = 128×64 Welteinheiten (volle Wandhöhe)
  function wallTexture(kind) {
    return tex(`wall:${kind}`, 256, 128, (g) => {
      let s = kind.length * 977;
      const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      if (kind === "street") {
        g.fillStyle = "#3a2a25"; g.fillRect(0, 0, 256, 128);
        for (let y = 0, row = 0; y < 128; y += 12, row++) for (let x = (row % 2) * -14; x < 256; x += 28) {
          const v = Math.floor(R() * 26) - 13, broken = R() < 0.05;
          g.fillStyle = broken ? "#2a1f1b" : `rgb(${96 + v},${58 + v / 2},${46 + v / 3})`;
          g.fillRect(x + 1, y + 1, 26, 10);
          if (!broken) {
            g.fillStyle = "rgba(255,220,200,0.12)"; g.fillRect(x + 1, y + 1, 26, 1.5);
            g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + 1, y + 9.5, 26, 1.5);
            for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "0,0,0" : "255,200,170"},0.12)`; g.fillRect(x + 2 + R() * 22, y + 2 + R() * 7, 2, 1.5); }
          }
        }
        // Graffiti: Bubble-Letters mit Outline und Laufnasen, dazu Kritzel-Tags; Plakat, Dreck und Moos unten
        g.save(); g.lineCap = "round"; g.lineJoin = "round";
        const piece = (txt, x, y, size, fill, line, rot) => {
          g.save(); g.translate(x, y); g.rotate(rot); g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; g.textBaseline = "middle";
          g.globalAlpha = 0.85; g.lineWidth = size * 0.22; g.strokeStyle = "#0c0c0e"; g.strokeText(txt, 0, 0);
          g.lineWidth = size * 0.1; g.strokeStyle = line; g.strokeText(txt, 0, 0);
          g.fillStyle = fill; g.fillText(txt, 0, 0);
          g.globalAlpha = 0.5; g.fillStyle = "#ffffff"; g.fillRect(2, -size * 0.32, g.measureText(txt).width * 0.85, size * 0.07);
          g.globalAlpha = 0.7; g.fillStyle = fill; const w2 = g.measureText(txt).width;
          for (let k = 0; k < 5; k++) g.fillRect(R() * w2, size * 0.3, 1.6, 6 + R() * 16);
          g.restore();
        };
        piece("RAUS!", 22, 46, 30, "#e5383b", "#ffd23a", -0.06);
        piece("N-17", 118, 82, 20, "#2bd9ff", "#ffffff", 0.05);
        g.globalAlpha = 0.65; g.lineWidth = 2.2;
        for (const col of ["#a8ff3e", "#ffffff"]) { g.strokeStyle = col; g.beginPath(); let x = 120 + R() * 30, y = 28 + R() * 10; g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += 4 + R() * 5; y += (R() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
        g.restore();
        g.fillStyle = "#d8cfb8"; g.fillRect(170, 26, 34, 46); g.fillStyle = "#b02a2a"; g.fillRect(174, 30, 26, 14); g.fillStyle = "#333"; for (let l = 48; l < 68; l += 4) g.fillRect(174, l, 26, 1.5);
        g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(204, 26, 2, 46);
        const gr = g.createLinearGradient(0, 80, 0, 128); gr.addColorStop(0, "rgba(10,14,8,0)"); gr.addColorStop(1, "rgba(10,14,8,0.65)"); g.fillStyle = gr; g.fillRect(0, 80, 256, 48);
        for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(60,${90 + R() * 40},40,0.5)`; g.fillRect(R() * 256, 112 + R() * 16, 2, 2); }
      } else if (kind === "hospital") {
        g.fillStyle = "#a9b8b0"; g.fillRect(0, 0, 256, 128);
        for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "0,0,0" : "255,255,255"},0.05)`; g.fillRect(R() * 256, R() * 60, 3, 3); }
        // Wasserflecken
        for (let k = 0; k < 3; k++) { const x = R() * 256; const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, "rgba(90,80,40,0.25)"); gr.addColorStop(1, "rgba(90,80,40,0)"); g.fillStyle = gr; g.fillRect(x, 0, 14 + R() * 20, 60); }
        // Kacheln unten mit Fugen
        for (let y = 64; y < 120; y += 14) for (let x = 0; x < 256; x += 14) {
          const v = Math.floor(R() * 10) - 5;
          g.fillStyle = `rgb(${96 + v},${128 + v},${116 + v})`; g.fillRect(x + 1, y + 1, 12, 12);
          g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x + 1, y + 1, 12, 1.5);
          g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + 1, y + 11.5, 12, 1.5);
          if (R() < 0.04) { g.fillStyle = "#4a4a44"; g.fillRect(x + 1, y + 1, 12, 12); }
        }
        // Handlauf
        g.fillStyle = "#5a4a3a"; g.fillRect(0, 56, 256, 7); g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(0, 56, 256, 2); g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(0, 62, 256, 2);
        g.fillStyle = "#2f3a35"; g.fillRect(0, 120, 256, 8);
        // Blutspritzer
        for (let k = 0; k < 2; k++) { const x = 40 + R() * 180, y = 30 + R() * 50; for (let j = 0; j < 14; j++) { g.fillStyle = "rgba(120,10,14,0.7)"; g.beginPath(); g.arc(x + (R() - 0.5) * 24, y + (R() - 0.5) * 18, 1 + R() * 3, 0, TAU); g.fill(); } g.fillStyle = "rgba(120,10,14,0.5)"; g.fillRect(x, y, 2, 20 + R() * 20); }
      } else if (kind === "markt") {
        // Fachwerk: heller Putz, dunkle Balken (Ständer, Riegel, Streben), Fenster mit Läden und Blumenkasten, Sockel aus Sandstein
        g.fillStyle = "#e4d9c2"; g.fillRect(0, 0, 256, 128);
        for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "120,100,70" : "255,255,255"},0.06)`; g.fillRect(R() * 256, R() * 104, 3, 3); }
        g.fillStyle = "#8a7a62"; g.fillRect(0, 104, 256, 24);
        for (let x = 0; x < 256; x += 32) { g.fillStyle = `rgb(${130 + Math.floor(R() * 20)},${116 + Math.floor(R() * 16)},${92})`; g.fillRect(x + 1, 106, 30, 9); g.fillRect(x + 17 - 16 * ((x / 32) % 2), 117, 30, 9); }
        const beam = (x1, y1, x2, y2, w = 6) => { g.strokeStyle = "#3e2616"; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = "rgba(255,220,180,0.1)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x1 - 2, y1); g.lineTo(x2 - 2, y2); g.stroke(); };
        g.lineCap = "butt";
        beam(0, 3, 256, 3, 7); beam(0, 52, 256, 52, 6); beam(0, 101, 256, 101, 7);
        for (let x = 0; x <= 256; x += 64) beam(x, 0, x, 104, 7);
        for (let i = 0; i < 4; i++) {
          const x0 = i * 64;
          if (i % 2 === 0) { beam(x0 + 4, 50, x0 + 60, 6, 5); beam(x0 + 4, 6, x0 + 60, 50, 5); beam(x0 + 4, 99, x0 + 32, 56, 5); beam(x0 + 60, 99, x0 + 32, 56, 5); }
          else {
            // Fenster mit Sprossen, Läden und Blumenkasten
            for (const wy of [12, 60]) {
              g.fillStyle = "#1c2430"; g.fillRect(x0 + 18, wy, 28, 30);
              g.fillStyle = "rgba(255,200,120,0.35)"; if (R() < 0.5) g.fillRect(x0 + 19, wy + 1, 26, 28);
              g.fillStyle = "#3e2616"; g.fillRect(x0 + 31, wy, 2, 30); g.fillRect(x0 + 18, wy + 14, 28, 2);
              const sh = R() < 0.5 ? "#2f5a34" : "#7a2a1c";
              g.fillStyle = sh; g.fillRect(x0 + 8, wy, 9, 30); g.fillRect(x0 + 47, wy, 9, 30);
              g.fillStyle = "rgba(0,0,0,0.3)"; for (let k = wy + 3; k < wy + 30; k += 4) { g.fillRect(x0 + 9, k, 7, 1); g.fillRect(x0 + 48, k, 7, 1); }
              g.fillStyle = "#5a3a1e"; g.fillRect(x0 + 16, wy + 30, 32, 5);
              for (let k = 0; k < 6; k++) { g.fillStyle = R() < 0.5 ? "#d8283a" : "#ff6a8a"; g.beginPath(); g.arc(x0 + 19 + k * 5.2, wy + 29, 2.2, 0, TAU); g.fill(); }
            }
          }
        }
      } else {
        g.fillStyle = "#20272c"; g.fillRect(0, 0, 256, 128);
        for (let x = 0; x < 256; x += 64) {
          g.fillStyle = "#38424a"; g.fillRect(x + 3, 3, 58, 98);
          g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(x + 3, 3, 58, 2); g.fillRect(x + 3, 3, 2, 98);
          g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(x + 3, 99, 58, 2); g.fillRect(x + 59, 3, 2, 98);
          for (const [nx, ny] of [[8, 8], [56, 8], [8, 96], [56, 96]]) { g.fillStyle = "#8a949b"; g.beginPath(); g.arc(x + nx, ny, 1.8, 0, TAU); g.fill(); }
          if ((x / 64) % 2) { for (let y = 20; y < 60; y += 6) { g.fillStyle = "#14191c"; g.fillRect(x + 14, y, 36, 3); g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(x + 14, y + 3, 36, 1); } }
          else { g.fillStyle = "#d9b21a"; g.beginPath(); g.moveTo(x + 32, 26); g.lineTo(x + 46, 50); g.lineTo(x + 18, 50); g.closePath(); g.fill(); g.fillStyle = "#111"; g.fillRect(x + 31, 33, 2, 9); g.fillRect(x + 31, 44, 2, 2); }
        }
        // Rohre
        for (const [y, r, col] of [[106, 4, "#4a5a52"], [114, 3, "#7a3a2a"]]) { const gr = g.createLinearGradient(0, y - r, 0, y + r); gr.addColorStop(0, "#9aa8a0"); gr.addColorStop(0.4, col); gr.addColorStop(1, "#0c0f10"); g.fillStyle = gr; g.fillRect(0, y - r, 256, r * 2); }
        for (let x = 0; x < 256; x += 16) { g.fillStyle = (x / 16) % 2 ? "#151515" : "#d9b21a"; g.fillRect(x, 120, 16, 8); }
      }
      // Gebrauchsspuren über alles: Schmutzfahnen von oben, Einschusslöcher, Blut
      grunge(g, 256, 128, R, { grain: 0.06, scratches: 10, dirt: 6, edge: 0, rust: kind === "lab" ? 6 : 0 });
      for (let k = 0; k < 16; k++) { const x = R() * 256, l = 30 + R() * 60, gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(0,0,0,${0.12 + R() * 0.2})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x, 0, 1 + R() * 4, l); }
      for (let k = 0; k < 5; k++) {
        const x = 10 + R() * 236, y = 20 + R() * 70;
        g.fillStyle = "rgba(0,0,0,0.75)"; g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.16)"; g.lineWidth = 0.6; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.stroke();
      }
      if (kind !== "hospital") bloodSplat(g, 60 + R() * 140, 40 + R() * 40, 10 + R() * 6, R, kind === "markt" ? 0.4 : 0.55);
    }, true);
  }
  // Dachfläche (Bitumen mit Kies), kachelbar
  function roofTexture(kind) {
    return tex(`roof:${kind}`, 128, 128, (g) => {
      let s = 31 + kind.length;
      const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      g.fillStyle = ROOF[kind] || ROOF.street; g.fillRect(0, 0, 128, 128);
      if (kind === "markt") {
        // Biberschwanz-Ziegel: große versetzte Reihen mit runden Enden, dunkle Fugen,
        // Licht oben / Schatten unten je Ziegel, vereinzelt dunklere und moosige Steine
        g.fillStyle = "#2a120b"; g.fillRect(0, 0, 128, 128);
        for (let y = -8, row = 0; y < 128; y += 16, row++) for (let x = -(row % 2) * 8; x < 128; x += 16) {
          const v = Math.floor(R() * 34) - 17, dark = R() < 0.12 ? -30 : 0, moss = R() < 0.07;
          const r = 150 + v + dark, gg = 62 + v / 2 + dark / 2, b = 40 + v / 3 + dark / 3;
          const grd = g.createLinearGradient(0, y, 0, y + 20);
          grd.addColorStop(0, `rgb(${r + 24},${gg + 14},${b + 8})`); grd.addColorStop(0.55, `rgb(${r},${gg},${b})`); grd.addColorStop(1, `rgb(${r - 46},${gg - 26},${b - 16})`);
          g.fillStyle = grd; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 15, y); g.lineTo(x + 15, y + 13); g.arc(x + 8, y + 13, 7, 0, Math.PI); g.closePath(); g.fill();
          if (moss) { g.fillStyle = "rgba(70,90,40,0.55)"; g.beginPath(); g.arc(x + 4 + R() * 8, y + 14, 3 + R() * 2, 0, TAU); g.fill(); }
          g.fillStyle = "rgba(255,220,190,0.18)"; g.fillRect(x + 2, y + 1, 12, 1.2);
        }
        for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "255,240,220" : "0,0,0"},${0.03 + R() * 0.07})`; g.fillRect(R() * 128, R() * 128, 0.8, 0.8); }
        return;
      }
      // ausgebesserte Stellen (dunkler Teer), dann feiner Kies
      for (let k = 0; k < 4; k++) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(R() * 110, R() * 110, 10 + R() * 26, 6 + R() * 16); }
      for (let k = 0; k < 3600; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + R() * 0.1})`; const sz = 0.5 + R() * 1.1; g.fillRect(R() * 128, R() * 128, sz, sz); }
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; for (let y = 0; y < 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
      g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 0.5; for (let y = 1; y < 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    }, true);
  }

  // ------------------------------------------------------------------
  // v3.5 Stadtkulisse: Häuserfassaden zur Arena hin – Läden mit Leuchtreklame, Fenster (teils erleuchtet,
  // zerbrochen, vernagelt), SOS-Laken, Fallrohre. Eine Farb- und eine Leucht-Karte aus demselben Zeichendurchgang.
  // Ein Streifen: 512×256 logische Pixel = FAC_W Welteinheiten breit, volle Blockhöhe hoch.
  // ------------------------------------------------------------------
  const FAC_W = 256;
  const SHOPS = {
    street: [["APOTHEKE", "60,230,120", 1], ["DÖNER", "255,170,60"], ["KIOSK", "255,220,90"], ["SPÄTI", "120,200,255"], ["FRISEUR", "255,110,190"], ["BÄCKEREI", "255,200,120"], ["SPIELHALLE", "255,70,210"], ["IMBISS", "255,140,60"], ["HANDYSHOP", "90,200,255"], ["SPARKASSE", "255,60,50"], ["TABAK", "255,210,120"], ["PIZZA", "255,120,70"]],
    markt: [["WEINSTUBE", "255,190,110"], ["METZGEREI", "255,130,110"], ["CAFÉ", "255,215,150"], ["GASTHAUS", "255,180,90"], ["BÜCHER", "255,220,170"], ["APOTHEKE", "60,230,120", 1], ["BRAUHAUS", "255,190,80"], ["KONDITOREI", "255,170,200"]],
    hospital: [["NOTAUFNAHME", "255,60,50"], ["RADIOLOGIE", "120,200,255"], ["APOTHEKE", "60,230,120", 1], ["STATION 3", "200,230,255"], ["LABOR", "120,255,200"], ["CAFETERIA", "255,210,140"]],
    lab: [["SPERRZONE", "255,70,40"], ["BIO-LABOR 2", "120,255,160"], ["DEKON", "255,220,60"], ["KÜHLRAUM", "120,220,255"], ["SERVER", "90,160,255"], ["ZUTRITT VERBOTEN", "255,60,60"]],
  };
  const PLASTER = { street: ["#b8a98e", "#9c8e7a", "#a89272", "#8f9a8a", "#b07a5e", "#8a8f96", "#c2b49a", "#7e7466"], markt: ["#e6dcc6", "#eadfca", "#dccfb4", "#e8d8bc"], hospital: ["#d8dcda", "#cfd6d4", "#e2e4e0"], lab: ["#6e767a", "#5e666a", "#7a8084"] };
  function facadeTextures(theme) {
    const key = `fac:${theme}`;
    if (texCache.has(key)) return { map: texCache.get(key), emi: texCache.get(`facE:${theme}`) };
    let s = 0; for (const ch of theme) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    s = (s + 4243) >>> 0;
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const pick = (a) => a[Math.floor(R() * a.length) % a.length];
    const W = 512, H = 256, lights = []; // Leucht-Ebene: Zeichenbefehle für die zweite Leinwand
    const glow = (fn) => lights.push(fn);
    const shops = SHOPS[theme] || SHOPS.street, plaster = PLASTER[theme] || PLASTER.street;
    // Fenster: Rahmen, Glas mit Spiegelung, Sims; Zustand: dunkel, erleuchtet, Fernseher, zerbrochen, vernagelt, Vorhang
    const win = (g, x, y, w, h, frame, state, cross = 0) => {
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x - 2, y - 2, w + 4, h + 5); // Laibung
      g.fillStyle = frame; g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
      if (state === "lit" || state === "tv") {
        const warm = state === "lit", gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, warm ? "#e8b860" : "#6a9ad8"); gr.addColorStop(1, warm ? "#a8682a" : "#2a4a88");
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(40,20,10,0.55)"; g.fillRect(x + w * 0.1, y + h * 0.55, w * (0.3 + R() * 0.3), h * 0.45); // Möbel-Silhouette
        if (R() < 0.25) { g.fillStyle = "rgba(20,10,6,0.8)"; g.beginPath(); g.ellipse(x + w * (0.3 + R() * 0.4), y + h * 0.42, w * 0.13, h * 0.2, 0, 0, TAU); g.fill(); g.fillRect(x + w * 0.25, y + h * 0.55, w * 0.32, h * 0.45); } // Gestalt am Fenster
        const k = 0.45 + R() * 0.45;
        glow((e) => { const eg = e.createLinearGradient(0, y, 0, y + h); eg.addColorStop(0, warm ? `rgba(255,190,100,${k})` : `rgba(110,160,255,${k})`); eg.addColorStop(1, warm ? `rgba(200,110,40,${k * 0.7})` : `rgba(50,90,200,${k * 0.7})`); e.fillStyle = eg; e.fillRect(x, y, w, h); });
      } else if (state === "broken") {
        g.fillStyle = "#07090b"; g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(170,190,200,0.5)";
        for (let k = 0; k < 4; k++) { const cx = x + (k % 2 ? w : 0), cy = y + (k < 2 ? 0 : h); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (k % 2 ? -1 : 1) * w * (0.2 + R() * 0.4), cy); g.lineTo(cx, cy + (k < 2 ? 1 : -1) * h * (0.2 + R() * 0.4)); g.fill(); } // Scherben in den Ecken
      } else if (state === "boarded") {
        g.fillStyle = "#0c0e10"; g.fillRect(x, y, w, h);
        for (let k = 0; k < 3; k++) { g.save(); g.translate(x + w / 2, y + h * (0.22 + k * 0.28)); g.rotate((R() - 0.5) * 0.5); g.fillStyle = `rgb(${110 + R() * 30 | 0},${80 + R() * 20 | 0},${50 + R() * 14 | 0})`; g.fillRect(-w * 0.62, -3, w * 1.24, 6); g.fillStyle = "#333"; g.fillRect(-w * 0.5, -1, 1.5, 1.5); g.fillRect(w * 0.45, -1, 1.5, 1.5); g.restore(); }
      } else {
        const gr = g.createLinearGradient(x, y, x + w, y + h);
        gr.addColorStop(0, "#1c2630"); gr.addColorStop(0.45, "#0d1318"); gr.addColorStop(1, "#151d24");
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(160,190,220,0.14)"; g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.05, y + h * 0.7); g.lineTo(x, y + h * 0.5); g.fill(); // Spiegelung
        if (state === "curtain") { g.fillStyle = pick(["rgba(150,60,50,0.8)", "rgba(200,190,160,0.75)", "rgba(70,90,120,0.8)"]); g.fillRect(x, y, w * 0.3, h); g.fillRect(x + w * 0.7, y, w * 0.3, h); }
      }
      if (cross) { g.fillStyle = frame; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x, y + h * 0.38, w, 2); } // Sprossen
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x - 3, y + h + 1, w + 6, 2.5); // Sims
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x - 3, y + h + 3.5, w + 6, 1.5);
    };
    const winState = () => { const r = R(); return r < 0.2 ? "lit" : r < 0.25 ? "tv" : r < 0.34 ? "broken" : r < 0.42 ? "boarded" : r < 0.54 ? "curtain" : "dark"; };
    // Leuchtschrift: farbiges Schild, auf der Leucht-Ebene als Neon (teils kaputt = dunkel)
    const sign = (g, x, y, w, h, [txt, rgb, cross], lit, bg = "#15181c") => {
      g.fillStyle = bg; g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x, y, w, 1.2);
      const fs = Math.min(h * 0.72, (w - (cross ? h + 6 : 6)) / (txt.length * 0.62));
      const tx = x + (cross ? h + 4 : 3) + Math.max(0, (w - (cross ? h + 6 : 6) - txt.length * fs * 0.62) / 2);
      const font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
      g.font = font; g.textBaseline = "middle"; g.fillStyle = lit ? `rgb(${rgb})` : `rgba(${rgb},0.45)`; g.fillText(txt, tx, y + h / 2 + 0.5);
      const crossAt = (c, col) => { c.fillStyle = col; const cx = x + 2 + h / 2, cy = y + h / 2, a = h * 0.36, b = h * 0.12; c.fillRect(cx - a, cy - b, a * 2, b * 2); c.fillRect(cx - b, cy - a, b * 2, a * 2); };
      if (cross) crossAt(g, `rgb(${rgb})`);
      if (lit) glow((e) => { e.fillStyle = `rgba(${rgb},0.2)`; e.fillRect(x, y, w, h); e.font = font; e.textBaseline = "middle"; e.shadowColor = `rgb(${rgb})`; e.shadowBlur = 6; e.fillStyle = `rgb(${rgb})`; e.fillText(txt, tx, y + h / 2 + 0.5); if (cross) crossAt(e, `rgb(${rgb})`); e.shadowBlur = 0; }); // v3.6 Leuchtkasten
    };
    const map = canvasTex(W, H, (g) => {
      g.fillStyle = "#2a2622"; g.fillRect(0, 0, W, H);
      let x = 0;
      while (x < W) {
        const bw = Math.min(W - x, 110 + Math.floor(R() * 70)), last = W - x - bw < 90;
        const w2 = last ? W - x : bw, col = pick(plaster);
        g.fillStyle = col; g.fillRect(x, 0, w2, H);
        // Putz-/Plattenstruktur
        for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + R() * 0.05})`; g.fillRect(x + R() * w2, R() * H, 2 + R() * 10, 1 + R() * 4); }
        const groundY = 150; // Erdgeschoss ab hier (≈ 53 Welteinheiten hoch)
        if (theme === "markt") {
          // Fachwerk: dunkle Balken in den Obergeschossen, Sandstein-Erdgeschoss
          const beam = "#3a2416";
          g.fillStyle = "#b79a74"; g.fillRect(x, groundY, w2, H - groundY);
          for (let yy = groundY + 10; yy < H; yy += 12) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, yy, w2, 1); }
          g.fillStyle = beam;
          for (const yy of [14, 80, groundY - 6]) g.fillRect(x, yy, w2, 6);
          for (let px = x + 4; px < x + w2 - 4; px += 34) { g.fillRect(px, 14, 5, groundY - 14); }
          for (let px = x + 4; px < x + w2 - 38; px += 34) for (const [y0, y1] of [[20, 80], [86, groundY - 6]]) { g.save(); g.strokeStyle = beam; g.lineWidth = 4; g.beginPath(); if (R() < 0.5) { g.moveTo(px + 5, y1); g.lineTo(px + 34, y0); } else { g.moveTo(px + 5, y0); g.lineTo(px + 18, (y0 + y1) / 2); g.lineTo(px + 34, y0); } g.stroke(); g.restore(); }
          for (const wy of [30, 96]) for (let px = x + 12; px < x + w2 - 24; px += 34) {
            const st = winState(); win(g, px, wy, 16, 30, "#e8e0d0", st, 1);
            if (st !== "broken" && R() < 0.55) { g.fillStyle = pick(["#2f5a2a", "#6a1e18", "#264a6a"]); g.fillRect(px - 7, wy, 5, 30); g.fillRect(px + 18, wy, 5, 30); } // Fensterläden
            if (R() < 0.4) { g.fillStyle = "#4a3020"; g.fillRect(px - 2, wy + 31, 20, 4); for (let f = 0; f < 5; f++) { g.fillStyle = pick(["#d02830", "#e8d040", "#e070a0", "#3a7a2a"]); g.beginPath(); g.arc(px + 1 + f * 3.6, wy + 31, 2, 0, TAU); g.fill(); } } // Blumenkasten
          }
        } else if (theme === "hospital") {
          g.fillStyle = "rgba(0,0,0,0.12)"; for (let yy = 0; yy < H; yy += 32) g.fillRect(x, yy, w2, 1); for (let px = x; px < x + w2; px += 40) g.fillRect(px, 0, 1, groundY);
          g.fillStyle = "#2a62a8"; g.fillRect(x, groundY - 12, w2, 6); // blaues Band
          for (const wy of [22, 84]) for (let px = x + 8; px < x + w2 - 28; px += 40) {
            const st = winState(); win(g, px, wy, 30, 34, "#9aa4a8", st === "tv" ? "lit" : st);
            if (st === "dark" || st === "curtain") { g.fillStyle = "rgba(220,225,220,0.35)"; for (let l = 0; l < 7; l++) g.fillRect(px, wy + 2 + l * 4.6, 30, 1.6); } // Jalousie
          }
        } else if (theme === "lab") {
          g.fillStyle = "rgba(0,0,0,0.25)"; for (let yy = 0; yy < H; yy += 42) g.fillRect(x, yy, w2, 1.5); for (let px = x; px < x + w2; px += 56) g.fillRect(px, 0, 1.5, H);
          for (let k = 0; k < 14; k++) { g.fillStyle = "rgba(255,255,255,0.05)"; g.beginPath(); g.arc(x + R() * w2, R() * groundY, 1.2, 0, TAU); g.fill(); } // Ankerlöcher
          for (const wy of [30, 92]) { // Fensterbänder
            const lit = R() < 0.5, gr = g.createLinearGradient(0, wy, 0, wy + 22);
            gr.addColorStop(0, lit ? "#7ad8b8" : "#141c20"); gr.addColorStop(1, lit ? "#2a7a6a" : "#0a1014");
            g.fillStyle = "#30383c"; g.fillRect(x + 6, wy - 2, w2 - 12, 26);
            g.fillStyle = gr; g.fillRect(x + 8, wy, w2 - 16, 22);
            g.fillStyle = "#30383c"; for (let px = x + 8; px < x + w2 - 8; px += 24) g.fillRect(px, wy, 2, 22);
            if (lit) { const k = 0.4 + R() * 0.4; glow((e) => { e.fillStyle = `rgba(110,255,200,${k})`; e.fillRect(x + 8, wy, w2 - 16, 22); }); }
          }
          g.save(); g.translate(x + 4, groundY - 10); for (let k = 0; k < w2 / 10; k++) { g.fillStyle = k % 2 ? "#1a1a1a" : "#e8b818"; g.beginPath(); g.moveTo(k * 10, 0); g.lineTo(k * 10 + 6, 0); g.lineTo(k * 10 + 2, 7); g.lineTo(k * 10 - 4, 7); g.fill(); } g.restore(); // Warnstreifen
        } else {
          // Straße: Gründerzeit-Putz mit Gesimsen, Fenster in zwei Obergeschossen, Balkon, Fallrohr
          g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(x, 10, w2, 4); g.fillRect(x, 76, w2, 3);
          g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x, 14, w2, 2); g.fillRect(x, 79, w2, 2);
          const n = Math.max(2, Math.floor(w2 / 38)), gap = w2 / n;
          for (const wy of [26, 90]) for (let k = 0; k < n; k++) {
            const px = x + gap * k + gap / 2 - 10, st = winState();
            win(g, px, wy, 20, 36, pick(["#e8e4dc", "#d8d0c0", "#4a3a2a"]), st, R() < 0.5 ? 1 : 0);
            if (wy === 26) { g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(px - 4, wy - 7, 28, 3); } // Verdachung
          }
          if (R() < 0.6) { const bx = x + gap * Math.floor(R() * n) + gap / 2 - 18; g.fillStyle = "#1c1e20"; g.fillRect(bx, 126, 36, 3); for (let k = 0; k <= 9; k++) g.fillRect(bx + k * 4, 114, 1.2, 12); g.fillRect(bx, 113, 36, 1.6); } // Balkongitter
          if (R() < 0.35) { const ax = x + 10 + R() * (w2 - 40); g.fillStyle = "#8a9094"; g.fillRect(ax, 62, 18, 11); g.fillStyle = "#5a6064"; g.beginPath(); g.arc(ax + 9, 67.5, 4, 0, TAU); g.fill(); } // Klimagerät
        }
        // SOS-Laken aus einem Fenster (Überlebende haben um Hilfe gerufen)
        if (theme !== "lab" && R() < 0.42) {
          const sx = x + 14 + R() * (w2 - 60), sy = 38 + R() * 20, sw = 30 + R() * 12, sh = 40 + R() * 16;
          g.save(); g.translate(sx, sy); g.rotate((R() - 0.5) * 0.08);
          g.fillStyle = "#e4e0d6"; g.beginPath(); g.moveTo(0, 0); g.lineTo(sw, 0); g.lineTo(sw - 2, sh); g.lineTo(sw * 0.6, sh - 4); g.lineTo(sw * 0.3, sh + 2); g.lineTo(2, sh - 3); g.closePath(); g.fill();
          g.fillStyle = "rgba(0,0,0,0.12)"; for (let k = 1; k < 4; k++) g.fillRect(sw * k / 4, 0, 1.2, sh);
          g.fillStyle = "#a8141a"; g.font = `900 ${sw * 0.36}px "Arial Black", Impact, sans-serif`; g.textBaseline = "middle"; g.fillText(pick(["SOS", "HILFE", "LEBEN!", "3 HIER"]), 3, sh * 0.45, sw - 6);
          g.restore();
        }
        // Erdgeschoss: Laden mit Schaufenster, Tür, Schild – oder heruntergelassener Rollladen mit Graffiti
        if (theme !== "markt") { g.fillStyle = theme === "lab" ? "#454c50" : theme === "hospital" ? "#b8bebc" : "#5a524a"; g.fillRect(x, groundY, w2, H - groundY); }
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x, groundY, w2, 3);
        const shop = pick(shops), lit = R() < 0.78, open = R() < 0.7; // v3.6 belebtere Erdgeschosse
        const sx0 = x + 8, sw0 = w2 - 16, signY = groundY + 8;
        sign(g, sx0, signY, sw0, 16, shop, lit, theme === "markt" ? "#2a1c12" : "#15181c");
        const wy0 = groundY + 32, wh0 = H - wy0 - 14, doorW = 26, dx = x + (R() < 0.5 ? 10 : w2 - 10 - doorW);
        if (open) {
          const glassX = dx > x + w2 / 2 ? x + 10 : dx + doorW + 6, glassW = w2 - doorW - 26;
          const inLit = R() < 0.72;
          const gr = g.createLinearGradient(0, wy0, 0, wy0 + wh0);
          gr.addColorStop(0, inLit ? "#c89850" : "#182028"); gr.addColorStop(1, inLit ? "#6a4422" : "#0a0e12");
          g.fillStyle = "#202428"; g.fillRect(glassX - 2, wy0 - 2, glassW + 4, wh0 + 4);
          g.fillStyle = gr; g.fillRect(glassX, wy0, glassW, wh0);
          if (inLit) { for (let k = 0; k < 4; k++) { g.fillStyle = "rgba(40,20,10,0.5)"; g.fillRect(glassX + 4 + k * glassW / 4, wy0 + wh0 * 0.5, glassW / 5, wh0 * 0.5); } const k = 0.35 + R() * 0.3; glow((e) => { e.fillStyle = `rgba(255,180,100,${k})`; e.fillRect(glassX, wy0, glassW, wh0); }); }
          if (R() < 0.45) { // eingeschlagen
            g.fillStyle = "#06080a"; g.beginPath(); g.moveTo(glassX + glassW * 0.3, wy0 + wh0); g.lineTo(glassX + glassW * 0.45, wy0 + wh0 * 0.2); g.lineTo(glassX + glassW * 0.62, wy0 + wh0 * 0.55); g.lineTo(glassX + glassW * 0.8, wy0 + wh0); g.fill();
            g.strokeStyle = "rgba(200,220,230,0.45)"; g.lineWidth = 0.7; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(glassX + glassW * 0.5, wy0 + wh0 * 0.5); g.lineTo(glassX + R() * glassW, wy0 + R() * wh0); g.stroke(); }
          }
          g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(glassX, wy0, glassW, 2);
        } else {
          g.fillStyle = "#6a6c6e"; g.fillRect(x + 6, wy0 - 4, w2 - 12, wh0 + 4); // Rollladen
          for (let yy = wy0 - 4; yy < wy0 + wh0; yy += 4) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + 6, yy, w2 - 12, 1); g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(x + 6, yy + 1, w2 - 12, 1); }
          g.save(); g.font = `900 ${14 + R() * 6}px Impact, "Arial Black", sans-serif`; g.textBaseline = "middle"; g.lineWidth = 3; g.strokeStyle = "#0a0a0c";
          const tag = pick(["RAUS!", "NICHT ÖFFNEN", "TOT", "KING", "HN 07", "WIR LEBEN", "EVAC→"]), tc = pick(["#e83a2a", "#3ad8e8", "#e8d83a", "#d83ae8", "#f0f0f0"]);
          g.translate(x + 14, wy0 + wh0 * 0.5); g.rotate((R() - 0.5) * 0.15); g.strokeText(tag, 0, 0, w2 - 30); g.fillStyle = tc; g.fillText(tag, 0, 0, w2 - 30); g.restore();
        }
        // Tür
        g.fillStyle = "#121416"; g.fillRect(dx - 2, wy0 - 6, doorW + 4, H - wy0 - 8);
        g.fillStyle = open ? "#2a3238" : "#3a2a20"; g.fillRect(dx, wy0 - 4, doorW, H - wy0 - 12);
        g.fillStyle = "rgba(160,190,210,0.25)"; g.fillRect(dx + 4, wy0, doorW - 8, (H - wy0) * 0.45);
        g.fillStyle = "#c8b070"; g.fillRect(dx + doorW - 6, wy0 + (H - wy0) * 0.5, 3, 2);
        g.fillStyle = "#e8e8e0"; g.fillRect(dx + doorW / 2 - 5, wy0 - 12, 10, 6); g.fillStyle = "#2a4a8a"; g.font = "bold 5px sans-serif"; g.fillText(String(2 + Math.floor(R() * 60)), dx + doorW / 2 - 3, wy0 - 9); // Hausnummer
        if (R() < 0.4) handprint(g, x + 20 + R() * (w2 - 40), wy0 + 10 + R() * 30, 9, (R() - 0.5) * 0.8, R);
        // Sockel, Dreck, Fallrohr zum Nachbarhaus
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, H - 10, w2, 10);
        const gb = g.createLinearGradient(0, H, 0, H - 40); gb.addColorStop(0, "rgba(20,16,12,0.5)"); gb.addColorStop(1, "rgba(20,16,12,0)"); g.fillStyle = gb; g.fillRect(x, H - 40, w2, 40);
        g.fillStyle = "#3c4044"; g.fillRect(x + w2 - 5, 0, 4, H - 8); g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x + w2 - 5, 0, 1, H - 8);
        for (let yy = 20; yy < H - 20; yy += 46) { g.fillStyle = "#2a2e32"; g.fillRect(x + w2 - 7, yy, 8, 2); }
        // Dachkante
        g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(x, 0, w2, 6);
        x += w2;
      }
      weather(g, W, H, `wall:fac-${theme}`, true); // Regenschlieren, Moos, Risse wie bei allen Wänden
    }, true, TEX_SCALE);
    const emi = canvasTex(W, H, (e) => { e.fillStyle = "#000"; e.fillRect(0, 0, W, H); for (const L of lights) L(e); }, true, 1);
    texCache.set(key, map); texCache.set(`facE:${theme}`, emi);
    return { map, emi };
  }

  // v3.6 Spaltenweise Farbe der Leucht-Karte im Erdgeschoss (Schaufenster, Schilder): 64 Spalten je Fassadenstreifen.
  // Einmal je Thema aus der Hauptspeicher-Leinwand gelesen (kein GPU-Zurücklesen), danach aus dem Cache.
  const facGlowCache = new Map();
  function facadeGlowCols(theme) {
    let cols = facGlowCache.get(theme);
    if (cols) return cols;
    cols = [];
    const img = facadeTextures(theme).emi.image, gx = img.getContext("2d", { willReadFrequently: true });
    const y0 = Math.round(img.height * 0.6), hh = Math.round(img.height * 0.36), cw = img.width / 64;
    const data = gx.getImageData(0, y0, img.width, hh).data;
    for (let c = 0; c < 64; c++) {
      // hellste Stelle der Spalte zählt (Schaufenster und Schriftzüge sind schmal), Farbe von dort
      let best = 0, r = 0, g2 = 0, b = 0, lit = 0, n = 0;
      for (let y = 0; y < hh; y += 2) for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x += 2) {
        const i = (y * img.width + x) * 4, m2 = Math.max(data[i], data[i + 1], data[i + 2]); n++;
        if (m2 > 40) lit++;
        if (m2 > best) { best = m2; r = data[i]; g2 = data[i + 1]; b = data[i + 2]; }
      }
      const m = best;
      if (m < 50 || lit < n * 0.04) { cols.push(null); continue; }
      const kk = Math.min(1, (m / 255) * (0.5 + Math.min(0.5, lit / n * 2))), sc = 255 / m;
      cols.push({ rgb: `${Math.round(r * sc)},${Math.round(g2 * sc)},${Math.round(b * sc)}`, k: kk });
    }
    facGlowCache.set(theme, cols);
    return cols;
  }
  function obstacleTexture(kind) {
    return tex(`obs:${kind}`, 128, 128, (g) => {
      const R = seededR(kind.length * 7919 + kind.charCodeAt(0) * 31);
      const rivets = (pts, col = "#9aa3a8") => { for (const [x, y] of pts) { g.fillStyle = "rgba(0,0,0,0.5)"; g.beginPath(); g.arc(x + 0.6, y + 0.6, 2, 0, TAU); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(x - 0.9, y - 0.9, 0.8, 0.8); } };
      const corners = (m) => [[m, m], [128 - m, m], [m, 128 - m], [128 - m, 128 - m]];
      switch (kind) {
        case "planken": {
          // v3.3 rohe Bretter: vier Planken mit Maserung, Astlöchern, Nagelreihen, verwittert
          for (let y = 0; y < 128; y += 32) {
            const v = Math.floor(R() * 26) - 13;
            g.fillStyle = `rgb(${118 + v},${84 + v * 0.8},${50 + v * 0.5})`; g.fillRect(0, y, 128, 32);
            g.lineWidth = 0.6;
            for (let k = 0; k < 11; k++) {
              const yy = y + 2 + R() * 28, ph = R() * TAU, amp = 0.5 + R() * 1.6;
              g.strokeStyle = `rgba(56,32,14,${0.18 + R() * 0.28})`; g.beginPath(); g.moveTo(0, yy);
              for (let x = 6; x <= 128; x += 6) g.lineTo(x, yy + Math.sin(x * 0.07 + ph) * amp);
              g.stroke();
            }
            for (let k = 0; k < 2; k++) { const kx = 10 + R() * 108, ky = y + 8 + R() * 16; g.fillStyle = "rgba(56,30,12,0.65)"; g.beginPath(); g.ellipse(kx, ky, 2.5 + R() * 2, 1.4 + R(), 0, 0, TAU); g.fill(); }
            g.fillStyle = "rgba(20,12,6,0.8)"; g.fillRect(0, y, 128, 1.6);
            g.fillStyle = "rgba(255,225,180,0.12)"; g.fillRect(0, y + 1.6, 128, 1);
            for (const nx of [6, 122]) for (const ny of [8, 24]) { g.fillStyle = "rgba(0,0,0,0.5)"; g.beginPath(); g.arc(nx + 0.6, y + ny + 0.6, 1.8, 0, TAU); g.fill(); g.fillStyle = "#8a8f94"; g.beginPath(); g.arc(nx, y + ny, 1.5, 0, TAU); g.fill(); }
          }
          grunge(g, 128, 128, R, { grain: 0.07, scratches: 14, dirt: 6, edge: 0.2 });
          break;
        }
        case "crate": {
          // Bretter mit eigener Tönung, Maserung und Astlöchern; Rahmen und Strebe mit Nägeln
          for (let y = 0, i = 0; y < 128; y += 32, i++) {
            const v = Math.floor(R() * 22) - 11;
            g.fillStyle = `rgb(${122 + v},${90 + v * 0.8},${52 + v * 0.5})`; g.fillRect(0, y, 128, 32);
            g.lineWidth = 0.6;
            for (let k = 0; k < 9; k++) {
              const yy = y + 2 + R() * 28, ph = R() * TAU, amp = 0.6 + R() * 1.4;
              g.strokeStyle = `rgba(60,36,16,${0.2 + R() * 0.25})`; g.beginPath(); g.moveTo(0, yy);
              for (let x = 8; x <= 128; x += 8) g.lineTo(x, yy + Math.sin(x * 0.06 + ph) * amp);
              g.stroke();
            }
            if (R() < 0.8) { const kx = 14 + R() * 100, ky = y + 8 + R() * 16; g.fillStyle = "rgba(60,34,14,0.6)"; g.beginPath(); g.ellipse(kx, ky, 3 + R() * 2, 1.6 + R(), 0, 0, TAU); g.fill(); g.strokeStyle = "rgba(60,34,14,0.3)"; g.beginPath(); g.ellipse(kx, ky, 6, 3, 0, 0, TAU); g.stroke(); }
            g.fillStyle = "rgba(30,18,8,0.75)"; g.fillRect(0, y, 128, 1.4);
            g.fillStyle = "rgba(255,220,170,0.12)"; g.fillRect(0, y + 1.4, 128, 1);
          }
          g.strokeStyle = "#5a3f22"; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
          g.beginPath(); g.moveTo(10, 10); g.lineTo(118, 118); g.stroke();
          g.strokeStyle = "rgba(255,220,170,0.14)"; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 127, 127); g.strokeRect(10.5, 10.5, 107, 107);
          rivets(corners(5).concat([[30, 30], [98, 98], [64, 5], [64, 123], [5, 64], [123, 64]]), "#6d6a62");
          g.save(); g.globalAlpha = 0.35; g.fillStyle = "#1a1208"; g.font = "bold 11px sans-serif"; g.textAlign = "center"; g.fillText("FRAGILE", 88, 46); g.restore();
          grunge(g, 128, 128, R, { grain: 0.06, scratches: 10, dirt: 4, edge: 0.3 });
          break;
        }
        case "medcrate":
          g.fillStyle = "#dfe2dc"; g.fillRect(0, 0, 128, 128);
          g.fillStyle = "rgba(0,0,0,0.06)"; for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 128, 1.2); // Kunststoff-Rippen
          g.strokeStyle = "#9aa09a"; g.lineWidth = 6; g.strokeRect(4, 4, 120, 120);
          g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1; g.strokeRect(1.5, 1.5, 125, 125);
          g.fillStyle = "#b02428"; g.fillRect(53, 25, 24, 80); g.fillRect(25, 53, 80, 24);
          g.fillStyle = "#e5383b"; g.fillRect(52, 24, 24, 80); g.fillRect(24, 52, 80, 24);
          g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(52, 24, 24, 2); g.fillRect(24, 52, 80, 2);
          rivets(corners(9));
          grunge(g, 128, 128, R, { grain: 0.05, scratches: 14, dirt: 4, edge: 0.25 });
          bloodSplat(g, 92, 96, 9, R, 0.6);
          break;
        case "labcrate":
          g.fillStyle = "#56606a"; g.fillRect(0, 0, 128, 128);
          for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.02 + R() * 0.04})`; g.fillRect(0, R() * 96, 128, 0.6); } // gebürstetes Metall
          g.strokeStyle = "#3a434b"; g.lineWidth = 6; g.strokeRect(10, 10, 108, 108);
          g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1; g.strokeRect(13.5, 13.5, 101, 101);
          for (let x = -128; x < 128; x += 24) { g.fillStyle = "#e8c21a"; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 12, 128); g.lineTo(x + 40, 100); g.lineTo(x + 28, 100); g.fill(); }
          g.fillStyle = "#1c1c1c"; g.fillRect(0, 96, 128, 4);
          // Biogefahr-Schild
          g.fillStyle = "#e8c21a"; g.beginPath(); g.arc(64, 52, 20, 0, TAU); g.fill();
          g.strokeStyle = "#1c1c1c"; g.lineWidth = 3; for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.beginPath(); g.arc(64 + Math.cos(a) * 7, 52 + Math.sin(a) * 7, 7, 0, TAU); g.stroke(); }
          g.fillStyle = "#1c1c1c"; g.beginPath(); g.arc(64, 52, 3, 0, TAU); g.fill();
          rivets(corners(6).concat([[64, 6], [64, 122]]));
          grunge(g, 128, 128, R, { grain: 0.06, scratches: 16, dirt: 3, edge: 0.3, rust: 4 });
          break;
        case "barricade":
          g.fillStyle = "#8d8c86"; g.fillRect(0, 0, 128, 128);
          for (let k = 0; k < 700; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "0,0,0"},${0.06 + R() * 0.1})`; g.fillRect(R() * 128, R() * 128, 1, 1); } // Betonporen
          for (let x = -128; x < 256; x += 32) { g.fillStyle = "#f2c81a"; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 16, 128); g.lineTo(x + 80, 64); g.lineTo(x + 64, 64); g.fill(); }
          g.fillStyle = "#151515"; g.fillRect(0, 60, 128, 4);
          // abgeplatzte Ecken und Risse
          for (let k = 0; k < 5; k++) { g.fillStyle = "#6c6b66"; g.beginPath(); const x = R() * 128, y = R() * 128; g.moveTo(x, y); for (let j = 0; j < 5; j++) g.lineTo(x + (R() - 0.5) * 14, y + (R() - 0.5) * 10); g.fill(); }
          g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 0.7; for (let k = 0; k < 3; k++) { let x = R() * 128, y = R() * 50; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (R() - 0.5) * 12; y += 3 + R() * 6; g.lineTo(x, y); } g.stroke(); }
          grunge(g, 128, 128, R, { grain: 0.05, scratches: 6, dirt: 6, edge: 0.3 });
          break;
        case "dumpster":
          g.fillStyle = "#2f5a3a"; g.fillRect(0, 0, 128, 128);
          for (let x = 8; x < 128; x += 24) {
            g.fillStyle = "#264a30"; g.fillRect(x, 0, 6, 128);
            g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x, 0, 1, 128);
            g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + 5, 0, 1, 128);
          }
          // abgeplatzter Lack, Rost, Graffiti-Tag
          for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(${90 + R() * 40},${50 + R() * 20},24,0.8)`; g.beginPath(); g.ellipse(R() * 128, R() * 128, 1 + R() * 4, 1 + R() * 3, R() * 3, 0, TAU); g.fill(); }
          g.save(); g.globalAlpha = 0.7; g.strokeStyle = "#f5f5f0"; g.lineWidth = 2.2; g.lineCap = "round"; g.beginPath(); let gx = 30, gy = 70; g.moveTo(gx, gy); for (let k = 0; k < 8; k++) { gx += 5 + R() * 6; gy += (R() - 0.5) * 18; g.lineTo(gx, gy); } g.stroke(); g.restore();
          grunge(g, 128, 128, R, { grain: 0.07, scratches: 12, dirt: 6, edge: 0.35, rust: 10 });
          break;
        case "cabinet":
          g.fillStyle = "#b7bec2"; g.fillRect(0, 0, 128, 128);
          g.fillStyle = "#7f878c"; g.fillRect(62, 0, 4, 128);
          g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(61, 0, 1, 128);
          for (const hx of [54, 70]) { g.fillStyle = "#5d6468"; g.fillRect(hx, 56, 4, 18); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(hx, 56, 1, 18); }
          g.fillStyle = "#e5383b"; g.fillRect(28, 40, 12, 40); g.fillRect(14, 54, 40, 12);
          for (let y = 96; y < 120; y += 4) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(80, y, 34, 2); } // Lüftungsschlitze
          grunge(g, 128, 128, R, { grain: 0.05, scratches: 18, dirt: 3, edge: 0.3 });
          bloodSplat(g, 96, 40, 8, R, 0.5);
          break;
        case "server":
          g.fillStyle = "#1a1f24"; g.fillRect(0, 0, 128, 128);
          for (let y = 6; y < 128; y += 14) {
            g.fillStyle = "#2c3238"; g.fillRect(6, y, 116, 10);
            g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(6, y, 116, 1);
            g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(6, y + 9, 116, 1);
            for (let x = 70; x < 116; x += 3) { g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(x, y + 3, 1.6, 5); } // Lüftungsgitter
          }
          rivets([[3, 4], [125, 4], [3, 124], [125, 124]], "#6a737a");
          grunge(g, 128, 128, R, { grain: 0.04, scratches: 6, dirt: 2, edge: 0.2 });
          break;
        case "serverLeds":
          g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128);
          for (let y = 9; y < 128; y += 14) for (let x = 14; x < 120; x += 18) { g.fillStyle = (x * 3 + y) % 5 ? "#3cff7a" : "#ff4a3a"; g.fillRect(x, y, 5, 4); }
          break;
        case "container": {
          // Wellblech: helle Grundfarbe (wird je Container eingefärbt), Rippen, Rostläufer, Kennzeichnung
          g.fillStyle = "#e4e4e0"; g.fillRect(0, 0, 128, 128);
          for (let x = 0; x < 128; x += 8) {
            g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x, 0, 2, 128);
            g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(x + 5, 0, 3, 128);
          }
          g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, 128, 5); g.fillRect(0, 123, 128, 5);
          for (let k = 0; k < 9; k++) { const x = R() * 128, l = 10 + R() * 40; const gr = g.createLinearGradient(0, 4, 0, 4 + l); gr.addColorStop(0, "rgba(120,60,20,0.7)"); gr.addColorStop(1, "rgba(120,60,20,0)"); g.fillStyle = gr; g.fillRect(x, 4, 1.5 + R() * 2, l); }
          g.save(); g.fillStyle = "rgba(255,255,255,0.85)"; g.font = "bold 10px monospace"; g.fillText("OGXU 204811", 8, 22); g.font = "bold 7px monospace"; g.fillText("45G1  MAX 30480 KG", 8, 32); g.restore();
          grunge(g, 128, 128, R, { grain: 0.06, scratches: 14, dirt: 5, edge: 0.35, rust: 8 });
          break;
        }
        case "mattress":
          g.fillStyle = "#e8eef0"; g.fillRect(0, 0, 128, 128);
          // gesteppte Rauten
          g.strokeStyle = "rgba(90,110,120,0.25)"; g.lineWidth = 0.8;
          for (let k = -128; k < 256; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k, 128); g.lineTo(k + 128, 0); g.stroke(); }
          for (let y = 8; y < 128; y += 16) for (let x = (y / 16 % 2 ? 0 : 8); x < 128; x += 16) { g.fillStyle = "rgba(90,110,120,0.35)"; g.beginPath(); g.arc(x, y, 1, 0, TAU); g.fill(); }
          // Fleck: dunkler Kern, ausgefranster Rand, eingetrocknete Ränder
          g.fillStyle = "rgba(150,70,60,0.25)"; g.beginPath(); g.ellipse(80, 70, 36, 27, 0.4, 0, TAU); g.fill();
          g.fillStyle = "rgba(120,10,14,0.85)"; g.beginPath(); g.ellipse(80, 70, 30, 22, 0.4, 0, TAU); g.fill();
          g.fillStyle = "rgba(70,4,8,0.6)"; g.beginPath(); g.ellipse(84, 72, 16, 11, 0.5, 0, TAU); g.fill();
          bloodSplat(g, 40, 30, 8, R, 0.7);
          grunge(g, 128, 128, R, { grain: 0.04, scratches: 0, dirt: 5, edge: 0.2 });
          break;
      }
    });
  }

  const obsNormal = (kind) => { obstacleTexture(kind); return normalTexFor(`obs:${kind}`, 3); };
  // v3.4 Denkmal-Figuren aus Grundkörpern (einfarbig Bronze/Stein/Kupfer). Vorderseite +x wie bei allen Figuren;
  // stehende Figuren werden zur Kamera (+z) gedreht, Pferd und Löwe zeigen ihr Profil.
  function statue(g, m, x, y, z, s, kind = "coat") {
    const f = group(x, y, z); f.scale.setScalar(s); f.rotation.y = -Math.PI / 2; g.add(f);
    if (kind === "dress") f.add(mesh(cone(7, 18, 8), m, 0, 9, 0));
    else { for (const sz of [-1.8, 1.8]) f.add(mesh(cyl(1.6, 1.8, 10, 6), m, 0, 5, sz)); f.add(mesh(cyl(4.6, 6, 12, 8), m, 0, 14, 0)); }
    f.add(mesh(cyl(3.6, 4.4, 9, 8), m, 0, 22, 0));
    for (const sz of [-1, 1]) { const a = mesh(cyl(1.2, 1.4, 10, 6), m, 0.6, 21, sz * 5); a.rotation.x = sz * 0.25; f.add(a); }
    f.add(mesh(ico(3.2, 1), m, 0, 30, 0));
    if (kind === "coat") { f.add(mesh(ico(3.7, 1), m, -0.8, 30.8, 0)); f.add(mesh(box(2, 1.6, 6), m, 3.4, 23, 3.4)); } // Perücke, Notenrolle
    else f.add(mesh(cone(3.9, 4.2, 8), m, -0.2, 32.6, 0)); // Kopftuch
    return f;
  }
  function horse(g, m, x, y, z, s, rearing) {
    const h = group(x, y, z); h.scale.setScalar(s); g.add(h);
    const body = mesh(box(22, 9, 8), m, 0, 16, 0); if (rearing) body.rotation.z = 0.45; h.add(body);
    const nx = rearing ? 9 : 11, ny = rearing ? 27 : 22;
    const neck = mesh(box(4, 12, 5), m, nx, ny, 0); neck.rotation.z = -0.5; h.add(neck);
    const head = mesh(box(9, 4.5, 4), m, nx + 5, ny + 6, 0); head.rotation.z = -0.4; h.add(head);
    h.add(mesh(box(5, 2, 1.2), m, nx - 1.5, ny + 7, 0));
    for (const [lx, lz, front] of [[-8, -2.6, false], [-8, 2.6, false], [8, -2.6, true], [8, 2.6, true]]) {
      const up = rearing && front, leg = mesh(box(2.4, 12, 2.4), m, lx + (up ? 4 : 0), up ? 21 : 6, lz);
      if (up) leg.rotation.z = lz > 0 ? 1.15 : 0.7;
      h.add(leg);
    }
    const tail = mesh(box(2, 10, 2), m, -12, 14, 0); tail.rotation.z = 0.6; h.add(tail);
    return h;
  }
  function lion(g, m, x, y, z, s) {
    const l = group(x, y, z); l.scale.setScalar(s); g.add(l);
    l.add(mesh(box(22, 9, 9), m, -2, 10, 0));
    l.add(mesh(ico(7, 1), m, 9, 16, 0));
    l.add(mesh(box(6, 5, 5), m, 14, 15, 0));
    for (const [lx, lz] of [[-10, -3], [-10, 3], [8, -3], [8, 3]]) l.add(mesh(box(3, 8, 3), m, lx, 4, lz));
    const tail = mesh(box(12, 1.6, 1.6), m, -16, 12, 0); tail.rotation.z = 0.5; l.add(tail);
    l.add(mesh(ico(1.8, 0), m, -21, 15, 0));
    l.add(mesh(box(1, 9, 7), slam("#1e64c8"), 13, 8, 0)); // Wappenschild zwischen den Pranken
    return l;
  }
  // v3.5 Prisma aus einem konvexen Seitenprofil (x, y, gegen den Uhrzeigersinn), entlang z extrudiert
  function prism(pts, depth) {
    const pos = [], h = depth / 2, n = pts.length;
    for (let i = 1; i < n - 1; i++) {
      pos.push(pts[0][0], pts[0][1], h, pts[i][0], pts[i][1], h, pts[i + 1][0], pts[i + 1][1], h);
      pos.push(pts[0][0], pts[0][1], -h, pts[i + 1][0], pts[i + 1][1], -h, pts[i][0], pts[i][1], -h);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      pos.push(a[0], a[1], h, a[0], a[1], -h, b[0], b[1], -h, a[0], a[1], h, b[0], b[1], -h, b[0], b[1], h);
    }
    const g = new T3.BufferGeometry();
    g.setAttribute("position", new T3.BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    return g;
  }
  // v3.5 Auto mit echter Silhouette: Karosserie (Motorhaube, Heck), schräge Scheiben, Dach, Säulen, Räder mit Felgen,
  // Stoßstangen, Scheinwerfer, Kennzeichen mit EU-Band, Spiegel, Türfugen. Varianten: ausgebrannt, Blut auf der Haube.
  // Lokal: +x = vorn, Länge len, Breite wid; liefert die Dachhöhe (für Blaulichtbalken).
  function carBody(c, add, len, wid, paintCol, R, opts = {}) {
    const burnt = !opts.police && (R() < 0.18 || !!opts.burnt); // v3.7 Wrack nach der Explosion: immer ausgebrannt
    const paint = burnt ? slam("#2c2622") : lam(paintCol);
    const L = len, Wd = wid;
    const body = add(mesh(prism([[-L / 2 + 3, 6], [L / 2 - 3, 6], [L / 2, 11], [L / 2 - 1, 19.5], [L * 0.2, 23], [-L * 0.3, 24], [-L / 2 + 1, 22.5], [-L / 2, 12]], Wd), paint));
    c.add(body);
    const glass = burnt ? slam("#0b0c0d") : smat("carglass", () => new T3.MeshLambertMaterial({ color: 0x1c2a36, emissive: 0x0a1218 }));
    c.add(add(mesh(prism([[-L * 0.31, 23.4], [L * 0.2, 22.8], [L * 0.03, 36.5], [-L * 0.23, 37]], Wd * 0.82), glass)));
    c.add(add(mesh(box(L * 0.27, 2.2, Wd * 0.8), paint, -L * 0.1, 37.6, 0))); // Dach
    for (const sz of [-1, 1]) c.add(mesh(box(2.6, 13, 1.4), paint, -L * 0.07, 30, sz * Wd * 0.405)); // B-Säule
    // Räder: Reifen + Felge, leicht nach außen
    const tire = slam("#141414"), rim = slam(burnt ? "#3a3430" : "#5e666c");
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wx = sx * L * 0.31, wz = sz * (Wd / 2 - 3);
      const t1 = mesh(cyl(7.6, 7.6, 5.4, 14), tire, wx, 7.6, wz); t1.rotation.x = Math.PI / 2; c.add(t1);
      const r1 = mesh(cyl(3.8, 3.8, 5.6, 10), rim, wx, 7.6, wz + sz * 0.1); r1.rotation.x = Math.PI / 2; c.add(r1);
      c.add(mesh(box(17, 3, 1.2), slam("#1a1a1a"), wx, 15.5, sz * (Wd / 2 + 0.2))); // Radlauf
    }
    // Stoßstangen, Lichter, Kennzeichen
    const trim = slam("#2a2c2e");
    for (const sx of [-1, 1]) c.add(mesh(box(3, 5, Wd * 0.96), trim, sx * (L / 2 + 0.5), 10, 0));
    if (!burnt) for (const sz of [-1, 1]) {
      c.add(mesh(box(1.6, 3.6, Wd * 0.22), sbasic("#ffefc0"), L / 2 - 0.4, 17, sz * Wd * 0.31));
      c.add(mesh(box(1.6, 3.6, Wd * 0.2), sbasic("#c01e18"), -L / 2 + 0.2, 18, sz * Wd * 0.32));
    }
    for (const sx of [-1, 1]) {
      c.add(mesh(box(0.8, 3.6, 11), slam("#e8e8e2"), sx * (L / 2 + 2.1), 10.5, 0));
      c.add(mesh(box(0.9, 3.6, 1.8), slam("#1e3a9a"), sx * (L / 2 + 2.15), 10.5, sx * 4.6));
    }
    for (const sz of [-1, 1]) {
      c.add(mesh(box(3, 2.4, 3), paint, L * 0.16, 26, sz * (Wd * 0.41 + 1.6))); // Spiegel
      for (const fx of [L * 0.04, -L * 0.2]) c.add(mesh(box(0.6, 12, 0.4), slam("#151515"), fx, 16, sz * (Wd / 2 + 0.05))); // Türfugen
      c.add(mesh(box(3, 0.8, 0.5), slam("#5a5e62"), -L * 0.02, 19.5, sz * (Wd / 2 + 0.25))); // Griff
    }
    if (burnt) { // Rost- und Rußflecken, Glut
      for (let k = 0; k < 4; k++) c.add(mesh(box(6 + R() * 10, 0.6, 6 + R() * 8), slam(R() < 0.5 ? "#5a3018" : "#141210"), (R() - 0.5) * L * 0.7, 23.2 + R() * 0.5, (R() - 0.5) * Wd * 0.6));
    } else if (R() < 0.3) c.add(mesh(box(L * 0.18, 0.5, Wd * 0.3), slam("#4a0c0e"), L * 0.32, 21.4, (R() - 0.5) * Wd * 0.3)); // Blut auf der Haube
    return 38.7;
  }
  function obstacleModel(o, theme) {
    const g = group(o.x + o.w / 2, 0, o.y + o.h / 2);
    const W = o.w, Hd = o.h;
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const R = (() => { let s = o.seed || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    switch (o.kind) {
      case "car": case "wrack": {
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd;
        const c = group(); if (o.vert) c.rotation.y = Math.PI / 2;
        const col = ["#8a2f2f", "#2f4f8a", "#6b6b6b", "#c9b48a", "#2f6f4a", "#d8d8d0"][Math.floor(R() * 6)];
        carBody(c, add, len, wid, col, R, { burnt: o.kind === "wrack" });
        if (o.kind === "wrack") { c.rotation.z = (R() - 0.5) * 0.06; c.position.y = -1.5; } // auf den Felgen abgesackt
        g.add(c);
        break;
      }
      case "trafo": {
        // v3.7 Stromkasten: Schaltschrank mit Dach, Doppeltür (Fuge, Griffe), Lüftungsschlitzen, Blitz-Warnschild, Kabeln
        const h = 50, dark = slam("#2c332f"), fz = Hd / 2 - 1;
        add(mesh(box(W - 2, h, Hd - 2), lam("#6f7c73"), 0, h / 2 + 2, 0));
        add(mesh(box(W + 2, 3, Hd + 2), slam("#56625a"), 0, h + 3.5, 0)); // Dach
        add(mesh(box(W, 2.2, Hd), dark, 0, 1.1, 0)); // Sockel
        g.add(mesh(box(0.8, h - 8, 0.8), dark, 0, h / 2 + 2, fz + 0.3)); // Türfuge
        for (const sx of [-1, 1]) g.add(mesh(box(1.4, 5, 1.4), slam("#a2abb0"), sx * 3.2, h * 0.56, fz + 0.6)); // Griffe
        for (let i = 0; i < 4; i++) g.add(mesh(box(W * 0.3, 1, 0.8), dark, -W * 0.24, 10 + i * 3.2, fz + 0.35)); // Lüftungsschlitze
        const sign = mesh(prism([[-5.2, 0], [5.2, 0], [0, 9]], 0.7), sbasic("#ffd21a"), W * 0.24, h * 0.6, fz + 0.5); g.add(sign);
        const bolt = mesh(box(1.3, 5.2, 0.5), sbasic("#111111"), W * 0.24, h * 0.6 + 3.6, fz + 1); bolt.rotation.z = 0.45; g.add(bolt);
        g.add(mesh(box(8, 4, 0.5), slam("#e8e0c8"), -W * 0.22, h * 0.78, fz + 0.4)); // Aufkleber
        for (const sx of [-1, 1]) { const k1 = mesh(cyl(1.3, 1.3, 16, 6), slam("#141414"), sx * (W / 2 + 6), 1.3, Hd * 0.2 * sx); k1.rotation.z = Math.PI / 2; k1.rotation.y = sx * 0.5; g.add(k1); } // Kabel
        break;
      }
      case "crate": case "medcrate": case "labcrate": {
        const h = o.kind === "crate" ? 40 : 34;
        add(mesh(box(W, h, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture(o.kind), normalMap: obsNormal(o.kind) }), 0, h / 2, 0));
        break;
      }
      case "barrels": {
        // v3.5 Fässer mit Sicken, Deckel, Spund und Warnetikett; manchmal eins umgekippt mit leuchtender Giftlache
        const br = Math.min(W, Hd) * 0.25;
        const paintCol = theme === "lab" ? "#2f6a8a" : "#3d6b2a", ribCol = theme === "lab" ? "#1a3a4a" : "#22301a";
        const tipped = R() < 0.35 ? Math.floor(R() * 3) : -1;
        [[-0.22, -0.2], [0.22, -0.2], [0, 0.22]].forEach(([px, pz], i) => {
          const b = group(px * W, 0, pz * Hd); g.add(b);
          if (i === tipped) { b.rotation.y = R() * TAU; b.rotation.z = Math.PI / 2; b.position.y = br; b.position.x += Math.cos(b.rotation.y) * 14; b.position.z -= Math.sin(b.rotation.y) * 14; } // Mitte bleibt etwa am alten Platz
          else { b.rotation.x = (R() - 0.5) * 0.07; b.rotation.z = (R() - 0.5) * 0.07; }
          b.add(add(mesh(cyl(br, br, 38, 16), slam(paintCol), 0, 19, 0)));
          for (const ry of [2.5, 13, 25, 35.5]) b.add(mesh(cyl(br * 1.045, br * 1.045, 1.6, 16), slam(ribCol), 0, ry, 0)); // Sicken
          b.add(mesh(cyl(br * 0.97, br * 0.97, 0.8, 16), slam(ribCol), 0, 38.2, 0));
          b.add(mesh(cyl(br * 0.15, br * 0.15, 1.8, 8), slam("#8a9088"), br * 0.52, 38.8, br * 0.2)); // Spund
          const lab = group(); lab.rotation.y = R() * TAU; b.add(lab);
          lab.add(mesh(box(0.8, 9, br * 1.05), slam("#e8c21a"), br * 0.99, 19, 0)); // Warnetikett
          lab.add(mesh(box(0.9, 4.2, br * 0.42), slam("#151515"), br * 1.0, 19.5, 0));
          if (i !== tipped) b.add(mesh(cyl(br * 0.72, br * 0.72, 1, 12), sbasic(theme === "lab" ? "#5ad8ff" : "#9eff3a"), 0, 38.7, 0));
          else { const ang = b.rotation.y, d = 42; g.add(mesh(cyl(br * 1.7, br * 1.4, 0.6, 16), sbasic(theme === "lab" ? "#3ab8e8" : "#6ad82a"), b.position.x - Math.cos(ang) * d, 0.5, b.position.z + Math.sin(ang) * d)); } // Lache an der Öffnung (Deckel zeigt nach −x, gedreht)
        });
        break;
      }
      case "bretter": {
        // v3.3 vernagelte Gang-Barrikade: zwei Pfosten, sechs schräg genagelte Bretter quer über die Öffnung, Warn-X.
        // Nicht verschmolzen (bakeStatic), damit syncObstacles bei Schaden einzelne Bretter fallen lassen kann.
        const wood = new T3.MeshLambertMaterial({ map: obstacleTexture("planken"), normalMap: obsNormal("planken") });
        const post = slam("#3a2816"), len = Hd;
        for (const z of [-len / 2 + 5, len / 2 - 5]) add(mesh(box(8, 64, 8), post, 0, 32, z));
        const planks = [];
        for (let i = 0; i < 6; i++) {
          const pl = add(mesh(box(4, 9, len + 6), wood, (i % 2 ? 2.5 : -2.5), 8 + i * 9.2, (R() - 0.5) * 4));
          pl.rotation.x = (R() - 0.5) * 0.35;
          planks.push(pl);
        }
        const red = slam("#b81e18");
        for (const s2 of [-1, 1]) { const x2 = add(mesh(box(5, 3.5, len * 0.9), red, -3.4 * Math.sign(o.x - 270) || -3.4, 32, 0)); x2.rotation.x = s2 * 0.62; }
        g.userData.planks = planks; g.userData.baseX = g.position.x;
        break;
      }
      case "barricade":
        add(mesh(box(W, 30, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("barricade"), normalMap: obsNormal("barricade") }), 0, 15, 0));
        break;
      case "dumpster": {
        // v3.5 Müllcontainer auf Rollen: Griffe, angehobener Deckel, Müllsäcke quellen heraus und liegen daneben
        add(mesh(box(W, 36, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("dumpster"), normalMap: obsNormal("dumpster") }), 0, 22, 0));
        const dk = slam("#1a2a1e"), steel = slam("#4a5048");
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = mesh(cyl(3, 3, 2.6, 10), slam("#121212"), sx * (W / 2 - 6), 3, sz * (Hd / 2 - 5)); wh.rotation.x = Math.PI / 2; g.add(wh); g.add(mesh(box(4, 3, 4), steel, sx * (W / 2 - 6), 5.5, sz * (Hd / 2 - 5))); }
        for (const sx of [-1, 1]) g.add(mesh(box(2, 2, Hd * 0.6), steel, sx * (W / 2 + 1.5), 30, 0)); // Griffe
        g.add(mesh(box(W + 3, 2, 3), steel, 0, 40, -Hd / 2)); // Scharnierleiste
        const lid = group(0, 41, -Hd / 2); lid.rotation.x = -(0.25 + R() * 0.35); g.add(lid);
        lid.add(add(mesh(box(W + 2, 2.6, Hd + 2), slam("#244a2e"), 0, 0, Hd / 2 + 1)));
        const bagM = slam("#101214"), bag2 = slam("#2a2e30");
        for (let k = 0; k < 4; k++) g.add(mesh(ico(6 + R() * 3, 1), k % 2 ? bagM : bag2, (R() - 0.5) * W * 0.7, 38 + R() * 4, (R() - 0.3) * Hd * 0.5)); // Säcke im Container
        const side = R() < 0.5 ? -1 : 1;
        for (let k = 0; k < 2; k++) { const b2 = mesh(ico(6.5 + R() * 2.5, 1), k ? bagM : bag2, side * (W / 2 + 8 + k * 6), 5.5, (R() - 0.5) * Hd * 0.6); b2.scale.y = 0.75; g.add(b2); } // Säcke am Boden
        break;
      }
      case "bed": {
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd;
        const c = group(); if (o.vert) c.rotation.y = Math.PI / 2;
        c.add(add(mesh(box(len, 12, wid), slam("#6f7880"), 0, 10, 0)));
        c.add(add(mesh(box(len - 6, 8, wid - 6), new T3.MeshLambertMaterial({ map: obstacleTexture("mattress"), normalMap: obsNormal("mattress") }), 0, 20, 0)));
        c.add(add(mesh(box(len * 0.2, 6, wid - 14), slam("#f4f6f8"), -len * 0.36, 26, 0)));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(mesh(cyl(1.5, 1.5, 6, 6), slam("#4d555c"), sx * (len / 2 - 4), 3, sz * (wid / 2 - 4)));
        g.add(c);
        break;
      }
      case "cabinet":
        add(mesh(box(W, 70, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("cabinet"), normalMap: obsNormal("cabinet") }), 0, 35, 0));
        break;
      case "tank": {
        const tr = Math.min(W, Hd) / 2 - 1;
        add(mesh(cyl(tr, tr, 10, 16), slam("#4a535a"), 0, 5, 0));
        const goo = mesh(cyl(tr * 0.72, tr * 0.72, 56, 16), new T3.MeshLambertMaterial({ color: 0x2f8a20, emissive: 0x3fbf20, emissiveIntensity: 0.9 }), 0, 38, 0);
        goo.userData.solo = true;
        g.add(goo);
        g.add(mesh(ico(tr * 0.32, 0), slam("#1a3a12"), 0, 36, 0));
        const glass = smat("tankglass", () => new T3.MeshLambertMaterial({ color: 0xbfffe0, transparent: true, opacity: 0.22, depthWrite: false }));
        g.add(mesh(cyl(tr * 0.85, tr * 0.85, 62, 16), glass, 0, 41, 0));
        add(mesh(cyl(tr, tr, 8, 16), slam("#3a4248"), 0, 76, 0));
        break;
      }
      case "server": {
        const rack = new T3.MeshLambertMaterial({ map: obstacleTexture("server"), emissive: 0xffffff, emissiveMap: obstacleTexture("serverLeds"), emissiveIntensity: 0.9 });
        const lid = slam("#23292e");
        add(mesh(box(W, 80, Hd), [rack, rack, lid, lid, rack, rack], 0, 40, 0));
        break;
      }
      case "bude": {
        // Marktbude: Holzhütte mit Satteldach, Theke, Markise und warmer Lichterkette
        const len = W, dep = Hd, wood = slam("#6a4426"), roofC = slam(o.fest === "wiesn" ? "#e8eef4" : o.fest === "weihnachten" ? "#7a2a1e" : "#5e2a1a");
        add(mesh(box(len, 34, dep * 0.8), wood, 0, 17, -dep * 0.08));
        add(mesh(box(len + 4, 4, dep * 0.3), slam("#8a5a30"), 0, 22, dep * 0.4));
        for (const sd of [-1, 1]) { const rf = add(mesh(box(len + 8, 3, dep * 0.62), roofC, 0, 44, sd * dep * 0.24)); rf.rotation.x = sd * 0.5; }
        for (let k = 0; k < 6; k++) g.add(mesh(box(len / 6, 6, 2), slam(k % 2 ? "#f0ece0" : "#c0281e"), -len / 2 + (k + 0.5) * (len / 6), 33, dep * 0.52));
        for (let k = 0; k < 7; k++) g.add(mesh(ico(1.6, 0), sbasic("#ffe08a"), -len / 2 + 4 + k * (len - 8) / 6, 38, dep * 0.55));
        if (o.fest === "weihnachten") add(mesh(cone(9, 26, 7), slam("#1e5a2a"), len * 0.42, 57, 0));
        break;
      }
      case "bierbank": {
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2;
        const wood = slam("#c89a62"), dark = slam("#3a3a3e");
        c.add(add(mesh(box(len, 2.5, wid * 0.42), wood, 0, 19, 0)));
        for (const sd of [-1, 1]) { c.add(add(mesh(box(len, 2, wid * 0.16), slam("#8a6238"), 0, 11, sd * wid * 0.4))); for (const lx of [-0.4, 0.4]) c.add(mesh(box(1.5, 11, wid * 0.16), dark, lx * len, 5, sd * wid * 0.4)); }
        for (const lx of [-0.42, 0.42]) c.add(mesh(box(1.5, 19, wid * 0.38), dark, lx * len, 9.5, 0));
        for (let k = -len / 2 + 10; k < len / 2 - 6; k += 20) { c.add(mesh(cyl(3.2, 3, 8, 8), slam("#f2c94a"), k, 24.5, (R() - 0.5) * 6)); c.add(mesh(cyl(3.3, 3.3, 2, 8), slam("#fffaf0"), k, 29, 0)); }
        g.add(c);
        break;
      }
      case "fass": {
        const br = Math.min(W, Hd) * 0.27;
        for (const [px, pz, y0] of [[-0.22, -0.18, 0], [0.22, -0.18, 0], [0, 0.22, 0]]) {
          const f = add(mesh(cyl(br, br, 30, 12), slam(o.fest === "wein" ? "#6a4428" : "#8a5a2c"), px * W, y0 + br, pz * Hd)); f.rotation.z = Math.PI / 2;
          if (o.fest === "wein") g.add(mesh(cyl(br * 0.25, br * 0.25, 31, 8), slam("#7a1830"), px * W, y0 + br, pz * Hd).rotateZ(Math.PI / 2));
          for (const rx of [-11, 11]) { const ring = mesh(cyl(br * 1.04, br * 1.04, 2, 12), slam("#3a3a3e"), px * W + rx, y0 + br, pz * Hd); ring.rotation.z = Math.PI / 2; g.add(ring); }
        }
        break;
      }
      case "maibaum": {
        // Maibaum: weiß-blau gestreift, Kranz und Zunftschilder – hoch hinaus
        for (let k = 0; k < 12; k++) add(mesh(cyl(2.6, 2.6, 12, 8), slam(k % 2 ? "#3a7fd0" : "#f2f2ee"), 0, 6 + k * 12, 0));
        const wr = mesh(torus(9, 2.2), slam("#2f6a2a"), 0, 140, 0); wr.rotation.x = Math.PI / 2; g.add(wr);
        for (let k = 0; k < 4; k++) { const a = k * 1.57, sign = mesh(box(12, 7, 1.2), slam(["#c0281e", "#e8c21a", "#3a7fd0", "#f2f2ee"][k]), Math.cos(a) * 6, 70 + k * 16, Math.sin(a) * 6); sign.rotation.y = -a; g.add(sign); }
        add(mesh(cyl(7, 9, 4, 10), slam("#5a5a52"), 0, 2, 0));
        break;
      }
      case "brunnen": {
        const r0 = Math.min(W, Hd) / 2;
        add(mesh(cyl(r0, r0 + 2, 10, 20), slam("#8a847a"), 0, 5, 0));
        g.add(mesh(cyl(r0 * 0.84, r0 * 0.84, 1, 20), new T3.MeshPhongMaterial({ color: 0x2a6a88, specular: 0x88aacc, shininess: 80 }), 0, 9, 0));
        add(mesh(cyl(4, 5, 30, 10), slam("#a49e94"), 0, 15, 0));
        add(mesh(ico(6, 1), slam("#b4aea4"), 0, 31, 0));
        break;
      }
      case "boeller": {
        add(mesh(box(W, 14, Hd), slam("#c0281e"), 0, 7, 0));
        for (let k = 0; k < 5; k++) g.add(mesh(ico(1.8, 0), sbasic("#ffd23a"), -W / 2 + 6 + R() * (W - 12), 14.5, -Hd / 2 + 5 + R() * (Hd - 10)));
        for (let k = 0; k < 4; k++) add(mesh(cyl(1.6, 1.6, 16, 6), slam("#e8e0c8"), -W / 2 + 8 + k * (W - 16) / 3, 22, 0));
        break;
      }
      case "rebstock": {
        // Rebzeile: Holzpfähle, Drähte, Laubwand und Trauben (Trollinger)
        const len = o.vert ? Hd : W, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const wood = slam("#6a4a2a"), leaf = slam("#3a7a2a"), leaf2 = slam("#2a5a1e"), grape = slam("#3a1a4a");
        for (let x = -len / 2 + 4; x <= len / 2 - 4; x += (len - 8) / 3) c.add(mesh(box(3, 34, 3), wood, x, 17, 0));
        for (const y of [14, 26]) c.add(mesh(box(len - 6, 0.8, 0.8), slam("#8a9298"), 0, y, 0));
        for (let i = 0; i < 9; i++) { const lx = -len / 2 + 8 + (i / 8) * (len - 16); const lf = mesh(ico(7 + (i % 3), 0), i % 2 ? leaf : leaf2, lx, 22 + (i % 3) * 3, (i % 2 - 0.5) * 4); lf.scale.set(1.2, 0.9, 0.8); lf.castShadow = true; c.add(lf); }
        for (let i = 0; i < 7; i++) { const gx = -len / 2 + 12 + (i / 6) * (len - 24); for (let j = 0; j < 3; j++) c.add(mesh(ico(1.8, 0), grape, gx + (j - 1) * 1.6, 13 - j * 2.2, 5)); }
        break;
      }
      case "glascontainer": {
        // Altglascontainer mit drei farbigen Einwurföffnungen
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const body = mesh(box(len, 34, wid), slam("#2f6a3a"), 0, 17, 0); body.castShadow = true; c.add(body);
        c.add(mesh(box(len + 2, 4, wid + 2), slam("#244f2c"), 0, 35, 0));
        ["#e8f0f0", "#8a5a2a", "#3a8a4a"].forEach((col, i) => {
          const x0 = -len / 3 + (len / 3) * i;
          const ring = mesh(cyl(7, 7, 3, 12), slam(col), x0, 37.5, 0); c.add(ring);
          c.add(mesh(cyl(5, 5, 3.4, 12), slam("#0e1a10"), x0, 37.8, 0));
        });
        c.add(mesh(box(len * 0.7, 4, 1), slam("#e8e8e0"), 0, 22, wid / 2 + 0.6));
        break;
      }
      case "dixi": {
        // Toilettenhäuschen: blaue Kabine, weißes Dach, Tür mit Mondfenster
        add(mesh(box(W, 62, Hd), slam("#2a5aa8"), 0, 31, 0));
        add(mesh(box(W + 3, 4, Hd + 3), slam("#e8e8e0"), 0, 64, 0));
        g.add(mesh(cyl(4, 4, 8, 8), slam("#9aa3ad"), W * 0.25, 70, -Hd * 0.2));
        g.add(mesh(box(W * 0.6, 50, 1), slam("#1a3a78"), 0, 28, Hd / 2 + 0.6));
        g.add(mesh(ico(2.5, 0), sbasic("#fff6c0"), 0, 46, Hd / 2 + 1.2));
        g.add(mesh(box(5, 3, 1), sbasic("#c81e1e"), W * 0.2, 30, Hd / 2 + 1.3));
        break;
      }
      case "telefonzelle": {
        // Telefonzelle: gelbe Rahmen, Glasscheiben, leuchtendes Schild oben
        const yel = slam("#f2c21a"), glass = smat("boothglass", () => new T3.MeshLambertMaterial({ color: 0x8fc8de, emissive: 0x1a3440 }));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(mesh(box(3, 74, 3), yel, sx * (W / 2 - 1.5), 37, sz * (Hd / 2 - 1.5)));
        for (const [w2, d2, x2, z2] of [[W - 4, 1, 0, Hd / 2 - 1], [W - 4, 1, 0, -Hd / 2 + 1], [1, Hd - 4, W / 2 - 1, 0], [1, Hd - 4, -W / 2 + 1, 0]]) g.add(mesh(box(w2, 56, d2), glass, x2, 34, z2));
        add(mesh(box(W + 2, 8, Hd + 2), yel, 0, 76, 0));
        g.add(mesh(box(W * 0.8, 5, Hd + 2.4), sbasic("#fff6c0"), 0, 70, 0));
        g.add(mesh(box(8, 10, 4), slam("#2a2a2a"), 0, 40, -Hd / 2 + 4));
        break;
      }
      case "weihnachtsbaum": {
        // Tannenbaum: gestapelte Kegel, Kugeln, Lichterkette, Stern
        add(mesh(cyl(4, 5, 10, 8), slam("#5a3a1e"), 0, 5, 0));
        const green = slam("#1e5a2a");
        for (let k = 0; k < 4; k++) add(mesh(cone(W / 2 - k * 4.5, 26, 9), green, 0, 20 + k * 15, 0));
        const cols = ["#d8202a", "#f2c21a", "#3a7fd0", "#e8e8e0"];
        for (let i = 0; i < 16; i++) { const a = i * 2.4, h = 14 + (i / 16) * 52, rr2 = (W / 2 - 3) * (1 - (h - 10) / 72); g.add(mesh(ico(i % 3 ? 1.6 : 2.6, 0), sbasic(i % 3 ? "#ffe8a0" : cols[i % 4]), Math.cos(a) * rr2, h, Math.sin(a) * rr2)); }
        g.add(mesh(ico(4.5, 0), sbasic("#ffd84a"), 0, 80, 0));
        break;
      }
      case "strandkorb": {
        // Strandkorb: Korb aus Weidengeflecht, Haube mit Streifen, Sitzpolster
        add(mesh(box(W, 26, Hd), slam("#c8a46a"), 0, 13, 0));
        const hood = group(0, 26, -Hd * 0.1); g.add(hood);
        for (let k = 0; k < 7; k++) { const seg = mesh(box(W / 7, 26, Hd * 0.8), slam(k % 2 ? "#e8eef4" : "#2a5aa8"), -W / 2 + (W / 7) * (k + 0.5), 13, 0); seg.castShadow = true; hood.add(seg); }
        hood.add(mesh(box(W + 2, 4, Hd * 0.85), slam("#a07a44"), 0, 27, 0));
        g.add(mesh(box(W * 0.8, 4, Hd * 0.4), slam("#e8e0c8"), 0, 27, Hd * 0.25));
        break;
      }
      case "automat": {
        add(mesh(box(W, 44, Hd), slam("#ec0016"), 0, 22, 0));
        g.add(mesh(box(W * 0.7, 12, 1), sbasic("#7fd0ff"), 0, 32, Hd / 2 + 0.6));
        g.add(mesh(box(W, 4, Hd + 1), slam("#f4f4f0"), 0, 42, 0));
        break;
      }
      case "sandsack": {
        // v3.0 Sandsack-Stellung: drei Lagen versetzter, praller Säcke
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const cols = ["#9a8a62", "#8a7a52", "#a8986e", "#7f7250"].map(slam);
        const n = Math.max(3, Math.round(len / 22)), sl = len / n;
        for (let layer = 0; layer < 3; layer++) {
          const off = layer % 2 ? sl / 2 : 0, cnt = layer % 2 ? n - 1 : n, rows = layer < 2 ? 2 : 1;
          for (let row = 0; row < rows; row++) for (let i = 0; i < cnt; i++) {
            const sx = -len / 2 + off + (i + 0.5) * sl, sz = rows === 2 ? (row - 0.5) * wid * 0.5 : 0;
            const sack = mesh(ico(1, 1), cols[Math.floor(R() * 4)], sx + (R() - 0.5) * 1.5, 4 + layer * 7.2, sz + (R() - 0.5) * 1.2);
            sack.scale.set(sl * 0.54, 4.4, (rows === 2 ? wid * 0.27 : wid * 0.36));
            sack.rotation.y = (R() - 0.5) * 0.12;
            c.add(add(sack));
          }
        }
        break;
      }
      case "bus": {
        // v3.0 Buswrack: Linienbus mit Fensterband, Zielanzeige, verkohltem Dach
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const paint = slam(R() < 0.5 ? "#ddd3b4" : "#d4d8d0"), glass = smat("glass", () => new T3.MeshLambertMaterial({ color: 0x1b2733, emissive: 0x0a1018 }));
        c.add(add(mesh(box(len, 36, wid), paint, 0, 26, 0)));
        c.add(mesh(box(len + 0.8, 13, wid + 0.8), glass, 0, 33, 0));
        for (let x = -len / 2 + 14; x < len / 2 - 8; x += 24) c.add(mesh(box(2.4, 13.4, wid + 1.2), paint, x, 33, 0));
        c.add(mesh(box(len + 1, 3, wid + 1), slam("#b0201a"), 0, 18, 0));
        c.add(add(mesh(box(len - 4, 3, wid - 4), slam("#c4c6c0"), 0, 45.5, 0)));
        c.add(add(mesh(box(len * 0.2, 6, wid * 0.62), slam("#9aa0a4"), -len * 0.2, 50, 0)));
        c.add(mesh(box(len * 0.22, 0.6, wid * 0.5), slam("#3a3028"), len * 0.2, 47.2, (R() - 0.5) * 6));
        c.add(mesh(box(len * 0.12, 0.7, wid * 0.3), slam("#241c16"), len * 0.22, 47.4, (R() - 0.5) * 4));
        for (const ax of [-0.34, 0.3]) for (const sz of [-1, 1]) { const wh = mesh(cyl(9, 9, 6, 12), slam("#151515"), ax * len, 9, sz * (wid / 2 - 3)); wh.rotation.x = Math.PI / 2; c.add(wh); }
        c.add(mesh(box(1, 6, wid * 0.62), sbasic("#ffa21a"), len / 2 + 0.6, 39, 0));
        for (const sz of [-1, 1]) { c.add(mesh(box(1.2, 4, 7), sbasic("#ffe9a8"), len / 2 + 0.6, 14, sz * wid * 0.34)); c.add(mesh(box(1.2, 4, 6), sbasic("#b3261e"), -len / 2 - 0.6, 14, sz * wid * 0.34)); }
        break;
      }
      case "bauzaun": {
        // v3.0 Bauzaun: Rahmen, feines Gitter (durchsichtig), rot-weiße Kunststofffüße, Warnbanner
        const len = o.vert ? Hd : W, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const metal = slam("#b8bcc0"), foot = slam("#c8441a"), H2 = 46;
        const n = Math.max(2, Math.round(len / 38)), pl = len / n;
        for (let i = 0; i <= n; i++) {
          const x0 = -len / 2 + i * pl;
          c.add(add(mesh(box(2, H2, 2), metal, x0, H2 / 2 + 3, 0)));
          c.add(add(mesh(box(9, 5, 14), foot, x0, 2.5, 0)));
        }
        for (const y of [4, H2 + 3]) c.add(add(mesh(box(len, 1.8, 1.8), metal, 0, y, 0)));
        const meshT = tex("fence:mesh", 64, 64, (gg) => { gg.strokeStyle = "rgba(200,206,212,0.95)"; gg.lineWidth = 1.4; for (let k = 2; k < 64; k += 8) { gg.beginPath(); gg.moveTo(k, 0); gg.lineTo(k, 64); gg.stroke(); gg.beginPath(); gg.moveTo(0, k); gg.lineTo(64, k); gg.stroke(); } }, true);
        const pg = new T3.PlaneGeometry(len, H2 - 2), uv = pg.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 24, uv.getY(k) * (H2 - 2) / 24);
        const net = mesh(pg, smat("fence:mat", () => new T3.MeshLambertMaterial({ map: meshT, transparent: true, alphaTest: 0.35, side: T3.DoubleSide, depthWrite: true })), 0, H2 / 2 + 3, 0);
        c.add(net);
        const bn = tex("fence:banner", 128, 24, (gg) => { gg.fillStyle = "#f0ece0"; gg.fillRect(0, 0, 128, 24); for (let k = -24; k < 128; k += 16) { gg.fillStyle = "#c8201a"; gg.beginPath(); gg.moveTo(k, 24); gg.lineTo(k + 8, 24); gg.lineTo(k + 32, 0); gg.lineTo(k + 24, 0); gg.fill(); } gg.fillStyle = "#f0ece0"; gg.fillRect(20, 5, 88, 14); gg.fillStyle = "#1a1a1a"; gg.font = "bold 11px sans-serif"; gg.textAlign = "center"; gg.fillText("SPERRGEBIET", 64, 16); });
        c.add(mesh(box(Math.min(len * 0.6, 70), 11, 0.6), new T3.MeshLambertMaterial({ map: bn }), (R() - 0.5) * len * 0.3, 30, 1.4));
        break;
      }
      case "feuertonne": {
        // v3.0 Feuertonne: rostige Tonne, glühende Löcher, Glut obenauf (Flammen kommen als Partikel)
        const r0 = Math.min(W, Hd) / 2 - 1;
        add(mesh(cyl(r0, r0 * 0.94, 34, 12), slam("#5a3a24"), 0, 17, 0));
        for (const ry of [6, 17, 28]) g.add(mesh(cyl(r0 * 1.05, r0 * 1.05, 1.6, 12), slam("#3a2a1e"), 0, ry, 0));
        g.add(mesh(cyl(r0 * 0.86, r0 * 0.86, 1, 12), sbasic("#ff7a1a"), 0, 33.8, 0));
        g.add(mesh(ico(r0 * 0.5, 0), sbasic("#ffc060"), 0, 33, 0));
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + R() * 0.4, hy = 10 + (i % 3) * 7; const h = mesh(box(2.6, 2.6, 1), sbasic(i % 2 ? "#ffb040" : "#ff7a1a"), Math.cos(a) * (r0 + 0.2), hy, Math.sin(a) * (r0 + 0.2)); h.rotation.y = -a + Math.PI / 2; g.add(h); }
        break;
      }
      case "container": {
        // v3.0 Schiffscontainer: Wellblech, Eckbeschläge, Türseite mit Verriegelungsstangen
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const col = ["#a8321e", "#2a5a8a", "#c8861a", "#3a6a3a", "#6a6e72"][Math.floor(R() * 5)];
        const body = new T3.MeshLambertMaterial({ map: obstacleTexture("container"), normalMap: obsNormal("container"), color: col });
        c.add(add(mesh(box(len, 58, wid), body, 0, 29, 0)));
        const dark = slam("#222426");
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [2.5, 55.5]) c.add(mesh(box(5, 5, 5), dark, sx * (len / 2 - 2), y, sz * (wid / 2 - 2)));
        const door = slam(mix3(col, -0.25));
        c.add(mesh(box(1, 52, wid - 6), door, len / 2 + 0.5, 29, 0));
        for (const zz of [-0.32, -0.12, 0.12, 0.32]) c.add(mesh(box(1.4, 50, 1.4), slam("#9aa0a4"), len / 2 + 1.1, 29, zz * wid));
        break;
      }
      // ---------------------------------------------------------------- v3.4 Alltagsobjekte
      case "litfass": {
        // Litfaßsäule: Plakate rundum, grüner Ring und Kuppel
        const r0 = Math.min(W, Hd) / 2 - 1;
        const posters = tex("obs:litfass", 192, 64, (gg) => {
          gg.fillStyle = "#d8d0bc"; gg.fillRect(0, 0, 192, 64);
          const cols = ["#c8301e", "#1e4a8a", "#e8b81a", "#2a7a3a", "#7a2a6a", "#e86a1a"];
          for (let i = 0; i < 6; i++) {
            const x = i * 32 + 1, h = 26 + (i % 3) * 8;
            gg.fillStyle = cols[i]; gg.fillRect(x, 4, 30, h);
            gg.fillStyle = "rgba(255,255,255,0.85)"; gg.fillRect(x + 4, 8, 22, 4); gg.fillRect(x + 4, 15, 16, 3);
            gg.fillStyle = "rgba(0,0,0,0.5)"; gg.fillRect(x + 3, h - 6, 24, 2);
            gg.fillStyle = cols[(i + 2) % 6]; gg.fillRect(x, h + 7, 30, 56 - h);
            gg.fillStyle = "rgba(255,255,255,0.7)"; gg.fillRect(x + 5, h + 12, 20, 3);
          }
        });
        add(mesh(cyl(r0, r0, 58, 16), new T3.MeshLambertMaterial({ map: posters }), 0, 33, 0));
        add(mesh(cyl(r0 + 2, r0 + 2.5, 4, 16), slam("#2a4a32"), 0, 2, 0));
        add(mesh(cyl(r0 + 2.5, r0 + 2, 5, 16), slam("#2a4a32"), 0, 64, 0));
        const dome = mesh(ico(r0 + 1, 1), slam("#2a4a32"), 0, 66, 0); dome.scale.y = 0.45; add(dome);
        g.add(mesh(ico(3, 0), slam("#c8a84a"), 0, 72, 0));
        break;
      }
      case "tonnen": {
        // Mülltonnen-Reihe: Gelber Sack, Altpapier, Bio, Restmüll
        const n = 3, cw = W / n, cols = [["#e8c21a", "#b89410"], ["#2a5ab0", "#1a3a78"], ["#6a4a2a", "#4a3218"]];
        for (let i = 0; i < n; i++) {
          const [c0, c1] = cols[(i + Math.floor(R() * 3)) % 3], x = -W / 2 + cw * (i + 0.5);
          add(mesh(box(cw - 3, 32, Hd - 2), slam(c0), x, 16, 0));
          const lid = add(mesh(box(cw - 1, 3, Hd), slam(c1), x, 33.5, R() < 0.3 ? -2 : 0));
          if (R() < 0.25) { lid.rotation.x = -0.5; lid.position.y = 36; }
          g.add(mesh(box(cw * 0.4, 2, 1), slam("#222"), x, 30, Hd / 2));
          for (const sx of [-1, 1]) { const wh = mesh(cyl(3, 3, 2, 8), slam("#151515"), x + sx * (cw / 2 - 5), 3, -Hd / 2 + 2); wh.rotation.z = Math.PI / 2; g.add(wh); }
        }
        break;
      }
      case "parkbank": {
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const wood = slam("#7a5230"), iron = slam("#1e2224");
        for (let k = 0; k < 3; k++) c.add(add(mesh(box(len, 2, wid * 0.22), wood, 0, 14, -wid * 0.28 + k * wid * 0.26)));
        for (let k = 0; k < 2; k++) { const b = add(mesh(box(len, 4, 2), wood, 0, 21 + k * 6, -wid * 0.42)); c.add(b); }
        for (const sx of [-1, 1]) { c.add(add(mesh(box(3, 14, wid * 0.8), iron, sx * (len / 2 - 6), 7, 0))); c.add(mesh(box(3, 18, 2.4), iron, sx * (len / 2 - 6), 20, -wid * 0.42)); }
        break;
      }
      case "polizeiauto": {
        // Streifenwagen: silber-blau, Blaulichtbalken auf dem Dach (blinkt, siehe moving)
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd, c = group(); if (o.vert) c.rotation.y = Math.PI / 2; g.add(c);
        const blue = slam("#1e4aa8");
        const roofY = carBody(c, add, len, wid, "#d8dde2", R, { police: true });
        for (const sz of [-1, 1]) { c.add(mesh(box(len * 0.86, 4.5, 0.8), blue, 0, 15, sz * (wid / 2 + 0.3))); c.add(mesh(box(len * 0.3, 2.4, 0.8), slam("#3ac84a"), len * 0.12, 20.4, sz * (wid / 2 + 0.1))); } // blaues Band, grüner Zierstreifen
        const bar = group(-len * 0.1, roofY + 1, 0); c.add(bar);
        bar.add(mesh(box(6, 3, wid * 0.7), slam("#2a2a2a"), 0, -1, 0));
        const bl = mesh(box(5, 4, wid * 0.3), sbasic("#3a7aff"), 0, 1.5, -wid * 0.17), rd = mesh(box(5, 4, wid * 0.3), sbasic("#ff2a2a"), 0, 1.5, wid * 0.17);
        bar.add(bl, rd);
        g.userData.moving = [{ obj: bar, fn: (b, t) => { const on = Math.sin(t * 15) > 0; bl.visible = on; rd.visible = !on; } }];
        break;
      }
      case "bushalte": {
        // Bushaltestelle: Wartehäuschen mit Glasrückwand, Dach, Bank, Haltestellenschild (grünes H auf gelbem Kreis)
        const glass = smat("boothglass", () => new T3.MeshLambertMaterial({ color: 0x8fc8de, emissive: 0x1a3440 })), frame = slam("#5a6066");
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mesh(box(2.5, 52, 2.5), frame, sx * (W / 2 - 2), 26, sz * (Hd / 2 - 2)));
        g.add(mesh(box(W - 4, 44, 1), glass, 0, 26, -Hd / 2 + 2));
        for (const sx of [-1, 1]) g.add(mesh(box(1, 44, Hd - 6), glass, sx * (W / 2 - 2), 26, 0));
        add(mesh(box(W + 6, 3, Hd + 6), slam("#3a4046"), 0, 53.5, 0));
        add(mesh(box(W * 0.6, 3, Hd * 0.3), slam("#7a5230"), 0, 14, -Hd * 0.2));
        g.add(mesh(box(W * 0.25, 9, 1.2), sbasic("#e8f0f4"), -W * 0.25, 40, -Hd / 2 + 2.8));
        const pole = group(W / 2 + 6, 0, Hd / 2 - 2); g.add(pole);
        pole.add(mesh(cyl(1.2, 1.2, 60, 6), slam("#9aa0a4"), 0, 30, 0));
        const sign = mesh(cyl(7, 7, 1.4, 14), slam("#f2d21a"), 0, 60, 0); sign.rotation.x = Math.PI / 2; pole.add(sign);
        pole.add(mesh(box(6, 7, 1.6), slam("#1e7a3a"), 0, 60, 0.4));
        break;
      }
      case "rollstuhl": {
        const silver = slam("#9aa3ad"), black = slam("#1a1a1a");
        for (const sz of [-1, 1]) { const wh = mesh(ring(10, 1.4), black, 0, 11, sz * (Hd / 2 - 2)); add(wh); g.add(mesh(ring(8, 0.6), silver, 0, 11, sz * (Hd / 2 - 0.6))); }
        add(mesh(box(W * 0.7, 3, Hd - 8), slam("#2a3a5a"), 0, 15, 0));
        add(mesh(box(2.5, 16, Hd - 8), slam("#2a3a5a"), -W * 0.32, 24, 0));
        for (const sz of [-1, 1]) { g.add(mesh(box(W * 0.6, 1.6, 1.6), silver, 0, 21, sz * (Hd / 2 - 5))); g.add(mesh(cyl(2.4, 2.4, 2, 8), black, W * 0.32, 2.4, sz * (Hd / 2 - 6)).rotateX(Math.PI / 2)); }
        break;
      }
      case "infusion": {
        const silver = slam("#b8c0c8");
        add(mesh(cyl(1, 1, 60, 6), silver, 0, 30, 0));
        for (let k = 0; k < 4; k++) { const leg = mesh(box(12, 1.6, 2), silver, 0, 1.5, 0); leg.rotation.y = k * Math.PI / 2; leg.translateX(6); g.add(leg); }
        g.add(mesh(box(12, 1.2, 1.2), silver, 0, 60, 0));
        add(mesh(box(5, 9, 2.4), slam("#d8eef4"), 4.5, 53, 0));
        g.add(mesh(box(3.6, 5, 2.6), slam("#b8202a"), -4.5, 54, 0));
        g.add(mesh(cyl(0.3, 0.3, 30, 4), slam("#e8f0f4"), 4.5, 34, 0));
        break;
      }
      case "zentrifuge": {
        // Labor-Zentrifuge: Gehäuse, Glasdeckel, darunter der rotierende Rotor mit leuchtenden Proben
        const r0 = Math.min(W, Hd) / 2 - 2;
        add(mesh(box(W - 2, 26, Hd - 2), slam("#c8ced4"), 0, 13, 0));
        g.add(mesh(box(W * 0.5, 5, 1), sbasic("#3aff8a"), 0, 16, Hd / 2 - 0.6));
        const rotor = group(0, 30, 0); g.add(rotor);
        rotor.add(mesh(cyl(r0 * 0.85, r0 * 0.85, 3, 12), slam("#5a646c"), 0, 0, 0));
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; rotor.add(mesh(cyl(2.2, 2.2, 7, 6), sbasic(k % 2 ? "#7aff6a" : "#ff6ad5"), Math.cos(a) * r0 * 0.6, 3, Math.sin(a) * r0 * 0.6)); }
        g.add(mesh(cyl(r0, r0, 1, 14), smat("boothglass", () => new T3.MeshLambertMaterial({ color: 0x8fc8de, emissive: 0x1a3440 })), 0, 38, 0));
        g.userData.moving = [{ obj: rotor, fn: (r, t) => { r.rotation.y = t * 9; } }];
        break;
      }
      // ---------------------------------------------------------------- v3.4 Stadt-Wahrzeichen (Hingucker)
      case "kaethchen": {
        // Heilbronn: Käthchenbrunnen – Brunnenschale, Säule, Bronze-Mädchen mit Kopftuch, sprudelndes Wasser
        const stone = slam("#7e725c"), stoneD = slam("#665c4a"), bronze = slam("#7a643a"), r0 = Math.min(W, Hd) / 2;
        add(mesh(cyl(r0, r0 + 2, 14, 16), stone, 0, 7, 0));
        g.add(mesh(cyl(r0 + 2.5, r0 + 2.5, 3, 16), stoneD, 0, 14, 0));
        g.add(mesh(cyl(r0 - 4, r0 - 4, 1, 16), smat("water", () => new T3.MeshLambertMaterial({ color: 0x2a5a72, emissive: 0x061a24 })), 0, 13, 0));
        add(mesh(cyl(9, 12, 40, 8), stone, 0, 32, 0));
        add(mesh(cyl(16, 14, 6, 10), stoneD, 0, 54, 0));
        statue(g, bronze, 0, 57, 0, 1.9, "dress");
        const jets = group(0, 0, 0); g.add(jets);
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.4, j = mesh(cone(2, 14, 5), sbasic("#7ab8d8"), Math.cos(a) * 13, 46, Math.sin(a) * 13); j.rotation.z = Math.PI; jets.add(j); }
        g.userData.moving = [{ obj: jets, fn: (j, t) => { j.children.forEach((c, i) => { c.scale.y = 0.8 + 0.25 * Math.sin(t * 9 + i * 1.7); }); } }];
        break;
      }
      case "roessle": {
        // Stuttgart: das Rössle aus dem Stadtwappen – schwarzes Pferd, steigend, auf gelbem Sockel
        const plinth = slam("#a8882a"), black = slam("#1e1a16");
        add(mesh(box(W, 34, Hd), slam("#6e6450"), 0, 17, 0));
        add(mesh(box(W + 6, 4, Hd + 6), slam("#5a5242"), 0, 2, 0));
        add(mesh(box(W - 10, 6, Hd - 10), plinth, 0, 37, 0));
        g.add(mesh(box(W * 0.5, 10, 1), plinth, 0, 18, Hd / 2 + 0.6));
        // Wappenschild vorn am Sockel: gelb mit schwarzem Pferd
        g.add(mesh(box(16, 20, 1.4), slam("#d8b83a"), 0, 20, Hd / 2 + 1.4));
        horse(g, black, 0, 12, Hd / 2 + 2.4, 0.42, true);
        horse(g, black, 0, 40, 0, 1.9, true);
        break;
      }
      case "loewe": {
        // München: Bayerischer Löwe auf dem Sockel, daneben die weiß-blaue Rautenfahne (weht)
        const stone = slam("#76705e"), bronze = slam("#8a7040");
        add(mesh(box(W * 0.72, 30, Hd), stone, -W * 0.12, 15, 0));
        add(mesh(box(W * 0.72 + 6, 4, Hd + 6), slam("#5e5a4a"), -W * 0.12, 30, 0));
        lion(g, bronze, -W * 0.12, 32, 0, 1.8);
        const pole = group(W / 2 - 6, 0, 0); g.add(pole);
        pole.add(mesh(cyl(1.4, 1.8, 110, 6), slam("#b8b8b0"), 0, 55, 0));
        const raute = tex("obs:raute", 64, 40, (gg) => { gg.fillStyle = "#f4f4f0"; gg.fillRect(0, 0, 64, 40); gg.fillStyle = "#1e64c8"; for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) if ((x + y) % 2 === 0) { gg.beginPath(); gg.moveTo(x * 8, y * 8 + 4); gg.lineTo(x * 8 + 4, y * 8); gg.lineTo(x * 8 + 8, y * 8 + 4); gg.lineTo(x * 8 + 4, y * 8 + 8); gg.fill(); } });
        const flag = group(0, 96, 0); pole.add(flag);
        flag.add(mesh(box(1, 24, 38), new T3.MeshLambertMaterial({ map: raute }), 0, 0, -19));
        g.userData.moving = [{ obj: flag, fn: (f, t) => { f.rotation.y = 0.35 + Math.sin(t * 2.2) * 0.25; f.rotation.x = Math.sin(t * 3.1) * 0.05; } }];
        break;
      }
      case "schoenbrunnen": {
        // Nürnberg: Schöner Brunnen – achteckiges Becken, gotische Turmspitze in Gold und Farbe, kleine Figuren
        const stone = slam("#7a766e"), gold = slam("#b8862a"), red = slam("#8a2018"), r0 = Math.min(W, Hd) / 2;
        add(mesh(cyl(r0, r0 + 2, 12, 8), stone, 0, 6, 0));
        g.add(mesh(cyl(r0 - 4, r0 - 4, 1, 8), smat("water", () => new T3.MeshLambertMaterial({ color: 0x3a7a9a, emissive: 0x0a2a3a })), 0, 11, 0));
        let y = 12;
        [[20, 30, stone], [16, 28, gold], [12, 26, red], [8.5, 24, gold], [5.5, 22, stone]].forEach(([rr, h, m], i) => {
          add(mesh(cyl(rr * 0.8, rr, h, 8), m, 0, y + h / 2, 0));
          for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + i * 0.2; g.add(mesh(cone(1.4, 7, 4), gold, Math.cos(a) * rr, y + h + 2, Math.sin(a) * rr)); if (i < 3 && k % 2 === 0) g.add(mesh(ico(1.6, 0), slam(i % 2 ? "#e8d8b8" : "#3a5a8a"), Math.cos(a) * (rr + 1.5), y + h * 0.5, Math.sin(a) * (rr + 1.5))); }
          y += h;
        });
        add(mesh(cone(5, 28, 8), gold, 0, y + 14, 0));
        g.add(mesh(ico(2.6, 0), gold, 0, y + 30, 0));
        // der goldene Ring im Gitter (Glücksbringer)
        g.add(mesh(ring(3, 0.6), gold, r0 - 2, 14, 0));
        break;
      }
      case "bach": {
        // Leipzig: Bach-Denkmal – Bronzefigur mit Perücke und Gehrock auf Sockel, Notenrolle in der Hand
        const stone = slam("#625e56"), bronze = slam("#56684e");
        add(mesh(box(W, 12, Hd), stone, 0, 6, 0));
        add(mesh(box(W * 0.7, 40, Hd * 0.7), stone, 0, 32, 0));
        add(mesh(box(W * 0.78, 4, Hd * 0.78), slam("#524e46"), 0, 52, 0));
        g.add(mesh(box(W * 0.4, 8, 1), slam("#a8985a"), 0, 32, Hd * 0.35 + 0.6));
        statue(g, bronze, 0, 54, 0, 2.0, "coat");
        // Orgelpfeifen hinter dem Denkmal (Thomaskirche)
        for (let k = 0; k < 9; k++) { const h = 40 + (4 - Math.abs(k - 4)) * 9, px = -W * 0.4 + k * (W * 0.1); g.add(mesh(cyl(2.2, 2.2, h, 8), slam("#b8bcc0"), px, h / 2 + 6, -Hd * 0.44)); g.add(mesh(box(2.6, 2, 0.6), slam("#1e1e1e"), px, 6 + h * 0.22, -Hd * 0.44 + 2.2)); }
        break;
      }
      case "tor": {
        // Berlin: Brandenburger Tor – Sockel, sechs dorische Säulen, Gebälk, Attika und Quadriga (Kupfergrün)
        const sand = slam("#d8c8a0"), sandD = slam("#b8a880"), copper = slam("#4a8a6a");
        add(mesh(box(W, 6, Hd), sandD, 0, 3, 0));
        for (let k = 0; k < 6; k++) { const x = -W / 2 + 10 + k * ((W - 20) / 5); add(mesh(cyl(4.2, 4.6, 52, 10), sand, x, 32, 0)); add(mesh(box(11, 3, 11), sandD, x, 7, 0)); }
        add(mesh(box(W + 4, 10, Hd + 4), sand, 0, 63, 0));
        add(mesh(box(W * 0.55, 12, Hd * 0.7), sandD, 0, 74, 0));
        for (const sx of [-1, 1]) add(mesh(box(W * 0.12, 26, Hd), sand, sx * (W / 2 - W * 0.06), 32, 0));
        const q = group(0, 80, 0); g.add(q);
        for (let k = 0; k < 4; k++) horse(q, copper, -9 + k * 6, 0, 2, 0.42, false);
        q.add(mesh(box(8, 6, 10), copper, 0, 4, -4));
        statue(q, copper, 0, 6, -5, 0.55, "dress");
        q.add(mesh(cyl(0.5, 0.5, 18, 4), copper, 3, 18, -5));
        q.add(mesh(ring(2.6, 0.5), copper, 3, 27, -5));
        break;
      }
      case "bembel": {
        // Frankfurt: Riesen-Bembel (Apfelweinkrug) – grauer Steinzeug-Bauch mit blauen Ranken, Henkel, Holztisch mit Gerippten
        const r0 = Math.min(W, Hd) / 2 - 6;
        const glaze = tex("obs:bembel", 128, 64, (gg) => {
          gg.fillStyle = "#a8acb0"; gg.fillRect(0, 0, 128, 64);
          gg.strokeStyle = "#1e3a8a"; gg.lineWidth = 3;
          for (const y of [8, 56]) { gg.beginPath(); gg.moveTo(0, y); gg.lineTo(128, y); gg.stroke(); }
          gg.lineWidth = 2.2;
          for (let x = 0; x < 128; x += 32) { gg.beginPath(); gg.moveTo(x, 32); gg.bezierCurveTo(x + 8, 14, x + 24, 50, x + 32, 32); gg.stroke(); gg.beginPath(); gg.arc(x + 16, 26, 4, 0, Math.PI * 2); gg.stroke(); }
        });
        const body = mesh(ico(r0, 2), new T3.MeshLambertMaterial({ map: glaze }), 0, r0 + 2, 0); body.scale.y = 1.15; add(body);
        add(mesh(cyl(r0 * 0.45, r0 * 0.55, 14, 12), slam("#a8acb0"), 0, r0 * 2.3 + 6, 0));
        g.add(mesh(ring(r0 * 0.5, 2), slam("#1e3a8a"), 0, r0 * 2.3 + 13, 0));
        const handle = mesh(torus(r0 * 0.5, 2.6, Math.PI), slam("#a8acb0"), -r0 * 0.95, r0 * 1.4, 0); handle.rotation.z = Math.PI / 2; g.add(handle);
        g.add(mesh(cone(3, 9, 6), slam("#a8acb0"), r0 * 0.55, r0 * 2.3 + 10, 0).rotateZ(-0.9));
        for (const [x, z] of [[r0 + 6, r0 * 0.5], [r0 + 9, -r0 * 0.4]]) g.add(mesh(cyl(2.6, 2.2, 8, 8), smat("gerippt", () => new T3.MeshLambertMaterial({ color: 0xd8e0c0, emissive: 0x2a2a10 })), x, 4, z));
        break;
      }
      case "narrenwagen": {
        // Köln: Karnevalswagen – Wagen in Rot-Weiß, Riesenkopf eines Jecken mit Narrenkappe (nickt), Kamelle-Kisten
        const len = W, wid = Hd;
        add(mesh(box(len, 16, wid), slam("#c81e1e"), 0, 14, 0));
        for (let k = 0; k < 6; k++) g.add(mesh(box(len / 6 - 2, 5, wid + 0.6), slam(k % 2 ? "#f4f0e8" : "#c81e1e"), -len / 2 + (k + 0.5) * (len / 6), 9, 0));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = mesh(cyl(6, 6, 4, 10), slam("#1a1a1a"), sx * len * 0.34, 6, sz * (wid / 2 - 1)); wh.rotation.x = Math.PI / 2; g.add(wh); }
        const headG = group(-len * 0.08, 24, 0); g.add(headG);
        headG.add(mesh(ico(17, 2), slam("#f0c8a0"), 0, 17, 0));
        headG.add(mesh(ico(4, 1), slam("#d8302a"), 15, 16, 0));
        for (const sz of [-6, 6]) headG.add(mesh(ico(2.4, 1), slam("#1a1a1a"), 13, 23, sz));
        headG.add(mesh(box(2, 3, 14), slam("#a8201e"), 14, 9, 0));
        const capCols = ["#2a8a3a", "#e8c21a", "#c81e1e"];
        for (let k = 0; k < 3; k++) { const cn = mesh(cone(6, 22, 6), slam(capCols[k]), 0, 36, (k - 1) * 9); cn.rotation.x = (k - 1) * 0.6; headG.add(cn); headG.add(mesh(ico(2.2, 0), sbasic("#ffe24a"), 0, 47, (k - 1) * 18)); }
        for (const z of [-wid * 0.3, wid * 0.3]) add(mesh(box(12, 8, 10), slam("#c8a46a"), len * 0.32, 26, z));
        g.userData.moving = [{ obj: headG, fn: (h, t) => { h.rotation.z = Math.sin(t * 2.6) * 0.18; h.rotation.x = Math.sin(t * 1.7) * 0.08; } }];
        break;
      }
      case "leuchtturm": {
        // Hamburg: Leuchtturm rot-weiß, Galerie, Laterne mit kreisendem Lichtstrahl
        const r0 = Math.min(W, Hd) / 2 - 4;
        const stripes = tex("obs:leuchtturm", 32, 64, (gg) => { for (let k = 0; k < 6; k++) { gg.fillStyle = k % 2 ? "#f2eee6" : "#c81e1e"; gg.fillRect(0, k * 64 / 6, 32, 64 / 6 + 1); } });
        add(mesh(cyl(r0 + 6, r0 + 8, 10, 12), slam("#6a6a64"), 0, 5, 0));
        add(mesh(cyl(r0 * 0.62, r0, 118, 14), new T3.MeshLambertMaterial({ map: stripes }), 0, 69, 0));
        add(mesh(cyl(r0 * 0.9, r0 * 0.9, 3, 14), slam("#2a2a2a"), 0, 129, 0));
        g.add(mesh(ring(r0 * 0.88, 0.8), slam("#2a2a2a"), 0, 134, 0));
        g.add(mesh(cyl(r0 * 0.5, r0 * 0.5, 12, 12), sbasic("#fff2b0"), 0, 137, 0));
        add(mesh(cone(r0 * 0.62, 12, 12), slam("#c81e1e"), 0, 149, 0));
        for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3, rk = mesh(ico(6 + (k % 3) * 2, 0), slam("#4a4a46"), Math.cos(a) * (r0 + 9), 4, Math.sin(a) * (r0 + 9)); rk.scale.y = 0.6; g.add(rk); }
        const lr = mesh(torus(6, 1.8), slam("#e8e4dc"), r0 * 0.75, 36, r0 * 0.68); lr.rotation.y = 0.7; g.add(lr);
        for (let k = 0; k < 4; k++) { const seg = mesh(torus(6, 1.9, Math.PI / 4), slam("#c81e1e"), r0 * 0.75, 36, r0 * 0.68); seg.rotation.set(0, 0.7, k * Math.PI / 2); g.add(seg); }
        const beam = group(0, 137, 0); g.add(beam);
        const bm = smat("beam:light", () => new T3.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.22, blending: T3.AdditiveBlending, depthWrite: false }));
        for (const s of [1, -1]) { const b = mesh(cyl(1.5, 14, 170, 8, true), bm, s * 88, 0, 0); b.rotation.z = Math.PI / 2; beam.add(b); }
        g.userData.moving = [{ obj: beam, fn: (b, t) => { b.rotation.y = t * 1.3; } }];
        break;
      }
      case "windmuehle": {
        // Amsterdam: Windmühle – achteckiger Turm, Galerie, Kappe, vier Flügel mit Gitter (drehen sich)
        const r0 = Math.min(W, Hd) / 2 - 4;
        add(mesh(cyl(r0 * 0.6, r0 * 0.85, 70, 8), slam("#5a6a4a"), 0, 35, 0));
        add(mesh(cyl(r0 * 0.95, r0 * 0.95, 3, 8), slam("#3a2a1a"), 0, 38, 0));
        add(mesh(cone(r0 * 0.66, 22, 8), slam("#3a2a22"), 0, 81, 0));
        g.add(mesh(box(8, 10, 1), slam("#e8e0c8"), 0, 20, r0 * 0.8));
        const hub = group(0, 76, r0 * 0.65); g.add(hub);
        hub.add(mesh(cyl(3, 3, 6, 8), slam("#2a2a2a"), 0, 0, 0).rotateX(Math.PI / 2));
        const sail = slam("#e8e2d0"), lath = slam("#4a3a2a");
        for (let k = 0; k < 4; k++) {
          const arm = group(); arm.rotation.z = k * Math.PI / 2; hub.add(arm);
          arm.add(mesh(box(2, 62, 1.6), lath, 0, 31, 2));
          arm.add(mesh(box(12, 46, 0.8), sail, 7, 38, 2.6));
        }
        g.userData.moving = [{ obj: hub, fn: (h, t) => { h.rotation.z = t * 0.9; } }];
        break;
      }
      case "eiffel": {
        // Paris: Eiffelturm in klein – vier geneigte Gitterbeine, zwei Plattformen, schlanke Spitze
        const iron = slam("#6a4a32"), s = Math.min(W, Hd) / 2 - 6;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = mesh(box(5, 48, 5), iron, sx * s * 0.62, 22, sz * s * 0.62); leg.rotation.z = -sx * 0.32; leg.rotation.x = sz * 0.32; add(leg); }
        for (let k = 0; k < 4; k++) { const a = mesh(torus(s * 0.5, 1.4, Math.PI), iron, 0, 6, 0); a.rotation.y = k * Math.PI / 2; a.translateZ(s * 0.62); g.add(a); }
        add(mesh(box(s * 1.2, 4, s * 1.2), iron, 0, 46, 0));
        add(mesh(cyl(s * 0.18, s * 0.42, 44, 4), iron, 0, 70, 0).rotateY(Math.PI / 4));
        add(mesh(box(s * 0.55, 3, s * 0.55), iron, 0, 92, 0));
        add(mesh(cyl(1.2, s * 0.18, 46, 4), iron, 0, 116, 0).rotateY(Math.PI / 4));
        g.add(mesh(ico(1.6, 0), sbasic("#ffd27a"), 0, 140, 0));
        for (let k = 0; k < 14; k++) { const y = 12 + k * 9, sp = s * 0.62 * Math.max(0.08, 1 - y / 130); g.add(mesh(ico(0.9, 0), sbasic("#fff0c0"), (k % 2 ? 1 : -1) * sp, y, (k % 4 < 2 ? 1 : -1) * sp)); }
        break;
      }
      case "riesenrad": {
        // Wien: Riesenrad (Prater) – zwei Stützen, Rad mit Speichen und roten Gondeln (dreht langsam)
        const red = slam("#a8201e"), steel = slam("#4a4e52"), R0 = 52;
        for (const sz of [-1, 1]) for (const sx of [-1, 1]) { const st = mesh(box(3, 70, 3), steel, sx * 18, 33, sz * (Hd / 2 - 4)); st.rotation.z = sx * 0.28; add(st); }
        add(mesh(box(W, 4, Hd), slam("#5a5a54"), 0, 2, 0));
        const wheel = group(0, 66, 0); g.add(wheel);
        for (const sz of [-1, 1]) wheel.add(mesh(ring(R0, 1.4), steel, 0, 0, sz * 6));
        for (let k = 0; k < 8; k++) { const sp = mesh(box(1, R0 * 2, 1), steel, 0, 0, 0); sp.rotation.z = k * Math.PI / 8; wheel.add(sp); }
        for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; wheel.add(mesh(box(8, 7, 9), red, Math.cos(a) * R0, Math.sin(a) * R0 - 5, 0)); }
        wheel.add(mesh(cyl(3, 3, 16, 8), steel, 0, 0, 0).rotateX(Math.PI / 2));
        for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10 + 0.15; wheel.add(mesh(ico(1.3, 0), sbasic(k % 2 ? "#ffe2a0" : "#ff8a6a"), Math.cos(a) * R0, Math.sin(a) * R0, 7)); }
        g.userData.moving = [{ obj: wheel, fn: (wh, t) => { wh.rotation.z = t * 0.25; } }];
        break;
      }
      case "golem": {
        // Prag: der Golem aus Lehm – massiger Körper, schwere Arme, Schriftzeichen auf der Stirn
        const clay = slam("#7a4e32"), clayD = slam("#5a3a22");
        g.scale.setScalar(1.25);
        add(mesh(box(W * 0.8, 12, Hd * 0.8), slam("#5a5a54"), 0, 6, 0));
        for (const sz of [-1, 1]) add(mesh(cyl(6, 7, 26, 8), clayD, 0, 25, sz * 8));
        add(mesh(box(22, 30, 30), clay, 0, 52, 0));
        for (const sz of [-1, 1]) { add(mesh(cyl(5, 6, 30, 8), clayD, 0, 46, sz * 20)); g.add(mesh(ico(6, 1), clay, 0, 30, sz * 20)); }
        add(mesh(ico(10, 1), clay, 0, 74, 0));
        g.add(mesh(box(1, 3, 8), sbasic("#ffd27a"), 9.4, 78, 0));
        for (const sz of [-3.5, 3.5]) g.add(mesh(ico(1.4, 0), sbasic("#ff8a3a"), 9, 73, sz));
        break;
      }
      default:
        add(mesh(box(W, 30, Hd), slam("#555555"), 0, 15, 0));
    }
    if (o.landmark) plazaDeco(g, W, Hd);
    return g;
  }
  // v3.4 Platz-Ausstattung der Wahrzeichen: vier Laternen (Licht als Lichtinsel in fillBatches) und zwei Blumenbeete
  function plazaDeco(g, W, Hd) {
    const round = W / Hd < 1.6, ex = W / 2 + 30, ez = round ? Hd / 2 + 30 : Hd / 2 + 26, iron = slam("#1e2224");
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * ex * (round ? 0.72 : 1), z = sz * ez * (round ? 0.72 : 1);
      g.add(mesh(cyl(1.3, 2, 40, 6), iron, x, 20, z));
      g.add(mesh(box(5, 7, 5), sbasic("#ffe0a0"), x, 43, z));
      g.add(mesh(cone(4.4, 4, 4), iron, x, 48.5, z).rotateY(Math.PI / 4));
    }
    const cols = ["#d8302a", "#f2c21a", "#f4f0e8", "#8a4ad8", "#3a8a3a"];
    for (const s of [-1, 1]) {
      const bx = s * (ex + 18), bed = group(bx, 0, 6); g.add(bed);
      bed.add(mesh(box(18, 5, 28), slam("#3a2a1a"), 0, 2.5, 0));
      for (let k = 0; k < 9; k++) bed.add(mesh(ico(2.4, 0), slam(cols[k % 5]), -5 + (k % 3) * 5, 6, -9 + Math.floor(k / 3) * 9));
    }
  }
  const mix3 = (hex, k) => { const c = new T3.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new T3.Color(1, 1, 1), k); return `#${c.getHexString()}`; };

  // GPU-Speicher freigeben: alles außer geteilten Geometrien, Materialien und Texturen
  function disposeTree(root) {
    const cachedTex = new Set(texCache.values()), cachedGeo = new Set(geoCache.values());
    const drop = (m) => {
      if (sharedSet.has(m) || m === outlineMat) return;
      for (const k of ["map", "normalMap", "specularMap", "emissiveMap"]) if (m[k] && !cachedTex.has(m[k])) disposeTex(m[k]);
      m.dispose();
    };
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!cachedGeo.has(o.geometry)) o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(drop);
      if (o.customDepthMaterial) drop(o.customDepthMaterial);
    });
  }

  // ------------------------------------------------------------------
  // v3.5 Himmel & Skyline hinter den Häuserblöcken (Schulter-/Nahkamera, Menü): Nachthimmel mit Mond und
  // angeleuchteten Wolken, zwei Häuserreihen mit Fenstern, brennende Viertel mit Feuerschein,
  // animierte Rauchsäulen und kreisende Suchscheinwerfer. Ein Bild je Stadt, danach aus dem Cache.
  // ------------------------------------------------------------------
  const SKY_W = 3400, SKY_H = 700, SKY_BACK = 320, SKY_Y0 = -60; // Welteinheiten; sichtbar ist (Schulterkamera) das Band ≈ 70–530 über dem Boden
  function skylineTexture(id) {
    const fires = [];
    const t = tex(`sky:${id}`, 1024, 210, (g, W, H) => {
      let s = Math.floor(strHash(`sky|${id}`) * 4294967296) >>> 0;
      const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const py = (wy) => H - (wy - SKY_Y0) / SKY_H * H; // Welthöhe → Bildzeile
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#060a14"); sky.addColorStop(0.45, "#101828"); sky.addColorStop(0.72, "#2a2430"); sky.addColorStop(0.9, "#4a2c24"); sky.addColorStop(1, "#5a3220");
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(220,230,255,${0.1 + R() * 0.35})`; g.fillRect(R() * W, R() * py(420), 0.7, 0.7); } // Sterne
      // Mond mit Hof (tief, damit er im Bild ist)
      const mx = W * (0.6 + R() * 0.25), my = py(450 + R() * 40);
      const halo = g.createRadialGradient(mx, my, 0, mx, my, 46); halo.addColorStop(0, "rgba(200,215,255,0.4)"); halo.addColorStop(1, "rgba(200,215,255,0)");
      g.fillStyle = halo; g.fillRect(mx - 46, my - 46, 92, 92);
      g.fillStyle = "#e2e8f4"; g.beginPath(); g.arc(mx, my, 7, 0, TAU); g.fill();
      g.fillStyle = "rgba(120,130,150,0.35)"; for (const [dx, dy, r] of [[-2, -2, 2], [2, 2, 1.4], [3, -3, 1.1]]) { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, TAU); g.fill(); }
      // Wolkenbänder: dunkel, von unten orange angestrahlt (Brände)
      for (let k = 0; k < 30; k++) {
        const cx = R() * W, cy = py(300 + R() * 260), rx = 30 + R() * 90, ry = 5 + R() * 10;
        const cg = g.createRadialGradient(cx, cy + ry * 0.7, 0, cx, cy, rx);
        cg.addColorStop(0, `rgba(${110 + R() * 50 | 0},${55 + R() * 25 | 0},40,0.4)`); cg.addColorStop(0.5, "rgba(26,26,34,0.55)"); cg.addColorStop(1, "rgba(16,18,24,0)");
        g.fillStyle = cg; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
      }
      // Häuserreihen: hinten heller (Dunst), vorn dunkel; Fenster, Türme, Kräne, Funkmasten
      const row = (minH, maxH, col, winA, step) => {
        let x = -10;
        const base = py(0);
        while (x < W + 10) {
          const bw = step * (0.6 + R() * 1.1), top = py(minH + R() * (maxH - minH)), bh = base - top;
          g.fillStyle = col; g.fillRect(x, top, bw, bh);
          const kind = R();
          if (kind < 0.08) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw / 2, top - bh * 0.45); g.lineTo(x + bw, top); g.fill(); } // Kirchturmspitze
          else if (kind < 0.14) { g.fillRect(x + bw * 0.45, top - bh * 0.5, 1.4, bh * 0.5); g.fillStyle = "rgba(255,40,30,0.95)"; g.fillRect(x + bw * 0.45 - 0.6, top - bh * 0.5 - 1.6, 2.6, 2.6); g.fillStyle = col; } // Funkmast mit Warnlicht
          else if (kind < 0.18) { g.fillRect(x + bw * 0.2, top - 26, 2, 26); g.fillRect(x + bw * 0.2 - 18, top - 26, 44, 1.8); g.fillRect(x + bw * 0.2 + 20, top - 25, 0.8, 14); } // Baukran
          else if (kind < 0.32) { g.beginPath(); g.moveTo(x - 1, top); g.lineTo(x + bw / 2, top - 6); g.lineTo(x + bw + 1, top); g.fill(); } // Satteldach
          for (let wy = top + 3; wy < base - 3; wy += 4.2) for (let wx = x + 2; wx < x + bw - 2; wx += 3.6) {
            const r = R();
            if (r < winA) { g.fillStyle = r < winA * 0.25 ? "rgba(150,190,255,0.8)" : `rgba(255,${190 + R() * 40 | 0},${110 + R() * 30 | 0},${0.55 + R() * 0.4})`; g.fillRect(wx, wy, 1.4, 2); }
          }
          x += bw + R() * 2;
        }
      };
      row(150, 420, "#222a3a", 0.06, 26);
      { const hz = g.createLinearGradient(0, py(0), 0, py(260)); hz.addColorStop(0, "rgba(120,62,40,0.5)"); hz.addColorStop(1, "rgba(120,62,40,0)"); g.fillStyle = hz; g.fillRect(0, py(260), W, py(0) - py(260)); } // Dunst vom Feuerschein
      // Brände: Glut über den Dächern der vorderen Reihe
      for (let k = 0; k < 3; k++) {
        const fx = W * (0.1 + k * 0.33 + R() * 0.12), fy = py(150 + R() * 40);
        fires.push([fx / W, 150]);
        const fg = g.createRadialGradient(fx, fy, 0, fx, fy, 60); fg.addColorStop(0, "rgba(255,150,60,0.6)"); fg.addColorStop(0.4, "rgba(220,80,30,0.28)"); fg.addColorStop(1, "rgba(120,30,10,0)");
        g.fillStyle = fg; g.fillRect(fx - 60, fy - 60, 120, 120);
      }
      row(90, 220, "#0c1018", 0.09, 20);
      for (const [u] of fires) { // Flammen auf den vorderen Dächern
        const fx = u * W;
        for (let f = 0; f < 10; f++) { g.fillStyle = `rgba(255,${120 + R() * 110 | 0},40,${0.65 + R() * 0.3})`; const w2 = 2 + R() * 4, h2 = 5 + R() * 14, x0 = fx - 16 + R() * 32, y0 = py(170 + R() * 40); g.beginPath(); g.moveTo(x0 - w2, y0); g.quadraticCurveTo(x0, y0 - h2, x0 + w2, y0); g.fill(); }
      }
      g.fillStyle = "#06080b"; g.fillRect(0, py(0), W, H - py(0));
    }, false);
    t.userData.fires = t.userData.fires || fires;
    return t;
  }
  function smokeTexture() {
    return tex("fx:smokecol", 64, 256, (g, W, H) => {
      let s = 9137; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let k = 0; k < 70; k++) {
        const y = R() * H, x = W / 2 + (R() - 0.5) * W * 0.5 * (0.4 + y / H), r = 10 + R() * 16;
        for (const yy of [y, y - H, y + H]) { // nahtlos nach oben kachelbar
          const gr = g.createRadialGradient(x, yy, 0, x, yy, r); const a = 0.22 + R() * 0.2, v = 96 + R() * 60 | 0;
          gr.addColorStop(0, `rgba(${v},${v - 4},${v - 6},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
          g.fillStyle = gr; g.fillRect(x - r, yy - r, r * 2, r * 2);
        }
      }
      // seitlich ausblenden
      g.globalCompositeOperation = "destination-in";
      const fade = g.createLinearGradient(0, 0, W, 0); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(0.3, "rgba(0,0,0,1)"); fade.addColorStop(0.7, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = fade; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
    }, true);
  }
  function addSkyline(g, w) {
    const id = w.cityId || w.theme || "street";
    const t = skylineTexture(id);
    const z = D.T - 260 - SKY_BACK, cx = D.W / 2;
    const back = mesh(new T3.PlaneGeometry(SKY_W, SKY_H), new T3.MeshBasicMaterial({ map: t, fog: false, depthWrite: false }), cx, SKY_Y0 + SKY_H / 2, z);
    back.renderOrder = -5;
    g.add(back);
    const sky = { back, smokes: [], beams: [], glows: [] };
    // Rauchsäulen über den Bränden (Textur läuft nach oben, Säule neigt sich im Wind), Feuerschein flackert
    const smoke = smokeTexture();
    const blob = tex("fx:glowblob", 64, 64, (gg) => { const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64); });
    for (const [u, fy] of t.userData.fires || []) {
      const sx = cx + (u - 0.5) * SKY_W;
      const m = new T3.MeshBasicMaterial({ map: smoke.clone(), transparent: true, depthWrite: false, fog: false, color: 0x8a7c74, opacity: 0.9 });
      m.map.needsUpdate = true; m.map.repeat.set(1, 0.65);
      const col = mesh(new T3.PlaneGeometry(240, 760), m, sx + 60, fy + 360, z + 30);
      col.rotation.z = -0.16; col.renderOrder = -4;
      g.add(col); sky.smokes.push(col);
      const gm = new T3.MeshBasicMaterial({ map: blob, color: 0xff7a30, transparent: true, opacity: 0.5, blending: T3.AdditiveBlending, depthWrite: false, fog: false });
      const glowM = mesh(new T3.PlaneGeometry(380, 240), gm, sx, fy + 30, z + 34);
      glowM.renderOrder = -3; g.add(glowM); sky.glows.push(glowM);
    }
    // Suchscheinwerfer: lange, weiche Lichtkegel, die langsam über den Himmel streichen
    const beamTex = tex("fx:searchbeam", 8, 128, (gg) => { const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.5, "rgba(255,255,255,0.3)"); gr.addColorStop(1, "rgba(255,255,255,0)"); gg.fillStyle = gr; gg.fillRect(0, 0, 8, 128); });
    for (const [bx, ph] of [[-620, 0], [760, 2.1]]) {
      const geo2 = new T3.ConeGeometry(90, 1100, 16, 1, true); geo2.translate(0, -550, 0); geo2.rotateX(Math.PI); // Spitze unten
      const bm = new T3.MeshBasicMaterial({ map: beamTex, color: 0xcfe0ff, transparent: true, opacity: 0.34, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false });
      const b = mesh(geo2, bm, cx + bx, 90, z + 60);
      b.renderOrder = -2; b.userData.ph = ph; g.add(b); sky.beams.push(b);
    }
    return sky;
  }
  function updateSkyline(t, w) {
    const sk = room && room.sky;
    if (!sk) return;
    const vis = camMode !== "top" || !!(w && w.menuCam);
    sk.back.visible = vis;
    for (const c of sk.smokes) { c.visible = vis; c.material.map.offset.y = -t * 0.035; }
    for (let i = 0; i < sk.glows.length; i++) { const gm = sk.glows[i]; gm.visible = vis; gm.material.opacity = 0.38 + 0.14 * Math.sin(t * 5.3 + i * 2) + 0.06 * Math.sin(t * 13 + i); }
    for (const b of sk.beams) { b.visible = vis; const ph = b.userData.ph; b.rotation.z = Math.sin(t * 0.22 + ph) * 0.55; b.rotation.x = -0.35 + Math.sin(t * 0.17 + ph * 1.7) * 0.12; }
  }

  const floorWetU = { value: 0.75 }, floorSkyU = { value: new T3.Color(0.1, 0.11, 0.16) }; // v3.6 Boden-Nässe
  function buildRoom(w) {
    for (const [, d] of dying) releaseModel(d.M);
    dying.clear();
    resetCorpseBatch();
    if (room) {
      scene.remove(room.group);
      disposeTree(room.group);
      if (room.floorTex) room.floorTex.dispose();
    }
    const th = THEME[w.theme] || THEME.street;
    hemi.color.setHex(th.sky); hemi.groundColor.setHex(th.ground);
    const boss = w.isBossRoom;
    hemi.intensity = th.hemi * (boss ? 0.75 : 1);
    moon.color.setHex(th.moon); moon.intensity = th.moonI * (boss ? 0.7 : 1);
    const baseHemi = hemi.intensity, baseMoon = moon.intensity;
    setupAtmo(w.theme, w.weather, w.fest);
    scene.fog.color.setHex(th.fog);
    renderer.setClearColor(th.fog, 1);
    const grade = CITY_GRADE[w.cityId];
    if (grade) {
      hemi.color.lerp(new T3.Color(grade.sky), 0.55);
      moon.color.lerp(new T3.Color(grade.moon), 0.5);
      scene.fog.color.lerp(new T3.Color(grade.fog), 0.72);
      renderer.setClearColor(scene.fog.color, 1);
      hemi.intensity *= grade.hemiMul || 1;
      if (grade.fogNear) scene.fog.near = grade.fogNear;
      if (grade.fogFar) scene.fog.far = grade.fogFar;
      renderer.toneMappingExposure = grade.exposure || 1.15;
      const mc = new T3.Color(grade.moon), avg = (mc.r + mc.g + mc.b) / 3;
      postTint.set(1 + (mc.r - avg) * 0.12, 1 + (mc.g - avg) * 0.12, 1 + (mc.b - avg) * 0.12);
      if (boss) postTint.x *= 1.04;
    } else {
      postTint.set(1, 1, 1);
      scene.fog.near = 1500; scene.fog.far = 2700;
      renderer.toneMappingExposure = 1.15;
    }

    const g = new T3.Group();
    const aw = D.R - D.L, ah = D.B - D.T;
    // Boden: bestehende 2D-Bodentextur (inkl. Blut & Spuren) als Textur
    const fc = w.floorCanvas;
    const floorTex = new T3.CanvasTexture(fc);
    floorTex.colorSpace = T3.SRGBColorSpace;
    floorTex.anisotropy = 8;
    const WHt = D.WH || D.H; // v3.4: Boden-Leinwand hat Welthöhe (Arena länger als der Bildschirm)
    floorTex.repeat.set(aw / D.W, ah / WHt);
    floorTex.offset.set(D.L / D.W, 1 - D.B / WHt);
    const crop = (t) => { t.repeat.set(aw / D.W, ah / WHt); t.offset.set(D.L / D.W, 1 - D.B / WHt); return t; };
    const floorN = crop(gpuNormalMap(fc, 2.4, 720, T3.ClampToEdgeWrapping, 8));
    const floorMat = new T3.MeshPhongMaterial({ map: floorTex, color: 0xb4b4b4, normalMap: floorN, normalScale: new T3.Vector2(1, 1), specular: 0x4a5058, shininess: 60 });
    const glossTex = fc.gloss ? crop(new T3.CanvasTexture(fc.gloss)) : null; // frisches Blut wird hier nass glänzend eingestempelt
    if (glossTex) floorMat.specularMap = glossTex;
    // v3.6 nasser Boden: glänzende Stellen (Pfützen, Rinnstein, Blut) spiegeln Nachthimmel und Stadtschein – flach betrachtet
    // stärker (Fresnel), in der steilen Übersicht dezent. Nässe je Wetter, Himmelsfarbe aus Mond und Feuerschein.
    floorWetU.value = w.weather === "rain" ? 1 : w.weather === "snow" ? 0.3 : w.theme === "hospital" || w.theme === "lab" ? 0.6 : 0.75;
    floorSkyU.value.setRGB(0.07, 0.085, 0.13).lerp(new T3.Color(th.moon), 0.12).add(new T3.Color(0.05, 0.025, 0.012));
    floorMat.onBeforeCompile = (sh) => {
      sh.uniforms.uFloorWet = floorWetU; sh.uniforms.uFloorSky = floorSkyU;
      sh.fragmentShader = "uniform float uFloorWet;\nuniform vec3 uFloorSky;\n" + sh.fragmentShader.replace("#include <opaque_fragment>",
        "{ float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.5);\n\t  outgoingLight += mix(uFloorSky * 0.3, uFloorSky * 1.25, fr) * specularStrength * uFloorWet; }\n\t#include <opaque_fragment>");
    };
    floorMat.customProgramCacheKey = () => "floor:v36";
    const floor = mesh(new T3.PlaneGeometry(aw, ah), floorMat, (D.L + D.R) / 2, 0, (D.T + D.B) / 2);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // Umgebung außerhalb der Arena (dunkler Boden)
    const outer = mesh(new T3.PlaneGeometry(D.W * 4, WHt * 4), slam("#0a0d0c"), D.W / 2, -0.5, WHt / 2);
    outer.rotation.x = -Math.PI / 2;
    g.add(outer);

    uncached = true;
    // Kleinteile ohne Textur werden am Ende zu wenigen Meshes verschmolzen
    const deco = new T3.Group();
    // Wände: massive Blöcke (Seiten mit Textur, dunkles Dach, heller Mauerrand zur Arena)
    const wt = wallTexture(th.wall), wn = normalTexFor(`wall:${th.wall}`, 4), rt = roofTexture(th.wall);
    const edgeMat = slam(EDGE[w.theme] || EDGE.street);
    // v3.5 Häuserfassaden zur Arena (Innenseite der Blöcke): Läden, Fenster, Leuchtreklame
    const fac = facadeTextures(th.wall), facN = normalTexFor(`fac:${th.wall}`, 2.2), facLights = [];
    let fs = Math.floor(strHash(`${w.cityId}|${w.district}|${w.theme}`) * 4294967296) >>> 0;
    const FR = () => { fs = (fs * 1664525 + 1013904223) >>> 0; return fs / 4294967296; };
    const wall = (x0, z0, x1, z1, h, edge, inner = -1) => {
      const len = edge === "x" ? z1 - z0 : x1 - x0;
      const rep2 = (src, rx, ry) => { const t = src.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; };
      const side = new T3.MeshLambertMaterial({ map: rep2(wt, len / 128, h / 64), normalMap: rep2(wn, len / 128, h / 64) });
      const roof = new T3.MeshLambertMaterial({ map: rep2(rt, (x1 - x0) / 96, (z1 - z0) / 96) });
      const mats = [side, side, roof, side, side, side];
      if (inner >= 0) {
        const rx = len / FAC_W, off = Math.floor(FR() * 8) / 8, fm = rep2(fac.map, rx, 1), fe = rep2(fac.emi, rx, 1), fnm = rep2(facN, rx, 1);
        fm.offset.x = fe.offset.x = fnm.offset.x = off;
        mats[inner] = new T3.MeshLambertMaterial({ map: fm, emissiveMap: fe, emissive: 0xffffff, emissiveIntensity: 1.2, normalMap: fnm });
        // v3.6 erleuchtete Läden/Leuchtreklame am Fuß der Fassade: Lichtschein und Spiegelung auf dem Boden
        const cols = facadeGlowCols(th.wall);
        let run2 = null;
        const flush = () => { if (run2) { facLights.push(run2); run2 = null; } };
        for (let s0 = 6; s0 < len - 6; s0 += 12) {
          const u = inner === 0 ? 1 - s0 / len : s0 / len, tu = u * rx + off, ci = Math.floor((((tu % 1) + 1) % 1) * cols.length) % cols.length, cg = cols[ci];
          const wx = inner === 0 ? x1 : inner === 1 ? x0 : x0 + s0, wz = inner === 4 ? z1 : z0 + s0;
          if (!cg || wx < D.L - 2 || wx > D.R + 2 || wz > D.B) { flush(); continue; } // nur Läden an der Arena
          if (run2 && run2.rgb === cg.rgb && Math.abs(run2.x - wx) + Math.abs(run2.z - wz) < 60 && run2.n < 4) { run2.x = (run2.x * run2.n + wx) / (run2.n + 1); run2.z = (run2.z * run2.n + wz) / (run2.n + 1); run2.n++; run2.k = Math.max(run2.k, cg.k); }
          else { flush(); run2 = { x: wx, z: wz, nx: inner === 0 ? 1 : inner === 1 ? -1 : 0, nz: inner === 4 ? 1 : 0, rgb: cg.rgb, k: cg.k, n: 1, ph: FR() * TAU }; }
        }
        flush();
      }
      const m = mesh(box(x1 - x0, h, z1 - z0), mats, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      // Mauerrand an der Innenkante
      if (edge === "x") { const ex = x1 <= D.L + 1 ? x1 - 4 : x0 + 4; deco.add(mesh(box(8, 3, z1 - z0), edgeMat, ex, h + 1.5, (z0 + z1) / 2)); }
      else { const ez = z1 <= D.T + 1 ? z1 - 4 : z0 + 4; deco.add(mesh(box(x1 - x0, 3, 8), edgeMat, (x0 + x1) / 2, h + 1.5, ez)); }
    };
    // v3.5 Häuserblöcke höher (zwei Obergeschosse über dem Laden); Tor und Durchgänge bleiben auf WH
    const WH = 64, SH = 128, BH = 112, dl = D.W / 2 - D.DOOR_W / 2, dr = D.W / 2 + D.DOOR_W / 2;
    const BACK = 260, SIDE = 240;
    wall(-SIDE, D.T - BACK, dl, D.T, BH, "z", 4);
    wall(dr, D.T - BACK, D.W + SIDE, D.T, BH, "z", 4);
    { // Haus über dem Torbogen, zur Arena mit Obergeschoss-Fassade
      const bw = D.DOOR_W + 24, bh = BH - WH, fm = fac.map.clone(), fe = fac.emi.clone();
      for (const t of [fm, fe]) { t.needsUpdate = true; t.repeat.set(bw / FAC_W, bh / BH * 0.55); t.offset.set(0.5, 1 - bh / BH * 0.55); }
      const dark = slam("#2a2622"), front = new T3.MeshLambertMaterial({ map: fm, emissiveMap: fe, emissive: 0xffffff, emissiveIntensity: 1.2 });
      const gb = mesh(box(bw, bh, 30), [dark, dark, dark, dark, front, dark], D.W / 2, WH + bh / 2, D.T - 15);
      gb.castShadow = true; g.add(gb);
    }
    // v3.0 Seitenwände mit Öffnungen für die Horden-Gänge
    const gts = w.gates || [];
    for (const left of [true, false]) {
      const x0 = left ? -SIDE : D.R, x1 = left ? D.L : D.W + SIDE;
      const cuts = gts.filter((q) => (q.side < 0) === left).map((q) => [q.y - q.h / 2, q.y + q.h / 2]).sort((a, b) => a[0] - b[0]);
      let z = D.T;
      for (const [a, b] of cuts) {
        if (a > z) wall(x0, z, x1, a, SH, "x", left ? 0 : 1);
        z = b;
        deco.add(mesh(box(x1 - x0, 1, b - a), slam("#141210"), (x0 + x1) / 2, 0.45, (a + b) / 2)); // Gangboden
        for (const zz of [a - 3, b + 3]) deco.add(mesh(box(x1 - x0, 2, 5), slam("#c8901a"), (x0 + x1) / 2, SH + 1.2, zz)); // Warnkante oben
        deco.add(mesh(box(8, 7, 12), sbasic("#ff3a24"), left ? D.L - 6 : D.R + 6, SH + 4, a - 8)); // Warnlampe
      }
      wall(x0, z, x1, D.B + 60, SH, "x", left ? 0 : 1);
    }
    wall(D.L, D.B, D.R, D.B + 60, 14, "z");
    // Gang hinter der Tür
    const hall = mesh(box(D.DOOR_W, 1, BACK), slam(ROOF[w.theme] || ROOF.street), D.W / 2, 0.3, D.T - BACK / 2);
    deco.add(hall);
    // Kleinkram auf den Dächern (Lüftung, Rohre) – macht die Ränder lebendiger
    const R2 = (() => { let s2 = (w.obstacles.length * 7919 + (w.theme.length * 31)) >>> 0; return () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; }; })();
    const propMat = slam(PROP[w.theme] || PROP.street);
    for (let i = 0; i < 5; i++) {
      const left = i % 2 === 0;
      const x = left ? -SIDE + 40 + R2() * (SIDE - 20) : D.R + 30 + R2() * (SIDE - 60);
      const z = D.T + 60 + R2() * (D.B - D.T - 120);
      const bw = 22 + R2() * 26, bd = 26 + R2() * 40, bh = 10 + R2() * 14;
      deco.add(mesh(box(bw, bh, bd), propMat, Math.min(x, left ? D.L - bw / 2 - 14 : 9e9), SH + bh / 2, z));
    }
    for (const x of [D.L + 40 + R2() * 60, D.R - 100 - R2() * 60]) {
      const pipe = mesh(cyl(4, 4, BACK - 30, 8), propMat, x, BH + 4, D.T - BACK / 2 - 10);
      pipe.rotation.x = Math.PI / 2;
      deco.add(pipe);
    }

    // Tür (zwei Torflügel + Lampen)
    const door = { panels: [], lamps: [] };
    const panelMat = new T3.MeshLambertMaterial({ color: 0x5b6167 });
    for (const s of [-1, 1]) {
      const p = mesh(box(D.DOOR_W / 2, WH - 6, 10), panelMat, D.W / 2 + s * D.DOOR_W / 4, (WH - 6) / 2, D.T - 12);
      p.castShadow = true;
      g.add(p);
      door.panels.push({ mesh: p, s });
      const lampMat = new T3.MeshBasicMaterial({ color: 0xff3a2a });
      const lamp = mesh(box(5, 9, 5), lampMat, D.W / 2 + s * (D.DOOR_W / 2 + 7), WH - 14, D.T - 2);
      g.add(lamp);
      door.lamps.push(lamp);
    }
    deco.add(mesh(box(D.DOOR_W + 16, 8, 26), slam("#2a2f33"), D.W / 2, WH - 2, D.T - 12));

    // Hindernisse
    const obs = new Map();
    for (const o of w.obstacles) {
      // v3.4: bewegte Teile (Blaulicht, Rotor, Fahne, Flügel …) werden vor dem Verschmelzen abgenommen und danach wieder angehängt
      const om = buildObstacle(o, w.theme);
      obs.set(o, om);
      g.add(om);
    }

    scene.add(g);
    // Wandlampen mit Lichtinseln am Boden (Licht wird nur vorgetäuscht → kostet fast nichts)
    const lampRgb = LAMP[w.theme] || LAMP.street;
    const [lr, lg, lb] = lin(lampRgb);
    const lampMat = smat(`lamp:${lampRgb}`, () => new T3.MeshBasicMaterial({ color: new T3.Color(lr, lg, lb) }));
    const lamps = [];
    const lamp = (x, z, nx, nz) => {
      deco.add(mesh(box(nx ? 5 : 16, 6, nz ? 5 : 16), lampMat, x + nx * 3, 48, z + nz * 3));
      deco.add(mesh(box(nx ? 3 : 20, 3, nz ? 3 : 20), slam("#2a2a2a"), x + nx * 1.5, 52, z + nz * 1.5));
      lamps.push({ x: x + nx * 6, z: z + nz * 6, px: x + nx * 62, pz: z + nz * 62, flicker: w.theme === "hospital" ? lamps.length === 1 || lamps.length === 4 : lamps.length === 2, fluor: w.theme === "hospital" });
    };
    lamp(D.L, D.T + 190, 1, 0); lamp(D.L, D.T + 540, 1, 0);
    lamp(D.R, D.T + 360, -1, 0); lamp(D.R, D.T + 700, -1, 0);
    lamp(D.L + 90, D.T, 0, 1); lamp(D.R - 90, D.T, 0, 1);
    // Volumetrische Lichtkegel: staubige Luft unter den Lampen (additiv, kostet nur Füllrate)
    const cones = [];
    const coneGeo = new T3.ConeGeometry(46, 96, 16, 1, true); coneGeo.translate(0, -48, 0); coneGeo.rotateX(-Math.PI / 2);
    const coneTex = tex("cone", 4, 64, (cg) => { const gr = cg.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "#000"); gr.addColorStop(0.6, "#777"); gr.addColorStop(1, "#fff"); cg.fillStyle = gr; cg.fillRect(0, 0, 4, 64); });
    for (const l of lamps) {
      const cm = new T3.MeshBasicMaterial({ map: coneTex, color: new T3.Color(lr, lg, lb), transparent: true, opacity: 0.075, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false });
      const m = new T3.Mesh(coneGeo, cm); m.position.set(l.x, 49, l.z); m.lookAt(l.px, 0, l.pz); m.renderOrder = 25; m.userData.lamp = l;
      g.add(m); cones.push(m);
    }
    // Labor: Alarm-Rundumleuchten über der Tür
    const beacons = w.theme === "lab" ? [[D.W / 2 - D.DOOR_W / 2 - 26, D.T - 8], [D.W / 2 + D.DOOR_W / 2 + 26, D.T - 8]] : [];
    for (const [bx, bz] of beacons) { deco.add(mesh(cyl(6, 7, 6, 10), slam("#2a2a2a"), bx, 64, bz)); deco.add(mesh(cyl(5, 5, 8, 10), sbasic("#ff3020"), bx, 71, bz)); }
    addProps(deco, w);
    addClutter(deco, w);
    const clock = w.cityId === "heilbronn" ? addHeilbronn(deco, w, BH) : null;
    addCityMark(deco, w, BH);

    bakeStatic(deco);
    deco.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    g.add(deco);
    if (clock) g.add(clock.face);
    uncached = false;

    const sky = addSkyline(g, w); // v3.5 Himmel, Skyline, Rauch, Suchscheinwerfer
    // v3.6 Nässe: draußen nachts immer feucht, bei Regen spiegelnd, bei Schnee matt; Klinik-/Laborböden poliert
    const wet = w.weather === "rain" ? 1 : w.weather === "snow" ? 0.3 : w.theme === "hospital" || w.theme === "lab" ? 0.6 : 0.72;
    room = { group: g, floorTex, glossTex, door, lamps, lampRgb, obs, cones, beacons, baseHemi, baseMoon, clock, sky, facLights, wet };
    builtFloor = fc;
    renderer.shadowMap.needsUpdate = true;
    warmPending = true; // neue Raum-Materialien (Wände, Hindernisse) gleich mit übersetzen
    if (!w.menuCam && w.player) { CAM.tz = topZ(w.player.y); CAM.fz = 0; } // v3.4: Übersicht startet beim Helden
  }
  // v3.4 Mond- und Aufhelllicht folgen dem sichtbaren Ausschnitt (Schattenkarte bleibt so scharf wie in der alten, kurzen Arena);
  // in 32er-Schritten, damit Schattenkanten nicht bei jeder kleinen Bewegung über das Texel-Raster kriechen
  function followSun(w) {
    viewZ = w.menuCam ? w.player.y : camMode === "top" ? CAM.tz : CAM.fol ? CAM.fol.z - 150 : w.player.y;
    const z = Math.round(viewZ / 32) * 32;
    if (moon.target.position.z === z) return;
    moon.target.position.z = z; moon.position.z = z - 520; fill.position.z = z + 1300;
    moon.target.updateMatrixWorld();
  }

  // ------------------------------------------------------------------
  // Figuren
  // ------------------------------------------------------------------
  const PAL = {
    // Walker-Outfits (Index = WALKER_LOOKS in game.js): Zivil ×3, Polizist, Bauarbeiter, Anzug, Patient, Ärztin, Pfleger, Forscher, Soldat, Schutzanzug
    walker: [
      { shirt: "#5d6e7e", pants: "#2f3b52", skin: "#8fa67a", hair: "#2a1d14" },
      { shirt: "#7d5f45", pants: "#3a3328", skin: "#94a37c", ribs: true },
      { shirt: "#6b3f57", pants: "#2b2f3a", skin: "#87a184", hair: "#5a4630", torn: true },
      { shirt: "#24324f", pants: "#1b2338", skin: "#8fa67a", hat: "police", badge: true },
      { shirt: "#e8701a", pants: "#3a3a40", skin: "#93a47c", hat: "hardhat", hivis: true, torn: true },
      { shirt: "#2b2d33", pants: "#24262b", skin: "#9aa684", tie: "#a01818", hair: "#1a1410" },
      { shirt: "#a9c3cf", pants: "#a9c3cf", skin: "#a3ad92", bandage: true, ribs: true },
      { shirt: "#e8ecea", pants: "#5f7a8a", skin: "#99a88a", coat: true, mask: true, hair: "#3a2a1a" },
      { shirt: "#5f9a8a", pants: "#4f8678", skin: "#8fa67a", hat: "scrub", mask: true },
      { shirt: "#e4e6e0", pants: "#3a3d44", skin: "#8aa07c", coat: true, goggles: true, hair: "#8a8a8a" },
      { shirt: "#4f5a38", pants: "#3e4630", skin: "#8a9c74", hat: "helmet", tactical: true },
      { shirt: "#d9c21a", pants: "#c9b218", skin: "#7d9070", hazmat: true },
    ],
    runner: [
      { shirt: "#8a2a2a", pants: "#1f2126", skin: "#a9b59c", hood: true, lean: 0.28, torn: true },
      { shirt: "#3a7a9a", pants: "#1a1a22", skin: "#a3ae94", lean: 0.28, headband: "#e5383b" },
      { shirt: "#1a1a1a", pants: "#2a2a3a", skin: "#9caa8a", lean: 0.28, mohawk: "#e5383b", torn: true },
    ],
    leaper: [{ shirt: "#3d3a44", pants: "#2a2730", skin: "#9fae8e", lean: 0.45, claws: true, thin: true, longArms: true, torn: true }],
    burner: [{ shirt: "#2a1c14", pants: "#1c1612", skin: "#3a2a20", eye: "#ffb03a", burning: true }],
    screamer: [{ shirt: "#cfd8dc", pants: "#cfd8dc", skin: "#b9c4ad", eye: "#ff4af0", thin: true, scream: true, longHair: "#16130f" }],
    splitter: [{ shirt: "#5a3a62", pants: "#3a2a40", skin: "#8a6a9a", bloat: true, pustules: "#ff6ad5", eye: "#ff6ad5" }],
    electro: [{ shirt: "#e4e6e0", pants: "#2a2f3a", skin: "#7f9474", eye: "#7fe7ff", coat: true, coils: true, goggles: true }],
    rat: [{ shirt: "#5a5048", skin: "#8a6a6a" }],
    spitter: [{ shirt: "#5d7c3a", pants: "#4a3d2a", skin: "#7d9a48", bloat: true, eye: "#eaff00" }],
    bomber: [{ shirt: "#e8701a", pants: "#2e3440", skin: "#8fa27a", vest: true }],
    brute: [{ shirt: "#5a615b", pants: "#3a3a33", skin: "#7c8c6a", brute: true }],
    armored: [{ shirt: "#26324a", pants: "#1a2130", skin: "#7f9474", armor: true, eye: "#ff5a3a" }],
    crawler: [{ shirt: "#4b4258", pants: "#2a2430", skin: "#8a7c9e" }],
    dog: [{ shirt: "#4f3f32", skin: "#6b5644" }],
    // v4.0 Begleiter: gesunde Hunde – 0 Schäferhund, 1 Dackel (kurze Beine, langer Rücken)
    petdog: [{ shirt: "#8a5a2e", skin: "#2a211b", pet: true }, { shirt: "#7a4420", skin: "#3a2416", pet: true, low: true }],
    abom: [{ skin: "#8a4a6a" }],
    mother: [{ skin: "#3f5a3a" }],
    // v1.9
    healer: [{ shirt: "#2b2a24", pants: "#22201b", skin: "#8fa67a", hood: true, robe: "#3a3326", staff: true, eye: "#8cff8a", torn: true }],
    thrower: [{ shirt: "#4a4f3a", pants: "#2f3326", skin: "#7c8c6a", brute: true, rock: true }],
    burrower: [{ shirt: "#5a4630", pants: "#3a3024", skin: "#8a9a72", hat: "miner", pick: true, torn: true }],
    phantom: [{ shirt: "#26232c", pants: "#1c1a22", skin: "#c9cfd8", longHair: "#0e0c12", eye: "#e8f0ff", thin: true, lean: 0.18, torn: true }],
    warden: [{ shirt: "#2f3a48", pants: "#232b36", skin: "#7f9474", gen: true, eye: "#8fd4ff", tactical: true }],
    bloater: [{ shirt: "#6a7a3a", pants: "#4a4a2a", skin: "#9aa84a", bloat: true, pustules: "#d8ff5a", eye: "#eaff00" }],
    gunner: [{ shirt: "#4f5a38", pants: "#3e4630", skin: "#8a9c74", hat: "helmet", tactical: true, rifle: true }],
    nest: [{ skin: "#6a3a5a" }],
    // v2.0: deutsche Gegner
    wiesn: [{ shirt: "#f2efe6", pants: "#5a3a1e", skin: "#94a37c", lederhosen: true, hat: "tracht", krug: true, belly: true }],
    jeck: [{ shirt: "#d8202a", pants: "#f2efe6", skin: "#a3ad92", hat: "jester", nose: true, motley: true, eye: "#ffd84a" }],
    schaffner: [{ shirt: "#1e2a4a", pants: "#1a2236", skin: "#8fa67a", hat: "conductor", kelle: true, whistle: true }],
    beamter: [{ shirt: "#6a6e72", pants: "#4a4e52", skin: "#9aa684", tie: "#2a4a8a", glasses: true, folder: true, hair: "#8a8a84" }],
    zwerg: [{ shirt: "#2a5aa8", pants: "#5a3a1e", skin: "#c8b49a", hat: "gnome", beard: true }],
    ultra: [{ shirt: "#1a1a1a", pants: "#2a2a30", skin: "#9caa8a", hood: true, scarf: "#c8102e", bengalo: true, torn: true }],
    // v2.1: neue Gegner und Stadt-Bosse
    scooter: [{ shirt: "#2a6a5a", pants: "#1f2126", skin: "#9caa8a", lean: 0.25, scooter: true, headband: "#e8e8e0" }],
    paketbote: [{ shirt: "#24324f", pants: "#1b2338", skin: "#8fa67a", carry: true, hat: "cap", capColor: "#e8701a" }],
    rentner: [{ shirt: "#b8a888", pants: "#5a5448", skin: "#b9c4ad", umbrella: "#2a3a6a", hair: "#d8d8d0", coat: true }],
    // v2.4 Überlebende
    civilian: [
      { shirt: "#3a6ea5", pants: "#2a2c34", skin: "#e2b48e", eye: "#2a1a10", hat: "cap", capColor: "#c8402a" },
      { shirt: "#c8a23a", pants: "#3a3430", skin: "#c99572", eye: "#2a1a10", longHair: "#5a3a22", scarf: "#a83a4a" },
      { shirt: "#e8e4dc", pants: "#4a5a6a", skin: "#f0c8a4", eye: "#2a1a10", glasses: true, hair: "#d8d8d0" },
    ],
    wengerter: [{ shirt: "#4a6a3a", pants: "#3a3a30", skin: "#94a37c", hat: "straw", butte: true, sprayer: true, torn: true }],
    goetz: [{ shirt: "#8a1a1a", pants: "#4a4e56", skin: "#7f9474", big: true, hat: "knight", plate: true, ironFist: true, sword: true, eye: "#ff5a3a" }],
    zugfuehrer: [{ shirt: "#1e2a4a", pants: "#1a2236", skin: "#7f9474", big: true, hat: "conductor", kelle: true, whistle: true, eye: "#ffcc33", lantern: true }],
    krampus: [{ shirt: "#3a2a1e", pants: "#2a1e14", skin: "#5a4436", brute: true, horns: true, chains: true, fur: true, eye: "#ffcc33" }],
    bierkoenig: [{ shirt: "#f2efe6", pants: "#5a3a1e", skin: "#94a37c", lederhosen: true, hat: "tracht", krug: true, belly: true, crown: true, eye: "#ffcc33" }],
    narrenkoenig: [{ shirt: "#d8202a", pants: "#f2efe6", skin: "#a3ad92", hat: "jester", nose: true, motley: true, zepter: true, cape: "#d8202a", eye: "#ffd84a" }],
    kapitaen: [{ shirt: "#1a2440", pants: "#141a2a", skin: "#7f9474", big: true, hat: "captain", beard: true, anchorHand: true, coat: true, eye: "#8cff8a" }],
  };

  // Jede Figur bekommt eigene Materialien für Treffer-Blitz/Eis/Wut (emissive)
  function makeModel(kind) {
    const root = group();
    root.rotation.order = "YXZ"; // erst umkippen (z), dann um die Körperachse rollen (x), dann drehen (y)
    const body = group();
    root.add(body);
    return { root, body, mats: [], legs: [], arms: [], extra: {}, height: 40, kind };
  }
  function flashMat(M, color) { const m = lam(color); M.mats.push(m); return m; }
  function cast(o) { o.traverse((c) => { if (c.isMesh && !c.userData.outline) c.castShadow = true; }); return o; }

  function buildHumanoid(type, r, P) {
    const M = makeModel(type);
    const bulk = P.brute ? 1.18 : P.big ? 1.2 : P.pustules ? 1.28 : P.bloat ? 1.1 : P.belly ? 1.14 : P.thin ? 0.84 : 1;
    const la = P.longArms ? 1.3 : 1;
    const shirt = flashMat(M, P.shirt), pants = flashMat(M, P.pants), skin = flashMat(M, P.skin);
    shirt.userData.role = "shirt"; pants.userData.role = "pants"; skin.userData.role = "skin"; // v2.7: Wunden, Blut, Schlamm je Material
    // v3.2 Detail-Stufe: feste Zufallswerte je Typ und Variante, damit gleiche Gegner gleich aussehen
    const sd = strHash(type + (P.shirt || "") + (P.skin || "")), rnd = (k) => hash1(sd * 977 + k * 13.7);
    const zomb = type !== "civilian";
    const gore = tlam("#5c0d12", "skin"), bone = tlam("#ddd3b8", "bone"), cavity = slam("#1c0607");
    const shoeM = tlam(rnd(1) < 0.5 ? "#2a211a" : "#1d1d21", "leather"), soleM = tlam("#100e0c", "leather"), lace = tlam("#8a8274", "cloth");
    const barefoot = zomb && (P.brute || (P.torn && rnd(2) < 0.45));
    const bareShin = zomb && P.torn && rnd(3) < 0.5;
    // Beine (Pivot an der Hüfte): Oberschenkel, Knie, Schienbein, Schuh mit Sohle oder nackter Fuß
    for (const s of [-1, 1]) {
      const hip = group(-0.05 * r, 0.92 * r, s * 0.3 * r * bulk);
      hip.add(mesh(limb(0.21 * r * bulk, 0.26 * r), pants, 0, -0.24 * r, 0));
      hip.add(mesh(ico(0.175 * r * bulk, 1), pants, 0.035 * r, -0.5 * r, 0));
      hip.add(mesh(limb(0.165 * r * bulk, 0.22 * r), bareShin ? skin : pants, 0, -0.68 * r, 0));
      if (bareShin) for (let k = 0; k < 4; k++) { const fl = fine(mesh(cone(0.07 * r, 0.2 * r, 4), pants, Math.cos(k * 1.6) * 0.17 * r, -0.62 * r, Math.sin(k * 1.6) * 0.17 * r)); fl.rotation.x = Math.PI + Math.sin(k * 1.6) * 0.5; fl.rotation.z = Math.cos(k * 1.6) * 0.5; hip.add(fl); } // zerfetzter Hosensaum
      else hip.add(fine(mesh(cyl(0.185 * r * bulk, 0.19 * r * bulk, 0.08 * r, 10), pants, 0, -0.78 * r, 0))); // Hosenaufschlag
      if (barefoot) {
        hip.add(mesh(box(0.44 * r, 0.12 * r, 0.25 * r), skin, 0.09 * r, -0.89 * r, 0));
        for (let k = 0; k < 4; k++) hip.add(fine(mesh(ico(0.045 * r, 0), skin, 0.32 * r, -0.91 * r, (k - 1.5) * 0.06 * r)));
        if (rnd(4 + s) < 0.5) hip.add(fine(mesh(box(0.1 * r, 0.05 * r, 0.12 * r), gore, 0.0, -0.84 * r, s * 0.1 * r)));
      } else {
        hip.add(mesh(box(0.4 * r, 0.17 * r, 0.27 * r), shoeM, 0.07 * r, -0.83 * r, 0));
        const toe = mesh(ico(0.14 * r, 1), shoeM, 0.25 * r, -0.86 * r, 0); toe.scale.set(1, 0.62, 0.98); hip.add(toe);
        hip.add(mesh(box(0.56 * r, 0.05 * r, 0.31 * r), soleM, 0.1 * r, -0.925 * r, 0));
        for (let k = 0; k < 2; k++) hip.add(fine(mesh(box(0.04 * r, 0.025 * r, 0.2 * r), lace, 0.06 * r + k * 0.09 * r, -0.74 * r, 0)));
      }
      M.body.add(hip);
      M.legs.push({ g: hip, s });
    }
    // Oberkörper
    const torso = mesh(cap(0.42 * r * bulk, 0.42 * r), P.bloat || P.brute ? skin : shirt, 0, 1.52 * r, 0);
    torso.scale.set(0.82, 1, 1.32);
    M.body.add(torso);
    if (P.brute) {
      const top = mesh(cap(0.4 * r * bulk, 0.3 * r), shirt, -0.04 * r, 1.42 * r, 0); top.scale.set(0.84, 1, 1.18); M.body.add(top);
      for (let i = -2; i <= 2; i++) { const sp = mesh(cone(0.09 * r, 0.42 * r), slam("#e3dcc8"), -0.42 * r, 1.6 * r + Math.abs(i) * -0.12 * r, i * 0.24 * r); sp.rotation.z = Math.PI / 2 + 0.5; M.body.add(sp); }
    }
    if (P.bloat) {
      M.body.add(mesh(ico(0.48 * r, 1), skin, 0.18 * r, 1.36 * r, 0));
      for (let i = 0; i < 6; i++) { const a = i * 1.1; M.body.add(mesh(ico(0.08 * r + (i % 3) * 0.02 * r, 0), sbasic("#c6ff5a"), 0.4 * r * Math.cos(a * 0.5), 1.2 * r + (i % 3) * 0.25 * r, 0.42 * r * Math.sin(a))); }
    }
    if (P.vest) {
      const vest = mesh(cap(0.44 * r, 0.3 * r), lam("#ff7a1a"), 0, 1.52 * r, 0); vest.material.userData.tex = "cloth"; vest.scale.set(0.86, 1, 1.36); M.body.add(vest); M.mats.push(vest.material);
      for (let k = 0; k < 3; k++) { const wi = fine(mesh(torus(0.16 * r, 0.015 * r, Math.PI), slam(["#d02a2a", "#2a6ad0", "#e8c21a"][k]), 0.4 * r, 1.5 * r, (k - 1) * 0.2 * r)); wi.rotation.y = Math.PI / 2; M.body.add(wi); } // Zünddrähte
      for (const dz of [-0.24, 0.24]) M.body.add(mesh(box(0.74 * r, 0.12 * r, 0.08 * r), slam("#f0f0c8"), 0, 1.55 * r, dz * r * 1.3));
      for (let i = -1; i <= 1; i++) { const d = mesh(cyl(0.07 * r, 0.07 * r, 0.42 * r, 6), slam("#c0281e"), 0.36 * r, 1.42 * r, i * 0.2 * r); M.body.add(d); }
      const tank = mesh(cyl(0.22 * r, 0.22 * r, 0.75 * r, 8), slam("#7d8288"), -0.42 * r, 1.6 * r, 0); M.body.add(tank);
      M.extra.blink = mesh(ico(0.08 * r, 0), basic(0xff2b1f), -0.42 * r, 2.02 * r, 0); M.body.add(M.extra.blink);
    }
    if (P.armor) {
      const plate = mesh(box(0.5 * r, 0.9 * r, 1.0 * r), lam("#34445f"), 0.2 * r, 1.55 * r, 0); plate.material.userData.tex = "metal"; M.body.add(plate); M.mats.push(plate.material);
      for (const s of [-1, 1]) M.body.add(mesh(ico(0.26 * r, 1), tlam("#2c3a52", "metal"), 0, 1.9 * r, s * 0.66 * r));
      for (let k = 0; k < 3; k++) for (const z of [-0.36, 0.36]) M.body.add(fine(mesh(ico(0.035 * r, 0), tlam("#c9ced4", "metal"), 0.46 * r, 1.25 * r + k * 0.3 * r, z * r))); // Nieten
    }
    // v3.2 Rumpf: Hals, Kragen, Knopfleiste, Brusttasche, Gürtel mit Schnalle, Wirbel am Rücken, offene Wunde mit Rippen
    const fx = 0.344 * r * bulk; // Vorderseite des Rumpfs
    const plainShirt = !(P.bloat || P.brute || P.armor || P.hazmat || P.robe || P.vest || P.tactical || P.motley || P.lederhosen || P.plate || P.hood || P.coat);
    M.body.add(mesh(cyl(0.15 * r, 0.19 * r, 0.42 * r, 10), skin, 0.06 * r + (P.lean ? 0.05 * r : 0), 2.06 * r, 0));
    if (!(P.bloat || P.brute || P.armor || P.hazmat || P.robe || P.plate)) { const col2 = mesh(ring(0.25 * r, 0.065 * r), shirt, 0.04 * r, 1.97 * r, 0); col2.rotation.x = Math.PI / 2; col2.scale.set(1, 1.28, 1); M.body.add(col2); }
    if (plainShirt) {
      M.body.add(fine(mesh(box(0.025 * r, 0.62 * r, 0.06 * r), shirt, fx, 1.56 * r, 0)));
      for (let k = 0; k < 4; k++) M.body.add(fine(mesh(box(0.035 * r, 0.05 * r, 0.05 * r), bone, fx + 0.012 * r, 1.3 * r + k * 0.16 * r, 0)));
      if (rnd(5) < 0.6) M.body.add(fine(mesh(box(0.03 * r, 0.17 * r, 0.19 * r), shirt, fx - 0.004 * r, 1.72 * r, 0.22 * r)));
    }
    if (!(P.bloat || P.robe || P.badge || P.beard || P.hazmat || P.lederhosen || P.plate)) {
      const belt = mesh(cyl(0.43 * r * bulk, 0.43 * r * bulk, 0.1 * r, 14), tlam("#1b1612", "leather"), 0, 1.1 * r, 0); belt.scale.set(0.84, 1, 1.32); M.body.add(belt);
      M.body.add(fine(mesh(box(0.045 * r, 0.11 * r, 0.14 * r), tlam("#9aa0a6", "metal"), 0.365 * r * bulk, 1.1 * r, 0)));
    }
    if (zomb && (P.thin || P.lean)) for (let k = 0; k < 5; k++) M.body.add(fine(mesh(ico(0.075 * r, 0), P.brute || P.bloat ? skin : shirt, -0.33 * r * bulk, 1.28 * r + k * 0.14 * r, 0)));
    if (zomb && !P.armor && !P.plate && !P.hazmat && (P.torn || rnd(6) < 0.5)) {
      const ws = rnd(7) < 0.5 ? -1 : 1, wy = 1.36 * r + rnd(8) * 0.25 * r;
      const wd = mesh(ico(0.2 * r, 0), gore, fx - 0.07 * r, wy, ws * 0.26 * r); wd.scale.set(0.4, 1, 1.05); M.body.add(wd);
      for (let k = 0; k < 3; k++) { const rb = fine(mesh(box(0.05 * r, 0.035 * r, 0.24 * r), bone, fx - 0.02 * r, wy - 0.12 * r + k * 0.1 * r, ws * 0.26 * r)); rb.rotation.x = ws * 0.25; M.body.add(rb); }
    }
    // Arme nach vorn (Zombie-Griff): Schulter, Oberarm, Ellbogen, Unterarm (oft zerrissener Ärmel), Hand mit Fingern
    for (const s of [-1, 1]) {
      const sh = group(0.04 * r, 1.86 * r, s * 0.66 * r * bulk);
      const sleeve = P.armor ? slam("#1b2433") : P.brute || P.bloat || P.claws ? skin : shirt;
      const bare = sleeve === skin || (zomb && !P.armor && (P.torn ? rnd(9 + s) < 0.7 : rnd(11 + s) < 0.3));
      sh.add(mesh(ico(0.19 * r * bulk, 1), sleeve, 0.02 * r, 0, 0));
      const up = mesh(limb(0.155 * r * bulk, 0.3 * r * la), sleeve, 0.3 * r * la, 0, 0); up.rotation.z = -Math.PI / 2; sh.add(up);
      sh.add(mesh(ico(0.14 * r * bulk, 1), bare ? skin : sleeve, 0.55 * r * la, 0, 0));
      const fo = mesh(limb(0.13 * r * bulk, 0.3 * r * la), bare ? skin : sleeve, 0.77 * r * la, 0, 0); fo.rotation.z = -Math.PI / 2; sh.add(fo);
      if (bare && sleeve !== skin) { // Ärmel endet zerfetzt am Ellbogen
        for (let k = 0; k < 3; k++) { const fl = fine(mesh(cone(0.06 * r, 0.18 * r, 4), sleeve, 0.56 * r * la, Math.cos(k * 2.1) * 0.12 * r, Math.sin(k * 2.1) * 0.12 * r)); fl.rotation.z = -Math.PI / 2; sh.add(fl); }
      } else if (!bare) { const cuff = fine(mesh(cyl(0.15 * r * bulk, 0.15 * r * bulk, 0.07 * r, 10), sleeve, 0.95 * r * la, 0, 0)); cuff.rotation.z = Math.PI / 2; sh.add(cuff); }
      if (bare && zomb && rnd(13 + s) < 0.4) { // abgenagter Unterarm: Knochen schaut heraus
        const bn = fine(mesh(cyl(0.04 * r, 0.05 * r, 0.32 * r, 6), bone, 0.82 * r * la, 0.1 * r, 0)); bn.rotation.z = Math.PI / 2; sh.add(bn);
        const fl = fine(mesh(ico(0.08 * r, 0), gore, 0.7 * r * la, 0.09 * r, 0)); fl.scale.set(1.4, 0.6, 1); sh.add(fl);
      }
      if (P.armor) sh.add(mesh(ico(0.17 * r * bulk, 1), slam("#1d2330"), 1.04 * r * la, 0, 0));
      else {
        const hb = bulk * (P.brute ? 1.35 : 1), hx = 1.05 * r * la;
        sh.add(mesh(box(0.22 * r * hb, 0.1 * r * hb, 0.22 * r * hb), skin, hx, 0, 0));
        for (let k = 0; k < 4; k++) { const fg = fine(mesh(box(0.17 * r * hb, 0.045 * r * hb, 0.042 * r * hb), skin, hx + 0.16 * r * hb, -0.04 * r * hb, (k - 1.5) * 0.054 * r * hb)); fg.rotation.z = -0.55; sh.add(fg); } // gekrümmte Finger
        const th = fine(mesh(box(0.13 * r * hb, 0.045 * r * hb, 0.045 * r * hb), skin, hx + 0.06 * r * hb, -0.02 * r * hb, -s * 0.13 * r * hb)); th.rotation.y = s * 0.6; sh.add(th);
      }
      if (P.claws) for (let k = -1; k <= 1; k++) { const cl = mesh(cone(0.05 * r, 0.42 * r, 4), bone, 1.3 * r * la, 0, k * 0.09 * r); cl.rotation.z = -Math.PI / 2; sh.add(cl); }
      sh.rotation.y = s * 0.18;
      M.body.add(sh);
      M.arms.push({ g: sh, s });
    }
    // Kopf
    const head = group(0.14 * r + (P.lean ? 0.1 * r : 0), 2.4 * r * (P.brute ? 0.96 : 1), 0);
    const hr = (P.brute ? 0.36 : 0.4) * r;
    head.add(mesh(ico(hr, 2), skin)); // v2.7: rundere Köpfe (aus der Draufsicht das Auffälligste am Körper)
    if (P.hood) { const hood = mesh(ico(hr * 1.2, 2), tlam(P.shirt, "cloth"), -0.08 * r, 0.04 * r, 0); hood.scale.set(1, 1, 1.05); head.add(hood); }
    if (P.armor) {
      head.add(mesh(ico(hr * 1.15, 1), tlam("#2b3548", "metal"), -0.02 * r, 0.06 * r, 0));
      head.add(mesh(box(0.12 * r, 0.22 * r, 0.62 * r), basic(0x50aae6), hr * 0.98, 0.02 * r, 0));
    } else {
      // v3.2 Gesicht: Augenhöhlen, Brauenwulst, Nase (bei Zombies manchmal abgefault), Ohren, Kiefer mit Zahnreihen
      for (const s of [-1, 1]) {
        head.add(fine(mesh(ico(0.1 * r, 0), cavity, hr * 0.8, 0.06 * r, s * 0.15 * r)));
        head.add(mesh(ico(0.075 * r, 0), sbasic(P.eye || "#ff3030"), hr * 0.86, 0.06 * r, s * 0.15 * r));
        if (!P.hood && !P.hazmat) { const ear = mesh(ico(0.1 * r, 1), skin, -0.02 * r, 0.02 * r, s * hr * 0.97); ear.scale.set(0.55, 1, 0.38); head.add(ear); }
      }
      const brow = fine(mesh(box(0.1 * r, 0.07 * r, 0.48 * r), skin, hr * 0.84, 0.16 * r, 0)); brow.rotation.z = -0.3; head.add(brow);
      if (!P.nose) {
        if (zomb && rnd(15) < 0.3) head.add(fine(mesh(box(0.05 * r, 0.1 * r, 0.08 * r), cavity, hr * 0.97, -0.02 * r, 0)));
        else { const ns = fine(mesh(cone(0.06 * r, 0.16 * r, 4), skin, hr * 1.0, -0.03 * r, 0)); ns.rotation.z = -Math.PI / 2 + 0.5; head.add(ns); }
      }
      head.add(mesh(box(0.08 * r, 0.14 * r, 0.3 * r), cavity, hr * 0.88, -0.18 * r, 0));
      if (!P.mask) {
        for (let k = 0; k < 5; k++) head.add(fine(mesh(box(0.04 * r, 0.055 * r, 0.045 * r), bone, hr * 0.94, -0.12 * r, (k - 2) * 0.055 * r)));
        const jaw = mesh(box(0.3 * r, 0.08 * r, 0.34 * r), skin, hr * 0.62, (zomb ? -0.3 : -0.24) * r, 0); jaw.rotation.z = zomb ? -0.32 : -0.08; head.add(jaw);
        if (zomb) for (let k = 0; k < 4; k++) head.add(fine(mesh(box(0.04 * r, 0.05 * r, 0.045 * r), bone, hr * 0.8, -0.27 * r, (k - 1.5) * 0.06 * r)));
      }
      if (zomb && rnd(16) < 0.4) { // aufgerissene Wange mit Zähnen
        const cs = rnd(17) < 0.5 ? -1 : 1;
        head.add(fine(mesh(ico(0.1 * r, 0), gore, hr * 0.72, -0.12 * r, cs * hr * 0.66)));
        for (let k = 0; k < 2; k++) head.add(fine(mesh(box(0.04 * r, 0.05 * r, 0.03 * r), bone, hr * 0.78 - k * 0.07 * r, -0.12 * r, cs * hr * 0.74)));
      }
    }
    if (P.bloat) { M.extra.sac = mesh(ico(0.22 * r, 1), sbasic("#a8ff4a"), hr * 1.0, -0.3 * r, 0); head.add(M.extra.sac); }
    // Haare: Kappe + abstehende Strähnen
    if (P.hair) {
      const hm = tlam(P.hair, "hair");
      const hair = mesh(ico(hr * 1.06, 1), hm, -0.07 * r, 0.1 * r, 0); hair.scale.set(1, 0.6, 1.04); head.add(hair);
      for (let i = 0; i < 9; i++) { const t2 = mesh(cone(0.07 * r, 0.32 * r, 4), hm, -0.06 * r - (i % 5) * 0.06 * r, 0.28 * r + (i > 4 ? 0.06 * r : 0), ((i % 5) - 2) * 0.12 * r + (i > 4 ? 0.06 * r : 0)); t2.rotation.z = 0.9 + (i % 5) * 0.12; t2.rotation.x = ((i % 5) - 2) * 0.3; head.add(t2); }
    } else if (zomb && !P.hat && !P.hood && !P.hazmat && !P.armor && !P.longHair && !P.mohawk && rnd(18) < 0.5) {
      // kahler Schädel mit aufgeplatzter Kopfhaut
      const sk = fine(mesh(ico(0.16 * r, 0), bone, -0.04 * r, hr * 0.86, rnd(19) * 0.2 * r - 0.1 * r)); sk.scale.set(1, 0.38, 1); head.add(sk);
      head.add(fine(mesh(box(0.2 * r, 0.03 * r, 0.025 * r), cavity, -0.04 * r, hr * 0.92, 0)));
    }
    // Freiliegende Rippen
    if (P.ribs) {
      M.body.add(mesh(box(0.1 * r, 0.52 * r, 0.46 * r), gore, 0.32 * r, 1.48 * r, 0.08 * r));
      for (let i = 0; i < 4; i++) M.body.add(mesh(box(0.08 * r, 0.06 * r, 0.42 * r), bone, 0.37 * r, 1.3 * r + i * 0.13 * r, 0.08 * r));
    }
    // Zerfetzte Kleidung: herabhängende Fetzen
    if (P.torn) for (let i = 0; i < 6; i++) {
      const flap = mesh(box(0.05 * r, 0.26 * r + (i % 3) * 0.06 * r, 0.16 * r), tlam(P.shirt, "cloth"), 0.27 * r * Math.cos(i * 1.7), 1.02 * r, (i - 2.5) * 0.19 * r);
      flap.rotation.x = (i - 1.5) * 0.25; flap.rotation.z = 0.2 * Math.sin(i * 2.3);
      M.body.add(flap);
    }
    accessories(M, P, r, head, hr, shirt, skin);
    M.body.add(head);
    M.extra.head = head;
    if (P.evo && zomb && !P.scooter) addMutation(M, P, r, P.evo, { skin, bone, gore, head, hr, bulk, la, rnd });
    if (!P.scooter) realismRig(M, r, { head: P.big || P.brute ? 0.8 : 0.76 }); // v3.3 (E-Scooter: Trittbrett hängt an der Fußhöhe)
    M.body.rotation.z = -(P.lean || 0);
    M.lean = -(P.lean || 0);
    M.height = 2.75 * r;
    return M;
  }

  // v3.7 Evolutionsstufen: Mutationsteile hängen an den Knoten (Rumpf, Schulter-/Armgruppen, Kopf) und laufen mit der Animation mit.
  // Koordinaten im Ur-Skelett (vorn = +x, oben = +y; realismRig rechnet die Rumpfhöhen danach um). Kegel zeigen in +y:
  // rotation.z > 0 kippt sie nach hinten (−x), rotation.x = s · θ zur Seite s. Leuchtteile (sbasic) bleiben unbeleuchtet hell.
  const EVO_GLOW = [null, "#8cff4a", "#ff9a2e", "#ff2e3c"];
  function addMutation(M, P, r, evo, o) {
    const B = M.body, { bone, head, hr, bulk, la, rnd } = o, glow = sbasic(EVO_GLOW[evo]), big = evo === 3;
    const plateM = tlam(big ? "#8f7b5e" : "#a3926f", "bone"), darkBone = tlam("#7c6c52", "bone");
    const spike = (parent, x, y, z, len, rad, rz, rx = 0, mat = bone) => { const m = mesh(cone(rad, len, 5), mat, x, y, z); m.rotation.set(rx, 0, rz); m.translateY(len * 0.45); parent.add(m); return m; };
    const vein = (parent, x, y, z, len, rz, rx = 0, w = 0.022) => { const m = mesh(box(w * r, len, w * 1.3 * r), glow, x, y, z); m.rotation.set(rx, 0, rz); parent.add(m); return m; };
    if (evo === 1) {
      // Verseucht: leuchtende Adern über Rücken, Schultern, Arme und Schädel, Giftbeulen
      for (let i = 0; i < 6; i++) { const z = (i - 2.5) * 0.16 * r * bulk; vein(B, -0.35 * r * bulk, 1.35 * r + (i % 3) * 0.12 * r, z, 0.42 * r, 0.25 * (i % 2 ? 1 : -1), z * 0.8 / r, 0.034); }
      for (let i = 0; i < 4; i++) vein(B, 0.33 * r * bulk, 1.38 * r + i * 0.1 * r, (i - 1.5) * 0.2 * r, 0.3 * r, 0.1, (i - 1.5) * 0.6, 0.03);
      for (const s2 of [-1, 1]) for (let k = 0; k < 3; k++) vein(B, -0.1 * r + k * 0.12 * r, 1.95 * r, s2 * (0.3 + k * 0.08) * r * bulk, 0.3 * r, Math.PI / 2, s2 * 0.3, 0.032); // über die Schultern (von oben sichtbar)
      for (const A of M.arms) {
        vein(A.g, 0.35 * r * la, 0.15 * r * bulk, 0, 0.5 * r, Math.PI / 2 + 0.12, 0, 0.036);
        vein(A.g, 0.75 * r * la, 0.12 * r * bulk, 0.02 * r * A.s, 0.36 * r, Math.PI / 2 - 0.2, 0, 0.032);
        for (let k = 0; k < 3; k++) A.g.add(mesh(ico(0.065 * r + (k % 2) * 0.025 * r, 0), glow, 0.08 * r + k * 0.2 * r, 0.18 * r * bulk, -A.s * 0.05 * r));
      }
      for (let i = 0; i < 4; i++) { const v = vein(head, -hr * 0.3 + i * hr * 0.22, hr * 0.9, (i - 1.5) * hr * 0.34, hr * 0.8, Math.PI / 2, (i - 1.5) * 0.45, 0.03); v.rotation.y = (i - 1.5) * 0.5; }
      for (let i = 0; i < 7; i++) { const a = i * 2.39; B.add(mesh(ico(0.06 * r + (i % 3) * 0.025 * r, 0), glow, -0.2 * r * bulk + Math.cos(a) * 0.14 * r, 1.62 * r + (i % 3) * 0.12 * r, Math.sin(a) * 0.48 * r * bulk)); }
      return;
    }
    // Mutant / Alpha: Rückgrat-Stacheln, Schulterplatten mit Stacheln, Unterarm-Dornen, Krallen, glühende Risse
    const nSp = big ? 6 : 4;
    for (let i = 0; i < nSp; i++) {
      const k = nSp === 1 ? 0 : i / (nSp - 1);
      spike(B, -0.34 * r * bulk, 1.22 * r + k * 0.72 * r, (k - 0.5) * 0.12 * r, (big ? 0.62 : 0.46) * r * (0.7 + 0.5 * Math.sin(k * Math.PI)), (big ? 0.1 : 0.08) * r, 1.05 + k * 0.2);
    }
    for (const A of M.arms) {
      const pl = mesh(ico(0.2 * r * bulk * (big ? 1.12 : 1), 1), plateM, 0.0, 0.1 * r, 0); pl.scale.set(1.15, 0.42, 1.05); A.g.add(pl);
      vein(A.g, 0.0, 0.19 * r, 0, 0.3 * r, Math.PI / 2, 0.3 * A.s, 0.03); // glühender Riss in der Platte
      for (let k = 0; k < (big ? 3 : 2); k++) spike(A.g, -0.05 * r - k * 0.1 * r, 0.16 * r, A.s * 0.06 * r, (big ? 0.5 : 0.36) * r * (1 - k * 0.18), 0.07 * r, 0.55 + k * 0.25, A.s * 0.35);
      for (let k = 0; k < 2; k++) spike(A.g, (0.6 + k * 0.22) * r * la, 0.12 * r * bulk, 0, (big ? 0.3 : 0.22) * r, 0.045 * r, 0.9, 0, darkBone); // Dornen am Unterarm
      for (let k = -1; k <= 1; k++) { const cl = mesh(cone(0.04 * r, (big ? 0.42 : 0.32) * r, 4), bone, 1.24 * r * la, -0.02 * r, k * 0.08 * r); cl.rotation.z = -Math.PI / 2 - 0.25; A.g.add(cl); } // Krallen
      A.g.scale.y *= big ? 1.22 : 1.12; A.g.scale.z *= big ? 1.22 : 1.12; // aufgequollene Muskeln
      vein(A.g, 0.45 * r * la, 0.16 * r * bulk, 0, 0.44 * r, Math.PI / 2 + 0.3, 0, 0.03);
    }
    for (let i = 0; i < (big ? 7 : 4); i++) { const z = (rnd(40 + i) - 0.5) * 0.9 * r * bulk; vein(B, -0.35 * r * bulk, 1.3 * r + rnd(50 + i) * 0.55 * r, z, (0.25 + rnd(60 + i) * 0.2) * r, (rnd(70 + i) - 0.5) * 1.6, z * 0.9 / r, 0.03); }
    for (let i = 0; i < 3; i++) vein(B, 0.33 * r * bulk, 1.3 * r + i * 0.16 * r, (rnd(80 + i) - 0.5) * 0.6 * r, 0.26 * r, (rnd(90 + i) - 0.5) * 1.2, 0, 0.03);
    // Knochenpanzer vorn: Brustbein-Platte, darunter zwei schräge Rippenbögen je Seite
    const st = mesh(ico(0.2 * r, 1), plateM, 0.31 * r * bulk, 1.52 * r, 0); st.scale.set(0.4, 1.25, 0.8); B.add(st);
    for (let k = 0; k < 2; k++) for (const sd of [-1, 1]) { const rb = mesh(cyl(0.025 * r, 0.03 * r, 0.3 * r, 5), darkBone, 0.33 * r * bulk, 1.36 * r + k * 0.17 * r, sd * 0.2 * r); rb.rotation.x = sd * (Math.PI / 2 - 0.5); rb.rotation.y = sd * 0.25; B.add(rb); }
    if (big) {
      // Alpha: Hornkamm auf dem Schädel, Kieferhauer, glühender Kern im Rücken
      spike(head, -hr * 0.15, hr * 0.7, 0, hr * 1.25, hr * 0.2, 1.05);
      for (const sd of [-1, 1]) spike(head, -hr * 0.1, hr * 0.6, sd * hr * 0.45, hr * 0.95, hr * 0.16, 1.15, sd * 0.35);
      for (const sd of [-1, 1]) { const t1 = mesh(cone(0.035 * r, 0.2 * r, 4), bone, hr * 0.85, -hr * 0.35, sd * hr * 0.3); t1.rotation.z = -0.3; head.add(t1); }
      B.add(mesh(ico(0.16 * r, 1), glow, -0.3 * r * bulk, 1.62 * r, 0));
    }
  }

  // v3.3 realistische Proportionen: das ursprüngliche Skelett (Hüfte 0,92 r, Schultern 1,86 r, Kopf 2,4 r – Kindchenschema)
  // wird nachträglich umgerechnet: längere Beine (Hüfte 1,2 r), kürzerer, schmalerer Rumpf, kleinerer Kopf, längere,
  // schlankere Arme. Alle Ausrüstungsteile am Rumpf wandern über dieselbe Höhenabbildung mit.
  const RIG_Y = [[0, 0], [0.92, 1.2], [1.86, 2.0], [2.4, 2.3], [4, 3.5]];
  function rigY(y) {
    for (let i = 1; i < RIG_Y.length; i++) {
      const [a0, b0] = RIG_Y[i - 1], [a1, b1] = RIG_Y[i];
      if (y <= a1 || i === RIG_Y.length - 1) return { y: b0 + (y - a0) * (b1 - b0) / (a1 - a0), k: (b1 - b0) / (a1 - a0) };
    }
    return { y, k: 1 };
  }
  function realismRig(M, r, o = {}) {
    const legs = new Set(M.legs.map((q) => q.g)), arms = new Set(M.arms.map((q) => q.g)), head = M.extra.head;
    for (const c of M.body.children) {
      const m = rigY(c.position.y / r);
      if (legs.has(c)) { c.position.y = 1.2 * r; c.scale.y *= 1.3; c.position.z *= 0.9; continue; }
      if (arms.has(c)) { c.position.y = m.y * r; c.position.z *= 0.88; c.scale.x *= o.armLen || 1.12; c.scale.y *= 0.86; c.scale.z *= 0.86; continue; }
      if (c === head) { c.position.y = m.y * r; c.scale.multiplyScalar(o.head || 0.76); continue; }
      c.position.y = m.y * r;
      const tilted = c.quaternion && (Math.abs(c.quaternion.x) > 0.05 || Math.abs(c.quaternion.z) > 0.05);
      if (!tilted && !c.isGroup) { c.scale.y *= m.k; c.scale.z *= 0.92; }
    }
  }

  // Kleidung & Ausrüstung je Outfit – macht aus einem Grundmodell viele verschiedene Zombies
  function accessories(M, P, r, head, hr, shirt, skin) {
    const B = M.body;
    if (P.hat === "police") {
      head.add(mesh(cyl(hr * 1.02, hr * 1.06, 0.24 * r, 10), slam("#1b2338"), -0.02 * r, hr * 0.78, 0));
      head.add(mesh(box(0.34 * r, 0.04 * r, 0.62 * r), slam("#0f1424"), hr * 0.7, hr * 0.62, 0));
      head.add(mesh(box(0.04 * r, 0.1 * r, 0.12 * r), sbasic("#e8c64a"), hr * 1.0, hr * 0.8, 0));
    } else if (P.hat === "hardhat") {
      const h = mesh(ico(hr * 1.14, 1), slam("#f2c81a"), -0.02 * r, 0.12 * r, 0); h.scale.set(1, 0.62, 1); head.add(h);
      head.add(mesh(cyl(hr * 1.32, hr * 1.32, 0.04 * r, 12), slam("#e0b818"), 0.04 * r, 0.06 * r, 0));
    } else if (P.hat === "helmet") {
      const h = mesh(ico(hr * 1.18, 1), tlam("#4a5530", "metal"), -0.03 * r, 0.1 * r, 0); h.scale.set(1.04, 0.72, 1.06); head.add(h);
      head.add(mesh(box(0.06 * r, 0.06 * r, 0.7 * r), slam("#2a2e1c"), hr * 0.2, -0.24 * r, 0));
    } else if (P.hat === "scrub") {
      const h = mesh(ico(hr * 1.06, 1), slam(P.shirt), -0.04 * r, 0.12 * r, 0); h.scale.set(1, 0.55, 1); head.add(h);
    }
    if (P.mask) head.add(mesh(box(0.06 * r, 0.2 * r, 0.5 * r), slam("#dfe9ee"), hr * 0.92, -0.1 * r, 0));
    if (P.goggles) {
      head.add(mesh(box(0.08 * r, 0.13 * r, 0.56 * r), sbasic("#9fe8ff"), hr * 0.92, 0.08 * r, 0));
      head.add(mesh(box(0.5 * r, 0.06 * r, 0.62 * r), slam("#222222"), 0, 0.08 * r, 0));
    }
    if (P.bandage) { const t2 = mesh(torus(hr * 1.02, 0.05 * r), slam("#e8e4d8"), 0, 0.12 * r, 0); t2.rotation.x = Math.PI / 2; head.add(t2); head.add(mesh(ico(0.06 * r, 0), slam("#8a1a1a"), hr * 0.98, 0.14 * r, 0.1 * r)); }
    if (P.headband) { const t2 = mesh(torus(hr * 1.02, 0.045 * r), slam(P.headband), 0, 0.14 * r, 0); t2.rotation.x = Math.PI / 2; head.add(t2); }
    if (P.mohawk) for (let i = 0; i < 6; i++) { const m = mesh(cone(0.07 * r, 0.32 * r, 4), tlam(P.mohawk, "hair"), hr * 0.5 - i * 0.12 * r, hr * 0.95, 0); m.rotation.z = 0.25; head.add(m); }
    if (P.longHair) {
      const cap2 = mesh(ico(hr * 1.08, 1), tlam(P.longHair, "hair"), -0.06 * r, 0.08 * r, 0); cap2.scale.set(1, 0.7, 1.06); head.add(cap2);
      head.add(mesh(box(0.14 * r, 0.75 * r, 0.62 * r), tlam(P.longHair, "hair"), -0.28 * r, -0.3 * r, 0));
    }
    if (P.scream) { const mouth = mesh(ico(0.16 * r, 1), basic(0x1a0204), hr * 0.86, -0.12 * r, 0); mouth.scale.set(0.6, 1.5, 1); head.add(mouth); }
    if (P.hazmat) {
      const hood = mesh(ico(hr * 1.22, 1), slam(P.shirt), -0.05 * r, 0.02 * r, 0); hood.scale.set(1.02, 1.05, 1.04); head.add(hood);
      head.add(mesh(box(0.08 * r, 0.3 * r, 0.5 * r), sbasic("#7fd8ff"), hr * 1.08, 0.08 * r, 0));
      const snout = mesh(cyl(0.12 * r, 0.14 * r, 0.22 * r, 8), slam("#222222"), hr * 1.12, -0.2 * r, 0); snout.rotation.z = Math.PI / 2; head.add(snout);
      for (const s of [-1, 1]) { const f = mesh(cyl(0.09 * r, 0.09 * r, 0.16 * r, 8), slam("#3a3a3a"), hr * 1.0, -0.26 * r, s * 0.24 * r); f.rotation.x = s * 0.9; head.add(f); }
    }
    if (P.tie) {
      B.add(mesh(box(0.05 * r, 0.52 * r, 0.11 * r), slam(P.tie), 0.36 * r, 1.58 * r, 0));
      B.add(mesh(box(0.06 * r, 0.12 * r, 0.36 * r), slam("#e8e8e0"), 0.33 * r, 1.88 * r, 0));
    }
    if (P.badge) {
      B.add(mesh(box(0.04 * r, 0.12 * r, 0.1 * r), sbasic("#e8c64a"), 0.36 * r, 1.66 * r, 0.22 * r));
      const belt = mesh(cyl(0.42 * r, 0.42 * r, 0.12 * r, 10), slam("#111111"), 0, 1.12 * r, 0); belt.scale.set(0.84, 1, 1.32); B.add(belt);
    }
    if (P.hivis) for (const y of [1.4, 1.7]) B.add(mesh(box(0.72 * r, 0.08 * r, 1.12 * r), slam("#e8e8c8"), 0, y * r, 0));
    if (P.tactical) B.add(mesh(box(0.56 * r, 0.7 * r, 0.96 * r), tlam("#3a4230", "cloth"), 0.04 * r, 1.58 * r, 0));
    if (P.coat) { const c2 = mesh(box(0.62 * r, 0.7 * r, 0.96 * r), tlam(P.shirt, "cloth"), -0.02 * r, 0.98 * r, 0); B.add(c2); }
    if (P.pustules) for (let i = 0; i < 10; i++) { const a = i * 2.39; B.add(mesh(ico(0.07 * r + (i % 3) * 0.03 * r, 0), sbasic(P.pustules), 0.42 * r * Math.cos(a), 1.1 * r + (i % 4) * 0.22 * r, 0.5 * r * Math.sin(a))); }
    if (P.burning) {
      for (let i = 0; i < 8; i++) { const a = i * 2.1; B.add(mesh(box(0.05 * r, 0.24 * r, 0.04 * r), sbasic("#ff8a2a"), 0.36 * r * Math.cos(a), 1.2 * r + (i % 4) * 0.2 * r, 0.48 * r * Math.sin(a))); }
      B.add(mesh(box(0.34 * r, 0.5 * r, 0.22 * r), slam("#a01818"), -0.44 * r, 1.6 * r, 0));
    }
    if (P.hat === "miner") {
      const h = mesh(ico(hr * 1.14, 1), slam("#c9a21a"), -0.02 * r, 0.12 * r, 0); h.scale.set(1, 0.66, 1); head.add(h);
      head.add(mesh(cyl(0.1 * r, 0.12 * r, 0.08 * r, 8), sbasic("#fff6c0"), hr * 0.92, 0.26 * r, 0).rotateZ(Math.PI / 2));
    }
    const armR = M.arms.find((A) => A.s === 1), armL = M.arms.find((A) => A.s === -1);
    if (P.robe) { const robe = mesh(cyl(0.46 * r, 0.66 * r, 1.25 * r, 10), tlam(P.robe, "cloth"), -0.04 * r, 0.62 * r, 0); robe.scale.set(0.9, 1, 1.15); B.add(robe); }
    if (P.staff && armR) {
      const st = mesh(cyl(0.05 * r, 0.05 * r, 2.6 * r, 6), slam("#5a4630"), 1.04 * r, 0.5 * r, 0); armR.g.add(st);
      armR.g.add(mesh(ico(0.2 * r, 1), sbasic("#8cff8a"), 1.04 * r, 1.85 * r, 0));
    }
    if (P.rifle && armR) {
      armR.g.add(mesh(box(1.7 * r, 0.2 * r, 0.16 * r), tlam("#1c1e1a", "metal"), 1.15 * r, 0.06 * r, -0.12 * r));
      armR.g.add(mesh(box(0.34 * r, 0.12 * r, 0.12 * r), tlam("#2c2f28", "metal"), 0.85 * r, 0.22 * r, -0.12 * r));
      armR.g.add(mesh(box(0.1 * r, 0.36 * r, 0.12 * r), tlam("#2c2f28", "metal"), 0.7 * r, -0.16 * r, -0.12 * r));
    }
    if (P.rock && armR) { const rk = mesh(ico(0.55 * r, 0), slam("#7a756c"), 1.2 * r, 0.25 * r, 0); rk.scale.set(1, 0.85, 1.1); armR.g.add(rk); }
    if (P.pick && armL) {
      armL.g.add(mesh(cyl(0.05 * r, 0.05 * r, 1.4 * r, 6), slam("#6a4a2a"), 1.04 * r, 0.3 * r, 0));
      const hd = mesh(box(0.12 * r, 0.12 * r, 0.9 * r), tlam("#9aa3ad", "metal"), 1.04 * r, 0.95 * r, 0); armL.g.add(hd);
    }
    if (P.gen) {
      B.add(mesh(box(0.42 * r, 0.8 * r, 0.7 * r), slam("#4a5568"), -0.48 * r, 1.6 * r, 0));
      B.add(mesh(ico(0.2 * r, 1), sbasic("#7fd0ff"), -0.72 * r, 1.6 * r, 0));
      B.add(mesh(cyl(0.03 * r, 0.03 * r, 0.9 * r, 5), tlam("#9aa3ad", "metal"), -0.56 * r, 2.3 * r, 0.2 * r));
      B.add(mesh(ico(0.07 * r, 0), sbasic("#ff4a3a"), -0.56 * r, 2.76 * r, 0.2 * r));
    }
    if (P.coils) for (const s of [-1, 1]) {
      B.add(mesh(cyl(0.1 * r, 0.1 * r, 0.7 * r, 8), sbasic("#7fe7ff"), -0.46 * r, 1.75 * r, s * 0.22 * r));
      for (let k = 0; k < 3; k++) { const t2 = mesh(torus(0.13 * r, 0.03 * r), slam("#c87533"), -0.46 * r, 1.5 * r + k * 0.22 * r, s * 0.22 * r); t2.rotation.x = Math.PI / 2; B.add(t2); }
    }
    // ---- v2.0: Tracht, Fasching, Bahn, Amt, Garten, Kurve ----
    if (P.belly) { const b2 = mesh(ico(0.42 * r, 1), shirt, 0.2 * r, 1.36 * r, 0); b2.scale.set(0.9, 0.85, 1.1); B.add(b2); }
    if (P.lederhosen) {
      const lb = tlam("#4a2e16", "leather");
      for (const z of [-0.3, 0.3]) B.add(mesh(box(0.8 * r, 0.95 * r, 0.1 * r), lb, 0.02 * r, 1.58 * r, z * r)); // Hosenträger
      B.add(mesh(box(0.08 * r, 0.32 * r, 0.66 * r), lb, 0.42 * r, 1.42 * r, 0)); // Brustlatz
      B.add(mesh(box(0.05 * r, 0.12 * r, 0.12 * r), slam("#d8c8a0"), 0.47 * r, 1.42 * r, 0));
      for (const L of M.legs) L.g.add(mesh(cyl(0.21 * r, 0.2 * r, 0.32 * r, 8), tlam("#efece2", "cloth"), 0, -0.62 * r, 0)); // Kniestrümpfe
    }
    if (P.hat === "tracht") {
      const felt = tlam("#2f4a2a", "cloth");
      head.add(mesh(cyl(hr * 1.4, hr * 1.4, 0.05 * r, 14), felt, -0.04 * r, hr * 0.62, 0));
      head.add(mesh(cyl(hr * 0.72, hr * 0.92, 0.42 * r, 12), felt, -0.04 * r, hr * 0.98, 0));
      head.add(mesh(cyl(hr * 0.94, hr * 0.94, 0.08 * r, 12), slam("#1a1a14"), -0.04 * r, hr * 0.72, 0));
      const gams = mesh(cone(0.13 * r, 0.5 * r, 6), slam("#d8c8a0"), -0.3 * r, hr * 1.1, 0.26 * r); gams.rotation.x = -0.4; gams.rotation.z = 0.35; head.add(gams);
    }
    if (P.krug && armR) {
      armR.g.add(mesh(cyl(0.22 * r, 0.22 * r, 0.5 * r, 10), tlam("#e0a42a", "metal"), 1.12 * r, 0.12 * r, 0));
      armR.g.add(mesh(cyl(0.24 * r, 0.24 * r, 0.12 * r, 10), slam("#fff8e8"), 1.12 * r, 0.42 * r, 0));
      armR.g.add(mesh(torus(0.14 * r, 0.04 * r), slam("#cfdde2"), 1.12 * r, 0.14 * r, -0.26 * r));
    }
    if (P.hat === "jester") {
      const ruff = mesh(torus(hr * 0.95, 0.12 * r), slam("#f2efe6"), 0, -hr * 0.85, 0); ruff.rotation.x = Math.PI / 2; head.add(ruff);
      const cap2 = mesh(ico(hr * 1.05, 1), slam("#d8202a"), -0.04 * r, 0.1 * r, 0); cap2.scale.set(1, 0.7, 1.04); head.add(cap2);
      for (const [z, col] of [[-1, "#d8202a"], [0, "#f2efe6"], [1, "#d8202a"]]) {
        const lobe = group(-0.05 * r, hr * 0.55, z * hr * 0.55);
        const cn = mesh(cone(0.16 * r, 0.85 * r, 6), slam(col), 0, 0.4 * r, 0); lobe.add(cn);
        lobe.add(mesh(ico(0.11 * r, 0), sbasic("#f2c21a"), 0, 0.85 * r, 0));
        lobe.rotation.x = z * 0.9; lobe.rotation.z = z === 0 ? 0.7 : 0.3;
        head.add(lobe);
      }
    }
    if (P.nose) head.add(mesh(ico(0.12 * r, 1), sbasic("#ff2a2a"), hr * 1.02, -0.02 * r, 0));
    if (P.motley) {
      B.add(mesh(box(0.74 * r, 0.42 * r, 0.56 * r), slam("#f2efe6"), 0, 1.74 * r, 0.28 * r));
      B.add(mesh(box(0.74 * r, 0.42 * r, 0.56 * r), slam("#f2efe6"), 0, 1.28 * r, -0.28 * r));
      for (let i = -1; i <= 1; i++) { const d2 = mesh(box(0.06 * r, 0.16 * r, 0.16 * r), sbasic("#f2c21a"), 0.38 * r, 1.52 * r + i * 0.28 * r, 0); d2.rotation.x = Math.PI / 4; B.add(d2); }
    }
    if (P.hat === "conductor") {
      head.add(mesh(cyl(hr * 1.08, hr * 0.98, 0.3 * r, 12), slam("#1e2a4a"), -0.02 * r, hr * 0.78, 0));
      head.add(mesh(cyl(hr * 1.0, hr * 1.0, 0.1 * r, 12), slam("#c8102e"), -0.02 * r, hr * 0.62, 0));
      head.add(mesh(box(0.36 * r, 0.04 * r, 0.6 * r), slam("#0f1424"), hr * 0.76, hr * 0.56, 0));
      head.add(mesh(box(0.04 * r, 0.1 * r, 0.1 * r), sbasic("#e8c64a"), hr * 1.0, hr * 0.8, 0));
      B.add(mesh(box(0.7 * r, 0.1 * r, 1.08 * r), slam("#c8102e"), 0, 1.94 * r, 0)); // roter Kragen
      for (let i = 0; i < 3; i++) B.add(mesh(box(0.04 * r, 0.06 * r, 0.06 * r), sbasic("#e8c64a"), 0.36 * r, 1.36 * r + i * 0.18 * r, 0));
    }
    if (P.whistle) { const w2 = mesh(cyl(0.05 * r, 0.05 * r, 0.22 * r, 6), slam("#c9ced4"), hr * 1.02, -0.16 * r, 0.06 * r); w2.rotation.z = Math.PI / 2; head.add(w2); }
    if (P.kelle && armR) {
      armR.g.add(mesh(cyl(0.035 * r, 0.035 * r, 0.7 * r, 5), slam("#222222"), 1.1 * r, 0.32 * r, 0));
      const disc = mesh(cyl(0.3 * r, 0.3 * r, 0.04 * r, 14), slam("#f2f2ea"), 1.1 * r, 0.78 * r, 0); disc.rotation.x = Math.PI / 2; armR.g.add(disc);
      const dc = mesh(cyl(0.2 * r, 0.2 * r, 0.05 * r, 14), sbasic("#1f9a4a"), 1.1 * r, 0.78 * r, 0); dc.rotation.x = Math.PI / 2; armR.g.add(dc);
    }
    if (P.glasses) {
      head.add(mesh(box(0.05 * r, 0.05 * r, 0.6 * r), slam("#1a1410"), hr * 0.98, 0.08 * r, 0));
      for (const z of [-1, 1]) head.add(mesh(box(0.04 * r, 0.16 * r, 0.2 * r), sbasic("#cfe2ea"), hr * 0.99, 0.06 * r, z * 0.16 * r));
    }
    if (P.folder && armL) {
      armL.g.add(mesh(box(0.5 * r, 0.12 * r, 0.7 * r), tlam("#c9b27a", "cloth"), 0.95 * r, 0.12 * r, 0.1 * r));
      armL.g.add(mesh(box(0.14 * r, 0.13 * r, 0.12 * r), sbasic("#d02a2a"), 0.95 * r, 0.14 * r, 0.3 * r));
    }
    if (P.hat === "gnome") {
      const cn = mesh(cone(hr * 1.08, 1.5 * r, 10), slam("#c0281e"), -0.12 * r, hr * 0.5 + 0.7 * r, 0); cn.rotation.z = 0.32; head.add(cn);
      head.add(mesh(ico(0.08 * r, 0), slam("#f2efe6"), -0.5 * r, hr * 0.5 + 1.38 * r, 0));
    }
    if (P.beard) { const bd = mesh(ico(hr * 0.78, 2), tlam("#f2efe6", "hair"), hr * 0.62, -0.32 * r, 0); bd.scale.set(0.7, 1.15, 1); head.add(bd); const belt = mesh(cyl(0.44 * r, 0.44 * r, 0.12 * r, 10), slam("#1a1a1a"), 0, 1.16 * r, 0); belt.scale.set(0.84, 1, 1.32); B.add(belt); }
    if (P.scarf) {
      for (let i = 0; i < 2; i++) { const sc = mesh(torus(hr * 0.86, 0.1 * r), tlam(i ? "#f2efe6" : P.scarf, "cloth"), 0, 2.0 * r + i * 0.1 * r, 0); sc.rotation.x = Math.PI / 2; B.add(sc); }
      for (let k = 0; k < 4; k++) B.add(mesh(box(0.06 * r, 0.16 * r, 0.22 * r), tlam(k % 2 ? "#f2efe6" : P.scarf, "cloth"), 0.4 * r, 1.82 * r - k * 0.16 * r, 0.18 * r));
    }
    if (P.bengalo && armL) {
      armL.g.add(mesh(cyl(0.06 * r, 0.06 * r, 0.5 * r, 6), slam("#b0201a"), 1.12 * r, 0.3 * r, 0));
      armL.g.add(mesh(ico(0.12 * r, 1), sbasic("#ffe0c8"), 1.12 * r, 0.58 * r, 0));
    }
    // ---- v2.2 Heilbronn ----
    if (P.hat === "straw") {
      head.add(mesh(cyl(hr * 1.75, hr * 1.75, 0.05 * r, 16), tlam("#d8b860", "cloth"), -0.02 * r, hr * 0.62, 0));
      head.add(mesh(cyl(hr * 0.78, hr * 0.92, 0.36 * r, 12), tlam("#e4c878", "cloth"), -0.02 * r, hr * 0.9, 0));
      head.add(mesh(cyl(hr * 0.94, hr * 0.94, 0.08 * r, 12), slam("#5a2a1a"), -0.02 * r, hr * 0.72, 0));
    }
    if (P.butte) {
      B.add(mesh(cyl(0.38 * r, 0.3 * r, 0.95 * r, 12), tlam("#8a6a3a", "cloth"), -0.62 * r, 1.65 * r, 0));
      for (let i = 0; i < 6; i++) B.add(mesh(ico(0.1 * r, 0), slam("#3a1a4a"), -0.62 * r + Math.cos(i) * 0.18 * r, 2.15 * r, Math.sin(i) * 0.18 * r));
    }
    if (P.sprayer && armR) {
      const lance = mesh(cyl(0.035 * r, 0.035 * r, 1.4 * r, 5), slam("#7a8088"), 1.25 * r, 0.05 * r, 0); lance.rotation.z = Math.PI / 2; armR.g.add(lance);
      armR.g.add(mesh(ico(0.08 * r, 0), slam("#c8ccd0"), 1.95 * r, 0.05 * r, 0));
    }
    if (P.hat === "knight") {
      const helm = mesh(ico(hr * 1.2, 1), tlam("#a8b0b8", "metal"), -0.02 * r, 0.06 * r, 0); helm.scale.set(1.05, 1.08, 1.04); head.add(helm);
      head.add(mesh(box(0.06 * r, 0.1 * r, 0.6 * r), slam("#111316"), hr * 1.18, 0.06 * r, 0));
      head.add(mesh(box(0.05 * r, 0.06 * r, 0.08 * r), sbasic("#ff3a2a"), hr * 1.2, 0.07 * r, 0.14 * r));
      head.add(mesh(box(0.05 * r, 0.06 * r, 0.08 * r), sbasic("#ff3a2a"), hr * 1.2, 0.07 * r, -0.14 * r));
      for (let i = 0; i < 4; i++) { const pl = mesh(cone(0.12 * r, 0.6 * r, 5), slam("#c81e1e"), -0.2 * r - i * 0.12 * r, hr * 1.05 - i * 0.04 * r, 0); pl.rotation.z = 1.2 + i * 0.12; head.add(pl); }
    }
    if (P.plate) {
      const bp = mesh(box(0.56 * r, 0.75 * r, 1.0 * r), tlam("#9aa3ad", "metal"), 0.12 * r, 1.6 * r, 0); B.add(bp);
      for (const z of [-1, 1]) { const pd = mesh(ico(0.3 * r, 1), tlam("#8a929a", "metal"), 0, 1.98 * r, z * 0.7 * r); pd.scale.set(1, 0.7, 1); B.add(pd); }
      B.add(mesh(box(0.6 * r, 0.12 * r, 1.04 * r), slam("#4a3a2a"), 0, 1.14 * r, 0));
    }
    if (P.ironFist && armR) {
      armR.g.add(mesh(box(0.55 * r, 0.5 * r, 0.5 * r), tlam("#b8c0c8", "metal"), 1.2 * r, 0, 0));
      for (let k = -1; k <= 1; k++) armR.g.add(mesh(box(0.14 * r, 0.12 * r, 0.12 * r), slam("#d8dde2"), 1.5 * r, 0.12 * r, k * 0.16 * r));
      armR.g.add(mesh(cyl(0.2 * r, 0.24 * r, 0.5 * r, 8), tlam("#8a929a", "metal"), 0.8 * r, 0, 0).rotateZ(Math.PI / 2));
    }
    if (P.sword && armL) {
      armL.g.add(mesh(box(0.08 * r, 2.0 * r, 0.16 * r), slam("#d8dde2"), 1.1 * r, 1.05 * r, 0));
      armL.g.add(mesh(box(0.1 * r, 0.1 * r, 0.7 * r), slam("#8a6a2a"), 1.1 * r, 0.05 * r, 0));
    }
    // ---- v2.1 ----
    if (P.scooter) {
      B.add(mesh(box(1.7 * r, 0.12 * r, 0.42 * r), slam("#1a1c20"), 0.05 * r, 0.1 * r, 0));
      for (const x of [-0.75, 0.85]) { const wh = mesh(cyl(0.2 * r, 0.2 * r, 0.14 * r, 10), slam("#3a3e46"), x * r, 0.1 * r, 0); wh.rotation.x = Math.PI / 2; B.add(wh); }
      B.add(mesh(cyl(0.05 * r, 0.05 * r, 1.9 * r, 6), tlam("#9aa3ad", "metal"), 0.9 * r, 1.05 * r, 0));
      B.add(mesh(box(0.08 * r, 0.08 * r, 0.9 * r), slam("#2a2e34"), 0.9 * r, 2.0 * r, 0));
      B.add(mesh(ico(0.08 * r, 0), sbasic("#4ad0ff"), 0.98 * r, 1.7 * r, 0));
    }
    if (P.hat === "cap") {
      const cp = mesh(ico(hr * 1.06, 1), slam(P.capColor || "#e8701a"), -0.04 * r, 0.12 * r, 0); cp.scale.set(1, 0.6, 1); head.add(cp);
      head.add(mesh(box(0.42 * r, 0.04 * r, 0.5 * r), slam(P.capColor || "#e8701a"), hr * 0.8, hr * 0.4, 0));
    }
    if (P.carry) for (const A of M.arms) { if (A.s === 1) A.g.add(mesh(box(0.7 * r, 0.62 * r, 0.9 * r), tlam("#a07a4a", "cloth"), 1.0 * r, 0.05 * r, -0.66 * r)); }
    if (P.umbrella && armR) {
      armR.g.add(mesh(cyl(0.03 * r, 0.03 * r, 1.2 * r, 5), slam("#5a4630"), 1.05 * r, 0.3 * r, 0));
      const can = mesh(cone(1.25 * r, 0.6 * r, 10, true), (() => { const m = lam(P.umbrella, { side: T3.DoubleSide }); m.userData.tex = "cloth"; return m; })(), 1.25 * r, 0.25 * r, 0); can.rotation.z = -Math.PI / 2; armR.g.add(can); M.mats.push(can.material);
    }
    if (P.lantern && armL) { armL.g.add(mesh(box(0.28 * r, 0.36 * r, 0.28 * r), slam("#2a2a2a"), 1.1 * r, -0.1 * r, 0)); armL.g.add(mesh(ico(0.14 * r, 1), sbasic("#ffd27a"), 1.1 * r, -0.1 * r, 0)); }
    if (P.horns) {
      for (const z of [-1, 1]) {
        const hg = group(-0.05 * r, hr * 0.6, z * hr * 0.55);
        for (let k = 0; k < 3; k++) { const c2 = mesh(cone(0.13 * r - k * 0.035 * r, 0.42 * r, 6), slam(k === 2 ? "#2a2018" : "#d8ccb4"), -k * 0.18 * r, k * 0.3 * r, z * k * 0.08 * r); c2.rotation.z = 0.5 + k * 0.4; c2.rotation.x = -z * 0.35; hg.add(c2); }
        head.add(hg);
      }
      const tongue = mesh(box(0.4 * r, 0.04 * r, 0.14 * r), slam("#c81e1e"), hr * 1.05, -0.3 * r, 0); tongue.rotation.z = -0.6; head.add(tongue);
    }
    if (P.fur) for (let i = 0; i < 14; i++) { const a = i * 2.4, f2 = mesh(cone(0.12 * r, 0.42 * r, 4), tlam("#2a1e14", "hair"), 0.38 * r * Math.cos(a), 1.0 * r + (i % 5) * 0.22 * r, 0.6 * r * Math.sin(a)); f2.rotation.z = Math.PI + Math.cos(a) * 0.4; B.add(f2); }
    if (P.chains) for (let i = 0; i < 10; i++) { const u = i / 9, l2 = mesh(torus(0.09 * r, 0.025 * r), tlam("#7a6a5a", "metal"), 0.38 * r, 0.9 * r + u * 1.1 * r, -0.55 * r + u * 1.1 * r); l2.rotation.y = i % 2 ? Math.PI / 2 : 0; B.add(l2); }
    if (P.crown) {
      const cy0 = P.hat === "tracht" ? hr * 1.2 : hr * 0.8;
      head.add(mesh(cyl(hr * 0.62, hr * 0.62, 0.18 * r, 10, true), tlam("#f2c21a", "metal"), -0.04 * r, cy0, 0));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; head.add(mesh(cone(0.07 * r, 0.22 * r, 4), sbasic("#ffd84a"), -0.04 * r + Math.cos(a) * hr * 0.6, cy0 + 0.18 * r, Math.sin(a) * hr * 0.6)); }
      head.add(mesh(ico(0.07 * r, 0), sbasic("#d8202a"), hr * 0.62, cy0, 0));
    }
    if (P.zepter && armR) {
      armR.g.add(mesh(cyl(0.045 * r, 0.045 * r, 2.2 * r, 6), tlam("#c9a227", "metal"), 1.04 * r, 0.6 * r, 0));
      armR.g.add(mesh(ico(0.22 * r, 1), sbasic("#f2c21a"), 1.04 * r, 1.75 * r, 0));
      armR.g.add(mesh(ico(0.09 * r, 0), sbasic("#d8202a"), 1.04 * r, 1.98 * r, 0));
    }
    if (P.cape) { const cp = mesh(box(0.08 * r, 1.6 * r, 1.25 * r), tlam(P.cape, "cloth"), -0.42 * r, 1.25 * r, 0); cp.rotation.z = -0.12; B.add(cp); B.add(mesh(box(0.1 * r, 0.1 * r, 1.27 * r), sbasic("#f2c21a"), -0.4 * r, 2.02 * r, 0)); }
    if (P.hat === "captain") {
      head.add(mesh(cyl(hr * 1.14, hr * 0.98, 0.28 * r, 12), slam("#e8ecef"), -0.03 * r, hr * 0.8, 0));
      head.add(mesh(cyl(hr * 1.0, hr * 1.0, 0.1 * r, 12), slam("#11141c"), -0.03 * r, hr * 0.64, 0));
      head.add(mesh(box(0.42 * r, 0.05 * r, 0.66 * r), slam("#11141c"), hr * 0.78, hr * 0.56, 0));
      head.add(mesh(box(0.04 * r, 0.12 * r, 0.14 * r), sbasic("#e8c64a"), hr * 1.1, hr * 0.82, 0));
    }
    if (P.anchorHand && armR) {
      armR.g.add(mesh(box(0.12 * r, 1.6 * r, 0.12 * r), tlam("#9aa3ad", "metal"), 1.1 * r, 0.3 * r, 0));
      armR.g.add(mesh(box(0.12 * r, 0.12 * r, 0.8 * r), tlam("#9aa3ad", "metal"), 1.1 * r, 0.85 * r, 0));
      const hook = mesh(torus(0.5 * r, 0.07 * r, Math.PI), tlam("#9aa3ad", "metal"), 1.1 * r, -0.35 * r, 0); hook.rotation.y = Math.PI / 2; hook.rotation.x = Math.PI; armR.g.add(hook);
    }
  }

  // Seuchenratte: klein, flink, langer Schwanz
  function buildRat(r, P) {
    const M = makeModel("rat");
    const fur = flashMat(M, P.shirt), skin = flashMat(M, P.skin);
    fur.userData.tex = "hair"; skin.userData.tex = "skin";
    const bone = tlam("#ddd3b8", "bone"), gore = tlam("#5c0d12", "skin");
    const body = mesh(cap(0.55 * r, 0.9 * r), fur, 0, 0.7 * r, 0); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.9); M.body.add(body);
    // v3.2 räudiges Fell: Büschel entlang des Rückens, kahle Stellen mit Wunden
    for (let k = 0; k < 6; k++) { const tf = mesh(cone(0.11 * r, 0.3 * r, 4), fur, 0.55 * r - k * 0.22 * r, 1.2 * r - Math.abs(k - 2.5) * 0.04 * r, (k % 2 ? 0.08 : -0.08) * r); tf.rotation.z = 0.9; M.body.add(tf); }
    for (const [x, z] of [[0.15, 0.42], [-0.35, -0.4]]) { const sp = fine(mesh(ico(0.13 * r, 1), gore, x * r, 0.78 * r, z * r)); sp.scale.set(1, 0.7, 0.35); M.body.add(sp); }
    for (const [x, ph] of [[0.5, 0], [-0.5, Math.PI]]) for (const s of [-1, 1]) {
      const hip = group(x * r, 0.55 * r, s * 0.35 * r);
      hip.add(mesh(cap(0.12 * r, 0.3 * r), skin, 0, -0.3 * r, 0));
      for (let k = -1; k <= 1; k++) { const cl = fine(mesh(cone(0.03 * r, 0.12 * r, 4), bone, 0.12 * r, -0.5 * r, k * 0.05 * r)); cl.rotation.z = -Math.PI / 2 - 0.4; hip.add(cl); }
      M.body.add(hip); M.legs.push({ g: hip, s, ph: ph + (s > 0 ? 0.6 : 0) });
    }
    const head = group(0.95 * r, 0.8 * r, 0);
    const snout = mesh(cone(0.38 * r, 0.9 * r, 6), fur, 0.3 * r, 0, 0); snout.rotation.z = -Math.PI / 2; head.add(snout);
    head.add(mesh(ico(0.08 * r, 0), skin, 0.78 * r, 0, 0));
    for (const s of [-1, 1]) {
      const ear = mesh(ico(0.18 * r, 1), skin, -0.05 * r, 0.3 * r, s * 0.25 * r); ear.scale.set(0.5, 1, 1); head.add(ear);
      const inner = fine(mesh(ico(0.12 * r, 1), tlam("#c87a86", "skin"), 0.0, 0.3 * r, s * 0.25 * r)); inner.scale.set(0.3, 0.9, 0.8); head.add(inner);
      head.add(mesh(ico(0.07 * r, 0), sbasic("#ff3030"), 0.25 * r, 0.14 * r, s * 0.17 * r));
      for (let k = 0; k < 3; k++) { const wh = fine(mesh(box(0.42 * r, 0.012 * r, 0.012 * r), slam("#1a1612"), 0.62 * r, 0.02 * r - k * 0.03 * r, s * 0.22 * r)); wh.rotation.y = s * (0.5 + k * 0.18); head.add(wh); } // Schnurrhaare
    }
    for (const z of [-0.035, 0.035]) head.add(fine(mesh(box(0.04 * r, 0.11 * r, 0.05 * r), tlam("#e8c060", "bone"), 0.7 * r, -0.12 * r, z * r))); // Nagezähne
    M.body.add(head); M.extra.head = head;
    const tail = group(-0.95 * r, 0.6 * r, 0);
    const tl = mesh(cyl(0.05 * r, 0.1 * r, 1.6 * r, 6), skin, -0.8 * r, 0, 0); tl.rotation.z = Math.PI / 2 + 0.2; tail.add(tl);
    for (let k = 0; k < 4; k++) { const rg = fine(mesh(ring(0.085 * r - k * 0.01 * r, 0.014 * r), skin, -0.25 * r - k * 0.34 * r, 0.05 * r + k * 0.068 * r, 0)); rg.rotation.y = Math.PI / 2; rg.rotation.x = 0.2; tail.add(rg); } // Schwanzringe
    M.body.add(tail); M.extra.tail = tail;
    M.height = 1.3 * r;
    return M;
  }

  function buildCrawler(r, P) {
    const M = makeModel("crawler");
    const shirt = flashMat(M, P.shirt), skin = flashMat(M, P.skin);
    shirt.userData.role = "shirt"; skin.userData.role = "skin";
    const bone = tlam("#ddd3b8", "bone"), gore = tlam("#6a1020", "skin"), cavity = slam("#1c0607"), pants = tlam(P.pants || "#2a2430", "denim");
    const torso = mesh(cap(0.45 * r, 0.6 * r), shirt, -0.1 * r, 0.5 * r, 0); torso.rotation.z = Math.PI / 2; torso.scale.set(1, 1, 1.2);
    M.body.add(torso);
    // v3.2: Darm schleift hinterher, Wirbelsäule liegt frei, die Beine hängen schlaff nach
    for (let i = 0; i < 7; i++) { const g2 = mesh(ico(0.13 * r - i * 0.008 * r, 1), gore, -0.85 * r - i * 0.2 * r, 0.16 * r, Math.sin(i * 1.3) * 0.16 * r); g2.scale.set(1.3, 0.8, 1); M.body.add(g2); }
    for (let k = 0; k < 6; k++) M.body.add(fine(mesh(box(0.1 * r, 0.06 * r, 0.12 * r), bone, 0.3 * r - k * 0.17 * r, 0.96 * r, 0)));
    const tear = fine(mesh(box(0.7 * r, 0.03 * r, 0.22 * r), gore, -0.1 * r, 0.94 * r, 0)); M.body.add(tear);
    for (const s of [-1, 1]) {
      const lg = mesh(limb(0.15 * r, 0.8 * r), pants, -0.95 * r, 0.16 * r, s * 0.28 * r); lg.rotation.z = Math.PI / 2 + 0.08; lg.rotation.y = s * 0.12; M.body.add(lg);
      M.body.add(mesh(box(0.28 * r, 0.14 * r, 0.22 * r), tlam("#1d1d21", "leather"), -1.62 * r, 0.12 * r, s * 0.33 * r));
    }
    for (const s of [-1, 1]) {
      const sh = group(0.3 * r, 0.6 * r, s * 0.5 * r);
      sh.add(mesh(ico(0.17 * r, 1), shirt, 0, 0, 0));
      const up = mesh(limb(0.15 * r, 0.4 * r), skin, 0.36 * r, 0, 0); up.rotation.z = -Math.PI / 2; sh.add(up);
      sh.add(mesh(ico(0.13 * r, 1), skin, 0.68 * r, 0, 0));
      const fo = mesh(limb(0.12 * r, 0.4 * r), skin, 0.95 * r, -0.02 * r, 0); fo.rotation.z = -Math.PI / 2; sh.add(fo);
      sh.add(mesh(box(0.22 * r, 0.1 * r, 0.22 * r), skin, 1.25 * r, -0.04 * r, 0));
      for (let k = 0; k < 4; k++) { const fg = fine(mesh(cyl(0.035 * r, 0.028 * r, 0.2 * r, 5), skin, 1.42 * r, -0.08 * r, (k - 1.5) * 0.055 * r)); fg.rotation.z = Math.PI / 2 + 0.7; sh.add(fg); }
      M.body.add(sh);
      M.arms.push({ g: sh, s, crawl: true });
    }
    const head = mesh(ico(0.42 * r, 2), skin, 0.75 * r, 0.6 * r, 0);
    M.body.add(head);
    for (const s of [-1, 1]) {
      M.body.add(fine(mesh(ico(0.11 * r, 1), cavity, 1.06 * r, 0.68 * r, s * 0.15 * r)));
      M.body.add(mesh(ico(0.08 * r, 0), sbasic("#ff3030"), 1.12 * r, 0.68 * r, s * 0.15 * r));
    }
    M.body.add(mesh(box(0.1 * r, 0.16 * r, 0.32 * r), cavity, 1.12 * r, 0.44 * r, 0));
    for (let k = 0; k < 5; k++) M.body.add(fine(mesh(box(0.045 * r, 0.06 * r, 0.05 * r), bone, 1.15 * r, 0.5 * r, (k - 2) * 0.06 * r)));
    const jaw = mesh(box(0.34 * r, 0.09 * r, 0.36 * r), skin, 0.98 * r, 0.3 * r, 0); jaw.rotation.z = -0.35; M.body.add(jaw);
    const hm = tlam("#1a1410", "hair");
    for (let i = 0; i < 6; i++) { const st = mesh(cone(0.07 * r, 0.42 * r, 4), hm, 0.62 * r - i * 0.04 * r, 0.92 * r, (i - 2.5) * 0.11 * r); st.rotation.z = 1.25; st.rotation.x = (i - 2.5) * 0.25; M.body.add(st); }
    M.height = 1.2 * r;
    return M;
  }

  function buildDog(r, P) {
    const M = makeModel("dog");
    const fur = flashMat(M, P.shirt), skin = flashMat(M, P.skin);
    fur.userData.tex = "hair"; skin.userData.tex = "skin";
    const bone = tlam("#ddd3b8", "bone"), gore = tlam("#5c0d12", "skin"), cavity = slam("#1c0607");
    const body = mesh(cap(0.42 * r, 1.1 * r), fur, 0, 0.95 * r, 0); body.rotation.z = Math.PI / 2;
    M.body.add(body);
    const pet = !!P.pet; // Begleiter: keine Wunden, dunkle Augen
    M.pet = pet;
    // v3.2: aufgerissene Flanke mit Rippen, Nackenfell, Halsband mit Marke
    if (!pet) {
      const wd = mesh(ico(0.34 * r, 1), gore, 0.05 * r, 0.95 * r, 0.3 * r); wd.scale.set(1.3, 0.85, 0.35); M.body.add(wd);
      for (let k = 0; k < 4; k++) { const rb = mesh(box(0.06 * r, 0.42 * r, 0.06 * r), bone, -0.22 * r + k * 0.17 * r, 0.95 * r, 0.42 * r); rb.rotation.x = -0.25; M.body.add(rb); }
    }
    for (let k = 0; k < 7; k++) { const tf = mesh(cone(0.1 * r, 0.32 * r, 4), fur, 0.75 * r - k * 0.24 * r, 1.36 * r - Math.abs(k - 1) * 0.02 * r, (k % 2 ? 0.07 : -0.07) * r); tf.rotation.z = 1.0; M.body.add(tf); }
    for (const [x, ph] of [[0.6, 0], [-0.62, Math.PI]]) for (const s of [-1, 1]) {
      const hip = group(x * r, 0.85 * r, s * 0.26 * r);
      hip.add(mesh(limb(0.15 * r, 0.24 * r), fur, 0, -0.22 * r, 0));
      hip.add(mesh(limb(0.1 * r, 0.3 * r), fur, 0.03 * r, -0.55 * r, 0));
      hip.add(mesh(box(0.2 * r, 0.08 * r, 0.16 * r), skin, 0.08 * r, -0.8 * r, 0));
      for (let k = -1; k <= 1; k++) { const cl = fine(mesh(cone(0.025 * r, 0.1 * r, 4), bone, 0.2 * r, -0.82 * r, k * 0.05 * r)); cl.rotation.z = -Math.PI / 2; hip.add(cl); }
      M.body.add(hip);
      M.legs.push({ g: hip, s, ph: ph + (s > 0 ? 0.6 : 0) });
    }
    const tail = group(-1.0 * r, 1.05 * r, 0);
    const t = mesh(cap(0.07 * r, 0.6 * r), fur, -0.35 * r, 0.1 * r, 0); t.rotation.z = Math.PI / 2 - 0.4; tail.add(t);
    for (let k = 0; k < 3; k++) { const tf = mesh(cone(0.07 * r, 0.22 * r, 4), fur, -0.2 * r - k * 0.18 * r, 0.12 * r + k * 0.07 * r, 0); tf.rotation.z = 1.2; tail.add(tf); }
    M.body.add(tail); M.extra.tail = tail;
    const head = group(1.05 * r, 1.25 * r, 0);
    head.add(mesh(ico(0.36 * r, 2), fur));
    head.add(mesh(box(0.5 * r, 0.2 * r, 0.3 * r), skin, 0.38 * r, -0.04 * r, 0));
    const jaw = mesh(box(0.44 * r, 0.08 * r, 0.26 * r), skin, 0.34 * r, -0.22 * r, 0); jaw.rotation.z = -0.28; head.add(jaw);
    head.add(fine(mesh(box(0.4 * r, 0.06 * r, 0.24 * r), cavity, 0.36 * r, -0.15 * r, 0)));
    for (let k = 0; k < 6; k++) for (const [y, ry] of [[-0.14, Math.PI], [-0.2, 0]]) {
      const tz = (k % 2 ? 1 : -1) * 0.13 * r, tx = 0.2 * r + Math.floor(k / 2) * 0.13 * r;
      const th = fine(mesh(cone(0.025 * r, 0.09 * r, 4), bone, tx + (ry ? 0 : -0.04 * r), y * r, tz)); th.rotation.z = ry; head.add(th);
    }
    head.add(mesh(ico(0.07 * r, 0), slam("#111111"), 0.64 * r, -0.0 * r, 0));
    const collar = mesh(ring(0.3 * r, 0.05 * r), tlam("#5a2a1a", "leather"), -0.18 * r, -0.12 * r, 0); collar.rotation.y = Math.PI / 2; collar.rotation.x = 0.3; head.add(collar);
    head.add(fine(mesh(cyl(0.06 * r, 0.06 * r, 0.02 * r, 8), tlam("#c9a227", "metal"), -0.05 * r, -0.42 * r, 0).rotateZ(Math.PI / 2)));
    for (const s of [-1, 1]) {
      const ear = mesh(cone(0.1 * r, 0.3 * r, 4), fur, -0.12 * r, 0.32 * r, s * 0.2 * r); ear.rotation.x = s * 0.4; head.add(ear);
      head.add(fine(mesh(ico(0.09 * r, 1), cavity, 0.2 * r, 0.12 * r, s * 0.18 * r)));
      head.add(mesh(ico(0.07 * r, 0), pet ? slam("#140d08") : sbasic("#ff3a2a"), 0.24 * r, 0.12 * r, s * 0.18 * r));
    }
    M.body.add(head);
    M.extra.head = head;
    if (P.low) { M.body.scale.set(1.25, 0.72, 1); } // Dackel
    M.height = 1.7 * r;
    return M;
  }

  function buildAbom(r, P) {
    const M = makeModel("abom");
    const flesh = flashMat(M, P.skin), dark = flashMat(M, "#6e3550");
    flesh.userData.tex = "skin"; dark.userData.tex = "skin";
    M.extra.lobes = [];
    for (const [x, y, z, s] of [[0, 1.0, 0, 0.8], [-0.35, 1.0, -0.45, 0.5], [-0.35, 1.0, 0.45, 0.5], [0.15, 1.25, -0.5, 0.42], [0.15, 1.25, 0.5, 0.42], [-0.55, 1.2, 0, 0.45], [0, 1.6, 0, 0.5]]) {
      const l = mesh(ico(s * r, 2), flesh, x * r, y * r, z * r);
      M.body.add(l); M.extra.lobes.push(l);
    }
    // v3.2: Operationsnähte mit Klammern, herausragende Knochen, glimmende Eiterbeulen
    const staple = tlam("#9aa0a6", "metal"), bone = tlam("#ddd3b8", "bone");
    for (const [y, z0, z1] of [[1.62, -0.7, 0.7], [1.15, -0.95, -0.2]]) for (let k = 0; k <= 7; k++) { const u = k / 7, st = fine(mesh(box(0.05 * r, 0.03 * r, 0.12 * r), staple, 0.62 * r - Math.abs(u - 0.5) * 0.3 * r, y * r + Math.sin(u * 3) * 0.05 * r, (z0 + (z1 - z0) * u) * r)); st.rotation.y = 0.3; M.body.add(st); }
    for (const [x, y, z, rz] of [[-0.2, 1.75, -0.3, 0.4], [-0.5, 1.5, 0.35, 1.0], [0.3, 0.75, -0.6, -0.6]]) { const b = mesh(cone(0.09 * r, 0.6 * r, 5), bone, x * r, y * r, z * r); b.rotation.z = rz; b.rotation.x = z; M.body.add(b); }
    for (let i = 0; i < 7; i++) { const a = i * 2.2; M.body.add(fine(mesh(ico(0.07 * r + (i % 3) * 0.025 * r, 1), sbasic("#d8ff5a"), Math.cos(a) * 0.62 * r, 0.9 * r + (i % 4) * 0.22 * r, Math.sin(a) * 0.7 * r))); }
    for (let i = -3; i <= 3; i++) { const sp = mesh(cone(0.07 * r, 0.45 * r, 5), slam("#ddd2b8"), -0.7 * r, 1.4 * r + Math.abs(i) * -0.1 * r, i * 0.22 * r); sp.rotation.z = Math.PI / 2 + 0.6; M.body.add(sp); }
    // Maul mit Zähnen
    const mouth = group(0.62 * r, 1.05 * r, 0);
    const maw = mesh(ico(0.34 * r, 1), basic(0x3a0818), 0, 0, 0); maw.scale.set(0.5, 1.1, 1.1); mouth.add(maw);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const tooth = mesh(cone(0.05 * r, 0.18 * r, 4), slam("#f2ead6"), 0.12 * r, Math.sin(a) * 0.3 * r, Math.cos(a) * 0.3 * r); tooth.rotation.x = -a; tooth.rotation.z = Math.PI / 2; mouth.add(tooth); }
    M.body.add(mouth);
    for (const [y, z] of [[1.55, -0.32], [1.55, 0.32], [1.45, -0.55], [1.45, 0.55], [1.75, 0]]) M.body.add(mesh(ico(0.08 * r, 0), sbasic("#ffd23a"), 0.42 * r, y * r, z * r));
    // Tentakel
    M.extra.tentacles = [];
    for (const a0 of [-1.1, -0.45, 0.45, 1.1]) {
      const root = group(Math.cos(a0) * 0.5 * r, 0.8 * r, Math.sin(a0) * 0.5 * r);
      root.rotation.y = -a0 * 0.75;
      const segs = [];
      let parent = root;
      for (let k = 0; k < 5; k++) {
        const seg = group(k === 0 ? 0 : 0.22 * r, 0, 0);
        seg.add(mesh(ico((0.2 - k * 0.028) * r, 0), k % 2 ? dark : flesh));
        parent.add(seg); segs.push(seg); parent = seg;
      }
      const claw = mesh(cone(0.08 * r, 0.3 * r, 4), slam("#efe6d0"), 0.2 * r, 0, 0); claw.rotation.z = -Math.PI / 2; parent.add(claw);
      M.body.add(root);
      M.extra.tentacles.push(segs);
    }
    M.height = 2.2 * r;
    return M;
  }

  function buildMother(r, P) {
    const M = makeModel("mother");
    const shell = flashMat(M, "#4a6a3a"), dark = flashMat(M, "#2f4a2c");
    shell.userData.tex = "leather"; dark.userData.tex = "leather"; // Chitin glänzt
    const abdomen = mesh(ico(0.85 * r, 2), shell, -0.4 * r, 0.9 * r, 0); abdomen.scale.set(1.1, 0.75, 0.95);
    M.body.add(abdomen);
    // v3.2: Panzerringe, Rückenstacheln, Adern zu den Eiern
    for (let k = 0; k < 4; k++) { const rg = mesh(ring(0.62 * r - Math.abs(k - 1.5) * 0.1 * r, 0.045 * r), dark, -0.82 * r + k * 0.28 * r, 0.9 * r, 0); rg.rotation.y = Math.PI / 2; rg.scale.set(1, 0.78, 1); M.body.add(rg); }
    for (let k = 0; k < 5; k++) { const sp = mesh(cone(0.07 * r, 0.34 * r, 5), tlam("#c8d8a0", "bone"), -0.9 * r + k * 0.24 * r, 1.48 * r - Math.abs(k - 2) * 0.05 * r, 0); sp.rotation.z = 0.35; M.body.add(sp); }
    M.extra.eggs = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, e = mesh(ico(0.13 * r, 1), sbasic("#a8ff5a"), -0.4 * r + Math.cos(a) * 0.55 * r, 1.25 * r + Math.sin(i) * 0.1 * r, Math.sin(a) * 0.55 * r);
      M.body.add(e); M.extra.eggs.push(e);
    }
    M.body.add(mesh(ico(0.48 * r, 1), dark, 0.38 * r, 0.85 * r, 0));
    const head = mesh(ico(0.28 * r, 1), dark, 0.82 * r, 0.8 * r, 0); M.body.add(head);
    for (const s of [-1, 1]) { const md = mesh(cone(0.06 * r, 0.35 * r, 4), slam("#d8e8b0"), 1.1 * r, 0.7 * r, s * 0.12 * r); md.rotation.z = -Math.PI / 2; M.body.add(md); }
    for (const [y, z] of [[0.92, -0.1], [0.92, 0.1], [0.98, 0], [0.86, -0.18], [0.86, 0.18]]) M.body.add(mesh(ico(0.045 * r, 0), sbasic("#ff3a2a"), 1.05 * r, y * r, z * r));
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const hip = group(0.1 * r - k * 0.25 * r, 0.9 * r, s * 0.4 * r);
      hip.rotation.y = s * (0.55 + k * 0.42) * -1;
      const upper = mesh(cyl(0.07 * r, 0.06 * r, 0.9 * r, 5), slam("#22301f"), 0, 0.3 * r, s * 0.38 * r); upper.rotation.x = s * -1.0; hip.add(upper);
      const lower = mesh(cyl(0.05 * r, 0.03 * r, 1.1 * r, 5), slam("#2f402a"), 0, -0.05 * r, s * 0.95 * r); lower.rotation.x = s * 0.5; hip.add(lower);
      M.body.add(hip);
      M.legs.push({ g: hip, s, k, spider: true, base: hip.rotation.y });
    }
    M.height = 1.8 * r;
    return M;
  }

  // Draw Calls sparen: alle starren Teile eines Knotens mit gleicher Lichtart zu EINEM Mesh
  // mit Vertexfarben verschmelzen (Figur ≈ 6–8 statt 20–40 Draw Calls).
  // look: { h: Höhe für Umgebungsverdeckung, grime: Schmutz/Blut-Anteil, seed } – "gemalte" Vertexfarben:
  // unten dunkler, jede Fläche leicht anders getönt, fleckige Blut-/Schmutzstellen
  const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const wp = new T3.Vector3();
  // Vertexfarben je Dreieck (Grundfarbe c, ab Vertex o in col); P liegt im Raum von toRoot
  const fA = new T3.Vector3(), fB = new T3.Vector3(), fN = new T3.Vector3();
  const tintTo = (rgb, tr, tg, tb, k) => { rgb[0] += (tr - rgb[0]) * k; rgb[1] += (tg - rgb[1]) * k; rgb[2] += (tb - rgb[2]) * k; };
  const RGB = [0, 0, 0];
  // v3.3: mit Normalen N wird je Vertex statt je Dreieck gemalt – fließende Farbverläufe auf glatt schattierten Figuren
  function paintFaces(col, P, n, o, c, toRoot, look, role, N = null) {
    const step = N ? 1 : 3;
    for (let i = 0; i < n; i += step) {
      let r = c.r, gg = c.g, b = c.b;
      if (look) {
        // Vertex bzw. Flächenmittelpunkt in Modell-Koordinaten
        if (N) wp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(toRoot);
        else wp.set((P[i * 3] + P[i * 3 + 3] + P[i * 3 + 6]) / 3, (P[i * 3 + 1] + P[i * 3 + 4] + P[i * 3 + 7]) / 3, (P[i * 3 + 2] + P[i * 3 + 5] + P[i * 3 + 8]) / 3).applyMatrix4(toRoot);
        if (role) {
          // v2.7 Körper-Details je Material: Normale (Modellraum, vorn = +x) und Höhe entscheiden
          if (N) fN.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).transformDirection(toRoot);
          else {
            fA.set(P[i * 3 + 3] - P[i * 3], P[i * 3 + 4] - P[i * 3 + 1], P[i * 3 + 5] - P[i * 3 + 2]);
            fB.set(P[i * 3 + 6] - P[i * 3], P[i * 3 + 7] - P[i * 3 + 1], P[i * 3 + 8] - P[i * 3 + 2]);
            fN.crossVectors(fA, fB).transformDirection(toRoot);
          }
          const h = look.h || 40, yk = wp.y / h, zombie = look.grime > 0.5, sd = look.seed;
          RGB[0] = r; RGB[1] = gg; RGB[2] = b;
          if (role === "skin" && zombie) {
            const v = Math.sin(wp.x * 0.9 + sd) * Math.sin(wp.y * 1.15 + sd * 0.7) * Math.sin(wp.z * 0.8 + sd * 2.1);
            if (v > 0.5) tintTo(RGB, 0.3, 0.16, 0.3, 0.38); // Bluterguss
            else if (v < -0.55) tintTo(RGB, 0.22, 0.3, 0.1, 0.32); // Fäulnis
            // v3.2: Wunden als zusammenhängende Flecken statt zufälliger Einzeldreiecke (feine Wunden malt der Shader)
            if (fN.y > 0.55 && yk > 0.78 && Math.sin(wp.x * 0.6 + sd) * Math.sin(wp.z * 0.75 + sd * 1.3) > 0.45) tintTo(RGB, 0.34, 0.04, 0.05, 0.6); // Kopfwunde (von oben sichtbar)
          } else if (role === "shirt") {
            if (hash1(sd * 13) < 0.35) { if (Math.sin(wp.y * 2.4 + sd) > 0.72) tintTo(RGB, RGB[0] * 0.7, RGB[1] * 0.7, RGB[2] * 0.7, 1); } // Streifenstoff
            if (zombie && fN.x > 0.25 && yk > 0.42 && yk < 0.9) {
              const drip = Math.sin(wp.z * 2.3 + sd * 5) * 0.5 + 0.5, top = Math.min(1, (yk - 0.42) / 0.4);
              if (drip > 0.62) tintTo(RGB, 0.32, 0.02, 0.03, 0.65 * look.grime * (0.4 + 0.6 * top)); // Blut läuft vorn herunter
            }
            if (zombie && fN.y > 0.4) { const sp = Math.sin(wp.x * 1.7 + sd * 3) * Math.sin(wp.z * 1.9 + sd); if (sp > 0.42) tintTo(RGB, 0.3, 0.02, 0.03, 0.72 * look.grime); } // Blutspritzer auf den Schultern
            if (yk > 0.4 && yk < 0.46) tintTo(RGB, RGB[0] * 0.72, RGB[1] * 0.72, RGB[2] * 0.72, 1); // Saum/Gürtellinie
          } else if (role === "pants") {
            if (yk < 0.26) tintTo(RGB, 0.2, 0.15, 0.1, (zombie ? 0.55 : 0.3) * (1 - yk / 0.26)); // Schlamm an den Hosenbeinen
            if (Math.abs(Math.sin(wp.z * 1.7 + sd)) < 0.08) tintTo(RGB, RGB[0] * 0.8, RGB[1] * 0.8, RGB[2] * 0.8, 1); // Naht
          }
          r = RGB[0]; gg = RGB[1]; b = RGB[2];
        }
        const j = N ? 1 + 0.035 * Math.sin(wp.x * 0.7 + look.seed) * Math.sin(wp.z * 0.9 + wp.y * 0.4) : 1 + (hash1(o + i + look.seed) - 0.5) * 0.06; // die Oberflächen-Muster kommen aus dem Shader
        r *= j; gg *= j; b *= j;
        if (look.grime) {
          const f = look.freq, nz = Math.sin(wp.x * f + look.seed) * Math.sin(wp.y * f * 0.8 + look.seed * 1.7) * Math.sin(wp.z * f * 1.3 + look.seed * 0.3);
          if (nz > 0.32) { const k = Math.min(1, (nz - 0.32) * 4) * look.grime; r += (look.gr - r) * k; gg += (look.gg - gg) * k; b += (look.gb - b) * k; }
        }
        if (look.h) { const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, wp.y / (look.h * 0.7))); r *= ao; gg *= ao; b *= ao; }
        if (N && look.h) { fN.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).transformDirection(toRoot); const cav = 0.8 + 0.2 * (fN.y * 0.5 + 0.5); r *= cav; gg *= cav; b *= cav; } // v3.6 Unterseiten (Kinn, Achseln, Bauch) im Schatten
      }
      for (let v = 0; v < step && i + v < n; v++) { const k = (o + i + v) * 3; col[k] = r; col[k + 1] = gg; col[k + 2] = b; }
    }
  }
  function mergeMeshes(meshes, material, node, look, smooth = false, soft = 0) {
    const parts = [];
    let count = 0;
    for (const m of meshes) {
      m.updateMatrix();
      const src = soft ? softGeo(m.geometry, soft, soft < SOFT_K ? 3 : SOFT_MIN) : m.geometry; // v3.5 gefaste Kanten
      const g = src.index ? src.toNonIndexed() : src.clone();
      g.applyMatrix4(m.matrix);
      parts.push([g, m.material.color, m.material.userData.role, texOf(m.material)]);
      count += g.attributes.position.count;
    }
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3), texA = new Uint8Array(count);
    let o = 0;
    for (const [g, c, role, tex] of parts) {
      const n = g.attributes.position.count, P = g.attributes.position.array;
      pos.set(P, o * 3);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, o * 3);
      paintFaces(col, P, n, o, c, node.matrixWorld, look, role, smooth && g.attributes.normal ? g.attributes.normal.array : null);
      texA.fill(tex, o, o + n);
      o += n;
      g.dispose();
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute("position", new T3.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new T3.BufferAttribute(nrm, 3));
    geo.setAttribute("color", new T3.BufferAttribute(col, 3));
    geo.setAttribute("tex", new T3.BufferAttribute(texA, 1));
    geo.computeBoundingSphere();
    return new T3.Mesh(geo, material);
  }
  function bakeNode(node, lit, glow, keep, outline = false, look = null, smooth = false, soft = 0) {
    const litList = [], fineList = [], glowList = [];
    for (const c of node.children) {
      if (!c.isMesh) { bakeNode(c, lit, glow, keep, outline, look, smooth, soft); continue; }
      const m = c.material;
      if (keep.has(c) || c.userData.solo || c.children.length || Array.isArray(m) || m.map || m.transparent) continue;
      (m.isMeshBasicMaterial ? glowList : c.userData.fine ? fineList : litList).push(c);
    }
    for (const [list, mat, isFine] of [[litList, lit, false], [fineList, lit, true], [glowList, glow, false]]) {
      if (!list.length) continue;
      for (const c of list) node.remove(c);
      const merged = mergeMeshes(list, mat, node, mat === lit ? look : null, smooth, mat === lit && !isFine ? soft : 0);
      node.add(merged);
      if (outline && mat === lit && !isFine) {
        const o = new T3.Mesh(merged.geometry, outlineMat);
        o.userData.outline = true;
        node.add(o);
      }
    }
  }
  const vlit = () => smat("vlit", () => new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const vglow = () => smat("vglow", () => new T3.MeshBasicMaterial({ vertexColors: true }));
  // v3.5: Hindernisse mit schmaler Fase – flach schattiert fängt jede Kante einen Lichtstreifen
  const STATIC_SOFT = 0.12;
  function bakeStatic(o, look = { h: 40, seed: 7 }) { o.updateMatrixWorld(true); bakeNode(o, vlit(), vglow(), new Set(), false, look, false, STATIC_SOFT); return o; }
  // Starres Skinning im Vertex-Shader: alle Teile einer Figur liegen in EINEM Mesh, jeder Vertex
  // kennt seinen Knoten (Hüfte, Schulter, Kopf …). Pro Frame gehen nur die Knotenmatrizen an den
  // Shader, die Animation bleibt bei den Gruppen. Figur: 2 Draw Calls (Fläche + Umriss) statt ~13.
  // Leuchtende Teile (Augen) stecken mit im Mesh und werden im Shader unbeleuchtet ausgegeben.
  const MAXP = 8;
  const FIG_OUTLINE = false; // v3.3: Cartoon-Umrisse der Figuren aus (realistischer Look)
  const ZERO = new T3.Matrix4().makeScale(0, 0, 0);
  // v2.7 Randlicht: kühle Kante an der Silhouette – Figuren heben sich vom dunklen Boden ab (Augen ausgenommen)
  const RIM_GLSL = "float rimK = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\n\toutgoingLight += vec3(0.36, 0.44, 0.56) * pow(rimK, 2.4) * 0.44";
  // v3.5 weiche Lichter-Schulter für Figuren: Taschenlampe + Mündungsfeuer + Heldenlicht brannten nahe Zombies weiß aus.
  // Über 0,62 wird die Helligkeit sanft gestaucht (Farbton bleibt, Grenze ≈ 1,5) – Boden und Lampen bleiben unberührt.
  const KNEE_GLSL = "\n\tfloat kM = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));\n\tif (kM > 0.62) outgoingLight *= (0.62 + (kM - 0.62) / (1.0 + (kM - 0.62) * 1.1)) / kM";
  // v3.2 Oberflächen der Figuren: jede Materialklasse (Attribut „tex“) bekommt ein prozedurales Muster im Fragment-Shader –
  // Albedo-Variation, Relief (Bump über Ableitungen, wie perturbNormalArb in three.js) und echtes Glanzlicht der
  // Richtungslichter. Muster haften im Knotenraum am Körper (laufen mit der Animation mit). Feine Muster blenden aus,
  // sobald ihre Periode unter ~3 Pixel fällt (kein Flimmern in der Übersicht). uZombie = 0: Held/Überlebende ohne Blut und Adern.
  const TEXC = { plain: 0, skin: 1, cloth: 2, denim: 3, leather: 4, metal: 5, hair: 6, bone: 7, wood: 8 };
  const SURF_GLSL = `
float gH = 0.0, gSheen = 0.0, gShin = 12.0;
float sHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(sHash(i + vec3(0.0, 1.0, 0.0)), sHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0.0, 0.0, 1.0)), sHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(sHash(i + vec3(0.0, 1.0, 1.0)), sHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float sLine(float n, float w) { return 1.0 - smoothstep(0.0, w, abs(n - 0.5)); }
vec3 surf(vec3 c, vec3 p, float t, float px, float z) {
  // Relief (gH) nur aus weichen, großen Formen – feines Rauschen im Relief würde mit dem Glanz zu Pixel-Funkeln werden.
  // Jede Klasse berechnet nur die Rauschwerte, die sie braucht (2–4 Aufrufe je Pixel).
  float big = sNoise(p * 0.2);
  float aF = clamp(2.4 - px * 3.6, 0.0, 1.0), aM = clamp(2.4 - px * 1.6, 0.0, 1.0);
  gSheen = 0.0; gH = big * 0.8;
  if (t < 0.5) { return c * (0.9 + 0.2 * big); }
  if (t < 1.5) { // Haut: Flecken, Blutergüsse, Adern; feucht glänzend
    float mid = sNoise(p * 0.75 + 7.1), vein = sLine(sNoise(p * vec3(0.45, 0.8, 0.45) + 11.0), 0.028) * smoothstep(0.5, 0.7, big) * aM;
    c *= 0.84 + 0.26 * big + 0.08 * (mid - 0.5) * aM;
    c = mix(c, c * vec3(0.74, 0.62, 0.92), smoothstep(0.6, 0.82, mid) * 0.5 * z);
    c = mix(c, c * vec3(0.5, 0.42, 0.62), vein * (0.12 + 0.32 * z));
    c = mix(c, vec3(0.28, 0.035, 0.04), smoothstep(0.7, 0.86, 1.0 - mid) * smoothstep(0.55, 0.75, big) * 0.55 * z);
    gH = big * 1.4; gSheen = (0.05 + 0.07 * z) * aM; gShin = 16.0;
    if (z > 0.5) {
      // v3.3 Verwesung: graugrüne Nekrose-Flächen, Hautrisse, offene Wunden mit Eiterrand, vernähte Narben
      float nec = sNoise(p * 0.32 + 3.3), lum = dot(c, vec3(0.3, 0.59, 0.11));
      c = mix(c, vec3(lum * 0.8, lum * 0.95, lum * 0.66), smoothstep(0.55, 0.78, nec) * 0.55);
      float crk = sLine(sNoise(p * 0.7 + 31.0), 0.03) * smoothstep(0.56, 0.72, nec) * aM;
      c = mix(c, c * vec3(0.3, 0.2, 0.18), crk * 0.8);
      float so = sNoise(p * 0.5 + 23.0) * smoothstep(0.45, 0.72, big); // wenige, größere Wunden
      float core = smoothstep(0.6, 0.66, so), rim = smoothstep(0.52, 0.6, so) - core;
      c = mix(c, vec3(0.5, 0.44, 0.2) * (0.7 + 0.6 * lum), rim * 0.45);
      c = mix(c, vec3(0.13, 0.01, 0.018), core * 0.9);
      float sc = sNoise(p * vec3(0.2, 0.09, 0.2) + 41.0), reg = smoothstep(0.6, 0.72, nec * 0.6 + mid * 0.4 + 0.08);
      float scar = sLine(sc, 0.016) * reg * aM, stitch = sLine(sc, 0.05) * reg * step(0.72, fract((p.x + p.y + p.z) * 1.15)) * aF;
      c = mix(c, vec3(0.82, 0.62, 0.6) * (0.55 + lum), scar * 0.55);
      c = mix(c, vec3(0.1, 0.07, 0.05), stitch * 0.85);
      gH += rim * 0.5 + scar * 0.7 + stitch * 0.5 - crk * 0.5 - core * 0.9;
      gSheen += core * 0.16 * aM; // nasse Wunde
    } else {
      // Held/Überlebende: Sommersprossen und Poren, nur aus der Nähe
      c *= 1.0 - smoothstep(0.74, 0.8, sNoise(p * 2.4 + 17.0)) * 0.12 * aF;
    }
    return c;
  }
  if (t < 2.5) { // Stoff: Gewebe, Falten, Schmutz, Blut, Risse
    float k = 3.0, wv = sin(p.y * k) * sin((p.x + p.z) * k) * clamp(2.2 - px * k * 0.8, 0.0, 1.0);
    float fold = sNoise(vec3(p.x * 0.45, p.y * 0.15, p.z * 0.45) + 4.0), bl = sNoise(p * 0.3 + 19.0);
    c *= 0.92 + 0.06 * wv + 0.24 * (fold - 0.5);
    c = mix(c, c * vec3(0.6, 0.52, 0.42), smoothstep(0.62, 0.8, big) * 0.5);
    c = mix(c, vec3(0.22, 0.025, 0.03), smoothstep(0.66, 0.82, bl) * 0.6 * z);
    c = mix(c, vec3(0.06, 0.03, 0.025), smoothstep(0.84, 0.88, fold * 0.5 + (1.0 - bl) * 0.5 + big * 0.15) * 0.9 * z); // Risse
    gH = fold * 1.6;
    // v3.3 Flicken mit Ziernaht (Zellraster ~8 Einheiten, beim Zombie häufiger) und Blut- bzw. Schmutz-Rinnsale
    vec3 cq = p * vec3(0.12, 0.14, 0.12), ci = floor(cq), cf = abs(fract(cq) - 0.5);
    float pd = 0.33 - max(max(cf.x, cf.y), cf.z);
    if (sHash(ci + 5.0) > 0.86 - 0.08 * z && pd > 0.0) {
      vec3 pc = c * (0.7 + 0.45 * sHash(ci + 9.0)) * vec3(1.0 + 0.2 * (sHash(ci + 2.0) - 0.5), 1.0, 1.0 - 0.18 * (sHash(ci + 4.0) - 0.5));
      float bd = 1.0 - smoothstep(0.0, 0.035, pd), st = bd * step(0.5, fract((p.x + p.y + p.z) * 1.6)) * aF;
      c = mix(pc, pc * 0.42, st * 0.85);
      gH += 0.35 + bd * 0.3;
    }
    if (z < 0.5) {
      // v3.3 Held: Staubschleier und dunkle Schweiß-/Nässeränder in den Falten (kein Gitter – feine Linien ergeben mit dem Relief helle Striche)
      float dust = smoothstep(0.58, 0.8, sNoise(p * vec3(0.3, 0.45, 0.3) + 91.0));
      c = mix(c, c * 0.6 + vec3(0.1, 0.09, 0.07), dust * 0.42);
      c *= 1.0 - smoothstep(0.7, 0.86, fold) * 0.18;
    }
    float dr = smoothstep(0.72, 0.86, sNoise(vec3(p.x * 1.1, p.y * 0.07, p.z * 1.1) + 51.0)) * smoothstep(0.4, 0.6, big);
    c = mix(c, mix(c * vec3(0.62, 0.56, 0.48), vec3(0.2, 0.02, 0.03), z), dr * (0.3 + 0.3 * z));
    gSheen = (smoothstep(0.66, 0.82, bl) + dr) * 0.1 * z * aM; gShin = 18.0; // frisches Blut glänzt feucht
    return c;
  }
  if (t < 3.5) { // Köper (Hose): schräge Rippen, verwaschene Stellen, Blut
    float k = 4.0, tw = sin((p.y + (p.x + p.z) * 0.7) * k) * clamp(2.2 - px * k * 0.8, 0.0, 1.0);
    float fold = sNoise(vec3(p.x * 0.45, p.y * 0.18, p.z * 0.45) + 9.0);
    c *= 0.9 + 0.07 * tw + 0.24 * (big - 0.5) + 0.16 * (fold - 0.5);
    c = mix(c, c * vec3(0.55, 0.47, 0.38), smoothstep(0.66, 0.84, 1.0 - big) * 0.4);
    c = mix(c, vec3(0.22, 0.025, 0.03), smoothstep(0.7, 0.86, fold * 0.6 + big * 0.4) * 0.5 * z);
    gH = fold * 1.4;
    // v3.3 verschlissene helle Stellen (Knie, Sitz) und Schlammspritzer
    float wr = sNoise(p * vec3(0.35, 0.5, 0.35) + 61.0);
    c = mix(c, c * 1.4 + vec3(0.03), smoothstep(0.62, 0.84, wr) * 0.38);
    float mud = smoothstep(0.7, 0.8, sNoise(p * vec3(0.42, 0.3, 0.42) + 67.0)) * smoothstep(0.3, 0.6, 1.0 - wr);
    c = mix(c, vec3(0.11, 0.085, 0.06), mud * (0.45 + 0.3 * z));
    gH += mud * 0.6;
    return c;
  }
  if (t < 4.5) { // Leder/Gummi: weiche Abnutzung + Glanz (feine Linien würden auf Gürteln wie Schrift aussehen)
    float mid = sNoise(p * 0.75 + 7.1), worn = smoothstep(0.66, 0.86, mid);
    c *= 0.88 + 0.22 * mid;
    c = mix(c, c * 1.5 + vec3(0.035), worn * 0.32); // v3.3 abgewetzte, matte Stellen
    c = mix(c, vec3(0.16, 0.03, 0.025), smoothstep(0.7, 0.85, 1.0 - big) * 0.4 * z); // angetrocknetes Blut
    c = mix(c, c * 0.55 + vec3(0.12, 0.1, 0.075), smoothstep(0.62, 0.84, 1.0 - big) * 0.45 * (1.0 - z)); // Held: Staub auf Stiefeln und Gurten
    gSheen = 0.22 * aM * (1.0 - worn * 0.7); gShin = 20.0;
    return c;
  }
  if (t < 5.5) { // Metall: gebürstet, Rost, Glanz
    float br = sNoise(vec3(p.x * 0.3, p.y * 5.0, p.z * 0.3)) * aF, mid = sNoise(p * 0.75 + 7.1);
    float rust = smoothstep(0.66, 0.84, big) * (0.25 + 0.6 * z);
    c *= 0.9 + 0.16 * br;
    c = mix(c, vec3(0.28, 0.12, 0.055) * (0.75 + 0.5 * mid), rust * 0.7);
    // v3.3 Kratzer (blank, nur aus der Nähe) und Schmutz in Vertiefungen
    float scr = sLine(sNoise(vec3(p.x * 2.6 + p.y * 0.4, p.y * 0.3, p.z * 2.6) + 81.0), 0.03) * aF * (1.0 - rust);
    c = c * (1.0 - smoothstep(0.66, 0.9, 1.0 - mid) * 0.28) + vec3(0.17) * scr;
    gSheen = (0.42 * (1.0 - rust) + scr * 0.12) * aM; gShin = 24.0; gH = big * 0.5 + mid * 0.3;
    return c;
  }
  if (t < 6.5) { // Haare/Fell: Strähnen mit Glanzband
    float st = sin((p.x * 0.9 + p.z * 1.2) * 4.0 + sNoise(p * vec3(0.7, 0.25, 0.7)) * 6.0) * clamp(2.2 - px * 3.5, 0.0, 1.0);
    c *= 0.86 + 0.16 * st + 0.18 * (big - 0.5);
    gSheen = 0.1 * aM; gShin = 12.0;
    return c;
  }
  if (t < 7.5) { // Knochen/Zähne: vergilbt, porös
    float pit = smoothstep(0.7, 0.76, sNoise(p * 2.0 + 13.0)) * aF;
    c *= vec3(1.0, 0.96, 0.86) * (0.9 + 0.14 * big) - 0.18 * pit;
    gH = big * 0.6; gSheen = 0.08 * aM; gShin = 16.0;
    return c;
  }
  // Holz: Maserung entlang der Längsachse (Waffenschäfte, Stiele)
  float ring = sin((p.y + p.z * 0.6) * 5.0 + sNoise(p * vec3(0.12, 1.1, 1.1)) * 7.0) * clamp(2.2 - px * 3.0, 0.0, 1.0);
  c *= 0.86 + 0.1 * ring + 0.14 * (big - 0.5);
  gH = big * 0.6; gSheen = 0.06 * aM; gShin = 14.0;
  return c;
}
vec3 bumpN(vec3 n, float h) {
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec2 dh = clamp(vec2(dFdx(h), dFdy(h)), -0.25, 0.25) * 0.8;
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}
`;
  // Glanzlicht der Richtungslichter (Blinn-Phong) – Lambert selbst kennt keinen Glanz
  const SHEEN_GLSL = (glow) => `#if NUM_DIR_LIGHTS > 0
\t{ vec3 sVd = normalize(vViewPosition);
\tfor (int i = 0; i < NUM_DIR_LIGHTS; i++) { vec3 sHv = normalize(directionalLights[i].direction + sVd); outgoingLight += directionalLights[i].color * (pow(max(dot(normal, sHv), 0.0), gShin) * gSheen${glow}); } }
\t#endif
\t`;
  // Sparvariante für Grafikstufe 1: ein einziger Rauschwert tönt je Materialklasse – kein Relief, kein Glanz, keine Ableitungen
  const SURF_LITE_GLSL = `
float sHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(sHash(i + vec3(0.0, 1.0, 0.0)), sHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0.0, 0.0, 1.0)), sHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(sHash(i + vec3(0.0, 1.0, 1.0)), sHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
vec3 surfLite(vec3 c, vec3 p, float t, float z) {
  float n = sNoise(p * 0.22);
  c *= 0.88 + 0.24 * n;
  if (t > 0.5 && t < 3.5) c = mix(c, vec3(0.24, 0.03, 0.035), smoothstep(0.72, 0.86, n) * 0.5 * z);
  if (t > 0.5 && t < 1.5) { float l = dot(c, vec3(0.3, 0.59, 0.11)); c = mix(c, vec3(l * 0.8, l * 0.95, l * 0.66), smoothstep(0.36, 0.16, n) * 0.5 * z); } // v3.3 Nekrose
  return c;
}
`;
  function surfShader(sh, glow, zk) {
    sh.uniforms.uZombie = { value: zk };
    if (quality < 2) {
      sh.fragmentShader = `uniform float uZombie;\nvarying float vTex;\nvarying vec3 vGrain;\n${glow ? "varying float vGlow;\n" : ""}` + sh.fragmentShader
        .replace("void main() {", `${SURF_LITE_GLSL}\nvoid main() {`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n\tdiffuseColor.rgb = ${glow ? "mix(surfLite(diffuseColor.rgb, vGrain, vTex, uZombie), diffuseColor.rgb, vGlow)" : "surfLite(diffuseColor.rgb, vGrain, vTex, uZombie)"};`)
        .replace("#include <opaque_fragment>", `${RIM_GLSL}${glow ? " * (1.0 - vGlow)" : ""};${KNEE_GLSL};\n\t${glow ? "outgoingLight = mix(outgoingLight, diffuseColor.rgb, vGlow);\n\t" : ""}#include <opaque_fragment>`);
      return;
    }
    const g = glow ? " * (1.0 - vGlow)" : "";
    sh.fragmentShader = `uniform float uZombie;\nvarying float vTex;\nvarying vec3 vGrain;\n${glow ? "varying float vGlow;\n" : ""}` + sh.fragmentShader
      .replace("void main() {", `${SURF_GLSL}\nvoid main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n\tfloat sPx = length(fwidth(vGrain));\n\tvec3 sBase = diffuseColor.rgb;\n\tdiffuseColor.rgb = surf(sBase, vGrain, vTex, sPx, uZombie);${glow ? "\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, sBase, vGlow);" : ""}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n\tnormal = bumpN(normal, gH${g});`)
      .replace("#include <opaque_fragment>", `${SHEEN_GLSL(g)}${RIM_GLSL}${g};${KNEE_GLSL};\n\t${glow ? "outgoingLight = mix(outgoingLight, diffuseColor.rgb, vGlow);\n\t" : ""}#include <opaque_fragment>`);
  }
  function injectParts(sh, uni, kind, zk = 1) {
    sh.uniforms.partMat = uni;
    const pm = "partMat[int(part + 0.5)]";
    let vs = `attribute float part;\nuniform mat4 partMat[${MAXP}];\n${kind === "lit" ? "attribute float glow;\nattribute float tex;\nvarying float vGlow;\nvarying float vTex;\nvarying vec3 vGrain;\n" : ""}${sh.vertexShader}`;
    if (kind === "lit") vs = vs.replace("#include <beginnormal_vertex>", `vec3 objectNormal = mat3(${pm}) * normal;`);
    vs = vs.replace("#include <begin_vertex>", `vec3 transformed = (${pm} * vec4(position, 1.0)).xyz;${kind === "outline" ? `\n  transformed += mat3(${pm}) * normal;` : ""}${kind === "lit" ? "\n  vGlow = glow; vTex = tex; vGrain = position;" : ""}`);
    sh.vertexShader = vs;
    if (kind === "lit") surfShader(sh, true, zk);
  }
  function partMaterial(m, uni, kind, zk = 1) {
    m.onBeforeCompile = (sh) => injectParts(sh, uni, kind, zk);
    m.customProgramCacheKey = () => `parts${MAXP}:${kind}:v35${kind === "lit" && quality < 2 ? ":lite" : ""}`; // alle Figuren teilen sich ein Programm je Art (und Grafikstufe)
    return m;
  }
  // Materialklasse eines Teils: ausdrücklich (userData.tex), über die Rolle (Haut/Hemd/Hose) oder geschätzt aus der Farbe
  const texHsl = {};
  function texOf(m) {
    const u = m.userData;
    if (u.tex) return TEXC[u.tex] || 0;
    if (u.role === "skin") return 1;
    if (u.role === "shirt") return 2;
    if (u.role === "pants") return 3;
    m.color.getHSL(texHsl);
    if (texHsl.l < 0.12) return 4; // fast schwarz: Schuhe, Gürtel, Gummi
    if (texHsl.s < 0.16 && texHsl.l > 0.42 && texHsl.l < 0.88 && m.color.b >= m.color.r * 0.98) return 5; // kühles Grau: Metall
    return 0;
  }
  function updateParts(M) {
    const { nodes, parent, uni, hidden } = M.parts, mats = uni.value;
    for (let i = 1; i < nodes.length; i++) {
      hidden[i] = hidden[parent[i]] || !nodes[i].visible;
      if (hidden[i]) mats[i].copy(ZERO); // versteckter Knoten (z. B. abgetrennter Kopf) fällt auf einen Punkt zusammen
      else mats[i].multiplyMatrices(mats[parent[i]], nodes[i].matrix);
    }
  }
  function bakeParts(M, keep, look) {
    // Knoten Eltern-zuerst; Index 0 = Wurzel
    const nodes = [M.root], parent = [-1], lit = [], fine = [], glow = [];
    for (let i = 0; i < nodes.length; i++) {
      for (const c of nodes[i].children) {
        if (!c.isMesh) { nodes.push(c); parent.push(i); continue; }
        const m = c.material;
        if (keep.has(c) || c.userData.solo || c.children.length || Array.isArray(m) || m.map || m.transparent) continue;
        (m.isMeshBasicMaterial ? glow : c.userData.fine ? fine : lit).push([c, i]);
      }
    }
    if (quality < 2 && M.kind !== "player") { for (const [m] of fine) m.parent.remove(m); fine.length = 0; } // v3.2: Kleinteile nur mit voller Grafik
    if (nodes.length > MAXP || !lit.length) return false;
    // Ruhelage je Knoten im Modellraum (für Vertexfarben und Begrenzungskugel)
    const bind = nodes.map(() => new T3.Matrix4());
    for (let i = 1; i < nodes.length; i++) { nodes[i].updateMatrix(); bind[i].multiplyMatrices(bind[parent[i]], nodes[i].matrix); }
    const parts = [];
    // Reihenfolge: Grundkörper (mit Umriss) → feine Details (ohne Umriss, sonst wären Zähne/Finger schwarze Kleckse) → Leuchtteile
    let count = 0, litCount = 0;
    for (const [list, isGlow] of [[lit, 0], [fine, 0], [glow, 1]]) {
      for (const [m, pi] of list) {
        m.updateMatrix();
        const src = list === lit ? softGeo(m.geometry) : m.geometry; // v3.5: Grundkörper mit runden Kanten
        const g = src.index ? src.toNonIndexed() : src.clone();
        g.applyMatrix4(m.matrix);
        parts.push({ g, c: m.material.color, pi, isGlow, role: m.material.userData.role, tex: texOf(m.material) });
        count += g.attributes.position.count;
      }
      if (list === lit) litCount = count;
    }
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const partA = new Uint8Array(count), glowA = new Uint8Array(count), texA = new Uint8Array(count), sphere = [];
    let o = 0;
    for (const { g, c, pi, isGlow, role, tex } of parts) {
      const n = g.attributes.position.count, P = g.attributes.position.array;
      pos.set(P, o * 3);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, o * 3);
      paintFaces(col, P, n, o, c, bind[pi], isGlow ? null : look, role, g.attributes.normal ? g.attributes.normal.array : null);
      partA.fill(pi, o, o + n); glowA.fill(isGlow, o, o + n); texA.fill(tex, o, o + n);
      for (let i = 0; i < n; i++) sphere.push(new T3.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(bind[pi]));
      o += n;
      g.dispose();
    }
    for (const [m] of [...lit, ...fine, ...glow]) m.parent.remove(m);
    const geo = new T3.BufferGeometry(), og = new T3.BufferGeometry();
    const attrs = { position: new T3.BufferAttribute(pos, 3), normal: new T3.BufferAttribute(nrm, 3), part: new T3.BufferAttribute(partA, 1) };
    for (const [k, a] of Object.entries(attrs)) { geo.setAttribute(k, a); og.setAttribute(k, a); }
    geo.setAttribute("color", new T3.BufferAttribute(col, 3));
    geo.setAttribute("glow", new T3.BufferAttribute(glowA, 1));
    geo.setAttribute("tex", new T3.BufferAttribute(texA, 1));
    og.setDrawRange(0, litCount); // Umriss nur um beleuchtete Teile, nicht um Augen
    // Begrenzungskugel aus der Ruhelage, mit Luft für Arme und Sprünge
    const bs = new T3.Sphere().setFromPoints(sphere);
    bs.radius *= 1.35;
    geo.boundingSphere = bs; og.boundingSphere = bs.clone();
    const uni = { value: nodes.map(() => new T3.Matrix4()) };
    while (uni.value.length < MAXP) uni.value.push(new T3.Matrix4());
    // v3.3 realistischer: glatt schattiert (Normalen der Grundkörper statt Facetten) und ohne Cartoon-Umriss –
    // die Silhouette trennt das Randlicht vom Boden; spart nebenbei einen Zeichendurchgang je Figur
    const body = new T3.Mesh(geo, partMaterial(new T3.MeshLambertMaterial({ vertexColors: true, flatShading: false }), uni, "lit", look && look.grime > 0.5 ? 1 : 0));
    body.customDepthMaterial = partMaterial(new T3.MeshDepthMaterial(), uni, "depth");
    body.userData.parts = true;
    // Matrizen direkt vor dem Zeichnen: three.js hat die Gruppenmatrizen dann schon aktualisiert
    body.onBeforeRender = body.onBeforeShadow = () => updateParts(M);
    M.root.add(body);
    if (FIG_OUTLINE) {
      const outline = new T3.Mesh(og, partMaterial(new T3.MeshBasicMaterial({ color: 0x07090b, side: T3.BackSide, fog: false }), uni, "outline"));
      outline.userData.outline = true; outline.onBeforeRender = () => updateParts(M);
      M.root.add(outline);
    }
    // v2.8: Ruhelage jedes Vertex im Modellraum + Originalfarben – Treffer-Wunden malen darauf
    const mpos = new Float32Array(count * 3);
    sphere.forEach((v, i) => { mpos[i * 3] = v.x; mpos[i * 3 + 1] = v.y; mpos[i * 3 + 2] = v.z; });
    M.parts = { nodes, parent, uni, hidden: nodes.map(() => false), body, litCount, mpos, col0: col.slice(), colAttr: geo.attributes.color, wounds: 0 };
    updateParts(M);
    return true;
  }
  function bake(M) {
    const keep = new Set();
    for (const v of Object.values(M.extra)) {
      if (v && v.isObject3D) keep.add(v);
      else if (Array.isArray(v)) v.forEach((x) => { if (x && x.isObject3D) keep.add(x); });
    }
    M.root.updateMatrixWorld(true);
    // Zombies: Blut & Dreck, Spieler: nur etwas Staub
    const zombie = M.kind !== "player" && M.kind !== "civilian" && !M.pet; // Überlebende und Begleiter: sauber wie der Held
    const look = { h: M.height, seed: Math.random() * 10, grime: zombie ? 0.75 : 0.3, freq: zombie ? 0.22 : 0.3, gr: zombie ? 0.16 : 0.12, gg: zombie ? 0.005 : 0.1, gb: zombie ? 0.008 : 0.07 };
    if (M.kind === "abom" || M.kind === "mother") look.grime = 0.4;
    // Einzelteile mit eigener Animation behalten ihre Materialien; der Rest blitzt gemeinsam auf
    const kept = M.mats.filter((m) => [...keep].some((k) => k.material === m));
    if (bakeParts(M, keep, look)) { M.mats = [M.parts.body.material, ...kept]; return; }
    // Bosse mit sehr vielen Gelenken: je Knoten ein verschmolzenes Mesh
    const lit = new T3.MeshLambertMaterial({ vertexColors: true, flatShading: false });
    lit.onBeforeCompile = (sh) => {
      sh.vertexShader = "attribute float tex;\nvarying float vTex;\nvarying vec3 vGrain;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vGrain = position; vTex = tex;");
      surfShader(sh, false, look.grime > 0.5 ? 1 : 0);
    };
    lit.customProgramCacheKey = () => `boss:v35${quality < 2 ? ":lite" : ""}`;
    const glow = new T3.MeshBasicMaterial({ vertexColors: true });
    bakeNode(M.root, lit, glow, keep, FIG_OUTLINE, look, true, SOFT_K);
    M.mats = [lit, ...kept];
  }

  // v2.8 Treffer-Wunden: die Einschlagstelle (Schussrichtung relativ zur Blickrichtung, Brust- oder Kopfhöhe)
  // färbt die Vertexfarben blutrot – angeschossene Zombies tragen ihre Treffer sichtbar, auch als Leiche
  const WOUND_MAX = 14, woundC = new T3.Color();
  function woundAt(M, e) {
    const P = M.parts, h = e.lastHit;
    if (!P || !P.mpos || !h || P.wounds >= WOUND_MAX) return;
    if (h.kind === "cryo" || h.kind === "shock") return;
    const burn = h.kind === "burn";
    if (burn && Math.random() < 0.75) return; // Flammen treffen dauernd – nur ab und zu ein Brandfleck
    const H = M.height || 40, mp = P.mpos, col = P.colAttr.array, n = P.litCount;
    const d = (h.ang ?? e.hitAng ?? 0) + Math.PI - (e.face || 0), dx = Math.cos(d), dz = Math.sin(d);
    const yh = H * (h.crit && !burn ? 0.86 : 0.55 + Math.random() * 0.25);
    // Oberfläche zum Schützen hin: Vertex mit der größten Ausdehnung in Schussrichtung nahe der Trefferhöhe –
    // leicht nach oben gezogen, damit die steile Spielkamera die Wunde auch sieht (Schultern, Oberkörper)
    let best = -1, bs = -1e9;
    for (let i = 0; i < n; i++) {
      const v = mp[i * 3] * dx + mp[i * 3 + 2] * dz + mp[i * 3 + 1] * 0.3 - Math.abs(mp[i * 3 + 1] - yh) * 1.3;
      if (v > bs) { bs = v; best = i; }
    }
    if (best < 0) return;
    const cx = mp[best * 3], cy = mp[best * 3 + 1], cz = mp[best * 3 + 2];
    const rad = H * (h.kind === "blast" ? 0.22 : h.big || h.crit ? 0.15 : 0.11), r2 = rad * rad, run = rad * 3;
    // frisches Blut leuchtender als die getrocknete Bodenfarbe, sonst verschwindet es auf dunklem Stoff
    if (burn) woundC.setRGB(0.035, 0.028, 0.024); else { woundC.set((e.def && e.def.blood) || "#6e0f12").multiplyScalar(2.2); woundC.r = Math.min(0.55, woundC.r); }
    for (let i = 0; i < n; i++) {
      const j = i * 3, ox = mp[j] - cx, oy = mp[j + 1] - cy, oz = mp[j + 2] - cz, q = ox * ox + oy * oy + oz * oz;
      let k = 0;
      if (q < r2) k = Math.min(0.96, (1 - Math.sqrt(q) / rad) * (1.5 + 0.5 * Math.sin(i * 12.9898)));
      else if (!burn && oy < 0 && oy > -run && ox * ox + oz * oz < r2 * 0.1) k = 0.55 * (1 + oy / run); // herablaufendes Blut
      if (k <= 0) continue;
      col[j] += (woundC.r - col[j]) * k; col[j + 1] += (woundC.g - col[j + 1]) * k; col[j + 2] += (woundC.b - col[j + 2]) * k;
    }
    P.colAttr.needsUpdate = true;
    P.wounds++;
  }

  // Brutnest: pulsierender Fleischsack mit Ranken und leuchtenden Eiern
  function buildNest(r, P) {
    const M = makeModel("nest");
    const skin = flashMat(M, P.skin), dark = flashMat(M, "#3a1a30");
    skin.userData.tex = "skin"; dark.userData.tex = "skin";
    const sac = group(0, 0.5 * r, 0);
    for (const [x, y, z, k] of [[0, 0, 0, 0.85], [-0.32, 0.12, -0.36, 0.55], [0.34, 0.08, -0.3, 0.5], [-0.26, 0.04, 0.42, 0.52], [0.32, 0.1, 0.36, 0.48], [0.02, 0.5, 0, 0.45]]) sac.add(mesh(ico(k * r, 1), skin, x * r, y * r, z * r));
    for (let i = 0; i < 8; i++) { const a = i * 0.8; sac.add(mesh(ico(0.1 * r + (i % 3) * 0.03 * r, 0), sbasic("#e070e0"), Math.cos(a) * 0.66 * r, 0.05 * r + (i % 3) * 0.2 * r, Math.sin(a) * 0.66 * r)); }
    sac.add(mesh(ico(0.2 * r, 0), basic(0x1a0510), 0.02 * r, 0.9 * r, 0));
    M.body.add(sac); M.extra.sac = sac;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, t2 = mesh(cyl(0.05 * r, 0.12 * r, 1.4 * r, 5), dark, Math.cos(a) * 0.95 * r, 0.12 * r, Math.sin(a) * 0.95 * r);
      t2.rotation.set(Math.sin(a) * 1.35, 0, -Math.cos(a) * 1.35); M.body.add(t2);
    }
    M.height = 1.7 * r;
    return M;
  }
  const builders = { crawler: buildCrawler, dog: buildDog, petdog: buildDog, rat: buildRat, abom: buildAbom, mother: buildMother, nest: buildNest };
  const pools = new Map();
  // v3.7 Hautfarbe je Evolutionsstufe (Kleidung dunkelt nach), Teile kommen aus addMutation
  const EVO_SKIN3 = [null, "#5f9a34", "#6e3a2c", "#4a1418"], EVO_CLOTH3 = [0, 0.08, 0.2, 0.38], evoCol = new T3.Color(), evoCol2 = new T3.Color();
  const evoBlend = (c, to, k) => (c && c[0] === "#" ? `#${evoCol.set(c).lerp(evoCol2.set(to), k).getHexString()}` : c);
  function evoPal3D(P, evo) { return { ...P, evo, skin: evoBlend(P.skin || "#8a9a7a", EVO_SKIN3[evo], evo === 1 ? 0.66 : 0.72), shirt: evoBlend(P.shirt, "#120808", EVO_CLOTH3[evo]), pants: evoBlend(P.pants, "#120808", EVO_CLOTH3[evo]) }; }
  function acquireModel(type, r, variant, evo = 0) {
    const pal = PAL[type] || PAL.walker, pi = variant % pal.length;
    if (builders[type]) evo = 0; // Kriecher, Hunde, Ratten, Bosse und Nester mutieren nicht
    const key = evo ? `${type}:${pi}:e${evo}` : `${type}:${pi}`;
    const list = pools.get(key);
    let M = list && list.pop();
    if (!M) {
      const P = evo ? evoPal3D(pal[pi], evo) : pal[pi];
      M = (builders[type] || ((rr, pp) => buildHumanoid(type, rr, pp)))(r, P);
      M.evo = evo;
      bake(M);
      M.key = key;
      M.mats.forEach((m) => { m.userData.base = m.color.clone(); });
      cast(M.root);
    }
    M.root.visible = true;
    // Wunden des Vorbesitzers aus dem Pool abwaschen
    if (M.parts && M.parts.wounds) { M.parts.colAttr.array.set(M.parts.col0); M.parts.colAttr.needsUpdate = true; M.parts.wounds = 0; }
    M.hitRef = null;
    if (M.extra.head) M.extra.head.visible = true;
    for (const A of M.arms) A.g.visible = true;
    M.root.rotation.set(0, 0, 0);
    M.root.position.set(0, 0, 0);
    M.mats.forEach((m) => { m.color.copy(m.userData.base); m.emissive.setRGB(0, 0, 0); });
    scene.add(M.root);
    return M;
  }
  const POOL_MAX = 8; // pro Typ/Variante – mehr gleichzeitige Gegner kommen kaum vor
  function releaseModel(M) {
    if (M.ghost) setGhost(M, 0); // aus dem Pool wieder deckend herausgeben
    scene.remove(M.root);
    if (!pools.has(M.key)) pools.set(M.key, []);
    const list = pools.get(M.key);
    if (list.length < POOL_MAX) list.push(M); else disposeTree(M.root);
  }

  function animate(M, e, t, near = false) {
    const ph = (e.anim / 8) * TAU;
    for (const L of M.legs) {
      if (L.spider) L.g.rotation.y = L.base + Math.sin(ph + L.k * 1.57 + (L.s > 0 ? Math.PI : 0)) * 0.18;
      else L.g.rotation.z = Math.sin(ph + (L.ph || 0) + (L.ph === undefined && L.s > 0 ? Math.PI : 0)) * (M.kind === "dog" ? 0.8 : 0.55);
    }
    // Nah am Spieler: Arme hoch und zuschlagen
    const reach = near ? 0.55 + Math.sin(t * 13 + e.wob) * 0.35 : 0;
    for (const A of M.arms) {
      if (A.crawl) A.g.rotation.y = A.s * 0.3 + Math.sin(ph + (A.s > 0 ? 0 : Math.PI)) * 0.5;
      else A.g.rotation.z = 0.12 + Math.sin(ph * 0.5 + A.s) * 0.08 + reach * (A.s > 0 ? 1 : 0.7);
    }
    if (M.kind !== "abom" && M.kind !== "mother" && M.kind !== "crawler") {
      M.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * e.r;
      // Schlurfen: seitliches Wanken; Treffer: nach hinten zucken; Sturmangriff: weit vorgebeugt
      const rush = e.mode === "lunge" || e.mode === "charge" ? -0.35 : 0;
      // v2.8 Körper-Animation: Gangart je Zombie (0 normal, 1 hinkend, 2 Arm schleift, 3 Kopf hängt),
      // Treffer schubsen den Oberkörper in Schussrichtung und reißen den Kopf mit, schwer Verletzte taumeln
      const gait = M.kind === "player" || (e.def && e.def.boss) ? 0 : Math.floor((e.wob || 0) * 10) % 4;
      const fl = Math.min(0.1, e.hitT || 0) * 3.2, hd = (e.hitAng || 0) - (e.face || 0);
      const weak = e.maxHp ? Math.max(0, 1 - e.hp / (e.maxHp * 0.35)) : 0;
      M.body.rotation.x = Math.sin(ph) * (gait === 1 ? 0.15 : 0.07) + Math.sin(hd) * fl + Math.sin(t * 4.2 + (e.wob || 0)) * 0.1 * weak;
      M.body.rotation.z = (M.lean || 0) + rush - Math.cos(hd) * fl + 0.12 * weak;
      M.body.rotation.y = Math.sin(ph) * 0.09;
      if (gait === 1) { M.body.position.y -= Math.max(0, Math.sin(ph)) * 0.06 * e.r; for (const L of M.legs) if (L.s > 0 && !L.spider) L.g.rotation.z *= 0.35; }
      else if (gait === 2) for (const A of M.arms) if (A.s < 0 && !A.crawl) A.g.rotation.z = -0.1 + Math.sin(ph) * 0.12;
      if (e.mode === "crouch") { M.body.position.y = -0.22 * e.r; M.body.rotation.z -= 0.35; for (const L of M.legs) L.g.rotation.z = L.s * 0.5; }
      else if (e.mode === "leap" || e.pose === "air") { M.body.rotation.z -= 0.6; for (const L of M.legs) L.g.rotation.z = -0.9; for (const A of M.arms) A.g.rotation.z = 0.9; }
      else if (e.pose === "feed") { M.body.position.y = -0.3 * e.r; M.body.rotation.z -= 0.85; for (const L of M.legs) L.g.rotation.z = L.s * 0.6; for (const A of M.arms) A.g.rotation.z = 0.6 + Math.sin(t * 13 + A.s * 1.7 + (e.wob || 0)) * 0.35; } // v3.7 frisst an einer Leiche
      else if (e.mode === "scream") { if (M.extra.head) M.extra.head.rotation.z = 0.55; for (const A of M.arms) { A.g.rotation.y = A.s * 1.1; A.g.rotation.z = 0.5; } M.body.rotation.z += 0.2; }
      else if (e.mode === "zap") { for (const A of M.arms) A.g.rotation.z = 1.25 + Math.random() * 0.2; M.body.rotation.x += (Math.random() - 0.5) * 0.2; }
      else if (e.mode === "lift" || e.pose === "lift") { for (const A of M.arms) A.g.rotation.z = A.s > 0 ? 2.3 : 0.6; M.body.rotation.z += 0.18; }
      else if (e.pose === "crouch") { M.body.position.y = -0.22 * e.r; M.body.rotation.z -= 0.35; for (const L of M.legs) L.g.rotation.z = L.s * 0.5; for (const A of M.arms) A.g.rotation.z = 1.4; }
      else if (e.mode === "leap2") { M.body.rotation.z -= 0.5; for (const L of M.legs) L.g.rotation.z = -0.8; for (const A of M.arms) A.g.rotation.z = 2.4; }
      else if (e.mode === "spin") { for (const A of M.arms) { A.g.rotation.z = 1.5; A.g.rotation.y = A.s * 1.3; } }
      else if (e.mode === "tele" && e.tele && e.tele.k === "cone") { for (const A of M.arms) A.g.rotation.z = A.s > 0 ? 2.0 : 0.4; M.body.rotation.z -= 0.2; }
      else if (e.mode === "whistle" || e.pose === "whistle") { for (const A of M.arms) A.g.rotation.z = A.s > 0 ? 1.9 + Math.sin(t * 30) * 0.1 : 0.3; if (M.extra.head) M.extra.head.rotation.z = 0.25; }
      if (e.mode !== "scream" && e.mode !== "whistle" && e.pose !== "whistle" && M.extra.head) M.extra.head.rotation.z = 0;
      if (M.extra.head) {
        M.extra.head.rotation.x = Math.sin(t * 1.6 + (e.wob || 0) * 3) * (gait === 3 ? 0.34 : 0.1) + Math.sin(hd) * fl * 1.4 + (e.stunT > 0 ? Math.sin(t * 7 + (e.wob || 0)) * 0.4 : 0); // v2.9 benommen
        if (e.mode !== "scream") M.extra.head.rotation.z -= Math.cos(hd) * fl * 1.6;
      }
      if (e.mode !== "scream" && e.mode !== "spin") for (const A of M.arms) if (!A.crawl) A.g.rotation.y = A.s * 0.18;
      // v3.4 Gehen: Arme schwingen gegen die Beine; Zuckungen: etwa alle 7 s reißt es Kopf und Schulter (je Zombie versetzt)
      if (!near && e.mode === "walk") for (const A of M.arms) if (!A.crawl && !(gait === 2 && A.s < 0)) A.g.rotation.z += Math.sin(ph + (A.s > 0 ? Math.PI : 0)) * 0.14;
      const tw = M.kind === "player" || (e.def && e.def.boss) ? 0 : Math.max(0, Math.sin(t * 0.9 + (e.wob || 0) * 7) - 0.94) * 16;
      if (tw > 0 && e.mode === "walk") {
        if (M.extra.head) { M.extra.head.rotation.z += Math.sin(t * 57) * 0.32 * tw; M.extra.head.rotation.x += 0.22 * tw; }
        for (const A of M.arms) if (A.s > 0 && !A.crawl) A.g.rotation.z += Math.sin(t * 41) * 0.3 * tw;
        M.body.rotation.x += Math.sin(t * 33) * 0.06 * tw;
      }
    }
    if (e.armOff) for (const A of M.arms) A.g.visible = !e.armOff[A.s]; // abgeschossener Arm
    if (M.extra.blink) M.extra.blink.visible = Math.sin(t * 14 + e.wob) > 0;
    if (M.extra.sac) M.extra.sac.scale.setScalar(1 + 0.15 * Math.sin(ph * 2));
    if (M.extra.tail) M.extra.tail.rotation.y = Math.sin(t * 12) * 0.5;
    if (M.extra.lobes) M.extra.lobes.forEach((l, i) => l.scale.setScalar(1 + 0.05 * Math.sin(t * 4 + i)));
    if (M.extra.tentacles) M.extra.tentacles.forEach((segs, i) => segs.forEach((s, k) => { s.rotation.y = Math.sin(t * 2.5 + i + k * 0.6) * 0.35; s.rotation.z = Math.sin(t * 2 + i * 2 + k) * 0.15; }));
    if (M.extra.eggs) M.extra.eggs.forEach((egg, i) => egg.scale.setScalar(1 + 0.12 * Math.sin(t * 4 + i)));
  }

  const AFF_RGB = { gold: [1, 0.75, 0], armored: [0.65, 0.8, 1], swift: [0.3, 0.9, 1], volatile: [1, 0.4, 0.1], regen: [0.4, 1, 0.45], shielded: [0.5, 0.7, 1] };
  function tint(M, e, t) {
    let r = 0, g = 0, b = 0;
    if (e.hitT > 0) { const k = Math.min(1, e.hitT / 0.1) * 0.9; r = g = b = k; }
    else if (e.phase2 || e.rageT > 0) { const k = 0.35 + 0.25 * Math.sin(t * 10); r = k; g = 0.02; b = 0.06; }
    else if (e.mode === "zap") { const k = Math.random() < 0.5 ? 0.7 : 0.2; r = k * 0.4; g = k * 0.9; b = k; }
    else if (e.slowT > 0) { r = 0.15; g = 0.4; b = 0.7; }
    else if (e.stunT > 0) { const k = 0.28 + 0.18 * Math.sin(t * 18); r = k; g = k * 0.9; b = k * 0.45; } // v2.9 betäubt
    else if (e.burnT > 0 || e.type === "burner") { const k = 0.3 + 0.2 * Math.sin(t * 20 + e.wob); r = k; g = k * 0.4; }
    else if (e.shield > 0) { const k = 0.22 + 0.1 * Math.sin(t * 9 + e.wob); r = k * 0.35; g = k * 0.7; b = k; }
    else if (e.type === "phantom") { const k = 0.3 + 0.12 * Math.sin(t * 7 + e.wob); r = k * 0.6; g = k * 0.5; b = k; }
    else if (e.elite) { const k = 0.18 + 0.1 * Math.sin(t * 5), c = AFF_RGB[e.aff && e.aff[0]] || AFF_RGB.gold; r = k * c[0]; g = k * c[1]; b = k * c[2]; }
    for (const m of M.mats) m.emissive.setRGB(r, g, b);
  }



  // v2.2 Heilbronn: Kiliansturm mit dem „Männle“ ragt über die Dächer, am Marktplatz hängt die Kunstuhr des Rathauses
  function addHeilbronn(deco, w, WH) {
    const sand = slam("#b89a72"), sandD = slam("#8a7254"), slate = slam("#3a3e44"), gold = sbasic("#e8c64a");
    const tw = group(D.W / 2 + 112, WH, D.T - 30);
    tw.scale.setScalar(0.54); // gestaucht, damit Turm und Männle unter der Anzeige im Bild bleiben
    // Turmschaft in Stockwerken, nach oben schmaler (Renaissance-Westturm)
    let y = 0;
    [[56, 60], [48, 46], [40, 38], [32, 30], [24, 24]].forEach(([wd, h], i) => {
      tw.add(mesh(box(wd, h, wd), i % 2 ? sandD : sand, 0, y + h / 2, 0));
      tw.add(mesh(box(wd + 4, 3, wd + 4), sandD, 0, y + h, 0));
      for (const sx of [-1, 1]) tw.add(mesh(box(1, h * 0.45, wd * 0.18), slam("#1c1e22"), sx * (wd / 2 + 0.3), y + h * 0.55, 0));
      tw.add(mesh(box(wd * 0.18, h * 0.45, 1), slam("#1c1e22"), 0, y + h * 0.55, wd / 2 + 0.3));
      y += h;
    });
    // Laterne, Spitze und das Männle (Steinfigur eines Landsknechts mit Fahne) obenauf
    tw.add(mesh(cyl(9, 12, 16, 8), sand, 0, y + 8, 0)); y += 16;
    tw.add(mesh(cone(10, 16, 8), slate, 0, y + 8, 0)); y += 16;
    const man = group(0, y, 0); tw.add(man);
    man.add(mesh(cyl(2.2, 2.6, 7, 6), sandD, 0, 3.5, 0)); man.add(mesh(ico(2, 0), sandD, 0, 8.5, 0));
    man.add(mesh(cyl(0.4, 0.4, 12, 4), slam("#2a2a2a"), 3, 9, 0)); man.add(mesh(box(0.4, 4, 6), slam("#c81e1e"), 3, 13, 3));
    tw.add(mesh(ico(1.4, 0), gold, 0, y + 11, 0));
    cast(tw); deco.add(tw);
    if (w.district !== "Marktplatz") return null;
    // Kunstuhr: blaues Zifferblatt mit goldenem Ring, Sonne & Mond, zwei Zeiger, darüber das Rathaus-Giebelfeld
    const cx = D.W / 2 - 112, cy = WH * 0.55, cz = D.T + 0.8;
    const face = group(cx, cy, cz);
    face.scale.setScalar(1.35);
    const disc = mesh(cyl(17, 17, 1.4, 24), slam("#1d3f8a"), 0, 0, 0); disc.rotation.x = Math.PI / 2; face.add(disc);
    const ring = mesh(torus(17, 1.6), sbasic("#e8c64a"), 0, 0, 0.8); face.add(ring);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; face.add(mesh(box(1.4, 3.4, 0.6), gold, Math.cos(a) * 14, Math.sin(a) * 14, 1).rotateZ(a + Math.PI / 2)); }
    face.add(mesh(ico(2.6, 1), gold, -7, 7, 1.2)); face.add(mesh(ico(2.2, 1), sbasic("#d8dde2"), 7, -7, 1.2));
    const hour = group(0, 0, 1.6), minute = group(0, 0, 2);
    hour.add(mesh(box(1.8, 9, 0.6), gold, 0, 4.5, 0)); minute.add(mesh(box(1.2, 13, 0.6), gold, 0, 6.5, 0));
    face.add(hour, minute);
    face.add(mesh(box(50, 3.4, 3), sandD, 0, -20, -0.5));
    return { face, hour, minute }; // nicht in die statische Deko – die Zeiger drehen sich
  }

  // Skyline hinter der Nordmauer: jede Stadt hat eine Silhouette, die in zwei Sekunden sitzt
  function addCityMark(deco, w, WH) {
    const id = w.cityId;
    if (!id || id === "heilbronn") return;
    const g = group(D.W / 2 - 118, WH, D.T - 34);
    g.scale.setScalar(0.58);
    const stone = slam("#9a8a74"), brick = slam("#6a3a32"), pale = slam("#c4c0b6");
    const dark = slam("#2c3238"), metal = slam("#5a646c"), gold = sbasic("#e8c64a");
    const add = (...ms) => { for (const m of ms) g.add(m); };
    switch (id) {
      case "stuttgart":
        add(mesh(cyl(12, 16, 28, 8), pale, 0, 14, 0), mesh(cyl(5, 9, 80, 8), metal, 0, 68, 0),
          mesh(cyl(14, 14, 8, 10), slam("#c45a28"), 0, 92, 0), mesh(cyl(2.2, 3.5, 48, 6), metal, 0, 140, 0));
        break;
      case "muenchen":
        for (const sx of [-24, 24]) add(mesh(box(20, 52, 20), stone, sx, 26, 0), mesh(cyl(7, 9, 14, 8), stone, sx, 59, 0),
          mesh(ico(10, 0), slam("#3a4854"), sx, 74, 0), mesh(cone(2.4, 12, 6), dark, sx, 86, 0));
        add(mesh(box(40, 30, 24), stone, 0, 15, 0));
        break;
      case "nuernberg":
        add(mesh(box(48, 36, 36), stone, 0, 18, 0), mesh(box(28, 44, 28), stone, 0, 58, 0),
          mesh(cyl(10, 12, 22, 8), stone, 0, 91, 0), mesh(cone(14, 28, 8), dark, 0, 116, 0));
        break;
      case "leipzig":
        add(mesh(box(56, 40, 40), stone, 0, 20, 0), mesh(box(36, 28, 36), stone, 0, 54, 0),
          mesh(cyl(8, 10, 40, 8), stone, 0, 88, 0), mesh(box(22, 18, 22), stone, 0, 116, 0));
        break;
      case "berlin":
        add(mesh(cyl(6, 8, 70, 8), metal, 0, 35, 0), mesh(ico(22, 1), slam("#c8d0d8"), 0, 86, 0),
          mesh(cyl(3, 4, 50, 6), metal, 0, 130, 0), mesh(cone(6, 10, 6), gold, 0, 158, 0));
        break;
      case "frankfurt":
        add(mesh(box(22, 90, 22), metal, -28, 45, 0), mesh(box(18, 120, 18), slam("#4a5460"), 0, 60, 0),
          mesh(cone(12, 22, 4), pale, 0, 131, 0), mesh(box(16, 70, 16), metal, 26, 35, 0));
        break;
      case "koeln":
        for (const sx of [-18, 18]) add(mesh(box(16, 70, 16), stone, sx, 35, 0), mesh(box(10, 50, 10), stone, sx, 95, 0),
          mesh(cone(7, 28, 4), dark, sx, 134, 0));
        add(mesh(box(44, 28, 22), stone, 0, 14, 0));
        break;
      case "hamburg":
        add(mesh(box(70, 22, 28), brick, 0, 11, 0), mesh(box(54, 18, 22), pale, 0, 30, 0),
          mesh(box(40, 10, 16), slam("#d8e0e4"), 0, 44, 0), mesh(cyl(6, 8, 48, 8), brick, -38, 46, 0),
          mesh(cone(8, 16, 6), slam("#6a4a32"), -38, 78, 0));
        break;
      case "amsterdam":
        for (const [sx, h] of [[-20, 42], [0, 54], [22, 38]]) add(mesh(box(16, h, 16), brick, sx, h / 2, 0), mesh(cone(10, 14, 3), dark, sx, h + 7, 0));
        break;
      case "paris":
        add(mesh(box(8, 90, 8), metal, 0, 45, 0));
        for (const y of [20, 50, 78]) add(mesh(box(y < 50 ? 48 : 22, 4, 4), metal, 0, y, 0));
        add(mesh(cone(6, 28, 4), metal, 0, 104, 0));
        break;
      case "wien":
        add(mesh(box(36, 50, 28), stone, 0, 25, 0), mesh(box(16, 40, 16), stone, 0, 70, 0),
          mesh(cone(12, 36, 4), dark, 0, 108, 0), mesh(box(40, 6, 8), slam("#4a8a4a"), 0, 42, 0));
        break;
      case "prag":
        for (const sx of [-16, 16]) add(mesh(box(14, 56, 14), stone, sx, 28, 0), mesh(cone(8, 32, 4), dark, sx, 72, 0));
        add(mesh(box(36, 24, 20), stone, 0, 12, 0));
        break;
      default:
        return;
    }
    cast(g);
    deco.add(g);
  }

  // v2.1 Menü: Polizeihubschrauber kreist über der Altstadt, Suchscheinwerfer streift über den Platz
  let heli = null;
  const heliState = { tx: 0, tz: 0, x: 0, y: 0, z: 0 };
  function makeHeli() {
    const g = group(), body = slam("#2c343c"), dark = slam("#15181b"), stripe = slam("#d8dde2");
    const glass = smat("heliglass", () => new T3.MeshLambertMaterial({ color: 0x2a4a5a, emissive: 0x0c1e28 }));
    const fus = mesh(cap(13, 26), body, 0, 0, 0); fus.rotation.z = Math.PI / 2; g.add(fus);
    const cock = mesh(ico(12.5, 1), glass, 16, 2, 0); cock.scale.set(1.1, 0.85, 0.95); g.add(cock);
    g.add(mesh(box(40, 3, 27), stripe, -2, -2, 0));
    g.add(mesh(box(62, 5, 5), body, -46, 4, 0));
    g.add(mesh(box(5, 18, 2.5), body, -76, 12, 0));
    for (const z of [-11, 11]) { g.add(mesh(box(52, 2, 2), dark, 0, -19, z)); for (const x of [-12, 12]) g.add(mesh(box(2, 7, 2), dark, x, -15, z)); }
    g.add(mesh(cyl(4, 5, 8, 8), dark, 0, 15, 0));
    const rotor = group(0, 19, 0);
    for (const a of [0, Math.PI / 2]) { const b2 = mesh(box(160, 0.8, 5), dark); b2.rotation.y = a; rotor.add(b2); }
    g.add(rotor);
    const blur = new T3.Mesh(new T3.CylinderGeometry(80, 80, 0.4, 28), new T3.MeshBasicMaterial({ color: 0x9aa4ae, transparent: true, opacity: 0.08, depthWrite: false }));
    blur.position.y = 19; g.add(blur);
    const tail = group(-76, 12, 3.5); tail.add(mesh(box(1, 22, 2.5), dark)); g.add(tail);
    g.add(mesh(ico(3.5, 0), sbasic("#fff6dc"), 22, -10, 0)); // Scheinwerfer
    // Lichtkegel des Suchscheinwerfers (staubige Luft, additiv)
    const cone2 = new T3.ConeGeometry(1, 1, 24, 1, true); cone2.translate(0, -0.5, 0);
    const beam2 = new T3.Mesh(cone2, new T3.MeshBasicMaterial({
      // oben (Scheinwerfer) schwächer, unten zum Lichtfleck hin heller – im Menü ist vor allem der untere Teil im Bild
      map: canvasTex(4, 128, (q) => { const gr = q.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#9aa2aa"); gr.addColorStop(0.5, "#6a7078"); gr.addColorStop(0.9, "#9aa2aa"); gr.addColorStop(1, "#c8d0d8"); q.fillStyle = gr; q.fillRect(0, 0, 4, 128); }),
      color: 0xdfeaff, transparent: true, opacity: 0.14, // dezent: die Menü-Kamera steht nah am Helden, ein kräftiger Kegel überstrahlt dort das halbe Bild
       blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false,
    }));
    beam2.renderOrder = 26; beam2.frustumCulled = false;
    scene.add(g, beam2);
    return { g, rotor, tail, beam: beam2 };
  }
  const DOWN = new T3.Vector3(0, -1, 0), tmpV = new T3.Vector3();
  // v3.6 Überflug im Einsatz: etwa jede Minute quert ein Polizeihubschrauber die Arena, der Suchscheinwerfer tastet um den Helden
  const heliFly = { next: 28, t0: -1, dur: 10, x0: 0, x1: 0, z: 0, active: false };
  function flyHeli(w, t) {
    const F = heliFly, play = w.state === "play" && !w.isBossRoom && quality >= 1;
    if (!F.active) {
      if (!play || t < F.next) return false;
      const dir = Math.random() < 0.5 ? 1 : -1;
      Object.assign(F, { active: true, t0: t, dur: 10 + Math.random() * 3, x0: dir > 0 ? D.L - 620 : D.R + 620, x1: dir > 0 ? D.R + 620 : D.L - 620, z: w.player.y - 140 + (Math.random() - 0.5) * 220 });
      if (window.GameAudio && GameAudio.rotor) GameAudio.rotor(true);
    }
    const k = (t - F.t0) / F.dur;
    if (k >= 1 || !play) { F.active = false; F.next = t + 50 + Math.random() * 35; if (window.GameAudio && GameAudio.rotor) GameAudio.rotor(false); return false; }
    const p = w.player, ease = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    const hx = F.x0 + (F.x1 - F.x0) * ease, hz = F.z + Math.sin(k * 3.1) * 40, hy = 300 + Math.sin(t * 0.8) * 10, dir = Math.sign(F.x1 - F.x0);
    heli.g.position.set(hx, hy, hz);
    heli.g.rotation.set(0, dir > 0 ? 0 : Math.PI, -0.18); // Nase in Flugrichtung, leicht nach unten
    heli.rotor.rotation.y = t * 26; heli.tail.rotation.z = t * 40;
    const sx = p.x + Math.cos(t * 0.9) * 90, sz = p.y + Math.sin(t * 1.15) * 70 - 20;
    heliState.tx = sx; heliState.tz = sz; heliState.x = hx; heliState.y = hy; heliState.z = hz;
    const dx = sx - hx, dy = -hy, dz = sz - hz, len = Math.hypot(dx, dy, dz);
    heli.beam.position.set(hx, hy - 10, hz);
    tmpV.set(dx / len, dy / len, dz / len);
    heli.beam.quaternion.setFromUnitVectors(DOWN, tmpV);
    heli.beam.scale.set(62, len, 62);
    return true;
  }
  const heliOn = (w) => !!w.menuCam || heliFly.active;
  function syncHeli(w, t) {
    if (!w.menuCam) {
      if (!heli && quality >= 1 && t >= heliFly.next && w.state === "play") heli = makeHeli();
      if (!heli) return;
      const on = flyHeli(w, t);
      heli.g.visible = on; heli.beam.visible = false; // im Einsatz nur Lichtfleck + echtes Licht: der Lichtkegel würde nah an der Kamera das Bild zuschütten
      return;
    }
    const on = !!w.menuCam;
    if (!heli) { if (!on) return; heli = makeHeli(); }
    heli.g.visible = heli.beam.visible = on;
    if (!on) return;
    const p = w.player, a = t * 0.16;
    // Kreisbahn hoch über dem Platz, leicht geneigt in Flugrichtung
    const hx = p.x + Math.cos(a) * 230, hz = p.y + 200 + Math.sin(a) * 150, hy = 250 + Math.sin(t * 0.7) * 12;
    heli.g.position.set(hx, hy, hz);
    heli.g.rotation.set(0, -a - Math.PI / 2, -0.14 + Math.sin(t * 0.9) * 0.03); // Nase leicht nach unten
    heli.g.rotateX(-0.14); // in die Kurve legen
    heli.rotor.rotation.y = t * 26; heli.tail.rotation.z = t * 40;
    // Scheinwerfer sucht den Platz ab und bleibt immer wieder kurz am Helden hängen
    const lock = Math.max(0, Math.sin(t * 0.33)) ** 6;
    const sx = p.x + Math.cos(t * 0.52) * 150 * (1 - lock), sz = p.y + 60 + Math.sin(t * 0.71) * 110 * (1 - lock) - 50 * lock;
    heliState.tx = sx; heliState.tz = sz; heliState.x = hx; heliState.y = hy; heliState.z = hz;
    const dx = sx - hx, dy = 0 - hy, dz = sz - hz, len = Math.hypot(dx, dy, dz);
    heli.beam.position.set(hx, hy - 10, hz);
    tmpV.set(dx / len, dy / len, dz / len);
    heli.beam.quaternion.setFromUnitVectors(DOWN, tmpV);
    heli.beam.scale.set(62, len, 62);
  }

  // Spieler + Waffen
  let playerModel = null;
  function weaponModel(id, tier) {
    const g = group();
    const steel = tlam("#2c3037", "metal"), steel2 = tlam("#3d4148", "metal"), wood = tlam("#6b4a2b", "wood");
    const gold = smat("gold", () => new T3.MeshLambertMaterial({ color: 0xffcf4a, emissive: 0x3a2a00 }));
    const add = (m) => { g.add(m); return m; };
    const along = (m) => { m.rotation.z = -Math.PI / 2; return m; };
    let len = 24;
    switch (id) {
      case "pistol": add(mesh(box(14, 4.2, 3.6), steel, 6, 1, 0)); add(mesh(box(4, 6, 3), steel2, 0, -2.5, 0)); len = 13; break;
      case "smg": add(mesh(box(18, 5, 4), steel, 6, 0, 0)); add(mesh(box(3, 8, 3), steel2, 8, -5, 0)); add(mesh(box(8, 2, 2), steel2, -7, 0, 0)); add(along(mesh(cyl(1.2, 1.2, 8, 6), steel2, 18, 0.5, 0))); len = 22; break;
      case "shotgun": add(mesh(box(12, 4.5, 3), wood, -8, -0.5, 0)); add(mesh(box(10, 5, 4), steel, 3, 0, 0)); add(along(mesh(cyl(1.4, 1.4, 24, 6), steel2, 19, 1, 0))); add(along(mesh(cyl(1.2, 1.2, 18, 6), steel, 16, -1.6, 0))); add(mesh(box(8, 3.4, 4.2), wood, 14, -1.6, 0)); len = 31; break;
      case "crossbow": {
        add(mesh(box(22, 3.6, 3), wood, 2, 0, 0)); add(mesh(box(12, 2, 2.4), steel2, 16, 1, 0));
        const bow = add(mesh(torus(10, 1.1, Math.PI * 0.7), tier ? gold : steel2, 14, 1.5, 0)); bow.rotation.set(Math.PI / 2, 0, Math.PI * 0.15 + Math.PI / 2 - Math.PI * 0.35 + Math.PI);
        add(along(mesh(cyl(0.6, 0.6, 20, 5), slam("#b08a58"), 14, 2.6, 0))); add(along(mesh(cone(1.2, 3, 4), slam("#dfe6ec"), 25.5, 2.6, 0)));
        len = 26; break;
      }
      case "flame": add(along(mesh(cyl(4, 4, 20, 10), slam("#8e2a22"), 4, 0, 0))); add(along(mesh(cyl(1.8, 2.4, 14, 8), steel2, 21, 0, 0))); add(mesh(ico(1.2, 0), sbasic("#6fc8ff"), 28.5, -1.5, 0)); len = 28; break;
      case "sniper": add(mesh(box(16, 4.5, 3), slam("#4c5a35"), -8, -0.5, 0)); add(mesh(box(14, 5, 3.6), steel, 6, 0, 0)); add(along(mesh(cyl(1.1, 1.1, 34, 6), steel2, 29, 0.6, 0))); add(along(mesh(cyl(1.9, 1.9, 4, 6), steel, 46, 0.6, 0))); add(along(mesh(cyl(1.9, 1.9, 16, 8), slam("#16181b"), 8, 4.4, 0))); add(mesh(cyl(1.6, 1.6, 0.4, 8), sbasic("#4ab0ff"), 16.3, 4.4, 0)).rotation.z = -Math.PI / 2; len = 48; break;
      case "grenade": add(mesh(box(10, 4, 3), slam("#3d4428"), -6, -0.5, 0)); add(along(mesh(cyl(7, 7, 7, 8), slam("#3a4026"), 5, 0, 0))); add(along(mesh(cyl(3.2, 3.2, 16, 10), slam("#4d5a2a"), 17, 0.5, 0))); len = 25; break;
      case "tesla": {
        add(mesh(box(18, 6, 5), slam("#2a2f38"), 2, 0, 0));
        add(along(mesh(cyl(1, 1, 22, 6), sbasic("#7fe7ff"), 18, 0.5, 0)));
        for (const x of [12, 17, 22]) { const c = add(mesh(torus(4.2, 1.1), smat("copper", () => new T3.MeshLambertMaterial({ color: 0xc87533, emissive: 0x2a1000 })), x, 0.5, 0)); c.rotation.y = Math.PI / 2; }
        len = 29; break;
      }
      case "magnum": {
        add(mesh(box(8, 6, 3.4), slam("#3a2a1c"), -2, -2.5, 0)); add(mesh(box(8, 5, 4), steel2, 4, 0.8, 0));
        add(along(mesh(cyl(2.6, 2.6, 5, 8), steel, 9, 0.6, 0))); add(along(mesh(cyl(1.3, 1.3, 12, 6), slam("#5a5f66"), 17, 1.2, 0)));
        len = 23; break;
      }
      case "rifle": {
        add(mesh(box(12, 4.6, 3), slam("#3a3328"), -8, -0.5, 0)); add(mesh(box(14, 5.5, 3.8), steel, 5, 0, 0));
        add(mesh(box(3, 8, 3), slam("#c9a043"), 7, -5.5, 0)); add(along(mesh(cyl(1.1, 1.1, 14, 6), steel2, 18, 0.6, 0)));
        add(mesh(box(8, 2.6, 2.6), slam("#16181b"), 4, 3.8, 0)); len = 25; break;
      }
      case "disc": {
        add(mesh(box(18, 6, 5), slam("#4a5562"), 2, 0, 0));
        const blade = add(mesh(cyl(6.5, 6.5, 1.2, 14), smat("saw", () => new T3.MeshLambertMaterial({ color: 0xc9d1d9, emissive: 0x222222 })), 16, 1, 0)); blade.rotation.x = Math.PI / 2;
        add(mesh(cyl(1.8, 1.8, 2, 8), sbasic("#e5383b"), 16, 1, 0)).rotation.x = Math.PI / 2;
        len = 22; break;
      }
      case "cryo": {
        add(along(mesh(cyl(4, 4, 18, 10), slam("#cfd8de"), 4, 0, 0))); add(along(mesh(cyl(1.6, 2.2, 12, 8), steel2, 19, 0, 0)));
        for (const x of [0, 6]) { const r2 = add(mesh(torus(4.3, 0.8), sbasic("#9fe8ff"), x, 0, 0)); r2.rotation.y = Math.PI / 2; }
        add(mesh(ico(1.4, 0), sbasic("#e8fbff"), 25.5, 0, 0)); len = 26; break;
      }
      case "rocket": {
        add(along(mesh(cyl(3.8, 3.8, 34, 10), slam("#4d5a2a"), 8, 2, 0))); add(mesh(box(4, 6, 3), slam("#2a3018"), 0, -3.5, 0));
        add(along(mesh(cone(4.6, 6, 10), slam("#e5383b"), 27, 2, 0))); add(mesh(box(6, 3, 3), slam("#16181b"), 4, 6.3, 0));
        len = 30; break;
      }
      case "laser": {
        add(mesh(box(18, 6.5, 5), slam("#1e2228"), 2, 0, 0)); add(along(mesh(cyl(1.6, 1.6, 18, 8), steel2, 19, 0.5, 0)));
        add(mesh(box(14, 1.4, 5.2), sbasic("#ff4a4a"), 2, 1.5, 0));
        for (const x of [14, 19, 24]) add(mesh(box(1.8, 5, 5), slam("#596270"), x, 0.5, 0));
        add(mesh(ico(1.4, 0), sbasic("#ffb0b0"), 28.5, 0.5, 0)); len = 29; break;
      }
      case "minigun": {
        add(mesh(box(16, 9, 9), slam("#33363b"), 2, 0, 0)); add(mesh(box(6, 6, 4), slam("#c9a043"), 2, -3, 6));
        const barrels = group(14, 0.5, 0);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; barrels.add(along(mesh(cyl(0.9, 0.9, 24, 5), steel2, 12, Math.cos(a) * 2.8, Math.sin(a) * 2.8))); }
        const ring = mesh(torus(3.6, 0.8), steel, 22, 0, 0); ring.rotation.y = Math.PI / 2; barrels.add(ring);
        g.add(barrels); g.userData.barrels = barrels; len = 38; break;
      }
    }
    if (tier >= 1) add(mesh(box(len * 0.45, 1, 4.4), gold, len * 0.2, 2.2, 0));
    if (tier >= 2) { add(mesh(ico(1.8, 0), sbasic("#b46bff"), len * 0.25, 3.2, 0)); g.userData.gem = true; }
    g.userData.len = len;
    return g;
  }

  // Spieler-Skins: Farben + Ausrüstungsteile (Katalog mit Preisen in game.js)
  const SKINS = {
    soldier: { torso: "#71894a", pants: "#4a5638", boots: "#1e211b", arm: "#64784a", pads: "#617346", pouch: "#5a6b3c", pack: "#4d5a3a", roll: "#7a6a48", helmet: "#7d9156", visor: "#6fe3ff", face: "#c9a07a", belt: "#2a241c", glow: "#8cff4a" },
    police: { torso: "#1e2a44", pants: "#1a2236", boots: "#0f1012", arm: "#22304e", pads: "#2a3a5c", pouch: "#141c2c", pack: "#18213a", roll: "#2a3550", helmet: "#151a24", visor: "#7fd8ff", face: "#c9a07a", belt: "#0e0f12", glow: "#3a8cff", riot: true },
    firefighter: { torso: "#c9a043", pants: "#a8862f", boots: "#1a1a1a", arm: "#c9a043", pads: "#a0802f", pouch: "#7a5a20", pack: "#b01c18", roll: "#7a5a20", helmet: "#c0201a", visor: "#ffd36a", face: "#c9a07a", belt: "#2a2a2a", glow: "#ff8a2a", stripes: "#e8f0a0", tank: true },
    hazmat: { torso: "#e8c21a", pants: "#d9b218", boots: "#222222", arm: "#e8c21a", pads: "#c9a818", pouch: "#2a2a2a", pack: "#6a6a6a", roll: "#3a3a3a", helmet: "#e8c21a", visor: "#7fd8ff", face: "#222222", belt: "#2a2a2a", glow: "#8cff4a", gasmask: true, hood: true },
    ninja: { torso: "#16161a", pants: "#121216", boots: "#0a0a0a", arm: "#16161a", pads: "#202024", pouch: "#2a0a0a", pack: "#1a1a1e", roll: "#2a0a0a", helmet: "#141418", visor: "#ff2a2a", face: "#141418", belt: "#a01818", glow: "#ff2a2a", scarf: "#c0201a", hood: true },
    cyber: { torso: "#1a1f2a", pants: "#14181f", boots: "#0c0e12", arm: "#1f2632", pads: "#2a3344", pouch: "#11151c", pack: "#1c2230", roll: "#2a3344", helmet: "#20283a", visor: "#2bf0ff", face: "#1a1f2a", belt: "#0c0e12", glow: "#2bf0ff", neon: "#2bf0ff" },
    plague: { torso: "#1a1816", pants: "#151311", boots: "#0e0c0a", arm: "#1a1816", pads: "#2a2622", pouch: "#3a2a1a", pack: "#2a2016", roll: "#3a2a1a", helmet: "#121010", visor: "#e8c64a", face: "#d8cdb8", belt: "#3a2a1a", glow: "#e8c64a", beak: true, hat: true },
    gold: { torso: "#d4a52a", pants: "#a07a1a", boots: "#3a2a0a", arm: "#c9982a", pads: "#f2c84a", pouch: "#8a6a1a", pack: "#b08a2a", roll: "#8a6a1a", helmet: "#f2c84a", visor: "#fff2b0", face: "#c9a07a", belt: "#5a3a0a", glow: "#fff2b0", shiny: true },
    // Saisonpass: Seuchenjäger – Graphit mit Giftgrün-Leuchtstreifen und Gasmaske
    hunter: { torso: "#262b30", pants: "#1c2024", boots: "#0e1012", arm: "#2a3036", pads: "#3c4a2c", pouch: "#2a331f", pack: "#20262a", roll: "#3c4a2c", helmet: "#1e2328", visor: "#8cff4a", face: "#1e2328", belt: "#0f1112", glow: "#8cff4a", neon: "#8cff4a", gasmask: true },
  };
  function buildPlayer(w) {
    const p = w.player;
    const M = buildPlayerModel(p.skin || "soldier", p.weaponId, p.tier, p.weaponId === "flame");
    scene.add(M.root);
    return M;
  }
  // v3.4 Angelegte Ausrüstung am Helden sichtbar: je Platz ein Bauteil, Seltenheit an Farbe (Stahl, Blau, Violett, Gold),
  // ab „Episch“ leuchtende Akzente, legendäre Teile mit eigener Form. gearLook = { helm: r, vest: r, … } (r = 0…3)
  let gearLook = {};
  const GEAR_TRIM = ["#8a9096", "#3a86d0", "#8a5ad8", "#e0b040"], GEAR_BASE = ["#4a4c42", "#2c3a48", "#3a2c4a", "#2e2a22"];
  const gearKey = (g) => ["helm", "vest", "gloves", "badge", "pack", "boots", "charm"].map((k) => (g[k] === undefined ? "-" : g[k])).join("");
  function addGearLook(M, r, S, head, gear) {
    const trim = (k) => tlam(GEAR_TRIM[k], "metal"), base = (k, tex = "cloth") => tlam(GEAR_BASE[k], tex), glowC = (k) => sbasic(k >= 3 ? "#ffd86a" : "#c08aff");
    const B = M.body;
    if (gear.helm !== undefined) {
      const k = gear.helm;
      if (S.hat || S.beak) head.add(mesh(cyl(0.4 * r, 0.4 * r, 0.08 * r, 14), trim(k), 0, 0.44 * r, 0)); // Hutband statt Helm
      else {
        const shell = mesh(ico(0.5 * r, 2), base(k, "metal"), -0.04 * r, 0.14 * r, 0); shell.scale.set(1.02, 0.78, 1.04); head.add(shell);
        head.add(mesh(ring(0.49 * r, 0.035 * r), trim(k), -0.04 * r, 0.1 * r, 0).rotateX(Math.PI / 2));
        if (k >= 1) for (const z of [-1, 1]) head.add(mesh(box(0.3 * r, 0.06 * r, 0.04 * r), trim(k), 0, 0.2 * r, z * 0.47 * r)); // Seitenschienen
        if (k >= 2) head.add(mesh(box(0.08 * r, 0.1 * r, 0.62 * r), glowC(k), 0.42 * r, 0.02 * r, 0)); // Visierband
        if (k >= 3) { const crest = mesh(box(0.7 * r, 0.16 * r, 0.05 * r), trim(k), -0.06 * r, 0.5 * r, 0); crest.rotation.z = 0.1; head.add(crest); }
      }
    }
    if (gear.vest !== undefined) {
      const k = gear.vest;
      B.add(mesh(box(0.14 * r, 0.72 * r, 0.82 * r), base(k), 0.37 * r, 1.58 * r, 0)); // Frontplatte
      B.add(mesh(box(0.12 * r, 0.7 * r, 0.8 * r), base(k), -0.36 * r, 1.58 * r, 0)); // Rückenplatte
      for (const y of [1.28, 1.88]) B.add(mesh(box(0.16 * r, 0.05 * r, 0.84 * r), trim(k), 0.38 * r, y * r, 0));
      for (const z of [-1, 1]) B.add(mesh(box(0.74 * r, 0.32 * r, 0.06 * r), base(k), 0, 1.5 * r, z * 0.45 * r)); // Seitenteile
      if (k >= 2) for (const z of [-1, 1]) { const sp = mesh(ico(0.3 * r, 1), trim(k), 0, 1.96 * r, z * 0.66 * r); sp.scale.set(1.05, 0.62, 1); B.add(sp); }
      if (k >= 3) B.add(mesh(cyl(0.075 * r, 0.075 * r, 0.04 * r, 10), glowC(k), 0.45 * r, 1.62 * r, 0.1 * r).rotateZ(Math.PI / 2)); // Bollwerk-Emblem
    }
    if (gear.pack !== undefined && !S.tank) {
      const k = gear.pack;
      B.add(mesh(box(0.52 * r, 1.04 * r, 0.9 * r), base(k), -0.64 * r, 1.56 * r, 0));
      B.add(mesh(box(0.56 * r, 0.24 * r, 0.94 * r), trim(k), -0.64 * r, 2.02 * r, 0)); // Deckelklappe
      B.add(mesh(cyl(0.11 * r, 0.11 * r, 0.42 * r, 8), tlam("#5a7a8a", "metal"), -0.64 * r, 1.36 * r, 0.52 * r)); // Trinkflasche
      if (k >= 2) for (const z of [-0.3, 0.3]) B.add(mesh(box(0.2 * r, 0.36 * r, 0.24 * r), base(k), -0.94 * r, 1.4 * r, z * r));
      if (k >= 3) B.add(mesh(ico(0.07 * r, 0), glowC(k), -0.92 * r, 1.98 * r, 0));
    }
    if (gear.badge !== undefined) {
      const k = gear.badge;
      B.add(mesh(box(0.04 * r, 0.12 * r, 0.12 * r), tlam(["#8a2a2a", "#2a5a9a", "#5a2a8a", "#b8202a"][k], "cloth"), 0.46 * r, 1.88 * r, -0.24 * r)); // Ordensband
      B.add(mesh(cyl(0.065 * r, 0.065 * r, 0.03 * r, 10), k >= 2 ? glowC(k) : trim(k), 0.47 * r, 1.76 * r, -0.24 * r).rotateZ(Math.PI / 2));
    }
    if (gear.charm !== undefined) {
      const k = gear.charm, ch = mesh(torus(0.08 * r, 0.025 * r, Math.PI * 1.4), k >= 2 ? glowC(k) : trim(k), 0.34 * r, 0.96 * r, 0.3 * r);
      ch.rotation.y = Math.PI / 2; B.add(ch);
      B.add(mesh(box(0.02 * r, 0.14 * r, 0.02 * r), trim(k), 0.34 * r, 1.06 * r, 0.3 * r));
    }
    if (gear.boots !== undefined) {
      const k = gear.boots;
      for (const L of M.legs) {
        L.g.add(mesh(box(0.16 * r, 0.3 * r, 0.3 * r), base(k, "leather"), 0.16 * r, -0.66 * r, 0)); // Schienbeinschutz
        L.g.add(mesh(box(0.62 * r, 0.04 * r, 0.35 * r), trim(k), 0.1 * r, -0.9 * r, 0)); // Sohlenstreifen
        if (k >= 3) L.g.add(mesh(box(0.06 * r, 0.06 * r, 0.3 * r), glowC(k), 0.36 * r, -0.82 * r, 0));
      }
    }
    if (gear.gloves !== undefined) {
      const k = gear.gloves;
      const hands = []; M.body.traverse((c) => { if (c.userData.hand) hands.push(c); });
      for (const c of hands) { // Knöchelschutz als Geschwister (Meshes mit Kindern würden beim Verschmelzen übersprungen)
        const kb = mesh(box(0.14 * r, 0.12 * r, 0.24 * r), k >= 3 ? tlam("#b8c0c8", "metal") : trim(k), c.position.x + 0.06 * r, c.position.y + 0.06 * r, c.position.z);
        c.parent.add(kb);
        if (k >= 3) { c.scale.setScalar(1.35); kb.scale.setScalar(1.3); } // Götz' eiserne Hand: Panzerhandschuh
      }
    }
  }
  function buildPlayerModel(skinId, weaponId, tier, tanks = false, gear = gearLook) {
    const r = 16, S = SKINS[skinId] || SKINS.soldier;
    const M = makeModel("player");
    // v3.2: jede Ausrüstungs-Farbe mit Oberflächen-Klasse (Stoff, Leder, Metall …); Gold-Skin glänzt metallisch
    const C = (k, tex = "cloth") => S.shiny ? smat(`gold:${S[k]}`, () => { const m = new T3.MeshLambertMaterial({ color: S[k], emissive: 0x3a2600, flatShading: true }); m.userData.tex = "metal"; return m; }) : tlam(S[k], tex);
    const torsoMat = C("torso"), pants = C("pants", "denim"), dark = C("boots", "leather");
    const strap = C("belt", "leather"), buckle = tlam("#8f969c", "metal"), stitch = tlam("#1a1c18", "leather");
    // Beine: Oberschenkel mit Beintasche, Knieschoner, Schienbein, Stiefel mit Profilsohle, Schnürung und Kappe
    for (const s of [-1, 1]) {
      const hip = group(-0.05 * r, 0.92 * r, s * 0.3 * r);
      hip.add(mesh(limb(0.21 * r, 0.26 * r), pants, 0, -0.24 * r, 0));
      hip.add(mesh(limb(0.17 * r, 0.24 * r), pants, 0, -0.64 * r, 0));
      const pad = mesh(ico(0.15 * r, 1), C("pads", "plain"), 0.13 * r, -0.48 * r, 0); pad.scale.set(0.6, 1, 0.95); hip.add(pad);
      hip.add(fine(mesh(box(0.05 * r, 0.04 * r, 0.32 * r), strap, 0.06 * r, -0.4 * r, 0)));
      hip.add(mesh(box(0.42 * r, 0.22 * r, 0.3 * r), dark, 0.08 * r, -0.82 * r, 0));
      const toe = mesh(ico(0.15 * r, 1), dark, 0.27 * r, -0.86 * r, 0); toe.scale.set(1, 0.6, 0.98); hip.add(toe);
      hip.add(mesh(box(0.6 * r, 0.06 * r, 0.33 * r), tlam("#0d0c0b", "leather"), 0.1 * r, -0.935 * r, 0));
      for (let k = 0; k < 3; k++) hip.add(fine(mesh(box(0.04 * r, 0.025 * r, 0.22 * r), stitch, 0.04 * r + k * 0.08 * r, -0.7 * r + k * 0.01 * r, 0)));
      hip.add(fine(mesh(cyl(0.18 * r, 0.18 * r, 0.06 * r, 10), dark, 0, -0.69 * r, 0)));
      M.body.add(hip); M.legs.push({ g: hip, s });
    }
    // Beintasche rechts, Holster links
    M.legs[1].g.add(mesh(box(0.16 * r, 0.3 * r, 0.12 * r), slam("#1c1d1b"), 0, -0.22 * r, 0.2 * r));
    M.legs[1].g.add(fine(mesh(box(0.17 * r, 0.04 * r, 0.13 * r), strap, 0, -0.1 * r, 0.2 * r)));
    M.legs[0].g.add(mesh(box(0.22 * r, 0.24 * r, 0.06 * r), C("pouch"), 0.02 * r, -0.26 * r, -0.21 * r));
    M.legs[0].g.add(fine(mesh(box(0.23 * r, 0.06 * r, 0.07 * r), C("pouch"), 0.02 * r, -0.13 * r, -0.215 * r)));
    // Rumpf mit Plattenträger: Platte vorn, Klettfeld, MOLLE-Schlaufen, Magazintaschen mit Klappen
    const torso = mesh(cap(0.42 * r, 0.42 * r), torsoMat, 0, 1.52 * r, 0); torso.scale.set(0.84, 1, 1.32); M.body.add(torso);
    M.body.add(mesh(cyl(0.15 * r, 0.18 * r, 0.36 * r, 10), slam(S.face), 0.05 * r, 2.06 * r, 0));
    const col2 = mesh(ring(0.25 * r, 0.07 * r), torsoMat, 0.03 * r, 1.97 * r, 0); col2.rotation.x = Math.PI / 2; col2.scale.set(1, 1.28, 1); M.body.add(col2);
    M.body.add(mesh(box(0.1 * r, 0.62 * r, 0.74 * r), C("pouch"), 0.33 * r, 1.6 * r, 0));
    M.body.add(fine(mesh(box(0.02 * r, 0.12 * r, 0.3 * r), C("pads", "plain"), 0.385 * r, 1.82 * r, 0)));
    for (let k = 0; k < 3; k++) M.body.add(fine(mesh(box(0.02 * r, 0.03 * r, 0.7 * r), stitch, 0.385 * r, 1.42 * r + k * 0.1 * r, 0)));
    for (let i = -1; i <= 1; i++) {
      M.body.add(mesh(box(0.2 * r, 0.24 * r, 0.22 * r), C("pouch"), 0.44 * r, 1.42 * r, i * 0.25 * r));
      M.body.add(fine(mesh(box(0.22 * r, 0.06 * r, 0.23 * r), C("pouch"), 0.45 * r, 1.55 * r, i * 0.25 * r)));
      M.body.add(fine(mesh(box(0.06 * r, 0.06 * r, 0.12 * r), buckle, 0.555 * r, 1.53 * r, i * 0.25 * r)));
    }
    for (const z of [-1, 1]) M.body.add(mesh(box(0.7 * r, 0.06 * r, 0.12 * r), strap, -0.02 * r, 1.98 * r, z * 0.38 * r)); // Schultergurte
    M.body.add(mesh(ico(0.07 * r, 0), sbasic(S.glow), 0.05 * r, 2.0 * r, -0.62 * r));
    if (tanks) {
      for (const s of [-1, 1]) M.body.add(mesh(cyl(0.2 * r, 0.2 * r, 0.9 * r, 10), tlam("#a3312a", "metal"), -0.5 * r, 1.6 * r, s * 0.24 * r));
      for (const s of [-1, 1]) M.body.add(fine(mesh(cyl(0.08 * r, 0.08 * r, 0.12 * r, 8), buckle, -0.5 * r, 2.1 * r, s * 0.24 * r)));
      const hose = mesh(torus(0.3 * r, 0.04 * r, Math.PI), stitch, -0.25 * r, 1.12 * r, 0.3 * r); hose.rotation.y = Math.PI / 2; M.body.add(hose);
    } else if (S.tank) {
      M.body.add(mesh(cyl(0.26 * r, 0.26 * r, 1.0 * r, 12), C("pack", "metal"), -0.52 * r, 1.6 * r, 0));
      M.body.add(mesh(cyl(0.1 * r, 0.1 * r, 0.2 * r, 8), tlam("#9aa3ab", "metal"), -0.52 * r, 2.15 * r, 0));
      for (const y of [1.25, 1.95]) { const bd = fine(mesh(ring(0.27 * r, 0.025 * r), strap, -0.52 * r, y * r, 0)); bd.rotation.x = Math.PI / 2; M.body.add(bd); }
    } else {
      M.body.add(mesh(box(0.42 * r, 0.9 * r, 0.8 * r), C("pack"), -0.52 * r, 1.6 * r, 0));
      M.body.add(mesh(box(0.12 * r, 0.42 * r, 0.6 * r), C("pack"), -0.78 * r, 1.48 * r, 0));
      M.body.add(fine(mesh(box(0.14 * r, 0.1 * r, 0.62 * r), C("pouch"), -0.79 * r, 1.72 * r, 0)));
      for (const z of [-0.3, 0.3]) M.body.add(fine(mesh(box(0.44 * r, 0.05 * r, 0.06 * r), strap, -0.52 * r, 1.25 * r, z * r)));
      const roll = mesh(cyl(0.16 * r, 0.16 * r, 0.82 * r, 10), C("roll"), -0.55 * r, 2.12 * r, 0); roll.rotation.x = Math.PI / 2; M.body.add(roll);
      for (const z of [-0.25, 0.25]) { const rs = fine(mesh(ring(0.17 * r, 0.025 * r), strap, -0.55 * r, 2.12 * r, z * r)); M.body.add(rs); }
    }
    for (const s of [-1, 1]) {
      const sp = mesh(ico(0.26 * r, 1), C("pads", "plain"), 0, 1.9 * r, s * 0.66 * r); sp.scale.set(1, 0.8, 1); M.body.add(sp);
      M.body.add(fine(mesh(box(0.2 * r, 0.04 * r, 0.04 * r), buckle, 0.06 * r, 2.08 * r, s * 0.66 * r)));
    }
    // Ausrüstung: Gürtel mit Taschen, Knieschoner, Holster, Funkantenne
    const belt = mesh(cyl(0.4 * r, 0.4 * r, 0.14 * r, 14), strap, 0, 1.12 * r, 0); belt.scale.set(0.84, 1, 1.3); M.body.add(belt);
    M.body.add(mesh(box(0.12 * r, 0.12 * r, 0.14 * r), tlam("#c9a043", "metal"), 0.33 * r, 1.12 * r, 0));
    for (const z of [-0.36, 0.36]) {
      M.body.add(mesh(box(0.2 * r, 0.22 * r, 0.18 * r), C("pouch"), 0.12 * r, 1.08 * r, z * r));
      M.body.add(fine(mesh(box(0.21 * r, 0.05 * r, 0.19 * r), C("pouch"), 0.12 * r, 1.2 * r, z * r)));
    }
    if (!tanks && !S.tank && !S.hood) {
      M.body.add(mesh(box(0.18 * r, 0.28 * r, 0.12 * r), slam("#1c1d1b"), -0.3 * r, 1.88 * r, -0.4 * r)); // Funkgerät
      const ant = mesh(cyl(0.02 * r, 0.02 * r, 0.9 * r, 4), slam("#111111"), -0.66 * r, 2.4 * r, -0.26 * r); ant.rotation.z = 0.25; M.body.add(ant);
      M.body.add(mesh(ico(0.04 * r, 0), sbasic("#ff3a2a"), -0.77 * r, 2.84 * r, -0.26 * r));
    }
    // Skin-Details am Körper
    if (S.stripes) for (const y of [1.3, 1.75]) M.body.add(mesh(box(0.74 * r, 0.07 * r, 1.14 * r), sbasic(S.stripes), 0, y * r, 0));
    if (S.neon) {
      for (const z of [-0.3, 0.3]) M.body.add(mesh(box(0.72 * r, 0.05 * r, 0.05 * r), sbasic(S.neon), 0.02 * r, 1.52 * r, z * r * 1.5));
      M.body.add(mesh(box(0.05 * r, 0.6 * r, 0.05 * r), sbasic(S.neon), 0.36 * r, 1.52 * r, 0));
    }
    if (S.scarf) {
      const sc2 = mesh(torus(0.34 * r, 0.09 * r), tlam(S.scarf, "cloth"), 0.04 * r, 2.06 * r, 0); sc2.rotation.x = Math.PI / 2; M.body.add(sc2);
      for (const z of [-0.08, 0.08]) { const tail = mesh(box(0.06 * r, 0.6 * r, 0.12 * r), tlam(S.scarf, "cloth"), -0.42 * r, 1.82 * r, z * r); tail.rotation.z = 0.6; M.body.add(tail); }
    }
    // Arme zur Waffe
    // v3.2: zweiteilige Arme mit Ellbogen (einfache IK: Ellbogen nach außen-unten), Ellbogenschoner, Handschuhe mit Fingern
    const grip = new T3.Vector3(0.72 * r, 1.45 * r, 0.12 * r);
    const glove = tlam("#1f1f1f", "leather"), Y = new T3.Vector3(0, 1, 0);
    const seg = (a, b, rad, mat) => { const d = b.clone().sub(a), m = mesh(limb(rad, Math.max(0.05 * r, d.length() - rad * 1.2)), mat); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(Y, d.normalize()); M.body.add(m); };
    for (const [s, tgt] of [[1, grip], [-1, new T3.Vector3(1.15 * r, 1.5 * r, 0.05 * r)]]) {
      const sh = new T3.Vector3(0.02 * r, 1.86 * r, s * 0.64 * r);
      const el = sh.clone().add(tgt).multiplyScalar(0.5).add(new T3.Vector3(-0.08 * r, -0.2 * r, s * 0.16 * r));
      seg(sh, el, 0.145 * r, C("arm"));
      seg(el, tgt, 0.125 * r, C("arm"));
      const ep = mesh(ico(0.14 * r, 1), C("pads", "plain"), el.x - 0.03 * r, el.y - 0.02 * r, el.z); ep.scale.set(0.8, 0.8, 0.9); M.body.add(ep);
      M.body.add(fine(mesh(ico(0.13 * r, 0), C("arm"), sh.x, sh.y - 0.05 * r, sh.z)));
      const wr = tgt.clone().lerp(el, 0.18);
      M.body.add(fine(mesh(ico(0.13 * r, 0), glove, wr.x, wr.y, wr.z)));
      const hand = mesh(ico(0.15 * r, 1), glove, tgt.x, tgt.y, tgt.z); hand.userData.hand = true; M.body.add(hand);
      for (let k = 0; k < 4; k++) { const fg = fine(mesh(box(0.15 * r, 0.05 * r, 0.048 * r), glove, tgt.x + 0.08 * r, tgt.y - 0.06 * r, tgt.z + (k - 1.5) * 0.055 * r)); fg.rotation.z = -1.0; M.body.add(fg); }
    }
    // Kopf: Helm/Kapuze/Hut je Skin
    const head = group(0.08 * r, 2.4 * r, 0);
    const faceM = S.face === S.helmet || /^#1|^#2/.test(S.face) ? tlam(S.face, "cloth") : tlam(S.face, "skin");
    head.add(mesh(ico(0.36 * r, 2), faceM));
    // v3.2 Gesicht: Nase, Kinn, Ohren; Kinnriemen am Helm
    if (!S.hood && !S.beak) {
      const ns = fine(mesh(cone(0.055 * r, 0.14 * r, 4), faceM, 0.36 * r, -0.08 * r, 0)); ns.rotation.z = -Math.PI / 2 + 0.5; head.add(ns);
      const chin = mesh(box(0.2 * r, 0.12 * r, 0.3 * r), faceM, 0.22 * r, -0.26 * r, 0); chin.rotation.z = -0.2; head.add(chin);
      for (const z of [-1, 1]) { const ear = mesh(ico(0.08 * r, 1), faceM, 0, -0.04 * r, z * 0.35 * r); ear.scale.set(0.6, 1, 0.4); head.add(ear); }
      if (!S.hat && !S.gasmask) for (const z of [-1, 1]) { const cs = fine(mesh(box(0.03 * r, 0.32 * r, 0.03 * r), strap, 0.06 * r, -0.16 * r, z * 0.33 * r)); cs.rotation.x = -z * 0.25; head.add(cs); }
    }
    if (S.hood) {
      const hood = mesh(ico(0.48 * r, 2), C("helmet"), -0.05 * r, 0.04 * r, 0); hood.scale.set(1.02, 1.04, 1); head.add(hood);
      head.add(mesh(box(0.1 * r, S.gasmask ? 0.26 * r : 0.1 * r, 0.56 * r), sbasic(S.visor), 0.4 * r, S.gasmask ? 0.06 * r : 0.04 * r, 0));
    } else if (S.hat) {
      head.add(mesh(cyl(0.62 * r, 0.62 * r, 0.05 * r, 18), C("helmet", "leather"), 0, 0.32 * r, 0));
      head.add(mesh(cyl(0.34 * r, 0.38 * r, 0.32 * r, 14), C("helmet", "leather"), 0, 0.5 * r, 0));
      head.add(fine(mesh(cyl(0.385 * r, 0.385 * r, 0.06 * r, 14), strap, 0, 0.37 * r, 0)));
    } else {
      const helmet = mesh(ico(0.46 * r, 2), C("helmet", S.riot ? "plain" : "cloth"), -0.03 * r, 0.1 * r, 0); helmet.scale.set(1, 0.8, 1); head.add(helmet);
      head.add(fine(mesh(ring(0.45 * r, 0.03 * r), strap, -0.03 * r, 0.12 * r, 0).rotateX(Math.PI / 2))); // Helmband
      if (!S.riot && !S.tank) { // Nachtsichthalterung + Schutzbrille auf dem Helm
        head.add(mesh(box(0.1 * r, 0.12 * r, 0.16 * r), tlam("#24272b", "metal"), 0.36 * r, 0.32 * r, 0));
        for (const z of [-1, 1]) { const gl = fine(mesh(cyl(0.07 * r, 0.07 * r, 0.06 * r, 10), tlam("#2a2e33", "metal"), 0.32 * r, 0.4 * r, z * 0.12 * r)); gl.rotation.z = Math.PI / 2; head.add(gl); head.add(fine(mesh(cyl(0.05 * r, 0.05 * r, 0.02 * r, 10), sbasic(S.visor), 0.355 * r, 0.4 * r, z * 0.12 * r).rotateZ(Math.PI / 2))); }
      }
      if (S.riot) head.add(mesh(box(0.06 * r, 0.36 * r, 0.7 * r), new T3.MeshBasicMaterial({ color: S.visor, transparent: true, opacity: 0.55 }), 0.44 * r, -0.04 * r, 0));
      else head.add(mesh(box(0.1 * r, 0.16 * r, 0.6 * r), sbasic(S.visor), 0.36 * r, -0.02 * r, 0));
      if (S.tank) head.add(mesh(box(0.3 * r, 0.04 * r, 0.7 * r), C("helmet"), -0.32 * r, -0.04 * r, 0));
    }
    if (S.gasmask) {
      const sn = mesh(cyl(0.12 * r, 0.15 * r, 0.22 * r, 8), slam("#222222"), 0.42 * r, -0.2 * r, 0); sn.rotation.z = Math.PI / 2; head.add(sn);
      for (const s of [-1, 1]) { const f = mesh(cyl(0.09 * r, 0.09 * r, 0.16 * r, 8), slam("#3a3a3a"), 0.3 * r, -0.26 * r, s * 0.24 * r); f.rotation.x = s * 0.9; head.add(f); }
    }
    if (S.beak) {
      const bk = mesh(cone(0.14 * r, 0.6 * r, 6), slam(S.face), 0.62 * r, -0.12 * r, 0); bk.rotation.z = -Math.PI / 2 - 0.25; head.add(bk);
      for (const s of [-1, 1]) head.add(mesh(ico(0.07 * r, 0), sbasic(S.visor), 0.32 * r, 0.06 * r, s * 0.14 * r));
    }
    M.body.add(head);
    M.extra.head = head;
    // Waffe
    const wpn = weaponModel(weaponId, tier);
    wpn.position.copy(grip);
    M.body.add(wpn);
    M.extra.weapon = wpn;
    M.extra.gripX = grip.x;
    M.weaponId = weaponId;
    M.tier = tier;
    M.skin = skinId;
    addGearLook(M, r, S, head, gear || {});
    M.gearKey = gearKey(gear || {});
    realismRig(M, r, { head: 0.8, armLen: 1 }); // v3.3: Arme führen zur Waffe – deren Länge stimmt schon
    M.height = 2.75 * r;
    bake(M);
    cast(M.root);
    return M;
  }

  // Drehende 3D-Vorschau eines Skins im Shop (eigener kleiner Renderer)
  let pv3 = null;
  function preview(canvas, skinId, weaponId, tier) {
    if (!ready) return false;
    if (!pv3 || pv3.canvas !== canvas) {
      let r;
      try { r = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return false; }
      r.toneMapping = T3.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
      const sc = new T3.Scene();
      sc.add(new T3.HemisphereLight(0xcfe0ff, 0x302820, 2.4));
      const key = new T3.DirectionalLight(0xffffff, 2.8); key.position.set(90, 140, 120); sc.add(key);
      const rim = new T3.DirectionalLight(0x8cff4a, 2.6); rim.position.set(-140, 80, -90); sc.add(rim);
      const ground = mesh(cyl(34, 34, 2, 32), new T3.MeshLambertMaterial({ color: 0x1a2a1e }), 0, -1, 0); sc.add(ground);
      const ring = mesh(torus(33, 1.2, TAU), sbasic("#8cff4a"), 0, 0.2, 0); ring.rotation.x = Math.PI / 2; sc.add(ring);
      const cam = new T3.PerspectiveCamera(30, 1, 10, 2000);
      cam.position.set(120, 62, 0); cam.lookAt(0, 24, 0);
      pv3 = { r, sc, cam, canvas, M: null, key: "", raf: 0, last: 0 };
    }
    const k = `${skinId}:${weaponId}:${tier}:${gearKey(gearLook)}`;
    if (pv3.key !== k) {
      if (pv3.M) { pv3.sc.remove(pv3.M.root); disposeTree(pv3.M.root); }
      pv3.M = buildPlayerModel(skinId, weaponId, tier, weaponId === "flame");
      pv3.M.root.position.set(-4, 0, 0);
      pv3.sc.add(pv3.M.root);
      pv3.key = k;
    }
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200;
    pv3.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    pv3.r.setSize(w, h, false);
    pv3.cam.aspect = w / h; pv3.cam.updateProjectionMatrix();
    cancelAnimationFrame(pv3.raf);
    const loop = (now) => {
      pv3.raf = requestAnimationFrame(loop);
      if (pv3.last && now - pv3.last < 30) return; // ~30 Bilder/s reichen für die langsame Drehung
      const dt = Math.min(0.05, (now - (pv3.last || now)) / 1000); pv3.last = now;
      pv3.M.root.rotation.y += dt * 0.9;
      pv3.r.render(pv3.sc, pv3.cam);
    };
    pv3.raf = requestAnimationFrame(loop);
    return true;
  }
  function stopPreview() { if (pv3) { cancelAnimationFrame(pv3.raf); pv3.last = 0; } }

  // Einzelbild-Renderer für Store-Grafiken (App-Symbol, Promo-Artwork):
  // dieselben Modelle wie im Spiel, aber freie Kamera, Posen und Filmlicht
  function showcase(canvas, spec) {
    const r = new T3.WebGLRenderer({ canvas, antialias: true, alpha: !!spec.alpha, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(spec.w, spec.h, false);
    r.toneMapping = T3.ACESFilmicToneMapping;
    r.toneMappingExposure = spec.exposure || 1.2;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T3.PCFShadowMap;
    if (!spec.alpha) r.setClearColor(spec.bg ?? 0x070b09, 1); else r.setClearColor(0x000000, 0);
    const sc = new T3.Scene();
    if (spec.fog) sc.fog = new T3.Fog(spec.fog[0], spec.fog[1], spec.fog[2]);
    sc.add(new T3.HemisphereLight(0x46586e, 0x120e0a, spec.hemi ?? 1.4));
    const dl = (c, i, x, y, z, shadow) => { const l = new T3.DirectionalLight(c, i); l.position.set(x, y, z); if (shadow) { l.castShadow = true; l.shadow.mapSize.set(2048, 2048); Object.assign(l.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 3000 }); l.shadow.bias = -0.0005; } sc.add(l); return l; };
    for (const L of spec.lights || []) dl(L[0], L[1], L[2], L[3], L[4], L[5]);
    for (const P of spec.points || []) { const l = new T3.PointLight(P[0], P[1], P[2], 0); l.position.set(P[3], P[4], P[5]); sc.add(l); }
    if (spec.floor) {
      const t = new T3.CanvasTexture(spec.floor); t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 8;
      const n = new T3.CanvasTexture(normalCanvas(spec.floor, 2.4, 1024));
      const f = mesh(new T3.PlaneGeometry(spec.floorSize[0], spec.floorSize[1]), new T3.MeshPhongMaterial({ map: t, normalMap: n, color: 0xb4b4b4, specular: 0x4a5058, shininess: 60, specularMap: spec.floor.gloss ? new T3.CanvasTexture(spec.floor.gloss) : null }), 0, 0, 0);
      f.rotation.x = -Math.PI / 2; f.receiveShadow = true; sc.add(f);
    }
    // Blutlachen: ein paar überlappende Scheiben ergeben eine unregelmäßige Form
    const poolMat = new T3.MeshBasicMaterial({ color: 0x3a0406, transparent: true, opacity: 0.88, depthWrite: false });
    for (const P of spec.pools || []) {
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4 + P.x * 0.01, d = i ? P.r * 0.55 : 0, rr = P.r * (i ? 0.5 + ((i * 37) % 10) / 25 : 0.85);
        sc.add(mesh(cyl(rr, rr, 0.2, 20), poolMat, P.x + Math.cos(a) * d, 0.4 + i * 0.01, P.z + Math.sin(a) * d * 0.7));
      }
    }
    const place = (M, o) => {
      M.root.position.set(o.x || 0, o.y || 0, o.z || 0);
      // fall/roll wie poseCorpse: liegende Leichen im Bild
      M.root.rotation.set(o.roll || 0, o.rot || 0, o.fall || 0);
      M.root.scale.setScalar(o.scale || 1);
      for (const A of M.arms) A.g.rotation.z = o.reach ?? 0.5;
      M.legs.forEach((L, i) => { if (!L.spider) L.g.rotation.z = (i % 2 ? 1 : -1) * (o.stride ?? 0.3); });
      if (o.lean !== undefined) M.body.rotation.z = o.lean;
      if (o.glow) for (const m of M.mats) m.emissive.set(o.glow);
      if (o.dark) for (const m of M.mats) m.color.multiplyScalar(o.dark);
      if (o.headless && M.extra.head) M.extra.head.visible = false;
      // Nahaufnahmen: Cartoon-Umrisse wären viel zu dick
      if (spec.noOutline) M.root.traverse((c) => { if (c.userData.outline) c.visible = false; });
      sc.add(M.root);
      return M;
    };
    if (spec.hero) { const h = spec.hero, M = buildPlayerModel(h.skin || "soldier", h.weapon || "shotgun", h.tier ?? 1); place(M, { ...h, reach: undefined }); M.root.traverse((c) => { if (c.isMesh && !c.userData.outline) c.castShadow = true; }); }
    for (const z of spec.zombies || []) {
      const pal = PAL[z.type] || PAL.walker, P = pal[(z.variant || 0) % pal.length];
      const M = (builders[z.type] || ((rr, pp) => buildHumanoid(z.type, rr, pp)))(z.r || 15, P);
      bake(M); cast(M.root);
      place(M, z);
    }
    // Leuchtpunkte (Mündungsfeuer, Augen, Glut) als additive Billboards zur Kamera
    const cam = new T3.PerspectiveCamera(spec.cam.fov || 35, spec.w / spec.h, 1, 6000);
    cam.position.set(...spec.cam.pos); cam.lookAt(...spec.cam.look);
    if (spec.cam.offset) cam.setViewOffset(spec.w, spec.h, spec.cam.offset[0], spec.cam.offset[1], spec.w, spec.h);
    cam.updateMatrixWorld();
    const glowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,255,255,0.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    for (const G of spec.glows || []) {
      const m = mesh(new T3.PlaneGeometry(G.size, G.size), new T3.MeshBasicMaterial({ map: glowTex, color: G.color, transparent: true, opacity: G.opacity ?? 1, blending: T3.AdditiveBlending, depthWrite: false, depthTest: !!G.depth, fog: false }), G.x, G.y, G.z);
      m.quaternion.copy(cam.quaternion); m.renderOrder = 50; sc.add(m);
    }
    r.render(sc, cam);
    // Bild sichern, dann alles freigeben – Browser erlauben nur ~16 WebGL-Kontexte
    const url = canvas.toDataURL("image/png");
    disposeTree(sc);
    r.dispose(); r.forceContextLoss();
    return url;
  }

  // ------------------------------------------------------------------
  // Instanzen: Schatten, Münzen, Projektile
  // ------------------------------------------------------------------
  let barrelIM, anchorIM, boxIM, ballIM, paperIM, candyIM, blobShadows, coinsIM, acidIM, pinkIM, grenadeIM, boltIM, chunkIM, casingIM, healIM, healCrossIM, foodIM, pfandIM, headIM, limbIM, rocketIM, discIM, pillar, doorBeam, lootIM, lootBandIM, birdIM, wingIM, puGemIM, puRingIM;
  const booms = [];
  const dummy = new T3.Object3D();
  function setupInstanced() {
    const shadowTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(0,0,0,0.7)"); gr.addColorStop(0.6, "rgba(0,0,0,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    const sg = new T3.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    blobShadows = new T3.InstancedMesh(sg, new T3.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), 160);
    blobShadows.renderOrder = 5;
    const cg = new T3.CylinderGeometry(6, 6, 1.8, 14);
    coinsIM = new T3.InstancedMesh(cg, new T3.MeshLambertMaterial({ color: 0xffc94a, emissive: 0x5a3a00 }), 300);
    acidIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 1), new T3.MeshBasicMaterial({ color: 0xb7ff4a }), 200);
    pinkIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 1), new T3.MeshBasicMaterial({ color: 0xff6ad5 }), 200);
    grenadeIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(5.5, 1), new T3.MeshLambertMaterial({ color: 0x4d5a2a, flatShading: true }), 60);
    const bg = new T3.BoxGeometry(24, 1.6, 1.6);
    boltIM = new T3.InstancedMesh(bg, new T3.MeshLambertMaterial({ color: 0xb08a58 }), 120);
    // Fleischbrocken & Trümmer (3D, rotierend) und Messinghülsen
    chunkIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 0), new T3.MeshLambertMaterial({ flatShading: true }), 400);
    chunkIM.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    casingIM = new T3.InstancedMesh(new T3.CylinderGeometry(0.9, 0.9, 3.6, 6), new T3.MeshLambertMaterial({ color: 0xd9a84a, emissive: 0x2a1a00 }), 240);
    healIM = new T3.InstancedMesh(new T3.BoxGeometry(14, 9, 11), new T3.MeshLambertMaterial({ color: 0xf2f2ec, emissive: 0x303030 }), 20);
    // rotes Kreuz: zwei Balken als ein Mesh
    const crossGeo = new T3.BoxGeometry(10, 9.6, 3), cross2 = new T3.BoxGeometry(3, 9.6, 8);
    const cpos = [...crossGeo.toNonIndexed().attributes.position.array, ...cross2.toNonIndexed().attributes.position.array];
    const cg2 = new T3.BufferGeometry(); cg2.setAttribute("position", new T3.BufferAttribute(new Float32Array(cpos), 3)); cg2.computeVertexNormals();
    healCrossIM = new T3.InstancedMesh(cg2, new T3.MeshBasicMaterial({ color: 0xff3a3a }), 20);
    // Brezel (Essen aus Marktbuden) und grüne Pfandflasche
    foodIM = new T3.InstancedMesh(new T3.TorusGeometry(6.5, 2.4, 6, 14), new T3.MeshLambertMaterial({ color: 0xa8642a, emissive: 0x2a1404 }), 20);
    pfandIM = new T3.InstancedMesh(new T3.CylinderGeometry(2.4, 2.4, 10, 8), new T3.MeshLambertMaterial({ color: 0x2f8a3a, emissive: 0x0a2a10 }), 40);
    // v3.3 Beutekiste: Holzkiste mit Querstreben, Band in der Seltenheitsfarbe
    const crateTex = tex("lootcrate", 64, 64, (g) => {
      g.fillStyle = "#7a4c24"; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#86562a" : "#704420"; g.fillRect(0, i * 16, 64, 15); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, i * 16 + 15, 64, 1); }
      g.strokeStyle = "#4a2c12"; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
      g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 58); g.moveTo(58, 6); g.lineTo(6, 58); g.stroke();
      g.fillStyle = "#c9b48a"; for (const [x, y] of [[6, 6], [58, 6], [6, 58], [58, 58]]) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
    });
    lootIM = new T3.InstancedMesh(new T3.BoxGeometry(15, 12, 13), new T3.MeshLambertMaterial({ map: crateTex, emissive: 0x1a0e04 }), 12);
    lootBandIM = new T3.InstancedMesh(new T3.BoxGeometry(15.6, 2.6, 13.6), new T3.MeshBasicMaterial({ color: 0xffffff }), 12);
    lootBandIM.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    lootIM.castShadow = true;
    // v3.7 Power-up: facettierter Kristall (Grundfarbe je Instanz) mit hellem, ungeschattetem Ring
    const gemGeo = new T3.IcosahedronGeometry(7, 0); gemGeo.scale(1, 1.5, 1);
    puGemIM = new T3.InstancedMesh(gemGeo, new T3.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a2a2a, flatShading: true }), 4);
    puRingIM = new T3.InstancedMesh(new T3.TorusGeometry(13, 1.1, 5, 28), new T3.MeshBasicMaterial({ color: 0xffffff }), 4);
    puGemIM.setColorAt(0, tmpColor.setRGB(1, 1, 1)); puRingIM.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    puGemIM.castShadow = true;
    // v3.4 Krähen: Körper (Rumpf, Kopf, Schnabel, Schwanz als ein Mesh) und V-förmiges Flügelpaar – der Flügelschlag
    // entsteht über die Höhen-Skalierung der Instanz (positiv = V nach oben, negativ = nach unten)
    const mergeGeo = (parts) => { const pos = []; for (const g0 of parts) pos.push(...(g0.index ? g0.toNonIndexed() : g0).attributes.position.array); const g1 = new T3.BufferGeometry(); g1.setAttribute("position", new T3.BufferAttribute(new Float32Array(pos), 3)); g1.computeVertexNormals(); return g1; };
    const bBody = new T3.IcosahedronGeometry(1, 1); bBody.scale(5.5, 3, 3);
    const bHead = new T3.IcosahedronGeometry(2.2, 0); bHead.translate(5.5, 1.6, 0);
    const bBeak = new T3.ConeGeometry(0.9, 3, 4); bBeak.rotateZ(-Math.PI / 2); bBeak.translate(8.5, 1.4, 0);
    const bTail = new T3.BoxGeometry(4, 0.6, 3); bTail.translate(-6.5, 0.4, 0);
    birdIM = new T3.InstancedMesh(mergeGeo([bBody, bHead, bBeak, bTail]), new T3.MeshLambertMaterial({ color: 0x1a1c24, emissive: 0x0a0b12 }), 40);
    const wl = new T3.BoxGeometry(5, 0.5, 10); wl.translate(0, 0, 5); wl.rotateX(-0.45);
    const wr = new T3.BoxGeometry(5, 0.5, 10); wr.translate(0, 0, -5); wr.rotateX(0.45);
    wingIM = new T3.InstancedMesh(mergeGeo([wl, wr]), new T3.MeshLambertMaterial({ color: 0x101012, side: T3.DoubleSide }), 40);
    for (const im of [birdIM, wingIM]) { im.castShadow = true; }
    // Rakete (Körper + rote Spitze als ein Mesh) und Sägeblatt
    const rb = new T3.CylinderGeometry(2.6, 2.6, 16, 8).toNonIndexed(); rb.rotateZ(-Math.PI / 2);
    const rt = new T3.ConeGeometry(2.6, 6, 8).toNonIndexed(); rt.rotateZ(-Math.PI / 2); rt.translate(11, 0, 0);
    const rocketGeo = new T3.BufferGeometry();
    rocketGeo.setAttribute("position", new T3.BufferAttribute(new Float32Array([...rb.attributes.position.array, ...rt.attributes.position.array]), 3));
    const rcol = []; for (let i = 0; i < rb.attributes.position.count; i++) rcol.push(0.75, 0.77, 0.8); for (let i = 0; i < rt.attributes.position.count; i++) rcol.push(0.8, 0.12, 0.1);
    rocketGeo.setAttribute("color", new T3.BufferAttribute(new Float32Array(rcol), 3)); rocketGeo.computeVertexNormals();
    rocketIM = new T3.InstancedMesh(rocketGeo, new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 40);
    discIM = new T3.InstancedMesh(new T3.CylinderGeometry(9, 9, 1.4, 16), new T3.MeshLambertMaterial({ color: 0xd8dee4, emissive: 0x303438, flatShading: true }), 60);
    // v2.0: Fußball (Ultra), Formular (Beamter), Kamelle (Jeck)
    const ballTex = tex("ball", 64, 32, (g) => {
      g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#151515";
      for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) { const cx = x * 12.8 + (y % 2) * 6.4 + 3, cy = 5 + y * 11; g.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4); } g.closePath(); g.fill(); }
    });
    ballIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 2), new T3.MeshLambertMaterial({ map: ballTex }), 40);
    paperIM = new T3.InstancedMesh(new T3.BoxGeometry(12, 0.5, 15), new T3.MeshLambertMaterial({ color: 0xf2eee0, emissive: 0x2a2a28 }), 90);
    candyIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 0), new T3.MeshLambertMaterial({ flatShading: true, emissive: 0x202020 }), 150);
    candyIM.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    for (const im of [ballIM, paperIM, candyIM]) im.castShadow = true;
    // v2.1: rollendes Bierfass, Anker (Schaft + Querstock + Flunken als ein Mesh), Pakete/Geschenke
    const bg2 = new T3.CylinderGeometry(1, 1, 1.6, 12); bg2.rotateX(Math.PI / 2);
    barrelIM = new T3.InstancedMesh(bg2, new T3.MeshLambertMaterial({ color: 0x7a4e2a, flatShading: true }), 30);
    const ap = [];
    for (const g0 of [new T3.BoxGeometry(2.4, 22, 2.4).translate(0, 2, 0), new T3.BoxGeometry(14, 2.4, 2.4).translate(0, 10, 0), new T3.TorusGeometry(8, 1.4, 4, 10, Math.PI).rotateZ(Math.PI).translate(0, -4, 0)]) ap.push(...g0.toNonIndexed().attributes.position.array);
    const ag = new T3.BufferGeometry(); ag.setAttribute("position", new T3.BufferAttribute(new Float32Array(ap), 3)); ag.computeVertexNormals(); ag.rotateX(-Math.PI / 2);
    anchorIM = new T3.InstancedMesh(ag, new T3.MeshLambertMaterial({ color: 0x9aa3ad, emissive: 0x202428, flatShading: true }), 12);
    boxIM = new T3.InstancedMesh(new T3.BoxGeometry(1, 1, 1), new T3.MeshLambertMaterial({ flatShading: true }), 60);
    boxIM.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    for (const im of [barrelIM, anchorIM, boxIM]) { im.castShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); }
    for (const im of [ballIM, paperIM, candyIM, blobShadows, coinsIM, acidIM, pinkIM, grenadeIM, boltIM, chunkIM, casingIM, healIM, healCrossIM, foodIM, pfandIM, rocketIM, discIM, lootIM, lootBandIM, birdIM, wingIM, puGemIM, puRingIM]) { im.frustumCulled = false; im.count = 0; scene.add(im); }
    healIM.castShadow = true;
    // abgetrennte Köpfe und Gliedmaßen
    headIM = new T3.InstancedMesh(new T3.IcosahedronGeometry(1, 1), new T3.MeshLambertMaterial({ flatShading: true }), 100);
    limbIM = new T3.InstancedMesh(new T3.CapsuleGeometry(0.5, 1.6, 2, 6), new T3.MeshLambertMaterial({ flatShading: true }), 100);
    for (const im of [headIM, limbIM]) { im.setColorAt(0, tmpColor.setRGB(1, 1, 1)); im.frustumCulled = false; im.count = 0; im.castShadow = true; scene.add(im); }
    coinsIM.castShadow = true;
    chunkIM.castShadow = true;
    // Explosionen: Feuerball (additiv), heißer Kern, aufsteigender Rauchpilz
    // knubbelige Kugel: Verformung hängt nur von der Position ab → Oberfläche bleibt geschlossen
    const ballGeo = new T3.IcosahedronGeometry(1, 2), bp = ballGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), f = 1 + 0.22 * Math.sin(x * 5.1 + 1) * Math.sin(y * 4.3 + 2) * Math.sin(z * 5.7 + 0.5);
      bp.setXYZ(i, x * f, y * f, z * f);
    }
    ballGeo.computeVertexNormals();
    for (let i = 0; i < 6; i++) {
      const add = (c) => new T3.MeshBasicMaterial({ color: c, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, fog: false });
      const fire = new T3.Mesh(ballGeo, add(0xff7a20)), core = new T3.Mesh(ballGeo, add(0xfff2c0));
      const smoke = new T3.Mesh(ballGeo, new T3.MeshLambertMaterial({ color: 0x2a2826, transparent: true, depthWrite: false, flatShading: true }));
      for (const m of [fire, core, smoke]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
      fire.renderOrder = 27; core.renderOrder = 28; smoke.renderOrder = 22;
      booms.push({ fire, core, smoke, spin: Math.random() * TAU });
    }
    // Lichtsäule (Level-up) und Lichtvorhang an der offenen Tür
    const beamTex = canvasTex(4, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#000"); gr.addColorStop(0.55, "#777"); gr.addColorStop(0.92, "#fff"); gr.addColorStop(1, "#fff"); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); });
    const pillarGeo = new T3.CylinderGeometry(1, 1, 1, 28, 1, true); pillarGeo.translate(0, 0.5, 0);
    const pmat = (c) => new T3.MeshBasicMaterial({ map: beamTex, color: c, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false });
    pillar = new T3.Mesh(pillarGeo, pmat(0xffe27a));
    doorBeam = new T3.Mesh(pillarGeo, pmat(0x8cff4a));
    for (const m of [pillar, doorBeam]) { m.visible = false; m.frustumCulled = false; m.renderOrder = 29; scene.add(m); }
  }
  function inst(im, i, x, y, z, ry = 0, rx = 0, sx = 1, sy = 1, sz = 1) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }

  // ------------------------------------------------------------------
  // Pro Frame
  // ------------------------------------------------------------------
  const models = new Map(); // Gegner → Modell
  const dying = new Map(); // Leiche → Modell
  const sawMeshes = [], droneMeshes = [];
  let lastFloorUpload = 0;
  let frame = 0;

  function syncEnemies(w, t, dt) {
    const seen = new Set();
    for (const e of w.enemies) {
      let M = models.get(e);
      if (M && (M.evo || 0) !== (builders[e.type] ? 0 : e.evo || 0)) { releaseModel(M); models.delete(e); M = null; } // v3.7 mutiert: neues Modell
      if (!M) { M = acquireModel(e.type, e.r, e.variant, e.evo || 0); models.set(e, M); }
      seen.add(e);
      const sc = e.scale * (e.def.boss ? BOSS_SCALE : CHAR_SCALE);
      let y = 0, s = sc;
      if (e.spawnT > 0) { const k = Math.max(0, 1 - e.spawnT / e.spawnMax); y = -(1 - k) * M.height * 0.9; s = sc * (0.6 + 0.4 * k); }
      let x = e.x, z = e.y;
      if (e.mode === "wind" || e.mode === "zap") { x += (Math.random() - 0.5) * 3; z += (Math.random() - 0.5) * 3; }
      y += e.jumpZ || 0;
      M.root.position.set(x, y, z);
      M.root.rotation.set(0, -e.face, 0);
      const near = (e.x - w.player.x) ** 2 + (e.y - w.player.y) ** 2 < (e.r + 46) ** 2;
      M.root.scale.setScalar(s);
      animate(M, e, t, near);
      tint(M, e, t);
      if (e.lastHit !== M.hitRef) { M.hitRef = e.lastHit; woundAt(M, e); }
      M.root.visible = !e.under && (e.type !== "phantom" || (e.glitchT > 0 ? Math.random() < 0.5 : Math.random() > 0.04));
    }
    // Gestorbene: Pose und Flugbahn kommen aus der Körper-Physik des Spiels
    for (const c of w.corpses) {
      if (dying.has(c) || (c.ref && seen.has(c.ref))) continue;
      // Modell des Gegners übernehmen; starb er, bevor er je gezeichnet wurde (z. B. im selben
      // Frame gespawnt und von einer Explosion erwischt), bekommt die Leiche ein eigenes
      let M = c.ref && models.get(c.ref);
      if (M) models.delete(c.ref); else M = acquireModel(c.type, c.r / 0.8, c.v, c.evo || 0);
      if (c.headless && M.extra.head) M.extra.head.visible = false;
      dying.set(c, { M, sc: c.sc * (c.boss ? BOSS_SCALE : CHAR_SCALE), boss: !!c.boss });
    }
    for (const [e, M] of models) if (!seen.has(e)) { releaseModel(M); models.delete(e); }
    const live = new Set(w.corpses);
    for (const [c, d] of dying) {
      if (!live.has(c)) {
        // eingebackene Leichen bleiben als Teil des Sammel-Meshes liegen, zersprungene verschwinden
        if (c.baked) bakeCorpseMesh(d.M);
        releaseModel(d.M); dying.delete(c); continue;
      }
      poseCorpse(c, d, t);
    }
  }
  // v2.4 Überlebende: normale Figuren aus dem Modell-Pool; kauern, bis der Held sie erreicht, dann rennen sie zur Tür
  const survModels = new Map();
  const survPose = { anim: 0, mode: "walk", pose: null, r: 13, wob: 0, hitT: 0 };
  function syncSurvivors(w, t) {
    const list = w.survivors || [];
    const seen = new Set();
    for (const s of list) {
      if (s.state !== "wait" && s.state !== "run") continue;
      let M = survModels.get(s);
      if (!M) { M = acquireModel("civilian", 13, s.variant); survModels.set(s, M); }
      seen.add(s);
      M.root.position.set(s.x + (s.state === "wait" ? Math.sin(t * 22 + s.anim) * 0.8 : 0), 0, s.y);
      M.root.rotation.set(0, -s.face, 0);
      M.root.scale.setScalar(CHAR_SCALE * 0.95);
      survPose.anim = s.anim; survPose.pose = s.state === "wait" ? "crouch" : null;
      animate(M, survPose, t, false);
      const k = s.hurtT > 0 ? 0.6 : s.t > 0 ? 0.25 * Math.min(1, s.t / 0.6) : 0;
      for (const m of M.mats) m.emissive.setRGB(s.hurtT > 0 ? k : 0, s.hurtT > 0 ? 0.02 : k, s.hurtT > 0 ? 0.02 : k * 0.3);
    }
    for (const [s, M] of survModels) if (!seen.has(s)) { releaseModel(M); survModels.delete(s); }
  }
  // v4.0 Begleiter: Hund als eigenes Modell neben dem Helden (der Rabe fliegt in der Vogel-Schar mit)
  let petModel = null;
  const petPose = { anim: 0, pose: null };
  function syncPet(w, t) {
    const pt = w.pet;
    if (!pt) { if (petModel) { releaseModel(petModel); petModel = null; } return; }
    if (petModel && petModel.look !== pt.def.look) { releaseModel(petModel); petModel = null; }
    if (!petModel) { petModel = acquireModel("petdog", pt.r, pt.def.look); petModel.look = pt.def.look; }
    const M = petModel;
    M.root.position.set(pt.x, 0, pt.y);
    M.root.rotation.set(0, -pt.face, 0);
    M.root.scale.setScalar(CHAR_SCALE * (pt.def.look ? 0.8 : 1.05));
    petPose.anim = pt.anim;
    animate(M, petPose, t, false);
    if (M.extra.tail) M.extra.tail.rotation.y = Math.sin(t * 14) * 0.5; // wedeln
    for (const m of M.mats) m.emissive.setRGB(0, 0, 0);
  }
  const ICE = new T3.Color(0.55, 0.82, 1.0), CHAR = new T3.Color(0.09, 0.07, 0.06);
  function poseCorpse(c, d, t) {
    const M = d.M, f = c.fall, k = f * f * (3 - 2 * f);
    let pitch = c.fallDir * 1.42 * k, roll = c.roll, yaw = -c.face;
    if (c.death === "freeze") pitch = 0;
    if (c.death === "shock" && c.t < 0.6) { pitch = (Math.random() - 0.5) * 0.35; roll = (Math.random() - 0.5) * 0.3; }
    if (c.death === "burn") { pitch *= 0.95; roll += c.side * 0.4 * k; }
    M.root.position.set(c.x, c.z + k * M.height * 0.07 * d.sc, c.y);
    M.root.scale.setScalar(d.sc);
    M.root.rotation.set(roll, yaw, pitch);
    for (const m of M.mats) {
      m.color.copy(m.userData.base);
      m.emissive.setRGB(0, 0, 0);
      switch (c.death) {
        case "burn": { const b = Math.min(1, c.t / 1.2); m.color.lerp(CHAR, b * 0.9); const g = Math.max(0, 1 - c.t / 1.6) * (0.5 + 0.3 * Math.sin(t * 30)); m.emissive.setRGB(g, g * 0.35, 0); break; }
        case "freeze": m.color.lerp(ICE, 0.75); m.emissive.setRGB(0.12, 0.3, 0.45); break;
        case "shock": if (c.t < 0.6) { const g = Math.random() < 0.5 ? 0.9 : 0.1; m.emissive.setRGB(g * 0.4, g * 0.9, g); } else m.color.lerp(CHAR, 0.45); break;
        default: m.color.multiplyScalar(1 - k * 0.45);
      }
    }
  }

  // ------------------------------------------------------------------
  // Sammel-Mesh für liegende Leichen: ruhende Körper werden einmal in einen
  // großen Vertex-Puffer kopiert → beliebig viele Leichen für 1 Draw Call
  // ------------------------------------------------------------------
  const CORPSE_MAXV = 180000;
  let corpseBatch = null, corpseN = 0;
  const cbN = new T3.Vector3(), cbP = new T3.Vector3(), cbC = new T3.Color(), cbNm = new T3.Matrix3(), cbM = new T3.Matrix4();
  function setupCorpseBatch() {
    const g = new T3.BufferGeometry();
    for (const [name, size] of [["position", 3], ["normal", 3], ["color", 3]]) g.setAttribute(name, new T3.BufferAttribute(new Float32Array(CORPSE_MAXV * size), size).setUsage(T3.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    corpseBatch = new T3.Mesh(g, new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    corpseBatch.frustumCulled = false;
    corpseBatch.receiveShadow = true;
    corpseBatch.visible = false; // leer nicht zeichnen: drawArrays mit 0 Vertices erzeugt WebGL-Warnungen
    scene.add(corpseBatch);
  }
  function resetCorpseBatch() { corpseN = 0; if (corpseBatch) { corpseBatch.geometry.setDrawRange(0, 0); corpseBatch.visible = false; } }
  function bakeCorpseMesh(M) {
    if (!corpseBatch) return;
    M.root.updateMatrixWorld(true);
    const g = corpseBatch.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, start = corpseN;
    if (M.parts) updateParts(M);
    M.root.traverseVisible((o) => {
      if (!o.isMesh || o.userData.outline) return;
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const sp = src.attributes.position, sn = src.attributes.normal, sc = src.attributes.color, n = sp.count;
      if (corpseN + n > CORPSE_MAXV) return;
      const tint = o.material.color || cbC.setRGB(1, 1, 1);
      // Figur mit Gelenk-Shader: Knotenmatrix je Vertex auf der CPU anwenden, versteckte Knoten auslassen
      const pa = o.userData.parts ? src.attributes.part : null, pm = pa && M.parts.uni.value, hid = pa && M.parts.hidden;
      let w = corpseN, lastPart = -1;
      for (let i = 0; i < n; i++) {
        if (pa) {
          const k = pa.getX(i);
          if (hid[k]) { i += 2; continue; } // Dreiecke gehören immer zu genau einem Knoten
          if (k !== lastPart) { lastPart = k; cbM.multiplyMatrices(o.matrixWorld, pm[k]); cbNm.getNormalMatrix(cbM); }
        } else if (i === 0) { cbM.copy(o.matrixWorld); cbNm.getNormalMatrix(cbM); }
        cbP.fromBufferAttribute(sp, i).applyMatrix4(cbM);
        P.setXYZ(w, cbP.x, cbP.y, cbP.z);
        if (sn) { cbN.fromBufferAttribute(sn, i).applyMatrix3(cbNm).normalize(); N.setXYZ(w, cbN.x, cbN.y, cbN.z); }
        const r = sc ? sc.getX(i) : 1, gg = sc ? sc.getY(i) : 1, b = sc ? sc.getZ(i) : 1;
        C.setXYZ(w, r * tint.r, gg * tint.g, b * tint.b);
        w++;
      }
      if (src !== o.geometry) src.dispose();
      corpseN = w;
    });
    if (corpseN === start) return;
    // Bereiche nur anhängen: mehrere Leichen können im selben Frame eingebacken werden, three.js
    // fasst die Bereiche beim Hochladen zusammen und leert die Liste danach selbst
    for (const a of [P, N, C]) { a.addUpdateRange(start * 3, (corpseN - start) * 3); a.needsUpdate = true; }
    g.setDrawRange(0, corpseN);
    corpseBatch.visible = true;
  }

  function syncPlayer(w, t) {
    const p = w.player;
    // Spielerfigur bei Waffenwechsel neu bauen
    if (playerModel && (playerModel.weaponId !== p.weaponId || playerModel.tier !== p.tier || playerModel.skin !== (p.skin || "soldier") || playerModel.gearKey !== gearKey(gearLook))) { scene.remove(playerModel.root); disposeTree(playerModel.root); playerModel = null; }
    if (!playerModel) playerModel = buildPlayer(w);
    const M = playerModel;
    M.root.position.set(p.x, 0, p.y);
    M.root.rotation.set(0, -p.aim, 0);
    M.root.scale.setScalar(PLAYER_SCALE);
    M.root.visible = !(p.invuln > 0 && w.state === "play" && Math.floor(p.invuln * 16) % 2 === 0);
    const ph = p.moving ? (p.walkT / 8) * TAU : 0;
    for (const L of M.legs) L.g.rotation.z = p.moving ? Math.sin(ph + (L.s > 0 ? Math.PI : 0)) * 0.6 : 0;
    M.body.position.y = p.moving ? Math.abs(Math.sin(ph)) * 0.8 : 0;
    // v3.0 Körpersprache: in Laufrichtung lehnen, Rückstoß im Oberkörper, Atmen im Stand, Zusammenzucken,
    // Ausholen beim Wurf, Hechtrolle beim Ausweichen (um die Körpermitte, nicht um die Füße)
    {
      const fdt = Math.max(1e-3, frameDt || 0.016);
      const vx = (p.x - (M.lx ?? p.x)) / fdt, vz = (p.y - (M.lz ?? p.y)) / fdt;
      M.lx = p.x; M.lz = p.y;
      const spd = Math.min(1, Math.hypot(vx, vz) / 220), rel = Math.atan2(vz, vx) - p.aim;
      const fwd = spd > 0.05 ? Math.cos(rel) * spd : 0, side = spd > 0.05 ? Math.sin(rel) * spd : 0;
      M.leanF = (M.leanF || 0) + (fwd - (M.leanF || 0)) * Math.min(1, fdt * 10);
      M.leanS = (M.leanS || 0) + (side - (M.leanS || 0)) * Math.min(1, fdt * 10);
      let rz = -M.leanF * 0.14 + (p.kick || 0) * 0.022, rx = M.leanS * 0.16, ry = 0, bx = 0;
      if (!p.moving) M.body.position.y += Math.sin(t * 2.4) * 0.35;
      if (p.hurtT > 0) rx += Math.sin(t * 45) * 0.1 * Math.min(1, p.hurtT / 0.2);
      if (p.throwT > 0) { const k = Math.sin((1 - p.throwT / 0.32) * Math.PI); ry = -0.7 * k; rz -= 0.15 * k; }
      if (p.ultT > 0) M.body.position.y += Math.sin((1 - p.ultT / 0.7) * Math.PI) * 4;
      if (p.dashT > 0) {
        const k = Math.min(1, 1 - p.dashT / 0.18), th = -k * TAU, h = (M.height || 40) * 0.42;
        rz = th; bx = h * Math.sin(th);
        M.body.position.y = h * (1 - Math.cos(th)) + Math.sin(k * Math.PI) * 5;
        for (const L of M.legs) L.g.rotation.z = -1.1;
      }
      M.body.rotation.set(rx, ry, rz);
      M.body.position.x = bx;
    }
    const wpn = M.extra.weapon;
    wpn.position.x = M.extra.gripX - p.kick * 0.8;
    if (wpn.userData.barrels) wpn.userData.barrels.rotation.x = p.barrel;
    // Sägen & Drohnen
    while (sawMeshes.length < p.orbit) {
      const s = group();
      const blade = mesh(cyl(11, 11, 2, 14), smat("saw", () => new T3.MeshLambertMaterial({ color: 0xc9d1d9, emissive: 0x222222 })));
      s.add(blade);
      for (let i = 0; i < 8; i++) { const tth = mesh(cone(2.2, 5, 3), slam("#9aa3ab"), Math.cos((i / 8) * TAU) * 12, 0, Math.sin((i / 8) * TAU) * 12); tth.rotation.z = -Math.PI / 2; tth.rotation.y = -(i / 8) * TAU; s.add(tth); }
      s.add(mesh(cyl(3, 3, 3, 8), sbasic("#e5383b")));
      bakeStatic(s); cast(s); scene.add(s); sawMeshes.push(s);
    }
    sawMeshes.forEach((s, i) => {
      s.visible = i < p.orbit;
      if (!s.visible) return;
      const a = p.orbitAng + (i / p.orbit) * TAU;
      const or = p.orbitR || 64;
      s.position.set(p.x + Math.cos(a) * or, 16, p.y + Math.sin(a) * or);
      s.rotation.y = p.orbitAng * 5;
    });
    while (droneMeshes.length < p.drones) {
      const d = group();
      d.add(mesh(box(12, 5, 10), slam("#4a5562")));
      for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { d.add(mesh(cyl(1, 1, 3, 5), slam("#3a4048"), x, 1, z)); d.add(mesh(cyl(6, 6, 0.6, 10), smat("rotor", () => new T3.MeshBasicMaterial({ color: 0xc8e6ff, transparent: true, opacity: 0.35 })), x, 3, z)); }
      d.add(mesh(ico(1.6, 0), sbasic("#7fe7ff"), 6.5, 0, 0));
      bakeStatic(d); cast(d); scene.add(d); droneMeshes.push(d);
    }
    droneMeshes.forEach((d, i) => {
      d.visible = i < p.drones;
      if (!d.visible) return;
      const dp = w.dronePos(i);
      d.position.set(dp.x, 58 + Math.sin(t * 4 + i) * 3, dp.y + 30);
      d.rotation.y = -Math.atan2(w.enemies.length ? w.enemies[0].y - dp.y : 1, w.enemies.length ? w.enemies[0].x - dp.x : 0);
    });
  }

  // v3.7 Hindernis-Modell bauen (auch nachträglich: das Wrack eines explodierten Autos entsteht mitten im Einsatz)
  function buildObstacle(o, theme) {
    const raw = obstacleModel(o, theme), mv = raw.userData.moving;
    if (mv) for (const m of mv) raw.remove(m.obj);
    const om = o.kind === "bretter" ? raw : bakeStatic(raw);
    if (mv) { for (const m of mv) om.add(m.obj); om.userData.moving = mv; }
    om.traverse((c) => { if (c.isMesh && !c.material.transparent) { c.castShadow = true; c.receiveShadow = true; } });
    return om;
  }
  function syncObstacles(t = 0, w) {
    if (!room) return;
    if (w && w.obstacles.length > room.obs.size) for (const o of w.obstacles) if (!o.dead && !room.obs.has(o)) {
      const om = buildObstacle(o, w.theme); room.obs.set(o, om); room.group.add(om); renderer.shadowMap.needsUpdate = true;
    }
    for (const [o, grp] of room.obs) {
      if (grp.userData.moving && !o.dead) for (const m of grp.userData.moving) m.fn(m.obj, t);
      if (o.gateBar && !o.dead && grp.userData.planks) {
        // v3.3 Barrikade unter Beschuss: wackelt, Bretter fallen mit dem Schaden
        const k = o.hp / o.maxHp, n = grp.userData.planks.length;
        grp.userData.planks.forEach((pl, i) => { pl.visible = i < Math.ceil(k * n + 0.01) || i % 3 === 1 && k > 0.2; });
        grp.position.x = grp.userData.baseX + (o.shakeT > 0 ? Math.sin(performance.now() * 0.09) * 1.8 : 0);
      }
      if (!o.dead) continue;
      room.group.remove(grp);
      disposeTree(grp);
      room.obs.delete(o);
      renderer.shadowMap.needsUpdate = true;
    }
  }
  function syncDoor(w) {
    if (!room) return;
    const k = w.run.doorK || 0;
    for (const P of room.door.panels) P.mesh.position.x = D.W / 2 + P.s * (D.DOOR_W / 4 + k * (D.DOOR_W / 2 - 2));
    for (const l of room.door.lamps) l.material.color.setHex(k > 0.5 ? 0x8cff4a : 0xff3a2a);
  }

  // Versorgungskiste (schwebt leicht, roter Sanitäts-Aufdruck)
  let crate = null;
  function syncSupply(w) {
    const s = w.supplyCrate;
    if (!s) { if (crate) crate.visible = false; return; }
    if (!crate) {
      crate = group();
      crate.add(mesh(box(46, 34, 40), new T3.MeshLambertMaterial({ map: obstacleTexture("medcrate"), normalMap: obsNormal("medcrate") }), 0, 17, 0));
      crate.add(mesh(box(50, 5, 44), slam("#3d6b2a"), 0, 36.5, 0));
      for (const x of [-15, 15]) crate.add(mesh(box(5, 35.4, 40.6), slam("#2c3037"), x, 17.7, 0));
      bakeStatic(crate);
      cast(crate);
      scene.add(crate);
    }
    crate.visible = true;
    crate.position.set(s.x, 2 + Math.abs(Math.sin(s.bob * 3)) * 4, s.y);
    crate.rotation.y = Math.sin(s.bob) * 0.15;
  }

  // v3.0 Mini-Spiel-Station: Jahrmarktbude (Schießbude), Bude mit Lukas-Säule oder Feldfunkgerät auf einer Kiste
  let miniM = null, miniKind = null;
  function syncMini(w) {
    const s = w.miniSpot;
    if (!s) { if (miniM) miniM.visible = false; return; }
    if (!miniM || miniKind !== s.kind) {
      if (miniM) { scene.remove(miniM); disposeTree(miniM); }
      miniKind = s.kind; miniM = group();
      if (s.kind === "funk") {
        miniM.add(mesh(box(44, 20, 34), new T3.MeshLambertMaterial({ map: obstacleTexture("crate"), normalMap: obsNormal("crate") }), 0, 10, 0));
        miniM.add(mesh(box(36, 26, 22), slam("#5a6440"), 0, 33, 0));
        miniM.add(mesh(box(38, 3, 24), slam("#3a4228"), 0, 47.5, 0));
        miniM.add(mesh(box(18, 3, 3), slam("#2a2e20"), 0, 52, 0));
        miniM.add(mesh(box(16, 9, 1), sbasic("#3aff6a"), -6, 36, 11.4));
        for (const x of [7, 13]) miniM.add(mesh(cyl(1.8, 1.8, 2, 8), slam("#1a1a14"), x, 36, 11.6).rotateX(Math.PI / 2));
        const ant = mesh(cyl(0.7, 0.7, 60, 5), slam("#2a2a22"), 16, 74, -6); ant.rotation.z = -0.25; miniM.add(ant);
        miniM.add(mesh(ico(1.8, 0), sbasic("#ff3a24"), 23.5, 103, -6));
      } else {
        const wood = slam("#6a4426");
        miniM.add(mesh(box(64, 26, 26), wood, 0, 13, 6));
        miniM.add(mesh(box(66, 3, 30), slam("#8a5a30"), 0, 27.5, 6));
        miniM.add(mesh(box(64, 56, 4), slam("#5a1418"), 0, 28, -10));
        for (const x of [-31, 31]) miniM.add(mesh(box(3, 64, 3), wood, x, 32, 18));
        for (let k = 0; k < 8; k++) { const rf = mesh(box(8, 3, 34), slam(k % 2 ? "#f0e6d0" : "#c8201a"), -28 + k * 8, 66, 4); rf.rotation.x = 0.28; miniM.add(rf); }
        for (let k = 0; k < 7; k++) miniM.add(mesh(ico(1.7, 0), sbasic("#fff3c4"), -27 + k * 9, 60, 20));
        if (s.kind === "lukas") {
          ["#2f7a3a", "#5a9a2a", "#e8c21a", "#e88a1a", "#c81e1e"].forEach((c, i) => miniM.add(mesh(box(8, 22, 6), slam(c), 44, 12 + i * 22, 0)));
          miniM.add(mesh(cone(8, 10, 10), slam("#c89a2a"), 44, 128, 0));
          miniM.add(mesh(box(10, 5, 8), slam("#e8e0d0"), 44, 20, 4));
          miniM.add(mesh(box(26, 6, 20), slam("#4a4a4a"), 44, 3, 0));
        } else {
          for (let k = 0; k < 3; k++) {
            miniM.add(mesh(box(10, 16, 1.5), slam("#4f6b3a"), -18 + k * 18, 40, -7));
            miniM.add(mesh(cyl(5, 5, 1.5, 10), slam("#8fb06a"), -18 + k * 18, 52, -7).rotateX(Math.PI / 2));
          }
        }
      }
      bakeStatic(miniM); cast(miniM); scene.add(miniM);
    }
    miniM.visible = true;
    miniM.position.set(s.x, 0, s.y);
  }

  function syncInstanced(w, t) {
    // Schatten unter Figuren (in hoher Qualität werfen Figuren echte Schatten)
    let n = 0;
    const blob = (x, z, r) => { if (n < 160) inst(blobShadows, n++, x, 0.6, z, 0, 0, r * 2.6, 1, r * 1.9); };
    for (const e of w.enemies) if (e.spawnT <= 0) blob(e.x, e.y, e.r * e.scale);
    for (const s of w.survivors || []) if (s.state === "wait" || s.state === "run") blob(s.x, s.y, 13);
    blob(w.player.x, w.player.y, 16);
    for (const b of w.bullets) if (b.kind === "grenade" || b.kind === "rocket" || b.kind === "disc") blob(b.x, b.y, b.kind === "disc" ? 8 : 5);
    blobShadows.count = n; blobShadows.instanceMatrix.needsUpdate = true;
    blobShadows.material.opacity = quality >= 2 ? 0.55 : 1;
    // Münzen
    n = 0;
    for (const o of w.orbs) if (o.type === "coin" && n < 300) inst(coinsIM, n++, o.x, 8 + Math.sin(t * 5 + o.x) * 1.5, o.y, t * 4 + o.x, Math.PI / 2);
    coinsIM.count = n; coinsIM.instanceMatrix.needsUpdate = true;
    // Gegner-Projektile, Granaten, Bolzen
    let a = 0, pk = 0, gr = 0, bo = 0, rk = 0, dk = 0;
    let bl = 0, pp = 0, cd = 0, br = 0, an = 0, bx = 0;
    const boxAt = (x, y, z, sx, sy, sz, rot, rgb) => { if (bx >= 60) return; inst(boxIM, bx, x, y, z, rot, 0, sx, sy, sz); const [r0, g0, b0] = rgb; boxIM.setColorAt(bx++, tmpColor.setRGB(r0, g0, b0)); };
    for (const q of w.lobs || []) if (q.kind === "gift" || q.kind === "parcel") boxAt(q.x, q.z + 8, q.y, 16, 14, 16, q.spin, q.kind === "gift" ? [0.75, 0.06, 0.08] : [0.48, 0.32, 0.17]);
    for (const q of w.parcels || []) boxAt(q.x, 7, q.y, 18, 13, 16, q.spin, [0.48, 0.32, 0.17]);
    // v2.9 Wurfwaffen des Helden im Flug und Böller am Boden
    for (const q of w.throws || []) { const st = w.throwStyle && w.throwStyle(q.kind); boxAt(q.x, q.z + 6, q.y, 7, 10, 7, q.spin, st ? st.c3 : [0.3, 0.4, 0.2]); }
    for (const q of w.decoys || []) boxAt(q.x, 6, q.y, 5, 12, 5, 0, [0.8, 0.1, 0.1]);
    for (const b of w.eBullets) {
      const s = b.r * 1.1;
      if (b.kind === "barrel") { if (br < 30) inst(barrelIM, br++, b.x, b.r, b.y, -Math.atan2(b.vy, b.vx) + Math.PI / 2, b.spin, b.r, b.r, b.r); continue; }
      if (b.kind === "anchor") { if (an < 12) inst(anchorIM, an++, b.x, 22, b.y, b.spin, 0, 1.3, 1.3, 1.3); continue; }
      if (b.kind === "harpoon") continue; // Leuchtspur in fillBatches
      if (b.kind === "ball") { if (bl < 40) inst(ballIM, bl++, b.x, b.r, b.y, b.spin * 0.6, b.spin, b.r, b.r, b.r); continue; }
      if (b.kind === "paper") { if (pp < 90) inst(paperIM, pp++, b.x, 20, b.y, b.spin, Math.sin(b.spin * 1.3) * 0.5); continue; }
      if (b.kind === "candy") { if (cd < 150) { inst(candyIM, cd, b.x, 16, b.y, b.spin, b.spin * 0.5, 5, 3.5, 3.5); const [cr, cg3, cb] = b.rgb.split(",").map((v) => v / 255); candyIM.setColorAt(cd++, tmpColor.setRGB(cr, cg3, cb)); } continue; }
      if (b.slug) continue; // Gewehrkugeln als Leuchtspur (fillBatches)
      if (b.pink) { if (pk < 200) inst(pinkIM, pk++, b.x, 18, b.y, 0, 0, s, s, s); } else if (a < 200) inst(acidIM, a++, b.x, 18, b.y, 0, 0, s, s, s);
    }
    for (const b of w.bullets) {
      if (b.kind === "grenade" && gr < 60) { const k = 1 - b.life / b.maxLife; inst(grenadeIM, gr++, b.x, 14 + Math.sin(k * Math.PI) * 60, b.y, b.spin, b.spin * 0.7); }
      else if (b.kind === "bolt" && bo < 120) inst(boltIM, bo++, b.x, 22, b.y, -Math.atan2(b.vy, b.vx));
      else if (b.kind === "rocket" && rk < 40) inst(rocketIM, rk++, b.x, 22, b.y, -Math.atan2(b.vy, b.vx));
      else if (b.kind === "disc" && dk < 60) inst(discIM, dk++, b.x, 16, b.y, b.spin);
    }
    ballIM.count = bl; paperIM.count = pp; candyIM.count = cd; barrelIM.count = br; anchorIM.count = an; boxIM.count = bx;
    for (const im of [barrelIM, anchorIM, boxIM]) im.instanceMatrix.needsUpdate = true;
    for (const im of [barrelIM, anchorIM, boxIM, ballIM, paperIM, candyIM]) im.visible = im.count > 0; // leere Instanzen kosten sonst Draw Calls (auch im Schatten)
    if (bx && boxIM.instanceColor) boxIM.instanceColor.needsUpdate = true;
    for (const im of [ballIM, paperIM, candyIM]) im.instanceMatrix.needsUpdate = true;
    if (cd && candyIM.instanceColor) candyIM.instanceColor.needsUpdate = true;
    acidIM.count = a; pinkIM.count = pk; grenadeIM.count = gr; boltIM.count = bo; rocketIM.count = rk; discIM.count = dk;
    for (const im of [acidIM, pinkIM, grenadeIM, boltIM, rocketIM, discIM]) im.instanceMatrix.needsUpdate = true;
    // Medikits
    let hk = 0;
    let fk = 0, pk2 = 0, lk = 0;
    for (const o of w.orbs) {
      const y = 7 + Math.sin(t * 4 + o.x) * 2;
      if (o.type === "heal" && o.food && fk < 20) inst(foodIM, fk++, o.x, y + 2, o.y, t * 1.5, 1.2);
      else if (o.type === "heal" && hk < 20) { inst(healIM, hk, o.x, y, o.y, t * 1.5); inst(healCrossIM, hk++, o.x, y, o.y, t * 1.5); }
      else if (o.type === "pfand" && pk2 < 40) inst(pfandIM, pk2++, o.x, 6, o.y, 0, 1.2 + Math.sin(t * 3 + o.x) * 0.3);
      else if (o.type === "gear" && lk < 12) {
        const ly = 8 + Math.sin(t * 3 + o.x) * 1.5, rot = t * 0.8 + o.x;
        inst(lootIM, lk, o.x, ly, o.y, rot); inst(lootBandIM, lk, o.x, ly, o.y, rot);
        const [lr, lg, lb] = LOOT_RGB[(o.item && o.item.r) || 0];
        lootBandIM.setColorAt(lk++, tmpColor.setRGB(lr, lg, lb));
      }
    }
    lootIM.count = lootBandIM.count = lk; lootIM.instanceMatrix.needsUpdate = true; lootBandIM.instanceMatrix.needsUpdate = true;
    if (lk && lootBandIM.instanceColor) lootBandIM.instanceColor.needsUpdate = true;
    lootIM.visible = lootBandIM.visible = lk > 0;
    // v3.7 Power-ups: Kristall dreht sich, Ring taumelt; blinkt in den letzten 3 s (verfällt nach 14 s)
    let pk3 = 0;
    for (const o of w.orbs) {
      if (o.type !== "power" || pk3 >= 4) continue;
      const y = 24 + Math.sin(o.t * 4) * 3, on = !(o.t > 11 && Math.sin(o.t * 20) < 0), s0 = on ? Math.min(1, o.t * 4) : 0.001;
      inst(puGemIM, pk3, o.x, y, o.y, o.t * 1.8, 0, s0, s0, s0);
      inst(puRingIM, pk3, o.x, y, o.y, o.t * 1.1, Math.PI / 2 + Math.sin(o.t * 2.2) * 0.45, s0, s0, s0);
      const [r0, g0, b0] = lin(o.rgb);
      puGemIM.setColorAt(pk3, tmpColor.setRGB(r0, g0, b0)); puRingIM.setColorAt(pk3++, tmpColor.setRGB(Math.min(1, r0 * 1.4 + 0.15), Math.min(1, g0 * 1.4 + 0.15), Math.min(1, b0 * 1.4 + 0.15)));
    }
    puGemIM.count = puRingIM.count = pk3; puGemIM.visible = puRingIM.visible = pk3 > 0;
    if (pk3) { puGemIM.instanceMatrix.needsUpdate = puRingIM.instanceMatrix.needsUpdate = true; puGemIM.instanceColor.needsUpdate = puRingIM.instanceColor.needsUpdate = true; }
    // v3.4 Krähen: am Boden mit angelegten Flügeln und Pickbewegung, im Flug mit Flügelschlag
    let bk = 0;
    for (const b of w.birds || []) {
      if (bk >= 40) break;
      const peck = b.peck > 0 ? Math.sin(b.peck * 30) * 0.35 : 0;
      dummy.position.set(b.x, 4.5 + (b.z || 0), b.y); dummy.rotation.set(0, -b.face, -peck); dummy.scale.set(1.55, 1.55, 1.55); dummy.updateMatrix(); birdIM.setMatrixAt(bk, dummy.matrix); // Kopf nach unten beim Picken
      const flap = b.fly ? Math.sin(b.t * 22) * 1.3 : 0.25;
      inst(wingIM, bk, b.x, 6.8 + (b.z || 0), b.y, -b.face, 0, b.fly ? 1.55 : 1.25, flap * 1.55, b.fly ? 1.55 : 0.7);
      bk++;
    }
    birdIM.count = wingIM.count = bk; birdIM.visible = wingIM.visible = bk > 0;
    if (bk) { birdIM.instanceMatrix.needsUpdate = true; wingIM.instanceMatrix.needsUpdate = true; }
    healIM.count = healCrossIM.count = hk; healIM.instanceMatrix.needsUpdate = true; healCrossIM.instanceMatrix.needsUpdate = true;
    foodIM.count = fk; pfandIM.count = pk2; foodIM.instanceMatrix.needsUpdate = true; pfandIM.instanceMatrix.needsUpdate = true;
    // Brocken, Trümmer, Hülsen
    let ch = 0, cs = 0;
    for (const q of w.particles) {
      if (q.t === "gib" && ch < 400) {
        inst(chunkIM, ch, q.x, q.z + 3, q.y, q.rot, q.rot * 0.7, 3.4, 2.6, 3);
        chunkIM.setColorAt(ch++, gibColor(q.trail));
      } else if (q.t === "debris" && ch < 400) {
        const s2 = q.size * 1.2;
        inst(chunkIM, ch, q.x, q.z + 2, q.y, q.rot, q.rot * 1.3, s2, s2 * 0.7, s2);
        chunkIM.setColorAt(ch++, tmpColor.set(q.color));
      } else if (q.t === "casing" && cs < 240) {
        inst(casingIM, cs++, q.x, q.z + 1.2, q.y, q.rot, Math.PI / 2);
      }
    }
    chunkIM.count = ch; casingIM.count = cs;
    // Köpfe & Gliedmaßen
    let hd = 0, lb = 0;
    for (const q of w.pieces || []) {
      const s2 = q.sc * CHAR_SCALE * 15;
      if (q.kind === "head" && hd < 100) {
        inst(headIM, hd, q.x, q.z + s2 * 0.38, q.y, q.ry, q.rx, s2 * 0.4, s2 * 0.4, s2 * 0.4);
        headIM.setColorAt(hd++, pieceColor(q, "skin"));
      } else if (q.kind === "limb" && lb < 100) {
        inst(limbIM, lb, q.x, q.z + s2 * 0.14, q.y, q.ry, q.rx + Math.PI / 2, s2 * 0.3, s2 * 0.45, s2 * 0.3);
        limbIM.setColorAt(lb++, pieceColor(q, lb % 2 ? "shirt" : "skin"));
      }
    }
    headIM.count = hd; limbIM.count = lb;
    for (const im of [headIM, limbIM]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    chunkIM.instanceMatrix.needsUpdate = true; casingIM.instanceMatrix.needsUpdate = true;
    if (chunkIM.instanceColor) chunkIM.instanceColor.needsUpdate = true;
  }
  const GIB = { "#3f6e1a": new T3.Color(0x4a7a2a), "#5a0f2a": new T3.Color(0x6e2a4a) }, GIB_RED = new T3.Color(0x7a1f22);
  const pieceCols = new Map();
  function pieceColor(q, part) {
    const pal = PAL[q.type] || PAL.walker, P = pal[q.v % pal.length], key = `${q.type}:${q.v % pal.length}:${part}`;
    let c = pieceCols.get(key);
    if (!c) { c = new T3.Color(P[part] || P.skin || "#8fa67a"); pieceCols.set(key, c); }
    return c;
  }
  const gibColor = (trail) => GIB[trail] || GIB_RED;

  // Explosionen, Level-up-Säule, Tür-Lichtvorhang
  const BOOM_SPRITES = true; // v3.5: die alten facettierten Kugeln bleiben als Rückfall im Code, werden aber nicht mehr gezeigt
  function syncBigFx(w, t) {
    let bi = 0;
    for (const q of w.particles) {
      if (BOOM_SPRITES) break; // v3.5: Feuerball, Rauchpilz und Druckwelle kommen als weiche Billboards aus fillBatches
      if (q.t !== "boom" || bi >= booms.length) continue;
      const B2 = booms[bi++], k = 1 - Math.max(0, q.life / q.max), r = q.r;
      const grow = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3);
      B2.fire.visible = B2.core.visible = B2.smoke.visible = true;
      B2.fire.position.set(q.x, r * 0.25 + k * r * 0.5, q.y);
      B2.fire.scale.setScalar(r * (0.3 + 0.75 * grow));
      B2.fire.rotation.set(B2.spin + k, B2.spin * 2 + k * 2, 0);
      B2.fire.material.opacity = Math.pow(1 - k, 1.6) * 0.95;
      B2.fire.material.color.setRGB(1, 0.35 + 0.3 * (1 - k), 0.08);
      B2.core.position.copy(B2.fire.position);
      B2.core.scale.setScalar(r * 0.45 * Math.max(0, 1 - k * 1.6));
      B2.core.material.opacity = Math.max(0, 1 - k * 1.6);
      B2.smoke.position.set(q.x, r * 0.35 + k * r * 1.3, q.y);
      B2.smoke.scale.set(r * (0.45 + k * 0.7), r * (0.35 + k * 0.5), r * (0.45 + k * 0.7));
      B2.smoke.rotation.y = B2.spin - k;
      B2.smoke.material.opacity = k < 0.15 ? k * 4 : Math.max(0, (1 - k) * 0.75);
    }
    for (; bi < booms.length; bi++) { const B2 = booms[bi]; B2.fire.visible = B2.core.visible = B2.smoke.visible = false; }
    // Level-up: Lichtsäule über dem Spieler
    let lvl = null;
    for (const q of w.particles) if (q.t === "lvl") lvl = q;
    if (lvl) {
      const k = Math.max(0, lvl.life / lvl.max), p = w.player, rise = Math.min(1, (1 - k) * 5);
      pillar.visible = true;
      pillar.position.set(p.x, 0, p.y);
      pillar.scale.set(24 + (1 - k) * 18, 260 * rise, 24 + (1 - k) * 18);
      pillar.rotation.y = t * 2;
      pillar.material.opacity = Math.min(1, k * 1.6);
    } else pillar.visible = false;
    // Offene Tür: grüner Lichtvorhang
    const dk = w.run.doorK || 0;
    doorBeam.visible = dk > 0;
    if (dk > 0) {
      doorBeam.position.set(D.W / 2, 0, D.T - 6);
      doorBeam.scale.set(D.DOOR_W * 0.5, 150 * dk, 10);
      doorBeam.material.opacity = (0.5 + 0.15 * Math.sin(t * 4)) * dk;
    }
  }

  const FIRE = ["200,60,20", "255,140,40", "255,220,120"];
  const EVO_RGB = [null, "140,255,80", "255,150,50", "255,48,60"], EVO_EYE = [null, "170,255,90", "255,176,64", "255,70,52"]; // v3.7
  const EYE = { jeck: "255,216,74", spitter: "234,255,0", abom: "234,255,0", armored: "80,170,230", burner: "255,176,58", screamer: "255,74,240", splitter: "255,106,213", electro: "127,231,255", healer: "140,255,138", phantom: "232,240,255", warden: "143,212,255", bloater: "234,255,0", nest: "224,112,224" };
  const fireRgb = (k) => FIRE[k > 0.6 ? 2 : k > 0.3 ? 1 : 0];

  // v3.6 Nasse Straße: jede Lichtquelle spiegelt sich als zur Kamera gestreckter, leicht flimmernder Streifen im Asphalt;
  // Läden und Leuchtreklame werfen außerdem farbigen Schein auf den Gehweg. Benutzt die Lichtliste des letzten Bildes.
  function wetFloor(w, t) {
    if (!room) return;
    const wet = room.wet || 0;
    if (wet <= 0) return;
    const cx = camera.position.x, cz = camera.position.z;
    const refl = (x, h, z, rgb, k, wid) => {
      if (k <= 0.01) return;
      const dx = cx - x, dz = cz - z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
      const len = 10 + h * 0.85, sh = 1 + 0.1 * Math.sin(t * 2.6 + x * 0.07 + z * 0.05);
      flat(floorB, x + ux * (len * 0.62 + 3), 0.65, z + uz * (len * 0.62 + 3), Math.atan2(uz, ux), len * sh, wid, CELL.glow, rgb, k * wet);
    };
    for (const f of room.facLights) {
      const fl = 0.85 + 0.15 * Math.sin(t * 1.7 + f.ph), sx = f.x + f.nx * 16, sz = f.z + f.nz * 16, sp = 14 + f.n * 7;
      flat(floorB, sx, 0.6, sz, f.nz ? 0 : Math.PI / 2, sp, 26, CELL.glow, f.rgb, 0.5 * f.k * fl); // Schein auf dem Gehweg
      refl(f.x + f.nx * 3, 22, f.z + f.nz * 3, f.rgb, 0.7 * f.k * fl, 6 + f.n * 3);
    }
    for (let i = 0; i < room.lamps.length; i++) { const l = room.lamps[i]; refl(l.x, 48, l.z, room.lampRgb, 0.75 * lampLevel(l, t), 11); }
    if (!w.menuCam) for (const c of lightCands) if (c[6] < 12) refl(c[0], c[1], c[2], c[3], Math.min(0.95, c[4] * 0.3), Math.min(24, 7 + c[5] * 0.035));
  }
  function fillBatches(w, t) {
    const m = camera.matrixWorld.elements;
    camR.set(m[0], m[1], m[2]); camU.set(m[4], m[5], m[6]);
    addB.begin(); normB.begin(); floorB.begin(); shadeB.begin();
    const p = w.player;
    // Partikel
    for (const q of w.particles) {
      const k = Math.max(0, q.life / q.max);
      switch (q.t) {
        case "spark": { const sp = Math.hypot(q.vx, q.vy), len = Math.min(16, sp * 0.05 + 3); flat(addB, q.x - (q.vx / (sp || 1)) * len * 0.5, 16, q.y - (q.vy / (sp || 1)) * len * 0.5, Math.atan2(q.vy, q.vx), len * 0.5, q.w, CELL.streak, q.rgb, k); break; }
        case "fire": { // v3.5 echte Flammenzunge (flackert in Breite/Höhe) über weichem Glutschein
          const sz = q.size * (1.5 - k * 0.5), fl = 1 + 0.18 * Math.sin(t * 23 + q.x * 0.7), y0 = (q.z || 0) + 12 + (1 - k) * 24;
          bill(addB, q.x, y0 - 2, q.y, sz * 0.9, CELL.glow, fireRgb(k), 0.45 * k);
          billS(addB, q.x, y0 + sz * 0.35, q.y, sz * 0.55 * fl, sz * 1.05 / fl, CELL.fire, k > 0.5 ? "255,190,90" : "255,120,40", 0.95 * Math.min(1, k * 1.6));
          break;
        }
        case "ember": bill(addB, q.x, (q.z || 0) + 18 + (1 - k) * 30, q.y, q.size, CELL.glow, "255,160,60", k); break;
        case "flash": bill(addB, q.x, 24, q.y, q.r * 0.6, CELL.glow, q.rgb, k * 0.9); break;
        case "ring": { const rr = q.r * (1.15 - k * 0.8); flat(floorB, q.x, 2, q.y, 0, rr, rr, CELL.shock, q.rgb, k * 0.95); break; } // v3.5 weicher Druckring
        case "bubble": bill(addB, q.x, 30 + (1 - k) * 20, q.y, q.size, CELL.glow, "140,255,74", k * 0.8); break;
        case "ice": bill(addB, q.x, 24, q.y, q.size, CELL.glow, "170,230,255", k * 0.9); break;
        case "drip": bill(addB, q.x, 18, q.y, q.size * 2, CELL.glow, q.rgb, k * 0.5); break;
        case "gas": bill(normB, q.x, 12 + (1 - k) * 16, q.y, 26 * q.size, CELL.smoke, q.rgb, Math.min(1, k * 1.6) * 0.42, q.rot); break;
        case "smoke": bill(normB, q.x, (q.h ?? 20) + (1 - k) * (q.rise ?? 40), q.y, 24 * q.size, CELL.smoke, q.rgb || "120,120,115", Math.min(1, k * 1.4) * 0.7, q.rot); break;
        case "boom": { // v3.5 Explosion: Linsenblitz, brodelnde Feuerball-Ballen, Druckwelle am Boden, aufsteigender Rauchpilz
          const e = 1 - k, r = q.r, sd = q.fxs || (q.fxs = 1 + Math.random() * 1000);
          if (e < 0.22) bill(addB, q.x, r * 0.45, q.y, r * (1.6 + e * 3), CELL.flare, "255,236,200", (1 - e / 0.22) * 0.95, sd);
          const sw = r * (0.5 + 2.4 * Math.sqrt(e));
          flat(floorB, q.x, 2.5, q.y, sd, sw, sw, CELL.shock, "255,200,140", Math.pow(1 - e, 2) * 0.8);
          if (e < 0.4) bill(addB, q.x, r * 0.4, q.y, r * (1.1 + e), CELL.glow, "255,226,170", (1 - e / 0.4) * 0.6); // heißer Kern
          for (let i = 0; i < 9; i++) {
            const a = sd + i * 0.7, d = r * (0.12 + 0.4 * Math.sqrt(e)) * (0.5 + ((i * 37) % 10) / 20), up = r * (0.22 + e * (0.65 + (i % 3) * 0.22));
            const life = Math.max(0, 1 - e * (1.25 + (i % 3) * 0.22));
            if (life > 0) bill(addB, q.x + Math.cos(a) * d, up, q.y + Math.sin(a) * d * 0.7, r * (0.4 + 0.45 * Math.sqrt(e)) * (0.7 + (i % 2) * 0.4), CELL.fireball, life > 0.8 ? "255,226,170" : life > 0.5 ? "255,160,60" : life > 0.25 ? "220,84,28" : "120,40,20", Math.min(0.85, life * 1.1), a + e * 2);
          }
          for (let i = 0; i < 8; i++) { // Rauch quillt nach, wird dunkler und steigt
            const a = sd * 1.7 + i * 0.8, d = r * (0.2 + 0.55 * e) * (0.6 + (i % 3) * 0.25), sa = Math.min(1, e * 4) * Math.pow(1 - e, 0.6) * 0.75;
            bill(normB, q.x + Math.cos(a) * d, r * (0.35 + e * (1.1 + (i % 4) * 0.25)), q.y + Math.sin(a) * d * 0.7, r * (0.4 + e * 0.8), CELL.smoke, e < 0.35 ? "120,84,62" : "74,68,64", Math.min(0.95, sa * 1.25), a - e);
          }
          break;
        }
        case "blood": {
          // schnelle Tropfen als Streifen in Flugrichtung, langsame als runde Tropfen
          const sp = Math.hypot(q.vx, q.vy);
          if (sp > 70) { const len = q.size * Math.min(6, 1.5 + sp * 0.012), ux = q.vx / sp, uy = q.vy / sp; flat(normB, q.x - ux * len * 0.6, q.z + 6, q.y - uy * len * 0.6, Math.atan2(q.vy, q.vx), len, q.size * 0.85, CELL.streak, hexRgb(q.color), 1); }
          else bill(normB, q.x, q.z + 6, q.y, q.size * 1.4, CELL.blob, hexRgb(q.color), 1);
          break;
        }
        case "mist": bill(normB, q.x, q.z + 4, q.y, q.size * (1.6 - k * 0.6) * 1.4, CELL.smoke, hexRgb(q.color), k * 0.55, q.x * 0.05); break;
        case "lvl": {
          // aufsteigende Funken um die Lichtsäule
          for (let i = 0; i < 14; i++) { const a = i * 0.45 + (1 - k) * 6, h = ((i * 37) % 100) / 100 * 200 * (1 - k * 0.3) + (1 - k) * 60; bill(addB, p.x + Math.cos(a) * 30, h, p.y + Math.sin(a) * 30, 4 + (i % 3), CELL.star, "255,230,140", k); }
          break;
        }
      }
    }
    // Spieler-Projektile
    let flameIdx = 0;
    for (const b of w.bullets) {
      if (b.kind === "flame") {
        if (quality < 2 && (++flameIdx & 1)) continue;
        const k = b.life / b.maxLife, size = 14 + (1 - k) * 18;
        bill(addB, b.x, 20, b.y, size * 1.3, CELL.glow, fireRgb(k), 0.95);
        bill(addB, b.x, 20, b.y, size * 0.5, CELL.glow, "255,240,190", 0.9 * k);
      } else if (b.kind === "grenade") {
        const k = 1 - b.life / b.maxLife;
        bill(addB, b.x, 14 + Math.sin(k * Math.PI) * 60, b.y, 9, CELL.glow, "255,80,40", Math.sin(t * 20) > 0 ? 0.9 : 0.3);
      } else if (b.kind === "bolt") {
        bill(addB, b.x, 22, b.y, 9, CELL.glow, b.tracer, 0.5);
      } else if (b.kind === "rocket") {
        const a = Math.atan2(b.vy, b.vx), tx = b.x - Math.cos(a) * 11, tz = b.y - Math.sin(a) * 11;
        bill(addB, tx, 22, tz, 12 + Math.random() * 4, CELL.glow, "255,170,60", 1);
        bill(addB, tx, 22, tz, 5, CELL.glow, "255,250,210", 1);
      } else if (b.kind === "disc") {
        bill(addB, b.x, 16, b.y, 16, CELL.glow, "220,235,255", 0.3);
      } else if (b.kind === "laser") {
        const sp = Math.hypot(b.vx, b.vy) || 1, len = 150, ang = Math.atan2(b.vy, b.vx);
        const cx = b.x - (b.vx / sp) * len * 0.5, cz = b.y - (b.vy / sp) * len * 0.5;
        flat(addB, cx, 22, cz, ang, len * 0.5, 5, CELL.streak, "255,40,40", 0.9);
        flat(addB, cx, 22.2, cz, ang, len * 0.5, 1.4, CELL.streak, "255,235,235", 1);
        bill(addB, b.x, 22, b.y, 12, CELL.glow, "255,70,70", 0.8);
      } else {
        const sp = Math.hypot(b.vx, b.vy) || 1, len = b.long ? 90 : Math.min(42, Math.max(14, sp * 0.035));
        const ang = Math.atan2(b.vy, b.vx);
        flat(addB, b.x - (b.vx / sp) * len * 0.5, 22, b.y - (b.vy / sp) * len * 0.5, ang, len * 0.5, Math.max(1.6, b.r * 0.9), CELL.streak, b.tracer, 1);
        bill(addB, b.x, 22, b.y, b.r * 3.2, CELL.glow, b.tracer, 0.75);
      }
    }
    // Tesla-Blitze
    for (const z of w.zaps) {
      const k = z.life / z.max, dx = z.x2 - z.x1, dy = z.y2 - z.y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, segs = Math.max(3, Math.round(len / 18));
      let px = z.x1, py = z.y1;
      for (let i = 1; i <= segs; i++) {
        const tt = i / segs, o = i === segs ? 0 : (Math.random() - 0.5) * 18;
        const qx = z.x1 + dx * tt + nx * o, qy = z.y1 + dy * tt + ny * o;
        const a = Math.atan2(qy - py, qx - px), l = Math.hypot(qx - px, qy - py) / 2 + 1;
        flat(addB, (px + qx) / 2, 26, (py + qy) / 2, a, l, 4, CELL.bolt, "90,180,255", k * 0.8);
        flat(addB, (px + qx) / 2, 26.5, (py + qy) / 2, a, l, 1.4, CELL.bolt, "235,250,255", k);
        px = qx; py = qy;
      }
      bill(addB, z.x2, 26, z.y2, 22, CELL.glow, "127,231,255", k);
    }
    // Wühler unter dem Boden: wandernder Erdhügel
    for (const e of w.enemies) if (e.under === "burrow") { flat(floorB, e.x, 1.1, e.y, e.face, 16, 11, CELL.blob, "60,46,32", 0.85); flat(floorB, e.x, 1.2, e.y, e.face, 9, 6, CELL.blob, "110,90,66", 0.7); }
    // Geworfene Brocken mit Zielkreis
    for (const q of w.lobs || []) {
      const k = Math.min(1, q.t / q.T), krug = q.kind === "krug", c = krug ? "255,190,60" : "255,60,40";
      if (q.kind !== "parcel") {
        flat(floorB, q.x1, 1.3, q.y1, 0, q.r, q.r, CELL.ring, c, 0.55 + 0.35 * Math.sin(t * 24));
        flat(floorB, q.x1, 1.2, q.y1, 0, q.r * k, q.r * k, CELL.glow, c, 0.4);
      }
      if (krug) { bill(normB, q.x, q.z + 6, q.y, 11, CELL.blob, "224,164,42", 1); bill(normB, q.x, q.z + 12, q.y, 8, CELL.blob, "255,248,232", 1); }
      else if (q.kind === "coal") { bill(normB, q.x, q.z + 6, q.y, 13, CELL.gib, "30,30,32", 1, q.spin); bill(addB, q.x, q.z + 6, q.y, 16, CELL.glow, "255,110,40", 0.6); }
      else if (q.kind !== "gift" && q.kind !== "parcel") bill(normB, q.x, q.z + 6, q.y, 14, CELL.gib, "122,117,108", 1, q.spin);
      flat(floorB, q.x, 0.9, q.y, 0, 10, 10, CELL.blob, "0,0,0", 0.35);
    }
    // v2.9 Wurfwaffen: Zielkreis in der Farbe der Waffe, Glühen am Wurfkörper; Böller knistern; Luftschlag-Markierungen
    for (const q of w.throws || []) {
      const st = w.throwStyle && w.throwStyle(q.kind), c = st ? st.rgb : "168,255,62", k = Math.min(1, q.t / q.T);
      flat(floorB, q.x1, 1.3, q.y1, 0, q.r, q.r, CELL.ring, c, 0.45 + 0.3 * Math.sin(t * 20));
      flat(floorB, q.x1, 1.2, q.y1, 0, q.r * k, q.r * k, CELL.glow, c, 0.25);
      bill(addB, q.x, q.z + 8, q.y, q.kind === "molotov" ? 16 : 9, CELL.glow, q.kind === "molotov" ? "255,150,50" : c, 0.6);
      flat(floorB, q.x, 0.9, q.y, 0, 8, 8, CELL.blob, "0,0,0", 0.35);
    }
    for (const q of w.decoys || []) {
      const blink = Math.sin(t * 26) > 0, k = Math.max(0, q.t / q.max), rr = 60 + 40 * (1 - k);
      flat(floorB, q.x, 1.3, q.y, 0, rr, rr, CELL.ring, "255,120,60", 0.3 + 0.25 * Math.sin(t * 6));
      bill(addB, q.x, 14, q.y, blink ? 12 : 7, CELL.glow, "255,220,120", 0.9);
    }
    for (const s2 of w.strikes || []) {
      const k = 1 - Math.max(0, s2.t / s2.max);
      flat(floorB, s2.x, 1.3, s2.y, 0, s2.r, s2.r, CELL.ring, "255,90,40", 0.55 + 0.35 * Math.sin(t * 26));
      flat(floorB, s2.x, 1.2, s2.y, 0, s2.r * k, s2.r * k, CELL.glow, "255,90,40", 0.35);
    }
    // Paketbomben am Boden: Warnkreis + blinkendes Licht
    for (const q of w.parcels || []) {
      const k = 1 - q.t / q.max, blink = Math.sin(t * (10 + 30 * k)) > 0;
      flat(floorB, q.x, 1.3, q.y, 0, q.r, q.r, CELL.ring, "255,60,40", blink ? 0.85 : 0.35);
      flat(floorB, q.x, 1.2, q.y, 0, q.r * k, q.r * k, CELL.glow, "255,60,40", 0.35);
      if (blink) bill(addB, q.x + 5, 16, q.y - 4, 10, CELL.glow, "255,40,30", 1);
    }
    for (const b of w.eBullets) {
      if (b.kind === "harpoon") { const sp = Math.hypot(b.vx, b.vy) || 1; flat(normB, b.x - (b.vx / sp) * 10, 22, b.y - (b.vy / sp) * 10, Math.atan2(b.vy, b.vx), 13, 1.6, CELL.streak, "230,235,240", 1); }
      else if (b.kind === "anchor" && b.owner) { const o = b.owner, dx = b.x - o.x, dy = b.y - o.y, len = Math.hypot(dx, dy) || 1; flat(normB, (o.x + b.x) / 2, 24, (o.y + b.y) / 2, Math.atan2(dy, dx), len / 2, 2.4, CELL.band, "70,76,84", 0.95); }
    }
    // Strahlen: Heilung, Schildverbindung, Laser-Visier
    for (const b of w.beams || []) {
      const k = Math.min(1, (b.life / b.max) * 2), dx = b.x2 - b.x1, dy = b.y2 - b.y1, len = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
      flat(addB, (b.x1 + b.x2) / 2, b.h || 24, (b.y1 + b.y2) / 2, a, len / 2, b.w * 1.4, CELL.bolt, b.rgb, 0.45 * k);
      flat(addB, (b.x1 + b.x2) / 2, (b.h || 24) + 0.5, (b.y1 + b.y2) / 2, a, len / 2, b.w * 0.4, CELL.bolt, "255,255,255", 0.6 * k);
      bill(addB, b.x2, b.h || 24, b.y2, b.w * 4, CELL.glow, b.rgb, 0.8 * k);
    }
    // Markierungsring unter dem Spieler
    flat(normB, p.x, 0.9, p.y, 0, 25, 25, CELL.ring, "140,255,74", 0.5);
    flat(floorB, p.x, 1, p.y, 0, 30, 30, CELL.glow, "140,255,74", 0.18);
    // Gegner-Projektile, XP-Kugeln, Augen, Status
    for (const b of w.eBullets) {
      if (b.slug) { const sp = Math.hypot(b.vx, b.vy) || 1; flat(addB, b.x - (b.vx / sp) * 14, 22, b.y - (b.vy / sp) * 14, Math.atan2(b.vy, b.vx), 14, 2, CELL.streak, "255,190,90", 1); bill(addB, b.x, 22, b.y, 9, CELL.glow, "255,220,150", 0.9); continue; }
      if (b.kind === "candy") { bill(addB, b.x, 16, b.y, 12, CELL.glow, b.rgb, 0.45); continue; }
      if (b.kind) { flat(floorB, b.x, 0.9, b.y, 0, 8, 8, CELL.blob, "0,0,0", 0.3); continue; }
      bill(addB, b.x, 18, b.y, b.r * 3.2, CELL.glow, b.rgb, 0.7);
    }
    for (const o of w.orbs) if (o.type === "heal") { bill(addB, o.x, 9, o.y, 20 + Math.sin(t * 6) * 3, CELL.glow, "120,255,140", 0.55); flat(floorB, o.x, 0.9, o.y, 0, 16, 16, CELL.ring, "120,255,140", 0.6); }
    // v3.4 Laternen am Wahrzeichen: warme Lichtinseln am Boden
    for (const o of w.obstacles) if (o.landmark && !o.dead) {
      const round = o.w / o.h < 1.6, ex = (o.w / 2 + 30) * (round ? 0.72 : 1), ez = (round ? o.h / 2 + 30 : o.h / 2 + 26) * (round ? 0.72 : 1), cx = o.x + o.w / 2, cz = o.y + o.h / 2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { flat(floorB, cx + sx * ex, 0.8, cz + sz * ez, 0, 34, 34, CELL.glow, "255,214,150", 0.32); bill(addB, cx + sx * ex, 43, cz + sz * ez, 10, CELL.glow, "255,224,160", 0.5); }
    }
    // v3.4 weicher Kontaktschatten unter Hindernissen, wenn keine Schattenkarte läuft (Grafikstufe 1), und unter fliegenden Krähen
    if (w.player && w.state !== "over") flashShadows(w); // v3.8
    if (quality < 2) for (const o of w.obstacles) if (!o.dead && !o.gateBar) flat(normB, o.x + o.w / 2 + 6, 0.5, o.y + o.h / 2 + 8, 0, o.w / 2 + 14, o.h / 2 + 14, CELL.blob, "0,0,0", 0.42);
    for (const b of w.birds || []) if (b.fly) flat(normB, b.x, 0.6, b.y, 0, 6, 4, CELL.blob, "0,0,0", Math.max(0, 0.35 - b.z / 600));
    // v3.3 Beutekiste: Lichtsäule (senkrechtes, zur Kamera gedrehtes Quad), Schein und Ring in der Seltenheitsfarbe
    for (const o of w.orbs) if (o.type === "gear") {
      const rgb = LOOT_CSS[(o.item && o.item.r) || 0], pulse = 0.75 + 0.25 * Math.sin(t * 5 + o.x);
      const hl = Math.hypot(camR.x, camR.z) || 1, rr = (o.item && o.item.r) || 0, bh = 80 + 40 * rr;
      const [lr, lg, lb] = lin(rgb), ux = camR.x / hl, uz = camR.z / hl;
      addB.add(o.x, bh * 0.42, o.y, ux * 15, 0, uz * 15, 0, bh * 0.5, 0, CELL.glow, lr, lg, lb, 0.7 * pulse); // breiter Schein
      addB.add(o.x, bh * 0.42, o.y, ux * 5, 0, uz * 5, 0, bh * 0.5, 0, CELL.glow, 1, 1, 1, 0.35 * pulse); // heller Kern
      bill(addB, o.x, 10, o.y, 24 * pulse, CELL.glow, rgb, 0.6);
      flat(floorB, o.x, 0.9, o.y, t * 0.6, 20, 20, CELL.ring, rgb, 0.7 * pulse);
    }
    // v3.7 Autoalarm: Blinker an allen vier Ecken · Brand: Feuerschein · Hochspannung: blauer Ring und Schein am Boden
    for (const o of w.obstacles) {
      if (o.alarmT > 0 && Math.sin(t * 13) > 0) for (const [fx, fz] of [[0.04, 0.1], [0.96, 0.1], [0.04, 0.9], [0.96, 0.9]]) { bill(addB, o.x + o.w * fx, 16, o.y + o.h * fz, 13, CELL.glow, "255,170,40", 0.95); flat(floorB, o.x + o.w * fx, 0.8, o.y + o.h * fz, 0, 22, 22, CELL.glow, "255,150,40", 0.45); }
      if (o.fireAt && !o.dead) { const hx = o.vert ? o.x + o.w / 2 : o.x + o.w * 0.75, hz = o.vert ? o.y + o.h * 0.25 : o.y + o.h / 2; flat(floorB, hx, 0.9, hz, 0, 70, 70, CELL.glow, "255,120,40", 0.35 + 0.1 * Math.sin(t * 17)); }
    }
    for (const h of w.hazards || []) if (h.kind === "shock") {
      const k = Math.min(1, h.life / 0.6) * (0.75 + 0.25 * Math.sin(t * 40));
      flat(floorB, h.x, 1, h.y, t * 3, h.r, h.r, CELL.ring, "140,220,255", 0.55 * k);
      flat(floorB, h.x, 0.9, h.y, 0, h.r * 1.2, h.r * 1.2, CELL.glow, "90,170,255", 0.3 * k);
    }
    // v3.7 Power-ups: Lichtsäule, Schein, kreisender Bodenring – Aura am Helden, Schutzschild als Blase
    for (const o of w.orbs) if (o.type === "power") {
      const pulse = 0.75 + 0.25 * Math.sin(o.t * 5), hl = Math.hypot(camR.x, camR.z) || 1, ux = camR.x / hl, uz = camR.z / hl, [lr, lg, lb] = lin(o.rgb), a = o.t > 11 && Math.sin(o.t * 20) < 0 ? 0.35 : 1;
      addB.add(o.x, 58, o.y, ux * 13, 0, uz * 13, 0, 66, 0, CELL.glow, lr, lg, lb, 0.55 * pulse * a);
      addB.add(o.x, 58, o.y, ux * 4, 0, uz * 4, 0, 66, 0, CELL.glow, 1, 1, 1, 0.18 * pulse * a);
      bill(addB, o.x, 24, o.y, 40 * pulse, CELL.glow, o.rgb, 0.42 * a);
      flat(floorB, o.x, 0.9, o.y, o.t * 1.5, 26, 26, CELL.ring, o.rgb, 0.8 * pulse * a);
      flat(floorB, o.x, 0.8, o.y, 0, 40, 40, CELL.glow, o.rgb, 0.35 * a);
    }
    if (w.powers && w.powers.length && w.player) {
      const p = w.player;
      w.powers.forEach((rgb, i) => { flat(floorB, p.x, 0.95, p.y, t * 2.4 + i * 2, 30 + i * 6, 30 + i * 6, CELL.ring, rgb, 0.5); if (i < 2) bill(addB, p.x, 22, p.y, 40, CELL.glow, rgb, 0.09); });
    }
    for (const e of w.enemies) if (e.looter && !e.dead && e.spawnT <= 0) { // v3.7 Plünderer: goldener Schein und Ring
      flat(floorB, e.x, 0.95, e.y, t * 3, 30, 30, CELL.ring, "255,210,90", 0.7);
      bill(addB, e.x, 26, e.y, 46, CELL.glow, "255,200,80", 0.22);
    }
    if (w.shield > 0 && w.player) {
      const p = w.player, a = w.shield < 2 && Math.sin(t * 18) < 0 ? 0.3 : 1;
      bill(addB, p.x, 26, p.y, 58, CELL.ring, "90,200,255", 0.38 * a);
      bill(addB, p.x, 26, p.y, 60, CELL.glow, "60,160,255", 0.07 * a);
      bill(addB, p.x - 9, 36, p.y, 12, CELL.glow, "220,245,255", 0.18 * a);
    }
    for (const o of w.orbs) if (o.type === "xp") { const y = 12 + Math.sin(t * 6 + o.x) * 2; bill(addB, o.x, y, o.y, 11, CELL.glow, "90,200,255", 0.85); bill(addB, o.x, y, o.y, 4, CELL.glow, "220,250,255", 1); }
    for (const e of w.enemies) {
      if (e.spawnT > 0) continue;
      const M = models.get(e);
      const hh = heightOf(e) * 0.84;
      const fx = Math.cos(e.face), fy = Math.sin(e.face);
      const eye = EYE[e.type] || "255,40,30";
      bill(addB, e.x + fx * e.r * 0.5, hh, e.y + fy * e.r * 0.5, e.def.boss ? e.r * 0.4 : e.r * 0.55, CELL.glow, eye, 0.5);
      if (e.type === "bomber" && Math.sin(t * 14 + e.wob) > 0) bill(addB, e.x - fx * e.r * 0.4, hh * 0.85, e.y - fy * e.r * 0.4, 14, CELL.glow, "255,40,20", 0.9);
      if (e.type === "mother") bill(addB, e.x - fx * e.r * 0.4, e.r * 1.2, e.y - fy * e.r * 0.4, e.r * 1.2, CELL.glow, "150,255,80", 0.3);
      if (e.phase2 || e.rageT > 0) bill(addB, e.x, e.r, e.y, e.r * 1.8, CELL.glow, "255,40,60", 0.22 + 0.12 * Math.sin(t * 10));
      if (e.elite) { flat(floorB, e.x, 1, e.y, 0, e.r * 2.6, e.r * 2.6, CELL.glow, "255,200,80", 0.45 + 0.15 * Math.sin(t * 5)); flat(floorB, e.x, 1.1, e.y, t, e.r * 1.8, e.r * 1.8, CELL.ring, "255,215,110", 0.6); }
      if (e.evo) { // v3.7 Evolution: Boden-Aura in Stufenfarbe, Mutationsblitz, Sprungbahn, Brüll-Welle, Fress-Ring
        const er = EVO_RGB[e.evo], rr = e.r * (e.evo === 3 ? 2.5 : e.evo === 2 ? 2 : 1.6);
        flat(floorB, e.x, 1.05, e.y, t * (0.4 + e.evo * 0.3), rr, rr, e.evo === 1 ? CELL.ring : CELL.shock, er, e.evo === 1 ? 0.32 + 0.1 * Math.sin(t * 5 + e.wob) : 0.26 + 0.1 * Math.sin(t * 4 + e.wob));
        if (e.evo === 1) flat(floorB, e.x, 1, e.y, 0, rr * 1.2, rr * 1.2, CELL.glow, "110,230,60", 0.22); // giftgrüner Schein
        if (e.evo === 3) bill(addB, e.x - fx * e.r * 0.3, hh * 0.62, e.y - fy * e.r * 0.3, e.r * 0.9, CELL.glow, "255,60,50", 0.3 + 0.12 * Math.sin(t * 6 + e.wob));
        if (e.evoFx > 0) { bill(addB, e.x, hh * 0.5, e.y, e.r * 4.2 * e.evoFx, CELL.glow, er, e.evoFx * 0.75); flat(floorB, e.x, 1.4, e.y, 0, e.r * 4 * (1.2 - e.evoFx), e.r * 4 * (1.2 - e.evoFx), CELL.ring, er, e.evoFx); }
        if (e.evoCrouch > 0) { const a = e.leapAng, L2 = 170; flat(normB, e.x + Math.cos(a) * L2 / 2, 1.2, e.y + Math.sin(a) * L2 / 2, a, L2 / 2, e.r * 0.7, CELL.band, er, 0.32 + 0.25 * Math.sin(t * 30)); }
        if (e.roarFx > 0) { const k = 1 - e.roarFx / 0.7, r2 = 30 + 230 * k; flat(floorB, e.x, 1.3, e.y, 0, r2, r2, CELL.ring, "255,70,60", e.roarFx); flat(floorB, e.x, 1.2, e.y, 0, r2, r2, CELL.glow, "255,40,40", e.roarFx * 0.25); }
      }
      if (e.feed && e.feed.t > 0) flat(floorB, e.feed.c.x, 1.2, e.feed.c.y, t * 2, 26, 26, CELL.ring, EVO_RGB[Math.min(3, (e.evo || 0) + 1)], 0.55);
      if (e.type === "burner") bill(addB, e.x, hh * 0.6 + (e.jumpZ || 0), e.y, e.r * 2.2, CELL.glow, "255,140,40", 0.45 + 0.15 * Math.sin(t * 17 + e.wob));
      if (e.type === "electro") bill(addB, e.x - fx * e.r * 0.5, hh * 0.75, e.y - fy * e.r * 0.5, e.r * (e.mode === "zap" ? 2.4 : 1.1), CELL.glow, "127,231,255", e.mode === "zap" ? 0.8 : 0.35);
      if (e.shield > 0) { const k = 0.45 + 0.2 * Math.sin(t * 12 + e.wob); bill(addB, e.x, hh * 0.5, e.y, e.r * 2.6, CELL.ring, "140,210,255", k); bill(addB, e.x, hh * 0.5, e.y, e.r * 2.4, CELL.glow, "120,190,255", 0.18); flat(floorB, e.x, 1.2, e.y, t * 2, e.r * 1.8, e.r * 1.8, CELL.ring, "140,210,255", k * 0.8); }
      if (e.type === "healer") { bill(addB, e.x + fx * e.r * 1.2, hh * 1.1, e.y + fy * e.r * 1.2, e.r * (e.mode === "heal" ? 1.6 : 0.9), CELL.glow, "140,255,138", 0.7); }
      if (e.type === "warden") bill(addB, e.x - fx * e.r * 0.75, hh * 0.68, e.y - fy * e.r * 0.75, e.r * (0.9 + 0.2 * Math.sin(t * 6)), CELL.glow, "127,208,255", 0.6);
      if (e.type === "burrower") bill(addB, e.x + fx * e.r * 0.55, hh * 1.02, e.y + fy * e.r * 0.55, e.r * 0.7, CELL.glow, "255,246,192", 0.9);
      if (e.type === "phantom") bill(addB, e.x, hh * 0.6, e.y, e.r * 2.2, CELL.glow, "150,110,220", 0.18 + 0.08 * Math.sin(t * 9 + e.wob));
      if (e.type === "nest") flat(floorB, e.x, 1, e.y, 0, e.r * 2.2, e.r * 2.2, CELL.glow, "200,80,200", 0.25 + 0.1 * Math.sin(t * 4 + e.wob));
      if (e.mode === "crouch") { const a = Math.atan2(e.dirY, e.dirX), L = 200; flat(normB, e.x + Math.cos(a) * L / 2, 1.2, e.y + Math.sin(a) * L / 2, a, L / 2, e.r * 0.8, CELL.band, "255,70,50", 0.3 + 0.25 * Math.sin(t * 30)); }
      if (e.mode === "zap") { const rr = 150 * (1 - Math.max(0, e.aiT) / 0.75 * 0.4); flat(floorB, e.x, 1.3, e.y, 0, rr, rr, CELL.ring, "127,231,255", 0.55 + 0.3 * Math.sin(t * 25)); }
      if (e.mode === "whistle") { const k = 1 - Math.max(0, e.aiT) / 0.75; flat(floorB, e.x, 1.3, e.y, 0, 200, 200, CELL.ring, "255,230,120", 0.5 + 0.3 * Math.sin(t * 28)); flat(floorB, e.x, 1.25, e.y, 0, 200 * k, 200 * k, CELL.ring, "255,245,190", 0.6); flat(floorB, e.x, 1.2, e.y, 0, 200, 200, CELL.glow, "255,220,90", 0.12 * k); }
      if (e.type === "ultra") { const a = e.face - Math.PI / 2, bx = e.x + Math.cos(a) * e.r * 1.1, bz = e.y + Math.sin(a) * e.r * 1.1; bill(addB, bx, hh * 0.72, bz, e.r * (1.5 + 0.4 * Math.random()), CELL.glow, "255,70,40", 0.75); bill(addB, bx, hh * 0.72, bz, e.r * 0.5, CELL.glow, "255,240,220", 0.9); }
      // v2.1: Warnflächen der Bosse und E-Scooter
      if (e.mode === "tele" && e.tele) {
        const q = e.tele, kk = 1 - Math.max(0, q.t) / q.max, rgb = q.rgb || "255,50,40", pulse = 0.5 + 0.3 * Math.sin(t * 26);
        if (q.k === "lane") {
          const a = q.ang, L2 = q.len;
          flat(normB, e.x + Math.cos(a) * L2 / 2, 1.2, e.y + Math.sin(a) * L2 / 2, a, L2 / 2, q.w / 2, CELL.band, rgb, 0.22 + 0.25 * kk);
          flat(floorB, e.x + Math.cos(a) * L2 * kk / 2, 1.4, e.y + Math.sin(a) * L2 * kk / 2, a, Math.max(1, L2 * kk / 2), q.w / 2, CELL.band, rgb, 0.35);
        } else if (q.k === "cone") {
          for (let i = 0; i <= 8; i++) { const a = q.ang - q.arc / 2 + (q.arc * i) / 8, w2 = Math.max(4, q.r * Math.sin(q.arc / 16)); flat(normB, e.x + Math.cos(a) * q.r / 2, 1.2, e.y + Math.sin(a) * q.r / 2, a, q.r / 2, w2, CELL.band, rgb, (i === 0 || i === 8 ? 0.6 : 0.22) + 0.2 * kk); }
          flat(floorB, e.x + Math.cos(q.ang) * q.r * kk * 0.5, 1.4, e.y + Math.sin(q.ang) * q.r * kk * 0.5, 0, q.r * kk * 0.5, q.r * kk * 0.5, CELL.glow, rgb, 0.3);
        } else {
          flat(floorB, q.x, 1.3, q.y, 0, q.r, q.r, CELL.ring, rgb, pulse);
          flat(floorB, q.x, 1.25, q.y, 0, q.r * kk, q.r * kk, CELL.ring, rgb, 0.55);
          flat(floorB, q.x, 1.2, q.y, 0, q.r, q.r, CELL.glow, rgb, 0.1 + 0.15 * kk);
        }
      }
      // Warnfläche vor Sturmangriff
      if (e.mode === "wind") {
        const kk = 1 - Math.max(0, e.aiT) / 0.65, L = e.type === "abom" ? 380 : 260, a = Math.atan2(e.dirY, e.dirX);
        flat(normB, e.x + Math.cos(a) * L / 2, 1.2, e.y + Math.sin(a) * L / 2, a, L / 2, e.r, CELL.band, "255,50,50", 0.25 + 0.3 * kk);
        flat(floorB, e.x + Math.cos(a) * L * kk / 2, 1.4, e.y + Math.sin(a) * L * kk / 2, a, Math.max(1, L * kk / 2), e.r, CELL.band, "255,60,60", 0.35);
      }
    }
    // Waffe: Mündungsfeuer, Zündflamme, Aura, Schulterlicht
    const mz = w.muzzlePoint();
    if (p.muzzle > 0 && p.weapon.flash) {
      const sc = (0.75 + Math.random() * 0.35) * (p.weapon.flash === "flame" ? 0.6 : p.weapon.flash === "big" ? 1.3 : 1);
      const mzc = p.weapon.flash === "tesla" ? "160,240,255" : p.weapon.flash === "laser" ? "255,120,120" : "255,230,150";
      bill(addB, mz.x, 24, mz.y, 16 * sc, CELL.star, mzc, 1, Math.random() * TAU);
      bill(addB, mz.x, 24, mz.y, 30 * sc, CELL.flare, mzc, 0.8, Math.random() * 0.6 - 0.3); // v3.5 Linsenblitz
      bill(addB, mz.x, 24, mz.y, 34, CELL.glow, p.weapon.tracer, 0.75);
    }
    if (p.weapon.kind === "flame") bill(addB, mz.x, 22, mz.y, 5, CELL.glow, "110,200,255", 0.9);
    if (p.weapon.kind === "tesla") bill(addB, mz.x, 24, mz.y, 9 + Math.sin(t * 20) * 2, CELL.glow, "127,231,255", 0.8);
    if (p.tier >= 2) bill(addB, (p.x + mz.x) / 2, 26, (p.y + mz.y) / 2, 22, CELL.glow, "180,107,255", 0.3 + 0.1 * Math.sin(t * 5));
    for (let i = 0; i < p.drones; i++) { const d = w.dronePos(i); bill(addB, d.x + 6, 58, d.y + 30, 9, CELL.glow, "127,231,255", 0.8); }
    // Raum: leuchtende Fässer/Tanks, Tür-Pfeile, Versorgungskiste
    for (const l of w.roomLights) bill(addB, l.x, 40, l.y, l.r * 0.42, CELL.glow, l.rgb, (0.3 + 0.08 * Math.sin(t * 3 + l.x)) * glowLevel(l, t));
    const dk = w.run.doorK || 0;
    if (dk > 0) {
      for (let i = 0; i < 3; i++) flat(floorB, D.W / 2, 1.5, D.T + 26 + i * 24 - ((t * 40) % 24), -Math.PI / 2, 12, 15, CELL.chevron, "140,255,74", dk * (0.8 - i * 0.22));
      bill(addB, D.W / 2, 30, D.T, 70, CELL.glow, "140,255,74", dk * 0.45);
    }
    if (w.supplyCrate) bill(addB, w.supplyCrate.x, 30, w.supplyCrate.y, 60, CELL.glow, "140,255,74", 0.35 + 0.12 * Math.sin(t * 4));
    if (w.miniSpot) { const m = w.miniSpot, k = 0.5 + 0.5 * Math.sin(t * 4); flat(floorB, m.x, 1.5, m.y + 10, 0, m.r + 14, m.r + 14, CELL.ring, "255,212,92", 0.35 + 0.35 * k); bill(addB, m.x, 40, m.y, 50, CELL.glow, "255,200,110", 0.18 + 0.08 * k); }
    // Umgebungspartikel
    const th = w.theme;
    for (const a of w.ambient) {
      const y = 40 + Math.sin(a.ph * 0.6 + a.x) * 30;
      if (th === "lab") bill(addB, a.x, y, a.y, a.size * 2.5, CELL.glow, "140,255,90", 0.3 + 0.2 * Math.sin(a.ph * 2));
      else bill(normB, a.x, y, a.y, a.size * 1.2, CELL.blob, th === "street" ? "190,190,190" : "230,240,235", 0.35);
    }
    drawAtmo(t);
    // Menü: Hubschrauber – Lichtfleck des Suchscheinwerfers, Positionslichter, Blitzer
    if (heliOn(w) && heli) {
      flat(floorB, heliState.x, 1.1, heliState.z, w.menuCam ? -t * 0.16 : 0, 70, 26, CELL.blob, "0,0,0", 0.35); // Schatten des Hubschraubers
      flat(floorB, heliState.tx, 1.4, heliState.tz, 0, 70, 70, CELL.glow, "225,235,255", 0.55);
      flat(floorB, heliState.tx, 1.5, heliState.tz, 0, 46, 46, CELL.glow, "255,255,255", 0.35);
      const m = heli.g.matrixWorld, nav = (x, y, z, rgb, sz, a) => { tmpV.set(x, y, z).applyMatrix4(m); bill(addB, tmpV.x, tmpV.y, tmpV.z, sz, CELL.glow, rgb, a); };
      nav(0, -2, 15, "255,40,40", 12, 0.9); nav(0, -2, -15, "60,255,90", 12, 0.9);
      if (Math.sin(t * 9) > 0.85) nav(-76, 22, 0, "255,255,255", 26, 1);
      nav(22, -10, 0, "255,250,230", 22, 1);
    }
    // Menü: Lichtbalken auf dem Polizeiwagen
    if (w.menuCam) for (const o of w.obstacles) if (o.kind === "car") {
      const cx = o.x + o.w / 2, cz = o.y + o.h / 2, red = Math.floor(t * 4) % 2 === 0;
      bill(addB, cx - 8, 46, cz, red ? 30 : 12, CELL.glow, "255,40,40", red ? 1 : 0.35);
      bill(addB, cx + 8, 46, cz, red ? 12 : 30, CELL.glow, "60,110,255", red ? 0.35 : 1);
      flat(floorB, cx, 1, cz, 0, 120, 120, CELL.glow, red ? "255,40,40" : "60,110,255", 0.22);
    }
    // Wandlampen
    if (room) for (let i = 0; i < room.lamps.length; i++) {
      const l = room.lamps[i];
      const fl = lampLevel(l, t);
      flat(floorB, l.px, 0.8, l.pz, 0, 92, 92, CELL.glow, room.lampRgb, 0.3 * fl);
      bill(addB, l.x, 48, l.z, 15, CELL.glow, room.lampRgb, 0.95 * fl);
      bill(addB, l.x, 48, l.z, 5, CELL.glow, "255,255,240", fl);
    }
    wetFloor(w, t);
    // v3.6 Leuchtende Augen im Dunkeln (mit Tiefentest, leicht zur Kamera versetzt) und Boden-Aura der Bosse
    if (!w.menuCam && quality >= 1) {
      let ne = 0;
      for (const [e, M] of models) {
        if (e.def && e.def.boss) {
          const rg = e.phase2 || e.rageT > 0, rr = (e.r || 30) * 2.1 * (1 + 0.06 * Math.sin(t * 3));
          flat(floorB, e.x, 1.7, e.y, t * 0.6, rr, rr, CELL.shock, rg ? "255,60,40" : "190,90,255", 0.42 + 0.16 * Math.sin(t * 4));
          flat(floorB, e.x, 1.6, e.y, 0, rr * 0.8, rr * 0.8, CELL.glow, rg ? "255,40,20" : "140,60,220", 0.22);
        }
        const hd = M.extra && M.extra.head;
        if (!hd || e.dead || e.spawnT > 0 || e.under || ne > 70 || M.kind === "armored") continue;
        const r = (M.height || 33) / 2.75, hr = 0.4 * r, ec = e.evo ? EVO_EYE[e.evo] : EYE[e.type] || "255,52,40", el = hd.matrixWorld;
        for (const sd of [-1, 1]) {
          tmpV.set(hr * 0.9, 0.06 * r, sd * 0.15 * r).applyMatrix4(el);
          tmpV.x += (camera.position.x - tmpV.x) * 0.012; tmpV.y += (camera.position.y - tmpV.y) * 0.012; tmpV.z += (camera.position.z - tmpV.z) * 0.012;
          bill(floorB, tmpV.x, tmpV.y, tmpV.z, r * (e.evo ? 0.26 : 0.2), CELL.glow, ec, e.evo ? 0.9 : 0.75);
        }
        ne++;
      }
    }
    // v3.6 Schwebeteilchen im Taschenlampenkegel: Staub und Nieselregen glitzern im Licht (wirkt wie ein echter Lichtkegel)
    if (!w.menuCam && w.state !== "over" && quality >= 1) {
      const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
      for (let i = 0; i < 28; i++) {
        const d = 36 + ((i * 53.7 + t * (9 + (i % 4) * 3)) % 230), side = Math.sin(i * 1.73 + t * 0.31) * d * 0.33, hgt = 10 + ((i * 31) % 42) + Math.sin(t * 0.7 + i) * 5;
        const x = p.x + ca * d - sa * side, z = p.y + sa * d + ca * side, tw = 0.55 + 0.45 * Math.sin(t * 3.1 + i * 2.3);
        bill(addB, x, hgt, z, 1.3 + (i % 3) * 0.5, CELL.glow, "255,240,210", 0.5 * (1 - d / 280) * (1 - Math.abs(side) / (d * 0.4 + 1)) * tw);
      }
    }
    addB.end(); normB.end(); floorB.end(); shadeB.end();
  }


  // ------------------------------------------------------------------
  // Atmosphäre: Regen mit Spritzern, Blitze, Bodennebel, flackernde Lampen, Alarmlicht
  // ------------------------------------------------------------------
  const atmo = { theme: "street", weather: "rain", fest: "", flash: 0, flashT: -9, bolt: 0, drops: [], splash: [], mist: [], outT: -9, nextOut: 0, strings: [] };
  const OUTDOOR = { street: true, markt: true };
  const CONFETTI = ["255,74,90", "255,210,58", "74,209,255", "125,255,106", "255,122,224", "255,255,255"];
  let cinematic = true; // Blitze & Stromausfälle (Einstellung „Kino-Effekte“)
  let viewZ = 0; // v3.4: Mitte des sichtbaren Bereichs längs der Arena (Regen, Mondschatten)
  const newDrop = (d, anyY) => { d.x = D.L - 140 + Math.random() * (D.R - D.L + 280); d.z = (viewZ || (D.T + D.B) / 2) - 660 + Math.random() * 1140; d.y = anyY ? Math.random() * 380 : 320 + Math.random() * 80; d.v = 820 + Math.random() * 280; return d; };
  function setupAtmo(theme, weather, fest = "") {
    // Wetter nur draußen (Straße, Altstadt); Nebel überall
    const wx = weather || (theme === "street" ? "rain" : "none");
    atmo.weather = OUTDOOR[theme] || wx === "fog" ? wx : "none";
    atmo.theme = theme; atmo.fest = fest; atmo.flashT = -9; atmo.bolt = time + 4 + Math.random() * 6; atmo.nextOut = time + 8 + Math.random() * 8; atmo.splash.length = 0;
    atmo.drops.length = 0;
    const n = atmo.weather === "rain" || atmo.weather === "fog" && OUTDOOR[theme] ? 300 : atmo.weather === "snow" || atmo.weather === "confetti" ? 220 : 0;
    for (let i = 0; i < n; i++) { const d = newDrop({}, true); d.c = i % CONFETTI.length; d.ph = Math.random() * TAU; atmo.drops.push(d); }
    atmo.mist.length = 0;
    for (let i = 0; i < (atmo.weather === "fog" ? 22 : 12); i++) atmo.mist.push({ x: D.L + Math.random() * (D.R - D.L), z: D.T + Math.random() * (D.B - D.T), s: 90 + Math.random() * 120, v: 5 + Math.random() * 9, rot: Math.random() * TAU });
    // Lichterketten quer über Altstadt und Festplätze
    atmo.strings.length = 0;
    if (theme === "markt" || ((fest === "weihnachten" || fest === "wiesn" || fest === "karneval") && theme === "street")) {
      for (const [y0, dy] of [[D.T + 170, 40], [D.T + 420, -30], [D.T + 660, 30]]) {
        for (let k = 0; k <= 22; k++) { const u = k / 22, x = D.L + u * (D.R - D.L), z = y0 + dy * u, h = 72 - Math.sin(u * Math.PI) * 18; atmo.strings.push([x, h, z, k]); }
      }
    }
  }
  // v2.8: jedes dritte leuchtende Objekt hat einen Wackelkontakt – Licht und Schein setzen gemeinsam kurz aus
  const glowLevel = (l, t) => ((((l.x * 7 + l.y * 3) | 0) % 3 === 0 && Math.sin(t * 0.9 + l.x * 0.37) > 0.8 && Math.sin(t * 37 + l.y) > -0.3) ? 0.2 : 1);
  function lampLevel(l, t) {
    let k = 1;
    if (l.flicker) k = l.fluor ? (Math.sin(t * 31 + l.x) + Math.sin(t * 5.1 + l.z) > 1.4 ? 0.2 : Math.random() < 0.03 ? 0.5 : 1) : Math.sin(t * 23) + Math.sin(t * 7.3 + 1) > 1.25 ? 0.15 : 1;
    const ot = t - atmo.outT;
    if (ot >= 0 && ot < 0.6) k *= Math.sin(ot * 70) > 0 ? 0.08 : 0.7; // kurzer Stromausfall
    return k;
  }
  const alarmPulse = (t) => Math.pow(Math.max(0, Math.sin(t * 3.4)), 3);
  function updateAtmo(dt, t) {
    const n = Math.min(atmo.drops.length, quality >= 2 ? 300 : 180), slow = atmo.weather === "snow" || atmo.weather === "confetti";
    for (let i = 0; i < n; i++) {
      const d = atmo.drops[i];
      if (slow) { d.y -= d.v * 0.09 * dt; d.x += Math.sin(t * 1.3 + d.ph) * 22 * dt; d.ph += dt * 3; if (d.y <= 0) newDrop(d, false); continue; }
      d.y -= d.v * dt; d.x += 70 * dt;
      if (d.y <= 0) { if (atmo.splash.length < 70 && d.x > D.L && d.x < D.R && d.z > D.T && d.z < D.B) atmo.splash.push({ x: d.x, z: d.z, t: 0 }); newDrop(d, false); }
    }
    let j = 0;
    for (const sp of atmo.splash) if ((sp.t += dt) < 0.3) atmo.splash[j++] = sp;
    atmo.splash.length = j;
    for (const m of atmo.mist) { m.x += m.v * dt; m.rot += dt * 0.04; if (m.x - m.s > D.R + 80) { m.x = D.L - m.s; m.z = D.T + Math.random() * (D.B - D.T); } }
    // Blitz (Straße): doppeltes Aufflackern, Donner mit Laufzeit
    if (cinematic && atmo.weather === "rain" && t > atmo.bolt) {
      atmo.bolt = t + 7 + Math.random() * 12; atmo.flashT = t;
      const delay = 0.4 + Math.random() * 1.3;
      if (window.GameAudio) GameAudio.thunder(delay, 0.6 + Math.random() * 0.4);
      if (window.__fx4d) window.__fx4d("thunder", delay * 1000);
    }
    const ft = t - atmo.flashT;
    atmo.flash = ft < 0 ? 0 : ft < 0.07 ? 1 : ft < 0.15 ? 0.2 : ft < 0.22 ? 0.8 : Math.max(0, 0.8 - (ft - 0.22) * 3.5);
    // Krankenhaus: Stromausfall-Flackern ab und zu
    if (cinematic && atmo.theme === "hospital" && t > atmo.nextOut) { atmo.nextOut = t + 11 + Math.random() * 12; atmo.outT = t; }
    if (!room) return;
    const ot = t - atmo.outT, out = ot >= 0 && ot < 0.6 ? (Math.sin(ot * 70) > 0 ? 0.55 : 0.85) : 1;
    hemi.intensity = room.baseHemi * (1 + atmo.flash * 1.5) * out;
    moon.intensity = room.baseMoon * (1 + atmo.flash * 2.4);
    for (const c of room.cones) c.material.opacity = 0.075 * lampLevel(c.userData.lamp, t);
  }
  function drawAtmo(t) {
    const n = Math.min(atmo.drops.length, quality >= 2 ? 300 : 180);
    if (n && atmo.weather === "snow") for (let i = 0; i < n; i++) { const d = atmo.drops[i]; bill(normB, d.x, d.y, d.z, 2.6 + (i % 3) * 0.8, CELL.blob, "240,246,255", 0.9); }
    else if (n && atmo.weather === "confetti") for (let i = 0; i < n; i++) { const d = atmo.drops[i]; bill(normB, d.x, d.y, d.z, 2.4, CELL.blob, CONFETTI[d.c], 1, d.ph); }
    // Regen: senkrechte Schlieren, zur Kamera gedreht
    else if (n) {
      const [r, g, b] = lin("195,210,240"), hx = camR.x * 1.05, hz = camR.z * 1.05;
      for (let i = 0; i < n; i++) { const d = atmo.drops[i]; addB.add(d.x, d.y + 14, d.z, 1.6, 14, 0, hx, 0, hz, CELL.streak, r, g, b, 0.34 + atmo.flash * 0.4); }
      for (const sp of atmo.splash) { const k = sp.t / 0.3, rr = 2 + k * 9; flat(floorB, sp.x, 0.9, sp.z, 0, rr, rr, CELL.ring, "190,210,240", 0.45 * (1 - k)); }
    }
    // Bodennebel (Hafennebel deutlich dichter)
    const tint = atmo.theme === "lab" ? "120,170,130" : atmo.theme === "hospital" ? "170,190,180" : atmo.theme === "markt" ? "150,140,130" : "120,135,160";
    const ma = atmo.weather === "fog" ? 0.2 : 0.12;
    for (const m of atmo.mist) flat(normB, m.x, 3 + (m.s % 7), m.z, m.rot, m.s, m.s * 0.7, CELL.smoke, tint, ma + atmo.flash * 0.06);
    // Lichterketten: Weihnachtsmarkt warmweiß, Wiesn weiß-blau, Karneval bunt
    for (const [x, h, z, k] of atmo.strings) {
      const rgb = atmo.fest === "wiesn" ? (k % 2 ? "120,170,255" : "255,255,255") : atmo.fest === "karneval" ? CONFETTI[k % CONFETTI.length] : "255,206,130";
      const tw = 0.75 + 0.25 * Math.sin(t * 3 + k * 1.7);
      bill(addB, x, h, z, 7, CELL.glow, rgb, 0.8 * tw); bill(addB, x, h, z, 2.2, CELL.glow, "255,255,240", tw);
    }
    // Labor: rotierender Alarmschein
    if (room && room.beacons.length) {
      const k = alarmPulse(t);
      for (const [bx, bz] of room.beacons) { bill(addB, bx, 72, bz, 26 * (0.4 + k), CELL.glow, "255,50,30", 0.3 + 0.7 * k); flat(floorB, bx, 1.4, bz + 140, t * 3.4, 150, 22, CELL.band, "255,40,30", 0.18 * k); }
    }
  }
  // 3D-Requisiten an den Wänden: rein dekorativ, keine Kollision (Kugeln fliegen hindurch)
  function addProps(deco, w) {
    let s = 7 + (w.obstacles ? w.obstacles.length * 13 : 0) + w.theme.length * 31;
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const free = (x, z, r) => !(w.obstacles || []).some((o) => x + r > o.x - 10 && x - r < o.x + o.w + 10 && z + r > o.y - 10 && z - r < o.y + o.h + 10);
    const spots = [];
    for (let i = 0; i < 26 && spots.length < 9; i++) {
      const side = R() < 0.5 ? -1 : 1, x = side < 0 ? D.L + 15 : D.R - 15, z = D.T + 70 + R() * (D.B - D.T - 140);
      if (free(x, z, 14) && !spots.some(([px, pz]) => Math.abs(pz - z) < 60 && px === x)) spots.push([x, z, side]);
    }
    for (const [x, z, side] of spots) {
      const k = Math.floor(R() * 4);
      if (w.theme === "street") {
        if (k === 0) { deco.add(mesh(box(14, 2, 14), slam("#1a1a1a"), x, 1, z)); deco.add(mesh(cone(6, 18, 8), slam("#ff6a1a"), x, 11, z)); deco.add(mesh(cyl(3.6, 4.4, 3, 8), slam("#f0f0e8"), x, 11, z)); }
        else if (k === 1) for (const y of [3.2, 9.6]) { const tr = mesh(torus(7, 3), slam("#1c1c1e"), x, y, z); tr.rotation.x = Math.PI / 2; deco.add(tr); }
        else if (k === 2) for (const [dx, dz, rr] of [[0, 0, 8], [-side * 6, 10, 6.5], [-side * 3, -9, 6]]) { const bag = mesh(ico(rr, 1), slam("#141618"), x + dx, rr * 0.7, z + dz); bag.scale.set(1, 0.75, 1); deco.add(bag); }
        else { deco.add(mesh(cyl(4, 5, 16, 10), slam("#b8231c"), x, 8, z)); deco.add(mesh(ico(4.6, 1), slam("#b8231c"), x, 16, z)); for (const d of [-1, 1]) { const c2 = mesh(cyl(1.6, 1.6, 4, 6), slam("#d8b23a"), x, 10, z + d * 5); c2.rotation.x = Math.PI / 2; deco.add(c2); } }
      } else if (w.theme === "hospital") {
        if (k === 0) { deco.add(mesh(cyl(0.9, 0.9, 42, 6), slam("#b8c0c4"), x, 21, z)); deco.add(mesh(box(6, 10, 3), slam("#cfe8e0"), x, 36, z)); deco.add(mesh(box(16, 1.5, 2), slam("#5a6066"), x, 1, z)); deco.add(mesh(box(2, 1.5, 16), slam("#5a6066"), x, 1, z)); }
        else if (k === 1) { deco.add(mesh(cyl(7, 6, 16, 10), slam("#e8c21a"), x, 8, z)); deco.add(mesh(cyl(7.5, 7.5, 2, 10), slam("#c9a514"), x, 17, z)); }
        else if (k === 2) { deco.add(mesh(box(14, 2, 14), slam("#6a7a80"), x, 10, z)); deco.add(mesh(box(2, 14, 14), slam("#6a7a80"), x + side * 6, 17, z)); for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) deco.add(mesh(box(1.5, 10, 1.5), slam("#3a4248"), x + dx, 5, z + dz)); }
        else { deco.add(mesh(box(26, 3, 14), slam("#c8d0d4"), x - side * 4, 16, z)); deco.add(mesh(box(26, 2, 14), slam("#8a9298"), x - side * 4, 5, z)); deco.add(mesh(box(8, 4, 6), slam("#f4f4f0"), x - side * 6, 19.5, z + 2)); for (const [dx, dz] of [[-11, -6], [11, -6], [-11, 6], [11, 6]]) deco.add(mesh(box(1.5, 16, 1.5), slam("#4a5258"), x - side * 4 + dx, 8, z + dz)); }
      } else if (w.theme === "markt") {
        if (k === 0) {
          // Gartenzwerg mit roter Zipfelmütze und weißem Bart
          deco.add(mesh(cyl(3.6, 4.6, 8, 8), slam("#2f5a9a"), x, 4, z)); deco.add(mesh(ico(3.2, 1), slam("#f0c8a0"), x, 10.5, z));
          deco.add(mesh(cone(3.6, 8, 8), slam("#c0281e"), x, 16, z)); deco.add(mesh(cone(2.4, 5, 6), slam("#f4f4f0"), x - side * 2.6, 8.4, z));
          deco.add(mesh(cyl(4.5, 4.5, 1.2, 8), slam("#3a6a2a"), x, 0.6, z));
        } else if (k === 1) {
          // Litfaßsäule mit Plakaten
          deco.add(mesh(cyl(9, 9, 44, 14), slam("#e8e0c8"), x, 22, z));
          for (const [y, c] of [[12, "#c0281e"], [22, "#e8c21a"], [32, "#3a7fd0"]]) deco.add(mesh(cyl(9.3, 9.3, 7, 14), slam(c), x, y, z));
          deco.add(mesh(cone(11, 8, 14), slam("#2f4a3a"), x, 48, z)); deco.add(mesh(cyl(10.5, 10.5, 2, 14), slam("#2f4a3a"), x, 44, z));
        } else if (k === 2) {
          deco.add(mesh(cyl(8, 6, 10, 10), slam("#7a5a3a"), x, 5, z));
          for (let i = 0; i < 6; i++) deco.add(mesh(ico(2.2, 0), slam(i % 2 ? "#d8283a" : "#ffd23a"), x + Math.cos(i) * 4, 11 + (i % 2), z + Math.sin(i) * 4));
          deco.add(mesh(ico(5, 1), slam("#3a6a2a"), x, 9.5, z));
        } else {
          // Fahrrad am Ständer
          for (const dz of [-9, 9]) { const wh = mesh(torus(6, 0.9), slam("#1a1a1a"), x, 6.5, z + dz); wh.rotation.y = Math.PI / 2; deco.add(wh); }
          deco.add(mesh(box(1.4, 1.4, 18), slam("#c0281e"), x, 10, z)); deco.add(mesh(box(1.2, 8, 1.2), slam("#c0281e"), x, 9, z - 3)); deco.add(mesh(box(5, 1, 3), slam("#222"), x, 13.5, z - 3));
        }
      } else {
        if (k === 0 || k === 1) { deco.add(mesh(cyl(6, 6, 26, 12), slam("#3a4a58"), x, 13, z)); deco.add(mesh(cyl(6.3, 6.3, 3, 12), sbasic(k ? "#7fffb0" : "#ffcf4a"), x, 18, z)); deco.add(mesh(cyl(3, 3, 3, 8), slam("#8a949b"), x, 27, z)); }
        else if (k === 2) { deco.add(mesh(box(12, 22, 16), slam("#1e2328"), x, 11, z)); deco.add(mesh(box(1, 8, 11), sbasic("#4af0ff"), x - side * 6.2, 15, z)); }
        else { deco.add(mesh(box(18, 8, 12), slam("#4a5560"), x, 4, z)); for (let i = 0; i < 6; i++) deco.add(mesh(cyl(1.2, 1.2, 7, 6), sbasic(["#7fffb0", "#ff6ad5", "#4af0ff"][i % 3]), x - 6 + (i % 3) * 6, 11, z - 3 + Math.floor(i / 3) * 6)); }
      }
    }
    // Labor: Rohrleitungen entlang beider Wände
    if (w.theme === "lab") for (const x of [D.L + 5, D.R - 5]) for (const [y, c] of [[10, "#4a5a52"], [17, "#7a3a2a"]]) { const pipe = mesh(cyl(2.4, 2.4, D.B - D.T - 40, 8), slam(c), x, y, (D.T + D.B) / 2); pipe.rotation.x = Math.PI / 2; deco.add(pipe); }
  }

  // v2.8 Kleinkram: Dosen, Flaschen, Papier, Kartons, Ziegel, Kabel – macht leere Flächen glaubwürdig.
  // Liegt flach am Boden (kein Sichtschutz, keine Kollision) und wird mit der Deko zusammengebacken.
  function addClutter(deco, w) {
    let s = 91 + (w.obstacles ? w.obstacles.length * 17 : 0) + w.theme.length * 53 + String(w.district || "").length * 7;
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const free = (x, z, r) => !(w.obstacles || []).some((o) => x + r > o.x - 4 && x - r < o.x + o.w + 4 && z + r > o.y - 4 && z - r < o.y + o.h + 4);
    const doorX = D.W / 2, th = w.theme;
    const paper = th === "hospital" ? ["#e8ecea", "#d8e4f0"] : ["#cfc6b4", "#b8b0a0", "#e0d8c4"];
    let placed = 0;
    for (let i = 0; i < 90 && placed < 22; i++) {
      // zwei Drittel an Wänden und Hindernissen entlang, der Rest frei verteilt
      let x, z;
      if (R() < 0.65) { const side = R() < 0.5; x = side ? D.L + 10 + R() * 40 : D.R - 10 - R() * 40; z = D.T + 40 + R() * (D.B - D.T - 80); }
      else { x = D.L + 30 + R() * (D.R - D.L - 60); z = D.T + 40 + R() * (D.B - D.T - 80); }
      if (Math.abs(x - doorX) < D.DOOR_W && z < D.T + 90) continue;
      if (!free(x, z, 8)) continue;
      placed++;
      const k = R(), rot = R() * Math.PI;
      let m;
      if (k < 0.3) { m = mesh(box(7 + R() * 4, 0.4, 5 + R() * 3), slam(paper[Math.floor(R() * paper.length)]), x, 0.3, z); m.rotation.set((R() - 0.5) * 0.2, rot, (R() - 0.5) * 0.2); }
      else if (k < 0.45) { m = mesh(cyl(1.6, 1.6, 4.2, 8), slam(["#b8231c", "#2a5aa8", "#c8c8c0", "#3a8a3a"][Math.floor(R() * 4)]), x, 1.6, z); m.rotation.set(Math.PI / 2, rot, 0); }
      else if (k < 0.58) { m = mesh(cyl(1.1, 1.5, 7, 8), slam(th === "lab" ? "#6ad8c8" : ["#2a5a2a", "#5a3a14", "#2a4a5a"][Math.floor(R() * 3)]), x, 1.5, z); m.rotation.set(Math.PI / 2, rot, 0.1); }
      else if (k < 0.72 && x < D.L + 60 || k < 0.72 && x > D.R - 60) { m = mesh(box(10 + R() * 6, 6 + R() * 4, 8 + R() * 4), slam(th === "hospital" ? "#b8b0a0" : "#8a6a42"), x, 3.5, z); m.rotation.y = rot; }
      else if (k < 0.84) { m = mesh(box(6, 3, 3), slam(th === "markt" ? "#7a6a5a" : "#7a3a2a"), x, 1.5, z); m.rotation.set(0, rot, (R() - 0.5) * 0.4); }
      else if (k < 0.92) { m = mesh(torus(5 + R() * 3, 0.7, Math.PI * (0.8 + R() * 0.8)), slam("#18181a"), x, 0.7, z); m.rotation.set(Math.PI / 2, 0, rot); }
      else { m = mesh(ico(3 + R() * 2, 0), slam(th === "lab" ? "#2a3a40" : "#1a1c1e"), x, 1.6, z); m.scale.set(1.2, 0.55, 1); m.rotation.y = rot; } // Müllbeutel
      deco.add(m);
    }
  }

  // Punktlicht-Pool: die stärksten Lichtquellen des Frames bekommen echtes Licht
  const lightCands = [];
  function assignLights(w, t) {
    lightCands.length = 0;
    const p = w.player;
    if (p.muzzle > 0 && p.weapon.flash) { const m = w.muzzlePoint(); lightCands.push([m.x, 28, m.y, p.weapon.tracer, 3.4, 300, 10]); }
    for (const q of w.particles) {
      if (q.t === "flash") lightCands.push([q.x, 30, q.y, q.rgb, 3.8 * (q.life / q.max), q.r * 1.9, 9]);
      else if (q.t === "boom") { const k = q.life / q.max; lightCands.push([q.x, 50, q.y, k > 0.7 ? "255,220,170" : "255,140,50", 6.5 * k, q.r * 4, 11]); } // erst weiß-heiß, dann glühend orange
      else if (q.t === "lvl") lightCands.push([w.player.x, 60, w.player.y, "255,225,130", 3 * (q.life / q.max), 260, 10]);
    }
    for (const z of w.zaps) lightCands.push([z.x2, 30, z.y2, "127,231,255", 2.2 * (z.life / z.max), 200, 8]);
    for (const q of w.gates || []) if (q.warn > 0) lightCands.push([q.side < 0 ? D.L + 12 : D.R - 12, 46, q.y, "255,40,24", 3.4 * (0.45 + 0.55 * Math.abs(Math.sin(t * 9))), 320, 10]); // v3.0 Horden-Warnlicht
    for (const q of w.decoys || []) lightCands.push([q.x, 20, q.y, "255,180,80", 1.2 + Math.random() * 1.2, 150, 6]); // v2.9 Böller knistert
    for (const o of w.obstacles) {
      if (o.dead) continue;
      if (o.kind === "polizeiauto") lightCands.push([o.x + o.w / 2, 48, o.y + o.h / 2, Math.sin(t * 15) > 0 ? "70,120,255" : "255,50,40", 2.4, 230, 6]);
      else if (o.kind === "leuchtturm") lightCands.push([o.x + o.w / 2 + Math.cos(t * 1.3) * 120, 60, o.y + o.h / 2 - Math.sin(t * 1.3) * 120, "255,236,170", 2.2, 260, 6]);
      else if (o.kind === "zentrifuge") lightCands.push([o.x + o.w / 2, 40, o.y + o.h / 2, "120,255,150", 1.2, 120, 4]);
    }
    for (const o of w.orbs) if (o.type === "gear") lightCands.push([o.x, 46, o.y, LOOT_CSS[(o.item && o.item.r) || 0], 1.2, 170, 7]); // v3.3 Beutekiste (schwach, sonst überstrahlt die Kiste)
    for (const o of w.orbs) if (o.type === "power") lightCands.push([o.x, 40, o.y, o.rgb, 1.6, 180, 8]); // v3.7 Power-up
    for (const o of w.obstacles) {
      if (o.alarmT > 0 && Math.sin(t * 13) > 0) lightCands.push([o.x + o.w / 2, 24, o.y + o.h / 2, "255,160,40", 1.8, 160, 6]);
      if (o.fireAt && !o.dead) lightCands.push([o.x + o.w / 2, 30, o.y + o.h / 2, "255,120,40", 2.2 + Math.random() * 0.8, 230, 7]);
    }
    for (const e of w.enemies) if (e.looter && !e.dead) lightCands.push([e.x, 40, e.y, "255,210,90", 1.5, 170, 7]);
    for (const e of w.enemies) if (e.evo && !e.dead) { if (e.evo === 3) lightCands.push([e.x, 36, e.y, "255,60,50", 1.1, 150, 5]); if (e.evoFx > 0) lightCands.push([e.x, 30, e.y, EVO_RGB[e.evo], 3 * e.evoFx, 210, 8]); }
    for (const h of w.hazards || []) if (h.kind === "shock") lightCands.push([h.x, 30, h.y, "140,220,255", 1.4 + Math.random() * 1.6, h.r * 1.6, 8]);
    if (w.powers && w.powers.length && w.player) lightCands.push([w.player.x, 30, w.player.y, w.powers[0], 1.1, 150, 8]);
    for (const e of w.enemies) {
      if (e.burnT > 0 || e.type === "burner") lightCands.push([e.x, 26, e.y, "255,140,40", 1.4, 150, 4]);
      if (e.mode === "zap") lightCands.push([e.x, 40, e.y, "127,231,255", 2.2, 200, 7]);
      if (e.type === "ultra") lightCands.push([e.x, 34, e.y, "255,60,40", 1.3 + Math.random() * 0.5, 170, 4]); // Bengalo flackert
      if (e.mode === "whistle") lightCands.push([e.x, 40, e.y, "255,226,130", 1.6, 220, 6]);
    }
    for (const b of w.bullets) if (b.kind === "rocket") lightCands.push([b.x, 26, b.y, "255,160,60", 2, 160, 6]);
    let fires = 0;
    for (const b of w.bullets) if (b.kind === "flame" && fires++ % 6 === 0) lightCands.push([b.x, 22, b.y, "255,150,50", 1.8, 160, 5]);
    for (const l of w.roomLights) lightCands.push([l.x, 50, l.y, l.rgb, (1.3 + 0.2 * Math.sin(t * 3 + l.x)) * glowLevel(l, t), l.r * 1.8, 2]);
    if ((w.run.doorK || 0) > 0) lightCands.push([D.W / 2, 40, D.T + 10, "140,255,74", 1.6 * w.run.doorK, 220, 3]);
    if (w.supplyCrate) lightCands.push([w.supplyCrate.x, 50, w.supplyCrate.y, "140,255,74", 1.6, 220, 3]);
    if (w.miniSpot) lightCands.push([w.miniSpot.x, 60, w.miniSpot.y + 10, "255,200,110", 1.5, 200, 3]);
    if (w.menuCam) {
      for (const o of w.obstacles) if (o.kind === "car") { const red = Math.floor(t * 4) % 2 === 0; lightCands.push([o.x + o.w / 2, 52, o.y + o.h / 2, red ? "255,40,40" : "60,110,255", 3.4, 320, 6]); }
      if (heli) lightCands.push([heliState.tx, 60, heliState.tz, "215,228,255", 3.6, 240, 9]); // Suchscheinwerfer
      // Studio-Licht für den Helden: warmes Führungslicht von der Kamera, kühles Gegenlicht von hinten
      const kx = camera.position.x - p.x, kz = camera.position.z - p.y, kl = Math.hypot(kx, kz) || 1;
      lightCands.push([p.x + (kx / kl) * 110, 105, p.y + (kz / kl) * 110, "255,234,212", 2.4, 330, 12]);
      lightCands.push([p.x - (kx / kl) * 80, 85, p.y - (kz / kl) * 80, "120,165,255", 2.6, 240, 11]);
    }
    if (!w.menuCam && heliFly.active && heli) lightCands.push([heliState.tx, 60, heliState.tz, "215,228,255", 3.2, 230, 9]); // v3.6 Suchscheinwerfer beim Überflug
    if (room && room.beacons.length) { const k = alarmPulse(t); if (k > 0.05) for (const [bx, bz] of room.beacons) lightCands.push([bx, 70, bz + 30, "255,40,30", 3 * k, 380, 3]); }
    lightCands.sort((a, b) => b[6] - a[6] || b[4] - a[4]);
    for (let i = 0; i < pool.length; i++) {
      const L = pool[i], c = lightCands[i];
      if (!c) { L.intensity = 0; continue; }
      L.position.set(c[0], c[1], c[2]);
      const [r, g, b] = lin(c[3]);
      L.color.setRGB(r, g, b);
      L.intensity = c[4] * 2;
      L.distance = c[5];
    }
    // Taschenlampe
    flashlight.position.set(p.x - Math.cos(p.aim) * 6, 42, p.y - Math.sin(p.aim) * 6);
    flashlight.target.position.set(p.x + Math.cos(p.aim) * 240, 0, p.y + Math.sin(p.aim) * 240);
    flashlight.target.updateMatrixWorld();
    beam.position.copy(flashlight.position);
    beam.rotation.set(0, -p.aim, -0.16);
    beam.visible = w.state !== "over";
  }

  // ------------------------------------------------------------------
  // v2.8 Leuchten (Bloom) + Farbstimmung
  // ------------------------------------------------------------------
  // Die Szene landet in einer Halbfloat-Render-Textur – und zwar genau so, wie sie sonst auf dem Bildschirm
  // landen würde (Tonemapping + sRGB je Pixel, additive Effekte mischen im selben Farbraum). Dafür gilt das
  // Ziel für three.js als „XR-Ziel“: nur dort wendet es Tonemapping und Ausgabe-Farbraum auf Render-Targets an.
  // Ohne Glühen ist das Bild deshalb pixelgleich zur direkten Ausgabe, und die Shader-Programme sind dieselben.
  // Helle Stellen – Mündungsfeuer, Explosionen, Augen, Lampen, Blitze – werden auf Viertel-Auflösung
  // weichgezeichnet und aufaddiert; zuletzt kommen Sättigung und Stadt-Farbton dazu.
  // Nur bei Grafikstufe 2; fällt die Bildrate, senkt das Spiel die Stufe und der Effekt entfällt.
  let post = null, postWanted = true, postBroken = false;
  const shockU = [0, 1, 2, 3].map(() => new T3.Vector4());
  const postSize = new T3.Vector2(), postTint = new T3.Vector3(1, 1, 1);
  const POST_VS = "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  function makePost() {
    const ext = renderer.extensions, full = ext.has("EXT_color_buffer_float");
    if (!full && !ext.has("EXT_color_buffer_half_float")) return null; // ohne Halbfloat-Ziel: direkte Ausgabe wie bisher
    const tOpt = { type: T3.HalfFloatType, generateMipmaps: false, minFilter: T3.LinearFilter, magFilter: T3.LinearFilter };
    const main = new T3.WebGLRenderTarget(4, 4, { ...tOpt, samples: full ? Math.min(4, renderer.capabilities.maxSamples || 0) : 0 });
    main.texture.colorSpace = T3.SRGBColorSpace; // Halbfloat: bleibt RGBA16F, die Shader schreiben sRGB-Werte hinein
    main.isXRRenderTarget = true;
    const a = new T3.WebGLRenderTarget(4, 4, { ...tOpt, depthBuffer: false }), b = new T3.WebGLRenderTarget(4, 4, { ...tOpt, depthBuffer: false });
    // v3.8 zweite, weite Leucht-Stufe in Achtel-Auflösung (weicher Dunst um Lichter) – vier winzige Durchgänge
    const c = new T3.WebGLRenderTarget(4, 4, { ...tOpt, depthBuffer: false }), d = new T3.WebGLRenderTarget(4, 4, { ...tOpt, depthBuffer: false });
    const sm = (frag, uniforms, toneMapped = false) => new T3.ShaderMaterial({ uniforms, vertexShader: POST_VS, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped });
    const bright = sm(`uniform sampler2D src; uniform vec2 texel; uniform float th; varying vec2 vUv;
float lum = 0.0;
vec3 tap(vec2 o) { vec3 c = texture2D(src, vUv + o * texel).rgb; float l = max(c.r, max(c.g, c.b)); lum += dot(c, vec3(0.299, 0.587, 0.114)); return c * smoothstep(th, th + 0.22, l); }
// v3.8: Alpha trägt die mittlere Bildhelligkeit – nach dem Weichzeichnen die Grundlage für den lokalen Kontrast
void main() { vec3 g = (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25; gl_FragColor = vec4(g, lum * 0.25); }`,
    { src: { value: null }, texel: { value: new T3.Vector2() }, th: { value: 0.8 } });
    const blur = sm(`uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec4 c = texture2D(src, vUv) * 0.227;
  c += (texture2D(src, vUv + dir * 1.385) + texture2D(src, vUv - dir * 1.385)) * 0.316;
  c += (texture2D(src, vUv + dir * 3.231) + texture2D(src, vUv - dir * 3.231)) * 0.07;
  gl_FragColor = c;
}`, { src: { value: null }, dir: { value: new T3.Vector2() } });
    // v3.0: Druckwellen verzerren das Bild ringförmig (bis zu 4 gleichzeitig), leichter Farbsaum zum Rand hin,
    // bei Treffern kurz entsättigt und rötlich
    // v3.8: zweistufiges Leuchten (eng + weit), Nachschärfen (gleicht die begrenzte 3D-Auflösung aus), lokaler Kontrast
    // aus der weichgezeichneten Helligkeit, Rauschmuster gegen Farbstufen in dunklen Verläufen
    const comp = sm(`uniform sampler2D src; uniform sampler2D glow; uniform sampler2D glow2; uniform float k; uniform float k2; uniform float sat; uniform vec3 tint;
uniform vec4 shock[4]; uniform float aspect; uniform float ca; uniform float hurt; uniform vec2 grade; uniform float slowk;
uniform vec2 texel; uniform float sharp; uniform float clarity; varying vec2 vUv;
void main() {
  vec2 off = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 s = shock[i];
    if (s.w > 0.0) {
      vec2 d = (vUv - s.xy) * vec2(aspect, 1.0);
      float dl = length(d) + 1e-4;
      float ring = smoothstep(s.z - 0.07, s.z, dl) * (1.0 - smoothstep(s.z, s.z + 0.05, dl));
      off += (d / dl) / vec2(aspect, 1.0) * ring * s.w * 0.035;
    }
  }
  vec2 uv = vUv - off;
  float a = ca + length(off) * 0.3;
  vec2 dir = vUv - 0.5;
  vec3 c = vec3(texture2D(src, uv + dir * a).r, texture2D(src, uv).g, texture2D(src, uv - dir * a).b);
  // Nachschärfen: Abstand zum Mittel der vier Nachbarn, begrenzt (kein Überschwingen an harten Kanten)
  vec3 nb = (texture2D(src, uv + vec2(texel.x, 0.0)).rgb + texture2D(src, uv - vec2(texel.x, 0.0)).rgb + texture2D(src, uv + vec2(0.0, texel.y)).rgb + texture2D(src, uv - vec2(0.0, texel.y)).rgb) * 0.25;
  c += clamp(c - nb, -0.07, 0.07) * sharp;
  vec4 g1 = texture2D(glow, uv), g2 = texture2D(glow2, uv);
  // lokaler Kontrast: heller als die Umgebung → etwas heller, dunkler → etwas dunkler (nicht in sehr hellen Zonen: keine Höfe um Lampen)
  float l0 = dot(c, vec3(0.299, 0.587, 0.114));
  c *= 1.0 + clarity * clamp(l0 - g2.a, -0.14, 0.14) * 2.2 * (1.0 - smoothstep(0.45, 0.9, g2.a));
  c += g1.rgb * k + g2.rgb * k2;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat) * tint;
  // v3.5 Filmlook: sanfte S-Kurve (mehr Tiefe in Schatten und Mitten), kühle Schatten, warme Lichter
  vec3 cs = clamp(c, 0.0, 1.0);
  c = mix(c, cs * cs * (3.0 - 2.0 * cs), grade.x);
  c *= mix(vec3(0.93, 0.99, 1.07), vec3(1.05, 1.0, 0.93), smoothstep(0.12, 0.7, l) * grade.y + (1.0 - grade.y) * 0.5);
  c = mix(c, vec3(l) * vec3(1.25, 0.75, 0.72), hurt * 0.4);
  // v3.7 Power-up Zeitlupe: kühler, entsättigter Filmlook, zum Rand hin stärker (Lichter bleiben farbig)
  float vg = smoothstep(0.2, 0.85, length((vUv - 0.5) * vec2(aspect, 1.0)));
  c = mix(c, vec3(l) * vec3(0.8, 0.9, 1.2), slowk * (0.35 + 0.4 * vg) * (1.0 - smoothstep(0.55, 0.95, l)));
  // Rauschmuster (±½ Farbstufe, „interleaved gradient noise“): löst Streifen in dunklen Verläufen auf
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); // Werte sind schon Bildschirm-sRGB
}`, { src: { value: null }, glow: { value: null }, glow2: { value: null }, k: { value: 0.7 }, k2: { value: 0.5 }, sat: { value: 1.06 }, tint: { value: postTint }, shock: { value: shockU }, aspect: { value: 1 }, ca: { value: 0.001 }, hurt: { value: 0 }, grade: { value: new T3.Vector2(0.26, 1) }, slowk: { value: 0 },
      texel: { value: new T3.Vector2() }, sharp: { value: 0.55 }, clarity: { value: 0.4 } });
    const quad = new T3.Mesh(new T3.PlaneGeometry(2, 2), comp), sc = new T3.Scene();
    quad.frustumCulled = false;
    sc.add(quad);
    return { main, a, b, c, d, quad, sc, cam: new T3.Camera(), bright, blur, comp, w: 0, h: 0 };
  }
  const postActive = () => postWanted && quality >= 2 && !postBroken;
  // Druckwellen aus neuen Explosionen (Feuerball-Partikel „boom“) – Bildschirmposition über die Kamera
  const shocks = [], seenBoom = new WeakSet();
  function updateShocks(w) {
    for (const q of w.particles) if (q.t === "boom" && !seenBoom.has(q)) { seenBoom.add(q); shocks.push({ x: q.x, y: q.y, t0: time, pow: Math.min(1.4, 0.5 + q.r / 120) }); }
    for (let i = shocks.length - 1; i >= 0; i--) if (time - shocks[i].t0 > 0.55) shocks.splice(i, 1);
    while (shocks.length > 4) shocks.shift();
    for (let i = 0; i < 4; i++) {
      const s = shocks[i];
      if (!s) { shockU[i].set(0, 0, 0, 0); continue; }
      const a = (time - s.t0) / 0.55;
      pv.set(s.x, 20, s.y).project(camera);
      shockU[i].set((pv.x + 1) / 2, (pv.y + 1) / 2, 0.02 + a * 0.42, s.pow * (1 - a) * (1 - a));
    }
  }
  function ensurePost() {
    if (!postActive()) return null;
    if (!post) {
      try { post = makePost(); } catch (e) { post = null; }
      if (!post) { postBroken = true; return null; }
    }
    return post;
  }
  function renderFrame(w) {
    const P = ensurePost();
    if (!P) { renderer.render(scene, camera); return; }
    try {
      renderer.getDrawingBufferSize(postSize);
      const W = postSize.x, H = postSize.y;
      if (W !== P.w || H !== P.h) {
        P.w = W; P.h = H;
        P.main.setSize(W, H);
        const qw = Math.max(1, Math.round(W / 4)), qh = Math.max(1, Math.round(H / 4));
        P.a.setSize(qw, qh); P.b.setSize(qw, qh);
        const ew = Math.max(1, Math.round(W / 8)), eh = Math.max(1, Math.round(H / 8));
        P.c.setSize(ew, eh); P.d.setSize(ew, eh);
      }
      renderer.setRenderTarget(P.main);
      renderer.render(scene, camera);
      const { quad, sc, cam, a, b, c, d } = P;
      quad.material = P.bright; P.bright.uniforms.src.value = P.main.texture; P.bright.uniforms.texel.value.set(1 / W, 1 / H);
      renderer.setRenderTarget(a); renderer.render(sc, cam);
      const u = P.blur.uniforms;
      quad.material = P.blur;
      u.src.value = a.texture; u.dir.value.set(1 / a.width, 0); renderer.setRenderTarget(b); renderer.render(sc, cam);
      u.src.value = b.texture; u.dir.value.set(0, 1 / a.height); renderer.setRenderTarget(a); renderer.render(sc, cam);
      // weite Stufe: enges Leuchten in Achtel-Auflösung zweimal weichzeichnen (zweiter Durchgang mit doppeltem Abstand)
      u.src.value = a.texture; u.dir.value.set(1 / c.width, 0); renderer.setRenderTarget(d); renderer.render(sc, cam);
      u.src.value = d.texture; u.dir.value.set(0, 1 / c.height); renderer.setRenderTarget(c); renderer.render(sc, cam);
      u.src.value = c.texture; u.dir.value.set(2 / c.width, 0); renderer.setRenderTarget(d); renderer.render(sc, cam);
      u.src.value = d.texture; u.dir.value.set(0, 2 / c.height); renderer.setRenderTarget(c); renderer.render(sc, cam);
      quad.material = P.comp; P.comp.uniforms.src.value = P.main.texture; P.comp.uniforms.glow.value = a.texture; P.comp.uniforms.glow2.value = c.texture;
      P.comp.uniforms.texel.value.set(1 / W, 1 / H);
      updateShocks(w);
      P.comp.uniforms.aspect.value = W / H;
      P.comp.uniforms.hurt.value = Math.min(1, ((w.player && w.player.hurtT) || 0) * 3);
      const su = P.comp.uniforms.slowk; su.value += ((w.slowPu ? 1 : 0) - su.value) * Math.min(1, frameDt * 4);
      renderer.setRenderTarget(null); renderer.render(sc, cam);
    } catch (err) {
      console.warn("[Outbreak] Leuchteffekte abgeschaltet", err && err.message);
      postBroken = true;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  // Alle Shader vorab übersetzen – auch für noch unsichtbare Effekte (Explosion, Säule, Leichen).
  // Sonst kompiliert der Browser sie mitten im Kampf, wenn sie zum ersten Mal erscheinen (Ruckler).
  function warmShaders() {
    warmPending = false;
    try {
      // Parallel im Hintergrund, wenn der Treiber es kann – sonst sofort (passiert beim Raumwechsel).
      // Viele Treiber übersetzen erst beim ersten Einsatz fertig: Uniforms/Attribute abfragen erzwingt das jetzt.
      if (renderer.compileAsync && renderer.extensions.has("KHR_parallel_shader_compile")) renderer.compileAsync(scene, camera).catch(() => {});
      else { renderer.compile(scene, camera); for (const p of renderer.info.programs) { p.getUniforms(); p.getAttributes(); } }
    } catch (e) { /* nur Vorarbeit – im Fehlerfall kompiliert three.js beim ersten Zeichnen */ }
  }

  function render(w, dt, shake) {
    if (!ready) return;
    time += dt;
    const t = time;
    if (w.floorCanvas !== builtFloor) buildRoom(w);
    // Neue Blutspuren erst gesammelt hochladen (Textur-Upload ist auf Handys teuer)
    if (w.consumeFloorDirty && t - lastFloorUpload > (quality >= 2 ? 0.3 : 0.6) && w.consumeFloorDirty()) { room.floorTex.needsUpdate = true; if (room.glossTex) room.glossTex.needsUpdate = true; lastFloorUpload = t; }
    const punch = w.camPunch || { x: 0, y: 0, fov: 0 };
    const sx = (shake ? (Math.random() - 0.5) * shake * 1.6 : 0) + punch.x * 0.95;
    const sz = (shake ? (Math.random() - 0.5) * shake * 1.6 : 0) + punch.y * 0.95;
    const k = Math.min(1, dt * 3);
    CAM.fx += ((w.player.x - D.W / 2) * 0.025 - CAM.fx) * k;
    // v3.4 lange Arena: die Übersicht fährt längs mit (beim Raumaufbau springt sie, siehe buildRoom); kleine Nachführung bleibt
    if (!w.menuCam) { const zt = topZ(w.player.y); CAM.tz += (zt - CAM.tz) * Math.min(1, dt * 3); CAM.fz += ((w.player.y - 100 - CAM.tz) * 0.06 - CAM.fz) * k; }
    // Boss-Auftritt und Boss-Tod: Kamera fährt an den Boss heran
    let bossK = 0, bx = 0, bz = 0;
    for (const e of w.enemies) if (e.def.boss && e.spawnT > 0) { bossK = Math.sin(Math.min(1, 1 - e.spawnT / e.spawnMax) * Math.PI); bx = e.x - CAM.tx; bz = e.y - CAM.tz; }
    for (const [c, d] of dying) if (d.boss && c.t < 2) { bossK = Math.sin(Math.min(1, c.t / 2) * Math.PI) * 0.9; bx = c.x - CAM.tx; bz = c.y - CAM.tz; }
    CAM.boss += (bossK - CAM.boss) * Math.min(1, dt * 5);
    // v3.0 Kill-Cam: beim letzten Abschuss eines Bezirks kurz heranfahren
    const kc = w.killCam, kTarget = kc ? Math.sin(Math.min(1, 1 - kc.t / kc.max) * Math.PI) : 0;
    CAM.kill = (CAM.kill || 0) + (kTarget - (CAM.kill || 0)) * Math.min(1, dt * 8);
    if (kc) { CAM.kx = kc.x - CAM.tx; CAM.kz = kc.y - CAM.tz; }
    // Raumwechsel: Kamera setzt aus etwas größerer Höhe auf
    const intro = w.intro || 0;
    frameDt = dt;
    if (w.menuCam) placeMenuCamera(t, w);
    else if (camMode !== "top") {
      const P = CAM_MODES[camMode], pl = w.player, kf = Math.min(1, dt * P.follow);
      if (!CAM.fol) CAM.fol = { x: pl.x, z: pl.y };
      CAM.fol.x += (pl.x - CAM.fol.x) * kf; CAM.fol.z += (pl.y - CAM.fol.z) * kf;
      const wantFov = P.fov + (punch.fov || 0) * 1.4;
      if (!fly && Math.abs(camera.fov - wantFov) > 0.04) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
      if (P.shoulderCam) {
        // Schulterkamera: Zoom aus Gefahrenlage – raus schnell, wieder heran langsam
        const want = shoulderZoom(P, w, CAM.fol.x, CAM.fol.z, P.fov);
        shCam.s += (want - shCam.s) * Math.min(1, dt * (want > shCam.s ? 4.5 : 1.1));
        ghostOccluders(P, pl, dt);
        placeShoulderCamera(P, CAM.fol.x + sx * 0.7, CAM.fol.z + sz * 0.7, shCam.s * (1 + 0.6 * intro * intro + 0.35 * CAM.boss));
      } else placeFollowCamera(P, CAM.fol.x + sx * 0.7, CAM.fol.z + sz * 0.7, 0.35 * intro * intro + 0.25 * CAM.boss);
    } else {
      const wantFov = CAM.fov + (punch.fov || 0);
      if (Math.abs(camera.fov - wantFov) > 0.04) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
      const kk = CAM.kill || 0;
      placeCamera(CAM.dist * (1 - 0.3 * CAM.boss - 0.2 * kk + 0.22 * intro * intro), sx + CAM.fx + bx * 0.6 * CAM.boss + (CAM.kx || 0) * 0.45 * kk, sz + CAM.fz + bz * 0.6 * CAM.boss + (CAM.kz || 0) * 0.45 * kk - 60 * intro * intro);
    }
    followSun(w);
    updateAtmo(dt, t);
    syncEnemies(w, t, dt);
    syncSurvivors(w, t);
    syncPet(w, t);
    syncPlayer(w, t);
    syncDoor(w);
    syncObstacles(t, w);
    updateSkyline(t, w);
    syncSupply(w);
    syncMini(w);
    syncHeli(w, t);
    if (room && room.clock) { room.clock.minute.rotation.z = -t * 0.6; room.clock.hour.rotation.z = -t * 0.05; }
    syncInstanced(w, t);
    syncBigFx(w, t);
    fillBatches(w, t);
    assignLights(w, t);
    if (warmPending) warmShaders();
    // Schatten nur jedes 2. Bild neu berechnen – bei 60 FPS unsichtbar, spart viele Draw Calls
    frame++;
    renderer.shadowMap.autoUpdate = false;
    if (quality >= 2 && frame % 2 === 0) renderer.shadowMap.needsUpdate = true;
    renderFrame(w);
  }

  // Welt-Position → Bildschirm (logische 540×960-Koordinaten des HUD-Canvas)
  function project(x, y, h = 0) {
    // v3.1: Punkte hinter der Kamera (Third Person) liefern „behind“ statt eines gespiegelten Bildpunkts
    pv.set(x, h, y).applyMatrix4(camera.matrixWorldInverse);
    if (pv.z > -camera.near) return { x: -9999, y: -9999, behind: true };
    pv.applyMatrix4(camera.projectionMatrix);
    return { x: ((pv.x + 1) / 2) * D.W, y: ((1 - pv.y) / 2) * D.H };
  }
  function heightOf(e) { const M = models.get(e); return (M ? M.height : e.r * 2.6) * e.scale * (e.def.boss ? BOSS_SCALE : CHAR_SCALE); }

  // Alles entfernen (Run beendet)
  function clear() {
    if (!ready) return;
    for (const [, M] of models) releaseModel(M);
    models.clear();
    for (const [, d] of dying) releaseModel(d.M);
    dying.clear();
    for (const [, M] of survModels) releaseModel(M);
    survModels.clear();
    resetCorpseBatch();
    if (playerModel) { scene.remove(playerModel.root); disposeTree(playerModel.root); playerModel = null; }
    sawMeshes.forEach((s) => { s.visible = false; });
    if (crate) crate.visible = false;
    droneMeshes.forEach((d) => { d.visible = false; });
  }

  return {
    init, resize, render, project, viewQuad, heightOf, setQuality, setBloom, setCamMode, get camMode() { return camMode; },
    setGear: (look) => { gearLook = look || {}; }, get gearKey() { return gearKey(gearLook); }, clear, preview, stopPreview, showcase,
    setCinematic(on) { cinematic = on; }, get flash() { return atmo.flash; },
    setMenuFrame,
    menuOrbit(d, end = false) { if (end) { menuCam.drag = false; return; } menuCam.drag = true; menuCam.yaw = Math.max(-1.6, Math.min(1.6, menuCam.yaw + d)); },
    setTilt(x, y) { menuCam.tiltX += (x - menuCam.tiltX) * 0.15; menuCam.tiltY += (y - menuCam.tiltY) * 0.15; },
    get ready() { return ready; },
    get bloom() { return !!(post && postActive()); },
    get debug() { return { scene, camera, renderer, models, atmo, shCam, heliFly, room: () => room, floorQuads: () => floorB && floorB.n, post: () => post, flashShadows, woundAt, playerModel: () => playerModel, shocks, flashlight, moon, hemi, CAM, fitCamera, stats: () => ({ pooled: [...pools.values()].reduce((a, l) => a + l.length, 0), active: models.size, dying: dying.size, geoCache: geoCache.size, texCache: texCache.size, shared: shared.size }) }; },
  };
})();
