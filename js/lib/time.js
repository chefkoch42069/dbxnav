// Zeit-Helfer. Alle Fahrplanzeiten kommen als UTC-ISO-Strings, angezeigt wird deutsche Zeit.
const TZ = "Europe/Berlin";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

function berlinParts(ts) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(ts))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute };
}

/** Versatz von Europe/Berlin gegenüber UTC in Minuten zum Zeitpunkt ts. */
export function berlinOffsetMinutes(ts) {
  const p = berlinParts(ts);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - Math.floor(ts / 60000) * 60000) / 60000);
}

/** 'YYYY-MM-DD' + 'HH:MM' (deutsche Ortszeit) → UTC-ISO-String. */
export function berlinToISO(date, time = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let ts = naive;
  for (let i = 0; i < 3; i++) ts = naive - berlinOffsetMinutes(ts) * 60000;
  return new Date(ts).toISOString();
}

/** UTC-ISO → 'HH:MM' in deutscher Zeit. */
export function fmtTime(iso) {
  if (!iso) return "–";
  const p = berlinParts(Date.parse(iso));
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}

/** UTC-ISO → 'YYYY-MM-DD' in deutscher Zeit. */
export function berlinDate(iso) {
  const p = berlinParts(Date.parse(iso));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function fmtDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("de-DE", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function todayBerlin() {
  return berlinDate(new Date().toISOString());
}

/** Sekunden → '2 h 05 min'. */
export function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return "–";
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return `${h} h ${String(r).padStart(2, "0")} min`;
}

export function diffSec(aIso, bIso) {
  return (Date.parse(bIso) - Date.parse(aIso)) / 1000;
}

/** Nächster Samstag (oder heute, wenn Samstag) – Startwert für Wochenendtrips. */
export function nextWeekday(date, weekday /* 0=So … 6=Sa */) {
  const [y, m, d] = date.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, (weekday - cur + 7) % 7);
}
