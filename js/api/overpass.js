// OpenStreetMap über Overpass: Unterkünfte, Bahnhofs-Infos, Ausflugsziele.
// GET statt POST, damit der Service Worker Antworten für offline zwischenspeichern kann.
import { OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_S } from "../config.js";
import { getJSON } from "./http.js";
import { distanceKm, boundsAround } from "../lib/geo.js";
import { localElements } from "./localPoi.js";
import { parseMeters, walkHours, symbolText, linesKm } from "../planner/hiking.js";
import { wayToPolygon } from "../planner/city.js";

// Zuerst eigene Daten (schnell, kein Server nötig), sonst Overpass.
async function fromLocal(center, opts, keep) {
  const local = await localElements(center, opts);
  return local ? local.filter((e) => keep(e.tags)) : null;
}

let preferred = 0; // Index des zuletzt erfolgreichen Servers
const memo = new Map(); // gleiche Abfrage in dieser Sitzung nicht doppelt stellen

const DOWN_MS = 3 * 60 * 1000; // ausgefallene Server so lange nach hinten stellen
const downUntil = {}; // Server → Zeitpunkt, bis zu dem er als ausgefallen gilt

/** Reihenfolge der Server: zuletzt erfolgreicher zuerst, kürzlich ausgefallene ans Ende. */
export function endpointOrder(list, first, down = {}, now = Date.now()) {
  const rotated = list.map((_, i) => list[(first + i) % list.length]);
  const isDown = (ep) => (down[ep] || 0) > now;
  return [...rotated.filter((ep) => !isDown(ep)), ...rotated.filter(isDown)];
}

export async function query(ql) {
  // Server-Timeout einsetzen; der Browser wartet etwas länger als der Server.
  const q = ql.replace(/\[timeout:\d+\]/, `[timeout:${OVERPASS_TIMEOUT_S}]`);
  if (memo.has(q)) return memo.get(q);
  const errors = [];
  for (const ep of endpointOrder(OVERPASS_ENDPOINTS, preferred, downUntil)) {
    try {
      const res = await getJSON(`${ep}?data=${encodeURIComponent(q)}`, { timeout: (OVERPASS_TIMEOUT_S + 8) * 1000 });
      if (res?.remark && /timed out|out of memory/i.test(res.remark) && !res.elements?.length) throw new Error("Abfrage zu groß");
      preferred = OVERPASS_ENDPOINTS.indexOf(ep);
      delete downUntil[ep];
      memo.set(q, res);
      if (memo.size > 50) memo.delete(memo.keys().next().value);
      return res;
    } catch (e) {
      errors.push(`${new URL(ep).hostname}: ${e.message}`);
      if (e.message !== "Abfrage zu groß") downUntil[ep] = Date.now() + DOWN_MS; // zu groß ist kein Serverausfall
    }
  }
  console.warn("Overpass:", errors);
  const err = new Error(
    "OpenStreetMap-Server (Overpass) sind gerade überlastet oder nicht erreichbar. Kleineren Umkreis wählen oder in einer Minute nochmal probieren."
  );
  err.details = errors;
  throw err;
}

