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
  // Jedes Kapitel spielt in einer anderen Umgebung (Straße → Krankenhaus → Labor → …)
  const THEME_ORDER = ["street", "hospital", "lab"];
  const OBSTACLE_POOL = {
    street: ["car", "car", "crate", "barrels", "barricade", "dumpster"],
    hospital: ["bed", "bed", "cabinet", "medcrate", "medcrate", "barrels"],
    lab: ["tank", "tank", "server", "labcrate", "barrels"],
  };
  const OBSTACLE_SIZE = { // [wMin, wMax, hMin, hMax]
    car: [96, 118, 48, 52], crate: [46, 68, 40, 60], medcrate: [46, 62, 40, 54], labcrate: [48, 66, 42, 58],
    barrels: [52, 52, 52, 52], barricade: [90, 130, 26, 30], dumpster: [70, 86, 42, 46],
    bed: [88, 96, 46, 50], cabinet: [44, 60, 32, 36], tank: [56, 60, 56, 60], server: [40, 48, 70, 88],
  };
  const ROTATABLE = { car: true, bed: true };
  const GLOWING = { barrels: "150,255,60", tank: "120,255,80" };
  const TAU = Math.PI * 2;

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
    gfx: 2, // Grafikqualität 0–2, wird automatisch an die Geräteleistung angepasst
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
  // flash/casing/kick/shake/tracer steuern nur die Optik (Mündungsfeuer, Hülsen, Rückstoß, Leuchtspur)
  const WEAPONS = {
    pistol: { name: "Pistole", icon: "🔫", desc: "Ausgewogen und präzise.", price: 0, dmg: 22, rate: 2.5, speed: 760, pellets: 1, spread: 0, jitter: 0.02, range: 900, pierce: 0, r: 4, color: "#ffe08a", flash: "std", casing: 1, kick: 2.5, shake: 0, tracer: "255,224,138" },
    shotgun: { name: "Schrotflinte", icon: "💥", desc: "5 Schrotkugeln, brutal auf kurze Distanz.", price: 250, dmg: 11, rate: 1.25, speed: 700, pellets: 5, spread: 0.5, jitter: 0.05, range: 380, pierce: 0, r: 3, color: "#ffb36b", flash: "big", casing: 2, kick: 6, shake: 3, tracer: "255,179,107", knock: 12 },
    smg: { name: "Maschinenpistole", icon: "⚡", desc: "Extrem hohe Feuerrate.", price: 350, dmg: 9, rate: 6.5, speed: 820, pellets: 1, spread: 0, jitter: 0.1, range: 800, pierce: 0, r: 3, color: "#9ee6ff", flash: "std", casing: 1, kick: 1.5, shake: 0, tracer: "158,230,255" },
    crossbow: { name: "Armbrust", icon: "🏹", desc: "Bolzen durchschlagen 2 Zombies.", price: 500, dmg: 36, rate: 1.4, speed: 940, pellets: 1, spread: 0, jitter: 0, range: 1000, pierce: 2, r: 5, color: "#c9ff9e", kind: "bolt", flash: "", casing: 0, kick: 2, shake: 0, tracer: "201,255,158" },
    flame: { name: "Flammenwerfer", icon: "🔥", desc: "Kurze Reichweite, setzt alles in Brand.", price: 800, dmg: 4.5, rate: 14, speed: 430, pellets: 1, spread: 0, jitter: 0.28, range: 240, pierce: 99, r: 9, color: "#ff7b2e", kind: "flame", burn: true, flash: "flame", casing: 0, kick: 0.5, shake: 0, tracer: "255,123,46" },
    sniper: { name: "Scharfschützengewehr", icon: "🎯", desc: "Riesiger Schaden, durchschlägt 4 Ziele, +20% Krit.", price: 1100, dmg: 85, rate: 0.75, speed: 1500, pellets: 1, spread: 0, jitter: 0, range: 1400, pierce: 4, r: 3, color: "#ffffff", crit: 0.2, flash: "big", casing: 1, kick: 7, shake: 4, tracer: "230,245,255", long: true, knock: 14 },
    grenade: { name: "Granatwerfer", icon: "💣", desc: "Explodiert und trifft ganze Horden.", price: 1400, dmg: 42, rate: 1.0, speed: 520, pellets: 1, spread: 0, jitter: 0, range: 520, pierce: 0, r: 7, color: "#b7ff4a", kind: "grenade", aoe: 75, flash: "big", casing: 0, kick: 5, shake: 2, tracer: "183,255,74" },
    tesla: { name: "Tesla-Gewehr", icon: "🌩️", desc: "Kettenblitz springt auf 3 weitere Zombies.", price: 2000, dmg: 22, rate: 1.7, speed: 0, pellets: 1, spread: 0, jitter: 0, range: 430, pierce: 0, r: 0, color: "#7fe7ff", kind: "tesla", chain: 3, flash: "tesla", casing: 0, kick: 1.5, shake: 1, tracer: "127,231,255" },
    minigun: { name: "Minigun", icon: "🌀", desc: "Läuft im Stand warm – dann ein Bleigewitter.", price: 2600, dmg: 8, rate: 13, speed: 900, pellets: 1, spread: 0, jitter: 0.11, range: 820, pierce: 0, r: 3, color: "#ffd36a", spin: true, flash: "big", casing: 1, kick: 1.2, shake: 0.6, tracer: "255,211,106" },
  };
  const WEAPON_MAX_LVL = 10;
  const weaponUpgradeCost = (lvl) => 80 * lvl;
  const weaponLvlMult = (lvl) => 1 + 0.2 * (lvl - 1);
  // Optische Stufe: ab Stufe 5 Goldbeschläge, auf Stufe 10 zusätzlich Edelstein
  const weaponTier = (lvl) => (lvl >= 10 ? 2 : lvl >= 5 ? 1 : 0);

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
  const tr = I18N.t;

  // ============================================================
  // Zombie-Typen
  // ============================================================
  const RED = "#6e0f12", GREEN = "#3f6e1a", PURPLE = "#5a0f2a";
  const ZOMBIES = {
    walker: { name: "Walker", r: 15, hp: 60, speed: 55, dmg: 14, xp: 2, coins: [0, 2], cost: 1, blood: RED },
    runner: { name: "Sprinter", r: 13, hp: 40, speed: 125, dmg: 10, xp: 2, coins: [0, 2], cost: 1.5, blood: RED },
    crawler: { name: "Kriecher", r: 9, hp: 18, speed: 140, dmg: 6, xp: 1, coins: [0, 1], cost: 0.6, pack: 3, blood: RED },
    spitter: { name: "Spucker", r: 15, hp: 50, speed: 60, dmg: 10, xp: 3, coins: [1, 2], cost: 2, ranged: true, blood: GREEN },
    bomber: { name: "Bomber", r: 15, hp: 45, speed: 95, dmg: 30, xp: 3, coins: [1, 3], cost: 2, blood: RED },
    dog: { name: "Zombie-Hund", r: 12, hp: 30, speed: 165, dmg: 9, xp: 2, coins: [0, 1], cost: 1.1, pack: 2, blood: RED },
    brute: { name: "Koloss", r: 25, hp: 280, speed: 45, dmg: 24, xp: 6, coins: [2, 5], cost: 4, blood: RED },
    armored: { name: "Riot-Zombie", r: 17, hp: 170, speed: 50, dmg: 18, xp: 5, coins: [1, 3], cost: 3, armor: 0.35, blood: RED },
    abom: { name: "ABSCHEULICHKEIT", r: 48, hp: 2200, speed: 60, dmg: 30, xp: 40, coins: [40, 60], boss: true, blood: PURPLE },
    mother: { name: "BRUTMUTTER", r: 52, hp: 2700, speed: 34, dmg: 28, xp: 50, coins: [50, 80], boss: true, blood: GREEN },
  };
  for (const [type, def] of Object.entries(ZOMBIES)) Sprites.registerRadius(type, def.r);

  I18N.localizeData({ weapons: WEAPONS, talents: TALENTS, skills: SKILLS, zombies: ZOMBIES });

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
  // Grafikqualität: 2 = hoch, 1 = mittel, 0 = niedrig (Auflösung & Partikelmenge)
  let quality = Math.max(0, Math.min(2, save.gfx ?? 2));
  const QUALITY_DPR = [1, 1.5, 2];
  const QUALITY_PARTICLES = [350, 600, 900];
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, QUALITY_DPR[quality]);
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    Sprites.setRes(scale * dpr);
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
    const minGap = { shoot: 0.05, hit: 0.03, kill: 0.04, zap: 0.08 }[type] || 0;
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
      zap: [["sawtooth", 1400, 300, 0.12, 0.05], ["square", 2200, 900, 0.08, 0.025]],
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
  let floorCtx = null;
  let corpses = [];
  let zaps = [];
  let ambient = [];
  let roomLights = [];
  let slowMo = 0;
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
      tier: weaponTier(wlvl), kick: 0, spin: 0, barrel: 0, hurtT: 0,
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
      showBanner(tr("KAPITEL {n} ÜBERLEBT", { n: run.chapter - 1 }), tr("+{b} 💰 · Die Seuche wird stärker…", { b: bonus }));
    }
    enemies = []; bullets = []; eBullets = []; orbs = []; particles = []; corpses = []; zaps = []; volleyQueue.length = 0;
    run.doorK = 0;
    supplyCrate = null;
    player.x = W / 2; player.y = B - 70; player.vx = player.vy = 0;
    player.invuln = 1;
    run.cleared = false;

    const isBoss = BOSS_ROOMS[run.room];
    const isSupply = SUPPLY_ROOMS.includes(run.room);
    obstacles = isSupply ? [] : genObstacles(isBoss ? randi(0, 2) : randi(2, 5));
    floorCanvas = makeFloor();
    roomLights = obstacles.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3 }));
    initAmbient();

    if (isSupply) {
      supplyCrate = { x: W / 2, y: (T + B) / 2, r: 26, bob: 0 };
      showBanner(tr("VERSORGUNGSRAUM"), tr("Öffne die Kiste"));
    } else if (isBoss) {
      spawnEnemy(isBoss, W / 2, T + 180);
      showBanner(tr("BOSS: {name}", { name: ZOMBIES[isBoss].name }), tr("Kapitel {c} · Raum {r}", { c: run.chapter, r: run.room }));
    } else {
      spawnWave();
      if (!banner) showBanner(tr("RAUM {r}", { r: run.room }), tr("Kapitel {c}", { c: run.chapter }), 1.2);
    }
  }

  const theme = () => THEME_ORDER[((run ? run.chapter : 1) - 1) % THEME_ORDER.length];

  function genObstacles(n) {
    const obs = [];
    const pool = OBSTACLE_POOL[theme()];
    let tries = 0;
    while (obs.length < n && tries++ < 200) {
      const kind = pick(pool);
      const [w0, w1, h0, h1] = OBSTACLE_SIZE[kind];
      let w = Math.round(rand(w0, w1)), h = Math.round(rand(h0, h1));
      const vert = ROTATABLE[kind] && Math.random() < 0.4;
      if (vert) [w, h] = [h, w];
      const o = { kind, w, h, vert, seed: randi(1, 1e9) };
      o.x = rand(L + 30, R - 30 - o.w);
      o.y = rand(T + 130, B - 220 - o.h);
      const m = 60;
      const blocked = obs.some((q) => o.x < q.x + q.w + m && o.x + o.w + m > q.x && o.y < q.y + q.h + m && o.y + o.h + m > q.y);
      if (!blocked) obs.push(o);
    }
    return obs;
  }

  function makeFloor() {
    const c = Sprites.floor(theme(), { W, H, L, T, R, B }, randi(1, 1e9));
    floorCtx = c.getContext("2d");
    const res = c.width / W;
    floorCtx.setTransform(res, 0, 0, res, 0, 0);
    return c;
  }

  // Dauerhafte Spuren auf dem Boden (Blut, Hülsen, Brandflecken …)
  function stamp(spr, x, y, ang = 0, sc = 1, alpha = 1) {
    if (!floorCtx) return;
    floorCtx.globalAlpha = alpha;
    Sprites.draw(floorCtx, spr, x, y, ang, sc);
    floorCtx.globalAlpha = 1;
  }
  function stampDot(x, y, r, color) {
    if (!floorCtx || x < L || x > R || y < T || y > B) return;
    floorCtx.globalAlpha = 0.85;
    floorCtx.fillStyle = color;
    floorCtx.beginPath(); floorCtx.arc(x, y, r, 0, TAU); floorCtx.fill();
    floorCtx.globalAlpha = 1;
  }
  function splatter(x, y, ang, size, color) {
    stamp(Sprites.splat(color, randi(0, 5)), x, y, ang, size, 0.85);
  }

  function spawnWave() {
    const ch = run.chapter, room = run.room;
    let budget = 4 + room * 1.1 + (ch - 1) * 4;
    const pool = ["walker", "walker", "crawler"];
    if (room >= 2 || ch > 1) pool.push("runner");
    if (room >= 3 || ch > 1) pool.push("spitter");
    if (room >= 4 || ch > 1) pool.push("dog");
    if (room >= 6 || ch > 1) pool.push("bomber");
    if (room >= 8 || ch > 1) pool.push("brute");
    if (room >= 11 || ch > 1) pool.push("armored");
    const maxCount = 14 + ch * 2;
    let count = 0;
    while (budget > 0.5 && count < maxCount) {
      const type = pick(pool);
      const def = ZOMBIES[type];
      const n = def.pack || 1;
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
      face: Math.PI / 2, anim: rand(0, 8), variant: randi(0, 2), scale: def.boss ? 1 : rand(0.93, 1.08), hitAng: rand(0, TAU),
    };
    e.spawnMax = e.spawnT;
    e.face = Math.atan2(player.y - e.y, player.x - e.x);
    enemies.push(e);
    // Zombie bricht aus dem Boden
    stamp(Sprites.crack(), e.x, e.y + e.r * 0.3, rand(0, TAU), e.r / 16, 0.6);
    fxDebris(e.x, e.y, 0, Math.PI, def.boss ? 20 : 5, "#5a4a3a");
    if (def.boss) { shake = Math.max(shake, 10); fxSmoke(e.x, e.y, 10, 2.2, 1.6); }
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
    p.kick = Math.max(0, p.kick - dt * 40);
    p.hurtT = Math.max(0, p.hurtT - dt);
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
    // Minigun: Läufe drehen im Stand hoch, Feuerrate steigt mit
    if (p.weapon.spin) {
      p.spin = !p.moving && target ? Math.min(1, p.spin + dt / 1.1) : Math.max(0, p.spin - dt * 1.5);
      p.barrel += dt * (6 + 40 * p.spin);
    }
    if (!p.moving && target) {
      p.aim = Math.atan2(target.y - p.y, target.x - p.x);
      if (p.fireCd <= 0) {
        fire();
        const spinMul = p.weapon.spin ? 0.25 + 0.75 * p.spin : 1;
        p.fireCd = 1 / (p.weapon.rate * p.rateMul * spinMul);
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
            e.hitAng = a + Math.PI / 2;
            fxSparks(bx, by, a + Math.PI / 2, 0.6, 4, "255,230,170", 260);
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
          bullets.push(makeBullet(d.x, d.y, a, { dmg: p.power * 0.9, speed: 650, r: 3, color: "#7fe7ff", life: 1.6, tracer: "127,231,255" }));
          fxFlash(d.x, d.y, 30, "127,231,255", 0.08);
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

  // Waffenmodell: Griff sitzt GRIP vor/neben der Körpermitte, Mündung am Ende des Modells
  const GRIP_X = 12, GRIP_Y = 2.4;
  function muzzlePoint(p) {
    const m = Sprites.WPN[p.weaponId];
    const d = GRIP_X + (m.muzzle - m.grip) - p.kick;
    const c = Math.cos(p.aim), sn = Math.sin(p.aim);
    return { x: p.x + c * d - sn * GRIP_Y, y: p.y + sn * d + c * GRIP_Y };
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

    p.muzzle = w.kind === "flame" ? 0.05 : 0.07;
    p.kick = w.kick;
    if (w.shake) shake = Math.max(shake, w.shake);
    const mz = muzzlePoint(p);

    if (w.kind === "tesla") {
      for (const d of dirs) teslaShot(mz, d.a);
      sfx("zap");
      return;
    }

    // Projektile starten nah am Körper, damit auch Zombies direkt vor dem Lauf getroffen werden
    const spawnD = Math.min(26, Math.hypot(mz.x - p.x, mz.y - p.y));
    for (const d of dirs) {
      const px = -Math.sin(d.a) * d.off, py = Math.cos(d.a) * d.off;
      const gx = p.x + Math.cos(d.a) * spawnD, gy = p.y + Math.sin(d.a) * spawnD;
      for (let k = 0; k < w.pellets; k++) {
        const s = w.pellets > 1 ? (k / (w.pellets - 1) - 0.5) * w.spread : 0;
        const a = d.a + s + rand(-w.jitter, w.jitter);
        bullets.push(makeBullet(gx + px, gy + py, a, {
          dmg: w.dmg * p.dmgMul, speed: w.speed * (w.kind === "flame" ? rand(0.85, 1.15) : 1), r: w.r, color: w.color,
          life: w.range / w.speed, pierce: w.pierce + p.pierce, wall: p.wall, rico: p.ricochet,
          kind: w.kind, aoe: w.aoe, burn: w.burn ? 1 + p.burn : p.burn, freeze: p.freeze, poison: p.poison, player: true,
          tracer: w.tracer, long: w.long, knock: w.knock,
        }));
      }
    }
    // Hülsen auswerfen (rechte Seite der Waffe)
    if (w.casing && (w.rate < 5 || Math.random() < 0.45)) {
      const c = Math.cos(aim), sn = Math.sin(aim);
      fxCasing(p.x + c * 8 - sn * 6, p.y + sn * 8 + c * 6, aim + Math.PI / 2 + rand(-0.4, 0.4), w.casing === 2);
    }
    if (w.kind === "grenade") fxSmoke(mz.x, mz.y, 2, 0.6, 0.6);
    if (w.kind !== "flame" || Math.random() < 0.25) sfx("shoot");
  }

  // Tesla: Kettenblitz auf das nächste Ziel im Kegel, springt dann weiter
  function teslaShot(from, dirAng) {
    const p = player, w = p.weapon;
    let best = null, bd = w.range * w.range;
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d2 = dist2(from, e);
      if (d2 > bd) continue;
      let da = Math.abs(Math.atan2(e.y - from.y, e.x - from.x) - dirAng) % TAU;
      if (da > Math.PI) da = TAU - da;
      if (da > 0.6) continue;
      bd = d2; best = e;
    }
    if (!best) {
      zaps.push({ x1: from.x, y1: from.y, x2: from.x + Math.cos(dirAng) * 90, y2: from.y + Math.sin(dirAng) * 90, life: 0.08, max: 0.08 });
      return;
    }
    const hit = new Set();
    let cur = best, prev = from, dmg = w.dmg * p.dmgMul;
    const jumps = w.chain + p.ricochet + p.pierce;
    const fake = { kind: "tesla", vx: 0, vy: 0, burn: p.burn, freeze: p.freeze, poison: p.poison };
    for (let j = 0; cur && j <= jumps; j++) {
      hit.add(cur);
      zaps.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y, life: 0.18, max: 0.18 });
      fxSparks(cur.x, cur.y, 0, Math.PI, 5, "160,240,255", 220);
      fake.vx = cur.x - prev.x; fake.vy = cur.y - prev.y;
      cur.hitAng = Math.atan2(fake.vy, fake.vx);
      damageEnemy(cur, dmg, { bullet: fake });
      prev = cur;
      dmg *= 0.8;
      let next = null, nd = 160 * 160;
      for (const e of enemies) {
        if (e.dead || e.spawnT > 0 || hit.has(e)) continue;
        const d2 = dist2(prev, e);
        if (d2 < nd) { nd = d2; next = e; }
      }
      cur = next;
    }
  }

  function makeBullet(x, y, a, o) {
    return {
      x, y, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, r: o.r || 5, color: o.color || "#fff",
      dmg: o.dmg, life: o.life || 1.5, maxLife: o.life || 1.5, pierce: o.pierce || 0, wall: o.wall || 0, rico: o.rico || 0,
      kind: o.kind || "bullet", aoe: o.aoe || 0, burn: o.burn || 0, freeze: o.freeze || 0, poison: o.poison || 0,
      hit: new Set(), dead: false, tracer: o.tracer || "255,240,200", long: !!o.long, knock: o.knock || 0, spin: rand(0, TAU),
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
      addText(p.x, p.y - 30, tr("AUSGEWICHEN"), "#9ee6ff", 15);
      p.invuln = 0.3;
      return;
    }
    p.hp -= dmg;
    p.invuln = 0.8;
    shake = Math.max(shake, 8);
    addText(p.x + rand(-10, 10), p.y - 58, `-${Math.round(dmg)}`, "#ff5a5a", 18);
    fxBlood(p.x, p.y, rand(0, TAU), 8, RED, 160);
    p.hurtT = 0.35;
    sfx("hurt");
    if (save.vibration) Platform.vibrate(30);
    if (p.hp <= 0) {
      if (p.revives > 0) {
        p.revives--;
        revivePlayer(0.6, tr("Zweites Leben verbraucht"));
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
    showBanner(tr("WIEDERBELEBT"), sub, 1.5);
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
    if (!ok) { toast(tr("Kein Video verfügbar")); gameOver(false); return; }
    run.adRevived = true;
    run.adWatched = true;
    revivePlayer(1, tr("Volle Gesundheit!"));
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
      b.spin += dt * 14;
      if (b.kind === "flame") {
        if (Math.random() < 0.15 + 0.15 * quality) fxFire(b.x + rand(-6, 6), b.y + rand(-6, 6), 0.9, 0.3);
        if (Math.random() < 0.25) fxEmber(b.x, b.y);
        if (Math.random() < 0.06) fxSmoke(b.x, b.y, 1, 0.5, 0.7);
      }
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
          if (b.kind !== "flame") {
            const back = Math.atan2(-b.vy, -b.vx);
            fxSparks(b.x, b.y, back, 0.9, 5, "255,220,150", 240);
            fxDebris(b.x, b.y, back, 0.8, 3, "#8a7a62");
          }
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
      if (b.life <= 0 || b.x < L || b.x > R || b.y < T || b.y > B) { b.dead = true; acidSplash(b); continue; }
      if (Math.random() < 0.25) fxDrip(b);
      if (obstacles.some((o) => pointInRect(b.x, b.y, o))) { b.dead = true; acidSplash(b); continue; }
      if ((player.x - b.x) ** 2 + (player.y - b.y) ** 2 < (player.r + b.r - 3) ** 2) {
        b.dead = true;
        acidSplash(b);
        hurtPlayer(b.dmg);
      }
    }
    eBullets = eBullets.filter((b) => !b.dead);
  }

  function explode(x, y, radius, dmg, byPlayer) {
    shake = Math.max(shake, 9);
    sfx("boom");
    fxFlash(x, y, radius * 1.7, "255,190,90", 0.28);
    fxRing(x, y, radius, "255,200,120", 0.35);
    for (let i = 0; i < 12; i++) fxFire(x + rand(-radius, radius) * 0.45, y + rand(-radius, radius) * 0.45, 2.2, rand(0.35, 0.6));
    fxSmoke(x, y, 7, 1.8, rand(1.2, 1.8));
    fxSparks(x, y, 0, Math.PI, 16, "255,200,120", 420);
    fxDebris(x, y, 0, Math.PI, 8, "#3a3028");
    stamp(Sprites.scorch(), x, y, rand(0, TAU), radius / 40, 0.85);
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (Math.sqrt(dist2(e, { x, y })) < radius + e.r) { e.hitAng = Math.atan2(e.y - y, e.x - x); damageEnemy(e, byPlayer ? dmg : dmg * 2, { aoe: true }); }
    }
    if (!byPlayer && Math.sqrt(dist2(player, { x, y })) < radius + player.r) hurtPlayer(dmg);
  }

  function acidSplash(b) {
    const rgb = b.rgb || "183,255,74";
    fxSparks(b.x, b.y, 0, Math.PI, 5, rgb, 140);
    if (b.x > L && b.x < R && b.y > T && b.y < B) stamp(Sprites.splat(b.pink ? PURPLE : GREEN, randi(0, 5)), b.x, b.y, rand(0, TAU), 0.35, 0.7);
  }

  // ============================================================
  // Zombies
  // ============================================================
  function damageEnemy(e, dmg, o) {
    if (e.dead) return;
    const p = player;
    let crit = false, exec = false;
    if (!o.silent) {
      const critChance = p.crit;
      if (Math.random() < critChance) { dmg *= p.critMul; crit = true; }
      if (!e.def.boss && p.headshot > 0 && Math.random() < p.headshot) { dmg = e.hp; crit = true; exec = true; }
    }
    // Panzerung (Riot-Zombie) schluckt einen Teil des Schadens – Exekution ignoriert sie
    if (e.def.armor && !o.silent && !exec) dmg *= 1 - e.def.armor;
    const b = o.bullet;
    if (b) {
      e.hitAng = Math.atan2(b.vy, b.vx);
      if (b.burn) { e.burnT = 2.5; e.burnDps = Math.max(e.burnDps, p.power * 0.35 * b.burn); }
      if (b.freeze) e.slowT = 1.2 + 0.6 * b.freeze;
      if (b.poison) e.poisonDps = Math.min(e.poisonDps + p.power * 0.08 * b.poison, p.power * 1.5 * b.poison);
      if (!e.def.boss && b.kind !== "flame") {
        const k = (e.type === "brute" || e.type === "armored" ? 2 : 6) + (b.knock || 0) * (e.type === "brute" ? 0.3 : 1);
        const len = Math.hypot(b.vx, b.vy) || 1;
        e.x += (b.vx / len) * k; e.y += (b.vy / len) * k;
      }
    }
    e.hp -= dmg;
    e.hitT = 0.1;
    if (!o.silent && (!b || b.kind !== "flame")) {
      if (e.def.armor) fxSparks(e.x, e.y, e.hitAng + Math.PI, 0.8, 4, "200,230,255", 260);
      else fxBlood(e.x, e.y, e.hitAng, crit ? 6 : 3, e.def.blood, crit ? 220 : 150);
    }
    if (!o.silent && (!b || b.kind !== "flame" || Math.random() < 0.2)) {
      addText(e.x + rand(-8, 8), e.y - e.r - 4, Math.max(1, Math.round(dmg)) + (crit ? "!" : ""), crit ? "#ffb84a" : "#ffffff", crit ? 24 : 15, crit);
      sfx("hit");
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    run.kills++;
    const def = e.def;
    fxBlood(e.x, e.y, e.hitAng, def.boss ? 40 : 12, def.blood, def.boss ? 320 : 220);
    fxGibs(e.x, e.y, def.boss ? 14 : randi(2, 4), def.blood);
    splatter(e.x, e.y, e.hitAng, def.boss ? 2.4 : 0.7 + e.r / 40, def.blood);
    corpses.push({ type: e.type, v: e.variant, f: Math.floor(e.anim) % Sprites.FRAMES, x: e.x, y: e.y, face: e.face, sc: e.scale, t: 0, blood: def.blood, boss: def.boss, dir: Math.random() < 0.5 ? -1 : 1 });
    sfx(def.boss ? "boom" : "kill");
    if (def.boss) {
      shake = 18;
      slowMo = 0.9;
      fxFlash(e.x, e.y, 320, "255,240,200", 0.5);
      fxRing(e.x, e.y, 160, "255,220,160", 0.6);
    }

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
    const pink = color === "#ff6ad5";
    eBullets.push({ x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, color, life: 4, dead: false, pink, rgb: pink ? "255,106,213" : "183,255,74" });
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
      if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burnDps * dt; if (Math.random() < 0.35) fxFire(e.x + rand(-e.r, e.r) * 0.6, e.y + rand(-e.r, e.r) * 0.6, 0.6 + e.r / 40, 0.4); }
      if (e.poisonDps > 0) { e.hp -= e.poisonDps * dt; if (Math.random() < 0.12) fxBubble(e.x + rand(-e.r, e.r) * 0.7, e.y + rand(-e.r, e.r) * 0.5); }
      if (e.slowT > 0 && Math.random() < 0.1) fxIce(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r));
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
        case "dog": {
          // Sprung-Angriff aus kurzer Distanz
          e.cd -= dt;
          if (e.mode === "lunge") {
            mx = e.dirX; my = e.dirY; sp = 340 * slow;
            e.aiT -= dt;
            if (e.aiT <= 0) e.mode = "walk";
          } else if (d < 140 && e.cd <= 0) {
            e.mode = "lunge"; e.aiT = 0.28; e.dirX = mx; e.dirY = my; e.cd = rand(1.2, 2);
          }
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
            if (Math.random() < 0.5) fxDebris(e.x - e.dirX * e.r, e.y - e.dirY * e.r, Math.atan2(-e.dirY, -e.dirX), 0.6, 1, "#5a4a3a");
            if (e.aiT <= 0) { e.mode = "walk"; e.aiT = rand(2.2, 3.5); }
          }
          if (e.type === "abom" && !e.phase2 && e.hp < e.maxHp * 0.5) { e.phase2 = true; e.speed *= 1.3; showBanner(tr("RASEREI!"), tr("Die Abscheulichkeit mutiert"), 1.2); }
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
          if (!e.phase2 && e.hp < e.maxHp * 0.5) { e.phase2 = true; showBanner(tr("DIE BRUT ERWACHT"), "", 1.2); }
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
      // Blickrichtung weich nachführen, Laufanimation an Tempo koppeln
      const lookAt = e.type === "spitter" || e.mode === "wind" ? Math.atan2(dy, dx) : Math.atan2(my, mx);
      let dFace = lookAt - e.face;
      while (dFace > Math.PI) dFace -= TAU;
      while (dFace < -Math.PI) dFace += TAU;
      e.face += dFace * Math.min(1, dt * (e.def.boss ? 4 : 9));
      e.anim += dt * (sp / (e.def.boss ? 30 : 55)) * 7;
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
    addText(W / 2, T + 40, tr("TÜR OFFEN ↑"), "#8cff4a", 22);
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
      fxRing(p.x, p.y, 70, "255,230,120", 0.5);
      fxFlash(p.x, p.y, 120, "255,230,120", 0.3);
      fxSparks(p.x, p.y, -Math.PI / 2, 0.9, 14, "255,230,120", 300);
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
      const lvl = c.id && player.skills[c.id] ? ` <small>${tr("(Stufe {n})", { n: player.skills[c.id] + 1 })}</small>` : "";
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
    renderCards(tr("VERSORGUNGSKISTE"), [
      { icon: "🩹", name: tr("Erste Hilfe"), desc: tr("Heilt 50% deiner max. HP"), rarity: "", onPick: () => { healPlayer(player.maxHp * 0.5); afterSupply(); } },
      { icon: "🎁", name: tr("Waffenkiste"), desc: tr("Wähle einen zusätzlichen Skill"), rarity: "epic", onPick: () => { run.pendingPicks++; afterSupply(); } },
    ]);
  }
  function afterSupply() {
    supplyCrate = null;
    run.cleared = true;
    addText(W / 2, T + 40, tr("TÜR OFFEN ↑"), "#8cff4a", 22);
    resumePlay();
  }

  function resumePlay() {
    if (run.pendingPicks > 0) { openSkillPick(); return; }
    state = "play";
    show(null);
  }

  // ============================================================
  // Effekte: Partikel mit Höhe (z) und Schwerkraft, Lichtblitze, Bodenspuren
  // ============================================================
  const GRAVITY = 900;
  function addP(p) { if (particles.length < QUALITY_PARTICLES[quality]) particles.push(p); return p; }

  function fxSparks(x, y, ang, spread, n, rgb, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread), s = rand(speed * 0.35, speed);
      addP({ t: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.3), max: 0.3, rgb, w: rand(1.2, 2.4) });
    }
  }
  function fxBlood(x, y, ang, n, color, speed = 200) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-0.7, 0.7) + (Math.random() < 0.2 ? Math.PI : 0), s = rand(speed * 0.25, speed);
      addP({ t: "blood", x, y, z: rand(4, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(40, 170), life: 1.5, max: 1.5, color, size: rand(1.2, 2.8) });
    }
  }
  function fxGibs(x, y, n, color) {
    const tone = color === GREEN ? "#4a7a2a" : color === PURPLE ? "#6e2a4a" : "#7a1f22";
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(60, 240);
      addP({ t: "gib", x, y, z: rand(6, 18), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(140, 320), rot: rand(0, TAU), vr: rand(-14, 14), life: 2.5, max: 2.5, spr: Sprites.gib(tone, randi(0, 5)), trail: color });
    }
  }
  function fxDebris(x, y, ang, spread, n, color) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-spread, spread), s = rand(40, 200);
      addP({ t: "debris", x, y, z: rand(2, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(60, 200), rot: rand(0, TAU), vr: rand(-15, 15), life: rand(0.6, 1.1), max: 1.1, color, size: rand(1.2, 2.6) });
    }
  }
  function fxCasing(x, y, ang, shell) {
    const s = rand(70, 130);
    addP({ t: "casing", x, y, z: 10, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, vz: rand(90, 170), rot: rand(0, TAU), vr: rand(-25, 25), life: 3, max: 3, spr: Sprites.casing(shell) });
  }
  function fxSmoke(x, y, n, size = 1, life = 1.2) {
    for (let i = 0; i < n; i++) {
      addP({ t: "smoke", x: x + rand(-8, 8) * size, y: y + rand(-8, 8) * size, vx: rand(-18, 18), vy: rand(-28, -6), life: life * rand(0.8, 1.2), max: life, size: rand(0.7, 1.15) * size, rot: rand(0, TAU) });
    }
  }
  function fxFire(x, y, size = 1, life = 0.45) { addP({ t: "fire", x, y, vx: rand(-18, 18), vy: rand(-50, -15), life, max: life, size: rand(9, 15) * size }); }
  function fxEmber(x, y) { addP({ t: "ember", x, y, vx: rand(-30, 30), vy: rand(-60, -20), life: rand(0.3, 0.6), max: 0.6, size: rand(2, 4) }); }
  function fxBubble(x, y) { addP({ t: "bubble", x, y, vx: rand(-6, 6), vy: rand(-26, -12), life: 0.7, max: 0.7, size: rand(3, 5) }); }
  function fxIce(x, y) { addP({ t: "ice", x, y, vx: 0, vy: -10, life: 0.5, max: 0.5, size: rand(4, 7) }); }
  function fxFlash(x, y, r, rgb, life = 0.15) { addP({ t: "flash", x, y, r, rgb, life, max: life }); }
  function fxRing(x, y, r, rgb, life = 0.35) { addP({ t: "ring", x, y, r, rgb, life, max: life }); }
  function fxDrip(b) { addP({ t: "drip", x: b.x, y: b.y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: b.r * 0.5, rgb: b.rgb }); }
  function burst(x, y, color, n, speed) { fxSparks(x, y, 0, Math.PI, n, "255,220,160", speed); }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      switch (p.t) {
        case "blood": case "gib": case "casing": case "debris": {
          if (p.grounded) break;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vz -= GRAVITY * dt; p.z += p.vz * dt;
          if (p.vr) p.rot += p.vr * dt;
          if (p.t === "gib" && Math.random() < 0.3) stampDot(p.x, p.y, 1.2, p.trail);
          if (p.z <= 0) {
            p.z = 0;
            const inside = p.x > L && p.x < R && p.y > T && p.y < B;
            if (p.t === "blood") { stampDot(p.x, p.y, p.size, p.color); p.life = 0; }
            else if (Math.abs(p.vz) < 70) {
              if (p.t === "debris") { p.grounded = true; }
              else { if (inside) stamp(p.spr, p.x, p.y, p.rot, 1, p.t === "casing" ? 0.9 : 0.85); p.life = 0; }
            } else { p.vz = -p.vz * 0.35; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.6; }
          }
          break;
        }
        case "smoke": p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 0.8; p.rot += dt * 0.3; break;
        case "fire": case "ember": case "bubble": case "ice": p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 30 * dt; break;
        case "spark": p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 5 * dt; p.vy *= 1 - 5 * dt; break;
      }
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function addText(x, y, txt, color, size, crit = false) {
    texts.push({ x, y, txt: String(txt), color, size, life: 0.8, max: 0.8, crit });
  }
  function showBanner(title, sub, dur = 2) {
    banner = { title, sub, life: dur, max: dur };
  }

  function bakeCorpse(c) {
    splatter(c.x, c.y, c.face + Math.PI, c.boss ? 2.6 : 0.8, c.blood);
    stamp(Sprites.zombieFx(c.type, c.f, c.v, "corpse"), c.x, c.y, c.face + c.dir * 0.4, c.sc * 0.88, 0.75);
  }

  // Umgebungs-Partikel: Asche (Straße), Staub (Krankenhaus), Sporen (Labor)
  function initAmbient() {
    ambient = [];
    for (let i = 0; i < 28; i++) ambient.push({ x: rand(L, R), y: rand(T, B), size: rand(1, 2.4), ph: rand(0, TAU) });
  }
  function updateAmbient(dt) {
    const th = theme();
    for (const a of ambient) {
      a.ph += dt;
      if (th === "street") { a.x += (Math.sin(a.ph * 0.7) * 8 + 6) * dt; a.y += 14 * dt; }
      else if (th === "hospital") { a.x += Math.sin(a.ph * 0.5) * 6 * dt; a.y += Math.cos(a.ph * 0.4) * 5 * dt; }
      else { a.y -= 12 * dt; a.x += Math.sin(a.ph) * 6 * dt; }
      if (a.y > B) a.y = T; else if (a.y < T) a.y = B;
      if (a.x > R) a.x = L; else if (a.x < L) a.x = R;
    }
  }

  function updateFx(dt) {
    updateParticles(dt);
    for (const t of texts) { t.life -= dt; t.y -= 34 * dt; }
    texts = texts.filter((t) => t.life > 0);
    for (const c of corpses) { c.t += dt; if (c.t >= 0.5) bakeCorpse(c); }
    corpses = corpses.filter((c) => c.t < 0.5);
    for (const z of zaps) z.life -= dt;
    zaps = zaps.filter((z) => z.life > 0);
    updateAmbient(dt);
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
    if (run.cleared) run.doorK = Math.min(1, (run.doorK || 0) + dt * 1.8);
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
      if (!chips.children.length) chips.innerHTML = `<span class="chip">${tr("Noch keine Skills")}</span>`;
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
    $("overTitle").textContent = quit ? tr("RUN BEENDET") : tr("GEFALLEN");
    $("overStats").innerHTML = `
      <span>${tr("Erreicht")}</span><b>${tr("Kap. {c} · Raum {r}", { c: run.chapter, r: run.room })}</b>
      <span>${tr("Kills")}</span><b>${run.kills}</b>
      <span>${tr("Level")}</span><b>${player.level}</b>
      <span>${tr("Zeit")}</span><b>${Math.floor(run.time / 60)}:${String(Math.floor(run.time % 60)).padStart(2, "0")}</b>
      <span>${tr("Münzen")}</span><b>+${coins} 💰</b>`;
    const dbl = $("doubleBtn");
    dbl.classList.toggle("hidden", !(Platform.ads.available && coins > 0));
    dbl.disabled = false;
    dbl.textContent = tr("▶ Münzen ×2 (Video)");
    setTimeout(() => show(ui.over), quit ? 0 : 600);
  }

  // ============================================================
  // Rendering: Welt → Licht → Leuchteffekte → Lesbarkeit (Balken, Zahlen) → HUD
  // ============================================================
  const LS = 4; // Lichtkarte: 1 Pixel = 4 Welt-Einheiten (weich und schnell)
  function lowResCanvas() { const c = document.createElement("canvas"); c.width = Math.ceil(W / LS); c.height = Math.ceil(H / LS); return c; }
  const lightCanvas = lowResCanvas();
  const lctx = lightCanvas.getContext("2d");
  const lights = [];
  const FIRE_RGB = ["200,60,20", "255,140,40", "255,220,120"];
  const fireRgb = (k) => FIRE_RGB[k > 0.6 ? 2 : k > 0.3 ? 1 : 0];
  function vignetteCanvas(rgb, inner, alpha) {
    const c = lowResCanvas(), g = c.getContext("2d");
    const w = c.width, h = c.height;
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.max(w, h) * 0.72);
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(1, `rgba(${rgb},${alpha})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return c;
  }
  const vignette = vignetteCanvas("0,0,0", 0.35, 0.7);
  const hurtVignette = vignetteCanvas("200,0,0", 0.38, 0.6);
  const actorList = [];

  function draw() {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0d1210";
    ctx.fillRect(0, 0, W, H);
    if (!run) { drawMenuBg(); return; }

    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    // 1) Welt
    if (floorCanvas) ctx.drawImage(floorCanvas, 0, 0, W, H);
    drawDoor();
    for (const o of obstacles) drawObstacle(o);
    drawAmbient(false);
    drawOrbs();
    if (supplyCrate) drawSupply();
    drawCorpses();
    drawActors();
    drawProjectilesBase();
    drawParticlesBase();
    // 2) Licht & Dunkelheit
    drawLighting();
    // 3) Leuchtende Dinge (additiv)
    ctx.globalCompositeOperation = "lighter";
    drawGlows();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // 4) Lesbarkeit
    drawEnemyBullets();
    drawTelegraphs();
    drawBars();
    drawTexts();
    ctx.restore();

    drawScreenFx();
    drawHud();
    if (state === "play" && joy.active) drawJoystick();
    if (banner) drawBanner();
    if (!save.tutorialDone && run.room === 1 && (state === "play" || state === "pick")) drawTutorial();
  }

  function glowAt(rgb, x, y, r, a = 1) {
    if (a <= 0 || r <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(Sprites.glow(rgb).c, x - r, y - r, r * 2, r * 2);
  }
  function drawShadow(x, y, r) {
    const s = Sprites.shadow();
    ctx.drawImage(s.c, x - r * 1.3, y - r * 0.15, r * 2.6, r * 1.3);
  }

  function drawTutorial() {
    const t = performance.now() / 1000;
    const moving = player.moving;
    ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(W / 2 - 200, (T + B) / 2 + 40, 400, 64, 14);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#8cff4a";
    ctx.font = "900 20px system-ui";
    ctx.fillText(moving ? tr("Loslassen = automatisch schießen!") : tr("👆 Finger ziehen = laufen & ausweichen"), W / 2, (T + B) / 2 + 69);
    ctx.fillStyle = "#e8efe9";
    ctx.font = "600 14px system-ui";
    ctx.fillText(moving ? tr("Du schießt nur, wenn du stehst.") : tr("Stehenbleiben = auf den nächsten Zombie feuern"), W / 2, (T + B) / 2 + 91);
    ctx.globalAlpha = 1;
    if (!moving) {
      const cx = L + 90, cy = B - 90;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(140,255,74,0.7)";
      ctx.beginPath(); ctx.arc(cx + Math.sin(t * 2.5) * 30, cy + Math.cos(t * 2.5) * 30, 20, 0, TAU); ctx.fill();
    }
  }

  // Menü-Hintergrund: nächtliche Straße mit umherschlurfenden Zombies und Suchscheinwerfer
  let menuScene = null;
  function drawMenuBg() {
    const t = performance.now() / 1000, dt = frameDt;
    if (!menuScene || menuScene.res !== Sprites.res) {
      menuScene = { res: Sprites.res, floor: Sprites.floor("street", { W, H, L, T, R, B }, 4242), z: [] };
      ["walker", "runner", "walker", "crawler", "brute", "spitter", "dog", "walker", "bomber", "armored", "walker"].forEach((type, i) => {
        menuScene.z.push({ type, v: i % 3, x: rand(L, R), y: 170 + i * 66 + rand(-15, 15), sp: ZOMBIES[type].speed * 0.3, dir: i % 2 ? 1 : -1, anim: rand(0, 8), wob: rand(0, TAU) });
      });
    }
    ctx.drawImage(menuScene.floor, 0, 0, W, H);
    const sorted = menuScene.z;
    for (const z of sorted) {
      z.x += z.dir * z.sp * dt;
      z.wob += dt;
      z.anim += dt * (z.sp / 55) * 7;
      const r = ZOMBIES[z.type].r;
      if (z.x > R + 40) z.x = L - 40; else if (z.x < L - 40) z.x = R + 40;
      const y = z.y + Math.sin(z.wob * 0.8) * 10;
      drawShadow(z.x, y, r);
      Sprites.draw(ctx, Sprites.zombie(z.type, Math.floor(z.anim), z.v), z.x, y, z.dir > 0 ? 0.15 * Math.sin(z.wob) : Math.PI + 0.15 * Math.sin(z.wob));
    }
    // Dunkelheit mit wanderndem Suchscheinwerfer
    lctx.globalCompositeOperation = "copy";
    lctx.fillStyle = "rgba(6,10,20,0.78)";
    lctx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    lctx.globalCompositeOperation = "destination-out";
    const ls = Sprites.light().c;
    const sx = W / 2 + Math.sin(t * 0.35) * 200, sy = 560 + Math.cos(t * 0.27) * 220;
    lctx.globalAlpha = 0.95; lctx.drawImage(ls, (sx - 190) / LS, (sy - 190) / LS, 380 / LS, 380 / LS);
    lctx.globalAlpha = 0.6;
    for (const [lx, ly] of [[L + 40, 260], [R - 40, 620], [L + 60, 860]]) lctx.drawImage(ls, (lx - 120) / LS, (ly - 120) / LS, 240 / LS, 240 / LS);
    lctx.globalAlpha = 1; lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(lightCanvas, 0, 0, lightCanvas.width * LS, lightCanvas.height * LS);
    ctx.globalCompositeOperation = "lighter";
    for (const z of sorted) {
      const ang = z.dir > 0 ? 0 : Math.PI, r = ZOMBIES[z.type].r;
      glowAt("255,40,30", z.x + Math.cos(ang) * r * 0.45, z.y + Math.sin(z.wob * 0.8) * 10, r * 0.8, 0.5);
    }
    glowAt("255,200,120", sx, sy, 60, 0.12);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0, vignette.width * LS, vignette.height * LS);
  }

  function drawDoor() {
    const x0 = W / 2 - DOOR_W / 2, y0 = T - 22, h = 22, k = run.doorK || 0;
    ctx.fillStyle = "#121517"; ctx.fillRect(x0 - 6, y0, DOOR_W + 12, h);
    ctx.fillStyle = "#040605"; ctx.fillRect(x0, y0 + 3, DOOR_W, h - 3);
    const pw = (DOOR_W / 2) * (1 - k);
    if (pw > 0.5) {
      for (const px of [x0, x0 + DOOR_W - pw]) {
        const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, "#6b7177"); g.addColorStop(1, "#2c3034");
        ctx.fillStyle = g; ctx.fillRect(px, y0 + 3, pw, h - 3);
        ctx.fillStyle = "#d9b21a";
        for (let i = 2; i < pw - 2; i += 8) ctx.fillRect(px + i, y0 + h - 6, 4, 3);
      }
      ctx.fillStyle = "#1b1e21"; ctx.fillRect(W / 2 - 1 - (DOOR_W / 2 - pw), y0 + 3, 2, h - 3);
    }
    ctx.fillStyle = k > 0.5 ? "#8cff4a" : "#ff3a2a";
    ctx.fillRect(x0 - 5, y0 + 6, 3, 7); ctx.fillRect(x0 + DOOR_W + 2, y0 + 6, 3, 7);
  }

  function drawObstacle(o) {
    if (!o.spr || o.sprRes !== Sprites.res) { o.spr = Sprites.obstacle(o, theme()); o.sprRes = Sprites.res; }
    ctx.drawImage(o.spr.c, o.x + o.spr.ox, o.y + o.spr.oy, o.spr.w, o.spr.h);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawSupply() {
    const s = supplyCrate;
    drawShadow(s.x, s.y + 8, 24);
    Sprites.draw(ctx, Sprites.supplyCrate(), s.x, s.y - 4 + Math.sin(s.bob * 3) * 3);
  }

  function drawOrbs() {
    const t = run.time;
    for (const o of orbs) if (o.type === "coin") Sprites.draw(ctx, Sprites.coin(Math.floor(t * 12 + o.x * 0.1)), o.x, o.y);
  }

  function drawAmbient(glowPass) {
    const th = theme();
    if (glowPass !== (th === "lab")) return;
    if (th === "lab") {
      for (const a of ambient) glowAt("140,255,90", a.x, a.y, a.size * 2.5, 0.3 + 0.2 * Math.sin(a.ph * 2));
    } else {
      ctx.fillStyle = th === "street" ? "rgba(190,190,190,0.35)" : "rgba(230,240,235,0.22)";
      for (const a of ambient) ctx.fillRect(a.x, a.y, a.size, a.size);
    }
  }

  function drawCorpses() {
    for (const c of corpses) {
      const k = Math.min(1, c.t / 0.5);
      const ang = c.face + c.dir * 0.4 * k, sc = c.sc * (1 - 0.12 * k);
      Sprites.draw(ctx, Sprites.zombie(c.type, c.f, c.v), c.x, c.y, ang, sc);
      ctx.globalAlpha = k * 0.85;
      Sprites.draw(ctx, Sprites.zombieFx(c.type, c.f, c.v, "corpse"), c.x, c.y, ang, sc);
      ctx.globalAlpha = 1;
    }
  }

  function drawActors() {
    actorList.length = 0;
    for (const e of enemies) actorList.push(e);
    actorList.push(player);
    actorList.sort((a, b) => a.y - b.y);
    for (const a of actorList) { if (a === player) drawPlayer(); else drawEnemy(a); }
  }

  function drawEnemy(e) {
    const f = Math.floor(e.anim) % Sprites.FRAMES;
    if (e.spawnT > 0) {
      const k = Math.min(1, Math.max(0, 1 - e.spawnT / e.spawnMax));
      ctx.globalAlpha = k;
      Sprites.draw(ctx, Sprites.zombie(e.type, f, e.variant), e.x, e.y + (1 - k) * 8, e.face, e.scale * (0.55 + 0.45 * k));
      ctx.globalAlpha = 1;
      return;
    }
    drawShadow(e.x, e.y, e.r * e.scale);
    let x = e.x, y = e.y;
    if (e.mode === "wind") { x += rand(-1.5, 1.5); y += rand(-1.5, 1.5); }
    const sc = e.scale * (1 + Math.sin(e.anim * 0.8) * 0.015);
    Sprites.draw(ctx, Sprites.zombie(e.type, f, e.variant), x, y, e.face, sc);
    if (e.slowT > 0) { ctx.globalAlpha = 0.8; Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "ice"), x, y, e.face, sc); }
    if (e.phase2) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(run.time * 10); Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "rage"), x, y, e.face, sc); }
    if (e.hitT > 0) { ctx.globalAlpha = Math.min(1, e.hitT / 0.1); Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "hit"), x, y, e.face, sc); }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = player;
    const blink = p.invuln > 0 && state === "play" && Math.floor(p.invuln * 16) % 2 === 0;
    // Kreissägen
    const saw = Sprites.saw();
    for (let i = 0; i < p.orbit; i++) {
      const a = p.orbitAng + (i / p.orbit) * TAU;
      Sprites.draw(ctx, saw, p.x + Math.cos(a) * 64, p.y + Math.sin(a) * 64, p.orbitAng * 5);
    }
    drawShadow(p.x, p.y, 16);
    const pack = p.weaponId === "flame" ? "tanks" : "pack";
    const body = Sprites.playerBody(p.moving ? Math.floor(p.walkT) % Sprites.FRAMES : -1, pack);
    const ws = Sprites.weapon(p.weaponId, p.tier, Math.floor(p.barrel));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    if (blink) ctx.globalAlpha = 0.4;
    ctx.drawImage(body.c, -body.w / 2 - p.kick * 0.4, -body.h / 2, body.w, body.h);
    ctx.drawImage(ws.c, GRIP_X - ws.grip - p.kick, GRIP_Y - ws.h / 2, ws.w, ws.h);
    ctx.restore();
    ctx.globalAlpha = 1;
    // Drohnen
    const dr = Sprites.drone();
    for (let i = 0; i < p.drones; i++) {
      const d = dronePos(i);
      drawShadow(d.x, d.y + 22, 8);
      Sprites.draw(ctx, dr, d.x, d.y + Math.sin(run.time * 4 + i) * 2, Math.sin(run.time + i) * 0.3);
    }
  }

  function drawProjectilesBase() {
    for (const b of bullets) {
      if (b.kind === "bolt") Sprites.draw(ctx, Sprites.bolt(), b.x, b.y, Math.atan2(b.vy, b.vx));
      else if (b.kind === "grenade") {
        const k = 1 - b.life / b.maxLife, z = Math.sin(k * Math.PI) * 38;
        drawShadow(b.x, b.y - 3, 5);
        Sprites.draw(ctx, Sprites.grenadeShell(), b.x, b.y - z, b.spin);
      }
    }
  }

  function drawParticlesBase() {
    const smoke = Sprites.smoke();
    for (const p of particles) {
      const k = Math.max(0, p.life / p.max);
      switch (p.t) {
        case "smoke": ctx.globalAlpha = Math.min(1, k * 1.4) * 0.8; Sprites.draw(ctx, smoke, p.x, p.y, p.rot, p.size); break;
        case "blood": ctx.globalAlpha = 1; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size, 0, TAU); ctx.fill(); break;
        case "gib": case "casing": ctx.globalAlpha = 1; Sprites.draw(ctx, p.spr, p.x, p.y - p.z, p.rot); break;
        case "debris": ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.z - p.size / 2, p.size, p.size); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function collectLights() {
    lights.length = 0;
    const p = player, t = run.time;
    lights.push([p.x, p.y, 175, 1]);
    if (p.muzzle > 0) { const m = muzzlePoint(p); lights.push([m.x, m.y, p.weapon.kind === "flame" ? 110 : 170, 0.9]); }
    for (const l of roomLights) lights.push([l.x, l.y, l.r, 0.75 + 0.15 * Math.sin(t * 3 + l.x)]);
    if (run.doorK > 0) lights.push([W / 2, T + 10, 130, run.doorK * 0.8]);
    if (supplyCrate) lights.push([supplyCrate.x, supplyCrate.y, 150, 0.9]);
    let fires = 0;
    for (const q of particles) {
      if (q.t === "flash") lights.push([q.x, q.y, q.r, q.life / q.max]);
      else if (q.t === "fire" && (fires++ & 3) === 0) lights.push([q.x, q.y, 70, (0.6 * q.life) / q.max]);
    }
    for (const b of bullets) if (b.kind === "grenade" || (b.kind === "flame" && Math.random() < 0.3)) lights.push([b.x, b.y, 60, 0.5]);
    for (const b of eBullets) lights.push([b.x, b.y, 45, 0.45]);
    for (const z of zaps) lights.push([z.x2, z.y2, 90, z.life / z.max]);
    for (const e of enemies) {
      if (e.burnT > 0) lights.push([e.x, e.y, 70, 0.6]);
      if (e.def.boss && e.spawnT <= 0) lights.push([e.x, e.y, e.r * 2.6, 0.7]);
    }
    for (let i = 0; i < p.drones; i++) { const d = dronePos(i); lights.push([d.x, d.y, 50, 0.5]); }
  }

  function drawLighting() {
    collectLights();
    const th = theme();
    const [dr, dg, db] = Sprites.themeDark(th);
    const alpha = (th === "hospital" ? 0.4 : 0.48) + (BOSS_ROOMS[run.room] ? 0.06 : 0);
    const lw = lightCanvas.width, lh = lightCanvas.height;
    lctx.globalCompositeOperation = "copy";
    lctx.globalAlpha = 1;
    lctx.fillStyle = `rgba(${dr},${dg},${db},${alpha})`;
    lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = "destination-out";
    const ls = Sprites.light().c;
    for (const [x, y, r, k] of lights) {
      lctx.globalAlpha = Math.min(1, Math.max(0, k));
      lctx.drawImage(ls, (x - r) / LS, (y - r) / LS, (2 * r) / LS, (2 * r) / LS);
    }
    // Taschenlampe in Blickrichtung
    const p = player;
    lctx.globalAlpha = 0.8;
    lctx.save();
    lctx.translate(p.x / LS, p.y / LS);
    lctx.rotate(p.aim);
    lctx.drawImage(ls, 0, -120 / LS, 460 / LS, 240 / LS);
    lctx.restore();
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(lightCanvas, 0, 0, lw * LS, lh * LS);
  }

  function drawZap(z) {
    const k = z.life / z.max;
    const dx = z.x2 - z.x1, dy = z.y2 - z.y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const segs = Math.max(3, Math.round(len / 18));
    ctx.beginPath();
    ctx.moveTo(z.x1, z.y1);
    for (let i = 1; i < segs; i++) { const t = i / segs, o = rand(-9, 9); ctx.lineTo(z.x1 + dx * t + nx * o, z.y1 + dy * t + ny * o); }
    ctx.lineTo(z.x2, z.y2);
    ctx.globalAlpha = k;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(90,180,255,0.6)"; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = "rgba(235,250,255,1)"; ctx.lineWidth = 1.8; ctx.stroke();
    glowAt("127,231,255", z.x2, z.y2, 22, k);
  }

  function drawStreak(rgb, x, y, ang, len, w) {
    const st = Sprites.streak(rgb);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.drawImage(st.c, -len, -w / 2, len, w);
    ctx.restore();
  }

  let flameIdx = 0;
  function drawGlows() {
    const p = player, t = run.time;
    for (const l of roomLights) glowAt(l.rgb, l.x, l.y, l.r * 0.45, 0.35 + 0.1 * Math.sin(t * 3 + l.x));
    // Tür: Lampen und Leuchtpfeile
    const lamp = (run.doorK || 0) > 0.5 ? "140,255,74" : "255,58,42";
    glowAt(lamp, W / 2 - DOOR_W / 2 - 4, T - 12, 12, 0.9);
    glowAt(lamp, W / 2 + DOOR_W / 2 + 4, T - 12, 12, 0.9);
    if (run.doorK > 0) {
      glowAt("140,255,74", W / 2, T, 80, run.doorK * 0.55);
      ctx.strokeStyle = "rgba(140,255,74,1)"; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const y = T + 30 + i * 22 - ((t * 40) % 22);
        ctx.globalAlpha = run.doorK * (0.7 - i * 0.2);
        ctx.beginPath(); ctx.moveTo(W / 2 - 14, y + 8); ctx.lineTo(W / 2, y); ctx.lineTo(W / 2 + 14, y + 8); ctx.stroke();
      }
    }
    if (supplyCrate) glowAt("140,255,74", supplyCrate.x, supplyCrate.y, 60, 0.4 + 0.15 * Math.sin(t * 4));
    for (const o of orbs) if (o.type === "xp") { glowAt("90,200,255", o.x, o.y, 12, 0.8); glowAt("220,250,255", o.x, o.y, 4, 1); }
    // Augen & Statuseffekte der Zombies
    for (const e of enemies) {
      if (e.spawnT > 0) continue;
      const fx = Math.cos(e.face), fy = Math.sin(e.face);
      const hx = e.x + fx * e.r * 0.48, hy = e.y + fy * e.r * 0.48;
      const eye = e.type === "spitter" || e.type === "abom" ? "234,255,0" : e.type === "armored" ? "255,120,60" : "255,40,30";
      glowAt(eye, hx, hy, e.def.boss ? e.r * 0.45 : e.r * 0.75, 0.45);
      if (e.type === "bomber" && Math.sin(t * 14 + e.wob) > 0) glowAt("255,40,20", e.x - fx * e.r * 0.8, e.y - fy * e.r * 0.8, 14, 0.9);
      if (e.type === "spitter") glowAt("183,255,74", hx + fx * e.r * 0.35, hy + fy * e.r * 0.35, 12, 0.55);
      if (e.type === "mother") glowAt("150,255,80", e.x - fx * e.r * 0.4, e.y - fy * e.r * 0.4, e.r * 1.2, 0.35);
      if (e.phase2) glowAt("255,40,60", e.x, e.y, e.r * 1.8, 0.25 + 0.15 * Math.sin(t * 10));
      if (e.slowT > 0) glowAt("150,220,255", e.x, e.y, e.r * 1.3, 0.3);
    }
    // Spieler: Waffen-Aura (Stufe 10), Mündungsfeuer, Zündflamme
    const m = muzzlePoint(p);
    if (p.tier >= 2) glowAt("180,107,255", (p.x + m.x) / 2, (p.y + m.y) / 2, 26, 0.35 + 0.1 * Math.sin(t * 5));
    glowAt("140,255,74", p.x - Math.cos(p.aim) * 1 + Math.sin(p.aim) * 12, p.y - Math.sin(p.aim) * 1 - Math.cos(p.aim) * 12, 5, 0.8);
    if (p.muzzle > 0 && p.weapon.flash) {
      const fs = Sprites.muzzleFlash(p.weapon.flash);
      const sc = rand(0.75, 1.1) * (p.weapon.flash === "flame" ? 0.6 : 1);
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(p.aim + rand(-0.12, 0.12)); ctx.scale(sc, sc);
      ctx.drawImage(fs.c, -8, -24, fs.w, fs.h);
      ctx.restore();
      glowAt(p.weapon.tracer, m.x, m.y, 34, 0.8);
    }
    if (p.weapon.kind === "flame") glowAt("110,200,255", m.x, m.y, 6, 0.9);
    if (p.weapon.kind === "tesla") glowAt("127,231,255", m.x, m.y, 10 + Math.sin(t * 20) * 2, 0.8);
    if (p.weapon.spin && p.spin > 0.3) glowAt("255,150,60", m.x - Math.cos(p.aim) * 14, m.y - Math.sin(p.aim) * 14, 10, (p.spin - 0.3) * 0.8);
    for (let i = 0; i < p.drones; i++) { const d = dronePos(i); glowAt("127,231,255", d.x + 4, d.y, 10, 0.8); }
    // Projektile des Spielers
    for (const b of bullets) {
      if (b.kind === "flame") {
        // Flammen überlappen stark – auf schwächeren Geräten reicht jede zweite
        if (quality < 2 && (++flameIdx & 1)) continue;
        const k = b.life / b.maxLife, size = 14 + (1 - k) * 18;
        glowAt(fireRgb(k), b.x, b.y, size * (quality ? 1.5 : 1.15), 0.95);
        if (quality) glowAt("255,240,190", b.x, b.y, size * 0.55, 0.9 * k);
      } else if (b.kind === "grenade") {
        const k = 1 - b.life / b.maxLife, z = Math.sin(k * Math.PI) * 38;
        glowAt("255,80,40", b.x, b.y - z, 8, Math.sin(t * 20) > 0 ? 0.9 : 0.3);
      } else if (b.kind === "bolt") {
        glowAt(b.tracer, b.x, b.y, 10, 0.5);
      } else {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const len = b.long ? 90 : Math.min(42, Math.max(14, sp * 0.035));
        ctx.globalAlpha = 1;
        drawStreak(b.tracer, b.x, b.y, Math.atan2(b.vy, b.vx), len, Math.max(2.2, b.r * 1.6));
        glowAt(b.tracer, b.x, b.y, b.r * 4, 0.7);
      }
    }
    for (const z of zaps) drawZap(z);
    for (const b of eBullets) glowAt(b.rgb, b.x, b.y, b.r * 3.2, 0.7);
    // Partikel
    for (const q of particles) {
      const k = Math.max(0, q.life / q.max);
      switch (q.t) {
        case "spark": ctx.globalAlpha = k; drawStreak(q.rgb, q.x, q.y, Math.atan2(q.vy, q.vx), Math.min(18, Math.hypot(q.vx, q.vy) * 0.05 + 3), q.w); break;
        case "fire": glowAt(fireRgb(k), q.x, q.y, q.size * (1.5 - k * 0.5), 0.9 * k); break;
        case "ember": glowAt("255,160,60", q.x, q.y, q.size, k); break;
        case "flash": glowAt(q.rgb, q.x, q.y, q.r * 0.6, k * 0.9); break;
        case "ring":
          ctx.globalAlpha = k * 0.8; ctx.strokeStyle = `rgb(${q.rgb})`; ctx.lineWidth = 3 + 6 * k;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.15 - k * 0.8), 0, TAU); ctx.stroke(); break;
        case "bubble": glowAt("140,255,74", q.x, q.y, q.size, k * 0.8); break;
        case "ice": glowAt("170,230,255", q.x, q.y, q.size, k * 0.9); break;
        case "drip": glowAt(q.rgb, q.x, q.y, q.size * 2, k * 0.5); break;
      }
    }
    drawAmbient(true);
    ctx.globalAlpha = 1;
  }

  function drawEnemyBullets() {
    const green = Sprites.acidGlob("183,255,74", "60,120,20"), pink = Sprites.acidGlob("255,106,213", "140,30,100");
    for (const b of eBullets) Sprites.draw(ctx, b.pink ? pink : green, b.x, b.y, 0, (b.r * 2.3) / 24);
  }

  function drawTelegraphs() {
    for (const e of enemies) {
      if (e.mode !== "wind") continue;
      const k = 1 - Math.max(0, e.aiT) / 0.65;
      const len = e.type === "abom" ? 380 : 260;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(e.dirY, e.dirX));
      ctx.fillStyle = `rgba(255,40,40,${0.1 + 0.12 * k})`;
      ctx.fillRect(0, -e.r, len, e.r * 2);
      ctx.fillStyle = `rgba(255,60,60,${0.25 + 0.3 * k})`;
      ctx.fillRect(0, -e.r, len * k, e.r * 2);
      ctx.strokeStyle = "rgba(255,90,90,0.8)"; ctx.lineWidth = 2;
      ctx.strokeRect(0, -e.r, len, e.r * 2);
      ctx.restore();
    }
  }

  function drawBars() {
    for (const e of enemies) {
      if (e.def.boss || e.spawnT > 0 || e.hp >= e.maxHp) continue;
      const w = Math.max(20, e.r * 2), y = e.y - e.r * e.scale - 13;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.def.armor ? "#7fb4ff" : "#e5383b"; ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 3);
    }
    const p = player, bw = 56, k = Math.max(0, p.hp / p.maxHp), y = p.y - 40;
    ctx.fillStyle = "rgba(0,0,0,0.75)"; roundRect(p.x - bw / 2 - 2, y - 2, bw + 4, 10, 4); ctx.fill();
    ctx.fillStyle = k > 0.3 ? "#4ad66d" : "#e5383b"; roundRect(p.x - bw / 2, y, Math.max(3, bw * k), 6, 3); ctx.fill();
    const seg = (100 / p.maxHp) * bw;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    if (seg > 4) for (let x = seg; x < bw * k; x += seg) ctx.fillRect(p.x - bw / 2 + x, y, 1, 6);
    ctx.fillStyle = "#fff"; ctx.font = "800 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(Math.ceil(p.hp), p.x, y - 4);
  }

  function drawTexts() {
    ctx.textAlign = "center";
    for (const t of texts) {
      const age = t.max - t.life;
      const pop = age < 0.1 ? 0.6 + age * 8 : Math.max(1, 1.4 - (age - 0.1) * 3);
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2.5);
      ctx.font = `900 ${Math.round(t.size * pop)}px system-ui`;
      ctx.lineWidth = t.crit ? 5 : 3.5;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawScreenFx() {
    ctx.drawImage(vignette, 0, 0, vignette.width * LS, vignette.height * LS);
    const p = player;
    const low = p.hp / p.maxHp < 0.3 && state === "play" ? 0.25 + 0.15 * Math.sin(run.time * 6) : 0;
    const a = Math.max((p.hurtT / 0.35) * 0.5, low);
    if (a > 0) {
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(hurtVignette, 0, 0, hurtVignette.width * LS, hurtVignette.height * LS);
      ctx.globalAlpha = 1;
    }
  }

  let hudBg = null;
  function drawHud() {
    const p = player, t = run.time;
    if (!hudBg) {
      hudBg = document.createElement("canvas"); hudBg.width = 4; hudBg.height = 100;
      const g = hudBg.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 100);
      gr.addColorStop(0, "rgba(8,11,10,0.98)"); gr.addColorStop(0.8, "rgba(12,17,15,0.95)"); gr.addColorStop(1, "rgba(12,17,15,0.7)");
      g.fillStyle = gr; g.fillRect(0, 0, 4, 100);
    }
    ctx.drawImage(hudBg, 0, 0, W, 98);
    ctx.fillStyle = "rgba(140,255,74,0.3)"; ctx.fillRect(0, 97, W, 1);
    // Level-Abzeichen mit XP-Ring
    const cx = 44, cy = 48;
    ctx.fillStyle = "#070a09"; ctx.beginPath(); ctx.arc(cx, cy, 31, 0, TAU); ctx.fill();
    ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(127,231,255,0.15)"; ctx.beginPath(); ctx.arc(cx, cy, 27, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "#7fe7ff"; ctx.beginPath(); ctx.arc(cx, cy, 27, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.xp / p.xpNeed)); ctx.stroke();
    const lg = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, 22);
    lg.addColorStop(0, "#4a8fd8"); lg.addColorStop(1, "#173a63");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, 21, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "800 9px system-ui"; ctx.fillText("LV", cx, cy - 8);
    ctx.font = "900 19px system-ui"; ctx.fillText(p.level, cx, cy + 10);
    // Kapitel & Raumfortschritt
    ctx.textAlign = "left"; ctx.fillStyle = "#e8efe9"; ctx.font = "800 15px system-ui";
    ctx.fillText(tr("Kapitel {c} · Raum {r}", { c: run.chapter, r: `${run.room}/${ROOMS_PER_CHAPTER}` }), 86, 32);
    for (let i = 1; i <= ROOMS_PER_CHAPTER; i++) {
      const x = 86 + (i - 1) * 13, boss = !!BOSS_ROOMS[i], sup = SUPPLY_ROOMS.includes(i);
      ctx.fillStyle = i < run.room ? "#8cff4a" : i === run.room ? `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t * 6)})` : boss ? "#5a1a1a" : sup ? "#1f3b5c" : "#26302a";
      roundRect(x, 40, 10, boss ? 7 : 5, 2); ctx.fill();
    }
    // Waffe
    const ws = Sprites.weapon(p.weaponId, p.tier, Math.floor(p.barrel));
    const wsc = Math.min(1.1, 56 / ws.w);
    ctx.drawImage(ws.c, 82, 70 - (ws.h * wsc) / 2, ws.w * wsc, ws.h * wsc);
    ctx.fillStyle = "#cfd8d2"; ctx.font = "700 13px system-ui";
    ctx.fillText(p.weapon.name, 86 + ws.w * wsc, 75);
    // Münzen & Kills
    ctx.textAlign = "right"; ctx.font = "800 15px system-ui"; ctx.fillStyle = "#ffc94a";
    const coins = String(Math.floor(run.coins));
    ctx.fillText(coins, W - 92, 52);
    Sprites.draw(ctx, Sprites.coin(Math.floor(t * 8)), W - 100 - ctx.measureText(coins).width, 47);
    ctx.fillStyle = "#8fa396"; ctx.font = "700 13px system-ui";
    ctx.fillText(`☠ ${run.kills}`, W - 92, 75);
    // Boss-Leiste
    const boss = enemies.find((e) => e.def.boss && e.spawnT <= 0);
    if (boss) {
      const bw = W - 90, x = 45, y = T + 14, k = Math.max(0, boss.hp / boss.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.78)"; roundRect(x - 3, y - 3, bw + 6, 22, 11); ctx.fill();
      const gr = ctx.createLinearGradient(x, 0, x + bw, 0);
      gr.addColorStop(0, "#ff4a2a"); gr.addColorStop(1, "#8a0f1a");
      ctx.fillStyle = gr; roundRect(x, y, Math.max(16, bw * k), 16, 8); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.fillRect(x + bw * 0.5 - 1, y, 2, 16);
      ctx.fillStyle = "#fff"; ctx.font = "900 12px system-ui"; ctx.textAlign = "center";
      ctx.fillText(`☠ ${boss.def.name}`, W / 2, y + 12.5);
    }
  }

  function drawJoystick() {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = "rgba(140,255,74,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 70, 0, TAU); ctx.fill(); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const len = Math.min(70, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    const kx = joy.ox + Math.cos(a) * len, ky = joy.oy + Math.sin(a) * len;
    const g = ctx.createRadialGradient(kx - 8, ky - 8, 2, kx, ky, 28);
    g.addColorStop(0, "rgba(200,255,160,0.85)"); g.addColorStop(1, "rgba(80,160,40,0.55)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, 28, 0, TAU); ctx.fill();
  }

  function drawBanner() {
    const k = banner.life / banner.max;
    const alpha = Math.min(1, k * 4, (1 - k) * 8 + 0.2);
    const y = H * 0.36;
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.2, "rgba(0,0,0,0.7)"); g.addColorStop(0.8, "rgba(0,0,0,0.7)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y, W, 96);
    ctx.fillStyle = "rgba(140,255,74,0.6)"; ctx.fillRect(W * 0.15, y, W * 0.7, 2); ctx.fillRect(W * 0.15, y + 94, W * 0.7, 2);
    ctx.textAlign = "center";
    ctx.font = "900 34px system-ui";
    ctx.shadowColor = "rgba(140,255,74,0.8)"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#b6ff7a"; ctx.fillText(banner.title, W / 2, y + 50);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e8efe9"; ctx.font = "600 16px system-ui";
    ctx.fillText(banner.sub, W / 2, y + 78);
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // Hauptschleife
  // ============================================================
  let last = performance.now();
  let lastFrameAt = last;
  let frameDt = 0.016;
  // Automatische Qualitätsanpassung: liegt die Bildrate über 3 s unter ~45 FPS,
  // wird eine Stufe heruntergeschaltet (nur abwärts, damit nichts flackert).
  const perf = { t: 0, sum: 0, n: 0 };
  function trackPerformance(ms) {
    if (ms <= 0 || ms > 1500) return; // Tab im Hintergrund o. Ä.
    perf.t += ms; perf.sum += ms; perf.n++;
    if (perf.t < 3000) return;
    const avg = perf.sum / perf.n;
    perf.t = perf.sum = perf.n = 0;
    if (avg > 22 && quality > 0) {
      quality--;
      save.gfx = quality;
      persist();
      resize();
      console.log(`[Outbreak] Grafikqualität → ${quality} (Ø ${avg.toFixed(1)} ms/Frame)`);
    }
  }
  function loop(now) {
    const real = Math.min(0.033, (now - last) / 1000);
    last = now;
    frameDt = real;
    // Zeitlupe nach Boss-Sieg
    const dt = slowMo > 0 ? real * 0.3 : real;
    if (slowMo > 0) slowMo -= real;
    if (state === "play") { update(dt); trackPerformance(now - lastFrameAt); }
    lastFrameAt = now;
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
    $("menuBest").textContent = save.best.chapter ? tr("Kapitel {c} · Raum {r}", { c: save.best.chapter, r: save.best.room }) : "–";
    const w = WEAPONS[save.equipped], lvl = save.weapons[save.equipped];
    $("menuEquipped").innerHTML = `<img class="eq-ico" src="${Sprites.weaponIcon(save.equipped, weaponTier(lvl))}" alt=""><span>${tr("Ausgerüstet: {w} (Stufe {n})", { w: w.name, n: lvl })}</span>`;
    for (const el of document.querySelectorAll(".coinsVal")) el.textContent = save.coins;
  }

  // Weiche Trennstellen für lange deutsche Komposita (schmale Handys)
  const softHyphen = (name) => name.replace(/(Maschinen|Scharfschützen|Flammen|Granat)/g, "$1\u00AD");

  function renderArmory() {
    const list = $("weaponList");
    list.innerHTML = "";
    for (const [id, w] of Object.entries(WEAPONS)) {
      const lvl = save.weapons[id];
      const row = document.createElement("div");
      row.className = `item${save.equipped === id ? " active" : ""}`;
      const dps = Math.round(w.dmg * w.pellets * w.rate * weaponLvlMult(lvl || 1));
      row.innerHTML = `<div class="ico"><img src="${Sprites.weaponIcon(id, weaponTier(lvl || 1))}" alt=""></div>
        <div><div class="name">${softHyphen(w.name)}</div>${lvl ? `<div class="lvl${lvl >= 5 ? " gold" : ""}">${tr("Stufe {n}", { n: lvl })}</div>` : ""}<div class="desc">${w.desc} · DPS ~${dps}</div></div>
        <div class="acts"></div>`;
      const acts = row.querySelector(".acts");
      if (!lvl) {
        acts.appendChild(actionBtn(tr("Kaufen {p}💰", { p: w.price }), save.coins >= w.price, () => { save.coins -= w.price; save.weapons[id] = 1; save.equipped = id; }));
      } else {
        if (save.equipped !== id) acts.appendChild(actionBtn(tr("Ausrüsten"), true, () => { save.equipped = id; }));
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
    { id: IDS.starter, icon: "🎒", name: tr("Starterpaket"), desc: tr("Werbefrei + 3.000 Münzen + Armbrust"), tag: tr("BESTER DEAL"), owned: () => save.starterOwned },
    { id: IDS.noAds, icon: "🚫", name: tr("Werbefrei"), desc: tr("Keine Zwangswerbung mehr. Bonus-Videos bleiben freiwillig."), owned: () => save.noAds },
    { id: IDS.coinsSmall, icon: "💰", name: tr("Münzbeutel"), desc: tr("1.200 Münzen") },
    { id: IDS.coinsBig, icon: "🏆", name: tr("Münztruhe"), desc: tr("7.000 Münzen"), tag: tr("+45% MEHR") },
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
    if (changed) { sfx("level"); toast(restore ? tr("Kauf wiederhergestellt") : tr("Kauf erfolgreich – danke! ❤️")); }
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
      list.appendChild(shopRow("🎬", tr("Gratis-Münzen"), tr("Kurzes Video ansehen: +{x} Münzen ({l}/{n} heute)", { x: freeCoinAmount(), l: left, n: FREE_COINS_PER_DAY }), "", left > 0 ? tr("▶ Gratis") : tr("Morgen wieder"), left > 0, async (btn) => {
        btn.disabled = true;
        const ok = await Platform.ads.showRewarded("free_coins");
        if (ok) {
          if (save.freeCoins.day !== localDay()) save.freeCoins = { day: localDay(), n: 0 };
          save.freeCoins.n++;
          save.coins += freeCoinAmount();
          persist();
          sfx("coin");
          toast(`+${freeCoinAmount()} 💰`);
        } else toast(tr("Kein Video verfügbar"));
        renderShop();
      }, "ad"));
    }
    const iapReady = Platform.iap.available;
    for (const it of SHOP_ITEMS) {
      if (it.owned && it.owned()) {
        list.appendChild(shopRow(it.icon, it.name, it.desc, it.tag, tr("✓ Gekauft"), false, null));
        continue;
      }
      const prod = iapReady ? Platform.iap.product(it.id) : null;
      const label = prod && prod.price ? prod.price : iapReady ? "…" : tr("In der App");
      list.appendChild(shopRow(it.icon, it.name, it.desc, it.tag, label, !!(prod && prod.canPurchase), async (btn) => {
        btn.disabled = true;
        const ok = await Platform.iap.buy(it.id);
        if (!ok) toast(tr("Kauf abgebrochen"));
        btn.disabled = false;
      }));
    }
    $("shopNote").textContent = Platform.isNative
      ? (iapReady ? tr("Zahlung sicher über Google Play.") : tr("Verbinde mit Google Play …"))
      : tr("Käufe sind in der Android-App verfügbar.");
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
      d.innerHTML = `${tr("Tag {n}", { n: i + 1 })}<b>${done ? "✓" : amount}</b>`;
      grid.appendChild(d);
    });
    $("dailyClaim").disabled = st.claimedToday;
    $("dailyClaim").textContent = st.claimedToday ? tr("Morgen wieder") : tr("Abholen (+{x})", { x: DAILY[st.idx] });
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
    $("soundBtn2").textContent = tr("Sound: {v}", { v: tr(save.sound ? "an" : "aus") });
    $("vibBtn").textContent = tr("Vibration: {v}", { v: tr(save.vibration ? "an" : "aus") });
    $("langBtn").textContent = tr("Sprache: {v}", { v: I18N.lang === "de" ? "Deutsch" : "English" });
    $("gfxBtn").textContent = tr("Grafik: {v}", { v: tr(["Niedrig", "Mittel", "Hoch"][quality]) });
    $("privacyOptsBtn").classList.toggle("hidden", !Platform.isNative);
    $("privacyLink").href = Platform.cfg.privacyUrl || "privacy.html";
    // In der App im selben WebView öffnen: externe Links leitet Capacitor an den Browser weiter,
    // lokale Seiten bleiben per Zurück-Taste erreichbar.
    if (Platform.isNative) $("privacyLink").removeAttribute("target");
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
    if (ok) claimDaily(2); else { toast(tr("Kein Video verfügbar")); b.disabled = false; }
  });
  $("restoreBtn").addEventListener("click", async () => { toast(tr("Suche Käufe …")); await Platform.iap.restore(); renderShop(); });
  $("reviveAdBtn").addEventListener("click", reviveWithAd);
  $("reviveNoBtn").addEventListener("click", () => { if (state === "revive") gameOver(false); });
  $("rerollBtn").addEventListener("click", async () => {
    const fn = rerollHandler;
    if (!fn) return;
    rerollHandler = null;
    $("rerollBtn").classList.add("hidden");
    const ok = await Platform.ads.showRewarded("reroll");
    if (ok && state === "pick") { run.adWatched = true; fn(); } else if (!ok) toast(tr("Kein Video verfügbar"));
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
    } else { b.disabled = false; toast(tr("Kein Video verfügbar")); }
  });
  ui.pauseBtn.addEventListener("click", togglePause);
  $("resumeBtn").addEventListener("click", togglePause);
  $("quitBtn").addEventListener("click", () => gameOver(true));
  const soundBtn = $("soundBtn");
  const syncSound = () => { soundBtn.textContent = tr("Sound: {v}", { v: tr(save.sound ? "an" : "aus") }); renderSettings(); };
  const toggleSound = () => { save.sound = !save.sound; persist(); syncSound(); };
  soundBtn.addEventListener("click", toggleSound);
  $("soundBtn2").addEventListener("click", toggleSound);
  $("vibBtn").addEventListener("click", () => { save.vibration = !save.vibration; persist(); renderSettings(); if (save.vibration) Platform.vibrate(40); });
  $("privacyOptsBtn").addEventListener("click", () => Platform.ads.showPrivacyOptions());
  $("gfxBtn").addEventListener("click", () => {
    quality = (quality + 1) % 3;
    save.gfx = quality;
    persist();
    resize();
    renderSettings();
  });
  $("langBtn").addEventListener("click", () => { I18N.setLang(I18N.lang === "de" ? "en" : "de"); location.reload(); });
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

  I18N.localizeDom();
  Platform.init();
  toMenu();
  console.log("[Outbreak] Spiel gestartet", Platform.cfg.version);

  if (!Platform.isNative && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline-Modus optional */ });
  }

  // Für automatisierte Tests
  window.__outbreak = { get state() { return state; }, get run() { return run; }, get player() { return player; }, get enemies() { return enemies; }, get bullets() { return bullets; }, get particles() { return particles; }, get zaps() { return zaps; }, save, hurt: (d) => hurtPlayer(d), spawn: (t, x, y) => spawnEnemy(t, x, y), freeze: () => { state = "frozen"; player.hurtT = 0; player.invuln = 0; } };
})();
