// Stadtgrenze zu einem Punkt (Nominatim, OpenStreetMap). Liefert Name, Rechteck und vereinfachten Umriss.
// Nominatim erlaubt höchstens eine Anfrage pro Sekunde: Ergebnisse werden pro Sitzung gemerkt.
import { getJSON } from "./http.js";

const BASE = "https://nominatim.openstreetmap.org";
const memo = new Map();

/**
 * @returns {Promise<{name:string, bounds:[number,number,number,number], outline:Array<Array<[number,number]>>} | null>}
 *   bounds = [süd, west, nord, ost], outline = Ringe als [lat, lon]-Listen
 */
export function cityAt(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (!memo.has(key)) {
    const url = `${BASE}/reverse?lat=${lat}&lon=${lon}&zoom=10&format=jsonv2&polygon_geojson=1&polygon_threshold=0.002&accept-language=de`;
    const p = getJSON(url, { timeout: 20000 }).then(parseCity).catch((e) => { memo.delete(key); throw e; });
    memo.set(key, p);
  }
  return memo.get(key);
}

export function parseCity(res) {
  if (!res?.boundingbox || res.osm_type !== "relation") return null; // nur echte Gemeindegrenzen
  const [s, n, w, e] = res.boundingbox.map(Number);
  const g = res.geojson || {};
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const outline = polys.flatMap((poly) => poly.map((ring) => ring.map(([lo, la]) => [la, lo])));
  return { name: res.name || res.address?.city || "Stadt", bounds: [s, w, n, e], outline };
}
