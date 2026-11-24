// Etappen nach Fahrzeit: eine lange Verbindung an einem sinnvollen Ort für die Nacht teilen.
import { decodePolyline, encodePolyline } from "../lib/polyline.js";
import { nearestIndex } from "../lib/geo.js";
import { diffSec } from "../lib/time.js";

const isTransit = (l) => !["WALK", "BIKE", "CAR", "RENTAL"].includes(l.mode);

/**
 * Mögliche Übernachtungsorte innerhalb von maxSec ab Reisebeginn.
 * Umstiegsbahnhöfe (Ende eines Zugabschnitts) und Zwischenhalte.
 * Neueste zuerst.
 */
export function cutCandidates(it, maxSec) {
  const t0 = it.startTime;
  const out = [];
  it.legs.forEach((leg, li) => {
    if (!isTransit(leg)) return;
    (leg.intermediateStops || []).forEach((s, si) => {
      const t = s.arrival || s.scheduledArrival;
      if (!t) return;
      const el = diffSec(t0, t);
      if (el <= maxSec) out.push({ type: "halt", legIndex: li, stopIndex: si, place: s, arrival: t, elapsed: el, importance: s.importance || 0 });
    });
    const last = li === it.legs.length - 1 || !it.legs.slice(li + 1).some(isTransit);
    if (last) return; // Ziel ist kein Zwischenstopp
    const el = diffSec(t0, leg.endTime);
    if (el <= maxSec) out.push({ type: "umstieg", legIndex: li, stopIndex: -1, place: leg.to, arrival: leg.endTime, elapsed: el, importance: leg.to.importance || 0 });
  });
  return out.sort((a, b) => b.elapsed - a.elapsed);
}

/**
 * Wählt den Übernachtungsort: bevorzugt der späteste Umstiegsbahnhof.
 * Liegt der zu früh (< 60 % des Limits), wird ein späterer, möglichst
 * wichtiger Zwischenhalt genommen.
 */
export function chooseCut(it, maxSec) {
  const cands = cutCandidates(it, maxSec);
  if (!cands.length) return null;
  const transfer = cands.find((c) => c.type === "umstieg");
  if (transfer && transfer.elapsed >= 0.6 * maxSec) return { cut: transfer, candidates: cands };
  const late = cands.filter((c) => c.elapsed >= 0.6 * maxSec && c.type === "halt");
  if (late.length) {
    const best = late.reduce((a, b) => (b.importance > a.importance * 1.5 ? b : a));
    return { cut: best, candidates: cands };
  }
  return { cut: transfer || cands[0], candidates: cands };
}

/** Kürzt eine Verbindung bis zum gewählten Übernachtungsort. */
export function truncateItinerary(it, cut) {
  const legs = it.legs.slice(0, cut.legIndex + 1).map((l) => ({ ...l }));
  const leg = legs[cut.legIndex];
  if (cut.type === "halt") {
    const stop = cut.place;
    leg.intermediateStops = (leg.intermediateStops || []).slice(0, cut.stopIndex);
    leg.to = { ...stop, departure: undefined };
    leg.endTime = cut.arrival;
    if (leg.legGeometry?.points) {
      const prec = leg.legGeometry.precision ?? 6;
      const pts = decodePolyline(leg.legGeometry.points, prec);
      const idx = nearestIndex(pts, stop.lat, stop.lon);
      leg.legGeometry = { ...leg.legGeometry, points: encodePolyline(pts.slice(0, idx + 1), prec) };
    }
  }
  const endTime = leg.endTime;
  return {
    ...it,
    legs,
    endTime,
    duration: diffSec(it.startTime, endTime),
    transfers: Math.max(0, legs.filter(isTransit).length - 1),
    truncated: true,
  };
}
