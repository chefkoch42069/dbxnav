// Abfahrtstafel: Abfahrten aufbereiten und nach Verkehrsmittel gruppieren.
import { checkDeparture } from "./dticket.js";

export const MODE_GROUPS = {
  zug: { label: "Regionalzug", modes: ["REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "RAIL"] },
  sbahn: { label: "S-Bahn", modes: ["SUBURBAN"] },
  ubahn: { label: "U-Bahn", modes: ["SUBWAY", "METRO"] },
  tram: { label: "Tram", modes: ["TRAM", "CABLE_CAR", "FUNICULAR", "AREAL_LIFT"] },
  bus: { label: "Bus", modes: ["BUS", "ODM"] },
  faehre: { label: "Fähre", modes: ["FERRY"] },
  fern: { label: "Fernverkehr", modes: ["LONG_DISTANCE", "HIGHSPEED_RAIL", "NIGHT_RAIL", "COACH"] },
};

export function groupOf(mode) {
  for (const [k, g] of Object.entries(MODE_GROUPS)) if (g.modes.includes(mode)) return k;
  return "bus";
}

/** Abfahrten anreichern; doppelte (gleiche Fahrt) entfernen. */
export function prepareDepartures(stopTimes, { showLongDistance = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const st of stopTimes || []) {
    const id = `${st.tripId}|${st.place?.departure}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const check = checkDeparture(st);
    if (!check.ok && !showLongDistance) continue;
    out.push({
      ...st,
      group: groupOf(st.mode),
      dticket: check,
      time: st.place?.departure || st.place?.scheduledDeparture,
      scheduled: st.place?.scheduledDeparture,
      delayMin: st.realTime && st.place?.departure && st.place?.scheduledDeparture
        ? Math.round((Date.parse(st.place.departure) - Date.parse(st.place.scheduledDeparture)) / 60000) : null,
      track: st.place?.track || st.place?.scheduledTrack || null,
      stopName: st.place?.name,
    });
  }
  return out.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
