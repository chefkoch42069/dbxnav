// Wanderwege: Gehzeit, Höhenmeter und Wegmarkierung aus OSM-Tags lesbar machen.
import { fmtMinutes } from "../lib/time.js";

/** „450“, „450 m“, „1.200 m“, „1,2 km“ → Meter (oder null). */
export function parseMeters(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  const km = /km\s*$/.test(s);
  const n = parseFloat(s.replace(/\s*(km|m)\s*$/, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(km ? n * 1000 : n);
}

/**
 * Gehzeit nach DIN 33466: 4 km/h in der Ebene, 300 Hm/h bergauf, 500 Hm/h bergab.
 * Die kleinere der beiden Zeiten (Strecke, Höhe) zählt nur zur Hälfte.
 */
export function walkHours(km, ascent = 0, descent = 0) {
  if (!km) return null;
  const flat = km / 4;
  const vert = (ascent || 0) / 300 + (descent || 0) / 500;
  return Math.max(flat, vert) + Math.min(flat, vert) / 2;
}

export function fmtHours(h) {
  if (h == null) return null;
  return fmtMinutes(Math.round(h * 4) * 15); // auf Viertelstunden, gleiche Schreibweise wie überall
}

const COLORS = { red: "rot", blue: "blau", yellow: "gelb", green: "grün", white: "weiß", black: "schwarz", orange: "orange", purple: "lila", brown: "braun", gray: "grau", grey: "grau" };
const SHAPES = {
  bar: "Balken", stripe: "Streifen", cross: "Kreuz", x: "Andreaskreuz", triangle: "Dreieck", dot: "Punkt", circle: "Kreis",
  diamond: "Raute", rectangle: "Rechteck", lower: "Winkel unten", corner: "Ecke", arch: "Bogen", hiker: "Wanderer", pointer: "Pfeil",
  wolfshook: "Wolfsangel", shell: "Muschel", hexagon: "Sechseck", turned_T: "umgedrehtes T", L: "L", backslash: "Schrägstrich",
};

/** osmc:symbol „red:white:red_bar:X1:black“ → „rot Balken auf weiß, Text „X1““. */
export function symbolText(sym) {
  if (!sym) return null;
  const [, bg, fg, text] = String(sym).split(":");
  const bgColor = COLORS[(bg || "").split("_")[0]];
  let shape = null;
  if (fg) {
    const [c, ...rest] = fg.split("_");
    const s = rest.join("_");
    shape = [COLORS[c], SHAPES[s] || (s ? s.replace(/_/g, " ") : null)].filter(Boolean).join(" ") || null;
  }
  const parts = [shape && bgColor ? `${shape} auf ${bgColor}` : shape || (bgColor ? `Hintergrund ${bgColor}` : null), text ? `Text „${text}“` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Gesamtlänge von Linien ([[lat, lon], …]) in km. */
export function linesKm(lines, distanceKm) {
  let km = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) km += distanceKm({ lat: l[i - 1][0], lon: l[i - 1][1] }, { lat: l[i][0], lon: l[i][1] });
  return km;
}
