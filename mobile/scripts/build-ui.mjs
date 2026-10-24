// Baut die UI-Assets von Outbreak Hero offline-fähig nach ../zombie/vendor:
//  1. Schriften (SIL Open Font License) als woff2 + fonts.css
//  2. Icon-Sprite aus game-icons.net (CC BY 3.0) als icons.js – nur die Icons, die das Spiel nutzt
// Aufruf: npm run build:ui (danach Ergebnis committen)
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const vendor = join(root, "..", "zombie", "vendor");
const fontDir = join(vendor, "fonts");
mkdirSync(fontDir, { recursive: true });

// ---------------------------------------------------------------- Schriften
// Teko: Zahlen & große Titel · Barlow Condensed: Knöpfe & Beschriftungen · Barlow: Fließtext · Saira Stencil: Logo & Stempel
const FONTS = [
  ["teko", "Teko", [500, 600, 700]],
  ["barlow-condensed", "Barlow Condensed", [600, 700, 800]],
  ["barlow", "Barlow", [500, 600, 700]],
  ["saira-stencil-one", "Saira Stencil One", [400]],
];
let css = "/* Automatisch erzeugt von mobile/scripts/build-ui.mjs – Schriften unter SIL Open Font License (siehe *-OFL.txt) */\n";
for (const [pkg, family, weights] of FONTS) {
  const dir = dirname(require.resolve(`@fontsource/${pkg}/package.json`));
  for (const w of weights) {
    const file = `${pkg}-latin-${w}-normal.woff2`;
    copyFileSync(join(dir, "files", file), join(fontDir, file));
    css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format("woff2")}\n`;
  }
  copyFileSync(join(dir, "LICENSE"), join(fontDir, `${pkg}-OFL.txt`));
}
writeFileSync(join(fontDir, "fonts.css"), css);

// ---------------------------------------------------------------- Icons
// Spielname → game-icons.net-Name
const ICONS = {
  // Oberfläche
  coin: "two-coins", coins: "coins", gear: "cog", pause: "pause-button", play: "play-button", check: "check-mark", lock: "padlock",
  video: "film-projector", close: "cancel", stopwatch: "stopwatch", hourglass: "hourglass", trophy: "laurels-trophy",
  medal: "medal", skull: "death-skull", bossSkull: "daemon-skull", zombie: "shambling-zombie", map: "treasure-map",
  weapons: "crossed-pistols", talents: "dna2", missions: "scroll-unfurled", pass: "ticket", shop: "shopping-cart",
  daily: "calendar", patrol: "radar-sweep", codex: "open-book", gift: "present", chest: "open-treasure-chest",
  mystery: "locked-chest", backpack: "knapsack", noAds: "cancel", sound: "speaker", soundOff: "speaker-off",
  vibration: "vibrating-smartphone", language: "globe", graphics: "processor", battery: "battery-75", privacy: "checked-shield", star: "star-medal",
  door: "steel-door", explosion: "explosion-rays", dna: "dna1", upgrade: "upgrade", headshot: "helmet-head-shot",
  hazard: "hazard-sign", info: "info", firstAid: "first-aid-kit", ammo: "ammo-box", angel: "angel-outfit",
  dove: "peace-dove", devil: "devil-mask", heartArmor: "heart-armor", clover: "clover", run: "run", cash: "swap-bag",
  // Skills
  multishot: "bullets", front: "heavy-bullets", diag: "arrow-cluster", side: "back-forth", rear: "return-arrow",
  pierce: "supersonic-bullet", ricochet: "ricochet", wall: "brick-wall", atk: "muscle-up", rate: "machine-gun-magazine",
  crit: "on-target", hp: "heart-plus", heal: "medical-pack", fire: "fire", freeze: "snowflake-1", poison: "poison-bottle",
  blood: "bleeding-heart", orbit: "circular-sawblade", drone: "delivery-drone", dodge: "dodge", speed: "running-shoe",
  exec: "executioner-hood", revive: "angel-wings", splash: "spiky-explosion",
  // Evolutionen
  hail: "bullet-impacts", inferno: "volcano", frost: "frozen-orb", blades: "spinning-blades", swarm: "missile-swarm",
  vamp: "fangs", chain: "chain-lightning", plague: "biohazard",
  // Skins
  soldier: "brodie-helmet", police: "riot-shield", firefighter: "fire-axe", hazmat: "gas-mask", ninja: "ninja-head",
  cyber: "cyborg-face", plagueDoc: "plague-doctor-profile", crown: "crown", hunter: "radioactive",
};
const set = require("@iconify-json/game-icons/icons.json");
const paths = {};
for (const [name, gi] of Object.entries(ICONS)) {
  const icon = set.icons[gi];
  if (!icon) throw new Error(`Icon fehlt: ${gi}`);
  // Alle Pfade eines Icons zu einem d zusammenfassen (game-icons sind einfarbig)
  const ds = [...icon.body.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  if (!ds.length) throw new Error(`Kein Pfad in ${gi}`);
  paths[name] = ds.join(" ");
}
const js = `// Automatisch erzeugt von mobile/scripts/build-ui.mjs – nicht von Hand bearbeiten.
// Icons: game-icons.net (Lorc, Delapouite & Mitwirkende), Lizenz CC BY 3.0 – https://game-icons.net
"use strict";
window.GameIcons = (() => {
  const paths = ${JSON.stringify(paths)};
  // SVG-Sprite einmal in die Seite hängen; Icons werden per <use> referenziert (färbbar über currentColor)
  const sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' +
    Object.entries(paths).map(([k, d]) => '<symbol id="i-' + k + '" viewBox="0 0 512 512"><path fill="currentColor" d="' + d + '"/></symbol>').join("") + "</svg>";
  document.body.insertAdjacentHTML("afterbegin", sprite);
  const html = (name, cls = "") => '<svg class="ic ' + cls + '" viewBox="0 0 512 512" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  // Für den Canvas (HUD): Path2D je Icon, im 512er-Raster
  const cache = {};
  const path2d = (name) => cache[name] || (cache[name] = new Path2D(paths[name]));
  return { html, path2d, has: (name) => name in paths };
})();
`;
writeFileSync(join(vendor, "icons.js"), js);
console.log(`UI-Assets gebaut: ${FONTS.reduce((a, f) => a + f[2].length, 0)} Schriftschnitte, ${Object.keys(paths).length} Icons (${(js.length / 1024).toFixed(0)} KB)`);
