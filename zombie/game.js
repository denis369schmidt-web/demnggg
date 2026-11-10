/* Outbreak! Germany (früher „Escape from Germany“, intern „Outbreak Hero“) – Zombie-Roguelite im Stil von Room-Clearing-Shootern.
 * Reines Canvas + Vanilla JS, keine Abhängigkeiten. Läuft als PWA auf Android.
 */
"use strict";
(() => {
  // ============================================================
  // Konstanten & Hilfsfunktionen
  // ============================================================
  const W = 540;
  const H = 960;
  // v3.4 größere Arenas: 1,5× so lang wie bisher – der Bildschirm (H) zeigt nur einen Ausschnitt, die Kamera läuft mit.
  const ARENA = { x: 24, y: 120, w: W - 48, h: 1200 };
  const L = ARENA.x, R = ARENA.x + ARENA.w, T = ARENA.y, B = ARENA.y + ARENA.h;
  const WH = B + 40; // Welthöhe (Boden-Leinwand samt unterer Mauer)
  const AREA_K = ARENA.h / 800; // Flächenfaktor gegenüber der alten Arena (Hindernisse, Bodendetails)
  const ST = 120, SB = 920; // Bildschirm-Lage der alten Arena: HUD-Knöpfe und Tutorial bleiben dort
  let camY = 0, scrOff = 0; // 2D-Kamera (Weltversatz nach oben) und Versatz für Overlay-Projektionen
  const DOOR_W = 84;
  const ROOMS_PER_CHAPTER = 20;
  const SUPPLY_ROOMS = [5, 15];
  const BOSS_ROOMS = { 10: "abom", 20: "mother" };
  // Jedes Kapitel spielt in einer anderen Umgebung (Straße → Krankenhaus → Labor → …)
  const THEME_ORDER = ["street", "hospital", "lab"];
  const OBSTACLE_POOL = {
    street: ["car", "car", "crate", "barrels", "barricade", "dumpster", "automat", "glascontainer", "telefonzelle", "sandsack", "bauzaun", "feuertonne", "bus", "container",
      "litfass", "tonnen", "tonnen", "parkbank", "polizeiauto", "bushalte", "trafo"], // v3.4 Alltagsobjekte, v3.7 Stromkasten
    hospital: ["bed", "bed", "cabinet", "medcrate", "medcrate", "barrels", "sandsack", "rollstuhl", "rollstuhl", "infusion", "infusion"],
    lab: ["tank", "tank", "server", "labcrate", "barrels", "sandsack", "zentrifuge", "zentrifuge", "trafo"],
    // Altstadt: Marktbuden, Bierbänke, Bierfässer, Brunnen, Böllerkisten und (höchstens einer) Maibaum
    markt: ["bude", "bude", "bierbank", "fass", "brunnen", "boeller", "maibaum", "crate", "telefonzelle", "glascontainer", "feuertonne", "bauzaun", "litfass", "parkbank", "parkbank", "tonnen", "trafo"],
  };
  // Feste verschieben die Mischung: mehr Bierbänke & Fässer auf der Wiesn, mehr Buden am Weihnachtsmarkt …
  const FEST_OBS = { wein: ["fass", "fass", "bude", "rebstock", "rebstock"], wiesn: ["bierbank", "bierbank", "fass", "fass", "maibaum", "dixi"], weihnachten: ["bude", "bude", "bude", "weihnachtsbaum", "weihnachtsbaum"], karneval: ["boeller", "boeller", "bude", "dixi"], imbiss: ["bude", "glascontainer"], bahn: ["automat"], hafen: ["crate", "fass", "strandkorb", "strandkorb", "container", "container"], apfelwein: ["bierbank", "fass"], werk: ["maibaum", "boeller"] };
  const OBSTACLE_SIZE = { // [wMin, wMax, hMin, hMax]
    car: [96, 118, 48, 52], crate: [46, 68, 40, 60], medcrate: [46, 62, 40, 54], labcrate: [48, 66, 42, 58],
    barrels: [52, 52, 52, 52], barricade: [90, 130, 26, 30], dumpster: [70, 86, 42, 46],
    bed: [88, 96, 46, 50], cabinet: [44, 60, 32, 36], tank: [56, 60, 56, 60], server: [40, 48, 70, 88],
    bude: [72, 92, 46, 54], bierbank: [84, 104, 34, 38], fass: [48, 50, 48, 50], maibaum: [26, 26, 26, 26], brunnen: [66, 66, 66, 66], boeller: [40, 46, 30, 34], automat: [30, 34, 24, 28],
    rebstock: [86, 100, 20, 24], glascontainer: [66, 74, 40, 44], dixi: [40, 40, 40, 40], telefonzelle: [34, 34, 34, 34], weihnachtsbaum: [46, 46, 46, 46], strandkorb: [50, 54, 38, 40],
    // v3.0 Sandsack-Stellung, Buswrack, Bauzaun, Feuertonne, Schiffscontainer
    sandsack: [96, 128, 26, 30], bus: [176, 200, 58, 62], bauzaun: [116, 150, 10, 12], feuertonne: [26, 26, 26, 26], container: [150, 166, 56, 60],
    // v3.4 Alltagsobjekte
    litfass: [44, 44, 44, 44], tonnen: [78, 86, 26, 28], parkbank: [70, 80, 22, 24], polizeiauto: [100, 112, 48, 52], bushalte: [104, 116, 34, 38],
    rollstuhl: [30, 34, 30, 34], infusion: [20, 20, 20, 20], zentrifuge: [46, 46, 46, 46],
    trafo: [36, 40, 24, 26], wrack: [96, 118, 48, 52], // v3.7
    // v3.4 Stadt-Wahrzeichen (feste Größe, siehe LANDMARKS)
    kaethchen: [104, 104, 104, 104], roessle: [100, 100, 60, 60], loewe: [112, 112, 60, 60], schoenbrunnen: [112, 112, 112, 112], bach: [70, 70, 70, 70],
    tor: [212, 212, 44, 44], bembel: [96, 96, 80, 80], narrenwagen: [124, 124, 64, 64], leuchtturm: [72, 72, 72, 72], windmuehle: [84, 84, 84, 84],
    eiffel: [96, 96, 96, 96], riesenrad: [150, 150, 40, 40], golem: [84, 84, 72, 72],
  };
  const ROTATABLE = { wrack: true, car: true, bed: true, bierbank: true, glascontainer: true, rebstock: true, sandsack: true, bus: true, bauzaun: true, container: true, parkbank: true, polizeiauto: true };
  const GLOWING = { barrels: "150,255,60", tank: "120,255,80", bude: "255,196,120", telefonzelle: "255,236,170", weihnachtsbaum: "255,200,120", feuertonne: "255,138,48", zentrifuge: "120,255,150", bushalte: "220,236,255", leuchtturm: "255,236,170" };
  const OBS_ONCE = { trafo: 2, maibaum: 1, brunnen: 1, telefonzelle: 1, bus: 1, container: 1, weihnachtsbaum: 2, feuertonne: 2, litfass: 1, polizeiauto: 1, bushalte: 1 };
  // v3.4 Hingucker: je Stadt ein Wahrzeichen bzw. ein Stück Tradition mitten in der (langen) Arena – unzerstörbar, gibt Deckung
  const LANDMARKS = {
    heilbronn: { kind: "kaethchen", name: "Käthchenbrunnen" }, stuttgart: { kind: "roessle", name: "Stuttgarter Rössle" }, muenchen: { kind: "loewe", name: "Bayerischer Löwe" },
    nuernberg: { kind: "schoenbrunnen", name: "Schöner Brunnen" }, leipzig: { kind: "bach", name: "Bach-Denkmal" }, berlin: { kind: "tor", name: "Brandenburger Tor" },
    frankfurt: { kind: "bembel", name: "Riesen-Bembel" }, koeln: { kind: "narrenwagen", name: "Karnevalswagen" }, hamburg: { kind: "leuchtturm", name: "Leuchtturm" },
    amsterdam: { kind: "windmuehle", name: "Windmühle" }, paris: { kind: "eiffel", name: "Eiffelturm" }, wien: { kind: "riesenrad", name: "Riesenrad" }, prag: { kind: "golem", name: "Der Golem" },
  };
  const LANDMARK_DISTRICTS = [0, 1, 8, 9]; // Stadteingang, zweiter Bezirk, vorletzter Bezirk und die Boss-Arena
  // Walker-Outfits je Welt (Index in die Paletten von sprites.js/render3d.js):
  // 0–2 Zivil, 3 Polizist, 4 Bauarbeiter, 5 Anzug, 6 Patient, 7 Ärztin, 8 Pfleger, 9 Forscher, 10 Soldat, 11 Schutzanzug
  const WALKER_LOOKS = { street: [0, 1, 2, 3, 4, 5, 0, 3], hospital: [6, 6, 7, 8, 0, 2], lab: [9, 9, 10, 11, 1, 10], markt: [0, 1, 2, 5, 0, 1, 3, 2] };
  // Zerstörbar: Giftfässer explodieren (Kettenreaktion!), Kisten zersplittern und lassen Beute fallen
  const DESTRUCT = { barrels: 70, crate: 45, medcrate: 45, labcrate: 60, bude: 90, bierbank: 50, fass: 40, maibaum: 110, boeller: 30, automat: 40, glascontainer: 60, dixi: 45, weihnachtsbaum: 120, strandkorb: 60, rebstock: 35, bauzaun: 40, feuertonne: 50,
    tonnen: 45, parkbank: 40, rollstuhl: 30, infusion: 16, bushalte: 70, // v3.4
    car: 260, polizeiauto: 240, trafo: 55 }; // v3.7 Autos (Alarm → Rauch → Brand → Explosion, Wrack bleibt) und Stromkasten
  const CARS = { car: true, polizeiauto: true };
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
    music: true,
    cine: true, // Kino-Effekte: Filmkorn, Blitze, Stromausfälle
    storySeen: false, // Prolog schon gesehen
    menuMode: "campaign", // zuletzt gewählte Einsatzart im Hauptmenü
    motion: true, // 4D: Bewegungssensor steuert die Menükamera
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
    bestiary: {}, // Gegnertyp → Abschüsse (Bestiarium)
    pass: { season: 0, xp: 0, premium: 0, free: [], prem: [] },
    patrol: { since: 0, quickDay: "", quick: 0 },
    threat: 0, // v2.5 gewählte Bedrohungsstufe (Kampagne)
    threatMax: 0, // höchste freigeschaltete Stufe
    scores: [], // Bestenliste: Top 10 { s, m, t, h, p, o, d }
    dailyBest: null, // Tagesbefehl: { day, s, o }
    gear: { vest: null, boots: null, badge: null }, // v2.6 angelegte Ausrüstung
    gearBag: [], // erbeutete, noch nicht angelegte Teile
    cityMax: 0, // v2.8 höchste freigeschaltete Startstadt (Index in CITIES)
    startCity: 0, // gewählte Startstadt
    throwOwned: { frag: true }, // v2.9 freigeschaltete Wurfwaffen
    throwSel: "frag", // Start-Wurfwaffe im Gürtel
    throwHint: false, // Hinweis auf Q/E einmal gezeigt
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
          bestiary: { ...s.bestiary },
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
  // v3.4 Wirtschaft: weniger Münzen, höhere Preise, Freischaltungen an den Fortschritt (erreichte Stadt) gebunden
  const ECON = { earn: 0.6, price: 1.7 };
  const econPrice = (v) => Math.round((v * ECON.price) / 10) * 10;
  for (const w of Object.values(WEAPONS)) w.price = econPrice(w.price);
  const WEAPON_REQ = { shotgun: 0, smg: 1, crossbow: 1, magnum: 2, flame: 2, rifle: 3, sniper: 3, disc: 4, grenade: 4, cryo: 5, tesla: 5, rocket: 6, minigun: 7, laser: 8 };
  const reqLocked = (req) => (req || 0) > (save.cityMax || 0);
  const reqText = (req) => tr("Ab {c}", { c: cityAt(req).name });
  const WEAPON_MAX_LVL = 10;
  const weaponUpgradeCost = (lvl) => econPrice(70 * lvl + 18 * lvl * lvl);
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
  const talentCost = (lvl) => econPrice(60 + 70 * lvl + 8 * lvl * lvl);

  // ============================================================
  // Skills (pro Run, Auswahl bei Level-Up)
  // ============================================================
  const SKILLS = [
    { id: "storm", name: "Querschläger-Sturm", icon: "ricochet", rarity: "legend", max: 1, cond: (p) => p.level >= 5, desc: "Jede Kugel prallt zweimal ab und durchschlägt einen Zombie", apply: (p) => { p.ricochet += 2; p.pierce += 1; } },
    { id: "chainboom", name: "Kettenreaktion", icon: "explosion", rarity: "legend", max: 1, cond: (p) => p.level >= 5, desc: "Jeder Abschuss löst eine Explosion aus", apply: (p) => { p.deathBlast += 2; } },
    { id: "bloodpact", name: "Blutpakt", icon: "vamp", rarity: "legend", max: 1, cond: (p) => p.level >= 5, desc: "+40 % Schaden, jeder Abschuss heilt 1,5 %", apply: (p) => { p.dmgMul *= 1.4; p.lifesteal += 0.015; } },
    { id: "dashcd", name: "Sprinttraining", icon: "speed", rarity: "rare", max: 2, desc: "Ausweichrolle lädt 30 % schneller", apply: (p) => { p.dashCdMul *= 0.7; } },
    { id: "dashblast", name: "Schulterstoß", icon: "splash", rarity: "epic", max: 1, desc: "Die Ausweichrolle stößt Zombies weg und bremst sie", apply: (p) => { p.dashBlast = true; } },
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
  const RARITY_WEIGHT = { common: 1, rare: 0.7, epic: 0.45, legend: 0.12 };

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
    // v1.9: acht neue Gegner mit eigener Mechanik
    healer: { name: "Seuchenpriester", r: 15, hp: 85, speed: 50, dmg: 10, xp: 4, coins: [1, 3], cost: 3, blood: GREEN },
    thrower: { name: "Brocken", r: 19, hp: 150, speed: 42, dmg: 22, xp: 5, coins: [2, 4], cost: 3.5, blood: RED },
    burrower: { name: "Wühler", r: 14, hp: 70, speed: 72, dmg: 16, xp: 4, coins: [1, 3], cost: 2.5, blood: RED },
    phantom: { name: "Schemen", r: 13, hp: 55, speed: 95, dmg: 14, xp: 4, coins: [1, 3], cost: 2.5, blood: PURPLE },
    warden: { name: "Schildwächter", r: 16, hp: 120, speed: 48, dmg: 12, xp: 5, coins: [2, 4], cost: 3.5, blood: RED },
    bloater: { name: "Gasbläher", r: 22, hp: 160, speed: 38, dmg: 18, xp: 5, coins: [2, 4], cost: 3, blood: GREEN },
    nest: { name: "Brutnest", r: 24, hp: 260, speed: 0, dmg: 8, xp: 6, coins: [3, 6], cost: 4, blood: PURPLE, anchored: true },
    gunner: { name: "Zombie-Schütze", r: 15, hp: 90, speed: 52, dmg: 9, xp: 4, coins: [1, 3], cost: 3, blood: RED },
    // v2.0: deutsche Gegner – jede Stadt schickt ihre eigenen
    wiesn: { name: "Wiesn-Zombie", r: 17, hp: 125, speed: 48, dmg: 14, xp: 4, coins: [1, 3], cost: 3, blood: RED },
    jeck: { name: "Jeck", r: 14, hp: 70, speed: 82, dmg: 9, xp: 3, coins: [1, 3], cost: 2.5, blood: RED },
    schaffner: { name: "Schaffner", r: 15, hp: 95, speed: 64, dmg: 12, xp: 4, coins: [1, 3], cost: 3, blood: RED },
    beamter: { name: "Beamter", r: 15, hp: 105, speed: 40, dmg: 10, xp: 4, coins: [2, 4], cost: 3, blood: RED },
    zwerg: { name: "Gartenzwerg", r: 8, hp: 16, speed: 150, dmg: 6, xp: 1, coins: [0, 1], cost: 0.5, pack: 4, blood: RED },
    ultra: { name: "Ultra", r: 15, hp: 85, speed: 86, dmg: 13, xp: 4, coins: [1, 3], cost: 2.5, blood: RED },
    // v2.1: Alltagshelden der Apokalypse
    scooter: { name: "E-Scooter-Fahrer", r: 14, hp: 60, speed: 72, dmg: 16, xp: 3, coins: [1, 2], cost: 2, blood: RED },
    paketbote: { name: "Paketbote", r: 15, hp: 90, speed: 56, dmg: 12, xp: 4, coins: [1, 3], cost: 3, blood: RED },
    rentner: { name: "Rentner", r: 15, hp: 120, speed: 34, dmg: 14, xp: 4, coins: [1, 3], cost: 2.5, blood: RED },
    // v2.2: Heilbronn
    wengerter: { name: "Wengerter", r: 15, hp: 95, speed: 60, dmg: 13, xp: 4, coins: [1, 3], cost: 3, blood: RED },
    goetz: { name: "GÖTZ VON BERLICHINGEN", epithet: "Der Ritter mit der eisernen Hand", r: 44, hp: 2300, speed: 56, dmg: 26, xp: 45, coins: [45, 65], boss: true, blood: RED },
    // v2.1: Stadt-Bosse – jede Stadt hat ihren eigenen Endgegner in Bezirk 10
    zugfuehrer: { name: "DER ZUGFÜHRER", epithet: "Nächster Halt: Endstation", r: 44, hp: 2500, speed: 52, dmg: 28, xp: 45, coins: [45, 65], boss: true, blood: RED },
    krampus: { name: "KRAMPUS", epithet: "Der Schrecken vom Christkindlesmarkt", r: 44, hp: 2700, speed: 60, dmg: 26, xp: 50, coins: [50, 70], boss: true, blood: RED },
    bierkoenig: { name: "DER BIERKÖNIG", epithet: "Herrscher der Theresienwiese", r: 50, hp: 3100, speed: 40, dmg: 30, xp: 55, coins: [55, 80], boss: true, blood: RED },
    narrenkoenig: { name: "DER NARRENKÖNIG", epithet: "Prinz des ewigen Karnevals", r: 42, hp: 2800, speed: 70, dmg: 24, xp: 55, coins: [55, 80], boss: true, blood: RED },
    kapitaen: { name: "DER KLABAUTERMANN", epithet: "Der Letzte zwischen dir und der ARCHE", r: 52, hp: 3600, speed: 46, dmg: 30, xp: 70, coins: [70, 100], boss: true, blood: GREEN },
    abom: { name: "ABSCHEULICHKEIT", epithet: "Patient Null aus Berlin-Buch", r: 48, hp: 2200, speed: 60, dmg: 30, xp: 40, coins: [40, 60], boss: true, blood: PURPLE },
    mother: { name: "BRUTMUTTER", epithet: "Die Königin der Brut", r: 52, hp: 2700, speed: 34, dmg: 28, xp: 50, coins: [50, 80], boss: true, blood: GREEN },
  };
  for (const [type, def] of Object.entries(ZOMBIES)) Sprites.registerRadius(type, def.r);
  Sprites.registerRadius("civilian", 13); // v2.4: Überlebende

  // ============================================================
  // v3.7 Evolutionsstufen: menschenähnliche Zombies mutieren – beim Erscheinen (je weiter die Flucht, desto öfter),
  // durch Fressen an Leichen (nur, wenn der Held weit weg ist) und durch das Brüllen eines Alphas.
  // Werte sind Faktoren gegenüber der Grundform; ab Stufe 2 Knochenpanzer und Sprungangriff, Stufe 3 brüllt und heilt sich.
  // ============================================================
  const EVO = [
    { hp: 1, dmg: 1, speed: 1, size: 1, xp: 1, coins: 1 },
    { name: "Verseucht", hp: 1.45, dmg: 1.12, speed: 1.08, size: 1.06, xp: 1.6, coins: 1.5, rgb: "140,255,80", eye: "170,255,90", blood: "#3f7a16",
      desc: "Grün leuchtende Adern, Giftblut – beim Tod bleibt eine Giftlache zurück" },
    { name: "Mutant", hp: 2.1, dmg: 1.3, speed: 1.14, size: 1.16, armor: 0.2, xp: 2.4, coins: 2.2, rgb: "255,150,50", eye: "255,176,64", blood: "#7a2a0e",
      desc: "Knochenpanzer (−20 % Schaden), Krallen und ein Sprungangriff aus kurzer Distanz" },
    { name: "Alpha", hp: 3.4, dmg: 1.55, speed: 1.2, size: 1.34, armor: 0.3, xp: 4, coins: 3.5, rgb: "255,48,60", eye: "255,70,52", blood: "#4a050e",
      desc: "Brüllt: Zombies ringsum rasen und mutieren, heilt sich, Panzer −30 %, reiche Beute" },
  ];
  // menschenähnliche Typen (3D: buildHumanoid) – Tiere, Kriecher, Rudel, Bosse und Sonderformen mutieren nicht
  const EVO_TYPES = new Set(["walker", "runner", "spitter", "brute", "armored", "leaper", "burner", "screamer", "electro", "healer", "thrower", "warden", "gunner",
    "wiesn", "jeck", "schaffner", "beamter", "ultra", "paketbote", "rentner", "wengerter"]);
  // nur diese einfachen Läufer fressen an Leichen (Typen mit eigener Fernkampf-/Sonder-KI nicht)
  const EVO_FEEDERS = new Set(["walker", "runner", "brute", "armored", "burner", "wiesn", "jeck", "schaffner", "beamter", "ultra", "paketbote", "rentner", "wengerter"]);
  const EVO_FEED_T = 2.6, EVO_LEAP_T = 0.32;
  let evoLock = false; // Test-Hook spawn(): Gegner ohne Zufalls-Mutation (alte Tests rechnen mit Grundwerten)

  I18N.localizeData({ weapons: WEAPONS, talents: TALENTS, skills: SKILLS, zombies: ZOMBIES, evolutions: EVOLUTIONS });

  // ============================================================
  // DOM
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const view = $("view");
  const canvas3d = $("game3d");
  const CAM_ORDER = ["top", "close", "tp"];
  const CAM_NAMES = { top: "Übersicht", close: "Nah", tp: "Third Person" };
  const ui = {
    menu: $("menu"), armory: $("armory"), talents: $("talents"), skillPick: $("skillPick"),
    pause: $("pause"), over: $("over"), pauseBtn: $("pauseBtn"),
    shop: $("shop"), daily: $("daily"), settings: $("settings"), revive: $("revive"),
    missions: $("missions"), pass: $("pass"), patrol: $("patrol"), codex: $("codex"), route: $("route"), ranks: $("ranks"), gear: $("gear"), mini: $("mini"),
  };
  const overlays = Object.values(ui).filter((o) => o !== ui.pauseBtn);
  // UI-Bausteine: Icons aus dem Sprite, Münzbeträge, Sechseck-Medaillons, Fortschritts-Pips
  const I = (name, cls = "") => GameIcons.html(name, cls);
  const num = (v) => Math.floor(v).toLocaleString(I18N.lang);
  const coinAmt = (n, sign = "") => `<span class="amt">${I("coin")}<b>${sign}${num(n)}</b></span>`;
  const medal = (icon, tone = "", size = "") => `<span class="medal ${tone} ${size}">${I(icon)}</span>`;
  const pipsHtml = (on, max, cls = "") => `<span class="pips ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</span>`;
  const adLabel = (txt) => `<span class="vid">${I("video")}</span><span>${txt}</span>`;
  const RARITY_TONE = { common: "steel", rare: "ice", epic: "violet", legend: "gold", evo: "gold", angel: "gold", devil: "red" };
  const RARITY_NAME = { common: "Gewöhnlich", rare: "Selten", epic: "Episch", legend: "Legendär", evo: "Evolution", angel: "Segen", devil: "Pakt" };
  // v2.8 Synergie-Sets: Skills derselben Richtung schalten ab 3 bzw. 6 Stufen Boni frei
  const SKILL_SETS = {
    gun: { name: "Feuerkraft", ids: ["multishot", "front", "diag", "side", "rear", "pierce", "ricochet", "wall", "atk", "rate", "storm"], tiers: [[3, "+10 % Feuerrate", (p) => { p.rateMul *= 1.1; }], [6, "+1 Durchschlag", (p) => { p.pierce += 1; }]] },
    elem: { name: "Elemente", ids: ["fire", "freeze", "poison", "splash", "exec", "chainboom"], tiers: [[3, "+15 % Schaden", (p) => { p.dmgMul *= 1.15; }], [5, "+15 % Krit-Chance", (p) => { p.crit += 0.15; }]] },
    surv: { name: "Überleben", ids: ["hp", "dodge", "speed", "revive", "blood", "dashcd", "dashblast", "bloodpact"], tiers: [[3, "+15 % Leben", (p) => { const a = Math.round(p.maxHp * 0.15); p.maxHp += a; p.hp += a; }], [6, "+6 % Ausweichen", (p) => { p.dodge += 0.06; }]] },
    tech: { name: "Technik", ids: ["orbit", "drone", "crit"], tiers: [[2, "+1 Drohne", (p) => { p.drones += 1; }], [4, "+1 Kreissäge", (p) => { p.orbit += 1; }]] },
  };
  const setOf = (id) => Object.keys(SKILL_SETS).find((k) => SKILL_SETS[k].ids.includes(id));
  const setLevel = (p, k) => SKILL_SETS[k].ids.reduce((a, id) => a + (p.skills[id] || 0), 0);
  function setHint(s) {
    const k = setOf(s.id);
    if (!k) return "";
    const set = SKILL_SETS[k], lv = setLevel(player, k) + 1, next = set.tiers.find(([n]) => n >= lv);
    return next ? `${tr(set.name)} ${Math.min(lv, next[0])}/${next[0]}: ${tr(next[1])}` : `${tr(set.name)} ${tr("komplett")}`;
  }
  function checkSets() {
    const p = player;
    for (const [k, set] of Object.entries(SKILL_SETS)) {
      const lv = setLevel(p, k);
      let got = run.setTier[k] || 0;
      while (got < set.tiers.length && lv >= set.tiers[got][0]) {
        set.tiers[got][2](p);
        toast(`${tr("SET")}: ${tr(set.name)} – ${tr(set.tiers[got][1])}`, "combo");
        fxRing(p.x, p.y, 70, "255,212,92", 0.45);
        got++;
      }
      run.setTier[k] = got;
    }
  }
  for (const el of document.querySelectorAll("[data-ic]")) el.innerHTML = I(el.dataset.ic);

  let curOverlay = null;
  function show(el) {
    // Hauptmenü blendet in Wellen ein (Klasse neu setzen spielt die Animation erneut ab)
    if (el === ui.menu && curOverlay !== ui.menu) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); requestAnimationFrame(startTicker); }
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
      try { webgl = !!(window.Render3D && Render3D.init(canvas3d, { W, H, WH, L, T, R, B, DOOR_W })); } catch (e) { console.warn("[Outbreak] 3D-Start fehlgeschlagen", e); }
      if (webgl) syncGearLook(); // v3.4: auch der Menü-Held trägt seine Ausrüstung
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
      Render3D.setBloom(save.bloom !== false);
      Render3D.setCamMode(save.cam || "top");
      // 3D-Auflösung bewusst begrenzt: Füllrate ist auf Handys der Engpass, das HUD bleibt trotzdem scharf
      Render3D.resize(W * scale, H * scale, Math.min(window.devicePixelRatio || 1, quality >= 2 ? 1.5 : 1) * RES_STEPS[resStep]);
    }
  }
  window.addEventListener("resize", resize);
  resize();

  // Kino-Look: animiertes Filmkorn + Vignette über dem Bild (reines CSS, eine Rauschkachel)
  const grain = document.createElement("div");
  grain.className = "grain";
  view.appendChild(grain);
  {
    const gc = document.createElement("canvas"); gc.width = gc.height = 96;
    const gg = gc.getContext("2d"), img = gg.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.random() * 120; }
    gg.putImageData(img, 0, 0);
    grain.style.backgroundImage = `url(${gc.toDataURL()})`;
  }
  function applyCine() {
    const on = save.cine !== false;
    grain.classList.toggle("off", !on);
    if (window.Render3D && Render3D.setCinematic) Render3D.setCinematic(on);
  }

  // ============================================================
  // Audio (synthetisch, keine Dateien)
  // ============================================================
  let actx = null;
  const lastSfx = {};
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
      if (actx && window.GameAudio) { GameAudio.init(actx); GameAudio.setMuted(!save.sound); GameAudio.setMusic(save.music !== false); }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function sfx(type) {
    if (!save.sound || !actx) return;
    const now = actx.currentTime;
    const minGap = { shoot: 0.05, hit: 0.03, kill: 0.04, zap: 0.08, eshot: 0.05, dig: 0.1, heal: 0.2, kick: 0.06, paper: 0.08, glass: 0.06 }[type] || 0;
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
      splat: [["noise", 1100, 160, 0.2, 0.16], ["sine", 130, 45, 0.12, 0.08]],
      combo: [["square", 660, 990, 0.09, 0.045], ["triangle", 990, 1480, 0.14, 0.05]],
      rage: [["sine", 75, 38, 0.55, 0.32], ["noise", 380, 60, 0.45, 0.14], ["sawtooth", 220, 660, 0.35, 0.04]],
      heal: [["sine", 520, 880, 0.35, 0.05], ["triangle", 780, 1170, 0.3, 0.03]],
      throw: [["noise", 700, 200, 0.25, 0.08], ["sine", 110, 60, 0.2, 0.08]],
      dig: [["noise", 600, 120, 0.35, 0.1]],
      erupt: [["noise", 900, 80, 0.45, 0.2], ["sine", 80, 30, 0.4, 0.2]],
      phase: [["sine", 900, 200, 0.3, 0.05], ["triangle", 300, 1200, 0.25, 0.03]],
      shield: [["sine", 300, 900, 0.3, 0.06], ["square", 600, 1800, 0.12, 0.02]],
      eshot: [["square", 380, 120, 0.06, 0.04], ["noise", 3000, 800, 0.05, 0.05]],
      // v2.0: Schaffner-Pfiff, Maßkrug, Fußball, Formular, Tröte, Stempel
      whistle: [["square", 2650, 2550, 0.45, 0.035], ["sine", 3180, 3120, 0.45, 0.04], ["noise", 6000, 4000, 0.3, 0.02]],
      glass: [["noise", 7000, 2500, 0.18, 0.12], ["triangle", 2400, 1900, 0.12, 0.04], ["triangle", 3300, 2800, 0.1, 0.03]],
      kick: [["sine", 150, 55, 0.14, 0.14], ["noise", 1800, 300, 0.06, 0.08]],
      paper: [["noise", 3600, 1600, 0.12, 0.06]],
      troete: [["sawtooth", 330, 392, 0.22, 0.035], ["square", 660, 784, 0.22, 0.015]],
      stamp: [["sine", 110, 50, 0.12, 0.14], ["noise", 900, 200, 0.08, 0.08]],
      // v3.7 Power-up: aufsteigender Akkord · Autoalarm: zweitöniges Jaulen · Stromschlag: Knistern mit Brummen
      power: [["triangle", 520, 1560, 0.3, 0.09], ["square", 780, 2340, 0.22, 0.025], ["sine", 260, 1040, 0.4, 0.08]],
      alarm: [["square", 820, 620, 0.32, 0.03], ["square", 1240, 980, 0.32, 0.02]],
      shock: [["sawtooth", 100, 95, 0.4, 0.07], ["noise", 5200, 1800, 0.3, 0.07], ["square", 2400, 600, 0.12, 0.03]],
    }[type];
    if (!cfg) return;
    // Rausch-Anteile machen Schüsse, Treffer und Explosionen wuchtiger
    const extra = { shoot: [["noise", 4200, 1400, 0.05, 0.045]], kill: [["noise", 1300, 180, 0.17, 0.11]], hurt: [["noise", 900, 200, 0.2, 0.08]], boom: [["noise", 520, 50, 0.65, 0.34]] }[type];
    for (const [wave, f0, f1, dur, vol] of extra ? cfg.concat(extra) : cfg) {
      const g = actx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      let src;
      if (wave === "noise") {
        src = actx.createBufferSource();
        src.buffer = noiseBuffer();
        const f = actx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(f0, now);
        f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), now + dur);
        src.connect(f).connect(g);
        src.start(now, Math.random() * 0.5);
      } else {
        src = actx.createOscillator();
        src.type = wave;
        src.frequency.setValueAtTime(f0, now);
        src.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), now + dur);
        src.connect(g);
        src.start(now);
      }
      g.connect(window.GameAudio && GameAudio.ready ? GameAudio.sfxOut() : actx.destination);
      src.stop(now + dur + 0.02);
    }
  }
  let noiseBuf = null;
  function noiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
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
  // v3.0 Horden-Gänge: Öffnungen in den Seitenwänden, durch die Massen an Zombies hereinstürmen
  let gates = [], hordeQ = [], quietSpawn = false;
  const GATE_H = 76, GATE_LEN = 230;
  function makeGates(skip) {
    gates = [];
    if (skip) return;
    const late = run.mode === "campaign" && cityIdx() >= 2;
    const n = run.mode === "survival" ? 2 : Math.random() < (late ? 0.45 : 0.2) ? 2 : 1;
    const sides = n === 2 ? [-1, 1] : [Math.random() < 0.5 ? -1 : 1];
    for (const side of sides) gates.push({ side, y: Math.round(rand(T + 200, B - 240)), h: GATE_H, warn: 0 });
  }
  // Hindernisse dürfen den Gang nicht zustellen
  const clearGates = (obs) => obs.filter((o) => !gates.some((g) => o.y < g.y + g.h / 2 + 55 && o.y + o.h > g.y - g.h / 2 - 55 && (g.side < 0 ? o.x < L + 120 : o.x + o.w > R - 120)));
  let supplyCrate = null;
  // v3.0 Mini-Spiel-Station im Versorgungsbezirk (Schießbude, Hau den Lukas, Funkcode – je Stadt im Wechsel)
  let miniSpot = null, miniLive = false;
  const MINI_ORDER = ["lukas", "schiess", "funk"];
  let floorCanvas = null;
  let floorCtx = null;
  let birds = []; // v3.4 Krähen: picken am Boden, fliegen auf, wenn der Held kommt oder es knallt
  let glossCtx = null; // Glanzkarte des Bodens: frisches Blut glänzt in 3D nass im Licht
  // gedeckelt (Modus „lighten“): voller Glanz ließe das Spekularlicht das Rot zu Rosa auswaschen
  const BLOOD_GLOSS = "#3c3c3c";
  let pools = []; // wachsende Blutlachen
  let lures = []; // v3.7 Autoalarm: lockt Zombies an wie der Böller-Köder, aber ohne Knall
  let screenBlood = []; // Blutspritzer auf dem Bildschirm
  let corpses = []; // Leichen mit Physik – bleiben bis zum nächsten Raum
  let pieces = []; // abgetrennte Köpfe/Gliedmaßen
  let hazards = []; // brennende Pfützen am Boden
  let zaps = [];
  let lobs = []; // geworfene Brocken (Bogenflug mit Zielkreis)
  let throws = [], decoys = [], strikes = []; // v2.9 Wurfwaffen des Helden, Böller-Köder am Boden, Luftschlag-Einschläge
  let beams = []; // Lichtstrahlen: Heilung, Laser-Visier, Schild-Verbindung
  let ambient = [];
  let roomLights = [];
  let slowMo = 0;
  let hitStop = 0; // Sekundenbruchteile Standbild bei wuchtigen Treffern
  let roomFade = 0; // Abblende beim Raumwechsel (1 → 0)
  let cineT = 0; // Kinobalken-Zeit nach Boss-Tod
  let cine = 0; // sichtbare Kinobalken (0–1)
  let shake = 0;
  let punchX = 0, punchY = 0, punchFov = 0; // gerichteter Kamerastoß + FOV-Kick
  let ghosts = []; // Nachbilder beim Ausweichen
  let killCam = null, lastKill = null; // v3.0 Kamera fährt beim letzten Abschuss eines Bezirks heran
  let banner = null;
  let callout = null; // Kombo-Ansage unter dem HUD
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
      orbitAng: 0, droneCd: 0, muzzle: 0, walkT: 0, plant: 0, footStep: -1, ghostCd: 0,
      tier: weaponTier(wlvl), kick: 0, spin: 0, barrel: 0, hurtT: 0, skin: save.skin,
      evo: {}, orbitR: 64, volleys: 0,
      dashCd: 0, dashT: 0, dashX: 0, dashY: -1, dashCdMul: 1, dashBlast: false, // v2.6 Ausweichrolle
    };
  }

  let lastMode = "campaign";
  function startRun(mode = "campaign") {
    ensureAudio();
    lastMode = mode;
    run = {
      mode, chapter: 1, room: 0, kills: 0, coins: 0, greed: 1 + 0.1 * save.talents.greed, time: 0, pendingPicks: 0, cleared: false,
      adRevived: false, adWatched: false, earned: 0, combo: 0, comboT: 0, bestCombo: 0, rage: 0,
      firstBlood: false, headshots: 0, locked: false,
    };
    // Überlebensmodus: Welt wechselt täglich
    if (mode === "survival") Object.assign(run, { survT: 0, spawnCd: 1.2, theme: THEME_ORDER[Math.floor(Date.now() / 864e5) % THEME_ORDER.length] });
    track("runs");
    screenBlood = []; callout = null; ghosts = []; punchX = punchY = punchFov = 0;
    run.threat = mode === "campaign" ? Math.max(0, Math.min(save.threat || 0, save.threatMax || 0)) : 0;
    // v2.8 Stadt-Checkpoints: Start in einer bereits erreichten Stadt – dafür gibt es zum Ausgleich Start-Skills
    run.startCity = mode === "campaign" ? Math.max(0, Math.min(save.startCity || 0, save.cityMax || 0)) : 0;
    if (run.startCity > 0) { run.chapter = Math.floor(run.startCity / 2) + 1; run.room = (run.startCity % 2) * (ROOMS_PER_CHAPTER / 2); }
    run.freeRerolls = 1; run.setTier = {}; run.event = null; run.bans = 2; run.banned = [];
    run.order = mode === "survival" ? todaysOrder() : null;
    run.bossKills = 0;
    if (run.threat) run.greed *= 1 + 0.25 * run.threat;
    if (run.order && run.order.greed) run.greed *= run.order.greed;
    player = newPlayer();
    heroPerk(save.skin).apply(player);
    { const lv = heroLevel(save.skin) - 1; if (lv > 0) { player.maxHp = player.hp = Math.round(player.maxHp * (1 + 0.02 * lv)); player.dmgMul *= 1 + 0.01 * lv; } }
    applyGear(player);
    syncGearLook();
    if (run.order && run.order.apply) run.order.apply(player);
    if (run.startCity > 0) run.pendingPicks += Math.min(6, run.startCity);
    // v2.9 Wurfgürtel (3× Start-Wurfwaffe) und Spezial-Energie
    const tsel = save.throwOwned && save.throwOwned[save.throwSel] && THROWABLES[save.throwSel] ? save.throwSel : "frag";
    run.belt = { [tsel]: Math.min(BELT_MAX, 3 + (player.beltBonus || 0)) }; run.beltSel = tsel; run.throwCd = 0; run.ult = 0; run.ultFx = null; run.blink = null;
    if (!save.throwHint) { save.throwHint = true; persist(); setTimeout(() => toast(tr("Neu: Wurfwaffen (Q) und Spezialfähigkeit (E)"), "grenade"), 2600); }
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
    try { if (webgl) Render3D.clear(); } catch (e) { console.warn("[Outbreak] 3D-Clear", e); }
    nextRoom();
    if (run.order) showBanner(`${tr("TAGESBEFEHL")}: ${tr(run.order.name).toUpperCase()}`, tr(run.order.desc), 2.8);
    else if (run.threat) setTimeout(() => toast(tr("Bedrohung {n}", { n: run.threat }), "skull"), 400);
    roomFade = 0; // beim Start übernimmt der Kameraflug aus dem Menü die Überblendung
    if (used.length) setTimeout(() => toast(`${tr("Boosts aktiv")}: ${used.join(" · ")}`, "gift"), 300);
    if (!run.storyOpen) { show(null); state = "play"; } // sonst läuft erst der Fluchtplan/Prolog
  }

  // ============================================================
  // Räume
  // ============================================================
  function resetRoomState() {
    bankLoot();
    enemies = []; bullets = []; eBullets = []; orbs = []; particles = []; corpses = []; pieces = []; pools = []; hazards = []; zaps = []; lobs = []; beams = []; fireworks = []; parcels = []; volleyQueue.length = 0;
    roomFade = 1;
    run.doorK = 0;
    supplyCrate = null; miniSpot = null;
    run.obj = null; run.event = null; fuses = []; hordeQ = [];
    throws = []; decoys = []; strikes = []; lures = []; run.blink = null; killCam = null; lastKill = null; wetSpots = []; birds = [];
    player.vx = player.vy = 0;
    player.invuln = 1;
    run.cleared = false;
  }

  function nextRoom() {
    if (run.mode === "survival") { setupSurvival(); return; }
    run.room++;
    if (run.room > ROOMS_PER_CHAPTER) { run.chapter++; run.room = 1; }
    // Neue Stadt: Prämie für die durchbrochene, dann der Fluchtplan (pausiert bis „Weiter“)
    if (districtIdx() === 0 && cityIdx() > 0) { run.cityBonus = Math.round(60 * cityIdx() * run.greed * ECON.earn); run.coins += run.cityBonus; }
    resetRoomState();
    player.x = W / 2; player.y = B - 70;
    updateCam2D(0, true);

    const isBoss = BOSS_ROOMS[run.room] ? (run.mode === "campaign" && curCity().boss) || BOSS_ROOMS[run.room] : null;
    const isSupply = SUPPLY_ROOMS.includes(run.room);
    const objKind = isBoss || isSupply ? null : objectiveFor();
    makeGates(!!isBoss || isSupply);
    const barrier = !isBoss && !isSupply && run.room > 1 && objKind !== "gauntlet" && Math.random() < 0.38 ? genBarrier() : [];
    obstacles = clearGates(isSupply ? [] : genObstacles(Math.round((isBoss ? randi(0, 2) : randi(barrier.length ? 1 : 2, barrier.length ? 4 : 5)) * AREA_K + (isBoss ? 0 : 1)), barrier));
    run.gauntStages = objKind === "gauntlet" ? genGauntlet() : null; // ersetzt Gänge und Hindernisse
    // Wahrzeichen nicht in Bezirken mit eigener Kulisse (Heilbronner Wartberg = Weinberg)
    if (run.mode === "campaign" && !isSupply && objKind !== "gauntlet" && LANDMARK_DISTRICTS.includes(districtIdx()) && curDistrict()[0] !== "Wartberg") placeLandmark(LANDMARKS[curCity().id]);
    floorCanvas = makeFloor();
    roomLights = obstacles.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3, src: o }));
    initAmbient();
    if (theme() === "street" || theme() === "markt") for (let i = 0; i < randi(1, 2); i++) landFlock(rand(L + 60, R - 60), rand(T + 120, B - 360), randi(4, 7));

    planLooter(); // v3.7
    const city = curCity(), [dName] = curDistrict();
    if (isSupply) {
      supplyCrate = { x: W / 2, y: (T + B) / 2, r: 26, bob: 0 };
      if (run.mode === "campaign" && window.MiniGames) miniSpot = { kind: MINI_ORDER[cityIdx() % MINI_ORDER.length], x: L + 96, y: (T + B) / 2 + 40, r: 30, bob: 0, done: false, armed: true };
      showBanner(dName.toUpperCase(), `${city.name} · ${tr("Versorgung – öffne die Kiste")}`);
    } else if (isBoss) {
      const by = Math.max(T + 180, player.y - 620); // v3.4: in der langen Arena nicht am anderen Ende
      const boss = spawnEnemy(isBoss, W / 2, by);
      if (run.bossIntel) { boss.hp *= 0.85; run.bossIntel = false; addText(W / 2, by - 60, tr("FUNKAUFKLÄRUNG: Boss geschwächt"), "#7aff8a", 16, true); }
      // v2.6 Bedrohung 4+: Elite-Eskorte, 5: der Boss ist zäher und wird früher rasend
      if ((run.threat || 0) >= 4) for (const dx of [-110, 110]) { const t = pick(wavePool().filter((q) => !ZOMBIES[q].pack && q !== "nest")); makeElite(spawnEnemy(t, W / 2 + dx, by + 50), 1); }
      if ((run.threat || 0) >= 5) { boss.hp *= 1.3; boss.maxHp *= 1.3; }
      if (window.GameAudio) GameAudio.stinger("boss");
      fx4d("boss", 1100);
    } else {
      spawnWave(objKind === "hold" ? 0.45 : objKind === "bounty" ? 0.75 : objKind === "gauntlet" ? 0.5 : 1);
      if (objKind) setupObjective(objKind);
      else if (run.mode === "campaign" && districtIdx() > 0 && cityIdx() > 0 && Math.random() < 0.6) run.event = { kind: pick(gates.length ? ["ambush", "horde", "pack", "massive", "massive"] : ["ambush", "horde", "pack"]), at: Math.max(1, Math.ceil(enemies.length * 0.45)), fired: false };
      // Heilbronn: ab Bezirk 4 gelegentlich eine kleine Horde durch den Gang, damit man es kennenlernt
      else if (run.mode === "campaign" && gates.length && districtIdx() >= 2 && Math.random() < 0.5) run.event = { kind: "massive", at: Math.max(1, Math.ceil(enemies.length * 0.4)), fired: false };
      else if (!banner) showBanner(dName.toUpperCase(), `${city.name} · ${tr("Bezirk {n}/10", { n: districtIdx() + 1 })}`, 1.4);
    }
    // Funkspruch beim Stadtwechsel; beim Einsatzstart nur bis der Prolog einmal gesehen wurde (kein Extra-Tippen bei jeder Runde)
    if (districtIdx() === 0 && (run.time > 0.5 || !save.storySeen)) openCityCard();
    if (run.room === 1 && run.time < 0.05) { cineT = Math.max(cineT, 0.9); punchFov = Math.max(punchFov, 3.6); }
  }


  // ============================================================
  // Fluchtroute „Escape from Germany“: 8 deutsche Städte à 10 Stadtteile
  // (5. Bezirk = Versorgung, 10. = Boss), danach geht die Flucht durch Europa weiter.
  // Intern bleiben Kapitel à 20 Räume (Schwierigkeit, Spielstände) – je Kapitel zwei Städte.
  // ============================================================
  const SR = "street", HO = "hospital", LB = "lab", MK = "markt";
  // v2.2: Startstadt Heilbronn – von dort quer durch die Republik bis zur ARCHE in Hamburg
  const CITIES = [
    { id: "heilbronn", boss: "goetz", name: "Heilbronn", day: 1, lat: 49.14, lon: 9.22, ly: -6, lside: "l", fest: "wein", weather: "rain", foes: ["wengerter", "wengerter", "rentner"],
      goal: "Raus aus dem Unterland", radio: "Funkspruch der Marine: »Letzte Evakuierung – Schiff ARCHE, Hamburger Hafen.« Die A6 und die A81 sind ein einziger Stau aus Wracks und Untoten. Dein Plan: erst nach Stuttgart – im Werk soll ein gepanzerter Transporter stehen.",
      d: [["Hauptbahnhof", SR], ["Neckarmeile", SR], ["Marktplatz", MK], ["Klinikum Gesundbrunnen", HO], ["Kiliansplatz", MK], ["Böckingen", SR], ["Experimenta", LB], ["Theresienwiese", MK], ["Neckarhafen", SR], ["Wartberg", MK]] },
    { id: "stuttgart", boss: "mother", name: "Stuttgart", day: 3, lat: 48.78, lon: 9.18, ly: 8, fest: "werk", weather: "rain", foes: ["wiesn", "beamter", "zwerg"],
      goal: "Ein Panzerwagen aus dem Werk", radio: "Der Transporter steht im Werk. Damit kommst du durch die Horden auf der A8. Nächstes Ziel: der Sender auf dem Münchner Olympiaturm – nur von dort erreichst du die Marine.",
      d: [["Schlossplatz", MK], ["Cannstatter Wasen", MK], ["Feuerbach", SR], ["Katharinenhospital", HO], ["Weinkeller", MK], ["Zuffenhausen – Werk", LB], ["Vaihingen", SR], ["Fernsehturm", SR], ["Untertürkheim – Werk", LB], ["Neckarhafen", SR]] },
    { id: "muenchen", boss: "bierkoenig", name: "München", day: 6, lat: 48.14, lon: 11.58, fest: "wiesn", weather: "clear", foes: ["wiesn", "wiesn", "ultra"],
      goal: "Der letzte Sender", radio: "Die Seuche erreichte die Wiesn am ersten Festtag. Auf dem Olympiaturm steht der letzte Sender – nur von dort erreichst du die Marine.",
      d: [["Hauptbahnhof", SR], ["Theresienwiese", MK], ["Schwabing", SR], ["Klinikum rechts der Isar", HO], ["Hofbräuhaus", MK], ["Maxvorstadt", SR], ["Viktualienmarkt", MK], ["Englischer Garten", SR], ["Olympiapark", SR], ["Olympiaturm", LB]] },
    { id: "nuernberg", boss: "krampus", name: "Nürnberg", day: 9, lat: 49.45, lon: 11.08, fest: "weihnachten", weather: "snow", foes: ["zwerg", "beamter", "schaffner"],
      goal: "Das Bundeswehr-Depot", radio: "Die Marine hat geantwortet: Die ARCHE wartet zwölf Tage. Der Christkindlesmarkt leuchtet noch – und ist voller Untoter. Im Depot der Bundeswehr liegen Waffen und Treibstoff.",
      d: [["Hauptbahnhof", SR], ["Altstadt", MK], ["Christkindlesmarkt", MK], ["Klinikum Nord", HO], ["Lebkuchen-Bäckerei", MK], ["Gostenhof", SR], ["Burgviertel", MK], ["St. Johannis", SR], ["Bundeswehr-Depot", LB], ["Kaiserburg", MK]] },
    { id: "leipzig", boss: "zugfuehrer", name: "Leipzig", day: 12, lat: 51.34, lon: 12.37, fest: "bahn", weather: "rain", foes: ["schaffner", "ultra", "zwerg"],
      goal: "Eine Lok nach Norden", radio: "Am Hauptbahnhof soll noch eine Diesellok stehen. Mit Glück bringt sie dich nach Norden – mitten in die Hauptstadt, wo alles begann.",
      d: [["Hauptbahnhof", SR], ["Zentrum", MK], ["Connewitz", SR], ["Universitätsklinikum", HO], ["Auerbachs Keller", MK], ["Plagwitz", LB], ["Südvorstadt", SR], ["Gohlis", MK], ["Messegelände", LB], ["Völkerschlachtdenkmal", SR]] },
    { id: "berlin", boss: "abom", name: "Berlin", day: 15, lat: 52.52, lon: 13.4, fest: "imbiss", weather: "rain", foes: ["beamter", "ultra", "zwerg"],
      goal: "Die Daten aus Berlin-Buch", radio: "Berlin, wo alles begann. Im Forschungscampus Buch liegen die Daten zu Erreger N-17 – vielleicht der Schlüssel zu einem Gegenmittel. Hol sie, bevor die Sperrzone dich verschluckt.",
      d: [["Mitte", SR], ["Kreuzberg", SR], ["Neukölln", SR], ["Charité", HO], ["U-Bahnhof Alexanderplatz", SR], ["Friedrichshain", SR], ["Prenzlauer Berg", MK], ["Tempelhofer Feld", SR], ["Spandauer Altstadt", MK], ["Forschungscampus Buch", LB]] },
    { id: "frankfurt", boss: "mother", name: "Frankfurt", day: 18, lat: 50.11, lon: 8.68, fest: "apfelwein", weather: "rain", foes: ["beamter", "beamter", "ultra"],
      goal: "Treibstoff am Flughafen", radio: "Neue Meldung über Funk: Paris ist gefallen. Wien schweigt. Die Seuche ist nicht nur in Deutschland – sie ist überall in Europa. Am Flughafen lagert Treibstoff für die letzte Etappe.",
      d: [["Bankenviertel", SR], ["Römerberg", MK], ["Sachsenhausen", MK], ["Uniklinik", HO], ["Apfelweinkneipe", MK], ["Bahnhofsviertel", SR], ["Messe", LB], ["Bornheim", MK], ["Funkzentrale", LB], ["Flughafen", LB]] },
    { id: "koeln", boss: "narrenkoenig", name: "Köln", day: 21, lat: 50.94, lon: 6.96, fest: "karneval", weather: "confetti", foes: ["jeck", "jeck", "ultra"],
      goal: "Ein Rheinschiff nach Norden", radio: "Der Karneval wurde nie abgesagt – die Jecken feiern weiter, auf ihre Art. Am Rheinauhafen liegt ein Schiff, das dich den Rhein hinauf nach Norden bringt.",
      d: [["Hauptbahnhof", SR], ["Domplatte", MK], ["Altstadt", MK], ["Uniklinik", HO], ["Brauhaus", MK], ["Ehrenfeld", SR], ["Belgisches Viertel", MK], ["Deutz", SR], ["Chemiepark", LB], ["Rheinauhafen", SR]] },
    { id: "hamburg", boss: "kapitaen", name: "Hamburg", day: 24, lat: 53.55, lon: 9.99, fest: "hafen", weather: "fog", foes: ["ultra", "schaffner", "jeck"],
      goal: "Die ARCHE erreichen", radio: "Die ARCHE liegt am Containerterminal und legt bei Flut ab. Letzte Chance. Hinter dir liegt ganz Deutschland.",
      d: [["Hauptbahnhof", SR], ["St. Pauli", SR], ["Reeperbahn", SR], ["UKE Eppendorf", HO], ["Fischbrötchen-Bude", MK], ["Speicherstadt", MK], ["Fischmarkt", MK], ["Elbtunnel", LB], ["Landungsbrücken", SR], ["Containerterminal", SR]] },
  ];
  // Nach der Flucht: Europa ist ebenfalls gefallen – die Route geht endlos weiter
  const EUROPE = [
    { id: "amsterdam", boss: "kapitaen", name: "Amsterdam", lat: 52.37, lon: 4.9, fest: "hafen", weather: "rain", foes: ["ultra", "zwerg"], goal: "Weiter nach Süden", radio: "Die ARCHE musste in Amsterdam anlegen – der Treibstoff reicht nicht. Auch hier: die Seuche.",
      d: [["Centraal Station", SR], ["Grachtengordel", MK], ["Jordaan", MK], ["AMC Klinikum", HO], ["Hausboot", MK], ["De Pijp", SR], ["Vondelpark", SR], ["Haven", SR], ["Westergasfabriek", LB], ["Schiphol", LB]] },
    { id: "paris", boss: "narrenkoenig", name: "Paris", lat: 48.86, lon: 2.35, fest: "markt", weather: "rain", foes: ["ultra", "jeck"], goal: "Das Institut Pasteur", radio: "Gerüchte über einen Impfstoff im Institut Pasteur. Wenn es ihn gibt, ist er in Paris.",
      d: [["Gare du Nord", SR], ["Montmartre", MK], ["Le Marais", MK], ["Pitié-Salpêtrière", HO], ["Katakomben", SR], ["Quartier Latin", MK], ["Belleville", SR], ["La Défense", SR], ["Institut Pasteur", LB], ["Eiffelturm", SR]] },
    { id: "wien", boss: "krampus", name: "Wien", lat: 48.21, lon: 16.37, fest: "weihnachten", weather: "snow", foes: ["beamter", "zwerg"], goal: "Der Bunker unter der Hofburg", radio: "Unter der Hofburg soll ein Bunker mit Überlebenden sein. Ein Lichtblick – vielleicht.",
      d: [["Westbahnhof", SR], ["Innere Stadt", MK], ["Naschmarkt", MK], ["AKH", HO], ["Kaffeehaus", MK], ["Leopoldstadt", SR], ["Prater", SR], ["Favoriten", SR], ["Donaustadt", LB], ["Hofburg", MK]] },
    { id: "prag", boss: "bierkoenig", name: "Prag", lat: 50.08, lon: 14.44, fest: "markt", weather: "fog", foes: ["schaffner", "ultra"], goal: "Zurück nach Norden", radio: "Der Impfstoff war eine Lüge. Aber im Norden halten sich Gerüchte über eine sichere Insel. Die Flucht geht weiter.",
      d: [["Hauptbahnhof", SR], ["Altstadt", MK], ["Karlsbrücke", MK], ["Klinikum Motol", HO], ["Bierkeller", MK], ["Žižkov", SR], ["Kleinseite", MK], ["Holešovice", LB], ["Vinohrady", SR], ["Hradschin", MK]] },
  ];
  // Kfz-Kennzeichen der Fluchtroute (Menü-Leiste)
  const KFZ = { heilbronn: "HN", berlin: "B", leipzig: "L", nuernberg: "N", muenchen: "M", stuttgart: "S", frankfurt: "F", koeln: "K", hamburg: "HH" };
  const cityIdx = (r = run) => (r.chapter - 1) * 2 + (r.room > 10 ? 1 : 0);
  const cityAt = (i) => (i < CITIES.length ? CITIES[i] : EUROPE[(i - CITIES.length) % EUROPE.length]);
  const districtIdx = (r = run) => (r.room - 1) % 10;
  const curCity = () => cityAt(cityIdx());
  const curDistrict = () => curCity().d[districtIdx()];
  // Rekord-/Fortschrittsanzeige als Stadt · Stadtteil
  const placeLabel = (chapter, room) => { if (!chapter) return "–"; const c = cityAt(cityIdx({ chapter, room })); return `${c.name} · ${c.d[districtIdx({ chapter, room })][0]}`; };
  const theme = () => (run && run.theme) || (run && run.mode === "campaign" && run.room > 0 ? curDistrict()[1] : "street");

  // ============================================================
  // Überlebensmodus: 5 Minuten in einer Arena, die Wellen werden immer dichter und härter
  // ============================================================
  const SURVIVAL_TIME = 300;
  // Überleben: zwei Bosse, täglich wechselnd aus allen Stadt-Bossen
  const SURV_BOSS_POOL = ["abom", "krampus", "bierkoenig", "goetz", "narrenkoenig", "zugfuehrer", "kapitaen", "mother"];
  const SURV_DAY = Math.floor(Date.now() / 864e5);
  const SURVIVAL_BOSSES = [[150, SURV_BOSS_POOL[SURV_DAY % 8]], [260, SURV_BOSS_POOL[(SURV_DAY + 3) % 8]]];
  const SURVIVAL_POOL = [
    [0, ["walker", "walker", "crawler", "runner"]],
    [25, ["dog", "spitter", "rat"]],
    [60, ["leaper", "bomber", "walker"]],
    [100, ["burner", "screamer", "armored"]],
    [140, ["brute", "splitter", "electro", "runner"]],
    [40, ["burrower", "gunner"]],
    [80, ["healer", "bloater"]],
    [120, ["phantom", "thrower"]],
    [170, ["warden", "nest"]],
    [50, ["zwerg", "ultra"]],
    [90, ["beamter", "jeck"]],
    [130, ["wiesn", "schaffner"]],
    [35, ["scooter"]],
    [70, ["paketbote", "rentner"]],
    [60, ["wengerter"]],
  ];
  function setupSurvival() {
    run.room = 1;
    resetRoomState();
    player.x = W / 2; player.y = (T + B) / 2 + 140;
    updateCam2D(0, true);
    makeGates(false);
    obstacles = clearGates(genObstacles(Math.round(3 * AREA_K) + 1));
    const lmk = Object.values(LANDMARKS);
    placeLandmark(lmk[dayNo() % lmk.length], 0.3); // v3.4: Wahrzeichen des Tages
    planLooter(); // v3.7
    floorCanvas = makeFloor();
    roomLights = obstacles.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3, src: o }));
    initAmbient();
    showBanner(tr("ÜBERLEBEN"), tr("Halte 5 Minuten durch!"), 2);
  }
  // Spawnpunkt mit Abstand zum Helden – nie direkt neben ihm
  function survivalSpot() {
    for (let i = 0; i < 40; i++) {
      // v3.4 lange Arena: Nachschub nicht am anderen Ende, sondern im Umkreis von 680 um den Helden
      const p = { x: rand(L + 30, R - 30), y: clamp(player.y + rand(-680, 520), T + 40, B - 40), r: 26 };
      const d2 = (p.x - player.x) ** 2 + (p.y - player.y) ** 2;
      if (d2 > 230 * 230 && d2 < 680 * 680 && !obstacles.some((o) => circleRectOverlap(p, o))) return p;
    }
    return { x: player.x < W / 2 ? R - 40 : L + 40, y: clamp(player.y - 500, T + 60, B - 60) };
  }
  function updateSurvival(dt) {
    run.survT += dt;
    if (run.survT > 30 && (run.hordeT = (run.hordeT ?? 40) - dt) <= 0) { run.hordeT = 40; startHorde(Math.min(70, 22 + Math.floor(run.survT / 8))); }
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
      if (window.GameAudio) GameAudio.stinger("boss");
      fx4d("boss", 1100);
    }
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function genObstacles(n, pre = []) {
    const obs = pre.slice();
    n += obs.length;
    const fest = run && run.mode === "campaign" && run.room > 0 ? curCity().fest : "";
    const district = run && run.mode === "campaign" && run.room > 0 ? curDistrict()[0] : "";
    const pool = district === "Wartberg" ? ["rebstock", "rebstock", "rebstock", "fass"] : OBSTACLE_POOL[theme()].concat(theme() === "markt" || (fest === "bahn" && theme() === "street") ? FEST_OBS[fest] || [] : []);
    let tries = 0;
    while (obs.length < n && tries++ < 200) {
      const kind = pick(pool);
      if (OBS_ONCE[kind] && obs.filter((q) => q.kind === kind).length >= OBS_ONCE[kind]) continue;
      const [w0, w1, h0, h1] = OBSTACLE_SIZE[kind];
      let w = Math.round(rand(w0, w1)), h = Math.round(rand(h0, h1));
      const vert = ROTATABLE[kind] && Math.random() < 0.4;
      if (vert) [w, h] = [h, w];
      const o = { kind, w, h, vert, seed: randi(1, 1e9), fest };
      if (DESTRUCT[kind]) o.hp = DESTRUCT[kind] * (1 + 0.3 * ((run ? run.chapter : 1) - 1));
      o.x = rand(L + 30, R - 30 - o.w);
      o.y = rand(T + 130, B - 220 - o.h);
      const m = 60;
      const blocked = obs.some((q) => o.x < q.x + q.w + m && o.x + o.w + m > q.x && o.y < q.y + q.h + m && o.y + o.h + m > q.y);
      if (!blocked) obs.push(o);
    }
    return obs;
  }
  // v3.4 Wahrzeichen setzen: mittig in der langen Arena (Höhe nach Wahl, Straßensperren werden umgangen),
  // andere Hindernisse in der Nähe weichen – so bleibt Platz zum Umlaufen und der Hingucker steht frei
  function placeLandmark(lm, prefer = 0.55) {
    if (!lm || !OBSTACLE_SIZE[lm.kind]) return null;
    const [w, , h] = OBSTACLE_SIZE[lm.kind];
    const fest = run && run.mode === "campaign" && run.room > 0 ? curCity().fest : "";
    const o = { kind: lm.kind, w, h, vert: false, seed: randi(1, 1e9), fest, landmark: true, name: lm.name };
    o.x = Math.round(clamp(W / 2 - w / 2 + rand(-36, 36), L + 40, R - 40 - w));
    const near = (q, m) => o.x < q.x + q.w + m && o.x + o.w + m > q.x && o.y < q.y + q.h + m && o.y + o.h + m > q.y;
    for (const k of [prefer, 0.42, 0.66, 0.32, 0.75]) {
      o.y = Math.round(T + ARENA.h * k - h / 2 + rand(-30, 30));
      if (!obstacles.some((q) => q.barrier && near(q, 70))) break;
    }
    obstacles = obstacles.filter((q) => q.barrier || q.gateBar || !near(q, 64)).concat(o);
    return o;
  }

  // v3.0 Straßensperre: eine Linie quer durch den Bezirk mit zwei Durchlässen – Engpässe, an denen sich die Meute staut
  const BARRIER_KINDS = { street: ["sandsack", "barricade", "bauzaun"], markt: ["bauzaun", "sandsack"], hospital: ["sandsack"], lab: ["sandsack", "barricade"] };
  function genBarrier() {
    const fest = run && run.mode === "campaign" && run.room > 0 ? curCity().fest : "";
    const kind = pick(BARRIER_KINDS[theme()] || BARRIER_KINDS.street);
    const [, , h0, h1] = OBSTACLE_SIZE[kind];
    const h = Math.round(rand(h0, h1)), y = Math.round(rand(T + 300, B - 330));
    const gapW = () => Math.round(rand(88, 104));
    const span = R - L, g1 = gapW(), g2 = gapW();
    // drei Stücke: links an der Wand, Mitte, rechts an der Wand; die Durchlässe wandern von Raum zu Raum
    const left = Math.round(rand(90, 150)), mid = Math.round(span - left - g1 - g2 - rand(90, 150));
    const xs = [[L, left], [L + left + g1, mid], [L + left + g1 + mid + g2, R - (L + left + g1 + mid + g2)]];
    const out = [];
    for (const [x, w] of xs) {
      if (w < 40) continue;
      const o = { kind, x, y, w, h, vert: false, seed: randi(1, 1e9), fest, barrier: true };
      if (DESTRUCT[kind]) o.hp = DESTRUCT[kind] * 1.5 * (1 + 0.3 * ((run ? run.chapter : 1) - 1));
      out.push(o);
    }
    // an einem Durchlass brennt eine Feuertonne (Wachposten)
    if (theme() === "street" || theme() === "markt") {
      const gx = Math.random() < 0.5 ? L + left - 32 : L + left + g1 + mid + g2 + 6;
      out.push({ kind: "feuertonne", x: gx, y: y - 34, w: 26, h: 26, vert: false, seed: randi(1, 1e9), fest, hp: DESTRUCT.feuertonne });
    }
    return out;
  }

  // v3.3 Sperrkorridor: drei Container-Mauern teilen den Bezirk in vier Gänge, die im Zickzack zur Tür führen.
  // Seitlich enden Horden-Gänge an vernagelten Bretter-Barrikaden (kind "bretter", außerhalb der Arena im Gang).
  // Betritt der Held einen neuen Gang, rückt dort eine Horde an, hämmert die Barrikade auf und stürmt herein.
  const GAUNT = { wallH: 46, gap: 116, rows: [200, 400, 600].map((r) => Math.round(r * AREA_K)), barHp: 100 }; // v3.4: Gänge wachsen mit der Arena
  function genGauntlet() {
    const obs = [], gts = [], stages = [], fest = curCity().fest;
    const walls = GAUNT.rows.map((dy, i) => ({ y: B - dy, gapRight: i % 2 === 0 }));
    walls.forEach((wl, i) => {
      const x0 = wl.gapRight ? L : L + GAUNT.gap, x1 = wl.gapRight ? R - GAUNT.gap : R, len = x1 - x0, n = Math.ceil(len / 172), seg = len / n;
      for (let k = 0; k < n; k++) {
        const bus = theme() === "street" && k === n - 1 && i === 1;
        obs.push({ kind: bus ? "bus" : "container", x: Math.round(x0 + k * seg), y: wl.y, w: Math.round(seg + (k < n - 1 ? 1 : 0)), h: GAUNT.wallH, vert: false, seed: randi(1, 1e9), fest, wall: true });
      }
      // Sandsäcke als Deckung im Gang darunter, mit Abstand zum Durchlass
      const sx = wl.gapRight ? R - GAUNT.gap - 150 : L + GAUNT.gap + 50;
      obs.push({ kind: "sandsack", x: sx, y: wl.y + GAUNT.wallH + 56, w: 100, h: 26, vert: false, seed: randi(1, 1e9), fest });
    });
    // Gänge (unten → oben): Barrikade immer am fernen Ende des Gangs, im letzten Gang (mit der Tür) beidseitig
    const mk = (side, y) => { const g = { side, y: Math.round(y), h: GATE_H, warn: 0 }; gts.push(g); return g; };
    for (let i = 1; i <= 3; i++) {
      const top = i < 3 ? walls[i].y + GAUNT.wallH : T, bot = walls[i - 1].y, mid = (top + bot) / 2;
      const entryRight = walls[i - 1].gapRight; // durch diesen Durchlass kommt der Held herein
      const sides = i === 3 ? [-1, 1] : [entryRight ? -1 : 1];
      const list = sides.map((sd) => mk(sd, i === 3 ? mid + 10 : mid));
      stages.push({ y: bot + GAUNT.wallH - 14, gates: list, fired: false, n: Math.min(40, (i === 3 ? 10 : 12 + 2 * i) + (4 + i) * cityIdx()) });
    }
    for (const g of gts) {
      const o = { kind: "bretter", x: g.side < 0 ? L - 30 : R, y: g.y - g.h / 2 - 5, w: 30, h: g.h + 10, vert: true, seed: randi(1, 1e9), fest, gateBar: true, hp: GAUNT.barHp, maxHp: GAUNT.barHp, shakeT: 0, stage: 0 };
      g.bar = o; obs.push(o);
    }
    gates = gts;
    obstacles = obs;
    return stages;
  }
  // Zombies am Brett: jeder drückende Zombie reißt mit; ein Brute deutlich mehr. Gibt sie nach, ist der Weg frei.
  function bashBarricade(e, o, dt) {
    if (o.dead) return;
    o.hp -= dt * (e.def.cost >= 3 ? 16 : 7.5) * (e.elite ? 1.5 : 1);
    o.shakeT = 0.22; o.bashed = true;
    const st = o.hp > o.maxHp * 0.66 ? 0 : o.hp > o.maxHp * 0.33 ? 1 : 2;
    if (st !== o.stage) { o.stage = st; o.spr = null; fxDebris(o.x + o.w / 2, o.y + o.h / 2, o.x < L ? 0 : Math.PI, 1.2, 8, "#7a5a34"); sfx("hit"); shake = Math.max(shake, 2.5); }
    if ((o.sndT = (o.sndT || 0) - dt) <= 0) { o.sndT = 0.32 + Math.random() * 0.2; sfx("hit"); if (Math.random() < 0.5) fxDebris(o.x + o.w / 2, o.y + Math.random() * o.h, o.x < L ? 0 : Math.PI, 1, 2, "#8a6a3a"); }
    if (o.hp <= 0) {
      o.hp = 0; destroyObstacle(o);
      showBanner(tr("DURCHBRUCH!"), tr("Sie sind durch die Barrikade!"), 1.3);
      slowMo = Math.max(slowMo, 0.22); shake = Math.max(shake, 9); fx4d("boss", 500); sfx("boom");
      if (window.GameAudio) GameAudio.stinger("horde");
      track("breaches");
    }
  }
  function updateGauntlet(o, dt) {
    if (o.done) return;
    const p = player;
    o.band = p.y > GAUNT_Y(0) ? 0 : p.y > GAUNT_Y(1) ? 1 : p.y > GAUNT_Y(2) ? 2 : 3;
    for (const st of o.stages) {
      if (st.fired || p.y > st.y) continue;
      st.fired = true;
      startHorde(st.n, st.gates, { title: tr("SIE HÄMMERN AN DER BARRIKADE!"), sub: st.gates.length > 1 ? tr("Von beiden Seiten – gleich sind sie durch") : tr("Gleich sind sie durch – such Deckung!") });
    }
    o.bash = gates.some((g) => g.bar && !g.bar.dead && g.bar.bashed);
    for (const g of gates) if (g.bar) { g.bar.bashed = false; if (g.bar.shakeT > 0) g.bar.shakeT -= dt; }
    if (o.stages.every((st) => st.fired) && !hordeQ.length && !enemies.some((e) => !e.dead)) {
      o.done = true;
      showBanner(tr("KORRIDOR GESICHERT"), tr("Die Tür ist frei"), 1.8);
      rewardObjective(30 + 20 * cityIdx());
    }
  }
  const GAUNT_Y = (i) => B - GAUNT.rows[i] + GAUNT.wallH; // Unterkante der Mauer i

  function makeFloor() {
    const city = run && run.mode === "campaign" && run.room > 0 ? curCity() : null;
    const c = Sprites.floor(theme(), { W, H: WH, L, T, R, B }, randi(1, 1e9), { snow: !!city && city.weather === "snow", confetti: !!city && city.weather === "confetti", leaves: !!city && (city.fest === "wiesn" || city.fest === "wein"), tram: !!city && city.id !== "hamburg" && Math.random() < 0.55, wet: theme() === "street" || (!!city && city.weather === "rain"), gates });
    floorCtx = c.getContext("2d");
    const res = c.width / W;
    floorCtx.setTransform(res, 0, 0, res, 0, 0);
    glossCtx = c.gloss ? c.gloss.getContext("2d") : null;
    if (glossCtx) { const gr = c.gloss.width / W; glossCtx.setTransform(gr, 0, 0, gr, 0, 0); glossCtx.fillStyle = BLOOD_GLOSS; glossCtx.globalCompositeOperation = "lighten"; }
    for (const o of obstacles) if (o.landmark) paintPlaza(floorCtx, o);
    paintWallAO(floorCtx);
    return c;
  }
  // v3.4 weiche Verschattung am Mauerfuß (Umgebungsverdeckung) – Boden wirkt in 2D und 3D plastischer
  function paintWallAO(g) {
    const strip = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(0,0,0,0.42)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
    strip(L, 0, L + 30, 0, L, T, 30, B - T);
    strip(R, 0, R - 30, 0, R - 30, T, 30, B - T);
    strip(0, T, 0, T + 34, L, T, R - L, 34);
    strip(0, B, 0, B - 18, L, B - 18, R - L, 18);
  }
  // v3.4 Platz um das Wahrzeichen: Pflaster im Kreis (bzw. Rechteck beim Tor), Randsteine, zwei Blumenbeete
  function paintPlaza(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, round = o.w / o.h < 1.6, rx = o.w / 2 + 34, ry = round ? o.h / 2 + 34 : o.h / 2 + 30;
    g.save();
    g.beginPath(); if (round) g.ellipse(cx, cy, rx, ry, 0, 0, TAU); else g.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    g.fillStyle = "#4a463e"; g.fill(); g.clip();
    for (let k = 0; k < 9; k++) { const rr = (k / 9) * Math.max(rx, ry); g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 1; g.beginPath(); if (round) g.ellipse(cx, cy, rr, rr * (ry / rx), 0, 0, TAU); else g.rect(cx - rr, cy - rr * (ry / rx), rr * 2, rr * 2 * (ry / rx)); g.stroke(); }
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rx * 1.2, cy + Math.sin(a) * ry * 1.2); g.stroke(); }
    for (let k = 0; k < 220; k++) { g.fillStyle = Math.random() < 0.5 ? "rgba(255,240,210,0.05)" : "rgba(0,0,0,0.12)"; g.fillRect(cx + (Math.random() - 0.5) * rx * 2, cy + (Math.random() - 0.5) * ry * 2, 4, 3); }
    g.restore();
    g.strokeStyle = "#6e665a"; g.lineWidth = 4; g.beginPath(); if (round) g.ellipse(cx, cy, rx, ry, 0, 0, TAU); else g.rect(cx - rx, cy - ry, rx * 2, ry * 2); g.stroke();
    for (const s of [-1, 1]) {
      const bx = cx + s * (rx + 18), by = cy + 6;
      g.fillStyle = "#3a2a1a"; g.fillRect(bx - 9, by - 14, 18, 28);
      for (let k = 0; k < 9; k++) { g.fillStyle = ["#d8302a", "#f2c21a", "#f4f0e8", "#8a4ad8", "#3a8a3a"][k % 5]; g.beginPath(); g.arc(bx - 5 + (k % 3) * 5, by - 9 + Math.floor(k / 3) * 9, 2.4, 0, TAU); g.fill(); }
    }
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
    if (glossCtx) { glossCtx.globalAlpha = 0.6; glossCtx.beginPath(); glossCtx.arc(x, y, r, 0, TAU); glossCtx.fill(); }
  }
  function splatter(x, y, ang, size, color) {
    const v = randi(0, 5);
    stamp(Sprites.splat(color, v), x, y, ang, size, 0.85);
    if (glossCtx && x > L && x < R && y > T && y < B) { glossCtx.globalAlpha = 0.8; Sprites.draw(glossCtx, Sprites.splat(BLOOD_GLOSS, v), x, y, ang, size); }
  }
  // Blutlachen wachsen unter liegenden Körpern langsam auf: mehrere überlappende Kreise mit wenig
  // Deckkraft ergeben einen unregelmäßigen Rand und eine dunklere, nasse Mitte
  // v3.0 nasse Stellen merken: wer hindurchläuft, hinterlässt blutige Fußabdrücke
  let wetSpots = [];
  function stampFoot(x, y, ang, color, a) {
    if (!floorCtx || x < L || x > R || y < T || y > B) return;
    floorDirty = true;
    floorCtx.save(); floorCtx.globalAlpha = a; floorCtx.fillStyle = color;
    floorCtx.translate(x, y); floorCtx.rotate(ang);
    floorCtx.beginPath(); floorCtx.ellipse(0, 0, 4.2, 2.1, 0, 0, TAU); floorCtx.fill();
    floorCtx.beginPath(); floorCtx.ellipse(5.2, 0, 1.8, 1.9, 0, 0, TAU); floorCtx.fill();
    floorCtx.restore();
  }
  function addPool(x, y, max, color, delay = rand(0.2, 0.6)) {
    if (x < L || x > R || y < T || y > B) return;
    // nasse Stellen auch dann, wenn die Lachen-Grenze erreicht ist – gerade in großen Gefechten soll man durchs Blut stapfen
    wetSpots.push({ x, y, r: max * 0.8, color }); if (wetSpots.length > 60) wetSpots.shift();
    if (pools.length >= 40) return;
    const lobes = Array.from({ length: 3 }, () => ({ dx: rand(-0.45, 0.45), dy: rand(-0.35, 0.35), k: rand(0.55, 0.85) }));
    pools.push({ x, y, r: 0, drawn: 0, max, color, lobes, delay });
  }
  function updatePools(dt) {
    if (!floorCtx || !pools.length) return;
    let clipped = false;
    for (const q of pools) {
      if (q.delay > 0) { q.delay -= dt; continue; }
      q.r = Math.min(q.max, q.r + Math.max(1.2, (q.max - q.r) * 1.1) * dt); // erst schnell, dann langsam
      if (q.r - q.drawn < 1.6 && q.r < q.max) continue;
      q.drawn = q.r;
      if (!clipped) {
        clipped = true;
        for (const g of glossCtx ? [floorCtx, glossCtx] : [floorCtx]) { g.save(); g.beginPath(); g.rect(L, T, R - L, B - T); g.clip(); }
      }
      floorDirty = true;
      floorCtx.fillStyle = q.color;
      for (const lb of q.lobes) {
        const x = q.x + lb.dx * q.r, y = q.y + lb.dy * q.r, rr = q.r * lb.k;
        floorCtx.globalAlpha = 0.28; floorCtx.beginPath(); floorCtx.arc(x, y, rr, 0, TAU); floorCtx.fill();
        if (glossCtx) { glossCtx.globalAlpha = 0.3; glossCtx.beginPath(); glossCtx.arc(x, y, rr, 0, TAU); glossCtx.fill(); }
      }
    }
    if (clipped) for (const g of glossCtx ? [floorCtx, glossCtx] : [floorCtx]) g.restore();
    floorCtx.globalAlpha = 1;
    pools = pools.filter((q) => q.r < q.max);
  }
  // Blut auf der „Kameralinse“: bei schweren Treffern und Zerplatzen direkt vor dem Helden
  function splashScreen(n) {
    for (let i = 0; i < n && screenBlood.length < 14; i++) {
      const edge = Math.random() < 0.5;
      screenBlood.push({ x: edge ? (Math.random() < 0.5 ? rand(10, 140) : rand(W - 140, W - 10)) : rand(40, W - 40), y: rand(130, H - 120), s: rand(1.6, 3.2), a: rand(0, TAU), v: randi(0, 5), life: rand(1.6, 2.6), max: 2.6, dy: 0 });
    }
  }

  function spawnWave(scale = 1) {
    const ch = run.chapter, room = run.room;
    // v3.3: rund 30 % mehr Gegner je Welle, Obergrenze höher – die Meute soll sich stauen
    let budget = (5 + room * 1.45 + (ch - 1) * 5) * scale * (1 + 0.1 * (run.threat || 0));
    const pool = wavePool();
    const maxCount = 18 + ch * 3;
    let count = 0;
    while (budget > 0.5 && count < maxCount) {
      const type = pick(pool);
      const def = ZOMBIES[type];
      if (type === "nest" && enemies.some((q) => q.type === "nest")) continue; // höchstens ein Nest pro Raum
      const n = def.pack || 1;
      if (def.cost * n > budget + 0.5) { if (budget < 1) break; continue; }
      budget -= def.cost * n;
      const pos = freeSpot(T + 60, B - 520); // v3.4: über die ganze lange Arena verteilt, mit Abstand zum Start
      for (let i = 0; i < n; i++) spawnEnemy(type, pos.x + rand(-20, 20), pos.y + rand(-20, 20));
      count += n;
    }
    if ((run.threat || 0) >= 2 && !enemies.some((e) => e.elite)) {
      const cand = enemies.filter((e) => !e.def.boss && !e.def.pack && !e.dead);
      if (cand.length) makeElite(pick(cand), 1);
    }
  }
  // Gegner-Pool des aktuellen Bezirks (Wellen und Nachschub bei Einsatzzielen)
  function wavePool() {
    const ch = run.chapter, room = run.room;
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
    if (room >= 4 || ch > 1) pool.push("burrower", ...(th === "street" ? ["burrower"] : []));
    if (room >= 5 || ch > 1) pool.push("bloater", ...(th !== "street" ? ["bloater"] : []));
    if (room >= 6 || ch > 1) pool.push("gunner", ...(th !== "hospital" ? ["gunner"] : []));
    if (room >= 7 || ch > 1) pool.push("healer", ...(th === "hospital" ? ["healer"] : []));
    if (room >= 8 || ch > 1) pool.push("thrower", ...(th === "street" ? ["thrower"] : []));
    if (room >= 9 || ch > 1) pool.push("phantom", ...(th === "hospital" ? ["phantom"] : []));
    if (room >= 10 || ch > 1) pool.push("nest");
    if (room >= 11 || ch > 1) pool.push("warden", ...(th === "lab" ? ["warden"] : []));
    if (room >= 3 || ch > 1) pool.push("scooter", ...(th === "street" ? ["scooter"] : []));
    if (room >= 6 || ch > 1) pool.push("paketbote");
    if (room >= 8 || ch > 1) pool.push("rentner", ...(th === "markt" ? ["rentner"] : []));
    // Stadttypische Gegner (ab Bezirk 2 der Stadt, doppelt gewichtet): Wiesn-Zombies in München, Jecken in Köln …
    if (run.mode === "campaign" && (districtIdx() >= 1 || cityIdx() > 0)) for (const f of curCity().foes || []) if (ZOMBIES[f]) pool.push(f, f);
    return pool;
  }

  function freeSpot(yMin, yMax) {
    for (let i = 0; i < 50; i++) {
      const p = { x: rand(L + 40, R - 40), y: rand(yMin, yMax), r: 30 };
      if (!obstacles.some((o) => circleRectOverlap(p, o))) return p;
    }
    return { x: W / 2, y: yMin + 20 };
  }

  // v3.3 Schwierigkeit: Zombies halten mehr aus, treffen härter und sind etwas flinker – je Stadt (bzw. je 90 s im
  // Überlebensmodus) kommen noch einmal 5 % Leben dazu. Bosse nur moderat, sonst ziehen sich die Kämpfe.
  const HARD = { hp: 1.35, hpStep: 0.05, boss: 1.15, dmg: 1.15, speed: 1.06 };
  const hardHp = (boss) => boss ? HARD.boss : HARD.hp + HARD.hpStep * Math.min(8, run.mode === "campaign" ? cityIdx() : Math.floor((run.survT || 0) / 90));
  function spawnEnemy(type, x, y) {
    const def = ZOMBIES[type];
    const ch = run.chapter, room = run.room;
    const th = run.threat || 0, ord = runOrder();
    const hpMul = (1 + (room - 1) * 0.07) * Math.pow(1.6, ch - 1) * threatHp(th) * (ord.foeHp || 1) * hardHp(def.boss);
    const dmgMul = (1 + (room - 1) * 0.03) * Math.pow(1.3, ch - 1) * threatDmg(th) * HARD.dmg;
    const e = {
      type, def, x: clamp(x, L + def.r, R - def.r), y: clamp(y, T + def.r, B - def.r), r: def.r,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, dmg: def.dmg * dmgMul, speed: def.speed * rand(0.9, 1.1) * (def.boss ? 1 : HARD.speed),
      spawnT: def.boss ? 1.8 : rand(0.4, 0.8), hitT: 0, dead: false,
      burnT: 0, burnDps: 0, poisonDps: 0, slowT: 0,
      aiT: rand(1, 2.5), mode: "walk", cd: rand(1, 2.2), dirX: 0, dirY: 0,
      blocked: 0, side: Math.random() < 0.5 ? -1 : 1, bladeCd: 0, wob: rand(0, 6), phase2: false, kvx: 0, kvy: 0, lastHit: null,
      face: Math.PI / 2, anim: rand(0, 8), variant: type === "walker" ? pick(WALKER_LOOKS[theme()]) : randi(0, 2), scale: def.boss ? 1 : rand(0.93, 1.08), hitAng: rand(0, TAU),
      rageT: 0, jumpZ: 0, elite: false, shield: 0, shieldT: 0, under: null, glitchT: 0,
    };
    // Elite: goldene Aura, dreifaches Leben, mehr Beute (ab Raum 4, häufiger in späteren Kapiteln)
    if (ord.foeSpeed) e.speed *= ord.foeSpeed;
    if (!def.boss && !def.pack && (room >= 4 || ch > 1 || th > 0) && Math.random() < (0.04 + 0.03 * (ch - 1) + 0.03 * th) * (ord.eliteX || 1)) {
      makeElite(e, 1);
    }
    if (!evoLock) rollEvo(e);
    e.spawnMax = e.spawnT;
    e.face = Math.atan2(player.y - e.y, player.x - e.x);
    enemies.push(e);
    // Zombie bricht aus dem Boden (nicht, wenn er durch einen Gang hereinstürmt)
    if (!quietSpawn) {
      stamp(Sprites.crack(), e.x, e.y + e.r * 0.3, rand(0, TAU), e.r / 16, 0.6);
      fxDebris(e.x, e.y, 0, Math.PI, def.boss ? 20 : 5, "#5a4a3a");
      fxDust(e.x, e.y + 4, def.boss ? 8 : 2, def.boss ? 1.4 : 0.6);
    }
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
  // v3.0 Umweg um ein Hindernis: die Ecke, die frei erreichbar ist und den kürzesten Weg zum Ziel ergibt
  function segHitsRect(x0, y0, x1, y1, r, pad) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [pp, q] of [[-dx, x0 - (r.x - pad)], [dx, r.x + r.w + pad - x0], [-dy, y0 - (r.y - pad)], [dy, r.y + r.h + pad - y0]]) {
      if (pp === 0) { if (q < 0) return false; continue; }
      const t = q / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 < t1;
  }
  function detour(e, r, tx, ty) {
    const m = e.r + 10;
    let best = null, bc = Infinity;
    for (const [cx, cy] of [[r.x - m, r.y - m], [r.x + r.w + m, r.y - m], [r.x - m, r.y + r.h + m], [r.x + r.w + m, r.y + r.h + m]]) {
      if (cx < L + e.r || cx > R - e.r || cy < T + e.r || cy > B - e.r) continue;
      if ((cx - e.x) ** 2 + (cy - e.y) ** 2 < 400) continue;
      if (segHitsRect(e.x, e.y, cx, cy, r, e.r * 0.5)) continue;
      if (obstacles.some((q) => q !== r && cx > q.x - e.r && cx < q.x + q.w + e.r && cy > q.y - e.r && cy < q.y + q.h + e.r)) continue;
      const c = Math.hypot(cx - e.x, cy - e.y) + Math.hypot(tx - cx, ty - cy);
      if (c < bc) { bc = c; best = { x: cx, y: cy }; }
    }
    return best;
  }
  function collideWorld(o) {
    let hit = false;
    for (const r of obstacles) if (pushOutRect(o, r)) { hit = true; o.hitRect = r; }
    if (supplyCrate && o !== player) {
      const d = Math.sqrt(dist2(o, supplyCrate));
      if (d < o.r + supplyCrate.r && d > 0) { const k = (o.r + supplyCrate.r) / d; o.x = supplyCrate.x + (o.x - supplyCrate.x) * k; o.y = supplyCrate.y + (o.y - supplyCrate.y) * k; }
    }
    let xmin = L + o.r, xmax = R - o.r, gt = null;
    if (o !== player && gates.length) for (const g of gates) if (Math.abs(o.y - g.y) < g.h / 2 - 2 || (g.side < 0 ? o.x < L : o.x > R) && Math.abs(o.y - g.y) < g.h) { gt = g; if (g.side < 0) xmin = L - GATE_LEN; else xmax = R + GATE_LEN; }
    o.x = clamp(o.x, xmin, xmax);
    if (gt && (o.x < L + o.r || o.x > R - o.r)) o.y = clamp(o.y, gt.y - gt.h / 2 + Math.min(o.r, gt.h / 2 - 4), gt.y + gt.h / 2 - Math.min(o.r, gt.h / 2 - 4)); // im Gang bleiben
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
    // Knopf unten rechts oder Doppeltipp = Ausweichrolle
    const db = dashBtn();
    if ((p.x - db.x) ** 2 + (p.y - db.y) ** 2 < (db.r + 8) ** 2) { requestDash(); return; }
    const hitB = (b, extra = 6) => (p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + extra) ** 2;
    if (beltKinds().length > 1 && hitB(swapBtn(), 4)) { cycleThrow(); return; }
    if (hitB(throwBtn())) { requestThrow(); return; }
    if (hitB(ultBtn())) { requestUlt(); return; }
    const now = performance.now();
    if (now - lastTap.t < 280 && (p.x - lastTap.x) ** 2 + (p.y - lastTap.y) ** 2 < 50 * 50) requestDash();
    lastTap = { t: now, x: p.x, y: p.y };
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
  // v2.6 Ausweichrolle anfordern (wird im nächsten Spielschritt ausgeführt)
  let dashWanted = false;
  const DASH_T = 0.18, DASH_CD = 2.4;
  const requestDash = () => { if (state === "play") dashWanted = true; };
  const dashBtn = () => ({ x: R - 46, y: SB - 58, r: 34 });
  // v2.9 Wurfwaffe (über der Rolle), Art wechseln (kleiner Chip), Spezialfähigkeit (links neben der Rolle)
  let throwWanted = false, ultWanted = false;
  const requestThrow = () => { if (state === "play") throwWanted = true; };
  const requestUlt = () => { if (state === "play") ultWanted = true; };
  const throwBtn = () => ({ x: R - 46, y: SB - 146, r: 30 });
  const swapBtn = () => ({ x: R - 88, y: SB - 180, r: 16 });
  const ultBtn = () => ({ x: R - 130, y: SB - 58, r: 32 });
  let lastTap = { t: 0, x: 0, y: 0 };
  window.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Shift") && !e.repeat) { requestDash(); if (state === "play") e.preventDefault(); }
    const kk = e.key.toLowerCase();
    if (!e.repeat && state === "play") { if (kk === "q") requestThrow(); else if (kk === "r") cycleThrow(); else if (kk === "e") requestUlt(); else if (kk === "c" && mode3d) cycleCam(); }
    keys.add(e.key.toLowerCase());
    if (e.key === "Escape" || e.key === "p") togglePause();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear()); // Fenster verlassen: keine „klemmenden“ Tasten
  window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") touchSeen = true; }, { capture: true });
  let touchSeen = "ontouchstart" in window && navigator.maxTouchPoints > 0;

  // v2.4 Controller (Gamepad API): Stick/Steuerkreuz laufen bzw. wählen, A bestätigt, B zurück, Start pausiert
  const pad = { x: 0, y: 0, on: false, prev: [], navT: 0, focus: null };
  function topOverlay() {
    const list = document.querySelectorAll(".overlay:not(.hidden)");
    for (let i = list.length - 1; i >= 0; i--) if (list[i].getClientRects().length) return list[i];
    return null;
  }
  function padTargets(ov) {
    return [...ov.querySelectorAll("button, a[href], .set-row")].filter((b) => !b.disabled && !b.classList.contains("hidden") && b.getClientRects().length && getComputedStyle(b).visibility !== "hidden");
  }
  function padFocus(el) {
    if (pad.focus) pad.focus.classList.remove("pad-focus");
    pad.focus = el;
    if (el) { el.classList.add("pad-focus"); el.scrollIntoView({ block: "nearest" }); }
  }
  function padNav(dir) {
    const ov = topOverlay();
    if (!ov) return;
    const list = padTargets(ov);
    if (!list.length) return;
    let i = list.indexOf(pad.focus);
    if (i < 0) i = Math.max(0, list.findIndex((b) => b.classList.contains("primary")));
    else i = (i + dir + list.length) % list.length;
    padFocus(list[i]);
    if (window.GameAudio) GameAudio.ui("tick");
  }
  function padConfirm() {
    const ov = topOverlay();
    if (!ov) return;
    const list = padTargets(ov);
    const el = list.includes(pad.focus) ? pad.focus : list.find((b) => b.classList.contains("primary")) || list[0];
    padFocus(null);
    if (el) { ensureAudio(); el.click(); }
  }
  function padBack() {
    if (state === "play" || state === "pause") { togglePause(); return; }
    const ov = topOverlay(), back = ov && ov.querySelector("[data-back]");
    padFocus(null);
    if (back && back.getClientRects().length) back.click();
    else if (state === "over") leaveOver(toMenu);
    else if (state === "story") storyNext();
  }
  function pollPad(dt) {
    let gp = null;
    try { for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g && g.connected) { gp = g; break; } } catch { /* Sandbox ohne Gamepad-Zugriff */ }
    pad.x = pad.y = 0;
    if (!gp) { if (pad.on) { pad.on = false; padFocus(null); } return; }
    if (!pad.on) { pad.on = true; toast(tr("Controller verbunden"), "weapons"); }
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    if (b(14)) x = -1; else if (b(15)) x = 1;
    if (b(12)) y = -1; else if (b(13)) y = 1;
    if (Math.hypot(x, y) > 0.28) { pad.x = x; pad.y = y; }
    const edge = (i) => b(i) && !pad.prev[i];
    if (state === "play") {
      if (edge(9) || edge(1)) togglePause();
      else if (edge(0) || edge(2)) requestDash();
      if (edge(5) || edge(7)) requestThrow();
      if (edge(4)) cycleThrow();
      if (edge(3)) requestUlt();
      if (edge(8) && mode3d) cycleCam();
    } else if (!(state === "mini" && miniLive)) {
      pad.navT -= dt;
      const ax = Math.abs(pad.x) > Math.abs(pad.y) ? pad.x : pad.y;
      if (Math.abs(ax) > 0.6) { if (pad.navT <= 0) { padNav(ax > 0 ? 1 : -1); pad.navT = 0.22; } } else pad.navT = 0;
      if (edge(0)) padConfirm();
      else if (edge(1)) padBack();
      else if (edge(9) && state === "pause") togglePause();
    }
    pad.prev = gp.buttons.map((q) => q.pressed);
  }

  function inputVector() {
    let x = 0, y = 0;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (!x && !y && pad.on) { x = pad.x; y = pad.y; }
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
    let best = null, bd = Infinity, hidden = null, hd = Infinity;
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || (exclude && exclude.has(e)) || e.x < L - 4 || e.x > R + 4) continue;
      const d = dist2(from, e);
      // v3.3 Sperrkorridor: Gegner hinter einer Container-Mauer nur, wenn sonst niemand in Sicht ist
      if (run.gauntStages && d < bd && obstacles.some((o) => o.wall && segHitsRect(from.x, from.y, e.x, e.y, o, 2))) { if (d < hd) { hd = d; hidden = e; } continue; }
      if (d < bd) { bd = d; best = e; }
    }
    return best || hidden;
  }
  // v3.3 Wegführung im Sperrkorridor: liegt eine Mauer zwischen Zombie und Ziel, geht es zuerst zum Durchlass
  const gauntBand = (y) => { for (let i = 0; i < 3; i++) if (y > B - GAUNT.rows[i] + GAUNT.wallH / 2) return i; return 3; };
  function gauntWay(ey, ty) {
    const a = gauntBand(ey), b = gauntBand(ty);
    if (a === b) return null;
    const i = a > b ? a - 1 : a, mid = B - GAUNT.rows[i] + GAUNT.wallH / 2;
    return { x: i % 2 === 0 ? R - GAUNT.gap / 2 : L + GAUNT.gap / 2, y: mid + (a > b ? 34 : -34) };
  }

  // Schwächungen durch deutsche Gegner: „Verspätung" (Feuerrate) und „Ausgebremst" (Tempo)
  function debuff(key, t, label) {
    const fresh = !(player[key] > 0);
    if (key === "slowT") t *= player.slowResist || 1;
    player[key] = Math.max(player[key] || 0, t);
    if (fresh) addText(player.x, player.y - 34, tr(label), key === "jamT" ? "#ffd84a" : "#c9d4ff", 16);
  }
  function updatePlayer(dt) {
    if (player.slowT > 0) player.slowT -= dt;
    if (player.jamT > 0) player.jamT -= dt;
    const p = player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.kick = Math.max(0, p.kick - dt * 40);
    p.hurtT = Math.max(0, p.hurtT - dt);
    const v = inputVector();
    p.moving = !!v;
    // v2.6 Ausweichrolle: kurzer Sprint mit Unverwundbarkeit, Richtung = Eingabe oder Blickrichtung
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (dashWanted) {
      dashWanted = false;
      if (p.dashCd <= 0 && p.dashT <= 0) {
        const dx = v ? v.x : Math.cos(p.aim), dy = v ? v.y : Math.sin(p.aim);
        p.dashX = dx; p.dashY = dy; p.dashT = DASH_T; p.dashCd = DASH_CD * p.dashCdMul;
        p.invuln = Math.max(p.invuln, DASH_T + 0.12);
        if (window.GameAudio) GameAudio.ui("swipe");
        fx4d("kick");
        fxDebris(p.x, p.y, 0, Math.PI, 4, "#5a4a3a");
        fxDust(p.x, p.y + 4, 4, 0.75);
        if (p.dashBlast) {
          fxRing(p.x, p.y, 90, "168,255,62", 0.35);
          for (const e of enemies) {
            if (e.dead || e.spawnT > 0 || e.def.boss) continue;
            const ex = e.x - p.x, ey = e.y - p.y, d = Math.hypot(ex, ey) || 1;
            if (d < 95) { e.kvx += (ex / d) * 420; e.kvy += (ey / d) * 420; e.slowT = Math.max(e.slowT, 0.8); }
          }
        }
        track("dashes");
      }
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      const ds = p.speed * 3.4;
      p.x += p.dashX * ds * dt; p.y += p.dashY * ds * dt;
      p.aim = Math.atan2(p.dashY, p.dashX);
      ghosts.push({ x: p.x, y: p.y, life: 0.28, max: 0.28 });
    }
    if (v) {
      const sp = p.speed * (run.rage > 0 ? 1.15 : 1) * (p.slowT > 0 ? 0.55 : 1); // Adrenalin, Bierlache/Formular
      p.x += v.x * sp * dt;
      p.y += v.y * sp * dt;
      p.aim = Math.atan2(v.y, v.x);
      p.walkT += dt * 10;
      const step = Math.floor(p.walkT / 1.55);
      // Sohlen werden nass, sobald der Held durch eine Lache läuft – nicht nur, wenn ein Schritt genau darin landet
      for (const q of wetSpots) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < (q.r + p.r * 0.6) ** 2) { if (!(p.bloodSteps > 6)) { p.bloodSteps = 10; p.bloodCol = q.color; } break; } // Fuß am Lachenrand zählt
      if (step !== p.footStep) {
        p.footStep = step;
        if (Math.random() < 0.7) fxDust(p.x - v.x * 8, p.y - v.y * 8 + 4, 1, 0.45);
        if (p.bloodSteps > 0) {
          const a = Math.atan2(v.y, v.x), sd = step % 2 ? 1 : -1;
          stampFoot(p.x - Math.sin(a) * 4 * sd, p.y + Math.cos(a) * 4 * sd, a, p.bloodCol || "#5a0c0e", 0.12 + 0.05 * p.bloodSteps);
          p.bloodSteps--;
        }
        if (window.GameAudio && GameAudio.foot) GameAudio.foot();
      }
      if ((p.ghostCd -= dt) <= 0) {
        p.ghostCd = 0.065;
        ghosts.push({ x: p.x, y: p.y, life: 0.2, max: 0.2 });
      }
    }
    // Rückstoß (Fußball des Ultras)
    if (p.kvx || p.kvy) { p.x += p.kvx * dt; p.y += p.kvy * dt; const f = Math.exp(-10 * dt); p.kvx *= f; p.kvy *= f; if (Math.abs(p.kvx) + Math.abs(p.kvy) < 4) p.kvx = p.kvy = 0; }
    collideWorld(p);

    // Tür
    if (run.cleared && p.y - p.r <= T + 2 && Math.abs(p.x - W / 2) < DOOR_W / 2) {
      sfx("door");
      nextRoom();
      return;
    }
    // v3.0 Mini-Spiel-Station: draufgehen startet das Spiel
    if (miniSpot && !miniSpot.done) {
      const d = Math.sqrt(dist2(p, miniSpot));
      if (d > miniSpot.r + p.r + 30) miniSpot.armed = true;
      else if (miniSpot.armed && d < miniSpot.r + p.r) { miniSpot.armed = false; openMini(miniSpot); return; }
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
    p.plant = !p.moving && target ? Math.min(1, (p.plant || 0) + dt * 4.2) : Math.max(0, (p.plant || 0) - dt * 6);
    if (run && !run.locked && p.plant > 0.55 && target) {
      run.locked = true;
      addText(p.x, p.y - 52, tr("ZIEL ERFASST"), "#a8ff3e", 16, true);
      if (window.GameAudio) GameAudio.ui("confirm");
    }
    if (!p.moving && target) {
      p.aim = Math.atan2(target.y - p.y, target.x - p.x);
      if (p.fireCd <= 0) {
        fire();
        const spinMul = p.weapon.spin ? 0.25 + 0.75 * p.spin : 1;
        p.fireCd = 1 / (p.weapon.rate * p.rateMul * spinMul * (run.rage > 0 ? 1.4 : 1) * (p.jamT > 0 ? 0.5 : 1) * (puOn("frenzy") ? 2 : 1)); // „Verspätung“ halbiert die Feuerrate
      }
    } else if (p.fireCd < 0) {
      p.fireCd = 0.07; // kurze Anlaufzeit nach dem Stehenbleiben
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
    punchX -= Math.cos(aim) * w.kick * 0.55;
    punchY -= Math.sin(aim) * w.kick * 0.55;
    if (w.shake) punchFov = Math.max(punchFov, Math.min(4.8, w.shake * 0.6));
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
        const a = d.a + s + rand(-w.jitter, w.jitter) * (1 - 0.7 * (p.plant || 0));
        bullets.push(makeBullet(gx + px, gy + py, a, {
          dmg: w.dmg * p.dmgMul, speed: w.speed * (w.kind === "flame" ? rand(0.85, 1.15) : 1), r: w.r, color: w.color,
          life: w.range / w.speed, pierce: w.pierce + p.pierce + (puOn("rico") ? 2 : 0), wall: p.wall + (w.bounces || 0) + (puOn("rico") ? 2 : 0), rico: p.ricochet + (puOn("rico") ? 1 : 0),
          kind: w.kind, aoe: w.aoe, burn: w.burn ? 1 + p.burn : p.burn, freeze: w.cryo ? 1.5 + p.freeze : p.freeze, poison: p.poison, player: true,
          tracer: puTracer() || w.tracer, long: w.long, knock: w.knock, wid: p.weaponId, big: !!(w.big || w.long || w.pellets > 1),
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
    else if ((w.shake || 0) >= 3 && Math.random() < 0.6) fxSmoke(mz.x, mz.y, 1, 0.4, 0.5); // Rauch aus schweren Läufen
    if (w.kind !== "flame" || Math.random() < 0.25) {
      if (window.GameAudio && GameAudio.gun) GameAudio.gun(p.weaponId);
      else sfx("shoot");
    }
    if (w.flash === "big") fx4d("kick"); // schwere Waffen: spürbarer Rückstoß
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
    // v2.8 perfektes Ausweichen: der Treffer kommt genau während der Rolle
    if (p.dashT > 0 && state === "play" && !(p.perfCd > run.time)) {
      p.perfCd = run.time + 1.2; p.perfectT = run.time + 3;
      slowMo = Math.max(slowMo, 0.45);
      addText(p.x, p.y - 56, tr("PERFEKT AUSGEWICHEN!"), "#a8ff3e", 18, true);
      fxRing(p.x, p.y, 80, "168,255,62", 0.4); sfx("combo"); track("perfect");
      return;
    }
    if (p.invuln > 0 || state !== "play") return;
    // v3.7 Power-up Schutzschild: schluckt jeden Treffer
    if (puOn("shield")) {
      if (!(p.shieldHitAt > run.time - 0.25)) { p.shieldHitAt = run.time; fxRing(p.x, p.y, 38, POWERUPS.shield.rgb, 0.25); fxSparks(p.x, p.y, rand(0, TAU), Math.PI, 5, POWERUPS.shield.rgb, 200); }
      return;
    }
    if (Math.random() < p.dodge) {
      addText(p.x, p.y - 30, tr("AUSGEWICHEN"), "#9ee6ff", 15);
      p.invuln = 0.3;
      return;
    }
    dmg *= p.dmgTaken || 1; // SWAT-Weste
    p.hp -= dmg;
    p.invuln = 0.8;
    shake = Math.max(shake, 8);
    punchFov = Math.max(punchFov, 2.4);
    addText(p.x + rand(-10, 10), p.y - 58, `-${Math.round(dmg)}`, "#ff5a5a", 18);
    fxBlood(p.x, p.y, rand(0, TAU), 8, RED, 160);
    if (dmg >= p.maxHp * 0.08) splashScreen(dmg >= p.maxHp * 0.2 ? 4 : 2);
    p.hurtT = 0.35;
    hitStop = Math.max(hitStop, 0.05);
    sfx("hurt");
    fx4d(dmg >= p.maxHp * 0.2 ? "heavyHurt" : "hurt");
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
        if (b.dead || o.kind === "bauzaun" || !pointInRect(b.x, b.y, o)) continue; // v3.0 durch den Bauzaun kann man schießen
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
      if (!b.dead && b.kind !== "flame" && b.kind !== "laser") hitBodies(b);
    }
    bullets = bullets.filter((b) => !b.dead);

    dt *= puEnemyK(); // v3.7 Zeitlupe: Gegner-Geschosse ebenfalls langsamer
    for (const b of eBullets) {
      const px = b.x, py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.kind) b.spin += dt * (b.kind === "ball" || b.kind === "barrel" ? Math.hypot(b.vx, b.vy) / (b.r * 0.9) : b.kind === "paper" ? 5 : b.kind === "anchor" ? 14 : 9);
      if (b.kind === "anchor") {
        // Anker: fliegt hinaus und kehrt zum Klabautermann zurück – durch Hindernisse, trifft auf beiden Wegen
        b.t = (b.t || 0) + dt; b.hitCd = Math.max(0, (b.hitCd || 0) - dt);
        const o = b.owner;
        if (!o || o.dead) { b.dead = true; acidSplash(b); continue; }
        if (!b.back && (b.t > 0.75 || b.x < L || b.x > R || b.y < T || b.y > B)) { b.back = true; sfx("zap"); }
        if (b.back) {
          const dx2 = o.x - b.x, dy2 = o.y - b.y, dd = Math.hypot(dx2, dy2) || 1;
          b.vx = (dx2 / dd) * 680; b.vy = (dy2 / dd) * 680;
          if (dd < o.r) { b.dead = true; continue; }
        }
        b.x = clamp(b.x, L, R); b.y = clamp(b.y, T, B);
        if (Math.random() < 0.3) fxSparks(b.x, b.y, rand(0, TAU), Math.PI, 1, "200,210,220", 120);
        if (b.hitCd <= 0 && (player.x - b.x) ** 2 + (player.y - b.y) ** 2 < (player.r + b.r) ** 2) { b.hitCd = 0.5; hurtPlayer(b.dmg); player.kvx = (player.kvx || 0) + b.vx * 0.5; player.kvy = (player.kvy || 0) + b.vy * 0.5; }
        continue;
      }
      if (b.kind === "barrel") {
        // Bierfass rollt, zerplatzt an Wand/Hindernis/Held zu einer Bierlache
        const out = b.x < L + b.r || b.x > R - b.r || b.y < T + b.r || b.y > B - b.r;
        const hitP = (player.x - b.x) ** 2 + (player.y - b.y) ** 2 < (player.r + b.r) ** 2;
        if (out || b.life <= 0 || hitP || obstacles.some((o) => o.kind !== "bauzaun" && pointInRect(b.x, b.y, o))) {
          b.dead = true; b.x = clamp(b.x, L + 10, R - 10); b.y = clamp(b.y, T + 10, B - 10);
          addHazard(b.x, b.y, 50, 4, 0, "bier"); fxDebris(b.x, b.y, 0, Math.PI, 10, "#6a4426");
          for (let i = 0; i < 6; i++) fxGas(b.x + rand(-24, 24), b.y + rand(-24, 24), 1.2, "250,236,190", 1);
          sfx("glass"); shake = Math.max(shake, 3);
          if (hitP || dist2(player, b) < 60 * 60) hurtPlayer(b.dmg);
        }
        continue;
      }
      if (b.kind === "ball") {
        // Fußball: prallt von Wänden und Hindernissen ab, wird mit jedem Abpraller langsamer
        let hit = false;
        if (b.x < L + b.r || b.x > R - b.r) { b.vx = -b.vx; b.x = clamp(b.x, L + b.r, R - b.r); hit = true; }
        if (b.y < T + b.r || b.y > B - b.r) { b.vy = -b.vy; b.y = clamp(b.y, T + b.r, B - b.r); hit = true; }
        const o = !hit && obstacles.find((q) => q.kind !== "bauzaun" && pointInRect(b.x, b.y, q) && !pointInRect(px, py, q)); // nur beim Eintreten abprallen
        if (o) { if (px > o.x && px < o.x + o.w) b.vy = -b.vy; else b.vx = -b.vx; b.x = px; b.y = py; hit = true; }
        if (hit) {
          b.vx *= 0.88; b.vy *= 0.88; fxDebris(b.x, b.y, rand(0, TAU), Math.PI, 3, "#8a8070"); sfx("kick");
          if (--b.bounces < 0) { b.dead = true; acidSplash(b); continue; }
        }
        if (b.life <= 0) { b.dead = true; acidSplash(b); continue; }
      } else {
        if (b.life <= 0 || b.x < L || b.x > R || b.y < T || b.y > B) { b.dead = true; acidSplash(b); continue; }
        if (!b.slug && !b.kind && Math.random() < 0.25) fxDrip(b);
        if (obstacles.some((o) => o.kind !== "bauzaun" && pointInRect(b.x, b.y, o))) { b.dead = true; acidSplash(b); continue; }
      }
      if ((player.x - b.x) ** 2 + (player.y - b.y) ** 2 < (player.r + b.r - 3) ** 2) {
        b.dead = true;
        acidSplash(b);
        hurtPlayer(b.dmg);
        if (b.kind === "paper") debuff("slowT", 2.2, "AUSGEBREMST");
        if (b.kind === "ball") { player.kvx = (player.kvx || 0) + b.vx * 0.4; player.kvy = (player.kvy || 0) + b.vy * 0.4; }
      }
    }
    eBullets = eBullets.filter((b) => !b.dead);
  }

  function addHazard(x, y, r, life, dmg, kind = "fire") {
    if (hazards.length > 40) hazards.shift();
    const h = { x, y, r, life, max: life, dmg, kind };
    hazards.push(h);
    if (kind === "fire" && Math.random() < 0.5) stamp(Sprites.scorch(), x, y, rand(0, TAU), r / 40, 0.35);
    return h;
  }
  function updateHazards(dt) {
    for (const h of hazards) {
      h.life -= dt;
      if (h.kind === "foam" || h.kind === "bier") {
        // Bierschaum: bremst (foam: Zombies, bier: den Helden), richtet keinen Schaden an
        if (Math.random() < 0.25) fxGas(h.x + rand(-h.r, h.r) * 0.6, h.y + rand(-h.r, h.r) * 0.6, h.r / 50, h.rgb || "250,236,190", 1);
        if (h.kind === "foam") { for (const e of enemies) if (!e.dead && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < (h.r + e.r * 0.5) ** 2) e.slowT = Math.max(e.slowT, 0.4); }
        else if ((player.x - h.x) ** 2 + (player.y - h.y) ** 2 < (h.r + player.r * 0.5) ** 2) player.slowT = Math.max(player.slowT || 0, 0.35);
        continue;
      }
      if (h.kind === "napalm") {
        // v2.9 Molotow/Feuerwalze: brennt nur Zombies, der Held läuft gefahrlos hindurch
        if (Math.random() < 0.45) fxFire(h.x + rand(-h.r, h.r) * 0.65, h.y + rand(-h.r, h.r) * 0.65, 0.8, 0.45);
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.def.fireproof || (e.x - h.x) ** 2 + (e.y - h.y) ** 2 > (h.r + e.r * 0.5) ** 2) continue;
          e.burnT = Math.max(e.burnT, 1.4); e.burnDps = Math.max(e.burnDps || 0, h.dmg);
        }
        continue;
      }
      if (h.kind === "shock") {
        // v3.7 Hochspannung: Stromstöße springen auf Zombies im Radius über – und auf alle, die in Blutlachen stehen (bis zum doppelten Radius)
        if (Math.random() < 0.6) fxSparks(h.x + rand(-h.r, h.r) * 0.55, h.y + rand(-h.r, h.r) * 0.55, rand(0, TAU), Math.PI, 1, "170,230,255", 160);
        if ((h.tick -= dt) <= 0) {
          h.tick = 0.3;
          let n = 0;
          for (const e of enemies) {
            if (e.dead || e.spawnT > 0 || e.under || n >= 8) continue;
            const d2 = (e.x - h.x) ** 2 + (e.y - h.y) ** 2;
            if (d2 > (h.r + e.r * 0.5) ** 2 && !(d2 < 4 * h.r * h.r && pools.some((q) => (q.x - e.x) ** 2 + (q.y - e.y) ** 2 < (q.r + e.r * 0.4) ** 2))) continue;
            n++;
            e.stunT = Math.max(e.stunT || 0, e.def.boss ? 0.15 : 0.45);
            damageEnemy(e, h.dmg * 0.3, { silent: true });
            zaps.push({ x1: h.x + rand(-8, 8), y1: h.y + rand(-8, 8), x2: e.x, y2: e.y, life: 0.28, max: 0.28 });
          }
          for (let i = 0; i < (h.wet ? 2 : 1); i++) { const a = rand(0, TAU), rr = rand(0.45, 1) * h.r; zaps.push({ x1: h.x, y1: h.y, x2: h.x + Math.cos(a) * rr, y2: h.y + Math.sin(a) * rr, life: 0.22, max: 0.22 }); }
          if (n) sfx("zap");
        }
        continue;
      }
      if (h.kind === "shards" || h.kind === "stink") {
        // nur für Zombies: Scherben schneiden, Gestank vergiftet
        if (h.kind === "shards") { if (Math.random() < 0.3) fxSparks(h.x + rand(-h.r, h.r) * 0.7, h.y + rand(-h.r, h.r) * 0.7, rand(0, TAU), Math.PI, 1, "200,255,235", 60); }
        else if (Math.random() < 0.35) fxGas(h.x + rand(-h.r, h.r) * 0.7, h.y + rand(-h.r, h.r) * 0.7, h.r / 45, "120,130,50", 1.6);
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || (e.x - h.x) ** 2 + (e.y - h.y) ** 2 > (h.r + e.r * 0.5) ** 2) continue;
          if (h.kind === "shards") { damageEnemy(e, h.dmg * dt, { silent: true }); e.slowT = Math.max(e.slowT, 0.2); if (Math.random() < 0.05) fxBlood(e.x, e.y, rand(0, TAU), 2, e.def.blood, 80); }
          else e.poisonDps = Math.max(e.poisonDps, h.dmg);
        }
        continue;
      }
      if (h.kind === "gas") { if (Math.random() < 0.3) fxGas(h.x + rand(-h.r, h.r) * 0.7, h.y + rand(-h.r, h.r) * 0.7, h.r / 40, "150,200,60"); }
      else if (Math.random() < 0.3) fxFire(h.x + rand(-h.r, h.r) * 0.6, h.y + rand(-h.r, h.r) * 0.6, 0.7, 0.45);
      // Feuerwehr ist feuerfest, Biohazard-Anzug hält Giftgas ab
      if ((player.x - h.x) ** 2 + (player.y - h.y) ** 2 < (h.r + player.r * 0.5) ** 2 && !(h.kind === "gas" ? player.gasproof : player.fireproof)) hurtPlayer(h.dmg);
    }
    hazards = hazards.filter((h) => h.life > 0);
  }
  function hitObstacle(o, dmg) {
    if (!o.hp || o.dead || o.gateBar) return; // Gang-Barrikaden brechen nur die Zombies auf
    if (!o.maxHp) o.maxHp = o.hp;
    o.hp -= dmg;
    if (CARS[o.kind] && o.hp > 0) carHit(o);
    else if (o.kind === "trafo" && o.hp > 0) trafoHit(o);
    if (o.hp <= 0) destroyObstacle(o);
  }
  // ============================================================
  // v3.7 Interaktive Umgebung
  // Autos: erster Treffer löst die Alarmanlage aus (lockt Zombies 9 s lang an), unter 55 % Rauch aus der Haube,
  // unter 28 % Brand – das Feuer frisst das Auto von selbst auf, dann Explosion mit Kettenreaktion; das Wrack bleibt als Deckung.
  // Stromkasten: Funken bei Treffern, zerstört → Hochspannung (Gefahrenzone „shock“), bei Regen und über Blutlachen weiter.
  // ============================================================
  const CAR_ALARM = 9;
  const obsC = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
  function carHit(o) {
    const c = obsC(o);
    if (!o.alarmDone) {
      o.alarmDone = true; o.alarmT = CAR_ALARM; o.alarmBeep = 0;
      lures.push({ x: c.x, y: c.y, src: o });
      addText(c.x, c.y - 34, tr("ALARMANLAGE!"), "#ffb733", 17, true);
      sfx("glass"); fxSparks(c.x, c.y, rand(0, TAU), Math.PI, 6, "220,240,255", 160);
    }
    if (Math.random() < 0.3) fxSparks(c.x + rand(-o.w, o.w) * 0.35, c.y + rand(-o.h, o.h) * 0.35, rand(0, TAU), 1.2, 2, "255,220,160", 180);
  }
  function trafoHit(o) {
    const c = obsC(o);
    fxSparks(c.x, c.y - 6, rand(0, TAU), Math.PI, 5, "170,230,255", 220);
    if (Math.random() < 0.35) {
      const e = enemies.find((q) => !q.dead && q.spawnT <= 0 && !q.under && (q.x - c.x) ** 2 + (q.y - c.y) ** 2 < 120 * 120);
      if (e) { zaps.push({ x1: c.x, y1: c.y, x2: e.x, y2: e.y, life: 0.2, max: 0.2 }); e.stunT = Math.max(e.stunT || 0, 0.4); damageEnemy(e, player.power * 0.8, { silent: true }); sfx("zap"); }
    }
  }
  function updateCars(dt) {
    for (const o of obstacles) {
      if (o.wreck) { // ausgebranntes Wrack qualmt noch eine Weile
        if ((o.smokeT -= dt) > 0 && Math.random() < dt * (2 + o.smokeT * 0.3)) fxSmoke(o.x + o.w * rand(0.3, 0.7), o.y + o.h * rand(0.3, 0.7), 1, 0.7, rand(1.2, 1.8));
        if (o.smokeT > 6 && Math.random() < dt * 4) fxEmber(o.x + o.w * rand(0.2, 0.8), o.y + o.h * rand(0.2, 0.8));
        continue;
      }
      if (!CARS[o.kind] || !o.maxHp || o.dead) continue;
      const c = obsC(o), k = o.hp / o.maxHp, hood = o.vert ? { x: c.x, y: o.y + o.h * 0.25 } : { x: o.x + o.w * 0.75, y: c.y };
      if (o.alarmT > 0) {
        o.alarmT -= dt;
        if ((o.alarmBeep -= dt) <= 0) { o.alarmBeep = 0.62; sfx("alarm"); }
        if (o.alarmT <= 0) lures = lures.filter((q) => q.src !== o);
      }
      if (k < 0.55 && Math.random() < dt * (k < 0.28 ? 9 : 5)) fxSmoke(hood.x + rand(-8, 8), hood.y + rand(-6, 6), 1, k < 0.28 ? 0.9 : 0.6, rand(0.9, 1.4));
      if (k < 0.28) {
        if (!o.fireAt) { o.fireAt = run.time; addText(c.x, c.y - 34, tr("ES BRENNT!"), "#ff7a3a", 17, true); }
        if (Math.random() < dt * 16) fxFire(hood.x + rand(-12, 12), hood.y + rand(-9, 9), 1.1, rand(0.35, 0.55));
        if (Math.random() < dt * 5) fxEmber(hood.x, hood.y);
        o.hp -= o.maxHp * 0.075 * dt; // das Feuer frisst sich durch – nach gut 3 s fliegt der Wagen in die Luft
        o.shakeT = k < 0.1 ? 0.1 : 0;
        if (o.hp <= 0) destroyObstacle(o);
      }
    }
  }
  function carExplode(o) {
    const c = obsC(o), U = player.power;
    lures = lures.filter((q) => q.src !== o);
    explode(c.x, c.y, 150, U * 6, true); // trifft auch Nachbar-Hindernisse (Fässer, Kisten …)
    // Kettenreaktion: Autos in der Nähe fangen Feuer und fliegen ein paar Sekunden später selbst in die Luft
    for (const q of obstacles) if (CARS[q.kind] && !q.dead && q.hp > 0 && dist2(obsC(q), c) < 190 * 190) { if (!q.maxHp) q.maxHp = q.hp; q.hp = Math.min(q.hp, q.maxHp * 0.26); carHit(q); }
    particles.push({ t: "boom", x: c.x, y: c.y, r: 175, life: 1, max: 1 });
    for (let i = 0; i < 4; i++) addHazard(c.x + rand(-o.w, o.w) * 0.4, c.y + rand(-o.h, o.h) * 0.4, 30, 4.5, U * 1.6, "napalm");
    stamp(Sprites.scorch(), c.x, c.y, rand(0, TAU), 3.4, 0.95);
    fxSparks(c.x, c.y, 0, Math.PI, 26, "255,210,140", 520);
    fxDebris(c.x, c.y, 0, Math.PI, 18, "#26282a"); fxDebris(c.x, c.y, 0, Math.PI, 10, "#9aa6ae");
    shake = Math.max(shake, 14); punchFov = Math.max(punchFov, 4); hitStop = Math.max(hitStop, 0.08); slowMo = Math.max(slowMo, 0.3);
    addText(c.x, c.y - 36, tr("KAWUMM!"), "#ff8a3d", 26, true);
    fx4d("boom"); track("cars");
    if (dist2(player, c) < 110 * 110) hurtPlayer(player.maxHp * 0.08); // wer danebensteht, bekommt etwas ab
    obstacles.push({ kind: "wrack", x: o.x, y: o.y, w: o.w, h: o.h, vert: o.vert, seed: o.seed, fest: o.fest, barrier: o.barrier, wreck: true, smokeT: 14 });
  }
  function trafoBlow(o) {
    const c = obsC(o);
    const wet = curWeather() === "rain" || pools.filter((q) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 < 170 * 170).length >= 2;
    const r = wet ? 190 : 125;
    const h = addHazard(c.x, c.y, r, 4.5, player.power * 2.4, "shock"); h.wet = wet; h.tick = 0;
    fxFlash(c.x, c.y, r * 1.5, "140,220,255", 0.45); fxRing(c.x, c.y, r, "140,220,255", 0.5);
    fxSparks(c.x, c.y, 0, Math.PI, 30, "200,240,255", 420); fxDebris(c.x, c.y, 0, Math.PI, 12, "#5f6b64"); fxSmoke(c.x, c.y, 3, 0.8, 1.2);
    stamp(Sprites.scorch(), c.x, c.y, rand(0, TAU), 1.4, 0.8);
    addText(clamp(c.x, L + 130, R - 130), c.y - 32, tr(wet ? "HOCHSPANNUNG – ALLES NASS!" : "HOCHSPANNUNG!"), "#8fe0ff", 19, true);
    sfx("shock"); shake = Math.max(shake, 7); fx4d("boom"); track("trafos");
  }
  function destroyObstacle(o) {
    o.dead = true;
    obstacles = obstacles.filter((q) => q !== o);
    roomLights = roomLights.filter((l) => l.src !== o);
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (PU_CRATES.includes(o.kind) && Math.random() < 0.14) dropPower(cx, cy); // v3.7 Kisten können Power-ups enthalten
    if (CARS[o.kind]) { carExplode(o); return; }
    if (o.kind === "trafo") { trafoBlow(o); return; }
    if (o.kind === "bretter") {
      const dir = o.x < L ? 0 : Math.PI;
      fxDebris(cx, cy, dir, 1.4, 26, "#7a5a34"); fxDebris(cx, cy, dir, 1.6, 10, "#4e3820"); fxDust(cx, cy, 6, 1.4);
      for (let i = 0; i < 4; i++) stamp(Sprites.crack(), clamp(cx + (o.x < L ? 30 : -30) + rand(-20, 20), L + 8, R - 8), cy + rand(-30, 30), rand(0, TAU), 0.8, 0.5);
      return;
    }
    if (o.kind === "barrels") {
      splatter(cx, cy, rand(0, TAU), 1.6, GREEN);
      for (let i = 0; i < 6; i++) fxBubble(cx + rand(-20, 20), cy + rand(-20, 20));
      explode(cx, cy, 100, player.power * 4, true);
    } else if (o.kind === "fass") {
      // Bierfass: Schaumwelle – Zombies darin kommen kaum voran
      // im Weindorf: Trollinger statt Bier – rote Lache, schwäbischer Trinkspruch
      const wein = o.fest === "wein";
      for (let i = 0; i < 5; i++) addHazard(cx + rand(-40, 40), cy + rand(-40, 40), 34, 6, 0, "foam").rgb = wein ? "150,30,60" : null;
      splatter(cx, cy, rand(0, TAU), 1.4, wein ? "#7a1830" : "#c9a43a");
      fxDebris(cx, cy, 0, Math.PI, 16, "#8a5a2c");
      for (let i = 0; i < 12; i++) fxGas(cx + rand(-30, 30), cy + rand(-30, 30), 0.9, wein ? "170,40,70" : "250,240,210", 1.4);
      addText(cx, cy - 20, tr(wein ? "PROSCHT!" : "O'ZAPFT IS!"), wein ? "#ff7a9a" : "#ffd23a", 20, true);
      sfx("splat"); shake = Math.max(shake, 4);
    } else if (o.kind === "maibaum") {
      // Maibaum kippt vom Helden weg und erschlägt alles auf seinem Weg
      const a = Math.atan2(cy - player.y, cx - player.x), len = 230, ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      for (const e of enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const t = clamp(((e.x - cx) * Math.cos(a) + (e.y - cy) * Math.sin(a)) / len, 0, 1), px = cx + Math.cos(a) * len * t, py = cy + Math.sin(a) * len * t;
        if ((e.x - px) ** 2 + (e.y - py) ** 2 < (e.r + 18) ** 2) damageEnemy(e, 260 + player.power * 6, { aoe: true });
      }
      for (const q of obstacles) if (q.hp && circleRectOverlap({ x: (cx + ex) / 2, y: (cy + ey) / 2, r: 60 }, q)) hitObstacle(q, 999);
      stamp(Sprites.fallenPole(), (cx + ex) / 2, (cy + ey) / 2, a, 1, 1);
      for (let i = 0; i < 10; i++) { const t = i / 9; fxDebris(cx + (ex - cx) * t, cy + (ey - cy) * t, a + Math.PI / 2, Math.PI, 3, "#e8e0c8"); }
      fxSmoke(ex, ey, 6, 1.2, 1); shake = Math.max(shake, 12); hitStop = Math.max(hitStop, 0.08);
      addText(cx, cy - 26, tr("MAIBAUM FÄLLT!"), "#7fd0ff", 22, true);
      sfx("boom"); fx4d("boom");
    } else if (o.kind === "feuertonne") {
      // umgestoßene Feuertonne: brennende Glut läuft aus – trifft nur Zombies
      for (let i = 0; i < 3; i++) addHazard(cx + rand(-30, 30), cy + rand(-24, 24), 34, 5, player.power * 1.4, "napalm");
      fxDebris(cx, cy, 0, Math.PI, 12, "#5a4a3a");
      for (let i = 0; i < 14; i++) fxEmber(cx + rand(-14, 14), cy + rand(-14, 14));
      fxFlash(cx, cy, 80, "255,150,60", 0.2);
      sfx("boom"); shake = Math.max(shake, 5);
    } else if (o.kind === "bauzaun") {
      fxDebris(cx, cy, 0, Math.PI, 14, "#b8bcc0"); fxSparks(cx, cy, 0, Math.PI, 10, "255,230,180", 220);
      sfx("kill"); shake = Math.max(shake, 3);
    } else if (o.kind === "rebstock") {
      // Rebstock: Trauben fallen herunter und heilen
      fxDebris(cx, cy, 0, Math.PI, 12, "#3a6a2a"); fxDebris(cx, cy, 0, Math.PI, 8, "#5a1a4a"); fxDebris(cx, cy, 0, Math.PI, 5, "#6a4a2a");
      for (let i = 0; i < 2; i++) { const f = makeOrb(cx, cy, "heal", 0.12); f.food = "Trauben"; orbs.push(f); }
      sfx("kill"); shake = Math.max(shake, 3);
    } else if (o.kind === "glascontainer") {
      // Altglas: Scherbenteppich – Zombies, die durchlaufen, schneiden sich
      for (let i = 0; i < 4; i++) addHazard(cx + rand(-40, 40), cy + rand(-30, 30), 34, 7, player.power * 1.6, "shards");
      for (const col of ["#3a8a4a", "#e8f0f0", "#8a5a2a"]) fxDebris(cx, cy, 0, Math.PI, 14, col);
      fxSparks(cx, cy, 0, Math.PI, 18, "220,255,240", 300);
      addText(cx, cy - 20, tr("SCHERBEN!"), "#bff0ff", 18, true);
      sfx("glass"); shake = Math.max(shake, 5);
    } else if (o.kind === "dixi") {
      // Toilettenhäuschen: Gestank vergiftet alle Zombies in der Nähe
      addHazard(cx, cy, 80, 6, player.power * 0.5, "stink");
      for (let i = 0; i < 16; i++) fxGas(cx + rand(-50, 50), cy + rand(-50, 50), 1.6, "120,130,50", 2);
      fxDebris(cx, cy, 0, Math.PI, 16, "#2a5aa8"); fxDebris(cx, cy, 0, Math.PI, 6, "#e8e8e0");
      addText(cx, cy - 24, tr("IGITT!"), "#b8d040", 20, true);
      sfx("splat"); shake = Math.max(shake, 5);
    } else if (o.kind === "weihnachtsbaum") {
      // Tannenbaum: Kugeln zerspringen, darunter liegen Geschenke (Münzen)
      for (let i = 0; i < 7; i++) orbs.push(makeOrb(cx, cy, "coin", 1));
      for (const rgb of ["255,60,60", "255,210,60", "90,200,255"]) fxSparks(cx, cy, 0, Math.PI, 10, rgb, 320);
      fxDebris(cx, cy, 0, Math.PI, 18, "#1e5a2a"); fxDebris(cx, cy, 0, Math.PI, 6, "#5a3a1e");
      addText(cx, cy - 26, tr("O TANNENBAUM!"), "#7fff9a", 20, true);
      sfx("glass"); shake = Math.max(shake, 5);
    } else if (o.kind === "tonnen") {
      // v3.4 Mülltonnen: der Inhalt fliegt – Müllsäcke, Papier, Bioabfall
      for (const col of ["#e8c21a", "#2a5ab0", "#6a4a2a", "#d8d8d0"]) fxDebris(cx, cy, 0, Math.PI, 8, col);
      for (let i = 0; i < 8; i++) fxGas(cx + rand(-30, 30), cy + rand(-20, 20), 1, "120,110,70", 1.2);
      addText(cx, cy - 20, tr("MÜLLABFUHR!"), "#e8c21a", 17, true);
      sfx("hit"); shake = Math.max(shake, 3);
    } else if (o.kind === "bushalte") {
      for (let i = 0; i < 3; i++) addHazard(cx + rand(-40, 40), cy + rand(-20, 20), 30, 6, player.power * 1.4, "shards");
      fxDebris(cx, cy, 0, Math.PI, 12, "#5a6066"); fxSparks(cx, cy, 0, Math.PI, 16, "220,240,255", 280);
      sfx("glass"); shake = Math.max(shake, 4);
    } else if (o.kind === "parkbank" || o.kind === "rollstuhl" || o.kind === "infusion") {
      fxDebris(cx, cy, 0, Math.PI, 12, o.kind === "parkbank" ? "#7a5230" : "#9aa3ad"); fxDebris(cx, cy, 0, Math.PI, 5, "#1e2224");
      if (o.kind === "infusion") splatter(cx, cy, rand(0, TAU), 0.5, "#d8eef4");
      sfx("kill"); shake = Math.max(shake, 2);
    } else if (o.kind === "boeller") {
      // Böllerkiste: Silvester-Feuerwerk – Raketen schlagen rundherum ein
      for (let i = 0; i < 7; i++) fireworks.push({ x: cx + rand(-120, 120), y: cy + rand(-120, 120), t: 0.15 + i * 0.12, rgb: pick(["255,80,80", "255,210,60", "90,200,255", "140,255,120", "255,120,230"]) });
      fxSparks(cx, cy, -Math.PI / 2, 1.2, 20, "255,220,120", 420); sfx("boom");
      addText(cx, cy - 20, tr("FROHES NEUES!"), "#ffd23a", 20, true);
    } else {
      const col = o.kind === "crate" || o.kind === "strandkorb" ? "#7a5a34" : o.kind === "medcrate" ? "#dfe2dc" : "#56606a";
      fxDebris(cx, cy, 0, Math.PI, 22, col);
      fxDebris(cx, cy, 0, Math.PI, 8, "#4e3820");
      fxSmoke(cx, cy, 4, 0.9, 0.9);
      shake = Math.max(shake, 5);
      hitStop = Math.max(hitStop, 0.04);
      sfx("kill");
      for (let i = o.kind === "automat" ? 9 : randi(2, 4); i > 0; i--) orbs.push(makeOrb(cx, cy, "coin", 1));
      if (o.kind === "automat") addText(cx, cy - 18, tr("KLEINGELD!"), "#ffd23a", 18, true);
      if (o.kind === "bude") {
        // Marktbude: Essen je nach Stadt – heilt mehr als ein Medkit
        const food = FOOD[o.fest] || FOOD.markt;
        for (let i = 0; i < 2; i++) { const f = makeOrb(cx, cy, "heal", 0.2); f.food = food; orbs.push(f); }
      } else if (o.kind === "medcrate" || Math.random() < 0.25) orbs.push(makeOrb(cx, cy, "heal", 0.15));
    }
  }

  // Böller-Raketen: kurz zeitversetzt kleine bunte Explosionen
  let fireworks = [];
  let parcels = []; // gelandete Paketbomben (piepen, dann Explosion)
  function updateFireworks(dt) {
    for (const f of fireworks) {
      if ((f.t -= dt) > 0) continue;
      f.done = true;
      fxRing(f.x, f.y, 70, f.rgb, 0.4); fxFlash(f.x, f.y, 110, f.rgb, 0.2);
      for (let i = 0; i < 3; i++) fxSparks(f.x, f.y, rand(0, TAU), Math.PI, 8, f.rgb, 300);
      miniBlast(f.x, f.y, 55, player.power * 2.2);
      sfx("hit");
    }
    if (fireworks.length) fireworks = fireworks.filter((f) => !f.done);
  }
  // Essen je Fest (Marktbuden): Name erscheint beim Aufsammeln
  const FOOD = { wein: "Zwiebelkuchen", imbiss: "Currywurst", wiesn: "Brezel", weihnachten: "Glühwein", apfelwein: "Grüne Soße", hafen: "Fischbrötchen", karneval: "Berliner", bahn: "Bockwurst", werk: "Maultaschen", markt: "Brezel" };
  function explode(x, y, radius, dmg, byPlayer) {
    shake = Math.max(shake, 9);
    hitStop = Math.max(hitStop, 0.06);
    fx4d("boom");
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
        if (!e.def.boss && !e.def.anchored) { const f = 520 * (1 - d / (radius + e.r)) * (e.type === "brute" ? 0.35 : 1); e.kvx += Math.cos(e.hitAng) * f; e.kvy += Math.sin(e.hitAng) * f; }
        damageEnemy(e, byPlayer ? dmg : dmg * 2, { aoe: true });
      }
    }
    if (!byPlayer && Math.sqrt(dist2(player, { x, y })) < radius + player.r) hurtPlayer(dmg);
    blastBodies(x, y, radius * 1.6);
    if (dist2(player, { x, y }) < (radius + 60) ** 2 && enemies.some((e) => e.dead && dist2(e, { x, y }) < radius * radius)) splashScreen(2);
    for (const o of obstacles.slice()) {
      if (!o.hp || o.dead) continue;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if ((cx - x) ** 2 + (cy - y) ** 2 < radius * radius) hitObstacle(o, Math.max(dmg, 40) * 2);
    }
  }

  function acidSplash(b) {
    if (b.kind) {
      if (b.kind === "paper") { fxDebris(b.x, b.y, rand(0, TAU), Math.PI, 4, "#ece6d4"); sfx("paper"); }
      else if (b.kind === "harpoon" || b.kind === "anchor") fxSparks(b.x, b.y, rand(0, TAU), Math.PI, 4, "220,225,235", 200);
      else if (b.kind === "candy") fxSparks(b.x, b.y, 0, Math.PI, 4, b.rgb, 120);
      else { fxDebris(b.x, b.y, 0, Math.PI, 5, "#8a8070"); fxSmoke(b.x, b.y, 1, 0.6, 0.6); }
      return;
    }
    const rgb = b.rgb || "183,255,74";
    fxSparks(b.x, b.y, 0, Math.PI, 5, rgb, 140);
    if (!b.slug && b.x > L && b.x < R && b.y > T && b.y < B) stamp(Sprites.splat(b.pink ? PURPLE : GREEN, randi(0, 5)), b.x, b.y, rand(0, TAU), 0.35, 0.7);
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
      if (p.bigGame && (e.elite || e.def.boss)) dmg *= p.bigGame; // Seuchenjäger
      if (p.perfectT > run.time) dmg *= 1.25; // nach perfektem Ausweichen
      if (e.frostT > 0) dmg *= 1.3; // v2.9 eingefroren: spröde
      if (puOn("double")) dmg *= 2; // v3.7 Power-up Doppelschaden
      // Schwachstelle: Treffer in den Rücken eines Bosses
      if (e.def.boss && o.bullet && !o.aoe && Math.abs(angDiff(e.face, Math.atan2(-o.bullet.vy, -o.bullet.vx))) > 2.0) {
        dmg *= 1.5;
        if (!(run.time - (e.wkAt || -9) < 0.7)) { e.wkAt = run.time; addText(e.x, e.y - e.r - 22, tr("SCHWACHSTELLE!"), "#ffd45c", 16, true); }
      }
      if (!e.def.boss && p.headshot > 0 && Math.random() < p.headshot) { dmg = e.hp; crit = true; exec = true; }
      // … und zerspringen unter 30 % Leben
      if (p.evo.frost && e.slowT > 0 && !e.def.boss && e.hp - dmg < e.maxHp * 0.3) { dmg = e.hp; crit = true; exec = true; o.shatter = true; }
    }
    // Panzerung (Riot-Zombie) schluckt einen Teil des Schadens – Exekution ignoriert sie
    const armor = Math.max(e.def.armor || 0, e.aff && e.aff.includes("armored") ? 0.4 : 0, e.evoArmor || 0); // v3.7 Knochenpanzer
    if (e.evo) e.evoCalm = 0;
    if (armor && !o.silent && !exec) dmg *= 1 - armor;
    if (e.aff) e.calmT = 0;
    // Energieschild des Schildwächters fängt Schaden ab, bis er bricht
    if (e.shield > 0) {
      const a = Math.min(e.shield, dmg);
      e.shield -= a; dmg -= a;
      if (Math.random() < 0.6) fxSparks(e.x, e.y, (e.hitAng ?? 0) + Math.PI, 0.9, 3, "140,210,255", 220);
      if (e.shield <= 0) { e.shieldT = 0; fxRing(e.x, e.y, e.r * 2.4, "140,210,255", 0.3); fxFlash(e.x, e.y, 50, "140,210,255", 0.12); sfx("zap"); }
      if (dmg <= 0) { e.hitT = 0.06; return; }
    }
    const b = o.bullet;
    // Rentner: der aufgespannte Schirm blockt Schüsse von vorn (Flanke, Explosion und Feuer gehen durch)
    if (b && e.type === "rentner" && b.kind !== "flame" && !o.aoe && !exec) {
      const ba = Math.atan2(-b.vy, -b.vx);
      if (Math.abs(angDiff(e.face, ba)) < 1.05) {
        dmg *= 0.12; fxSparks(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, ba, 0.9, 3, "220,220,240", 200);
        if (!(e.cd > 0)) { e.cd = 2.5; addText(e.x, e.y - 30, tr("RUHE!"), "#c9d4ff", 14); }
      }
    }
    if (b) {
      e.hitAng = Math.atan2(b.vy, b.vx);
      if (b.burn && !e.def.fireproof) { e.burnT = 2.5; e.burnDps = Math.max(e.burnDps, p.power * 0.35 * b.burn * (p.evo.inferno ? 2 : 1)); }
      if (b.freeze) { e.slowT = 1.2 + 0.6 * b.freeze; if (b.cryo && Math.random() < 0.5) fxIce(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r)); }
      if (b.poison) e.poisonDps = Math.min(e.poisonDps + p.power * 0.08 * b.poison, p.power * 1.5 * b.poison);
      if (!e.def.boss && !e.def.anchored && b.kind !== "flame") {
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
      overkill: dmg >= e.hp * 1.85, exec,
    };
    e.hp -= dmg;
    e.hitT = exec ? 0.16 : crit ? 0.14 : 0.1;
    if (!o.silent && (!b || b.kind !== "flame")) {
      const ang = e.hitAng || 0;
      const mag = exec ? 3.4 : crit ? 1.9 : (b && b.big) ? 1.1 : 0.45;
      punchX += Math.cos(ang) * mag;
      punchY += Math.sin(ang) * mag;
      const hs = exec ? 0.08 : crit ? 0.05 : (b && (b.big || (b.knock || 0) >= 12)) ? 0.032 : 0;
      if (hs) hitStop = Math.max(hitStop, hs);
      if (window.GameAudio && GameAudio.meat) GameAudio.meat(!!(crit || (b && b.big)));
      if (e.def.armor) fxSparks(e.x, e.y, e.hitAng + Math.PI, 0.8, 4, "200,230,255", 260);
      else {
        fxBlood(e.x, e.y, e.hitAng, crit ? 6 : 3, e.def.blood, crit ? 220 : 150);
        // Austrittswunde: kräftige Treffer sprühen Blut hinter den Zombie und klatschen es auf den Boden
        if (b && (crit || (b.big && Math.random() < 0.35) || (b.knock || 0) >= 12)) {
          const a = e.hitAng, ex = e.x + Math.cos(a) * e.r, ey = e.y + Math.sin(a) * e.r;
          fxBlood(ex, ey, a, crit ? 9 : 5, e.def.blood, 420);
          fxMist(ex, ey, e.def.blood, crit ? 1.3 : 0.9);
          if (Math.random() < 0.65) { const d = e.r + rand(10, 30); splatter(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, a, rand(0.35, 0.7), e.def.blood); }
        }
        if (b && e.hp > 0 && HUMANOID.has(e.type) && Math.random() < (crit ? 0.3 : (b.knock || 0) >= 12 ? 0.12 : 0)) severArm(e);
      }
    }
    if (!o.silent && (!b || b.kind !== "flame" || Math.random() < 0.2)) {
      addText(e.x + rand(-8, 8), e.y - e.r - 4, Math.max(1, Math.round(dmg)) + (crit ? "!" : ""), crit ? "#ffb84a" : "#ffffff", crit ? 24 : 15, crit);
      if (exec) addText(e.x, e.y - e.r - 22, tr("KOPFSCHUSS"), "#ff4a3a", 17, true);
      sfx("hit");
    }
    if (e.hp <= 0) { if (crit) hitStop = Math.max(hitStop, exec ? 0.09 : 0.045); killEnemy(e); }
  }

  // Kombo: Abschüsse in schneller Folge verketten. Stufen bringen Ansage und Münzbonus,
  // jede 20er-Stufe einen Adrenalin-Rausch (schneller feuern und laufen).
  const COMBO_TIME = 2.4, RAGE_TIME = 6;
  const COMBO_STEPS = { 5: "KOMBO!", 10: "BLUTRAUSCH!", 20: "MASSAKER!", 35: "UNAUFHALTSAM!", 50: "ZOMBIE-SCHLÄCHTER!", 75: "APOKALYPSE!", 100: "LEGENDE!" };
  function addCombo(e) {
    const n = ++run.combo;
    run.comboT = COMBO_TIME;
    if (n > run.bestCombo) { run.bestCombo = n; trackMax("combo", n); }
    const title = COMBO_STEPS[n] || (n > 100 && n % 50 === 0 ? COMBO_STEPS[100] : null);
    if (!title) return;
    const bonus = Math.round(n * 0.6 * (1 + (run.chapter - 1) * 0.25));
    const k = Math.min(10, Math.ceil(bonus / 4));
    for (let i = 0; i < k; i++) orbs.push(makeOrb(e.x, e.y, "coin", bonus / k));
    callout = { title: tr(title), n, bonus, life: 1.4, max: 1.4 };
    sfx("combo");
    if (n >= 10) dropPower(e.x, e.y); // v3.7 ab „Blutrausch“ bringt jede Kombo-Stufe ein Power-up
    if (n % 20 === 0) startRage();
  }
  function startRage() {
    run.rage = RAGE_TIME;
    slowMo = Math.max(slowMo, 0.3);
    shake = Math.max(shake, 6);
    fxRing(player.x, player.y, 120, "255,60,40", 0.5);
    fxFlash(player.x, player.y, 160, "255,40,30", 0.25);
    sfx("rage");
    fx4d("rage");
  }

  // ============================================================
  // v3.7 Power-ups: kurze, starke Verstärkungen zum Aufsammeln
  // Quellen: Elite (22 %), jede Kombo-Stufe ab 10, Kisten (14 %), selten normale Zombies (höchstens alle 7 s)
  // ============================================================
  const POWERUPS = {
    frenzy: { name: "RASEREI", desc: "Doppelte Feuerrate", icon: "puFrenzy", rgb: "255,150,40", dur: 10, w: 18 },
    double: { name: "DOPPELSCHADEN", desc: "Doppelter Schaden", icon: "puDouble", rgb: "255,72,64", dur: 10, w: 16 },
    rico: { name: "QUERSCHLÄGER", desc: "Kugeln durchschlagen und prallen ab", icon: "ricochet", rgb: "110,225,255", dur: 12, w: 14 },
    slow: { name: "ZEITLUPE", desc: "Alle Gegner in Zeitlupe", icon: "puSlow", rgb: "180,140,255", dur: 8, w: 12 },
    magnet: { name: "MAGNET", desc: "Zieht Münzen und Erfahrung an", icon: "puMagnet", rgb: "255,214,90", dur: 14, w: 13 },
    nuke: { name: "LUFTSCHLAG", desc: "Bomben auf alle Gegner in Sicht", icon: "puNuke", rgb: "255,96,40", dur: 0, w: 8 },
    shield: { name: "SCHUTZSCHILD", desc: "Unverwundbar", icon: "puShield", rgb: "90,200,255", dur: 7, w: 11 },
  };
  const PU_LIFE = 14, PU_MAX = 2, PU_SLOW = 0.4, PU_CRATES = ["crate", "medcrate", "labcrate", "tonnen", "automat"];
  let puFlash = null;
  const puOn = (k) => !!(run && run.pu && run.pu[k] > 0);
  const puEnemyK = () => (puOn("slow") ? PU_SLOW : 1);
  // Leuchtspur der Kugeln in der Farbe des wirksamsten Power-ups (Doppelschaden vor Querschläger vor Raserei)
  const puTracer = () => (puOn("double") ? POWERUPS.double.rgb : puOn("rico") ? POWERUPS.rico.rgb : puOn("frenzy") ? POWERUPS.frenzy.rgb : null);
  function rollPower() {
    const crowd = enemies.filter((e) => !e.dead).length, list = Object.entries(POWERUPS).filter(([k]) => k !== "nuke" || crowd >= 6);
    let r = Math.random() * list.reduce((a, [, d]) => a + d.w, 0);
    for (const [k, d] of list) if ((r -= d.w) <= 0) return k;
    return list[0][0];
  }
  function dropPower(x, y, kind) {
    if (!run || orbs.filter((o) => o.type === "power").length >= PU_MAX) return null;
    const o = makeOrb(clamp(x, L + 30, R - 30), clamp(y, T + 30, B - 30), "power", 0);
    o.pu = POWERUPS[kind] ? kind : rollPower(); o.rgb = POWERUPS[o.pu].rgb; o.r = 14; o.vx *= 0.35; o.vy *= 0.35;
    orbs.push(o);
    run.puDropAt = run.time;
    fxRing(o.x, o.y, 50, o.rgb, 0.45);
    return o;
  }
  function maybeDropPower(e) {
    if (e.def.boss || e.summoner || run.cleared) return;
    const recent = run.time - (run.puDropAt ?? -99) < 7;
    if (Math.random() < (e.evo === 3 ? 0.5 : e.elite ? 0.22 : e.evo === 2 && !recent ? 0.08 : recent ? 0 : run.mode === "survival" ? 0.012 : 0.008)) dropPower(e.x, e.y);
  }
  function takePower(o) {
    const d = POWERUPS[o.pu], p = player;
    run.pu = run.pu || {}; run.puMax = run.puMax || {};
    track("powerups");
    sfx("power"); fx4d("level");
    fxRing(p.x, p.y, 96, d.rgb, 0.5); fxFlash(p.x, p.y, 150, d.rgb, 0.22);
    slowMo = Math.max(slowMo, 0.25); punchFov = Math.max(punchFov, 2.2);
    puFlash = { rgb: d.rgb, t: 0.6, max: 0.6 };
    callout = { title: tr(d.name), sub: tr(d.desc), col: `rgb(${d.rgb})`, n: 1, bonus: 0, life: 1.7, max: 1.7, plain: true };
    if (o.pu === "nuke") { airRaid(); return; }
    run.pu[o.pu] = Math.min(d.dur * 1.6, Math.max(0, run.pu[o.pu] || 0) + d.dur); // erneut eingesammelt: verlängert
    run.puMax[o.pu] = run.pu[o.pu];
    if (o.pu === "shield") sfx("shield");
  }
  // Luftschlag: Bomben auf bis zu 16 Gegner im Blickfeld, nächste zuerst – trifft den Helden nicht
  function airRaid() {
    const p = player, U = powerUnit();
    const list = enemies.filter((e) => !e.dead && e.spawnT <= 0 && !e.under && Math.abs(e.y - p.y) < 640).sort((a, b) => dist2(a, p) - dist2(b, p)).slice(0, 16);
    list.forEach((e, i) => { const t = 0.55 + i * 0.09; strikes.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 84, t, max: t, dmg: U * (e.def.boss ? 2.2 : 3.2) }); });
    sfx("whistle"); shake = Math.max(shake, 6);
  }
  function updatePowers(dt) {
    if (puFlash && (puFlash.t -= frameDt) <= 0) puFlash = null;
    if (!run.pu) return;
    for (const k in run.pu) if (run.pu[k] > 0 && (run.pu[k] -= dt) <= 0) { run.pu[k] = 0; fxRing(player.x, player.y, 46, POWERUPS[k].rgb, 0.3); sfx("phase"); }
  }
  // ============================================================
  // v3.7 Plünderer: seltener Zombie mit Münzsack (Kampagne ab Bezirk 2: 30 % je Bezirk, Überleben etwa alle 75 s)
  // Er flieht, lässt unterwegs Münzen fallen und verschwindet nach LOOTER_T Sekunden. Erwischt: Münzregen + Power-up.
  // ============================================================
  const LOOTER_T = 13;
  function planLooter() {
    run.looterAt = 0;
    if (run.mode === "survival") run.looterAt = run.time + rand(55, 95);
    else if (run.room > 1 && !BOSS_ROOMS[run.room] && !SUPPLY_ROOMS.includes(run.room) && Math.random() < 0.3) run.looterAt = run.time + rand(10, 24);
  }
  function spawnLooter() {
    const p = player, x = p.x < W / 2 ? rand(W * 0.6, R - 60) : rand(L + 60, W * 0.4), y = clamp(p.y - rand(300, 420), T + 70, B - 70);
    const e = spawnEnemy("runner", x, y);
    e.looter = true; e.lootT = LOOTER_T; e.lootDrops = 8; e.side = Math.random() < 0.5 ? -1 : 1;
    e.maxHp = e.hp = e.maxHp * 4; e.speed *= 1.08;
    callout = { title: tr("PLÜNDERER!"), sub: tr("Schnapp ihn, bevor er abhaut"), col: "#ffe27a", n: 1, bonus: 0, life: 1.9, max: 1.9, plain: true };
    sfx("coin"); sfx("whistle");
    return e;
  }
  function looterLoot(e) {
    for (let i = 0; i < 18; i++) orbs.push(makeOrb(e.x, e.y, "coin", 2));
    dropPower(e.x, e.y);
    fxRing(e.x, e.y, 80, "255,220,110", 0.5); fxFlash(e.x, e.y, 120, "255,220,110", 0.25);
    for (let i = 0; i < 14; i++) fxSparks(e.x, e.y, -Math.PI / 2, 2.2, 1, "255,220,110", rand(120, 280));
    addText(e.x, e.y - 40, tr("BEUTE!"), "#ffe27a", 22, true);
    sfx("level"); track("looters");
  }
  function looterEscape(e) {
    e.dead = true; e.escaped = true;
    fxSmoke(e.x, e.y, 4, 0.8, 1); fxDust(e.x, e.y, 4, 1);
    addText(e.x, e.y - 30, tr("ENTKOMMEN"), "#b8b2a4", 16);
  }
  function updateLooter() {
    if (run.looterAt && run.time >= run.looterAt && !run.cleared && state === "play") {
      spawnLooter();
      run.looterAt = run.mode === "survival" ? run.time + rand(55, 95) : 0;
    }
    // Mehrfach-Abschuss ansagen, sobald die Serie abreißt
    if (run.mk >= 3 && run.time - run.mkAt > 0.35) { announceMulti(run.mk); run.mk = 0; }
  }
  function announceMulti(n) {
    const title = n >= 12 ? `${tr("GEMETZEL")} ×${n}` : n >= 8 ? `${tr("MEGA-KILL")} ×${n}` : n >= 5 ? `${tr("MULTI-KILL")} ×${n}` : tr(n === 3 ? "DREIFACH!" : "VIERFACH!");
    addText(player.x, player.y - 76, title, n >= 8 ? "#ff8a3d" : "#ffe27a", Math.min(30, 18 + n), true);
    for (let i = 0; i < Math.min(12, n); i++) orbs.push(makeOrb(player.x, player.y - 30, "coin", 1));
    if (n >= 8) { slowMo = Math.max(slowMo, 0.3); punchFov = Math.max(punchFov, 2.5); }
    sfx("combo"); trackMax("multikill", n);
  }
  // ---------------------------------------------------------------- v3.7 Evolution
  function mutProgress() {
    if (!run) return 0;
    if (run.mode === "survival") return (run.survT || 0) / 70; // etwa jede gute Minute eine Stufe mehr
    return cityIdx() + Math.max(0, districtIdx()) / 10;
  }
  function rollEvo(e) {
    if (!EVO_TYPES.has(e.type) || e.def.boss || e.def.pack || !run || run.room < 1) return;
    const pr = mutProgress() + 0.35 * (run.threat || 0), q = Math.random();
    const p3 = pr >= 3 ? Math.min(0.06, 0.012 + 0.008 * (pr - 3)) : 0;
    const p2 = pr >= 1.5 ? Math.min(0.14, 0.03 + 0.022 * (pr - 1.5)) : 0;
    const p1 = pr >= 0.3 ? Math.min(0.26, 0.05 + 0.04 * pr) : 0;
    const st = q < p3 ? 3 : q < p3 + p2 ? 2 : q < p3 + p2 + p1 ? 1 : 0;
    if (st) mutate(e, e.elite ? Math.min(2, st) : st, null);
  }
  // Stufe anheben: Werte relativ zur bisherigen Stufe skalieren; cause ≠ null → sichtbare Mutation (Licht, Blut, Ansage)
  function mutate(e, stage, cause) {
    stage = Math.min(3, stage);
    const prev = e.evo || 0;
    if (stage <= prev || !EVO_TYPES.has(e.type) || e.def.boss) return false;
    const A = EVO[prev], B = EVO[stage], k = (f) => (B[f] || 1) / (A[f] || 1);
    e.maxHp *= k("hp"); e.hp = Math.min(e.maxHp, e.hp * k("hp") + (cause ? e.maxHp * 0.25 : 0)); // Mutation heilt etwas
    e.dmg *= k("dmg"); e.speed *= k("speed"); e.scale *= k("size"); e.r = Math.min(e.r * k("size"), e.def.r * 1.45);
    e.evo = stage; e.evoArmor = B.armor || 0;
    e.def = { ...e.def, blood: B.blood }; // eigene Blutfarbe je Stufe (def ist sonst zwischen allen Gegnern geteilt)
    if (!cause) return true;
    e.evoFx = 0.9; e.hitT = 0.15;
    fxRing(e.x, e.y, e.r * 3.2, B.rgb, 0.55); fxFlash(e.x, e.y, 110, B.rgb, 0.32);
    fxBlood(e.x, e.y, rand(0, TAU), 14, e.def.blood, 240); fxGibs(e.x, e.y, 2, e.def.blood);
    for (let i = 0; i < 10; i++) fxSparks(e.x, e.y, -Math.PI / 2, 2, 1, B.rgb, rand(90, 220));
    splatter(e.x, e.y, rand(0, TAU), 0.8, e.def.blood);
    addText(e.x, e.y - e.r - 34, `${tr("MUTATION")}: ${tr(B.name).toUpperCase()}`, `rgb(${B.rgb})`, stage === 3 ? 20 : 16, true);
    sfx("erupt"); if (stage === 3) { sfx("rage"); shake = Math.max(shake, 6); }
    track("mutations");
    return true;
  }
  // Alpha brüllt: Zombies im Umkreis rasen, einer mutiert vielleicht mit
  function alphaRoar(e) {
    const R2 = 240 * 240;
    fxRing(e.x, e.y, 240, "255,60,60", 0.6); fxRing(e.x, e.y, 150, "255,120,100", 0.4); fxFlash(e.x, e.y, 160, "255,40,40", 0.22);
    e.roarFx = 0.7; shake = Math.max(shake, 5); punchFov = Math.max(punchFov, 1.6); sfx("rage");
    if (!e.roared) { e.roared = true; addText(e.x, e.y - e.r - 36, tr("ALPHA BRÜLLT!"), "#ff5a4a", 18, true); }
    let infected = false;
    for (const q of enemies) {
      if (q === e || q.dead || q.spawnT > 0 || q.def.boss || (q.x - e.x) ** 2 + (q.y - e.y) ** 2 > R2) continue;
      q.rageT = Math.max(q.rageT || 0, 3.5);
      if (!infected && !q.evo && EVO_TYPES.has(q.type) && Math.random() < 0.35) infected = mutate(q, 1, "roar");
    }
  }
  function evoDeath(e) {
    save.bestiary[`evo${e.evo}`] = (save.bestiary[`evo${e.evo}`] || 0) + 1;
    if (e.evo === 1) { // Giftblut
      addHazard(e.x, e.y, 26 + e.r, 3.5, e.dmg * 0.3, "gas");
      for (let i = 0; i < 8; i++) fxGas(e.x + rand(-16, 16), e.y + rand(-16, 16), 0.9, "120,220,60", 1.6);
    } else if (e.evo === 2) {
      fxDebris(e.x, e.y, 0, Math.PI, 10, "#e3d8bc"); fxSparks(e.x, e.y, 0, Math.PI, 8, "255,170,70", 200);
    } else {
      fxDebris(e.x, e.y, 0, Math.PI, 16, "#e3d8bc"); fxRing(e.x, e.y, 110, "255,60,60", 0.55); fxFlash(e.x, e.y, 150, "255,60,50", 0.3);
      addText(e.x, e.y - e.r - 40, tr("ALPHA ERLEGT!"), "#ff5a4a", 22, true);
      shake = Math.max(shake, 9); slowMo = Math.max(slowMo, 0.35); hitStop = Math.max(hitStop, 0.07); punchFov = Math.max(punchFov, 3);
      track("alphas");
    }
  }

  // Gold-Abzeichen mit Restzeit über dem Plünderer (2D und 3D)
  function drawLooterBadges() {
    for (const e of enemies) {
      if (!e.looter || e.dead || e.spawnT > 0) continue;
      const q = scr(e.x, e.y - (mode3d ? 0 : e.r + 22), mode3d ? e.r * 2.8 + 14 : 0);
      if (q.behind) continue;
      const k = Math.max(0, e.lootT / LOOTER_T);
      ctx.save();
      glowAt("255,210,90", q.x, q.y, 26, 0.5); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(10,9,6,0.88)"; ctx.beginPath(); ctx.arc(q.x, q.y, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#ffd25a"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(q.x, q.y, 12, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      drawIcon(ctx, "coins", q.x, q.y, 14, "#ffe27a");
      ctx.restore();
    }
  }

  // aktive Power-ups (für Aura, Bildschirmrand und 3D)
  const activePowers = () => (run && run.pu ? Object.keys(POWERUPS).filter((k) => run.pu[k] > 0) : []);

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    run.kills++;
    lastKill = { x: e.x, y: e.y };
    addCombo(e);
    const def = e.def;
    fxBlood(e.x, e.y, e.hitAng, def.boss ? 40 : 12, def.blood, def.boss ? 320 : 220);
    fxGibs(e.x, e.y, def.boss ? 14 : randi(2, 4), def.blood);
    splatter(e.x, e.y, e.hitAng, def.boss ? 2.4 : 0.7 + e.r / 40, def.blood);
    spawnCorpse(e);
    track("kills");
    if (e.elite) track("elites");
    // v2.9 Spezial-Energie und Wurfwaffen-Nachschub (Elites oft, Bosse immer)
    if (run.belt) {
      run.ult = Math.min(100, (run.ult || 0) + (def.boss ? 100 : e.elite ? 12 : 3.5) * (player.ultGain || 1));
      if (def.boss) addThrow(null, 2, e.x, e.y);
      else if (e.elite && Math.random() < 0.45) addThrow(null, 1, e.x, e.y);
    }
    if (def.boss) { track("bosses"); addPassXp(60); run.bossKills = (run.bossKills || 0) + 1; }
    else if (runOrder().volatile && Math.random() < runOrder().volatile && !(e.aff && e.aff.includes("volatile"))) fuses.push({ x: e.x, y: e.y, r: 64, t: 0.7, max: 0.7, dmg: e.dmg });
    if (e.death === "headshot") { track("headshots"); run.headshots = (run.headshots || 0) + 1; }
    else if (e.death === "blast" || e.death === "burst") track("blasts");
    sfx(def.boss ? "boom" : "kill");
    if (!run.firstBlood && !def.boss) {
      run.firstBlood = true;
      run.firstBloodAt = run.time;
      slowMo = Math.max(slowMo, 0.55);
      punchFov = Math.max(punchFov, 3.2);
      shake = Math.max(shake, 7);
      callout = { title: tr("ERSTER TREFFER"), n: 1, bonus: 0, life: 1.55, max: 1.55, plain: true };
      sfx("combo");
      fx4d("level");
    }
    // Inferno / Seuche: brennende bzw. vergiftete Zombies stecken beim Tod ihre Nachbarn an
    if (player.evo.inferno && e.burnT > 0) spreadToNeighbors(e, 95, (q) => { if (!q.def.fireproof) { q.burnT = 2.5; q.burnDps = Math.max(q.burnDps, e.burnDps); } }, "255,140,40");
    if (player.evo.plague && e.poisonDps > 0) spreadToNeighbors(e, 90, (q) => { q.poisonDps = Math.max(q.poisonDps, e.poisonDps * 0.8); }, "150,255,60");
    if (e.lastHit && e.lastHit.overkill && !def.boss && !(run.time - (run.okAt ?? -9) < 0.5)) { run.okAt = run.time; addText(e.x, e.y - e.r - 36, tr("ÜBERKILL"), "#ffd45c", 20, true); } // v3.7 gedrosselt: sonst stapeln sich die Texte bei Massen-Abschüssen
    if (def.boss) {
      shake = 18;
      slowMo = 0.9;
      punchFov = Math.max(punchFov, 5);
      fxFlash(e.x, e.y, 320, "255,240,200", 0.5);
      fxRing(e.x, e.y, 160, "255,220,160", 0.6);
      particles.push({ t: "boom", x: e.x, y: e.y, r: 110, life: 1.1, max: 1.1 });
      cineT = 2.2;
    } else if (e.elite) {
      hitStop = Math.max(hitStop, 0.06);
      punchFov = Math.max(punchFov, 2.2);
    }

    const EV = EVO[e.evo || 0];
    const xpVal = def.xp * (1 + run.room * 0.04) * (1 + (run.chapter - 1) * 0.5) * EV.xp;
    const nx = def.boss ? 12 : Math.max(1, Math.round(def.xp / 2));
    for (let i = 0; i < nx; i++) orbs.push(makeOrb(e.x, e.y, "xp", xpVal / nx));
    const nc = Math.round(randi(def.coins[0], def.coins[1]) * EV.coins);
    for (let i = 0; i < nc; i++) orbs.push(makeOrb(e.x, e.y, "coin", 1));

    if (player.lifesteal > 0) healPlayer(player.maxHp * player.lifesteal);
    if (!def.boss && Math.random() < 0.035) orbs.push(makeOrb(e.x, e.y, "pfand", 1)); // Pfandflasche
    if (def.split) for (let i = 0; i < def.split; i++) { const q = spawnEnemy("crawler", e.x + rand(-14, 14), e.y + rand(-14, 14)); q.spawnT = 0.12; q.kvx = rand(-260, 260); q.kvy = rand(-260, 260); }
    if (e.type === "burner") { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; addHazard(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, 16, 2.6, e.dmg * 0.6); } fxFlash(e.x, e.y, 120, "255,140,40", 0.2); }
    if (e.elite) { for (let i = 0; i < nc * 2 + 3; i++) orbs.push(makeOrb(e.x, e.y, "coin", 1)); fxRing(e.x, e.y, 60, "255,210,90", 0.4); }
    // v3.3 seltene Beutekisten (Stadt-Bosse in der Kampagne geben ihre Beute weiter direkt beim Raumabschluss)
    if (!def.boss && e.elite && !e.summoner && Math.random() < 0.07 + 0.01 * (run.threat || 0)) dropGear(e.x, e.y);
    else if (def.boss && run.mode !== "campaign") dropGear(e.x, e.y, lootLuck() + 0.04);
    maybeDropPower(e);
    if (e.aff && e.aff.includes("volatile")) { fuses.push({ x: e.x, y: e.y, r: 78, t: 0.8, max: 0.8, dmg: e.dmg * 1.3 }); addText(e.x, e.y - 34, tr("ZÜNDET!"), "#ff7a3a", 16); }
    if (e.type === "bloater") {
      // platzt zu einer Giftwolke – nicht in der Nähe erledigen!
      addHazard(e.x, e.y, 72, 5.5, e.dmg * 0.5, "gas");
      for (let i = 0; i < 10; i++) fxGas(e.x + rand(-30, 30), e.y + rand(-30, 30), 1.4, "150,200,60", 2);
      fxRing(e.x, e.y, 80, "170,230,70", 0.45); sfx("splat");
    }
    if (e.type === "nest") { fxRing(e.x, e.y, 90, "200,90,200", 0.5); shake = Math.max(shake, 6); for (let i = 0; i < 5; i++) addPiece(e, "limb", rand(0, TAU), rand(120, 240), rand(150, 260), 10); }
    if (e.type === "zwerg") { fxDebris(e.x, e.y, 0, Math.PI, 6, "#c0281e"); fxDebris(e.x, e.y, 0, Math.PI, 4, "#e8e0d0"); } // Keramik-Scherben
    if (e.looter) looterLoot(e);
    if (e.evo) evoDeath(e);
    // v3.7 Mehrfach-Abschuss: Kills im Abstand unter 0,35 s zählen zusammen, die Ansage kommt, wenn die Serie abreißt
    if (!def.boss) { run.mk = run.time - (run.mkAt ?? -9) < 0.35 ? (run.mk || 0) + 1 : 1; run.mkAt = run.time; }
    if (e.type === "beamter") { addText(e.x, e.y - 30, tr("ABGELEHNT!"), "#ff5a4a", 15); sfx("stamp"); }
    if (e.type === "wengerter") { addText(e.x, e.y - 30, tr("HA NOI!"), "#d8a0ff", 15); for (let i = 0; i < 5; i++) fxGas(e.x + rand(-12, 12), e.y + rand(-12, 12), 0.8, "150,60,170", 1); }
    if (e.type === "jeck") for (let i = 0; i < 10; i++) fxSparks(e.x, e.y, rand(0, TAU), 0.5, 1, pick(KAMELLE), rand(120, 240));
    if (e.type === "warden") for (const q of enemies) if (q.shield > 0) { q.shield = 0; q.shieldT = 0; fxRing(q.x, q.y, q.r * 2.2, "140,210,255", 0.3); }
    save.bestiary[e.type] = (save.bestiary[e.type] || 0) + 1;
    if (e.type === "bomber") explode(e.x, e.y, 70, e.dmg, false);
    else if (player.deathBlast > 0) explode(e.x, e.y, 45 + 15 * player.deathBlast, player.power * 1.2 * player.deathBlast, true);
    if (def.boss) for (const q of enemies) if (q.summoner === e && !q.dead) { q.hp = 0; fxRing(q.x, q.y, q.r * 2, "255,220,160", 0.3); }
    if (def.boss) {
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
    const pink = color === "#ff6ad5", slug = color === "#ffb84a"; // slug: Gewehrkugel des Zombie-Schützen
    eBullets.push({ x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, color, life: 4, dead: false, pink, slug, rgb: pink ? "255,106,213" : slug ? "255,184,74" : "183,255,74" });
  }

  // Sonderprojektile: Kamelle (bunt, Fächer), Formular (bremst), Fußball (prallt von Wänden ab)
  function enemyShot(e, angle, speed, dmg, kind, r, rgb) {
    // steht der Werfer direkt an einem Hindernis, startet das Projektil aus der Körpermitte (sonst prallt der Ball im Hindernis hin und her)
    let x = e.x + Math.cos(angle) * e.r, y = e.y + Math.sin(angle) * e.r;
    if (obstacles.some((o) => pointInRect(x, y, o))) { x = e.x; y = e.y; }
    const b = { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, kind, rgb, life: kind === "ball" ? 5 : 4, dead: false, spin: rand(0, TAU), bounces: kind === "ball" ? 3 : 0 };
    eBullets.push(b);
    return b;
  }
  const KAMELLE = ["255,80,80", "255,210,60", "90,200,255", "140,255,120", "255,120,220"];

  // Unsichtbare Zustände nutzen spawnT als Sperre: nicht treffbar, nicht anvisierbar, nicht gezeichnet
  // Strahl bis zur ersten Wand oder zum ersten Hindernis (Laser-Visier)
  function rayEnd(x, y, a, max) {
    const c = Math.cos(a), s = Math.sin(a);
    for (let t = 8; t < max; t += 8) { const px = x + c * t, py = y + s * t; if (px < L || px > R || py < T || py > B || obstacles.some((o) => pointInRect(px, py, o))) return { x: px, y: py }; }
    return { x: x + c * max, y: y + s * max };
  }
  function burrow(e) {
    e.under = "burrow"; e.spawnT = e.spawnMax = 9; e.aiT = rand(2.2, 3.2);
    fxDebris(e.x, e.y, 0, Math.PI, 10, "#5a4a3a"); fxSmoke(e.x, e.y, 3, 0.8, 0.8);
    stamp(Sprites.crack(), e.x, e.y, rand(0, TAU), e.r / 14, 0.6);
    sfx("dig");
  }
  function phase(e) {
    e.under = "phantom"; e.spawnT = e.spawnMax = 9; e.aiT = rand(0.9, 1.4);
    for (let i = 0; i < 6; i++) fxGas(e.x + rand(-10, 10), e.y + rand(-10, 10), 0.9, "120,80,170", 0.9);
    fxFlash(e.x, e.y, 60, "190,140,255", 0.12);
    const a = rand(0, TAU), r = rand(95, 150);
    e.goalX = clamp(player.x + Math.cos(a) * r, L + 30, R - 30); e.goalY = clamp(player.y + Math.sin(a) * r, T + 30, B - 30);
    sfx("phase");
  }
  function updateUnder(e, dt) {
    const p = player;
    e.aiT -= dt;
    if (e.under === "burrow") {
      // Erdwelle wandert unter dem Boden auf den Helden zu
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, sp = 165 * (e.slowT > 0 ? 0.5 : 1);
      e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt;
      e.x = clamp(e.x, L + e.r, R - e.r); e.y = clamp(e.y, T + e.r, B - e.r);
      e.face = Math.atan2(dy, dx);
      if (Math.random() < 0.5) fxDebris(e.x + rand(-6, 6), e.y + rand(-6, 6), rand(0, TAU), Math.PI, 1, "#5a4a3a");
      if (Math.random() < 0.12) stamp(Sprites.crack(), e.x, e.y, rand(0, TAU), 0.4, 0.35);
      if (d < 26 || e.aiT <= 0) {
        // Ausbruch: Erde spritzt, wer drübersteht, wird erwischt
        e.under = null; e.spawnT = e.spawnMax = 0.3; e.aiT = rand(2.6, 3.6); e.mode = "walk";
        fxDebris(e.x, e.y, 0, Math.PI, 16, "#5a4a3a"); fxRing(e.x, e.y, 60, "200,170,120", 0.35); fxSmoke(e.x, e.y, 4, 1, 0.9);
        stamp(Sprites.crack(), e.x, e.y, rand(0, TAU), 1.2, 0.7);
        shake = Math.max(shake, 4); sfx("erupt");
        if (dist2(e, p) < 56 * 56) hurtPlayer(e.dmg * 1.3);
      }
    } else {
      // Schemen gleitet unsichtbar an seinen Zielpunkt, nur ein Nebelschleier verrät ihn
      e.x += (e.goalX - e.x) * Math.min(1, dt * 4); e.y += (e.goalY - e.y) * Math.min(1, dt * 4);
      if (Math.random() < 0.3) fxGas(e.x + rand(-8, 8), e.y + rand(-8, 8), 0.5, "90,60,130", 0.6);
      if (e.aiT <= 0) {
        e.under = null; e.spawnT = 0; e.glitchT = 0.35; e.aiT = rand(1.8, 2.6); e.cd = 0.3;
        e.face = Math.atan2(p.y - e.y, p.x - e.x);
        fxFlash(e.x, e.y, 80, "190,140,255", 0.18); fxRing(e.x, e.y, 46, "190,140,255", 0.3);
      }
    }
  }
  function updateParcels(dt) {
    for (const q of parcels) {
      q.t -= dt;
      if (q.t <= 0) { q.dead = true; explode(q.x, q.y, q.r, q.dmg, false); fxDebris(q.x, q.y, 0, Math.PI, 10, "#a07a4a"); }
    }
    if (parcels.length) parcels = parcels.filter((q) => !q.dead);
  }
  function updateLobs(dt) {
    for (const q of lobs) {
      q.t += dt; q.spin += dt * 8;
      const k = Math.min(1, q.t / q.T);
      q.x = q.x0 + (q.x1 - q.x0) * k; q.y = q.y0 + (q.y1 - q.y0) * k; q.z = 40 * (1 - k) + Math.sin(k * Math.PI) * 150;
      if (k >= 1 && q.kind === "gift") {
        // Krampus-Geschenk: explodiert beim Aufschlag in bunten Funken
        q.dead = true;
        explode(q.x, q.y, q.r, q.dmg, false);
        fxSparks(q.x, q.y, 0, Math.PI, 14, pick(["255,60,60", "255,210,60", "120,255,140"]), 320);
        continue;
      }
      if (k >= 1 && q.kind === "parcel") {
        // Paket landet und piept 1,4 s – dann knallt es
        q.dead = true;
        parcels.push({ x: q.x, y: q.y, t: 1.4, max: 1.4, r: q.r, dmg: q.dmg, spin: q.spin });
        fxDebris(q.x, q.y, 0, Math.PI, 5, "#a07a4a"); sfx("stamp");
        continue;
      }
      if (k >= 1 && q.kind === "krug") {
        // Maßkrug zerschellt: Scherben, Bierlache bremst den Helden
        q.dead = true;
        fxDebris(q.x, q.y, 0, Math.PI, 12, "#d8e6ea"); fxSparks(q.x, q.y, 0, Math.PI, 8, "250,220,120", 180);
        for (let i = 0; i < 4; i++) fxGas(q.x + rand(-20, 20), q.y + rand(-20, 20), 1, "250,236,190", 1);
        addHazard(q.x, q.y, 44, 4.5, 0, "bier");
        stamp(Sprites.splat("#b8862a", randi(0, 5)), q.x, q.y, rand(0, TAU), 0.9, 0.5);
        sfx("glass");
        if ((player.x - q.x) ** 2 + (player.y - q.y) ** 2 < (q.r + player.r * 0.5) ** 2) hurtPlayer(q.dmg);
        continue;
      }
      if (k >= 1) {
        q.dead = true;
        fxDebris(q.x, q.y, 0, Math.PI, 18, "#6f6a62"); fxSmoke(q.x, q.y, 4, 1.1, 0.9); fxRing(q.x, q.y, q.r, "220,200,170", 0.35);
        stamp(Sprites.crack(), q.x, q.y, rand(0, TAU), 1.4, 0.75);
        shake = Math.max(shake, 5); sfx("boom");
        if ((player.x - q.x) ** 2 + (player.y - q.y) ** 2 < (q.r + player.r * 0.5) ** 2) hurtPlayer(q.dmg);
        for (const o of obstacles) if (o.hp && circleRectOverlap({ x: q.x, y: q.y, r: q.r }, o)) hitObstacle(o, 60);
        blastBodies(q.x, q.y, q.r * 1.4);
      }
    }
    if (lobs.length) lobs = lobs.filter((q) => !q.dead);
  }


  // ============================================================
  // v2.1 Stadt-Bosse: jede Attacke = Ankündigung (e.tele, Warnfläche) → Ausführung → Erholung
  // ============================================================
  const BOSS_KIT = {
    goetz: ["fist", "rush", "bolts"],
    zugfuehrer: ["rush", "coal", "whistle"],
    krampus: ["whip", "gifts", "leap"],
    bierkoenig: ["barrels", "slam", "steins"],
    narrenkoenig: ["spiral", "confetti", "leap"],
    kapitaen: ["anchor", "harpoons", "horn"],
  };
  const BOSS_RAGE = {
    goetz: ["DIE EISERNE HAND!", "Götz ruft die Wengerter zu den Waffen", "wengerter", 2],
    zugfuehrer: ["VOLLDAMPF!", "Der Zugführer ruft die Schaffner", "schaffner", 2],
    krampus: ["DIE RUTE SAUST!", "Krampus ruft seine Zwerge", "zwerg", 4],
    bierkoenig: ["PROSIT!", "Der Bierkönig ruft zur Runde", "wiesn", 2],
    narrenkoenig: ["ALAAF!", "Der Narrenkönig ruft die Garde", "jeck", 3],
    kapitaen: ["STURMFLUT!", "Der Klabautermann ruft die Mannschaft", "ultra", 2],
  };
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  function summon(e, type, n) {
    const alive = enemies.filter((q) => !q.dead && q.summoner === e).length;
    for (let i = 0; i < Math.min(n, 8 - alive); i++) {
      const a = rand(0, TAU), q = spawnEnemy(type, e.x + Math.cos(a) * (e.r + 30), e.y + Math.sin(a) * (e.r + 30));
      q.spawnT = q.spawnMax = 0.5; q.summoner = e;
    }
  }
  function bossStart(e, p) {
    const kit = BOSS_KIT[e.type];
    e.atkI = ((e.atkI ?? randi(0, kit.length - 1)) + 1) % kit.length;
    const atk = (e.atk = kit[e.atkI]), aim = Math.atan2(p.y - e.y, p.x - e.x), ph2 = e.phase2;
    e.mode = "tele"; e.pose = ""; e.track = 0;
    switch (atk) {
      case "rush": e.tele = { k: "lane", ang: aim, len: 900, w: e.r * 2.1, max: ph2 && e.rush2 ? 0.55 : 0.95 }; e.track = 0.55; sfx(e.type === "zugfuehrer" ? "whistle" : "throw"); break;
      case "fist": e.tele = { k: "cone", ang: aim, r: 205, arc: 1.5, max: 0.8 }; e.track = 0.4; e.pose = "lift"; break;
      case "whistle": case "horn": e.tele = { k: "circle", x: e.x, y: e.y, r: atk === "horn" ? 250 : 270, max: 0.9, follow: true, rgb: "255,226,110" }; e.pose = "whistle"; break;
      case "whip": e.tele = { k: "cone", ang: aim, r: 230, arc: 2.1, max: 0.7 }; e.track = 0.35; break;
      case "slam": e.tele = { k: "circle", x: e.x, y: e.y, r: 165, max: 0.95, follow: true }; e.pose = "lift"; break;
      case "confetti": e.tele = { k: "cone", ang: aim, r: 320, arc: 0.95, max: 0.7, rgb: "255,120,220" }; e.track = 0.4; break;
      case "anchor": e.tele = { k: "lane", ang: aim, len: 560, w: 30, max: 0.75 }; e.track = 0.45; e.pose = "lift"; break;
      case "leap": {
        const tx = clamp(p.x + rand(-40, 40), L + e.r, R - e.r), ty = clamp(p.y + rand(-40, 40), T + e.r, B - e.r);
        e.tele = { k: "circle", x: tx, y: ty, r: atk === "leap" && e.type === "krampus" ? 115 : 95, max: 0.8 }; e.pose = "crouch"; break;
      }
      case "spiral": e.tele = { k: "circle", x: e.x, y: e.y, r: 70, max: 0.4, follow: true, rgb: "255,120,220" }; break;
      default: e.tele = null; e.pose = "lift"; e.teleT = 0.45; // Würfe: der Zielkreis der Lobs ist die Warnung
    }
    e.aiT = e.tele ? e.tele.max : e.teleT;
    if (e.tele) e.tele.t = e.aiT;
  }
  function bossFire(e, p) {
    const ph2 = e.phase2, aim = e.tele && e.tele.ang != null ? e.tele.ang : Math.atan2(p.y - e.y, p.x - e.x);
    const toP = Math.atan2(p.y - e.y, p.x - e.x), dP = Math.sqrt(dist2(e, p));
    const done = (t) => { e.mode = "walk"; e.tele = null; e.pose = ""; e.aiT = t * (ph2 ? 0.7 : 1); };
    const lobAt = (kind, x, y, r, T2) => lobs.push({ kind, x0: e.x, y0: e.y, x1: clamp(x, L + 20, R - 20), y1: clamp(y, T + 20, B - 20), t: 0, T: T2, r, dmg: e.dmg, x: e.x, y: e.y, z: 60, spin: rand(0, TAU) });
    switch (e.atk) {
      case "rush":
        e.mode = "charge"; e.rush = true; e.dirX = Math.cos(aim); e.dirY = Math.sin(aim); e.aiT = 2.2; e.tele = null;
        sfx("throw"); shake = Math.max(shake, 4); return;
      case "coal": {
        const n = ph2 ? 5 : 3;
        for (let i = 0; i < n; i++) lobAt("coal", p.x + (i ? rand(-90, 90) : 0), p.y + (i ? rand(-90, 90) : 0), 42, 0.95 + i * 0.08);
        sfx("throw"); return done(rand(1.4, 2));
      }
      case "whistle": case "horn": {
        const R0 = e.tele.r;
        fxRing(e.x, e.y, R0, e.atk === "horn" ? "200,220,230" : "255,236,140", 0.55); fxFlash(e.x, e.y, 140, "255,236,160", 0.15);
        if (e.atk === "horn") { for (let i = 0; i < 14; i++) fxGas(e.x + rand(-R0, R0) * 0.6, e.y + rand(-R0, R0) * 0.6, 2, "170,180,190", 1.6); shake = Math.max(shake, 8); }
        if (dP < R0 + p.r) {
          hurtPlayer(e.dmg * 0.6);
          if (e.atk === "horn") { p.kvx = (p.kvx || 0) + Math.cos(toP) * 620; p.kvy = (p.kvy || 0) + Math.sin(toP) * 620; debuff("slowT", 1.6, "AUSGEBREMST"); }
          else debuff("jamT", 3.6, "VERSPÄTUNG");
        }
        sfx("whistle"); if (e.atk === "horn") sfx("boom");
        return done(rand(1.6, 2.2));
      }
      case "fist": {
        // Götz: Schlag mit der eisernen Faust – der Boden reißt im ganzen Kegel auf
        for (let i = 0; i <= 6; i++) { const a = aim - e.tele.arc / 2 + (e.tele.arc * i) / 6, rr = e.tele.r * rand(0.5, 0.95); stamp(Sprites.crack(), e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, rand(0, TAU), 1.1, 0.7); fxDebris(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, a, 0.8, 3, "#5a4a3a"); }
        fxSparks(e.x + Math.cos(aim) * e.r, e.y + Math.sin(aim) * e.r, aim, 0.8, 12, "255,220,170", 300);
        if (dP < e.tele.r + p.r && Math.abs(angDiff(aim, toP)) < e.tele.arc / 2 + 0.12) { hurtPlayer(e.dmg * 1.5); p.kvx = (p.kvx || 0) + Math.cos(toP) * 560; p.kvy = (p.kvy || 0) + Math.sin(toP) * 560; }
        shake = Math.max(shake, 10); hitStop = Math.max(hitStop, 0.06); sfx("boom"); fx4d("boom");
        return done(rand(1.2, 1.7));
      }
      case "bolts": {
        // Armbrust-Salve im Fächer
        const n = ph2 ? 9 : 7;
        for (let i = 0; i < n; i++) enemyShot(e, toP + (i - (n - 1) / 2) * 0.14, 560, e.dmg * 0.6, "harpoon", 5, "200,170,120");
        sfx("eshot"); return done(rand(1.2, 1.7));
      }
      case "whip": {
        // Kettenpeitsche: Funkenbogen über die ganze Warnfläche
        for (let i = 0; i <= 10; i++) { const a = aim - e.tele.arc / 2 + (e.tele.arc * i) / 10, rr = e.tele.r * rand(0.6, 1); fxSparks(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, a, 0.5, 2, "255,200,140", 220); }
        if (dP < e.tele.r + p.r && Math.abs(angDiff(aim, toP)) < e.tele.arc / 2 + 0.15) { hurtPlayer(e.dmg * 1.2); p.kvx = (p.kvx || 0) + Math.cos(toP) * 420; p.kvy = (p.kvy || 0) + Math.sin(toP) * 420; }
        shake = Math.max(shake, 5); sfx("zap");
        return done(rand(1.1, 1.6));
      }
      case "gifts": {
        const n = ph2 ? 5 : 3;
        for (let i = 0; i < n; i++) lobAt("gift", p.x + (i ? rand(-110, 110) : 0), p.y + (i ? rand(-110, 110) : 0), 58, 1 + i * 0.1);
        sfx("throw"); return done(rand(1.4, 2));
      }
      case "leap":
        e.mode = "leap2"; e.jx0 = e.x; e.jy0 = e.y; e.jx1 = e.tele.x; e.jy1 = e.tele.y; e.jt = 0; e.jT = 0.55; e.pose = "";
        sfx("throw"); return;
      case "barrels": {
        const n = ph2 ? 5 : 3;
        for (let i = 0; i < n; i++) enemyShot(e, toP + (i - (n - 1) / 2) * 0.28, 230, e.dmg, "barrel", 16, "150,100,50");
        sfx("throw"); return done(rand(1.5, 2.1));
      }
      case "slam": {
        const R0 = e.tele.r;
        fxRing(e.x, e.y, R0, "255,220,140", 0.6); fxRing(e.x, e.y, R0 * 0.6, "250,236,190", 0.45);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; fxGas(e.x + Math.cos(a) * R0 * 0.7, e.y + Math.sin(a) * R0 * 0.7, 1.4, "250,236,190", 1.2); }
        fxDebris(e.x, e.y, 0, Math.PI, 18, "#5a4a3a"); shake = Math.max(shake, 12); sfx("boom"); fx4d("boom");
        if (dP < R0 + p.r) { hurtPlayer(e.dmg * 1.3); p.kvx = (p.kvx || 0) + Math.cos(toP) * 560; p.kvy = (p.kvy || 0) + Math.sin(toP) * 560; }
        addHazard(e.x, e.y, R0 * 0.55, 3.5, 0, "bier");
        return done(rand(1.5, 2));
      }
      case "steins": {
        const n = ph2 ? 6 : 4;
        for (let i = 0; i < n; i++) lobAt("krug", p.x + (i ? rand(-120, 120) : 0), p.y + (i ? rand(-120, 120) : 0), 40, 0.8 + i * 0.12);
        sfx("throw"); return done(rand(1.3, 1.9));
      }
      case "spiral":
        e.mode = "spin"; e.spinT = ph2 ? 2.6 : 2; e.spinA = toP; e.spinCd = 0; e.tele = null; sfx("troete"); return;
      case "confetti": {
        for (let i = 0; i < 16; i++) enemyShot(e, aim + rand(-e.tele.arc / 2, e.tele.arc / 2), rand(230, 400), e.dmg * 0.5, "candy", 6, pick(KAMELLE));
        for (let i = 0; i < 20; i++) fxSparks(e.x + Math.cos(aim) * e.r, e.y + Math.sin(aim) * e.r, aim, 0.7, 1, pick(KAMELLE), rand(200, 420));
        shake = Math.max(shake, 5); sfx("boom");
        return done(rand(1.2, 1.7));
      }
      case "anchor": {
        enemyShot(e, aim, 640, e.dmg * 1.1, "anchor", 16, "180,190,200").owner = e;
        if (ph2) for (const s2 of [-1, 1]) enemyShot(e, aim + s2 * 0.45, 600, e.dmg, "anchor", 14, "180,190,200").owner = e;
        sfx("throw"); return done(rand(1.6, 2.2));
      }
      case "harpoons": {
        const n = ph2 ? 7 : 5;
        for (let i = 0; i < n; i++) enemyShot(e, toP + (i - (n - 1) / 2) * 0.17, 520, e.dmg * 0.7, "harpoon", 5, "220,225,235");
        sfx("eshot"); return done(rand(1.2, 1.7));
      }
    }
    done(1.5);
  }
  function bossImpact(e) {
    // Zugführer prallt gegen Wand/Hindernis: Erdstoß, kurz benommen
    e.rush = false;
    fxRing(e.x, e.y, 120, "255,200,140", 0.5); fxDebris(e.x, e.y, 0, Math.PI, 22, "#5a4a3a"); fxSmoke(e.x, e.y, 6, 1.8, 1.2);
    shake = Math.max(shake, 12); sfx("boom"); fx4d("boom");
    if (dist2(e, player) < 130 * 130) hurtPlayer(e.dmg * 0.8);
    if (e.phase2 && !e.rush2) { e.rush2 = true; e.atkI = BOSS_KIT[e.type].indexOf("rush") - 1; e.mode = "walk"; e.aiT = 0.25; }
    else { e.rush2 = false; e.mode = "walk"; e.aiT = rand(1.4, 2); }
  }
  function bossAI(e, dt, p, dx, dy, d, slow) {
    let mx = dx / d, my = dy / d, sp = e.speed * slow * (e.phase2 ? 1.2 : 1);
    if (!e.phase2 && e.hp < e.maxHp * ((run.threat || 0) >= 5 ? 0.7 : 0.5)) {
      e.phase2 = true;
      const [title, sub, minion, n] = BOSS_RAGE[e.type];
      showBanner(tr(title), tr(sub), 1.4); summon(e, minion, n);
      fxRing(e.x, e.y, 160, "255,80,60", 0.5); shake = Math.max(shake, 8); sfx("rage");
    }
    // v2.8 dritte Phase unter 25 %: schneller, häufigere Attacken, roter Puls
    if (e.phase2 && !e.phase3 && e.hp < e.maxHp * 0.25) {
      e.phase3 = true; e.speed *= 1.25; e.rageT = 999;
      showBanner(tr("LETZTE PHASE"), tr("{b} wird rasend", { b: e.def.name }), 1.3);
      fxRing(e.x, e.y, 200, "255,40,40", 0.6); shake = Math.max(shake, 10); sfx("rage");
    }
    // Trümmer regnen in Phase 2 und 3 – rote Kreise zeigen, wo
    if (e.phase2 && (e.hzT = (e.hzT ?? 3) - dt) <= 0) {
      e.hzT = e.phase3 ? 3.5 : 5.5;
      for (let i = 0; i < (e.phase3 ? 3 : 2); i++) { const a = rand(0, TAU), dd = rand(50, 170); fuses.push({ x: clamp(p.x + Math.cos(a) * dd, L + 40, R - 40), y: clamp(p.y + Math.sin(a) * dd, T + 40, B - 40), r: 56, t: 1.15, max: 1.15, dmg: e.dmg * 0.5 }); }
      addText(p.x, p.y - 62, tr("TRÜMMER!"), "#ffb733", 15);
    }
    e.aiT -= dt;
    if (e.phase3) e.aiT -= dt * 0.5;
    switch (e.mode) {
      case "tele": {
        // Zielen folgt dem Helden bis kurz vor dem Angriff, dann ist die Richtung fest (Zeit zum Ausweichen)
        if (e.tele) {
          if (e.tele.follow) { e.tele.x = e.x; e.tele.y = e.y; }
          if (e.tele.ang != null && e.aiT > e.tele.max - e.track) e.tele.ang = Math.atan2(p.y - e.y, p.x - e.x);
          e.tele.t = e.aiT;
        }
        if (e.aiT <= 0) bossFire(e, p);
        return [0, 0, 0];
      }
      case "charge": {
        // Lok-Ansturm: schnurgerade bis zur Wand, Dampf hinterher
        if (Math.random() < 0.6) fxGas(e.x - e.dirX * e.r, e.y - e.dirY * e.r, 1.3, "220,225,230", 0.9);
        if (Math.random() < 0.4) fxDebris(e.x - e.dirX * e.r, e.y - e.dirY * e.r, Math.atan2(-e.dirY, -e.dirX), 0.6, 1, "#5a4a3a");
        if (dist2(e, p) < (e.r + p.r + 4) ** 2 && !(p.invuln > 0)) { hurtPlayer(e.dmg * 1.4); p.kvx = (p.kvx || 0) + e.dirX * 700 - e.dirY * 300; p.kvy = (p.kvy || 0) + e.dirY * 700 + e.dirX * 300; }
        const atWall = e.x <= L + e.r + 1 || e.x >= R - e.r - 1 || e.y <= T + e.r + 1 || e.y >= B - e.r - 1;
        if (atWall || e.aiT <= 0) { bossImpact(e); return [0, 0, 0]; }
        return [e.dirX, e.dirY, 700 * slow];
      }
      case "leap2": {
        // Sprung auf den Warnkreis, Landung mit Erdstoß
        e.jt += dt; const k = Math.min(1, e.jt / e.jT);
        e.x = e.jx0 + (e.jx1 - e.jx0) * k; e.y = e.jy0 + (e.jy1 - e.jy0) * k; e.jumpZ = Math.sin(k * Math.PI) * 140;
        if (e.type === "narrenkoenig" && Math.random() < 0.7) fxSparks(e.x, e.y, rand(0, TAU), Math.PI, 1, pick(KAMELLE), 120);
        if (k >= 1) {
          e.jumpZ = 0; const R0 = e.tele ? e.tele.r : 100;
          fxRing(e.x, e.y, R0, "255,200,140", 0.55); fxDebris(e.x, e.y, 0, Math.PI, 16, "#5a4a3a"); stamp(Sprites.crack(), e.x, e.y, rand(0, TAU), 2, 0.8);
          shake = Math.max(shake, 10); sfx("erupt");
          if (dist2(e, p) < (R0 + p.r) ** 2) { hurtPlayer(e.dmg * 1.2); const a = Math.atan2(p.y - e.y, p.x - e.x); p.kvx = (p.kvx || 0) + Math.cos(a) * 480; p.kvy = (p.kvy || 0) + Math.sin(a) * 480; }
          if (e.type === "krampus" && e.phase2) summon(e, "zwerg", 3);
          if (e.type === "narrenkoenig") for (let i = 0; i < 10; i++) enemyShot(e, (i / 10) * TAU, 210, e.dmg * 0.45, "candy", 5, pick(KAMELLE));
          e.mode = "walk"; e.tele = null; e.aiT = rand(1.2, 1.8) * (e.phase2 ? 0.7 : 1);
        }
        return [0, 0, 0];
      }
      case "spin": {
        // Kamelle-Spirale: dreht sich und streut Bonbons im Kreis
        e.spinT -= dt; e.spinCd -= dt; e.spinA += dt * 4.2; e.face = e.spinA;
        if (e.spinCd <= 0) {
          e.spinCd = 0.075;
          const arms = e.phase2 ? 3 : 2;
          for (let i = 0; i < arms; i++) enemyShot(e, e.spinA + (i / arms) * TAU, 210, e.dmg * 0.45, "candy", 5, pick(KAMELLE));
        }
        if (e.spinT <= 0) { e.mode = "walk"; e.aiT = rand(1.3, 1.8) * (e.phase2 ? 0.7 : 1); }
        return [mx * 0.3, my * 0.3, sp * 0.4];
      }
      default: {
        // gehen: auf mittlere Distanz bleiben, dann nächste Attacke
        if (e.aiT <= 0) { bossStart(e, p); return [0, 0, 0]; }
        if (d < 120) sp *= 0.6;
        return [mx, my, sp];
      }
    }
  }

  function updateEnemies(dt) {
    const p = player;
    if (beams.length) beams = beams.filter((b) => (b.life -= dt) > 0);
    for (const e of enemies) {
      if (e.dead) continue;
      e.hitT = Math.max(0, e.hitT - dt);
      e.bladeCd = Math.max(0, e.bladeCd - dt);
      e.wob += dt * 6;
      if (e.under) { updateUnder(e, dt); continue; }
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }
      if (e.shieldT > 0 && (e.shieldT -= dt) <= 0) e.shield = 0;
      if (e.glitchT > 0) e.glitchT -= dt;
      if (e.aff) updateAffixes(e, dt);

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

      // v2.9 betäubt (Blendgranate, Taser, EMP) oder eingefroren: steht still und greift nicht an
      if (e.frostT > 0) e.frostT -= dt;
      if (e.stunT > 0) {
        e.stunT -= dt;
        if (Math.random() < 0.07) fxSparks(e.x + rand(-e.r, e.r) * 0.5, e.y - e.r * 0.6, -Math.PI / 2, 1.2, 1, e.frostT > 0 ? "170,230,255" : "255,236,140", 70);
        collideWorld(e);
        continue;
      }
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx = dx / d, my = dy / d;
      // v2.4: Witterung – solange der Held weit weg ist, gehen Jäger auf die Überlebenden los
      if (e.prey) {
        if (e.prey.state !== "wait") e.prey = null;
        else if (d > 150) { const qx = e.prey.x - e.x, qy = e.prey.y - e.y, qd = Math.hypot(qx, qy) || 1; if (qd > e.r + 12) { mx = qx / qd; my = qy / qd; } else { mx = 0; my = 0; } }
      }
      let sp = e.speed * slow * stagger;
      if (e.rageT > 0) { e.rageT -= dt; sp *= 1.55; }
      // v3.7 Plünderer: flieht mit dem Münzsack vor dem Helden, verliert dabei Münzen und haut nach LOOTER_T Sekunden ab
      if (e.looter) {
        if ((e.lootT -= dt) <= 0) { looterEscape(e); continue; }
        mx = -mx; my = -my;
        const wx = e.x - L < 90 ? 1 : R - e.x < 90 ? -1 : 0, wy = e.y - T < 90 ? 1 : B - e.y < 90 ? -1 : 0;
        if (wx || wy) { const tx = -my * e.side, ty = mx * e.side; mx = mx * 0.3 + wx * 1.2 + tx; my = my * 0.3 + wy * 1.2 + ty; const n = Math.hypot(mx, my) || 1; mx /= n; my /= n; }
        sp *= d < 280 ? 1.3 : 0.75;
        if (e.lootDrops > 0 && Math.random() < dt * 2.2) { e.lootDrops--; orbs.push(makeOrb(e.x, e.y, "coin", 1)); }
        if (Math.random() < dt * 10) fxSparks(e.x, e.y - 6, -Math.PI / 2, 1.5, 1, "255,220,110", 90);
      }

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
        case "healer": {
          // hält Abstand und heilt verletzte Zombies mit einem grünen Strahl
          if (d < 210) { mx = -mx; my = -my; } else if (d < 330) { const t = mx; mx = -my * e.side; my = t * e.side; sp *= 0.5; }
          e.cd -= dt;
          if (e.mode === "heal") {
            sp = 0; e.aiT -= dt;
            const q = e.target;
            if (!q || q.dead || q.under) e.mode = "walk";
            else {
              beams.push({ x1: e.x, y1: e.y, x2: q.x, y2: q.y, rgb: "120,255,140", w: 5, life: 0.001, max: 0.001, h: 28 });
              q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.42 * dt);
              if (Math.random() < 0.4) fxGas(q.x + rand(-8, 8), q.y + rand(-8, 8), 0.5, "120,255,140", 0.6);
              if (e.aiT <= 0) e.mode = "walk";
            }
          } else if (e.cd <= 0) {
            let best = null, worst = 0.9;
            for (const q of enemies) if (q !== e && !q.dead && !q.under && q.spawnT <= 0 && q.hp / q.maxHp < worst && dist2(q, e) < 280 * 280) { worst = q.hp / q.maxHp; best = q; }
            e.cd = best ? rand(2.8, 3.6) : 0.6;
            if (best) { e.mode = "heal"; e.aiT = 1.1; e.target = best; fxRing(e.x, e.y, 40, "120,255,140", 0.3); sfx("heal"); }
          }
          break;
        }
        case "thrower": {
          // hebt einen Betonbrocken und wirft ihn im Bogen auf den Helden (roter Zielkreis warnt)
          e.cd -= dt;
          if (e.mode === "lift") {
            sp = 0; e.aiT -= dt;
            if (e.aiT <= 0) {
              e.mode = "walk"; e.cd = rand(3, 4.2);
              const lead = 0.5, tx = clamp(p.x + (p.vx || 0) * lead + rand(-20, 20), L + 20, R - 20), ty = clamp(p.y + (p.vy || 0) * lead + rand(-20, 20), T + 20, B - 20);
              lobs.push({ x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, T: 0.95, r: 48, dmg: e.dmg, x: e.x, y: e.y, z: 40, spin: rand(0, TAU) });
              sfx("throw");
            }
          } else if (d > 150 && d < 470 && e.cd <= 0) { e.mode = "lift"; e.aiT = 0.6; }
          if (d < 150) sp *= 1.3; // auf kurze Distanz schlägt er zu
          break;
        }
        case "burrower": {
          // läuft kurz oben, gräbt sich dann ein und taucht unter dem Helden wieder auf
          e.aiT -= dt;
          if (e.aiT <= 0 && d > 90) burrow(e);
          break;
        }
        case "phantom": {
          // sichtbar nur kurz: Sprungangriff, dann löst er sich auf und erscheint woanders
          e.aiT -= dt; e.cd -= dt;
          if (e.mode === "lunge") { mx = e.dirX; my = e.dirY; sp = 330 * slow; if ((e.lungeT -= dt) <= 0) e.mode = "walk"; }
          else if (d < 150 && e.cd <= 0) { e.mode = "lunge"; e.lungeT = 0.3; e.dirX = mx; e.dirY = my; e.cd = rand(1.4, 2); }
          if (Math.random() < 0.25) fxGas(e.x + rand(-6, 6), e.y + rand(-6, 6), 0.45, "120,80,170", 0.7);
          if (e.aiT <= 0) phase(e);
          break;
        }
        case "warden": {
          // Schildwächter: hält Abstand, versorgt Verbündete im Umkreis mit Energieschilden
          if (d < 200) { mx = -mx; my = -my; } else if (d < 320) { const t = mx; mx = -my * e.side; my = t * e.side; sp *= 0.5; }
          e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = rand(4.2, 5.2);
            let n = 0;
            for (const q of enemies) {
              if (q === e || q.dead || q.under || q.spawnT > 0 || q.def.boss || dist2(q, e) > 230 * 230) continue;
              q.shield = Math.max(q.shield, q.maxHp * 0.4); q.shieldT = 6; n++;
              beams.push({ x1: e.x, y1: e.y, x2: q.x, y2: q.y, rgb: "140,210,255", w: 4, life: 0.35, max: 0.35, h: 30 });
            }
            fxRing(e.x, e.y, 230, "140,210,255", 0.5); fxFlash(e.x, e.y, 70, "140,210,255", 0.15);
            if (n) sfx("shield");
          }
          break;
        }
        case "bloater": {
          // träge Giftblase: hinterlässt Dunst, platzt beim Tod zu einer Gaswolke
          if (Math.random() < 0.18) fxGas(e.x + rand(-e.r, e.r) * 0.6, e.y + rand(-e.r, e.r) * 0.6, 0.6, "150,200,60", 1);
          break;
        }
        case "nest": {
          // Brutnest: pulsiert und spuckt Ratten und Kriecher, bis es zerstört ist
          sp = 0; e.cd -= dt; e.anim += dt * 3;
          if (e.cd <= 0) {
            e.cd = rand(3.6, 4.6);
            const brood = enemies.filter((q) => !q.dead && q.brood === e).length;
            if (brood < 8) {
              const kind = Math.random() < 0.6 ? "rat" : "crawler", n = kind === "rat" ? 3 : 2;
              for (let i = 0; i < n; i++) { const a = rand(0, TAU), q = spawnEnemy(kind, e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6)); q.spawnT = 0.2; q.brood = e; q.kvx = Math.cos(a) * 160; q.kvy = Math.sin(a) * 160; }
              fxBlood(e.x, e.y, rand(0, TAU), 8, e.def.blood, 160); fxGas(e.x, e.y, 1, "170,90,170", 1); sfx("splat");
            }
          }
          break;
        }
        case "gunner": {
          // Zombie-Schütze: roter Laser markiert das Ziel, dann ein Feuerstoß – seitlich ausweichen!
          if (d < 200) { mx = -mx; my = -my; sp *= 0.7; } else if (d < 380) { const t = mx; mx = -my * e.side; my = t * e.side; sp *= 0.45; }
          e.cd -= dt;
          if (e.mode === "aim") {
            sp = 0; e.aiT -= dt;
            if (e.aiT > 0.25) e.aimAng = Math.atan2(dy, dx); // zuletzt eingefroren: Zeit zum Ausweichen
            const end = rayEnd(e.x, e.y, e.aimAng, 900);
            beams.push({ x1: e.x + Math.cos(e.aimAng) * e.r, y1: e.y + Math.sin(e.aimAng) * e.r, x2: end.x, y2: end.y, rgb: "255,40,30", w: e.aiT < 0.25 ? 2.6 : 1.4, life: 0.001, max: 0.001, h: 24 });
            if (e.aiT <= 0) { e.mode = "burst"; e.burstN = 3; e.burstT = 0; }
          } else if (e.mode === "burst") {
            sp = 0; e.burstT -= dt;
            if (e.burstT <= 0) {
              e.burstT = 0.09;
              enemyShoot(e, e.aimAng + rand(-0.04, 0.04), 600, e.dmg, "#ffb84a", 5);
              fxFlash(e.x + Math.cos(e.aimAng) * e.r * 1.6, e.y + Math.sin(e.aimAng) * e.r * 1.6, 30, "255,200,120", 0.06);
              sfx("eshot");
              if (--e.burstN <= 0) { e.mode = "walk"; e.cd = rand(2.6, 3.6); }
            }
          } else if (d < 520 && e.cd <= 0) { e.mode = "aim"; e.aiT = 0.9; e.aimAng = Math.atan2(dy, dx); }
          break;
        }
        case "wiesn": {
          // Wiesn-Zombie: stemmt einen Maßkrug und wirft ihn im Bogen – die Bierlache bremst
          e.cd -= dt;
          if (e.mode === "lift") {
            sp = 0; e.aiT -= dt;
            if (e.aiT <= 0) {
              e.mode = "walk"; e.cd = rand(2.6, 3.6);
              const tx = clamp(p.x + (p.vx || 0) * 0.4 + rand(-24, 24), L + 20, R - 20), ty = clamp(p.y + (p.vy || 0) * 0.4 + rand(-24, 24), T + 20, B - 20);
              lobs.push({ kind: "krug", x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, T: 0.8, r: 40, dmg: e.dmg, x: e.x, y: e.y, z: 40, spin: rand(0, TAU) });
              sfx("throw");
            }
          } else if (d > 120 && d < 420 && e.cd <= 0) { e.mode = "lift"; e.aiT = 0.45; }
          if (d > 120 && d < 240) sp *= 0.55;
          break;
        }
        case "jeck": {
          // Jeck: tanzt im Zickzack und wirft Kamelle im Fächer
          if (d < 160) { mx = -mx; my = -my; } else if (d < 300) { const t2 = mx; mx = -my * e.side; my = t2 * e.side; sp *= 0.75; }
          e.aiT -= dt; if (e.aiT <= 0) { e.side = -e.side; e.aiT = rand(0.6, 1.2); }
          e.cd -= dt;
          if (e.cd <= 0 && d < 430) {
            e.cd = rand(2.2, 3);
            const base = Math.atan2(dy, dx);
            for (let i = 0; i < 5; i++) enemyShot(e, base + (i - 2) * 0.21, 220 + rand(-25, 25), e.dmg * 0.6, "candy", 5, pick(KAMELLE));
            sfx("troete");
          }
          if (Math.random() < 0.08) fxSparks(e.x, e.y - 6, -Math.PI / 2, 1.2, 1, pick(KAMELLE), 90);
          break;
        }
        case "schaffner": {
          // Schaffner: pfeift ab – wer im Kreis steht, hat „Verspätung" (halbe Feuerrate), Fahrgäste werden rasend
          e.cd -= dt;
          if (e.mode === "whistle") {
            sp = 0; e.aiT -= dt;
            if (e.aiT <= 0) {
              e.mode = "walk"; e.cd = rand(4, 5.2);
              fxRing(e.x, e.y, 200, "255,236,140", 0.5); fxRing(e.x, e.y, 120, "255,255,255", 0.35); fxFlash(e.x, e.y, 90, "255,236,160", 0.12);
              if (d < 200 + p.r) { debuff("jamT", 3.2, "VERSPÄTUNG"); hurtPlayer(e.dmg * 0.5); }
              for (const q of enemies) if (q !== e && !q.def.boss && !q.under && dist2(q, e) < 200 * 200) q.rageT = Math.max(q.rageT, 1.6);
              sfx("whistle");
            }
          } else if (d < 220 && e.cd <= 0) { e.mode = "whistle"; e.aiT = 0.75; }
          break;
        }
        case "beamter": {
          // Beamter: hält Abstand und wirft Formulare – ein Treffer bremst („Ausgebremst")
          if (d < 220) { mx = -mx; my = -my; } else if (d < 340) { const t2 = mx; mx = -my * e.side; my = t2 * e.side; sp *= 0.5; }
          e.cd -= dt;
          if (e.cd <= 0 && d < 480) {
            e.cd = rand(2.4, 3.2);
            const base = Math.atan2(dy, dx);
            for (let i = -1; i <= 1; i++) enemyShot(e, base + i * 0.16, 215, e.dmg, "paper", 7, "240,236,220");
            sfx("paper");
          }
          break;
        }
        case "zwerg": {
          // Gartenzwerge hüpfen im Rudel
          e.jumpZ = Math.abs(Math.sin(e.wob * 1.7)) * 7;
          break;
        }
        case "ultra": {
          // Ultra: kickt einen Fußball (prallt von Wänden ab) und zündet Bengalos
          if (d < 150) { /* drauf */ } else if (d < 330) { const t2 = mx; mx = mx * 0.5 - my * e.side * 0.8; my = my * 0.5 + t2 * e.side * 0.8; }
          e.cd -= dt;
          if (Math.random() < 0.35) { const a = e.face - Math.PI / 2; fxGas(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, 0.7, "210,40,40", 1.3); }
          if (Math.random() < 0.2) { const a = e.face - Math.PI / 2; fxFire(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, 0.4, 0.25); }
          if (e.cd <= 0 && d < 470) {
            e.cd = rand(2.3, 3.1);
            enemyShot(e, Math.atan2(dy, dx) + rand(-0.08, 0.08), 380, e.dmg, "ball", 7, "240,240,240");
            sfx("kick");
          }
          break;
        }
        case "wengerter": {
          // Wengerter: kündigt einen Sprühkegel an (Rückenspritze) – wer drinsteht, wird ausgebremst
          e.cd -= dt;
          if (e.mode === "tele") {
            sp = 0; e.aiT -= dt; if (e.aiT > 0.3) e.tele.ang = Math.atan2(dy, dx); e.tele.t = e.aiT;
            if (e.aiT <= 0) {
              const q = e.tele, toP = Math.atan2(dy, dx);
              for (let i = 0; i < 14; i++) { const a = q.ang + rand(-q.arc / 2, q.arc / 2), rr = rand(20, q.r); fxGas(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 0.9, "150,60,170", 1.1); }
              if (d < q.r + p.r && Math.abs(angDiff(q.ang, toP)) < q.arc / 2 + 0.1) { hurtPlayer(e.dmg); debuff("slowT", 1.6, "AUSGEBREMST"); }
              e.mode = "walk"; e.tele = null; e.cd = rand(2.6, 3.4); sfx("paper");
            }
          } else {
            if (d < 120) { mx = -mx; my = -my; sp *= 0.6; }
            if (e.cd <= 0 && d < 190) { e.mode = "tele"; e.tele = { k: "cone", ang: Math.atan2(dy, dx), r: 175, arc: 1.0, max: 0.65, t: 0.65, rgb: "170,60,200" }; e.aiT = 0.65; }
          }
          break;
        }
        case "goetz": case "zugfuehrer": case "krampus": case "bierkoenig": case "narrenkoenig": case "kapitaen": {
          [mx, my, sp] = bossAI(e, dt, p, dx, dy, d, slow);
          break;
        }
        case "scooter": {
          // E-Scooter: kreist, kündigt eine Linie an und rast sie entlang
          e.cd -= dt;
          if (e.mode === "tele") {
            sp = 0; e.aiT -= dt; if (e.aiT > 0.25) e.tele.ang = Math.atan2(dy, dx); e.tele.t = e.aiT;
            if (e.aiT <= 0) { e.mode = "charge"; e.dirX = Math.cos(e.tele.ang); e.dirY = Math.sin(e.tele.ang); e.aiT = 0.75; e.tele = null; sfx("zap"); }
          } else if (e.mode === "charge") {
            mx = e.dirX; my = e.dirY; sp = 560 * slow; e.aiT -= dt;
            if (Math.random() < 0.5) fxSparks(e.x - e.dirX * e.r, e.y - e.dirY * e.r, Math.atan2(-e.dirY, -e.dirX), 0.3, 1, "140,220,255", 160);
            if (e.aiT <= 0) { e.mode = "walk"; e.cd = rand(2.2, 3.2); }
          } else {
            if (d < 230) { const t2 = mx; mx = -my * e.side; my = t2 * e.side; } else sp *= 1.3;
            if (e.cd <= 0 && d < 430) { e.mode = "tele"; e.tele = { k: "lane", ang: Math.atan2(dy, dx), len: 440, w: e.r * 2, max: 0.6, t: 0.6 }; e.aiT = 0.6; }
          }
          break;
        }
        case "paketbote": {
          // Paketbote: wirft Pakete, die am Boden kurz piepen und dann explodieren
          if (d < 210) { mx = -mx; my = -my; } else if (d < 340) { const t2 = mx; mx = -my * e.side; my = t2 * e.side; sp *= 0.5; }
          e.cd -= dt;
          if (e.mode === "lift") {
            sp = 0; e.aiT -= dt;
            if (e.aiT <= 0) {
              e.mode = "walk"; e.cd = rand(2.8, 3.6);
              const tx = clamp(p.x + (p.vx || 0) * 0.5 + rand(-30, 30), L + 20, R - 20), ty = clamp(p.y + (p.vy || 0) * 0.5 + rand(-30, 30), T + 20, B - 20);
              lobs.push({ kind: "parcel", x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, T: 0.85, r: 66, dmg: e.dmg * 1.5, x: e.x, y: e.y, z: 40, spin: rand(0, TAU) });
              sfx("throw");
            }
          } else if (d > 140 && d < 460 && e.cd <= 0) { e.mode = "lift"; e.aiT = 0.45; }
          break;
        }
        case "rentner": {
          // Rentner: langsam, hält den Schirm nach vorn – Schüsse von vorn prallen ab, von der Seite flankieren!
          if (e.cd > 0) e.cd -= dt;
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

      // v3.3 Horde im Seitengang: geradewegs auf die Arena (bzw. die Barrikade) zu, nicht schräg an der Gangwand entlang
      if (e.horde && (e.x < L || e.x > R) && e.mode === "walk") { const gt = gates.find((g) => Math.abs(e.y - g.y) < g.h); mx = e.x < L ? 1 : -1; my = gt ? clamp((gt.y - e.y) * 0.03, -0.4, 0.4) : 0; }
      else if (run.gauntStages && e.mode === "walk" && !e.def.boss) {
        const way = gauntWay(e.y, p.y);
        if (way) { const wx = way.x - e.x, wy = way.y - e.y, wd = Math.hypot(wx, wy) || 1; mx = wx / wd; my = wy / wd; e.wp = null; }
      }
      // v2.9 Böller-Köder: Gehende Zombies laufen auf den knisternden Böller zu
      if ((decoys.length || lures.length) && !e.def.boss && !e.looter && e.mode === "walk") {
        const q = nearestDecoy(e);
        if (q) { const qx = q.x - e.x, qy = q.y - e.y, qd = Math.hypot(qx, qy) || 1; if (qd > e.r + 8) { mx = qx / qd; my = qy / qd; } else { mx = 0; my = 0; } }
      }
      // v3.7 Evolution: Fressen an Leichen (→ Mutation), Sprungangriff (Mutant/Alpha), Brüllen und Heilen (Alpha)
      if (e.evo || EVO_FEEDERS.has(e.type)) {
        if (e.pose === "feed" || e.pose === "crouch" || e.pose === "air") e.pose = ""; // Posen fürs 3D-Modell, jedes Bild neu
        if (e.roarFx > 0) e.roarFx -= dt;
        if (e.feed) {
          const c = e.feed.c, fx = c.x - e.x, fy = c.y - e.y, fd = Math.hypot(fx, fy) || 1;
          if (d < 210 || e.hitT > 0 || c.gone || e.mode !== "walk" || !corpses.includes(c)) { c.feeder = null; e.feed = null; }
          else {
            mx = fx / fd; my = fy / fd;
            if (fd < e.r + 8) {
              sp = 0; e.feed.t += dt; e.pose = "feed";
              if (Math.random() < dt * 7) fxBlood(c.x, c.y, rand(0, TAU), 2, c.blood || RED, 80);
              if (Math.random() < dt * 2) stampDot(c.x + rand(-8, 8), c.y + rand(-8, 8), rand(1, 2), c.blood || RED);
              if (e.feed.t >= EVO_FEED_T) { c.eaten = true; c.feeder = null; e.feed = null; mutate(e, (e.evo || 0) + 1, "feed"); }
            }
          }
        } else if (EVO_FEEDERS.has(e.type) && (e.evo || 0) < (e.elite ? 2 : 3) && d > 320 && e.mode === "walk" && !e.looter && !e.horde && (e.feedScan = (e.feedScan ?? rand(0, 0.7)) - dt) <= 0) {
          e.feedScan = 0.7;
          for (const c of corpses) if (!c.eaten && !c.feeder && !c.gone && !c.boss && c.t > 1 && (c.x - e.x) ** 2 + (c.y - e.y) ** 2 < 110 * 110) { c.feeder = e; e.feed = { c, t: 0 }; break; }
        }
        if (e.evo >= 2 && !e.feed) {
          if (e.evoCrouch > 0) {
            e.evoCrouch -= dt; sp = 0; mx = Math.cos(e.leapAng); my = Math.sin(e.leapAng); e.pose = "crouch";
            if (e.evoCrouch <= 0) { const f = e.evo === 3 ? 600 : 540; e.kvx += Math.cos(e.leapAng) * f; e.kvy += Math.sin(e.leapAng) * f; e.evoAir = EVO_LEAP_T; sfx("kick"); fxDust(e.x, e.y, 3, 0.8); }
          } else if (e.evoAir > 0) {
            e.evoAir -= dt; e.jumpZ = Math.sin(Math.PI * Math.min(1, 1 - e.evoAir / EVO_LEAP_T)) * (e.evo === 3 ? 30 : 22); e.pose = "air";
            if (e.evoAir <= 0) { e.jumpZ = 0; fxDust(e.x, e.y, 4, 1); fxRing(e.x, e.y, e.r * 2.2, EVO[e.evo].rgb, 0.25); if (dist2(p, e) < (p.r + e.r + 18) ** 2) hurtPlayer(e.dmg * 1.2); }
          } else if ((e.evoCd = (e.evoCd ?? rand(1, 3)) - dt) <= 0 && d > 90 && d < 210 && e.mode === "walk" && !e.wp) {
            e.evoCd = e.evo === 3 ? rand(4.5, 6) : rand(2.8, 4); e.evoCrouch = 0.42; e.leapAng = Math.atan2(dy, dx);
          }
        }
        if (e.evo === 3) {
          e.evoCalm = (e.evoCalm || 0) + dt;
          if (e.evoCalm > 2 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012 * dt); if (Math.random() < dt * 5) fxSparks(e.x, e.y, -Math.PI / 2, 0.6, 1, "255,90,90", 90); }
          if ((e.roarT = (e.roarT ?? rand(2.5, 4.5)) - dt) <= 0 && d < 480) { e.roarT = rand(7, 9.5); alphaRoar(e); }
        }
        if (e.evo === 1 && Math.random() < dt * 1.6) stampDot(e.x + rand(-4, 4), e.y + rand(-4, 4), rand(0.8, 1.6), "#4a8a1a"); // Giftspur
        if (e.evoFx > 0) e.evoFx -= dt;
      }
      // v3.0 Umweg-Punkt: erst zur freien Ecke, dann wieder direkt aufs Ziel
      if (e.wp) {
        e.wpT -= dt;
        const wx = e.wp.x - e.x, wy = e.wp.y - e.y, wd = Math.hypot(wx, wy);
        if (wd < 10 || e.wpT <= 0 || e.mode !== "walk") e.wp = null;
        else { mx = wx / wd; my = wy / wd; }
      }
      // Hindernis-Umgehung: nach Kollision kurz seitlich ausweichen
      if (e.blocked > 0 && e.mode !== "charge" && !e.wp) {
        e.blocked -= dt;
        const tx = -my * e.side, ty = mx * e.side;
        mx = mx * 0.3 + tx * 0.9; my = my * 0.3 + ty * 0.9;
        const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
      }
      e.x += mx * sp * dt;
      e.y += my * sp * dt;
      // Blickrichtung weich nachführen, Laufanimation an Tempo koppeln
      const lookAt = e.mode === "tele" && e.tele && e.tele.ang != null ? e.tele.ang : e.mode === "aim" || e.mode === "burst" ? e.aimAng : e.type === "spitter" || e.mode === "wind" || e.mode === "lift" || e.mode === "heal" || ((e.type === "gunner" || e.type === "warden" || e.type === "healer") && d < 380) ? Math.atan2(dy, dx) : Math.atan2(my, mx);
      let dFace = lookAt - e.face;
      while (dFace > Math.PI) dFace -= TAU;
      while (dFace < -Math.PI) dFace += TAU;
      e.face += dFace * Math.min(1, dt * (e.def.boss ? 4 : 9));
      e.anim += dt * (sp / (e.def.boss ? 30 : 55)) * 7;
      e.hitRect = null;
      if (collideWorld(e) && e.hitRect && e.hitRect.gateBar) bashBarricade(e, e.hitRect, dt); // v3.3: Barrikade aufbrechen
      else if (e.hitRect) {
        if (!e.wp && e.hitRect && e.mode === "walk" && !e.def.boss) {
          const tg = e.prey && e.prey.state === "wait" && d > 150 ? e.prey : p;
          const wp = detour(e, e.hitRect, tg.x, tg.y);
          if (wp) { e.wp = wp; e.wpT = 2.6; e.blocked = 0; }
        }
        if (e.blocked <= 0 && !e.wp) { e.blocked = 0.5; if (Math.random() < 0.3) e.side *= -1; }
        if (e.mode === "charge") { if (e.rush) bossImpact(e); else { e.mode = "walk"; e.aiT = rand(1.5, 2.5); shake = Math.max(shake, 4); } }
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
          const wa = a.def.anchored ? 0 : a.def.boss ? 0.1 : 1, wb = b.def.anchored ? 0 : b.def.boss ? 0.1 : 1;
          a.x -= (dx / d) * push * wa; a.y -= (dy / d) * push * wa;
          b.x += (dx / d) * push * wb; b.y += (dy / d) * push * wb;
        }
      }
    }

    enemies = enemies.filter((e) => !e.dead);
    if (run.mode !== "survival" && !run.cleared && !supplyCrate && enemies.length === 0 && !objectiveBlocksClear()) roomCleared();
  }

  function roomCleared() {
    if ((theme() === "street" || theme() === "markt") && corpses.length) { const c = pick(corpses); setTimeout(() => { if (run && run.cleared && state === "play") landFlock(c.x, c.y, randi(3, 5)); }, 2500); }
    run.cleared = true;
    if (lastKill && !BOSS_ROOMS[run.room]) killCam = { x: lastKill.x, y: lastKill.y, t: 0.9, max: 0.9 };
    track("rooms");
    if (run.belt) addThrow(save.throwOwned[save.throwSel] ? save.throwSel : "frag", 1, player.x, player.y - 46); // Nachschub je Bezirk
    sfx("door");
    if (window.GameAudio) GameAudio.stinger(BOSS_ROOMS[run.room] ? "victory" : "clear");
    slowMo = Math.max(slowMo, 0.32);
    punchFov = Math.max(punchFov, 2.2);
    shake = Math.max(shake, 5);
    const bossDown = BOSS_ROOMS[run.room] && run.mode === "campaign" && ZOMBIES[curCity().boss];
    showBanner(tr("BEZIRK SICHER"), bossDown ? tr("Funk: {b} ist gefallen – Kurs auf {c}!", { b: ZOMBIES[curCity().boss].name, c: cityAt(cityIdx() + 1).name }) : tr("TÜR OFFEN ↑"), bossDown ? 2.8 : 1.7);
    addText(W / 2, T + 40, tr("TÜR OFFEN ↑"), "#8cff4a", 22);
    if (BOSS_ROOMS[run.room] && run.mode === "campaign" && (run.threat || 0) >= (save.threatMax || 0) && (save.threatMax || 0) < THREAT_MAX) {
      save.threatMax = (save.threatMax || 0) + 1; persist();
      setTimeout(() => toast(tr("Bedrohung {n} freigeschaltet!", { n: save.threatMax }), "skull"), 1800);
    }
    if (BOSS_ROOMS[run.room] && run.mode === "campaign" && cityIdx() + 1 > (save.cityMax || 0) && cityIdx() + 1 < CITIES.length) {
      save.cityMax = cityIdx() + 1; persist();
      setTimeout(() => toast(tr("Neuer Startpunkt: {c}", { c: CITIES[save.cityMax].name }), "map"), 3200);
    }
    if (BOSS_ROOMS[run.room] && run.mode === "campaign") {
      const it = grantGear(0.04 * (run.threat || 0) + 0.015 * cityIdx());
      run.loot = (run.loot || 0) + 1;
      setTimeout(() => toast(`${tr("Beute")}: ${gearName(it)} · ${tr(GEAR_RARITY[it.r].name)}`, GEAR_SLOTS[it.s].icon), 900);
    }
    if (BOSS_ROOMS[run.room]) {
      healPlayer(player.maxHp * 0.2);
      run.shrineT = 1.6;
      // Bewertung im positivsten Moment anfragen: nach dem ersten Boss-Sieg
      if (!save.reviewAsked) { save.reviewAsked = true; persist(); setTimeout(() => Platform.requestReview(), 1500); }
    }
    if (!save.tutorialDone) { save.tutorialDone = true; persist(); }
  }

  // ============================================================
  // v2.4 Einsatzziele: Abwechslung statt immer nur „alle erledigen“
  // ============================================================
  // Bezirk 3, 7 und 9 jeder Stadt bekommen ein Ziel; welches, rotiert von Stadt zu Stadt
  const OBJ_SLOTS = [2, 6, 8];
  const RELAY_SLOT = 5;
  const OBJ_ORDER = ["rescue", "hold", "bounty"];
  const OBJ_INFO = {
    hold: { icon: "hazard", title: "STELLUNG HALTEN", sub: "Bleib in der Zone, bis der Luftschlag kommt" },
    rescue: { icon: "dove", title: "ÜBERLEBENDE RETTEN", sub: "Lauf zu den Überlebenden, bevor die Zombies sie erwischen" },
    bounty: { icon: "bossSkull", title: "KOPFGELD", sub: "" },
    relay: { icon: "storm", title: "FUNKMASTEN AKTIVIEREN", sub: "Halte nacheinander an allen drei Masten die Stellung" },
    gauntlet: { icon: "wall", title: "SPERRKORRIDOR", sub: "Kämpf dich zur Tür – die Barrikaden brechen" },
  };
  const BOUNTY_NAMES = ["Der Schlächter", "Die Bestie", "Der Unkaputtbare", "Der Nachtwächter", "Die Hyäne", "Der Metzger"];
  const SURVIVOR_LINES = ["Danke!", "Endlich!", "Ich dachte, das war's!", "Nix wie weg!", "Du bist ein Engel!"];
  // Diese Gegner wittern Überlebende und laufen zu ihnen, solange der Held weit weg ist
  const NO_SURVIVORS = [];
  const MELEE_PREY = new Set(["walker", "runner", "crawler", "dog", "rat", "wengerter", "wiesn", "zwerg"]);
  // v3.3 Sperrkorridor: Bezirk 4 und 8 jeder Stadt (Heilbronn nur Bezirk 8 – der Einstieg soll ruhig bleiben)
  const GAUNTLET_SLOTS = [3, 7];
  function objectiveFor() {
    if (!run || run.mode !== "campaign") return null;
    if (districtIdx() === RELAY_SLOT) return "relay"; // v2.6: Bezirk 6 = Funkmasten
    if (GAUNTLET_SLOTS.includes(districtIdx()) && (cityIdx() > 0 || districtIdx() === 7)) return "gauntlet";
    const slot = OBJ_SLOTS.indexOf(districtIdx());
    return slot < 0 ? null : OBJ_ORDER[(slot + cityIdx()) % OBJ_ORDER.length];
  }
  function setupObjective(kind) {
    const ci = cityIdx();
    const o = { kind, done: false, t: 0, doneT: 0 };
    if (kind === "hold") {
      const x = W / 2 + rand(-50, 50), y = T + (B - T) * 0.42;
      Object.assign(o, { x, y, r: 78, prog: 0, need: 13 + Math.min(7, ci), spawnCd: 2, inside: false, strikes: [] });
      clearObstacles([{ x, y, r: o.r + 12 }]);
    } else if (kind === "rescue") {
      const n = ci === 0 ? 2 : 3;
      o.list = [];
      for (let i = 0; i < n; i++) {
        const sx = clamp(L + (R - L) * ((i + 0.5) / n) + rand(-30, 30), L + 34, R - 34), sy = T + 90 + rand(0, (B - T) * 0.32);
        o.list.push({ isSurvivor: true, x: sx, y: sy, r: 13, hp: 100, max: 100, t: 0, state: "wait", face: Math.PI / 2, anim: rand(0, 8), variant: randi(0, 3), hurtT: 0 });
      }
      o.total = n; o.saved = 0; o.lost = 0;
      clearObstacles(o.list.map((q) => ({ x: q.x, y: q.y, r: 36 })));
      enemies.filter((e) => MELEE_PREY.has(e.type)).forEach((e, i) => { if (i % 2 === 0) e.prey = o.list[(i / 2) % n]; });
    } else if (kind === "relay") {
      // drei Masten im Zickzack über den Bezirk; immer nur einer ist aktiv
      const pts = [[L + (R - L) * 0.25, T + (B - T) * 0.3], [L + (R - L) * 0.75, T + (B - T) * 0.42], [L + (R - L) * 0.4, T + (B - T) * 0.6]].map(([x, y]) => ({ x: x + rand(-20, 20), y: y + rand(-16, 16) }));
      Object.assign(o, { pts, idx: 0, x: pts[0].x, y: pts[0].y, r: 52, prog: 0, need: 3.5 + Math.min(2, ci * 0.25), spawnCd: 1.6, inside: false, strikes: [] });
      clearObstacles(pts.map((q) => ({ x: q.x, y: q.y, r: 64 })));
    } else if (kind === "gauntlet") {
      o.stages = run.gauntStages || []; o.band = 0; o.bash = false;
    } else if (kind === "bounty") {
      const pool = ci === 0 ? ["walker", "runner", "brute"] : ["brute", "runner", "walker", ...(curCity().foes || [])];
      const type = pick(pool.filter((t) => ZOMBIES[t] && !ZOMBIES[t].pack));
      const pos = freeSpot(T + 160, T + 270); // unterhalb der Ziel-Anzeige, damit das Namensschild frei steht
      const e = spawnEnemy(type, pos.x, pos.y);
      if (!e.elite) makeElite(e, 2);
      else while (e.aff.length < 2) { const k = pick(Object.keys(AFFIXES)); if (!e.aff.includes(k)) e.aff.push(k); }
      applyAffixes(e);
      e.hp *= 2.2; e.maxHp *= 2.2; e.scale *= 1.06; e.bounty = true;
      o.target = e;
      o.name = tr("{n} von {c}", { n: tr(pick(BOUNTY_NAMES)), c: curCity().name });
      o.reward = (40 + 25 * ci) * (player.bigGame ? 2 : 1);
    }
    run.obj = o;
    const info = OBJ_INFO[kind];
    showBanner(tr(info.title), kind === "bounty" ? o.name : tr(info.sub), 2.4);
    if (window.GameAudio) GameAudio.ui("confirm");
  }
  // Platz für Zone bzw. Überlebende schaffen; Lichtquellen der entfernten Hindernisse gehen mit
  function clearObstacles(circles) {
    const keep = obstacles.filter((q) => !circles.some((c) => circleRectOverlap(c, q)));
    if (keep.length === obstacles.length) return;
    obstacles = keep; // der Boden kennt keine Hindernisse; die 3D-Welt baut den Raum erst beim nächsten Bild
    roomLights = obstacles.filter((q) => GLOWING[q.kind]).map((q) => ({ x: q.x + q.w / 2, y: q.y + q.h / 2, rgb: GLOWING[q.kind], r: Math.max(q.w, q.h) * 1.3, src: q }));
  }
  // Solange Stellung oder Rettung laufen, bleibt die Tür zu – auch wenn gerade kein Zombie da ist
  function objectiveBlocksClear() {
    if (run.event && !run.event.fired) return true; // v2.8: das Ereignis kommt noch
    if (hordeQ.length) return true; // v3.0: die Horde ist noch nicht ganz drin
    const o = run.obj;
    if (!o) return false;
    if (o.kind === "hold") return !o.done || o.strikes.length > 0;
    if (o.kind === "relay") return !o.done;
    if (o.kind === "rescue") return !o.done;
    if (o.kind === "gauntlet") return !o.done;
    return false;
  }
  function rewardObjective(amount) {
    run.objDone = (run.objDone || 0) + 1;
    track("objectives");
    const n = Math.max(3, Math.min(12, Math.round(amount / 5))), val = Math.max(1, Math.round(amount / n));
    for (let i = 0; i < n; i++) orbs.push(makeOrb(player.x + rand(-26, 26), player.y - 30 + rand(-20, 20), "coin", val));
    addText(player.x, player.y - 64, `+${Math.round(n * val * run.greed)}`, "#ffd45c", 22, true);
    sfx("combo"); // der „Bezirk sicher“-Jingle folgt ohnehin, sobald die Tür aufgeht
    fx4d("level");
  }
  function updateObjective(dt) {
    const o = run.obj;
    if (!o) return;
    o.t += dt;
    if (o.done) o.doneT += dt;
    if (o.kind === "hold") updateHold(o, dt);
    else if (o.kind === "relay") updateRelay(o, dt);
    else if (o.kind === "rescue") updateRescue(o, dt);
    else if (o.kind === "gauntlet") updateGauntlet(o, dt);
    else if (o.kind === "bounty" && !o.done && o.target.dead) {
      o.done = true;
      showBanner(tr("KOPFGELD KASSIERT"), o.name, 2);
      rewardObjective(o.reward);
      giveMod(rollMod()); // Kopfgeld-Prämie: ein Waffen-Mod
      if (Math.random() < 0.4) dropGear(o.target.x, o.target.y, lootLuck() + 0.03); // v3.3: manchmal auch eine Beutekiste
    }
  }
  function updateHold(o, dt) {
    const p = player;
    if (!o.done) {
      o.inside = Math.hypot(p.x - o.x, p.y - o.y) < o.r;
      o.prog = o.inside ? Math.min(o.need, o.prog + dt) : Math.max(0, o.prog - dt * 0.35);
      // Nachschub aus allen Richtungen, solange die Stellung gehalten wird
      if ((o.spawnCd -= dt) <= 0) {
        o.spawnCd = Math.max(1.1, 2.3 - cityIdx() * 0.12) * rand(0.85, 1.15);
        if (enemies.filter((e) => !e.dead).length < 12 + run.chapter * 3) {
          const pool = wavePool().filter((t) => t !== "nest");
          for (let k = randi(1, 2); k > 0; k--) {
            const type = pick(pool), def = ZOMBIES[type];
            const side = randi(0, 2), pos = side === 0 ? freeSpot(T + 40, T + 110) : { x: side === 1 ? L + 36 : R - 36, y: rand(T + 60, (T + B) / 2) };
            for (let i = 0; i < (def.pack || 1); i++) spawnEnemy(type, pos.x + rand(-16, 16), pos.y + rand(-16, 16));
          }
        }
      }
      if (o.prog >= o.need) {
        // Luftschlag: jede verbliebene Kreatur bekommt ihren Einschlag, gestaffelt wie ein Bombenteppich
        o.done = true;
        let k = 0;
        for (const e of enemies) if (!e.dead && !e.def.boss) o.strikes.push({ e, t: 0.35 + (k++) * 0.11 });
        showBanner(tr("LUFTSCHLAG!"), tr("Stellung gehalten"), 2);
        shake = Math.max(shake, 6);
        sfx("whistle");
        rewardObjective(30 + 18 * cityIdx());
      }
    }
    for (const s of o.strikes) {
      if ((s.t -= dt) > 0) continue;
      s.dead = true;
      const e = s.e;
      if (e.dead) continue;
      if (o.strikes.indexOf(s) < 9) explode(e.x, e.y, 54, e.hp + e.maxHp + 999, true);
      else damageEnemy(e, e.hp + e.maxHp + 999, { aoe: true });
    }
    if (o.strikes.length) o.strikes = o.strikes.filter((s) => !s.dead);
  }
  function updateRelay(o, dt) {
    if (o.done) return;
    const p = player;
    o.inside = Math.hypot(p.x - o.x, p.y - o.y) < o.r;
    o.prog = o.inside ? Math.min(o.need, o.prog + dt) : Math.max(0, o.prog - dt * 0.5);
    if ((o.spawnCd -= dt) <= 0) {
      o.spawnCd = Math.max(1.3, 2.6 - cityIdx() * 0.12) * rand(0.85, 1.15);
      if (enemies.filter((e) => !e.dead).length < 11 + run.chapter * 3) {
        const pool = wavePool().filter((t) => t !== "nest"), type = pick(pool), def = ZOMBIES[type], pos = freeSpot(T + 40, T + 120);
        for (let i = 0; i < (def.pack || 1); i++) spawnEnemy(type, pos.x + rand(-16, 16), pos.y + rand(-16, 16));
      }
    }
    if (o.prog >= o.need) {
      fxRing(o.x, o.y, 70, "168,255,62", 0.45); fxFlash(o.x, o.y, 90, "168,255,62", 0.2); sfx("zap");
      addText(o.x, o.y - 40, tr("MAST {n}/3 ONLINE", { n: o.idx + 1 }), "#a8ff3e", 17, true);
      o.idx++;
      if (o.idx >= o.pts.length) {
        o.done = true;
        showBanner(tr("FUNKNETZ STEHT"), tr("Evakuierung kann angefordert werden"), 1.8);
        rewardObjective(28 + 16 * cityIdx());
      } else { o.x = o.pts[o.idx].x; o.y = o.pts[o.idx].y; o.prog = 0; }
    }
  }
  function updateRescue(o, dt) {
    const p = player;
    for (const s of o.list) {
      s.anim += dt * (s.state === "run" ? 14 : 2);
      s.hurtT = Math.max(0, s.hurtT - dt);
      if (s.state === "wait") {
        let threat = 0;
        for (const e of enemies) {
          if (e.dead || e.spawnT > 0 || e.under) continue;
          if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (e.r + s.r + 10) ** 2) threat += e.dmg;
        }
        if (threat > 0) {
          s.hp -= threat * 1.15 * dt; s.hurtT = 0.15;
          if (Math.random() < dt * 8) fxBlood(s.x, s.y, rand(0, TAU), 2, RED, 110);
        }
        const pd = Math.hypot(p.x - s.x, p.y - s.y);
        if (pd < p.r + s.r + 24) s.t += dt; else s.t = Math.max(0, s.t - dt * 0.6);
        s.face = Math.atan2(p.y - s.y, p.x - s.x);
        if (s.t >= 0.6) {
          s.state = "run"; o.saved++;
          healPlayer(p.maxHp * 0.06);
          addText(s.x, s.y - 30, tr(pick(SURVIVOR_LINES)), "#a8ff3e", 15);
          fxRing(s.x, s.y, 46, "168,255,62", 0.35);
          sfx("coin");
          track("rescued");
          for (const e of enemies) if (e.prey === s) e.prey = null;
        } else if (s.hp <= 0) {
          s.state = "dead"; o.lost++;
          fxBlood(s.x, s.y, rand(0, TAU), 14, RED, 220);
          splatter(s.x, s.y, rand(0, TAU), 0.8, RED);
          addText(s.x, s.y - 30, tr("INFIZIERT!"), "#ff5a4a", 16);
          const z = spawnEnemy("walker", s.x, s.y); z.spawnT = 0.5; z.spawnMax = 0.5;
          for (const e of enemies) if (e.prey === s) e.prey = null;
        }
      } else if (s.state === "run") {
        // zur Tür und raus – Hindernisse überklettern sie
        const tx = W / 2, ty = T - 14, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy) || 1;
        s.x += (dx / d) * 190 * dt; s.y += (dy / d) * 190 * dt; s.face = Math.atan2(dy, dx);
        if (d < 12) s.state = "gone";
      }
    }
    if (!o.done && o.list.every((s) => s.state !== "wait")) {
      o.done = true;
      if (o.saved > 0) rewardObjective((16 + 9 * cityIdx()) * o.saved);
      showBanner(o.saved === o.total ? tr("ALLE GERETTET!") : tr("{n}/{m} GERETTET", { n: o.saved, m: o.total }), o.lost ? tr("{n} verloren", { n: o.lost }) : tr("Die Überlebenden sind auf dem Weg zum Treffpunkt"), 1.8);
    }
  }
  // v3.0 Massen-Horde durch die Gänge: 2,6 s Warnlicht und Grollen, dann strömen sie im Gänsemarsch herein
  const HORDE_CAP = 85;
  const hordePool = () => {
    const base = ["walker", "walker", "runner", "runner", "crawler"];
    const ci = run.mode === "campaign" ? cityIdx() : Math.floor((run.survT || 0) / 60);
    return ci >= 3 ? base.concat(["dog", "brute", "runner"]) : ci >= 1 ? base.concat(["dog"]) : base;
  };
  function startHorde(n, list = gates, say = null) {
    if (!list.length) return false;
    for (const g of list) g.warn = 2.6;
    hordeQ.push({ n, gates: list.slice(), t: 2.6, cd: 0, spawned: 0 });
    showBanner(say ? say.title : tr("HORDE IM ANMARSCH!"), say ? say.sub : list.length > 1 ? tr("Aus beiden Gängen!") : list[0].side < 0 ? tr("Linker Gang!") : tr("Rechter Gang!"), 1.6);
    shake = Math.max(shake, 5); fx4d("boss", 600); track("hordes");
    if (window.GameAudio) GameAudio.stinger("horde");
    return true;
  }
  function updateHordes(dt) {
    for (const g of gates) if (g.warn > 0) g.warn -= dt;
    for (const h of hordeQ) {
      if (h.t > 0) { h.t -= dt; continue; }
      if ((h.cd -= dt) > 0) continue;
      h.cd = h.gates.length > 1 ? 0.06 : 0.085;
      if (enemies.length >= HORDE_CAP) continue; // v3.3: nicht mehr als HORDE_CAP gleichzeitig – der Rest wartet im Gang
      const g = h.gates[h.spawned % h.gates.length];
      quietSpawn = true;
      const gx = g.side < 0 ? L - rand(110, 210) : R + rand(110, 210), gy = g.y + rand(-g.h / 2 + 18, g.h / 2 - 18);
      const e = spawnEnemy(pick(hordePool()), gx, gy);
      quietSpawn = false;
      e.x = gx; e.y = gy; // spawnEnemy klemmt in die Arena – die Horde startet aber hinten im Gang
      e.spawnT = 0; e.horde = true; e.face = g.side < 0 ? 0 : Math.PI;
      if (++h.spawned >= h.n) h.done = true;
    }
    if (hordeQ.length) hordeQ = hordeQ.filter((h) => !h.done);
  }
  function drawGateWarnings() {
    for (const g of gates) {
      if (!(g.warn > 0)) continue;
      const k = 0.5 + 0.5 * Math.sin(run.time * 16), dir = -g.side, q = scr(g.side < 0 ? L + 16 : R - 16, g.y, 6);
      ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * k;
      ctx.fillStyle = "#e2561f"; ctx.beginPath();
      ctx.moveTo(q.x + dir * 24, q.y); ctx.lineTo(q.x - dir * 6, q.y - 17); ctx.lineTo(q.x - dir * 6, q.y + 17); ctx.closePath(); ctx.fill();
      ctx.font = FONT_UI(14, 800); ctx.textAlign = dir > 0 ? "left" : "right"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(tr("HORDE!"), q.x + dir * 32, q.y + 5); ctx.fillStyle = "#ffd2b8"; ctx.fillText(tr("HORDE!"), q.x + dir * 32, q.y + 5);
      ctx.restore();
    }
  }

  // v2.8 Bezirks-Ereignisse: wenn die Welle halb erledigt ist, kippt die Lage – Hinterhalt, Horde oder Elite-Rudel
  function updateEvent() {
    const ev = run.event;
    if (!ev || ev.fired || enemies.filter((e) => !e.dead).length > ev.at) return;
    ev.fired = true;
    const pool = wavePool().filter((t) => t !== "nest" && !ZOMBIES[t].pack), sp = (t, x, y) => { const e = spawnEnemy(t, x, y); e.spawnT = 0.35; return e; };
    if (ev.kind === "ambush") {
      for (let i = 0; i < 8 + Math.min(6, cityIdx()); i++) sp(pick(pool), i % 2 ? R - 36 : L + 36, rand(T + 80, B - 120));
      showBanner(tr("HINTERHALT!"), tr("Von beiden Seiten!"), 1.4);
    } else if (ev.kind === "massive" && gates.length) {
      startHorde(Math.min(60, 22 + 6 * (run.mode === "campaign" ? cityIdx() : 2))); // v3.3: doppelt so große Massen-Horden
      return;
    } else if (ev.kind === "horde" && gates.length) {
      startHorde(Math.min(45, 16 + 5 * cityIdx()));
      return;
    } else if (ev.kind === "horde") {
      const fast = ["runner", "crawler", "dog"].filter((t) => ZOMBIES[t]);
      for (let i = 0; i < 14 + Math.min(10, 2 * cityIdx()); i++) sp(pick(fast), rand(L + 40, R - 40), T + rand(30, 90));
      showBanner(tr("HORDE!"), tr("Sie stürmen von oben"), 1.4);
    } else {
      for (let i = 0; i < 2; i++) makeElite(sp(pick(pool), rand(L + 60, R - 60), T + rand(60, 140)), 1);
      showBanner(tr("ELITE-RUDEL"), tr("Zwei Elite-Zombies greifen an"), 1.4);
    }
    shake = Math.max(shake, 6); sfx("rage"); fx4d("boss", 400);
    track("events");
  }
  // ============================================================
  // v2.9 Wurfwaffen und Spezialfähigkeiten
  // ============================================================
  const BELT_MAX = 5, THROW_CD = 0.55;
  // Wirkung wächst mit derselben Formel wie das Gegner-Leben (Raum, Kapitel, Bedrohung, Tagesbefehl) –
  // so bleiben Würfe und Spezialfähigkeiten in jeder Stadt und im Überlebensmodus spürbar
  function powerUnit() {
    const ord = runOrder();
    const k = (1 + Math.max(0, run.room - 1) * 0.07) * Math.pow(1.6, Math.max(0, run.chapter - 1)) * threatHp(run.threat || 0) * (ord.foeHp || 1);
    return 60 * k * Math.sqrt(player.dmgMul || 1);
  }
  const beltKinds = () => (run && run.belt ? Object.keys(THROWABLES).filter((k) => run.belt[k] > 0) : []);
  function cycleThrow() {
    const ks = beltKinds();
    if (ks.length < 2) return;
    run.beltSel = ks[(ks.indexOf(run.beltSel) + 1) % ks.length];
    if (window.GameAudio) GameAudio.ui("tick");
    addText(player.x, player.y - 50, tr(THROWABLES[run.beltSel].name), "#ffd45c", 13);
  }
  function addThrow(kind, n, x, y) {
    if (!run || !run.belt) return;
    const k = kind || pick(Object.keys(THROWABLES));
    const have = run.belt[k] || 0, add = Math.min(n, BELT_MAX - have);
    if (add <= 0) return;
    run.belt[k] = have + add;
    if (!(run.belt[run.beltSel] > 0)) run.beltSel = k;
    addText(x, y, `+${add} ${tr(THROWABLES[k].name)}`, "#ffd45c", 13);
  }
  // Ziel: dichteste Gruppe in Wurfweite, sonst ein Stück in Blickrichtung
  function throwTarget() {
    const p = player;
    let best = null, bs = 0;
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || e.under) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 70 || d > 400) continue;
      let sc = 1;
      for (const q of enemies) if (q !== e && !q.dead && (q.x - e.x) ** 2 + (q.y - e.y) ** 2 < 95 * 95) sc++;
      sc += e.elite ? 1.5 : 0;
      sc -= d / 600;
      if (sc > bs) { bs = sc; best = e; }
    }
    if (best) return { x: best.x, y: best.y };
    return { x: p.x + Math.cos(p.aim) * 220, y: p.y + Math.sin(p.aim) * 220 };
  }
  function doThrow() {
    const kind = run.beltSel;
    if (!(run.belt[kind] > 0) || run.throwCd > 0) return false;
    const p = player, tg = throwTarget(), def = THROWABLES[kind];
    const x1 = clamp(tg.x, L + 24, R - 24), y1 = clamp(tg.y, T + 24, B - 24), dist = Math.hypot(x1 - p.x, y1 - p.y);
    throws.push({ kind, x0: p.x, y0: p.y, x1, y1, x: p.x, y: p.y, z: 30, t: 0, T: 0.42 + dist / 1100, r: def.r, spin: rand(0, TAU) });
    run.belt[kind]--;
    run.throwCd = THROW_CD;
    p.throwT = 0.32;
    p.aim = Math.atan2(y1 - p.y, x1 - p.x);
    if (!(run.belt[kind] > 0)) { const ks = beltKinds(); if (ks.length) run.beltSel = ks[0]; }
    if (window.GameAudio) GameAudio.ui("swipe");
    fx4d("kick"); track("throws");
    return true;
  }
  const nearestDecoy = (e) => { let b = null, bd = 460 * 460; for (const list of [decoys, lures]) for (const q of list) { const d = (q.x - e.x) ** 2 + (q.y - e.y) ** 2; if (d < bd) { bd = d; b = q; } } return b; };
  function landThrow(q) {
    const def = THROWABLES[q.kind], U = powerUnit(), x = q.x, y = q.y;
    const inR = (e, r) => !e.dead && e.spawnT <= 0 && !e.under && (e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2;
    if (q.kind === "frag") explode(x, y, def.r, U * 1.9, true);
    else if (q.kind === "molotov") {
      sfx("glass"); fxDebris(x, y, 0, Math.PI, 10, "#3a6a3a");
      for (let i = 0; i < 10; i++) fxFire(x + rand(-def.r, def.r) * 0.6, y + rand(-def.r, def.r) * 0.6, 1.6, rand(0.4, 0.7));
      fxFlash(x, y, def.r * 1.4, "255,150,60", 0.25);
      addHazard(x, y, def.r, 5, U * 0.42, "napalm");
      stamp(Sprites.scorch(), x, y, rand(0, TAU), def.r / 40, 0.8);
    } else if (q.kind === "flash") {
      fxFlash(x, y, def.r * 2.2, "255,255,255", 0.4); fxRing(x, y, def.r, "235,240,255", 0.45); fxSparks(x, y, 0, Math.PI, 18, "255,255,230", 360);
      shake = Math.max(shake, 5); sfx("boom");
      for (const e of enemies) if (inR(e, def.r)) { e.stunT = Math.max(e.stunT || 0, e.def.boss ? 0.7 : 2.6); damageEnemy(e, U * 0.25, { aoe: true, silent: true }); }
    } else if (q.kind === "frost") {
      fxFlash(x, y, def.r * 1.6, "150,220,255", 0.3); fxRing(x, y, def.r, "170,230,255", 0.5);
      for (let i = 0; i < 14; i++) fxIce(x + rand(-def.r, def.r) * 0.7, y + rand(-def.r, def.r) * 0.7);
      sfx("glass");
      for (const e of enemies) if (inR(e, def.r)) { e.slowT = Math.max(e.slowT, 4.5); if (!e.def.boss) { e.stunT = Math.max(e.stunT || 0, 2.2); e.frostT = 2.6; } damageEnemy(e, U * 0.5, { aoe: true, silent: true }); }
    } else if (q.kind === "decoy") {
      decoys.push({ x, y, t: 3, max: 3, r: def.r, dmg: U * 1.1, bang: 0 });
      fxSparks(x, y, -Math.PI / 2, 1, 6, "255,210,90", 160);
    }
  }
  function updateThrowables(dt) {
    if (!run.belt) return;
    const p = player;
    run.throwCd = Math.max(0, run.throwCd - dt);
    if (p.throwT > 0) p.throwT -= dt;
    if (p.ultT > 0) p.ultT -= dt;
    run.ult = Math.min(100, run.ult + dt * 0.6 * (player.ultGain || 1)); // lädt auch langsam von selbst
    if (throwWanted) { throwWanted = false; doThrow(); }
    if (ultWanted) { ultWanted = false; if (run.ult >= 100) activateUlt(); else if (window.GameAudio) GameAudio.ui("tick"); }
    for (const q of throws) {
      q.t += dt; q.spin += dt * 9;
      const k = Math.min(1, q.t / q.T);
      q.x = q.x0 + (q.x1 - q.x0) * k; q.y = q.y0 + (q.y1 - q.y0) * k; q.z = 30 * (1 - k) + Math.sin(k * Math.PI) * 120;
      if (q.kind === "molotov" && Math.random() < 0.5) fxFire(q.x, q.y - q.z * 0.2, 0.5, 0.25);
      if (k >= 1) { q.dead = true; landThrow(q); }
    }
    if (throws.length) throws = throws.filter((q) => !q.dead);
    // Böller-Köder: knistert 3 s und lockt Zombies, dann vier Knalle
    for (const q of decoys) {
      q.t -= dt;
      if (Math.random() < 0.5) fxSparks(q.x, q.y - 6, -Math.PI / 2, 1.4, 1, pick(["255,210,90", "255,90,60", "255,255,200"]), 140);
      if (q.t <= 0 && (q.bang -= dt) <= 0) {
        q.n = (q.n || 0) + 1; q.bang = 0.16;
        explode(q.x + rand(-24, 24), q.y + rand(-24, 24), q.r, q.dmg, true);
        if (q.n >= 4) q.dead = true;
      }
    }
    if (decoys.length) decoys = decoys.filter((q) => !q.dead);
    // Luftschlag: Einschläge nacheinander
    for (const s2 of strikes) if ((s2.t -= dt) <= 0) { s2.dead = true; explode(s2.x, s2.y, s2.r, s2.dmg, true); }
    if (strikes.length) strikes = strikes.filter((s2) => !s2.dead);
    // Schattenklingen: Sprung von Ziel zu Ziel
    const bl = run.blink;
    if (bl && (bl.t -= dt) <= 0) {
      const e = bl.list[bl.i++];
      if (e && !e.dead) {
        ghosts.push({ x: p.x, y: p.y, life: 0.35, max: 0.35 });
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        p.x = clamp(e.x + Math.cos(a) * (e.r + p.r + 6), L + p.r, R - p.r); p.y = clamp(e.y + Math.sin(a) * (e.r + p.r + 6), T + p.r, B - p.r);
        collideWorld(p);
        p.aim = a + Math.PI; p.invuln = Math.max(p.invuln, 0.3);
        fxSparks(e.x, e.y, a, 1.2, 8, "200,230,255", 300);
        damageEnemy(e, bl.dmg, { silent: false });
      }
      bl.t = 0.085;
      if (bl.i >= bl.list.length) run.blink = null;
    }
    // zeitlich begrenzte Spezial-Wirkungen zurücknehmen
    if (run.ultFx && (run.ultFx.t -= dt) <= 0) endUltFx();
  }
  function endUltFx() {
    const f = run.ultFx, p = player;
    if (!f) return;
    if (f.drones) p.drones = Math.max(0, p.drones - f.drones);
    if (f.lifesteal) p.lifesteal -= f.lifesteal;
    if (f.greed) run.greed /= f.greed;
    run.ultFx = null;
  }
  function activateUlt() {
    const p = player, sp = heroSpecial(save.skin), U = powerUnit();
    run.ult = 0;
    p.ultT = 0.7;
    endUltFx(); // eine noch laufende Wirkung zuerst sauber beenden (sonst blieben z. B. Drohnen für immer)
    track("specials");
    slowMo = Math.max(slowMo, 0.35); punchFov = Math.max(punchFov, 3); shake = Math.max(shake, 7);
    fx4d("level"); sfx("combo");
    callout = { title: tr(sp.name).toUpperCase(), n: 1, bonus: 0, life: 1.3, max: 1.3, plain: true };
    const near = (r, max = 99) => enemies.filter((e) => !e.dead && e.spawnT <= 0 && !e.under && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < r * r).sort((a, b) => dist2(a, p) - dist2(b, p)).slice(0, max);
    const id = HERO_SPECIALS[save.skin] ? save.skin : "soldier";
    if (id === "soldier") {
      for (let i = 0; i < 7; i++) {
        const d = 70 + i * 68, x = clamp(p.x + Math.cos(p.aim) * d, L + 30, R - 30), y = clamp(p.y + Math.sin(p.aim) * d, T + 30, B - 30);
        strikes.push({ x: x + rand(-18, 18), y: y + rand(-18, 18), r: 78, t: 0.45 + i * 0.13, max: 0.45 + i * 0.13, dmg: U * 1.7 });
      }
    } else if (id === "police") {
      let from = p;
      for (const e of near(430, 10)) {
        zaps.push({ x1: from.x, y1: from.y, x2: e.x, y2: e.y, life: 0.4, max: 0.4 });
        e.stunT = Math.max(e.stunT || 0, e.def.boss ? 0.6 : 2.4);
        damageEnemy(e, U * 1.5, { silent: true });
        from = e;
      }
      sfx("zap");
    } else if (id === "firefighter") {
      fxRing(p.x, p.y, 240, "255,150,50", 0.6); fxFlash(p.x, p.y, 300, "255,140,40", 0.3);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; fxFire(p.x + Math.cos(a) * 150, p.y + Math.sin(a) * 150, 2, 0.6); }
      for (const e of near(250)) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        if (!e.def.boss) { e.kvx += Math.cos(a) * 380; e.kvy += Math.sin(a) * 380; }
        e.burnT = Math.max(e.burnT, 5); e.burnDps = Math.max(e.burnDps || 0, U * 0.5);
        damageEnemy(e, U * 0.8, { aoe: true });
      }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; addHazard(clamp(p.x + Math.cos(a) * 170, L + 20, R - 20), clamp(p.y + Math.sin(a) * 170, T + 20, B - 20), 40, 4, U * 0.3, "napalm"); }
    } else if (id === "hazmat") {
      addHazard(p.x, p.y, 160, 8, U * 0.4, "stink");
      for (let i = 0; i < 16; i++) fxGas(p.x + rand(-140, 140), p.y + rand(-140, 140), 2.4, "150,220,60", 2);
      p.slowT = 0; p.jamT = 0; healPlayer(p.maxHp * 0.15);
    } else if (id === "ninja") {
      const list = near(520, 6);
      if (list.length) run.blink = { list, i: 0, t: 0.05, dmg: U * 2.6 };
      p.invuln = Math.max(p.invuln, 0.3 + list.length * 0.09);
    } else if (id === "cyber") {
      fxRing(p.x, p.y, 260, "127,231,255", 0.5); fxFlash(p.x, p.y, 280, "127,231,255", 0.25);
      for (const e of near(270)) { e.stunT = Math.max(e.stunT || 0, e.def.boss ? 0.5 : 1.8); zaps.push({ x1: p.x, y1: p.y, x2: e.x, y2: e.y, life: 0.3, max: 0.3 }); damageEnemy(e, U * 0.6, { silent: true }); }
      p.drones += 3; run.ultFx = { t: 10, drones: 3 };
      sfx("zap");
    } else if (id === "plague") {
      healPlayer(p.maxHp * 0.4);
      for (let i = 0; i < 12; i++) fxGas(p.x + rand(-120, 120), p.y + rand(-120, 120), 2, "120,255,140", 1.6);
      for (const e of near(210)) e.poisonDps = Math.max(e.poisonDps || 0, U * 0.45);
      p.lifesteal += 0.05; run.ultFx = { t: 6, lifesteal: 0.05 };
    } else if (id === "gold") {
      fxRing(p.x, p.y, 220, "255,212,92", 0.5); fxFlash(p.x, p.y, 260, "255,220,120", 0.3); fxSparks(p.x, p.y, 0, Math.PI, 30, "255,212,92", 380);
      for (const e of near(230)) { const a = Math.atan2(e.y - p.y, e.x - p.x); if (!e.def.boss) { e.kvx += Math.cos(a) * 320; e.kvy += Math.sin(a) * 320; } damageEnemy(e, U * 1.8, { aoe: true }); }
      run.greed *= 2; run.ultFx = { t: 10, greed: 2 };
      sfx("coin");
    } else {
      // Präzisionsschuss: Strahl quer über das Feld, trifft alles auf der Linie
      const cx = Math.cos(p.aim), cy = Math.sin(p.aim), len = 1100;
      beams.push({ x1: p.x, y1: p.y, x2: p.x + cx * len, y2: p.y + cy * len, life: 0.5, max: 0.5, w: 22, rgb: "255,232,140" });
      for (const e of enemies) {
        if (e.dead || e.spawnT > 0 || e.under) continue;
        const ex = e.x - p.x, ey = e.y - p.y, along = ex * cx + ey * cy;
        if (along < 0 || along > len) continue;
        if (Math.abs(ex * -cy + ey * cx) < e.r + 14) { e.hitAng = p.aim; damageEnemy(e, U * 5, {}); fxSparks(e.x, e.y, p.aim, 0.6, 6, "255,232,140", 320); }
      }
      punchX -= cx * 4; punchY -= cy * 4;
    }
  }
  function drawThrows() {
    for (const q of throws) {
      const def = THROWABLES[q.kind], k = Math.min(1, q.t / q.T);
      ctx.strokeStyle = `rgba(${def.rgb},${0.45 + 0.3 * Math.sin(run.time * 20)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x1, q.y1, q.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(${def.rgb},0.14)`; ctx.beginPath(); ctx.arc(q.x1, q.y1, q.r * k, 0, TAU); ctx.fill();
      drawShadow(q.x, q.y, 7);
      ctx.save(); ctx.translate(q.x, q.y - q.z); ctx.rotate(q.spin);
      ctx.fillStyle = def.col; ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(-2, -6, 2, 6);
      if (q.kind === "molotov") { ctx.fillStyle = "#ffb733"; ctx.beginPath(); ctx.arc(0, -10, 3.5, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // v3.7 Hochspannungszone: knisternder blauer Ring mit Schein
    for (const h of hazards) if (h.kind === "shock") {
      const k = Math.min(1, h.life / 0.6) * (0.7 + 0.3 * Math.sin(run.time * 40));
      glowAt("90,170,255", h.x, h.y, h.r * 1.1, 0.35 * k); ctx.globalAlpha = 1;
      ctx.save(); ctx.strokeStyle = `rgba(150,225,255,${0.7 * k})`; ctx.lineWidth = 2.5; ctx.setLineDash([14, 9]); ctx.lineDashOffset = -run.time * 90;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (const q of decoys) {
      const blink = Math.sin(run.time * 26) > 0, k = Math.max(0, q.t / q.max);
      ctx.strokeStyle = `rgba(255,120,60,${0.25 + 0.25 * Math.sin(run.time * 6)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, 60 + 40 * (1 - k), 0, TAU); ctx.stroke();
      ctx.fillStyle = "#c8202a"; ctx.fillRect(q.x - 3, q.y - 10, 6, 14);
      ctx.fillStyle = blink ? "#fff2a0" : "#ff8a3a"; ctx.beginPath(); ctx.arc(q.x, q.y - 12, 2.6, 0, TAU); ctx.fill();
    }
    for (const s2 of strikes) {
      const k = 1 - Math.max(0, s2.t / s2.max);
      ctx.strokeStyle = `rgba(255,90,40,${0.5 + 0.4 * Math.sin(run.time * 26)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s2.x, s2.y, s2.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = "rgba(255,90,40,0.18)"; ctx.beginPath(); ctx.arc(s2.x, s2.y, s2.r * k, 0, TAU); ctx.fill();
    }
  }
  function drawActionButtons() {
    if (!run || !run.belt) return;
    const sel = run.beltSel, n = run.belt[sel] || 0, def = THROWABLES[sel];
    // Wurfwaffe
    const tb = throwBtn(), ready = n > 0 && run.throwCd <= 0;
    ctx.save();
    ctx.globalAlpha = ready ? 0.92 : 0.5;
    ctx.fillStyle = "rgba(6,9,8,0.6)"; ctx.beginPath(); ctx.arc(tb.x, tb.y, tb.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = n > 0 ? `rgb(${def.rgb})` : "#5a625c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tb.x, tb.y, tb.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - run.throwCd / THROW_CD)); ctx.stroke();
    drawIcon(ctx, def.icon, tb.x, tb.y - 2, 24, n > 0 ? "#e8efe9" : "#6a746c");
    ctx.globalAlpha = 1;
    ctx.fillStyle = n > 0 ? "#ffd45c" : "#7a847c"; ctx.beginPath(); ctx.arc(tb.x + tb.r * 0.72, tb.y - tb.r * 0.72, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0b1408"; ctx.font = FONT_UI(12, 800); ctx.textAlign = "center"; ctx.fillText(String(n), tb.x + tb.r * 0.72, tb.y - tb.r * 0.72 + 4.5);
    ctx.font = FONT_UI(9); ctx.fillStyle = "#b3bfb6"; ctx.fillText(pad.on ? "RB" : touchSeen ? "" : "Q", tb.x, tb.y + 20);
    // Art wechseln
    const ks = beltKinds();
    if (ks.length > 1) {
      const sb = swapBtn(), nx = THROWABLES[ks[(ks.indexOf(sel) + 1) % ks.length]];
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(6,9,8,0.7)"; ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,212,92,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r - 1, 0, TAU); ctx.stroke();
      drawIcon(ctx, nx.icon, sb.x, sb.y, 16, "#d8e0da");
      if (!touchSeen) { ctx.font = FONT_UI(8); ctx.fillStyle = "#b3bfb6"; ctx.fillText(pad.on ? "LB" : "R", sb.x - sb.r - 6, sb.y + 3); }
    }
    // Spezialfähigkeit
    const ub = ultBtn(), full = run.ult >= 100, sp = heroSpecial(save.skin);
    ctx.globalAlpha = full ? 1 : 0.6;
    if (full) { ctx.fillStyle = `rgba(168,255,62,${0.18 + 0.14 * Math.sin(run.time * 6)})`; ctx.beginPath(); ctx.arc(ub.x, ub.y, ub.r + 8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "rgba(6,9,8,0.6)"; ctx.beginPath(); ctx.arc(ub.x, ub.y, ub.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = full ? "#a8ff3e" : "#4aa8ff"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(ub.x, ub.y, ub.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * run.ult / 100); ctx.stroke();
    drawIcon(ctx, sp.icon, ub.x, ub.y - 3, 25, full ? "#ffffff" : "#8a958c");
    ctx.font = FONT_UI(9); ctx.fillStyle = full ? "#a8ff3e" : "#b3bfb6";
    ctx.fillText(full ? (pad.on ? "Y" : touchSeen ? tr("SPEZIAL") : "E") : `${Math.floor(run.ult)} %`, ub.x, ub.y + 21);
    ctx.restore();
  }

  // Explosiv-Elite: kurze Zündschnur am Todesort, dann Detonation
  let fuses = [];
  function updateFuses(dt) {
    for (const f of fuses) if ((f.t -= dt) <= 0) { f.dead = true; explode(f.x, f.y, f.r, f.dmg, false); }
    if (fuses.length) fuses = fuses.filter((f) => !f.dead);
  }

  // ============================================================
  // v2.4 Elite-Eigenschaften: jede Elite hat einen Charakterzug, Kopfgeld-Ziele zwei
  // ============================================================
  const AFFIXES = {
    armored: { name: "Gepanzert", rgb: "170,200,235" },
    swift: { name: "Flink", rgb: "110,230,255" },
    volatile: { name: "Explosiv", rgb: "255,120,50" },
    regen: { name: "Zäh", rgb: "120,255,130" },
    shielded: { name: "Schildträger", rgb: "140,190,255" },
  };
  function makeElite(e, nAff = 1) {
    e.elite = true; e.hp *= 3; e.maxHp *= 3; e.dmg *= 1.3; e.scale *= 1.22;
    e.aff = [];
    const keys = Object.keys(AFFIXES).filter((k) => !(k === "swift" && e.def.anchored));
    while (e.aff.length < nAff) { const k = pick(keys); if (!e.aff.includes(k)) e.aff.push(k); }
    applyAffixes(e);
  }
  function applyAffixes(e) {
    if (e.aff.includes("swift") && !e.affSwift) { e.affSwift = true; e.speed *= 1.45; }
    if (e.aff.includes("shielded")) { e.shield = e.maxHp * 0.4; e.shieldT = 1e9; e.affShieldCd = 0; }
    e.calmT = 0;
  }
  function updateAffixes(e, dt) {
    e.calmT = (e.calmT || 0) + dt;
    if (e.aff.includes("regen") && e.calmT > 1.6 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.07 * dt);
      if (Math.random() < dt * 6) fxSparks(e.x, e.y, -Math.PI / 2, 0.6, 1, "120,255,130", 90);
    }
    if (e.aff.includes("shielded") && !(e.shield > 0) && (e.affShieldCd = (e.affShieldCd || 0) + dt) > 6) {
      e.affShieldCd = 0; e.shield = e.maxHp * 0.4; e.shieldT = 1e9;
      fxRing(e.x, e.y, e.r * 2.4, "140,190,255", 0.35);
    }
  }
  const affixLabel = (e) => e.aff.map((k) => tr(AFFIXES[k].name)).join(" · ");

  // ============================================================
  // Orbs (XP & Münzen)
  // ============================================================
  function updateOrbs(dt) {
    const p = player;
    for (const o of orbs) {
      o.t += dt;
      const dx = p.x - o.x, dy = p.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if (o.type === "power") { // v3.7 Power-up: schwebt an Ort und Stelle, verfällt nach PU_LIFE
        o.vx *= 1 - 5 * dt; o.vy *= 1 - 5 * dt; o.x = clamp(o.x + o.vx * dt, L + 24, R - 24); o.y = clamp(o.y + o.vy * dt, T + 24, B - 24);
        if (d < p.r + 22) { o.dead = true; takePower(o); } else if (o.t > PU_LIFE) { o.dead = true; fxRing(o.x, o.y, 30, o.rgb, 0.3); fxDust(o.x, o.y, 3, 0.6); }
        continue;
      }
      if ((run.cleared && o.t > 0.4) || (puOn("magnet") && o.t > 0.25) || d < (run.mode === "survival" ? 120 : 80)) {
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
        else if (o.type === "heal") { healPlayer(p.maxHp * o.val); fxRing(p.x, p.y, 40, "120,255,140", 0.35); sfx("coin"); if (o.food) addText(p.x, p.y - 52, `${tr(o.food)}!`, "#ffd27a", 17); }
        else if (o.type === "gear") pickGear(o);
        else if (o.type === "pfand") { run.coins += 2 * run.greed * ECON.earn; sfx("coin"); addText(p.x, p.y - 48, tr("PFAND +25 ct"), "#9fe870", 15); track("pfand"); }
        else { run.coins += o.val * run.greed * ECON.earn; sfx("coin"); }
      }
    }
    orbs = orbs.filter((o) => !o.dead);
  }

  function addXp(v) {
    const p = player;
    p.xp += v * (p.xpGain || 1);
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level++;
      p.xpNeed = Math.round(12 + p.level * 6 + p.level * p.level * 0.6);
      run.pendingPicks++;
      if (window.GameAudio) GameAudio.stinger("level");
      fx4d("level");
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
    const banned = (run && run.banned) || [];
    const avail = SKILLS.filter((s) => (p.skills[s.id] || 0) < s.max && (!s.cond || s.cond(p)) && !banned.includes(s.id));
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
    checkSets();
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
  function renderCards(title, cards, onReroll = null, sub = tr("Wähle eine Fähigkeit"), onBan = null) {
    $("skillPick").classList.toggle("shrine", cards.some((c) => c.rarity === "angel"));
    rerollHandler = onReroll;
    const freeRoll = run && run.freeRerolls > 0;
    $("rerollBtn").classList.toggle("hidden", !(onReroll && (Platform.ads.available || freeRoll)));
    $("rerollBtn").innerHTML = freeRoll ? `${I("dna")} ${tr("Neu würfeln (gratis)")}` : adLabel(tr("Neu würfeln"));
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
      if (onBan && c.id && SKILLS.includes(skillById(c.id))) {
        // Schloss oben rechts: Skill für diesen Einsatz sperren (span statt button – Knöpfe dürfen nicht verschachtelt sein)
        const ban = document.createElement("span");
        ban.className = "ban"; ban.setAttribute("role", "button"); ban.title = tr("Skill für diesen Einsatz sperren");
        ban.innerHTML = I("lock");
        ban.addEventListener("click", (ev) => { ev.stopPropagation(); onBan(c.id); });
        btn.appendChild(ban);
      }
      box.appendChild(btn);
    }
    joy.active = false;
    state = "pick";
    show(ui.skillPick);
  }

  function openSkillPick(rerolled = false, again = false) {
    if (!rerolled && !again) { run.pendingPicks--; sfx("level"); trackMax("level", player.level); }
    // Fertiges Rezept: Evolution erscheint garantiert als erste Karte
    const ready = EVOLUTIONS.filter((ev) => evoReady(player, ev));
    const choices = rollSkills(ready.length ? 2 : 3);
    if (!choices.length && !ready.length) { resumePlay(); return; }
    const cards = choices.map((s) => ({ ...s, hint: [evoHint(s), setHint(s)].filter(Boolean).join(" · "), onPick: () => { takeSkill(s); resumePlay(); } }));
    if (ready.length) {
      const ev = ready[0];
      cards.unshift({ icon: ev.icon, name: ev.name, desc: ev.desc, rarity: "evo", onPick: () => { takeEvolution(ev); resumePlay(); } });
    }
    const bans = run.bans || 0;
    const onBan = bans > 0 ? (id) => { run.bans--; run.banned.push(id); sfx("paper"); openSkillPick(rerolled, true); } : null;
    renderCards(tr("AUFSTIEG!"), cards, rerolled ? null : () => openSkillPick(true), bans > 0 ? `${tr("Wähle eine Fähigkeit")} · ${tr("Schloss sperrt einen Skill ({n} übrig)", { n: bans })}` : tr("Wähle eine Fähigkeit"), onBan);
  }

  // v2.8 Waffen-Mods: Umbauten für die aktuelle Waffe, aus der Versorgungskiste und als Kopfgeld-Prämie
  const WEAPON_MODS = [
    { id: "hollow", name: "Hohlspitz-Munition", desc: "+25 % Schaden", apply: (p) => { p.dmgMul *= 1.25; } },
    { id: "mag", name: "Schnellfeuer-Magazin", desc: "+20 % Feuerrate", apply: (p) => { p.rateMul *= 1.2; } },
    { id: "ap", name: "Panzerbrechende Munition", desc: "+1 Durchschlag", apply: (p) => { p.pierce += 1; } },
    { id: "laser", name: "Laservisier", desc: "+12 % Krit-Chance", apply: (p) => { p.crit += 0.12; } },
    { id: "drum", name: "Trommelmagazin", desc: "+1 Salve ohne Schadensverlust", apply: (p) => { p.multishot += 1; } },
  ];
  function rollMod() { const have = player.mods || [], left = WEAPON_MODS.filter((m) => !have.includes(m.id)); return left.length ? pick(left) : null; }
  function giveMod(m) {
    if (!m) return;
    m.apply(player); player.mods = (player.mods || []).concat(m.id);
    toast(`${tr("Waffen-Mod")}: ${tr(m.name)} – ${tr(m.desc)}`, "weapons"); track("mods");
  }
  function openSupply() {
    sfx("level");
    const mod = rollMod();
    renderCards(tr("NACHSCHUB"), [
      ...(mod ? [{ icon: "weapons", name: tr("Waffen-Mod"), desc: `${tr(mod.name)}: ${tr(mod.desc)}`, rarity: "epic", onPick: () => { giveMod(mod); afterSupply(); } }] : []),
      { icon: "firstAid", name: tr("Erste Hilfe"), desc: tr("Heilt 50% deiner max. HP"), rarity: "common", onPick: () => { healPlayer(player.maxHp * 0.5); afterSupply(); } },
      { icon: "ammo", name: tr("Waffenkiste"), desc: tr("Wähle einen zusätzlichen Skill"), rarity: "epic", onPick: () => { run.pendingPicks++; afterSupply(); } },
      { icon: "grenade", name: tr("Sprengstoffkiste"), desc: tr("+2 {a} und 2 zufällige Wurfwaffen", { a: tr(THROWABLES[run.beltSel || "frag"].name) }), rarity: "rare", onPick: () => { addThrow(run.beltSel || "frag", 2, player.x, player.y - 40); addThrow(null, 1, player.x, player.y - 64); addThrow(null, 1, player.x, player.y - 88); afterSupply(); } },
    ], null, tr("Versorgungskiste geöffnet"));
  }
  function afterSupply() {
    supplyCrate = null;
    run.cleared = true;
    addText(W / 2, T + 40, tr("TÜR OFFEN ↑"), "#8cff4a", 22);
    resumePlay();
  }

  // ---------------------------------------------------------- v3.0 Mini-Spiele
  function openMini(spot) {
    const MG = window.MiniGames, info = MG.info[spot.kind];
    state = "mini"; joy.active = false; keys.clear();
    $("miniTitle").textContent = tr(info.title);
    $("miniSub").textContent = tr(info.sub);
    $("miniIc").innerHTML = I(info.icon);
    $("miniResult").classList.add("hidden");
    $("miniBtns").classList.remove("hidden");
    ui.mini.querySelector(".mini-dlg").classList.remove("done");
    show(ui.mini);
    MG.run(spot.kind, $("miniCanvas"), {
      tr, sound: (k, a) => { if (save.sound && window.GameAudio) GameAudio.mini(k, a); },
      done: (res) => miniDone(spot, res),
    });
    miniLive = false;
    if (window.GameAudio) GameAudio.ui("confirm");
  }
  function miniRewards(kind, tier) {
    const ci = run.mode === "campaign" ? cityIdx() : 0, base = Math.round((30 + 15 * ci) * (run.greed || 1));
    const out = [{ icon: "coin", text: tr("+{n} Münzen", { n: [Math.round(base * 0.4), base, Math.round(base * 1.6), Math.round(base * 2.4)][tier] }), apply: (n) => { run.coins += n; }, n: [Math.round(base * 0.4), base, Math.round(base * 1.6), Math.round(base * 2.4)][tier] }];
    if (tier >= 2) out.push({ icon: "grenade", text: tr("2 Wurfwaffen"), apply: () => { addThrow(null, 1, player.x, player.y - 40); addThrow(null, 1, player.x, player.y - 64); } });
    if (tier >= 2) out.push({ icon: "firstAid", text: tr("Heilt 30 % Leben"), apply: () => healPlayer(player.maxHp * 0.3) });
    if (tier >= 3) {
      if (kind === "schiess") { const m = rollMod(); if (m) out.push({ icon: "weapons", text: `${tr("Waffen-Mod")}: ${tr(m.name)}`, apply: () => giveMod(m) }); }
      else if (kind === "lukas") out.push({ icon: "upgrade", text: tr("Kraftpaket: +10 % max. Leben"), apply: () => { const a = Math.round(player.maxHp * 0.1); player.maxHp += a; player.hp += a; } });
      else out.push({ icon: "miniRadio", text: tr("Funkaufklärung: nächster Boss −15 % Leben"), apply: () => { run.bossIntel = true; } });
      out.push({ icon: "star", text: tr("Spezialfähigkeit sofort bereit"), apply: () => { run.ult = 100; } });
    }
    return out;
  }
  function miniDone(spot, res) {
    miniLive = false;
    const list = miniRewards(spot.kind, res.tier);
    const names = ["Niete", "Bronze", "Silber", "Gold"], tones = ["red", "bronze", "steel", "gold"];
    const el = $("miniResult");
    el.innerHTML = `<div class="mini-tier ${tones[res.tier]}">${medal(res.tier ? "trophy" : "close", res.tier === 3 ? "gold" : res.tier ? "steel" : "red")}<div><b>${tr(names[res.tier])}</b><small>${tr("Ergebnis")}: ${res.score}</small></div></div>`
      + `<ul class="mini-loot">${list.map((r) => `<li>${I(r.icon)}<span>${r.text}</span></li>`).join("")}</ul>`
      + `<button class="btn primary" id="miniTake">${tr("Belohnung einsacken")}</button>`;
    el.classList.remove("hidden");
    ui.mini.querySelector(".mini-dlg").classList.add("done");
    $("miniTake").onclick = () => {
      for (const r of list) r.apply(r.n);
      spot.done = true;
      track("minigames");
      if (res.tier === 3) track("minigold");
      window.MiniGames.stop();
      if (window.GameAudio) GameAudio.ui("confirm");
      resumePlay();
    };
  }
  $("miniGo").onclick = () => { $("miniBtns").classList.add("hidden"); miniLive = true; window.MiniGames.start(); if (window.GameAudio) GameAudio.ui("confirm"); };
  $("miniSkip").onclick = () => { window.MiniGames.stop(); miniLive = false; if (window.GameAudio) GameAudio.ui("back"); resumePlay(); };

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
  function fxMist(x, y, color, size = 1) { addP({ t: "mist", x, y, z: rand(10, 20), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.5, max: 0.5, size: 10 * size, color }); }
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
  // v3.0 Staub: hellbraune, flache Wölkchen (Schritte, Rolle, aufbrechender Boden)
  function fxDust(x, y, n = 1, size = 0.5) {
    for (let i = 0; i < n; i++) addP({ t: "smoke", x: x + rand(-5, 5), y: y + rand(-3, 3), vx: rand(-22, 22), vy: rand(-10, 4), life: rand(0.35, 0.6), max: 0.6, size: rand(0.7, 1.1) * size, rot: rand(0, TAU), rgb: "150,132,108", h: 4, rise: 12 });
  }
  function fxSmoke(x, y, n, size = 1, life = 1.2) {
    for (let i = 0; i < n; i++) {
      addP({ t: "smoke", x: x + rand(-8, 8) * size, y: y + rand(-8, 8) * size, vx: rand(-18, 18), vy: rand(-28, -6), life: life * rand(0.8, 1.2), max: life, size: rand(0.7, 1.15) * size, rot: rand(0, TAU) });
    }
  }
  function fxFire(x, y, size = 1, life = 0.45) { addP({ t: "fire", x, y, vx: rand(-18, 18), vy: rand(-50, -15), life, max: life, size: rand(9, 15) * size }); }
  function fxEmber(x, y) { addP({ t: "ember", x, y, vx: rand(-30, 30), vy: rand(-60, -20), life: rand(0.3, 0.6), max: 0.6, size: rand(2, 4) }); }
  // farbiger Dunst (Giftgas, Schemen-Nebel, Heilaura)
  function fxGas(x, y, size = 1, rgb = "150,200,60", life = 1.4) { addP({ t: "gas", x, y, vx: rand(-14, 14), vy: rand(-14, 8), life: life * rand(0.8, 1.2), max: life, size: rand(0.8, 1.2) * size, rot: rand(0, TAU), rgb }); }
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
        case "gas": p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 0.5; p.rot += dt * 0.4; break;
        case "mist": p.x += p.vx * dt; p.y += p.vy * dt; break;
        case "fire": case "ember": case "bubble": case "ice": p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 30 * dt; break;
        case "spark": p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 5 * dt; p.vy *= 1 - 5 * dt; break;
      }
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function addText(x, y, txt, color, size, crit = false) {
    const num = /^\d+!?$/.test(String(txt)); // v3.6 Schadenszahlen fliegen im Bogen auseinander, Ansagen bleiben ruhig stehen
    texts.push({ x, y, txt: String(txt), color, size, life: crit ? 1.05 : 0.8, max: crit ? 1.05 : 0.8, crit, num, vx: num ? rand(-26, 26) : 0, vy: num ? -rand(70, 110) : -34, rot: num && crit ? rand(-0.14, 0.14) : 0 });
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
    if (e.type === "bomber" || e.type === "nest" || e.type === "bloater") return "burst";
    if (e.type === "phantom") return "fade";
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
    if (death === "fade") {
      // Schemen zerfallen zu Nebel – kein Körper bleibt zurück
      for (let i = 0; i < 10; i++) fxGas(e.x + rand(-12, 12), e.y + rand(-12, 12), 1.1, "120,80,170", 1.2);
      fxFlash(e.x, e.y, 90, "190,140,255", 0.25); fxRing(e.x, e.y, 70, "190,140,255", 0.4);
      return;
    }
    if (death === "burst") {
      fxGibs(e.x, e.y, 9, e.def.blood);
      fxBlood(e.x, e.y, ang, 26, e.def.blood, 300);
      fxMist(e.x, e.y, e.def.blood, 2);
      splatter(e.x, e.y, ang, 1.5 + e.r / 30, e.def.blood);
      addPool(e.x, e.y, e.r * 1.6, e.def.blood, 0.1);
      if (dist2(e, player) < 80 * 80) splashScreen(3);
      fxFlash(e.x, e.y, 60, "160,20,20", 0.12);
      for (let i = 0; i < 3; i++) addPiece(e, i === 0 && Math.random() < 0.6 ? "head" : "limb", ang + rand(-1.2, 1.2), rand(160, 320), rand(180, 360));
      shake = Math.max(shake, 5);
      return;
    }
    const c = {
      type: e.type, v: e.variant, f: Math.floor(e.anim) % Sprites.FRAMES, x: e.x, y: e.y, z: 0, r: e.r * 0.8,
      face: e.face, sc: e.scale, t: 0, blood: e.def.blood, boss: e.def.boss, ref: e, death, evo: e.evo || 0,
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
  // Schüsse treffen auch, was am Boden liegt: Leichen zucken und rutschen weg, zu viele
  // Treffer zerfetzen sie; Körperteile werden weggekickt.
  function hitBodies(b) {
    const len = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / len, uy = b.vy / len;
    for (const c of corpses) {
      if (c.gone || c.death === "freeze" || c.z > 6 || c.fall < 0.6 || b.hit.has(c)) continue;
      const rr = c.r + b.r + 2;
      if ((c.x - b.x) ** 2 + (c.y - b.y) ** 2 > rr * rr) continue;
      b.hit.add(c);
      const heavy = b.big || (b.knock || 0) >= 12, mass = c.boss ? 5 : Math.max(1, c.r / 12);
      const push = (60 + (b.knock || 0) * 9) / mass;
      c.vx += ux * push; c.vy += uy * push; c.vz += (heavy ? 60 : 20) / mass;
      c.spin += rand(-3, 3) / mass; c.settled = false;
      fxBlood(c.x, c.y, Math.atan2(uy, ux), heavy ? 4 : 2, c.blood, 150);
      stampDot(c.x + rand(-4, 4), c.y + rand(-4, 4), rand(1.4, 2.6), c.blood);
      if (!c.boss) { c.hp = (c.hp ?? 3 + c.r / 6) - (heavy || b.kind === "disc" ? 2 : 1); if (c.hp <= 0) gibCorpse(c, Math.atan2(uy, ux)); }
    }
    for (const q of pieces) {
      if (q.z > 6 || (q.x - b.x) ** 2 + (q.y - b.y) ** 2 > 64) continue;
      q.vx += ux * 160 + rand(-30, 30); q.vy += uy * 160 + rand(-30, 30); q.vz += rand(90, 170);
      q.wx += rand(-12, 12); q.wy += rand(-12, 12); q.settled = false;
      stampDot(q.x, q.y, 1.6, q.blood);
    }
  }
  function gibCorpse(c, ang) {
    c.gone = true;
    fxGibs(c.x, c.y, 6, c.blood);
    fxBlood(c.x, c.y, ang, 16, c.blood, 260);
    fxMist(c.x, c.y, c.blood, 1.5);
    splatter(c.x, c.y, ang, 0.8 + c.r / 40, c.blood);
    addPool(c.x, c.y, c.r * 1.4 * c.sc, c.blood, 0.05);
    const shim = { type: c.type, variant: c.v, scale: c.sc, r: c.r / 0.8, def: { blood: c.blood }, x: c.x, y: c.y };
    for (let i = 0; i < 2; i++) addPiece(shim, "limb", ang + rand(-1.3, 1.3), rand(120, 240), rand(140, 260), 6);
    if (!c.headless) addPiece(shim, "head", ang + rand(-0.6, 0.6), rand(140, 240), rand(180, 300), 6);
    sfx("splat");
    shake = Math.max(shake, 2.5);
    fx4d("gib");
    track("gibs", 1);
  }
  // Abgeschossener Arm: fliegt von der Schulter weg, der Stumpf spritzt, der Zombie schlägt schwächer zu
  const HUMANOID = new Set(["walker", "runner", "spitter", "bomber", "brute", "leaper", "burner", "screamer", "splitter", "electro", "healer", "thrower", "burrower", "phantom", "warden", "bloater", "gunner", "wiesn", "jeck", "schaffner", "beamter", "zwerg", "ultra", "scooter", "paketbote", "rentner", "zugfuehrer", "krampus", "bierkoenig", "narrenkoenig", "kapitaen", "wengerter", "goetz"]);
  function severArm(e) {
    const free = [-1, 1].filter((s) => !(e.armOff && e.armOff[s]));
    if (!free.length) return;
    const s = free[Math.floor(Math.random() * free.length)];
    (e.armOff ||= {})[s] = true;
    if (e.type !== "bomber" && e.type !== "spitter") e.dmg *= 0.7; // Nahkampf mit nur einem Arm
    e.stumpT = 1.6; e.stumpSide = s;
    const a = e.face + s * Math.PI / 2, sx = e.x + Math.cos(a) * e.r * 0.7, sy = e.y + Math.sin(a) * e.r * 0.7;
    const out = (e.hitAng ?? a) * 0.5 + a * 0.5;
    addPiece({ ...e, x: sx, y: sy }, "limb", out + rand(-0.4, 0.4), rand(160, 260), rand(160, 280), e.r * 1.9 * e.scale);
    fxBlood(sx, sy, a, 10, e.def.blood, 260);
    fxMist(sx, sy, e.def.blood, 1.1);
    sfx("splat");
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
      if (c.headless && c.t < 2.4) {
        // Halsschlagader: kräftige Stöße im Herzschlag, dazwischen ein Rinnsal, immer schwächer
        const strong = (c.t * 2.2) % 1 < 0.16, fade = 1 - c.t / 2.4, na = c.face + (c.fallDir > 0 ? Math.PI : 0);
        const nx = c.x + Math.cos(na) * 10 * c.fall, ny = c.y + Math.sin(na) * 10 * c.fall;
        if (strong || Math.random() < 0.25 * fade) for (let i = 0; i < (strong ? 3 : 1); i++) {
          const a = na + rand(-0.5, 0.5), sp = (strong ? rand(70, 190) : rand(10, 50)) * fade;
          addP({ t: "blood", x: nx, y: ny, z: 6 + (1 - c.fall) * 22, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (strong ? rand(150, 300) : rand(30, 90)) * (0.5 + fade * 0.5), life: 1.2, max: 1.2, color: c.blood, size: rand(1.2, 2.6) });
        }
      }
      if (c.settled) continue;
      const fast = Math.hypot(c.vx, c.vy);
      if (moveBody(c, dt, c.r, 0.25)) { splatter(c.x, c.y, Math.atan2(c.vy, c.vx), 0.5 + c.r / 40, c.blood); shake = Math.max(shake, 2); }
      if (c.z > 0) c.roll += c.rollV * dt; else { c.rollV *= Math.exp(-6 * dt); c.roll += (Math.round(c.roll / Math.PI) * Math.PI - c.roll) * Math.min(1, dt * 6); }
      c.face += c.spin * dt;
      c.spin *= c.z > 0 ? 1 : Math.exp(-5 * dt);
      // Blutspur beim Rutschen
      if (c.z === 0 && fast > 60 && Math.random() < 0.6) stampDot(c.x + rand(-3, 3), c.y + rand(-3, 3), rand(1.5, 3), c.blood);
      if (c.z === 0 && fast < 8 && c.t > fallTime) {
        c.settled = true;
        if (!c.pooled && c.death !== "burn") { c.pooled = true; addPool(c.x, c.y, c.r * (c.headless ? 2.6 : 1.9) * (c.boss ? 1.5 : 1) * c.sc, c.blood); }
      }
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
      if (q.z === 0 && Math.hypot(q.vx, q.vy) < 6 && q.t > 0.4) { q.settled = true; if (!q.pooled) { q.pooled = true; addPool(q.x, q.y, q.kind === "head" ? 9 : 6, q.blood, 0.1); } }
    }
    // Zu viele Leichen: die ältesten ruhenden einbacken (bleiben sichtbar, kosten aber nichts mehr)
    let live = corpses.length;
    for (const c of corpses) { if (live <= MAX_LIVE_CORPSES) break; if (c.settled && !c.gone) { bakeCorpse(c); c.baked = true; live--; } }
    corpses = corpses.filter((c) => !c.gone && !c.baked);
  }
  function bakeCorpse(c) {
    // In 3D übernimmt der Renderer den Körper in sein Sammel-Mesh – nur in 2D als Bild auf den Boden
    if (!mode3d) stamp(Sprites.zombieFx(c.type, c.f, c.v, "corpse", c.evo), c.x, c.y, c.face + c.fallDir * 0.4, c.sc * 0.88, 0.8);
  }

  // Umgebungs-Partikel: Asche (Straße), Staub (Krankenhaus), Sporen (Labor)
  function initAmbient() {
    ambient = [];
    for (let i = 0; i < Math.round(28 * AREA_K); i++) ambient.push({ x: rand(L, R), y: rand(T, B), size: rand(1, 2.4), ph: rand(0, TAU) });
  }
  // v3.4 Krähenschwarm landen lassen (Bodenvögel um einen Punkt)
  function landFlock(x, y, n) {
    for (let i = 0; i < n; i++) birds.push({ x: clamp(x + rand(-46, 46), L + 10, R - 10), y: clamp(y + rand(-30, 30), T + 10, B - 10), z: 0, vx: 0, vy: 0, vz: 0, face: rand(0, TAU), fly: false, t: rand(0, 5), peck: 0, hop: rand(0.5, 2) });
  }
  function updateBirds(dt) {
    if (!birds.length) return;
    const p = player;
    for (const b of birds) {
      b.t += dt;
      if (!b.fly) {
        // Aufschrecken: Held zu nah, Schuss oder Explosion in der Nähe, Gegner läuft durch
        const scare = (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 150 * 150 || bullets.some((q) => (q.x - b.x) ** 2 + (q.y - b.y) ** 2 < 50 * 50) || particles.some((q) => q.t === "boom" && (q.x - b.x) ** 2 + (q.y - b.y) ** 2 < 260 * 260) || enemies.some((e) => !e.dead && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < 30 * 30);
        if (scare) {
          const a = Math.atan2(b.y - p.y, b.x - p.x) + rand(-0.8, 0.8), sp = rand(170, 240);
          Object.assign(b, { fly: true, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, vz: rand(95, 135), face: a });
          if (!run.cawT || run.time - run.cawT > 1.2) { run.cawT = run.time; sfx("kick"); }
          continue;
        }
        b.peck = Math.max(0, b.peck - dt);
        if ((b.hop -= dt) <= 0) { b.hop = rand(0.6, 2.2); if (Math.random() < 0.5) b.peck = 0.35; else { b.face += rand(-1.2, 1.2); b.x += Math.cos(b.face) * 6; b.y += Math.sin(b.face) * 6; } }
      } else {
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz = Math.max(45, b.vz - 14 * dt);
        b.vx += Math.sin(b.t * 3) * 30 * dt;
        b.face = Math.atan2(b.vy, b.vx);
      }
    }
    birds = birds.filter((b) => !b.fly || (b.z < 260 && b.x > L - 200 && b.x < R + 200 && b.y > T - 300 && b.y < B + 200));
  }
  function drawBirds(flying) {
    for (const b of birds) {
      if (b.fly !== flying) continue;
      ctx.save(); ctx.translate(b.x, b.y - b.z * 0.6); ctx.rotate(b.face); ctx.scale(1.4, 1.4);
      if (flying) {
        ctx.globalAlpha = 0.25; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(0, b.z * 0.6, 6, 3, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        const f = Math.sin(b.t * 22) * 7;
        ctx.strokeStyle = "#0e0e10"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-1, -9 - f * 0.4); ctx.quadraticCurveTo(1, -3, 0, 0); ctx.quadraticCurveTo(1, 3, -1, 9 + f * 0.4); ctx.stroke();
      }
      ctx.fillStyle = "#121214"; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.2, 0, 0, TAU); ctx.fill();
      const hx = b.peck > 0 ? 7 + Math.sin(b.peck * 30) * 1.5 : 5.5;
      ctx.fillStyle = "#18181a"; ctx.beginPath(); ctx.arc(hx, 0, 2.4, 0, TAU); ctx.fill(); ctx.fillStyle = "#4a4436"; ctx.fillRect(hx + 1.6, -0.6, 2.6, 1.2);
      ctx.fillStyle = "#0a0a0c"; ctx.beginPath(); ctx.moveTo(-5, -1.6); ctx.lineTo(-10, 0); ctx.lineTo(-5, 1.6); ctx.fill();
      ctx.restore();
    }
  }
  function updateAmbient(dt) {
    const th = theme();
    for (const a of ambient) {
      a.ph += dt;
      if (th === "street" || th === "markt") { a.x += (Math.sin(a.ph * 0.7) * 8 + 6) * dt; a.y += 14 * dt; }
      else if (th === "hospital") { a.x += Math.sin(a.ph * 0.5) * 6 * dt; a.y += Math.cos(a.ph * 0.4) * 5 * dt; }
      else { a.y -= 12 * dt; a.x += Math.sin(a.ph) * 6 * dt; }
      if (a.y > B) a.y = T; else if (a.y < T) a.y = B;
      if (a.x > R) a.x = L; else if (a.x < L) a.x = R;
    }
  }

  function updateFx(dt) {
    updateParticles(dt);
    updatePools(dt);
    if (callout && (callout.life -= dt) <= 0) callout = null;
    for (const d of screenBlood) { d.life -= dt; d.dy += dt * (6 + d.s * 3); } // langsam herunterlaufen
    if (screenBlood.length) screenBlood = screenBlood.filter((d) => d.life > 0);
    for (const t of texts) { t.life -= dt; t.x += (t.vx || 0) * dt; t.y += (t.vy ?? -34) * dt; if (t.num) { t.vy += 190 * dt; t.vx *= 1 - 2 * dt; } }
    texts = texts.filter((t) => t.life > 0);
    updateCorpses(dt);
    for (const z of zaps) z.life -= dt;
    zaps = zaps.filter((z) => z.life > 0);
    updateAmbient(dt);
    updateBirds(dt);
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
    shake = Math.max(0, shake - dt * 30);
    punchX *= Math.max(0, 1 - 14 * dt); punchY *= Math.max(0, 1 - 14 * dt);
    if (Math.abs(punchX) + Math.abs(punchY) < 0.12) punchX = punchY = 0;
    punchFov = Math.max(0, punchFov - dt * 22);
    for (const g of ghosts) g.life -= dt;
    if (killCam && (killCam.t -= dt) <= 0) killCam = null;
    if (ghosts.length) ghosts = ghosts.filter((g) => g.life > 0);
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
    updateEnemies(dt * puEnemyK()); // v3.7 Zeitlupe bremst nur die Gegner
    // Schwer verletzte Zombies hinterlassen eine Blutspur
    for (const e of enemies) {
      if (e.stumpT > 0 && !e.dead) {
        // Armstumpf pulsiert im Herzschlag
        e.stumpT -= dt;
        if ((run.time * 2.6) % 1 < 0.2 || Math.random() < 0.15) {
          const a = e.face + e.stumpSide * Math.PI / 2, sx = e.x + Math.cos(a) * e.r * 0.7, sy = e.y + Math.sin(a) * e.r * 0.7, sp = rand(40, 130) * (0.4 + e.stumpT / 1.6);
          const d = a + rand(-0.5, 0.5);
          addP({ t: "blood", x: sx, y: sy, z: e.r * 1.8 * e.scale, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, vz: rand(40, 140), life: 1, max: 1, color: e.def.blood, size: rand(1.2, 2.2) });
        }
      }
      if (e.dead || e.spawnT > 0 || e.def.armor || e.hp > e.maxHp * 0.5 || (e.dripT = (e.dripT || 0) - dt) > 0) continue;
      e.dripT = rand(0.12, 0.35) * (0.4 + e.hp / e.maxHp);
      stampDot(e.x + rand(-5, 5), e.y + rand(-5, 5), rand(0.9, 2) * (e.def.boss ? 2 : 1), e.def.blood);
    }
    updateObjective(dt);
    updateLandmark();
    updateEvent();
    updateFuses(dt);
    updateHazards(dt);
    updateLobs(dt * puEnemyK());
    updateThrowables(dt);
    updateHordes(dt);
    updateCars(dt);
    // v3.0 Feuertonnen: Flammen und Funken steigen aus der Tonne
    for (const o of obstacles) if (o.kind === "feuertonne" && Math.random() < dt * 14) {
      const f = { t: "fire", x: o.x + o.w / 2 + rand(-5, 5), y: o.y + o.h / 2 + rand(-4, 4), vx: rand(-8, 8), vy: rand(-26, -10), life: rand(0.35, 0.6), max: 0.6, size: rand(6, 10), z: 26 };
      addP(f);
      if (Math.random() < 0.3) addP({ t: "ember", x: f.x, y: f.y, vx: rand(-20, 20), vy: rand(-50, -20), life: rand(0.5, 0.9), max: 0.9, size: rand(1.5, 3), z: 30 });
    }
    updateParcels(dt);
    updateFireworks(dt);
    updateBullets(dt);
    updateOrbs(dt);
    if (supplyCrate) supplyCrate.bob += dt;
    if (miniSpot) miniSpot.bob += dt;
    if (run.cleared) run.doorK = Math.min(1, (run.doorK || 0) + dt * 1.8);
    if (run.comboT > 0 && (run.comboT -= dt) <= 0) run.combo = 0;
    if (run.rage > 0) run.rage -= dt;
    updatePowers(dt);
    updateLooter();
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
      renderSettings(); // Kamera-Knopf im Pausenmenü aktuell halten
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

  // ============================================================
  // v2.6 Ausrüstung · v3.3: sieben Plätze, Zusatz-Eigenschaften, legendäre Effekte, Beutekisten, Händler
  // ============================================================
  // names[r] = Namensvarianten je Seltenheit (Index 0 = Name aus v2.6, alte Spielstände ohne it.n bleiben gleich)
  const GEAR_SLOTS = {
    helm: { name: "Helm", icon: "helm", label: "−{v} % Schaden erlitten", base: 1.6, names: [["Bauhelm", "Fahrradhelm"], ["Stahlhelm", "Grubenhelm"], ["Einsatzhelm mit Visier", "Feuerwehrhelm"], ["Florians Feuerhelm"]], legend: { desc: "Immun gegen Flammen", apply: (p) => { p.fireproof = true; } } },
    vest: { name: "Weste", icon: "heartArmor", label: "+{v} % Leben", base: 4, names: [["Stoffweste", "Warnweste", "Anglerweste"], ["Splitterschutzweste", "Polizeiweste"], ["Kevlarweste", "SEK-Einsatzweste"], ["Panzerweste Bollwerk"]], legend: { desc: "+1 Wiederbelebung je Einsatz", apply: (p) => { p.revives += 1; } } },
    gloves: { name: "Handschuhe", icon: "gloves", label: "+{v} % Feuerrate", base: 2.5, names: [["Arbeitshandschuhe", "Gartenhandschuhe"], ["Lederhandschuhe", "Motorradhandschuhe"], ["Taktische Handschuhe", "Kettenhandschuhe"], ["Götz' eiserne Hand"]], legend: { desc: "+1 Durchschlag", apply: (p) => { p.pierce += 1; } } },
    badge: { name: "Abzeichen", icon: "medal", label: "+{v} % Schaden", base: 3, names: [["Blechmarke", "Vereinsnadel"], ["Schützenschnur", "Sportabzeichen"], ["Feuerwehr-Ehrenzeichen", "Rettungsmedaille"], ["Goldene Götz-Medaille"]], legend: { desc: "+25 % Schaden gegen Bosse und Elite", apply: (p) => { p.bigGame = (p.bigGame || 1) * 1.25; } } },
    pack: { name: "Rucksack", icon: "backpack", label: "+{v} % Erfahrung", base: 4, names: [["Turnbeutel", "Jutebeutel"], ["Schulranzen", "Wanderrucksack"], ["Bundeswehr-Rucksack", "Notfallrucksack"], ["Rucksack des Weltenbummlers"]], legend: { desc: "+2 Wurfwaffen zum Start", apply: (p) => { p.beltBonus = (p.beltBonus || 0) + 2; } } },
    boots: { name: "Stiefel", icon: "run", label: "+{v} % Tempo", base: 2, names: [["Turnschuhe", "Gummistiefel"], ["Arbeitsstiefel", "Wanderschuhe"], ["Springerstiefel", "Kampfstiefel"], ["Siebenmeilenstiefel"]], legend: { desc: "Ausweichrolle mit Druckwelle", apply: (p) => { p.dashBlast = true; } } },
    charm: { name: "Talisman", icon: "charm", label: "+{v} % Krit-Chance", base: 1.5, names: [["Glückscent", "Kronkorken-Kette"], ["Hufeisen", "Vierblättriges Kleeblatt"], ["Glücksschwein aus Marzipan", "Bernstein-Amulett"], ["Kaiserlicher Glückstaler"]], legend: { desc: "+1 Gratis-Neuwurf, +10 % Münzen", apply: () => { run.freeRerolls = (run.freeRerolls || 0) + 1; run.greed *= 1.1; } } },
  };
  const GEAR_RARITY = [
    { name: "Gewöhnlich", tone: "steel", mul: 1, scrap: 25, price: 0, rgb: "200,205,210" },
    { name: "Selten", tone: "ice", mul: 2, scrap: 55, price: 1200, rgb: "74,168,255" },
    { name: "Episch", tone: "violet", mul: 3.2, scrap: 110, price: 3100, rgb: "176,122,255" },
    { name: "Legendär", tone: "gold", mul: 5, scrap: 240, price: 8200, rgb: "255,194,58" },
  ];
  // Zusatz-Eigenschaft: ab „Selten“ möglich, ab „Episch“ immer – Stärke wächst mit der Seltenheit
  const GEAR_AFFIX = {
    coin: { label: "+{v} % Münzen", base: 3, apply: (p, v) => { run.greed *= 1 + v / 100; } },
    dodge: { label: "+{v} % Ausweichen", base: 1.5, apply: (p, v) => { p.dodge += v / 100; } },
    dash: { label: "−{v} % Abklingzeit Ausweichrolle", base: 4, apply: (p, v) => { p.dashCdMul *= 1 - v / 100; } },
    ult: { label: "+{v} % Spezial-Energie", base: 5, apply: (p, v) => { p.ultGain = (p.ultGain || 1) * (1 + v / 100); } },
    critdmg: { label: "+{v} % Krit-Schaden", base: 6, apply: (p, v) => { p.critMul += v / 100; } },
    heal: { label: "Abschüsse heilen {v} ‰", base: 1, apply: (p, v) => { p.lifesteal += v / 1000; } },
  };
  const AFFIX_MUL = [0, 1, 1.6, 2.4];
  const GEAR_BAG_MAX = 16;
  const GEAR_BOX_PRICE = 1100, GEAR_REROLL_PRICE = 260; // v3.4 teurer
  const gearNames = (it) => GEAR_SLOTS[it.s].names[it.r];
  const gearName = (it) => { const n = gearNames(it); return tr(n[(it.n || 0) % n.length]); };
  const gearStat = (it) => tr(GEAR_SLOTS[it.s].label, { v: it.v });
  const affixStat = (it) => (it.a && GEAR_AFFIX[it.a.k] ? tr(GEAR_AFFIX[it.a.k].label, { v: it.a.v }) : "");
  const gearTrait = (it) => (it.r === 3 ? tr(GEAR_SLOTS[it.s].legend.desc) : "");
  const gearLines = (it) => [gearStat(it), affixStat(it), gearTrait(it)].filter(Boolean);
  const gearBetter = (it, cur) => !cur || it.r > cur.r || (it.r === cur.r && it.v + (it.a ? 1 : 0) > cur.v + (cur.a ? 1 : 0));
  const gearPower = (it) => (it ? Math.round(it.v * 10 + (it.a ? it.a.v * 4 : 0) + it.r * 25 + (it.r === 3 ? 60 : 0)) : 0);
  // feste Würfel für Händler-Angebote (gleiche Ware für den ganzen Tag)
  function seededRng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rollRarity(luck, rng) { const x = rng(); return x < 0.03 + luck * 0.6 ? 3 : x < 0.15 + luck ? 2 : x < 0.5 + luck ? 1 : 0; }
  function makeGear(slot, r, rng = Math.random) {
    const sl = GEAR_SLOTS[slot];
    const v = Math.max(1, Math.round(sl.base * GEAR_RARITY[r].mul * (0.9 + rng() * 0.2)));
    const it = { id: Date.now().toString(36) + Math.floor(rng() * 1e9).toString(36), s: slot, r, v, n: Math.floor(rng() * sl.names[r].length) };
    if (r >= 2 || (r === 1 && rng() < 0.35)) {
      const keys = Object.keys(GEAR_AFFIX), k = keys[Math.floor(rng() * keys.length)];
      it.a = { k, v: Math.max(1, Math.round(GEAR_AFFIX[k].base * AFFIX_MUL[r] * (0.85 + rng() * 0.3))) };
    }
    return it;
  }
  function rollGear(luck = 0, rng = Math.random) {
    const keys = Object.keys(GEAR_SLOTS);
    return makeGear(keys[Math.floor(rng() * keys.length)], rollRarity(luck, rng), rng);
  }
  // Beute kommt in die Tasche; ist sie voll, wird das schwächste Teil automatisch zerlegt
  function addToBag(it) {
    save.gearBag = (save.gearBag || []).concat(it);
    if (save.gearBag.length > GEAR_BAG_MAX) {
      const worst = save.gearBag.reduce((a, b) => (gearPower(b) < gearPower(a) ? b : a));
      save.gearBag = save.gearBag.filter((q) => q !== worst);
      save.coins += GEAR_RARITY[worst.r].scrap;
    }
    track("gear");
    persist();
    return it;
  }
  const grantGear = (luck = 0) => addToBag(rollGear(luck));
  // v3.3 seltene Beutekisten: Elite-Gegner (7 % + 1 % je Bedrohung), Kopfgeld-Ziele (40 %), Bosse im Überlebensmodus (immer)
  const lootLuck = () => 0.012 * (run.threat || 0) + (run.mode === "campaign" ? 0.008 * cityIdx() : 0.004 * Math.floor((run.survT || 0) / 60));
  function dropGear(x, y, luck = lootLuck()) {
    const o = makeOrb(x, y, "gear", 1);
    o.item = rollGear(luck); o.r = 10; o.vx *= 0.5; o.vy *= 0.5;
    orbs.push(o);
    fxRing(x, y, 70, GEAR_RARITY[o.item.r].rgb, 0.5);
    addText(x, y - 40, tr("BEUTEKISTE!"), `rgb(${GEAR_RARITY[o.item.r].rgb})`, 17, true);
    return o;
  }
  // nicht eingesammelte Beutekisten gehen beim Raumwechsel und am Einsatzende nicht verloren
  function bankLoot() {
    if (!run || !orbs.some((o) => o.type === "gear" && !o.dead)) return;
    for (const o of orbs) if (o.type === "gear" && !o.dead) { addToBag(o.item); run.loot = (run.loot || 0) + 1; o.dead = true; }
    orbs = orbs.filter((o) => !o.dead);
  }
  function pickGear(o) {
    const it = addToBag(o.item);
    run.loot = (run.loot || 0) + 1;
    const rgb = GEAR_RARITY[it.r].rgb;
    fxRing(player.x, player.y, 80, rgb, 0.5);
    addText(player.x, player.y - 56, `${gearName(it)}`, `rgb(${rgb})`, it.r >= 2 ? 19 : 16, it.r >= 2);
    sfx(it.r >= 2 ? "level" : "coin"); fx4d(it.r >= 3 ? "level" : "kick");
    toast(`${tr("Beute")}: ${gearName(it)} · ${tr(GEAR_RARITY[it.r].name)}`, GEAR_SLOTS[it.s].icon);
  }
  // v3.4 Aussehen: Seltenheit je angelegtem Platz an den 3D-Helden (und das 2D-Sprite) melden
  // eigene Platzliste: init3d läuft schon beim Laden, bevor GEAR_SLOTS (const) angelegt ist
  function gearLookOf() { const g = save.gear || {}, look = {}; for (const k of ["helm", "vest", "gloves", "badge", "pack", "boots", "charm"]) if (g[k]) look[k] = g[k].r; return look; }
  function syncGearLook() { if (window.Render3D && Render3D.setGear) Render3D.setGear(gearLookOf()); }
  function applyGear(p) {
    const g = save.gear || {};
    for (const [k, it] of Object.entries(g)) {
      if (!it || !GEAR_SLOTS[k]) continue;
      const f = 1 + it.v / 100;
      if (k === "vest") { p.maxHp = Math.round(p.maxHp * f); p.hp = p.maxHp; }
      else if (k === "boots") p.speed *= f;
      else if (k === "badge") p.dmgMul *= f;
      else if (k === "helm") p.dmgTaken = (p.dmgTaken || 1) * (1 - it.v / 100);
      else if (k === "gloves") p.rateMul *= f;
      else if (k === "pack") p.xpGain = (p.xpGain || 1) * f;
      else if (k === "charm") p.crit += it.v / 100;
      if (it.a && GEAR_AFFIX[it.a.k]) GEAR_AFFIX[it.a.k].apply(p, it.a.v);
      if (it.r === 3) GEAR_SLOTS[k].legend.apply(p);
    }
  }
  // Summe aller angelegten Werte für die Übersicht
  function gearTotals() {
    const g = save.gear || {}, out = [];
    for (const [k, it] of Object.entries(g)) if (it && GEAR_SLOTS[k]) out.push(...gearLines(it));
    return out;
  }
  function renderGear() {
    const g = save.gear || (save.gear = {});
    syncGearLook();
    const power = Object.values(g).reduce((a, it) => a + gearPower(it), 0);
    const slotHtml = Object.entries(GEAR_SLOTS).map(([k, sl]) => {
      const it = g[k];
      const extra = it ? [affixStat(it), gearTrait(it)].filter(Boolean).map((s) => `<i>${s}</i>`).join("") : "";
      return `<button class="gear-slot gs-${k}${it ? " r" + it.r : ""}" data-slot="${k}">${medal(sl.icon, it ? GEAR_RARITY[it.r].tone : "steel")}<small>${tr(sl.name)}</small><b>${it ? softHyphen(gearName(it)) : tr("leer")}</b><em>${it ? gearStat(it) : "–"}</em>${extra}</button>`;
    }).join("");
    $("gearSlots").innerHTML = `<div class="gear-power"><small>${tr("Kampfwert")}</small><b>${power}</b></div>${slotHtml}<button class="gear-dealer" id="gearDealer">${I("dealer")}<span>${tr("Händler")}</span></button>`;
    // angelegtes Teil antippen = ablegen (zurück in die Tasche)
    for (const b of $("gearSlots").querySelectorAll(".gear-slot")) b.addEventListener("click", () => {
      const k = b.dataset.slot, it = g[k];
      if (!it) return;
      if ((save.gearBag || []).length >= GEAR_BAG_MAX) { toast(tr("Tasche voll"), "backpack"); return; }
      delete g[k]; save.gearBag = (save.gearBag || []).concat(it); persist(); sfx("coin"); renderGear();
    });
    $("gearDealer").addEventListener("click", () => { shopTab = "gear"; renderShop(); show(ui.shop); });
    const tot = gearTotals();
    const bag = (save.gearBag || []).slice().sort((a, b) => b.r - a.r || gearPower(b) - gearPower(a));
    $("gearHint").innerHTML = (tot.length ? `<span class="gear-sum">${tot.join(" · ")}</span>` : "") + (bag.length
      ? tr("Tasche {n}/{m} · Beute von Bossen, Elite-Gegnern und Kopfgeld-Zielen", { n: bag.length, m: GEAR_BAG_MAX })
      : tr("Bosse, Elite-Gegner und Kopfgeld-Ziele lassen Beutekisten fallen. Höhere Bedrohung = bessere Beute."));
    const list = $("gearBag");
    list.innerHTML = "";
    for (const it of bag) {
      const cur = g[it.s], better = gearBetter(it, cur);
      const desc = `${tr(GEAR_RARITY[it.r].name)} · ${tr(GEAR_SLOTS[it.s].name)} · ${gearLines(it).join(" · ")}${cur ? ` (${tr("jetzt")}: ${gearStat(cur)})` : ""}`;
      const row = shopRow(medal(GEAR_SLOTS[it.s].icon, GEAR_RARITY[it.r].tone), gearName(it), desc, better ? `<span class="tag">${tr("BESSER")}</span>` : "", tr("Anlegen"), true, () => {
        save.gearBag = save.gearBag.filter((q) => q.id !== it.id);
        if (cur) save.gearBag.push(cur);
        g[it.s] = it; persist(); sfx("level"); toast(`${gearName(it)}: ${gearStat(it)}`, GEAR_SLOTS[it.s].icon); renderGear();
      }, better ? "primary" : "");
      row.classList.add("gear-r" + it.r);
      const scrap = document.createElement("button");
      scrap.className = "btn ghost";
      scrap.innerHTML = `${tr("Zerlegen")} ${coinAmt(GEAR_RARITY[it.r].scrap, "+")}`;
      scrap.addEventListener("click", () => { save.gearBag = save.gearBag.filter((q) => q.id !== it.id); save.coins += GEAR_RARITY[it.r].scrap; persist(); sfx("coin"); renderGear(); refreshMenu(); });
      row.querySelector(".acts").appendChild(scrap);
      list.appendChild(row);
    }
    for (const el of document.querySelectorAll(".coinsVal")) el.textContent = num(save.coins);
  }
  // Händler: vier Angebote pro Tag (keine gewöhnlichen Teile), Preis nach Seltenheit; dazu eine Zufallskiste und neue Ware
  const gearOfferPrice = (it) => Math.round(GEAR_RARITY[it.r].price * (it.a ? 1.2 : 1) / 10) * 10;
  function dealerStock() {
    const day = dayNo();
    if (!save.gearShop || save.gearShop.day !== day) save.gearShop = { day, roll: 0, items: null };
    const gs = save.gearShop;
    if (!gs.items) {
      const rng = seededRng(day * 977 + gs.roll * 131 + 7);
      const keys = Object.keys(GEAR_SLOTS);
      gs.items = [];
      for (let i = 0; i < 4; i++) {
        const x = rng(), cm = save.cityMax || 0; // v3.4: episch erst ab Stuttgart, legendär ab Nürnberg im Angebot
        const r = x < 0.1 && cm >= 3 ? 3 : x < 0.45 && cm >= 1 ? 2 : 1;
        let slot = keys[Math.floor(rng() * keys.length)];
        while (gs.items.some((q) => q.s === slot)) slot = keys[(keys.indexOf(slot) + 1) % keys.length];
        gs.items.push(makeGear(slot, r, rng));
      }
      persist();
    }
    return gs;
  }
  function renderGearShop(list) {
    const gs = dealerStock(), g = save.gear || {};
    const head = document.createElement("p");
    head.className = "dealer-note";
    head.textContent = tr("Neue Ware jeden Tag · Tasche {n}/{m}", { n: (save.gearBag || []).length, m: GEAR_BAG_MAX });
    list.appendChild(head);
    for (const it of gs.items) {
      const price = gearOfferPrice(it), sold = !!it.sold, cur = g[it.s];
      const desc = `${tr(GEAR_RARITY[it.r].name)} · ${tr(GEAR_SLOTS[it.s].name)} · ${gearLines(it).join(" · ")}${cur ? ` (${tr("jetzt")}: ${gearStat(cur)})` : ""}`;
      const tag = sold ? `<span class="tag">${tr("VERKAUFT")}</span>` : gearBetter(it, cur) ? `<span class="tag">${tr("BESSER")}</span>` : "";
      const row = shopRow(medal(GEAR_SLOTS[it.s].icon, GEAR_RARITY[it.r].tone), gearName(it), desc, tag, sold ? I("check") : coinAmt(price), !sold && save.coins >= price, () => {
        if (sold || save.coins < price) return;
        save.coins -= price; it.sold = true;
        const { sold: _s, ...copy } = it;
        addToBag({ ...copy, id: copy.id + "b" });
        persist(); sfx("level"); toast(`${gearName(it)}!`, GEAR_SLOTS[it.s].icon); renderShop();
      }, "amber");
      row.classList.add("gear-r" + it.r);
      list.appendChild(row);
    }
    list.appendChild(shopRow(medal("lootCrate", "amber"), tr("Ausrüstungskiste"), tr("Zufälliges Teil – mit Glück episch oder legendär"), "", coinAmt(GEAR_BOX_PRICE), save.coins >= GEAR_BOX_PRICE, () => {
      if (save.coins < GEAR_BOX_PRICE) return;
      save.coins -= GEAR_BOX_PRICE;
      const it = addToBag(rollGear(0.05));
      sfx(it.r >= 2 ? "level" : "coin"); toast(`${gearName(it)} · ${tr(GEAR_RARITY[it.r].name)}`, GEAR_SLOTS[it.s].icon); renderShop();
    }, "amber"));
    list.appendChild(shopRow(medal("dealer", "steel"), tr("Neue Ware"), tr("Tauscht alle vier Angebote aus"), "", coinAmt(GEAR_REROLL_PRICE), save.coins >= GEAR_REROLL_PRICE, () => {
      if (save.coins < GEAR_REROLL_PRICE) return;
      save.coins -= GEAR_REROLL_PRICE; gs.roll++; gs.items = null; persist(); sfx("coin"); renderShop();
    }));
  }

  // ============================================================
  // v2.5 Bedrohungsstufen, Tagesbefehl, Punkte & Bestenliste
  // ============================================================
  // Schwierigkeitsleiter wie im Genre üblich: jede Stufe wird mit einem Stadt-Boss-Sieg auf der Stufe davor freigeschaltet
  const THREAT_MAX = 5;
  const threatHp = (t) => 1 + 0.25 * t, threatDmg = (t) => 1 + 0.12 * t;
  const threatScore = (t) => 1 + 0.5 * t;
  function threatInfoText(t) {
    if (!t) return (save.threatMax || 0) > 0 ? tr("Normal – ohne Aufschlag") : tr("Besiege einen Stadt-Boss, um Bedrohung 1 freizuschalten");
    return tr("Gegner +{h} % Leben · +{c} % Münzen · ×{s} Punkte", { h: t * 25, c: t * 25, s: threatScore(t).toLocaleString(I18N.lang) }) + (t >= 2 ? ` · ${tr("Elite in jedem Bezirk")}` : "") + (t >= 4 ? ` · ${tr("Bosse mit Elite-Eskorte")}` : "") + (t >= 5 ? ` · ${tr("Bosse zäher und früher rasend")}` : "");
  }
  // Tagesbefehl: der Überlebensmodus bekommt jeden Tag eine eigene Regel – alle Spieler dieselbe
  const ORDERS = [
    { id: "glass", name: "Glaskanone", desc: "+50 % Schaden, aber −40 % Leben", mul: 1.3, apply: (p) => { p.dmgMul *= 1.5; p.maxHp = p.hp = Math.round(p.maxHp * 0.6); } },
    { id: "elite", name: "Elite-Nacht", desc: "Dreimal so viele Elite-Zombies", mul: 1.25, eliteX: 3 },
    { id: "sprint", name: "Sprinter", desc: "Alle laufen 25 % schneller – du auch", mul: 1.15, foeSpeed: 1.25, apply: (p) => { p.speed *= 1.25; } },
    { id: "blood", name: "Blutdurst", desc: "Abschüsse heilen 2 %, aber −25 % Leben", mul: 1.1, apply: (p) => { p.lifesteal += 0.02; p.maxHp = p.hp = Math.round(p.maxHp * 0.75); } },
    { id: "fuse", name: "Kurze Lunte", desc: "Jeder fünfte Zombie explodiert beim Tod", mul: 1.35, volatile: 0.2 },
    { id: "payday", name: "Zahltag", desc: "Doppelte Münzen, Gegner +30 % Leben", mul: 1.1, greed: 2, foeHp: 1.3 },
  ];
  const dayNo = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5); };
  const todaysOrder = () => ORDERS[dayNo() % ORDERS.length];
  const ORDER_NONE = {};
  const runOrder = () => (run && run.order) || ORDER_NONE;
  function runScore() {
    const r = run;
    const fight = r.kills * 10 + (r.headshots || 0) * 5 + (r.bestCombo || 0) * 15 + (r.objDone || 0) * 300 + (r.bossKills || 0) * 600;
    const prog = r.mode === "survival" ? Math.floor(Math.min(r.survT || 0, SURVIVAL_TIME)) * 12 : ((r.chapter - 1) * ROOMS_PER_CHAPTER + r.room) * 120;
    return Math.round((fight + prog) * threatScore(r.threat || 0) * (r.order ? r.order.mul : 1));
  }
  function recordScore(score) {
    const surv = run.mode === "survival";
    const entry = { s: score, m: run.mode, t: run.threat || 0, h: save.skin, p: surv ? fmtTime(Math.min(run.survT || 0, SURVIVAL_TIME)) : placeLabel(run.chapter, run.room), o: run.order ? run.order.id : "", d: localDay() };
    const list = (save.scores || []).concat(entry).sort((a, b) => b.s - a.s).slice(0, 10);
    save.scores = list;
    let daily = false;
    if (surv && run.order) {
      const day = dayNo();
      if (!save.dailyBest || save.dailyBest.day !== day || score > save.dailyBest.s) { daily = true; save.dailyBest = { day, s: score, o: run.order.id }; }
    }
    return { rank: list.indexOf(entry) + 1, daily, entry };
  }
  function shareText(e) {
    const mode = e.m === "survival" ? `${tr("Überleben")} (${tr(ORDERS.find((q) => q.id === e.o)?.name || "Tagesbefehl")})` : `${tr("Kampagne")}${e.t ? ` · ${tr("Bedrohung {n}", { n: e.t })}` : ""}`;
    const link = Platform.cfg.playStoreUrl ? ` ${Platform.cfg.playStoreUrl}` : "";
    return tr("Outbreak! Germany: {s} Punkte – {m}, {p}, Dienstgrad {r}. Schaffst du mehr?", { s: num(e.s), m: mode, p: e.p, r: rankOf(bestScore()).name }) + link;
  }
  async function shareScore(e) {
    const text = shareText(e);
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (err) { if (err && err.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast(tr("Ergebnis kopiert – jetzt einfügen und teilen"), "check"); }
    catch { toast(text, "trophy"); }
  }
  // v2.6 Dienstgrade nach dem besten Einsatz – gibt der Bestenliste ein Ziel
  const RANKS = [[0, "Rekrut"], [2000, "Gefreiter"], [5000, "Unteroffizier"], [10000, "Feldwebel"], [20000, "Leutnant"], [40000, "Hauptmann"], [70000, "Major"], [110000, "Oberst"], [160000, "General"], [250000, "Legende"]];
  function rankOf(score) {
    let i = 0;
    while (i + 1 < RANKS.length && score >= RANKS[i + 1][0]) i++;
    return { i, name: tr(RANKS[i][1]), next: RANKS[i + 1] ? { name: tr(RANKS[i + 1][1]), at: RANKS[i + 1][0] } : null };
  }
  const bestScore = () => ((save.scores || [])[0] || { s: 0 }).s;
  function renderRanks() {
    const rk = rankOf(bestScore()), streak = save.orderStreak && save.orderStreak.day >= dayNo() - 1 ? save.orderStreak.n : 0;
    $("rankTitle").innerHTML = `${I("medal")}<span><small>${tr("Dienstgrad")}</small><b>${rk.name}</b></span><em>${rk.next ? tr("Nächster: {r} ab {s} Punkten", { r: rk.next.name, s: num(rk.next.at) }) : tr("Höchster Rang erreicht")}</em>${streak ? `<strong>${tr("Serie {n}", { n: streak })}</strong>` : ""}`;
    const o = todaysOrder(), db = save.dailyBest && save.dailyBest.day === dayNo() ? save.dailyBest.s : 0;
    $("dailyOrder").innerHTML = `${I("stopwatch")}<span><small>${tr("Tagesbefehl im Überlebensmodus")}</small><b>${tr(o.name)}</b><em>${tr(o.desc)} · ×${o.mul.toLocaleString(I18N.lang)} ${tr("Punkte")}</em></span><strong>${db ? num(db) : "–"}</strong>`;
    const list = save.scores || [];
    $("rankList").innerHTML = list.length ? list.map((e, i) => `<li class="${i === 0 ? "top" : ""}"><b>${i + 1}</b><span><strong>${num(e.s)}</strong><small>${e.m === "survival" ? tr("Überleben") : tr("Kampagne")}${e.t ? ` · ${tr("Bedrohung {n}", { n: e.t })}` : ""} · ${(SKINS.find((q) => q.id === e.h) || SKINS[0]).name}</small></span><em>${e.p}</em></li>`).join("") : `<p class="empty">${tr("Noch keine Einsätze – deine Bestwerte erscheinen hier.")}</p>`;
    $("rankShare").disabled = !list.length;
  }
  function renderThreat() {
    const max = Math.min(THREAT_MAX, save.threatMax || 0), cur = Math.min(save.threat || 0, max);
    const row = $("threatRow");
    row.classList.toggle("hidden", save.menuMode === "survival");
    $("threatPips").innerHTML = Array.from({ length: THREAT_MAX + 1 }, (_, t) => `<button class="tp${t === cur ? " on" : ""}${t > max ? " locked" : ""}" data-t="${t}" aria-label="${tr("Bedrohung {n}", { n: t })}">${t > max ? I("lock") : t}</button>`).join("");
    $("threatInfo").textContent = threatInfoText(cur);
  }
  let lastScore = null;
  function gameOver(quit, won = false) {
    state = "over";
    bankLoot();
    if (window.GameAudio && !quit) GameAudio.stinger(won ? "victory" : "death");
    joy.active = false;
    clearInterval(reviveTimer);
    const surv = run.mode === "survival";
    if (won) run.coins += Math.round(300 * run.greed * ECON.earn); // Siegprämie im Überlebensmodus
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
    const points = runScore(), rk = recordScore(points);
    lastScore = rk.entry;
    const lv0 = heroLevel(save.skin);
    save.heroXp = save.heroXp || {};
    save.heroXp[save.skin] = (save.heroXp[save.skin] || 0) + Math.round(points / 50);
    const lv1 = heroLevel(save.skin);
    if (lv1 > lv0) setTimeout(() => toast(tr("{h} erreicht Heldenstufe {n}!", { h: (SKINS.find((q) => q.id === save.skin) || SKINS[0]).name, n: lv1 }), "upgrade"), 700);
    // Tagesbefehl-Serie: der erste Überlebens-Einsatz des Tages zahlt eine Prämie, jeder Folgetag mehr
    if (run.order) {
      const day = dayNo(), st = save.orderStreak || { day: 0, n: 0 };
      if (st.day !== day) {
        st.n = st.day === day - 1 ? Math.min(7, st.n + 1) : 1; st.day = day; save.orderStreak = st;
        const bonus = 100 + 25 * (st.n - 1);
        save.coins += bonus; run.orderBonus = bonus;
      }
    }
    persist();
    const title = $("overTitle");
    title.textContent = won ? tr("ÜBERLEBT!") : quit ? tr("EINSATZ BEENDET") : tr("GEFALLEN");
    title.classList.toggle("win", won);
    const reached = surv ? `${fmtTime(Math.min(run.survT, SURVIVAL_TIME))} / ${fmtTime(SURVIVAL_TIME)}` : placeLabel(run.chapter, run.room);
    let si = 0;
    const line = (icon, label, value, cls = "") => {
      const i = si++;
      return `<span style="--i:${i}">${I(icon)}${label}</span><b class="${cls}" style="--i:${i}">${value}</b>`;
    };
    const city = !surv && run.room > 0 ? curCity() : null;
    const left = city ? 9 - districtIdx() : 0;
    const tease = city && !won && left >= 1 ? (left > 1 ? tr("Noch {n} Bezirke bis {boss}", { n: left, boss: ZOMBIES[city.boss].name }) : tr("Boss wartet: {boss}", { boss: ZOMBIES[city.boss].name })) : "";
    const tags = `${rk.rank === 1 && save.scores.length > 1 ? `<em class="rec">${tr("BESTWERT")}</em>` : rk.rank > 1 ? `<em class="rank">#${rk.rank}</em>` : ""}${rk.daily ? `<em class="rec">${tr("TAGESBESTWERT")}</em>` : ""}`;
    $("overStats").innerHTML =
      line("trophy", tr("Punkte"), `${num(points)}${tags}`, "gold") +
      (run.threat ? line("skull", tr("Bedrohung"), `${run.threat} · ×${threatScore(run.threat).toLocaleString(I18N.lang)}`) : "") +
      (run.order ? line("stopwatch", tr("Tagesbefehl"), `${tr(run.order.name)}${run.orderBonus ? ` ${coinAmt(run.orderBonus, "+")}` : ""}`) : "") +
      (run.loot ? line("heartArmor", tr("Beute"), tr("{n} Ausrüstungsteil(e)", { n: run.loot })) : "") +
      line(surv ? "stopwatch" : "map", surv ? tr("Überlebt") : tr("Erreicht"), `${reached}${record ? `<em class="rec">${tr("REKORD")}</em>` : ""}`) +
      line("skull", tr("Abschüsse"), num(run.kills)) +
      line("headshot", tr("Kopfschüsse"), num(run.headshots || 0)) +
      (run.firstBloodAt != null ? line("exec", tr("Erster Treffer"), fmtTime(run.firstBloodAt)) : "") +
      line("combo", tr("Beste Kombo"), `x${run.bestCombo}`) +
      line("upgrade", tr("Level"), player.level) +
      (run.objDone ? line("missions", tr("Einsatzziele"), num(run.objDone)) : "") +
      line("hourglass", tr("Zeit"), fmtTime(run.time)) +
      line("coin", tr("Münzen"), coinAmt(coins, "+"), "gold") +
      (tease ? line("bossSkull", tr("Nächstes Ziel"), tease) : "");
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
  const lightCanvas = (() => { const c = lowResCanvas(); c.height = Math.ceil(WH / LS); return c; })(); // Weltgröße: liegt im verschobenen 2D-Kontext
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
    get zaps() { return zaps; }, get ambient() { return ambient; }, get roomLights() { return roomLights; }, get lobs() { return lobs; }, get parcels() { return parcels; }, get beams() { return beams; },
    get throws() { return throws; }, get decoys() { return decoys; }, get strikes() { return strikes; }, throwStyle: (k) => THROWABLES[k],
    get killCam() { return killCam; }, get gates() { return gates; }, get miniSpot() { return miniSpot && !miniSpot.done ? miniSpot : null; },
    get weather() { return curWeather(); }, get fest() { return curFest(); },
    get cityId() { return run && run.mode === "campaign" && run.room > 0 ? curCity().id : ""; }, get district() { return run && run.mode === "campaign" && run.room > 0 ? curDistrict()[0] : ""; },
    get obstacles() { return obstacles; }, get supplyCrate() { return supplyCrate; }, get floorCanvas() { return floorCanvas; }, get birds() { return birds; },
    get theme() { return theme(); }, get isBossRoom() { return !!(run && BOSS_ROOMS[run.room]); }, get intro() { return roomFade; },
    get camPunch() { return { x: punchX, y: punchY, fov: punchFov }; },
    get survivors() { return run && run.obj && run.obj.list ? run.obj.list : NO_SURVIVORS; },
    get powers() { return state === "play" || state === "pick" ? activePowers().map((k) => POWERUPS[k].rgb) : NO_SURVIVORS; }, // v3.7 Aura-Farben
    get hazards() { return hazards; },
    get slowPu() { return state === "play" && puOn("slow"); },
    get shield() { return (state === "play" || state === "pick") && puOn("shield") ? run.pu.shield : 0; },
    get plant() { return player ? player.plant || 0 : 0; },
    consumeFloorDirty() { const d = floorDirty; floorDirty = false; return d; },
    muzzlePoint: () => muzzlePoint(player),
    dronePos,
  };
  // Welt-Position → Bildschirmpunkt (2D: identisch, 3D: über die Kamera)
  const flatPt = { x: 0, y: 0 };
  function scr(x, y, h) {
    if (mode3d) return Render3D.project(x, y, h);
    flatPt.x = x; flatPt.y = y - scrOff;
    return flatPt;
  }

  // 3D-Hauptmenü: der Held sucht mit der Taschenlampe die nächtliche Straße ab,
  // Zombies schlurfen heran und umkreisen ihn (reine Kulisse, keine Spiellogik)
  let menu3d = null;
  // Saison-Kulisse: Weihnachtsmarkt im Winter, Karneval im Februar, Wiesn im Herbst, sonst Altstadt im Regen
  const MENU_SEASON = (() => { const m = new Date().getMonth(); return m >= 10 || m === 0 ? { fest: "weihnachten", weather: "snow" } : m === 1 ? { fest: "karneval", weather: "confetti" } : m === 8 || m === 9 ? { fest: "wiesn", weather: "clear" } : { fest: "", weather: "rain" }; })();
  function menuWorld() {
    if (!menu3d) {
      const p = { x: W / 2, y: 600, r: 16, aim: -Math.PI / 2, moving: false, walkT: 0, kick: 0, barrel: 0, orbit: 0, orbitAng: 0, drones: 0, muzzle: 0, invuln: 0, hp: 1, maxHp: 1 };
      const types = ["walker", "wiesn", "gunner", "zwerg", "brute", "jeck", "bloater", "walker", "schaffner", "armored", "ultra", "walker", "beamter", "zwerg"];
      const enemies = types.map((type, i) => menuFoe({ player: p }, type, i));
      const { fest, weather } = MENU_SEASON;
      const obs = [
        // Kulisse hinter dem Helden (von der Kamera aus gesehen): Streifenwagen mit Blaulicht, Marktbude, Bierfass und -bank
        { kind: "car", x: 288, y: 818, w: 104, h: 54, vert: false, seed: 7 },
        { kind: "bude", x: 84, y: 720, w: 86, h: 50, seed: 3 },
        { kind: "fass", x: 150, y: 640, w: 48, h: 48, seed: 5 },
        { kind: "barricade", x: 392, y: 860, w: 120, h: 26, seed: 9 },
        { kind: "bierbank", x: 372, y: 696, w: 96, h: 36, seed: 11 },
      ].map((o) => ({ ...o, fest }));
      menu3d = {
        state: "menu", run: { doorK: 0 }, player: p, enemies, bullets: [], eBullets: [], orbs: [], particles: [], corpses: [], zaps: [],
        ambient: Array.from({ length: 28 }, () => ({ x: rand(L, R), y: rand(T, B), size: rand(1, 2.4), ph: rand(0, TAU) })),
        roomLights: obs.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3 })),
        obstacles: obs, supplyCrate: null, floorCanvas: Sprites.floor("markt", { W, H: WH, L, T, R, B }, 4242, { snow: weather === "snow", confetti: weather === "confetti", leaves: fest === "wiesn" }),
        theme: "markt", weather, fest, isBossRoom: false, camPunch: { x: 0, y: 0, fov: 0 }, survivors: NO_SURVIVORS, consumeFloorDirty: () => false,
        muzzlePoint: () => muzzlePoint(p), dronePos: () => ({ x: p.x, y: p.y }), menuCam: true, t: 0,
      };
    }
    return menu3d;
  }
  // Menü-Szene: Zombies schlurfen im Hintergrund (abgewandte Seite der Kamera), der Held schaut
  // in die Kamera und dreht sich ab und zu für einen Feuerstoß um – getroffene fallen, neue steigen auf.
  const MENU_ARC = 1.15; // Richtung vom Helden weg von der Kamera
  const angTo = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  function menuFoe(w, type, i) {
    const def = ZOMBIES[type], a = MENU_ARC + rand(-1.15, 1.15), d = rand(210, 380), p = w.player;
    return {
      type, def, r: def.r, variant: i % 3, scale: rand(0.95, 1.05), x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8,
      face: a + Math.PI, anim: rand(0, 8), wob: rand(0, TAU), spawnT: 0, spawnMax: 1, hitT: 0, mode: "walk", aiT: 0, dirX: 0, dirY: 0,
      burnT: 0, slowT: 0, phase2: false, ang: a, dist: d, spd: def.speed * 0.25, want: rand(140, 300),
    };
  }
  function updateMenuWorld(dt) {
    const w = menuWorld(), p = w.player;
    w.t += dt;
    p.weaponId = save.equipped; p.weapon = WEAPONS[save.equipped]; p.tier = weaponTier(save.weapons[save.equipped] || 1); p.skin = save.skin;
    p.muzzle = Math.max(0, (p.muzzle || 0) - dt); p.kick = Math.max(0, (p.kick || 0) - dt * 30);
    for (const e of w.enemies) {
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }
      e.hitT = Math.max(0, e.hitT - dt);
      // langsam enger kreisen, dann wieder zurückweichen – immer im Hintergrund
      e.dist += (e.want - e.dist) * dt * 0.15;
      if (Math.abs(e.dist - e.want) < 6) e.want = rand(200, 360);
      e.ang += (e.spd / Math.max(80, e.dist)) * dt * (e.variant % 2 ? 1 : -1);
      if (Math.abs(angTo(MENU_ARC, e.ang)) > 1.3) e.variant++; // an den Rändern umkehren
      const nx = p.x + Math.cos(e.ang) * e.dist, ny = p.y + Math.sin(e.ang) * e.dist * 0.8;
      e.face = Math.atan2(p.y - ny, p.x - nx);
      e.anim += dt * 4;
      e.x = nx; e.y = ny;
    }
    // Feuerstöße
    let aimGoal = MENU_ARC + Math.PI + 0.55 + Math.sin(w.t * 0.5) * 0.25; // grob Richtung Kamera
    w.shotT = (w.shotT ?? 3) - dt;
    if (w.burst) {
      const e = w.burst.e;
      aimGoal = Math.atan2(e.y - p.y, e.x - p.x);
      w.burst.t -= dt;
      if (w.burst.t <= 0 && Math.abs(angTo(p.aim, aimGoal)) < 0.2) {
        const mz = muzzlePoint(p), a = Math.atan2(e.y - mz.y, e.x - mz.x) + rand(-0.03, 0.03), sp = 1400;
        w.bullets.push({ x: mz.x, y: mz.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3, kind: "bullet", tracer: p.weapon.tracer || "255,224,138", long: false, life: Math.hypot(e.x - mz.x, e.y - mz.y) / sp, maxLife: 1, spin: 0 });
        p.muzzle = 0.06; p.kick = 4; e.hitT = 0.1; sfx("shoot");
        for (let i = 0; i < 4; i++) w.particles.push({ t: "blood", x: e.x, y: e.y, z: 26, vx: Math.cos(a) * rand(60, 200) + rand(-40, 40), vy: Math.sin(a) * rand(60, 200) + rand(-40, 40), vz: rand(80, 220), life: 0.8, max: 0.8, color: e.def.blood, size: rand(1.4, 2.6) });
        w.burst.t = 0.12;
        if (--w.burst.n <= 0) {
          // Treffer: Zombie kippt um, nach ein paar Sekunden steigt hinten ein neuer aus dem Boden
          w.enemies.splice(w.enemies.indexOf(e), 1);
          w.corpses.push({ type: e.type, v: e.variant, f: 0, x: e.x, y: e.y, z: 0, r: e.r * 0.8, face: e.face, sc: e.scale, t: 0, blood: e.def.blood, boss: false, ref: e, death: "shot",
            vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, vz: 90, spin: rand(-2, 2), roll: 0, rollV: 0, fall: 0, settled: false, headless: Math.random() < 0.35, fallDir: 1, side: 1 });
          for (let i = 0; i < 10; i++) w.particles.push({ t: "blood", x: e.x, y: e.y, z: 30, vx: Math.cos(a) * rand(80, 260) + rand(-60, 60), vy: Math.sin(a) * rand(80, 260) + rand(-60, 60), vz: rand(120, 300), life: 1, max: 1, color: e.def.blood, size: rand(1.6, 3) });
          w.burst = null; w.shotT = rand(2.8, 5);
        }
      }
    } else if (w.shotT <= 0) {
      const cands = w.enemies.filter((e) => e.spawnT <= 0 && e.dist < 380);
      if (cands.length) w.burst = { e: pick(cands), n: 3 + randi(0, 2), t: 0.35 }; else w.shotT = 1;
    }
    p.aim += angTo(p.aim, aimGoal) * Math.min(1, dt * (w.burst ? 9 : 2.5));
    for (const b of w.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    w.bullets = w.bullets.filter((b) => b.life > 0);
    for (const q of w.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= 900 * dt; q.life -= dt; if (q.z < 0) q.life = 0; }
    w.particles = w.particles.filter((q) => q.life > 0);
    for (const c of w.corpses) {
      c.t += dt; c.fall = Math.min(1, c.t / 0.42);
      c.x += c.vx * dt; c.y += c.vy * dt; const f = Math.exp(-5 * dt); c.vx *= f; c.vy *= f;
      c.z = Math.max(0, c.z + c.vz * dt); c.vz -= 1400 * dt; c.face += c.spin * dt; c.spin *= f;
    }
    const gone = w.corpses.filter((c) => c.t > 4.5);
    if (gone.length) {
      w.corpses = w.corpses.filter((c) => c.t <= 4.5);
      for (const c of gone) { const q = menuFoe(w, c.type, randi(0, 5)); q.spawnT = q.spawnMax = 1.2; w.enemies.push(q); }
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
        if (render3d(menuWorld(), 0)) { ctx.drawImage(vignette, 0, 0, vignette.width * LS, vignette.height * LS); drawFlash(); return; }
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
    if (shake > 0 || punchX || punchY) ctx.translate(punchX + rand(-shake, shake), punchY + rand(-shake, shake));
    updateCam2D(frameDt);
    ctx.translate(0, -camY);
    // 1) Welt
    if (floorCanvas) ctx.drawImage(floorCanvas, 0, 0, W, WH);
    drawDoor();
    for (const o of obstacles) drawObstacle(o);
    drawAmbient(false);
    drawOrbs();
    if (supplyCrate) drawSupply();
    if (miniSpot && !miniSpot.done) drawMiniSpot();
    drawCorpses();
    drawBirds(false);
    if (run.obj && (run.obj.kind === "hold" || run.obj.kind === "relay") && !run.obj.done) drawZone(run.obj, { cx: run.obj.x, cy: run.obj.y, rx: run.obj.r, ry: run.obj.r });
    drawLobTargets();
    drawActors();
    drawProjectilesBase();
    drawLobs();
    drawThrows();
    drawParcels();
    drawParticlesBase();
    // 2) Licht & Dunkelheit
    drawLighting();
    // 3) Leuchtende Dinge (additiv)
    ctx.globalCompositeOperation = "lighter";
    drawGlows();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // 4) Lesbarkeit
    drawBirds(true);
    drawEnemyBullets();
    drawBeams();
    drawTelegraphs();
    drawBars();
    drawTexts();
    ctx.restore();
    scrOff = camY; // Overlay (Zielmarke, Randpfeile, Schilder) liegt in Bildschirm-Koordinaten
    drawOverlay();
    scrOff = 0;
  }
  // v3.4 2D-Kamera: zeigt etwas mehr vom Weg nach vorn (Tür oben); beim Raumstart springt sie direkt an den Helden
  const cam2DTarget = () => clamp((player ? player.y : B) - 600, 0, WH - H);
  function updateCam2D(dt, snap = false) {
    const t = cam2DTarget();
    camY = snap ? t : camY + (t - camY) * Math.min(1, dt * 5);
  }

  function drawGhosts() {
    if (!ghosts.length) return;
    ctx.save();
    for (const g of ghosts) {
      const q = scr(g.x, g.y, 0);
      ctx.globalAlpha = (g.life / g.max) * 0.38;
      ctx.strokeStyle = "#a8ff3e";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, 13, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // v3.2 Minikarte: in Nah- und Schulteransicht bleibt die ganze Arena im Blick – Mauern mit Horden-Gängen, Tür,
  // Hindernisse, Ziele, Gegner (Elite orange, Boss groß) und der Bodenausschnitt, den die Kamera gerade zeigt
  function drawMinimap() {
    // v3.4: die lange Arena passt in keiner Ansicht mehr ganz ins Bild – Minikarte immer (auch 2D und Übersicht)
    const p = player, t = run.time, k = 0.14, mw = (R - L) * k, mh = (B - T) * k;
    const objUp = run.obj && !(run.obj.done && run.obj.doneT > 2.5), bossUp = enemies.some((e) => e.def.boss && e.spawnT <= 0);
    const x0 = W - 16 - mw, y0 = Math.max(objUp ? 168 : 112, bossUp ? 188 : 0);
    const mx = (x) => x0 + (Math.max(L - 14, Math.min(R + 14, x)) - L) * k, my = (y) => y0 + (Math.max(T - 10, Math.min(B + 10, y)) - T) * k;
    ctx.save();
    ctx.fillStyle = "rgba(6,9,8,0.74)"; roundRect(x0 - 5, y0 - 5, mw + 10, mh + 10, 5); ctx.fill();
    ctx.fillStyle = "rgba(92,86,72,0.28)"; ctx.fillRect(x0, y0, mw, mh);
    ctx.beginPath(); ctx.rect(x0 - 3, y0 - 3, mw + 6, mh + 6); ctx.clip();
    // sichtbarer Ausschnitt der Kamera
    const q = mode3d ? Render3D.viewQuad && Render3D.viewQuad() : [{ x: L, y: camY + 104 }, { x: R, y: camY + 104 }, { x: R, y: camY + H }, { x: L, y: camY + H }];
    if (q) {
      ctx.beginPath(); q.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x0 + (v.x - L) * k, y0 + (v.y - T) * k)); ctx.closePath();
      ctx.fillStyle = "rgba(255,236,190,0.1)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,236,190,0.38)"; ctx.lineWidth = 1; ctx.stroke();
    }
    for (const o of obstacles) if (o.w) { ctx.fillStyle = o.landmark ? "rgba(232,198,74,0.95)" : "rgba(186,176,152,0.55)"; ctx.fillRect(x0 + (o.x - L) * k, y0 + (o.y - T) * k, Math.max(1.5, o.w * k), Math.max(1.5, o.h * k)); }
    // Mauern: Seiten mit Lücken für die Horden-Gänge (warnende Gänge blinken rot), oben die Tür
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const x = side < 0 ? x0 - 1 : x0 + mw + 1, cuts = gates.filter((g) => g.side === side).sort((a, b) => a.y - b.y);
      let y = T;
      ctx.strokeStyle = "rgba(232,239,233,0.6)"; ctx.beginPath();
      for (const g of cuts) { ctx.moveTo(x, my(y)); ctx.lineTo(x, my(g.y - g.h / 2)); y = g.y + g.h / 2; }
      ctx.moveTo(x, my(y)); ctx.lineTo(x, my(B)); ctx.stroke();
      for (const g of cuts) if (g.warn > 0) {
        ctx.strokeStyle = `rgba(255,70,50,${0.5 + 0.5 * Math.sin(t * 14)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, my(g.y - g.h / 2)); ctx.lineTo(x, my(g.y + g.h / 2)); ctx.stroke(); ctx.lineWidth = 2;
      }
    }
    const dl = W / 2 - DOOR_W / 2, dr = W / 2 + DOOR_W / 2;
    ctx.strokeStyle = "rgba(232,239,233,0.6)"; ctx.beginPath();
    ctx.moveTo(x0 - 1, y0 - 1); ctx.lineTo(mx(dl), y0 - 1); ctx.moveTo(mx(dr), y0 - 1); ctx.lineTo(x0 + mw + 1, y0 - 1);
    ctx.moveTo(x0 - 1, y0 + mh + 1); ctx.lineTo(x0 + mw + 1, y0 + mh + 1); ctx.stroke();
    ctx.strokeStyle = run.cleared ? `rgba(168,255,62,${0.6 + 0.4 * Math.sin(t * 6)})` : "rgba(255,90,60,0.8)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(mx(dl), y0 - 1); ctx.lineTo(mx(dr), y0 - 1); ctx.stroke();
    // Einsatzziele
    const o = run.obj;
    if (objUp && o && o.r && (o.kind === "hold" || o.kind === "relay")) {
      ctx.strokeStyle = "rgba(255,183,51,0.85)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mx(o.x), my(o.y), o.r * k, 0, TAU); ctx.stroke();
    }
    if (o && o.list) {
      ctx.fillStyle = "#7dff9a";
      for (const s of o.list) if (s.state === "wait" || s.state === "run") { ctx.beginPath(); ctx.arc(mx(s.x), my(s.y), 2.2, 0, TAU); ctx.fill(); }
    }
    // Gegner
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || e.under) continue;
      const boss = e.def.boss, r = boss ? 4.2 : Math.max(1.4, Math.min(3, e.r * k * 1.1));
      ctx.fillStyle = boss ? "#ff3a24" : e.looter ? "#ffe27a" : e.elite ? "#ffb733" : "#e8322a";
      ctx.beginPath(); ctx.arc(mx(e.x), my(e.y), r, 0, TAU); ctx.fill();
      if (boss) { ctx.strokeStyle = `rgba(255,58,36,${0.4 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(mx(e.x), my(e.y), r + 3, 0, TAU); ctx.stroke(); }
    }
    // Held: Pfeil in Blickrichtung
    ctx.translate(mx(p.x), my(p.y)); ctx.rotate(p.aim || -Math.PI / 2);
    ctx.fillStyle = "#f4f1e6"; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(-3.5, -3.6); ctx.lineTo(-1.8, 0); ctx.lineTo(-3.5, 3.6); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,183,51,0.55)"; ctx.lineWidth = 1.2; roundRect(x0 - 5, y0 - 5, mw + 10, mh + 10, 5); ctx.stroke();
    ctx.restore();
  }
  // v3.1 Nah-/Third-Person-Kamera: rote Randpfeile für Zombies außerhalb des Bildes (Bosse groß, nahe kräftiger)
  function drawOffscreen() {
    if (!mode3d || !window.Render3D || Render3D.camMode === "top") return;
    const p = player, top = 112, bot = H - 30, pad = 18, list = [];
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || e.under) continue;
      const q = scr(e.x, e.y, e.r * 1.6);
      if (!q.behind && q.x > 0 && q.x < W && q.y > top && q.y < bot) continue;
      list.push({ e, d: (e.x - p.x) ** 2 + (e.y - p.y) ** 2 });
    }
    list.sort((a, b) => a.d - b.d);
    const c = scr(p.x, p.y, 20), cx = c.behind ? W / 2 : c.x, cy = c.behind ? H * 0.7 : c.y;
    ctx.save();
    for (const { e, d } of list.slice(0, 12)) {
      // Kamera blickt nach Norden: Welt-Richtung = Bildschirm-Richtung
      const a = Math.atan2(e.y - p.y, e.x - p.x), dx = Math.cos(a), dy = Math.sin(a);
      const tx = dx > 0 ? (W - pad - cx) / dx : dx < 0 ? (pad - cx) / dx : 1e9, ty = dy > 0 ? (bot - pad - cy) / dy : dy < 0 ? (top + pad - cy) / dy : 1e9;
      const t = Math.max(0, Math.min(tx, ty)), x = cx + dx * t, y = cy + dy * t;
      const near = Math.max(0.35, 1 - Math.sqrt(d) / 700), sz = (e.def.boss ? 15 : e.elite ? 11 : 8) * (0.8 + 0.4 * near);
      ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * near;
      ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = e.def.boss ? "#ff3a24" : e.elite ? "#ffb733" : "#e8322a";
      ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.7, -sz * 0.75); ctx.lineTo(-sz * 0.35, 0); ctx.lineTo(-sz * 0.7, sz * 0.75); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawLockOn() {
    const p = player;
    if (state !== "play" || !p || p.moving || !(p.plant > 0.1)) return;
    const target = nearestEnemy(p);
    if (!target) return;
    const k = p.plant;
    const a = scr(p.x, p.y, 28), b = scr(target.x, target.y, target.r * 2.2);
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.65 * k;
    ctx.strokeStyle = `rgba(168,255,62,${0.3 + 0.55 * k})`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    const r = Math.max(12, (mode3d ? 16 : target.r * 1.15) * (1.2 - 0.2 * k));
    ctx.strokeStyle = "#c8ff6a";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.stroke();
    const s = r * 0.62;
    ctx.beginPath();
    ctx.moveTo(b.x - r, b.y - s); ctx.lineTo(b.x - r, b.y - r); ctx.lineTo(b.x - s, b.y - r);
    ctx.moveTo(b.x + r, b.y - s); ctx.lineTo(b.x + r, b.y - r); ctx.lineTo(b.x + s, b.y - r);
    ctx.moveTo(b.x - r, b.y + s); ctx.lineTo(b.x - r, b.y + r); ctx.lineTo(b.x - s, b.y + r);
    ctx.moveTo(b.x + r, b.y + s); ctx.lineTo(b.x + r, b.y + r); ctx.lineTo(b.x + s, b.y + r);
    ctx.stroke();
    ctx.restore();
  }
  function drawOverlay() {
    drawGhosts();
    drawLockOn();
    drawScreenFx();
    drawHud();
    drawObjectiveHud();
    if (state === "play") drawGateWarnings();
    drawMiniLabel();
    drawLandmarkLabel();
    if (state === "play") { drawOffscreen(); drawMinimap(); }
    if (state === "play" || state === "pick") { drawDashButton(); drawActionButtons(); }
    drawCombo();
    if (state === "play" || state === "pick") { drawPowerBadges(); drawLooterBadges(); drawFeeding(); drawPowerHud(); }
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
    drawBossCard();
    if (!save.tutorialDone && run.room === 1 && (state === "play" || state === "pick")) drawTutorial();
  }

  function glowAt(rgb, x, y, r, a = 1) {
    if (a <= 0 || r <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(Sprites.glow(rgb).c, x - r, y - r, r * 2, r * 2);
  }
  // ============================================================
  // v2.4 Einsatzziele & Elite-Eigenschaften zeichnen (2D und als Overlay über der 3D-Welt)
  // ============================================================
  // Kreis am Boden: in 2D unverzerrt, in 3D über vier projizierte Punkte angenähert
  function groundEllipse(x, y, r) {
    const c = scr(x, y, 0), cx = c.x, cy = c.y;
    if (!mode3d) return { cx, cy, rx: r, ry: r };
    const ax = scr(x + r, y, 0).x, by = scr(x, y + r, 0).y;
    return { cx, cy, rx: Math.max(4, Math.abs(ax - cx)), ry: Math.max(3, Math.abs(by - cy)) };
  }
  function drawZone(o, g) {
    const t = run.time, k = o.prog / o.need, col = o.inside ? "168,255,62" : "255,183,51";
    ctx.save();
    ctx.fillStyle = `rgba(${col},${0.1 + 0.05 * Math.sin(t * 4)})`;
    ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, TAU); ctx.fill();
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = `rgba(${col},0.8)`; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx + 7, g.ry + 7 * (g.ry / g.rx), 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, k)); ctx.stroke();
    drawIcon(ctx, "hazard", g.cx, g.cy, 24, `rgba(${col},0.95)`);
    ctx.restore();
  }
  function drawSurvivor(s) {
    if (s.state !== "wait" && s.state !== "run") return;
    drawShadow(s.x, s.y, s.r);
    const f = Math.floor(s.anim) % Sprites.FRAMES, jit = s.state === "wait" ? Math.sin(run.time * 22 + s.anim) * 0.7 : 0;
    Sprites.draw(ctx, Sprites.zombie("civilian", f, s.variant), s.x + jit, s.y, s.face, 0.95);
  }
  function drawObjectiveMarks() {
    const o = run.obj, t = run.time;
    if (o && o.kind === "gauntlet" && !o.done) {
      // Pfeil am Durchlass zum nächsten Gang
      if (o.band < 3) {
        const gapRight = o.band % 2 === 0, x = gapRight ? R - GAUNT.gap / 2 : L + GAUNT.gap / 2, y = B - GAUNT.rows[o.band] + GAUNT.wallH / 2;
        const q = scr(x, y, mode3d ? 64 : 0), bob = Math.sin(t * 5) * 4;
        ctx.save(); ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5);
        ctx.fillStyle = "#a8ff3e"; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 2;
        for (const dy of [0, 11]) { ctx.beginPath(); ctx.moveTo(q.x, q.y - 14 + dy + bob); ctx.lineTo(q.x + 13, q.y + dy + bob); ctx.lineTo(q.x + 7, q.y + dy + bob); ctx.lineTo(q.x, q.y - 7 + dy + bob); ctx.lineTo(q.x - 7, q.y + dy + bob); ctx.lineTo(q.x - 13, q.y + dy + bob); ctx.closePath(); ctx.stroke(); ctx.fill(); }
        ctx.restore();
      }
      // Zustand der Barrikaden, sobald daran gehämmert wird
      for (const g of gates) {
        const b = g.bar;
        if (!b || b.dead || b.hp >= b.maxHp) continue;
        const q = scr(g.side < 0 ? L + 18 : R - 18, g.y, mode3d ? 70 : 0), w = 46, k = b.hp / b.maxHp;
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(q.x - w / 2 - 1, q.y - 24, w + 2, 7);
        ctx.fillStyle = k > 0.5 ? "#d8a01a" : `rgba(255,70,50,${0.7 + 0.3 * Math.sin(t * 18)})`; ctx.fillRect(q.x - w / 2, q.y - 23, w * k, 5);
      }
    }
    if (o && (o.kind === "hold" || o.kind === "relay") && !o.done && mode3d) drawZone(o, groundEllipse(o.x, o.y, o.r));
    if (o && o.kind === "relay" && !o.done) for (let i = o.idx + 1; i < o.pts.length; i++) { const q = scr(o.pts[i].x, o.pts[i].y, 0); drawIcon(ctx, "storm", q.x, q.y, 18, "rgba(255,183,51,0.55)"); }
    if (o && o.kind === "rescue") {
      for (const s of o.list) {
        if (s.state !== "wait") continue;
        const q = scr(s.x, s.y, mode3d ? 44 : 0), x = q.x, y = (mode3d ? q.y - 6 : s.y - 30) + Math.sin(t * 5 + s.anim) * 2;
        const hurt = s.hurtT > 0;
        ctx.fillStyle = "rgba(6,9,8,0.7)"; ctx.beginPath(); ctx.arc(x, y - 12, 12, 0, TAU); ctx.fill();
        drawIcon(ctx, "dove", x, y - 12, 15, hurt ? "#ff6a5a" : "#a8ff3e");
        if (s.t > 0) { ctx.strokeStyle = "#a8ff3e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 12, 13.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s.t / 0.6)); ctx.stroke(); }
        const k = Math.max(0, s.hp / s.max);
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(x - 15, y + 3, 30, 4);
        ctx.fillStyle = k > 0.4 ? "#a8ff3e" : "#ff5a4a"; ctx.fillRect(x - 14, y + 4, 28 * k, 2);
      }
    }
    for (const f of fuses) {
      const g = groundEllipse(f.x, f.y, f.r), k = 1 - f.t / f.max;
      ctx.save();
      ctx.fillStyle = `rgba(255,80,30,${0.1 + 0.18 * k})`;
      ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx * k, g.ry * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,110,50,${0.55 + 0.45 * Math.sin(t * 34)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  // Name über Elite und Kopfgeld-Ziel: Eigenschaften lesen, bevor man in sie hineinläuft
  function drawEnemyTag(e, x, y) {
    ctx.save();
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    if (e.bounty) {
      const name = run.obj && run.obj.target === e ? run.obj.name : tr("KOPFGELD");
      ctx.font = FONT_UI(13);
      const w = ctx.measureText(name).width;
      drawIcon(ctx, "bossSkull", x - w / 2 - 9, y - 21, 13, "#ff5a4a");
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(name, x + 4, y - 16);
      ctx.fillStyle = "#ffd0c8"; ctx.fillText(name, x + 4, y - 16);
    }
    const lab = affixLabel(e);
    ctx.font = FONT_UI(11, 700);
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(lab, x, y - 4);
    ctx.fillStyle = `rgb(${AFFIXES[e.aff[0]].rgb})`; ctx.fillText(lab, x, y - 4);
    ctx.restore();
  }
  function drawDashButton() {
    const p = player, b = dashBtn(), k = p.dashCd > 0 ? 1 - p.dashCd / (DASH_CD * p.dashCdMul) : 1;
    ctx.save();
    ctx.globalAlpha = k >= 1 ? 0.9 : 0.55;
    ctx.fillStyle = "rgba(6,9,8,0.6)"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = k >= 1 ? "#a8ff3e" : "#ffb733"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    drawIcon(ctx, "dodge", b.x, b.y - 3, 26, k >= 1 ? "#e8efe9" : "#8a958c");
    ctx.textAlign = "center"; ctx.font = FONT_UI(9); ctx.fillStyle = "#b3bfb6";
    ctx.fillText(pad.on ? "A" : touchSeen ? tr("2× TIPP") : tr("LEER"), b.x, b.y + 21);
    ctx.restore();
  }
  function drawObjectiveHud() {
    const o = run.obj;
    if (!o || (o.done && o.doneT > 2.5)) return;
    const info = OBJ_INFO[o.kind], w = 226, h = 48, x = W - 12 - w, y = 108;
    let k = 0, line = "";
    if (o.kind === "hold") { k = o.prog / o.need; line = o.done ? tr("Luftschlag!") : o.inside ? tr("Halten … noch {s} s", { s: Math.ceil(o.need - o.prog) }) : tr("Zurück in die Zone!"); }
    else if (o.kind === "relay") { k = (o.idx + o.prog / o.need) / o.pts.length; line = o.done ? tr("Funknetz steht") : o.inside ? tr("Mast {n}/3 · noch {s} s", { n: o.idx + 1, s: Math.ceil(o.need - o.prog) }) : tr("Zum Mast {n}/3!", { n: o.idx + 1 }); }
    else if (o.kind === "rescue") { k = o.saved / o.total; line = tr("Gerettet {n}/{m}", { n: o.saved, m: o.total }) + (o.lost ? `  ·  ${tr("{n} verloren", { n: o.lost })}` : ""); }
    else if (o.kind === "gauntlet") {
      const alive = enemies.filter((e) => !e.dead).length;
      k = o.done ? 1 : (o.band + (o.stages.every((st) => st.fired) && !alive ? 1 : 0)) / 4;
      line = o.done ? tr("Korridor gesichert") : o.bash ? tr("Barrikade bricht!") : alive ? tr("Gang {n}/4 · {m} Zombies", { n: o.band + 1, m: alive }) : tr("Gang {n}/4 – weiter zur Tür", { n: o.band + 1 });
    }
    else { k = o.done ? 1 : 1 - Math.max(0, o.target.hp) / o.target.maxHp; line = o.done ? tr("Kopfgeld kassiert") : o.name; }
    const warn = ((o.kind === "hold" || o.kind === "relay") && !o.done && !o.inside) || (o.kind === "gauntlet" && o.bash);
    ctx.save();
    ctx.globalAlpha = o.done ? Math.max(0, 1 - (o.doneT - 1.8) / 0.7) : 1;
    ctx.fillStyle = "rgba(6,9,8,0.8)"; roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = o.done ? "rgba(168,255,62,0.85)" : warn ? `rgba(255,90,60,${0.55 + 0.4 * Math.sin(run.time * 10)})` : "rgba(255,183,51,0.6)";
    ctx.lineWidth = 1.5; roundRect(x, y, w, h, 6); ctx.stroke();
    drawIcon(ctx, o.done ? "check" : info.icon, x + 22, y + 24, 22, o.done ? "#a8ff3e" : "#ffb733");
    ctx.textAlign = "left";
    ctx.fillStyle = o.done ? "#a8ff3e" : "#ffb733"; ctx.font = FONT_UI(12); ctx.fillText(tr(info.title), x + 42, y + 17);
    let fs = 14;
    ctx.font = FONT_UI(fs, 600);
    while (ctx.measureText(line).width > w - 52 && fs > 10) ctx.font = FONT_UI(--fs, 600);
    ctx.fillStyle = warn ? "#ff9a7a" : "#e8efe9"; ctx.fillText(line, x + 42, y + 33);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x + 42, y + 39, w - 54, 4);
    ctx.fillStyle = o.done ? "#a8ff3e" : "#ffb733"; ctx.fillRect(x + 42, y + 39, (w - 54) * Math.min(1, k), 4);
    ctx.restore();
  }
  function drawShadow(x, y, r) {
    const s = Sprites.shadow();
    ctx.drawImage(s.c, x - r * 1.3, y - r * 0.15, r * 2.6, r * 1.3);
  }

  function drawTutorial() {
    const t = performance.now() / 1000;
    const moving = player.moving;
    const plant = player.plant || 0;
    const y = (ST + SB) / 2 + 36;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(6,9,8,0.78)";
    roundRect(W / 2 - 210, y, 420, 78, 6);
    ctx.fill();
    ctx.strokeStyle = moving ? "rgba(255,183,51,0.55)" : "rgba(168,255,62,0.7)";
    ctx.lineWidth = 2;
    roundRect(W / 2 - 210, y, 420, 78, 6);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = moving ? "#ffb733" : "#a8ff3e";
    ctx.font = FONT_UI(21);
    const how = pad.on ? "pad" : touchSeen ? "touch" : "keys";
    const lineA = { touch: ["Loslassen = automatisch schießen!", "Finger ziehen = laufen & ausweichen"], keys: ["Taste loslassen = automatisch schießen!", "WASD / Pfeiltasten = laufen & ausweichen"], pad: ["Stick loslassen = automatisch schießen!", "Linker Stick = laufen & ausweichen"] }[how];
    ctx.fillText(tr(moving ? lineA[0] : lineA[1]), W / 2, y + 32);
    ctx.fillStyle = "#e8efe9";
    ctx.font = FONT_UI(15, 600);
    ctx.fillText(moving ? tr("Du schießt nur, wenn du stehst.") : tr("Stehenbleiben = auf den nächsten Zombie feuern"), W / 2, y + 54);
    if (!moving) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(W / 2 - 90, y + 64, 180, 5);
      ctx.fillStyle = "#a8ff3e";
      ctx.fillRect(W / 2 - 90, y + 64, 180 * plant, 5);
    }
    ctx.restore();
    if (!moving) {
      const cx = L + 90, cy = SB - 90;
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
      menuScene = { res: Sprites.res, floor: Sprites.floor("street", { W, H, L, T: ST, R, B: SB }, 4242), z: [] }; // 2D-Menü: Bildschirmausschnitt
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
    const jx = o.shakeT > 0 ? Math.sin(run.time * 90) * 1.6 : 0; // v3.3: Barrikade wackelt unter den Schlägen
    ctx.drawImage(o.spr.c, o.x + o.spr.ox + jx, o.y + o.spr.oy, o.spr.w, o.spr.h);
    if (ANIM_OBS[o.kind]) ANIM_OBS[o.kind](o, run.time, o.x + o.w / 2, o.y + o.h / 2);
    if (o.alarmT > 0 || o.fireAt) drawCarFx(o);
  }
  // v3.7 Alarmanlage: Blinker an allen vier Ecken · Brand: flackernder Feuerschein über der Haube
  function drawCarFx(o) {
    const t = run.time;
    if (o.alarmT > 0 && Math.sin(t * 13) > 0) for (const [fx, fy] of [[0.06, 0.12], [0.94, 0.12], [0.06, 0.88], [0.94, 0.88]]) glowAt("255,170,40", o.x + o.w * fx, o.y + o.h * fy, 15, 0.95);
    if (o.fireAt) { const hx = o.vert ? o.x + o.w / 2 : o.x + o.w * 0.75, hy = o.vert ? o.y + o.h * 0.25 : o.y + o.h / 2; glowAt("255,120,40", hx, hy, 54 + 8 * Math.sin(t * 17) + 5 * Math.sin(t * 31), 0.6); }
    ctx.globalAlpha = 1;
  }
  // v3.4 bewegte Teile in 2D (in 3D übernimmt das render3d.js): Blaulicht, Lichtstrahl, Mühlenflügel, Wasserspiele, Rotor
  const ANIM_OBS = {
    polizeiauto: (o, t, cx, cy) => { const on = Math.sin(t * 15) > 0; glowAt(on ? "70,120,255" : "255,50,40", cx, cy, 44, 0.75); },
    leuchtturm: (o, t, cx, cy) => {
      const a = t * 1.3; ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,240,180,0.16)";
      for (const s of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 230, a + s - 0.13, a + s + 0.13); ctx.closePath(); ctx.fill(); }
      ctx.restore(); glowAt("255,236,170", cx, cy, 20, 0.9);
    },
    windmuehle: (o, t, cx, cy) => {
      ctx.save(); ctx.translate(cx, cy + 6); ctx.rotate(t * 0.9);
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = "#4a3a2a"; ctx.fillRect(-1.5, 0, 3, 44); ctx.fillStyle = "rgba(232,226,208,0.92)"; ctx.fillRect(2, 10, 9, 32); }
      ctx.restore();
    },
    zentrifuge: (o, t, cx, cy) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 9); for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.fillStyle = k % 2 ? "#7aff6a" : "#ff6ad5"; ctx.fillRect(9, -2, 4, 4); } ctx.restore(); },
    kaethchen: (o, t, cx, cy) => fountainSparkle(o, t, cx, cy, 18),
    schoenbrunnen: (o, t, cx, cy) => fountainSparkle(o, t, cx, cy, 24),
    narrenwagen: (o, t, cx, cy) => { if (Math.sin(t * 2.6) > 0.96) for (let i = 0; i < 2; i++) fxSparks(o.x + o.w * 0.42, o.y + o.h / 2 - 10, -Math.PI / 2, 1.4, 1, pick(KAMELLE), rand(90, 160)); },
  };
  function fountainSparkle(o, t, cx, cy, r) {
    ctx.fillStyle = "rgba(200,236,255,0.8)";
    for (let k = 0; k < 10; k++) { const a = k * 0.63 + t * 0.7, rr = r * (0.4 + 0.6 * ((t * 1.7 + k * 0.37) % 1)); ctx.fillRect(cx + Math.cos(a) * rr - 1, cy + Math.sin(a) * rr * 0.8 - 1, 2, 2); }
  }
  // v3.4 Segen des Wahrzeichens: einmal je Stadt und Einsatz – der Held geht hin und bekommt einen kleinen Vorteil, der zur Stadt passt
  const LANDMARK_BLESS = {
    kaethchen: ["Käthchens Segen", "+30 % Leben", () => healPlayer(player.maxHp * 0.3)],
    roessle: ["Rössle-Kraft", "+6 % Tempo für den Einsatz", () => { player.speed *= 1.06; }],
    loewe: ["Löwenmut", "+8 % Schaden für den Einsatz", () => { player.dmgMul *= 1.08; }],
    schoenbrunnen: ["Am Ring gedreht", "+1 Gratis-Neuwurf, +5 % Krit-Chance", () => { run.freeRerolls = (run.freeRerolls || 0) + 1; player.crit += 0.05; }],
    bach: ["Toccata", "Spezial-Energie voll", () => { run.ult = 100; }],
    tor: ["Freiheit", "+2 Wurfwaffen", () => addThrow(null, 2, player.x, player.y)],
    bembel: ["Ebbelwoi", "+20 % Leben und Adrenalin", () => { healPlayer(player.maxHp * 0.2); run.rage = Math.max(run.rage || 0, 6); }],
    narrenwagen: ["Kamelle!", "Süßes Konfetti und Münzen", (o) => { for (let i = 0; i < 12; i++) orbs.push(makeOrb(o.x + o.w / 2, o.y + o.h / 2, "coin", 1)); for (let i = 0; i < 14; i++) fxSparks(o.x + o.w / 2, o.y, -Math.PI / 2, 1.6, 1, pick(KAMELLE), rand(120, 260)); }],
    leuchtturm: ["Leuchtfeuer", "Zombies ringsum geblendet", () => { for (const e of enemies) if (!e.dead && !e.def.boss && (e.x - player.x) ** 2 + (e.y - player.y) ** 2 < 320 * 320) e.stunT = Math.max(e.stunT || 0, 2.5); fxFlash(player.x, player.y, 320, "255,240,190", 0.5); }],
    windmuehle: ["Rückenwind", "+6 % Tempo für den Einsatz", () => { player.speed *= 1.06; }],
    eiffel: ["Vue sur Paris", "+12 % Krit-Schaden", () => { player.critMul += 0.12; }],
    riesenrad: ["Überblick", "+60 Spezial-Energie", () => { run.ult = Math.min(100, (run.ult || 0) + 60); }],
    golem: ["Schutz des Golem", "−10 % erlittener Schaden", () => { player.dmgTaken = (player.dmgTaken || 1) * 0.9; }],
  };
  function updateLandmark() {
    const o = obstacles.find((q) => q.landmark && !q.blessed);
    if (!o) return;
    if (run.blessed && run.blessed[o.kind]) { o.blessed = true; return; }
    if (!circleRectOverlap({ x: player.x, y: player.y, r: player.r + 34 }, o)) return;
    o.blessed = true; (run.blessed || (run.blessed = {}))[o.kind] = true;
    const b = LANDMARK_BLESS[o.kind];
    if (!b) return;
    b[2](o);
    track("blessings");
    fxRing(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h) * 0.9, "255,214,120", 0.7); fxRing(player.x, player.y, 70, "255,214,120", 0.5);
    showBanner(tr(b[0]).toUpperCase(), `${tr(o.name)}: ${tr(b[1])}`, 2.2);
    sfx("level"); fx4d("level");
  }
  // Namensschild des Wahrzeichens, solange der Held in der Nähe ist
  function drawLandmarkLabel() {
    if (state !== "play") return;
    const o = obstacles.find((q) => q.landmark);
    if (!o) return;
    const cx = o.x + o.w / 2, d = Math.hypot(player.x - cx, player.y - (o.y + o.h / 2)), a = clamp((380 - d) / 140, 0, 1);
    if (a <= 0) return;
    const q = scr(cx, o.y, mode3d ? LANDMARK_H[o.kind] || 70 : 0);
    if (q.behind) return;
    const txt = tr(o.name).toUpperCase(), hint = !o.blessed && !(run.blessed && run.blessed[o.kind]) ? tr("Hingehen: Segen") : "";
    ctx.save(); ctx.globalAlpha = a; ctx.font = FONT_UI(12, 800);
    const w = Math.max(ctx.measureText(txt).width, hint ? ctx.measureText(hint).width * 0.85 : 0) + 22, y = q.y - 16, hh = hint ? 32 : 20;
    ctx.fillStyle = "rgba(20,16,10,0.82)"; ctx.fillRect(q.x - w / 2, y - 11, w, hh);
    ctx.fillStyle = "#e8c64a"; ctx.fillRect(q.x - w / 2, y - 11, 3, hh); ctx.fillRect(q.x + w / 2 - 3, y - 11, 3, hh);
    ctx.textAlign = "center"; ctx.fillStyle = "#ffe2a3"; ctx.fillText(txt, q.x, y + 4);
    if (hint) { ctx.font = FONT_UI(10, 700); ctx.fillStyle = `rgba(168,255,62,${0.65 + 0.35 * Math.sin(run.time * 5)})`; ctx.fillText(hint, q.x, y + 16); }
    ctx.restore();
  }
  const LANDMARK_H = { kaethchen: 128, roessle: 104, loewe: 118, schoenbrunnen: 170, bach: 124, tor: 110, bembel: 90, narrenwagen: 96, leuchtturm: 160, windmuehle: 130, eiffel: 150, riesenrad: 130, golem: 112 };

  function roundRect(x, y, w, h, r, g = ctx) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // v3.0 Mini-Spiel-Station von oben: Bude mit Streifendach bzw. Funkkiste, pulsierender Ring
  function drawMiniSpot() {
    const s = miniSpot, t = run.time, k = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save();
    ctx.strokeStyle = `rgba(255,212,92,${0.35 + 0.35 * k})`; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 10, s.r + 10, (s.r + 10) * 0.6, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    drawShadow(s.x, s.y + 10, 26);
    if (s.kind === "funk") {
      ctx.fillStyle = "#4a3a24"; ctx.fillRect(s.x - 22, s.y - 6, 44, 26);
      ctx.fillStyle = "#5a6440"; ctx.fillRect(s.x - 17, s.y - 22, 34, 24); ctx.fillStyle = "#3a4228"; ctx.fillRect(s.x - 17, s.y + 0, 34, 4);
      ctx.fillStyle = "#061006"; ctx.fillRect(s.x - 12, s.y - 18, 16, 9); ctx.fillStyle = `rgba(122,255,138,${0.5 + 0.5 * k})`; ctx.fillRect(s.x - 10, s.y - 14, 12, 1.5);
      ctx.strokeStyle = "#2a2a22"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x + 12, s.y - 20); ctx.lineTo(s.x + 22, s.y - 46); ctx.stroke();
      ctx.fillStyle = "#c81e1e"; ctx.beginPath(); ctx.arc(s.x + 22, s.y - 46, 2.5, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = "#6a4426"; ctx.fillRect(s.x - 28, s.y - 10, 56, 26);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? "#f0e6d0" : "#c8201a"; ctx.fillRect(s.x - 30 + i * (60 / 7), s.y - 26, 60 / 7 + 0.5, 16); }
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(s.x - 30, s.y - 12, 60, 3);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = (Math.floor(t * 4) + i) % 3 ? "#fff3c4" : "#6a5a3a"; ctx.beginPath(); ctx.arc(s.x - 24 + i * 12, s.y - 8, 1.8, 0, TAU); ctx.fill(); }
      if (s.kind === "lukas") { ctx.fillStyle = "#e8c21a"; ctx.fillRect(s.x - 3, s.y - 58, 6, 34); ctx.fillStyle = "#c89a2a"; ctx.beginPath(); ctx.arc(s.x, s.y - 60, 6, 0, TAU); ctx.fill(); }
      else { for (let i = 0; i < 3; i++) { ctx.fillStyle = "#8fb06a"; ctx.beginPath(); ctx.arc(s.x - 14 + i * 14, s.y + 2, 4, 0, TAU); ctx.fill(); } }
    }
    ctx.restore();
  }
  // Schild über der Station (2D und 3D)
  function drawMiniLabel() {
    if (!miniSpot || miniSpot.done || state !== "play") return;
    const s = miniSpot, q = scr(s.x, s.y, 74), txt = tr(window.MiniGames.info[s.kind].title).toUpperCase();
    ctx.save(); ctx.font = FONT_UI(13, 800); const w = ctx.measureText(txt).width + 34, y = q.y - 6 + Math.sin(s.bob * 3) * 2;
    ctx.fillStyle = "rgba(20,16,10,0.85)"; ctx.fillRect(q.x - w / 2, y - 12, w, 22);
    ctx.fillStyle = "#ffd45c"; ctx.fillRect(q.x - w / 2, y - 12, 3, 22);
    ctx.textAlign = "left"; ctx.fillStyle = "#ffe2a3"; ctx.fillText(txt, q.x - w / 2 + 24, y + 4);
    drawIcon(ctx, window.MiniGames.info[s.kind].icon, q.x - w / 2 + 14, y, 15, "#ffd45c");
    ctx.restore();
  }
  function drawSupply() {
    const s = supplyCrate;
    drawShadow(s.x, s.y + 8, 24);
    Sprites.draw(ctx, Sprites.supplyCrate(), s.x, s.y - 4 + Math.sin(s.bob * 3) * 3);
  }

  // v3.7 Power-up-Kapsel: Lichtsäule, kreisender Strichring, dunkle Scheibe mit Icon; blinkt kurz vor dem Verfallen
  function drawPowerOrb(o, x, y, s, noBeam) {
    const d = POWERUPS[o.pu], t = o.t, left = PU_LIFE - t;
    const a = left < 3 ? (Math.sin(t * 20) > 0 ? 1 : 0.35) : Math.min(1, t * 4);
    ctx.save();
    glowAt(d.rgb, x, y, (40 + 6 * Math.sin(t * 5)) * s, 0.6 * a);
    if (!noBeam) {
      const bh = 76 * s, gr = ctx.createLinearGradient(0, y - bh, 0, y);
      gr.addColorStop(0, `rgba(${d.rgb},0)`); gr.addColorStop(1, `rgba(${d.rgb},${0.32 * a})`);
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(x - 6 * s, y - bh, 12 * s, bh);
    }
    ctx.globalAlpha = a;
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = `rgba(${d.rgb},0.85)`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 18;
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(8,10,12,0.9)"; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgb(${d.rgb})`; ctx.lineWidth = 2.4; ctx.stroke();
    drawIcon(ctx, d.icon, 0, 0, 18, `rgb(${d.rgb})`);
    ctx.restore();
  }
  // über der 3D-Welt: Icon-Scheibe über der Kapsel (die Kapsel selbst zeichnet render3d.js)
  function drawPowerBadges() {
    if (!mode3d) return;
    for (const o of orbs) if (o.type === "power") { const q = scr(o.x, o.y, 44 + Math.sin(o.t * 4) * 3); if (!q.behind) drawPowerOrb(o, q.x, q.y, 0.95, true); }
  }
  // Ringe mit Restzeit unten links
  function drawPowerHud() {
    const act = activePowers();
    if (!act.length) return;
    ctx.save();
    ctx.textAlign = "center";
    act.forEach((k, i) => {
      const d = POWERUPS[k], left = run.pu[k], f = Math.max(0, left / ((run.puMax && run.puMax[k]) || d.dur));
      const x = 42 + i * 54, y = SB - 40, warn = left < 2.5 && Math.sin(run.time * 18) < 0, col = `rgb(${d.rgb})`;
      glowAt(d.rgb, x, y, 34, 0.35); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(6,9,8,0.82)"; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 18.5, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(x, y, 18.5, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      drawIcon(ctx, d.icon, x, y, 19, warn ? "#ffffff" : col);
      ctx.font = FONT_NUM(16, 700); ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(`${Math.ceil(left)}`, x, y + 38); ctx.fillStyle = col; ctx.fillText(`${Math.ceil(left)}`, x, y + 38);
    });
    ctx.restore();
  }
  // Leuchten unter dem Helden in den Farben der aktiven Power-ups, bei Raserei Funken
  function drawPowerAura2D(p) {
    const act = activePowers();
    if (!act.length || state === "menu") return;
    act.forEach((k, i) => glowAt(POWERUPS[k].rgb, p.x, p.y, 34 + 8 * Math.sin(run.time * 6 + i * 2), 0.42));
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.strokeStyle = `rgba(${POWERUPS[act[0]].rgb},0.7)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 22, 15, 0, run.time * 3, run.time * 3 + 4.4); ctx.stroke();
    ctx.restore();
  }
  function drawShieldBubble(x, y, r) {
    const t = run.time, rgb = POWERUPS.shield.rgb, warn = run.pu.shield < 2 && Math.sin(t * 18) < 0;
    ctx.save();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(220,245,255,0.18)"); g.addColorStop(0.75, `rgba(${rgb},0.1)`); g.addColorStop(1, `rgba(${rgb},${warn ? 0.2 : 0.5})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},${warn ? 0.4 : 0.9})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, t * 2, t * 2 + 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, t * 2 + Math.PI, t * 2 + Math.PI + 2.2); ctx.stroke();
    ctx.restore();
  }

  function drawOrbs() {
    const t = run.time;
    for (const o of orbs) {
      if (o.type === "coin") Sprites.draw(ctx, Sprites.coin(Math.floor(t * 12 + o.x * 0.1)), o.x, o.y);
      else if (o.type === "heal" && o.food) {
        // Brezel: drei verschlungene Bögen
        ctx.strokeStyle = "#7a4a1c"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(o.x - 4, o.y, 5.5, 0.3, 5.9); ctx.stroke(); ctx.beginPath(); ctx.arc(o.x + 4, o.y, 5.5, -2.8, 2.8, true); ctx.stroke();
        ctx.strokeStyle = "#c98a3a"; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(o.x - 4, o.y, 5.5, 0.3, 5.9); ctx.stroke(); ctx.beginPath(); ctx.arc(o.x + 4, o.y, 5.5, -2.8, 2.8, true); ctx.stroke();
        ctx.fillStyle = "#fff"; for (const [dx, dy] of [[-6, -2], [5, 3], [-2, 4]]) ctx.fillRect(o.x + dx, o.y + dy, 1.4, 1.4);
      } else if (o.type === "heal") {
        ctx.fillStyle = "#f2f2ec"; roundRect(o.x - 8, o.y - 7, 16, 14, 3); ctx.fill();
        ctx.fillStyle = "#e5383b"; ctx.fillRect(o.x - 1.8, o.y - 5, 3.6, 10); ctx.fillRect(o.x - 5, o.y - 1.8, 10, 3.6);
      } else if (o.type === "gear") {
        // v3.3 Beutekiste: Holzkiste mit Lichtschein in der Seltenheitsfarbe
        const rgb = GEAR_RARITY[o.item.r].rgb, bob = Math.sin(o.t * 4) * 1.5;
        glowAt(rgb, o.x, o.y, 34 + 6 * Math.sin(o.t * 5), 0.5);
        ctx.save(); ctx.translate(o.x, o.y + bob);
        ctx.fillStyle = "#6e4622"; roundRect(-9, -7, 18, 14, 2); ctx.fill();
        ctx.fillStyle = "#8f5e30"; ctx.fillRect(-9, -7, 18, 3); ctx.fillRect(-9, 4, 18, 3);
        ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, 6); ctx.moveTo(8, -6); ctx.lineTo(-8, 6); ctx.stroke();
        ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(-2.5, -3, 5, 6);
        ctx.restore();
      } else if (o.type === "power") drawPowerOrb(o, o.x, o.y - 6 + Math.sin(o.t * 4) * 3, 1);
      else if (o.type === "pfand") {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(0.6 + o.t * 2);
        ctx.fillStyle = "#2f7a3a"; roundRect(-3.5, -7, 7, 12, 2.5); ctx.fill(); ctx.fillRect(-1.6, -10, 3.2, 4);
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-2, -5, 1.2, 8); ctx.fillStyle = "#e8e0c8"; ctx.fillRect(-3.5, -2, 7, 3);
        ctx.restore();
      }
    }
  }

  function drawAmbient(glowPass) {
    const th = theme();
    if (glowPass !== (th === "lab")) return;
    if (th === "lab") {
      for (const a of ambient) glowAt("140,255,90", a.x, a.y, a.size * 2.5, 0.3 + 0.2 * Math.sin(a.ph * 2));
    } else {
      const wx = curWeather();
      if (wx === "snow" && (th === "street" || th === "markt")) { ctx.fillStyle = "rgba(245,248,255,0.85)"; for (const a of ambient) { ctx.beginPath(); ctx.arc(a.x, a.y, a.size * 1.3, 0, TAU); ctx.fill(); } return; }
      if (wx === "confetti" && (th === "street" || th === "markt")) { ambient.forEach((a, i) => { ctx.fillStyle = ["#ff4a5a", "#ffd23a", "#4ad1ff", "#7dff6a", "#ff7ae0"][i % 5]; ctx.fillRect(a.x, a.y, a.size * 2, a.size * 1.2); }); return; }
      ctx.fillStyle = th === "street" || th === "markt" ? "rgba(190,190,190,0.35)" : "rgba(230,240,235,0.22)";
      for (const a of ambient) ctx.fillRect(a.x, a.y, a.size, a.size);
    }
  }
  // Wetter/Fest der aktuellen Stadt (Kampagne), sonst Regen auf der Straße
  const curWeather = () => (run && run.mode === "campaign" && run.room > 0 ? curCity().weather : "rain");
  const curFest = () => (run && run.mode === "campaign" && run.room > 0 ? curCity().fest : "");

  function drawCorpses() {
    for (const c of corpses) {
      const k = c.death === "freeze" ? 0 : c.fall;
      const ang = c.face + c.fallDir * 0.4 * k + c.roll * 0.3, sc = c.sc * (1 - 0.12 * k) * (1 + c.z / 260);
      if (c.z > 2) drawShadow(c.x, c.y, c.r);
      const y = c.y - c.z;
      Sprites.draw(ctx, Sprites.zombie(c.type, c.f, c.v, c.evo), c.x, y, ang, sc);
      const fx = c.death === "freeze" ? "ice" : c.death === "shock" && c.t < 0.6 && Math.random() < 0.5 ? "hit" : "corpse";
      ctx.globalAlpha = fx === "corpse" ? k * (c.death === "burn" ? 1 : 0.85) : 0.9;
      Sprites.draw(ctx, Sprites.zombieFx(c.type, c.f, c.v, fx, c.evo), c.x, y, ang, sc);
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
    if (run.obj && run.obj.list) for (const s of run.obj.list) actorList.push(s);
    actorList.push(player);
    actorList.sort((a, b) => a.y - b.y);
    for (const a of actorList) { if (a === player) drawPlayer(); else if (a.isSurvivor) drawSurvivor(a); else drawEnemy(a); }
  }

  function drawEnemy(e) {
    const f = Math.floor(e.anim) % Sprites.FRAMES;
    if (e.under === "burrow") {
      // Erdhügel wandert unter dem Boden
      const w = Math.sin(run.time * 18 + e.wob) * 1.5;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(e.x, e.y + 3, 17, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#5a4a3a"; ctx.beginPath(); ctx.ellipse(e.x, e.y + w, 14, 8, e.face, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7a6650"; ctx.beginPath(); ctx.ellipse(e.x - 2, e.y - 2 + w, 8, 4, e.face, 0, TAU); ctx.fill();
      return;
    }
    if (e.under) return;
    if (e.spawnT > 0) {
      const k = Math.min(1, Math.max(0, 1 - e.spawnT / e.spawnMax));
      ctx.globalAlpha = k;
      Sprites.draw(ctx, Sprites.zombie(e.type, f, e.variant, e.evo), e.x, e.y + (1 - k) * 8, e.face, e.scale * (0.55 + 0.45 * k));
      ctx.globalAlpha = 1;
      return;
    }
    drawShadow(e.x, e.y, e.r * e.scale);
    let x = e.x, y = e.y - e.jumpZ;
    if (e.mode === "wind" || e.mode === "zap") { x += rand(-1.5, 1.5); y += rand(-1.5, 1.5); }
    if (e.elite) glowAt(e.aff ? AFFIXES[e.aff[0]].rgb : "255,200,80", e.x, e.y, e.r * 2.2, 0.35 + 0.15 * Math.sin(run.time * 5));
    if (e.evo) drawEvoUnder(e);
    let sc = e.scale * (e.type === "nest" ? 1 + Math.sin(run.time * 4 + e.wob) * 0.05 : 1 + Math.sin(e.anim * 0.8) * 0.015);
    if (e.evoCrouch > 0) sc *= 0.92; // duckt sich vor dem Sprung
    if (e.evoFx > 0) sc *= 1 + Math.sin(e.evoFx * 22) * 0.06 * e.evoFx; // pulsiert bei der Mutation
    if (e.type === "phantom") ctx.globalAlpha = e.glitchT > 0 ? (Math.random() < 0.5 ? 0.15 : 0.9) : 0.6 + 0.18 * Math.sin(run.time * 9 + e.wob);
    Sprites.draw(ctx, Sprites.zombie(e.type, f, e.variant, e.evo), x, y, e.face, sc);
    ctx.globalAlpha = 1;
    if (e.shield > 0) {
      // Energieschild: blaue Blase, flackert stärker, je schwächer sie wird
      const k = Math.min(1, e.shield / (e.maxHp * 0.4)), rr = e.r * e.scale * 1.7;
      const gr = ctx.createRadialGradient(x, y, rr * 0.55, x, y, rr);
      gr.addColorStop(0, "rgba(140,210,255,0)"); gr.addColorStop(1, `rgba(140,210,255,${0.25 + 0.2 * k})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(190,235,255,${0.45 + 0.35 * k * (0.7 + 0.3 * Math.sin(run.time * 12 + e.wob))})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    }
    if (e.slowT > 0) { ctx.globalAlpha = 0.8; Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "ice", e.evo), x, y, e.face, sc); }
    if (e.phase2 || e.rageT > 0) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(run.time * 10); Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "rage", e.evo), x, y, e.face, sc); }
    if (e.hitT > 0) { ctx.globalAlpha = Math.min(1, e.hitT / 0.1); Sprites.draw(ctx, Sprites.zombieFx(e.type, f, e.variant, "hit", e.evo), x, y, e.face, sc); }
    ctx.globalAlpha = 1;
  }

  // v3.7 Evolution in 2D: Schein in Stufenfarbe, Fress-Fortschritt, Sprung-Warnung, Brüll-Welle
  function drawEvoUnder(e) {
    const B = EVO[e.evo], t = run.time;
    if (e.evo >= 2) glowAt(B.rgb, e.x, e.y, e.r * (e.evo === 3 ? 2.6 : 2) * e.scale, 0.22 + 0.1 * Math.sin(t * 4 + e.wob));
    if (e.evoFx > 0) glowAt(B.rgb, e.x, e.y, e.r * 3.4, e.evoFx * 0.8);
    if (e.roarFx > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = `rgba(255,70,60,${e.roarFx})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 240 * (1 - e.roarFx / 0.7) + 20, 0, TAU); ctx.stroke(); }
    if (e.evoCrouch > 0) { // rote Sprungbahn
      const a = e.leapAng, L2 = 170;
      ctx.save(); ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 30); ctx.translate(e.x, e.y); ctx.rotate(a);
      const gr = ctx.createLinearGradient(0, 0, L2, 0); gr.addColorStop(0, `rgba(${B.rgb},0.7)`); gr.addColorStop(1, `rgba(${B.rgb},0)`);
      ctx.fillStyle = gr; ctx.fillRect(0, -e.r * 0.7, L2, e.r * 1.4); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  // Fress-Fortschritt über der Leiche (Weltkoordinaten in 2D, Bildschirm in 3D – im Overlay gezeichnet)
  function drawFeeding() {
    for (const e of enemies) {
      if (!e.feed || e.feed.t <= 0 || e.dead) continue;
      const k = e.feed.t / EVO_FEED_T, B = EVO[Math.min(3, (e.evo || 0) + 1)], q = scr(e.x, e.y - (mode3d ? 0 : e.r + 18), mode3d ? e.r * 2.6 : 0);
      if (q.behind) continue;
      ctx.save();
      ctx.fillStyle = "rgba(10,6,6,0.8)"; ctx.beginPath(); ctx.arc(q.x, q.y, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgb(${B.rgb})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, 10, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      drawIcon(ctx, "dna", q.x, q.y, 12, `rgb(${B.rgb})`);
      ctx.restore();
    }
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
    drawPowerAura2D(p);
    const pack = p.weaponId === "flame" ? "tanks" : "pack";
    const body = Sprites.playerBody(p.moving ? Math.floor(p.walkT) % Sprites.FRAMES : -1, pack, p.skin);
    const ws = Sprites.weapon(p.weaponId, p.tier, Math.floor(p.barrel));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    if (blink) ctx.globalAlpha = 0.4;
    ctx.drawImage(body.c, -body.w / 2 - p.kick * 0.4, -body.h / 2, body.w, body.h);
    drawGearLook2D(p);
    ctx.drawImage(ws.c, GRIP_X - ws.grip - p.kick, GRIP_Y - ws.h / 2, ws.w, ws.h);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (puOn("shield")) drawShieldBubble(p.x, p.y, 30);
    // Drohnen
    const dr = Sprites.drone();
    for (let i = 0; i < p.drones; i++) {
      const d = dronePos(i);
      drawShadow(d.x, d.y + 22, 8);
      Sprites.draw(ctx, dr, d.x, d.y + Math.sin(run.time * 4 + i) * 2, Math.sin(run.time + i) * 0.3);
    }
  }

  // v3.4 Ausrüstung in 2D (von oben, im gedrehten Rahmen des Helden: vorn = +x): Rucksack, Schulterstücke, Helmrand
  const GEAR_TRIM2D = ["#8a9096", "#3a86d0", "#8a5ad8", "#e0b040"];
  function drawGearLook2D(p) {
    const g = save.gear || {}, k = (s) => (g[s] ? g[s].r : -1);
    if (k("pack") >= 0 && p.weaponId !== "flame") { ctx.fillStyle = "#2e3034"; roundRect(-17, -8, 8, 16, 2); ctx.fill(); ctx.fillStyle = GEAR_TRIM2D[k("pack")]; ctx.fillRect(-17, -8, 3, 16); }
    if (k("vest") >= 0) { ctx.fillStyle = GEAR_TRIM2D[k("vest")]; ctx.fillRect(-4, -11, 7, 3); ctx.fillRect(-4, 8, 7, 3); }
    if (k("helm") >= 0) { ctx.strokeStyle = GEAR_TRIM2D[k("helm")]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.stroke(); if (k("helm") >= 3) { ctx.fillStyle = "#ffd86a"; ctx.fillRect(-5, -1, 8, 2); } }
    if (k("gloves") >= 3) { ctx.fillStyle = "#c8d0d8"; ctx.beginPath(); ctx.arc(GRIP_X - 2, GRIP_Y, 3, 0, TAU); ctx.fill(); }
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
        case "gas": { ctx.globalAlpha = Math.min(1, k * 1.6) * (1 - k * 0.3) * 0.2; ctx.fillStyle = `rgb(${p.rgb})`; ctx.beginPath(); ctx.arc(p.x, p.y, 22 * p.size, 0, TAU); ctx.fill(); break; }
        case "mist": ctx.globalAlpha = k * 0.35; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size * (1.6 - k * 0.6), 0, TAU); ctx.fill(); break;
        case "gib": case "casing": ctx.globalAlpha = 1; Sprites.draw(ctx, p.spr, p.x, p.y - p.z, p.rot); break;
        case "debris": ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.z - p.size / 2, p.size, p.size); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // v3.5 2D: Licht aus Schaufenstern und Leuchtreklamen fällt an den Häuserkanten auf den Boden (je Raum ausgewürfelt)
  let wallGlows = [], wallGlowsFor = null;
  const WALL_NEON = { street: ["255,180,90", "255,200,120", "120,200,255", "255,110,190", "60,230,120", "255,90,60"], markt: ["255,190,110", "255,210,150", "255,170,90"], hospital: ["200,230,255", "255,60,50", "120,200,255"], lab: ["110,255,200", "120,220,255", "255,80,60"] };
  function syncWallGlows() {
    if (wallGlowsFor === floorCanvas) return;
    wallGlowsFor = floorCanvas; wallGlows = [];
    const pal = WALL_NEON[theme()] || WALL_NEON.street;
    for (const side of [-1, 1]) for (let y = T + 50; y < B - 30; y += 70 + Math.random() * 70) {
      if (Math.random() < 0.42 || gates.some((g2) => Math.abs(g2.y - y) < g2.h)) continue;
      wallGlows.push({ x: side < 0 ? L + 4 : R - 4, y, rgb: pick(pal), r: 34 + Math.random() * 26, ph: Math.random() * TAU, flick: Math.random() < 0.15 });
    }
  }
  const wallGlowK = (gl, t) => (gl.flick && Math.sin(t * 17 + gl.ph) * Math.sin(t * 5.3 + gl.ph * 2) > 0.55 ? 0.15 : 1);
  function collectLights() {
    lights.length = 0;
    const p = player, t = run.time;
    lights.push([p.x, p.y, 175, 1]);
    syncWallGlows();
    for (const gl of wallGlows) lights.push([gl.x, gl.y, gl.r * 1.5, 0.42 * wallGlowK(gl, t)]);
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
      const eye = e.evo ? EVO[e.evo].eye : e.type === "spitter" || e.type === "abom" ? "234,255,0" : e.type === "armored" ? "255,120,60" : "255,40,30";
      glowAt(eye, hx, hy, e.def.boss ? e.r * 0.45 : e.r * 0.75, 0.45);
      // v3.7 zwei glühende Pupillen statt eines Flecks (nur nah genug am Rand des Kopfes)
      const ex = -fy * e.r * 0.16, ey = fx * e.r * 0.16, er = Math.max(2.2, e.r * 0.13);
      glowAt(eye, hx + ex, hy + ey, er * 2.2, 0.9); glowAt(eye, hx - ex, hy - ey, er * 2.2, 0.9);
      glowAt("255,236,200", hx + ex, hy + ey, er * 0.7, 0.85); glowAt("255,236,200", hx - ex, hy - ey, er * 0.7, 0.85);
      if (e.type === "bomber" && Math.sin(t * 14 + e.wob) > 0) glowAt("255,40,20", e.x - fx * e.r * 0.8, e.y - fy * e.r * 0.8, 14, 0.9);
      if (e.type === "spitter") glowAt("183,255,74", hx + fx * e.r * 0.35, hy + fy * e.r * 0.35, 12, 0.55);
      if (e.type === "mother") glowAt("150,255,80", e.x - fx * e.r * 0.4, e.y - fy * e.r * 0.4, e.r * 1.2, 0.35);
      if (e.phase2) glowAt("255,40,60", e.x, e.y, e.r * 1.8, 0.25 + 0.15 * Math.sin(t * 10));
      if (e.slowT > 0) glowAt("150,220,255", e.x, e.y, e.r * 1.3, 0.3);
      if (e.looter) glowAt("255,210,90", e.x, e.y, e.r * 2.6, 0.45 + 0.15 * Math.sin(t * 9)); // v3.7 Plünderer glänzt golden
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
    if (!mode3d) for (const gl of wallGlows) glowAt(gl.rgb, gl.x, gl.y, gl.r, 0.3 * wallGlowK(gl, run.time)); // v3.5 Schaufenster-Licht
    // Partikel
    for (const q of particles) {
      const k = Math.max(0, q.life / q.max);
      switch (q.t) {
        case "spark": ctx.globalAlpha = k; drawStreak(q.rgb, q.x, q.y, Math.atan2(q.vy, q.vx), Math.min(18, Math.hypot(q.vx, q.vy) * 0.05 + 3), q.w); break;
        case "fire": { // v3.5 Flammenzunge über weichem Glutschein
          const fy = q.y - (q.z || 0) * 0.55, fs = q.size * (1.5 - k * 0.5), fl = 1 + 0.18 * Math.sin(run.time * 23 + q.x * 0.7);
          glowAt(fireRgb(k), q.x, fy, fs * 0.9, 0.5 * k);
          const fsp = Sprites.flame(k > 0.5 ? "255,190,90" : "255,120,40"), fw = fs * 1.1 * fl, fh = fs * 1.7 / fl;
          ctx.globalAlpha = Math.min(1, k * 1.6) * 0.95; ctx.drawImage(fsp.c, q.x - fw / 2, fy - fh * 0.85, fw, fh);
          break;
        }
        case "boom": { // v3.5 2D-Explosion: Blitz + brodelnde Feuerball-Ballen (vorher nur in 3D)
          const e = 1 - k, r = q.r, sd = q.fxs || (q.fxs = 1 + Math.random() * 1000);
          if (e < 0.25) glowAt("255,236,200", q.x, q.y, r * (1.3 + e * 2), (1 - e / 0.25) * 0.75);
          for (let i = 0; i < 7; i++) {
            const life = Math.max(0, 1 - e * (1.25 + (i % 3) * 0.22));
            if (life <= 0) continue;
            const a = sd + i * 0.9, d = r * (0.12 + 0.4 * Math.sqrt(e)) * (0.5 + ((i * 37) % 10) / 20), s2 = r * (0.42 + 0.42 * Math.sqrt(e));
            const fb = Sprites.fireball(life > 0.75 ? "255,226,170" : life > 0.45 ? "255,160,60" : "220,84,28");
            ctx.globalAlpha = Math.min(0.85, life * 1.1); ctx.drawImage(fb.c, q.x + Math.cos(a) * d - s2, q.y + Math.sin(a) * d * 0.8 - s2 - e * r * 0.25, s2 * 2, s2 * 2);
          }
          break;
        }
        case "ember": glowAt("255,160,60", q.x, q.y - (q.z || 0) * 0.55, q.size, k); break;
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
    for (const b of eBullets) {
      if (b.kind) {
        ctx.save(); ctx.translate(b.x, b.y);
        if (b.kind === "barrel") {
          // rollendes Bierfass (von oben: Rechteck mit Reifen, die durchlaufen)
          ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-b.r + 3, -b.r * 0.9 + 4, b.r * 2, b.r * 1.8);
          ctx.fillStyle = "#7a4e2a"; ctx.fillRect(-b.r, -b.r * 0.9, b.r * 2, b.r * 1.8);
          ctx.fillStyle = "#5a3818"; for (let i = 0; i < 4; i++) { const y = ((b.spin * 4 + i * 0.25) % 1) * b.r * 1.8 - b.r * 0.9; ctx.fillRect(-b.r, y, b.r * 2, 2); }
          ctx.fillStyle = "#9aa3ad"; ctx.fillRect(-b.r, -b.r * 0.9, 3, b.r * 1.8); ctx.fillRect(b.r - 3, -b.r * 0.9, 3, b.r * 1.8);
          ctx.restore(); continue;
        }
        if (b.kind === "anchor") {
          ctx.restore(); ctx.save();
          const o = b.owner; if (o) { ctx.strokeStyle = "#5a6068"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
          ctx.translate(b.x, b.y); ctx.rotate(b.spin);
          ctx.strokeStyle = "#c4ccd4"; ctx.lineWidth = 4; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(0, -b.r); ctx.lineTo(0, b.r * 0.8); ctx.moveTo(-b.r * 0.55, -b.r * 0.55); ctx.lineTo(b.r * 0.55, -b.r * 0.55); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, b.r * 0.1, b.r * 0.75, 0.35, Math.PI - 0.35); ctx.stroke();
          ctx.restore(); continue;
        }
        if (b.kind === "harpoon") {
          ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.strokeStyle = "#8a6a4a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(4, 0); ctx.stroke();
          ctx.fillStyle = "#dfe6ee"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, -4); ctx.lineTo(2, 4); ctx.closePath(); ctx.fill();
          ctx.restore(); continue;
        }
        if (b.kind === "ball") {
          // Fußball mit Schatten und rollenden Flecken
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(2, 5, 7, 3.5, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#f4f4f0"; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
          ctx.fillStyle = "#1a1a1a";
          for (let i = 0; i < 3; i++) { const a = b.spin + i * 2.1, k = Math.cos(b.spin * 0.7 + i); ctx.beginPath(); ctx.arc(Math.cos(a) * b.r * 0.5 * k, Math.sin(a) * b.r * 0.5, b.r * 0.28, 0, TAU); ctx.fill(); }
          ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.stroke();
        } else if (b.kind === "paper") {
          // Formular mit Zeilen und rotem Stempel
          ctx.rotate(b.spin); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(-5, -6, 12, 15);
          ctx.fillStyle = "#f2eee0"; ctx.fillRect(-6, -8, 12, 15);
          ctx.fillStyle = "#8a8a9a"; for (let y = -5; y < 4; y += 2.5) ctx.fillRect(-4, y, 8, 0.9);
          ctx.strokeStyle = "#d02a2a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(2, 3.5, 2.6, 0, TAU); ctx.stroke();
        } else {
          // Kamelle: Bonbon mit gedrehtem Papier
          ctx.rotate(b.spin); ctx.fillStyle = `rgb(${b.rgb})`;
          ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 3.2, 0, 0, TAU); ctx.fill();
          for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s2 * 4, 0); ctx.lineTo(s2 * 8, -3); ctx.lineTo(s2 * 8, 3); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.ellipse(-1, -1.2, 2, 1, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
        continue;
      }
      if (b.slug) {
        // Leuchtspur in Flugrichtung
        const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
        ctx.strokeStyle = "rgba(255,190,90,0.9)"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(b.x - ux * 22, b.y - uy * 22); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = "#fff4d8"; ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, TAU); ctx.fill();
      } else Sprites.draw(ctx, b.pink ? pink : green, b.x, b.y, 0, (b.r * 2.3) / 24);
    }
  }

  function drawLobTargets() {
    for (const q of lobs) {
      const k = Math.min(1, q.t / q.T), c = q.kind === "krug" ? "255,190,60" : "255,60,40";
      if (q.kind === "parcel") continue; // Pakete warnen erst am Boden
      ctx.fillStyle = `rgba(${c},${0.1 + 0.18 * k})`; ctx.beginPath(); ctx.arc(q.x1, q.y1, q.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${c},${0.5 + 0.4 * Math.sin(run.time * 24)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(q.x1, q.y1, q.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(${c},0.35)`; ctx.beginPath(); ctx.arc(q.x1, q.y1, q.r * k, 0, TAU); ctx.fill();
    }
  }
  function drawParcels() {
    for (const q of parcels) {
      const k = 1 - q.t / q.max, blink = Math.sin(run.time * (10 + 30 * k)) > 0;
      ctx.fillStyle = `rgba(255,60,40,${0.08 + 0.22 * k})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,80,60,${blink ? 0.9 : 0.4})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.stroke();
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.spin);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-8, -6, 18, 16);
      ctx.fillStyle = "#a07a4a"; ctx.fillRect(-10, -9, 20, 17); ctx.fillStyle = "#d8c49a"; ctx.fillRect(-2, -9, 4, 17);
      ctx.fillStyle = blink ? "#ff3020" : "#5a1010"; ctx.beginPath(); ctx.arc(6, -5, 2.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  function drawLobs() {
    for (const q of lobs) {
      drawShadow(q.x, q.y, 10 * (1 - q.z / 300));
      ctx.save(); ctx.translate(q.x, q.y - q.z); ctx.rotate(q.spin);
      if (q.kind === "gift" || q.kind === "parcel") {
        // Geschenk (rot, goldene Schleife) bzw. Paket (Karton, Klebeband)
        const gift = q.kind === "gift";
        ctx.fillStyle = gift ? "#c8202a" : "#a07a4a"; ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = gift ? "#f2c21a" : "#d8c49a"; ctx.fillRect(-2, -9, 4, 18); if (gift) ctx.fillRect(-9, -2, 18, 4);
        ctx.restore();
        continue;
      }
      if (q.kind === "coal") {
        ctx.fillStyle = "#1c1c1e"; ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-2, -10); ctx.lineTo(9, -6); ctx.lineTo(10, 4); ctx.lineTo(2, 10); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,120,40,0.8)"; ctx.fillRect(-3, -2, 5, 3);
        ctx.restore();
        continue;
      }
      if (q.kind === "krug") {
        // Maßkrug: Glas mit Bier, Schaumkrone, Henkel
        ctx.strokeStyle = "#d8e6ea"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(8, 0, 5, -1.3, 1.3); ctx.stroke();
        ctx.fillStyle = "rgba(220,235,240,0.85)"; ctx.fillRect(-8, -9, 16, 18);
        ctx.fillStyle = "#e0a42a"; ctx.fillRect(-6.5, -5, 13, 13);
        ctx.fillStyle = "#fff8e8"; ctx.beginPath(); ctx.ellipse(0, -7, 8, 3.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-6, -4, 2, 11);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = "#6f6a62"; ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(-3, -11); ctx.lineTo(9, -8); ctx.lineTo(12, 3); ctx.lineTo(4, 11); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#8a847a"; ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(2, -8); ctx.lineTo(7, -3); ctx.lineTo(-2, 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#4a463f"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(5, 6); ctx.stroke();
      ctx.restore();
    }
  }
  function drawBeams() {
    if (!beams.length) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const b of beams) {
      const k = Math.min(1, b.life / b.max * 2);
      const x2 = b.x2, y2 = b.y2;
      ctx.strokeStyle = `rgba(${b.rgb},${0.25 * k})`; ctx.lineWidth = b.w * 3;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = `rgba(${b.rgb},${0.85 * k})`; ctx.lineWidth = b.w * 0.6;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  }
  // Warnflächen der Bosse und E-Scooter (e.tele): Linie, Kegel, Kreis – füllen sich bis zum Angriff
  function drawTele(e) {
    const q = e.tele, k = 1 - Math.max(0, q.t) / q.max, rgb = q.rgb || "255,50,40";
    ctx.save();
    if (q.k === "lane") {
      ctx.translate(e.x, e.y); ctx.rotate(q.ang);
      ctx.fillStyle = `rgba(${rgb},${0.1 + 0.12 * k})`; ctx.fillRect(0, -q.w / 2, q.len, q.w);
      ctx.fillStyle = `rgba(${rgb},${0.22 + 0.25 * k})`; ctx.fillRect(0, -q.w / 2, q.len * k, q.w);
      ctx.strokeStyle = `rgba(${rgb},0.8)`; ctx.lineWidth = 2; ctx.strokeRect(0, -q.w / 2, q.len, q.w);
    } else if (q.k === "cone") {
      ctx.translate(e.x, e.y);
      const path = (r) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, q.ang - q.arc / 2, q.ang + q.arc / 2); ctx.closePath(); };
      ctx.fillStyle = `rgba(${rgb},${0.1 + 0.12 * k})`; path(q.r); ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${0.2 + 0.25 * k})`; path(q.r * k); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.8)`; ctx.lineWidth = 2; path(q.r); ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${rgb},${0.08 + 0.12 * k})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${0.2 + 0.2 * k})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * k, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},${0.55 + 0.35 * Math.sin(run.time * 26)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function drawTelegraphs() {
    for (const e of enemies) {
      if (e.tele && e.mode === "tele" && !e.dead) drawTele(e);
      if (e.mode === "crouch") {
        ctx.strokeStyle = `rgba(255,80,60,${0.35 + 0.3 * Math.sin(run.time * 30)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dirX * 190, e.y + e.dirY * 190); ctx.stroke(); ctx.setLineDash([]);
      } else if (e.mode === "zap") {
        ctx.strokeStyle = `rgba(127,231,255,${0.3 + 0.3 * Math.sin(run.time * 25)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, 150 * (1 - Math.max(0, e.aiT) / 0.75 * 0.4), 0, TAU); ctx.stroke();
      } else if (e.mode === "whistle") {
        // Schaffner holt Luft: gelber Kreis zeigt die Reichweite des Pfiffs
        const k = 1 - Math.max(0, e.aiT) / 0.75;
        ctx.fillStyle = `rgba(255,220,90,${0.06 + 0.1 * k})`; ctx.beginPath(); ctx.arc(e.x, e.y, 200, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,230,120,${0.4 + 0.3 * Math.sin(run.time * 28)})`; ctx.lineWidth = 2.5; ctx.setLineDash([10, 7]);
        ctx.beginPath(); ctx.arc(e.x, e.y, 200, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,240,170,0.7)"; ctx.beginPath(); ctx.arc(e.x, e.y, 200 * k, 0, TAU); ctx.stroke();
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
    drawObjectiveMarks();
    for (const e of enemies) {
      const tag = e.elite && e.aff;
      if (e.def.boss || e.spawnT > 0 || (e.hp >= e.maxHp && !tag)) continue;
      // v3.6 Balken nur nach Treffern (blendet nach 3 s aus – Horden bleiben lesbar), helle Schadensspur läuft verzögert nach
      const kk = Math.max(0, e.hp / e.maxHp);
      if (e.barHp !== e.hp) { e.barHp = e.hp; e.barAt = run.time; }
      e.barK = e.barK == null ? kk : run.time - e.barAt > 0.35 ? Math.max(kk, e.barK - 1.6 * (1 / 60)) : e.barK;
      const show = Math.max(0, Math.min(1, (3.2 - (run.time - (e.barAt || 0))) / 0.5));
      const w = Math.max(20, e.r * 2);
      const q = scr(e.x, e.y, mode3d ? Render3D.heightOf(e) + 6 : 0);
      const x = q.x, y = mode3d ? q.y - 6 : e.y - e.r * e.scale - 13;
      if (e.hp < e.maxHp && show > 0) {
        ctx.globalAlpha = show;
        ctx.fillStyle = "rgba(0,0,0,0.72)"; roundRect(x - w / 2 - 1.5, y - 1.5, w + 3, 6, 2.5); ctx.fill();
        if (e.barK > kk) { ctx.fillStyle = "rgba(255,236,190,0.9)"; ctx.fillRect(x - w / 2, y, w * e.barK, 3); }
        const blue = e.def.armor || (tag && e.aff.includes("armored"));
        ctx.fillStyle = blue ? "#7fb4ff" : kk < 0.3 ? "#ff3a2a" : "#e5383b"; ctx.fillRect(x - w / 2, y, w * kk, 3);
        ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(x - w / 2, y, w * kk, 1);
        ctx.globalAlpha = 1;
      }
      if (tag) drawEnemyTag(e, x, y);
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
    const debuff = p.jamT > 0 ? tr("VERSPÄTUNG") : p.slowT > 0 ? tr("AUSGEBREMST") : "";
    if (debuff) { ctx.font = FONT_UI(11); ctx.fillStyle = `rgba(255,${180 + 60 * Math.sin(run.time * 10)},80,0.95)`; ctx.fillText(debuff, px, y + 20); }
  }

  function drawTexts() {
    ctx.textAlign = "center";
    for (const t of texts) {
      const age = t.max - t.life;
      const pop = age < 0.1 ? 0.6 + age * 8 : Math.max(1, 1.4 - (age - 0.1) * 3);
      const a = Math.min(1, (t.life / t.max) * 2.5), q = scr(t.x, t.y, 30), fs = Math.round(t.size * pop * 1.35);
      ctx.save(); ctx.translate(q.x, q.y); if (t.rot) ctx.rotate(t.rot);
      // v3.6 Krit-Zahlen: Leuchtstern dahinter, Farbverlauf hell → orange, dicke Kontur
      if (t.num && t.crit) {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a * 0.55 * Math.max(0.4, 1.3 - age * 2);
        ctx.drawImage(Sprites.glow("255,180,60").c, -fs * 1.1, -fs * 1.15, fs * 2.2, fs * 1.6);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = a;
      ctx.font = FONT_NUM(fs, 700);
      ctx.lineWidth = t.crit ? 5 : 3.5; ctx.lineJoin = "round";
      ctx.strokeStyle = t.num && t.crit ? "rgba(70,20,0,0.95)" : "rgba(0,0,0,0.85)";
      ctx.strokeText(t.txt, 0, 0);
      if (t.num && t.crit) { const gr = ctx.createLinearGradient(0, -fs * 0.8, 0, fs * 0.1); gr.addColorStop(0, "#fff6c0"); gr.addColorStop(0.55, "#ffc23a"); gr.addColorStop(1, "#ff6a1a"); ctx.fillStyle = gr; }
      else ctx.fillStyle = t.color;
      ctx.fillText(t.txt, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Blitz: kurz bläulich-weiß aufhellen
  function drawFlash() {
    const f = mode3d && save.cine !== false ? Render3D.flash : 0;
    if (f > 0.02) { ctx.fillStyle = `rgba(200,220,255,${f * 0.16})`; ctx.fillRect(0, 0, W, H); }
  }
  function drawScreenFx() {
    ctx.drawImage(vignette, 0, 0, vignette.width * LS, vignette.height * LS);
    drawFlash();
    const p = player;
    const low = p.hp / p.maxHp < 0.3 && state === "play" ? 0.25 + 0.15 * Math.sin(run.time * 6) : 0;
    for (const d of screenBlood) {
      ctx.globalAlpha = Math.min(1, (d.life / d.max) * 2) * 0.8;
      Sprites.draw(ctx, Sprites.splat("#5e070b", d.v), d.x, d.y + d.dy, d.a, d.s);
    }
    ctx.globalAlpha = 1;
    const rage = run.rage > 0 ? Math.min(1, run.rage) * (0.3 + 0.12 * Math.sin(run.time * 11)) : 0; // Adrenalin pocht
    const a = Math.max((p.hurtT / 0.35) * 0.5, low, rage);
    if (a > 0) {
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(hurtVignette, 0, 0, hurtVignette.width * LS, hurtVignette.height * LS);
      ctx.globalAlpha = 1;
    }
    // v3.7 Zeitlupe: leichter kühler Schleier über allem (auf Grafikstufe 2 entsättigt zusätzlich der Nachbearbeitungs-Shader)
    if (state === "play" && puOn("slow") && !(mode3d && quality >= 2)) { ctx.fillStyle = `rgba(50,60,150,${0.1 + 0.03 * Math.sin(run.time * 3)})`; ctx.fillRect(0, 0, W, H); }
    // v3.7 Power-ups: farbiger Bildrand – kurz kräftig beim Einsammeln, danach leise für das erste aktive
    const act = state === "play" ? activePowers() : [];
    if (puFlash || act.length) {
      const v = puVignette(puFlash ? puFlash.rgb : POWERUPS[act[0]].rgb);
      ctx.globalAlpha = puFlash ? 0.3 + 0.7 * (puFlash.t / puFlash.max) : 0.26 + 0.08 * Math.sin(run.time * 4);
      ctx.drawImage(v, 0, 0, v.width * LS, v.height * LS);
      ctx.globalAlpha = 1;
    }
    if (view) view.classList.toggle("critical", state === "play" && low > 0);
  }
  const puVig = {};
  const puVignette = (rgb) => puVig[rgb] || (puVig[rgb] = vignetteCanvas(rgb, 0.44, 0.5));

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
  function segPath(g, i, n = 20) {
    const w = 250 / n, x = 90 + i * w;
    g.moveTo(x + 3, 54); g.lineTo(x + w - 1.5, 54); g.lineTo(x + w - 4.5, 60); g.lineTo(x, 60); g.closePath();
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
    const segs = (cur, bossIdx, supplyIdx = [], n = 20) => {
      for (const [color, test] of [["#a8ff3e", (i) => i < cur], ["#6a1814", (i) => i > cur && bossIdx.includes(i)], ["#1f3b5c", (i) => i > cur && supplyIdx.includes(i)], ["#26302c", (i) => i > cur && !bossIdx.includes(i) && !supplyIdx.includes(i)]]) {
        g.fillStyle = color; g.beginPath();
        for (let i = 0; i < n; i++) if (test(i)) segPath(g, i, n);
        g.fill();
      }
      for (const i of bossIdx) drawIcon(g, "bossSkull", 90 + (i + 0.45) * (250 / n), 69, 13, i < cur ? "#4a5a50" : "#ff4338");
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
      // Stadt (klein, mit Tag der Flucht) und Stadtteil (groß, passt sich der Breite an)
      const c = curCity(), dn = curDistrict()[0];
      g.fillStyle = "#ffc41a"; g.fillText(c.name.toUpperCase(), 90, 22);
      const cwid = g.measureText(c.name.toUpperCase()).width;
      g.fillStyle = "#76857b"; g.fillText(` · ${tr("Bezirk {n}/10", { n: districtIdx() + 1 })}`, 90 + cwid, 22);
      let fs = 24; g.font = FONT_NUM(fs);
      while (g.measureText(dn).width > 228 && fs > 15) g.font = FONT_NUM(--fs);
      g.fillStyle = "#fff"; g.fillText(dn, 90, 46);
      segs(districtIdx(), [9], [4], 10);
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
    if (run.headshots) {
      drawIcon(g, "headshot", cxr - 118, 72, 15, "#ff6a5a");
      g.fillStyle = "#ffd0c8"; g.fillText(num(run.headshots), cxr - 80, 79);
    }
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
    const key = [I18N.lang, run.mode, p.level, Math.round((p.xp / p.xpNeed) * 120), run.chapter, run.room, run.coins, run.kills, run.headshots || 0,
      survival ? `${Math.ceil(left)}|${left < 30 ? Math.floor(t * 12) : 0}|${Math.floor(run.survT / SURV_STEP)}` : ""].join("|");
    ctx.drawImage(cachedLayer(hudCache, key, 100, paintHud), 0, 0, W, 100);
    // aktuelles Segment pulsiert
    const cur = survival ? Math.floor(run.survT / SURV_STEP) : districtIdx(), nSeg = survival ? 20 : 10;
    if (cur >= 0 && cur < nSeg) {
      ctx.fillStyle = `rgba(255,255,255,${0.65 + 0.35 * Math.sin(t * 6)})`;
      ctx.beginPath(); segPath(ctx, cur, nSeg); ctx.fill();
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

  // Kombo-Zähler links unter dem HUD, Ansage mittig, Adrenalin als Balken (+ pochender Rand in drawScreenFx)
  const COMBO_COLORS = ["#ffffff", "#ffd27a", "#ff8a3d", "#ff4a3a"];
  const comboColor = (n) => COMBO_COLORS[n >= 35 ? 3 : n >= 20 ? 2 : n >= 10 ? 1 : 0];
  function drawCombo() {
    const y0 = enemies.some((e) => e.def.boss && e.spawnT <= 0) ? 200 : 152; // unter der Boss-Leiste
    ctx.save();
    ctx.textAlign = "left";
    ctx.lineJoin = "round";
    if (run.combo >= 2) {
      const k = run.comboT / COMBO_TIME, col = comboColor(run.combo);
      const pop = 1 + Math.max(0, run.comboT - (COMBO_TIME - 0.12)) * 3; // kurz größer beim neuen Abschuss
      ctx.globalAlpha = Math.min(1, k * 4);
      ctx.font = FONT_UI(12); ctx.fillStyle = "#ffb733"; ctx.fillText(tr("KOMBO"), 22, y0);
      ctx.save();
      ctx.translate(20, y0 + 38); ctx.scale(pop, pop);
      ctx.font = FONT_NUM(44, 700); ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(`x${run.combo}`, 0, 0); ctx.fillStyle = col; ctx.fillText(`x${run.combo}`, 0, 0);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(22, y0 + 46, 76, 5);
      ctx.fillStyle = col; ctx.fillRect(22, y0 + 46, 76 * k, 5);
      ctx.globalAlpha = 1;
    }
    if (run.rage > 0) {
      const y = y0 + (run.combo >= 2 ? 64 : 0), k = run.rage / RAGE_TIME;
      drawIcon(ctx, "adrenaline", 30, y, 16, "#ff4a3a");
      ctx.font = FONT_UI(12); ctx.fillStyle = "#ff6a5e"; ctx.fillText(tr("ADRENALIN"), 42, y + 5);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(22, y + 12, 76, 4);
      ctx.fillStyle = "#ff4a3a"; ctx.fillRect(22, y + 12, 76 * k, 4);
    }
    if (callout) {
      const age = callout.max - callout.life, sc = age < 0.12 ? 0.55 + age * 3.75 : 1 + Math.max(0, 0.22 - age) * 0.6;
      ctx.globalAlpha = Math.min(1, (callout.life / callout.max) * 3);
      ctx.translate(W / 2, y0 + 34); ctx.scale(sc, sc);
      ctx.textAlign = "center";
      ctx.font = FONT_NUM(42, 700); ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(callout.title, 0, 0); ctx.fillStyle = callout.col || (callout.plain ? "#a8ff3e" : comboColor(callout.n)); ctx.fillText(callout.title, 0, 0);
      if (callout.sub) {
        ctx.font = FONT_UI(16); ctx.lineWidth = 4;
        ctx.strokeText(callout.sub, 0, 25); ctx.fillStyle = "#f4f1e6"; ctx.fillText(callout.sub, 0, 25);
      }
      if (!callout.plain) {
        const sub = `x${callout.n}   +${callout.bonus}`;
        ctx.font = FONT_UI(15); ctx.lineWidth = 4;
        const sw = ctx.measureText(sub).width;
        ctx.strokeText(sub, 0, 24); ctx.fillStyle = "#ffe2a3"; ctx.fillText(sub, 0, 24);
        drawIcon(ctx, "coin", sw / 2 + 12, 19, 16, "#ffb733");
      }
    }
    ctx.restore();
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
  function drawBossCard() {
    const boss = enemies.find((e) => e.def.boss && e.spawnT > 0);
    if (!boss) return;
    const k = 1 - boss.spawnT / Math.max(0.01, boss.spawnMax);
    const a = Math.min(1, k * 2.4) * (boss.spawnT < 0.28 ? boss.spawnT / 0.28 : 1);
    if (a < 0.04) return;
    const city = run.mode === "campaign" && run.room > 0 ? curCity() : null;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(6,9,8,0.55)";
    ctx.fillRect(0, H * 0.38, W, 168);
    ctx.fillStyle = "#1a1408";
    ctx.fillRect(0, H * 0.38, W, 5);
    ctx.fillRect(0, H * 0.38 + 163, W, 5);
    ctx.fillStyle = "#ffb733";
    ctx.beginPath();
    for (let x = -20; x < W + 20; x += 14) {
      ctx.moveTo(x, H * 0.38); ctx.lineTo(x + 7, H * 0.38); ctx.lineTo(x + 2, H * 0.38 + 5); ctx.lineTo(x - 5, H * 0.38 + 5);
    }
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff6a5a";
    ctx.font = FONT_UI(13);
    ctx.fillText((city ? city.name.toUpperCase() : tr("ÜBERLEBEN")) + "  ·  " + tr("ENDGEGNER"), W / 2, H * 0.38 + 36);
    ctx.fillStyle = "#fff3c4";
    ctx.font = FONT_UI(15, 600);
    ctx.fillText(tr(boss.def.epithet || "").toUpperCase(), W / 2, H * 0.38 + 62);
    ctx.fillStyle = "#ff4338";
    let fs = 52;
    ctx.font = FONT_NUM(fs, 700);
    while (ctx.measureText(boss.def.name).width > W - 36 && fs > 26) ctx.font = FONT_NUM(--fs, 700);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 6;
    ctx.strokeText(boss.def.name, W / 2, H * 0.38 + 122);
    ctx.fillText(boss.def.name, W / 2, H * 0.38 + 122);
    ctx.restore();
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
  // 4D-Effekte: Vibrationsmuster [an, aus, an, …] passend zum Geschehen (Einstellung „Vibration“)
  const HAPTIC = { boom: [55, 30, 35], hurt: [28], heavyHurt: [45, 25, 30], boss: [140, 70, 140, 70, 240], level: [16, 40, 16, 40, 50], gib: [14], thunder: [24, 90, 170], heart: [26, 120, 40], rage: [70, 40, 70], kick: [9] };
  function fx4d(name, delay = 0) {
    if (!save.vibration || !HAPTIC[name]) return;
    if (delay > 0) setTimeout(() => Platform.haptic(HAPTIC[name]), delay); else Platform.haptic(HAPTIC[name]);
  }
  window.__fx4d = fx4d; // Donner kommt aus dem 3D-Renderer
  let heartT = 0;
  // Interaktiver Soundtrack: Modus und Intensität aus dem Spielgeschehen
  function musicInfo() {
    if (!run) return { mode: "menu", theme: "street", intensity: 0 };
    let n = 0, near = 0, boss = false;
    for (const e of enemies) {
      if (e.dead || e.under || e.spawnT > 0) continue;
      n++; if (e.def.boss) boss = true;
      if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 < 230 * 230) near++;
    }
    const intensity = run.cleared ? 0.05 : Math.min(1, (n / 14) * 0.5 + Math.min(1, near / 5) * 0.3 + Math.min(0.25, run.combo / 40) + (player.hurtT > 0 ? 0.15 : 0) + 0.1);
    return { mode: state === "over" ? "over" : boss ? "boss" : "play", theme: theme(), intensity, hp: player.hp / player.maxHp, rage: run.rage > 0, paused: state !== "play" && state !== "over" };
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const I = frameMs();
    if (now < nextDue - I * 0.4) return; // dieses Display-Bild auslassen
    nextDue = Math.max(nextDue + I, now);
    // Lange Bilder (30-FPS-Modus, Ruckler) in Teilschritte von höchstens 1/60 s zerlegen:
    // Kugeln prüfen Treffer pro Schritt und würden sonst durch kleine Gegner hindurchfliegen
    // rAF-Zeitstempel können vor dem letzten performance.now() liegen (erstes Bild nach langem Start) → nie negativ
    const real = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    frameDt = real;
    pollPad(real);
    // Zeitlupe nach Boss-Sieg
    const dt = slowMo > 0 ? real * 0.3 : real;
    if (slowMo > 0) slowMo -= real;
    if (hitStop > 0) hitStop -= real;
    else if (state === "play") { const n = Math.ceil(dt / 0.0175); for (let i = 0; i < n && state === "play"; i++) update(dt / n); }
    if (state === "play") trackPerformance(now - lastFrameAt);
    lastFrameAt = now;
    if (run) updateFx(state === "play" ? dt : dt * 0.15);
    if (actx && window.GameAudio) GameAudio.update(real, musicInfo());
    if (state === "play" && player && player.hp < player.maxHp * 0.3 && (heartT -= real) <= 0) { heartT = 1.05; fx4d("heart"); }
    // Nichts zeichnen, was niemand sieht: undurchsichtige Bildschirme (Shop, Arsenal …) verdecken alles,
    // in der Pause steht das Bild still – die GPU darf schlafen
    if (curOverlay && curOverlay.classList.contains("screen")) return;
    if (state === "pause" || state === "mini") { if (pauseFrames++ > 1) return; } else pauseFrames = 0; // Mini-Spiel: Hintergrund steht still
    if (save.shakeFx === false) { shake = 0; punchX = punchY = punchFov = 0; } // Barrierefreiheit: kein Wackeln
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
    combo: { icon: "combo", text: "Erreiche eine Kombo von {n}", d: [15, 25], w: 50, max: true },
    gibs: { icon: "blood", text: "Zerschieße {n} Leichen", d: [10, 20], w: 120 },
    rescued: { icon: "dove", text: "Rette {n} Überlebende", d: [3, 5], w: 25 },
    objectives: { icon: "missions", text: "Erfülle {n} Einsatzziele", one: "Erfülle ein Einsatzziel", d: [1, 2], w: 10 },
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
    { id: "chapter", icon: "map", name: tr("Fluchthelfer"), text: "Erreiche Stadt {n} der Fluchtroute", tiers: [3, 5, 9], val: () => (save.best.chapter ? cityIdx(save.best) + 1 : 0) },
    { id: "survival", icon: "hourglass", name: tr("Überlebenskünstler"), text: "Überlebe {n} Sekunden", tiers: [60, 180, 300], val: () => save.stats.survival },
    { id: "evolutions", icon: "dna", name: tr("Evolutionär"), text: "Löse {n} Evolutionen aus", one: "Löse eine Evolution aus", tiers: [1, 10, 40], val: () => save.stats.evolutions },
    { id: "codex", icon: "codex", name: tr("Forscher"), text: "Entdecke {n} Evolutionen", tiers: [2, 5, 8], val: () => Object.keys(save.codex).length },
    { id: "arsenal", icon: "weapons", name: tr("Waffennarr"), text: "Besitze {n} Waffen", tiers: [3, 8, 15], val: () => Object.keys(save.weapons).length },
    { id: "devil", icon: "devil", name: tr("Teufelsbündler"), text: "Schließe {n} Teufelspakte", one: "Schließe einen Teufelspakt", tiers: [1, 5, 20], val: () => save.stats.devil },
    { id: "headshots", icon: "headshot", name: tr("Scharfschütze"), text: "Erziele {n} Kopfschüsse", tiers: [100, 1000, 10000], val: () => save.stats.headshots },
    { id: "combo", icon: "combo", name: tr("Kombo-König"), text: "Erreiche eine Kombo von {n}", tiers: [25, 60, 120], val: () => save.stats.combo || 0 },
    { id: "rescued", icon: "dove", name: tr("Retter in der Not"), text: "Rette {n} Überlebende", tiers: [5, 50, 250], val: () => save.stats.rescued || 0 },
    { id: "objectives", icon: "missions", name: tr("Einsatzleiter"), text: "Erfülle {n} Einsatzziele", one: "Erfülle ein Einsatzziel", tiers: [3, 30, 150], val: () => save.stats.objectives || 0 },
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
  const patrolRate = () => 24 + 15 * Math.max(1, save.best.chapter); // Münzen pro Stunde (v3.4 gesenkt)
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
  // Fluchtroute im Menü: acht Städte als Kennzeichen, erreichte grün, die Rekord-Stadt golden
  function renderRouteStrip() {
    const box = $("rsNodes"), n = CITIES.length, best = save.best.chapter ? cityIdx(save.best) : -1;
    if (!box.children.length) box.innerHTML = CITIES.map((c) => `<span class="rs-node"><em>${KFZ[c.id] || c.name[0]}</em></span>`).join("");
    [...box.children].forEach((el, i) => { el.classList.toggle("done", i < best || best >= n); el.classList.toggle("cur", i === Math.min(best, n - 1) && best < n); });
    $("rsFill").style.width = `${Math.max(0, Math.min(1, best / (n - 1))) * 100}%`;
    $("rsLabel").textContent = tr(best < 0 ? "Fluchtroute" : "Rekord");
    // nächster Boss: der Endgegner der Stadt, in der die Flucht zuletzt gescheitert ist
    const nb = cityAt(Math.max(0, best)), bossT = nb.boss || "abom";
    $("rsBoss").textContent = ZOMBIES[bossT].name;
    $("menuBest").textContent = best < 0 ? tr("Ziel: Hamburg") : best >= n ? `${tr("Europa")} · ${cityAt(best).name}` : `${cityAt(best).name} · ${tr("Bezirk {n}/10", { n: districtIdx(save.best) + 1 })}`;
  }
  // Eilmeldungen: Lauftext mit Schlagzeilen aus dem gefallenen Deutschland (läuft nur, solange das Menü sichtbar ist)
  const NEWS = [
    "Deutschland ist gefallen. Dein Plan: raus hier.",
    "Bundesregierung rät: Ruhe bewahren, Fenster schließen, Formulare ausfüllen",
    "Bahnchaos: Alle Züge fallen aus – Grund: Personen im Gleis",
    "Hamburger Hafen: Die ARCHE legt in wenigen Tagen ab",
    "Wiesn abgesagt – Besucher weigern sich zu gehen",
    "Köln: Karneval findet trotzdem statt",
    "Kleingartenverein meldet: Gartenzwerge außer Kontrolle",
    "Spieltag abgesagt – Ultras weiter im Stadion",
    "Bürgeramt geöffnet – aktuelle Wartenummer 9312",
    "Nürnberg: Krampus auf dem Christkindlesmarkt gesichtet",
    "Hamburg: Klabautermann blockiert die Elbe",
    "Polizei-Hubschrauber sucht Überlebende in der Altstadt",
    "Paketdienste stellen Zustellung ein – Pakete piepen verdächtig",
    "Heilbronn: Weindorf abgesagt – die Viertele bleiben stehen",
    "Käthchenstadt im Ausnahmezustand – die Kunstuhr ist stehen geblieben",
    "Experimenta: Experiment außer Kontrolle?",
    "Überlebende im Wartberg-Tunnel – Hilfe unterwegs?",
    "Bundeswehr kündigt Luftschläge an: Zonen bitte halten",
    "Kopfgeld ausgesetzt: „Der Schlächter“ zuletzt am Hauptbahnhof gesehen",
  ];
  function startTicker() {
    const el = $("tickerText"), track = el.parentElement;
    const items = NEWS.slice(1).sort(() => Math.random() - 0.5);
    items.unshift(NEWS[0]);
    items.splice(2, 0, tr("Infektionsrate: {p} %", { p: Math.min(99, 71 + (Math.floor(Date.now() / 864e5) % 28)) }));
    if (save.best.chapter) items.splice(4, 0, tr("Überlebender zuletzt gesehen in {city}", { city: cityAt(cityIdx(save.best)).name }));
    el.textContent = "";
    items.forEach((t, i) => { if (i) { const em = document.createElement("em"); em.textContent = "+++"; el.appendChild(em); } el.appendChild(document.createTextNode(tr(t))); });
    requestAnimationFrame(() => {
      const w = el.offsetWidth, tw = track.clientWidth || 200;
      el.style.setProperty("--tk-from", `${tw}px`); el.style.setProperty("--tk-to", `${-w}px`); el.style.setProperty("--tk-dur", `${((w + tw) / 46).toFixed(1)}s`);
      el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    });
  }
  function refreshMenu() {
    $("menuCoins").textContent = num(save.coins);
    renderRouteStrip();
    const w = WEAPONS[save.equipped], lvl = save.weapons[save.equipped];
    $("menuWeaponImg").src = Sprites.weaponIcon(save.equipped, weaponTier(lvl));
    $("menuEquipped").textContent = softHyphen(w.name);
    $("menuWeaponLv").textContent = tr("St. {n}", { n: lvl });
    const sk = SKINS.find((q) => q.id === save.skin) || SKINS[0];
    $("menuSkinName").textContent = sk.name;
    const perk = heroPerk(sk.id);
    const hl = heroLevel(sk.id);
    $("menuHeroPerk").textContent = hl > 1 ? `${tr(perk.name)} · ${tr("St. {n}", { n: hl })}` : tr(perk.name);
    const bs = BOOSTS.filter((q) => save.boosts[q.id] > 0).map((q) => `${q.name} ×${save.boosts[q.id]}`).join(" · ");
    const hsp = heroSpecial(sk.id);
    $("menuSkin").innerHTML = `<b>${tr(perk.name)}:</b> ${tr(perk.desc)}  ·  <b>${tr("Spezial")}:</b> ${tr(hsp.name)}${bs ? `  ·  ${tr("Boosts")}: ${bs}` : ""}`;
    $("menuSkin").classList.remove("hidden");
    for (const b of document.querySelectorAll("#heroPicker .pk-arrow")) b.disabled = ownedSkins().length < 2;
    for (const b of document.querySelectorAll("#weaponPicker .pk-arrow")) b.disabled = ownedWeapons().length < 2;
    // Einsatzart
    const mode = save.menuMode === "survival" ? "survival" : "campaign";
    $("modeCampaign").classList.toggle("active", mode === "campaign");
    $("survivalBtn").classList.toggle("active", mode === "survival");
    $("campaignInfo").textContent = save.best.chapter ? `${tr("Rekord")}: ${cityAt(cityIdx(save.best)).name} · ${tr("Bezirk {n}/10", { n: districtIdx(save.best) + 1 })}` : tr("Heilbronn → Hamburg · 9 Städte");
    const todayWorld = THEME_ORDER[Math.floor(Date.now() / 864e5) % THEME_ORDER.length];
    const th = Math.min(save.threat || 0, save.threatMax || 0);
    const sc = Math.min(save.startCity || 0, save.cityMax || 0), scName = CITIES[sc].name;
    $("ctaSub").textContent = mode === "campaign" ? (th ? `${tr("Start in {c}", { c: scName })} · ${tr("Bedrohung {n}", { n: th })} · ×${threatScore(th).toLocaleString(I18N.lang)} ${tr("Punkte")}` : sc ? tr("Kampagne · Start in {c}", { c: scName }) : tr("Kampagne · Start in Heilbronn")) : `${tr("Überleben")} · ${tr(WORLD_NAME[todayWorld])}${save.stats.survival ? ` · ${tr("Rekord")} ${fmtTime(save.stats.survival)}` : ""}`;
    $("playBtn").classList.toggle("primary", mode === "campaign");
    $("playBtn").classList.toggle("amber", mode === "survival");
    for (const el of document.querySelectorAll(".coinsVal")) el.textContent = num(save.coins);
    $("survivalBest").textContent = `${tr("Tagesbefehl")}: ${tr(todaysOrder().name)}`;
    renderThreat();
    $("missionsBadge").classList.toggle("hidden", !missionsClaimable());
    $("gearBadge").classList.toggle("hidden", !(save.gearBag || []).some((it) => GEAR_SLOTS[it.s] && gearBetter(it, (save.gear || {})[it.s])));
    $("passBadge").classList.toggle("hidden", !passClaimable());
    const pc = patrolCoins();
    $("patrolBadge").classList.toggle("hidden", patrolHours() < 1);
    $("patrolMini").textContent = pc > 0 ? `+${num(pc)}` : "";
  }

  const ownedSkins = () => SKINS.filter((q) => save.skins[q.id]).map((q) => q.id);
  const ownedWeapons = () => Object.keys(WEAPONS).filter((id) => save.weapons[id] > 0);
  const WORLD_NAME = { street: "Straße", hospital: "Krankenhaus", lab: "Geheimlabor" };
  // Weiche Trennstellen für lange deutsche Komposita (schmale Handys)
  const softHyphen = (name) => name.replace(/(Maschinen|Scharfschützen|Flammen|Granat|Sägeblatt|Raketen|Sturm|Laser)/g, "$1\u00AD")
    .replace(/([a-zäöüß])(weste|helm|handschuhe|stiefel|rucksack|medaille|zeichen|schnur|nadel|amulett|taler|kette|beutel|ranzen|schuhe)/g, "$1\u00AD$2"); // v3.4 auch Ausrüstungsnamen

  function renderArmory() {
    const list = $("weaponList");
    list.innerHTML = "";
    for (const [id, w] of Object.entries(WEAPONS)) {
      const lvl = save.weapons[id];
      const row = document.createElement("div");
      row.className = `item weapon${save.equipped === id ? " active" : ""}${lvl ? "" : " dim"}`;
      const dps = Math.round(w.dmg * w.pellets * w.rate * weaponLvlMult(lvl || 1));
      const lockW = !lvl && reqLocked(WEAPON_REQ[id]);
      const tag = save.equipped === id ? `<span class="tag">${tr("Ausgerüstet")}</span>` : lockW ? `<span class="tag">${tr("GESPERRT")}</span>` : !lvl ? `<span class="tag amber">${tr("Nicht im Besitz")}</span>` : "";
      row.innerHTML = `<div class="ico"><img src="${Sprites.weaponIcon(id, weaponTier(lvl || 1))}" alt=""></div>
        <div>${tag}<div class="name">${softHyphen(w.name)}</div>
        <div class="meta">${lvl ? pipsHtml(lvl, WEAPON_MAX_LVL, lvl >= 5 ? "gold" : "") : ""}<span>DPS <b class="dps">${dps}</b></span></div>
        <div class="desc">${w.desc}</div></div>
        <div class="acts"></div>`;
      const acts = row.querySelector(".acts");
      if (lockW) acts.appendChild(actionBtn(`${I("lock")}${reqText(WEAPON_REQ[id])}`, false, () => {}));
      else if (!lvl) {
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
      ["play", "Einsätze", num(st.runs)], ["dna", "Evolutionen", num(st.evolutions)], ["headshot", "Kopfschüsse", num(st.headshots)], ["combo", "Beste Kombo", `x${num(st.combo || 0)}`], ["upgrade", "Höchstes Level", num(st.level)],
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
  // Bestiarium: Beschreibung und Taktik je Gegner (Reihenfolge = Anzeige)
  const BESTIARY = {
    walker: "Langsam, aber überall. Kommt meist in Gruppen.",
    runner: "Schnell und wendig – stehen bleiben und schießen statt weglaufen.",
    crawler: "Kriecht im Rudel heran. Klein, flink, schwach.",
    rat: "Seuchenratten im Schwarm – Flächenschaden hilft.",
    dog: "Springt aus kurzer Distanz an. Kommt zu zweit.",
    spitter: "Hält Abstand und spuckt Säure. Früh ausschalten.",
    bomber: "Rennt los und explodiert. Auf Abstand halten!",
    leaper: "Duckt sich und springt weit – die rote Linie zeigt wohin.",
    burner: "Brennt, hinterlässt Feuerpfützen und ist immun gegen Feuer.",
    screamer: "Sein Schrei macht Zombies in der Nähe rasend.",
    brute: "Koloss mit Sturmangriff – raus aus der roten Warnfläche!",
    armored: "Panzerung schluckt ein Drittel des Schadens.",
    splitter: "Zerfällt beim Tod in drei Kriecher.",
    electro: "Lädt sich auf und entlädt einen Stromschlag im Umkreis.",
    burrower: "Gräbt sich ein und bricht unter dir hervor – achte auf den wandernden Erdhügel!",
    bloater: "Platzt beim Tod zu einer Giftwolke. Nicht aus der Nähe erledigen!",
    gunner: "Ein roter Laser zielt, dann folgt ein Feuerstoß – zur Seite ausweichen!",
    healer: "Heilt verletzte Zombies mit einem grünen Strahl. Immer zuerst erledigen!",
    thrower: "Wirft Betonbrocken im hohen Bogen. Der rote Kreis zeigt den Einschlag.",
    phantom: "Taucht auf, greift an, verschwindet. Nur sichtbar ist er verwundbar.",
    nest: "Spuckt Ratten und Kriecher aus, bis es zerstört ist.",
    warden: "Gibt Zombies in der Nähe Energieschilde. Fällt er, brechen alle Schilde.",
    wiesn: "Stemmt den Maßkrug und wirft ihn im Bogen. Die Bierlache bremst dich – raus da!",
    jeck: "Tanzt im Zickzack und wirft Kamelle im Fächer. Zwischen den Bonbons hindurch!",
    schaffner: "Pfeift ab: Wer im gelben Kreis steht, hat Verspätung – halbe Feuerrate.",
    beamter: "Wirft Formulare aus sicherer Distanz. Ein Treffer bremst dich aus.",
    zwerg: "Gartenzwerge im Rudel: klein, schnell, zerbrechlich.",
    ultra: "Kickt Fußbälle, die von Wänden abprallen, und zündet Bengalos.",
    wengerter: "Heilbronner Weingärtner mit Rückenspritze: Der lila Kegel bremst dich aus – nicht davorstellen!",
    goetz: "Boss (Heilbronn): Faustschlag mit der eisernen Hand im Kegel, Ritter-Ansturm, Armbrust-Salve.",
    scooter: "Kündigt eine rote Linie an und rast sie entlang – rechtzeitig zur Seite!",
    paketbote: "Wirft Pakete, die am Boden piepen und explodieren. Raus aus dem roten Kreis!",
    rentner: "Der Schirm blockt Schüsse von vorn. Flankieren, Explosionen oder Feuer nutzen!",
    zugfuehrer: "Boss (Leipzig): Lok-Ansturm entlang der roten Linie, Kohlewürfe, Pfiff mit Verspätung.",
    krampus: "Boss (Nürnberg): Kettenpeitsche im Kegel, explodierende Geschenke, Sprung mit Erdstoß.",
    bierkoenig: "Boss (München): rollende Bierfässer, Bauchklatscher im Kreis, Maßkrug-Salven.",
    narrenkoenig: "Boss (Köln): Kamelle-Spirale, Konfettikanone und Sprünge mitten in die Menge.",
    kapitaen: "Boss (Hamburg): Anker, der zurückkehrt, Harpunen-Fächer und das Nebelhorn.",
    abom: "Boss: Sturmangriffe und Stachelringe. Ab halber Energie rasend.",
    mother: "Boss: Säurefächer und Kriecher-Brut. Ab halber Energie gefährlicher.",
  };
  const NEW_FOES = new Set(["wengerter", "goetz", "scooter", "paketbote", "rentner", "zugfuehrer", "krampus", "bierkoenig", "narrenkoenig", "kapitaen"]);
  let codexTab = "evo";
  function renderBestiary(list) {
    let seen = 0;
    for (const [type, desc] of Object.entries(BESTIARY)) {
      const def = ZOMBIES[type], n = save.bestiary[type] || 0;
      if (n) seen++;
      const row = document.createElement("div");
      row.className = `item codex beast${n ? " found" : " unknown"}`;
      const tags = `${def.boss ? `<span class="tag red">${tr("BOSS")}</span>` : ""}${NEW_FOES.has(type) ? `<span class="tag gold">${tr("NEU")}</span>` : ""}`;
      row.innerHTML = `<div class="ico beast-art"><canvas width="128" height="128"></canvas></div><div>${tags}<div class="name">${n ? def.name : "???"}</div><div class="desc">${tr(desc)}</div><div class="recipe">${n ? tr("{n} erledigt", { n: n.toLocaleString(I18N.lang) }) : tr("Noch nicht begegnet")}</div></div><div></div>`;
      list.appendChild(row);
      // Abbild aus dem Sprite-Cache; Unbekannte als Silhouette
      const cv = row.querySelector("canvas"), g = cv.getContext("2d"), spr = Sprites.zombie(type, 2, 0);
      const k = (150 / Math.max(spr.w, spr.h)) * (def.boss ? 0.85 : 1); // Sprite hat Rand – etwas größer zeichnen
      g.translate(64, 64); g.rotate(-Math.PI / 2);
      g.drawImage(spr.c, -spr.w * k / 2, -spr.h * k / 2, spr.w * k, spr.h * k);
      if (!n) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-atop"; g.fillStyle = "#3b4743"; g.fillRect(0, 0, 128, 128); }
    }
    // v3.7 Evolutionsstufen: am Beispiel des Walkers, Silhouette bis zum ersten Abschuss dieser Stufe
    for (let i = 1; i < EVO.length; i++) {
      const B = EVO[i], n = save.bestiary[`evo${i}`] || 0, row = document.createElement("div");
      row.className = `item codex beast${n ? " found" : " unknown"}`;
      row.innerHTML = `<div class="ico beast-art"><canvas width="128" height="128"></canvas></div><div><span class="tag gold">${tr("EVOLUTIONSSTUFEN")}</span><div class="name">${tr("Stufe {n}", { n: i })} · ${n ? tr(B.name) : "???"}</div><div class="desc">${tr(B.desc)}</div><div class="recipe">${n ? tr("{n} erledigt", { n: n.toLocaleString(I18N.lang) }) : tr("Zombies, die an Leichen fressen, mutieren zur nächsten Stufe.")}</div></div><div></div>`;
      list.appendChild(row);
      const g = row.querySelector("canvas").getContext("2d"), spr = Sprites.zombie("walker", 2, 0, i), k = 150 / Math.max(spr.w, spr.h);
      g.translate(64, 64); g.rotate(-Math.PI / 2); g.drawImage(spr.c, -spr.w * k / 2, -spr.h * k / 2, spr.w * k, spr.h * k);
      if (!n) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-atop"; g.fillStyle = "#3b4743"; g.fillRect(0, 0, 128, 128); }
    }
    $("codexNote").textContent = tr("{n} von {m} Gegnern erledigt.", { n: seen, m: Object.keys(BESTIARY).length });
  }

  // ============================================================
  // Story: Prolog, Fluchtplan-Karte, Funkspruch je Stadt, Ende in Hamburg
  // ============================================================
  const PROLOG = [
    { where: "Tag 0 · Berlin-Buch", title: "Der Ausbruch", text: "Ein ganz normaler Montag. Im Forschungscampus Berlin-Buch läuft ein Experiment aus dem Ruder: Der Erreger N-17 entkommt aus dem Hochsicherheitslabor." },
    { where: "Tag 2 · Heilbronn", title: "Das Unterland fällt", text: "Du bist zu Hause in Heilbronn, als die Seuche das Unterland erreicht. Erst das Klinikum, dann die Stadtbahn, dann der Marktplatz. Die Kunstuhr am Rathaus schlägt Mitternacht – und niemand zählt mehr mit." },
    { where: "Tag 7 · Europa", title: "Funkstille", text: "Die Grenzen sind dicht, die Flughäfen gesperrt. Aus Paris, Wien und Warschau kommt nur noch Rauschen. Die Seuche hat ganz Europa erreicht." },
    { where: "Tag 7 · 23:41 Uhr", title: "Der Plan", text: "Ein letzter Funkspruch der Marine: Das Schiff ARCHE evakuiert vom Hamburger Hafen. Der direkte Weg ist abgeriegelt. Dein Plan: quer durch Deutschland – Stadt für Stadt, Bezirk für Bezirk. Neun Städte. Ein Ziel: raus hier.", map: true },
  ];
  const ENDING = { where: "Tag 25 · Hamburger Hafen", title: "Die ARCHE legt ab", text: "Hinter dir versinkt der Containerterminal im Nebel. Du hast es geschafft – raus aus Deutschland. Doch der Funk bringt keine guten Nachrichten: Amsterdam, Paris, Wien … überall dasselbe. Die Seuche ist überall. Die Flucht geht weiter." };
  // Umriss Deutschlands (vereinfacht, Breite/Länge) für die Fluchtplan-Karte
  const DE_SHAPE = [[54.9, 8.6], [54.8, 9.4], [54.5, 10.0], [54.35, 10.9], [54.0, 10.9], [54.2, 11.8], [54.15, 12.3], [54.6, 13.3], [54.5, 13.7], [53.95, 14.2], [53.3, 14.4], [52.85, 14.15], [52.3, 14.6], [51.85, 14.7], [51.05, 14.98], [50.85, 14.6], [50.9, 14.3], [50.65, 13.55], [50.3, 12.3], [50.2, 12.1], [49.75, 12.5], [49.3, 12.95], [48.95, 13.65], [48.75, 13.85], [48.55, 13.45], [48.2, 12.95], [47.85, 13.0], [47.65, 12.95], [47.7, 12.25], [47.55, 11.65], [47.4, 11.0], [47.55, 10.45], [47.5, 9.95], [47.6, 9.55], [47.7, 8.9], [47.65, 8.45], [47.6, 7.6], [48.1, 7.6], [48.6, 7.8], [48.98, 8.2], [49.1, 7.3], [49.25, 6.75], [49.5, 6.37], [49.95, 6.15], [50.3, 6.4], [50.75, 6.05], [51.05, 5.95], [51.25, 6.2], [51.65, 5.95], [51.85, 6.35], [52.1, 6.75], [52.35, 7.05], [52.65, 6.75], [53.2, 7.2], [53.55, 7.05], [53.7, 7.5], [53.75, 8.1], [53.55, 8.55], [53.9, 8.7], [54.05, 8.85], [54.4, 8.6], [54.75, 8.55]];
  let story = null; // { mode: "prolog"|"city"|"ending"|"menu", page, onDone }
  const cityDay = (i) => (i < CITIES.length ? CITIES[i].day : 26 + 3 * (i - CITIES.length));
  const storyPages = (mode) => {
    if (mode === "prolog") return PROLOG;
    const i = mode === "menu" ? Math.min(cityIdx({ chapter: Math.max(1, save.best.chapter), room: Math.max(1, save.best.room) }), CITIES.length + EUROPE.length - 1) : cityIdx();
    const c = cityAt(i), pages = [];
    if (mode === "ending") pages.push(ENDING);
    pages.push({ where: `${tr("Tag {d}", { d: cityDay(i) })} · ${c.name}`, title: tr(c.goal), text: tr(c.radio), map: true, city: i });
    return pages;
  };
  function openStory(mode, onDone) {
    story = { mode, page: 0, pages: storyPages(mode), onDone };
    $("routeBack").style.visibility = mode === "menu" ? "" : "hidden";
    show(ui.route);
    renderStory();
    $("startPick").classList.toggle("hidden", mode !== "menu" || !(save.cityMax > 0));
    if (mode === "menu" && save.cityMax > 0) renderStartPick();
    if (window.GameAudio) GameAudio.stinger("radio");
  }
  // v2.8 Startpunkt im Fluchtplan wählen (jede besiegte Stadt schaltet die nächste frei)
  function renderStartPick() {
    const max = Math.min(CITIES.length - 1, save.cityMax || 0), cur = Math.min(save.startCity || 0, max);
    $("startCities").innerHTML = CITIES.map((c, i) => `<button class="sc${i === cur ? " on" : ""}${i > max ? " locked" : ""}" data-c="${i}" ${i > max ? "disabled" : ""}><b>${KFZ[c.id] || c.name.slice(0, 2).toUpperCase()}</b><small>${i > max ? I("lock") : c.name}</small></button>`).join("");
    $("startInfo").textContent = cur ? (cur === 1 ? tr("Start in {c} mit einem Start-Skill", { c: CITIES[cur].name }) : tr("Start in {c} mit {n} Start-Skills", { c: CITIES[cur].name, n: Math.min(6, cur) })) : tr("Start in Heilbronn – besiege Stadt-Bosse, um weitere Startpunkte freizuschalten");
  }
  let typeTimer = 0;
  function renderStory() {
    const pg = story.pages[story.page], last = story.page === story.pages.length - 1;
    const ci = pg.city ?? (story.mode === "prolog" ? 0 : cityIdx());
    $("storyWhere").textContent = tr(pg.where);
    $("storyTitle").textContent = tr(pg.title);
    $("routeDay").textContent = pg.city !== undefined ? tr("Tag {d}", { d: cityDay(ci) }) : "";
    $("storyCard").classList.toggle("radio", pg.city !== undefined);
    const reward = story.mode === "city" && run && run.cityBonus ? tr("Stadt durchbrochen: +{b} Münzen", { b: num(run.cityBonus) }) : "";
    $("storyReward").textContent = reward; $("storyReward").classList.toggle("hidden", !reward);
    $("storyDots").innerHTML = story.pages.length > 1 ? story.pages.map((_, i) => `<i class="${i === story.page ? "on" : ""}"></i>`).join("") : "";
    $("storyGoTxt").textContent = !last ? tr("WEITER") : story.mode === "menu" ? tr("Prolog ansehen") : story.mode === "prolog" && !run ? tr("Zurück") : tr("Los geht's");
    $("routeMap").parentElement.classList.toggle("dim", !pg.map);
    routeView = { upto: pg.map ? ci : -1, europe: ci >= CITIES.length, t0: routeView ? routeView.t0 : performance.now() };
    // Schreibmaschine: Text tippt sich ein (Antippen zeigt ihn sofort ganz)
    const full = tr(pg.text), el = $("storyText");
    clearInterval(typeTimer);
    let n = 0;
    el.textContent = "";
    typeTimer = setInterval(() => { n += 3; el.textContent = full.slice(0, n); if (n >= full.length) clearInterval(typeTimer); }, 16);
    el.onclick = () => { clearInterval(typeTimer); el.textContent = full; };
    if (!routeLoop) { routeLoop = true; requestAnimationFrame(routeTick); }
  }
  // Ein einziger Zeichen-Takt für die Karte, solange der Fluchtplan offen ist
  let routeLoop = false;
  function routeTick() {
    if (!routeView || ui.route.classList.contains("hidden")) { routeLoop = false; return; }
    drawRouteMap();
    requestAnimationFrame(routeTick);
  }
  function storyNext() {
    if (!story) return;
    if (story.page < story.pages.length - 1) { story.page++; renderStory(); return; }
    if (story.mode === "menu") { openStory("prolog", () => openStory("menu")); return; }
    clearInterval(typeTimer);
    const done = story.onDone; story = null; routeView = null;
    if (done) done(); else { show(null); state = "play"; }
  }
  // Wird beim Betreten des 1. Stadtteils einer Stadt aufgerufen
  function openCityCard() {
    if (!run || run.mode !== "campaign") return;
    const i = cityIdx();
    run.storyOpen = true;
    state = "story";
    const resume = () => { run.storyOpen = false; show(null); state = "play"; };
    if (i === 0 && !save.storySeen) { save.storySeen = true; persist(); openStory("prolog", () => openStory("city", resume)); }
    else openStory(i === CITIES.length ? "ending" : "city", resume);
  }

  // Karte: Deutschland mit Fluchtroute, Infektionszonen und Standort (animiert, solange sichtbar)
  let routeView = null;
  function drawRouteMap() {
    const cv = $("routeMap");
    if (!routeView || !cv.offsetParent) return;
    const dprr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dprr)) { cv.width = Math.round(cw * dprr); cv.height = Math.round(ch * dprr); }
    const g = cv.getContext("2d");
    g.setTransform(dprr, 0, 0, dprr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const eu = routeView.europe, B0 = eu ? { lo0: 1.6, lo1: 17.2, la0: 46.6, la1: 55.4 } : { lo0: 5.6, lo1: 15.3, la0: 47.1, la1: 55.2 };
    const kx = Math.cos(51 * DEG), k = Math.min((cw - 24) / ((B0.lo1 - B0.lo0) * kx), (ch - 24) / (B0.la1 - B0.la0));
    const ox = (cw - (B0.lo1 - B0.lo0) * kx * k) / 2, oy = (ch - (B0.la1 - B0.la0) * k) / 2;
    const P = (la, lo) => [ox + (lo - B0.lo0) * kx * k, oy + (B0.la1 - la) * k];
    const t = (performance.now() - routeView.t0) / 1000, upto = routeView.upto;
    // Raster wie auf einem Lagetisch
    g.strokeStyle = "rgba(168,255,62,0.06)"; g.lineWidth = 1;
    for (let x = 0; x < cw; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ch); g.stroke(); }
    for (let y = 0; y < ch; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
    // Land
    g.beginPath(); DE_SHAPE.forEach(([la, lo], i) => { const [x, y] = P(la, lo); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
    const lg = g.createLinearGradient(0, 0, 0, ch); lg.addColorStop(0, "#1b2622"); lg.addColorStop(1, "#121a17");
    g.fillStyle = lg; g.fill();
    g.save(); g.clip();
    // Infektionszonen: Ausbruchsherd Berlin-Buch, dazu die Städte entlang der Route
    const route = [...CITIES, ...(eu ? EUROPE : [])];
    { const bc = CITIES.find((c) => c.id === "berlin"), [x, y] = P(bc.lat, bc.lon), r = k * 1.7 * (1 + 0.05 * Math.sin(t * 1.5)); const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, "rgba(255,30,20,0.45)"); rg.addColorStop(1, "rgba(255,30,20,0)"); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i <= Math.max(0, upto); i++) {
      const c = route[Math.min(i, route.length - 1)], [x, y] = P(c.lat, c.lon), r = k * (i === 0 ? 1.6 : 1.1) * (1 + 0.04 * Math.sin(t * 2 + i));
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, "rgba(255,40,30,0.38)"); rg.addColorStop(1, "rgba(255,40,30,0)");
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
    g.strokeStyle = "rgba(168,255,62,0.55)"; g.lineWidth = 1.6; g.shadowColor = "rgba(168,255,62,0.6)"; g.shadowBlur = 8;
    g.beginPath(); DE_SHAPE.forEach(([la, lo], i) => { const [x, y] = P(la, lo); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke();
    g.shadowBlur = 0;
    // Route: geschafft = durchgezogen, offen = gestrichelt (wandert)
    for (let i = 0; i < route.length - 1; i++) {
      const [x1, y1] = P(route[i].lat, route[i].lon), [x2, y2] = P(route[i + 1].lat, route[i + 1].lon), done = i < upto;
      g.strokeStyle = done ? "#a8ff3e" : "rgba(255,196,26,0.7)"; g.lineWidth = done ? 3 : 2;
      g.setLineDash(done ? [] : [6, 6]); g.lineDashOffset = done ? 0 : -t * 14;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.setLineDash([]);
    // Städte
    g.textAlign = "left"; g.textBaseline = "middle";
    route.forEach((c, i) => {
      const [x, y] = P(c.lat, c.lon), cur = i === upto, done = i < upto, goal = c.id === "hamburg";
      if (cur) { const pr = 9 + 6 * ((t * 1.4) % 1); g.strokeStyle = `rgba(255,196,26,${1 - ((t * 1.4) % 1)})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, pr, 0, TAU); g.stroke(); }
      g.fillStyle = done ? "#a8ff3e" : cur ? "#ffc41a" : goal ? "#7fd0ff" : "#3b4743";
      g.beginPath(); g.arc(x, y, cur ? 6 : 4.5, 0, TAU); g.fill();
      g.strokeStyle = "#060908"; g.lineWidth = 1.5; g.stroke();
      if (goal && !eu) { g.fillStyle = "#7fd0ff"; g.font = FONT_UI(10); g.fillText(tr("ZIEL: ARCHE"), x + 8, y + 14); }
      g.font = FONT_UI(cur ? 14 : 12); g.fillStyle = cur ? "#fff" : done ? "#c9f59a" : "#8a968f";
      const right = c.lside === "l" || c.lon > (B0.lo0 + B0.lo1) / 2 + 2.5;
      g.textAlign = right ? "right" : "left";
      g.fillText(c.name.toUpperCase(), x + (right ? -10 : 10), y + (c.ly || 0));
      g.textAlign = "left";
    });
  }
  function renderCodex() {
    const list = $("codexList");
    list.innerHTML = "";
    for (const b of document.querySelectorAll("#codexTabs button")) b.classList.toggle("active", b.dataset.tab === codexTab);
    $("codexLead").textContent = codexTab === "evo" ? tr("Evolutionen: Zwei Skills auf Stufe verschmelzen zu einer Superfähigkeit.") : tr("Jeder Gegner hat eine Schwäche. Erledige ihn einmal, um ihn freizuschalten.");
    if (codexTab === "bestiary") { renderBestiary(list); return; }
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
  for (const q of SKINS) if (q.price) q.price = econPrice(q.price);
  const SKIN_REQ = { police: 1, firefighter: 2, hazmat: 3, ninja: 4, cyber: 5, plague: 6 }; // v3.4: Held erst ab erreichter Stadt
  // v2.5 Helden: jeder Held spielt sich anders (vorher reine Optik)
  const HERO_PERKS = {
    soldier: { name: "Feldtraining", desc: "+15 % Erfahrung", apply: (p) => { p.xpGain = 1.15; } },
    police: { name: "Schutzweste", desc: "−15 % erlittener Schaden", apply: (p) => { p.dmgTaken = 0.85; } },
    firefighter: { name: "Hitzeschild", desc: "Immun gegen Feuer · +10 % Leben", apply: (p) => { p.fireproof = true; p.maxHp = p.hp = Math.round(p.maxHp * 1.1); } },
    hazmat: { name: "Schutzanzug", desc: "Immun gegen Giftgas · Verlangsamung halbiert", apply: (p) => { p.gasproof = true; p.slowResist = 0.5; } },
    ninja: { name: "Schattenschritt", desc: "+12 % Tempo · 8 % Ausweichen", apply: (p) => { p.speed *= 1.12; p.dodge += 0.08; } },
    cyber: { name: "Kampfdrohne", desc: "Startet mit einer Drohne", apply: (p) => { p.drones += 1; } },
    plague: { name: "Aderlass", desc: "Heilt 1 % Leben pro Abschuss", apply: (p) => { p.lifesteal += 0.01; } },
    gold: { name: "Goldrausch", desc: "+10 % Münzen", apply: () => { /* run.greed in startRun */ } },
    hunter: { name: "Kopfgeldjäger", desc: "+20 % Schaden gegen Elites und Bosse · doppeltes Kopfgeld", apply: (p) => { p.bigGame = 1.2; } },
  };
  const heroPerk = (id) => HERO_PERKS[id] || HERO_PERKS.soldier;
  // v2.9 Spezialfähigkeit je Held: lädt über Abschüsse (Elites viel, Bosse sofort voll), Taste E / Knopf / Gamepad Y
  const HERO_SPECIALS = {
    soldier: { name: "Luftschlag", icon: "airstrike", desc: "Sieben Bomben entlang deiner Blickrichtung" },
    police: { name: "Taser-Salve", icon: "chainZap", desc: "Blitze springen auf bis zu zehn Zombies und betäuben sie" },
    firefighter: { name: "Feuerwalze", icon: "fireRing", desc: "Flammenring um dich, schleudert Zombies weg und setzt sie in Brand" },
    hazmat: { name: "Giftnebel", icon: "toxCloud", desc: "Giftwolke um dich, hebt Schwächungen auf, heilt 15 %" },
    ninja: { name: "Schattenklingen", icon: "ninjaStar", desc: "Springt blitzschnell durch die sechs nächsten Zombies" },
    cyber: { name: "Drohnenschwarm", icon: "missileSwarm", desc: "EMP betäubt alles in der Nähe, dazu drei Drohnen für 10 s" },
    plague: { name: "Heilnebel", icon: "healMist", desc: "Heilt 40 %, vergiftet Zombies, 6 s Lebensraub" },
    gold: { name: "Goldregen", icon: "goldRain", desc: "Goldene Druckwelle und 10 s doppelte Münzen" },
    hunter: { name: "Präzisionsschuss", icon: "railShot", desc: "Strahl quer über das Feld mit gewaltigem Schaden" },
  };
  const heroSpecial = (id) => HERO_SPECIALS[id] || HERO_SPECIALS.soldier;
  // v2.9 Wurfwaffen: im Shop freischalten, eine davon startet im Gürtel; Nachschub von Elites, Bossen, je Bezirk und aus der Versorgungskiste
  const THROWABLES = {
    frag: { name: "Splittergranate", icon: "grenade", desc: "Explodiert beim Aufprall – hoher Flächenschaden", price: 0, r: 92, rgb: "255,190,90", col: "#3f5a2a", c3: [0.25, 0.36, 0.17] },
    molotov: { name: "Molotow-Cocktail", icon: "molotov", desc: "Flammenteppich, der Zombies 5 s lang verbrennt", price: 1200, r: 82, rgb: "255,140,40", col: "#2f6a3a", c3: [0.2, 0.45, 0.25] },
    flash: { name: "Blendgranate", icon: "flashbang", desc: "Betäubt alle Zombies im Umkreis für 2,5 s", price: 1600, r: 135, rgb: "235,240,255", col: "#8a949b", c3: [0.6, 0.64, 0.68] },
    frost: { name: "Frostgranate", icon: "iceBomb", desc: "Friert Zombies ein – Gefrorene nehmen 30 % mehr Schaden", price: 2200, r: 112, rgb: "130,220,255", col: "#3a8ac8", c3: [0.3, 0.62, 0.9] },
    decoy: { name: "Silvesterböller", icon: "firecracker", desc: "Lockt Zombies 3 s lang an, dann knallt es viermal", price: 2800, r: 66, rgb: "255,90,60", col: "#c8202a", c3: [0.8, 0.1, 0.1] },
  };
  for (const q of Object.values(THROWABLES)) q.price = econPrice(q.price);
  // v3.4 Freischaltung erst ab erreichter Stadt (Index in CITIES): Molotow ab Stuttgart … Böller ab Leipzig
  const THROW_REQ = { molotov: 1, flash: 2, frost: 3, decoy: 4 };
  // v2.6 Heldenstufen: jeder Einsatz bringt dem gewählten Helden Erfahrung (Punkte / 50); je Stufe +2 % Leben und +1 % Schaden
  const HERO_LV_MAX = 10;
  const heroLevel = (id) => Math.min(HERO_LV_MAX, 1 + Math.floor(Math.sqrt(((save.heroXp || {})[id] || 0) / 60)));
  const BOOSTS = [
    { id: "hp", icon: "heartArmor", name: tr("Zähigkeit+"), desc: tr("+30% max. HP im nächsten Einsatz"), price: 300 },
    { id: "coins", icon: "clover", name: tr("Glücksbringer"), desc: tr("+50% Münzen im nächsten Einsatz"), price: 400 },
    { id: "skill", icon: "gift", name: tr("Startvorteil"), desc: tr("Starte mit einem zusätzlichen Skill"), price: 500 },
    { id: "revive", icon: "angel", name: tr("Schutzengel"), desc: tr("Einmal wiederbeleben im nächsten Einsatz"), price: 800 },
  ];
  for (const q of BOOSTS) q.price = econPrice(q.price);
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
  const DAILY = [60, 90, 120, 180, 240, 320, 700]; // v3.4 gesenkt
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
  const freeCoinAmount = () => 100 + 35 * save.best.chapter;

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
    else if (shopTab === "throw") renderThrowList(list);
    else if (shopTab === "gear") renderGearShop(list);
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
  function renderThrowList(list) {
    for (const [id, q] of Object.entries(THROWABLES)) {
      const owned = !!save.throwOwned[id], active = save.throwSel === id;
      const ic = medal(q.icon, owned ? "toxic" : "steel");
      const lockT = !owned && reqLocked(THROW_REQ[id]);
      const row = lockT
        ? shopRow(ic, tr(q.name), `${tr(q.desc)} · ${tr("Erreiche {c}, um das freizuschalten", { c: cityAt(THROW_REQ[id]).name })}`, `<span class="tag">${tr("GESPERRT")}</span>`, `${I("lock")}${reqText(THROW_REQ[id])}`, false, null)
        : owned
        ? shopRow(ic, tr(q.name), `${tr(q.desc)}${active ? ` · ${tr("Startet im Gürtel")}` : ""}`, active ? `<span class="tag">${tr("Aktiv")}</span>` : "", active ? I("check") : tr("Ausrüsten"), !active, () => { save.throwSel = id; persist(); sfx("coin"); renderShop(); }, active ? "" : "primary")
        : shopRow(ic, tr(q.name), tr(q.desc), "", coinAmt(q.price), save.coins >= q.price, () => {
          if (save.coins < q.price) return;
          save.coins -= q.price; save.throwOwned[id] = true; save.throwSel = id;
          persist(); sfx("level"); toast(`${tr(q.name)}!`, q.icon); renderShop();
        }, "amber");
      if (active) row.classList.add("active");
      list.appendChild(row);
    }
  }
  function renderSkinList(list) {
    for (const q of SKINS) {
      const owned = !!save.skins[q.id], active = save.skin === q.id;
      const ic = medal(q.icon, q.iap ? "gold" : q.pass ? "amber" : owned ? "toxic" : "steel");
      let row;
      if (q.iap && !owned) row = iapRow(ic, q.name, q.desc, `<span class="tag gold">${tr("PREMIUM")}</span>`, q.iap, false);
      else if (q.pass && !owned) row = shopRow(ic, q.name, q.desc, `<span class="tag amber">${tr("SAISONPASS")}</span>`, `${I("pass")}${tr("Zum Pass")}`, true, () => { renderPass(); show(ui.pass); });
      else if (owned) row = shopRow(ic, q.name, `${tr(heroPerk(q.id).name)}: ${tr(heroPerk(q.id).desc)} · ${tr("Spezial")}: ${tr(heroSpecial(q.id).name)}${active ? ` · ${tr("Ausgerüstet")}` : ""}`, active ? `<span class="tag">${tr("Aktiv")}</span>` : "", active ? I("check") : tr("Ausrüsten"), !active, () => { save.skin = q.id; previewSkin = q.id; persist(); sfx("coin"); renderShop(); }, active ? "" : "primary");
      else if (reqLocked(SKIN_REQ[q.id])) row = shopRow(ic, q.name, `${tr(heroPerk(q.id).name)}: ${tr(heroPerk(q.id).desc)} · ${tr("Erreiche {c}, um das freizuschalten", { c: cityAt(SKIN_REQ[q.id]).name })}`, `<span class="tag">${tr("GESPERRT")}</span>`, `${I("lock")}${reqText(SKIN_REQ[q.id])}`, false, null);
      else row = shopRow(ic, q.name, `${tr(heroPerk(q.id).name)}: ${tr(heroPerk(q.id).desc)} · ${tr("Spezial")}: ${tr(heroSpecial(q.id).name)}`, "", coinAmt(q.price), save.coins >= q.price, () => {
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
    $("musicBtn").innerHTML = row("music", tr("Musik"), sw(save.music !== false));
    $("vibBtn").innerHTML = row("vibration", tr("Vibration"), sw(save.vibration));
    $("langBtn").innerHTML = row("language", tr("Sprache"), valTxt(I18N.lang === "de" ? "Deutsch" : "English"));
    const gfxNames = init3d() ? ["2D (schnell)", "3D", "3D + Schatten"] : ["Niedrig", "Mittel", "Hoch"];
    $("gfxBtn").innerHTML = row("graphics", tr("Grafik"), valTxt(tr(gfxNames[quality])));
    $("fpsBtn").innerHTML = row("battery", tr("Akku sparen (30 FPS)"), sw(!!save.fps30));
    $("cineBtn").innerHTML = row("cinema", tr("Kino-Effekte"), sw(save.cine !== false));
    $("motionBtn").innerHTML = row("motion", tr("4D-Bewegung (Neigen)"), sw(save.motion !== false));
    $("shakeBtn").innerHTML = row("explosion", tr("Bildschirmwackeln"), sw(save.shakeFx !== false));
    $("bloomBtn").innerHTML = row("star", tr("Leuchteffekte"), sw(save.bloom !== false));
    $("bloomBtn").classList.toggle("hidden", !init3d());
    $("camBtn").innerHTML = row("camView", tr("Kamera"), valTxt(tr(CAM_NAMES[save.cam || "top"]) + (quality === 0 ? ` ${tr("(nur 3D)")}` : "")));
    $("camBtn").classList.toggle("hidden", !init3d());
    const cp = $("camBtnP"); if (cp) { cp.innerHTML = `${I("camView")}${tr(CAM_NAMES[save.cam || "top"])}`; cp.classList.toggle("hidden", !mode3d); }
    $("privacyOptsBtn").innerHTML = row("privacy", tr("Werbe-Einwilligung ändern"), "");
    $("privacyOptsBtn").classList.toggle("hidden", !Platform.isNative);
    $("privacyLink").innerHTML = row("info", tr("Datenschutzerklärung"), "");
    $("privacyLink").href = Platform.cfg.privacyUrl || "privacy.html";
    // In der App im selben WebView öffnen: externe Links leitet Capacitor an den Browser weiter,
    // lokale Seiten bleiben per Zurück-Taste erreichbar.
    if (Platform.isNative) $("privacyLink").removeAttribute("target");
    $("versionLine").innerHTML = `Outbreak! Germany v${Platform.cfg.version || "1.0.0"}${Platform.isNative ? " · Android" : " · Web"}<br>${tr("Icons: game-icons.net (CC BY 3.0) · Schriften: Teko, Barlow, Saira Stencil (SIL OFL)")}`;
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
    try { if (webgl) Render3D.stopPreview(); } catch { /* Menü-Vorschau */ }
    try { if (webgl) Render3D.clear(); } catch (e) { console.warn("[Outbreak] 3D-Clear", e); }
    refreshMenu();
    const st = dailyState();
    $("dailyBadge").classList.toggle("hidden", st.claimedToday);
    const cta = $("storeCta");
    cta.classList.toggle("hidden", Platform.isNative || !Platform.cfg.playStoreUrl);
    if (Platform.cfg.playStoreUrl) cta.href = Platform.cfg.playStoreUrl;
    const shot = /(?:\?|&)shot=(menu|play|over|boss)\b/.exec(location.search)?.[1];
    if (!shot && !dailyShown && !st.claimedToday) { dailyShown = true; openDaily(); return; }
    show(ui.menu);
  }

  $("rerollBtn").innerHTML = adLabel(tr("Neu würfeln"));
  $("reviveAdBtn").innerHTML = adLabel(tr("Wiederbeleben"));
  $("dailyClaimAd").innerHTML = adLabel(tr("×2 abholen"));
  $("patrolClaimAd").innerHTML = adLabel(tr("×2 abholen"));
  $("loadoutBtn").addEventListener("click", () => { ensureAudio(); renderArmory(); show(ui.armory); });
  // Startknopf startet die gewählte Einsatzart; Karte antippen wählt, zweites Antippen startet sofort
  $("playBtn").addEventListener("click", () => startRun(save.menuMode === "survival" ? "survival" : "campaign"));
  // v2.5 Bedrohung wählen, Bestenliste, Teilen
  $("startCities").addEventListener("click", (ev) => {
    const b = ev.target.closest(".sc");
    if (!b || b.disabled) return;
    save.startCity = +b.dataset.c; persist(); renderStartPick(); refreshMenu();
    if (window.GameAudio) GameAudio.ui("tap");
  });
  $("threatPips").addEventListener("click", (ev) => {
    const b = ev.target.closest(".tp");
    if (!b) return;
    const t = +b.dataset.t;
    if (b.classList.contains("locked")) { toast(tr("Besiege einen Stadt-Boss auf Bedrohung {n}, um Stufe {m} freizuschalten", { n: save.threatMax || 0, m: (save.threatMax || 0) + 1 }), "lock"); return; }
    save.threat = t; persist(); refreshMenu();
    toast(threatInfoText(t), "skull");
  });
  $("ranksBtn").addEventListener("click", () => { renderRanks(); show(ui.ranks); });
  $("gearBtn").addEventListener("click", () => { ensureAudio(); renderGear(); show(ui.gear); });
  $("rankShare").addEventListener("click", () => { const e = (save.scores || [])[0]; if (e) shareScore(e); });
  $("shareBtn").addEventListener("click", () => { if (lastScore) shareScore(lastScore); });
  const pickMode = (m) => {
    if ((save.menuMode || "campaign") === m) { startRun(m); return; }
    save.menuMode = m; persist(); refreshMenu();
  };
  $("modeCampaign").addEventListener("click", () => pickMode("campaign"));
  $("survivalBtn").addEventListener("click", () => pickMode("survival"));
  // Held & Waffe direkt im Menü durchblättern (nur, was man besitzt)
  const cycle = (list, cur, dir) => list[(list.indexOf(cur) + dir + list.length) % list.length];
  const pop = (el) => { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); };
  const cycleSkin = (dir) => { const l = ownedSkins(); if (l.length < 2) return; save.skin = cycle(l, save.skin, dir); persist(); refreshMenu(); pop($("heroPickBtn")); if (window.GameAudio) GameAudio.ui("swipe"); };
  const cycleWeapon = (dir) => { const l = ownedWeapons(); if (l.length < 2) return; save.equipped = cycle(l, save.equipped, dir); persist(); refreshMenu(); pop($("loadoutBtn")); if (window.GameAudio) GameAudio.ui("swipe"); };
  for (const b of document.querySelectorAll("#heroPicker .pk-arrow")) b.addEventListener("click", () => cycleSkin(+b.dataset.dir));
  for (const b of document.querySelectorAll("#weaponPicker .pk-arrow")) b.addEventListener("click", () => cycleWeapon(+b.dataset.dir));
  $("heroPickBtn").addEventListener("click", () => { ensureAudio(); shopTab = "skins"; renderShop(); show(ui.shop); });
  // Wischen auf den Auswahlfeldern blättert ebenfalls
  for (const [id, fn] of [["heroPicker", cycleSkin], ["weaponPicker", cycleWeapon]]) {
    let sx = null;
    $(id).addEventListener("pointerdown", (e) => { sx = e.clientX; });
    $(id).addEventListener("pointerup", (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) fn(e.clientX < sx ? 1 : -1); sx = null; });
  }
  // Bühne: Ziehen dreht die Kamera um den Helden
  {
    const st = $("menuStage");
    let lx = null;
    st.addEventListener("pointerdown", (e) => { lx = e.clientX; st.setPointerCapture(e.pointerId); st.classList.add("used"); });
    st.addEventListener("pointermove", (e) => { if (lx === null) return; if (webgl && Render3D.menuOrbit) Render3D.menuOrbit((e.clientX - lx) * 0.009); lx = e.clientX; });
    const end = () => { lx = null; if (webgl && Render3D.menuOrbit) Render3D.menuOrbit(0, true); };
    st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end);
  }
  $("againBtn").addEventListener("click", () => leaveOver(() => startRun(lastMode)));
  $("missionsBtn").addEventListener("click", () => { ensureAudio(); renderMissions(); show(ui.missions); });
  for (const b of document.querySelectorAll("#missionTabs button")) b.addEventListener("click", () => { missionTab = b.dataset.tab; renderMissions(); });
  $("passBtn").addEventListener("click", () => { ensureAudio(); renderPass(); show(ui.pass); });
  $("codexBtn").addEventListener("click", () => { ensureAudio(); renderCodex(); show(ui.codex); });
  $("routeBtn").addEventListener("click", () => { ensureAudio(); openStory("menu", () => { show(ui.menu); }); });
  $("routeStrip").addEventListener("click", () => { ensureAudio(); openStory("menu", () => { show(ui.menu); }); });
  $("storyGo").addEventListener("click", storyNext);
  window.addEventListener("resize", () => { if (routeView) drawRouteMap(); });
  for (const b of document.querySelectorAll("#codexTabs button")) b.addEventListener("click", () => { codexTab = b.dataset.tab; renderCodex(); });
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
    if (run && run.freeRerolls > 0 && state === "pick") { run.freeRerolls--; fn(); return; } // einmal pro Einsatz ohne Werbung
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
  const toggleSound = () => { save.sound = !save.sound; persist(); syncSound(); if (window.GameAudio) GameAudio.setMuted(!save.sound); };
  soundBtn.addEventListener("click", toggleSound);
  $("soundBtn2").addEventListener("click", toggleSound);
  $("cineBtn").addEventListener("click", () => { save.cine = save.cine === false; persist(); applyCine(); renderSettings(); });
  $("shakeBtn").addEventListener("click", () => { save.shakeFx = save.shakeFx === false; persist(); renderSettings(); });
  // v3.1 Kamera-Perspektive: Übersicht → Nah → Third Person (Taste C, Gamepad Select, Einstellungen, Pause)
  function cycleCam(silent) {
    const i = CAM_ORDER.indexOf(save.cam || "top");
    save.cam = CAM_ORDER[(i + 1) % CAM_ORDER.length]; persist();
    if (webgl && Render3D.setCamMode) Render3D.setCamMode(save.cam);
    renderSettings();
    if (!silent) toast(`${tr("Kamera")}: ${tr(CAM_NAMES[save.cam])}`, "camView");
    if (window.GameAudio) GameAudio.ui("tick");
  }
  $("camBtn").addEventListener("click", () => cycleCam(true));
  $("camBtnP").addEventListener("click", () => cycleCam(true));
  $("bloomBtn").addEventListener("click", () => { save.bloom = save.bloom === false; persist(); if (window.Render3D && Render3D.ready) Render3D.setBloom(save.bloom !== false); renderSettings(); });
  $("motionBtn").addEventListener("click", () => { save.motion = save.motion === false; persist(); renderSettings(); if (!save.motion && webgl && Render3D.setTilt) for (let i = 0; i < 40; i++) Render3D.setTilt(0, 0); });
  // 4D: Handy neigen schwenkt die Menükamera (Ausgangslage wird laufend nachgeführt)
  let baseBeta = null;
  window.addEventListener("deviceorientation", (e) => {
    if (save.motion === false || run || e.gamma == null || !webgl || !Render3D.setTilt) return;
    if (baseBeta === null) baseBeta = e.beta;
    baseBeta += (e.beta - baseBeta) * 0.01;
    Render3D.setTilt(clamp(e.gamma / 30, -1, 1), clamp((e.beta - baseBeta) / 25, -1, 1));
  });
  $("musicBtn").addEventListener("click", () => { save.music = save.music === false; persist(); renderSettings(); ensureAudio(); if (window.GameAudio) GameAudio.setMusic(save.music); });
  // Bedien-Klänge für alle Knöpfe (Erfassungsphase: vor den eigentlichen Klick-Handlern)
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest && ev.target.closest("button, .tab, a.btn");
    if (!b || !save.sound) return;
    ensureAudio();
    if (window.GameAudio) GameAudio.ui(b.matches("[data-back], .back") ? "back" : b.matches("#playBtn, #survivalBtn, .btn.primary, .btn.amber") ? "confirm" : "tap");
  }, true);
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
    else if (state === "story") storyNext();
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
  applyCine();

  I18N.localizeDom();
  Platform.init();
  toMenu();
  console.log("[Outbreak] Spiel gestartet", Platform.cfg.version);
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    const shot = /(?:\?|&)shot=(play|over|boss)\b/.exec(location.search)?.[1];
    if (shot) {
      save.storySeen = true; save.tutorialDone = true; persist();
      startRun("campaign");
      if (shot === "over") {
        run.headshots = 11; run.kills = 48; run.bestCombo = 12; run.firstBloodAt = 3.8;
        gameOver(false);
      } else if (shot === "boss") {
        run.room = 9;
        nextRoom();
      }
    }
  }

  if (!Platform.isNative && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline-Modus optional */ });
  }

  // Für automatisierte Tests
  window.__outbreak = { get state() { return state; }, get run() { return run; }, get player() { return player; }, get enemies() { return enemies; }, get bullets() { return bullets; }, get eBullets() { return eBullets; }, get particles() { return particles; }, get zaps() { return zaps; }, save, hurt: (d) => hurtPlayer(d), spawn: (t, x, y, evo) => { evoLock = true; try { const e = spawnEnemy(t, x, y); if (evo) mutate(e, evo, null); return e; } finally { evoLock = false; } }, freeze: () => { state = "frozen"; player.hurtT = 0; player.invuln = 0; banner = null; texts = texts.filter((t) => t.size < 22); }, unfreeze: () => { if (state === "frozen") state = "play"; }, get mode3d() { return mode3d; }, get obstacles() { return obstacles; }, get orbs() { return orbs; }, get corpses() { return corpses; }, get pieces() { return pieces; }, get pools() { return pools; }, get screenBlood() { return screenBlood; }, get lobs() { return lobs; }, get parcels() { return parcels; }, get beams() { return beams; }, get hazards() { return hazards; }, shoot: (x, y, a, o = {}) => { const b = makeBullet(x, y, a, { dmg: 10, speed: 700, ...o }); bullets.push(b); return b; }, boom: (x, y, r = 70) => explode(x, y, r, 0, true), hit: (e, d, o = {}) => damageEnemy(e, d, o), evolve: (id) => takeEvolution(EVOLUTIONS.find((q) => q.id === id)), get passInfo() { return { ...seasonInfo(), level: passLevel(), premium: passPremium() }; }, get obj() { return run ? run.obj : null; }, get event() { return run ? run.event : null; }, forceEvent: (k) => { run.event = { kind: k, at: 999, fired: false }; }, skill: (id) => takeSkill(skillById(id)), mod: () => giveMod(rollMod()), supply: () => openSupply(), get gates() { return gates; }, horde: (n = 20) => startHorde(n), get miniSpot() { return miniSpot; }, get wetSpots() { return wetSpots; }, mini: (kind = "lukas") => { const s = { kind, x: player.x, y: player.y, r: 30, bob: 0, done: false, armed: false }; miniSpot = s; openMini(s); return s; }, layout: (list = [], withBarrier = false) => {
    const fest = run.mode === "campaign" && run.room > 0 ? curCity().fest : "";
    const obs = (withBarrier ? genBarrier() : []).concat(list.map((q) => { const sz = OBSTACLE_SIZE[q.kind]; let w = q.w || sz[0], h = q.h || sz[2]; if (q.vert && !q.w) [w, h] = [h, w]; const o = { seed: randi(1, 1e9), fest, vert: !!q.vert, ...q, w, h }; if (DESTRUCT[q.kind]) o.hp = DESTRUCT[q.kind]; return o; }));
    obstacles = clearGates(obs); floorCanvas = makeFloor();
    roomLights = obstacles.filter((o) => GLOWING[o.kind]).map((o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, rgb: GLOWING[o.kind], r: Math.max(o.w, o.h) * 1.3, src: o }));
    return obstacles;
  }, get birds() { return birds; }, landFlock: (x, y, n) => landFlock(x, y, n), gear: { SLOTS: GEAR_SLOTS, RARITY: GEAR_RARITY, AFFIX: GEAR_AFFIX, make: makeGear, roll: rollGear, drop: (x, y, luck) => dropGear(x ?? player.x, y ?? player.y - 90, luck), add: addToBag, stock: dealerStock, apply: applyGear, power: gearPower, render: renderGear, shop: () => { shopTab = "gear"; renderShop(); show(ui.shop); } }, get throws() { return throws; }, get decoys() { return decoys; }, get strikes() { return strikes; }, POWERUPS, looter: () => spawnLooter(), EVO, mutate: (e, st, cause = "test") => mutate(e, st, cause), roar: (e) => alphaRoar(e), rollEvo: (e) => rollEvo(e), get lures() { return lures; }, hitObs: (o, d) => hitObstacle(o, d), get pu() { return run ? run.pu || null : null; }, power: (k, x, y) => dropPower(x ?? player.x, y ?? player.y - 70, k), takePower: (k) => takePower({ pu: k }), throwNow: () => doThrow(), ultNow: () => { run.ult = 100; activateUlt(); }, giveThrow: (k, n = 1) => addThrow(k, n, player.x, player.y), cycleThrow: () => cycleThrow(), THROWABLES, HERO_SPECIALS, get fuses() { return fuses; }, objective: (k) => setupObjective(k), elite: (e, n = 1) => { if (!e.elite) makeElite(e, n); return e; }, levelUp: () => addXp(player.xpNeed - player.xp), nextRoom: () => nextRoom(), startRun, gameOver, setGfx: (q, lock = true) => { quality = q; gfxLocked = lock; resize(); } };
})();
