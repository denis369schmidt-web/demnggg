// Offline-Cache. v5.3: zuerst das Netz (am Browser-Cache vorbei geprüft), der Cache nur ohne Netz –
// sonst laufen Geräte nach einem Update noch mit dem alten Stand und passen online nicht zusammen.
const CACHE = "outbreak-hero-v49";
const FILES = [
  "./", "./index.html", "./style.css", "./config.js", "./i18n.js", "./sprites.js", "./vendor/three.min.js", "./render3d.js", "./platform.js", "./audio.js", "./minigames.js", "./game.js",
  "./manifest.webmanifest", "./icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  "./vendor/icons.js", "./vendor/peerjs.min.js", "./vendor/qrcode.js", "./vendor/fonts/fonts.css",
  ...["teko-latin-500", "teko-latin-600", "teko-latin-700", "barlow-condensed-latin-600", "barlow-condensed-latin-700", "barlow-condensed-latin-800",
    "barlow-latin-500", "barlow-latin-600", "barlow-latin-700", "saira-stencil-one-latin-400"].map((f) => `./vendor/fonts/${f}-normal.woff2`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // fremde Server (Relais, Vermittlung) nicht anfassen
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: url.searchParams.has("fresh") || url.searchParams.has("room") || url.searchParams.has("host") });
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), hit ? 4000 : 15000); // schwaches Netz: nach 4 s den gespeicherten Stand nehmen
      const res = await fetch(e.request, { cache: "no-cache", signal: ctl.signal });
      clearTimeout(tm);
      if (res.ok && !url.search) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    } catch {
      if (hit) return hit;
      throw new Error("offline");
    }
  })());
});
