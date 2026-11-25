// Service Worker: App offline verfügbar, Kacheln zwischenspeichern (begrenzt), API-Antworten als Rückfall.
const VERSION = "v18";
const SHELL = `shell-${VERSION}`;
const TILES = "tiles";
const API = "api";
const MAX_TILES = 2500;
const MAX_API = 300;
const POI = "poi";
const MAX_POI = 600; // Ortsdaten-Kacheln (je ~6 × 6 km)

const SHELL_FILES = [
  "./", "index.html", "css/style.css", "icon.svg", "manifest.webmanifest",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-shadow.png",
  "data/bundeslaender.geojson", "data/europa.geojson",
  "js/app.js", "js/config.js", "js/state.js", "js/collector.js", "js/offline.js",
  "js/lib/time.js", "js/lib/legs.js", "js/lib/polyline.js", "js/lib/geo.js", "js/lib/store.js",
  "js/api/http.js", "js/api/transitous.js", "js/api/overpass.js", "js/api/localPoi.js", "js/api/weather.js", "js/api/city.js",
  "js/planner/dticket.js", "js/planner/stages.js", "js/planner/tour.js", "js/planner/daytrip.js", "js/planner/reachTree.js", "js/planner/roundtrip.js", "js/planner/accommodation.js", "js/planner/departures.js", "js/planner/budget.js", "js/planner/homeless.js", "js/planner/hiking.js", "js/planner/city.js", "js/planner/infra.js", "js/planner/booking.js", "js/planner/interrail.js", "js/planner/connection.js", "js/planner/multistop.js", "js/planner/shopping.js",
  "js/ui/dom.js", "js/ui/map.js", "js/ui/nav.js", "js/ui/placeInput.js", "js/ui/details.js", "js/ui/statesData.js",
  "js/ui/planTab.js", "js/ui/budgetTab.js", "js/ui/boardTab.js", "js/ui/collectTab.js", "js/ui/savedTab.js", "js/ui/cityTab.js", "js/ui/youtuberTab.js", "js/ui/transitClick.js", "js/ui/display.js", "js/ui/interrailTab.js", "js/ui/tourView.js", "js/ui/routeTab.js", "js/ui/stopList.js", "js/ui/timeScale.js",
];

const TILE_HOSTS = ["tile.openstreetmap.de", "tileserver.memomaps.de", "tiles.openrailwaymap.org", "tile.waymarkedtrails.org", "tiles.openseamap.org"];
const API_HOSTS = ["api.transitous.org", "overpass-api.de", "overpass.private.coffee", "overpass.kumi.systems", "maps.mail.ru", "api.brightsky.dev", "nominatim.openstreetmap.org"];

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

async function networkFirst(req, cacheName = API, max = MAX_API) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) { await c.put(req, res.clone()); trim(cacheName, max); }
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}

// Eigene Dateien: erst Netz (immer die aktuelle Version), offline aus dem Cache.
// Vorher stale-while-revalidate – das lieferte nach einem Update beim ersten Laden noch alten Code.
async function appNetworkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

// Schriften ändern sich nie: einmal geladen, danach ohne Netzanfrage. Sie stehen bewusst nicht im
// App-Shell – geladen werden sie nur, wenn die Seite sie nutzt (nicht bei Save-Data/Homeless-Modus).
async function cacheFirst(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) return e.respondWith(tileFirst(req));
  if (API_HOSTS.includes(url.hostname)) return e.respondWith(networkFirst(req));
  if (url.origin === self.location.origin && url.pathname.includes("/data/poi/")) return e.respondWith(networkFirst(req, POI, MAX_POI));
  if (url.origin === self.location.origin && url.pathname.includes("/vendor/fonts/")) return e.respondWith(cacheFirst(req));
  if (url.origin === self.location.origin) return e.respondWith(appNetworkFirst(req));
});
