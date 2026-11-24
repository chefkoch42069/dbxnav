// Stadt-Reiter: Hauptbahnhof finden, Läden und Einrichtungen am Bahnhof einordnen.
import { distanceKm, pointInGeometry } from "../lib/geo.js";
import { lineName } from "./dticket.js";

export const SHOP_CATS = {
  food: { label: "Lebensmittel & Kiosk", icon: "🛒" },
  bakery: { label: "Bäcker & Café", icon: "🥐" },
  eat: { label: "Imbiss & Restaurant", icon: "🍽️" },
  health: { label: "Drogerie & Apotheke", icon: "💊" },
  press: { label: "Presse, Bücher & Reisebedarf", icon: "📰" },
  money: { label: "Geld & Post", icon: "🏧" },
  service: { label: "Bahnhofs-Service", icon: "🚻" },
  other: { label: "Weitere Läden", icon: "🛍️" },
};

/** Kategorie eines OSM-Objekts für die Bahnhofs-Übersicht, oder null. */
export function shopCategory(t) {
  const shop = t.shop || "", a = t.amenity || "";
  if (/^(supermarket|convenience|kiosk|greengrocer|butcher|deli|beverages|alcohol|frozen_food)$/.test(shop)) return "food";
  if (shop === "bakery" || shop === "pastry" || shop === "coffee" || a === "cafe" || a === "ice_cream") return "bakery";
  if (/^(fast_food|restaurant|food_court|pub|bar|biergarten)$/.test(a)) return "eat";
  if (/^(chemist|drugstore|medical_supply|optician|hearing_aids)$/.test(shop) || a === "pharmacy") return "health";
  if (/^(newsagent|books|stationery|tobacco|e-cigarette|travel_agency|ticket|bag|mobile_phone|electronics|gift)$/.test(shop)) return "press";
  if (/^(bank|atm|post_office|bureau_de_change|money_transfer)$/.test(a) || shop === "money_lender") return "money";
  if (/^(toilets|left_luggage|luggage_locker|locker|lockers|bicycle_parking|bicycle_rental|car_rental|taxi|drinking_water|police|lost_property_office|charging_station)$/.test(a) || /locker|luggage/.test(t.vending || "")) return "service";
  if (shop && shop !== "vacant" && shop !== "no") return "other";
  return null;
}

/** OSM-Weg ([{lat, lon}, …]) → GeoJSON-Polygon, wenn er geschlossen ist. */
export function wayToPolygon(geometry) {
  if (!geometry || geometry.length < 4) return null;
  const a = geometry[0], b = geometry[geometry.length - 1];
  if (a.lat !== b.lat || a.lon !== b.lon) return null;
  return { type: "Polygon", coordinates: [geometry.map((p) => [p.lon, p.lat])] };
}

/**
 * Läden einordnen: im Bahnhof (in einem Bahnhofs-Umriss oder sehr nah am Bahnhofspunkt) oder im Umkreis.
 * @param station {lat, lon}   @param polygons GeoJSON-Polygone der Bahnhofsgebäude
 */
export function placeShops(station, elements, polygons = [], { insideM = 60, radiusM = 500 } = {}) {
  const out = [];
  const seen = new Set();
  for (const e of elements) {
    if (seen.has(e.id)) continue;
    const cat = shopCategory(e.tags || {});
    if (!cat) continue;
    const dist = distanceKm(station, e) * 1000;
    if (dist > radiusM) continue;
    seen.add(e.id);
    const inside = polygons.some((g) => pointInGeometry(e.lat, e.lon, g)) || (!polygons.length && dist <= insideM);
    out.push({ ...e, cat, inside, distM: Math.round(dist) });
  }
  return out.sort((a, b) => (b.inside - a.inside) || a.distM - b.distM);
}

/**
 * Hauptbahnhof aus Geocoder-Treffern wählen: „Hbf/Hauptbahnhof“ mit Bahn bevorzugt, nah an der Stadt.
 * @param city {lat, lon, name}  @param stops Treffer mit {name, lat, lon, rail, type}
 */
export function pickMainStation(city, stops) {
  const rail = stops.filter((s) => s.type === "STOP" && s.rail && distanceKm(city, s) < 20);
  if (!rail.length) return null;
  const cityWord = (city.name || "").split(/[\s,(]/)[0].toLowerCase();
  const score = (s) => {
    const n = s.name.toLowerCase();
    let v = -distanceKm(city, s);
    if (/\b(hbf|hauptbahnhof)\b/.test(n)) v += 100;
    if (cityWord && n.startsWith(cityWord)) v += 20;
    return v;
  };
  return [...rail].sort((a, b) => score(b) - score(a))[0];
}

/** Linien an einer Haltestelle aus Abfahrten: je Gruppe die Linien mit ihren häufigsten Zielen. */
export function linesFromDepartures(deps) {
  const byLine = new Map();
  for (const d of deps) {
    const name = lineName(d).replace(/\s*\(\d+\)$/, "").trim(); // wie badgeFor
    if (!name) continue;
    const key = `${d.group}|${name}`;
    const x = byLine.get(key) || { group: d.group, name, dep: d, dests: new Map(), count: 0 };
    x.count++;
    const h = d.headsign || d.tripTo?.name;
    if (h) x.dests.set(h, (x.dests.get(h) || 0) + 1);
    byLine.set(key, x);
  }
  return [...byLine.values()]
    .map((x) => ({ group: x.group, name: x.name, dep: x.dep, count: x.count, dests: [...x.dests.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 3) }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
}
