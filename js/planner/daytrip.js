// Tagestrip: Ziele, die hin und zurück am selben Tag gehen.
import { distanceKm } from "../lib/geo.js";
import { diffSec } from "../lib/time.js";

const RAIL = ["REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "SUBURBAN", "LONG_DISTANCE", "HIGHSPEED_RAIL"];
const key = (name) => name.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/\b(hauptbahnhof|hbf|bahnhof|bf)\b/g, "").replace(/[^a-zäöüß0-9]+/g, " ").trim();

/**
 * @param outbound one-to-all-Ergebnis ab Start (arriveBy=false): place.arrival = früheste Ankunft
 * @param inbound  one-to-all-Ergebnis zum Start (arriveBy=true): place.departure = späteste Rückfahrt
 */
export function combineReachability(home, outbound, inbound, { minStaySec = 2 * 3600, minDistanceKm = 8 } = {}) {
  const outMap = new Map();
  for (const r of outbound?.all || []) {
    const p = r.place;
    if (!p?.name || !(p.modes || []).some((m) => RAIL.includes(m))) continue;
    const k = key(p.name);
    const prev = outMap.get(k);
    if (!prev || Date.parse(p.arrival) < Date.parse(prev.arrival)) outMap.set(k, { ...p, outDuration: r.duration, outTransfers: r.k });
  }
  const res = [];
  const inMap = new Map();
  for (const r of inbound?.all || []) {
    const p = r.place;
    if (!p?.name) continue;
    const k = key(p.name);
    const prev = inMap.get(k);
    if (!prev || Date.parse(p.departure) > Date.parse(prev.departure)) inMap.set(k, { ...p, inDuration: r.duration, inTransfers: r.k });
  }
  for (const [k, o] of outMap) {
    const i = inMap.get(k);
    if (!i || !o.arrival || !i.departure) continue;
    if (distanceKm(home, o) < minDistanceKm) continue;
    const stay = diffSec(o.arrival, i.departure);
    if (stay < minStaySec) continue;
    res.push({
      name: o.name, lat: o.lat, lon: o.lon, stopId: o.stopId, importance: o.importance || 0,
      arrival: o.arrival, lastReturn: i.departure, stay,
      outMinutes: o.outDuration, inMinutes: i.inDuration, transfers: Math.max(o.outTransfers ?? 0, i.inTransfers ?? 0),
      km: Math.round(distanceKm(home, o)),
    });
  }
  return res.sort((a, b) => b.importance - a.importance);
}
