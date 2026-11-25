// Flug & Fähre ohne eigenen Server: Anreise zu Flughäfen/Häfen mit dem D-Ticket berechnen,
// Preise per fertig ausgefülltem Link beim Anbieter (Preise auslesen verbieten deren Bedingungen).
import { distanceKm } from "../lib/geo.js";

// Deutsche Flughäfen; stopId = Haltestelle am Terminal (Transitous), damit die Anreise sicher gefunden wird.
export const AIRPORTS = [
  { code: "MUC", name: "München", lat: 48.35541, lon: 11.78993, stopId: "de-DELFI_de:09178:2726:3:1" },
  { code: "FRA", name: "Frankfurt", lat: 50.05122, lon: 8.57125, stopId: "de-DELFI_de:06412:2930" },
  { code: "HAM", name: "Hamburg", lat: 53.63235, lon: 10.00665, stopId: "de-DELFI_de:02000:99651" },
  { code: "BER", name: "Berlin BER", lat: 52.3646, lon: 13.50987, stopId: "de-DELFI_de:12061:900260009" },
  { code: "DUS", name: "Düsseldorf", lat: 51.27808, lon: 6.76641, stopId: "de-DELFI_de:05111:18517" },
  { code: "CGN", name: "Köln/Bonn", lat: 50.8789, lon: 7.1193, stopId: "de-DELFI_de:05315:17551" },
  { code: "STR", name: "Stuttgart", lat: 48.69065, lon: 9.19263, stopId: "de-DELFI_de:08116:2103_G_G" },
  { code: "HAJ", name: "Hannover", lat: 52.4592, lon: 9.6993, stopId: "de-DELFI_de:03241:4111" },
  { code: "NUE", name: "Nürnberg", lat: 49.49396, lon: 11.07863, stopId: "de-DELFI_de:09564:1391" },
  { code: "LEJ", name: "Leipzig/Halle", lat: 51.42334, lon: 12.22343, stopId: "de-DELFI_de:14730:8012183" },
  { code: "BRE", name: "Bremen", lat: 53.05293, lon: 8.78627, stopId: "de-VBN_000000601200" },
  { code: "DTM", name: "Dortmund", lat: 51.5143, lon: 7.6119, stopId: "de-DELFI_de:05913:108:1:01" },
  { code: "FMM", name: "Memmingen", lat: 47.9896, lon: 10.2325, stopId: "de-amarillo-bw_de:09778:3240" },
  { code: "HHN", name: "Frankfurt-Hahn", lat: 49.94461, lon: 7.26759, stopId: "de-DELFI_000013607403" },
  { code: "NRN", name: "Weeze", lat: 51.5982, lon: 6.17272, stopId: "de-DELFI_de:05154:37116:2:2" },
  { code: "FKB", name: "Karlsruhe/Baden-Baden", lat: 48.78192, lon: 8.09769, stopId: "de-KVV_Pde:08216:34790" },
  { code: "PAD", name: "Paderborn", lat: 51.61055, lon: 8.62056, stopId: "de-DELFI_de:05774:7247:0:1" },
  { code: "DRS", name: "Dresden", lat: 51.12454, lon: 13.76597, stopId: "de-DELFI_de:14612:617" },
  { code: "BSL", name: "Basel/Mulhouse (für Südbaden)", lat: 47.60073, lon: 7.53171, stopId: "eu-flixbus_dcbf8dd0-9603-11e6-9066-549f350fcb0c" },
];

export const POPULAR_DESTINATIONS = [
  ["BCN", "Barcelona"], ["PMI", "Palma de Mallorca"], ["LIS", "Lissabon"], ["FCO", "Rom"], ["ATH", "Athen"],
  ["LON", "London (alle)"], ["PAR", "Paris (alle)"], ["AMS", "Amsterdam"], ["MAD", "Madrid"], ["AGP", "Málaga"],
  ["IST", "Istanbul"], ["AYT", "Antalya"], ["DUB", "Dublin"], ["OSL", "Oslo"], ["STO", "Stockholm (alle)"],
  ["CPH", "Kopenhagen"], ["VIE", "Wien"], ["BUD", "Budapest"], ["PRG", "Prag"], ["NAP", "Neapel"],
  ["TFS", "Teneriffa Süd"], ["LPA", "Gran Canaria"], ["FAO", "Faro"], ["SPU", "Split"], ["HER", "Heraklion"],
  ["NYC", "New York (alle)"], ["BKK", "Bangkok"], ["DXB", "Dubai"],
];

/** Die n nächstgelegenen Flughäfen (Luftlinie). */
export function nearestAirports(place, n = 5, list = AIRPORTS) {
  return list.map((a) => ({ ...a, km: Math.round(distanceKm(place, a)) })).sort((a, b) => a.km - b.km).slice(0, n);
}

const yymmdd = (d) => d.replace(/-/g, "").slice(2);

