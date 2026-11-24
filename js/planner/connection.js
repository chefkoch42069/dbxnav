// Verbindungssuche von A nach B: Ergebnisse aufbereiten, zusammenführen, mit Fernverkehr vergleichen.
import { TRANSITOUS } from "../config.js";
import { checkItinerary, lineName } from "./dticket.js";
import { groupOf } from "./departures.js";
import { rideLegs, isWalk } from "../lib/legs.js";

const RAIL_ONLY = ["REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "SUBURBAN"];
const FERN = ["HIGHSPEED_RAIL", "LONG_DISTANCE"];

/** Welche Verkehrsmittel angefragt werden. */
export function connectionModes({ railOnly = false, compare = false } = {}) {
  const base = railOnly ? RAIL_ONLY : TRANSITOUS.dticketModes;
  return compare ? [...base, ...FERN] : [...base];
}

/** Kompakte Zusammenfassung einer Verbindung für die Ergebnisliste. */
export function summarize(it, check = checkItinerary) {
  const ride = rideLegs(it);
  const walkSec = it.legs.filter(isWalk)
    .reduce((s, l) => s + (l.duration ?? (Date.parse(l.endTime) - Date.parse(l.startTime)) / 1000), 0);
  const c = check(it);
  return {
    id: connectionKey(it),
    dep: ride[0]?.startTime || it.startTime,
    arr: ride[ride.length - 1]?.endTime || it.endTime,
    // Dauer passend zu den angezeigten Zeiten (erstes bis letztes Fahrzeug); Fußwege separat in walkMin
    duration: ride.length ? (Date.parse(ride[ride.length - 1].endTime) - Date.parse(ride[0].startTime)) / 1000 : it.duration,
    transfers: Math.max(0, ride.length - 1),
    walkMin: Math.round(walkSec / 60),
    lines: ride.map((l) => ({ mode: l.mode, group: groupOf(l.mode), name: lineName(l).replace(/\s*\(\d+\)$/, "") })),
    ok: c.ok,
    notes: c.notes,
    cancelled: it.legs.some((l) => l.cancelled),
    realtime: it.legs.some((l) => l.realTime),
  };
}

/** Gleiche Verbindung erkennen (Seiten können sich überlappen). */
export function connectionKey(it) {
  return rideLegs(it).map((l) => `${l.tripId || lineName(l)}@${l.startTime}`).join("|") || `${it.startTime}-${it.endTime}`;
}

/** Neue Seite einsortieren: ohne Doppelte, nach Abfahrt sortiert. */
export function mergeConnections(list, more) {
  const seen = new Set(list.map(connectionKey));
  const out = [...list];
  for (const it of more) {
    const k = connectionKey(it);
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || Date.parse(a.endTime) - Date.parse(b.endTime));
}

/**
 * Vergleich D-Ticket ↔ Fernverkehr: Wie viel schneller wäre die schnellste Fernverkehrsverbindung?
 * @returns {{savedMin:number, fastest:object} | null}
 */
export function compareWithFern(itineraries, check = checkItinerary) {
  const ok = itineraries.filter((it) => check(it).ok);
  const fern = itineraries.filter((it) => !check(it).ok);
  if (!ok.length || !fern.length) return null;
  const best = (arr) => arr.reduce((a, b) => (b.duration < a.duration ? b : a));
  const d = best(ok), f = best(fern);
  const saved = Math.round((d.duration - f.duration) / 60);
  return saved > 0 ? { savedMin: saved, fastest: f } : null;
}

/** Schnellste und bequemste (wenig Umstiege) D-Ticket-Verbindung markieren. */
export function highlights(itineraries, check = checkItinerary) {
  const ok = itineraries.filter((it) => check(it).ok);
  if (!ok.length) return {};
  const fastest = ok.reduce((a, b) => (b.duration < a.duration ? b : a));
  const fewest = ok.reduce((a, b) => (b.transfers < a.transfers || (b.transfers === a.transfers && b.duration < a.duration) ? b : a));
  return { fastest: connectionKey(fastest), fewest: connectionKey(fewest) };
}
