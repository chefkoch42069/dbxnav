// Bubatzkarte: Zonen, in denen öffentlicher Cannabis-Konsum verboten ist (Konsumcannabisgesetz § 5).
// Verboten u. a. in Sichtweite (gilt als erfüllt bis 100 m um den Eingangsbereich) von Schulen,
// Kinder- und Jugendeinrichtungen, Kinderspielplätzen und öffentlich zugänglichen Sportstätten;
// in Fußgängerzonen zwischen 7 und 20 Uhr. Angaben ohne Gewähr – Kommunen können strenger sein.

export const BUFFER_M = 100;

export const BUBATZ_CATS = {
  school: { label: "Schule", color: "#c62828" },
  kids: { label: "Kita / Kinder- & Jugendeinrichtung", color: "#ad1457" },
  playground: { label: "Spielplatz", color: "#ef6c00" },
  sport: { label: "Öffentliche Sportstätte", color: "#6a1b9a" },
  pedestrian: { label: "Fußgängerzone (7–20 Uhr)", color: "#1565c0" },
};

export function classifyBubatz(t) {
  if (/^(private|no)$/.test(t.access || "")) return null;
  if (t.amenity === "school") return "school";
  if (/^(kindergarten|childcare)$/.test(t.amenity || "") || (t.amenity === "community_centre" && /youth/.test(t.community_centre || "")) || t.amenity === "youth_centre") return "kids";
  if (t.leisure === "playground") return "playground";
  if (/^(sports_centre|stadium|pitch|sports_hall)$/.test(t.leisure || "")) return "sport";
  if (t.highway === "pedestrian") return "pedestrian";
  return null;
}

/** Radius der Verbotszone in Metern: halbe Diagonale des Geländes + 100 m (Näherung für den Eingangsbereich). */
export function zoneRadius(bounds) {
  if (!bounds) return BUFFER_M;
  const midLat = ((bounds.minlat + bounds.maxlat) / 2) * (Math.PI / 180);
  const h = (bounds.maxlat - bounds.minlat) * 111320;
  const w = (bounds.maxlon - bounds.minlon) * 111320 * Math.cos(midLat);
  return Math.round(BUFFER_M + Math.hypot(h, w) / 2);
}

/** Gilt das Verbot in Fußgängerzonen gerade? (7–20 Uhr, deutsche Zeit) */
export function pedestrianBanActive(date = new Date()) {
  const h = +new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Berlin" }).formatToParts(date).find((x) => x.type === "hour").value;
  return h >= 7 && h < 20;
}

export function bubatzQuery(bbox) {
  return `[out:json][timeout:25][bbox:${bbox}];
(
  nwr["amenity"~"^(school|kindergarten|childcare|youth_centre)$"];
  nwr["amenity"="community_centre"]["community_centre"~"youth"];
  nwr["leisure"="playground"];
  nwr["leisure"~"^(sports_centre|stadium|pitch|sports_hall)$"]["access"!~"^(private|no)$"];
);
out center tags bb;
way["highway"="pedestrian"];
out tags geom;`;
}
