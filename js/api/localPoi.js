// Eigene, vorab erzeugte Ortsdaten (tools/build_poi.py, wöchentlich per GitHub Action).
// Schnell, ohne Server-Abhängigkeit, offline-fähig. Fehlen die Daten (z. B. lokal ohne
// Pipeline), liefert alles hier null und die App fragt Overpass.
import { distanceKm, tileFor } from "../lib/geo.js";

const BASE = "data/poi";
let indexPromise = null;
const tileCache = new Map(); // "x/y" → Promise<Array>

export function loadIndex() {
  indexPromise ||= fetch(`${BASE}/index.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((i) => (i?.tiles ? { ...i, tiles: new Set(i.tiles) } : null))
    .catch(() => null);
  return indexPromise;
}

/** Kachel-Schlüssel („x/y“), die ein Rechteck [süd, west, nord, ost] abdecken. */
export function tilesForBounds([s, w, n, e], z) {
  const a = tileFor(n, w, z), b = tileFor(s, e, z);
  const out = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push(`${x}/${y}`);
  return out;
}

export function boundsAround(center, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return [center.lat - dLat, center.lon - dLon, center.lat + dLat, center.lon + dLon];
}

function loadTile(key, z) {
  if (!tileCache.has(key)) {
    tileCache.set(key, fetch(`${BASE}/${z}/${key}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => {
      tileCache.delete(key); // bei Netzfehler später nochmal versuchen
      return [];
    }));
  }
  return tileCache.get(key);
}

/**
 * Orte im Umkreis (radiusM) oder Rechteck (bounds) – im selben Format wie die Overpass-Funktionen.
 * @returns {Promise<Array|null>} null = keine lokalen Daten vorhanden
 */
export async function localElements(center, { radiusM = 1500, bounds = null } = {}) {
  const index = await loadIndex();
  if (!index) return null;
  const bb = bounds || boundsAround(center, radiusM);
  const all = tilesForBounds(bb, index.zoom);
  if (all.length > 64) throw new Error("Ausschnitt zu groß – bitte näher heranzoomen.");
  const keys = all.filter((k) => index.tiles.has(k));
  // Keine einzige Kachel vorhanden: vermutlich außerhalb der Daten (z. B. Ausland) → Overpass fragen
  if (!keys.length) return null;
  const lists = await Promise.all(keys.map((k) => loadTile(k, index.zoom)));
  const [s, w, n, e] = bb;
  const out = [];
  for (const list of lists) {
    for (const [id, lat, lon, tags, bb] of list) {
      if (lat < s || lat > n || lon < w || lon > e) continue;
      const dist = distanceKm(center, { lat, lon });
      if (!bounds && dist * 1000 > radiusM) continue;
      // Flächen (Parks) haben optional ihr Rechteck dabei – im Overpass-Format „bounds“
      const box = bb ? { minlat: bb[0], minlon: bb[1], maxlat: bb[2], maxlon: bb[3] } : undefined;
      out.push({ id, lat, lon, tags, dist, bounds: box });
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

export async function dataInfo() {
  const i = await loadIndex();
  return i ? { generated: i.generated, count: i.count } : null;
}
