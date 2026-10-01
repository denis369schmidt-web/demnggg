/* Outbreak Hero – Zombie-Roguelite im Stil von Room-Clearing-Shootern.
 * Reines Canvas + Vanilla JS, keine Abhängigkeiten. Läuft als PWA auf Android.
 */
"use strict";
(() => {
  // ============================================================
  // Konstanten & Hilfsfunktionen
  // ============================================================
  const W = 540;
  const H = 960;
  const ARENA = { x: 24, y: 120, w: W - 48, h: 800 };
  const L = ARENA.x, R = ARENA.x + ARENA.w, T = ARENA.y, B = ARENA.y + ARENA.h;
  const DOOR_W = 84;
  const ROOMS_PER_CHAPTER = 20;
  const SUPPLY_ROOMS = [5, 15];
  const BOSS_ROOMS = { 10: "abom", 20: "mother" };

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const DEG = Math.PI / 180;

  // ============================================================
  // Speicherstand (Meta-Progression)
  // ============================================================
  const SAVE_KEY = "outbreak-hero-v1";
  const defaultSave = () => ({
    coins: 0,
    equipped: "pistol",
    weapons: { pistol: 1 },
    talents: { hp: 0, atk: 0, speed: 0, greed: 0 },
    best: { chapter: 0, room: 0 },
    sound: true,
    vibration: true,
    noAds: false,
    starterOwned: false,
    txns: [],
    runs: 0,
    daily: { last: "", streak: 0 },
    freeCoins: { day: "", n: 0 },
    tutorialDone: false,
    reviewAsked: false,
  });
  function loadSave() {
    const d = defaultSave();
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === "object") {
        return {
          ...d,
          ...s,
          weapons: { ...d.weapons, ...s.weapons },
          talents: { ...d.talents, ...s.talents },
          best: { ...d.best, ...s.best },
          daily: { ...d.daily, ...s.daily },
          freeCoins: { ...d.freeCoins, ...s.freeCoins },
          txns: Array.isArray(s.txns) ? s.txns : [],
        };
      }
    } catch { /* kein Speicher verfügbar */ }
    return d;
  }
  const save = loadSave();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignorieren */ }
  }

  // ============================================================
  // Waffen
  // ============================================================
  const WEAPONS = {
    pistol: { name: "Pistole", icon: "🔫", desc: "Ausgewogen und präzise.", price: 0, dmg: 22, rate: 2.5, speed: 760, pellets: 1, spread: 0, jitter: 0.02, range: 900, pierce: 0, r: 5, color: "#ffe08a" },
    shotgun: { name: "Schrotflinte", icon: "💥", desc: "5 Schrotkugeln, brutal auf kurze Distanz.", price: 250, dmg: 11, rate: 1.25, speed: 700, pellets: 5, spread: 0.5, jitter: 0.05, range: 380, pierce: 0, r: 4, color: "#ffb36b" },
    smg: { name: "Maschinenpistole", icon: "⚡", desc: "Extrem hohe Feuerrate.", price: 350, dmg: 9, rate: 6.5, speed: 820, pellets: 1, spread: 0, jitter: 0.1, range: 800, pierce: 0, r: 4, color: "#9ee6ff" },
    crossbow: { name: "Armbrust", icon: "🏹", desc: "Bolzen durchschlagen 2 Zombies.", price: 500, dmg: 36, rate: 1.4, speed: 940, pellets: 1, spread: 0, jitter: 0, range: 1000, pierce: 2, r: 5, color: "#c9ff9e" },
    flame: { name: "Flammenwerfer", icon: "🔥", desc: "Kurze Reichweite, setzt alles in Brand.", price: 800, dmg: 4.5, rate: 14, speed: 430, pellets: 1, spread: 0, jitter: 0.28, range: 240, pierce: 99, r: 9, color: "#ff7b2e", kind: "flame", burn: true },
    sniper: { name: "Scharfschützengewehr", icon: "🎯", desc: "Riesiger Schaden, durchschlägt 4 Ziele, +20% Krit.", price: 1100, dmg: 85, rate: 0.75, speed: 1500, pellets: 1, spread: 0, jitter: 0, range: 1400, pierce: 4, r: 4, color: "#ffffff", crit: 0.2 },
    grenade: { name: "Granatwerfer", icon: "💣", desc: "Explodiert und trifft ganze Horden.", price: 1400, dmg: 42, rate: 1.0, speed: 520, pellets: 1, spread: 0, jitter: 0, range: 520, pierce: 0, r: 7, color: "#b7ff4a", kind: "grenade", aoe: 75 },
  };
  const WEAPON_MAX_LVL = 10;
  const weaponUpgradeCost = (lvl) => 80 * lvl;
  const weaponLvlMult = (lvl) => 1 + 0.2 * (lvl - 1);

  // ============================================================
  // Talente (permanent)
  // ============================================================
  const TALENTS = {
    hp: { name: "Konstitution", icon: "❤️", desc: "+8% max. HP pro Stufe", max: 15 },
    atk: { name: "Schusstraining", icon: "🎯", desc: "+6% Schaden pro Stufe", max: 15 },
    speed: { name: "Ausdauer", icon: "👟", desc: "+3% Laufgeschwindigkeit pro Stufe", max: 10 },
    greed: { name: "Plünderer", icon: "💰", desc: "+10% Münzen pro Stufe", max: 10 },
  };
  const talentCost = (lvl) => 60 + 60 * lvl;

  // ============================================================
  // Skills (pro Run, Auswahl bei Level-Up)
  // ============================================================
  const SKILLS = [
    { id: "multishot", name: "Mehrfachschuss", icon: "🔁", rarity: "epic", max: 3, desc: "+1 zusätzliche Salve (Schaden −10%)", apply: (p) => { p.multishot++; p.dmgMul *= 0.9; } },
    { id: "front", name: "Doppellauf", icon: "⏸️", rarity: "epic", max: 3, desc: "+1 paralleles Projektil nach vorn", apply: (p) => { p.front++; p.dmgMul *= 0.95; } },
    { id: "diag", name: "Diagonalschüsse", icon: "↗️", rarity: "rare", max: 2, desc: "Schießt zusätzlich schräg nach vorn", apply: (p) => p.diag++ },
    { id: "side", name: "Seitenschüsse", icon: "↔️", rarity: "rare", max: 2, desc: "Schießt zusätzlich nach links und rechts", apply: (p) => p.side++ },
    { id: "rear", name: "Rückendeckung", icon: "↩️", rarity: "rare", max: 2, desc: "Schießt zusätzlich nach hinten", apply: (p) => p.rear++ },
    { id: "pierce", name: "Durchschlag", icon: "🪡", rarity: "rare", max: 3, desc: "Projektile durchdringen +1 Zombie", apply: (p) => p.pierce++ },
    { id: "ricochet", name: "Querschläger", icon: "🔀", rarity: "epic", max: 2, desc: "Projektile springen zu +2 weiteren Zombies", apply: (p) => { p.ricochet += 2; } },
    { id: "wall", name: "Abpraller", icon: "🧱", rarity: "rare", max: 2, desc: "Projektile prallen 2× von Wänden ab", apply: (p) => { p.wall += 2; } },
    { id: "atk", name: "Großes Kaliber", icon: "💪", rarity: "common", max: 6, desc: "+25% Schaden", apply: (p) => { p.dmgMul *= 1.25; p.power *= 1.25; } },
    { id: "rate", name: "Schnellfeuer", icon: "⏩", rarity: "common", max: 6, desc: "+22% Feuerrate", apply: (p) => { p.rateMul *= 1.22; } },
    { id: "crit", name: "Kopfschuss-Training", icon: "🎯", rarity: "common", max: 4, desc: "+10% Krit-Chance, +30% Krit-Schaden", apply: (p) => { p.crit += 0.1; p.critMul += 0.3; } },
    { id: "hp", name: "Zähigkeit", icon: "🛡️", rarity: "common", max: 6, desc: "+25% max. HP (und heilt um den Bonus)", apply: (p) => { const add = Math.round(p.maxHp * 0.25); p.maxHp += add; p.hp += add; } },
    { id: "heal", name: "Medkit", icon: "🩹", rarity: "common", max: 99, desc: "Heilt 40% der max. HP", cond: (p) => p.hp < p.maxHp * 0.85, apply: (p) => healPlayer(p.maxHp * 0.4) },
    { id: "fire", name: "Brandmunition", icon: "🔥", rarity: "rare", max: 2, desc: "Treffer setzen Zombies in Brand", apply: (p) => p.burn++ },
    { id: "freeze", name: "Kryo-Munition", icon: "❄️", rarity: "rare", max: 2, desc: "Treffer verlangsamen Zombies stark", apply: (p) => p.freeze++ },
    { id: "poison", name: "Toxin-Munition", icon: "☣️", rarity: "rare", max: 2, desc: "Treffer vergiften dauerhaft (stapelbar)", apply: (p) => p.poison++ },
    { id: "blood", name: "Adrenalin", icon: "🩸", rarity: "rare", max: 3, desc: "Jeder Kill heilt 2% max. HP", apply: (p) => { p.lifesteal += 0.02; } },
    { id: "orbit", name: "Kreissägen", icon: "🪚", rarity: "epic", max: 3, desc: "+2 rotierende Sägeblätter um dich", apply: (p) => { p.orbit += 2; } },
    { id: "drone", name: "Kampfdrohne", icon: "🛸", rarity: "epic", max: 2, desc: "Eine Drohne schießt auch beim Laufen", apply: (p) => p.drones++ },
    { id: "dodge", name: "Reflexe", icon: "💨", rarity: "common", max: 3, desc: "+12% Ausweichchance", apply: (p) => { p.dodge += 0.12; } },
    { id: "speed", name: "Sprinter", icon: "👟", rarity: "common", max: 3, desc: "+12% Laufgeschwindigkeit", apply: (p) => { p.speed *= 1.12; } },
    { id: "exec", name: "Exekution", icon: "💀", rarity: "epic", max: 2, desc: "8% Chance, normale Zombies sofort zu töten", apply: (p) => { p.headshot += 0.08; } },
    { id: "revive", name: "Zweites Leben", icon: "✨", rarity: "epic", max: 1, desc: "Einmalige Wiederbelebung mit 60% HP", apply: (p) => p.revives++ },
    { id: "splash", name: "Infektionsbombe", icon: "🧨", rarity: "rare", max: 2, desc: "Getötete Zombies explodieren", apply: (p) => p.deathBlast++ },
  ];
  const RARITY_WEIGHT = { common: 1, rare: 0.7, epic: 0.45 };

  // ============================================================
  // Zombie-Typen
  // ============================================================
  const ZOMBIES = {
    walker: { name: "Walker", r: 15, hp: 60, speed: 55, dmg: 14, xp: 2, coins: [0, 2], color: "#6e8f5a", skin: "#9db884", cost: 1 },
    runner: { name: "Sprinter", r: 13, hp: 40, speed: 125, dmg: 10, xp: 2, coins: [0, 2], color: "#8f6a4a", skin: "#c7a07a", cost: 1.5 },
    crawler: { name: "Kriecher", r: 9, hp: 18, speed: 140, dmg: 6, xp: 1, coins: [0, 1], color: "#5b4f6e", skin: "#9a8bb3", cost: 0.6 },
    spitter: { name: "Spucker", r: 15, hp: 50, speed: 60, dmg: 10, xp: 3, coins: [1, 2], color: "#4f7f2e", skin: "#b7ff4a", cost: 2, ranged: true },
    bomber: { name: "Bomber", r: 15, hp: 45, speed: 95, dmg: 30, xp: 3, coins: [1, 3], color: "#8a3b2a", skin: "#ff8a5b", cost: 2 },
    brute: { name: "Koloss", r: 25, hp: 280, speed: 45, dmg: 24, xp: 6, coins: [2, 5], color: "#56604f", skin: "#8e9a84", cost: 4 },
    abom: { name: "ABSCHEULICHKEIT", r: 48, hp: 2200, speed: 60, dmg: 30, xp: 40, coins: [40, 60], color: "#6b3a52", skin: "#b06a8a", boss: true },
    mother: { name: "BRUTMUTTER", r: 52, hp: 2700, speed: 34, dmg: 28, xp: 50, coins: [50, 80], color: "#3f5a3a", skin: "#a8d26a", boss: true },
  };

  // ============================================================
  // DOM
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const ui = {
    menu: $("menu"), armory: $("armory"), talents: $("talents"), skillPick: $("skillPick"),
    pause: $("pause"), over: $("over"), pauseBtn: $("pauseBtn"),
    shop: $("shop"), daily: $("daily"), settings: $("settings"), revive: $("revive"),
  };
  const overlays = [ui.menu, ui.armory, ui.talents, ui.skillPick, ui.pause, ui.over, ui.shop, ui.daily, ui.settings, ui.revive];
  function show(el) {
    for (const o of overlays) o.classList.toggle("hidden", o !== el);
    ui.pauseBtn.classList.toggle("hidden", el !== null);
  }

  let scale = 1;
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
  }
  window.addEventListener("resize", resize);
  resize();

  // ============================================================
  // Audio (synthetisch, keine Dateien)
  // ============================================================
  let actx = null;
  const lastSfx = {};
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function sfx(type) {
    if (!save.sound || !actx) return;
    const now = actx.currentTime;
    const minGap = { shoot: 0.05, hit: 0.03, kill: 0.04 }[type] || 0;
    if (lastSfx[type] && now - lastSfx[type] < minGap) return;
    lastSfx[type] = now;
    const cfg = {
      shoot: [["square", 520, 180, 0.06, 0.04]],
      hit: [["triangle", 220, 90, 0.05, 0.05]],
      kill: [["sawtooth", 160, 40, 0.18, 0.06]],
      hurt: [["sawtooth", 120, 50, 0.25, 0.12]],
      level: [["triangle", 440, 880, 0.25, 0.1], ["triangle", 660, 1320, 0.3, 0.08]],
      door: [["sine", 300, 600, 0.3, 0.1]],
      boom: [["sawtooth", 90, 25, 0.4, 0.15]],
      coin: [["square", 900, 1300, 0.07, 0.03]],
    }[type];
    if (!cfg) return;
    for (const [wave, f0, f1, dur, vol] of cfg) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g).connect(actx.destination);
      o.start(now);
      o.stop(now + dur + 0.02);
    }
  }

  // ============================================================
  // Spielzustand
  // ============================================================
  let state = "menu"; // menu | play | pick | pause | revive | over
  let run = null;
  let player = null;
  let enemies = [];
  let bullets = [];
  let eBullets = [];
  let orbs = [];
  let particles = [];
  let texts = [];
  let obstacles = [];
  let supplyCrate = null;
  let floorCanvas = null;
  let shake = 0;
  let banner = null;
  const volleyQueue = [];

  function newPlayer() {
    const wid = save.equipped;
    const wlvl = save.weapons[wid] || 1;
    const t = save.talents;
    const maxHp = Math.round(600 * (1 + 0.08 * t.hp));
    return {
      x: W / 2, y: B - 70, r: 16, vx: 0, vy: 0,
      hp: maxHp, maxHp, level: 1, xp: 0, xpNeed: 12,
      speed: 190 * (1 + 0.03 * t.speed),
      weaponId: wid, weapon: WEAPONS[wid],
      power: 20 * (1 + 0.06 * t.atk) * weaponLvlMult(wlvl),
      dmgMul: (1 + 0.06 * t.atk) * weaponLvlMult(wlvl), rateMul: 1,
      crit: 0.05 + (WEAPONS[wid].crit || 0), critMul: 2,
      multishot: 0, front: 0, diag: 0, side: 0, rear: 0,
      pierce: 0, ricochet: 0, wall: 0, burn: 0, freeze: 0, poison: 0,
      lifesteal: 0, orbit: 0, drones: 0, dodge: 0, headshot: 0, revives: 0, deathBlast: 0,
      skills: {}, aim: -Math.PI / 2, fireCd: 0.3, invuln: 0, moving: false,
      orbitAng: 0, droneCd: 0, muzzle: 0, walkT: 0,
    };
  }

  function startRun() {
    ensureAudio();
    run = {
      chapter: 1, room: 0, kills: 0, coins: 0, greed: 1 + 0.1 * save.talents.greed, time: 0, pendingPicks: 0, cleared: false,
      adRevived: false, adWatched: false, earned: 0,
    };
    player = newPlayer();
    nextRoom();
    show(null);
    state = "play";
  }

  // ============================================================
  // Räume
  // ============================================================
  function nextRoom() {
    run.room++;
    if (run.room > ROOMS_PER_CHAPTER) {
      const bonus = Math.round(100 * run.chapter * run.greed);
      run.coins += bonus;
      run.chapter++;
      run.room = 1;
      showBanner(`KAPITEL ${run.chapter - 1} ÜBERLEBT`, `+${bonus} 💰 · Die Seuche wird stärker…`);
    }
    enemies = []; bullets = []; eBullets = []; orbs = []; particles = []; volleyQueue.length = 0;
    supplyCrate = null;
    player.x = W / 2; player.y = B - 70; player.vx = player.vy = 0;
    player.invuln = 1;
    run.cleared = false;

    const isBoss = BOSS_ROOMS[run.room];
    const isSupply = SUPPLY_ROOMS.includes(run.room);
    obstacles = isSupply ? [] : genObstacles(isBoss ? randi(0, 2) : randi(2, 5));
    floorCanvas = makeFloor();

    if (isSupply) {
      supplyCrate = { x: W / 2, y: (T + B) / 2, r: 26, bob: 0 };
      showBanner("VERSORGUNGSRAUM", "Öffne die Kiste");
    } else if (isBoss) {
      spawnEnemy(isBoss, W / 2, T + 180);
      showBanner(`BOSS: ${ZOMBIES[isBoss].name}`, `Kapitel ${run.chapter} · Raum ${run.room}`);
    } else {
      spawnWave();
      if (!banner) showBanner(`RAUM ${run.room}`, `Kapitel ${run.chapter}`, 1.2);
    }
  }

  function genObstacles(n) {
    const obs = [];
    let tries = 0;
    while (obs.length < n && tries++ < 200) {
      const kind = pick(["crate", "crate", "car", "barrels"]);
      const w = kind === "car" ? rand(90, 120) : kind === "barrels" ? 50 : rand(50, 80);
      const h = kind === "car" ? 52 : kind === "barrels" ? 50 : rand(46, 70);
      const vert = kind === "car" && Math.random() < 0.4;
      const o = { kind, w: vert ? h : w, h: vert ? w : h, vert };
      o.x = rand(L + 30, R - 30 - o.w);
      o.y = rand(T + 130, B - 220 - o.h);
      const m = 60;
      const blocked = obs.some((q) => o.x < q.x + q.w + m && o.x + o.w + m > q.x && o.y < q.y + q.h + m && o.y + o.h + m > q.y);
      if (!blocked) obs.push(o);
    }
    return obs;
  }

  function makeFloor() {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const hue = [[30, 38, 33], [36, 34, 30], [28, 32, 38]][(run.chapter - 1) % 3];
    g.fillStyle = `rgb(${hue.join(",")})`;
    g.fillRect(L, T, ARENA.w, ARENA.h);
    // Fliesen
    const ts = 54;
    for (let y = T; y < B; y += ts) {
      for (let x = L; x < R; x += ts) {
        const v = rand(-6, 6);
        g.fillStyle = `rgb(${hue[0] + v},${hue[1] + v},${hue[2] + v})`;
        g.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      }
    }
    // Risse & Flecken
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      let x = rand(L, R), y = rand(T, B);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rand(-25, 25); y += rand(-25, 25); g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(${pick(["90,20,20", "60,80,30", "20,20,20"])},${rand(0.15, 0.3)})`;
      g.beginPath(); g.ellipse(rand(L, R), rand(T, B), rand(15, 45), rand(10, 30), rand(0, 3), 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  function addDecal(x, y, r, color) {
    if (!floorCanvas) return;
    const g = floorCanvas.getContext("2d");
    g.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(x + rand(-r, r), y + rand(-r, r), rand(r * 0.25, r * 0.6), 0, Math.PI * 2);
      g.fill();
    }
  }

  function spawnWave() {
    const ch = run.chapter, room = run.room;
    let budget = 4 + room * 1.1 + (ch - 1) * 4;
    const pool = ["walker", "crawler"];
    if (room >= 2 || ch > 1) pool.push("runner");
    if (room >= 3 || ch > 1) pool.push("spitter");
    if (room >= 6 || ch > 1) pool.push("bomber");
    if (room >= 8 || ch > 1) pool.push("brute");
    const maxCount = 14 + ch * 2;
    let count = 0;
    while (budget > 0.5 && count < maxCount) {
      const type = pick(pool);
      const def = ZOMBIES[type];
      const n = type === "crawler" ? 3 : 1;
      if (def.cost * n > budget + 0.5) { if (budget < 1) break; continue; }
      budget -= def.cost * n;
      const pos = freeSpot(T + 60, (T + B) / 2 + 60);
      for (let i = 0; i < n; i++) spawnEnemy(type, pos.x + rand(-20, 20), pos.y + rand(-20, 20));
      count += n;
    }
  }

  function freeSpot(yMin, yMax) {
    for (let i = 0; i < 50; i++) {
      const p = { x: rand(L + 40, R - 40), y: rand(yMin, yMax), r: 30 };
      if (!obstacles.some((o) => circleRectOverlap(p, o))) return p;
    }
    return { x: W / 2, y: yMin + 20 };
  }

  function spawnEnemy(type, x, y) {
    const def = ZOMBIES[type];
    const ch = run.chapter, room = run.room;
    const hpMul = (1 + (room - 1) * 0.07) * Math.pow(1.6, ch - 1);
    const dmgMul = (1 + (room - 1) * 0.03) * Math.pow(1.3, ch - 1);
    const e = {
      type, def, x: clamp(x, L + def.r, R - def.r), y: clamp(y, T + def.r, B - def.r), r: def.r,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, dmg: def.dmg * dmgMul, speed: def.speed * rand(0.9, 1.1),
      spawnT: def.boss ? 1.2 : rand(0.4, 0.8), hitT: 0, dead: false,
      burnT: 0, burnDps: 0, poisonDps: 0, slowT: 0,
      aiT: rand(1, 2.5), mode: "walk", cd: rand(1, 2.2), dirX: 0, dirY: 0,
      blocked: 0, side: Math.random() < 0.5 ? -1 : 1, bladeCd: 0, wob: rand(0, 6), phase2: false,
    };
    enemies.push(e);
    return e;
  }

  // ============================================================
  // Kollision
  // ============================================================
  function circleRectOverlap(c, r) {
    const cx = clamp(c.x, r.x, r.x + r.w), cy = clamp(c.y, r.y, r.y + r.h);
    return (c.x - cx) ** 2 + (c.y - cy) ** 2 < c.r * c.r;
  }
  function pushOutRect(o, r) {
    const cx = clamp(o.x, r.x, r.x + r.w), cy = clamp(o.y, r.y, r.y + r.h);
    const dx = o.x - cx, dy = o.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= o.r * o.r) return false;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      o.x = cx + (dx / d) * o.r; o.y = cy + (dy / d) * o.r;
    } else {
      const l = o.x - r.x, rr = r.x + r.w - o.x, t = o.y - r.y, b = r.y + r.h - o.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) o.x = r.x - o.r; else if (m === rr) o.x = r.x + r.w + o.r;
      else if (m === t) o.y = r.y - o.r; else o.y = r.y + r.h + o.r;
    }
    return true;
  }
  function collideWorld(o) {
    let hit = false;
    for (const r of obstacles) if (pushOutRect(o, r)) hit = true;
    if (supplyCrate && o !== player) {
      const d = Math.sqrt(dist2(o, supplyCrate));
      if (d < o.r + supplyCrate.r && d > 0) { const k = (o.r + supplyCrate.r) / d; o.x = supplyCrate.x + (o.x - supplyCrate.x) * k; o.y = supplyCrate.y + (o.y - supplyCrate.y) * k; }
    }
    o.x = clamp(o.x, L + o.r, R - o.r);
    o.y = clamp(o.y, T + o.r, B - o.r);
    return hit;
  }
  const pointInRect = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

  // ============================================================
  // Input: schwebender Joystick + Tastatur
  // ============================================================
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
  const keys = new Set();
  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }
  const stage = $("stage");
  stage.addEventListener("pointerdown", (e) => {
    if (state !== "play" || e.target !== canvas && e.target !== stage) return;
    ensureAudio();
    const p = toWorld(e);
    Object.assign(joy, { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, active: true });
    try { stage.setPointerCapture(e.pointerId); } catch { /* egal */ }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    const p = toWorld(e);
    joy.x = p.x; joy.y = p.y;
  });
  const endJoy = (e) => { if (e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
  stage.addEventListener("pointerup", endJoy);
  stage.addEventListener("pointercancel", endJoy);
  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === "Escape" || e.key === "p") togglePause();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  function inputVector() {
    let x = 0, y = 0;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (joy.active) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > 70) { joy.ox = joy.x - (dx / len) * 70; joy.oy = joy.y - (dy / len) * 70; }
      if (len > 8) { x = dx / len; y = dy / len; }
    }
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : null;
  }

  // ============================================================
  // Spieler-Logik
  // ============================================================
  function nearestEnemy(from, exclude) {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || (exclude && exclude.has(e))) continue;
      const d = dist2(from, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function updatePlayer(dt) {
    const p = player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    const v = inputVector();
    p.moving = !!v;
    if (v) {
      p.x += v.x * p.speed * dt;
      p.y += v.y * p.speed * dt;
      p.aim = Math.atan2(v.y, v.x);
      p.walkT += dt * 10;
    }
    collideWorld(p);

    // Tür
    if (run.cleared && p.y - p.r <= T + 2 && Math.abs(p.x - W / 2) < DOOR_W / 2) {
      sfx("door");
      nextRoom();
      return;
    }
    // Versorgungskiste
    if (supplyCrate && !supplyCrate.opened && Math.sqrt(dist2(p, supplyCrate)) < p.r + supplyCrate.r + 4) {
      supplyCrate.opened = true;
      openSupply();
      return;
    }

    // Auto-Feuer nur im Stand (Kernmechanik)
    p.fireCd -= dt;
    const target = nearestEnemy(p);
    if (!p.moving && target) {
      p.aim = Math.atan2(target.y - p.y, target.x - p.x);
      if (p.fireCd <= 0) {
        fire();
        p.fireCd = 1 / (p.weapon.rate * p.rateMul);
      }
    } else if (p.fireCd < 0) {
      p.fireCd = 0.12; // kurze Anlaufzeit nach dem Stehenbleiben
    }

    // Salven-Warteschlange (Mehrfachschuss)
    for (let i = volleyQueue.length - 1; i >= 0; i--) {
      volleyQueue[i].t -= dt;
      if (volleyQueue[i].t <= 0) { volley(p.aim); volleyQueue.splice(i, 1); }
    }

    // Kreissägen
    p.orbitAng += dt * 4.2;
    if (p.orbit > 0) {
      for (let i = 0; i < p.orbit; i++) {
        const a = p.orbitAng + (i / p.orbit) * Math.PI * 2;
        const bx = p.x + Math.cos(a) * 64, by = p.y + Math.sin(a) * 64;
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.bladeCd > 0) continue;
          if ((e.x - bx) ** 2 + (e.y - by) ** 2 < (e.r + 11) ** 2) {
            e.bladeCd = 0.35;
            damageEnemy(e, p.power * 0.8, {});
          }
        }
      }
    }

    // Drohnen
    if (p.drones > 0) {
      p.droneCd -= dt;
      if (p.droneCd <= 0) {
        p.droneCd = 0.9 / p.drones;
        const t = nearestEnemy(p);
        if (t) {
          const d = dronePos(Math.floor(Math.random() * p.drones));
          const a = Math.atan2(t.y - d.y, t.x - d.x);
          bullets.push(makeBullet(d.x, d.y, a, { dmg: p.power * 0.9, speed: 650, r: 4, color: "#7fe7ff", life: 1.6 }));
        }
      }
    }
  }

  function dronePos(i) {
    const a = player.orbitAng * 0.35 + (i / Math.max(player.drones, 1)) * Math.PI * 2;
    return { x: player.x + Math.cos(a) * 38, y: player.y - 30 + Math.sin(a) * 12 };
  }

  function fire() {
    volley(player.aim);
    for (let i = 1; i <= player.multishot; i++) volleyQueue.push({ t: i * 0.09 });
  }

  function volley(aim) {
    const p = player, w = p.weapon;
    const dirs = [];
    // vorn (mit parallelen Läufen)
    const n = 1 + p.front;
    for (let i = 0; i < n; i++) dirs.push({ a: aim, off: (i - (n - 1) / 2) * 13 });
    const diagAngles = [40, 22];
    for (let i = 0; i < p.diag; i++) { dirs.push({ a: aim + diagAngles[i] * DEG, off: 0 }); dirs.push({ a: aim - diagAngles[i] * DEG, off: 0 }); }
    const sideAngles = [90, 112];
    for (let i = 0; i < p.side; i++) { dirs.push({ a: aim + sideAngles[i] * DEG, off: 0 }); dirs.push({ a: aim - sideAngles[i] * DEG, off: 0 }); }
    if (p.rear >= 1) dirs.push({ a: aim + Math.PI, off: 0 });
    if (p.rear >= 2) { dirs.push({ a: aim + Math.PI + 15 * DEG, off: 0 }); dirs.push({ a: aim + Math.PI - 15 * DEG, off: 0 }); }

    const gx = p.x + Math.cos(aim) * 20, gy = p.y + Math.sin(aim) * 20;
    for (const d of dirs) {
      const px = -Math.sin(d.a) * d.off, py = Math.cos(d.a) * d.off;
      for (let k = 0; k < w.pellets; k++) {
        const s = w.pellets > 1 ? (k / (w.pellets - 1) - 0.5) * w.spread : 0;
        const a = d.a + s + rand(-w.jitter, w.jitter);
        bullets.push(makeBullet(gx + px, gy + py, a, {
          dmg: w.dmg * p.dmgMul, speed: w.speed * (w.kind === "flame" ? rand(0.85, 1.15) : 1), r: w.r, color: w.color,
          life: w.range / w.speed, pierce: w.pierce + p.pierce, wall: p.wall, rico: p.ricochet,
          kind: w.kind, aoe: w.aoe, burn: w.burn ? 1 + p.burn : p.burn, freeze: p.freeze, poison: p.poison, player: true,
        }));
      }
    }
    p.muzzle = 0.06;
    if (w.kind !== "flame" || Math.random() < 0.25) sfx("shoot");
  }

  function makeBullet(x, y, a, o) {
    return {
      x, y, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, r: o.r || 5, color: o.color || "#fff",
      dmg: o.dmg, life: o.life || 1.5, maxLife: o.life || 1.5, pierce: o.pierce || 0, wall: o.wall || 0, rico: o.rico || 0,
      kind: o.kind || "bullet", aoe: o.aoe || 0, burn: o.burn || 0, freeze: o.freeze || 0, poison: o.poison || 0,
      hit: new Set(), dead: false, trail: [],
    };
  }

  function healPlayer(v) {
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + v);
    const got = Math.round(player.hp - before);
    if (got > 0) addText(player.x, player.y - 34, `+${got}`, "#6dff8a", 18);
  }

  function hurtPlayer(dmg) {
    const p = player;
    if (p.invuln > 0 || state !== "play") return;
    if (Math.random() < p.dodge) {
      addText(p.x, p.y - 30, "AUSGEWICHEN", "#9ee6ff", 15);
      p.invuln = 0.3;
      return;
    }
    p.hp -= dmg;
    p.invuln = 0.8;
    shake = Math.max(shake, 8);
    addText(p.x, p.y - 30, `-${Math.round(dmg)}`, "#ff5a5a", 20);
    burst(p.x, p.y, "#c0392b", 10, 160);
    sfx("hurt");
    if (save.vibration) Platform.vibrate(30);
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--;
        revivePlayer(0.6, "Zweites Leben verbraucht");
      } else {
        p.hp = 0;
        if (Platform.ads.available && !run.adRevived) offerRevive(); else gameOver(false);
      }
    }
  }

  function revivePlayer(frac, sub) {
    const p = player;
    p.hp = p.maxHp * frac;
    p.invuln = 2.5;
    for (const e of enemies) if (!e.def.boss && Math.sqrt(dist2(e, p)) < 170) damageEnemy(e, 999999, { silent: true });
    eBullets = [];
    showBanner("WIEDERBELEBT", sub, 1.5);
  }

  // Rewarded Ad Nr. 1: Wiederbeleben (einmal pro Run, wichtigste Einnahmequelle)
  let reviveTimer = null;
  function offerRevive() {
    state = "revive";
    joy.active = false;
    let left = 5;
    $("reviveCount").textContent = left;
    show(ui.revive);
    clearInterval(reviveTimer);
    reviveTimer = setInterval(() => {
      left--;
      $("reviveCount").textContent = Math.max(0, left);
      if (left <= 0) { clearInterval(reviveTimer); if (state === "revive") gameOver(false); }
    }, 1000);
  }
  async function reviveWithAd() {
    if (state !== "revive") return;
    clearInterval(reviveTimer);
    const ok = await Platform.ads.showRewarded("revive");
    if (state !== "revive") return;
    if (!ok) { toast("Kein Video verfügbar"); gameOver(false); return; }
    run.adRevived = true;
    run.adWatched = true;
    revivePlayer(1, "Volle Gesundheit!");
    state = "play";
    show(null);
  }

  // ============================================================
  // Projektile
  // ============================================================
  function updateBullets(dt) {
    for (const b of bullets) {
      if (b.dead) continue;
      const px = b.x, py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.kind !== "flame") { b.trail.push(px, py); if (b.trail.length > 8) b.trail.splice(0, 2); }
      if (b.life <= 0) { if (b.kind === "grenade") explode(b.x, b.y, b.aoe, b.dmg, true); b.dead = true; continue; }

      // Arena-Wände
      let bounced = false;
      if (b.x < L || b.x > R) { if (b.wall > 0) { b.vx *= -1; b.x = px; bounced = true; } else b.dead = true; }
      if (b.y < T || b.y > B) { if (b.wall > 0) { b.vy *= -1; b.y = py; bounced = true; } else b.dead = true; }
      // Hindernisse
      for (const o of obstacles) {
        if (b.dead || !pointInRect(b.x, b.y, o)) continue;
        if (b.wall > 0) {
          if (px <= o.x || px >= o.x + o.w) b.vx *= -1; else b.vy *= -1;
          b.x = px; b.y = py; bounced = true;
        } else {
          b.dead = true;
          burst(b.x, b.y, "#a89c84", 3, 90);
        }
      }
      if (bounced) { b.wall--; b.hit.clear(); }
      if (b.dead) { if (b.kind === "grenade") explode(b.x, b.y, b.aoe, b.dmg, true); continue; }

      for (const e of enemies) {
        if (e.dead || e.spawnT > 0 || b.hit.has(e)) continue;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (e.r + b.r) ** 2) continue;
        if (b.kind === "grenade") { explode(b.x, b.y, b.aoe, b.dmg, true); b.dead = true; break; }
        b.hit.add(e);
        damageEnemy(e, b.dmg, { bullet: b });
        if (b.rico > 0) {
          const next = nearestEnemy(e, b.hit);
          if (next) {
            const sp = Math.hypot(b.vx, b.vy);
            const a = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
            b.rico--; b.life = Math.max(b.life, 0.8);
            break;
          }
        }
        if (b.pierce > 0) { b.pierce--; continue; }
        b.dead = true;
        break;
      }
    }
    bullets = bullets.filter((b) => !b.dead);

    for (const b of eBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < L || b.x > R || b.y < T || b.y > B) { b.dead = true; continue; }
      if (obstacles.some((o) => pointInRect(b.x, b.y, o))) { b.dead = true; burst(b.x, b.y, b.color, 4, 80); continue; }
      if ((player.x - b.x) ** 2 + (player.y - b.y) ** 2 < (player.r + b.r - 3) ** 2) {
        b.dead = true;
        hurtPlayer(b.dmg);
      }
    }
    eBullets = eBullets.filter((b) => !b.dead);
  }

  function explode(x, y, radius, dmg, byPlayer) {
    shake = Math.max(shake, 7);
    sfx("boom");
    burst(x, y, "#ffb347", 18, 260);
    burst(x, y, "#ff5a1f", 10, 180);
    particles.push({ ring: true, x, y, r: radius, life: 0.3, max: 0.3, color: "rgba(255,180,80," });
    addDecal(x, y, radius * 0.5, "rgba(0,0,0,0.25)");
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (Math.sqrt(dist2(e, { x, y })) < radius + e.r) damageEnemy(e, byPlayer ? dmg : dmg * 2, { aoe: true });
    }
    if (!byPlayer && Math.sqrt(dist2(player, { x, y })) < radius + player.r) hurtPlayer(dmg);
  }

  // ============================================================
  // Zombies
  // ============================================================
  function damageEnemy(e, dmg, o) {
    if (e.dead) return;
    const p = player;
    let crit = false;
    if (!o.silent) {
      const critChance = p.crit;
      if (Math.random() < critChance) { dmg *= p.critMul; crit = true; }
      if (!e.def.boss && p.headshot > 0 && Math.random() < p.headshot) { dmg = e.hp; crit = true; }
    }
    const b = o.bullet;
    if (b) {
      if (b.burn) { e.burnT = 2.5; e.burnDps = Math.max(e.burnDps, p.power * 0.35 * b.burn); }
      if (b.freeze) e.slowT = 1.2 + 0.6 * b.freeze;
      if (b.poison) e.poisonDps = Math.min(e.poisonDps + p.power * 0.08 * b.poison, p.power * 1.5 * b.poison);
      if (!e.def.boss && b.kind !== "flame") {
        const k = e.type === "brute" ? 2 : 6;
        const len = Math.hypot(b.vx, b.vy) || 1;
        e.x += (b.vx / len) * k; e.y += (b.vy / len) * k;
      }
    }
    e.hp -= dmg;
    e.hitT = 0.08;
    if (!o.silent && (!b || b.kind !== "flame" || Math.random() < 0.2)) {
      addText(e.x + rand(-8, 8), e.y - e.r - 4, Math.max(1, Math.round(dmg)), crit ? "#ffd84a" : "#ffffff", crit ? 22 : 15);
      sfx("hit");
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    run.kills++;
    const def = e.def;
    burst(e.x, e.y, "#7a1d1d", def.boss ? 40 : 12, def.boss ? 320 : 200);
    burst(e.x, e.y, def.skin, def.boss ? 20 : 6, 160);
    addDecal(e.x, e.y, e.r, "rgba(110,15,15,0.55)");
    sfx(def.boss ? "boom" : "kill");
    if (def.boss) shake = 18;

    const xpVal = def.xp * (1 + run.room * 0.04) * (1 + (run.chapter - 1) * 0.5);
    const nx = def.boss ? 12 : Math.max(1, Math.round(def.xp / 2));
    for (let i = 0; i < nx; i++) orbs.push(makeOrb(e.x, e.y, "xp", xpVal / nx));
    const nc = randi(def.coins[0], def.coins[1]);
    for (let i = 0; i < nc; i++) orbs.push(makeOrb(e.x, e.y, "coin", 1));

    if (player.lifesteal > 0) healPlayer(player.maxHp * player.lifesteal);
    if (e.type === "bomber") explode(e.x, e.y, 70, e.dmg, false);
    else if (player.deathBlast > 0) explode(e.x, e.y, 45 + 15 * player.deathBlast, player.power * 1.2 * player.deathBlast, true);
    if (e.type === "abom" || e.type === "mother") {
      for (let i = 0; i < 4 + run.chapter; i++) orbs.push(makeOrb(e.x, e.y, "coin", 3));
    }
  }

  function makeOrb(x, y, type, val) {
    const a = rand(0, Math.PI * 2), s = rand(60, 220);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, type, val, t: 0, r: type === "coin" ? 6 : 5 };
  }

  function enemyShoot(e, angle, speed, dmg, color = "#b7ff4a", r = 8) {
    eBullets.push({ x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, color, life: 4, dead: false });
  }

  function updateEnemies(dt) {
    const p = player;
    for (const e of enemies) {
      if (e.dead) continue;
      e.hitT = Math.max(0, e.hitT - dt);
      e.bladeCd = Math.max(0, e.bladeCd - dt);
      e.wob += dt * 6;
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }

      // Statuseffekte
      if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burnDps * dt; if (Math.random() < 0.3) particles.push(spark(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), "#ff8a2e")); }
      if (e.poisonDps > 0) { e.hp -= e.poisonDps * dt; if (Math.random() < 0.15) particles.push(spark(e.x + rand(-e.r, e.r), e.y, "#8cff4a")); }
      if (e.hp <= 0) { killEnemy(e); continue; }
      const slow = e.slowT > 0 ? 0.45 : 1;
      e.slowT = Math.max(0, e.slowT - dt);

      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx = dx / d, my = dy / d;
      let sp = e.speed * slow;

      switch (e.type) {
        case "spitter": {
          if (d < 200) { mx = -mx; my = -my; } else if (d < 330) { const t = mx; mx = -my * e.side; my = t * e.side; sp *= 0.6; }
          e.cd -= dt;
          if (e.cd <= 0) { e.cd = rand(1.8, 2.6); enemyShoot(e, Math.atan2(dy, dx), 270, e.dmg * 1.2); }
          break;
        }
        case "bomber": {
          if (d < e.r + p.r + 14) { e.hp = 0; killEnemy(e); continue; }
          break;
        }
        case "brute":
        case "abom": {
          e.aiT -= dt;
          if (e.mode === "walk" && e.aiT <= 0) {
            if (e.type === "abom" && Math.random() < 0.5) {
              const n = e.phase2 ? 22 : 14;
              const off = rand(0, 1);
              for (let i = 0; i < n; i++) enemyShoot(e, ((i + off) / n) * Math.PI * 2, e.phase2 ? 230 : 190, e.dmg * 0.8, "#ff6ad5", 9);
              e.aiT = e.phase2 ? 1.8 : 2.6;
            } else {
              e.mode = "wind"; e.aiT = 0.65; e.dirX = mx; e.dirY = my;
            }
          } else if (e.mode === "wind") {
            sp = 0;
            e.dirX = mx; e.dirY = my;
            if (e.aiT <= 0) { e.mode = "charge"; e.aiT = e.type === "abom" ? 0.75 : 0.5; }
          } else if (e.mode === "charge") {
            mx = e.dirX; my = e.dirY; sp = (e.type === "abom" ? 520 : 430) * slow;
            if (Math.random() < 0.5) particles.push(spark(e.x, e.y + e.r * 0.6, "#5a4a3a"));
            if (e.aiT <= 0) { e.mode = "walk"; e.aiT = rand(2.2, 3.5); }
          }
          if (e.type === "abom" && !e.phase2 && e.hp < e.maxHp * 0.5) { e.phase2 = true; e.speed *= 1.3; showBanner("RASEREI!", "Die Abscheulichkeit mutiert", 1.2); }
          break;
        }
        case "mother": {
          e.cd -= dt; e.aiT -= dt;
          if (e.cd <= 0) {
            e.cd = e.phase2 ? 1.4 : 2.0;
            const base = Math.atan2(dy, dx);
            const n = e.phase2 ? 7 : 5;
            for (let i = 0; i < n; i++) enemyShoot(e, base + (i - (n - 1) / 2) * 0.22, 240, e.dmg * 0.7, "#b7ff4a", 9);
          }
          if (e.aiT <= 0) {
            e.aiT = e.phase2 ? 3 : 4;
            const alive = enemies.filter((q) => !q.dead && q.type === "crawler").length;
            if (alive < 14) for (let i = 0; i < 4; i++) spawnEnemy("crawler", e.x + rand(-50, 50), e.y + e.r + rand(0, 30)).spawnT = 0.3;
          }
          if (!e.phase2 && e.hp < e.maxHp * 0.5) { e.phase2 = true; showBanner("DIE BRUT ERWACHT", "", 1.2); }
          break;
        }
      }

      // Hindernis-Umgehung: nach Kollision kurz seitlich ausweichen
      if (e.blocked > 0 && e.mode !== "charge") {
        e.blocked -= dt;
        const tx = -my * e.side, ty = mx * e.side;
        mx = mx * 0.3 + tx * 0.9; my = my * 0.3 + ty * 0.9;
        const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
      }
      e.x += mx * sp * dt;
      e.y += my * sp * dt;
      if (collideWorld(e)) {
        if (e.blocked <= 0) { e.blocked = 0.5; if (Math.random() < 0.3) e.side *= -1; }
        if (e.mode === "charge") { e.mode = "walk"; e.aiT = rand(1.5, 2.5); shake = Math.max(shake, 4); }
      }

      // Kontaktschaden
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (p.r + e.r - 2) ** 2) hurtPlayer(e.dmg);
    }

    // Gegenseitiges Wegschieben
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (min - d) / 2;
          const wa = a.def.boss ? 0.1 : 1, wb = b.def.boss ? 0.1 : 1;
          a.x -= (dx / d) * push * wa; a.y -= (dy / d) * push * wa;
          b.x += (dx / d) * push * wb; b.y += (dy / d) * push * wb;
        }
      }
    }

    enemies = enemies.filter((e) => !e.dead);
    if (!run.cleared && !supplyCrate && enemies.length === 0) roomCleared();
  }

  function roomCleared() {
    run.cleared = true;
    sfx("door");
    addText(W / 2, T + 40, "TÜR OFFEN ↑", "#8cff4a", 22);
    if (BOSS_ROOMS[run.room]) {
      healPlayer(player.maxHp * 0.2);
      // Bewertung im positivsten Moment anfragen: nach dem ersten Boss-Sieg
      if (!save.reviewAsked) { save.reviewAsked = true; persist(); setTimeout(() => Platform.requestReview(), 1500); }
    }
    if (!save.tutorialDone) { save.tutorialDone = true; persist(); }
  }

  // ============================================================
  // Orbs (XP & Münzen)
  // ============================================================
  function updateOrbs(dt) {
    const p = player;
    for (const o of orbs) {
      o.t += dt;
      const dx = p.x - o.x, dy = p.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if ((run.cleared && o.t > 0.4) || d < 80) {
        const s = 700 + o.t * 300;
        o.vx = (dx / d) * s; o.vy = (dy / d) * s;
      } else {
        o.vx *= 1 - 4 * dt; o.vy *= 1 - 4 * dt;
      }
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.x = clamp(o.x, L + 4, R - 4); o.y = clamp(o.y, T + 4, B - 4);
      if (d < p.r + 6) {
        o.dead = true;
        if (o.type === "xp") addXp(o.val);
        else { run.coins += o.val * run.greed; sfx("coin"); }
      }
    }
    orbs = orbs.filter((o) => !o.dead);
  }

  function addXp(v) {
    const p = player;
    p.xp += v;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level++;
      p.xpNeed = Math.round(12 + p.level * 6 + p.level * p.level * 0.6);
      run.pendingPicks++;
    }
  }

  // ============================================================
  // Skill-Auswahl
  // ============================================================
  function rollSkills(n) {
    const p = player;
    const avail = SKILLS.filter((s) => (p.skills[s.id] || 0) < s.max && (!s.cond || s.cond(p)));
    const out = [];
    while (out.length < n && avail.length) {
      const total = avail.reduce((a, s) => a + RARITY_WEIGHT[s.rarity], 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < avail.length; idx++) { r -= RARITY_WEIGHT[avail[idx].rarity]; if (r <= 0) break; }
      out.push(avail.splice(Math.min(idx, avail.length - 1), 1)[0]);
    }
    return out;
  }

  function takeSkill(s) {
    player.skills[s.id] = (player.skills[s.id] || 0) + 1;
    s.apply(player);
  }

  let rerollHandler = null;
  function renderCards(title, cards, onReroll = null) {
    rerollHandler = onReroll;
    $("rerollBtn").classList.toggle("hidden", !(onReroll && Platform.ads.available));
    $("skillTitle").textContent = title;
    const box = $("skillCards");
    box.innerHTML = "";
    for (const c of cards) {
      const btn = document.createElement("button");
      btn.className = `card ${c.rarity || ""}`;
      const lvl = c.id && player.skills[c.id] ? ` <small>(Stufe ${player.skills[c.id] + 1})</small>` : "";
      btn.innerHTML = `<div class="ico">${c.icon}</div><div><div class="name">${c.name}${lvl}</div><div class="desc">${c.desc}</div></div>`;
      btn.addEventListener("click", () => c.onPick(), { once: true });
      box.appendChild(btn);
    }
    joy.active = false;
    state = "pick";
    show(ui.skillPick);
  }

  function openSkillPick(rerolled = false) {
    if (!rerolled) { run.pendingPicks--; sfx("level"); }
    const choices = rollSkills(3);
    if (!choices.length) { resumePlay(); return; }
    renderCards("LEVEL UP!", choices.map((s) => ({
      ...s, onPick: () => { takeSkill(s); resumePlay(); },
    })), rerolled ? null : () => openSkillPick(true));
  }

  function openSupply() {
    sfx("level");
    renderCards("VERSORGUNGSKISTE", [
      { icon: "🩹", name: "Erste Hilfe", desc: "Heilt 50% deiner max. HP", rarity: "", onPick: () => { healPlayer(player.maxHp * 0.5); afterSupply(); } },
      { icon: "🎁", name: "Waffenkiste", desc: "Wähle einen zusätzlichen Skill", rarity: "epic", onPick: () => { run.pendingPicks++; afterSupply(); } },
    ]);
  }
  function afterSupply() {
    supplyCrate = null;
    run.cleared = true;
    addText(W / 2, T + 40, "TÜR OFFEN ↑", "#8cff4a", 22);
    resumePlay();
  }

  function resumePlay() {
    if (run.pendingPicks > 0) { openSkillPick(); return; }
    state = "play";
    show(null);
  }

  // ============================================================
  // Effekte
  // ============================================================
  function spark(x, y, color) {
    return { x, y, vx: rand(-20, 20), vy: rand(-60, -20), life: 0.5, max: 0.5, color, size: rand(2, 4) };
  }
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, color, size: rand(2, 5) });
    }
  }
  function addText(x, y, txt, color, size) {
    texts.push({ x, y, txt: String(txt), color, size, life: 0.8, max: 0.8 });
  }
  function showBanner(title, sub, dur = 2) {
    banner = { title, sub, life: dur, max: dur };
  }
  function updateFx(dt) {
    for (const p of particles) {
      p.life -= dt;
      if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; }
    }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 600) particles.splice(0, particles.length - 600);
    for (const t of texts) { t.life -= dt; t.y -= 40 * dt; }
    texts = texts.filter((t) => t.life > 0);
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
    shake = Math.max(0, shake - dt * 30);
  }

  // ============================================================
  // Spielablauf
  // ============================================================
  function update(dt) {
    run.time += dt;
    updatePlayer(dt);
    if (state !== "play") return;
    updateEnemies(dt);
    updateBullets(dt);
    updateOrbs(dt);
    if (supplyCrate) supplyCrate.bob += dt;
    if (state === "play" && run.pendingPicks > 0) openSkillPick();
  }

  function togglePause() {
    if (state === "play") {
      state = "pause";
      joy.active = false;
      const chips = $("pauseSkills");
      chips.innerHTML = "";
      for (const s of SKILLS) {
        const n = player.skills[s.id];
        if (!n) continue;
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = `${s.icon} ${s.name}${n > 1 ? ` ×${n}` : ""}`;
        chips.appendChild(c);
      }
      if (!chips.children.length) chips.innerHTML = '<span class="chip">Noch keine Skills</span>';
      show(ui.pause);
    } else if (state === "pause") {
      ensureAudio();
      state = "play";
      show(null);
    }
  }

  function gameOver(quit) {
    state = "over";
    joy.active = false;
    clearInterval(reviveTimer);
    const coins = Math.round(run.coins);
    run.earned = coins;
    save.coins += coins;
    save.runs++;
    const score = run.chapter * 100 + run.room;
    if (score > save.best.chapter * 100 + save.best.room) save.best = { chapter: run.chapter, room: run.room };
    persist();
    $("overTitle").textContent = quit ? "RUN BEENDET" : "GEFALLEN";
    $("overStats").innerHTML = `
      <span>Erreicht</span><b>Kap. ${run.chapter} · Raum ${run.room}</b>
      <span>Kills</span><b>${run.kills}</b>
      <span>Level</span><b>${player.level}</b>
      <span>Zeit</span><b>${Math.floor(run.time / 60)}:${String(Math.floor(run.time % 60)).padStart(2, "0")}</b>
      <span>Münzen</span><b>+${coins} 💰</b>`;
    const dbl = $("doubleBtn");
    dbl.classList.toggle("hidden", !(Platform.ads.available && coins > 0));
    dbl.disabled = false;
    dbl.textContent = "▶ Münzen ×2 (Video)";
    setTimeout(() => show(ui.over), quit ? 0 : 600);
  }

  // ============================================================
  // Rendering
  // ============================================================
  function draw() {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.fillStyle = "#0d1210";
    ctx.fillRect(0, 0, W, H);
    if (!run) { drawMenuBg(); return; }

    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawWalls();
    if (floorCanvas) ctx.drawImage(floorCanvas, 0, 0);
    drawDoor();
    for (const o of obstacles) drawObstacle(o);
    if (supplyCrate) drawSupply();
    for (const o of orbs) drawOrb(o);
    for (const e of enemies) drawEnemy(e);
    drawPlayer();
    for (const b of bullets) drawBullet(b);
    for (const b of eBullets) drawEnemyBullet(b);
    drawParticles();
    drawTexts();
    ctx.restore();

    drawHud();
    if (state === "play" && joy.active) drawJoystick();
    if (banner) drawBanner();
    if (!save.tutorialDone && run.room === 1 && (state === "play" || state === "pick")) drawTutorial();
  }

  function drawTutorial() {
    const t = performance.now() / 1000;
    const moving = player.moving;
    ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(W / 2 - 200, (T + B) / 2 + 40, 400, 64, 14);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#8cff4a";
    ctx.font = "900 20px system-ui";
    ctx.fillText(moving ? "Loslassen = automatisch schießen!" : "👆 Finger ziehen = laufen & ausweichen", W / 2, (T + B) / 2 + 69);
    ctx.fillStyle = "#e8efe9";
    ctx.font = "600 14px system-ui";
    ctx.fillText(moving ? "Du schießt nur, wenn du stehst." : "Stehenbleiben = auf den nächsten Zombie feuern", W / 2, (T + B) / 2 + 91);
    ctx.globalAlpha = 1;
    if (!moving) {
      const cx = L + 90, cy = B - 90;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(140,255,74,0.7)";
      ctx.beginPath(); ctx.arc(cx + Math.sin(t * 2.5) * 30, cy + Math.cos(t * 2.5) * 30, 20, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMenuBg() {
    const t = performance.now() / 1000;
    for (let i = 0; i < 14; i++) {
      const x = (i * 97 + t * 20 * (i % 3 + 1)) % (W + 40) - 20;
      const y = 200 + ((i * 173) % 700);
      ctx.fillStyle = "rgba(140,255,74,0.05)";
      ctx.beginPath(); ctx.arc(x, y, 30 + (i % 4) * 12, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawWalls() {
    ctx.fillStyle = "#1a1f1c";
    ctx.fillRect(0, T - 20, W, H - T + 20);
    ctx.fillStyle = "#262d29";
    ctx.fillRect(L - 10, T - 16, ARENA.w + 20, ARENA.h + 26);
    ctx.strokeStyle = "#323b35";
    ctx.lineWidth = 2;
    ctx.strokeRect(L - 1, T - 1, ARENA.w + 2, ARENA.h + 2);
  }

  function drawDoor() {
    const x = W / 2 - DOOR_W / 2, y = T - 16;
    const open = run.cleared;
    ctx.fillStyle = open ? "#0b0f0c" : "#4a3b2a";
    ctx.fillRect(x, y, DOOR_W, 18);
    if (open) {
      const g = ctx.createLinearGradient(0, y, 0, y + 90);
      g.addColorStop(0, "rgba(140,255,74,0.45)");
      g.addColorStop(1, "rgba(140,255,74,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y + 16, DOOR_W, 90);
      ctx.fillStyle = "#8cff4a";
      ctx.font = "bold 22px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("▲", W / 2, y + 40 + Math.sin(performance.now() / 200) * 4);
    } else {
      ctx.strokeStyle = "#8a6d45";
      ctx.lineWidth = 3;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + (i * DOOR_W) / 4, y); ctx.lineTo(x + (i * DOOR_W) / 4, y + 18); ctx.stroke(); }
    }
  }

  function drawObstacle(o) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(o.x + 5, o.y + 7, o.w, o.h);
    if (o.kind === "crate") {
      ctx.fillStyle = "#7a5a34"; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#4e3820"; ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
      ctx.beginPath(); ctx.moveTo(o.x + 3, o.y + 3); ctx.lineTo(o.x + o.w - 3, o.y + o.h - 3);
      ctx.moveTo(o.x + o.w - 3, o.y + 3); ctx.lineTo(o.x + 3, o.y + o.h - 3); ctx.stroke();
    } else if (o.kind === "barrels") {
      for (const [cx, cy] of [[0.28, 0.28], [0.72, 0.3], [0.5, 0.72]]) {
        ctx.fillStyle = "#3d6b2a";
        ctx.beginPath(); ctx.arc(o.x + o.w * cx, o.y + o.h * cy, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#b7ff4a";
        ctx.font = "12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("☣", o.x + o.w * cx, o.y + o.h * cy + 1);
      }
      ctx.textBaseline = "alphabetic";
    } else {
      ctx.fillStyle = "#4b5560"; roundRect(o.x, o.y, o.w, o.h, 10); ctx.fill();
      ctx.fillStyle = "#2d343b";
      if (o.vert) { roundRect(o.x + 6, o.y + o.h * 0.25, o.w - 12, o.h * 0.45, 6); }
      else { roundRect(o.x + o.w * 0.25, o.y + 6, o.w * 0.45, o.h - 12, 6); }
      ctx.fill();
      ctx.fillStyle = "rgba(255,90,40,0.25)";
      ctx.beginPath(); ctx.arc(o.x + o.w * 0.3, o.y + o.h * 0.4, 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawSupply() {
    const s = supplyCrate;
    const y = s.y + Math.sin(s.bob * 3) * 3;
    ctx.fillStyle = "rgba(140,255,74,0.15)";
    ctx.beginPath(); ctx.arc(s.x, s.y, 46 + Math.sin(s.bob * 4) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b5f8a"; roundRect(s.x - 24, y - 20, 48, 40, 6); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(s.x - 4, y - 14, 8, 28); ctx.fillRect(s.x - 14, y - 4, 28, 8);
  }

  function drawOrb(o) {
    if (o.type === "coin") {
      ctx.fillStyle = "#ffc94a";
      ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff3c4"; ctx.fillRect(o.x - 1, o.y - 3, 2, 6);
    } else {
      ctx.fillStyle = "rgba(90,200,255,0.3)";
      ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7fe7ff";
      ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawEnemy(e) {
    const def = e.def;
    if (e.spawnT > 0) {
      const k = 1 - e.spawnT / (def.boss ? 1.2 : 0.8);
      ctx.strokeStyle = `rgba(140,255,74,${0.6 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(60,40,30,0.6)";
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.3, e.r * k, e.r * 0.5 * k, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    const bob = Math.sin(e.wob) * (def.boss ? 2 : 1.5);
    // Schatten
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.75, e.r, e.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    // Telegraph vor Sturmangriff
    if (e.mode === "wind") {
      ctx.strokeStyle = "rgba(255,60,60,0.55)";
      ctx.lineWidth = e.r * 1.6;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirX * 260, e.y + e.dirY * 260); ctx.stroke();
    }
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    // Arme
    ctx.strokeStyle = def.skin;
    ctx.lineWidth = Math.max(4, e.r * 0.32);
    ctx.lineCap = "round";
    const armLen = e.r * 1.15;
    for (const s of [-1, 1]) {
      const sa = a + s * 0.45;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + s * 1.3) * e.r * 0.7, Math.sin(a + s * 1.3) * e.r * 0.7);
      ctx.lineTo(Math.cos(sa) * (armLen + Math.sin(e.wob + s) * 3), Math.sin(sa) * (armLen + Math.sin(e.wob + s) * 3));
      ctx.stroke();
    }
    // Körper
    ctx.fillStyle = e.hitT > 0 ? "#ffffff" : def.color;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.hitT > 0 ? "#ffffff" : def.skin;
    ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.25, Math.sin(a) * e.r * 0.25, e.r * 0.62, 0, Math.PI * 2); ctx.fill();
    // Augen
    ctx.fillStyle = e.type === "spitter" || e.type === "mother" ? "#eaff00" : "#ff2b2b";
    const er = Math.max(2, e.r * 0.13);
    for (const s of [-1, 1]) {
      const ea = a + s * 0.5;
      ctx.beginPath(); ctx.arc(Math.cos(ea) * e.r * 0.55, Math.sin(ea) * e.r * 0.55, er, 0, Math.PI * 2); ctx.fill();
    }
    if (e.type === "bomber") {
      ctx.fillStyle = Math.sin(e.wob * 2) > 0 ? "#ff3b1f" : "#ffd84a";
      ctx.beginPath(); ctx.arc(0, -e.r * 0.2, e.r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    if (e.burnT > 0) { ctx.fillStyle = "rgba(255,120,30,0.3)"; ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, Math.PI * 2); ctx.fill(); }
    if (e.slowT > 0) { ctx.strokeStyle = "rgba(140,220,255,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 2, 0, Math.PI * 2); ctx.stroke(); }
    if (e.poisonDps > 0) { ctx.fillStyle = "rgba(140,255,74,0.22)"; ctx.beginPath(); ctx.arc(0, 0, e.r + 1, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // HP-Balken (nur für Nicht-Bosse und wenn beschädigt)
    if (!def.boss && e.hp < e.maxHp) {
      const w = e.r * 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
      ctx.fillStyle = "#e5383b"; ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0 && state === "play") return;
    // Sägeblätter
    for (let i = 0; i < p.orbit; i++) {
      const a = p.orbitAng + (i / p.orbit) * Math.PI * 2;
      const bx = p.x + Math.cos(a) * 64, by = p.y + Math.sin(a) * 64;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(p.orbitAng * 4);
      ctx.fillStyle = "#c9d1d9";
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const r = k % 2 ? 6 : 11; ctx.lineTo(Math.cos((k / 8) * Math.PI * 2) * r, Math.sin((k / 8) * Math.PI * 2) * r); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 13, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y + (p.moving ? Math.sin(p.walkT) * 1.5 : 0));
    ctx.rotate(p.aim);
    // Waffe
    const w = p.weapon;
    const len = w === WEAPONS.sniper ? 34 : w === WEAPONS.pistol ? 20 : 27;
    ctx.fillStyle = "#2b2f33";
    ctx.fillRect(6, -4, len, 8);
    if (w.kind === "flame") { ctx.fillStyle = "#c0392b"; ctx.fillRect(2, 5, 12, 7); }
    if (p.muzzle > 0) {
      ctx.fillStyle = w.kind === "flame" ? "#ff8a2e" : "#fff2a8";
      ctx.beginPath(); ctx.arc(len + 9, 0, 7, 0, Math.PI * 2); ctx.fill();
    }
    // Körper
    ctx.fillStyle = "#2f6fb5";
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#24476f";
    ctx.fillRect(-12, -16, 10, 32);
    // Kopf mit Helm
    ctx.fillStyle = "#f1c9a5";
    ctx.beginPath(); ctx.arc(3, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3c4a2e";
    ctx.beginPath(); ctx.arc(1, 0, 9, Math.PI * 0.6, Math.PI * 1.4); ctx.fill();
    ctx.restore();
    // Drohnen
    for (let i = 0; i < p.drones; i++) {
      const d = dronePos(i);
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(d.x, d.y + 22, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7fe7ff"; ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#cfefff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.x - 12, d.y - 6); ctx.lineTo(d.x + 12, d.y - 6); ctx.stroke();
    }
    // HP über dem Kopf (wie im Genre üblich)
    const bw = 54;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(p.x - bw / 2, p.y - 36, bw, 7);
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? "#4ad66d" : "#e5383b";
    ctx.fillRect(p.x - bw / 2, p.y - 36, bw * Math.max(0, p.hp / p.maxHp), 7);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(Math.ceil(p.hp), p.x, p.y - 40);
  }

  function drawBullet(b) {
    if (b.kind === "flame") {
      const k = b.life / b.maxLife;
      ctx.fillStyle = `rgba(255,${Math.round(80 + 140 * k)},40,${0.25 + 0.5 * k})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.8 - k), 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (b.trail.length >= 2) {
      ctx.strokeStyle = b.color; ctx.globalAlpha = 0.35; ctx.lineWidth = b.r * 1.2;
      ctx.beginPath(); ctx.moveTo(b.trail[0], b.trail[1]); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  function drawEnemyBullet(b) {
    ctx.fillStyle = b.color; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      const k = Math.max(0, p.life / p.max);
      if (p.ring) {
        ctx.strokeStyle = `${p.color}${k})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.1 - k * 0.5), 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.textAlign = "center";
    for (const t of texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      ctx.font = `900 ${t.size}px system-ui`;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const p = player;
    // XP-Leiste
    ctx.fillStyle = "#0d1210"; ctx.fillRect(0, 0, W, 100);
    ctx.fillStyle = "#1f2a23"; roundRect(70, 22, W - 150, 16, 8); ctx.fill();
    ctx.fillStyle = "#7fe7ff"; roundRect(70, 22, Math.max(16, (W - 150) * (p.xp / p.xpNeed)), 16, 8); ctx.fill();
    ctx.fillStyle = "#2f6fb5"; ctx.beginPath(); ctx.arc(46, 30, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "900 18px system-ui"; ctx.textAlign = "center"; ctx.fillText(p.level, 46, 37);
    ctx.font = "700 10px system-ui"; ctx.fillText("LV", 46, 18);
    // Raum & Münzen
    ctx.textAlign = "left"; ctx.fillStyle = "#8fa396"; ctx.font = "700 15px system-ui";
    ctx.fillText(`Kapitel ${run.chapter} · Raum ${run.room}/${ROOMS_PER_CHAPTER}`, 72, 64);
    ctx.textAlign = "right"; ctx.fillStyle = "#ffc94a";
    ctx.fillText(`💰 ${Math.floor(run.coins)}`, W - 70, 64);
    ctx.textAlign = "left"; ctx.fillStyle = "#e8efe9"; ctx.font = "600 13px system-ui";
    ctx.fillText(`${p.weapon.icon} ${p.weapon.name}`, 72, 86);
    ctx.textAlign = "right"; ctx.fillStyle = "#8fa396";
    ctx.fillText(`☠ ${run.kills}`, W - 70, 86);
    // Boss-Leiste
    const boss = enemies.find((e) => e.def.boss && e.spawnT <= 0);
    if (boss) {
      const bw = W - 80;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; roundRect(40, T + 10, bw, 18, 9); ctx.fill();
      ctx.fillStyle = "#c0392b"; roundRect(40, T + 10, Math.max(18, bw * (boss.hp / boss.maxHp)), 18, 9); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "900 12px system-ui"; ctx.textAlign = "center";
      ctx.fillText(boss.def.name, W / 2, T + 23);
    }
  }

  function drawJoystick() {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 70, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const len = Math.min(70, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    ctx.fillStyle = "rgba(140,255,74,0.55)";
    ctx.beginPath(); ctx.arc(joy.ox + Math.cos(a) * len, joy.oy + Math.sin(a) * len, 28, 0, Math.PI * 2); ctx.fill();
  }

  function drawBanner() {
    const k = banner.life / banner.max;
    const alpha = Math.min(1, k * 4, (1 - k) * 8 + 0.2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H * 0.36, W, 96);
    ctx.textAlign = "center";
    ctx.fillStyle = "#8cff4a"; ctx.font = "900 34px system-ui";
    ctx.fillText(banner.title, W / 2, H * 0.36 + 48);
    ctx.fillStyle = "#e8efe9"; ctx.font = "600 16px system-ui";
    ctx.fillText(banner.sub, W / 2, H * 0.36 + 76);
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // Hauptschleife
  // ============================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === "play") update(dt);
    if (run) updateFx(state === "play" ? dt : dt * 0.15);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ============================================================
  // Menüs
  // ============================================================
  function refreshMenu() {
    $("menuCoins").textContent = save.coins;
    $("menuBest").textContent = save.best.chapter ? `Kapitel ${save.best.chapter} · Raum ${save.best.room}` : "–";
    const w = WEAPONS[save.equipped];
    $("menuEquipped").textContent = `Ausgerüstet: ${w.icon} ${w.name} (Stufe ${save.weapons[save.equipped]})`;
    for (const el of document.querySelectorAll(".coinsVal")) el.textContent = save.coins;
  }

  function renderArmory() {
    const list = $("weaponList");
    list.innerHTML = "";
    for (const [id, w] of Object.entries(WEAPONS)) {
      const lvl = save.weapons[id];
      const row = document.createElement("div");
      row.className = `item${save.equipped === id ? " active" : ""}`;
      const dps = Math.round(w.dmg * w.pellets * w.rate * weaponLvlMult(lvl || 1));
      row.innerHTML = `<div class="ico">${w.icon}</div>
        <div><div class="name">${w.name}${lvl ? ` · Stufe ${lvl}` : ""}</div><div class="desc">${w.desc} · DPS ~${dps}</div></div>
        <div class="acts"></div>`;
      const acts = row.querySelector(".acts");
      if (!lvl) {
        acts.appendChild(actionBtn(`Kaufen ${w.price}💰`, save.coins >= w.price, () => { save.coins -= w.price; save.weapons[id] = 1; save.equipped = id; }));
      } else {
        if (save.equipped !== id) acts.appendChild(actionBtn("Ausrüsten", true, () => { save.equipped = id; }));
        if (lvl < WEAPON_MAX_LVL) {
          const c = weaponUpgradeCost(lvl);
          acts.appendChild(actionBtn(`▲ ${c}💰`, save.coins >= c, () => { save.coins -= c; save.weapons[id]++; }));
        } else acts.appendChild(actionBtn("MAX", false, () => {}));
      }
      list.appendChild(row);
    }
    refreshMenu();
  }

  function renderTalents() {
    const list = $("talentList");
    list.innerHTML = "";
    for (const [id, t] of Object.entries(TALENTS)) {
      const lvl = save.talents[id];
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `<div class="ico">${t.icon}</div>
        <div><div class="name">${t.name} · ${lvl}/${t.max}</div><div class="desc">${t.desc}</div></div>
        <div class="acts"></div>`;
      const c = talentCost(lvl);
      row.querySelector(".acts").appendChild(lvl < t.max
        ? actionBtn(`▲ ${c}💰`, save.coins >= c, () => { save.coins -= c; save.talents[id]++; })
        : actionBtn("MAX", false, () => {}));
      list.appendChild(row);
    }
    refreshMenu();
  }

  function actionBtn(label, enabled, fn) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = label;
    b.disabled = !enabled;
    b.addEventListener("click", () => {
      fn();
      persist();
      sfx("coin");
      if (!ui.armory.classList.contains("hidden")) renderArmory(); else renderTalents();
    });
    return b;
  }

  // ============================================================
  // Shop, tägliche Belohnung, Einstellungen (Monetarisierung)
  // ============================================================
  const IDS = Platform.cfg.iap || {};
  const COIN_PACKS = { [IDS.coinsSmall]: 1200, [IDS.coinsBig]: 7000 };
  const SHOP_ITEMS = [
    { id: IDS.starter, icon: "🎒", name: "Starterpaket", desc: "Werbefrei + 3.000 Münzen + Armbrust", tag: "BESTER DEAL", owned: () => save.starterOwned },
    { id: IDS.noAds, icon: "🚫", name: "Werbefrei", desc: "Keine Zwangswerbung mehr. Bonus-Videos bleiben freiwillig.", owned: () => save.noAds },
    { id: IDS.coinsSmall, icon: "💰", name: "Münzbeutel", desc: "1.200 Münzen" },
    { id: IDS.coinsBig, icon: "🏆", name: "Münztruhe", desc: "7.000 Münzen", tag: "+45% MEHR" },
  ];
  const DAILY = [100, 150, 200, 300, 400, 500, 1000];
  const FREE_COINS_PER_DAY = 5;

  function localDay(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  // Lieferung von Käufen (wird von der Plattform-Schicht aufgerufen)
  Platform.iap.onDeliver((id, txId) => {
    if (txId && save.txns.includes(txId)) return;
    const restore = !txId || txId.startsWith("restore:");
    let changed = false;
    if (id === IDS.noAds) {
      changed = !save.noAds;
      save.noAds = true;
    } else if (id === IDS.starter) {
      changed = !save.starterOwned;
      save.noAds = true;
      if (!save.starterOwned) {
        save.starterOwned = true;
        save.coins += 3000;
        if (!save.weapons.crossbow) save.weapons.crossbow = 1;
      }
    } else if (COIN_PACKS[id] && !restore) {
      save.coins += COIN_PACKS[id];
      changed = true;
    }
    if (!restore) { save.txns.push(txId); if (save.txns.length > 200) save.txns.shift(); }
    persist();
    if (changed) { sfx("level"); toast(restore ? "Kauf wiederhergestellt" : "Kauf erfolgreich – danke! ❤️"); }
    refreshMenu();
    if (!ui.shop.classList.contains("hidden")) renderShop();
  });
  Platform.on("iap", () => { if (!ui.shop.classList.contains("hidden")) renderShop(); });

  function freeCoinsLeft() {
    if (save.freeCoins.day !== localDay()) return FREE_COINS_PER_DAY;
    return Math.max(0, FREE_COINS_PER_DAY - save.freeCoins.n);
  }
  const freeCoinAmount = () => 150 + 50 * save.best.chapter;

  function renderShop() {
    const list = $("shopList");
    list.innerHTML = "";
    if (Platform.ads.available) {
      const left = freeCoinsLeft();
      list.appendChild(shopRow("🎬", "Gratis-Münzen", `Kurzes Video ansehen: +${freeCoinAmount()} Münzen (${left}/${FREE_COINS_PER_DAY} heute)`, "", left > 0 ? "▶ Gratis" : "Morgen wieder", left > 0, async (btn) => {
        btn.disabled = true;
        const ok = await Platform.ads.showRewarded("free_coins");
        if (ok) {
          if (save.freeCoins.day !== localDay()) save.freeCoins = { day: localDay(), n: 0 };
          save.freeCoins.n++;
          save.coins += freeCoinAmount();
          persist();
          sfx("coin");
          toast(`+${freeCoinAmount()} 💰`);
        } else toast("Kein Video verfügbar");
        renderShop();
      }, "ad"));
    }
    const iapReady = Platform.iap.available;
    for (const it of SHOP_ITEMS) {
      if (it.owned && it.owned()) {
        list.appendChild(shopRow(it.icon, it.name, it.desc, it.tag, "✓ Gekauft", false, null));
        continue;
      }
      const prod = iapReady ? Platform.iap.product(it.id) : null;
      const label = prod && prod.price ? prod.price : iapReady ? "…" : "In der App";
      list.appendChild(shopRow(it.icon, it.name, it.desc, it.tag, label, !!(prod && prod.canPurchase), async (btn) => {
        btn.disabled = true;
        const ok = await Platform.iap.buy(it.id);
        if (!ok) toast("Kauf abgebrochen");
        btn.disabled = false;
      }));
    }
    $("shopNote").textContent = Platform.isNative
      ? (iapReady ? "Zahlung sicher über Google Play." : "Verbinde mit Google Play …")
      : "Käufe sind in der Android-App verfügbar.";
    $("restoreBtn").classList.toggle("hidden", !Platform.isNative);
    refreshMenu();
  }

  function shopRow(icon, name, desc, tag, label, enabled, onClick, cls = "") {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div class="ico">${icon}</div>
      <div>${tag ? `<div class="tag">${tag}</div>` : ""}<div class="name">${name}</div><div class="desc">${desc}</div></div>
      <div class="acts"></div>`;
    const b = document.createElement("button");
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.disabled = !enabled;
    if (onClick) b.addEventListener("click", () => onClick(b));
    row.querySelector(".acts").appendChild(b);
    return row;
  }

  function dailyState() {
    const claimedToday = save.daily.last === localDay();
    const continues = claimedToday || save.daily.last === localDay(-1);
    const streak = continues ? save.daily.streak : 0;
    const idx = claimedToday ? (streak - 1) % 7 : streak % 7;
    return { claimedToday, streak, idx };
  }

  function renderDaily() {
    const st = dailyState();
    const grid = $("dailyGrid");
    grid.innerHTML = "";
    DAILY.forEach((amount, i) => {
      const d = document.createElement("div");
      const done = i < st.idx || (st.claimedToday && i === st.idx);
      d.className = `day${i === 6 ? " big" : ""}${done ? " done" : ""}${i === st.idx && !st.claimedToday ? " today" : ""}`;
      d.innerHTML = `Tag ${i + 1}<b>${done ? "✓" : amount}</b>`;
      grid.appendChild(d);
    });
    $("dailyClaim").disabled = st.claimedToday;
    $("dailyClaim").textContent = st.claimedToday ? "Morgen wieder" : `Abholen (+${DAILY[st.idx]})`;
    $("dailyClaimAd").classList.toggle("hidden", st.claimedToday || !Platform.ads.available);
    $("dailyClaimAd").disabled = false;
  }

  function claimDaily(mult) {
    const st = dailyState();
    if (st.claimedToday) return;
    const amount = DAILY[st.idx] * mult;
    save.coins += amount;
    save.daily = { last: localDay(), streak: st.streak + 1 };
    persist();
    sfx("level");
    toast(`+${amount} 💰`);
    renderDaily();
    refreshMenu();
  }

  function openDaily() { renderDaily(); show(ui.daily); }

  function renderSettings() {
    $("soundBtn2").textContent = `Sound: ${save.sound ? "an" : "aus"}`;
    $("vibBtn").textContent = `Vibration: ${save.vibration ? "an" : "aus"}`;
    $("privacyOptsBtn").classList.toggle("hidden", !Platform.isNative);
    $("privacyLink").href = Platform.cfg.privacyUrl || "privacy.html";
    $("versionLine").textContent = `Outbreak Hero v${Platform.cfg.version || "1.0.0"}${Platform.isNative ? " · Android" : " · Web"}`;
  }

  // Vollbild-Werbung nur an natürlichen Pausen, nie für Käufer von "Werbefrei"
  function shouldInterstitial() {
    const n = Platform.cfg.interstitialEvery || 3;
    return Platform.ads.available && !save.noAds && run && !run.adWatched && save.runs >= n && save.runs % n === 0;
  }
  let leaving = false;
  async function leaveOver(next) {
    if (leaving) return;
    leaving = true;
    if (shouldInterstitial()) await Platform.ads.showInterstitial();
    leaving = false;
    next();
  }

  let dailyShown = false;
  function toMenu() {
    state = "menu";
    run = null;
    refreshMenu();
    const st = dailyState();
    $("dailyBadge").classList.toggle("hidden", st.claimedToday);
    const cta = $("storeCta");
    cta.classList.toggle("hidden", Platform.isNative || !Platform.cfg.playStoreUrl);
    if (Platform.cfg.playStoreUrl) cta.href = Platform.cfg.playStoreUrl;
    if (!dailyShown && !st.claimedToday) { dailyShown = true; openDaily(); return; }
    show(ui.menu);
  }

  $("playBtn").addEventListener("click", startRun);
  $("againBtn").addEventListener("click", () => leaveOver(startRun));
  $("menuBtn").addEventListener("click", () => leaveOver(toMenu));
  $("armoryBtn").addEventListener("click", () => { ensureAudio(); renderArmory(); show(ui.armory); });
  $("talentBtn").addEventListener("click", () => { ensureAudio(); renderTalents(); show(ui.talents); });
  $("shopBtn").addEventListener("click", () => { ensureAudio(); renderShop(); show(ui.shop); });
  $("dailyBtn").addEventListener("click", () => { ensureAudio(); openDaily(); });
  $("settingsBtn").addEventListener("click", () => { renderSettings(); show(ui.settings); });
  for (const b of document.querySelectorAll("[data-back]")) b.addEventListener("click", toMenu);
  $("dailyClaim").addEventListener("click", () => claimDaily(1));
  $("dailyClaimAd").addEventListener("click", async () => {
    const b = $("dailyClaimAd");
    b.disabled = true;
    const ok = await Platform.ads.showRewarded("daily_x2");
    if (ok) claimDaily(2); else { toast("Kein Video verfügbar"); b.disabled = false; }
  });
  $("restoreBtn").addEventListener("click", async () => { toast("Suche Käufe …"); await Platform.iap.restore(); renderShop(); });
  $("reviveAdBtn").addEventListener("click", reviveWithAd);
  $("reviveNoBtn").addEventListener("click", () => { if (state === "revive") gameOver(false); });
  $("rerollBtn").addEventListener("click", async () => {
    const fn = rerollHandler;
    if (!fn) return;
    rerollHandler = null;
    $("rerollBtn").classList.add("hidden");
    const ok = await Platform.ads.showRewarded("reroll");
    if (ok && state === "pick") { run.adWatched = true; fn(); } else if (!ok) toast("Kein Video verfügbar");
  });
  $("doubleBtn").addEventListener("click", async () => {
    const b = $("doubleBtn");
    if (b.disabled || !run) return;
    b.disabled = true;
    const ok = await Platform.ads.showRewarded("double_coins");
    if (ok && run) {
      save.coins += run.earned;
      persist();
      run.adWatched = true;
      sfx("coin");
      b.textContent = `✓ +${run.earned} 💰 extra`;
    } else { b.disabled = false; toast("Kein Video verfügbar"); }
  });
  ui.pauseBtn.addEventListener("click", togglePause);
  $("resumeBtn").addEventListener("click", togglePause);
  $("quitBtn").addEventListener("click", () => gameOver(true));
  const soundBtn = $("soundBtn");
  const syncSound = () => { soundBtn.textContent = `Sound: ${save.sound ? "an" : "aus"}`; renderSettings(); };
  const toggleSound = () => { save.sound = !save.sound; persist(); syncSound(); };
  soundBtn.addEventListener("click", toggleSound);
  $("soundBtn2").addEventListener("click", toggleSound);
  $("vibBtn").addEventListener("click", () => { save.vibration = !save.vibration; persist(); renderSettings(); if (save.vibration) Platform.vibrate(40); });
  $("privacyOptsBtn").addEventListener("click", () => Platform.ads.showPrivacyOptions());
  syncSound();

  // Plattform-Ereignisse: Zurück-Taste, App im Hintergrund, Werbung läuft
  Platform.on("back", () => {
    if (Platform.ads.busy) return;
    if (state === "play" || state === "pause") togglePause();
    else if (state === "over") leaveOver(toMenu);
    else if (state === "menu") {
      if (ui.menu.classList.contains("hidden")) toMenu(); else Platform.exitApp();
    }
  });
  Platform.on("pause", () => {
    if (state === "play") togglePause();
    if (actx && actx.state === "running") actx.suspend();
  });
  Platform.on("adStart", () => { if (actx && actx.state === "running") actx.suspend(); });
  Platform.on("adEnd", () => { if (actx && save.sound) actx.resume(); });

  Platform.init();
  toMenu();
  console.log("[Outbreak] Spiel gestartet", Platform.cfg.version);

  if (!Platform.isNative && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline-Modus optional */ });
  }

  // Für automatisierte Tests
  window.__outbreak = { get state() { return state; }, get run() { return run; }, get player() { return player; }, get enemies() { return enemies; }, save, hurt: (d) => hurtPlayer(d) };
})();
