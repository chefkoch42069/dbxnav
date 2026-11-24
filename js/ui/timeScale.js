// Farbskala für Fahrzeiten, passend zur gewählten Höchstdauer (auch bei 15 oder 30 Minuten).
import { el } from "./dom.js";
import { fmtMinutes } from "../lib/time.js";

const RAMP = ["#1e7b45", "#7cb342", "#f2a900", "#ef6c00", "#c62828"];

/** Schwellen in Minuten: vier gleich große Stufen bis maxMin, auf 5 Minuten gerundet. */
export function thresholds(maxMin) {
  const round = (v) => Math.max(5, Math.round(v / 5) * 5);
  return [0.25, 0.5, 0.75, 1].map((f) => round(maxMin * f)).filter((v, i, a) => a.indexOf(v) === i);
}

export function timeScale(maxMin) {
  const th = thresholds(maxMin);
  const color = (min) => { const i = th.findIndex((t) => min <= t); return RAMP[i < 0 ? RAMP.length - 1 : Math.min(i, RAMP.length - 1)]; };
  const legend = () => el("div", { class: "legend small" },
    ...th.map((t, i) => el("span", { style: { marginRight: "8px" } }, el("i", { style: { background: RAMP[i] } }), `≤ ${fmtMinutes(t)}`)),
    el("span", {}, el("i", { style: { background: RAMP[RAMP.length - 1] } }), "länger"));
  return { color, legend, thresholds: th };
}
