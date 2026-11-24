// Kleine Fabrik für Test-Verbindungen im Transitous-Format.
import { encodePolyline } from "../js/lib/polyline.js";

export const P = (name, lat, lon, extra = {}) => ({ name, lat, lon, ...extra });
const t = (hhmm) => `2026-11-25T${hhmm}:00Z`;

export function leg(mode, from, to, start, end, extra = {}) {
  return {
    mode, from, to, startTime: t(start), endTime: t(end),
    legGeometry: { points: encodePolyline([[from.lat, from.lon], [to.lat, to.lon]], 6), precision: 6 },
    ...extra,
  };
}

export function itin(legs) {
  const startTime = legs[0].startTime, endTime = legs[legs.length - 1].endTime;
  return {
    legs, startTime, endTime,
    duration: (Date.parse(endTime) - Date.parse(startTime)) / 1000,
    transfers: Math.max(0, legs.filter((l) => l.mode !== "WALK").length - 1),
  };
}
export { t };
