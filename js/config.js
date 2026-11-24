// Zentrale Konfiguration des D-Ticket Reiseplaners.
// Alles, was man ohne Programmierkenntnisse pflegen möchte, steht hier.

export const APP = {
  name: "D-Ticket Reiseplaner",
  maxPricePerNight: 50, // Euro, Obergrenze für Unterkünfte
  timeZone: "Europe/Berlin",
};

// Transitous (MOTIS 2) – freie Fahrplanauskunft, https://transitous.org
export const TRANSITOUS = {
  base: "https://api.transitous.org",
  // Verkehrsmittel, die mit dem Deutschlandticket grundsätzlich nutzbar sind.
  dticketModes: ["REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "SUBURBAN", "SUBWAY", "TRAM", "BUS", "FERRY"],
  // Für Erreichbarkeitskarten nur Schiene – sonst werden die Antworten riesig (>10 MB).
  railModes: ["REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "SUBURBAN"],
  maxTransfers: 8,
};

// Overpass-Server (OpenStreetMap-Abfragen). Kein API-Schlüssel nötig.
// Ist einer überlastet (502/504/429) oder zu langsam, wird der nächste gefragt;
// der zuletzt erfolgreiche Server kommt beim nächsten Mal zuerst dran.
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
export const OVERPASS_TIMEOUT_S = 25; // Server-Timeout pro Abfrage

// Wetter: Bright Sky liefert die Daten des Deutschen Wetterdienstes (DWD Open Data).
export const WEATHER = { brightSky: "https://api.brightsky.dev" };

// ---------------------------------------------------------------------------
// Karten. Pflicht: Quellenhinweis pro Karte (attribution).
// ---------------------------------------------------------------------------
export const BASE_LAYERS = {
  "OSM Deutschland": {
    url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
    options: {
      maxZoom: 18,
      attribution:
        'Karte: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, Kacheln: <a href="https://www.fossgis.de/">FOSSGIS e.V.</a>',
    },
    // FOSSGIS-Kacheln: für den Eigengebrauch ok, vor einer Weitergabe der App beim Betreiber nachfragen.
    allowPrefetch: false,
  },
  "ÖPNVKarte": {
    url: "https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png",
    options: {
      maxZoom: 18,
      attribution:
        'Karte: <a href="https://www.öpnvkarte.de/">ÖPNVKarte</a> (Kacheln CC BY-SA 2.0), Daten &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    },
    allowPrefetch: true,
  },
};

export const OVERLAY_LAYERS = {
  OpenRailwayMap: {
    url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
    options: {
      subdomains: "abc",
      maxZoom: 19,
      opacity: 0.8,
      attribution:
        'Strecken: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC BY-SA 2.0), Daten &copy; OpenStreetMap-Mitwirkende',
    },
  },
};

// Markierte Wanderwege (Waymarked Trails, Daten aus OSM).
OVERLAY_LAYERS.Wanderwege = {
  url: "https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",
  options: {
    maxZoom: 18,
    opacity: 0.8,
    attribution: 'Wanderwege: <a href="https://hiking.waymarkedtrails.org/">Waymarked Trails</a> (CC BY-SA 3.0), Daten &copy; OpenStreetMap-Mitwirkende',
  },
};

// YouTuber-Modus: Karten öffentlicher Infrastruktur (Rasterkacheln, zuschaltbar im Reiter).
// OpenInfraMap gibt es nur als Vektorkacheln – dafür sucht der Reiter Strom & Co. selbst in OSM.
const ORM_ATTR = 'Bahn: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC BY-SA 2.0), Daten &copy; OpenStreetMap-Mitwirkende';
export const INFRA_LAYERS = {
  "Bahn: Strecken & Bahnhöfe": { url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", options: { subdomains: "abc", maxZoom: 19, opacity: 0.85, attribution: ORM_ATTR } },
  "Bahn: Höchstgeschwindigkeit": { url: "https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png", options: { subdomains: "abc", maxZoom: 19, opacity: 0.85, attribution: ORM_ATTR } },
  "Bahn: Signale": { url: "https://{s}.tiles.openrailwaymap.org/signals/{z}/{x}/{y}.png", options: { subdomains: "abc", maxZoom: 19, opacity: 0.9, attribution: ORM_ATTR } },
  "Bahn: Elektrifizierung": { url: "https://{s}.tiles.openrailwaymap.org/electrification/{z}/{x}/{y}.png", options: { subdomains: "abc", maxZoom: 19, opacity: 0.85, attribution: ORM_ATTR } },
  "Wasserstraßen & Schleusen": { url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", options: { maxZoom: 18, attribution: 'Seezeichen: <a href="https://www.openseamap.org/">OpenSeaMap</a> (CC BY-SA 2.0)' } },
  "Radwege": { url: "https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png", options: { maxZoom: 18, opacity: 0.8, attribution: 'Radwege: <a href="https://cycling.waymarkedtrails.org/">Waymarked Trails</a> (CC BY-SA 3.0)' } },
};

export const RAIN_RADAR = {
  // Niederschlagsradar des DWD als WMS (Open Data, Quellenvermerk „Deutscher Wetterdienst“).
  url: "https://maps.dwd.de/geoserver/dwd/wms",
  options: {
    layers: "dwd:Niederschlagsradar",
    format: "image/png",
    transparent: true,
    opacity: 0.6,
    attribution: 'Regenradar: <a href="https://www.dwd.de/">Deutscher Wetterdienst</a>',
  },
};

// Service Worker: Kacheln zwischenspeichern ja, massenhaft vorladen nein.
export const OFFLINE = {
  maxCachedTiles: 2500, // so viele Kacheln hält der Cache insgesamt
  prefetchMaxTiles: 400, // Obergrenze für ein Offline-Paket
  prefetchZooms: [9, 10, 11, 12],
  prefetchConcurrency: 2,
};

// ---------------------------------------------------------------------------
// IC-Ausnahmestrecken: IC-Abschnitte, die mit dem Deutschlandticket nutzbar sind.
// Die Regelungen ändern sich (meist zum Fahrplanwechsel im Dezember)!
// Jeder Eintrag: Linie(n), Bahnhöfe, zwischen denen der IC freigegeben ist,
// und wann der Eintrag zuletzt geprüft wurde. Vor der Fahrt immer gegenprüfen.
// Hinweis: Manche freigegebenen ICs (z. B. IC 87) führt Transitous bereits als
// Regionalverkehr – die werden dann ohnehin gefunden.
// ---------------------------------------------------------------------------
export const IC_EXCEPTIONS = [
  {
    lines: ["IC 87"],
    stations: ["Stuttgart Hbf", "Böblingen", "Herrenberg", "Horb", "Rottweil", "Tuttlingen", "Singen"],
    region: "Baden-Württemberg (Gäubahn)",
    checked: "ungeprüft – bitte bestätigen",
  },
  {
    lines: ["IC 56"],
    stations: ["Bremen Hbf", "Oldenburg", "Leer", "Emden", "Norden", "Norddeich", "Norddeich Mole"],
    region: "Niedersachsen/Bremen (Bremen–Norddeich Mole)",
    checked: "ungeprüft – bitte bestätigen",
  },
];

// Knotenbahnhöfe je Bundesland – Kandidaten für Etappenorte im Rundreise-Vorschlag.
// Bewusst eher mittelgroße Städte: Unterkünfte sind dort meist günstiger.
export const HUBS = {
  "DE-BW": [{ name: "Offenburg", lat: 48.47648, lon: 7.94672 }, { name: "Ulm Hbf", lat: 48.39935, lon: 9.98293 }, { name: "Crailsheim", lat: 49.13557, lon: 10.07117 }, { name: "Singen (Hohentwiel)", lat: 47.75888, lon: 8.84127 }, { name: "Heilbronn Hbf", lat: 49.14331, lon: 9.20771 }],
  "DE-BY": [{ name: "Würzburg Hbf", lat: 49.80203, lon: 9.93594 }, { name: "Regensburg Hbf", lat: 49.01167, lon: 12.09962 }, { name: "Treuchtlingen", lat: 48.96127, lon: 10.90816 }, { name: "Hof Hbf", lat: 50.30833, lon: 11.92361 }, { name: "Lindau-Reutin", lat: 47.55248, lon: 9.70292 }, { name: "Passau Hbf", lat: 48.57379, lon: 13.44908 }, { name: "Bamberg", lat: 49.90076, lon: 10.89949 }],
  "DE-BE": [{ name: "Berlin Ostkreuz", lat: 52.50311, lon: 13.46922 }, { name: "Berlin Spandau", lat: 52.53462, lon: 13.19754 }],
  "DE-BB": [{ name: "Cottbus Hbf", lat: 51.75047, lon: 14.32747 }, { name: "Frankfurt (Oder)", lat: 52.33671, lon: 14.54715 }, { name: "Wittenberge", lat: 53.00388, lon: 11.76258 }, { name: "Eberswalde Hbf", lat: 52.83368, lon: 13.79695 }, { name: "Brandenburg Hbf", lat: 52.40107, lon: 12.55925 }],
  "DE-HB": [{ name: "Bremen Hbf", lat: 53.08348, lon: 8.81383 }, { name: "Bremerhaven Hbf", lat: 53.53491, lon: 8.59956 }],
  "DE-HH": [{ name: "Hamburg-Harburg", lat: 53.45555, lon: 9.99243 }, { name: "Hamburg Hbf", lat: 53.55238, lon: 10.00749 }],
  "DE-HE": [{ name: "Fulda", lat: 50.5549, lon: 9.68417 }, { name: "Gießen", lat: 50.57906, lon: 8.66146 }, { name: "Bebra", lat: 50.96957, lon: 9.79779 }, { name: "Marburg Hbf", lat: 50.81927, lon: 8.77501 }],
  "DE-MV": [{ name: "Schwerin Hbf", lat: 53.63474, lon: 11.40746 }, { name: "Güstrow", lat: 53.8006, lon: 12.17284 }, { name: "Stralsund Hbf", lat: 54.30829, lon: 13.07802 }, { name: "Neubrandenburg", lat: 53.56183, lon: 13.26146 }, { name: "Pasewalk", lat: 53.51504, lon: 13.98929 }],
  "DE-NI": [{ name: "Uelzen", lat: 52.96978, lon: 10.55305 }, { name: "Göttingen", lat: 51.53682, lon: 9.92607 }, { name: "Oldenburg(Oldb) Hbf", lat: 53.14432, lon: 8.22271 }, { name: "Osnabrück Hbf", lat: 52.27285, lon: 8.06178 }, { name: "Lüneburg", lat: 53.24966, lon: 10.41989 }, { name: "Goslar", lat: 51.91157, lon: 10.42144 }],
  "DE-NW": [{ name: "Hamm (Westf) Hbf", lat: 51.67808, lon: 7.80782 }, { name: "Paderborn Hbf", lat: 51.71298, lon: 8.7405 }, { name: "Münster (Westf) Hbf", lat: 51.95694, lon: 7.63607 }, { name: "Aachen Hbf", lat: 50.76776, lon: 6.09139 }, { name: "Siegen Hbf", lat: 50.87594, lon: 8.01651 }],
  "DE-RP": [{ name: "Koblenz Hbf", lat: 50.35084, lon: 7.58844 }, { name: "Trier Hbf", lat: 49.75685, lon: 6.65245 }, { name: "Kaiserslautern Hbf", lat: 49.43586, lon: 7.76863 }, { name: "Bingen Hbf", lat: 49.96915, lon: 7.88272 }],
  "DE-SL": [{ name: "Saarbrücken Hbf", lat: 49.24107, lon: 6.99102 }, { name: "Homburg (Saar) Hbf", lat: 49.32808, lon: 7.33703 }],
  "DE-SN": [{ name: "Chemnitz Hbf", lat: 50.83963, lon: 12.93069 }, { name: "Görlitz", lat: 51.14681, lon: 14.97874 }, { name: "Riesa", lat: 51.30964, lon: 13.28789 }, { name: "Zwickau Hbf", lat: 50.71565, lon: 12.47772 }, { name: "Plauen (Vogtl) ob Bf", lat: 50.50445, lon: 12.13663 }],
  "DE-ST": [{ name: "Magdeburg Hbf", lat: 52.13051, lon: 11.62696 }, { name: "Halle (Saale) Hbf", lat: 51.47751, lon: 11.98709 }, { name: "Stendal Hbf", lat: 52.59472, lon: 11.85441 }, { name: "Halberstadt Hbf", lat: 51.89931, lon: 11.07345 }, { name: "Naumburg (Saale) Hbf", lat: 51.16307, lon: 11.79698 }],
  "DE-SH": [{ name: "Neumünster", lat: 54.07575, lon: 9.97982 }, { name: "Kiel Hbf", lat: 54.31498, lon: 10.13198 }, { name: "Flensburg", lat: 54.77404, lon: 9.43653 }, { name: "Husum", lat: 54.47208, lon: 9.05595 }, { name: "Lübeck Hbf", lat: 53.86618, lon: 10.66918 }],
  "DE-TH": [{ name: "Erfurt Hbf", lat: 50.97244, lon: 11.0375 }, { name: "Saalfeld (Saale)", lat: 50.65027, lon: 11.37458 }, { name: "Eisenach", lat: 50.97692, lon: 10.33199 }, { name: "Gera Hbf", lat: 50.88351, lon: 12.07906 }, { name: "Nordhausen", lat: 51.49292, lon: 10.78925 }],
};

export const STATES = {
  "DE-BW": "Baden-Württemberg", "DE-BY": "Bayern", "DE-BE": "Berlin", "DE-BB": "Brandenburg",
  "DE-HB": "Bremen", "DE-HH": "Hamburg", "DE-HE": "Hessen", "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Niedersachsen", "DE-NW": "Nordrhein-Westfalen", "DE-RP": "Rheinland-Pfalz",
  "DE-SL": "Saarland", "DE-SN": "Sachsen", "DE-ST": "Sachsen-Anhalt",
  "DE-SH": "Schleswig-Holstein", "DE-TH": "Thüringen",
};

// Faustwert für Luftlinien-km pro Fahrstunde im Nahverkehr (inkl. Umstiege).
export const AIR_KM_PER_HOUR = 45;
