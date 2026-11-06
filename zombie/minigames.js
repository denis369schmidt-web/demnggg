// v3.0 Mini-Spiele im Versorgungsbezirk: Schießbude, Hau den Lukas, Funkcode.
// Eigenständig: zeichnet in ein eigenes Canvas, liest Touch/Maus, Tastatur und Gamepad,
// meldet am Ende { score, tier (0–3), label } über opts.done. Texte laufen über opts.tr.
window.MiniGames = (() => {
  const TAU = Math.PI * 2;
  const W = 320, H = 340;
  const STENCIL = (px) => `400 ${px}px "Saira Stencil One", Teko, sans-serif`;
  const NUM = (px, w = 600) => `${w} ${px}px Teko, "Barlow Condensed", sans-serif`;
  const UI = (px, w = 700) => `${w} ${px}px "Barlow Condensed", sans-serif`;
  const TYPE = (px) => `400 ${px}px "Special Elite", "Courier New", monospace`;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let cur = null;

  // ------------------------------------------------------------ Zeichen-Hilfen
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function planks(g, x, y, w, h, base, seed) {
    let s = seed; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let yy = y; yy < y + h; yy += 14) {
      const v = Math.floor(R() * 16) - 8;
      g.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.8},${base[2] + v * 0.5})`; g.fillRect(x, yy, w, Math.min(14, y + h - yy));
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, yy, w, 1);
      g.strokeStyle = "rgba(40,22,8,0.25)"; g.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) { const ly = yy + 3 + R() * 9; g.beginPath(); g.moveTo(x, ly); for (let lx = x; lx <= x + w; lx += 16) g.lineTo(lx, ly + Math.sin(lx * 0.05 + k) * 0.8); g.stroke(); }
    }
  }
  function bulbs(g, x0, x1, y, t, phase = 0) {
    g.strokeStyle = "rgba(20,14,10,0.9)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y - 3);
    for (let x = x0; x <= x1; x += 20) g.quadraticCurveTo(x + 10, y + 4, x + 20, y - 3);
    g.stroke();
    let i = 0;
    for (let x = x0 + 10; x < x1; x += 20, i++) {
      const on = ((Math.floor(t * 4) + i + phase) % 3) !== 0;
      if (on) { const gl = g.createRadialGradient(x, y + 3, 0, x, y + 3, 11); gl.addColorStop(0, "rgba(255,226,140,0.75)"); gl.addColorStop(1, "rgba(255,200,90,0)"); g.fillStyle = gl; g.fillRect(x - 11, y - 8, 22, 22); }
      g.fillStyle = on ? "#fff3c4" : "#6a5a3a"; g.beginPath(); g.arc(x, y + 3, 3, 0, TAU); g.fill();
    }
  }
  function awning(g, y, h, cols = ["#c8201a", "#f0e6d0"]) {
    const n = 8, sw = W / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[i % 2]; g.fillRect(i * sw, y, sw, h);
      g.beginPath(); g.moveTo(i * sw, y + h); g.quadraticCurveTo(i * sw + sw / 2, y + h + 12, i * sw + sw, y + h); g.fill();
    }
    const sh = g.createLinearGradient(0, y, 0, y + h + 12); sh.addColorStop(0, "rgba(255,255,255,0.12)"); sh.addColorStop(1, "rgba(0,0,0,0.25)"); g.fillStyle = sh; g.fillRect(0, y, W, h + 12);
  }
  function stamp(g, text, x, y, col, rot = -0.18, size = 34) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.font = STENCIL(size); const w = g.measureText(text).width + 22;
    g.strokeStyle = col; g.lineWidth = 3; rr(g, -w / 2, -size * 0.62, w, size * 1.12, 4); g.stroke();
    g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 0, 2);
    // Stempel-Abrieb
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.2, 0.6)})`; g.fillRect(rand(-w / 2, w / 2), rand(-size * 0.6, size * 0.5), rand(1, 3), rand(1, 2)); }
    g.restore();
  }
  function label(g, text, x, y, font, col, align = "center") { g.font = font; g.textAlign = align; g.textBaseline = "middle"; g.fillStyle = col; g.fillText(text, x, y); }
  function floatText(st, x, y, text, col) { st.floats.push({ x, y, text, col, t: 0 }); }
  function drawFloats(g, st, dt) {
    for (const f of st.floats) { f.t += dt; g.globalAlpha = clamp(1.2 - f.t, 0, 1); label(g, f.text, f.x, f.y - f.t * 30, NUM(22, 700), f.col); }
    g.globalAlpha = 1; st.floats = st.floats.filter((f) => f.t < 1.2);
  }

  // ------------------------------------------------------------ Schießbude
  // Pappfiguren laufen auf drei Schienen: Zombies treffen (Kombo bis x4), goldene geben extra, Zivilisten kosten Punkte
  const schiess = {
    tiers: [70, 150, 260],
    init(st) {
      Object.assign(st, { rows: [{ y: 128, dir: 1, sp: 62 }, { y: 196, dir: -1, sp: 86 }, { y: 264, dir: 1, sp: 112 }], targets: [], spawnT: 0.2, ammo: 18, time: 22, combo: 0, holes: [], aim: { x: W / 2, y: 190 }, kick: 0 });
    },
    spawn(st) {
      const ri = Math.floor(Math.random() * 3), row = st.rows[ri], r = Math.random();
      const type = r < 0.09 ? "gold" : r < 0.34 ? "civ" : "zombie";
      st.targets.push({ row: ri, type, x: row.dir > 0 ? -22 : W + 22, w: 34, h: 46, hit: false, hitT: 0, wob: rand(0, 6), look: Math.floor(rand(0, 3)) });
    },
    update(st, dt) {
      st.time -= dt; st.kick = Math.max(0, st.kick - dt * 6);
      if ((st.spawnT -= dt) <= 0) { st.spawnT = rand(0.45, 0.7); this.spawn(st); }
      const pace = 1 + st.t / 28;
      for (const t of st.targets) {
        const row = st.rows[t.row];
        if (t.hit) t.hitT += dt; else t.x += row.dir * row.sp * pace * dt;
        t.wob += dt * 8;
      }
      st.targets = st.targets.filter((t) => t.x > -40 && t.x < W + 40 && t.hitT < 0.5);
      if (st.time <= 0 || (st.ammo <= 0 && !st.targets.some((t) => t.hit && t.hitT < 0.5))) finish(st, Math.max(0, st.score));
    },
    tap(st, p) {
      if (st.ammo <= 0) return;
      st.ammo--; st.kick = 1; st.aim = { x: p.x, y: p.y };
      st.opts.sound("shot");
      let hit = null;
      for (const t of st.targets) {
        if (t.hit) continue;
        const ry = st.rows[t.row].y;
        if (p.x > t.x - t.w / 2 - 3 && p.x < t.x + t.w / 2 + 3 && p.y > ry - t.h - 4 && p.y < ry + 2) { hit = t; break; }
      }
      if (!hit) { st.combo = 0; st.holes.push({ x: p.x, y: p.y }); if (st.holes.length > 30) st.holes.shift(); return; }
      hit.hit = true;
      if (hit.type === "civ") { st.combo = 0; st.score -= 20; floatText(st, hit.x, st.rows[hit.row].y - 54, "-20", "#ff5a4a"); st.opts.sound("buzz"); return; }
      st.combo++;
      const pts = hit.type === "gold" ? 40 : 10 * Math.min(4, st.combo);
      st.score += pts;
      floatText(st, hit.x, st.rows[hit.row].y - 54, `+${pts}`, hit.type === "gold" ? "#ffd84a" : "#c8ff7a");
      st.opts.sound(hit.type === "gold" ? "bell" : "pop");
    },
    pad(st, ax, ay, dt, press) {
      st.aim.x = clamp(st.aim.x + ax * 260 * dt, 10, W - 10); st.aim.y = clamp(st.aim.y + ay * 260 * dt, 60, 290);
      if (press) this.tap(st, st.aim);
    },
    move(st, p) { st.aim = p; },
    drawTarget(g, t, y) {
      const flip = t.hit ? Math.max(0.05, Math.cos(Math.min(1, t.hitT * 3.2) * Math.PI / 2)) : 1;
      g.save(); g.translate(t.x, y); g.scale(1, flip); g.translate(0, -t.h);
      g.fillStyle = "#3a3632"; g.fillRect(-2, t.h - 6, 4, 8); // Halter
      const body = t.type === "civ" ? "#7a5a8a" : t.type === "gold" ? "#e8b830" : "#4f6b3a", skin = t.type === "civ" ? "#e8c8a8" : t.type === "gold" ? "#ffe27a" : "#8fb06a";
      // Pappe mit Rand (leicht ausgefranst)
      g.fillStyle = "#d8c8a0"; rr(g, -t.w / 2 - 2, 4, t.w + 4, t.h - 6, 6); g.fill();
      g.fillStyle = body; rr(g, -t.w / 2 + 2, 22, t.w - 4, t.h - 26, 4); g.fill();
      g.fillStyle = skin; g.beginPath(); g.arc(0, 15, 10, 0, TAU); g.fill();
      if (t.type === "civ") {
        g.fillStyle = "#c83a6a"; g.beginPath(); g.arc(0, 12, 11, Math.PI, 0); g.fill(); // Kopftuch
        g.fillStyle = "#2a2a2a"; g.fillRect(-4, 14, 2, 2); g.fillRect(2, 14, 2, 2);
        g.strokeStyle = "#7a3a2a"; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 18, 3, 0.2, Math.PI - 0.2); g.stroke();
        g.fillStyle = "#f0ece0"; g.font = UI(7, 800); g.textAlign = "center"; g.fillText("OMA", 0, 36);
      } else {
        g.fillStyle = "#c81e1e"; g.fillRect(-5, 13, 3, 3); g.fillRect(2, 13, 3, 3); // rote Augen
        g.fillStyle = "#2a1a10"; g.fillRect(-4, 19, 8, 2);
        g.strokeStyle = skin; g.lineWidth = 4; g.lineCap = "round";
        g.beginPath(); g.moveTo(-t.w / 2 + 4, 26); g.lineTo(-t.w / 2 - 4 + Math.sin(t.wob) * 1.5, 22); g.moveTo(t.w / 2 - 4, 26); g.lineTo(t.w / 2 + 4 - Math.sin(t.wob) * 1.5, 22); g.stroke();
        g.fillStyle = "rgba(120,10,12,0.7)"; g.beginPath(); g.arc(-4, 30, 3, 0, TAU); g.fill();
        if (t.type === "gold") { g.fillStyle = "#fff6c0"; g.font = UI(8, 800); g.textAlign = "center"; g.fillText("x40", 0, 38); }
      }
      // Zielkreise auf dem Kopf
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1; g.beginPath(); g.arc(0, 15, 5, 0, TAU); g.stroke();
      g.restore();
    },
    draw(st, g) {
      // Rückwand: dunkler Samt mit Sternen
      const bg = g.createLinearGradient(0, 60, 0, 300); bg.addColorStop(0, "#3a0e12"); bg.addColorStop(1, "#1e0608"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 16) { g.fillStyle = "rgba(255,255,255,0.025)"; g.fillRect(x, 60, 8, 240); }
      g.fillStyle = "rgba(255,216,120,0.35)"; for (let i = 0; i < 14; i++) { const sx = (i * 73) % W, sy = 80 + ((i * 41) % 200); g.font = UI(10); g.fillText("★", sx, sy); }
      for (const h of st.holes) { g.fillStyle = "#0a0204"; g.beginPath(); g.arc(h.x, h.y, 2.4, 0, TAU); g.fill(); g.strokeStyle = "rgba(255,220,180,0.25)"; g.lineWidth = 0.8; g.beginPath(); g.arc(h.x, h.y, 3.6, 0, TAU); g.stroke(); }
      // Schienen und Figuren
      for (const [i, row] of st.rows.entries()) {
        g.fillStyle = "#2a2622"; g.fillRect(0, row.y, W, 8); g.fillStyle = "#8a8478"; g.fillRect(0, row.y, W, 2); g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, row.y + 8, W, 3);
        for (const t of st.targets) if (t.row === i) this.drawTarget(g, t, row.y);
      }
      // Markise, Lichter, Schild
      awning(g, 0, 34);
      bulbs(g, 0, W, 52, st.t);
      g.fillStyle = "#5a3a1e"; rr(g, 70, 6, 180, 26, 3); g.fill(); g.strokeStyle = "#e8c070"; g.lineWidth = 1.5; rr(g, 73, 9, 174, 20, 2); g.stroke();
      label(g, st.opts.tr("SCHIESSBUDE"), W / 2, 20, STENCIL(17), "#ffe2a3");
      // Theke
      planks(g, 0, 296, W, 44, [122, 78, 40], 7);
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(0, 296, W, 3);
      for (let i = 0; i < 18; i++) { const on = i < st.ammo; g.fillStyle = on ? "#d8a838" : "rgba(0,0,0,0.35)"; rr(g, 12 + i * 9, 310, 5, 15, 2); g.fill(); if (on) { g.fillStyle = "#8a5a1a"; g.fillRect(12 + i * 9, 320, 5, 5); } }
      label(g, `${Math.max(0, Math.ceil(st.time))}`, W - 92, 318, NUM(30, 700), st.time < 5 ? "#ff6a4a" : "#f6ecd6");
      label(g, "s", W - 76, 322, UI(12), "#d8c8a0", "left");
      label(g, `${st.score}`, W - 34, 318, NUM(30, 700), "#c8ff7a");
      if (st.combo > 1) label(g, `x${Math.min(4, st.combo)}`, W - 34, 300 - 12, NUM(16, 700), "#ffd84a");
      drawFloats(g, st, st.dt);
      // Fadenkreuz
      const a = st.aim, k = 1 + st.kick * 0.5;
      g.strokeStyle = "rgba(255,240,200,0.9)"; g.lineWidth = 1.5; g.beginPath(); g.arc(a.x, a.y, 9 * k, 0, TAU); g.stroke();
      g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(a.x + dx * 5 * k, a.y + dy * 5 * k); g.lineTo(a.x + dx * 14 * k, a.y + dy * 14 * k); } g.stroke();
    },
  };

  // ------------------------------------------------------------ Hau den Lukas
  // Pendelnde Nadel im richtigen Moment stoppen: je näher an der Markierung, desto höher fliegt der Schlitten
  const RANKS = [[96, "LUKAS!"], [88, "Zombieschreck"], [74, "Kraftpaket"], [55, "Ganz ordentlich"], [30, "Schluck Wasser"], [0, "Lauch"]];
  const lukas = {
    tiers: [150, 215, 265],
    init(st) { Object.assign(st, { tries: 3, results: [], phase: "aim", needle: 0.1, dir: 1, speed: 0.9, zone: rand(0.35, 0.65), fly: 0, puck: 0, power: 0, bell: 0, swing: 0, rank: "" }); },
    update(st, dt) {
      st.bell = Math.max(0, st.bell - dt * 1.6); st.swing = Math.max(0, st.swing - dt * 3);
      if (st.phase === "aim") {
        st.needle += st.dir * st.speed * dt;
        if (st.needle > 1) { st.needle = 2 - st.needle; st.dir = -1; } else if (st.needle < 0) { st.needle = -st.needle; st.dir = 1; }
      } else if (st.phase === "fly") {
        st.fly += dt;
        const up = 0.45, k = st.fly < up ? 1 - (1 - st.fly / up) ** 2.4 : Math.max(0, 1 - ((st.fly - up) / 0.7) ** 2);
        st.puck = (st.power / 100) * k;
        if (st.fly >= up && !st.rang) { st.rang = true; if (st.power >= 96) { st.bell = 1; st.opts.sound("bell"); } }
        if (st.fly > 1.35) {
          st.results.push(st.power);
          if (st.results.length >= st.tries) finish(st, st.results.reduce((a, b) => a + b, 0));
          else { st.phase = "aim"; st.speed += 0.35; st.zone = rand(0.25, 0.75); st.needle = Math.random() < 0.5 ? 0 : 1; st.dir = st.needle ? -1 : 1; }
        }
      }
    },
    tap(st) {
      if (st.phase !== "aim") return;
      const off = Math.abs(st.needle - st.zone);
      st.power = Math.round(clamp(100 * Math.pow(clamp(1 - off / 0.42, 0, 1), 1.5), 0, 100));
      if (off < 0.025) st.power = 100;
      st.phase = "fly"; st.fly = 0; st.rang = false; st.swing = 1;
      st.rank = st.opts.tr(RANKS.find(([v]) => st.power >= v)[1]);
      st.opts.sound("thud"); st.opts.sound("rise", st.power);
    },
    key(st, k) { if (k === " " || k === "Enter") { this.tap(st); return true; } return false; },
    pad(st, ax, ay, dt, press) { if (press) this.tap(st); },
    draw(st, g) {
      // Nachthimmel über dem Rummel, Lichterketten
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#0c1424"); sky.addColorStop(1, "#24182a"); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 10) / 20})`; g.fillRect((i * 97) % W, (i * 53) % 120, 1.2, 1.2); }
      bulbs(g, -10, W + 10, 24, st.t, 1);
      // Säule mit Skala
      const px = 108, top = 58, bot = 268, len = bot - top;
      g.fillStyle = "#3a2a1a"; g.fillRect(px - 15, top, 30, len);
      const sc = g.createLinearGradient(0, bot, 0, top); sc.addColorStop(0, "#2f7a3a"); sc.addColorStop(0.5, "#e8c21a"); sc.addColorStop(0.85, "#e85a1a"); sc.addColorStop(1, "#c81e1e");
      g.fillStyle = sc; g.fillRect(px - 11, top, 22, len);
      g.fillStyle = "rgba(0,0,0,0.25)"; for (let v = 0; v <= 100; v += 10) g.fillRect(px - 11, bot - (v / 100) * len, v % 50 ? 8 : 22, 1.5);
      g.fillStyle = "#1a1410"; g.fillRect(px - 2, top, 4, len); // Schiene
      for (const [v, name] of RANKS.slice(0, 5)) { const yy = bot - (v / 100) * len; g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(px + 15, yy, 6, 1); label(g, st.opts.tr(name), px + 24, yy, UI(12, 700), v >= 96 ? "#ffd84a" : "#e8dcc0", "left"); }
      // Glocke
      const bx = px, by = top - 14, sh = Math.sin(st.t * 40) * st.bell * 3;
      if (st.bell > 0) { const gl = g.createRadialGradient(bx, by, 0, bx, by, 60); gl.addColorStop(0, `rgba(255,220,120,${0.6 * st.bell})`); gl.addColorStop(1, "rgba(255,220,120,0)"); g.fillStyle = gl; g.fillRect(bx - 60, by - 60, 120, 120); }
      g.save(); g.translate(bx + sh, by); g.fillStyle = "#c89a2a"; g.beginPath(); g.moveTo(-16, 10); g.quadraticCurveTo(-16, -14, 0, -15); g.quadraticCurveTo(16, -14, 16, 10); g.closePath(); g.fill();
      g.fillStyle = "#f2d27a"; g.fillRect(-12, -10, 4, 16); g.fillStyle = "#7a5a1a"; g.fillRect(-18, 9, 36, 4); g.restore();
      // Schlitten
      const py = bot - st.puck * len;
      g.fillStyle = "#e8e0d0"; rr(g, px - 13, py - 7, 26, 12, 4); g.fill(); g.fillStyle = "#c81e1e"; g.fillRect(px - 13, py - 2, 26, 3);
      // Sockel mit Schlagplatte und Schild
      planks(g, px - 54, bot, 108, 30, [110, 70, 36], 3);
      g.fillStyle = "#4a4a4a"; rr(g, px - 22, bot - 4, 44, 8, 3); g.fill(); g.fillStyle = "#8a8a88"; g.fillRect(px - 20, bot - 4, 40, 2);
      label(g, st.opts.tr("HAU DEN LUKAS"), px, bot + 18, STENCIL(13), "#ffe2a3");
      // Hammer schwingt
      const sw = 1 - st.swing, down = st.swing > 0 ? (sw < 0.3 ? sw / 0.3 : 1 - (sw - 0.3) / 0.7) : 0;
      g.save(); g.translate(px - 62, bot - 6); g.rotate(-(0.5 - 1.75 * down) + (st.swing > 0 ? 0 : Math.sin(st.t * 3) * 0.05));
      g.fillStyle = "#8a5a2a"; g.fillRect(-3, -70, 6, 70); g.fillStyle = "#3a3a3e"; rr(g, -15, -84, 30, 18, 3); g.fill(); g.fillStyle = "rgba(255,255,255,0.2)"; g.fillRect(-13, -82, 26, 3);
      g.restore();
      // Ergebnis-Zettel
      for (let i = 0; i < 3; i++) {
        const x = 226, y = 96 + i * 46, v = st.results[i];
        g.save(); g.translate(x + 34, y + 16); g.rotate((i - 1) * 0.04);
        g.fillStyle = "#efe6cf"; g.fillRect(-34, -16, 68, 32); g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(-34, 12, 68, 4);
        label(g, `${i + 1}.`, -26, 0, TYPE(12), "#6a5a40", "left");
        label(g, v == null ? "—" : `${v}`, 14, 1, NUM(26, 700), v == null ? "#9a8a70" : v >= 96 ? "#c81e1e" : "#2a2420");
        g.restore();
      }
      if (st.phase === "fly" && st.fly > 0.4) label(g, st.rank, 260, 248, STENCIL(st.power >= 96 ? 22 : 16), st.power >= 96 ? "#ffd84a" : "#f0e6d0");
      // Kraftmesser
      const mx = 24, mw = W - 48, my = 312;
      g.fillStyle = "#1a1612"; rr(g, mx - 4, my - 12, mw + 8, 24, 5); g.fill();
      const zg = g.createLinearGradient(mx, 0, mx + mw, 0);
      const z0 = st.zone - 0.42, z1 = st.zone + 0.42;
      zg.addColorStop(0, "#5a1a14"); zg.addColorStop(clamp(z0, 0, 1), "#5a1a14"); zg.addColorStop(clamp(st.zone, 0, 1), "#8cff4a"); zg.addColorStop(clamp(z1, 0, 1), "#5a1a14"); zg.addColorStop(1, "#5a1a14");
      g.fillStyle = zg; g.fillRect(mx, my - 8, mw, 16);
      g.fillStyle = "#fff6c0"; g.fillRect(mx + st.zone * mw - 1.5, my - 10, 3, 20);
      const nx = mx + st.needle * mw;
      g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(nx, my + 2); g.lineTo(nx - 7, my + 14); g.lineTo(nx + 7, my + 14); g.closePath(); g.fill();
      g.fillRect(nx - 1, my - 12, 2, 16);
      if (st.phase === "aim") label(g, st.opts.tr("Tippen, wenn die Nadel auf der Markierung steht"), W / 2, 42, UI(12, 700), "#d8c8a0");
    },
  };

  // ------------------------------------------------------------ Funkcode
  // Feldfunkgerät: Tonfolge merken und nachtippen – jede Runde ein Ton mehr
  const PADS = [{ name: "ALFA", col: "#ffb030" }, { name: "BRAVO", col: "#6aff6a" }, { name: "CHARLY", col: "#ff4a3a" }, { name: "DELTA", col: "#4ab0ff" }];
  const padRect = (i) => ({ x: 34 + (i % 2) * 132, y: 168 + Math.floor(i / 2) * 76, w: 120, h: 64 });
  const funk = {
    tiers: [2, 3, 5],
    maxRounds: 5,
    init(st) { Object.assign(st, { seq: [0, 1, 2].map(() => Math.floor(Math.random() * 4)), round: 1, phase: "wait", phaseT: 0.8, showI: 0, inI: 0, lit: -1, litT: 0, wave: 0, msg: "Hör zu …" }); },
    light(st, i, d) { st.lit = i; st.litT = d; st.wave = 1; st.opts.sound("tone", i); },
    update(st, dt) {
      st.litT -= dt; if (st.litT <= 0) st.lit = -1;
      st.wave = Math.max(0, st.wave - dt * 2);
      const step = Math.max(0.32, 0.55 - st.round * 0.04);
      if (st.phase === "wait" && (st.phaseT -= dt) <= 0) { st.phase = "show"; st.showI = 0; st.phaseT = 0.1; st.msg = "Hör zu …"; }
      else if (st.phase === "show" && (st.phaseT -= dt) <= 0) {
        if (st.showI < st.seq.length) { this.light(st, st.seq[st.showI++], step * 0.75); st.phaseT = step; }
        else { st.phase = "input"; st.inI = 0; st.msg = "Gib den Code ein"; }
      } else if (st.phase === "ok" && (st.phaseT -= dt) <= 0) {
        if (st.round >= this.maxRounds) { finish(st, this.maxRounds); return; }
        st.round++; st.seq.push(Math.floor(Math.random() * 4)); st.phase = "wait"; st.phaseT = 0.4;
      } else if (st.phase === "fail" && (st.phaseT -= dt) <= 0) finish(st, st.round - 1);
    },
    press(st, i) {
      if (st.phase !== "input") return;
      if (st.seq[st.inI] !== i) { st.phase = "fail"; st.phaseT = 0.9; st.lit = st.seq[st.inI]; st.litT = 0.9; st.msg = "Funkstille!"; st.opts.sound("buzz"); return; }
      this.light(st, i, 0.22); st.inI++;
      if (st.inI >= st.seq.length) { st.phase = "ok"; st.phaseT = 0.75; st.msg = "Empfangen!"; st.opts.sound("ok"); }
    },
    tap(st, p) { for (let i = 0; i < 4; i++) { const r = padRect(i); if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) { this.press(st, i); return; } } },
    key(st, k) { const i = { 1: 0, 2: 1, 3: 2, 4: 3, q: 0, w: 1, a: 2, s: 3, ArrowUp: 0, ArrowRight: 1, ArrowLeft: 2, ArrowDown: 3 }[k]; if (i == null) return false; this.press(st, i); return true; },
    padButtons(st, b) { for (const [btn, i] of [[2, 0], [3, 1], [0, 2], [1, 3]]) if (b[btn]) this.press(st, i); },
    draw(st, g) {
      g.fillStyle = "#14160f"; g.fillRect(0, 0, W, H);
      // Gehäuse: oliv lackiert, Nieten, Tragegriff, Antenne
      g.strokeStyle = "#2a2a22"; g.lineWidth = 3; g.beginPath(); g.moveTo(270, 40); g.lineTo(296, 4); g.stroke();
      g.fillStyle = "#c81e1e"; g.beginPath(); g.arc(296, 4, 3, 0, TAU); g.fill();
      g.fillStyle = "#2a2e20"; rr(g, 110, 22, 100, 18, 8); g.fill(); g.fillStyle = "#14160f"; rr(g, 122, 28, 76, 10, 5); g.fill();
      const body = g.createLinearGradient(0, 40, 0, H); body.addColorStop(0, "#5a6440"); body.addColorStop(1, "#3a4228"); g.fillStyle = body; rr(g, 12, 40, W - 24, H - 50, 10); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 2; rr(g, 12, 40, W - 24, H - 50, 10); g.stroke();
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,230"},0.05)`; g.fillRect(14 + ((i * 53) % (W - 28)), 42 + ((i * 97) % (H - 54)), 2, 1); }
      for (const [x, y] of [[22, 50], [W - 22, 50], [22, H - 20], [W - 22, H - 20]]) { g.fillStyle = "#2a2e20"; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); g.fillStyle = "#8a9070"; g.beginPath(); g.arc(x - 0.6, y - 0.6, 2, 0, TAU); g.fill(); }
      label(g, "FuG 7b · BUNDESWEHR", 30, 58, TYPE(10), "rgba(230,230,200,0.7)", "left");
      // Leuchtschirm mit Wellenform
      const sx = 30, sy = 68, sw = W - 60, sh = 84;
      g.fillStyle = "#061006"; rr(g, sx, sy, sw, sh, 6); g.fill();
      g.strokeStyle = "rgba(90,255,120,0.12)"; g.lineWidth = 1; for (let x = sx + 10; x < sx + sw; x += 20) { g.beginPath(); g.moveTo(x, sy + 4); g.lineTo(x, sy + sh - 4); g.stroke(); } for (let y = sy + 12; y < sy + sh; y += 18) { g.beginPath(); g.moveTo(sx + 4, y); g.lineTo(sx + sw - 4, y); g.stroke(); }
      g.strokeStyle = "#7aff8a"; g.lineWidth = 1.6; g.shadowColor = "#5aff6a"; g.shadowBlur = 8; g.beginPath();
      const f = st.lit >= 0 ? 0.06 + st.lit * 0.035 : 0.03, amp = 6 + st.wave * 22;
      for (let x = 0; x <= sw - 16; x += 2) { const y = sy + sh * 0.42 + Math.sin(x * f + st.t * 12) * amp * (st.lit >= 0 ? 1 : 0.25) + Math.sin(x * 0.4 + st.t * 30) * 1.2; if (x) g.lineTo(sx + 8 + x, y); else g.moveTo(sx + 8 + x, y); }
      g.stroke(); g.shadowBlur = 0;
      label(g, `${st.opts.tr("CODE")} ${Math.min(st.round, this.maxRounds)}/${this.maxRounds}`, sx + 10, sy + sh - 12, TYPE(12), "#7aff8a", "left");
      label(g, st.opts.tr(st.msg), sx + sw - 10, sy + sh - 12, TYPE(12), st.phase === "fail" ? "#ff6a5a" : "#7aff8a", "right");
      for (let i = 0; i < st.seq.length; i++) { const on = st.phase === "input" ? i < st.inI : st.phase === "show" ? i < st.showI : st.phase === "ok"; g.fillStyle = on ? "#7aff8a" : "rgba(122,255,138,0.2)"; g.fillRect(sx + 10 + i * 12, sy + 8, 8, 4); }
      // Tasten
      for (let i = 0; i < 4; i++) {
        const r = padRect(i), p = PADS[i], on = st.lit === i;
        g.fillStyle = "rgba(0,0,0,0.45)"; rr(g, r.x + 2, r.y + 4, r.w, r.h, 9); g.fill();
        const kg = g.createLinearGradient(0, r.y, 0, r.y + r.h); kg.addColorStop(0, on ? p.col : "#3a3e30"); kg.addColorStop(1, on ? p.col : "#24281c");
        g.fillStyle = kg; rr(g, r.x, r.y + (on ? 2 : 0), r.w, r.h, 9); g.fill();
        if (on) { g.save(); g.shadowColor = p.col; g.shadowBlur = 24; g.fillStyle = p.col; rr(g, r.x + 6, r.y + 8, r.w - 12, r.h - 12, 7); g.fill(); g.restore(); }
        g.fillStyle = on ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.07)"; rr(g, r.x + 4, r.y + 3, r.w - 8, 8, 4); g.fill();
        g.fillStyle = p.col; g.beginPath(); g.arc(r.x + 16, r.y + 18, 4, 0, TAU); g.fill();
        label(g, p.name, r.x + r.w / 2 + 6, r.y + r.h / 2 + 2, STENCIL(19), on ? "#14160f" : "#d8dcc0");
        label(g, `${i + 1}`, r.x + r.w - 12, r.y + r.h - 12, TYPE(10), on ? "#14160f" : "rgba(216,220,192,0.5)");
      }
    },
  };

  const GAMES = { schiess, lukas, funk };

  // ------------------------------------------------------------ Ablauf
  function finish(st, score) {
    if (st.over) return;
    const game = GAMES[st.kind];
    st.over = true; st.endT = 0; st.score = score;
    st.tier = game.tiers.filter((v) => score >= v).length;
    st.opts.sound(st.tier ? "win" : "lose");
  }
  function drawEnd(st, g) {
    const k = clamp(st.endT * 3, 0, 1);
    g.fillStyle = `rgba(8,8,6,${0.55 * k})`; g.fillRect(0, 0, W, H);
    const names = ["NIETE", "BRONZE", "SILBER", "GOLD"], cols = ["#c8402a", "#d88a4a", "#d8dce0", "#ffd84a"];
    g.save(); g.globalAlpha = k; g.translate(W / 2, H / 2 - 10); g.scale(2 - k, 2 - k);
    stamp(g, st.opts.tr(names[st.tier]), 0, 0, cols[st.tier], -0.16, 40);
    g.restore();
  }
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads || []) if (p && p.connected) return p;
    return null;
  }
  function run(kind, canvas, opts) {
    stop();
    const game = GAMES[kind];
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext("2d");
    const st = { kind, t: 0, dt: 0, over: false, endT: 0, score: 0, tier: 0, floats: [], opts, started: false, prevB: [] };
    game.init(st);
    const toLocal = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
    const onDown = (e) => { if (!st.started || st.over) return; e.preventDefault(); game.tap(st, toLocal(e)); };
    const onMove = (e) => { if (st.started && game.move) game.move(st, toLocal(e)); };
    const onKey = (e) => { if (!st.started || st.over || !game.key) return; if (game.key(st, e.key)) { e.preventDefault(); e.stopPropagation(); } };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey, true);
    let last = performance.now(), raf = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; st.dt = dt;
      if (st.started && !st.over) {
        const pad = readPad();
        if (pad) {
          const b = pad.buttons.map((q) => q.pressed), edge = b.map((v, i) => v && !st.prevB[i]);
          st.prevB = b;
          const ax = Math.abs(pad.axes[0]) > 0.2 ? pad.axes[0] : 0, ay = Math.abs(pad.axes[1]) > 0.2 ? pad.axes[1] : 0;
          if (game.padButtons) game.padButtons(st, edge);
          else if (game.pad) game.pad(st, ax, ay, dt, edge[0] || edge[7]);
        }
        st.t += dt; game.update(st, dt);
      } else if (st.over) st.endT += dt;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      game.draw(st, g);
      if (st.over) drawEnd(st, g);
      if (st.over && !st.reported && st.endT > 1) { st.reported = true; if (opts.done) opts.done({ score: st.score, tier: st.tier }); }
    };
    raf = requestAnimationFrame(frame);
    cur = { st, game, stop: () => { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); window.removeEventListener("keydown", onKey, true); } };
    return st;
  }
  function start() { if (cur) { cur.st.started = true; cur.st.prevB = []; } }
  function stop() { if (cur) { cur.stop(); cur = null; } }
  return {
    run, start, stop, W, H,
    info: { schiess: { icon: "miniShoot", title: "Schießbude", sub: "Triff die Zombies, verschone die Omas. 18 Schuss, 22 Sekunden." }, lukas: { icon: "miniLukas", title: "Hau den Lukas", sub: "Drei Schläge – stopp die Nadel auf der Markierung." }, funk: { icon: "miniRadio", title: "Funkcode", sub: "Merk dir die Tonfolge und gib sie nach. Fünf Codes bis zum Funkkontakt." } },
    // Test-Zugang: laufender Zustand, direkte Eingaben
    get debug() { return cur && cur.st; },
    tap: (x, y) => cur && cur.game.tap(cur.st, { x, y }),
    key: (k) => cur && cur.game.key && cur.game.key(cur.st, k),
  };
})();
