// Transitous (MOTIS 2) – Verbindungen, Abfahrten, Erreichbarkeit. Nur Nahverkehr.
import { TRANSITOUS, IC_EXCEPTIONS } from "../config.js";
import { getJSON } from "./http.js";

const B = TRANSITOUS.base;
const ll = (p) => p.stopId || `${p.lat},${p.lon}`;
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();

export async function geocode(text, { signal } = {}) {
  const res = await getJSON(`${B}/api/v1/geocode?${qs({ text, language: "de" })}`, { signal });
  return (res || [])
    .filter((x) => x.type === "STOP" || x.type === "PLACE" || x.type === "ADDRESS")
    .map((x) => ({
      name: x.name, lat: x.lat, lon: x.lon, type: x.type,
      stopId: x.type === "STOP" ? x.id : undefined,
      area: (x.areas || []).find((a) => a.default)?.name || "",
      state: (x.areas || []).find((a) => a.adminLevel === 4)?.name || "",
      rail: (x.modes || []).some((m) => /RAIL|SUBURBAN/.test(m)),
      modes: x.modes || [],
    }));
}

export async function reverseStop(lat, lon) {
  const res = await getJSON(`${B}/api/v1/reverse-geocode?${qs({ place: `${lat},${lon}`, type: "STOP" })}`);
  const x = res?.[0];
  return x ? { name: x.name, lat: x.lat, lon: x.lon, stopId: x.id } : null;
}

/** Verbindungen. IC-Ausnahmen: zusätzlich Fernverkehr anfragen, dann wird gefiltert. */
export async function plan(from, to, isoTime, { arriveBy = false, numItineraries = 4, useIcExceptions = true, modes: modeList = null } = {}) {
  const modes = modeList ? [...modeList] : [...TRANSITOUS.dticketModes];
  if (!modeList && useIcExceptions && IC_EXCEPTIONS.length) modes.push("LONG_DISTANCE");
  const res = await getJSON(
    `${B}/api/v5/plan?${qs({
      fromPlace: ll(from), toPlace: ll(to), time: isoTime, arriveBy,
      transitModes: modes.join(","), maxTransfers: TRANSITOUS.maxTransfers,
      numItineraries, maxTravelTime: 24 * 60,
    })}`,
    { timeout: 45000 }
  );
  return res?.itineraries || [];
}

/**
 * Verbindungssuche mit allen Optionen und Blättern (früher/später).
 * @returns {Promise<{itineraries:Array, nextPageCursor?:string, previousPageCursor?:string}>}
 */
export async function searchConnections(from, to, isoTime, {
  arriveBy = false, pageCursor = null, via = null, maxTransfers = TRANSITOUS.maxTransfers,
  transferTimeFactor = 1, wheelchair = false, modes = TRANSITOUS.dticketModes, numItineraries = 5,
} = {}) {
  const res = await getJSON(
    `${B}/api/v5/plan?${qs({
      fromPlace: ll(from), toPlace: ll(to),
      time: pageCursor ? undefined : isoTime, arriveBy, pageCursor: pageCursor || undefined,
      via: via ? ll(via) : undefined, viaMinimumStay: via ? 0 : undefined,
      transitModes: modes.join(","), maxTransfers,
      transferTimeFactor: transferTimeFactor !== 1 ? transferTimeFactor : undefined,
      pedestrianProfile: wheelchair ? "WHEELCHAIR" : undefined,
      numItineraries, maxTravelTime: 24 * 60,
    })}`,
    { timeout: 45000 }
  );
  return { itineraries: res?.itineraries || [], nextPageCursor: res?.nextPageCursor, previousPageCursor: res?.previousPageCursor };
}

export async function oneToAll(place, isoTime, { maxMinutes = 180, arriveBy = false, maxTransfers = 4, signal, modes = TRANSITOUS.railModes } = {}) {
  return getJSON(
    `${B}/api/v1/one-to-all?${qs({
      one: `${place.lat},${place.lon}`, time: isoTime, arriveBy, maxTravelTime: maxMinutes,
      transitModes: modes.join(","), maxTransfers,
    })}`,
    { timeout: 60000, signal }
  );
}

/** Abfahrten (oder Ankünfte) an einer Haltestelle, inkl. Haltestellen im Umkreis. */
export async function stopTimes(stopId, isoTime, { n = 40, radius = 250, arriveBy = false, modes, pageCursor } = {}) {
  return getJSON(`${B}/api/v5/stoptimes?${qs({
    stopId, time: pageCursor ? undefined : isoTime, n, radius, arriveBy,
    mode: modes?.length ? modes.join(",") : undefined, pageCursor,
  })}`);
}

export async function trip(tripId) {
  return getJSON(`${B}/api/v5/trip?${qs({ tripId })}`);
}
