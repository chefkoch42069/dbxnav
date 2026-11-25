// Farbskala für Fahrzeiten, passend zur gewählten Höchstdauer (auch bei 15 oder 30 Minuten).
import { el } from "./dom.js";
import { fmtMinutes } from "../lib/time.js";

const RAMP = ["#1e7b45", "#7cb342", "#f2a900", "#ef6c00", "#c62828"];
// Zweite Codierung neben der Farbe (WCAG 1.4.1): kurze Fahrt = dicke Linie
const WEIGHTS = [6, 5, 4, 3, 2.5];

/** Schwellen in Minuten: vier gleich große Stufen bis maxMin, auf 5 Minuten gerundet. */
export function thresholds(maxMin) {
  const round = (v) => Math.max(5, Math.round(v / 5) * 5);
  return [0.25, 0.5, 0.75, 1].map((f) => round(maxMin * f)).filter((v, i, a) => a.indexOf(v) === i);
}

export function timeScale(maxMin) {
  const th = thresholds(maxMin);
  const step = (min) => { const i = th.findIndex((t) => min <= t); return i < 0 ? RAMP.length - 1 : Math.min(i, RAMP.length - 1); };
  const color = (min) => RAMP[step(min)];
  const weight = (min) => WEIGHTS[step(min)];
  // Legende zeigt Farbe UND Linienstärke, damit sie auch ohne Farbsehen lesbar ist
  const swatch = (i) => el("i", { class: "legend-weight", "aria-hidden": "true", style: { background: RAMP[i], height: `${WEIGHTS[i]}px`, borderRadius: "1px" } });
  const legend = () => el("div", { class: "legend small" },
    ...th.map((t, i) => el("span", { style: { marginRight: "8px", whiteSpace: "nowrap" } }, swatch(i), `≤ ${fmtMinutes(t)}`)),
    el("span", { style: { whiteSpace: "nowrap" } }, swatch(RAMP.length - 1), "länger"),
    el("span", { class: "muted", style: { display: "block", marginTop: "2px" } }, "Je dicker die Linie, desto kürzer die Fahrt. Minuten stehen an den Linienenden."));
  return { color, weight, legend, thresholds: th };
}
