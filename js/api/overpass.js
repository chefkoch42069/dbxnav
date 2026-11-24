// OpenStreetMap über Overpass: Unterkünfte, Bahnhofs-Infos, Ausflugsziele.
// GET statt POST, damit der Service Worker Antworten für offline zwischenspeichern kann.
import { OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_S } from "../config.js";
import { getJSON } from "./http.js";
import { distanceKm } from "../lib/geo.js";

let preferred = 0; // Index des zuletzt erfolgreichen Servers
const memo = new Map(); // gleiche Abfrage in dieser Sitzung nicht doppelt stellen

/** Reihenfolge der Server: zuletzt erfolgreicher zuerst. */
export function endpointOrder(list, first) {
  return list.map((_, i) => list[(first + i) % list.length]);
}

export async function query(ql) {
  // Server-Timeout einsetzen; der Browser wartet etwas länger als der Server.
  const q = ql.replace(/\[timeout:\d+\]/, `[timeout:${OVERPASS_TIMEOUT_S}]`);
  if (memo.has(q)) return memo.get(q);
  const errors = [];
  for (const ep of endpointOrder(OVERPASS_ENDPOINTS, preferred)) {
    try {
      const res = await getJSON(`${ep}?data=${encodeURIComponent(q)}`, { timeout: (OVERPASS_TIMEOUT_S + 8) * 1000 });
      if (res?.remark && /timed out|out of memory/i.test(res.remark) && !res.elements?.length) throw new Error("Abfrage zu groß");
      preferred = OVERPASS_ENDPOINTS.indexOf(ep);
      memo.set(q, res);
      if (memo.size > 50) memo.delete(memo.keys().next().value);
      return res;
    } catch (e) {
      errors.push(`${new URL(ep).hostname}: ${e.message}`);
    }
  }
  console.warn("Overpass:", errors);
  throw new Error(
    "OpenStreetMap-Server (Overpass) sind gerade überlastet oder nicht erreichbar. Kleineren Umkreis wählen oder in einer Minute nochmal probieren."
  );
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

export async function accommodations(center, radiusM = 3000) {
  const ql = `[out:json][timeout:30];
nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment|camp_site|alpine_hut|chalet)$"](around:${radiusM},${center.lat},${center.lon});
out center tags 120;`;
  return elements(await query(ql), center).filter((e) => e.tags.name);
}

export async function stationInfo(center, radiusM = 600) {
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

export function hikingInfo(tags) {
  const [label, rank] = NETWORK[tags.network] || ["Wanderweg", 4];
  const km = parseFloat(String(tags.distance || "").replace(",", "."));
  return {
    label, rank,
    name: tags.name || tags.ref || "Wanderweg",
    km: Number.isFinite(km) ? km : null,
    ends: tags.from && tags.to ? `${tags.from} → ${tags.to}` : null,
    roundtrip: tags.roundtrip === "yes",
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
  const ql = `[out:json][timeout:25];
nwr["amenity"="library"](around:${radiusM},${center.lat},${center.lon});
out center tags 60;`;
  return elements(await query(ql), center).map((e) => ({ ...e, info: libraryInfo(e.tags) }));
}

// ---- Unterwegs-Modus: kostenlos & billig ----
export async function budgetPlaces(center, radiusM = 1500) {
  const a = `(around:${radiusM},${center.lat},${center.lon})`;
  // Bewusst keine Namenssuche (z. B. name~"Tafel"): die zwingt den Server, jedes
  // benannte Objekt im Umkreis zu prüfen, und führt in Innenstädten zu 502/Timeouts.
  // Bahnhofsmission, Tafeln & Co. sind in OSM als social_facility eingetragen.
  // Kein Ergebnis-Limit: Overpass sortiert nicht nach Entfernung, ein Limit würde
  // beliebige (auch nahe) Orte abschneiden. Supermärkte nur Discounter, damit
  // hunderte normale Märkte die Antwort nicht aufblähen.
  const disc = "Aldi|Lidl|Netto|Penny|Norma|Kaufland|nah ?& ?gut|diska|NP";
  const ql = `[out:json][timeout:25];
(
  nwr["amenity"~"^(drinking_water|water_point|toilets|shower|device_charging_station|food_sharing|give_box|shelter|social_facility|library|fast_food|canteen)$"]${a};
  nwr["social_facility"]${a};
  nwr["shop"="supermarket"]["brand"~"${disc}",i]${a};
  nwr["shop"="supermarket"]["name"~"${disc}",i]${a};
  nwr["shop"="bakery"]${a};
  nwr["internet_access"~"^(wlan|yes|wifi|public)$"]["internet_access:fee"="no"]${a};
  nwr["power_supply"="yes"]${a};
);
out center tags;`;
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
