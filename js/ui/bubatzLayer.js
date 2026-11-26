// Kartenebene „Bubatzkarte“: Konsumverbotszonen, lädt beim Einschalten und beim Verschieben (ab Zoom 14).
import { el, toast, plain } from "./dom.js";
import { bubatzPlaces } from "../api/overpass.js";
import { BUBATZ_CATS, classifyBubatz, zoneRadius, pedestrianBanActive, bubatzQuery, BUFFER_M } from "../planner/bubatz.js";

const MIN_ZOOM = 14;

export function makeBubatzLayer(map) {
  const layer = L.layerGroup();
  let timer, lastKey = null, legend = null;

  const Legend = L.Control.extend({
    onAdd() {
      const ped = pedestrianBanActive();
      return el("div", { class: "legend small", style: { maxWidth: "230px" } },
        el("div", {}, el("strong", {}, "🌿 Bubatzkarte")),
        ...Object.entries(BUBATZ_CATS).map(([, c]) => el("div", {}, el("i", { style: { background: c.color } }), c.label)),
        el("div", { class: "muted", style: { marginTop: "4px" } }, `Kreise: ${BUFFER_M} m Sichtweite (Näherung). Fußgängerzonen: Verbot ${ped ? "gilt gerade" : "gerade nicht (20–7 Uhr)"}. Ohne Gewähr.`),
        el("div", { class: "muted" }, `Ab Zoom ${MIN_ZOOM} sichtbar.`));
    },
  });

  async function load() {
    if (!map.hasLayer(layer)) return;
    if (map.getZoom() < MIN_ZOOM) { layer.clearLayers(); lastKey = null; return; }
    const b = map.getBounds().pad(0.1);
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",");
    if (bbox === lastKey) return;
    lastKey = bbox;
    try {
      const { zones, streets } = await bubatzPlaces(bbox, bubatzQuery);
      layer.clearLayers();
      const ped = pedestrianBanActive();
      for (const s of streets) {
        L.polyline(s.coords, { color: BUBATZ_CATS.pedestrian.color, weight: 8, opacity: ped ? 0.55 : 0.25 })
          .bindTooltip(`Fußgängerzone${s.tags.name ? `: ${plain(s.tags.name)}` : ""} – Konsum 7–20 Uhr verboten`, { sticky: true }).addTo(layer);
      }
      for (const z of zones) {
        const cat = classifyBubatz(z.tags);
        if (!cat) continue;
        const c = BUBATZ_CATS[cat];
        L.circle([z.lat, z.lon], { radius: zoneRadius(z.bounds), color: c.color, weight: 1, fillColor: c.color, fillOpacity: 0.18, interactive: true })
          .bindTooltip(`${c.label}${z.tags.name ? `: ${plain(z.tags.name)}` : ""} – Konsumverbot`, { sticky: true }).addTo(layer);
      }
    } catch (e) {
      lastKey = null;
      toast(`Bubatzkarte: ${e.message}`);
    }
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(load, 500); };
  map.on("moveend", schedule);
  map.on("overlayadd", (e) => {
    if (e.layer !== layer) return;
    legend = new Legend({ position: "bottomleft" }).addTo(map);
    if (map.getZoom() < MIN_ZOOM) toast(`Bubatzkarte: zum Anzeigen bis Zoom ${MIN_ZOOM} heranzoomen.`);
    load();
  });
  map.on("overlayremove", (e) => { if (e.layer === layer) { legend?.remove(); legend = null; layer.clearLayers(); lastKey = null; } });
  return layer;
}
