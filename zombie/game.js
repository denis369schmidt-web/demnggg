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
  // Walker-Outfits je Welt (Index in die Paletten von sprites.js/render3d.js):
  // 0–2 Zivil, 3 Polizist, 4 Bauarbeiter, 5 Anzug, 6 Patient, 7 Ärztin, 8 Pfleger, 9 Forscher, 10 Soldat, 11 Schutzanzug
  const WALKER_LOOKS = { street: [0, 1, 2, 3, 4, 5, 0, 3], hospital: [6, 6, 7, 8, 0, 2], lab: [9, 9, 10, 11, 1, 10] };
  // Zerstörbar: Giftfässer explodieren (Kettenreaktion!), Kisten zersplittern und lassen Beute fallen
  const DESTRUCT = { barrels: 70, crate: 45, medcrate: 45, labcrate: 60 };
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
    gfx: 2, // Grafik: 2 = 3D + Schatten, 1 = 3D, 0 = 2D; passt sich automatisch an die Geräteleistung an
    skin: "soldier",
    skins: { soldier: true },
    boosts: { hp: 0, coins: 0, skill: 0, revive: 0 }, // Vorrat, wird beim nächsten Run verbraucht
    // Lebenszeit-Statistik (Grundlage für Missionen und Erfolge)
    stats: { kills: 0, bosses: 0, elites: 0, rooms: 0, runs: 0, coins: 0, evolutions: 0, headshots: 0, blasts: 0, devil: 0, angel: 0, time: 0, level: 0, survival: 0 },
    missions: { day: "", daily: [], bonus: false, week: "", weekly: [] },
    ach: {}, // Erfolg-ID → Anzahl abgeholter Stufen
    codex: {}, // entdeckte Evolutionen
    pass: { season: 0, xp: 0, premium: 0, free: [], prem: [] },
    patrol: { since: 0, quickDay: "", quick: 0 },
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
          skins: { ...d.skins, ...s.skins },
          boosts: { ...d.boosts, ...s.boosts },
          stats: { ...d.stats, ...s.stats },
          missions: { ...d.missions, ...s.missions },
          ach: { ...s.ach },
          codex: { ...s.codex },
          pass: { ...d.pass, ...s.pass },
          patrol: { ...d.patrol, ...s.patrol },
          txns: Array.isArray(s.txns) ? s.txns : [],
        };
      }
    } catch { /* kein Speicher verfügbar */ }
    return d;
  }
  const save = loadSave();
  // Mit Einführung von 3D bekommt jeder einmal die höchste Stufe (die Auto-Anpassung regelt bei Bedarf herunter)
  if (save.gfxV !== 2) { save.gfx = 2; save.gfxV = 2; }
  if (!save.stats.runs && save.runs) save.stats.runs = save.runs;
  if (!save.patrol.since) save.patrol.since = Date.now();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignorieren */ }
  }

  // ============================================================
  // Waffen
  // ============================================================
  // flash/casing/kick/shake/tracer steuern nur die Optik (Mündungsfeuer, Hülsen, Rückstoß, Leuchtspur)
  const WEAPONS = {
    pistol: { name: "Pistole", desc: "Ausgewogen und präzise.", price: 0, dmg: 22, rate: 2.5, speed: 760, pellets: 1, spread: 0, jitter: 0.02, range: 900, pierce: 0, r: 4, color: "#ffe08a", flash: "std", casing: 1, kick: 2.5, shake: 0, tracer: "255,224,138" },
    shotgun: { name: "Schrotflinte", desc: "5 Schrotkugeln, brutal auf kurze Distanz.", price: 250, dmg: 11, rate: 1.25, speed: 700, pellets: 5, spread: 0.5, jitter: 0.05, range: 380, pierce: 0, r: 3, color: "#ffb36b", flash: "big", casing: 2, kick: 6, shake: 3, tracer: "255,179,107", knock: 12 },
    smg: { name: "Maschinenpistole", desc: "Extrem hohe Feuerrate.", price: 350, dmg: 9, rate: 6.5, speed: 820, pellets: 1, spread: 0, jitter: 0.1, range: 800, pierce: 0, r: 3, color: "#9ee6ff", flash: "std", casing: 1, kick: 1.5, shake: 0, tracer: "158,230,255" },
    magnum: { name: "Magnum", desc: "Schwerer Revolver: durchschlägt, schleudert Zombies weg, Krits lassen sie zerplatzen.", price: 700, dmg: 68, rate: 1.15, speed: 1150, pellets: 1, spread: 0, jitter: 0.01, range: 1000, pierce: 1, r: 4, color: "#ffd08a", crit: 0.1, flash: "big", casing: 0, kick: 7, shake: 3, tracer: "255,200,120", knock: 18, big: true },
    crossbow: { name: "Armbrust", desc: "Bolzen durchschlagen 2 Zombies.", price: 500, dmg: 36, rate: 1.4, speed: 940, pellets: 1, spread: 0, jitter: 0, range: 1000, pierce: 2, r: 5, color: "#c9ff9e", kind: "bolt", flash: "", casing: 0, kick: 2, shake: 0, tracer: "201,255,158" },
    flame: { name: "Flammenwerfer", desc: "Kurze Reichweite, setzt alles in Brand.", price: 800, dmg: 4.5, rate: 14, speed: 430, pellets: 1, spread: 0, jitter: 0.28, range: 240, pierce: 99, r: 9, color: "#ff7b2e", kind: "flame", burn: true, flash: "flame", casing: 0, kick: 0.5, shake: 0, tracer: "255,123,46" },
    rifle: { name: "Sturmgewehr", desc: "Präzises Dauerfeuer mit ordentlich Wumms.", price: 950, dmg: 14, rate: 7, speed: 980, pellets: 1, spread: 0, jitter: 0.06, range: 900, pierce: 0, r: 3, color: "#ffe6a0", flash: "std", casing: 1, kick: 2, shake: 0.4, tracer: "255,230,160", knock: 3 },
    sniper: { name: "Scharfschützengewehr", desc: "Riesiger Schaden, durchschlägt 4 Ziele, +20% Krit.", price: 1100, dmg: 85, rate: 0.75, speed: 1500, pellets: 1, spread: 0, jitter: 0, range: 1400, pierce: 4, r: 3, color: "#ffffff", crit: 0.2, flash: "big", casing: 1, kick: 7, shake: 4, tracer: "230,245,255", long: true, knock: 14 },
    disc: { name: "Sägeblattwerfer", desc: "Sägeblätter zerteilen alles und prallen 3× von Wänden ab.", price: 1250, dmg: 24, rate: 1.6, speed: 560, pellets: 1, spread: 0, jitter: 0.02, range: 1300, pierce: 99, r: 9, color: "#d8dee4", kind: "disc", bounces: 3, flash: "", casing: 0, kick: 3, shake: 0.5, tracer: "220,230,240", knock: 6 },
    grenade: { name: "Granatwerfer", desc: "Explodiert und trifft ganze Horden.", price: 1400, dmg: 42, rate: 1.0, speed: 520, pellets: 1, spread: 0, jitter: 0, range: 520, pierce: 0, r: 7, color: "#b7ff4a", kind: "grenade", aoe: 75, flash: "big", casing: 0, kick: 5, shake: 2, tracer: "183,255,74" },
    cryo: { name: "Kryo-Kanone", desc: "Eisgeschosse frieren Zombies ein – gefroren zerspringen sie.", price: 1600, dmg: 13, rate: 3.2, speed: 680, pellets: 1, spread: 0, jitter: 0.04, range: 700, pierce: 1, r: 6, color: "#9fe8ff", cryo: true, flash: "tesla", casing: 0, kick: 2, shake: 0, tracer: "160,230,255", knock: 2 },
    tesla: { name: "Tesla-Gewehr", desc: "Kettenblitz springt auf 3 weitere Zombies.", price: 2000, dmg: 22, rate: 1.7, speed: 0, pellets: 1, spread: 0, jitter: 0, range: 430, pierce: 0, r: 0, color: "#7fe7ff", kind: "tesla", chain: 3, flash: "tesla", casing: 0, kick: 1.5, shake: 1, tracer: "127,231,255" },
    rocket: { name: "Raketenwerfer", desc: "Zielsuchende Raketen mit riesiger Explosion.", price: 2300, dmg: 60, rate: 0.7, speed: 380, pellets: 1, spread: 0, jitter: 0, range: 900, pierce: 0, r: 7, color: "#ffb36b", kind: "rocket", aoe: 95, flash: "big", casing: 0, kick: 8, shake: 3, tracer: "255,170,90" },
    minigun: { name: "Minigun", desc: "Läuft im Stand warm – dann ein Bleigewitter.", price: 2600, dmg: 8, rate: 13, speed: 900, pellets: 1, spread: 0, jitter: 0.11, range: 820, pierce: 0, r: 3, color: "#ffd36a", spin: true, flash: "big", casing: 1, kick: 1.2, shake: 0.6, tracer: "255,211,106" },
    laser: { name: "Laserkanone", desc: "Gebündelte Energie durchbohrt jede Reihe und verbrennt Zombies.", price: 3200, dmg: 17, rate: 4.2, speed: 2600, pellets: 1, spread: 0, jitter: 0.015, range: 1300, pierce: 99, r: 2.5, color: "#ff4a4a", kind: "laser", long: true, flash: "laser", casing: 0, kick: 1, shake: 0, tracer: "255,70,70" },
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
    hp: { name: "Konstitution", icon: "heartArmor", desc: "+8% max. HP pro Stufe", max: 15 },
    atk: { name: "Schusstraining", icon: "crit", desc: "+6% Schaden pro Stufe", max: 15 },
    speed: { name: "Ausdauer", icon: "run", desc: "+3% Laufgeschwindigkeit pro Stufe", max: 10 },
    greed: { name: "Plünderer", icon: "cash", desc: "+10% Münzen pro Stufe", max: 10 },
  };
  const talentCost = (lvl) => 60 + 60 * lvl;

  // ============================================================
  // Skills (pro Run, Auswahl bei Level-Up)
  // ============================================================
  const SKILLS = [
    { id: "multishot", name: "Mehrfachschuss", icon: "multishot", rarity: "epic", max: 3, desc: "+1 zusätzliche Salve (Schaden −10%)", apply: (p) => { p.multishot++; p.dmgMul *= 0.9; } },
    { id: "front", name: "Doppellauf", icon: "front", rarity: "epic", max: 3, desc: "+1 paralleles Projektil nach vorn", apply: (p) => { p.front++; p.dmgMul *= 0.95; } },
    { id: "diag", name: "Diagonalschüsse", icon: "diag", rarity: "rare", max: 2, desc: "Schießt zusätzlich schräg nach vorn", apply: (p) => p.diag++ },
    { id: "side", name: "Seitenschüsse", icon: "side", rarity: "rare", max: 2, desc: "Schießt zusätzlich nach links und rechts", apply: (p) => p.side++ },
    { id: "rear", name: "Rückendeckung", icon: "rear", rarity: "rare", max: 2, desc: "Schießt zusätzlich nach hinten", apply: (p) => p.rear++ },
    { id: "pierce", name: "Durchschlag", icon: "pierce", rarity: "rare", max: 3, desc: "Projektile durchdringen +1 Zombie", apply: (p) => p.pierce++ },
    { id: "ricochet", name: "Querschläger", icon: "ricochet", rarity: "epic", max: 2, desc: "Projektile springen zu +2 weiteren Zombies", apply: (p) => { p.ricochet += 2; } },
    { id: "wall", name: "Abpraller", icon: "wall", rarity: "rare", max: 2, desc: "Projektile prallen 2× von Wänden ab", apply: (p) => { p.wall += 2; } },
    { id: "atk", name: "Großes Kaliber", icon: "atk", rarity: "common", max: 6, desc: "+25% Schaden", apply: (p) => { p.dmgMul *= 1.25; p.power *= 1.25; } },
    { id: "rate", name: "Schnellfeuer", icon: "rate", rarity: "common", max: 6, desc: "+22% Feuerrate", apply: (p) => { p.rateMul *= 1.22; } },
    { id: "crit", name: "Kopfschuss-Training", icon: "crit", rarity: "common", max: 4, desc: "+10% Krit-Chance, +30% Krit-Schaden", apply: (p) => { p.crit += 0.1; p.critMul += 0.3; } },
    { id: "hp", name: "Zähigkeit", icon: "hp", rarity: "common", max: 6, desc: "+25% max. HP (und heilt um den Bonus)", apply: (p) => { const add = Math.round(p.maxHp * 0.25); p.maxHp += add; p.hp += add; } },
    { id: "heal", name: "Medkit", icon: "heal", rarity: "common", max: 99, desc: "Heilt 40% der max. HP", cond: (p) => p.hp < p.maxHp * 0.85, apply: (p) => healPlayer(p.maxHp * 0.4) },
    { id: "fire", name: "Brandmunition", icon: "fire", rarity: "rare", max: 2, desc: "Treffer setzen Zombies in Brand", apply: (p) => p.burn++ },
    { id: "freeze", name: "Kryo-Munition", icon: "freeze", rarity: "rare", max: 2, desc: "Treffer verlangsamen Zombies stark", apply: (p) => p.freeze++ },
    { id: "poison", name: "Toxin-Munition", icon: "poison", rarity: "rare", max: 2, desc: "Treffer vergiften dauerhaft (stapelbar)", apply: (p) => p.poison++ },
    { id: "blood", name: "Adrenalin", icon: "blood", rarity: "rare", max: 3, desc: "Jeder Kill heilt 2% max. HP", apply: (p) => { p.lifesteal += 0.02; } },
    { id: "orbit", name: "Kreissägen", icon: "orbit", rarity: "epic", max: 3, desc: "+2 rotierende Sägeblätter um dich", apply: (p) => { p.orbit += 2; } },
    { id: "drone", name: "Kampfdrohne", icon: "drone", rarity: "epic", max: 2, desc: "Eine Drohne schießt auch beim Laufen", apply: (p) => p.drones++ },
    { id: "dodge", name: "Reflexe", icon: "dodge", rarity: "common", max: 3, desc: "+12% Ausweichchance", apply: (p) => { p.dodge += 0.12; } },
    { id: "speed", name: "Sprinter", icon: "speed", rarity: "common", max: 3, desc: "+12% Laufgeschwindigkeit", apply: (p) => { p.speed *= 1.12; } },
    { id: "exec", name: "Exekution", icon: "exec", rarity: "epic", max: 2, desc: "8% Chance, normale Zombies sofort zu töten", apply: (p) => { p.headshot += 0.08; } },
    { id: "revive", name: "Zweites Leben", icon: "revive", rarity: "epic", max: 1, desc: "Einmalige Wiederbelebung mit 60% HP", apply: (p) => p.revives++ },
    { id: "splash", name: "Infektionsbombe", icon: "splash", rarity: "rare", max: 2, desc: "Getötete Zombies explodieren", apply: (p) => p.deathBlast++ },
  ];
  const RARITY_WEIGHT = { common: 1, rare: 0.7, epic: 0.45 };

  // ============================================================
  // Evolutionen: zwei Skills auf der nötigen Stufe verschmelzen zu einer Superfähigkeit.
  // Anders als bei der Konkurrenz sind die Rezepte nie geheim: jede Skill-Karte zeigt,
  // wohin sie führt und wie weit du bist; die fertige Evolution erscheint garantiert.
  // ============================================================
  const EVOLUTIONS = [
    { id: "hail", icon: "hail", name: "Kugelhagel", needs: { multishot: 2, rate: 2 }, desc: "Jede 3. Salve feuert zusätzlich einen Ring aus 12 Kugeln", apply: (p) => { p.evo.hail = true; } },
    { id: "inferno", icon: "inferno", name: "Inferno", needs: { fire: 2, splash: 1 }, desc: "Doppelter Brandschaden – brennende Zombies stecken beim Tod alle in der Nähe an", apply: (p) => { p.evo.inferno = true; } },
    { id: "frost", icon: "frost", name: "Absoluter Nullpunkt", needs: { freeze: 2, crit: 2 }, desc: "Treffer auf verlangsamte Zombies sind immer kritisch, unter 30% Leben zerspringen sie", apply: (p) => { p.evo.frost = true; } },
    { id: "blades", icon: "blades", name: "Klingensturm", needs: { orbit: 2, speed: 1 }, desc: "+2 Sägeblätter mit größerem Radius, schneller und 60% tödlicher", apply: (p) => { p.evo.blades = true; p.orbit += 2; p.orbitR = 86; } },
    { id: "swarm", icon: "swarm", name: "Drohnenschwarm", needs: { drone: 2, pierce: 2 }, desc: "+2 Drohnen mit doppelter Feuerrate, ihre Schüsse durchschlagen 2 Zombies", apply: (p) => { p.evo.swarm = true; p.drones += 2; } },
    { id: "vamp", icon: "vamp", name: "Blutrausch", needs: { blood: 2, hp: 2 }, desc: "Kills heilen zusätzlich 3% – unter 35% Leben richtest du 50% mehr Schaden an", apply: (p) => { p.evo.vamp = true; p.lifesteal += 0.03; } },
    { id: "chain", icon: "chain", name: "Kettenreaktion", needs: { ricochet: 1, wall: 1 }, desc: "Jeder Querschläger und jeder Abpraller löst eine Mini-Explosion aus", apply: (p) => { p.evo.chain = true; } },
    { id: "plague", icon: "plagueDoc", name: "Seuche", needs: { poison: 2, exec: 1 }, desc: "Vergiftete Zombies unter 25% Leben sterben sofort – beim Tod springt das Gift über", apply: (p) => { p.evo.plague = true; } },
  ];
  const skillById = (id) => SKILLS.find((s) => s.id === id);
  const evoReady = (p, ev) => !p.evo[ev.id] && Object.entries(ev.needs).every(([id, n]) => (p.skills[id] || 0) >= n);
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
    rat: { name: "Seuchenratte", r: 7, hp: 10, speed: 175, dmg: 5, xp: 1, coins: [0, 1], cost: 0.45, pack: 5, blood: RED },
    leaper: { name: "Springer", r: 14, hp: 55, speed: 85, dmg: 16, xp: 3, coins: [1, 2], cost: 2, blood: RED },
    burner: { name: "Brenner", r: 15, hp: 75, speed: 78, dmg: 14, xp: 3, coins: [1, 3], cost: 2.5, blood: RED, fireproof: true },
    screamer: { name: "Kreischer", r: 14, hp: 70, speed: 70, dmg: 10, xp: 3, coins: [1, 2], cost: 2.5, blood: RED },
    splitter: { name: "Teiler", r: 19, hp: 110, speed: 48, dmg: 16, xp: 4, coins: [1, 3], cost: 3, split: 3, blood: PURPLE },
    electro: { name: "Elektro-Zombie", r: 15, hp: 95, speed: 58, dmg: 14, xp: 4, coins: [1, 3], cost: 3, blood: GREEN },
    abom: { name: "ABSCHEULICHKEIT", r: 48, hp: 2200, speed: 60, dmg: 30, xp: 40, coins: [40, 60], boss: true, blood: PURPLE },
    mother: { name: "BRUTMUTTER", r: 52, hp: 2700, speed: 34, dmg: 28, xp: 50, coins: [50, 80], boss: true, blood: GREEN },
  };
  for (const [type, def] of Object.entries(ZOMBIES)) Sprites.registerRadius(type, def.r);

  I18N.localizeData({ weapons: WEAPONS, talents: TALENTS, skills: SKILLS, zombies: ZOMBIES, evolutions: EVOLUTIONS });

  // ============================================================
  // DOM
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const view = $("view");
  const canvas3d = $("game3d");
  const ui = {
    menu: $("menu"), armory: $("armory"), talents: $("talents"), skillPick: $("skillPick"),
    pause: $("pause"), over: $("over"), pauseBtn: $("pauseBtn"),
    shop: $("shop"), daily: $("daily"), settings: $("settings"), revive: $("revive"),
    missions: $("missions"), pass: $("pass"), patrol: $("patrol"), codex: $("codex"),
  };
  const overlays = Object.values(ui).filter((o) => o !== ui.pauseBtn);
  // UI-Bausteine: Icons aus dem Sprite, Münzbeträge, Sechseck-Medaillons, Fortschritts-Pips
  const I = (name, cls = "") => GameIcons.html(name, cls);
  const num = (v) => Math.floor(v).toLocaleString(I18N.lang);
  const coinAmt = (n, sign = "") => `<span class="amt">${I("coin")}<b>${sign}${num(n)}</b></span>`;
  const medal = (icon, tone = "", size = "") => `<span class="medal ${tone} ${size}">${I(icon)}</span>`;
  const pipsHtml = (on, max, cls = "") => `<span class="pips ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</span>`;
  const adLabel = (txt) => `<span class="vid">${I("video")}</span><span>${txt}</span>`;
  const RARITY_TONE = { common: "steel", rare: "ice", epic: "violet", evo: "gold", angel: "gold", devil: "red" };
  const RARITY_NAME = { common: "Gewöhnlich", rare: "Selten", epic: "Episch", evo: "Evolution", angel: "Segen", devil: "Pakt" };
  for (const el of document.querySelectorAll("[data-ic]")) el.innerHTML = I(el.dataset.ic);

  let curOverlay = null;
  function show(el) {
    curOverlay = el;
    for (const o of overlays) o.classList.toggle("hidden", o !== el);
    ui.pauseBtn.classList.toggle("hidden", el !== null);
    requestAnimationFrame(() => fitTitle(el));
  }
  // Bildschirmtitel auf schmalen Displays verkleinern statt abschneiden (lange Wörter, großer Münzstand)
  function fitTitle(el) {
    const h = el && !el.classList.contains("hidden") && el.querySelector(".bar h2");
    if (!h) return;
    h.style.fontSize = "";
    for (let px = parseFloat(getComputedStyle(h).fontSize); h.scrollWidth > h.clientWidth + 1 && px > 18; px--) h.style.fontSize = `${px - 1}px`;
  }

  let scale = 1;
  let dpr = 1;
  // Grafikqualität: 2 = 3D mit Schatten, 1 = 3D ohne Schatten, 0 = klassisches 2D.
  // Ohne WebGL bleiben es drei 2D-Stufen (Auflösung & Partikelmenge).
  let quality = Math.max(0, Math.min(2, save.gfx ?? 2));
  let gfxLocked = false; // für Tests: keine automatische Anpassung
  const QUALITY_DPR = [1, 1.5, 2];
  // Dynamische Auflösung: unter Last zuerst die 3D-Auflösung stufenweise senken (kaum sichtbar),
  // erst danach eine ganze Qualitätsstufe (Schatten aus bzw. 2D)
  const RES_STEPS = [1, 0.85, 0.72];
  let resStep = 0;
  const QUALITY_PARTICLES = [350, 600, 900];
  // 3D (WebGL) wird beim ersten Bedarf gestartet; schlägt das fehl, läuft das Spiel in 2D.
  let webgl = null;
  let mode3d = false;
  function init3d() {
    if (webgl === null) {
      webgl = false;
      try { webgl = !!(window.Render3D && Render3D.init(canvas3d, { W, H, L, T, R, B, DOOR_W })); } catch (e) { console.warn("[Outbreak] 3D-Start fehlgeschlagen", e); }
    }
    return webgl;
  }
  // Verliert Android den WebGL-Kontext (z. B. App im Hintergrund), solange 2D zeichnen
  let glLost = false;
  canvas3d.addEventListener("webglcontextlost", () => { glLost = true; resize(); console.warn("[Outbreak] WebGL-Kontext verloren – 2D bis zur Wiederherstellung"); });
  canvas3d.addEventListener("webglcontextrestored", () => { glLost = false; resize(); });
  function resize() {
    mode3d = quality > 0 && !glLost && init3d();
    dpr = Math.min(window.devicePixelRatio || 1, QUALITY_DPR[quality]);
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    view.style.width = `${W * scale}px`;
    view.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    Sprites.setRes(scale * dpr);
    view.classList.toggle("three", mode3d);
    if (mode3d) {
      Render3D.setQuality(quality);
      // 3D-Auflösung bewusst begrenzt: Füllrate ist auf Handys der Engpass, das HUD bleibt trotzdem scharf
      Render3D.resize(W * scale, H * scale, Math.min(window.devicePixelRatio || 1, quality >= 2 ? 1.5 : 1) * RES_STEPS[resStep]);
    }
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
  let corpses = []; // Leichen mit Physik – bleiben bis zum nächsten Raum
  let pieces = []; // abgetrennte Köpfe/Gliedmaßen
  let hazards = []; // brennende Pfützen am Boden
  let zaps = [];
  let ambient = [];
  let roomLights = [];
  let slowMo = 0;
  let hitStop = 0; // Sekundenbruchteile Standbild bei wuchtigen Treffern
  let roomFade = 0; // Abblende beim Raumwechsel (1 → 0)
  let cineT = 0; // Kinobalken-Zeit nach Boss-Tod
  let cine = 0; // sichtbare Kinobalken (0–1)
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
      tier: weaponTier(wlvl), kick: 0, spin: 0, barrel: 0, hurtT: 0, skin: save.skin,
      evo: {}, orbitR: 64, volleys: 0,
    };
  }

  let lastMode = "campaign";
  function startRun(mode = "campaign") {
    ensureAudio();
    lastMode = mode;
    run = {
      mode, chapter: 1, room: 0, kills: 0, coins: 0, greed: 1 + 0.1 * save.talents.greed, time: 0, pendingPicks: 0, cleared: false,
      adRevived: false, adWatched: false, earned: 0,
    };
    // Überlebensmodus: Welt wechselt täglich
    if (mode === "survival") Object.assign(run, { survT: 0, spawnCd: 1.2, theme: THEME_ORDER[Math.floor(Date.now() / 864e5) % THEME_ORDER.length] });
    track("runs");
    player = newPlayer();
    // Goldener Held: +10 % Münzen
    if (save.skin === "gold") run.greed *= 1.1;
    // Gekaufte Boosts für diesen Run verbrauchen
    const used = [];
    const b = save.boosts;
    const boostName = (id) => BOOSTS.find((q) => q.id === id).name;
    if (b.hp > 0) { b.hp--; player.maxHp = Math.round(player.maxHp * 1.3); player.hp = player.maxHp; used.push(boostName("hp")); }
    if (b.coins > 0) { b.coins--; run.greed *= 1.5; used.push(boostName("coins")); }
    if (b.revive > 0) { b.revive--; player.revives++; used.push(boostName("revive")); }
    if (b.skill > 0) { b.skill--; run.pendingPicks++; used.push(boostName("skill")); }
    if (used.length) persist();
    if (webgl) Render3D.clear();
    nextRoom();
    roomFade = 0; // beim Start übernimmt der Kameraflug aus dem Menü die Überblendung
    if (used.length) setTimeout(() => toast(`${tr("Boosts aktiv")}: ${used.join(" · ")}`, "gift"), 300);
    show(null);
    state = "play";
  }

  // ============================================================
  // Räume
  // ============================================================
  function resetRoomState() {
    enemies = []; bullets = []; eBullets = []; orbs = []; particles = []; corpses = []; pieces = []; hazards = []; zaps = []; volleyQueue.length = 0;
    roomFade = 1;
    run.doorK = 0;
    supplyCrate = null;
    player.vx = player.vy = 0;
    player.invuln = 1;
    run.cleared = false;
  }

  function nextRoom() {
    if (run.mode === "survival") { setupSurvival(); return; }
    run.room++;
    if (run.room > ROOMS_PER_CHAPTER) {
      const bonus = Math.round(100 * run.chapter * run.greed);
      run.coins += bonus;
      run.chapter++;
      run.room = 1;
      showBanner(tr("KAPITEL {n} ÜBERLEBT", { n: run.chapter - 1 }), tr("+{b} Münzen · Die Seuche wird stärker…", { b: bonus }));
    }
    resetRoomState();
    player.x = W / 2; player.y = B - 70;

    const isBoss = BOSS_ROOMS[run.room];
    const isSupply = SUPPLY_ROOMS.includes(run.room);
    obstacles = isSupply ? [] : genObstacles(isBoss ? randi(0, 2) : randi(2, 5));
    floorCanvas = makeFloor();
    roomLights = obstacles.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3, src: o }));
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

  const theme = () => (run && run.theme) || THEME_ORDER[((run ? run.chapter : 1) - 1) % THEME_ORDER.length];

  // ============================================================
  // Überlebensmodus: 5 Minuten in einer Arena, die Wellen werden immer dichter und härter
  // ============================================================
  const SURVIVAL_TIME = 300;
  const SURVIVAL_BOSSES = [[150, "abom"], [260, "mother"]];
  const SURVIVAL_POOL = [
    [0, ["walker", "walker", "crawler", "runner"]],
    [25, ["dog", "spitter", "rat"]],
    [60, ["leaper", "bomber", "walker"]],
    [100, ["burner", "screamer", "armored"]],
    [140, ["brute", "splitter", "electro", "runner"]],
  ];
  function setupSurvival() {
    run.room = 1;
    resetRoomState();
    player.x = W / 2; player.y = (T + B) / 2 + 140;
    obstacles = genObstacles(3);
    floorCanvas = makeFloor();
    roomLights = obstacles.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3, src: o }));
    initAmbient();
    showBanner(tr("ÜBERLEBEN"), tr("Halte 5 Minuten durch!"), 2);
  }
  // Spawnpunkt mit Abstand zum Helden – nie direkt neben ihm
  function survivalSpot() {
    for (let i = 0; i < 40; i++) {
      const p = { x: rand(L + 30, R - 30), y: rand(T + 40, B - 40), r: 26 };
      if ((p.x - player.x) ** 2 + (p.y - player.y) ** 2 > 230 * 230 && !obstacles.some((o) => circleRectOverlap(p, o))) return p;
    }
    return { x: player.x < W / 2 ? R - 40 : L + 40, y: T + 60 };
  }
  function updateSurvival(dt) {
    run.survT += dt;
    // Leben & Schaden wachsen wie in späteren Räumen (spawnEnemy rechnet mit run.room)
    run.room = 1 + Math.floor(run.survT / 15);
    if (run.survT >= SURVIVAL_TIME) { gameOver(false, true); return; }
    run.spawnCd -= dt;
    if (run.spawnCd <= 0 && enemies.length < 34 + Math.floor(run.survT / 30)) {
      run.spawnCd = Math.max(0.5, 2 - run.survT / 170);
      const pool = SURVIVAL_POOL.filter(([t]) => run.survT >= t).flatMap(([, l]) => l);
      const type = pick(pool), def = ZOMBIES[type];
      const n = def.pack || (run.survT > 90 && Math.random() < 0.4 ? 2 : 1);
      const pos = survivalSpot();
      for (let i = 0; i < n; i++) spawnEnemy(type, pos.x + rand(-18, 18), pos.y + rand(-18, 18));
    }
    for (const [t, type] of SURVIVAL_BOSSES) {
      if (run.survT < t || run[`boss_${type}`]) continue;
      run[`boss_${type}`] = true;
      const pos = survivalSpot();
      spawnEnemy(type, pos.x, pos.y);
      showBanner(tr("BOSS: {name}", { name: ZOMBIES[type].name }), tr("Noch {s}", { s: fmtTime(SURVIVAL_TIME - run.survT) }));
    }
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
      if (DESTRUCT[kind]) o.hp = DESTRUCT[kind] * (1 + 0.3 * ((run ? run.chapter : 1) - 1));
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
  let floorDirty = false;
  function stamp(spr, x, y, ang = 0, sc = 1, alpha = 1) {
    if (!floorCtx) return;
    floorDirty = true;
    floorCtx.globalAlpha = alpha;
    Sprites.draw(floorCtx, spr, x, y, ang, sc);
    floorCtx.globalAlpha = 1;
  }
  function stampDot(x, y, r, color) {
    if (!floorCtx || x < L || x > R || y < T || y > B) return;
    floorDirty = true;
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
    const th = theme();
    if (room >= 3 || ch > 1) pool.push("rat");
    if (room >= 5 || ch > 1) pool.push("leaper");
    if (room >= 7 || ch > 1) pool.push("burner", ...(th === "street" ? ["burner"] : []));
    if (room >= 9 || ch > 1) pool.push("screamer", ...(th === "hospital" ? ["screamer"] : []));
    if (room >= 12 || ch > 1) pool.push("splitter");
    if (room >= 14 || ch > 1) pool.push("electro", ...(th === "lab" ? ["electro", "electro"] : []));
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
      blocked: 0, side: Math.random() < 0.5 ? -1 : 1, bladeCd: 0, wob: rand(0, 6), phase2: false, kvx: 0, kvy: 0, lastHit: null,
      face: Math.PI / 2, anim: rand(0, 8), variant: type === "walker" ? pick(WALKER_LOOKS[theme()]) : randi(0, 2), scale: def.boss ? 1 : rand(0.93, 1.08), hitAng: rand(0, TAU),
      rageT: 0, jumpZ: 0, elite: false,
    };
    // Elite: goldene Aura, dreifaches Leben, mehr Beute (ab Raum 4, häufiger in späteren Kapiteln)
    if (!def.boss && !def.pack && (room >= 4 || ch > 1) && Math.random() < 0.04 + 0.03 * (ch - 1)) {
      e.elite = true; e.hp *= 3; e.maxHp *= 3; e.dmg *= 1.3; e.scale *= 1.22;
    }
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
    p.orbitAng += dt * (p.evo.blades ? 6.5 : 4.2);
    if (p.orbit > 0) {
      for (let i = 0; i < p.orbit; i++) {
        const a = p.orbitAng + (i / p.orbit) * Math.PI * 2;
        const bx = p.x + Math.cos(a) * p.orbitR, by = p.y + Math.sin(a) * p.orbitR;
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.bladeCd > 0) continue;
          if ((e.x - bx) ** 2 + (e.y - by) ** 2 < (e.r + 11) ** 2) {
            e.bladeCd = 0.35;
            e.hitAng = a + Math.PI / 2;
            fxSparks(bx, by, a + Math.PI / 2, 0.6, 4, "255,230,170", 260);
            damageEnemy(e, p.power * (p.evo.blades ? 1.3 : 0.8), { saw: true });
          }
        }
      }
    }

    // Drohnen
    if (p.drones > 0) {
      p.droneCd -= dt;
      if (p.droneCd <= 0) {
        p.droneCd = 0.9 / p.drones / (p.evo.swarm ? 2 : 1);
        const t = nearestEnemy(p);
        if (t) {
          const d = dronePos(Math.floor(Math.random() * p.drones));
          const a = Math.atan2(t.y - d.y, t.x - d.x);
          bullets.push(makeBullet(d.x, d.y, a, { dmg: p.power * 0.9, speed: 650, r: 3, color: "#7fe7ff", life: 1.6, tracer: "127,231,255", pierce: p.evo.swarm ? 2 : 0 }));
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
    player.volleys++;
    if (player.evo.hail && player.volleys % 3 === 0) ringShot(12);
  }

  // Kugelhagel: Ring aus Kugeln rund um den Helden (Schaden an der Grundkraft, nicht an der Waffe,
  // damit Flammenwerfer & Co. nicht benachteiligt sind)
  function ringShot(n) {
    const p = player, off = rand(0, TAU / n);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      bullets.push(makeBullet(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, { dmg: p.power * 0.9, speed: 640, r: 4, color: "#ffd36a", life: 1.1, pierce: 1, tracer: "255,211,106" }));
    }
    fxRing(p.x, p.y, 46, "255,211,106", 0.3);
  }

  // Kettenreaktion: kleine Explosion ohne Bildschirmwackeln (sonst wird es bei vielen Abprallern unruhig)
  function miniBlast(x, y, r, dmg) {
    fxRing(x, y, r, "255,190,90", 0.25);
    fxFlash(x, y, r * 1.5, "255,170,80", 0.12);
    fxSparks(x, y, 0, Math.PI, 6, "255,200,120", 260);
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2) damageEnemy(e, dmg, { aoe: true });
    }
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
          life: w.range / w.speed, pierce: w.pierce + p.pierce, wall: p.wall + (w.bounces || 0), rico: p.ricochet,
          kind: w.kind, aoe: w.aoe, burn: w.burn ? 1 + p.burn : p.burn, freeze: w.cryo ? 1.5 + p.freeze : p.freeze, poison: p.poison, player: true,
          tracer: w.tracer, long: w.long, knock: w.knock, wid: p.weaponId, big: !!(w.big || w.long || w.pellets > 1),
          cryo: !!w.cryo, bounces: w.bounces || 0,
        }));
      }
    }
    // Hülsen auswerfen (rechte Seite der Waffe)
    if (w.casing && (w.rate < 5 || Math.random() < 0.45)) {
      const c = Math.cos(aim), sn = Math.sin(aim);
      fxCasing(p.x + c * 8 - sn * 6, p.y + sn * 8 + c * 6, aim + Math.PI / 2 + rand(-0.4, 0.4), w.casing === 2);
    }
    if (w.kind === "grenade" || w.kind === "rocket") fxSmoke(mz.x, mz.y, 2, 0.6, 0.6);
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
      hit: new Set(), dead: false, tracer: o.tracer || "255,240,200", long: !!o.long, knock: o.knock || 0, spin: rand(0, TAU), wid: o.wid || "", big: !!o.big,
      cryo: !!o.cryo, target: null,
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
    hitStop = Math.max(hitStop, 0.05);
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
    const ring = document.querySelector("#revive .val");
    ring.style.animation = "none"; void ring.getBoundingClientRect(); ring.style.animation = "";
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
    if (!ok) { toast(tr("Kein Video verfügbar"), "video"); gameOver(false); return; }
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
      b.spin += dt * (b.kind === "disc" ? 26 : 14);
      if (b.kind === "rocket") {
        // Zielsuche: sanft auf den nächsten Zombie eindrehen und beschleunigen
        if (!b.target || b.target.dead) b.target = nearestEnemy(b);
        const sp = Math.min(760, Math.hypot(b.vx, b.vy) + 520 * dt);
        let a = Math.atan2(b.vy, b.vx);
        if (b.target) { let da = Math.atan2(b.target.y - b.y, b.target.x - b.x) - a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; a += clamp(da, -4 * dt, 4 * dt); }
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        if (Math.random() < 0.7) fxSmoke(b.x - Math.cos(a) * 10, b.y - Math.sin(a) * 10, 1, 0.45, 0.6);
        if (Math.random() < 0.6) fxFire(b.x - Math.cos(a) * 8, b.y - Math.sin(a) * 8, 0.5, 0.18);
      }
      if (b.kind === "flame") {
        if (Math.random() < 0.15 + 0.15 * quality) fxFire(b.x + rand(-6, 6), b.y + rand(-6, 6), 0.9, 0.3);
        if (Math.random() < 0.25) fxEmber(b.x, b.y);
        if (Math.random() < 0.06) fxSmoke(b.x, b.y, 1, 0.5, 0.7);
      }
      if (b.life <= 0) { if (b.aoe) explode(b.x, b.y, b.aoe, b.dmg, true); b.dead = true; continue; }

      // Arena-Wände
      let bounced = false;
      if (b.x < L || b.x > R) { if (b.wall > 0) { b.vx *= -1; b.x = px; bounced = true; } else b.dead = true; }
      if (b.y < T || b.y > B) { if (b.wall > 0) { b.vy *= -1; b.y = py; bounced = true; } else b.dead = true; }
      // Hindernisse
      for (const o of obstacles) {
        if (b.dead || !pointInRect(b.x, b.y, o)) continue;
        if (o.hp) hitObstacle(o, b.kind === "flame" ? b.dmg * 0.5 : b.dmg);
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
      if (bounced) {
        b.wall--; b.hit.clear();
        if (b.kind === "disc") { fxSparks(b.x, b.y, rand(0, TAU), Math.PI, 8, "255,230,170", 260); sfx("hit"); }
        if (player.evo.chain) miniBlast(b.x, b.y, 42, b.dmg * 0.6);
      }
      if (b.dead) { if (b.aoe) explode(b.x, b.y, b.aoe, b.dmg, true); continue; }

      for (const e of enemies) {
        if (e.dead || e.spawnT > 0 || b.hit.has(e)) continue;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (e.r + b.r) ** 2) continue;
        if (b.aoe) { explode(b.x, b.y, b.aoe, b.dmg, true); b.dead = true; break; }
        b.hit.add(e);
        damageEnemy(e, b.dmg, { bullet: b });
        if (b.rico > 0) {
          const next = nearestEnemy(e, b.hit);
          if (next) {
            const sp = Math.hypot(b.vx, b.vy);
            const a = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
            b.rico--; b.life = Math.max(b.life, 0.8);
            if (player.evo.chain) miniBlast(b.x, b.y, 42, b.dmg * 0.6);
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

  function addHazard(x, y, r, life, dmg) {
    if (hazards.length > 40) hazards.shift();
    hazards.push({ x, y, r, life, max: life, dmg });
    if (Math.random() < 0.5) stamp(Sprites.scorch(), x, y, rand(0, TAU), r / 40, 0.35);
  }
  function updateHazards(dt) {
    for (const h of hazards) {
      h.life -= dt;
      if (Math.random() < 0.3) fxFire(h.x + rand(-h.r, h.r) * 0.6, h.y + rand(-h.r, h.r) * 0.6, 0.7, 0.45);
      if ((player.x - h.x) ** 2 + (player.y - h.y) ** 2 < (h.r + player.r * 0.5) ** 2) hurtPlayer(h.dmg);
    }
    hazards = hazards.filter((h) => h.life > 0);
  }
  function hitObstacle(o, dmg) {
    if (!o.hp || o.dead) return;
    o.hp -= dmg;
    if (o.hp <= 0) destroyObstacle(o);
  }
  function destroyObstacle(o) {
    o.dead = true;
    obstacles = obstacles.filter((q) => q !== o);
    roomLights = roomLights.filter((l) => l.src !== o);
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.kind === "barrels") {
      splatter(cx, cy, rand(0, TAU), 1.6, GREEN);
      for (let i = 0; i < 6; i++) fxBubble(cx + rand(-20, 20), cy + rand(-20, 20));
      explode(cx, cy, 100, player.power * 4, true);
    } else {
      const col = o.kind === "crate" ? "#7a5a34" : o.kind === "medcrate" ? "#dfe2dc" : "#56606a";
      fxDebris(cx, cy, 0, Math.PI, 22, col);
      fxDebris(cx, cy, 0, Math.PI, 8, "#4e3820");
      fxSmoke(cx, cy, 4, 0.9, 0.9);
      shake = Math.max(shake, 5);
      hitStop = Math.max(hitStop, 0.04);
      sfx("kill");
      for (let i = randi(2, 4); i > 0; i--) orbs.push(makeOrb(cx, cy, "coin", 1));
      if (o.kind === "medcrate" || Math.random() < 0.25) orbs.push(makeOrb(cx, cy, "heal", 0.15));
    }
  }

  function explode(x, y, radius, dmg, byPlayer) {
    shake = Math.max(shake, 9);
    hitStop = Math.max(hitStop, 0.06);
    if (save.vibration) Platform.vibrate(25);
    sfx("boom");
    fxFlash(x, y, radius * 1.7, "255,190,90", 0.28);
    fxRing(x, y, radius, "255,200,120", 0.35);
    for (let i = 0; i < 12; i++) fxFire(x + rand(-radius, radius) * 0.45, y + rand(-radius, radius) * 0.45, 2.2, rand(0.35, 0.6));
    fxSmoke(x, y, 7, 1.8, rand(1.2, 1.8));
    fxSparks(x, y, 0, Math.PI, 16, "255,200,120", 420);
    fxDebris(x, y, 0, Math.PI, 12, "#3a3028");
    // Feuerball (nur 3D zeichnet ihn; immer anlegen, unabhängig vom Partikel-Limit)
    particles.push({ t: "boom", x, y, r: radius, life: 0.75, max: 0.75 });
    stamp(Sprites.scorch(), x, y, rand(0, TAU), radius / 40, 0.85);
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = Math.sqrt(dist2(e, { x, y }));
      if (d < radius + e.r) {
        e.hitAng = Math.atan2(e.y - y, e.x - x);
        if (!e.def.boss) { const f = 520 * (1 - d / (radius + e.r)) * (e.type === "brute" ? 0.35 : 1); e.kvx += Math.cos(e.hitAng) * f; e.kvy += Math.sin(e.hitAng) * f; }
        damageEnemy(e, byPlayer ? dmg : dmg * 2, { aoe: true });
      }
    }
    if (!byPlayer && Math.sqrt(dist2(player, { x, y })) < radius + player.r) hurtPlayer(dmg);
    blastBodies(x, y, radius * 1.6);
    for (const o of obstacles.slice()) {
      if (!o.hp || o.dead) continue;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if ((cx - x) ** 2 + (cy - y) ** 2 < radius * radius) hitObstacle(o, Math.max(dmg, 40) * 2);
    }
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
      // Absoluter Nullpunkt: verlangsamte Zombies werden immer kritisch getroffen
      if (Math.random() < critChance || (p.evo.frost && e.slowT > 0)) { dmg *= p.critMul; crit = true; }
      if (p.evo.vamp && p.hp < p.maxHp * 0.35) dmg *= 1.5;
      if (!e.def.boss && p.headshot > 0 && Math.random() < p.headshot) { dmg = e.hp; crit = true; exec = true; }
      // … und zerspringen unter 30 % Leben
      if (p.evo.frost && e.slowT > 0 && !e.def.boss && e.hp - dmg < e.maxHp * 0.3) { dmg = e.hp; crit = true; exec = true; o.shatter = true; }
    }
    // Panzerung (Riot-Zombie) schluckt einen Teil des Schadens – Exekution ignoriert sie
    if (e.def.armor && !o.silent && !exec) dmg *= 1 - e.def.armor;
    const b = o.bullet;
    if (b) {
      e.hitAng = Math.atan2(b.vy, b.vx);
      if (b.burn && !e.def.fireproof) { e.burnT = 2.5; e.burnDps = Math.max(e.burnDps, p.power * 0.35 * b.burn * (p.evo.inferno ? 2 : 1)); }
      if (b.freeze) { e.slowT = 1.2 + 0.6 * b.freeze; if (b.cryo && Math.random() < 0.5) fxIce(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r)); }
      if (b.poison) e.poisonDps = Math.min(e.poisonDps + p.power * 0.08 * b.poison, p.power * 1.5 * b.poison);
      if (!e.def.boss && b.kind !== "flame") {
        // Rückstoß als Geschwindigkeit (klingt in updateEnemies ab) – schwere Zombies wanken weniger
        const heavy = e.type === "brute" || e.type === "armored";
        const k = (heavy ? 35 : 90) + (b.knock || 0) * (heavy ? 3 : 10);
        const len = Math.hypot(b.vx, b.vy) || 1;
        e.kvx += (b.vx / len) * k; e.kvy += (b.vy / len) * k;
      }
    }
    e.lastHit = {
      kind: o.shatter ? "cryo" : o.aoe ? "blast" : o.saw || (b && b.kind === "disc") ? "slice" : b ? (b.kind === "tesla" ? "shock" : b.kind === "flame" || b.kind === "laser" ? "burn" : b.cryo ? "cryo" : "shot") : "other",
      crit, big: !!(b && b.big), force: b ? 140 + (b.knock || 0) * 14 : o.aoe ? 420 : 160, ang: e.hitAng,
    };
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
    if (e.hp <= 0) { if (crit) hitStop = Math.max(hitStop, 0.03); killEnemy(e); }
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    run.kills++;
    const def = e.def;
    fxBlood(e.x, e.y, e.hitAng, def.boss ? 40 : 12, def.blood, def.boss ? 320 : 220);
    fxGibs(e.x, e.y, def.boss ? 14 : randi(2, 4), def.blood);
    splatter(e.x, e.y, e.hitAng, def.boss ? 2.4 : 0.7 + e.r / 40, def.blood);
    spawnCorpse(e);
    track("kills");
    if (e.elite) track("elites");
    if (def.boss) { track("bosses"); addPassXp(60); }
    if (e.death === "headshot") track("headshots");
    else if (e.death === "blast" || e.death === "burst") track("blasts");
    sfx(def.boss ? "boom" : "kill");
    // Inferno / Seuche: brennende bzw. vergiftete Zombies stecken beim Tod ihre Nachbarn an
    if (player.evo.inferno && e.burnT > 0) spreadToNeighbors(e, 95, (q) => { if (!q.def.fireproof) { q.burnT = 2.5; q.burnDps = Math.max(q.burnDps, e.burnDps); } }, "255,140,40");
    if (player.evo.plague && e.poisonDps > 0) spreadToNeighbors(e, 90, (q) => { q.poisonDps = Math.max(q.poisonDps, e.poisonDps * 0.8); }, "150,255,60");
    if (def.boss) {
      shake = 18;
      slowMo = 0.9;
      fxFlash(e.x, e.y, 320, "255,240,200", 0.5);
      fxRing(e.x, e.y, 160, "255,220,160", 0.6);
      particles.push({ t: "boom", x: e.x, y: e.y, r: 110, life: 1.1, max: 1.1 });
      cineT = 2.2;
    }

    const xpVal = def.xp * (1 + run.room * 0.04) * (1 + (run.chapter - 1) * 0.5);
    const nx = def.boss ? 12 : Math.max(1, Math.round(def.xp / 2));
    for (let i = 0; i < nx; i++) orbs.push(makeOrb(e.x, e.y, "xp", xpVal / nx));
    const nc = randi(def.coins[0], def.coins[1]);
    for (let i = 0; i < nc; i++) orbs.push(makeOrb(e.x, e.y, "coin", 1));

    if (player.lifesteal > 0) healPlayer(player.maxHp * player.lifesteal);
    if (def.split) for (let i = 0; i < def.split; i++) { const q = spawnEnemy("crawler", e.x + rand(-14, 14), e.y + rand(-14, 14)); q.spawnT = 0.12; q.kvx = rand(-260, 260); q.kvy = rand(-260, 260); }
    if (e.type === "burner") { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; addHazard(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, 16, 2.6, e.dmg * 0.6); } fxFlash(e.x, e.y, 120, "255,140,40", 0.2); }
    if (e.elite) { for (let i = 0; i < nc * 2 + 3; i++) orbs.push(makeOrb(e.x, e.y, "coin", 1)); fxRing(e.x, e.y, 60, "255,210,90", 0.4); }
    if (e.type === "bomber") explode(e.x, e.y, 70, e.dmg, false);
    else if (player.deathBlast > 0) explode(e.x, e.y, 45 + 15 * player.deathBlast, player.power * 1.2 * player.deathBlast, true);
    if (e.type === "abom" || e.type === "mother") {
      for (let i = 0; i < 4 + run.chapter; i++) orbs.push(makeOrb(e.x, e.y, "coin", 3));
    }
  }

  function spreadToNeighbors(e, r, fn, rgb) {
    fxRing(e.x, e.y, r, rgb, 0.35);
    for (const q of enemies) if (!q.dead && q !== e && q.spawnT <= 0 && (q.x - e.x) ** 2 + (q.y - e.y) ** 2 < r * r) fn(q);
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
      if (e.poisonDps > 0) {
        e.hp -= e.poisonDps * dt;
        if (Math.random() < 0.12) fxBubble(e.x + rand(-e.r, e.r) * 0.7, e.y + rand(-e.r, e.r) * 0.5);
        if (p.evo.plague && !e.def.boss && e.hp < e.maxHp * 0.25) { e.hp = 0; fxRing(e.x, e.y, e.r * 2, "150,255,60", 0.3); }
      }
      if (e.slowT > 0 && Math.random() < 0.1) fxIce(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r));
      if (e.hp <= 0) { killEnemy(e); continue; }
      const slow = e.slowT > 0 ? 0.45 : 1;
      e.slowT = Math.max(0, e.slowT - dt);
      // Rückstoß / Druckwelle: Körper wird weggeschoben und taumelt kurz
      let stagger = 1;
      if (e.kvx || e.kvy) {
        e.x += e.kvx * dt; e.y += e.kvy * dt;
        const f = Math.exp(-9 * dt), kv = Math.hypot(e.kvx, e.kvy);
        e.kvx *= f; e.kvy *= f;
        if (kv < 4) e.kvx = e.kvy = 0;
        if (kv > 110) stagger = 0.25;
      }

      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx = dx / d, my = dy / d;
      let sp = e.speed * slow * stagger;
      if (e.rageT > 0) { e.rageT -= dt; sp *= 1.55; }

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
        case "leaper": {
          // duckt sich, dann weiter Sprung auf den Spieler (Warnlinie während des Duckens)
          e.cd -= dt;
          if (e.mode === "leap") {
            mx = e.dirX; my = e.dirY; sp = 400 * slow; e.aiT -= dt;
            e.jumpZ = Math.sin(Math.min(1, 1 - e.aiT / 0.5) * Math.PI) * 55;
            if (e.aiT <= 0) { e.mode = "walk"; e.jumpZ = 0; fxDebris(e.x, e.y, 0, Math.PI, 6, "#5a4a3a"); fxRing(e.x, e.y, 34, "200,200,200", 0.25); shake = Math.max(shake, 2); }
          } else if (e.mode === "crouch") {
            sp = 0; e.aiT -= dt; e.dirX = mx; e.dirY = my;
            if (e.aiT <= 0) { e.mode = "leap"; e.aiT = 0.5; }
          } else if (d < 330 && d > 90 && e.cd <= 0) { e.mode = "crouch"; e.aiT = 0.45; e.cd = rand(2.2, 3.2); }
          break;
        }
        case "burner": {
          // brennt dauerhaft und hinterlässt Feuerpfützen
          e.cd -= dt;
          if (Math.random() < 0.4) fxFire(e.x + rand(-6, 6), e.y + rand(-6, 6), 0.8, 0.4);
          if (e.cd <= 0) { e.cd = 0.55; addHazard(e.x, e.y, 15, 3.2, e.dmg * 0.6); }
          break;
        }
        case "screamer": {
          // hält Abstand; Schrei macht Zombies in der Nähe rasend (schneller)
          if (d < 190) { mx = -mx; my = -my; } else if (d < 310) { const t = mx; mx = -my * e.side; my = t * e.side; sp *= 0.5; }
          e.cd -= dt;
          if (e.mode === "scream") { sp = 0; e.aiT -= dt; if (e.aiT <= 0) e.mode = "walk"; }
          else if (e.cd <= 0) {
            e.cd = rand(3.8, 5.2); e.mode = "scream"; e.aiT = 0.7;
            fxRing(e.x, e.y, 230, "210,120,255", 0.6); fxRing(e.x, e.y, 130, "255,150,255", 0.45);
            shake = Math.max(shake, 3); sfx("hurt");
            for (const q of enemies) if (q !== e && !q.def.boss && dist2(q, e) < 230 * 230) q.rageT = 3.2;
          }
          break;
        }
        case "electro": {
          // lädt sich auf (Warnkreis), dann Stromschlag im Umkreis
          e.cd -= dt;
          if (e.mode === "zap") {
            sp = 0; e.aiT -= dt;
            if (Math.random() < 0.5) fxSparks(e.x + rand(-10, 10), e.y + rand(-10, 10), rand(0, TAU), 1, 2, "127,231,255", 200);
            if (e.aiT <= 0) {
              e.mode = "walk";
              fxRing(e.x, e.y, 150, "127,231,255", 0.35); fxFlash(e.x, e.y, 140, "127,231,255", 0.15);
              for (let i = 0; i < 4; i++) { const a = rand(0, TAU), r2 = rand(60, 150); zaps.push({ x1: e.x, y1: e.y, x2: e.x + Math.cos(a) * r2, y2: e.y + Math.sin(a) * r2, life: 0.2, max: 0.2 }); }
              if (d < 150 + p.r) { zaps.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, life: 0.25, max: 0.25 }); hurtPlayer(e.dmg * 1.4); }
              sfx("zap");
            }
          } else if (d < 175 && e.cd <= 0) { e.mode = "zap"; e.aiT = 0.75; e.cd = rand(2.6, 3.6); }
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

      // Kontaktschaden (nicht mitten im Sprung)
      if (e.jumpZ < 20 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (p.r + e.r - 2) ** 2) hurtPlayer(e.dmg);
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
    if (run.mode !== "survival" && !run.cleared && !supplyCrate && enemies.length === 0) roomCleared();
  }

  function roomCleared() {
    run.cleared = true;
    track("rooms");
    sfx("door");
    addText(W / 2, T + 40, tr("TÜR OFFEN ↑"), "#8cff4a", 22);
    if (BOSS_ROOMS[run.room]) {
      healPlayer(player.maxHp * 0.2);
      run.shrineT = 1.6;
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
      if ((run.cleared && o.t > 0.4) || d < (run.mode === "survival" ? 120 : 80)) {
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
        else if (o.type === "heal") { healPlayer(p.maxHp * o.val); fxRing(p.x, p.y, 40, "120,255,140", 0.35); sfx("coin"); }
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
      particles.push({ t: "lvl", x: p.x, y: p.y, life: 1.3, max: 1.3 });
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

  // Rezept-Fortschritt für eine Evolution, z. B. "Abpraller 1/2 + Feuerrate 2/2"
  const evoProgress = (ev) => Object.entries(ev.needs).map(([id, n]) => `${skillById(id).name} ${Math.min(n, player.skills[id] || 0)}/${n}`).join(" + ");
  function evoHint(s) {
    const ev = EVOLUTIONS.find((q) => !player.evo[q.id] && q.needs[s.id]);
    if (!ev) return "";
    const ing = Object.entries(ev.needs).map(([id, n]) => {
      const have = Math.min(n, player.skills[id] || 0);
      return `<span class="ing${have >= n ? " ok" : ""}">${medal(skillById(id).icon, have >= n ? "toxic" : "steel")}${have}/${n}</span>`;
    }).join('<span class="arr">+</span>');
    return `${ing}<span class="arr">→</span>${medal(ev.icon, "gold")}${ev.name}`;
  }
  function takeEvolution(ev) {
    const p = player;
    ev.apply(p);
    track("evolutions");
    save.codex[ev.id] = true;
    showBanner(tr("EVOLUTION"), ev.name, 1.8);
    fxRing(p.x, p.y, 120, "255,211,106", 0.6);
    fxFlash(p.x, p.y, 220, "255,220,140", 0.35);
    particles.push({ t: "lvl", x: p.x, y: p.y, life: 1.3, max: 1.3 });
    if (save.vibration) Platform.vibrate(60);
  }

  // Engel & Teufel: nach jedem Bosssieg ein Fremder mit Segen – oder einem Pakt
  function openShrine() {
    const p = player;
    sfx("level");
    const cards = [
      { icon: "angel", name: tr("Engelssegen"), desc: tr("Volle Heilung und +15% max. HP"), rarity: "angel", onPick: () => {
        p.maxHp = Math.round(p.maxHp * 1.15); healPlayer(p.maxHp);
        fxRing(p.x, p.y, 90, "255,250,200", 0.5); track("angel"); resumePlay();
      } },
      { icon: "dove", name: tr("Göttliche Gabe"), desc: tr("Wähle sofort einen zusätzlichen Skill"), rarity: "angel", onPick: () => { track("angel"); run.pendingPicks++; resumePlay(); } },
    ];
    const epics = () => SKILLS.filter((s) => s.rarity === "epic" && (p.skills[s.id] || 0) < s.max);
    if (epics().length) cards.push({ icon: "devil", name: tr("Teufelspakt"), desc: tr("2 zufällige epische Skills – kostet dauerhaft 25% max. HP"), rarity: "devil", onPick: () => {
      p.maxHp = Math.max(60, Math.round(p.maxHp * 0.75)); p.hp = Math.min(p.hp, p.maxHp);
      const got = [];
      for (let i = 0; i < 2; i++) { const pool = epics(); if (!pool.length) break; const s = pick(pool); takeSkill(s); got.push(s.name); }
      fxFlash(p.x, p.y, 200, "255,40,40", 0.35); fxRing(p.x, p.y, 110, "255,60,60", 0.5);
      track("devil"); toast(got.join(" + "), "devil"); resumePlay();
    } });
    renderCards(tr("EIN FREMDER ERSCHEINT"), cards, null, tr("Segen oder Pakt – du hast die Wahl"));
  }

  let rerollHandler = null;
  function renderCards(title, cards, onReroll = null, sub = tr("Wähle eine Fähigkeit")) {
    $("skillPick").classList.toggle("shrine", cards.some((c) => c.rarity === "angel"));
    rerollHandler = onReroll;
    $("rerollBtn").classList.toggle("hidden", !(onReroll && Platform.ads.available));
    $("skillTitle").textContent = title;
    $("skillSub").textContent = sub;
    const box = $("skillCards");
    box.innerHTML = "";
    for (const c of cards) {
      const btn = document.createElement("button");
      btn.className = `card ${c.rarity || ""}`;
      // Stufen-Pips: wie weit dieser Skill nach der Wahl ist
      const sk = c.id && SKILLS.includes(skillById(c.id)) && c.max <= 6 ? pipsHtml((player.skills[c.id] || 0) + 1, c.max) : "";
      const hint = c.hint ? `<div class="recipe evo-hint">${c.hint}</div>` : "";
      btn.innerHTML = `${medal(c.icon)}<div><div class="rar">${tr(RARITY_NAME[c.rarity] || "Fähigkeit")}</div><div class="name">${c.name}${sk}</div><div class="desc">${c.desc}</div>${hint}</div>`;
      btn.addEventListener("click", () => c.onPick(), { once: true });
      box.appendChild(btn);
    }
    joy.active = false;
    state = "pick";
    show(ui.skillPick);
  }

  function openSkillPick(rerolled = false) {
    if (!rerolled) { run.pendingPicks--; sfx("level"); trackMax("level", player.level); }
    // Fertiges Rezept: Evolution erscheint garantiert als erste Karte
    const ready = EVOLUTIONS.filter((ev) => evoReady(player, ev));
    const choices = rollSkills(ready.length ? 2 : 3);
    if (!choices.length && !ready.length) { resumePlay(); return; }
    const cards = choices.map((s) => ({ ...s, hint: evoHint(s), onPick: () => { takeSkill(s); resumePlay(); } }));
    if (ready.length) {
      const ev = ready[0];
      cards.unshift({ icon: ev.icon, name: ev.name, desc: ev.desc, rarity: "evo", onPick: () => { takeEvolution(ev); resumePlay(); } });
    }
    renderCards(tr("AUFSTIEG!"), cards, rerolled ? null : () => openSkillPick(true));
  }

  function openSupply() {
    sfx("level");
    renderCards(tr("NACHSCHUB"), [
      { icon: "firstAid", name: tr("Erste Hilfe"), desc: tr("Heilt 50% deiner max. HP"), rarity: "common", onPick: () => { healPlayer(player.maxHp * 0.5); afterSupply(); } },
      { icon: "ammo", name: tr("Waffenkiste"), desc: tr("Wähle einen zusätzlichen Skill"), rarity: "epic", onPick: () => { run.pendingPicks++; afterSupply(); } },
    ], null, tr("Versorgungskiste geöffnet"));
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

  // ============================================================
  // Tode & Körper-Physik
  // ============================================================
  // Todesart nach Ursache: Kopfschuss, Zerplatzen, durch die Luft geschleudert, verkohlt,
  // eingefroren & zersprungen, Stromschlag, zersägt – oder einfach umgerissen.
  const MAX_LIVE_CORPSES = 14; // ältere, ruhende Leichen werden "eingebacken" (2D: Boden, 3D: Sammel-Mesh)
  function deathOf(e) {
    const h = e.lastHit || {}, def = e.def;
    if (def.boss) return "boss";
    if (e.type === "bomber") return "burst";
    if (h.kind === "blast") return Math.random() < 0.35 ? "burst" : "blast";
    if (h.kind === "shock") return "shock";
    if (e.slowT > 0 && (h.kind === "cryo" || Math.random() < 0.6)) return "freeze";
    if (h.kind === "burn" || e.burnT > 0.3) return "burn";
    if (h.kind === "slice") return "slice";
    if (h.crit && (h.big || e.r < 11)) return "burst";
    if (h.crit && e.type !== "crawler") return "headshot";
    return "shot";
  }
  function spawnCorpse(e) {
    const death = deathOf(e), h = e.lastHit || {}, ang = h.ang ?? e.hitAng;
    e.death = death;
    const zh = e.r * 2.4 * e.scale; // ungefähre Kopfhöhe
    if (death === "burst") {
      fxGibs(e.x, e.y, 9, e.def.blood);
      fxBlood(e.x, e.y, ang, 26, e.def.blood, 300);
      splatter(e.x, e.y, ang, 1.5 + e.r / 30, e.def.blood);
      fxFlash(e.x, e.y, 60, "160,20,20", 0.12);
      for (let i = 0; i < 3; i++) addPiece(e, i === 0 && Math.random() < 0.6 ? "head" : "limb", ang + rand(-1.2, 1.2), rand(160, 320), rand(180, 360));
      shake = Math.max(shake, 5);
      return;
    }
    const c = {
      type: e.type, v: e.variant, f: Math.floor(e.anim) % Sprites.FRAMES, x: e.x, y: e.y, z: 0, r: e.r * 0.8,
      face: e.face, sc: e.scale, t: 0, blood: e.def.blood, boss: e.def.boss, ref: e, death,
      vx: 0, vy: 0, vz: 0, spin: rand(-1, 1), roll: 0, rollV: 0, fall: 0, settled: false, headless: false,
      // umkippen in Schussrichtung: Treffer von vorn → nach hinten, von hinten → nach vorn
      fallDir: Math.cos(ang - e.face) < 0 ? 1 : -1, side: Math.random() < 0.5 ? -1 : 1,
    };
    const push = (f, up = 0) => { c.vx = Math.cos(ang) * f; c.vy = Math.sin(ang) * f; c.vz = up; };
    switch (death) {
      case "headshot":
        c.headless = true;
        push(h.force * 0.8);
        addPiece(e, "head", ang + rand(-0.4, 0.4), rand(180, 280), rand(260, 380), zh);
        for (let i = 0; i < 14; i++) addP({ t: "blood", x: e.x, y: e.y, z: zh * 0.85, vx: rand(-50, 50), vy: rand(-50, 50), vz: rand(160, 320), life: 1.5, max: 1.5, color: e.def.blood, size: rand(1.6, 3) });
        break;
      case "blast":
        push(rand(260, 420), rand(320, 520));
        c.spin = rand(-9, 9); c.rollV = rand(-8, 8);
        if (Math.random() < 0.5) addPiece(e, "limb", ang + rand(-1, 1), rand(200, 380), rand(300, 480), zh * 0.6);
        if (Math.random() < 0.25) { c.headless = true; addPiece(e, "head", ang + rand(-0.8, 0.8), rand(200, 380), rand(320, 500), zh); }
        break;
      case "burn":
        push(40);
        for (let i = 0; i < 8; i++) fxFire(e.x + rand(-e.r, e.r) * 0.6, e.y + rand(-e.r, e.r) * 0.6, 1 + e.r / 30, rand(0.5, 0.9));
        fxSmoke(e.x, e.y, 3, 0.8, 1.4);
        break;
      case "freeze":
        for (let i = 0; i < 6; i++) fxIce(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r));
        break;
      case "shock":
        fxSparks(e.x, e.y, 0, Math.PI, 10, "160,240,255", 260);
        break;
      case "slice":
        push(h.force * 1.4); c.spin = rand(-14, 14);
        fxBlood(e.x, e.y, ang + Math.PI / 2, 14, e.def.blood, 260);
        if (Math.random() < 0.5) addPiece(e, "limb", ang + Math.PI / 2 * c.side, rand(150, 260), rand(120, 220), zh * 0.6);
        break;
      case "boss":
        push(60, 0);
        break;
      default:
        push(h.force || 150, h.force > 250 ? 120 : 0);
    }
    corpses.push(c);
  }
  // Kopf oder Gliedmaße als eigenes Physik-Objekt
  function addPiece(e, kind, ang, speed, up, z = e.r * 1.6) {
    if (pieces.length > 90) pieces.shift();
    pieces.push({
      kind, type: e.type, v: e.variant, sc: e.scale * (e.r / 15), blood: e.def.blood,
      x: e.x, y: e.y, z, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, vz: up,
      rx: rand(0, TAU), ry: rand(0, TAU), wx: rand(-14, 14), wy: rand(-14, 14), settled: false, t: 0,
    });
  }
  // Druckwelle schleudert Leichen und Körperteile weg
  function blastBodies(x, y, radius) {
    for (const c of corpses) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > radius || c.death === "freeze") continue;
      const k = 1 - d / radius, a = Math.atan2(c.y - y, c.x - x);
      c.vx += Math.cos(a) * 420 * k; c.vy += Math.sin(a) * 420 * k; c.vz += 300 * k;
      c.spin += rand(-8, 8) * k; c.rollV += rand(-6, 6) * k; c.settled = false;
    }
    for (const q of pieces) {
      const d = Math.hypot(q.x - x, q.y - y);
      if (d > radius) continue;
      const k = 1 - d / radius, a = Math.atan2(q.y - y, q.x - x);
      q.vx += Math.cos(a) * 480 * k; q.vy += Math.sin(a) * 480 * k; q.vz += 380 * k; q.wx += rand(-10, 10); q.settled = false;
    }
  }
  // Physik: Flug mit Schwerkraft, Aufprall mit Blut, Rutschen mit Reibung, Abprallen an Wänden
  const bodyProbe = { x: 0, y: 0, r: 8 };
  function moveBody(b, dt, r, bounce) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.vz -= GRAVITY * dt;
    let landed = false;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -160) { landed = true; b.vz = -b.vz * bounce; } else b.vz = 0;
    }
    if (b.z === 0) { const f = Math.exp(-5.5 * dt); b.vx *= f; b.vy *= f; }
    bodyProbe.x = b.x; bodyProbe.y = b.y; bodyProbe.r = r;
    const ox = b.x, oy = b.y;
    collideWorld(bodyProbe);
    // abprallen: Geschwindigkeit an der Kontaktnormalen spiegeln – die Normale ist die
    // Verschiebung durchs Herausdrücken (Hindernisse UND Raumwände, die collideWorld nur klemmt)
    const nx = bodyProbe.x - ox, ny = bodyProbe.y - oy, nl = Math.hypot(nx, ny);
    if (nl > 0.01) {
      const vn = (b.vx * nx + b.vy * ny) / nl;
      if (vn < 0) { b.vx -= 1.6 * vn * nx / nl; b.vy -= 1.6 * vn * ny / nl; }
    }
    b.x = bodyProbe.x; b.y = bodyProbe.y;
    return landed;
  }
  function updateCorpses(dt) {
    for (const c of corpses) {
      c.t += dt;
      if (c.death === "freeze") {
        // kurz als Eisstatue stehen, dann zerspringen
        if (c.t > 0.55) {
          c.gone = true;
          fxDebris(c.x, c.y, 0, Math.PI, 18, "#bfe9ff");
          fxDebris(c.x, c.y, 0, Math.PI, 8, "#6fa8c8");
          for (let i = 0; i < 8; i++) fxIce(c.x + rand(-14, 14), c.y + rand(-14, 14));
          fxSparks(c.x, c.y, 0, Math.PI, 10, "200,240,255", 240);
          sfx("hit");
        }
        continue;
      }
      if (c.death === "shock" && c.t < 0.6) { if (Math.random() < 0.4) fxSparks(c.x + rand(-8, 8), c.y + rand(-8, 8), rand(0, TAU), 1, 2, "160,240,255", 160); continue; }
      const fallTime = c.death === "burn" ? 1.1 : c.death === "shock" ? 1.0 : c.death === "boss" ? 1.4 : 0.42;
      c.fall = Math.min(1, c.t / fallTime);
      if (c.death === "burn" && c.t < 2.5 && Math.random() < 0.3) { fxFire(c.x + rand(-8, 8), c.y + rand(-8, 8), 0.7, 0.5); if (Math.random() < 0.3) fxEmber(c.x, c.y); }
      if (c.headless && c.t < 1.2 && Math.random() < 0.5) addP({ t: "blood", x: c.x, y: c.y, z: 8 + (1 - c.fall) * 20, vx: rand(-40, 40), vy: rand(-40, 40), vz: rand(60, 200), life: 1, max: 1, color: c.blood, size: rand(1.2, 2.4) });
      if (c.settled) continue;
      const fast = Math.hypot(c.vx, c.vy);
      if (moveBody(c, dt, c.r, 0.25)) { splatter(c.x, c.y, Math.atan2(c.vy, c.vx), 0.5 + c.r / 40, c.blood); shake = Math.max(shake, 2); }
      if (c.z > 0) c.roll += c.rollV * dt; else { c.rollV *= Math.exp(-6 * dt); c.roll += (Math.round(c.roll / Math.PI) * Math.PI - c.roll) * Math.min(1, dt * 6); }
      c.face += c.spin * dt;
      c.spin *= c.z > 0 ? 1 : Math.exp(-5 * dt);
      // Blutspur beim Rutschen
      if (c.z === 0 && fast > 60 && Math.random() < 0.6) stampDot(c.x + rand(-3, 3), c.y + rand(-3, 3), rand(1.5, 3), c.blood);
      if (c.z === 0 && fast < 8 && c.t > fallTime) c.settled = true;
    }
    // Spieler schiebt herumliegende Körper beim Laufen etwas an
    if (player && player.moving) {
      for (const c of corpses) {
        if (!c.settled || c.death === "freeze") continue;
        const dx = c.x - player.x, dy = c.y - player.y, d = Math.hypot(dx, dy);
        if (d < c.r + player.r && d > 0.1) { c.vx += (dx / d) * 90; c.vy += (dy / d) * 90; c.spin += rand(-2, 2); c.settled = false; }
      }
    }
    for (const q of pieces) {
      if (q.settled) continue;
      q.t += dt;
      if (moveBody(q, dt, 4, 0.45)) { stampDot(q.x, q.y, 2.5, q.blood); q.wx *= 0.6; q.wy *= 0.6; }
      q.rx += q.wx * dt; q.ry += q.wy * dt;
      if (q.z === 0) { q.wx *= Math.exp(-6 * dt); q.wy *= Math.exp(-6 * dt); if (Math.random() < 0.3) stampDot(q.x, q.y, 1.4, q.blood); }
      if (q.z === 0 && Math.hypot(q.vx, q.vy) < 6 && q.t > 0.4) q.settled = true;
    }
    // Zu viele Leichen: die ältesten ruhenden einbacken (bleiben sichtbar, kosten aber nichts mehr)
    let live = corpses.length;
    for (const c of corpses) { if (live <= MAX_LIVE_CORPSES) break; if (c.settled && !c.gone) { bakeCorpse(c); c.baked = true; live--; } }
    corpses = corpses.filter((c) => !c.gone && !c.baked);
  }
  function bakeCorpse(c) {
    // In 3D übernimmt der Renderer den Körper in sein Sammel-Mesh – nur in 2D als Bild auf den Boden
    if (!mode3d) stamp(Sprites.zombieFx(c.type, c.f, c.v, "corpse"), c.x, c.y, c.face + c.fallDir * 0.4, c.sc * 0.88, 0.8);
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
    updateCorpses(dt);
    for (const z of zaps) z.life -= dt;
    zaps = zaps.filter((z) => z.life > 0);
    updateAmbient(dt);
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
    shake = Math.max(0, shake - dt * 30);
    roomFade = Math.max(0, roomFade - frameDt * 2.2);
    cineT = Math.max(0, cineT - frameDt);
  }

  // ============================================================
  // Spielablauf
  // ============================================================
  function update(dt) {
    run.time += dt;
    updatePlayer(dt);
    if (state !== "play") return;
    if (run.mode === "survival") { updateSurvival(dt); if (state !== "play") return; }
    updateEnemies(dt);
    updateHazards(dt);
    updateBullets(dt);
    updateOrbs(dt);
    if (supplyCrate) supplyCrate.bob += dt;
    if (run.cleared) run.doorK = Math.min(1, (run.doorK || 0) + dt * 1.8);
    // Fremder nach dem Bosssieg (wartet, bis Level-ups abgearbeitet sind)
    if (run.shrineT > 0 && state === "play" && run.pendingPicks === 0) {
      run.shrineT -= dt;
      if (run.shrineT <= 0) openShrine();
    }
    // Level-up: kurze Zeitlupe mit Lichtsäule, dann erst die Skill-Karten
    if (state === "play" && run.pendingPicks > 0) {
      if (run.pickDelay === undefined) { run.pickDelay = 0.2; slowMo = Math.max(slowMo, 0.75); player.invuln = Math.max(player.invuln, 1); }
      run.pickDelay -= dt;
      if (run.pickDelay <= 0) { run.pickDelay = undefined; openSkillPick(); }
    }
  }

  function togglePause() {
    if (state === "play") {
      state = "pause";
      joy.active = false;
      const grid = $("pauseSkills");
      const cell = (icon, tone, name, n, cls = "") => `<div class="sk ${cls}">${medal(icon, tone)}<em>${name}</em>${n > 1 ? `<b>${n}</b>` : ""}</div>`;
      let html = "";
      for (const ev of EVOLUTIONS) if (player.evo[ev.id]) html += cell(ev.icon, "gold", ev.name, 1, "evo");
      for (const sk of SKILLS) if (player.skills[sk.id]) html += cell(sk.icon, RARITY_TONE[sk.rarity], sk.name, player.skills[sk.id]);
      // angefangene Rezepte als Ausblick
      for (const ev of EVOLUTIONS) {
        if (player.evo[ev.id] || !Object.keys(ev.needs).some((id) => player.skills[id])) continue;
        const have = Object.entries(ev.needs).reduce((a, [id, n]) => a + Math.min(n, player.skills[id] || 0), 0), need = Object.values(ev.needs).reduce((a, n) => a + n, 0);
        html += cell(ev.icon, "gold", `${ev.name}<small>${have}/${need}</small>`, 1, "todo evo-todo");
      }
      grid.innerHTML = html || `<p class="empty">${tr("Noch keine Skills")}</p>`;
      show(ui.pause);
    } else if (state === "pause") {
      ensureAudio();
      state = "play";
      show(null);
    }
  }

  function gameOver(quit, won = false) {
    state = "over";
    joy.active = false;
    clearInterval(reviveTimer);
    const surv = run.mode === "survival";
    if (won) run.coins += Math.round(300 * run.greed); // Siegprämie im Überlebensmodus
    const coins = Math.round(run.coins);
    run.earned = coins;
    save.coins += coins;
    save.runs++;
    track("coins", coins);
    track("time", Math.round(run.time));
    let record = false;
    if (surv) {
      const s = Math.floor(Math.min(run.survT, SURVIVAL_TIME));
      record = s > (save.stats.survival || 0);
      trackMax("survival", s);
      addPassXp(Math.floor(s / 2));
    } else {
      const score = run.chapter * 100 + run.room;
      if (score > save.best.chapter * 100 + save.best.room) { save.best = { chapter: run.chapter, room: run.room }; record = true; }
    }
    persist();
    const title = $("overTitle");
    title.textContent = won ? tr("ÜBERLEBT!") : quit ? tr("EINSATZ BEENDET") : tr("GEFALLEN");
    title.classList.toggle("win", won);
    const reached = surv ? `${fmtTime(Math.min(run.survT, SURVIVAL_TIME))} / ${fmtTime(SURVIVAL_TIME)}` : tr("Kap. {c} · Raum {r}", { c: run.chapter, r: run.room });
    const line = (icon, label, value, cls = "") => `<span>${I(icon)}${label}</span><b class="${cls}">${value}</b>`;
    $("overStats").innerHTML =
      line(surv ? "stopwatch" : "map", surv ? tr("Überlebt") : tr("Erreicht"), `${reached}${record ? `<em class="rec">${tr("REKORD")}</em>` : ""}`) +
      line("skull", tr("Abschüsse"), num(run.kills)) +
      line("upgrade", tr("Level"), player.level) +
      line("hourglass", tr("Zeit"), fmtTime(run.time)) +
      line("coin", tr("Münzen"), coinAmt(coins, "+"), "gold");
    const dbl = $("doubleBtn");
    dbl.classList.toggle("hidden", !(Platform.ads.available && coins > 0));
    dbl.disabled = false;
    dbl.innerHTML = adLabel(tr("Münzen ×2"));
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

  // Schnittstelle für den 3D-Renderer (nur lesend)
  const world3d = {
    get state() { return state; }, get run() { return run; }, get player() { return player; },
    get enemies() { return enemies; }, get bullets() { return bullets; }, get eBullets() { return eBullets; },
    get orbs() { return orbs; }, get particles() { return particles; }, get corpses() { return corpses; }, get pieces() { return pieces; },
    get zaps() { return zaps; }, get ambient() { return ambient; }, get roomLights() { return roomLights; },
    get obstacles() { return obstacles; }, get supplyCrate() { return supplyCrate; }, get floorCanvas() { return floorCanvas; },
    get theme() { return theme(); }, get isBossRoom() { return !!(run && BOSS_ROOMS[run.room]); }, get intro() { return roomFade; },
    consumeFloorDirty() { const d = floorDirty; floorDirty = false; return d; },
    muzzlePoint: () => muzzlePoint(player),
    dronePos,
  };
  // Welt-Position → Bildschirmpunkt (2D: identisch, 3D: über die Kamera)
  const flatPt = { x: 0, y: 0 };
  function scr(x, y, h) {
    if (mode3d) return Render3D.project(x, y, h);
    flatPt.x = x; flatPt.y = y;
    return flatPt;
  }

  // 3D-Hauptmenü: der Held sucht mit der Taschenlampe die nächtliche Straße ab,
  // Zombies schlurfen heran und umkreisen ihn (reine Kulisse, keine Spiellogik)
  let menu3d = null;
  function menuWorld() {
    if (!menu3d) {
      const p = { x: W / 2, y: (T + B) / 2 + 80, r: 16, aim: -Math.PI / 2, moving: false, walkT: 0, kick: 0, barrel: 0, orbit: 0, orbitAng: 0, drones: 0, muzzle: 0, invuln: 0, hp: 1, maxHp: 1 };
      const types = ["walker", "runner", "walker", "crawler", "brute", "spitter", "dog", "walker", "bomber", "armored", "walker", "walker"];
      const enemies = types.map((type, i) => {
        const def = ZOMBIES[type], a = (i / types.length) * TAU, d = rand(170, 330);
        return {
          type, def, r: def.r, variant: i % 3, scale: rand(0.95, 1.05), x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8,
          face: a + Math.PI, anim: rand(0, 8), wob: rand(0, TAU), spawnT: 0, spawnMax: 1, hitT: 0, mode: "walk", aiT: 0, dirX: 0, dirY: 0,
          burnT: 0, slowT: 0, phase2: false, ang: a, dist: d, spd: def.speed * 0.25, want: rand(120, 200),
        };
      });
      const obs = [
        { kind: "car", x: L + 40, y: T + 150, w: 104, h: 54, vert: false, seed: 7 },
        { kind: "barrels", x: R - 110, y: T + 300, w: 56, h: 56, seed: 3 },
        { kind: "crate", x: L + 70, y: B - 260, w: 48, h: 48, seed: 5 },
        { kind: "barricade", x: R - 170, y: B - 180, w: 120, h: 26, seed: 9 },
        { kind: "dumpster", x: W / 2 + 40, y: T + 60, w: 92, h: 50, seed: 11 },
      ];
      menu3d = {
        state: "menu", run: { doorK: 0 }, player: p, enemies, bullets: [], eBullets: [], orbs: [], particles: [], corpses: [], zaps: [],
        ambient: Array.from({ length: 28 }, () => ({ x: rand(L, R), y: rand(T, B), size: rand(1, 2.4), ph: rand(0, TAU) })),
        roomLights: obs.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3 })),
        obstacles: obs, supplyCrate: null, floorCanvas: Sprites.floor("street", { W, H, L, T, R, B }, 4242),
        theme: "street", isBossRoom: false, consumeFloorDirty: () => false,
        muzzlePoint: () => muzzlePoint(p), dronePos: () => ({ x: p.x, y: p.y }), menuCam: true, t: 0,
      };
    }
    return menu3d;
  }
  function updateMenuWorld(dt) {
    const w = menuWorld(), p = w.player;
    w.t += dt;
    p.weaponId = save.equipped; p.weapon = WEAPONS[save.equipped]; p.tier = weaponTier(save.weapons[save.equipped] || 1); p.skin = save.skin;
    p.aim = -Math.PI / 2 + Math.sin(w.t * 0.45) * 1.1 + Math.sin(w.t * 1.3) * 0.12;
    for (const e of w.enemies) {
      // langsam enger kreisen, dann wieder zurückweichen
      e.dist += (e.want - e.dist) * dt * 0.15;
      if (Math.abs(e.dist - e.want) < 6) e.want = rand(120, 320);
      e.ang += (e.spd / Math.max(80, e.dist)) * dt * (e.variant % 2 ? 1 : -1);
      const nx = p.x + Math.cos(e.ang) * e.dist, ny = p.y + Math.sin(e.ang) * e.dist * 0.8;
      e.face = Math.atan2(p.y - ny, p.x - nx);
      e.anim += dt * 4;
      e.x = nx; e.y = ny;
    }
    for (const a of w.ambient) { a.ph += dt; a.x += (Math.sin(a.ph * 0.7) * 8 + 6) * dt; a.y += 14 * dt; if (a.y > B) a.y = T; if (a.x > R) a.x = L; }
  }
  function render3d(w, shk) {
    try {
      Render3D.render(w, frameDt, shk);
      return true;
    } catch (e) {
      // Lieber in 2D weiterspielen als ein schwarzer Bildschirm
      console.error("[Outbreak] 3D-Fehler – wechsle zu 2D", e);
      webgl = false;
      resize();
      return false;
    }
  }

  function draw() {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (!run) {
      if (mode3d) {
        ctx.clearRect(0, 0, W, H);
        updateMenuWorld(frameDt);
        if (render3d(menuWorld(), 0)) { ctx.drawImage(vignette, 0, 0, vignette.width * LS, vignette.height * LS); return; }
      }
      ctx.fillStyle = "#0d1210"; ctx.fillRect(0, 0, W, H); drawMenuBg(); return;
    }
    if (mode3d) {
      ctx.clearRect(0, 0, W, H);
      if (!render3d(world3d, shake)) return;
      drawBars();
      drawTexts();
      drawOverlay();
      return;
    }
    ctx.fillStyle = "#0d1210";
    ctx.fillRect(0, 0, W, H);

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
    drawOverlay();
  }

  function drawOverlay() {
    drawScreenFx();
    drawHud();
    // Kinobalken bei Boss-Auftritt und Boss-Tod
    const bossIntro = enemies.some((e) => e.def.boss && e.spawnT > 0);
    cine += ((bossIntro || cineT > 0 ? 1 : 0) - cine) * Math.min(1, frameDt * 5);
    if (cine > 0.01) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, 92 * cine);
      ctx.fillRect(0, H - 92 * cine, W, 92 * cine);
    }
    if (roomFade > 0) { ctx.globalAlpha = Math.min(1, roomFade * 1.4); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
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
    ctx.font = FONT_UI(20);
    ctx.fillText(moving ? tr("Loslassen = automatisch schießen!") : tr("Finger ziehen = laufen & ausweichen"), W / 2, (T + B) / 2 + 69);
    ctx.fillStyle = "#e8efe9";
    ctx.font = FONT_UI(15, 600);
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

  function roundRect(x, y, w, h, r, g = ctx) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function drawSupply() {
    const s = supplyCrate;
    drawShadow(s.x, s.y + 8, 24);
    Sprites.draw(ctx, Sprites.supplyCrate(), s.x, s.y - 4 + Math.sin(s.bob * 3) * 3);
  }

  function drawOrbs() {
    const t = run.time;
    for (const o of orbs) {
      if (o.type === "coin") Sprites.draw(ctx, Sprites.coin(Math.floor(t * 12 + o.x * 0.1)), o.x, o.y);
      else if (o.type === "heal") {
        ctx.fillStyle = "#f2f2ec"; roundRect(o.x - 8, o.y - 7, 16, 14, 3); ctx.fill();
        ctx.fillStyle = "#e5383b"; ctx.fillRect(o.x - 1.8, o.y - 5, 3.6, 10); ctx.fillRect(o.x - 5, o.y - 1.8, 10, 3.6);
      }
    }
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
      const k = c.death === "freeze" ? 0 : c.fall;
      const ang = c.face + c.fallDir * 0.4 * k + c.roll * 0.3, sc = c.sc * (1 - 0.12 * k) * (1 + c.z / 260);
      if (c.z > 2) drawShadow(c.x, c.y, c.r);
      const y = c.y - c.z;
      Sprites.draw(ctx, Sprites.zombie(c.type, c.f, c.v), c.x, y, ang, sc);
      const fx = c.death === "freeze" ? "ice" : c.death === "shock" && c.t < 0.6 && Math.random() < 0.5 ? "hit" : "corpse";
      ctx.globalAlpha = fx === "corpse" ? k * (c.death === "burn" ? 1 : 0.85) : 0.9;
      Sprites.draw(ctx, Sprites.zombieFx(c.type, c.f, c.v, fx), c.x, y, ang, sc);
      ctx.globalAlpha = 1;
    }
    for (const q of pieces) {
      const y = q.y - q.z, s = 3 + q.sc * 3;
      if (q.z > 2) drawShadow(q.x, q.y, s);
      ctx.save(); ctx.translate(q.x, y); ctx.rotate(q.rx);
      ctx.fillStyle = q.kind === "head" ? "#8fa67a" : "#5d6e7e";
      if (q.kind === "head") { ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); } else ctx.fillRect(-s * 1.4, -s * 0.5, s * 2.8, s);
      ctx.fillStyle = "#7a1418"; ctx.beginPath(); ctx.arc(q.kind === "head" ? s * 0.6 : s * 1.3, 0, s * 0.45, 0, TAU); ctx.fill();
      ctx.restore();
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
    let x = e.x, y = e.y - e.jumpZ;
    if (e.mode === "wind" || e.mode === "zap") { x += rand(-1.5, 1.5); y += rand(-1.5, 1.5); }
    if (e.elite) glowAt("255,200,80", e.x, e.y, e.r * 2.2, 0.35 + 0.15 * Math.sin(run.time * 5));
    const sc = e.scale * (1 + Math.sin(e.anim * 0.8) * 0.015);
    Sprites.draw(ctx, Sprites.zombie(e.type, f, e.variant), x, y, e.face, sc);
    if (e.slowT > 0) { ctx.globalAlpha = 0.8; Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "ice"), x, y, e.face, sc); }
    if (e.phase2 || e.rageT > 0) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(run.time * 10); Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "rage"), x, y, e.face, sc); }
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
      Sprites.draw(ctx, saw, p.x + Math.cos(a) * p.orbitR, p.y + Math.sin(a) * p.orbitR, p.orbitAng * 5);
    }
    drawShadow(p.x, p.y, 16);
    const pack = p.weaponId === "flame" ? "tanks" : "pack";
    const body = Sprites.playerBody(p.moving ? Math.floor(p.walkT) % Sprites.FRAMES : -1, pack, p.skin);
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
      } else if (b.kind === "disc") {
        drawShadow(b.x, b.y + 4, 8);
        Sprites.draw(ctx, Sprites.saw(), b.x, b.y, b.spin, 0.8);
      } else if (b.kind === "rocket") {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = "#c9ccd0"; ctx.fillRect(-9, -3, 14, 6); ctx.fillStyle = "#e5383b"; ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3); ctx.fill();
        ctx.fillStyle = "#555"; ctx.fillRect(-11, -5, 4, 10); ctx.restore();
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
      } else if (b.kind === "disc") {
        glowAt("220,230,255", b.x, b.y, 14, 0.25);
      } else if (b.kind === "rocket") {
        const a = Math.atan2(b.vy, b.vx);
        glowAt("255,160,60", b.x - Math.cos(a) * 12, b.y - Math.sin(a) * 12, 14, 0.9);
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
      if (e.mode === "crouch") {
        ctx.strokeStyle = `rgba(255,80,60,${0.35 + 0.3 * Math.sin(run.time * 30)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirX * 190, e.y + e.dirY * 190); ctx.stroke(); ctx.setLineDash([]);
      } else if (e.mode === "zap") {
        ctx.strokeStyle = `rgba(127,231,255,${0.3 + 0.3 * Math.sin(run.time * 25)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, 150 * (1 - Math.max(0, e.aiT) / 0.75 * 0.4), 0, TAU); ctx.stroke();
      }
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
      const w = Math.max(20, e.r * 2);
      const q = scr(e.x, e.y, mode3d ? Render3D.heightOf(e) + 6 : 0);
      const x = q.x, y = mode3d ? q.y - 6 : e.y - e.r * e.scale - 13;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.def.armor ? "#7fb4ff" : "#e5383b"; ctx.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 3);
    }
    const p = player, bw = 56, k = Math.max(0, p.hp / p.maxHp);
    const q = scr(p.x, p.y, 54), px = q.x, y = mode3d ? q.y - 8 : p.y - 40;
    ctx.fillStyle = "rgba(0,0,0,0.75)"; roundRect(px - bw / 2 - 2, y - 2, bw + 4, 10, 4); ctx.fill();
    ctx.fillStyle = k > 0.3 ? "#4ad66d" : "#e5383b"; roundRect(px - bw / 2, y, Math.max(3, bw * k), 6, 3); ctx.fill();
    const seg = (100 / p.maxHp) * bw;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    if (seg > 4) for (let x = seg; x < bw * k; x += seg) ctx.fillRect(px - bw / 2 + x, y, 1, 6);
    ctx.fillStyle = "#fff"; ctx.font = FONT_NUM(15); ctx.textAlign = "center";
    ctx.fillText(Math.ceil(p.hp), px, y - 3);
  }

  function drawTexts() {
    ctx.textAlign = "center";
    for (const t of texts) {
      const age = t.max - t.life;
      const pop = age < 0.1 ? 0.6 + age * 8 : Math.max(1, 1.4 - (age - 0.1) * 3);
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2.5);
      ctx.font = FONT_NUM(Math.round(t.size * pop * 1.35), 700);
      ctx.lineWidth = t.crit ? 5 : 3.5;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      const q = scr(t.x, t.y, 30);
      ctx.strokeText(t.txt, q.x, q.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.txt, q.x, q.y);
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

  // Canvas-Schriften: dieselben wie in der Oberfläche
  const FONT_NUM = (px, w = 600) => `${w} ${px}px Teko, "Barlow Condensed", sans-serif`;
  const FONT_UI = (px, w = 800) => `${w} ${px}px "Barlow Condensed", sans-serif`;
  function drawIcon(g, name, x, y, size, color) {
    g.save();
    g.translate(x - size / 2, y - size / 2);
    g.scale(size / 512, size / 512);
    g.fillStyle = color;
    g.fill(GameIcons.path2d(name));
    g.restore();
  }
  function hexPath(g, cx, cy, r) {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i / 6) * TAU; g[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath();
  }
  // Fortschritt entlang der Sechseck-Kontur (oben beginnend, im Uhrzeigersinn)
  function hexProgress(g, cx, cy, r, k) {
    const pts = Array.from({ length: 7 }, (_, i) => { const a = -Math.PI / 2 + (i / 6) * TAU; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    let left = k * 6;
    for (let i = 0; i < 6 && left > 0; i++) {
      const f = Math.min(1, left);
      g.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f);
      left -= 1;
    }
    g.stroke();
  }
  // Schräges Fortschrittssegment (Raum bzw. Zeitabschnitt)
  function segPath(g, i) {
    const x = 90 + i * 12.5;
    g.moveTo(x + 3, 54); g.lineTo(x + 11, 54); g.lineTo(x + 8, 60); g.lineTo(x, 60); g.closePath();
  }
  // Offscreen-Ebene in Geräteauflösung, die nur bei geänderten Werten neu gezeichnet wird.
  // Vektor-Icons, Verläufe und Leuchteffekte jedes Frame neu zu rastern hat die Bildrate fast halbiert.
  function cachedLayer(cache, key, h, paint) {
    const k = scale * dpr, fullKey = `${key}|${k}`;
    if (!cache.c) cache.c = document.createElement("canvas");
    if (cache.key !== fullKey) {
      cache.key = fullKey;
      cache.c.width = Math.round(W * k); cache.c.height = Math.round(h * k);
      const g = cache.c.getContext("2d");
      g.setTransform(k, 0, 0, k, 0, 0);
      g.clearRect(0, 0, W, h);
      paint(g);
    }
    return cache.c;
  }
  const hudCache = {}, bossCache = {};
  const SURV_STEP = SURVIVAL_TIME / 20;

  function paintHud(g) {
    const p = player, survival = run.mode === "survival";
    const bg = g.createLinearGradient(0, 0, 0, 96);
    bg.addColorStop(0, "rgba(6,9,8,0.97)"); bg.addColorStop(0.75, "rgba(10,14,13,0.9)"); bg.addColorStop(1, "rgba(10,14,13,0.55)");
    g.fillStyle = bg; g.fillRect(0, 0, W, 96);
    g.fillStyle = "rgba(168,255,62,0.22)"; g.fillRect(0, 95, W, 1);
    // Warnstreifen-Akzent unter dem Level-Abzeichen
    g.save(); g.beginPath(); g.rect(14, 95, 64, 4); g.clip();
    g.fillStyle = "#ffb733"; g.beginPath();
    for (let x = 6; x < 90; x += 10) { g.moveTo(x, 95); g.lineTo(x + 5, 95); g.lineTo(x + 1, 99); g.lineTo(x - 4, 99); g.closePath(); }
    g.fill(); g.restore();

    // Level-Abzeichen: Sechseck mit XP-Kontur
    const cx = 46, cy = 48;
    hexPath(g, cx, cy, 33); g.fillStyle = "#070a09"; g.fill();
    g.lineWidth = 4; g.lineJoin = "round";
    hexPath(g, cx, cy, 29); g.strokeStyle = "rgba(168,255,62,0.14)"; g.stroke();
    g.strokeStyle = "#a8ff3e"; g.shadowColor = "rgba(168,255,62,0.7)"; g.shadowBlur = 8;
    hexProgress(g, cx, cy, 29, Math.min(1, p.xp / p.xpNeed));
    g.shadowBlur = 0;
    const lg = g.createLinearGradient(0, cy - 24, 0, cy + 24);
    lg.addColorStop(0, "#2c3a35"); lg.addColorStop(1, "#141b19");
    hexPath(g, cx, cy, 23); g.fillStyle = lg; g.fill();
    g.textAlign = "center"; g.fillStyle = "#a8ff3e";
    g.font = FONT_UI(10); g.fillText(tr("LEVEL"), cx, cy - 9);
    g.fillStyle = "#fff"; g.font = FONT_NUM(28); g.fillText(p.level, cx, cy + 16);

    // Fortschritt aus schrägen Segmenten (Kampagne: Räume, Überleben: 15-s-Abschnitte), Bossabschnitte mit Totenkopf.
    // Das aktuelle Segment pulsiert und wird live in drawHud gezeichnet.
    const segs = (cur, bossIdx, supplyIdx = []) => {
      for (const [color, test] of [["#a8ff3e", (i) => i < cur], ["#6a1814", (i) => i > cur && bossIdx.includes(i)], ["#1f3b5c", (i) => i > cur && supplyIdx.includes(i)], ["#26302c", (i) => i > cur && !bossIdx.includes(i) && !supplyIdx.includes(i)]]) {
        g.fillStyle = color; g.beginPath();
        for (let i = 0; i < 20; i++) if (test(i)) segPath(g, i);
        g.fill();
      }
      for (const i of bossIdx) drawIcon(g, "bossSkull", 90 + i * 12.5 + 5.5, 69, 13, i < cur ? "#4a5a50" : "#ff4338");
    };
    g.textAlign = "left"; g.fillStyle = "#76857b"; g.font = FONT_UI(12);
    if (survival) {
      const left = Math.max(0, SURVIVAL_TIME - run.survT), warn = left < 30;
      g.fillText(tr("Überleben").toUpperCase(), 90, 22);
      drawIcon(g, "stopwatch", 98, 37, 17, warn ? "#ff6a5e" : "#ffb733");
      g.fillStyle = warn ? `rgb(255,${120 + 80 * Math.sin(run.time * 8)},90)` : "#fff"; g.font = FONT_NUM(24);
      g.fillText(fmtTime(left), 111, 46);
      segs(Math.floor(run.survT / SURV_STEP), SURVIVAL_BOSSES.map(([bt]) => Math.floor(bt / SURV_STEP)));
    } else {
      g.fillText(tr("Kapitel {c}", { c: run.chapter }).toUpperCase(), 90, 22);
      g.fillStyle = "#fff"; g.font = FONT_NUM(24);
      g.fillText(`${tr("Raum")} ${run.room}`, 90, 46);
      const rw = g.measureText(`${tr("Raum")} ${run.room}`).width;
      g.fillStyle = "#76857b"; g.font = FONT_NUM(18); g.fillText(`/${ROOMS_PER_CHAPTER}`, 92 + rw, 46);
      segs(run.room - 1, Object.keys(BOSS_ROOMS).map((r) => r - 1), SUPPLY_ROOMS.map((r) => r - 1));
    }
    // Münzen-Kapsel und Abschüsse (links vom Pause-Knopf)
    const coins = num(run.coins);
    g.font = FONT_NUM(24);
    const cw = g.measureText(coins).width + 46, cxr = W - 82;
    roundRect(cxr - cw, 20, cw, 32, 16, g);
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fill();
    g.strokeStyle = "rgba(255,183,51,0.4)"; g.lineWidth = 1.5; g.stroke();
    drawIcon(g, "coin", cxr - cw + 18, 36, 22, "#ffb733");
    g.textAlign = "right"; g.fillStyle = "#ffe2a3"; g.fillText(coins, cxr - 12, 46);
    drawIcon(g, "skull", cxr - 50, 72, 15, "#76857b");
    g.fillStyle = "#b3bfb6"; g.font = FONT_NUM(20); g.fillText(num(run.kills), cxr - 12, 79);
    g.textAlign = "left";
  }

  // Boss-Leiste: gepanzertes Band mit Totenkopf (Rahmen gecacht, Füllstand live)
  const BOSS_BAR = { x: 58, y: T + 14, top: T, h: 56 };
  function paintBossFrame(g, name) {
    const bw = W - 100, x = BOSS_BAR.x, y = BOSS_BAR.y - BOSS_BAR.top;
    g.fillStyle = "rgba(6,9,8,0.85)"; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + bw + 6, y - 6); g.lineTo(x + bw + 6, y + 18); g.lineTo(x + bw - 2, y + 26); g.lineTo(x - 6, y + 26); g.fill();
    g.fillStyle = "#2a0d0b"; g.fillRect(x, y, bw, 14);
    hexPath(g, x - 14, y + 7, 18); g.fillStyle = "#3e0b0b"; g.fill(); g.strokeStyle = "#ff4338"; g.lineWidth = 2; g.stroke();
    drawIcon(g, "bossSkull", x - 14, y + 7, 22, "#ffd9d4");
    g.fillStyle = "#fff"; g.font = FONT_UI(13); g.textAlign = "center";
    g.fillText(name, x + bw / 2, y + 36);
    g.textAlign = "left";
  }

  function drawHud() {
    const p = player, t = run.time, survival = run.mode === "survival";
    const left = survival ? Math.max(0, SURVIVAL_TIME - run.survT) : 0;
    const key = [I18N.lang, run.mode, p.level, Math.round((p.xp / p.xpNeed) * 120), run.chapter, run.room, run.coins, run.kills,
      survival ? `${Math.ceil(left)}|${left < 30 ? Math.floor(t * 12) : 0}|${Math.floor(run.survT / SURV_STEP)}` : ""].join("|");
    ctx.drawImage(cachedLayer(hudCache, key, 100, paintHud), 0, 0, W, 100);
    // aktuelles Segment pulsiert
    const cur = survival ? Math.floor(run.survT / SURV_STEP) : run.room - 1;
    if (cur >= 0 && cur < 20) {
      ctx.fillStyle = `rgba(255,255,255,${0.65 + 0.35 * Math.sin(t * 6)})`;
      ctx.beginPath(); segPath(ctx, cur); ctx.fill();
    }
    const boss = enemies.find((e) => e.def.boss && e.spawnT <= 0);
    if (boss) {
      const bw = W - 100, { x, y } = BOSS_BAR, k = Math.max(0, boss.hp / boss.maxHp);
      ctx.drawImage(cachedLayer(bossCache, boss.def.name, BOSS_BAR.h, (g) => paintBossFrame(g, boss.def.name)), 0, BOSS_BAR.top, W, BOSS_BAR.h);
      const gr = ctx.createLinearGradient(0, y, 0, y + 14);
      gr.addColorStop(0, "#ff6a4a"); gr.addColorStop(1, "#a3121c");
      ctx.fillStyle = gr; ctx.fillRect(x, y, Math.max(4, bw * k), 14);
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath();
      for (let i = 1; i < 20; i++) ctx.rect(x + (bw * i) / 20, y, 1, 14);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillRect(x + bw * 0.5 - 1, y - 2, 2, 18);
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

  // Banner: Hintergrund, Titel (mit Leuchten) und Untertitel als gecachte Ebenen –
  // pro Frame nur noch Einblenden und Hereingleiten (Unschärfe-Schatten jedes Frame zu rendern ist teuer)
  const BANNER_H = 104, bannerCache = { bg: {}, title: {}, sub: {} };
  // Canvas-Schriften vorladen; kommt eine Schrift erst später an, gecachte Ebenen neu zeichnen
  if (document.fonts) {
    for (const f of [FONT_NUM(20), FONT_NUM(20, 700), FONT_UI(20), FONT_UI(20, 700), FONT_UI(20, 600)]) document.fonts.load(f).catch(() => {});
    document.fonts.addEventListener("loadingdone", () => { for (const c of [hudCache, bossCache, ...Object.values(bannerCache)]) c.key = ""; });
  }
  function paintBannerBg(g) {
    const g0 = g.createLinearGradient(0, 0, W, 0);
    g0.addColorStop(0, "rgba(6,9,8,0)"); g0.addColorStop(0.18, "rgba(6,9,8,0.82)"); g0.addColorStop(0.82, "rgba(6,9,8,0.82)"); g0.addColorStop(1, "rgba(6,9,8,0)");
    g.fillStyle = g0; g.fillRect(0, 0, W, BANNER_H);
    // Warnstreifen oben und unten
    g.save(); g.beginPath(); g.rect(W * 0.18, 0, W * 0.64, 5); g.rect(W * 0.18, BANNER_H - 5, W * 0.64, 5); g.clip();
    g.fillStyle = "#1a1408"; g.fillRect(0, 0, W, BANNER_H);
    g.fillStyle = "#ffb733"; g.beginPath();
    for (let x = W * 0.18 - 20; x < W * 0.82 + 20; x += 14) { g.moveTo(x, 0); g.lineTo(x + 7, 0); g.lineTo(x + 2, BANNER_H); g.lineTo(x - 5, BANNER_H); g.closePath(); }
    g.fill(); g.restore();
  }
  function paintBannerText(g, txt, font, color, spacing, y, glow) {
    g.textAlign = "center";
    if ("letterSpacing" in g) g.letterSpacing = spacing;
    g.font = font;
    if (glow) { g.shadowColor = glow; g.shadowBlur = 20; }
    g.fillStyle = color; g.fillText(txt, W / 2, y);
  }
  function drawBanner() {
    const k = banner.life / banner.max;
    const y = H * 0.36, slide = Math.max(0, 1 - (1 - k) * 8) * 30; // kurzes Hereingleiten
    const sub = String(banner.sub).toUpperCase();
    ctx.globalAlpha = Math.min(1, k * 4, (1 - k) * 8 + 0.2);
    ctx.drawImage(cachedLayer(bannerCache.bg, "bg", BANNER_H, paintBannerBg), 0, y, W, BANNER_H);
    ctx.drawImage(cachedLayer(bannerCache.title, banner.title, BANNER_H, (g) => paintBannerText(g, banner.title, FONT_NUM(50, 700), "#e9ffd2", "2px", 58, "rgba(168,255,62,0.75)")), slide, y, W, BANNER_H);
    ctx.drawImage(cachedLayer(bannerCache.sub, sub, BANNER_H, (g) => paintBannerText(g, sub, FONT_UI(15), "#ffb733", "3px", 84)), -slide, y, W, BANNER_H);
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // Hauptschleife
  // ============================================================
  let last = performance.now();
  let lastFrameAt = last;
  let frameDt = 0.016;
  // Bildtakt: höchstens 60 Bilder/s, im Akku-Sparmodus 30. Displays mit 90/120 Hz würden sonst
  // doppelt so oft rechnen und zeichnen – das kostet Akku, macht das Handy warm und lässt es heruntertakten.
  const frameMs = () => 1000 / (save.fps30 ? 30 : 60);
  let nextDue = 0;
  // Automatische Qualitätsanpassung: braucht ein Bild über 3 s im Schnitt deutlich länger als der
  // Zieltakt, sinkt zuerst die 3D-Auflösung, dann die Qualitätsstufe. Läuft es lange flüssig,
  // geht die Auflösung wieder hoch (nie die Stufe – das würde sichtbar flackern).
  const perf = { t: 0, sum: 0, n: 0, good: 0 };
  function trackPerformance(ms) {
    if (ms <= 0 || ms > 1500) return; // Tab im Hintergrund o. Ä.
    perf.t += ms; perf.sum += ms; perf.n++;
    if (perf.t < 3000) return;
    const avg = perf.sum / perf.n, target = frameMs();
    perf.t = perf.sum = perf.n = 0;
    if (gfxLocked) return;
    if (avg > target * 1.33) {
      perf.good = 0;
      if (mode3d && resStep < RES_STEPS.length - 1) resStep++;
      else if (quality > 0) { quality--; resStep = 0; save.gfx = quality; persist(); }
      else return;
      resize();
      console.log(`[Outbreak] Grafik → Stufe ${quality}, Auflösung ${RES_STEPS[resStep]} (Ø ${avg.toFixed(1)} ms/Bild)`);
    } else if (resStep > 0 && avg < target * 1.06 && ++perf.good >= 3) {
      perf.good = 0;
      resStep--;
      resize();
    }
  }
  let pauseFrames = 0, splashGone = false;
  function loop(now) {
    requestAnimationFrame(loop);
    const I = frameMs();
    if (now < nextDue - I * 0.4) return; // dieses Display-Bild auslassen
    nextDue = Math.max(nextDue + I, now);
    // Lange Bilder (30-FPS-Modus, Ruckler) in Teilschritte von höchstens 1/60 s zerlegen:
    // Kugeln prüfen Treffer pro Schritt und würden sonst durch kleine Gegner hindurchfliegen
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    frameDt = real;
    // Zeitlupe nach Boss-Sieg
    const dt = slowMo > 0 ? real * 0.3 : real;
    if (slowMo > 0) slowMo -= real;
    if (hitStop > 0) hitStop -= real;
    else if (state === "play") { const n = Math.ceil(dt / 0.0175); for (let i = 0; i < n && state === "play"; i++) update(dt / n); }
    if (state === "play") trackPerformance(now - lastFrameAt);
    lastFrameAt = now;
    if (run) updateFx(state === "play" ? dt : dt * 0.15);
    // Nichts zeichnen, was niemand sieht: undurchsichtige Bildschirme (Shop, Arsenal …) verdecken alles,
    // in der Pause steht das Bild still – die GPU darf schlafen
    if (curOverlay && curOverlay.classList.contains("screen")) return;
    if (state === "pause") { if (pauseFrames++ > 1) return; } else pauseFrames = 0;
    draw();
    if (!splashGone) { splashGone = true; requestAnimationFrame(() => Platform.hideSplash()); } // nach dem ersten echten Bild
  }
  requestAnimationFrame(loop);

  // ============================================================
  // Langzeitmotivation: Statistik → Missionen, Erfolge, Saisonpass; dazu Patrouille
  // Alle Spielereignisse laufen über track()/trackMax() – das Spiel selbst kennt keine Missionslogik.
  // ============================================================
  const MISSIONS = {
    kills: { icon: "zombie", text: "Töte {n} Zombies", d: [100, 150, 250], w: 1500 },
    rooms: { icon: "door", text: "Säubere {n} Räume", d: [10, 15, 20], w: 120 },
    bosses: { icon: "bossSkull", text: "Besiege {n} Bosse", one: "Besiege einen Boss", d: [1], w: 5 },
    elites: { icon: "star", text: "Töte {n} Elite-Zombies", d: [3, 5], w: 25 },
    headshots: { icon: "headshot", text: "Erziele {n} Kopfschüsse", d: [15, 30], w: 200 },
    blasts: { icon: "explosion", text: "Sprenge {n} Zombies weg", d: [20, 40], w: 250 },
    runs: { icon: "play", text: "Starte {n} Einsätze", d: [2, 3], w: 15 },
    coins: { icon: "coins", text: "Verdiene {n} Münzen in Einsätzen", d: [300, 500], w: 4000 },
    evolutions: { icon: "dna", text: "Löse {n} Evolutionen aus", one: "Löse eine Evolution aus", d: [1], w: 4 },
    level: { icon: "upgrade", text: "Erreiche Level {n} in einem Einsatz", d: [8, 10, 12], max: true },
    survival: { icon: "stopwatch", text: "Überlebe {n} Sekunden im Überlebensmodus", d: [90, 150], w: 300, max: true },
  };
  const MISSION_REWARD = { daily: { coins: 100, xp: 120 }, bonus: { coins: 250, xp: 200 }, weekly: { coins: 500, xp: 400 } };
  const missionText = (m) => { const M = MISSIONS[m.id]; return tr(m.goal === 1 && M.one ? M.one : M.text, { n: m.goal.toLocaleString(I18N.lang) }); };

  // Deterministischer Zufall: alle Spieler bekommen am selben Tag dieselben Missionen
  function seeded(str) {
    let h = 1779033703;
    for (const ch of str) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  function weekKey() {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Montag dieser Woche
    return `W${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function rollMissions(seed, field, n) {
    const rnd = seeded(seed), pool = Object.keys(MISSIONS).filter((k) => MISSIONS[k][field]), out = [];
    while (out.length < n && pool.length) {
      const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0], g = MISSIONS[id][field];
      out.push({ id, goal: Array.isArray(g) ? g[Math.floor(rnd() * g.length)] : g, p: 0, done: false });
    }
    return out;
  }
  function missionsFresh() {
    const m = save.missions, day = localDay(), wk = weekKey();
    if (m.day !== day) Object.assign(m, { day, daily: rollMissions(`d${day}`, "d", 3), bonus: false });
    if (m.week !== wk) Object.assign(m, { week: wk, weekly: rollMissions(wk, "w", 4) });
    return m;
  }
  function track(key, n = 1) {
    save.stats[key] = (save.stats[key] || 0) + n;
    const m = missionsFresh();
    if (!MISSIONS[key] || MISSIONS[key].max) return;
    for (const q of m.daily.concat(m.weekly)) if (q.id === key) q.p = Math.min(q.goal, q.p + n);
    if (key === "rooms") addPassXp(6);
  }
  function trackMax(key, v) {
    if (v > (save.stats[key] || 0)) save.stats[key] = v;
    const m = missionsFresh();
    for (const q of m.daily.concat(m.weekly)) if (q.id === key) q.p = Math.max(q.p, Math.min(q.goal, Math.floor(v)));
  }
  function claimMission(q, kind) {
    if (q.done || q.p < q.goal) return;
    q.done = true;
    const r = MISSION_REWARD[kind];
    save.coins += r.coins; addPassXp(r.xp);
    persist(); sfx("coin"); toast(`${coinAmt(r.coins, "+")} · +${r.xp} ${tr("Pass-XP")}`, "missions");
  }
  function claimDailyBonus() {
    const m = missionsFresh();
    if (m.bonus || !m.daily.every((q) => q.done)) return;
    m.bonus = true;
    const r = MISSION_REWARD.bonus, b = pick(BOOSTS);
    save.coins += r.coins; save.boosts[b.id]++; addPassXp(r.xp);
    persist(); sfx("level"); toast(`${coinAmt(r.coins, "+")} · ${b.name} · +${r.xp} ${tr("Pass-XP")}`, "chest");
  }

  // Erfolge in drei Stufen (Bronze, Silber, Gold)
  const ACHIEVEMENTS = [
    { id: "kills", icon: "zombie", name: tr("Zombiejäger"), text: "Töte {n} Zombies", tiers: [500, 5000, 50000], val: () => save.stats.kills },
    { id: "bosses", icon: "bossSkull", name: tr("Bossbezwinger"), text: "Besiege {n} Bosse", one: "Besiege einen Boss", tiers: [1, 10, 50], val: () => save.stats.bosses },
    { id: "elites", icon: "star", name: tr("Elitejäger"), text: "Töte {n} Elite-Zombies", tiers: [10, 100, 500], val: () => save.stats.elites },
    { id: "chapter", icon: "map", name: tr("Kapitelstürmer"), text: "Erreiche Kapitel {n}", tiers: [2, 3, 5], val: () => save.best.chapter },
    { id: "survival", icon: "hourglass", name: tr("Überlebenskünstler"), text: "Überlebe {n} Sekunden", tiers: [60, 180, 300], val: () => save.stats.survival },
    { id: "evolutions", icon: "dna", name: tr("Evolutionär"), text: "Löse {n} Evolutionen aus", one: "Löse eine Evolution aus", tiers: [1, 10, 40], val: () => save.stats.evolutions },
    { id: "codex", icon: "codex", name: tr("Forscher"), text: "Entdecke {n} Evolutionen", tiers: [2, 5, 8], val: () => Object.keys(save.codex).length },
    { id: "arsenal", icon: "weapons", name: tr("Waffennarr"), text: "Besitze {n} Waffen", tiers: [3, 8, 15], val: () => Object.keys(save.weapons).length },
    { id: "devil", icon: "devil", name: tr("Teufelsbündler"), text: "Schließe {n} Teufelspakte", one: "Schließe einen Teufelspakt", tiers: [1, 5, 20], val: () => save.stats.devil },
    { id: "headshots", icon: "headshot", name: tr("Scharfschütze"), text: "Erziele {n} Kopfschüsse", tiers: [100, 1000, 10000], val: () => save.stats.headshots },
  ];
  const ACH_REWARD = [250, 1000, 4000];
  const TIER = ["bronze", "silver", "gold"];
  const TIER_NAME = ["Bronze", "Silber", "Gold"];
  const achClaimable = (a) => { const t = save.ach[a.id] || 0; return t < a.tiers.length && a.val() >= a.tiers[t]; };
  function claimAchievement(a) {
    if (!achClaimable(a)) return;
    const t = save.ach[a.id] || 0;
    save.ach[a.id] = t + 1;
    save.coins += ACH_REWARD[t];
    persist(); sfx("level"); toast(`${a.name} (${tr(TIER_NAME[t])}) · ${coinAmt(ACH_REWARD[t], "+")}`, "medal");
  }

  // Saisonpass: 28-Tage-Saisons, 30 Stufen; Gratis-Belohnungen für alle, Premium per In-App-Kauf
  const SEASON_EPOCH = Date.UTC(2026, 9, 19); // Montag des Starts → Saison 1
  const SEASON_DAYS = 28, PASS_LEVELS = 30, PASS_STEP = 400;
  function seasonInfo() {
    const days = Math.floor((Date.now() - SEASON_EPOCH) / 864e5);
    return { id: Math.floor(days / SEASON_DAYS) + 1, left: SEASON_DAYS - (((days % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS) };
  }
  function passFresh() {
    const s = seasonInfo(), p = save.pass;
    if (p.season !== s.id) save.pass = { season: s.id, xp: 0, premium: p.premium === s.id ? s.id : 0, free: [], prem: [] };
    return s;
  }
  const passLevel = () => Math.min(PASS_LEVELS, Math.floor(save.pass.xp / PASS_STEP));
  const passPremium = () => save.pass.premium === save.pass.season && save.pass.season > 0;
  function addPassXp(n) { passFresh(); save.pass.xp = Math.min(PASS_LEVELS * PASS_STEP, save.pass.xp + n); }
  // Belohnung je Stufe und Spur (berechnet statt Tabelle: leicht zu balancieren)
  function passReward(lvl, prem) {
    if (prem) {
      if (lvl === 1) return { skin: "hunter" };
      if (lvl === PASS_LEVELS) return { coins: 3000 };
      if (lvl % 10 === 0) return { crate: 1 };
      if (lvl % 3 === 0) return { boost: BOOSTS[(lvl / 3) % BOOSTS.length].id };
      return { coins: 150 + 20 * lvl };
    }
    if (lvl === 15 || lvl === PASS_LEVELS) return { crate: 1 };
    if (lvl % 5 === 0) return { boost: BOOSTS[(lvl / 5 - 1) % BOOSTS.length].id };
    return { coins: 80 + 10 * lvl };
  }
  function rewardLabel(r) { return rewardInfo(r).text; }
  function rewardInfo(r) {
    if (r.skin) { const q = SKINS.find((s) => s.id === r.skin); return { icon: q.icon, tone: "violet", text: q.name }; }
    if (r.crate) return { icon: "mystery", tone: "amber", text: tr("Überraschungskiste") };
    if (r.boost) { const q = BOOSTS.find((b) => b.id === r.boost); return { icon: q.icon, tone: "toxic", text: q.name }; }
    return { icon: r.coins >= 1000 ? "chest" : "coins", tone: "amber", text: coinAmt(r.coins) };
  }
  function grantReward(r) {
    if (r.skin) save.skins[r.skin] = true;
    else if (r.crate) openMystery(true);
    else if (r.boost) save.boosts[r.boost]++;
    else save.coins += r.coins;
  }
  function claimPass(lvl, prem) {
    passFresh();
    const list = prem ? save.pass.prem : save.pass.free;
    if (lvl > passLevel() || list.includes(lvl) || (prem && !passPremium())) return;
    list.push(lvl);
    const r = passReward(lvl, prem);
    grantReward(r);
    persist(); sfx("level");
    if (!r.crate) { const ri = rewardInfo(r); toast(ri.text, ri.icon); }
  }
  const passClaimable = () => {
    passFresh();
    for (let l = 1; l <= passLevel(); l++) if (!save.pass.free.includes(l) || (passPremium() && !save.pass.prem.includes(l))) return true;
    return false;
  };

  // Patrouille: Münzen sammeln sich offline an (bis 12 h), Ertrag wächst mit dem Rekordkapitel
  const PATROL_MAX_H = 12, QUICK_PATROLS = 2, QUICK_PATROL_H = 2;
  const patrolRate = () => 40 + 25 * Math.max(1, save.best.chapter); // Münzen pro Stunde
  function patrolHours() {
    const now = Date.now();
    if (save.patrol.since > now) save.patrol.since = now; // Uhr zurückgestellt
    return Math.min(PATROL_MAX_H, (now - save.patrol.since) / 36e5);
  }
  const patrolCoins = () => Math.floor(patrolHours() * patrolRate());
  function quickLeft() { return save.patrol.quickDay === localDay() ? Math.max(0, QUICK_PATROLS - save.patrol.quick) : QUICK_PATROLS; }
  function claimPatrol(mult) {
    const c = patrolCoins() * mult;
    if (c <= 0) return;
    save.coins += c;
    save.patrol.since = Date.now();
    persist(); sfx("coin"); toast(coinAmt(c, "+"), "patrol");
  }

  // ============================================================
  // Menüs
  // ============================================================
  function refreshMenu() {
    $("menuCoins").textContent = num(save.coins);
    $("menuBest").textContent = save.best.chapter ? tr("Kap. {c} · Raum {r}", { c: save.best.chapter, r: save.best.room }) : "–";
    const w = WEAPONS[save.equipped], lvl = save.weapons[save.equipped];
    $("menuWeaponImg").src = Sprites.weaponIcon(save.equipped, weaponTier(lvl));
    $("menuEquipped").innerHTML = `${w.name}<span class="lv">${tr("Stufe {n}", { n: lvl })}</span>`;
    const sk = SKINS.find((q) => q.id === save.skin) || SKINS[0];
    const bs = BOOSTS.filter((q) => save.boosts[q.id] > 0).map((q) => `${q.name} ×${save.boosts[q.id]}`).join(" · ");
    $("menuSkin").textContent = bs ? `${sk.name} · ${tr("Boosts")}: ${bs}` : sk.name;
    for (const el of document.querySelectorAll(".coinsVal")) el.textContent = num(save.coins);
    $("survivalBest").textContent = save.stats.survival ? `${tr("Rekord")} ${fmtTime(save.stats.survival)}` : tr("5 Minuten");
    $("missionsBadge").classList.toggle("hidden", !missionsClaimable());
    $("passBadge").classList.toggle("hidden", !passClaimable());
    const pc = patrolCoins();
    $("patrolBadge").classList.toggle("hidden", patrolHours() < 1);
    $("patrolMini").textContent = pc > 0 ? `+${num(pc)}` : "";
  }

  // Weiche Trennstellen für lange deutsche Komposita (schmale Handys)
  const softHyphen = (name) => name.replace(/(Maschinen|Scharfschützen|Flammen|Granat|Sägeblatt|Raketen|Sturm|Laser)/g, "$1\u00AD");

  function renderArmory() {
    const list = $("weaponList");
    list.innerHTML = "";
    for (const [id, w] of Object.entries(WEAPONS)) {
      const lvl = save.weapons[id];
      const row = document.createElement("div");
      row.className = `item weapon${save.equipped === id ? " active" : ""}${lvl ? "" : " dim"}`;
      const dps = Math.round(w.dmg * w.pellets * w.rate * weaponLvlMult(lvl || 1));
      const tag = save.equipped === id ? `<span class="tag">${tr("Ausgerüstet")}</span>` : !lvl ? `<span class="tag amber">${tr("Nicht im Besitz")}</span>` : "";
      row.innerHTML = `<div class="ico"><img src="${Sprites.weaponIcon(id, weaponTier(lvl || 1))}" alt=""></div>
        <div>${tag}<div class="name">${softHyphen(w.name)}</div>
        <div class="meta">${lvl ? pipsHtml(lvl, WEAPON_MAX_LVL, lvl >= 5 ? "gold" : "") : ""}<span>DPS <b class="dps">${dps}</b></span></div>
        <div class="desc">${w.desc}</div></div>
        <div class="acts"></div>`;
      const acts = row.querySelector(".acts");
      if (!lvl) {
        acts.appendChild(actionBtn(coinAmt(w.price), save.coins >= w.price, () => { save.coins -= w.price; save.weapons[id] = 1; save.equipped = id; }, "amber"));
      } else {
        if (save.equipped !== id) acts.appendChild(actionBtn(tr("Ausrüsten"), true, () => { save.equipped = id; }, "primary"));
        if (lvl < WEAPON_MAX_LVL) {
          const c = weaponUpgradeCost(lvl);
          acts.appendChild(actionBtn(`${I("upgrade")}${coinAmt(c)}`, save.coins >= c, () => { save.coins -= c; save.weapons[id]++; }));
        } else acts.appendChild(actionBtn(tr("Maximal"), false, () => {}));
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
      row.innerHTML = `<div class="ico">${medal(t.icon, "toxic")}</div>
        <div><div class="name">${t.name}</div><div class="meta">${pipsHtml(lvl, t.max)}<span>${lvl} / ${t.max}</span></div><div class="desc">${t.desc}</div></div>
        <div class="acts"></div>`;
      const c = talentCost(lvl);
      row.querySelector(".acts").appendChild(lvl < t.max
        ? actionBtn(`${I("upgrade")}${coinAmt(c)}`, save.coins >= c, () => { save.coins -= c; save.talents[id]++; })
        : actionBtn(tr("Maximal"), false, () => {}));
      list.appendChild(row);
    }
    refreshMenu();
  }

  function actionBtn(label, enabled, fn, tone = "") {
    const b = document.createElement("button");
    b.className = `btn ${tone}`;
    b.innerHTML = label;
    b.disabled = !enabled;
    b.addEventListener("click", () => {
      fn();
      persist();
      sfx("coin");
      if (!ui.armory.classList.contains("hidden")) renderArmory(); else renderTalents();
    });
    return b;
  }

  // ---------- Missionen, Erfolge, Statistik ----------
  const bar = (k, cls = "") => `<div class="bar-p ${cls}"><i style="width:${Math.round(Math.min(1, Math.max(0, k)) * 100)}%"></i></div>`;
  function untilMidnight() {
    const d = new Date(), m = new Date(d); m.setHours(24, 0, 0, 0);
    const min = Math.ceil((m - d) / 6e4);
    return `${Math.floor(min / 60)} h ${min % 60} min`;
  }
  let missionTab = "daily";
  function renderMissions() {
    for (const b of document.querySelectorAll("#missionTabs button")) b.classList.toggle("active", b.dataset.tab === missionTab);
    const m = missionsFresh(), list = $("missionList");
    list.innerHTML = "";
    const claimBtn = (done, ready) => (done ? I("check") : tr("Abholen"));
    if (missionTab === "daily" || missionTab === "weekly") {
      const kind = missionTab, r = MISSION_REWARD[kind];
      for (const q of kind === "daily" ? m.daily : m.weekly) {
        const ready = q.p >= q.goal && !q.done;
        const row = shopRow(medal(MISSIONS[q.id].icon, q.done ? "steel" : "toxic"), missionText(q),
          `${bar(q.p / q.goal)}<div class="meta"><span>${num(q.p)} / ${num(q.goal)}</span>${coinAmt(r.coins, "+")}<span>+${r.xp} ${tr("Pass-XP")}</span></div>`,
          ready ? `<span class="tag">${tr("FERTIG")}</span>` : "", claimBtn(q.done, ready), ready, () => { claimMission(q, kind); renderMissions(); refreshMenu(); }, ready ? "primary" : "");
        if (q.done) row.classList.add("dim");
        list.appendChild(row);
      }
      if (kind === "daily") {
        const all = m.daily.every((q) => q.done), b = MISSION_REWARD.bonus, ready = all && !m.bonus;
        const row = shopRow(medal("chest", "amber", "big"), tr("Tagesbonus"), `${tr("Alle 3 Tagesmissionen abgeschlossen")}<div class="meta">${coinAmt(b.coins, "+")}<span>${tr("Boost")}</span><span>+${b.xp} ${tr("Pass-XP")}</span></div>`,
          ready ? `<span class="tag">${tr("FERTIG")}</span>` : `<span class="tag amber">${tr("BONUS")}</span>`, claimBtn(m.bonus, ready), ready, () => { claimDailyBonus(); renderMissions(); refreshMenu(); }, ready ? "primary" : "");
        if (m.bonus) row.classList.add("dim");
        list.appendChild(row);
      }
      $("missionNote").textContent = kind === "daily" ? tr("Neue Missionen in {t}", { t: untilMidnight() }) : tr("Neue Wochenmissionen jeden Montag");
      return;
    }
    for (const a of ACHIEVEMENTS) {
      const t = save.ach[a.id] || 0, maxed = t >= a.tiers.length, goal = a.tiers[Math.min(t, a.tiers.length - 1)];
      const tiers = `<span class="tiers">${TIER.map((c, i) => `<i class="${c}${i < t ? " on" : ""}">${I("medal")}</i>`).join("")}</span>`;
      const text = tr(goal === 1 && a.one ? a.one : a.text, { n: num(goal) });
      const ready = achClaimable(a);
      const row = shopRow(medal(a.icon, maxed ? "gold" : "amber"), `${a.name} ${tiers}`, `${text}${bar(a.val() / goal, "amber")}<div class="meta"><span>${num(Math.min(a.val(), goal))} / ${num(goal)}</span></div>`,
        ready ? `<span class="tag">${tr("FERTIG")}</span>` : "", maxed ? I("check") : coinAmt(ACH_REWARD[t], "+"), ready, () => { claimAchievement(a); renderMissions(); refreshMenu(); }, ready ? "primary" : "");
      list.appendChild(row);
    }
    const st = save.stats, box = document.createElement("div");
    box.className = "stats panel";
    const rows = [["zombie", "Zombies getötet", num(st.kills)], ["bossSkull", "Bosse besiegt", num(st.bosses)], ["star", "Elite-Zombies", num(st.elites)], ["door", "Räume gesäubert", num(st.rooms)],
      ["play", "Einsätze", num(st.runs)], ["dna", "Evolutionen", num(st.evolutions)], ["headshot", "Kopfschüsse", num(st.headshots)], ["upgrade", "Höchstes Level", num(st.level)],
      ["stopwatch", "Längstes Überleben", fmtTime(st.survival)], ["hourglass", "Spielzeit", `${Math.floor(st.time / 3600)} h ${Math.floor((st.time % 3600) / 60)} min`]];
    box.innerHTML = rows.map(([ic, k, v]) => `<span>${I(ic)}${tr(k)}</span><b>${v}</b>`).join("");
    list.appendChild(box);
    $("missionNote").textContent = tr("Statistik über alle Einsätze");
  }
  const missionsClaimable = () => {
    const m = missionsFresh();
    return m.daily.concat(m.weekly).some((q) => q.p >= q.goal && !q.done) || (!m.bonus && m.daily.every((q) => q.done)) || ACHIEVEMENTS.some(achClaimable);
  };

  // ---------- Saisonpass ----------
  function renderPass() {
    const s = passFresh(), lvl = passLevel(), prem = passPremium();
    $("passKicker").textContent = tr("Saison {n}", { n: s.id }).toUpperCase();
    const xpIn = save.pass.xp - lvl * PASS_STEP;
    $("passHead").innerHTML = `<div class="pass-top"><b>${tr("Saison {n}", { n: s.id })}</b><span>${I("hourglass")} ${tr("Noch {d} Tage", { d: s.left })}</span></div>
      <div class="pass-lvl">${tr("Stufe")} <b>${lvl}</b> / ${PASS_LEVELS}</div>
      ${lvl < PASS_LEVELS ? `${bar(xpIn / PASS_STEP, "amber")}<small>${xpIn} / ${PASS_STEP} ${tr("Pass-XP")}</small>` : `<small>${tr("Höchste Stufe erreicht!")}</small>`}
      <small class="hint">${tr("Pass-XP gibt es für Missionen, gesäuberte Räume, Bosse und Überlebenszeit.")}</small>`;
    const buy = $("passBuy");
    buy.innerHTML = "";
    if (!prem) buy.appendChild(iapRow(medal("pass", "gold", "big"), tr("Premium-Pass"), tr("Doppelte Belohnungen und der exklusive Skin „Seuchenjäger“ – gilt für diese Saison"), `<span class="tag gold">${tr("PREMIUM")}</span>`, IDS.seasonPass, false));
    const list = $("passList");
    list.innerHTML = `<div class="pass-row head"><span>${tr("Gratis")}</span><span></span><span class="p">${tr("Premium")}${prem ? ` ${I("check")}` : ""}</span></div>`;
    for (let l = 1; l <= PASS_LEVELS; l++) {
      const row = document.createElement("div");
      row.className = `pass-row${l <= lvl ? " reached" : ""}`;
      const cell = (pr) => {
        const done = (pr ? save.pass.prem : save.pass.free).includes(l), locked = pr && !prem, can = l <= lvl && !done && !locked;
        const ri = rewardInfo(passReward(l, pr));
        const b = document.createElement("button");
        b.className = `pass-cell${can ? " ready" : ""}${done ? " done" : ""}${locked ? " locked" : ""}${pr ? " prem" : ""}`;
        b.innerHTML = `${medal(ri.icon, ri.tone, "sm")}<span>${ri.text}</span>${done ? `<span class="ok">${I("check")}</span>` : locked ? `<span class="lk">${I("lock")}</span>` : ""}`;
        b.disabled = !can;
        b.addEventListener("click", () => { claimPass(l, pr); renderPass(); refreshMenu(); });
        return b;
      };
      row.appendChild(cell(false));
      const lv = document.createElement("span");
      lv.className = "pl"; lv.textContent = l;
      row.appendChild(lv);
      row.appendChild(cell(true));
      list.appendChild(row);
    }
    refreshMenu();
  }

  // ---------- Patrouille ----------
  function renderPatrol() {
    const h = patrolHours(), c = patrolCoins(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    $("patrolInfo").innerHTML = `<div class="patrol-amt">${I("coin")}${num(c)}</div>
      ${bar(h / PATROL_MAX_H, "amber")}<small>${hh} h ${mm} min / ${PATROL_MAX_H} h</small>
      <p class="hint">${tr("{r} Münzen pro Stunde – steigt mit deinem Rekordkapitel. Ab {h} h ist der Speicher voll.", { r: patrolRate(), h: PATROL_MAX_H })}</p>`;
    $("patrolClaim").disabled = c < 1;
    $("patrolClaim").innerHTML = tr("Abholen");
    const ads = Platform.ads.available;
    $("patrolClaimAd").classList.toggle("hidden", !ads);
    $("patrolClaimAd").disabled = c < 1;
    const ql = quickLeft();
    $("patrolQuick").classList.toggle("hidden", !ads);
    $("patrolQuick").disabled = ql < 1;
    $("patrolQuick").innerHTML = adLabel(`${tr("Schnellpatrouille")} ${coinAmt(QUICK_PATROL_H * patrolRate(), "+")} <small>${ql}/${QUICK_PATROLS}</small>`);
  }

  // ---------- Kodex der Evolutionen ----------
  function renderCodex() {
    const list = $("codexList");
    list.innerHTML = "";
    for (const ev of EVOLUTIONS) {
      const found = !!save.codex[ev.id];
      const recipe = Object.entries(ev.needs).map(([id, n]) => { const sk = skillById(id); return `<span class="ing">${medal(sk.icon, RARITY_TONE[sk.rarity])}${sk.name}${n > 1 ? ` ×${n}` : ""}</span>`; }).join('<span class="arr">+</span>');
      const row = document.createElement("div");
      row.className = `item codex${found ? " found" : ""}`;
      row.innerHTML = `<div class="ico">${medal(ev.icon)}</div><div>${found ? `<span class="tag gold">${tr("ENTDECKT")}</span>` : ""}<div class="name">${ev.name}</div><div class="desc">${ev.desc}</div><div class="recipe evo-hint">${recipe}</div></div><div></div>`;
      list.appendChild(row);
    }
    $("codexNote").textContent = tr("{n} von {m} entdeckt – Rezepte sind nie geheim.", { n: Object.keys(save.codex).length, m: EVOLUTIONS.length });
  }

  // ============================================================
  // Shop, tägliche Belohnung, Einstellungen (Monetarisierung)
  // ============================================================
  const IDS = Platform.cfg.iap || {};
  const COIN_PACKS = { [IDS.coinsSmall]: 1200, [IDS.coinsBig]: 7000 };
  const SHOP_ITEMS = [
    { id: IDS.starter, icon: "backpack", name: tr("Starterpaket"), desc: tr("Werbefrei + 3.000 Münzen + Armbrust"), tag: tr("BESTER DEAL"), owned: () => save.starterOwned },
    { id: IDS.noAds, icon: "noAds", name: tr("Werbefrei"), desc: tr("Keine Zwangswerbung mehr. Bonus-Videos bleiben freiwillig."), owned: () => save.noAds },
    { id: IDS.coinsSmall, icon: "coins", name: tr("Münzbeutel"), desc: tr("1.200 Münzen") },
    { id: IDS.coinsBig, icon: "chest", name: tr("Münztruhe"), desc: tr("7.000 Münzen"), tag: tr("+45% MEHR") },
  ];
  // Skins: reine Optik (Goldener Held zusätzlich +10 % Münzen, nur per In-App-Kauf)
  const SKINS = [
    { id: "soldier", icon: "soldier", name: tr("Soldat"), price: 0 },
    { id: "police", icon: "police", name: tr("SWAT"), price: 1500 },
    { id: "firefighter", icon: "firefighter", name: tr("Feuerwehr"), price: 2500 },
    { id: "hazmat", icon: "hazmat", name: tr("Biohazard"), price: 3500 },
    { id: "ninja", icon: "ninja", name: tr("Schatten-Ninja"), price: 5000 },
    { id: "cyber", icon: "cyber", name: tr("Cyber-Agent"), price: 8000 },
    { id: "plague", icon: "plagueDoc", name: tr("Seuchendoktor"), price: 12000 },
    { id: "gold", icon: "crown", name: tr("Goldener Held"), iap: IDS.goldSkin, desc: tr("Premium-Skin · +10% Münzen") },
    { id: "hunter", icon: "hunter", name: tr("Seuchenjäger"), pass: true, desc: tr("Exklusiv im Premium-Saisonpass") },
  ];
  const BOOSTS = [
    { id: "hp", icon: "heartArmor", name: tr("Zähigkeit+"), desc: tr("+30% max. HP im nächsten Einsatz"), price: 300 },
    { id: "coins", icon: "clover", name: tr("Glücksbringer"), desc: tr("+50% Münzen im nächsten Einsatz"), price: 400 },
    { id: "skill", icon: "gift", name: tr("Startvorteil"), desc: tr("Starte mit einem zusätzlichen Skill"), price: 500 },
    { id: "revive", icon: "angel", name: tr("Schutzengel"), desc: tr("Einmal wiederbeleben im nächsten Einsatz"), price: 800 },
  ];
  const MYSTERY_PRICE = 1500;
  // Gewinnchancen der Überraschungskiste – eine Quelle für Ziehung UND Anzeige, damit die
  // angezeigten Prozente immer stimmen (Google Play: Zufallsbelohnungen gegen Bezahlung offenlegen).
  // Ist alles gesammelt, rutscht der Anteil in die nächste Kategorie.
  function mysteryOdds() {
    const skins = SKINS.filter((q) => q.price && !save.skins[q.id]);
    const weapons = Object.keys(WEAPONS).filter((id) => !save.weapons[id]);
    const skin = skins.length ? 0.15 : 0, weapon = weapons.length ? 0.35 - skin : 0;
    return { skins, weapons, odds: [["skin", skin], ["weapon", weapon], ["boosts", 0.6 - skin - weapon], ["coins", 0.4]] };
  }
  function openMystery(free = false) {
    if (!free) {
      if (save.coins < MYSTERY_PRICE) return;
      save.coins -= MYSTERY_PRICE;
    }
    const { skins, weapons, odds } = mysteryOdds();
    let r = Math.random(), kind = "coins";
    for (const [k, p] of odds) { if (r < p) { kind = k; break; } r -= p; }
    let msg;
    let icon = "mystery";
    if (kind === "skin") { const q = pick(skins); save.skins[q.id] = true; msg = `${tr("Neuer Skin")}: ${q.name}!`; icon = q.icon; }
    else if (kind === "weapon") { const id = pick(weapons); save.weapons[id] = 1; msg = `${tr("Neue Waffe")}: ${WEAPONS[id].name}!`; icon = "weapons"; }
    else if (kind === "boosts") { const a = pick(BOOSTS), b2 = pick(BOOSTS); save.boosts[a.id]++; save.boosts[b2.id]++; msg = `${a.name} + ${b2.name}`; icon = "gift"; }
    else { const c = randi(8, 26) * 100; save.coins += c; msg = coinAmt(c, "+"); icon = "coins"; }
    persist();
    sfx("level");
    if (save.vibration) Platform.vibrate(40);
    toast(msg, icon);
  }
  const DAILY = [100, 150, 200, 300, 400, 500, 1000];
  const FREE_COINS_PER_DAY = 5;

  function localDay(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function toast(msg, icon = "check") {
    const el = $("toast");
    el.innerHTML = `${I(icon)}<span>${msg}</span>`;
    el.classList.remove("hidden");
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.add("hidden"), 2400);
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
    } else if (id === IDS.goldSkin) {
      changed = !save.skins.gold;
      save.skins.gold = true;
      if (changed && !restore) save.skin = "gold";
    } else if (id === IDS.seasonPass && !restore) {
      passFresh();
      changed = save.pass.premium !== save.pass.season;
      save.pass.premium = save.pass.season;
      if (!ui.pass.classList.contains("hidden")) renderPass();
    } else if (COIN_PACKS[id] && !restore) {
      save.coins += COIN_PACKS[id];
      changed = true;
    }
    if (!restore) { save.txns.push(txId); if (save.txns.length > 200) save.txns.shift(); }
    persist();
    if (changed) { sfx("level"); toast(restore ? tr("Kauf wiederhergestellt") : tr("Kauf erfolgreich – danke!"), "gift"); }
    refreshMenu();
    if (!ui.shop.classList.contains("hidden")) renderShop();
  });
  Platform.on("iap", () => { if (!ui.shop.classList.contains("hidden")) renderShop(); });

  function freeCoinsLeft() {
    if (save.freeCoins.day !== localDay()) return FREE_COINS_PER_DAY;
    return Math.max(0, FREE_COINS_PER_DAY - save.freeCoins.n);
  }
  const freeCoinAmount = () => 150 + 50 * save.best.chapter;

  let shopTab = "offers", previewSkin = null;
  function renderShop() {
    for (const b of document.querySelectorAll("#shopTabs button")) b.classList.toggle("active", b.dataset.tab === shopTab);
    const list = $("shopList");
    list.innerHTML = "";
    // 3D-Vorschau des Skins (nur mit WebGL)
    const pv = $("skinPreview"), showPv = shopTab === "skins" && !!webgl;
    pv.classList.toggle("hidden", !showPv);
    if (showPv) Render3D.preview(pv, previewSkin || save.skin, save.equipped, weaponTier(save.weapons[save.equipped] || 1));
    else if (webgl) Render3D.stopPreview();
    if (shopTab === "skins") renderSkinList(list);
    else if (shopTab === "boosts") renderBoostList(list);
    else renderOffers(list);
    const iapReady = Platform.iap.available;
    $("shopNote").textContent = Platform.isNative
      ? (iapReady ? tr("Zahlung sicher über Google Play.") : tr("Verbinde mit Google Play …"))
      : tr("Käufe sind in der Android-App verfügbar.");
    $("restoreBtn").classList.toggle("hidden", !Platform.isNative || shopTab !== "offers");
    refreshMenu();
  }
  // Preis-Knopf für einen In-App-Kauf
  function iapRow(icon, name, desc, tag, id, owned) {
    if (owned) return shopRow(icon, name, desc, tag, `${I("check")} ${tr("Gekauft")}`, false, null);
    const iapReady = Platform.iap.available;
    const prod = iapReady ? Platform.iap.product(id) : null;
    const label = prod && prod.price ? prod.price : iapReady ? "…" : tr("In der App");
    return shopRow(icon, name, desc, tag, label, !!(prod && prod.canPurchase), async (btn) => {
      btn.disabled = true;
      const ok = await Platform.iap.buy(id);
      if (!ok) toast(tr("Kauf abgebrochen"), "close");
      btn.disabled = false;
    }, "amber");
  }
  function renderOffers(list) {
    if (Platform.ads.available) {
      const left = freeCoinsLeft();
      list.appendChild(shopRow(medal("video", "violet"), tr("Gratis-Münzen"), tr("Kurzes Video ansehen: +{x} Münzen ({l}/{n} heute)", { x: freeCoinAmount(), l: left, n: FREE_COINS_PER_DAY }), "", left > 0 ? adLabel(tr("Gratis")) : tr("Morgen wieder"), left > 0, async (btn) => {
        btn.disabled = true;
        const ok = await Platform.ads.showRewarded("free_coins");
        if (ok) {
          if (save.freeCoins.day !== localDay()) save.freeCoins = { day: localDay(), n: 0 };
          save.freeCoins.n++;
          save.coins += freeCoinAmount();
          persist();
          sfx("coin");
          toast(coinAmt(freeCoinAmount(), "+"), "coins");
        } else toast(tr("Kein Video verfügbar"), "video");
        renderShop();
      }, "ad"));
    }
    const pct = Object.fromEntries(mysteryOdds().odds.map(([k, p]) => [k, Math.round(p * 100)]));
    list.appendChild(shopRow(medal("mystery", "amber", "big"), tr("Überraschungskiste"), tr("Chancen: Skin {skin} % · Waffe {weapon} % · 2 Boosts {boosts} % · 800–2.600 Münzen {coins} %", pct), `<span class="tag">${tr("NEU")}</span>`, coinAmt(MYSTERY_PRICE), save.coins >= MYSTERY_PRICE, () => { openMystery(); renderShop(); }, "amber"));
    const gold = SKINS.find((q) => q.id === "gold");
    list.appendChild(iapRow(medal(gold.icon, "gold", "big"), gold.name, gold.desc, `<span class="tag gold">${tr("PREMIUM")}</span>`, gold.iap, save.skins.gold));
    for (const it of SHOP_ITEMS) list.appendChild(iapRow(medal(it.icon, "amber", "big"), it.name, it.desc, it.tag ? `<span class="tag amber">${it.tag}</span>` : "", it.id, it.owned && it.owned()));
  }
  function renderSkinList(list) {
    for (const q of SKINS) {
      const owned = !!save.skins[q.id], active = save.skin === q.id;
      const ic = medal(q.icon, q.iap ? "gold" : q.pass ? "amber" : owned ? "toxic" : "steel");
      let row;
      if (q.iap && !owned) row = iapRow(ic, q.name, q.desc, `<span class="tag gold">${tr("PREMIUM")}</span>`, q.iap, false);
      else if (q.pass && !owned) row = shopRow(ic, q.name, q.desc, `<span class="tag amber">${tr("SAISONPASS")}</span>`, `${I("pass")}${tr("Zum Pass")}`, true, () => { renderPass(); show(ui.pass); });
      else if (owned) row = shopRow(ic, q.name, active ? tr("Ausgerüstet") : tr("Im Besitz"), active ? `<span class="tag">${tr("Aktiv")}</span>` : "", active ? I("check") : tr("Ausrüsten"), !active, () => { save.skin = q.id; previewSkin = q.id; persist(); sfx("coin"); renderShop(); }, active ? "" : "primary");
      else row = shopRow(ic, q.name, tr("Nur Optik – zeig, wer du bist."), "", coinAmt(q.price), save.coins >= q.price, () => {
        if (save.coins < q.price) return;
        save.coins -= q.price; save.skins[q.id] = true; save.skin = q.id; previewSkin = q.id;
        persist(); sfx("level"); toast(`${q.name}!`, q.icon); renderShop();
      }, "amber");
      if (active) row.classList.add("active");
      // Antippen der Zeile zeigt den Skin in der Vorschau
      row.classList.add("pickable");
      if ((previewSkin || save.skin) === q.id) row.classList.add("selected");
      row.addEventListener("click", (ev) => { if (ev.target.closest("button")) return; previewSkin = q.id; renderShop(); });
      list.appendChild(row);
    }
  }
  function renderBoostList(list) {
    for (const q of BOOSTS) {
      const n = save.boosts[q.id] || 0;
      list.appendChild(shopRow(medal(q.icon, "toxic"), `${q.name}${n ? ` <span class="cnt">×${n}</span>` : ""}`, q.desc, n ? `<span class="tag">${tr("BEREIT")}</span>` : "", coinAmt(q.price), save.coins >= q.price, () => {
        if (save.coins < q.price) return;
        save.coins -= q.price; save.boosts[q.id] = n + 1; persist(); sfx("coin"); renderShop();
      }, "amber"));
    }
  }

  function shopRow(icon, name, desc, tag, label, enabled, onClick, cls = "") {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div class="ico">${icon}</div>
      <div>${tag || ""}<div class="name">${name}</div>${desc ? `<div class="desc">${desc}</div>` : ""}</div>
      <div class="acts"></div>`;
    const b = document.createElement("button");
    b.className = `btn ${cls}`;
    b.innerHTML = label;
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
      d.innerHTML = `${tr("Tag {n}", { n: i + 1 })}${I(i === 6 ? "chest" : i >= 3 ? "coins" : "coin")}<b>${num(amount)}</b>`;
      grid.appendChild(d);
    });
    $("dailyClaim").disabled = st.claimedToday;
    $("dailyClaim").innerHTML = st.claimedToday ? tr("Morgen wieder") : `${tr("Abholen")} ${coinAmt(DAILY[st.idx], "+")}`;
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
    toast(coinAmt(amount, "+"), "coins");
    renderDaily();
    refreshMenu();
  }

  function openDaily() { renderDaily(); show(ui.daily); }

  function renderSettings() {
    const row = (icon, label, val) => `${I(icon)}<span class="lbl">${label}</span>${val}`;
    const sw = (on) => `<span class="switch${on ? " on" : ""}"></span>`;
    const valTxt = (t) => `<span class="val">${t}</span>`;
    $("soundBtn2").innerHTML = row(save.sound ? "sound" : "soundOff", tr("Sound"), sw(save.sound));
    $("vibBtn").innerHTML = row("vibration", tr("Vibration"), sw(save.vibration));
    $("langBtn").innerHTML = row("language", tr("Sprache"), valTxt(I18N.lang === "de" ? "Deutsch" : "English"));
    const gfxNames = init3d() ? ["2D (schnell)", "3D", "3D + Schatten"] : ["Niedrig", "Mittel", "Hoch"];
    $("gfxBtn").innerHTML = row("graphics", tr("Grafik"), valTxt(tr(gfxNames[quality])));
    $("fpsBtn").innerHTML = row("battery", tr("Akku sparen (30 FPS)"), sw(!!save.fps30));
    $("privacyOptsBtn").innerHTML = row("privacy", tr("Werbe-Einwilligung ändern"), "");
    $("privacyOptsBtn").classList.toggle("hidden", !Platform.isNative);
    $("privacyLink").innerHTML = row("info", tr("Datenschutzerklärung"), "");
    $("privacyLink").href = Platform.cfg.privacyUrl || "privacy.html";
    // In der App im selben WebView öffnen: externe Links leitet Capacitor an den Browser weiter,
    // lokale Seiten bleiben per Zurück-Taste erreichbar.
    if (Platform.isNative) $("privacyLink").removeAttribute("target");
    $("versionLine").innerHTML = `Outbreak Hero v${Platform.cfg.version || "1.0.0"}${Platform.isNative ? " · Android" : " · Web"}<br>${tr("Icons: game-icons.net (CC BY 3.0) · Schriften: Teko, Barlow, Saira Stencil (SIL OFL)")}`;
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
    if (webgl) Render3D.stopPreview();
    if (webgl) Render3D.clear();
    refreshMenu();
    const st = dailyState();
    $("dailyBadge").classList.toggle("hidden", st.claimedToday);
    const cta = $("storeCta");
    cta.classList.toggle("hidden", Platform.isNative || !Platform.cfg.playStoreUrl);
    if (Platform.cfg.playStoreUrl) cta.href = Platform.cfg.playStoreUrl;
    if (!dailyShown && !st.claimedToday) { dailyShown = true; openDaily(); return; }
    show(ui.menu);
  }

  $("rerollBtn").innerHTML = adLabel(tr("Neu würfeln"));
  $("reviveAdBtn").innerHTML = adLabel(tr("Wiederbeleben"));
  $("dailyClaimAd").innerHTML = adLabel(tr("×2 abholen"));
  $("patrolClaimAd").innerHTML = adLabel(tr("×2 abholen"));
  $("loadoutBtn").addEventListener("click", () => { ensureAudio(); renderArmory(); show(ui.armory); });
  $("playBtn").addEventListener("click", () => startRun("campaign"));
  $("survivalBtn").addEventListener("click", () => startRun("survival"));
  $("againBtn").addEventListener("click", () => leaveOver(() => startRun(lastMode)));
  $("missionsBtn").addEventListener("click", () => { ensureAudio(); renderMissions(); show(ui.missions); });
  for (const b of document.querySelectorAll("#missionTabs button")) b.addEventListener("click", () => { missionTab = b.dataset.tab; renderMissions(); });
  $("passBtn").addEventListener("click", () => { ensureAudio(); renderPass(); show(ui.pass); });
  $("codexBtn").addEventListener("click", () => { ensureAudio(); renderCodex(); show(ui.codex); });
  $("patrolBtn").addEventListener("click", () => { ensureAudio(); renderPatrol(); show(ui.patrol); });
  $("patrolClaim").addEventListener("click", () => { claimPatrol(1); renderPatrol(); refreshMenu(); });
  $("patrolClaimAd").addEventListener("click", async () => {
    const b = $("patrolClaimAd");
    b.disabled = true;
    const ok = await Platform.ads.showRewarded("patrol_x2");
    if (ok) claimPatrol(2); else toast(tr("Kein Video verfügbar"), "video");
    renderPatrol(); refreshMenu();
  });
  $("patrolQuick").addEventListener("click", async () => {
    if (quickLeft() < 1) return;
    $("patrolQuick").disabled = true;
    const ok = await Platform.ads.showRewarded("quick_patrol");
    if (ok) {
      if (save.patrol.quickDay !== localDay()) save.patrol = { ...save.patrol, quickDay: localDay(), quick: 0 };
      save.patrol.quick++;
      const c = QUICK_PATROL_H * patrolRate();
      save.coins += c; persist(); sfx("coin"); toast(coinAmt(c, "+"), "patrol");
    } else toast(tr("Kein Video verfügbar"), "video");
    renderPatrol(); refreshMenu();
  });
  $("menuBtn").addEventListener("click", () => leaveOver(toMenu));
  $("armoryBtn").addEventListener("click", () => { ensureAudio(); renderArmory(); show(ui.armory); });
  $("talentBtn").addEventListener("click", () => { ensureAudio(); renderTalents(); show(ui.talents); });
  $("shopBtn").addEventListener("click", () => { ensureAudio(); previewSkin = null; show(ui.shop); renderShop(); });
  for (const b of document.querySelectorAll("#shopTabs button")) b.addEventListener("click", () => { shopTab = b.dataset.tab; renderShop(); });
  $("dailyBtn").addEventListener("click", () => { ensureAudio(); openDaily(); });
  $("settingsBtn").addEventListener("click", () => { renderSettings(); show(ui.settings); });
  for (const b of document.querySelectorAll("[data-back]")) b.addEventListener("click", toMenu);
  $("dailyClaim").addEventListener("click", () => claimDaily(1));
  $("dailyClaimAd").addEventListener("click", async () => {
    const b = $("dailyClaimAd");
    b.disabled = true;
    const ok = await Platform.ads.showRewarded("daily_x2");
    if (ok) claimDaily(2); else { toast(tr("Kein Video verfügbar"), "video"); b.disabled = false; }
  });
  $("restoreBtn").addEventListener("click", async () => { toast(tr("Suche Käufe …"), "info"); await Platform.iap.restore(); renderShop(); });
  $("reviveAdBtn").addEventListener("click", reviveWithAd);
  $("reviveNoBtn").addEventListener("click", () => { if (state === "revive") gameOver(false); });
  $("rerollBtn").addEventListener("click", async () => {
    const fn = rerollHandler;
    if (!fn) return;
    rerollHandler = null;
    $("rerollBtn").classList.add("hidden");
    const ok = await Platform.ads.showRewarded("reroll");
    if (ok && state === "pick") { run.adWatched = true; fn(); } else if (!ok) toast(tr("Kein Video verfügbar"), "video");
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
      b.innerHTML = `${I("check")} ${coinAmt(run.earned, "+")}`;
    } else { b.disabled = false; toast(tr("Kein Video verfügbar"), "video"); }
  });
  ui.pauseBtn.addEventListener("click", togglePause);
  $("resumeBtn").addEventListener("click", togglePause);
  $("quitBtn").addEventListener("click", () => gameOver(true));
  const soundBtn = $("soundBtn");
  const syncSound = () => { soundBtn.innerHTML = `${I(save.sound ? "sound" : "soundOff")}${tr(save.sound ? "Ton an" : "Ton aus")}`; renderSettings(); };
  const toggleSound = () => { save.sound = !save.sound; persist(); syncSound(); };
  soundBtn.addEventListener("click", toggleSound);
  $("soundBtn2").addEventListener("click", toggleSound);
  $("vibBtn").addEventListener("click", () => { save.vibration = !save.vibration; persist(); renderSettings(); if (save.vibration) Platform.vibrate(40); });
  $("privacyOptsBtn").addEventListener("click", () => Platform.ads.showPrivacyOptions());
  $("gfxBtn").addEventListener("click", () => {
    quality = (quality + 1) % 3;
    resStep = 0;
    save.gfx = quality;
    persist();
    resize();
    renderSettings();
  });
  $("fpsBtn").addEventListener("click", () => { save.fps30 = !save.fps30; persist(); renderSettings(); });
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
  window.__outbreak = { get state() { return state; }, get run() { return run; }, get player() { return player; }, get enemies() { return enemies; }, get bullets() { return bullets; }, get particles() { return particles; }, get zaps() { return zaps; }, save, hurt: (d) => hurtPlayer(d), spawn: (t, x, y) => spawnEnemy(t, x, y), freeze: () => { state = "frozen"; player.hurtT = 0; player.invuln = 0; banner = null; texts = texts.filter((t) => t.size < 22); }, get mode3d() { return mode3d; }, get obstacles() { return obstacles; }, get orbs() { return orbs; }, get corpses() { return corpses; }, get pieces() { return pieces; }, boom: (x, y, r = 70) => explode(x, y, r, 0, true), hit: (e, d, o = {}) => damageEnemy(e, d, o), evolve: (id) => takeEvolution(EVOLUTIONS.find((q) => q.id === id)), get passInfo() { return { ...seasonInfo(), level: passLevel(), premium: passPremium() }; }, levelUp: () => addXp(player.xpNeed - player.xp), setGfx: (q, lock = true) => { quality = q; gfxLocked = lock; resize(); } };
})();