function elements(res, center) {
  return (res?.elements || [])
    .map((e) => {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (lat == null) return null;
      return { id: `${e.type}/${e.id}`, lat, lon, tags: e.tags || {}, dist: distanceKm(center, { lat, lon }) };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist);
}

const LODGING = /^(hotel|hostel|guest_house|motel|apartment|camp_site|alpine_hut|chalet)$/;
export async function accommodations(center, radiusM = 3000) {
  const local = await fromLocal(center, { radiusM }, (t) => LODGING.test(t.tourism || "") && t.name);
  if (local) return local;
  const ql = `[out:json][timeout:30];
nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment|camp_site|alpine_hut|chalet)$"](around:${radiusM},${center.lat},${center.lon});
out center tags 120;`;
  return elements(await query(ql), center).filter((e) => e.tags.name);
}

export async function stationInfo(center, radiusM = 600) {
  const local = await fromLocal(center, { radiusM }, (t) =>
    /^(toilets|locker|luggage_locker|lockers|pharmacy|drinking_water|atm)$/.test(t.amenity || "") ||
    /^(supermarket|convenience|bakery|kiosk)$/.test(t.shop || "") ||
    (t.amenity === "vending_machine" && /luggage|locker/.test(t.vending || "")));
  if (local) return local;
  const a = `(around:${radiusM},${center.lat},${center.lon})`;
  const ql = `[out:json][timeout:25];
(
  nwr["amenity"~"^(toilets|locker|luggage_locker|lockers|pharmacy|drinking_water|atm)$"]${a};
  nwr["shop"~"^(supermarket|convenience|bakery|kiosk)$"]${a};
  nwr["amenity"="vending_machine"]["vending"~"luggage|locker"]${a};
);
out center tags 150;`;
  return elements(await query(ql), center);
}

export function stationCategory(tags) {
  if (tags.amenity === "toilets") return "Toiletten";
  if (/locker/.test(tags.amenity || "") || /luggage|locker/.test(tags.vending || "")) return "Schließfächer";
  if (tags.shop === "supermarket") return "Supermarkt";
  if (tags.shop === "bakery") return "Bäckerei";
  if (tags.shop === "convenience" || tags.shop === "kiosk") return "Kiosk/Späti";
  if (tags.amenity === "pharmacy") return "Apotheke";
  if (tags.amenity === "drinking_water") return "Trinkwasser";
  if (tags.amenity === "atm") return "Geldautomat";
  return "Sonstiges";
}

export async function sights(center, radiusM = 5000) {
  const a = `(around:${radiusM},${center.lat},${center.lon})`;
  const ql = `[out:json][timeout:30];
(
  nwr["historic"~"^(castle|ruins|city_gate|monastery|fort|palace)$"]["name"]${a};
  nwr["tourism"~"^(viewpoint|museum|attraction|zoo|theme_park)$"]["name"]${a};
  nwr["natural"="water"]["water"~"^(lake|reservoir)$"]["name"]${a};
  nwr["leisure"~"^(nature_reserve|park)$"]["name"]["wikipedia"]${a};
);
out center tags 80;`;
  return elements(await query(ql), center);
}

// ---- Wanderwege ----
const NETWORK = { iwn: ["International", 0], nwn: ["National", 1], rwn: ["Regional", 2], lwn: ["Lokal", 3] };

const MAX_DAY_KM = 40;
export const MAX_MAP_KM = 150; // längere Wege nicht als Ganzes laden (riesige Abfrage)

export function hikingInfo(tags) {
  const [label, rank] = NETWORK[tags.network] || ["Wanderweg", 4];
  const km = parseFloat(String(tags.distance || "").replace(",", "."));
  const ascent = parseMeters(tags.ascent), descent = parseMeters(tags.descent);
  const kmOk = Number.isFinite(km) ? km : null;
  return {
    label, rank,
    name: tags.name || tags.ref || "Wanderweg",
    ref: tags.name && tags.ref ? tags.ref : null,
    km: kmOk,
    ends: tags.from && tags.to ? `${tags.from} → ${tags.to}` : null,
    roundtrip: tags.roundtrip === "yes",
    ascent, descent,
    // Gehzeit nur für Tagesetappen; längere Wege als Tage à 20 km
    hours: kmOk && kmOk <= MAX_DAY_KM ? walkHours(kmOk, ascent, descent) : null,
    days: kmOk && kmOk > MAX_DAY_KM ? Math.ceil(kmOk / 20) : null,
    symbol: symbolText(tags["osmc:symbol"]) || tags.symbol || null,
    description: tags.description || tags["description:de"] || tags.note || null,
    operator: tags.operator || null,
    website: tags.website || tags.url || null,
    wikipedia: tags.wikipedia || null,
  };
}

export async function hikingRoutes(center, radiusM = 6000) {
  const ql = `[out:json][timeout:30];
relation["type"="route"]["route"~"^(hiking|foot)$"](around:${radiusM},${center.lat},${center.lon});
out tags center 80;`;
  return elements(await query(ql), center)
    .map((e) => ({ ...e, info: hikingInfo(e.tags) }))
    .sort((a, b) => a.info.rank - b.info.rank || a.dist - b.dist);
}

/** Verlauf eines Wanderwegs: Linien als [[lat, lon], …], Gesamtlänge in km. */
export async function hikingRouteGeometry(id) {
  const rel = String(id).replace(/^relation\//, "");
  // Wege direkt in der Relation; bei Wegen aus Etappen (Super-Relation) eine Ebene tiefer
  const res = await query(`[out:json][timeout:25];relation(${rel})->.r;(way(r.r);rel(r.r);)->.m;(.m;way(r.m););way._;out geom;`);
  const lines = (res?.elements || []).filter((e) => e.geometry).map((e) => e.geometry.map((p) => [p.lat, p.lon]));
  return { lines, km: linesKm(lines, distanceKm) };
}

export const waymarkedLink = (id) => `https://hiking.waymarkedtrails.org/#route?id=${String(id).replace(/^relation\//, "")}`;

// ---- Bibliotheken ----
export function libraryInfo(tags) {
  const wifi = /^(wlan|yes|wifi|public)$/i.test(tags.internet_access || "") || tags["internet_access:fee"] === "no";
  return {
    name: tags.name || "Bibliothek",
    hours: tags.opening_hours || null,
    wifi,
    type: /univ|hochschul/i.test(`${tags.name} ${tags.operator || ""}`) || tags.library === "academic" ? "Hochschulbibliothek" : "Bibliothek",
    website: tags.website || tags["contact:website"] || null,
    address: tags["addr:street"] ? `${tags["addr:street"]} ${tags["addr:housenumber"] || ""}`.trim() : null,
  };
}

export async function libraries(center, radiusM = 3000) {
  const local = await fromLocal(center, { radiusM }, (t) => t.amenity === "library");
  if (local) return local.map((e) => ({ ...e, info: libraryInfo(e.tags) }));
  const ql = `[out:json][timeout:25];
nwr["amenity"="library"](around:${radiusM},${center.lat},${center.lon});
out center tags 60;`;
  return elements(await query(ql), center).map((e) => ({ ...e, info: libraryInfo(e.tags) }));
}

// ---- Homeless-Modus: kostenlos & billig ----
/** Rechteck um einen Punkt: „süd,west,nord,ost“ für Overpass. */
export function bboxAround(center, radiusM) {
  return boundsAround(center, radiusM).map((v) => v.toFixed(5)).join(",");
}

export function budgetQuery(bbox) {
  // Rechteck (bbox) statt around: läuft über den räumlichen Index und ist für Overpass
  // deutlich billiger, besonders bei Gebäudeflächen und Wegen → weniger 502/504.
  // Keine Namenssuche über alle Objekte, kein Ergebnis-Limit (Overpass sortiert nicht nach Nähe).
  const disc = "Aldi|Lidl|Netto|Penny|Norma|Kaufland|nah ?& ?gut|diska|NP";
  return `[out:json][timeout:25][bbox:${bbox}];
(
  nwr["amenity"~"^(drinking_water|water_point|toilets|shower|device_charging_station|food_sharing|give_box|shelter|social_facility|library|fast_food|canteen)$"];
  nwr["social_facility"];
  nwr["shop"="supermarket"]["brand"~"${disc}",i];
  nwr["shop"="supermarket"]["name"~"${disc}",i];
  nwr["shop"="bakery"];
  nwr["internet_access"~"^(wlan|yes|wifi|public)$"]["internet_access:fee"="no"];
  nwr["power_supply"="yes"];
);
out center tags;`;
}

/**
 * Kostenlose & billige Orte. Entweder Umkreis um center (radiusM) oder ein
 * fertiges Rechteck (bounds = sichtbarer Kartenausschnitt).
 */
export async function budgetPlaces(center, radiusM = 1500, bounds = null) {
  // Lokale Daten: alles laden, die Einordnung (classify) filtert ohnehin.
  const local = await fromLocal(center, { radiusM, bounds: bounds ? bounds.split(",").map(Number) : null }, () => true);
  if (local) return local;
  const res = await query(budgetQuery(bounds || bboxAround(center, radiusM)));
  const all = elements(res, center);
  return bounds ? all : all.filter((e) => e.dist * 1000 <= radiusM); // Ecken des Rechtecks abschneiden
}

// ---- Homeless-Modus: Parks & kostenlose Aktivitäten (ganze Stadt) ----
export function freePlacesQuery(bbox) {
  // „out tags bb“: Knoten mit Koordinaten, Flächen mit Rechteck – daraus Mittelpunkt und Größe.
  return `[out:json][timeout:25][bbox:${bbox}];
(
  nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"];
  nwr["tourism"~"^(viewpoint|attraction|museum)$"];
  nwr["historic"~"^(castle|ruins|city_gate|monument|palace|fort)$"]["name"];
  nwr["amenity"="place_of_worship"]["building"~"^(cathedral|church)$"]["wikipedia"];
  nwr["shop"="mall"];
  nwr["leisure"~"^(fitness_station|swimming_area)$"];
  nwr["natural"="beach"]["name"];
  nwr["amenity"="public_bookcase"];
);
out tags bb;`;
}

/**
 * Parks und Gratis-Orte in einem Rechteck „süd,west,nord,ost“. Flächen bekommen bounds für die Größe.
 * Eigene Daten zuerst; Overpass ergänzt große Parks (Multipolygone fehlen in den eigenen Daten).
 * Mit eigenen Daten zählt ein Overpass-Fehler nicht als Fehler. onLocal(list) liefert die schnellen Ergebnisse vorab.
 */
export async function freePlaces(center, bbox, { onLocal } = {}) {
  const box = bbox.split(",").map(Number);
  const local = await localElements(center, { bounds: box }).catch(() => null);
  if (local?.length) onLocal?.(local);
  try {
    const live = await freePlacesLive(center, bbox);
    const seen = new Set(live.map((e) => e.id));
    return [...live, ...(local || []).filter((e) => !seen.has(e.id))].sort((a, b) => a.dist - b.dist);
  } catch (e) {
    if (local) return local;
    throw e;
  }
}

async function freePlacesLive(center, bbox) {
  const res = await query(freePlacesQuery(bbox));
  return (res?.elements || [])
    .map((e) => {
      const b = e.bounds;
      const lat = e.lat ?? (b ? (b.minlat + b.maxlat) / 2 : null);
      const lon = e.lon ?? (b ? (b.minlon + b.maxlon) / 2 : null);
      if (lat == null) return null;
      return { id: `${e.type}/${e.id}`, lat, lon, bounds: b, tags: e.tags || {}, dist: distanceKm(center, { lat, lon }) };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist);
}

// ---- Einkaufen: Einkaufszentren und Kaufhäuser mit Öffnungszeiten ----
export async function shoppingCenters(center, radiusM = 3000) {
  const ql = `[out:json][timeout:25];
nwr["shop"~"^(mall|department_store)$"]["name"](around:${radiusM},${center.lat},${center.lon});
out center tags 40;`;
  return elements(await query(ql), center);
}

export function sightCategory(tags) {
  if (tags.historic === "castle" || tags.historic === "palace" || tags.historic === "fort") return "Burg/Schloss";
  if (tags.historic === "ruins") return "Ruine";
  if (tags.historic) return "Historisch";
  if (tags.natural === "water") return "See";
  if (tags.tourism === "viewpoint") return "Aussicht";
  if (tags.tourism === "museum") return "Museum";
  if (tags.leisure) return "Natur/Park";
  return "Sehenswert";
}

// ---- Stadt-Reiter: Läden und Einrichtungen am Bahnhof ----
const STATION_AMENITY = "cafe|fast_food|restaurant|food_court|ice_cream|pub|bar|pharmacy|bank|atm|post_office|bureau_de_change|toilets|left_luggage|luggage_locker|locker|lockers|bicycle_parking|bicycle_rental|car_rental|taxi|drinking_water|police|lost_property_office";

/**
 * Läden im Umkreis eines Bahnhofs plus die Umrisse der Bahnhofsgebäude (für „im Bahnhof“).
 * @returns {{elements: Array, polygons: Array}}
 */
export async function stationShops(station, radiusM = 500) {
  const at = `${station.lat},${station.lon}`;
  const ql = `[out:json][timeout:25];
(
  way(around:250,${at})["building"="train_station"];
  way(around:250,${at})["railway"="station"];
  way(around:250,${at})["public_transport"="station"];
)->.st;
.st out tags geom;
(
  nwr(around:${radiusM},${at})["shop"];
  nwr(around:${radiusM},${at})["amenity"~"^(${STATION_AMENITY})$"];
  nwr(around:${radiusM},${at})["vending"~"luggage|locker"];
);
out center tags;`;
  const res = await query(ql);
  const polygons = [];
  const rest = [];
  for (const e of res?.elements || []) {
    const t = e.tags || {};
    const isStation = e.type === "way" && e.geometry && (t.building === "train_station" || t.railway === "station" || t.public_transport === "station");
    if (isStation) { const g = wayToPolygon(e.geometry); if (g) polygons.push(g); continue; }
    rest.push(e);
  }
  return { elements: elements({ elements: rest }, station), polygons };
}

// ---- YouTuber-Modus: Infrastruktur im Kartenausschnitt ----
export function infraQuery(bbox, withLines = false) {
  return `[out:json][timeout:25][bbox:${bbox}];
(
  nwr["power"~"^(plant|substation)$"];
  node["power"="generator"]["generator:source"="wind"];
  way["man_made"="bridge"]["name"];
  way["bridge"="viaduct"];
  way["bridge"]["bridge:name"];
  way["tunnel"]["tunnel:name"];
  way["railway"]["tunnel"="yes"]["name"];
  nwr["waterway"~"^(dam|weir|lock_gate)$"];
  nwr["lock"="yes"]["name"];
  nwr["man_made"~"^(water_tower|water_works|wastewater_plant|tower)$"];
  nwr["railway"~"^(signal_box|turntable|traverser|roundhouse)$"];
  nwr["abandoned"="yes"]["name"];
  nwr["building"="ruins"]["name"];
  nwr["military"="bunker"];
  nwr["abandoned:railway"="station"];
  nwr["disused:railway"="station"];
);
out center tags;${withLines ? `
(
  way["power"="line"];
  way["railway"~"^(abandoned|disused)$"];
);
out tags geom;` : ""}`;
}

/** Infrastruktur im Rechteck „süd,west,nord,ost“: Punkte (mit Mittelpunkt) und Linien (mit Verlauf). */
export async function infraPlaces(center, bbox, { withLines = false } = {}) {
  const res = await query(infraQuery(bbox, withLines));
  const points = [], lines = [];
  for (const e of res?.elements || []) {
    // Nur die Linien-Abfrage liefert „geom“, die Punkte kommen mit „center“.
    if (e.geometry) lines.push({ id: `${e.type}/${e.id}`, tags: e.tags || {}, coords: e.geometry.map((p) => [p.lat, p.lon]) });
    else points.push(e);
  }
  return { points: elements({ elements: points }, center), lines };
}
