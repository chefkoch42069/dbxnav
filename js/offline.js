// Service Worker registrieren + Offline-Paket für eine Tour (in Maßen!).
import { BASE_LAYERS, OFFLINE } from "./config.js";
import { tilesAlong } from "./lib/geo.js";
import { legPoints } from "./lib/polyline.js";
import { accommodations } from "./api/overpass.js";
import { currentBase } from "./ui/map.js";
import { toast } from "./ui/dom.js";

export function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service Worker:", e));
}

function tileUrl(tpl, t) {
  return tpl.replace("{z}", t.z).replace("{x}", t.x).replace("{y}", t.y).replace("{s}", "a");
}

export async function prefetchTour(tour, onProgress = () => {}) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    toast("Offline-Speicher braucht HTTPS bzw. localhost und einen Neuladen der Seite.");
  }
  // Kacheln nur von Servern, die das erlauben; sonst ÖPNVKarte.
  const baseName = BASE_LAYERS[currentBase]?.allowPrefetch ? currentBase : Object.keys(BASE_LAYERS).find((k) => BASE_LAYERS[k].allowPrefetch);
  const tpl = BASE_LAYERS[baseName].url;
  const pts = tour.days.flatMap((d) => (d.itinerary ? d.itinerary.legs.flatMap(legPoints) : []));
  const tiles = tilesAlong(pts, OFFLINE.prefetchZooms, OFFLINE.prefetchMaxTiles);
  let done = 0;
  const queue = [...tiles];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      try { await fetch(tileUrl(tpl, t), { mode: "no-cors" }); } catch { /* weiter */ }
      done++;
      if (done % 10 === 0) onProgress(`Kacheln ${done}/${tiles.length}`);
      await new Promise((r) => setTimeout(r, 120)); // Server schonen
    }
  };
  await Promise.all(Array.from({ length: OFFLINE.prefetchConcurrency }, worker));
  // Unterkünfte an den Übernachtungsorten
  const nights = tour.days.filter((d) => d.overnight);
  let i = 0;
  for (const d of nights) {
    onProgress(`Unterkünfte ${++i}/${nights.length}`);
    try { await accommodations(d.overnight, 3000); } catch { /* egal */ }
  }
  toast(`Offline gespeichert: Tour, ${tiles.length} Kacheln (${baseName}) und Unterkünfte an ${nights.length} Orten.`, 6000);
}
