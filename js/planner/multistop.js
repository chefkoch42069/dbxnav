// Reise mit mehreren Zwischenstopps: Etappe für Etappe planen,
// an jedem Stopp die gewünschte Aufenthaltszeit einhalten.
import { pickBest, checkItinerary } from "./dticket.js";
import { addMinutes } from "../lib/time.js";


/** Ankunft des letzten Fahrzeugs (Fußweg am Ende zählt zur Ankunft, falls vorhanden). */
const arrivalOf = (it) => it.endTime;

/**
 * @param from, to       Start und Ziel
 * @param stops          [{ place, stayMin }]
 * @param startIso       früheste Abfahrt
 * @param api.plan(from, to, iso, opts) → itineraries[]
 * @returns {Promise<{segments:Array, arrival:string|null, totalStayMin:number, ok:boolean}>}
 */
export async function planMultiStop({ from, to, stops = [], startIso, opts = {} }, api, check = checkItinerary) {
  const points = [from, ...stops.map((s) => s.place), to];
  const segments = [];
  let departAt = startIso;
  let ok = true;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    let its = [];
    let error = null;
    try {
      its = await api.plan(a, b, departAt, opts);
    } catch (e) {
      error = e.message || String(e);
    }
    const it = pickBest(its, check);
    if (!it) {
      ok = false;
      segments.push({ from: a, to: b, departAt, itinerary: null, error: error || "Keine Verbindung mit dem D-Ticket gefunden" });
      break; // ohne diese Etappe stimmen alle folgenden Zeiten nicht
    }
    const stay = i < stops.length ? stops[i].stayMin : 0;
    const arrive = arrivalOf(it);
    segments.push({ from: a, to: b, departAt, itinerary: it, arrive, stayMin: stay, leaveAt: i < stops.length ? addMinutes(arrive, stay) : null });
    departAt = addMinutes(arrive, stay);
  }
  return {
    segments,
    ok,
    arrival: ok ? segments[segments.length - 1].arrive : null,
    totalStayMin: stops.reduce((s, x) => s + (x.stayMin || 0), 0),
  };
}
