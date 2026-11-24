// Ist eine Fahrt mit dem Deutschlandticket möglich?
import { IC_EXCEPTIONS } from "../config.js";

const NEVER = new Set(["HIGHSPEED_RAIL", "NIGHT_RAIL", "COACH", "AIRPLANE"]);
const NON_TRANSIT = new Set(["WALK", "BIKE", "CAR", "RENTAL", "CAR_PARKING", "ODM", "FLEX"]);
const IC_NAME = /^(ICE|ECE|IC|EC|RJX?|NJ|EN|FLX)\s?\d*/i;

const norm = (s) => (s || "").toLowerCase().replace(/[()\s.,-]+/g, " ").replace(/\bhauptbahnhof\b/g, "hbf").trim();
const lineKey = (s) => (s || "").toUpperCase().replace(/\s+/g, "");

export function lineName(leg) {
  return leg.displayName || leg.routeShortName || leg.tripShortName || leg.mode;
}

function stationListed(name, stations) {
  const n = norm(name);
  return stations.some((s) => {
    const k = norm(s);
    return n === k || n.startsWith(k + " ") || n.includes(k);
  });
}

export function matchException(leg, exceptions = IC_EXCEPTIONS) {
  const names = [leg.routeShortName, leg.displayName].map(lineKey);
  return exceptions.find(
    (ex) =>
      ex.lines.some((l) => names.some((n) => n && n.startsWith(lineKey(l)))) &&
      stationListed(leg.from?.name, ex.stations) &&
      stationListed(leg.to?.name, ex.stations)
  );
}

/**
 * Bewertet einen Abschnitt.
 * @returns {{ok:boolean, level:'ok'|'info'|'warn'|'no', note?:string}}
 */
export function checkLeg(leg, exceptions = IC_EXCEPTIONS) {
  const mode = leg.mode;
  if (NON_TRANSIT.has(mode)) {
    if (mode === "ODM" || mode === "FLEX") return { ok: true, level: "warn", note: "Rufbus/On-Demand – Tarif vor Ort prüfen" };
    return { ok: true, level: "ok" };
  }
  if (NEVER.has(mode)) return { ok: false, level: "no", note: "Fernverkehr – nicht mit dem D-Ticket" };
  if (mode === "LONG_DISTANCE" || mode === "RAIL") {
    const ex = matchException(leg, exceptions);
    if (ex) return { ok: true, level: "warn", note: `IC-Ausnahme: ${ex.region} (${ex.checked})` };
    return { ok: false, level: "no", note: "Fernverkehr – nicht mit dem D-Ticket" };
  }
  if (mode === "FERRY") return { ok: true, level: "warn", note: "Fähre – D-Ticket gilt nur auf manchen Fähren" };
  if (IC_NAME.test(lineName(leg)) && /RAIL/.test(mode)) {
    return { ok: true, level: "info", note: "IC im Nahverkehrstarif (laut Fahrplandaten) – vor Ort prüfen" };
  }
  return { ok: true, level: "ok" };
}

export function checkItinerary(it, exceptions = IC_EXCEPTIONS) {
  const notes = [];
  let ok = true;
  for (const leg of it.legs) {
    const r = checkLeg(leg, exceptions);
    if (!r.ok) ok = false;
    if (r.note) notes.push(`${lineName(leg)}: ${r.note}`);
  }
  return { ok, notes };
}

export function transitLegs(it) {
  return it.legs.filter((l) => !NON_TRANSIT.has(l.mode) || l.mode === "ODM" || l.mode === "FLEX");
}

/** Beste D-Ticket-Verbindung: früheste Ankunft, dann wenig Umstiege. */
export function pickBest(itineraries, exceptions = IC_EXCEPTIONS) {
  const valid = (itineraries || []).filter((it) => checkItinerary(it, exceptions).ok);
  valid.sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime) || a.transfers - b.transfers);
  return valid[0] || null;
}

/** Späteste D-Ticket-Verbindung (für „letzte Verbindung“). */
export function pickLatest(itineraries, exceptions = IC_EXCEPTIONS) {
  const valid = (itineraries || []).filter((it) => checkItinerary(it, exceptions).ok);
  valid.sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime) || a.transfers - b.transfers);
  return valid[0] || null;
}

/** Für die Abfahrtstafel: Abfahrt mit D-Ticket nutzbar? */
export function checkDeparture(st, exceptions = IC_EXCEPTIONS) {
  return checkLeg({ ...st, from: st.place, to: st.tripTo }, exceptions);
}
