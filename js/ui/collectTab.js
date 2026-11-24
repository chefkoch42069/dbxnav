// Reiter „Sammler“: Bundesländer und gefahrene Strecken, als Karte mit eingefärbten Linien.
import { el, clear } from "./dom.js";
import { groups, map, focusOn } from "./map.js";
import { state, onChange, removeById } from "../state.js";
import { STATES } from "../config.js";
import { visitedStates, setManualState, legCoords } from "../collector.js";
import { loadStates } from "./statesData.js";
import { nav } from "./nav.js";
import { groupOf } from "../planner/departures.js";

const COLORS = { zug: "#b3261e", sbahn: "#008d4f", ubahn: "#1b4f9c", tram: "#c2185b", bus: "#6a3d9a", faehre: "#00809d", fern: "#6b7280" };
let root;

export function initCollectTab(container) {
  root = container;
  onChange((k) => { if (k === "collector") render(); });
  render();
}

async function render() {
  const fc = await loadStates();
  const { all, auto } = visitedStates();
  // Karte
  groups.collector.clearLayers();
  L.geoJSON(fc, {
    style: (f) => ({ color: "#0f5132", weight: 1, fillColor: all.has(f.properties.id) ? "#2e9d5b" : "#999", fillOpacity: all.has(f.properties.id) ? 0.3 : 0 }),
    onEachFeature: (f, layer) => layer.bindTooltip(f.properties.name, { sticky: true }),
    interactive: true,
  }).addTo(groups.collector);
  for (const l of state.collector.legs) {
    L.polyline(legCoords(l), { color: COLORS[groupOf(l.mode)], weight: 4, opacity: 0.9 }).bindTooltip(`${l.line}: ${l.from} → ${l.to} (${l.date})`).addTo(groups.collector);
  }

  const n = all.size;
  const stateList = el("div", { class: "states" }, Object.entries(STATES).map(([id, name]) => {
    const cb = el("input", { type: "checkbox", checked: all.has(id), onchange: (e) => setManualState(id, e.target.checked) });
    return el("label", { class: "check small" }, cb, name, auto.has(id) ? el("span", { class: "muted", title: "aus gefahrenen Strecken" }, " 🚆") : null);
  }));
  const legs = el("ul", { class: "list" }, state.collector.legs.slice(0, 200).map((l) =>
    el("li", {}, el("div", { class: "grow" }, el("strong", {}, `${l.line}: ${l.from} → ${l.to}`), el("span", { class: "muted small" }, l.date, l.km ? ` · ${l.km} km` : "")),
      el("button", { class: "btn small", onclick: () => map.fitBounds(L.latLngBounds(legCoords(l)), { padding: [30, 30] }) }, "Karte"),
      el("button", { class: "btn small", title: "entfernen", onclick: () => removeById("legs", l.id) }, "✕"))));
  const km = state.collector.legs.reduce((s, l) => s + (l.km || 0), 0);

  clear(root).append(
    el("h2", {}, "Sammler"),
    el("p", { class: "lead" }, "Welche Bundesländer und Strecken hast du schon geschafft? Wird lokal im Browser gespeichert."),
    el("strong", {}, `${n} von 16 Bundesländern`),
    el("div", { class: "progress" }, el("div", { style: { width: `${(n / 16) * 100}%` } })),
    stateList,
    el("div", { class: "btns" },
      el("button", { class: "btn primary", disabled: n >= 16, onclick: () => { nav.switchTab("plan"); nav.plan.suggestRoundtrip(); } }, "Runde durch neue Länder vorschlagen"),
      el("button", { class: "btn", onclick: () => focusOn(51.1, 10.4, 6) }, "Ganze Karte")),
    el("h3", {}, `Gefahrene Abschnitte (${state.collector.legs.length}${km ? `, ca. ${km} km` : ""})`),
    state.collector.legs.length ? legs : el("p", { class: "muted small" }, "Noch nichts. Bei einer Tour oder einem Tagestrip auf „✓ Bin ich gefahren“ tippen."),
    el("p", { class: "muted small" }, "Ländergrenzen: Natural Earth (gemeinfrei), vereinfacht."));
}
