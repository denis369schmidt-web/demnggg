// Baut den Web-Inhalt der Android-App nach mobile/www:
//  1. kopiert das Spiel aus ../zombie (ohne Service Worker / Web-Manifest)
//  2. bündelt die nativen Plugins (src/native.js -> www/native.js)
//  3. erzeugt www/config.js aus Umgebungsvariablen (GitHub-Secrets)
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "..", "zombie");
const out = join(root, "www");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const env = process.env;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ["index.html", "style.css", "i18n.js", "platform.js", "game.js", "icon.svg", "privacy.html", "icons"]) {
  cpSync(join(src, f), join(out, f), { recursive: true });
}

await build({
  entryPoints: [join(root, "src", "native.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome90"],
  outfile: join(out, "native.js"),
  logLevel: "warning",
});

// Native Brücke vor platform.js laden, Web-Manifest entfernen.
let html = readFileSync(join(out, "index.html"), "utf8");
html = html
  .replace('<script src="platform.js"></script>', '<script src="native.js"></script>\n  <script src="platform.js"></script>')
  .replace(/\s*<link rel="manifest"[^>]*>/, "");
writeFileSync(join(out, "index.html"), html);

// Konfiguration: Werte aus der Web-Config übernehmen, per Env überschreiben.
const webCfgSrc = readFileSync(join(src, "config.js"), "utf8");
const sandbox = {};
new Function("window", webCfgSrc)(sandbox);
const cfg = sandbox.OUTBREAK_CONFIG;
cfg.version = pkg.version;
if (env.ADMOB_REWARDED_ID) cfg.admob.rewarded = env.ADMOB_REWARDED_ID;
if (env.ADMOB_INTERSTITIAL_ID) cfg.admob.interstitial = env.ADMOB_INTERSTITIAL_ID;
// Echte Anzeigen nur, wenn eigene IDs gesetzt sind und nicht ausdrücklich getestet wird.
cfg.admob.testing = !(env.ADMOB_REWARDED_ID && env.ADMOB_INTERSTITIAL_ID) || env.ADMOB_TESTING === "1";
if (env.PRIVACY_URL) cfg.privacyUrl = env.PRIVACY_URL;
if (env.PLAY_STORE_URL) cfg.playStoreUrl = env.PLAY_STORE_URL;
writeFileSync(
  join(out, "config.js"),
  `// Automatisch erzeugt von mobile/scripts/build-web.mjs – nicht von Hand bearbeiten.\nwindow.OUTBREAK_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`,
);

if (!existsSync(join(out, "native.js"))) throw new Error("native.js fehlt");
console.log(`www gebaut (v${cfg.version}, Werbung: ${cfg.admob.testing ? "TEST-Anzeigen" : "ECHTE Anzeigen"})`);
