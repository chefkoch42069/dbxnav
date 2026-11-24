// Karte mit Ebenen-Umschalter: Grundkarte wählbar, Zusatzebenen zuschaltbar, Quellenhinweis je Ebene.
import { BASE_LAYERS, OVERLAY_LAYERS, RAIN_RADAR } from "../config.js";
import { state, setPref } from "../state.js";
import { legPoints } from "../lib/polyline.js";
import { groupOf } from "../planner/departures.js";

export let map;
export const groups = {};
const bases = {};
export let currentBase = null;
let overlays = {};

/** Kartenebene per Name einschalten (z. B. „Wanderwege“). */
export function showOverlay(name) {
  if (overlays[name] && !map.hasLayer(overlays[name])) overlays[name].addTo(map);
}

const MODE_COLORS = { zug: "#b3261e", sbahn: "#008d4f", ubahn: "#1b4f9c", tram: "#c2185b", bus: "#6a3d9a", faehre: "#00809d", fern: "#6b7280" };
export const DAY_COLORS = ["#0f5132", "#2f6db3", "#b26a00", "#8e24aa", "#c62828", "#00838f", "#5d4037", "#ad1457"];

export function initMap() {
  map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([51.1, 10.4], 6);
  for (const [name, cfg] of Object.entries(BASE_LAYERS)) bases[name] = L.tileLayer(cfg.url, cfg.options);
  const wanted = state.prefs.baseLayer && bases[state.prefs.baseLayer] ? state.prefs.baseLayer : Object.keys(bases)[0];
  bases[wanted].addTo(map);
  currentBase = wanted;

  overlays = {};
  for (const [name, cfg] of Object.entries(OVERLAY_LAYERS)) overlays[name] = L.tileLayer(cfg.url, cfg.options);
  overlays["Regenradar (DWD)"] = L.tileLayer.wms(RAIN_RADAR.url, RAIN_RADAR.options);

  for (const g of ["route", "places", "lodging", "daytrip", "collector", "trip", "countries"]) groups[g] = L.layerGroup();
  groups.countries.addTo(map);
  for (const g of ["route", "places", "lodging", "daytrip", "trip"]) groups[g].addTo(map);
  overlays["Route"] = groups.route;
  overlays["Bahnhofs-Infos & Ausflugsziele"] = groups.places;
  overlays["Unterkünfte"] = groups.lodging;
  overlays["Tagestrip-Ziele"] = groups.daytrip;
  overlays["Gefahrene Strecken"] = groups.collector;
  overlays["Fahrt (Abfahrtstafel)"] = groups.trip;
  overlays["Interrail-Länder"] = groups.countries;

  L.control.layers(bases, overlays, { collapsed: true }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  map.on("baselayerchange", (e) => { currentBase = e.name; setPref("baseLayer", e.name); });
  return map;
}

export function pinIcon(label = "", color) {
  return L.divIcon({
    className: "",
    html: `<div class="map-pin" style="${color ? `background:${color}` : ""}"><span>${String(label).replace(/[<>&"]/g, "")}</span></div>`,
    iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
  });
}

/** Verbindung zeichnen. Farbe pro Tag oder je Verkehrsmittel. */
export function drawItinerary(it, layer, { color, weight = 5 } = {}) {
  const all = [];
  for (const leg of it.legs) {
    const pts = legPoints(leg);
    all.push(...pts);
    const walk = leg.mode === "WALK";
    L.polyline(pts, {
      color: walk ? "#666" : color || MODE_COLORS[groupOf(leg.mode)],
      weight: walk ? 3 : weight, opacity: walk ? 0.7 : 0.9, dashArray: walk ? "4 6" : null,
    }).addTo(layer);
  }
  return all;
}

// Auf dem Handy liegt die Seitenleiste unten über der Karte: diesen Bereich frei lassen.
function panelCover() {
  const panel = document.getElementById("panel");
  if (window.innerWidth > 760 || !panel || panel.classList.contains("collapsed")) return 0;
  return panel.offsetHeight;
}

export function fitPoints(points, maxZoom = 13) {
  if (!points.length) return;
  const cover = panelCover();
  map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [30, 30], paddingBottomRight: [30, 30 + cover], maxZoom });
}

/** Wie setView, aber auf dem Handy in den sichtbaren Kartenteil über der Leiste. */
export function focusOn(lat, lon, zoom = map.getZoom()) {
  const cover = panelCover();
  if (!cover) return map.setView([lat, lon], zoom);
  const pt = map.project([lat, lon], zoom).add([0, cover / 2]);
  map.setView(map.unproject(pt, zoom), zoom);
}

// „3“ → „Gl. 3“, aber „Pos. 11“ (Tram-/Bussteig) bleibt, wie es ist.
export const trackLabel = (t) => {
  if (!t) return "";
  const s = String(t).replace(/^Gl\.?\s*/i, "");
  return /^\d/.test(s) ? `Gl. ${s}` : s;
};

export function popupContent(nodes) {
  const div = document.createElement("div");
  div.append(...[nodes].flat());
  return div;
}
