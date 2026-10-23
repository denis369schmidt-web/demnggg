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
  const cap = (r, len) => geo(`c${r1(r)},${r1(len)}`, () => new T3.CapsuleGeometry(r, len, 2, 7));
  const ico = (r, d = 1) => geo(`i${r1(r)},${d}`, () => new T3.IcosahedronGeometry(r, d));
  const cyl = (rt, rb, h, seg = 10) => geo(`y${r1(rt)},${r1(rb)},${r1(h)},${seg}`, () => new T3.CylinderGeometry(rt, rb, h, seg));
  const cone = (r, h, seg = 6) => geo(`k${r1(r)},${r1(h)},${seg}`, () => new T3.ConeGeometry(r, h, seg));
  const torus = (R, t, arc = TAU) => geo(`t${r1(R)},${r1(t)},${r1(arc)}`, () => new T3.TorusGeometry(R, t, 5, 16, arc));

  const lam = (c, extra) => new T3.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
  const basic = (c, extra) => new T3.MeshBasicMaterial({ color: c, ...extra });
  const shared = new Map();
  const sharedSet = new Set(); // geteilte Materialien werden beim Raumwechsel nicht freigegeben
  const smat = (key, make) => { let m = shared.get(key); if (!m) { m = make(); shared.set(key, m); sharedSet.add(m); } return m; };
  const slam = (c) => smat(`l${c}`, () => lam(c));
  const sbasic = (c) => smat(`b${c}`, () => basic(c));

  function mesh(g, m, x = 0, y = 0, z = 0) {
    const o = new T3.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  }
  function group(x = 0, y = 0, z = 0) { const g = new T3.Group(); g.position.set(x, y, z); return g; }

  function canvasTex(w, h, draw, repeat = false) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T3.CanvasTexture(c);
    t.colorSpace = T3.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = T3.RepeatWrapping;
    return t;
  }
  const texCache = new Map();
  const tex = (key, w, h, draw, repeat) => { let t = texCache.get(key); if (!t) { t = canvasTex(w, h, draw, repeat); texCache.set(key, t); } return t; };

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
  const CELL = { glow: 0, smoke: 1, streak: 2, ring: 3, star: 4, blob: 5, chevron: 6, band: 7, gib: 8, casing: 9, bolt: 10 };
  function makeAtlas() {
    return canvasTex(512, 512, (g) => {
      const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128, Math.floor(i / 4) * 128); fn(g); g.restore(); };
      const radial = (stops) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62); stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`)); return gr; };
      cell(CELL.glow, () => { g.fillStyle = radial([[0, 1], [0.18, 0.65], [0.45, 0.2], [1, 0]]); g.fillRect(0, 0, 128, 128); });
      cell(CELL.smoke, () => {
        for (const [x, y, r] of [[64, 64, 40], [44, 56, 26], [84, 70, 28], [60, 84, 24], [74, 44, 22]]) {
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
      });
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
    });
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
  // Waagerechtes Quad (liegt auf dem Boden bzw. in Flughöhe), Länge entlang Winkel ang
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
    floorB = new QuadBatch(400, atlas, true, true);
    scene.add(addB.mesh, normB.mesh, floorB.mesh);
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
    fitCamera();
    ready = true;
    console.log(`[Outbreak] 3D bereit (Three.js ${T3.REVISION})`);
    return true;
  }

  // Menü: langsame Kamerafahrt um den Helden, flacher Blickwinkel
  let menuMode = false;
  function placeMenuCamera(t, w) {
    if (!menuMode) { menuMode = true; camera.clearViewOffset(); camera.fov = 40; camera.updateProjectionMatrix(); }
    // Held im unteren Bilddrittel (unter den Menü-Buttons), Horde dahinter
    const yaw = Math.sin(t * 0.06) * 0.7, elev = 0.58, d = 430;
    const tx = w.player.x, tz = w.player.y;
    camera.position.set(tx + Math.sin(yaw) * d * Math.cos(elev), Math.sin(elev) * d, tz + Math.cos(yaw) * d * Math.cos(elev));
    camera.lookAt(tx - Math.sin(yaw) * 300, 0, tz - Math.cos(yaw) * 300);
    camera.updateMatrixWorld();
  }
  function placeCamera(dist, sx = 0, sz = 0) {
    if (menuMode) { menuMode = false; camera.fov = CAM.fov; camera.setViewOffset(D.W, D.H, 0, CAM.offY, D.W, D.H); camera.updateProjectionMatrix(); }
    camera.position.set(CAM.tx + sx, Math.sin(CAM.elev) * dist, CAM.tz + Math.cos(CAM.elev) * dist + sz);
    camera.lookAt(CAM.tx + sx, 0, CAM.tz + sz);
    camera.updateMatrixWorld();
  }

  // Kamera so weit zurückziehen, dass die ganze Arena unter das HUD passt
  function fitCamera() {
    const hud = 104 / D.H;
    CAM.tx = (D.L + D.R) / 2;
    CAM.tz = (D.T + D.B) / 2 + 30;
    camera.fov = CAM.fov;
    camera.aspect = D.W / D.H;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const corners = [[D.L - 14, D.T - 60], [D.R + 14, D.T - 60], [D.L - 14, D.B + 30], [D.R + 14, D.B + 30]];
    let dist = 500, minY = 0, maxY = 0;
    for (; dist < 4000; dist += 10) {
      placeCamera(dist);
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
    placeCamera(dist);
  }

  function resize(cssW, cssH, pixelRatio) {
    if (!ready) return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssW, cssH, false);
  }

  function setQuality(q) {
    quality = q;
    if (!ready) return;
    const shadows = q >= 2;
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
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
  };
  const ROOF = { street: "#221d1a", hospital: "#2b322e", lab: "#1b2125" };
  const EDGE = { street: "#6b5a50", hospital: "#c9d4ce", lab: "#56626a" };
  const PROP = { street: "#3a3532", hospital: "#5b6661", lab: "#38434a" };
  const LAMP = { street: "255,176,90", hospital: "205,255,235", lab: "130,255,150" };
  let room = null; // { group, floorTex, door: {...}, builtFor }
  let builtFloor = null;

  function wallTexture(kind) {
    return tex(`wall:${kind}`, 128, 128, (g) => {
      if (kind === "street") {
        g.fillStyle = "#4a3630"; g.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 16) for (let x = ((y / 16) % 2) * 16; x < 128 + 16; x += 32) {
          const v = (x * 7 + y * 13) % 20 - 10;
          g.fillStyle = `rgb(${92 + v},${60 + v / 2},${50 + v / 2})`; g.fillRect(x - 15, y + 1, 30, 14);
        }
      } else if (kind === "hospital") {
        g.fillStyle = "#b9c6bf"; g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#6d877c"; g.fillRect(0, 64, 128, 64);
        g.fillStyle = "#3a4a44"; g.fillRect(0, 118, 128, 10);
        g.strokeStyle = "rgba(0,0,0,0.15)"; for (let x = 0; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 118); g.stroke(); }
      } else {
        g.fillStyle = "#2c343a"; g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#3d474e"; g.fillRect(4, 4, 56, 120); g.fillRect(68, 4, 56, 120);
        for (let x = 0; x < 128; x += 16) { g.fillStyle = (x / 16) % 2 ? "#151515" : "#d9b21a"; g.fillRect(x, 112, 16, 16); }
        g.fillStyle = "#7a858d"; for (const [x, y] of [[8, 8], [56, 8], [72, 8], [120, 8]]) g.fillRect(x - 2, y - 2, 4, 4);
      }
    }, true);
  }

  function obstacleTexture(kind) {
    return tex(`obs:${kind}`, 128, 128, (g) => {
      switch (kind) {
        case "crate":
          g.fillStyle = "#7a5a34"; g.fillRect(0, 0, 128, 128);
          for (let y = 0; y < 128; y += 32) { g.fillStyle = "#6a4c2a"; g.fillRect(0, y, 128, 3); }
          g.strokeStyle = "#4e3820"; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
          g.beginPath(); g.moveTo(10, 10); g.lineTo(118, 118); g.stroke();
          break;
        case "medcrate":
          g.fillStyle = "#dfe2dc"; g.fillRect(0, 0, 128, 128);
          g.strokeStyle = "#9aa09a"; g.lineWidth = 6; g.strokeRect(4, 4, 120, 120);
          g.fillStyle = "#e5383b"; g.fillRect(52, 24, 24, 80); g.fillRect(24, 52, 80, 24);
          break;
        case "labcrate":
          g.fillStyle = "#56606a"; g.fillRect(0, 0, 128, 128);
          g.strokeStyle = "#3a434b"; g.lineWidth = 6; g.strokeRect(10, 10, 108, 108);
          for (let x = -128; x < 128; x += 24) { g.fillStyle = "#e8c21a"; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 12, 128); g.lineTo(x + 40, 100); g.lineTo(x + 28, 100); g.fill(); }
          g.fillStyle = "#1c1c1c"; g.fillRect(0, 96, 128, 4);
          break;
        case "barricade":
          g.fillStyle = "#8d8c86"; g.fillRect(0, 0, 128, 128);
          for (let x = -128; x < 256; x += 32) { g.fillStyle = "#f2c81a"; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 16, 128); g.lineTo(x + 80, 64); g.lineTo(x + 64, 64); g.fill(); }
          g.fillStyle = "#151515"; g.fillRect(0, 60, 128, 4);
          break;
        case "dumpster":
          g.fillStyle = "#2f5a3a"; g.fillRect(0, 0, 128, 128);
          g.fillStyle = "#264a30"; for (let x = 8; x < 128; x += 24) g.fillRect(x, 0, 6, 128);
          break;
        case "cabinet":
          g.fillStyle = "#b7bec2"; g.fillRect(0, 0, 128, 128);
          g.fillStyle = "#7f878c"; g.fillRect(62, 0, 4, 128);
          g.fillStyle = "#e5383b"; g.fillRect(28, 40, 12, 40); g.fillRect(14, 54, 40, 12);
          break;
        case "server":
          g.fillStyle = "#1a1f24"; g.fillRect(0, 0, 128, 128);
          for (let y = 6; y < 128; y += 14) { g.fillStyle = "#2c3238"; g.fillRect(6, y, 116, 10); }
          break;
        case "serverLeds":
          g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128);
          for (let y = 9; y < 128; y += 14) for (let x = 14; x < 120; x += 18) { g.fillStyle = (x * 3 + y) % 5 ? "#3cff7a" : "#ff4a3a"; g.fillRect(x, y, 5, 4); }
          break;
        case "mattress":
          g.fillStyle = "#e8eef0"; g.fillRect(0, 0, 128, 128);
          g.fillStyle = "rgba(120,10,14,0.85)"; g.beginPath(); g.ellipse(80, 70, 30, 22, 0.4, 0, TAU); g.fill();
          break;
      }
    });
  }

  function obstacleModel(o, theme) {
    const g = group(o.x + o.w / 2, 0, o.y + o.h / 2);
    const W = o.w, Hd = o.h;
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const R = (() => { let s = o.seed || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    switch (o.kind) {
      case "car": {
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd;
        const c = group(); if (o.vert) c.rotation.y = Math.PI / 2;
        const col = ["#8a2f2f", "#2f4f8a", "#6b6b6b", "#c9b48a", "#2f6f4a", "#d8d8d0"][Math.floor(R() * 6)];
        const paint = lam(col);
        const body = add(mesh(box(len, 20, wid), paint, 0, 16, 0)); c.add(body);
        const glass = smat("glass", () => new T3.MeshLambertMaterial({ color: 0x1b2733, emissive: 0x0a1018 }));
        const cabin = add(mesh(box(len * 0.5, 15, wid * 0.86), glass, -len * 0.04, 33, 0)); c.add(cabin);
        const roof = add(mesh(box(len * 0.36, 3, wid * 0.8), paint, -len * 0.06, 41.5, 0)); c.add(roof);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const wh = mesh(cyl(8, 8, 6, 10), slam("#151515"), sx * len * 0.3, 8, sz * (wid / 2 - 2)); wh.rotation.x = Math.PI / 2; c.add(wh);
        }
        for (const sz of [-1, 1]) {
          c.add(mesh(box(2, 4, 8), sbasic("#ffe9a8"), len / 2, 18, sz * wid * 0.32));
          c.add(mesh(box(2, 4, 8), sbasic("#b3261e"), -len / 2, 18, sz * wid * 0.32));
        }
        g.add(c);
        break;
      }
      case "crate": case "medcrate": case "labcrate": {
        const h = o.kind === "crate" ? 40 : 34;
        add(mesh(box(W, h, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture(o.kind) }), 0, h / 2, 0));
        break;
      }
      case "barrels": {
        const br = Math.min(W, Hd) * 0.25;
        const paintCol = theme === "lab" ? "#2f6a8a" : "#3d6b2a";
        for (const [px, pz] of [[-0.22, -0.2], [0.22, -0.2], [0, 0.22]]) {
          add(mesh(cyl(br, br, 38, 12), slam(paintCol), px * W, 19, pz * Hd));
          g.add(mesh(cyl(br * 0.75, br * 0.75, 1, 12), sbasic("#9eff3a"), px * W, 38.6, pz * Hd));
          for (const ry of [8, 30]) g.add(mesh(cyl(br * 1.03, br * 1.03, 2, 12), slam("#22301a"), px * W, ry, pz * Hd));
        }
        break;
      }
      case "barricade":
        add(mesh(box(W, 30, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("barricade") }), 0, 15, 0));
        break;
      case "dumpster":
        add(mesh(box(W, 40, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("dumpster") }), 0, 20, 0));
        add(mesh(box(W + 2, 3, Hd + 2), slam("#244a2e"), 0, 41.5, 0));
        break;
      case "bed": {
        const len = o.vert ? Hd : W, wid = o.vert ? W : Hd;
        const c = group(); if (o.vert) c.rotation.y = Math.PI / 2;
        c.add(add(mesh(box(len, 12, wid), slam("#6f7880"), 0, 10, 0)));
        c.add(add(mesh(box(len - 6, 8, wid - 6), new T3.MeshLambertMaterial({ map: obstacleTexture("mattress") }), 0, 20, 0)));
        c.add(add(mesh(box(len * 0.2, 6, wid - 14), slam("#f4f6f8"), -len * 0.36, 26, 0)));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(mesh(cyl(1.5, 1.5, 6, 6), slam("#4d555c"), sx * (len / 2 - 4), 3, sz * (wid / 2 - 4)));
        g.add(c);
        break;
      }
      case "cabinet":
        add(mesh(box(W, 70, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("cabinet") }), 0, 35, 0));
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
      default:
        add(mesh(box(W, 30, Hd), slam("#555555"), 0, 15, 0));
    }
    return g;
  }

  // GPU-Speicher freigeben: alles außer geteilten Geometrien, Materialien und Texturen
  function disposeTree(root) {
    const cachedTex = new Set(texCache.values()), cachedGeo = new Set(geoCache.values());
    const drop = (m) => {
      if (sharedSet.has(m) || m === outlineMat) return;
      if (m.map && !cachedTex.has(m.map)) m.map.dispose();
      m.dispose();
    };
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!cachedGeo.has(o.geometry)) o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(drop);
    });
  }

  function buildRoom(w) {
    for (const [, d] of dying) releaseModel(d.M);
    dying.clear();
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
    scene.fog.color.setHex(th.fog);
    renderer.setClearColor(th.fog, 1);

    const g = new T3.Group();
    const aw = D.R - D.L, ah = D.B - D.T;
    // Boden: bestehende 2D-Bodentextur (inkl. Blut & Spuren) als Textur
    const fc = w.floorCanvas;
    const floorTex = new T3.CanvasTexture(fc);
    floorTex.colorSpace = T3.SRGBColorSpace;
    floorTex.anisotropy = 8;
    floorTex.repeat.set(aw / D.W, ah / D.H);
    floorTex.offset.set(D.L / D.W, 1 - D.B / D.H);
    const floor = mesh(new T3.PlaneGeometry(aw, ah), new T3.MeshLambertMaterial({ map: floorTex, color: 0xb4b4b4 }), (D.L + D.R) / 2, 0, (D.T + D.B) / 2);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // Umgebung außerhalb der Arena (dunkler Boden)
    const outer = mesh(new T3.PlaneGeometry(D.W * 4, D.H * 4), slam("#0a0d0c"), D.W / 2, -0.5, D.H / 2);
    outer.rotation.x = -Math.PI / 2;
    g.add(outer);

    uncached = true;
    // Kleinteile ohne Textur werden am Ende zu wenigen Meshes verschmolzen
    const deco = new T3.Group();
    // Wände: massive Blöcke (Seiten mit Textur, dunkles Dach, heller Mauerrand zur Arena)
    const wt = wallTexture(th.wall);
    const roofMat = slam(ROOF[w.theme] || ROOF.street);
    const edgeMat = slam(EDGE[w.theme] || EDGE.street);
    const wall = (x0, z0, x1, z1, h, edge) => {
      const t = wt.clone();
      t.needsUpdate = true;
      const len = edge === "x" ? z1 - z0 : x1 - x0;
      t.repeat.set(len / 64, h / 64);
      const side = new T3.MeshLambertMaterial({ map: t });
      const m = mesh(box(x1 - x0, h, z1 - z0), [side, side, roofMat, side, side, side], (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      // Mauerrand an der Innenkante
      if (edge === "x") { const ex = x1 <= D.L + 1 ? x1 - 4 : x0 + 4; deco.add(mesh(box(8, 3, z1 - z0), edgeMat, ex, h + 1.5, (z0 + z1) / 2)); }
      else { const ez = z1 <= D.T + 1 ? z1 - 4 : z0 + 4; deco.add(mesh(box(x1 - x0, 3, 8), edgeMat, (x0 + x1) / 2, h + 1.5, ez)); }
    };
    const WH = 64, dl = D.W / 2 - D.DOOR_W / 2, dr = D.W / 2 + D.DOOR_W / 2;
    const BACK = 260, SIDE = 240;
    wall(-SIDE, D.T - BACK, dl, D.T, WH, "z");
    wall(dr, D.T - BACK, D.W + SIDE, D.T, WH, "z");
    wall(-SIDE, D.T, D.L, D.B + 60, WH, "x");
    wall(D.R, D.T, D.W + SIDE, D.B + 60, WH, "x");
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
      deco.add(mesh(box(bw, bh, bd), propMat, Math.min(x, left ? D.L - bw / 2 - 14 : 9e9), WH + bh / 2, z));
    }
    for (const x of [D.L + 40 + R2() * 60, D.R - 100 - R2() * 60]) {
      const pipe = mesh(cyl(4, 4, BACK - 30, 8), propMat, x, WH + 4, D.T - BACK / 2 - 10);
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
    for (const o of w.obstacles) {
      const om = bakeStatic(obstacleModel(o, w.theme));
      om.traverse((c) => { if (c.isMesh && !c.material.transparent) { c.castShadow = true; c.receiveShadow = true; } });
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
      lamps.push({ x: x + nx * 6, z: z + nz * 6, px: x + nx * 62, pz: z + nz * 62, flicker: lamps.length === 2 && w.theme !== "hospital" });
    };
    lamp(D.L, D.T + 190, 1, 0); lamp(D.L, D.T + 540, 1, 0);
    lamp(D.R, D.T + 360, -1, 0); lamp(D.R, D.T + 700, -1, 0);
    lamp(D.L + 90, D.T, 0, 1); lamp(D.R - 90, D.T, 0, 1);

    bakeStatic(deco);
    deco.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    g.add(deco);
    uncached = false;

    room = { group: g, floorTex, door, lamps, lampRgb };
    builtFloor = fc;
    renderer.shadowMap.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // Figuren
  // ------------------------------------------------------------------
  const PAL = {
    walker: [{ shirt: "#5d6e7e", pants: "#2f3b52", skin: "#8fa67a" }, { shirt: "#7d5f45", pants: "#3a3328", skin: "#94a37c" }, { shirt: "#6b3f57", pants: "#2b2f3a", skin: "#87a184" }],
    runner: [{ shirt: "#8a2a2a", pants: "#1f2126", skin: "#a9b59c", hood: true, lean: 0.28 }],
    spitter: [{ shirt: "#5d7c3a", pants: "#4a3d2a", skin: "#7d9a48", bloat: true, eye: "#eaff00" }],
    bomber: [{ shirt: "#e8701a", pants: "#2e3440", skin: "#8fa27a", vest: true }],
    brute: [{ shirt: "#5a615b", pants: "#3a3a33", skin: "#7c8c6a", brute: true }],
    armored: [{ shirt: "#26324a", pants: "#1a2130", skin: "#7f9474", armor: true, eye: "#ff5a3a" }],
    crawler: [{ shirt: "#4b4258", pants: "#2a2430", skin: "#8a7c9e" }],
    dog: [{ shirt: "#4f3f32", skin: "#6b5644" }],
    abom: [{ skin: "#8a4a6a" }],
    mother: [{ skin: "#3f5a3a" }],
  };

  // Jede Figur bekommt eigene Materialien für Treffer-Blitz/Eis/Wut (emissive)
  function makeModel(kind) {
    const root = group();
    const body = group();
    root.add(body);
    return { root, body, mats: [], legs: [], arms: [], extra: {}, height: 40, kind };
  }
  function flashMat(M, color) { const m = lam(color); M.mats.push(m); return m; }
  function cast(o) { o.traverse((c) => { if (c.isMesh && !c.userData.outline) c.castShadow = true; }); return o; }

  function buildHumanoid(type, r, P) {
    const M = makeModel(type);
    const bulk = P.brute ? 1.18 : P.bloat ? 1.1 : 1;
    const shirt = flashMat(M, P.shirt), pants = flashMat(M, P.pants), skin = flashMat(M, P.skin);
    const dark = slam("#1a1a1a");
    // Beine (Pivot an der Hüfte)
    for (const s of [-1, 1]) {
      const hip = group(-0.05 * r, 0.92 * r, s * 0.3 * r * bulk);
      hip.add(mesh(cap(0.2 * r * bulk, 0.48 * r), pants, 0, -0.44 * r, 0));
      hip.add(mesh(box(0.46 * r, 0.18 * r, 0.3 * r), dark, 0.1 * r, -0.86 * r, 0));
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
      const vest = mesh(cap(0.44 * r, 0.3 * r), lam("#ff7a1a"), 0, 1.52 * r, 0); vest.scale.set(0.86, 1, 1.36); M.body.add(vest); M.mats.push(vest.material);
      for (const dz of [-0.24, 0.24]) M.body.add(mesh(box(0.74 * r, 0.12 * r, 0.08 * r), slam("#f0f0c8"), 0, 1.55 * r, dz * r * 1.3));
      for (let i = -1; i <= 1; i++) { const d = mesh(cyl(0.07 * r, 0.07 * r, 0.42 * r, 6), slam("#c0281e"), 0.36 * r, 1.42 * r, i * 0.2 * r); M.body.add(d); }
      const tank = mesh(cyl(0.22 * r, 0.22 * r, 0.75 * r, 8), slam("#7d8288"), -0.42 * r, 1.6 * r, 0); M.body.add(tank);
      M.extra.blink = mesh(ico(0.08 * r, 0), basic(0xff2b1f), -0.42 * r, 2.02 * r, 0); M.body.add(M.extra.blink);
    }
    if (P.armor) {
      const plate = mesh(box(0.5 * r, 0.9 * r, 1.0 * r), lam("#34445f"), 0.2 * r, 1.55 * r, 0); M.body.add(plate); M.mats.push(plate.material);
      for (const s of [-1, 1]) M.body.add(mesh(ico(0.26 * r, 1), slam("#2c3a52"), 0, 1.9 * r, s * 0.66 * r));
    }
    // Arme nach vorn (Zombie-Griff)
    for (const s of [-1, 1]) {
      const sh = group(0.04 * r, 1.86 * r, s * 0.66 * r * bulk);
      const arm = mesh(cap(0.15 * r * bulk, 0.72 * r), P.armor ? slam("#1b2433") : P.brute || P.bloat ? skin : shirt, 0.5 * r, 0, 0);
      arm.rotation.z = -Math.PI / 2;
      sh.add(arm);
      sh.add(mesh(ico(0.17 * r * bulk * (P.brute ? 1.35 : 1), 0), P.armor ? slam("#1d2330") : skin, 1.04 * r, 0, 0));
      sh.rotation.y = s * 0.18;
      M.body.add(sh);
      M.arms.push({ g: sh, s });
    }
    // Kopf
    const head = group(0.14 * r + (P.lean ? 0.1 * r : 0), 2.4 * r * (P.brute ? 0.96 : 1), 0);
    const hr = (P.brute ? 0.36 : 0.4) * r;
    head.add(mesh(ico(hr, 1), skin));
    if (P.hood) { const hood = mesh(ico(hr * 1.2, 1), shirt, -0.08 * r, 0.04 * r, 0); hood.scale.set(1, 1, 1.05); head.add(hood); }
    if (P.armor) {
      head.add(mesh(ico(hr * 1.15, 1), slam("#2b3548"), -0.02 * r, 0.06 * r, 0));
      head.add(mesh(box(0.12 * r, 0.22 * r, 0.62 * r), basic(0x50aae6), hr * 0.98, 0.02 * r, 0));
    } else {
      for (const s of [-1, 1]) head.add(mesh(ico(0.075 * r, 0), sbasic(P.eye || "#ff3030"), hr * 0.86, 0.06 * r, s * 0.15 * r));
      head.add(mesh(box(0.08 * r, 0.1 * r, 0.3 * r), slam("#2a0d0d"), hr * 0.92, -0.16 * r, 0));
    }
    if (P.bloat) { M.extra.sac = mesh(ico(0.22 * r, 1), sbasic("#a8ff4a"), hr * 1.0, -0.3 * r, 0); head.add(M.extra.sac); }
    M.body.add(head);
    M.extra.head = head;
    M.body.rotation.z = -(P.lean || 0);
    M.lean = -(P.lean || 0);
    M.height = 2.9 * r;
    return M;
  }

  function buildCrawler(r, P) {
    const M = makeModel("crawler");
    const shirt = flashMat(M, P.shirt), skin = flashMat(M, P.skin);
    const torso = mesh(cap(0.45 * r, 0.6 * r), shirt, -0.1 * r, 0.5 * r, 0); torso.rotation.z = Math.PI / 2; torso.scale.set(1, 1, 1.2);
    M.body.add(torso);
    for (let i = 0; i < 4; i++) M.body.add(mesh(ico(0.14 * r, 0), slam("#8a2030"), -0.9 * r - i * 0.28 * r, 0.25 * r, Math.sin(i) * 0.15 * r));
    for (const s of [-1, 1]) {
      const sh = group(0.3 * r, 0.6 * r, s * 0.5 * r);
      const arm = mesh(cap(0.15 * r, 0.9 * r), skin, 0.6 * r, 0, 0); arm.rotation.z = -Math.PI / 2; sh.add(arm);
      sh.add(mesh(ico(0.18 * r, 0), skin, 1.25 * r, 0, 0));
      M.body.add(sh);
      M.arms.push({ g: sh, s, crawl: true });
    }
    const head = mesh(ico(0.42 * r, 1), skin, 0.75 * r, 0.6 * r, 0);
    M.body.add(head);
    for (const s of [-1, 1]) M.body.add(mesh(ico(0.08 * r, 0), sbasic("#ff3030"), 1.12 * r, 0.68 * r, s * 0.15 * r));
    M.height = 1.2 * r;
    return M;
  }

  function buildDog(r, P) {
    const M = makeModel("dog");
    const fur = flashMat(M, P.shirt), skin = flashMat(M, P.skin);
    const body = mesh(cap(0.42 * r, 1.1 * r), fur, 0, 0.95 * r, 0); body.rotation.z = Math.PI / 2;
    M.body.add(body);
    M.body.add(mesh(box(0.6 * r, 0.12 * r, 0.5 * r), slam("#e3d8c0"), 0.05 * r, 0.95 * r, 0.4 * r));
    for (const [x, ph] of [[0.6, 0], [-0.62, Math.PI]]) for (const s of [-1, 1]) {
      const hip = group(x * r, 0.85 * r, s * 0.26 * r);
      hip.add(mesh(cap(0.12 * r, 0.5 * r), fur, 0, -0.42 * r, 0));
      M.body.add(hip);
      M.legs.push({ g: hip, s, ph: ph + (s > 0 ? 0.6 : 0) });
    }
    const tail = group(-1.0 * r, 1.05 * r, 0);
    const t = mesh(cap(0.07 * r, 0.6 * r), fur, -0.35 * r, 0.1 * r, 0); t.rotation.z = Math.PI / 2 - 0.4; tail.add(t);
    M.body.add(tail); M.extra.tail = tail;
    const head = group(1.05 * r, 1.25 * r, 0);
    head.add(mesh(ico(0.36 * r, 1), fur));
    head.add(mesh(box(0.5 * r, 0.26 * r, 0.3 * r), skin, 0.38 * r, -0.08 * r, 0));
    head.add(mesh(ico(0.07 * r, 0), slam("#111111"), 0.64 * r, -0.04 * r, 0));
    for (const s of [-1, 1]) {
      const ear = mesh(cone(0.1 * r, 0.3 * r, 4), fur, -0.12 * r, 0.32 * r, s * 0.2 * r); ear.rotation.x = s * 0.4; head.add(ear);
      head.add(mesh(ico(0.07 * r, 0), sbasic("#ff3a2a"), 0.24 * r, 0.12 * r, s * 0.18 * r));
    }
    M.body.add(head);
    M.extra.head = head;
    M.height = 1.7 * r;
    return M;
  }

  function buildAbom(r, P) {
    const M = makeModel("abom");
    const flesh = flashMat(M, P.skin), dark = flashMat(M, "#6e3550");
    M.extra.lobes = [];
    for (const [x, y, z, s] of [[0, 1.0, 0, 0.8], [-0.35, 1.0, -0.45, 0.5], [-0.35, 1.0, 0.45, 0.5], [0.15, 1.25, -0.5, 0.42], [0.15, 1.25, 0.5, 0.42], [-0.55, 1.2, 0, 0.45], [0, 1.6, 0, 0.5]]) {
      const l = mesh(ico(s * r, 1), flesh, x * r, y * r, z * r);
      M.body.add(l); M.extra.lobes.push(l);
    }
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
    const abdomen = mesh(ico(0.85 * r, 2), shell, -0.4 * r, 0.9 * r, 0); abdomen.scale.set(1.1, 0.75, 0.95);
    M.body.add(abdomen);
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
  function mergeMeshes(meshes, material) {
    const parts = [];
    let count = 0;
    for (const m of meshes) {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      parts.push([g, m.material.color]);
      count += g.attributes.position.count;
    }
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3);
    let o = 0;
    for (const [g, c] of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < n; i++) { const k = (o + i) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      o += n;
      g.dispose();
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute("position", new T3.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new T3.BufferAttribute(nrm, 3));
    geo.setAttribute("color", new T3.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return new T3.Mesh(geo, material);
  }
  function bakeNode(node, lit, glow, keep, outline = false) {
    const litList = [], glowList = [];
    for (const c of node.children) {
      if (!c.isMesh) { bakeNode(c, lit, glow, keep, outline); continue; }
      const m = c.material;
      if (keep.has(c) || c.userData.solo || c.children.length || Array.isArray(m) || m.map || m.transparent) continue;
      (m.isMeshBasicMaterial ? glowList : litList).push(c);
    }
    for (const [list, mat] of [[litList, lit], [glowList, glow]]) {
      if (!list.length) continue;
      for (const c of list) node.remove(c);
      const merged = mergeMeshes(list, mat);
      node.add(merged);
      if (outline && mat === lit) {
        const o = new T3.Mesh(merged.geometry, outlineMat);
        o.userData.outline = true;
        node.add(o);
      }
    }
  }
  const vlit = () => smat("vlit", () => new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const vglow = () => smat("vglow", () => new T3.MeshBasicMaterial({ vertexColors: true }));
  function bakeStatic(o) { bakeNode(o, vlit(), vglow(), new Set()); return o; }
  function bake(M) {
    const keep = new Set();
    for (const v of Object.values(M.extra)) {
      if (v && v.isObject3D) keep.add(v);
      else if (Array.isArray(v)) v.forEach((x) => { if (x && x.isObject3D) keep.add(x); });
    }
    const lit = new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const glow = new T3.MeshBasicMaterial({ vertexColors: true });
    bakeNode(M.root, lit, glow, keep, true);
    // Einzelteile mit eigener Animation behalten ihre Materialien; der Rest blitzt gemeinsam auf
    M.mats = [lit, ...M.mats.filter((m) => [...keep].some((k) => k.material === m))];
  }

  const builders = { crawler: buildCrawler, dog: buildDog, abom: buildAbom, mother: buildMother };
  const pools = new Map();
  function acquireModel(type, r, variant) {
    const pal = PAL[type] || PAL.walker, pi = variant % pal.length;
    const key = `${type}:${pi}`;
    const list = pools.get(key);
    let M = list && list.pop();
    if (!M) {
      const P = pal[pi];
      M = (builders[type] || ((rr, pp) => buildHumanoid(type, rr, pp)))(r, P);
      bake(M);
      M.key = key;
      M.mats.forEach((m) => { m.userData.base = m.color.clone(); });
      cast(M.root);
    }
    M.root.visible = true;
    M.root.rotation.set(0, 0, 0);
    M.root.position.set(0, 0, 0);
    M.mats.forEach((m) => { m.color.copy(m.userData.base); m.emissive.setRGB(0, 0, 0); });
    scene.add(M.root);
    return M;
  }
  const POOL_MAX = 8; // pro Typ/Variante – mehr gleichzeitige Gegner kommen kaum vor
  function releaseModel(M) {
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
      M.body.rotation.x = Math.sin(ph) * 0.07;
      M.body.rotation.z = (M.lean || 0) + rush + Math.min(0.1, e.hitT) * 3.2;
    }
    if (M.extra.blink) M.extra.blink.visible = Math.sin(t * 14 + e.wob) > 0;
    if (M.extra.sac) M.extra.sac.scale.setScalar(1 + 0.15 * Math.sin(ph * 2));
    if (M.extra.tail) M.extra.tail.rotation.y = Math.sin(t * 12) * 0.5;
    if (M.extra.lobes) M.extra.lobes.forEach((l, i) => l.scale.setScalar(1 + 0.05 * Math.sin(t * 4 + i)));
    if (M.extra.tentacles) M.extra.tentacles.forEach((segs, i) => segs.forEach((s, k) => { s.rotation.y = Math.sin(t * 2.5 + i + k * 0.6) * 0.35; s.rotation.z = Math.sin(t * 2 + i * 2 + k) * 0.15; }));
    if (M.extra.eggs) M.extra.eggs.forEach((egg, i) => egg.scale.setScalar(1 + 0.12 * Math.sin(t * 4 + i)));
  }

  function tint(M, e, t) {
    let r = 0, g = 0, b = 0;
    if (e.hitT > 0) { const k = Math.min(1, e.hitT / 0.1) * 0.9; r = g = b = k; }
    else if (e.phase2) { const k = 0.35 + 0.25 * Math.sin(t * 10); r = k; g = 0.02; b = 0.06; }
    else if (e.slowT > 0) { r = 0.15; g = 0.4; b = 0.7; }
    else if (e.burnT > 0) { const k = 0.3 + 0.2 * Math.sin(t * 20); r = k; g = k * 0.4; }
    for (const m of M.mats) m.emissive.setRGB(r, g, b);
  }

  // Spieler + Waffen
  let playerModel = null;
  function weaponModel(id, tier) {
    const g = group();
    const steel = slam("#2c3037"), steel2 = slam("#3d4148"), wood = slam("#6b4a2b");
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

  function buildPlayer(w) {
    const p = w.player, r = 16;
    const M = makeModel("player");
    const olive = slam("#71894a"), pants = slam("#4a5638"), dark = slam("#1e211b");
    for (const s of [-1, 1]) {
      const hip = group(-0.05 * r, 0.92 * r, s * 0.3 * r);
      hip.add(mesh(cap(0.2 * r, 0.48 * r), pants, 0, -0.44 * r, 0));
      hip.add(mesh(box(0.48 * r, 0.2 * r, 0.32 * r), dark, 0.1 * r, -0.86 * r, 0));
      M.body.add(hip); M.legs.push({ g: hip, s });
    }
    const torso = mesh(cap(0.42 * r, 0.42 * r), olive, 0, 1.52 * r, 0); torso.scale.set(0.84, 1, 1.32); M.body.add(torso);
    for (let i = -1; i <= 1; i++) M.body.add(mesh(box(0.2 * r, 0.24 * r, 0.24 * r), slam("#5a6b3c"), 0.33 * r, 1.45 * r, i * 0.3 * r));
    M.body.add(mesh(ico(0.07 * r, 0), sbasic("#8cff4a"), 0.05 * r, 2.0 * r, -0.62 * r));
    if (p.weaponId === "flame") {
      for (const s of [-1, 1]) M.body.add(mesh(cyl(0.2 * r, 0.2 * r, 0.9 * r, 8), slam("#a3312a"), -0.5 * r, 1.6 * r, s * 0.24 * r));
    } else {
      M.body.add(mesh(box(0.42 * r, 0.9 * r, 0.8 * r), slam("#4d5a3a"), -0.52 * r, 1.6 * r, 0));
      const roll = mesh(cyl(0.16 * r, 0.16 * r, 0.82 * r, 8), slam("#7a6a48"), -0.55 * r, 2.12 * r, 0); roll.rotation.x = Math.PI / 2; M.body.add(roll);
    }
    for (const s of [-1, 1]) M.body.add(mesh(ico(0.26 * r, 1), slam("#617346"), 0, 1.9 * r, s * 0.66 * r));
    // Arme zur Waffe
    const grip = new T3.Vector3(0.72 * r, 1.45 * r, 0.12 * r);
    for (const [s, tgt] of [[1, grip], [-1, new T3.Vector3(1.15 * r, 1.5 * r, 0.05 * r)]]) {
      const sh = new T3.Vector3(0.02 * r, 1.86 * r, s * 0.64 * r);
      const dir = tgt.clone().sub(sh), len = dir.length();
      const arm = mesh(cap(0.14 * r, len - 0.2 * r), slam("#64784a"), 0, 0, 0);
      arm.position.copy(sh.clone().add(tgt).multiplyScalar(0.5));
      arm.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), dir.normalize());
      M.body.add(arm);
      M.body.add(mesh(ico(0.15 * r, 0), slam("#1f1f1f"), tgt.x, tgt.y, tgt.z));
    }
    // Helm mit Brille
    const head = group(0.08 * r, 2.4 * r, 0);
    head.add(mesh(ico(0.36 * r, 1), slam("#c9a07a")));
    const helmet = mesh(ico(0.46 * r, 1), slam("#7d9156"), -0.03 * r, 0.1 * r, 0); helmet.scale.set(1, 0.8, 1); head.add(helmet);
    head.add(mesh(box(0.1 * r, 0.16 * r, 0.6 * r), sbasic("#6fe3ff"), 0.36 * r, -0.02 * r, 0));
    M.body.add(head);
    // Waffe
    const wpn = weaponModel(p.weaponId, p.tier);
    wpn.position.copy(grip);
    M.body.add(wpn);
    M.extra.weapon = wpn;
    M.extra.gripX = grip.x;
    M.weaponId = p.weaponId;
    M.tier = p.tier;
    M.height = 2.9 * r;
    bake(M);
    cast(M.root);
    scene.add(M.root);
    return M;
  }

  // ------------------------------------------------------------------
  // Instanzen: Schatten, Münzen, Projektile
  // ------------------------------------------------------------------
  let blobShadows, coinsIM, acidIM, pinkIM, grenadeIM, boltIM;
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
    for (const im of [blobShadows, coinsIM, acidIM, pinkIM, grenadeIM, boltIM]) { im.frustumCulled = false; im.count = 0; scene.add(im); }
    coinsIM.castShadow = true;
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
      if (!M) { M = acquireModel(e.type, e.r, e.variant); models.set(e, M); }
      seen.add(e);
      const sc = e.scale * (e.def.boss ? BOSS_SCALE : CHAR_SCALE);
      let y = 0, s = sc;
      if (e.spawnT > 0) { const k = Math.max(0, 1 - e.spawnT / e.spawnMax); y = -(1 - k) * M.height * 0.9; s = sc * (0.6 + 0.4 * k); }
      let x = e.x, z = e.y;
      if (e.mode === "wind") { x += (Math.random() - 0.5) * 3; z += (Math.random() - 0.5) * 3; }
      M.root.position.set(x, y, z);
      M.root.rotation.set(0, -e.face, 0);
      const near = (e.x - w.player.x) ** 2 + (e.y - w.player.y) ** 2 < (e.r + 46) ** 2;
      M.root.scale.setScalar(s);
      animate(M, e, t, near);
      tint(M, e, t);
    }
    // Gestorbene: umkippen, kurz liegen bleiben, dann im Boden versinken
    for (const c of w.corpses) {
      if (c.ref && models.has(c.ref) && !seen.has(c.ref)) {
        dying.set(c, { M: models.get(c.ref), x: c.x, y: c.y, face: c.face, dir: c.dir, sc: c.sc * (c.boss ? BOSS_SCALE : CHAR_SCALE), t: 0, life: c.boss ? 5 : 2.6 });
        models.delete(c.ref);
      }
    }
    for (const [e, M] of models) if (!seen.has(e)) { releaseModel(M); models.delete(e); }
    if (dying.size > 40) for (const [c, d] of dying) { releaseModel(d.M); dying.delete(c); if (dying.size <= 40) break; }
    for (const [c, d] of dying) {
      d.t += dt;
      if (d.t >= d.life) { releaseModel(d.M); dying.delete(c); continue; }
      const M = d.M, k = Math.min(1, d.t / 0.45), fall = k * k * (3 - 2 * k);
      const sink = Math.max(0, (d.t - (d.life - 1)) / 1);
      M.root.position.set(d.x, -fall * M.height * 0.1 - sink * M.height * 0.5 * d.sc, d.y);
      M.root.scale.setScalar(d.sc);
      M.root.rotation.set(d.dir * fall * 0.25, -d.face, fall * 1.4);
      const dark = 1 - fall * 0.55;
      for (const m of M.mats) { m.color.copy(m.userData.base).multiplyScalar(dark); m.emissive.setRGB(0, 0, 0); }
    }
  }

  function syncPlayer(w, t) {
    const p = w.player;
    // Spielerfigur bei Waffenwechsel neu bauen
    if (playerModel && (playerModel.weaponId !== p.weaponId || playerModel.tier !== p.tier)) { scene.remove(playerModel.root); disposeTree(playerModel.root); playerModel = null; }
    if (!playerModel) playerModel = buildPlayer(w);
    const M = playerModel;
    M.root.position.set(p.x, 0, p.y);
    M.root.rotation.set(0, -p.aim, 0);
    M.root.scale.setScalar(PLAYER_SCALE);
    M.root.visible = !(p.invuln > 0 && w.state === "play" && Math.floor(p.invuln * 16) % 2 === 0);
    const ph = p.moving ? (p.walkT / 8) * TAU : 0;
    for (const L of M.legs) L.g.rotation.z = p.moving ? Math.sin(ph + (L.s > 0 ? Math.PI : 0)) * 0.6 : 0;
    M.body.position.y = p.moving ? Math.abs(Math.sin(ph)) * 0.8 : 0;
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
      s.position.set(p.x + Math.cos(a) * 64, 16, p.y + Math.sin(a) * 64);
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
      crate.add(mesh(box(46, 34, 40), new T3.MeshLambertMaterial({ map: obstacleTexture("medcrate") }), 0, 17, 0));
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

  function syncInstanced(w, t) {
    // Schatten unter Figuren (in hoher Qualität werfen Figuren echte Schatten)
    let n = 0;
    const blob = (x, z, r) => { if (n < 160) inst(blobShadows, n++, x, 0.6, z, 0, 0, r * 2.6, 1, r * 1.9); };
    for (const e of w.enemies) if (e.spawnT <= 0) blob(e.x, e.y, e.r * e.scale);
    blob(w.player.x, w.player.y, 16);
    for (const b of w.bullets) if (b.kind === "grenade") blob(b.x, b.y, 5);
    blobShadows.count = n; blobShadows.instanceMatrix.needsUpdate = true;
    blobShadows.material.opacity = quality >= 2 ? 0.55 : 1;
    // Münzen
    n = 0;
    for (const o of w.orbs) if (o.type === "coin" && n < 300) inst(coinsIM, n++, o.x, 8 + Math.sin(t * 5 + o.x) * 1.5, o.y, t * 4 + o.x, Math.PI / 2);
    coinsIM.count = n; coinsIM.instanceMatrix.needsUpdate = true;
    // Gegner-Projektile, Granaten, Bolzen
    let a = 0, pk = 0, gr = 0, bo = 0;
    for (const b of w.eBullets) {
      const s = b.r * 1.1;
      if (b.pink) { if (pk < 200) inst(pinkIM, pk++, b.x, 18, b.y, 0, 0, s, s, s); } else if (a < 200) inst(acidIM, a++, b.x, 18, b.y, 0, 0, s, s, s);
    }
    for (const b of w.bullets) {
      if (b.kind === "grenade" && gr < 60) { const k = 1 - b.life / b.maxLife; inst(grenadeIM, gr++, b.x, 14 + Math.sin(k * Math.PI) * 60, b.y, b.spin, b.spin * 0.7); }
      else if (b.kind === "bolt" && bo < 120) inst(boltIM, bo++, b.x, 22, b.y, -Math.atan2(b.vy, b.vx));
    }
    acidIM.count = a; pinkIM.count = pk; grenadeIM.count = gr; boltIM.count = bo;
    for (const im of [acidIM, pinkIM, grenadeIM, boltIM]) im.instanceMatrix.needsUpdate = true;
  }

  const FIRE = ["200,60,20", "255,140,40", "255,220,120"];
  const fireRgb = (k) => FIRE[k > 0.6 ? 2 : k > 0.3 ? 1 : 0];

  function fillBatches(w, t) {
    const m = camera.matrixWorld.elements;
    camR.set(m[0], m[1], m[2]); camU.set(m[4], m[5], m[6]);
    addB.begin(); normB.begin(); floorB.begin();
    const p = w.player;
    // Partikel
    for (const q of w.particles) {
      const k = Math.max(0, q.life / q.max);
      switch (q.t) {
        case "spark": { const sp = Math.hypot(q.vx, q.vy), len = Math.min(16, sp * 0.05 + 3); flat(addB, q.x - (q.vx / (sp || 1)) * len * 0.5, 16, q.y - (q.vy / (sp || 1)) * len * 0.5, Math.atan2(q.vy, q.vx), len * 0.5, q.w, CELL.streak, q.rgb, k); break; }
        case "fire": bill(addB, q.x, 14 + (1 - k) * 26, q.y, q.size * (1.5 - k * 0.5), CELL.glow, fireRgb(k), 0.9 * k); break;
        case "ember": bill(addB, q.x, 18 + (1 - k) * 30, q.y, q.size, CELL.glow, "255,160,60", k); break;
        case "flash": bill(addB, q.x, 24, q.y, q.r * 0.6, CELL.glow, q.rgb, k * 0.9); break;
        case "ring": { const rr = q.r * (1.15 - k * 0.8); flat(floorB, q.x, 2, q.y, 0, rr, rr, CELL.ring, q.rgb, k * 0.85); break; }
        case "bubble": bill(addB, q.x, 30 + (1 - k) * 20, q.y, q.size, CELL.glow, "140,255,74", k * 0.8); break;
        case "ice": bill(addB, q.x, 24, q.y, q.size, CELL.glow, "170,230,255", k * 0.9); break;
        case "drip": bill(addB, q.x, 18, q.y, q.size * 2, CELL.glow, q.rgb, k * 0.5); break;
        case "smoke": bill(normB, q.x, 20 + (1 - k) * 40, q.y, 24 * q.size, CELL.smoke, "120,120,115", Math.min(1, k * 1.4) * 0.7, q.rot); break;
        case "blood": bill(normB, q.x, q.z + 6, q.y, q.size * 1.4, CELL.blob, hexRgb(q.color), 1); break;
        case "gib": bill(normB, q.x, q.z + 5, q.y, 5.5, CELL.gib, q.trail === "#3f6e1a" ? "74,122,42" : q.trail === "#5a0f2a" ? "110,42,74" : "122,31,34", 1, q.rot); break;
        case "casing": bill(normB, q.x, q.z + 3, q.y, 3, CELL.casing, "255,255,255", 1, q.rot); break;
        case "debris": bill(normB, q.x, q.z + 3, q.y, q.size, CELL.blob, hexRgb(q.color), Math.min(1, k * 2)); break;
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
    // Markierungsring unter dem Spieler
    flat(normB, p.x, 0.9, p.y, 0, 25, 25, CELL.ring, "140,255,74", 0.5);
    flat(floorB, p.x, 1, p.y, 0, 30, 30, CELL.glow, "140,255,74", 0.18);
    // Gegner-Projektile, XP-Kugeln, Augen, Status
    for (const b of w.eBullets) bill(addB, b.x, 18, b.y, b.r * 3.2, CELL.glow, b.rgb, 0.7);
    for (const o of w.orbs) if (o.type === "xp") { const y = 12 + Math.sin(t * 6 + o.x) * 2; bill(addB, o.x, y, o.y, 11, CELL.glow, "90,200,255", 0.85); bill(addB, o.x, y, o.y, 4, CELL.glow, "220,250,255", 1); }
    for (const e of w.enemies) {
      if (e.spawnT > 0) continue;
      const M = models.get(e);
      const hh = heightOf(e) * 0.84;
      const fx = Math.cos(e.face), fy = Math.sin(e.face);
      const eye = e.type === "spitter" || e.type === "abom" ? "234,255,0" : e.type === "armored" ? "80,170,230" : "255,40,30";
      bill(addB, e.x + fx * e.r * 0.5, hh, e.y + fy * e.r * 0.5, e.def.boss ? e.r * 0.4 : e.r * 0.55, CELL.glow, eye, 0.5);
      if (e.type === "bomber" && Math.sin(t * 14 + e.wob) > 0) bill(addB, e.x - fx * e.r * 0.4, hh * 0.85, e.y - fy * e.r * 0.4, 14, CELL.glow, "255,40,20", 0.9);
      if (e.type === "mother") bill(addB, e.x - fx * e.r * 0.4, e.r * 1.2, e.y - fy * e.r * 0.4, e.r * 1.2, CELL.glow, "150,255,80", 0.3);
      if (e.phase2) bill(addB, e.x, e.r, e.y, e.r * 1.8, CELL.glow, "255,40,60", 0.22 + 0.12 * Math.sin(t * 10));
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
      bill(addB, mz.x, 24, mz.y, 16 * sc, CELL.star, p.weapon.flash === "tesla" ? "160,240,255" : "255,230,150", 1, Math.random() * TAU);
      bill(addB, mz.x, 24, mz.y, 34, CELL.glow, p.weapon.tracer, 0.75);
    }
    if (p.weapon.kind === "flame") bill(addB, mz.x, 22, mz.y, 5, CELL.glow, "110,200,255", 0.9);
    if (p.weapon.kind === "tesla") bill(addB, mz.x, 24, mz.y, 9 + Math.sin(t * 20) * 2, CELL.glow, "127,231,255", 0.8);
    if (p.tier >= 2) bill(addB, (p.x + mz.x) / 2, 26, (p.y + mz.y) / 2, 22, CELL.glow, "180,107,255", 0.3 + 0.1 * Math.sin(t * 5));
    for (let i = 0; i < p.drones; i++) { const d = w.dronePos(i); bill(addB, d.x + 6, 58, d.y + 30, 9, CELL.glow, "127,231,255", 0.8); }
    // Raum: leuchtende Fässer/Tanks, Tür-Pfeile, Versorgungskiste
    for (const l of w.roomLights) bill(addB, l.x, 40, l.y, l.r * 0.42, CELL.glow, l.rgb, 0.3 + 0.08 * Math.sin(t * 3 + l.x));
    const dk = w.run.doorK || 0;
    if (dk > 0) {
      for (let i = 0; i < 3; i++) flat(floorB, D.W / 2, 1.5, D.T + 26 + i * 24 - ((t * 40) % 24), -Math.PI / 2, 12, 15, CELL.chevron, "140,255,74", dk * (0.8 - i * 0.22));
      bill(addB, D.W / 2, 30, D.T, 70, CELL.glow, "140,255,74", dk * 0.45);
    }
    if (w.supplyCrate) bill(addB, w.supplyCrate.x, 30, w.supplyCrate.y, 60, CELL.glow, "140,255,74", 0.35 + 0.12 * Math.sin(t * 4));
    // Umgebungspartikel
    const th = w.theme;
    for (const a of w.ambient) {
      const y = 40 + Math.sin(a.ph * 0.6 + a.x) * 30;
      if (th === "lab") bill(addB, a.x, y, a.y, a.size * 2.5, CELL.glow, "140,255,90", 0.3 + 0.2 * Math.sin(a.ph * 2));
      else bill(normB, a.x, y, a.y, a.size * 1.2, CELL.blob, th === "street" ? "190,190,190" : "230,240,235", 0.35);
    }
    // Wandlampen
    if (room) for (let i = 0; i < room.lamps.length; i++) {
      const l = room.lamps[i];
      const fl = l.flicker ? (Math.sin(t * 23) + Math.sin(t * 7.3 + 1) > 1.25 ? 0.15 : 1) : 1;
      flat(floorB, l.px, 0.8, l.pz, 0, 92, 92, CELL.glow, room.lampRgb, 0.3 * fl);
      bill(addB, l.x, 48, l.z, 15, CELL.glow, room.lampRgb, 0.95 * fl);
      bill(addB, l.x, 48, l.z, 5, CELL.glow, "255,255,240", fl);
    }
    addB.end(); normB.end(); floorB.end();
  }

  // Punktlicht-Pool: die stärksten Lichtquellen des Frames bekommen echtes Licht
  const lightCands = [];
  function assignLights(w, t) {
    lightCands.length = 0;
    const p = w.player;
    if (p.muzzle > 0 && p.weapon.flash) { const m = w.muzzlePoint(); lightCands.push([m.x, 28, m.y, p.weapon.tracer, 2.6, 240, 10]); }
    for (const q of w.particles) if (q.t === "flash") lightCands.push([q.x, 30, q.y, q.rgb, 3.2 * (q.life / q.max), q.r * 1.8, 9]);
    for (const z of w.zaps) lightCands.push([z.x2, 30, z.y2, "127,231,255", 2.2 * (z.life / z.max), 200, 8]);
    for (const e of w.enemies) if (e.burnT > 0) lightCands.push([e.x, 26, e.y, "255,140,40", 1.4, 140, 4]);
    let fires = 0;
    for (const b of w.bullets) if (b.kind === "flame" && fires++ % 6 === 0) lightCands.push([b.x, 22, b.y, "255,150,50", 1.8, 160, 5]);
    for (const l of w.roomLights) lightCands.push([l.x, 50, l.y, l.rgb, 1.3 + 0.2 * Math.sin(t * 3 + l.x), l.r * 1.8, 2]);
    if ((w.run.doorK || 0) > 0) lightCands.push([D.W / 2, 40, D.T + 10, "140,255,74", 1.6 * w.run.doorK, 220, 3]);
    if (w.supplyCrate) lightCands.push([w.supplyCrate.x, 50, w.supplyCrate.y, "140,255,74", 1.6, 220, 3]);
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

  function render(w, dt, shake) {
    if (!ready) return;
    time += dt;
    const t = time;
    if (w.floorCanvas !== builtFloor) buildRoom(w);
    // Neue Blutspuren erst gesammelt hochladen (Textur-Upload ist auf Handys teuer)
    if (w.consumeFloorDirty && t - lastFloorUpload > (quality >= 2 ? 0.3 : 0.6) && w.consumeFloorDirty()) { room.floorTex.needsUpdate = true; lastFloorUpload = t; }
    const sx = shake ? (Math.random() - 0.5) * shake * 1.6 : 0, sz = shake ? (Math.random() - 0.5) * shake * 1.6 : 0;
    const k = Math.min(1, dt * 3);
    CAM.fx += ((w.player.x - D.W / 2) * 0.025 - CAM.fx) * k;
    CAM.fz += ((w.player.y - (D.T + D.B) / 2) * 0.06 - CAM.fz) * k;
    // Boss-Auftritt: Kamera fährt kurz an den Boss heran
    let bossK = 0, bx = 0, bz = 0;
    for (const e of w.enemies) if (e.def.boss && e.spawnT > 0) { bossK = Math.sin(Math.min(1, 1 - e.spawnT / e.spawnMax) * Math.PI); bx = e.x - CAM.tx; bz = e.y - CAM.tz; }
    CAM.boss += (bossK - CAM.boss) * Math.min(1, dt * 5);
    if (w.menuCam) placeMenuCamera(t, w);
    else placeCamera(CAM.dist * (1 - 0.3 * CAM.boss), sx + CAM.fx + bx * 0.6 * CAM.boss, sz + CAM.fz + bz * 0.6 * CAM.boss);
    syncEnemies(w, t, dt);
    syncPlayer(w, t);
    syncDoor(w);
    syncSupply(w);
    syncInstanced(w, t);
    fillBatches(w, t);
    assignLights(w, t);
    // Schatten nur jedes 2. Bild neu berechnen – bei 60 FPS unsichtbar, spart viele Draw Calls
    frame++;
    renderer.shadowMap.autoUpdate = false;
    if (quality >= 2 && frame % 2 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }

  // Welt-Position → Bildschirm (logische 540×960-Koordinaten des HUD-Canvas)
  function project(x, y, h = 0) {
    pv.set(x, h, y).project(camera);
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
    if (playerModel) { scene.remove(playerModel.root); disposeTree(playerModel.root); playerModel = null; }
    sawMeshes.forEach((s) => { s.visible = false; });
    if (crate) crate.visible = false;
    droneMeshes.forEach((d) => { d.visible = false; });
  }

  return {
    init, resize, render, project, heightOf, setQuality, clear,
    get ready() { return ready; },
    get debug() { return { scene, camera, renderer, flashlight, moon, hemi, CAM, fitCamera, stats: () => ({ pooled: [...pools.values()].reduce((a, l) => a + l.length, 0), active: models.size, dying: dying.size, geoCache: geoCache.size, texCache: texCache.size, shared: shared.size }) }; },
  };
})();
