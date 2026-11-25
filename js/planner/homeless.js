// Homeless-Modus: Parks und kostenlose Orte für den Tag (zusätzlich zu den Kategorien aus budget.js).

export const FREE_CATS = {
  park: { label: "Park & Grün", icon: "🌳" },
  view: { label: "Aussicht", icon: "👀" },
  sight: { label: "Sehenswert", icon: "🏛️" },
  museum: { label: "Museum", icon: "🖼️" },
  church: { label: "Kirche (warm & ruhig)", icon: "⛪" },
  mall: { label: "Einkaufszentrum (warm)", icon: "🏬" },
  fitness: { label: "Outdoor-Fitness", icon: "💪" },
  swim: { label: "Badestelle", icon: "🏊" },
  books: { label: "Bücherschrank", icon: "📖" },
};

import { NOT_PUBLIC } from "./budget.js";

/** Ungefähre Fläche in Hektar aus dem umgebenden Rechteck (Overpass „bounds“). */
export function bboxHectares(b) {
  if (!b) return 0;
  const midLat = ((b.minlat + b.maxlat) / 2) * (Math.PI / 180);
  const h = (b.maxlat - b.minlat) * 111.32;
  const w = (b.maxlon - b.minlon) * 111.32 * Math.cos(midLat);
  return Math.round(h * w * 100);
}

/**
 * Parks und kostenlose Aktivitäten erkennen.
 * @returns {{cat:string, free:boolean, extras:string[], note:string|null} | null}
 */
export function classifyFree(t) {
  if (NOT_PUBLIC.test(t.access || "")) return null;
  const named = Boolean(t.name);
  const feeYes = t.fee === "yes";
  const r = (cat, note, free = !feeYes) => ({ cat, free, extras: [], note });

  if (/^(park|garden|nature_reserve)$/.test(t.leisure || "")) {
    if (!named) return null;
    if (t.leisure === "garden" && /^(private|residential|community)$/.test(t["garden:type"] || "")) return null;
    const kind = { park: "Park", garden: t["garden:type"] === "botanical" ? "Botanischer Garten" : "Garten", nature_reserve: "Naturschutzgebiet" }[t.leisure];
    return r("park", feeYes ? `${kind} · Eintritt` : kind);
  }
  if (t.tourism === "viewpoint") return r("view", named ? null : "Aussichtspunkt");
  if (t.tourism === "museum") {
    if (!named) return null;
    return t.fee === "no" ? r("museum", "Eintritt frei", true) : r("museum", "Eintritt prüfen – viele Museen haben einen freien Tag", false);
  }
  if (t.amenity === "place_of_worship") return named ? r("church", "tagsüber meist offen, warm & ruhig", true) : null;
  if (t.shop === "mall") return named ? r("mall", "warm, Sitzplätze, oft WC & WLAN", true) : null;
  if (t.leisure === "fitness_station") return r("fitness", "Geräte draußen, kostenlos", true);
  if (t.leisure === "swimming_area" || (t.natural === "beach" && named)) return r("swim", "Baden draußen – nur im Sommer");
  if (t.amenity === "public_bookcase") return r("books", "Bücher nehmen & bringen", true);
  if ((t.tourism === "attraction" || t.historic) && named) return r("sight", feeYes ? "Eintritt" : null);
  return null;
}
