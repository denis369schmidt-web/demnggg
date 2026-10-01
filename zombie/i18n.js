/* Übersetzungen von Outbreak Hero.
 * Deutsch ist die Ausgangssprache und steht direkt im Code; der deutsche Text
 * dient als Schlüssel. Alle anderen Gerätesprachen bekommen Englisch.
 * Sprache erzwingen: ?lang=en / ?lang=de oder in den Einstellungen umschalten.
 */
"use strict";
window.I18N = (() => {
  const LANG_KEY = "outbreak-lang";
  let lang = "de";
  try {
    const forced = new URLSearchParams(location.search).get("lang") || localStorage.getItem(LANG_KEY);
    lang = (forced || navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
  } catch {
    lang = (navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
  }

  const EN = {
    // Menüs (index.html)
    "Überlebe die Epidemie. Raum für Raum.": "Survive the outbreak. Room by room.",
    "Rekord:": "Best:",
    "SPIELEN": "PLAY",
    "🔫 Waffen": "🔫 Weapons",
    "🧬 Talente": "🧬 Talents",
    "🛒 Shop": "🛒 Shop",
    "🎁 Täglich": "🎁 Daily",
    "▶ Jetzt im Play Store holen": "▶ Get it on Google Play",
    "Bewegen: Finger ziehen / WASD · Stehen bleiben = automatisch schießen": "Move: drag your finger / WASD · Stand still = auto-fire",
    "Waffenkammer": "Armory",
    "Talente": "Talents",
    "Zurück": "Back",
    "Käufe wiederherstellen": "Restore purchases",
    "Tägliche Belohnung": "Daily Reward",
    "Komm jeden Tag wieder – Tag 7 gibt den Jackpot.": "Come back every day – day 7 is the jackpot.",
    "Abholen": "Claim",
    "▶ ×2 abholen": "▶ Claim ×2",
    "Später": "Later",
    "Einstellungen": "Settings",
    "Werbe-Einwilligung ändern": "Change ad consent",
    "Datenschutzerklärung": "Privacy policy",
    "▶ 🎲 Neu würfeln": "▶ 🎲 Reroll",
    "WEITERKÄMPFEN?": "KEEP FIGHTING?",
    "▶ Wiederbeleben (Video)": "▶ Revive (video)",
    "Aufgeben": "Give up",
    "Pause": "Paused",
    "Weiter": "Resume",
    "Run beenden": "End run",
    "Nochmal": "Play again",
    "Menü": "Menu",
    "▶ Münzen ×2 (Video)": "▶ Coins ×2 (video)",
    // Spiel
    "KAPITEL {n} ÜBERLEBT": "CHAPTER {n} SURVIVED",
    "+{b} 💰 · Die Seuche wird stärker…": "+{b} 💰 · The plague grows stronger…",
    "VERSORGUNGSRAUM": "SUPPLY ROOM",
    "Öffne die Kiste": "Open the crate",
    "BOSS: {name}": "BOSS: {name}",
    "Kapitel {c} · Raum {r}": "Chapter {c} · Room {r}",
    "RAUM {r}": "ROOM {r}",
    "Kapitel {c}": "Chapter {c}",
    "TÜR OFFEN ↑": "DOOR OPEN ↑",
    "AUSGEWICHEN": "DODGED",
    "WIEDERBELEBT": "REVIVED",
    "Zweites Leben verbraucht": "Second life used",
    "Volle Gesundheit!": "Full health!",
    "Kein Video verfügbar": "No video available",
    "RASEREI!": "FRENZY!",
    "Die Abscheulichkeit mutiert": "The Abomination mutates",
    "DIE BRUT ERWACHT": "THE BROOD AWAKENS",
    "(Stufe {n})": "(level {n})",
    "VERSORGUNGSKISTE": "SUPPLY CRATE",
    "Erste Hilfe": "First aid",
    "Heilt 50% deiner max. HP": "Heals 50% of your max HP",
    "Waffenkiste": "Weapon crate",
    "Wähle einen zusätzlichen Skill": "Pick an extra skill",
    "Noch keine Skills": "No skills yet",
    "RUN BEENDET": "RUN ENDED",
    "GEFALLEN": "YOU DIED",
    "Erreicht": "Reached",
    "Kap. {c} · Raum {r}": "Ch. {c} · Room {r}",
    "Kills": "Kills",
    "Level": "Level",
    "Zeit": "Time",
    "Münzen": "Coins",
    "Loslassen = automatisch schießen!": "Let go = auto-fire!",
    "👆 Finger ziehen = laufen & ausweichen": "👆 Drag = move & dodge",
    "Du schießt nur, wenn du stehst.": "You only shoot while standing still.",
    "Stehenbleiben = auf den nächsten Zombie feuern": "Stand still = fire at the nearest zombie",
    "Ausgerüstet: {w} (Stufe {n})": "Equipped: {w} (level {n})",
    " · Stufe {n}": " · Lv {n}",
    "Kaufen {p}💰": "Buy {p}💰",
    "Ausrüsten": "Equip",
    // Shop
    "Starterpaket": "Starter Pack",
    "Werbefrei + 3.000 Münzen + Armbrust": "No ads + 3,000 coins + crossbow",
    "BESTER DEAL": "BEST DEAL",
    "Werbefrei": "No Ads",
    "Keine Zwangswerbung mehr. Bonus-Videos bleiben freiwillig.": "No more forced ads. Bonus videos stay optional.",
    "Münzbeutel": "Coin Pouch",
    "1.200 Münzen": "1,200 coins",
    "Münztruhe": "Coin Chest",
    "7.000 Münzen": "7,000 coins",
    "+45% MEHR": "+45% MORE",
    "Gratis-Münzen": "Free coins",
    "Kurzes Video ansehen: +{x} Münzen ({l}/{n} heute)": "Watch a short video: +{x} coins ({l}/{n} today)",
    "▶ Gratis": "▶ Free",
    "Morgen wieder": "Back tomorrow",
    "✓ Gekauft": "✓ Owned",
    "In der App": "In the app",
    "Kauf abgebrochen": "Purchase cancelled",
    "Zahlung sicher über Google Play.": "Secure payment via Google Play.",
    "Verbinde mit Google Play …": "Connecting to Google Play …",
    "Käufe sind in der Android-App verfügbar.": "Purchases are available in the Android app.",
    "Kauf wiederhergestellt": "Purchase restored",
    "Kauf erfolgreich – danke! ❤️": "Purchase successful – thank you! ❤️",
    "Suche Käufe …": "Looking for purchases …",
    "Tag {n}": "Day {n}",
    "Abholen (+{x})": "Claim (+{x})",
    "Sound: {v}": "Sound: {v}",
    "Vibration: {v}": "Vibration: {v}",
    "Sprache: {v}": "Language: {v}",
    "an": "on",
    "aus": "off",
  };

  // Spieldaten (Waffen, Talente, Skills, Bosse) – nach ID
  const DATA_EN = {
    weapons: {
      pistol: { name: "Pistol", desc: "Balanced and precise." },
      shotgun: { name: "Shotgun", desc: "5 pellets, brutal at close range." },
      smg: { name: "SMG", desc: "Extremely high fire rate." },
      crossbow: { name: "Crossbow", desc: "Bolts pierce 2 zombies." },
      flame: { name: "Flamethrower", desc: "Short range, sets everything on fire." },
      sniper: { name: "Sniper Rifle", desc: "Massive damage, pierces 4 targets, +20% crit." },
      grenade: { name: "Grenade Launcher", desc: "Explodes and hits whole hordes." },
    },
    talents: {
      hp: { name: "Constitution", desc: "+8% max HP per level" },
      atk: { name: "Marksmanship", desc: "+6% damage per level" },
      speed: { name: "Stamina", desc: "+3% movement speed per level" },
      greed: { name: "Looter", desc: "+10% coins per level" },
    },
    skills: {
      multishot: { name: "Multishot", desc: "+1 extra volley (damage −10%)" },
      front: { name: "Double Barrel", desc: "+1 parallel projectile forward" },
      diag: { name: "Diagonal Shots", desc: "Also fires diagonally forward" },
      side: { name: "Side Shots", desc: "Also fires left and right" },
      rear: { name: "Rear Guard", desc: "Also fires backwards" },
      pierce: { name: "Piercing", desc: "Projectiles pierce +1 zombie" },
      ricochet: { name: "Ricochet", desc: "Projectiles bounce to +2 more zombies" },
      wall: { name: "Bouncy Rounds", desc: "Projectiles bounce off walls twice" },
      atk: { name: "Big Caliber", desc: "+25% damage" },
      rate: { name: "Rapid Fire", desc: "+22% fire rate" },
      crit: { name: "Headshot Training", desc: "+10% crit chance, +30% crit damage" },
      hp: { name: "Toughness", desc: "+25% max HP (heals by the bonus)" },
      heal: { name: "Medkit", desc: "Heals 40% of max HP" },
      fire: { name: "Incendiary Rounds", desc: "Hits set zombies on fire" },
      freeze: { name: "Cryo Rounds", desc: "Hits heavily slow zombies" },
      poison: { name: "Toxin Rounds", desc: "Hits poison permanently (stacks)" },
      blood: { name: "Adrenaline", desc: "Every kill heals 2% max HP" },
      orbit: { name: "Buzzsaws", desc: "+2 spinning saw blades around you" },
      drone: { name: "Combat Drone", desc: "A drone that fires even while you move" },
      dodge: { name: "Reflexes", desc: "+12% dodge chance" },
      speed: { name: "Sprinter", desc: "+12% movement speed" },
      exec: { name: "Execution", desc: "8% chance to instantly kill normal zombies" },
      revive: { name: "Second Life", desc: "One-time revive with 60% HP" },
      splash: { name: "Infection Bomb", desc: "Killed zombies explode" },
    },
    zombies: {
      abom: { name: "ABOMINATION" },
      mother: { name: "BROOD MOTHER" },
    },
  };

  function t(s, vars) {
    let out = lang === "en" && EN[s] !== undefined ? EN[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  function localizeData(tables) {
    if (lang !== "en") return;
    for (const [key, table] of Object.entries(tables)) {
      const tr = DATA_EN[key];
      if (!tr) continue;
      if (Array.isArray(table)) {
        for (const item of table) if (tr[item.id]) Object.assign(item, tr[item.id]);
      } else {
        for (const [id, item] of Object.entries(table)) if (tr[id]) Object.assign(item, tr[id]);
      }
    }
  }

  // Übersetzt alle Elemente mit data-i18n (deren deutscher Text ist der Schlüssel).
  function localizeDom(root = document) {
    document.documentElement.lang = lang;
    if (lang === "de") return;
    for (const el of root.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n") || el.textContent.trim();
      el.textContent = t(key);
    }
  }

  function setLang(next) {
    try { localStorage.setItem(LANG_KEY, next); } catch { /* egal */ }
  }

  return { lang, t, localizeData, localizeDom, setLang };
})();
