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
    setupCorpseBatch();
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
  // Spielstart: Kamera fliegt aus der Menü-Perspektive in die Spielansicht
  let fly = null;
  function placeCamera(dist, sx = 0, sz = 0) {
    if (menuMode) {
      menuMode = false;
      fly = { t0: performance.now(), pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
      camera.fov = CAM.fov; camera.setViewOffset(D.W, D.H, 0, CAM.offY, D.W, D.H); camera.updateProjectionMatrix();
    }
    camera.position.set(CAM.tx + sx, Math.sin(CAM.elev) * dist, CAM.tz + Math.cos(CAM.elev) * dist + sz);
    camera.lookAt(CAM.tx + sx, 0, CAM.tz + sz);
    if (fly) {
      // Echtzeit statt Spielzeit: dauert auf jedem Gerät gleich lang
      const x = Math.min(1, (performance.now() - fly.t0) / 1300), k = x * x * (3 - 2 * x);
      camera.position.lerpVectors(fly.pos, camera.position.clone(), k);
      camera.quaternion.slerpQuaternions(fly.quat, camera.quaternion.clone(), k);
      camera.fov = fly.fov + (CAM.fov - fly.fov) * k;
      camera.setViewOffset(D.W, D.H, 0, CAM.offY * k, D.W, D.H);
      camera.updateProjectionMatrix();
      if (x >= 1) fly = null;
    }
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
        // Graffiti, Plakat, Dreck und Moos unten
        g.save(); g.globalAlpha = 0.75; g.lineCap = "round"; g.lineWidth = 4;
        for (const col of ["#e5383b", "#2bd9ff"]) { g.strokeStyle = col; g.beginPath(); let x = 30 + R() * 60, y = 50 + R() * 30; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += 6 + R() * 8; y += (R() - 0.5) * 26; g.lineTo(x, y); } g.stroke(); }
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
    }, true);
  }
  // Dachfläche (Bitumen mit Kies), kachelbar
  function roofTexture(kind) {
    return tex(`roof:${kind}`, 128, 128, (g) => {
      let s = 31 + kind.length;
      const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      g.fillStyle = ROOF[kind] || ROOF.street; g.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 1400; k++) { g.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + R() * 0.08})`; g.fillRect(R() * 128, R() * 128, 1.5, 1.5); }
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; for (let y = 0; y < 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
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

  const obsNormal = (kind) => { obstacleTexture(kind); return normalTexFor(`obs:${kind}`, 3); };
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
        add(mesh(box(W, h, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture(o.kind), normalMap: obsNormal(o.kind) }), 0, h / 2, 0));
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
        add(mesh(box(W, 30, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("barricade"), normalMap: obsNormal("barricade") }), 0, 15, 0));
        break;
      case "dumpster":
        add(mesh(box(W, 40, Hd), new T3.MeshLambertMaterial({ map: obstacleTexture("dumpster"), normalMap: obsNormal("dumpster") }), 0, 20, 0));
        add(mesh(box(W + 2, 3, Hd + 2), slam("#244a2e"), 0, 41.5, 0));
        break;
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
      for (const k of ["map", "normalMap", "specularMap", "emissiveMap"]) if (m[k] && !cachedTex.has(m[k])) m[k].dispose();
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
    const crop = (t) => { t.repeat.set(aw / D.W, ah / D.H); t.offset.set(D.L / D.W, 1 - D.B / D.H); return t; };
    const floorN = crop(new T3.CanvasTexture(normalCanvas(fc, 2.4, 720)));
    floorN.anisotropy = 8;
    const floorMat = new T3.MeshPhongMaterial({ map: floorTex, color: 0xb4b4b4, normalMap: floorN, normalScale: new T3.Vector2(1, 1), specular: 0x4a5058, shininess: 60 });
    if (fc.gloss) { floorMat.specularMap = crop(new T3.CanvasTexture(fc.gloss)); }
    const floor = mesh(new T3.PlaneGeometry(aw, ah), floorMat, (D.L + D.R) / 2, 0, (D.T + D.B) / 2);
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
    const wt = wallTexture(th.wall), wn = normalTexFor(`wall:${th.wall}`, 4), rt = roofTexture(th.wall);
    const edgeMat = slam(EDGE[w.theme] || EDGE.street);
    const wall = (x0, z0, x1, z1, h, edge) => {
      const len = edge === "x" ? z1 - z0 : x1 - x0;
      const rep2 = (src, rx, ry) => { const t = src.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; };
      const side = new T3.MeshLambertMaterial({ map: rep2(wt, len / 128, h / 64), normalMap: rep2(wn, len / 128, h / 64) });
      const roof = new T3.MeshLambertMaterial({ map: rep2(rt, (x1 - x0) / 96, (z1 - z0) / 96) });
      const m = mesh(box(x1 - x0, h, z1 - z0), [side, side, roof, side, side, side], (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
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
    const obs = new Map();
    for (const o of w.obstacles) {
      const om = bakeStatic(obstacleModel(o, w.theme));
      obs.set(o, om);
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

    room = { group: g, floorTex, door, lamps, lampRgb, obs };
    builtFloor = fc;
    renderer.shadowMap.needsUpdate = true;
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
    abom: [{ skin: "#8a4a6a" }],
    mother: [{ skin: "#3f5a3a" }],
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
    const bulk = P.brute ? 1.18 : P.pustules ? 1.28 : P.bloat ? 1.1 : P.thin ? 0.84 : 1;
    const la = P.longArms ? 1.3 : 1;
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
      const arm = mesh(cap(0.15 * r * bulk, 0.72 * r * la), P.armor ? slam("#1b2433") : P.brute || P.bloat || P.claws ? skin : shirt, 0.5 * r * la, 0, 0);
      arm.rotation.z = -Math.PI / 2;
      sh.add(arm);
      sh.add(mesh(ico(0.17 * r * bulk * (P.brute ? 1.35 : 1), 0), P.armor ? slam("#1d2330") : skin, 1.04 * r * la, 0, 0));
      if (P.claws) for (let k = -1; k <= 1; k++) { const cl = mesh(cone(0.05 * r, 0.42 * r, 4), slam("#e8e0c8"), 1.3 * r * la, 0, k * 0.09 * r); cl.rotation.z = -Math.PI / 2; sh.add(cl); }
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
    // Haare: Kappe + abstehende Strähnen
    if (P.hair) {
      const hair = mesh(ico(hr * 1.06, 1), slam(P.hair), -0.07 * r, 0.1 * r, 0); hair.scale.set(1, 0.6, 1.04); head.add(hair);
      for (let i = 0; i < 5; i++) { const t2 = mesh(cone(0.07 * r, 0.3 * r, 4), slam(P.hair), -0.1 * r - i * 0.05 * r, 0.3 * r, (i - 2) * 0.12 * r); t2.rotation.z = 0.9 + i * 0.12; t2.rotation.x = (i - 2) * 0.3; head.add(t2); }
    }
    // Zähne im offenen Maul
    if (!P.armor) head.add(mesh(box(0.05 * r, 0.04 * r, 0.24 * r), slam("#e8e0c8"), hr * 0.96, -0.12 * r, 0));
    // Freiliegende Rippen
    if (P.ribs) {
      M.body.add(mesh(box(0.1 * r, 0.52 * r, 0.46 * r), slam("#3a0a0c"), 0.32 * r, 1.48 * r, 0.08 * r));
      for (let i = 0; i < 4; i++) M.body.add(mesh(box(0.08 * r, 0.06 * r, 0.42 * r), slam("#e3dcc8"), 0.37 * r, 1.3 * r + i * 0.13 * r, 0.08 * r));
    }
    // Zerfetzte Kleidung: herabhängende Fetzen
    if (P.torn) for (let i = 0; i < 4; i++) {
      const flap = mesh(box(0.05 * r, 0.32 * r, 0.16 * r), slam(P.shirt), 0.25 * r * Math.cos(i * 1.7), 1.04 * r, (i - 1.5) * 0.24 * r);
      flap.rotation.x = (i - 1.5) * 0.25; flap.rotation.z = 0.2 * Math.sin(i * 2.3);
      M.body.add(flap);
    }
    accessories(M, P, r, head, hr, shirt, skin);
    M.body.add(head);
    M.extra.head = head;
    M.body.rotation.z = -(P.lean || 0);
    M.lean = -(P.lean || 0);
    M.height = 2.9 * r;
    return M;
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
      const h = mesh(ico(hr * 1.18, 1), slam("#4a5530"), -0.03 * r, 0.1 * r, 0); h.scale.set(1.04, 0.72, 1.06); head.add(h);
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
    if (P.mohawk) for (let i = 0; i < 6; i++) { const m = mesh(cone(0.07 * r, 0.32 * r, 4), slam(P.mohawk), hr * 0.5 - i * 0.12 * r, hr * 0.95, 0); m.rotation.z = 0.25; head.add(m); }
    if (P.longHair) {
      const cap2 = mesh(ico(hr * 1.08, 1), slam(P.longHair), -0.06 * r, 0.08 * r, 0); cap2.scale.set(1, 0.7, 1.06); head.add(cap2);
      head.add(mesh(box(0.14 * r, 0.75 * r, 0.62 * r), slam(P.longHair), -0.28 * r, -0.3 * r, 0));
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
    if (P.tactical) B.add(mesh(box(0.56 * r, 0.7 * r, 0.96 * r), slam("#3a4230"), 0.04 * r, 1.58 * r, 0));
    if (P.coat) { const c2 = mesh(box(0.62 * r, 0.7 * r, 0.96 * r), slam(P.shirt), -0.02 * r, 0.98 * r, 0); B.add(c2); }
    if (P.pustules) for (let i = 0; i < 10; i++) { const a = i * 2.39; B.add(mesh(ico(0.07 * r + (i % 3) * 0.03 * r, 0), sbasic(P.pustules), 0.42 * r * Math.cos(a), 1.1 * r + (i % 4) * 0.22 * r, 0.5 * r * Math.sin(a))); }
    if (P.burning) {
      for (let i = 0; i < 8; i++) { const a = i * 2.1; B.add(mesh(box(0.05 * r, 0.24 * r, 0.04 * r), sbasic("#ff8a2a"), 0.36 * r * Math.cos(a), 1.2 * r + (i % 4) * 0.2 * r, 0.48 * r * Math.sin(a))); }
      B.add(mesh(box(0.34 * r, 0.5 * r, 0.22 * r), slam("#a01818"), -0.44 * r, 1.6 * r, 0));
    }
    if (P.coils) for (const s of [-1, 1]) {
      B.add(mesh(cyl(0.1 * r, 0.1 * r, 0.7 * r, 8), sbasic("#7fe7ff"), -0.46 * r, 1.75 * r, s * 0.22 * r));
      for (let k = 0; k < 3; k++) { const t2 = mesh(torus(0.13 * r, 0.03 * r), slam("#c87533"), -0.46 * r, 1.5 * r + k * 0.22 * r, s * 0.22 * r); t2.rotation.x = Math.PI / 2; B.add(t2); }
    }
  }

  // Seuchenratte: klein, flink, langer Schwanz
  function buildRat(r, P) {
    const M = makeModel("rat");
    const fur = flashMat(M, P.shirt), skin = flashMat(M, P.skin);
    const body = mesh(cap(0.55 * r, 0.9 * r), fur, 0, 0.7 * r, 0); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.9); M.body.add(body);
    for (const [x, ph] of [[0.5, 0], [-0.5, Math.PI]]) for (const s of [-1, 1]) {
      const hip = group(x * r, 0.55 * r, s * 0.35 * r);
      hip.add(mesh(cap(0.12 * r, 0.3 * r), skin, 0, -0.3 * r, 0));
      M.body.add(hip); M.legs.push({ g: hip, s, ph: ph + (s > 0 ? 0.6 : 0) });
    }
    const head = group(0.95 * r, 0.8 * r, 0);
    const snout = mesh(cone(0.38 * r, 0.9 * r, 6), fur, 0.3 * r, 0, 0); snout.rotation.z = -Math.PI / 2; head.add(snout);
    head.add(mesh(ico(0.08 * r, 0), skin, 0.78 * r, 0, 0));
    for (const s of [-1, 1]) {
      head.add(mesh(ico(0.18 * r, 1), skin, -0.05 * r, 0.3 * r, s * 0.25 * r));
      head.add(mesh(ico(0.07 * r, 0), sbasic("#ff3030"), 0.25 * r, 0.14 * r, s * 0.17 * r));
    }
    M.body.add(head); M.extra.head = head;
    const tail = group(-0.95 * r, 0.6 * r, 0);
    const tl = mesh(cyl(0.05 * r, 0.1 * r, 1.6 * r, 5), skin, -0.8 * r, 0, 0); tl.rotation.z = Math.PI / 2 + 0.2; tail.add(tl);
    M.body.add(tail); M.extra.tail = tail;
    M.height = 1.3 * r;
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
  // look: { h: Höhe für Umgebungsverdeckung, grime: Schmutz/Blut-Anteil, seed } – "gemalte" Vertexfarben:
  // unten dunkler, jede Fläche leicht anders getönt, fleckige Blut-/Schmutzstellen
  const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const wp = new T3.Vector3();
  function mergeMeshes(meshes, material, node, look) {
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
    const toRoot = node.matrixWorld;
    for (const [g, c] of parts) {
      const n = g.attributes.position.count, P = g.attributes.position.array;
      pos.set(P, o * 3);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < n; i += 3) {
        let r = c.r, gg = c.g, b = c.b;
        if (look) {
          // Flächenmittelpunkt in Modell-Koordinaten
          wp.set((P[i * 3] + P[i * 3 + 3] + P[i * 3 + 6]) / 3, (P[i * 3 + 1] + P[i * 3 + 4] + P[i * 3 + 7]) / 3, (P[i * 3 + 2] + P[i * 3 + 5] + P[i * 3 + 8]) / 3).applyMatrix4(toRoot);
          const j = 1 + (hash1(o + i + look.seed) - 0.5) * 0.16;
          r *= j; gg *= j; b *= j;
          if (look.grime) {
            const f = look.freq, nz = Math.sin(wp.x * f + look.seed) * Math.sin(wp.y * f * 0.8 + look.seed * 1.7) * Math.sin(wp.z * f * 1.3 + look.seed * 0.3);
            if (nz > 0.32) { const k = Math.min(1, (nz - 0.32) * 4) * look.grime; r += (look.gr - r) * k; gg += (look.gg - gg) * k; b += (look.gb - b) * k; }
          }
          if (look.h) { const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, wp.y / (look.h * 0.7))); r *= ao; gg *= ao; b *= ao; }
        }
        for (let v = 0; v < 3 && i + v < n; v++) { const k = (o + i + v) * 3; col[k] = r; col[k + 1] = gg; col[k + 2] = b; }
      }
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
  function bakeNode(node, lit, glow, keep, outline = false, look = null) {
    const litList = [], glowList = [];
    for (const c of node.children) {
      if (!c.isMesh) { bakeNode(c, lit, glow, keep, outline, look); continue; }
      const m = c.material;
      if (keep.has(c) || c.userData.solo || c.children.length || Array.isArray(m) || m.map || m.transparent) continue;
      (m.isMeshBasicMaterial ? glowList : litList).push(c);
    }
    for (const [list, mat] of [[litList, lit], [glowList, glow]]) {
      if (!list.length) continue;
      for (const c of list) node.remove(c);
      const merged = mergeMeshes(list, mat, node, mat === lit ? look : null);
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
  function bakeStatic(o, look = { h: 40, seed: 7 }) { o.updateMatrixWorld(true); bakeNode(o, vlit(), vglow(), new Set(), false, look); return o; }
  function bake(M) {
    const keep = new Set();
    for (const v of Object.values(M.extra)) {
      if (v && v.isObject3D) keep.add(v);
      else if (Array.isArray(v)) v.forEach((x) => { if (x && x.isObject3D) keep.add(x); });
    }
    const lit = new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const glow = new T3.MeshBasicMaterial({ vertexColors: true });
    M.root.updateMatrixWorld(true);
    // Zombies: Blut & Dreck, Spieler: nur etwas Staub
    const zombie = M.kind !== "player";
    const look = { h: M.height, seed: Math.random() * 10, grime: zombie ? 0.75 : 0.3, freq: zombie ? 0.22 : 0.3, gr: zombie ? 0.16 : 0.12, gg: zombie ? 0.005 : 0.1, gb: zombie ? 0.008 : 0.07 };
    if (M.kind === "abom" || M.kind === "mother") look.grime = 0.4;
    bakeNode(M.root, lit, glow, keep, true, look);
    // Einzelteile mit eigener Animation behalten ihre Materialien; der Rest blitzt gemeinsam auf
    M.mats = [lit, ...M.mats.filter((m) => [...keep].some((k) => k.material === m))];
  }

  const builders = { crawler: buildCrawler, dog: buildDog, rat: buildRat, abom: buildAbom, mother: buildMother };
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
    if (M.extra.head) M.extra.head.visible = true;
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
      if (e.mode === "crouch") { M.body.position.y = -0.22 * e.r; M.body.rotation.z -= 0.35; for (const L of M.legs) L.g.rotation.z = L.s * 0.5; }
      else if (e.mode === "leap") { M.body.rotation.z -= 0.6; for (const L of M.legs) L.g.rotation.z = -0.9; for (const A of M.arms) A.g.rotation.z = 0.9; }
      else if (e.mode === "scream") { if (M.extra.head) M.extra.head.rotation.z = 0.55; for (const A of M.arms) { A.g.rotation.y = A.s * 1.1; A.g.rotation.z = 0.5; } M.body.rotation.z += 0.2; }
      else if (e.mode === "zap") { for (const A of M.arms) A.g.rotation.z = 1.25 + Math.random() * 0.2; M.body.rotation.x += (Math.random() - 0.5) * 0.2; }
      if (e.mode !== "scream" && M.extra.head) M.extra.head.rotation.z = 0;
      if (e.mode !== "scream") for (const A of M.arms) if (!A.crawl) A.g.rotation.y = A.s * 0.18;
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
    else if (e.phase2 || e.rageT > 0) { const k = 0.35 + 0.25 * Math.sin(t * 10); r = k; g = 0.02; b = 0.06; }
    else if (e.mode === "zap") { const k = Math.random() < 0.5 ? 0.7 : 0.2; r = k * 0.4; g = k * 0.9; b = k; }
    else if (e.slowT > 0) { r = 0.15; g = 0.4; b = 0.7; }
    else if (e.burnT > 0 || e.type === "burner") { const k = 0.3 + 0.2 * Math.sin(t * 20 + e.wob); r = k; g = k * 0.4; }
    else if (e.elite) { const k = 0.18 + 0.1 * Math.sin(t * 5); r = k; g = k * 0.75; }
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
  };
  function buildPlayer(w) {
    const p = w.player;
    const M = buildPlayerModel(p.skin || "soldier", p.weaponId, p.tier, p.weaponId === "flame");
    scene.add(M.root);
    return M;
  }
  function buildPlayerModel(skinId, weaponId, tier, tanks = false) {
    const r = 16, S = SKINS[skinId] || SKINS.soldier;
    const M = makeModel("player");
    const C = (k) => S.shiny ? smat(`gold:${S[k]}`, () => new T3.MeshLambertMaterial({ color: S[k], emissive: 0x3a2600, flatShading: true })) : slam(S[k]);
    const torsoMat = C("torso"), pants = C("pants"), dark = C("boots");
    for (const s of [-1, 1]) {
      const hip = group(-0.05 * r, 0.92 * r, s * 0.3 * r);
      hip.add(mesh(cap(0.2 * r, 0.48 * r), pants, 0, -0.44 * r, 0));
      hip.add(mesh(box(0.48 * r, 0.2 * r, 0.32 * r), dark, 0.1 * r, -0.86 * r, 0));
      M.body.add(hip); M.legs.push({ g: hip, s });
    }
    const torso = mesh(cap(0.42 * r, 0.42 * r), torsoMat, 0, 1.52 * r, 0); torso.scale.set(0.84, 1, 1.32); M.body.add(torso);
    for (let i = -1; i <= 1; i++) M.body.add(mesh(box(0.2 * r, 0.24 * r, 0.24 * r), C("pouch"), 0.33 * r, 1.45 * r, i * 0.3 * r));
    M.body.add(mesh(ico(0.07 * r, 0), sbasic(S.glow), 0.05 * r, 2.0 * r, -0.62 * r));
    if (tanks) {
      for (const s of [-1, 1]) M.body.add(mesh(cyl(0.2 * r, 0.2 * r, 0.9 * r, 8), slam("#a3312a"), -0.5 * r, 1.6 * r, s * 0.24 * r));
    } else if (S.tank) {
      M.body.add(mesh(cyl(0.26 * r, 0.26 * r, 1.0 * r, 10), C("pack"), -0.52 * r, 1.6 * r, 0));
      M.body.add(mesh(cyl(0.1 * r, 0.1 * r, 0.2 * r, 6), slam("#9aa3ab"), -0.52 * r, 2.15 * r, 0));
    } else {
      M.body.add(mesh(box(0.42 * r, 0.9 * r, 0.8 * r), C("pack"), -0.52 * r, 1.6 * r, 0));
      const roll = mesh(cyl(0.16 * r, 0.16 * r, 0.82 * r, 8), C("roll"), -0.55 * r, 2.12 * r, 0); roll.rotation.x = Math.PI / 2; M.body.add(roll);
    }
    for (const s of [-1, 1]) M.body.add(mesh(ico(0.26 * r, 1), C("pads"), 0, 1.9 * r, s * 0.66 * r));
    // Ausrüstung: Gürtel mit Taschen, Knieschoner, Holster, Funkantenne
    const belt = mesh(cyl(0.4 * r, 0.4 * r, 0.14 * r, 12), C("belt"), 0, 1.12 * r, 0); belt.scale.set(0.84, 1, 1.3); M.body.add(belt);
    M.body.add(mesh(box(0.12 * r, 0.12 * r, 0.1 * r), slam("#c9a043"), 0.33 * r, 1.12 * r, 0));
    for (const z of [-0.36, 0.36]) M.body.add(mesh(box(0.2 * r, 0.22 * r, 0.18 * r), C("pouch"), 0.12 * r, 1.08 * r, z * r));
    for (const L2 of M.legs) L2.g.add(mesh(ico(0.13 * r, 0), C("boots"), 0.14 * r, -0.4 * r, 0));
    M.legs[1].g.add(mesh(box(0.16 * r, 0.3 * r, 0.12 * r), slam("#1c1d1b"), 0, -0.22 * r, 0.2 * r));
    if (!tanks && !S.tank && !S.hood) {
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
      const sc2 = mesh(torus(0.34 * r, 0.09 * r), slam(S.scarf), 0.04 * r, 2.06 * r, 0); sc2.rotation.x = Math.PI / 2; M.body.add(sc2);
      for (const z of [-0.08, 0.08]) { const tail = mesh(box(0.06 * r, 0.6 * r, 0.12 * r), slam(S.scarf), -0.42 * r, 1.82 * r, z * r); tail.rotation.z = 0.6; M.body.add(tail); }
    }
    // Arme zur Waffe
    const grip = new T3.Vector3(0.72 * r, 1.45 * r, 0.12 * r);
    for (const [s, tgt] of [[1, grip], [-1, new T3.Vector3(1.15 * r, 1.5 * r, 0.05 * r)]]) {
      const sh = new T3.Vector3(0.02 * r, 1.86 * r, s * 0.64 * r);
      const dir = tgt.clone().sub(sh), len = dir.length();
      const arm = mesh(cap(0.14 * r, len - 0.2 * r), C("arm"), 0, 0, 0);
      arm.position.copy(sh.clone().add(tgt).multiplyScalar(0.5));
      arm.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), dir.normalize());
      M.body.add(arm);
      M.body.add(mesh(ico(0.15 * r, 0), slam("#1f1f1f"), tgt.x, tgt.y, tgt.z));
    }
    // Kopf: Helm/Kapuze/Hut je Skin
    const head = group(0.08 * r, 2.4 * r, 0);
    head.add(mesh(ico(0.36 * r, 1), slam(S.face)));
    if (S.hood) {
      const hood = mesh(ico(0.48 * r, 1), C("helmet"), -0.05 * r, 0.04 * r, 0); hood.scale.set(1.02, 1.04, 1); head.add(hood);
      head.add(mesh(box(0.1 * r, S.gasmask ? 0.26 * r : 0.1 * r, 0.56 * r), sbasic(S.visor), 0.4 * r, S.gasmask ? 0.06 * r : 0.04 * r, 0));
    } else if (S.hat) {
      head.add(mesh(cyl(0.62 * r, 0.62 * r, 0.05 * r, 14), C("helmet"), 0, 0.32 * r, 0));
      head.add(mesh(cyl(0.34 * r, 0.38 * r, 0.32 * r, 12), C("helmet"), 0, 0.5 * r, 0));
    } else {
      const helmet = mesh(ico(0.46 * r, 1), C("helmet"), -0.03 * r, 0.1 * r, 0); helmet.scale.set(1, 0.8, 1); head.add(helmet);
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
    // Waffe
    const wpn = weaponModel(weaponId, tier);
    wpn.position.copy(grip);
    M.body.add(wpn);
    M.extra.weapon = wpn;
    M.extra.gripX = grip.x;
    M.weaponId = weaponId;
    M.tier = tier;
    M.skin = skinId;
    M.height = 2.9 * r;
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
    const k = `${skinId}:${weaponId}:${tier}`;
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
      const dt = Math.min(0.05, (now - (pv3.last || now)) / 1000); pv3.last = now;
      pv3.M.root.rotation.y += dt * 0.9;
      pv3.r.render(pv3.sc, pv3.cam);
      pv3.raf = requestAnimationFrame(loop);
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
  let blobShadows, coinsIM, acidIM, pinkIM, grenadeIM, boltIM, chunkIM, casingIM, healIM, healCrossIM, headIM, limbIM, rocketIM, discIM, pillar, doorBeam;
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
    // Rakete (Körper + rote Spitze als ein Mesh) und Sägeblatt
    const rb = new T3.CylinderGeometry(2.6, 2.6, 16, 8).toNonIndexed(); rb.rotateZ(-Math.PI / 2);
    const rt = new T3.ConeGeometry(2.6, 6, 8).toNonIndexed(); rt.rotateZ(-Math.PI / 2); rt.translate(11, 0, 0);
    const rocketGeo = new T3.BufferGeometry();
    rocketGeo.setAttribute("position", new T3.BufferAttribute(new Float32Array([...rb.attributes.position.array, ...rt.attributes.position.array]), 3));
    const rcol = []; for (let i = 0; i < rb.attributes.position.count; i++) rcol.push(0.75, 0.77, 0.8); for (let i = 0; i < rt.attributes.position.count; i++) rcol.push(0.8, 0.12, 0.1);
    rocketGeo.setAttribute("color", new T3.BufferAttribute(new Float32Array(rcol), 3)); rocketGeo.computeVertexNormals();
    rocketIM = new T3.InstancedMesh(rocketGeo, new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 40);
    discIM = new T3.InstancedMesh(new T3.CylinderGeometry(9, 9, 1.4, 16), new T3.MeshLambertMaterial({ color: 0xd8dee4, emissive: 0x303438, flatShading: true }), 60);
    for (const im of [blobShadows, coinsIM, acidIM, pinkIM, grenadeIM, boltIM, chunkIM, casingIM, healIM, healCrossIM, rocketIM, discIM]) { im.frustumCulled = false; im.count = 0; scene.add(im); }
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
      if (!M) { M = acquireModel(e.type, e.r, e.variant); models.set(e, M); }
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
    }
    // Gestorbene: Pose und Flugbahn kommen aus der Körper-Physik des Spiels
    for (const c of w.corpses) {
      if (c.ref && models.has(c.ref) && !seen.has(c.ref) && !dying.has(c)) {
        const M = models.get(c.ref);
        models.delete(c.ref);
        if (c.headless && M.extra.head) M.extra.head.visible = false;
        dying.set(c, { M, sc: c.sc * (c.boss ? BOSS_SCALE : CHAR_SCALE), boss: !!c.boss });
      }
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
  const cbN = new T3.Vector3(), cbP = new T3.Vector3(), cbC = new T3.Color(), cbNm = new T3.Matrix3();
  function setupCorpseBatch() {
    const g = new T3.BufferGeometry();
    for (const [name, size] of [["position", 3], ["normal", 3], ["color", 3]]) g.setAttribute(name, new T3.BufferAttribute(new Float32Array(CORPSE_MAXV * size), size).setUsage(T3.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    corpseBatch = new T3.Mesh(g, new T3.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    corpseBatch.frustumCulled = false;
    corpseBatch.receiveShadow = true;
    scene.add(corpseBatch);
  }
  function resetCorpseBatch() { corpseN = 0; if (corpseBatch) corpseBatch.geometry.setDrawRange(0, 0); }
  function bakeCorpseMesh(M) {
    if (!corpseBatch) return;
    M.root.updateMatrixWorld(true);
    const g = corpseBatch.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, start = corpseN;
    M.root.traverseVisible((o) => {
      if (!o.isMesh || o.userData.outline) return;
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const sp = src.attributes.position, sn = src.attributes.normal, sc = src.attributes.color, n = sp.count;
      if (corpseN + n > CORPSE_MAXV) return;
      const tint = o.material.color || cbC.setRGB(1, 1, 1);
      cbNm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < n; i++) {
        cbP.fromBufferAttribute(sp, i).applyMatrix4(o.matrixWorld);
        P.setXYZ(corpseN + i, cbP.x, cbP.y, cbP.z);
        if (sn) { cbN.fromBufferAttribute(sn, i).applyMatrix3(cbNm).normalize(); N.setXYZ(corpseN + i, cbN.x, cbN.y, cbN.z); }
        const r = sc ? sc.getX(i) : 1, gg = sc ? sc.getY(i) : 1, b = sc ? sc.getZ(i) : 1;
        C.setXYZ(corpseN + i, r * tint.r, gg * tint.g, b * tint.b);
      }
      if (src !== o.geometry) src.dispose();
      corpseN += n;
    });
    if (corpseN === start) return;
    for (const a of [P, N, C]) { a.clearUpdateRanges(); a.addUpdateRange(start * 3, (corpseN - start) * 3); a.needsUpdate = true; }
    g.setDrawRange(0, corpseN);
  }

  function syncPlayer(w, t) {
    const p = w.player;
    // Spielerfigur bei Waffenwechsel neu bauen
    if (playerModel && (playerModel.weaponId !== p.weaponId || playerModel.tier !== p.tier || playerModel.skin !== (p.skin || "soldier"))) { scene.remove(playerModel.root); disposeTree(playerModel.root); playerModel = null; }
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

  function syncObstacles() {
    if (!room) return;
    for (const [o, grp] of room.obs) {
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

  function syncInstanced(w, t) {
    // Schatten unter Figuren (in hoher Qualität werfen Figuren echte Schatten)
    let n = 0;
    const blob = (x, z, r) => { if (n < 160) inst(blobShadows, n++, x, 0.6, z, 0, 0, r * 2.6, 1, r * 1.9); };
    for (const e of w.enemies) if (e.spawnT <= 0) blob(e.x, e.y, e.r * e.scale);
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
    for (const b of w.eBullets) {
      const s = b.r * 1.1;
      if (b.pink) { if (pk < 200) inst(pinkIM, pk++, b.x, 18, b.y, 0, 0, s, s, s); } else if (a < 200) inst(acidIM, a++, b.x, 18, b.y, 0, 0, s, s, s);
    }
    for (const b of w.bullets) {
      if (b.kind === "grenade" && gr < 60) { const k = 1 - b.life / b.maxLife; inst(grenadeIM, gr++, b.x, 14 + Math.sin(k * Math.PI) * 60, b.y, b.spin, b.spin * 0.7); }
      else if (b.kind === "bolt" && bo < 120) inst(boltIM, bo++, b.x, 22, b.y, -Math.atan2(b.vy, b.vx));
      else if (b.kind === "rocket" && rk < 40) inst(rocketIM, rk++, b.x, 22, b.y, -Math.atan2(b.vy, b.vx));
      else if (b.kind === "disc" && dk < 60) inst(discIM, dk++, b.x, 16, b.y, b.spin);
    }
    acidIM.count = a; pinkIM.count = pk; grenadeIM.count = gr; boltIM.count = bo; rocketIM.count = rk; discIM.count = dk;
    for (const im of [acidIM, pinkIM, grenadeIM, boltIM, rocketIM, discIM]) im.instanceMatrix.needsUpdate = true;
    // Medikits
    let hk = 0;
    for (const o of w.orbs) if (o.type === "heal" && hk < 20) { const y = 7 + Math.sin(t * 4 + o.x) * 2; inst(healIM, hk, o.x, y, o.y, t * 1.5); inst(healCrossIM, hk++, o.x, y, o.y, t * 1.5); }
    healIM.count = healCrossIM.count = hk; healIM.instanceMatrix.needsUpdate = true; healCrossIM.instanceMatrix.needsUpdate = true;
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
  function syncBigFx(w, t) {
    let bi = 0;
    for (const q of w.particles) {
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
  const EYE = { spitter: "234,255,0", abom: "234,255,0", armored: "80,170,230", burner: "255,176,58", screamer: "255,74,240", splitter: "255,106,213", electro: "127,231,255" };
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
    // Markierungsring unter dem Spieler
    flat(normB, p.x, 0.9, p.y, 0, 25, 25, CELL.ring, "140,255,74", 0.5);
    flat(floorB, p.x, 1, p.y, 0, 30, 30, CELL.glow, "140,255,74", 0.18);
    // Gegner-Projektile, XP-Kugeln, Augen, Status
    for (const b of w.eBullets) bill(addB, b.x, 18, b.y, b.r * 3.2, CELL.glow, b.rgb, 0.7);
    for (const o of w.orbs) if (o.type === "heal") { bill(addB, o.x, 9, o.y, 20 + Math.sin(t * 6) * 3, CELL.glow, "120,255,140", 0.55); flat(floorB, o.x, 0.9, o.y, 0, 16, 16, CELL.ring, "120,255,140", 0.6); }
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
      if (e.type === "burner") bill(addB, e.x, hh * 0.6 + (e.jumpZ || 0), e.y, e.r * 2.2, CELL.glow, "255,140,40", 0.45 + 0.15 * Math.sin(t * 17 + e.wob));
      if (e.type === "electro") bill(addB, e.x - fx * e.r * 0.5, hh * 0.75, e.y - fy * e.r * 0.5, e.r * (e.mode === "zap" ? 2.4 : 1.1), CELL.glow, "127,231,255", e.mode === "zap" ? 0.8 : 0.35);
      if (e.mode === "crouch") { const a = Math.atan2(e.dirY, e.dirX), L = 200; flat(normB, e.x + Math.cos(a) * L / 2, 1.2, e.y + Math.sin(a) * L / 2, a, L / 2, e.r * 0.8, CELL.band, "255,70,50", 0.3 + 0.25 * Math.sin(t * 30)); }
      if (e.mode === "zap") { const rr = 150 * (1 - Math.max(0, e.aiT) / 0.75 * 0.4); flat(floorB, e.x, 1.3, e.y, 0, rr, rr, CELL.ring, "127,231,255", 0.55 + 0.3 * Math.sin(t * 25)); }
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
      bill(addB, mz.x, 24, mz.y, 16 * sc, CELL.star, p.weapon.flash === "tesla" ? "160,240,255" : p.weapon.flash === "laser" ? "255,120,120" : "255,230,150", 1, Math.random() * TAU);
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
    for (const q of w.particles) {
      if (q.t === "flash") lightCands.push([q.x, 30, q.y, q.rgb, 3.2 * (q.life / q.max), q.r * 1.8, 9]);
      else if (q.t === "boom") lightCands.push([q.x, 50, q.y, "255,150,60", 5 * (q.life / q.max), q.r * 3.2, 11]);
      else if (q.t === "lvl") lightCands.push([w.player.x, 60, w.player.y, "255,225,130", 3 * (q.life / q.max), 260, 10]);
    }
    for (const z of w.zaps) lightCands.push([z.x2, 30, z.y2, "127,231,255", 2.2 * (z.life / z.max), 200, 8]);
    for (const e of w.enemies) {
      if (e.burnT > 0 || e.type === "burner") lightCands.push([e.x, 26, e.y, "255,140,40", 1.4, 150, 4]);
      if (e.mode === "zap") lightCands.push([e.x, 40, e.y, "127,231,255", 2.2, 200, 7]);
    }
    for (const b of w.bullets) if (b.kind === "rocket") lightCands.push([b.x, 26, b.y, "255,160,60", 2, 160, 6]);
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
    // Boss-Auftritt und Boss-Tod: Kamera fährt an den Boss heran
    let bossK = 0, bx = 0, bz = 0;
    for (const e of w.enemies) if (e.def.boss && e.spawnT > 0) { bossK = Math.sin(Math.min(1, 1 - e.spawnT / e.spawnMax) * Math.PI); bx = e.x - CAM.tx; bz = e.y - CAM.tz; }
    for (const [c, d] of dying) if (d.boss && c.t < 2) { bossK = Math.sin(Math.min(1, c.t / 2) * Math.PI) * 0.9; bx = c.x - CAM.tx; bz = c.y - CAM.tz; }
    CAM.boss += (bossK - CAM.boss) * Math.min(1, dt * 5);
    // Raumwechsel: Kamera setzt aus etwas größerer Höhe auf
    const intro = w.intro || 0;
    if (w.menuCam) placeMenuCamera(t, w);
    else placeCamera(CAM.dist * (1 - 0.3 * CAM.boss + 0.22 * intro * intro), sx + CAM.fx + bx * 0.6 * CAM.boss, sz + CAM.fz + bz * 0.6 * CAM.boss - 60 * intro * intro);
    syncEnemies(w, t, dt);
    syncPlayer(w, t);
    syncDoor(w);
    syncObstacles();
    syncSupply(w);
    syncInstanced(w, t);
    syncBigFx(w, t);
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
    resetCorpseBatch();
    if (playerModel) { scene.remove(playerModel.root); disposeTree(playerModel.root); playerModel = null; }
    sawMeshes.forEach((s) => { s.visible = false; });
    if (crate) crate.visible = false;
    droneMeshes.forEach((d) => { d.visible = false; });
  }

  return {
    init, resize, render, project, heightOf, setQuality, clear, preview, stopPreview, showcase,
    get ready() { return ready; },
    get debug() { return { scene, camera, renderer, flashlight, moon, hemi, CAM, fitCamera, stats: () => ({ pooled: [...pools.values()].reduce((a, l) => a + l.length, 0), active: models.size, dying: dying.size, geoCache: geoCache.size, texCache: texCache.size, shared: shared.size }) }; },
  };
})();
