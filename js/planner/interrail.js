// Interrail Global Pass: welche Abschnitte gehen mit dem Pass, wo ist Reservierung Pflicht,
// wie viele Reisetage braucht eine Tour, welcher Pass passt?
import { INTERRAIL } from "../config.js";
import { lineName } from "./dticket.js";

import { OWN_WAY as NON_TRANSIT } from "../lib/legs.js";
const CITY = new Set(["SUBWAY", "TRAM", "BUS", "METRO", "CABLE_CAR", "FUNICULAR", "AREAL_LIFT", "ODM", "FLEX"]);
const NEVER = new Set(["COACH", "AIRPLANE"]);
const FAST = new Set(["HIGHSPEED_RAIL", "LONG_DISTANCE"]);

/**
 * @param countryOf (lat, lon) → ISO-Code oder null
 * @param home      Wohnland (Pass dort nur für Hin- und Rückreise)
 */
export function makeInterrailRules({ countryOf, home = INTERRAIL.defaultHome, allowNight = true, avoidReservation = false, cfg = INTERRAIL } = {}) {
  const inPass = new Set(cfg.countries);
  const resv = new Set(cfg.reservationCountries);
  const ctry = (p) => (p && countryOf ? countryOf(p.lat, p.lon) : null);

  function checkLeg(leg) {
    const mode = leg.mode;
    if (NON_TRANSIT.has(mode)) return { ok: true, level: "ok" };
    if (NEVER.has(mode)) return { ok: false, level: "no", note: "Fernbus/Flug – nicht im Pass" };
    const who = `${leg.agencyName || ""} ${lineName(leg)}`;
    if (cfg.notCovered.test(who)) return { ok: false, level: "no", note: "Privatbahn – nicht im Interrail-Pass" };
    if (CITY.has(mode)) return { ok: true, level: "info", note: "Stadtverkehr/Bus – nicht im Pass, eigene Fahrkarte" };
    if (mode === "FERRY") return { ok: true, level: "warn", note: "Fähre – nur einzelne Fährlinien im Pass" };
    const a = ctry(leg.from), b = ctry(leg.to);
    if ((a || b) && !inPass.has(a) && !inPass.has(b)) return { ok: false, level: "no", note: "Außerhalb des Pass-Gebiets" };
    if (mode === cfg.nightMode) {
      if (!allowNight) return { ok: false, level: "no", note: "Nachtzug (abgewählt)" };
      return { ok: true, level: "warn", note: "Nachtzug – Reservierung Pflicht (Sitz, Liege- oder Schlafwagen)" };
    }
    const resCountry = [a, b].find((c) => resv.has(c));
    const needsRes = FAST.has(mode) && (resCountry || /eurostar/i.test(who));
    if (needsRes) {
      if (avoidReservation) return { ok: false, level: "no", note: "Reservierungspflichtig (abgewählt)" };
      return { ok: true, level: "warn", note: `Reservierung Pflicht${resCountry ? ` (wegen ${resCountry})` : ""} – gegen Aufpreis` };
    }
    if (a && a === home && b === home) return { ok: true, level: "info", note: "Im Wohnland: Pass nur am ersten/letzten Reisetag" };
    return { ok: true, level: "ok" };
  }

  function checkItinerary(it) {
    const notes = [];
    let ok = true;
    for (const leg of it.legs) {
      const r = checkLeg(leg);
      if (!r.ok) ok = false;
      if (r.note && r.level !== "info") notes.push(`${lineName(leg)}: ${r.note}`);
    }
    return { ok, notes };
  }

  return {
    id: "interrail",
    label: "Interrail Global Pass",
    home,
    checkLeg,
    checkItinerary,
    countryOf: ctry,
    planOpts: { modes: allowNight ? [...cfg.modes, cfg.nightMode] : cfg.modes, useIcExceptions: false },
    // Nachtzug: ganze Verbindung an einem Stück, Übernachtung im Zug
    wholeDay: (it) => allowNight && it.legs.some((l) => l.mode === cfg.nightMode),
    latestHint: allowNight ? "Tipp: Ein Nachtzug spart eine Übernachtung." : "",
    verifyTitle: "Verbindung bei bahn.de (Europa) prüfen; Reservierungen über die Rail-Planner-App",
  };
}

/** Pass-Abschnitte einer Verbindung (Bahn, nicht Stadtverkehr/Fußweg). */
export function passLegs(it, rules) {
  return it.legs.filter((l) => !NON_TRANSIT.has(l.mode) && !CITY.has(l.mode) && rules.checkLeg(l).ok);
}

/** Reisetage einer Tour: Tage mit mindestens einer Pass-Fahrt (Nachtzug zählt als ein Tag). */
export function travelDays(days, rules) {
  return days.filter((d) => d.itinerary && passLegs(d.itinerary, rules).length).length;
}

/** Wohnland-Regel: Fahrten nur im Wohnland sind nur am ersten und letzten Reisetag im Pass. */
export function homeViolations(days, rules) {
  const travel = days.map((d, i) => ({ d, i })).filter(({ d }) => d.itinerary && passLegs(d.itinerary, rules).length);
  if (travel.length <= 2) return [];
  const middle = travel.slice(1, -1);
  return middle
    .filter(({ d }) => passLegs(d.itinerary, rules).some((l) => rules.countryOf(l.from) === rules.home && rules.countryOf(l.to) === rules.home))
    .map(({ i }) => i);
}

/**
 * Passende Pass-Variante.
 * @returns {{kind:'flexi'|'continuous', days:number, within?:number, label:string} | null}
 */
export function recommendPass(nTravel, spanDays, cfg = INTERRAIL) {
  if (nTravel <= 0) return null;
  const f = cfg.flexi.find((p) => p.days >= nTravel && p.within >= spanDays);
  const c = cfg.continuous.find((d) => d >= spanDays);
  // Wer fast jeden Tag fährt, ist mit dem durchgehenden Pass oft günstiger dran.
  if (f && !(c && nTravel >= 0.8 * c && f.days >= 10)) {
    return { kind: "flexi", days: f.days, within: f.within, label: `Global Pass flexibel: ${f.days} Reisetage in ${f.within === 30 ? "1 Monat" : "2 Monaten"}` };
  }
  if (c) return { kind: "continuous", days: c, label: `Global Pass durchgehend: ${c} Tage` };
  return null;
}
