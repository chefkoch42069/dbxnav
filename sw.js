// Service Worker: App offline verfügbar, Kacheln zwischenspeichern (begrenzt), API-Antworten als Rückfall.
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const TILES = "tiles";
const API = "api";
const MAX_TILES = 2500;
const MAX_API = 300;

const SHELL_FILES = [
  "./", "index.html", "css/style.css", "icon.svg", "manifest.webmanifest",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-shadow.png",
  "data/bundeslaender.geojson",
  "js/app.js", "js/config.js", "js/state.js", "js/collector.js", "js/offline.js",
  "js/lib/time.js", "js/lib/polyline.js", "js/lib/geo.js", "js/lib/store.js",
  "js/api/http.js", "js/api/transitous.js", "js/api/overpass.js", "js/api/weather.js",
  "js/planner/dticket.js", "js/planner/stages.js", "js/planner/tour.js", "js/planner/daytrip.js", "js/planner/roundtrip.js", "js/planner/accommodation.js", "js/planner/departures.js",
  "js/ui/dom.js", "js/ui/map.js", "js/ui/nav.js", "js/ui/placeInput.js", "js/ui/details.js", "js/ui/statesData.js",
  "js/ui/planTab.js", "js/ui/boardTab.js", "js/ui/collectTab.js", "js/ui/savedTab.js",
];

const TILE_HOSTS = ["tile.openstreetmap.de", "tileserver.memomaps.de", "tiles.openrailwaymap.org", "tile.waymarkedtrails.org"];
const API_HOSTS = ["api.transitous.org", "overpass-api.de", "overpass.private.coffee", "api.brightsky.dev"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k)));
}

let tileWrites = 0;
async function tileFirst(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await c.put(req, res.clone());
    if (++tileWrites % 50 === 0) trim(TILES, MAX_TILES);
  }
  return res;
}

async function networkFirst(req) {
  const c = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.ok) { await c.put(req, res.clone()); trim(API, MAX_API); }
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) return e.respondWith(tileFirst(req));
  if (API_HOSTS.includes(url.hostname)) return e.respondWith(networkFirst(req));
  if (url.origin === self.location.origin) return e.respondWith(staleWhileRevalidate(req));
});