/** Ziel-Eingabe → IATA-Code (3 Buchstaben) oder null. */
export function destCode(input) {
  const s = String(input || "").trim();
  const m = /\b([A-Za-z]{3})\b\s*$/.exec(s) || /^([A-Za-z]{3})\b/.exec(s);
  if (m && s.length <= 3) return m[1].toUpperCase();
  const hit = POPULAR_DESTINATIONS.find(([c, n]) => s.toLowerCase() === n.toLowerCase() || s.toUpperCase().startsWith(c + " ") || s.toUpperCase() === c);
  return hit ? hit[0] : m ? m[1].toUpperCase() : null;
}

/** Such-Links je Abflughafen und einer für alle zusammen (Kayak kann mehrere Abflughäfen). */
export function flightLinks(origins, dest, date, ret = null) {
  const o = origins.map((a) => (typeof a === "string" ? a : a.code));
  const one = (code) => ({
    google: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flüge von ${code} nach ${dest} am ${date}${ret ? ` zurück ${ret}` : ""}`)}&hl=de`,
    skyscanner: `https://www.skyscanner.de/transport/flights/${code.toLowerCase()}/${dest.toLowerCase()}/${yymmdd(date)}/${ret ? `${yymmdd(ret)}/` : ""}`,
    kayak: `https://www.kayak.de/flights/${code}-${dest}/${date}${ret ? `/${ret}` : ""}?sort=price_a`,
  });
  return {
    perAirport: Object.fromEntries(o.map((c) => [c, one(c)])),
    all: `https://www.kayak.de/flights/${o.join(",")}-${dest}/${date}${ret ? `/${ret}` : ""}?sort=price_a`,
  };
}

// Fähren ab Deutschland (Abfahrtshafen = Bahnhof/Anleger in der Nähe)
export const FERRIES = [
  { route: "Kiel – Oslo", port: "Kiel (Norwegenkai)", lat: 54.31622, lon: 10.14379, stopId: "de-DELFI_de:01002:49175::1", operator: "Color Line", night: true },
  { route: "Kiel – Göteborg", port: "Kiel (Schwedenkai)", lat: 54.3165, lon: 10.1365, operator: "Stena Line", night: true },
  { route: "Kiel – Klaipėda", port: "Kiel (Ostuferhafen)", lat: 54.3628, lon: 10.1777, operator: "DFDS", night: true },
  { route: "Travemünde – Trelleborg / Malmö", port: "Lübeck-Travemünde Skandinavienkai", lat: 53.95079, lon: 10.85403, stopId: "de-DELFI_de:01003:58101", operator: "TT-Line, Finnlines", night: true },
  { route: "Travemünde – Helsinki", port: "Lübeck-Travemünde Skandinavienkai", lat: 53.95079, lon: 10.85403, stopId: "de-DELFI_de:01003:58101", operator: "Finnlines", night: true },
  { route: "Rostock – Trelleborg", port: "Rostock Überseehafen", lat: 54.14691, lon: 12.12085, stopId: "de-DELFI_de:13003:2029:1:1", operator: "TT-Line, Stena Line", night: true },
  { route: "Rostock – Gedser", port: "Rostock Überseehafen", lat: 54.14691, lon: 12.12085, stopId: "de-DELFI_de:13003:2029:1:1", operator: "Scandlines" },
  { route: "Puttgarden – Rødby", port: "Puttgarden", lat: 54.50103, lon: 11.22597, stopId: "de-DELFI_de:01055:74912::1_G", operator: "Scandlines" },
  { route: "Sassnitz – Rønne (Bornholm)", port: "Sassnitz-Mukran", lat: 54.4872, lon: 13.58976, stopId: "de-DELFI_de:13073:11306:1:1", operator: "Bornholmslinjen" },
  { route: "Cuxhaven – Helgoland", port: "Cuxhaven (Alte Liebe)", lat: 53.87125, lon: 8.70872, stopId: "de-DELFI_de:03352:18457::1", operator: "Cassen Eils, Helgoline" },
  { route: "Norddeich – Norderney / Juist", port: "Norddeich Mole", lat: 53.62431, lon: 7.15881, stopId: "de-DELFI_de:03452:67927", operator: "Reederei Norden-Frisia" },
  { route: "Emden – Borkum", port: "Emden Außenhafen", lat: 53.34447, lon: 7.18618, stopId: "de-DELFI_de:03402:24249", operator: "AG Ems" },
  { route: "Dagebüll – Föhr / Amrum", port: "Dagebüll Mole", lat: 54.72991, lon: 8.69099, stopId: "de-DELFI_de:01054:18719", operator: "W.D.R." },
  { route: "Friedrichshafen – Romanshorn (Bodensee)", port: "Friedrichshafen Hafen", lat: 47.65101, lon: 9.48421, stopId: "ch-opentransportdataswiss26_Parent8011121", operator: "Bodensee-Schiffsbetriebe" },
];

export function ferryLinks(f) {
  const q = encodeURIComponent(`Fähre ${f.route} Preise`);
  return {
    directferries: `https://www.directferries.de/`,
    ferryhopper: `https://www.ferryhopper.com/de/`,
    search: `https://www.google.com/search?q=${q}`,
  };
}
