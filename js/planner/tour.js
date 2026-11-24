// Mehrtagestour / Wochenende: Tagesetappen aus echten Verbindungen bauen.
import { addDays, berlinToISO } from "../lib/time.js";
import { pickBest, pickLatest, DTICKET_RULES } from "./dticket.js";
import { chooseCut, truncateItinerary } from "./stages.js";

export const placeOf = (p) => ({ name: p.name, lat: p.lat, lon: p.lon, stopId: p.stopId });

/**
 * @param params {start, stops:[{place,nights}], roundtrip, startDate, departTime, maxHours}
 * @param api    {plan(from,to,isoTime,opts) → itineraries[]}
 * @param onProgress optional callback(days)
 * @param rules      Regel-Paket (D-Ticket oder Interrail): was erlaubt ist, welche Verkehrsmittel
 */
export async function planTour(params, api, onProgress = () => {}, rules = DTICKET_RULES) {
  const { start, stops, roundtrip, startDate, departTime = "08:00", maxHours = 6 } = params;
  const maxSec = maxHours * 3600;
  const targets = stops.map((s) => ({ place: s.place, nights: Math.max(1, s.nights ?? 1) }));
  if (roundtrip) targets.push({ place: start, nights: 0, home: true });
  else if (targets.length) targets[targets.length - 1].nights = targets[targets.length - 1].nights || 0;

  const days = [];
  let cur = placeOf(start);
  let date = startDate;

  for (let ti = 0; ti < targets.length; ti++) {
    const t = targets[ti];
    const isLast = ti === targets.length - 1;
    let guard = 0;
    while (guard++ < 10) {
      const its = await api.plan(cur, t.place, berlinToISO(date, departTime), { ...rules.planOpts });
      const it = pickBest(its, rules.checkItinerary);
      if (!it) {
        days.push({ date, from: cur, to: placeOf(t.place), error: "Keine D-Ticket-Verbindung gefunden", reachedTarget: true, overnight: isLast ? null : placeOf(t.place) });
        cur = placeOf(t.place);
        date = addDays(date, isLast ? 1 : t.nights);
        onProgress(days);
        break;
      }
      // Kleine Überschreitung (bis 15 %, max. 45 min) lieber in Kauf nehmen als 20 min vor dem Ziel zu übernachten.
      const slack = Math.min(45 * 60, maxSec * 0.15);
      // Nachtzug (Interrail): ganze Verbindung an einem Stück, geschlafen wird im Zug.
      const night = rules.wholeDay(it);
      if (it.duration <= maxSec + slack || night) {
        const stayNights = isLast ? 0 : t.nights;
        days.push({ date, from: cur, to: placeOf(t.place), itinerary: it, reachedTarget: true, slightlyOver: !night && it.duration > maxSec, nightTrain: night, overnight: isLast ? null : placeOf(t.place), nights: stayNights });
        cur = placeOf(t.place);
        date = addDays(date, Math.max(1, stayNights));
        onProgress(days);
        break;
      }
      const choice = chooseCut(it, maxSec);
      if (!choice) {
        // Schon der erste Zug dauert länger als das Tageslimit – trotzdem ganz fahren.
        days.push({ date, from: cur, to: placeOf(t.place), itinerary: it, reachedTarget: true, overLimit: true, overnight: isLast ? null : placeOf(t.place), nights: isLast ? 0 : t.nights });
        cur = placeOf(t.place);
        date = addDays(date, Math.max(1, isLast ? 1 : t.nights));
        onProgress(days);
        break;
      }
      const part = truncateItinerary(it, choice.cut);
      const stop = placeOf(choice.cut.place);
      days.push({
        date, from: cur, to: stop, itinerary: part, reachedTarget: false, finalTarget: placeOf(t.place),
        overnight: stop, nights: 1,
        alternatives: choice.candidates.slice(0, 6).map((c) => ({ place: placeOf(c.place), arrival: c.arrival, type: c.type })),
      });
      cur = stop;
      date = addDays(date, 1);
      onProgress(days);
    }
  }
  return days;
}

/** Ankunft des letzten Fahrzeugs (ohne Fußweg am Ende, der bei arriveBy an die Wunschzeit geklebt wird). */
export function transitArrival(it) {
  const legs = it.legs.filter((l) => l.mode !== "WALK");
  return (legs[legs.length - 1] || it).endTime;
}

/** Späteste Abfahrt, um am selben Tag (bis deadline) anzukommen. */
export async function latestDeparture(from, to, date, api, deadline = "23:59", rules = DTICKET_RULES) {
  const its = await api.plan(from, to, berlinToISO(date, deadline), { ...rules.planOpts, arriveBy: true, numItineraries: 5 });
  return pickLatest(its, rules.checkItinerary);
}
