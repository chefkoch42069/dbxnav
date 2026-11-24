// Einkaufsmodus: Wann losfahren, damit man zur Ladenöffnung da ist, und wann zurück?
import { pickBest, pickLatest, checkItinerary } from "./dticket.js";
import { berlinToISO, addMinutes, diffMin } from "../lib/time.js";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DEFAULT_HOURS = { open: "10:00", close: "20:00" }; // typische Innenstadt Mo–Sa

/** Wochentag-Index 0=Mo … 6=So für 'YYYY-MM-DD'. */
export function weekdayIdx(date) {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function daySet(spec) {
  const set = new Set();
  for (const part of spec.split(",")) {
    const [a, b] = part.trim().split("-");
    const i = DAYS.indexOf(a), j = b ? DAYS.indexOf(b) : i;
    if (i < 0 || j < 0) return null;
    for (let k = i; ; k = (k + 1) % 7) { set.add(k); if (k === j) break; }
  }
  return set;
}

/**
 * Einfache OSM-opening_hours für einen Wochentag auswerten.
 * Versteht z. B. „Mo-Sa 10:00-20:00; Su off“, „Mo-Fr 09:30-19:00; Sa 10:00-18:00“, „24/7“.
 * @returns {{open:string, close:string} | "closed" | null}  null = nicht verstanden
 */
export function hoursOn(oh, date) {
  if (!oh) return null;
  if (oh.trim() === "24/7") return { open: "00:00", close: "23:59" };
  const wd = weekdayIdx(date);
  let result = null, understood = false;
  for (const rule of oh.split(";").map((r) => r.trim()).filter(Boolean)) {
    if (/^(PH|SH)\b/.test(rule)) continue; // Feiertage/Ferien ignorieren
    const m = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? daySet(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return null;
    const times = m[2].trim();
    let value;
    if (/^(off|closed)$/i.test(times)) value = "closed";
    else {
      const ranges = [...times.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
      if (!ranges.length) return null;
      const pad = (t) => t.padStart(5, "0");
      value = { open: pad(ranges[0][1]), close: pad(ranges[ranges.length - 1][2]).replace("24:00", "23:59") };
    }
    understood = true;
    if (days.has(wd)) result = value; // spätere Regeln überschreiben frühere
  }
  if (!understood) return null;
  return result || "closed";
}

/**
 * Plan für einen Einkaufstag.
 * @param p { home, dest, date, open, close, shopMinutes (null = bis Ladenschluss), bufferMin }
 * @returns {Promise<object>} outbound, shopStart, shopEnd, inbound, latestReturn, notes[]
 */
export async function planShopping(p, api, check = checkItinerary) {
  const { home, dest, date, open, close, shopMinutes = null, bufferMin = 10, opts = {} } = p;
  const notes = [];
  const openIso = berlinToISO(date, open), closeIso = berlinToISO(date, close);

  // Hinfahrt: späteste Verbindung, die (mit Fußweg-Puffer) zur Öffnung ankommt
  let outbound = pickLatest(await api.plan(home, dest, addMinutes(openIso, -bufferMin), { ...opts, arriveBy: true }), check);
  if (!outbound) {
    outbound = pickBest(await api.plan(home, dest, berlinToISO(date, "05:00"), opts), check);
    if (outbound) notes.push("Zur Ladenöffnung ist keine Ankunft möglich – frühestmögliche Verbindung gewählt.");
  }
  if (!outbound) return { ok: false, notes: ["Keine Hinfahrt mit dem D-Ticket gefunden."] };

  const arriveShops = addMinutes(outbound.endTime, bufferMin);
  const shopStart = Date.parse(arriveShops) > Date.parse(openIso) ? arriveShops : openIso;
  let shopEnd = shopMinutes == null ? closeIso : addMinutes(shopStart, shopMinutes);
  if (Date.parse(shopEnd) > Date.parse(closeIso)) {
    shopEnd = closeIso;
    if (shopMinutes != null) notes.push("Gewünschte Einkaufszeit passt nicht ganz – Läden schließen vorher.");
  }

  // Letzte Rückfahrt des Tages (für die Warnung) und beste Rückfahrt nach dem Einkaufen
  const latestReturn = pickLatest(await api.plan(dest, home, berlinToISO(date, "23:59"), { ...opts, arriveBy: true }), check);
  let inbound = pickBest(await api.plan(dest, home, addMinutes(shopEnd, bufferMin), opts), check);
  if (inbound && latestReturn && Date.parse(inbound.startTime) > Date.parse(latestReturn.startTime)) inbound = null;
  if (!inbound && latestReturn) {
    inbound = latestReturn;
    shopEnd = addMinutes(latestReturn.startTime, -bufferMin);
    notes.push("Nach Ladenschluss fährt nichts mehr zurück – Einkaufszeit verkürzt bis zur letzten Verbindung.");
  }
  if (!inbound) return { ok: false, outbound, shopStart, notes: [...notes, "Keine Rückfahrt mit dem D-Ticket am selben Tag gefunden."] };

  const shopMin = Math.max(0, diffMin(shopStart, shopEnd));
  const waitBeforeOpen = Math.max(0, diffMin(arriveShops, openIso));
  if (waitBeforeOpen > 0) notes.push(`Du bist ${waitBeforeOpen} min vor Ladenöffnung da – Zeit für einen Kaffee.`);
  return { ok: true, outbound, inbound, latestReturn, shopStart, shopEnd, shopMin, openIso, closeIso, notes };
}

export { DEFAULT_HOURS };
