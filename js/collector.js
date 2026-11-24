// Strecken- und Bundesländer-Sammler.
import { state, persist } from "./state.js";
import { uid } from "./lib/store.js";
import { legPoints, encodePolyline, decodePolyline } from "./lib/polyline.js";
import { simplify, statesAlong } from "./lib/geo.js";
import { berlinDate } from "./lib/time.js";
import { lineName } from "./planner/dticket.js";
import { rideLegs } from "./lib/legs.js";
import { loadStates } from "./ui/statesData.js";


export async function addItineraryToCollector(it) {
  const fc = await loadStates();
  let added = 0;
  for (const leg of rideLegs(it)) {
    const pts = simplify(legPoints(leg), 0.0008);
    const key = `${leg.tripId || lineName(leg)}|${leg.from.name}|${leg.to.name}|${berlinDate(leg.startTime)}`;
    if (state.collector.legs.some((l) => l.key === key)) continue;
    state.collector.legs.unshift({
      id: uid(), key, line: lineName(leg).replace(/\s*\(\d+\)$/, ""), mode: leg.mode,
      from: leg.from.name, to: leg.to.name, date: berlinDate(leg.startTime),
      km: Math.round((leg.distance || 0) / 1000) || null,
      poly: encodePolyline(pts, 5), states: statesAlong(pts, fc, 2),
    });
    added++;
  }
  persist("collector");
  return added;
}

export function legCoords(l) {
  return decodePolyline(l.poly, 5);
}

/** Besuchte Bundesländer: automatisch aus Fahrten + manuell abgehakt (manuell kann auch abwählen). */
export function visitedStates() {
  const auto = new Set(state.collector.legs.flatMap((l) => l.states || []));
  const out = new Set(auto);
  for (const [id, v] of Object.entries(state.collector.manualStates || {})) {
    if (v === true) out.add(id);
    if (v === false) out.delete(id);
  }
  return { all: out, auto };
}

export function setManualState(id, value) {
  state.collector.manualStates ||= {};
  state.collector.manualStates[id] = value;
  persist("collector");
}
