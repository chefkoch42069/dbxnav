// Geometrie-Helfer (ohne Leaflet, damit testbar).
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt (lat, lon) in GeoJSON-(Multi)Polygon? */
export function pointInGeometry(lat, lon, geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) {
    if (!inRing(lon, lat, poly[0])) continue;
    let hole = false;
    for (let k = 1; k < poly.length; k++) if (inRing(lon, lat, poly[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

const locators = new WeakMap();
/** Bundesland-ID (z. B. 'DE-BY') für einen Punkt, oder null. Kleine Gebiete (Stadtstaaten) zuerst. */
export function stateAt(lat, lon, featureCollection) {
  let loc = locators.get(featureCollection);
  if (!loc) locators.set(featureCollection, (loc = makeLocator(featureCollection)));
  return loc(lat, lon);
}

/** Rechteck [süd, west, nord, ost] um einen Punkt. */
export function boundsAround(center, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return [center.lat - dLat, center.lon - dLon, center.lat + dLat, center.lon + dLon];
}

/** Alle Bundesländer, durch die eine Linie führt (stichprobenartig, alle ~step Punkte). */
export function statesAlong(points, featureCollection, step = 3) {
  const found = new Set();
  for (let i = 0; i < points.length; i += step) {
    const id = stateAt(points[i][0], points[i][1], featureCollection);
    if (id) found.add(id);
  }
  if (points.length) {
    const last = points[points.length - 1];
    const id = stateAt(last[0], last[1], featureCollection);
    if (id) found.add(id);
  }
  return [...found];
}

/** Linie vereinfachen (Douglas-Peucker in Grad, für Speicherung im Browser). */
export function simplify(points, tol = 0.0005) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)];
}

/** Index des Linienpunkts, der (lat, lon) am nächsten liegt. */
export function nearestIndex(points, lat, lon) {
  let best = 0, bd = Infinity;
  points.forEach(([a, b], i) => {
    const d = (a - lat) ** 2 + (b - lon) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/** Slippy-Map-Kachel für lat/lon/zoom. */
export function tileFor(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latR = rad(lat);
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return { x, y, z };
}

/** Kacheln entlang einer Route (nur die, die die Linie berührt). */
export function tilesAlong(points, zooms, max = Infinity) {
  const seen = new Set();
  const out = [];
  for (const z of zooms) {
    for (let i = 0; i < points.length; i++) {
      const [lat, lon] = points[i];
      const next = points[i + 1];
      // Zwischenpunkte, damit lange Segmente keine Lücken lassen
      const steps = next ? Math.max(1, Math.ceil(Math.hypot(next[0] - lat, next[1] - lon) / (180 / 2 ** z / 2))) : 1;
      for (let s = 0; s < steps; s++) {
        const la = next ? lat + ((next[0] - lat) * s) / steps : lat;
        const lo = next ? lon + ((next[1] - lon) * s) / steps : lon;
        const t = tileFor(la, lo, z);
        const k = `${z}/${t.x}/${t.y}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(t);
          if (out.length >= max) return out;
        }
      }
    }
  }
  return out;
}

/**
 * Schneller Punkt→Gebiet-Lookup für eine FeatureCollection (z. B. Länder).
 * Vorfilter über das umgebende Rechteck; kleine Gebiete (Enklaven wie Vatikan) zuerst.
 * @returns (lat, lon) → properties.id oder null
 */
export function makeLocator(fc) {
  const items = fc.features.map((f) => {
    let s = 90, w = 180, n = -90, e = -180;
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) for (const [x, y] of poly[0]) { s = Math.min(s, y); n = Math.max(n, y); w = Math.min(w, x); e = Math.max(e, x); }
    return { f, s, w, n, e, area: (n - s) * (e - w) };
  }).sort((a, b) => a.area - b.area);
  const cache = new Map();
  return (lat, lon) => {
    const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (cache.has(k)) return cache.get(k);
    let id = null;
    for (const it of items) {
      if (lat < it.s || lat > it.n || lon < it.w || lon > it.e) continue;
      if (pointInGeometry(lat, lon, it.f.geometry)) { id = it.f.properties.id; break; }
    }
    if (cache.size > 5000) cache.clear();
    cache.set(k, id);
    return id;
  };
}
