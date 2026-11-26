import test from "node:test";
import assert from "node:assert/strict";
import { P, leg, itin } from "./helpers.js";
import { checkLeg, checkItinerary, pickBest, pickLatest, matchException, listOptions } from "../js/planner/dticket.js";
import { cutCandidates, chooseCut, truncateItinerary } from "../js/planner/stages.js";
import { planTour } from "../js/planner/tour.js";
import { combineReachability } from "../js/planner/daytrip.js";
import { buildReachTree } from "../js/planner/reachTree.js";
import { classifyFree, bboxHectares } from "../js/planner/homeless.js";
import { parseCity } from "../js/api/city.js";
import { parseMeters, walkHours, fmtHours, symbolText } from "../js/planner/hiking.js";
import { shopCategory, wayToPolygon, placeShops, pickMainStation, linesFromDepartures } from "../js/planner/city.js";
import { classifyInfra, voltageText, maxKv, mergeSegments, infraTitle } from "../js/planner/infra.js";
import { distanceKm } from "../js/lib/geo.js";
import { cityName, hostelworldSlug, bookingLinks } from "../js/planner/booking.js";
import { suggestRoundtrip } from "../js/planner/roundtrip.js";
import { estimatePrice } from "../js/planner/accommodation.js";
import { prepareDepartures, groupOf } from "../js/planner/departures.js";
import { hikingInfo, libraryInfo, waymarkedLink, endpointOrder, bboxAround, budgetQuery } from "../js/api/overpass.js";
import { classify, ohDe } from "../js/planner/budget.js";

const A = P("Hamburg Hbf", 53.55, 10.0), B = P("Uelzen", 52.97, 10.55), C = P("Hannover Hbf", 52.38, 9.74),
  D = P("Göttingen", 51.54, 9.93), E = P("Würzburg Hbf", 49.8, 9.94);

test("D-Ticket: Regionalverkehr ja, ICE nein, IC-Ausnahme mit Hinweis", () => {
  assert.equal(checkLeg(leg("REGIONAL_RAIL", A, B, "08:00", "09:00", { displayName: "RE3" })).ok, true);
  assert.equal(checkLeg(leg("HIGHSPEED_RAIL", A, B, "08:00", "09:00")).ok, false);
  assert.equal(checkLeg(leg("LONG_DISTANCE", A, B, "08:00", "09:00", { displayName: "IC 2022" })).ok, false);
  const ic87 = leg("LONG_DISTANCE", P("Stuttgart Hbf", 0, 0), P("Singen (Htw)", 0, 0), "08:00", "10:00", { routeShortName: "IC87" });
  assert.ok(matchException(ic87));
  assert.equal(checkLeg(ic87).ok, true);
  const icAsRegional = checkLeg(leg("REGIONAL_RAIL", A, B, "08:00", "09:00", { displayName: "IC87 (51983)" }));
  assert.equal(icAsRegional.ok, true);
  assert.equal(icAsRegional.level, "info");
  assert.equal(checkLeg(leg("FERRY", A, B, "08:00", "09:00")).level, "warn");
});

test("Beste und späteste Verbindung ignorieren Fernverkehr", () => {
  const fast = itin([leg("HIGHSPEED_RAIL", A, C, "08:00", "09:15")]);
  const slow = itin([leg("REGIONAL_RAIL", A, B, "08:10", "09:20"), leg("REGIONAL_RAIL", B, C, "09:30", "10:30")]);
  const later = itin([leg("REGIONAL_RAIL", A, C, "09:10", "11:30")]);
  assert.equal(pickBest([fast, slow, later]), slow);
  assert.equal(pickLatest([fast, slow, later]), later);
  assert.equal(checkItinerary(fast).ok, false);
});

const long = itin([
  leg("REGIONAL_RAIL", A, B, "07:00", "08:00", { displayName: "RE3" }),
  leg("REGIONAL_RAIL", B, C, "08:10", "09:20", { displayName: "RE2" }),
  leg("REGIONAL_RAIL", C, D, "09:30", "11:30", { displayName: "RE2", intermediateStops: [P("Kreiensen", 51.85, 9.96, { arrival: "2026-11-25T11:00:00Z", importance: 0.001 })] }),
  leg("REGIONAL_RAIL", D, E, "11:45", "15:30", { displayName: "RE5" }),
]);

test("Etappen nach Fahrzeit: Schnitt am letzten Umstieg im Limit", () => {
  const c = cutCandidates(long, 4.6 * 3600);
  assert.equal(c[0].place.name, "Göttingen");
  const { cut } = chooseCut(long, 4.6 * 3600);
  assert.equal(cut.place.name, "Göttingen");
  const part = truncateItinerary(long, cut);
  assert.equal(part.legs.length, 3);
  assert.equal(part.duration, 4.5 * 3600);
  assert.equal(part.transfers, 2);
});

test("Etappen: Zwischenhalt, wenn Umstieg zu früh läge", () => {
  const it = itin([
    leg("REGIONAL_RAIL", A, B, "07:00", "07:30"),
    leg("REGIONAL_RAIL", B, E, "07:40", "15:00", { intermediateStops: [
      P("X", 52, 10, { arrival: "2026-11-25T10:00:00Z", importance: 0.01 }),
      P("Y", 51, 10, { arrival: "2026-11-25T12:30:00Z", importance: 0.001 }),
    ] }),
  ]);
  const { cut } = chooseCut(it, 6 * 3600);
  assert.equal(cut.place.name, "Y");
  const part = truncateItinerary(it, cut);
  assert.equal(part.legs[1].to.name, "Y");
  assert.equal(part.endTime, "2026-11-25T12:30:00Z");
});

test("Tour: Etappen werden auf Tage verteilt, Rundreise endet zu Hause", async () => {
  const calls = [];
  const api = {
    async plan(from, to) {
      calls.push(`${from.name}→${to.name}`);
      if (from.name === "Hamburg Hbf" && to.name === "Würzburg Hbf") return [long];
      if (from.name === "Göttingen" && to.name === "Würzburg Hbf") return [itin([leg("REGIONAL_RAIL", D, E, "08:00", "11:45")])];
      if (from.name === "Würzburg Hbf" && to.name === "Hamburg Hbf") return [itin([leg("REGIONAL_RAIL", E, A, "08:00", "13:00")])];
      return [];
    },
  };
  const days = await planTour({ start: A, stops: [{ place: E, nights: 2 }], roundtrip: true, startDate: "2026-11-25", maxHours: 5 }, api);
  assert.deepEqual(calls, ["Hamburg Hbf→Würzburg Hbf", "Göttingen→Würzburg Hbf", "Würzburg Hbf→Hamburg Hbf"]);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-25", "2026-11-26", "2026-11-28"]);
  assert.equal(days[0].overnight.name, "Göttingen");
  assert.equal(days[0].reachedTarget, false);
  assert.equal(days[1].overnight.name, "Würzburg Hbf");
  assert.equal(days[2].overnight, null);
});

test("Tour: knapp über dem Limit wird durchgefahren statt kurz vorm Ziel zu übernachten", async () => {
  const it = itin([leg("REGIONAL_RAIL", A, B, "07:00", "09:00"), leg("REGIONAL_RAIL", B, C, "09:10", "13:20")]);
  const days = await planTour({ start: A, stops: [{ place: C, nights: 1 }], roundtrip: false, startDate: "2026-11-25", maxHours: 6 }, { plan: async () => [it] });
  assert.equal(days.length, 1);
  assert.equal(days[0].reachedTarget, true);
  assert.equal(days[0].slightlyOver, true);
});

test("Tour: fehlende Verbindung wird gemeldet statt abzubrechen", async () => {
  const days = await planTour({ start: A, stops: [{ place: B, nights: 1 }], roundtrip: true, startDate: "2026-11-25", maxHours: 6 }, { plan: async () => [] });
  assert.equal(days.length, 2);
  assert.ok(days[0].error);
});

test("Tagestrip: Hin- und Rückweg werden kombiniert", () => {
  const home = P("Erfurt Hbf", 50.97, 11.03);
  const out = { all: [
    { place: { name: "Weimar", lat: 50.99, lon: 11.33, arrival: "2026-11-25T07:20:00Z", modes: ["REGIONAL_RAIL"], importance: 0.002 }, duration: 20, k: 0 },
    { place: { name: "Jena Paradies", lat: 50.92, lon: 11.58, arrival: "2026-11-25T08:00:00Z", modes: ["REGIONAL_RAIL"], importance: 0.001 }, duration: 60, k: 1 },
    { place: { name: "Erfurt, Anger", lat: 50.98, lon: 11.03, arrival: "2026-11-25T07:05:00Z", modes: ["TRAM"] }, duration: 5, k: 0 },
    { place: { name: "Eisenach", lat: 50.98, lon: 10.33, arrival: "2026-11-25T19:00:00Z", modes: ["REGIONAL_RAIL"] }, duration: 120, k: 0 },
  ] };
  const inn = { all: [
    { place: { name: "Weimar", lat: 50.99, lon: 11.33, departure: "2026-11-25T20:30:00Z" }, duration: 20, k: 0 },
    { place: { name: "Jena Paradies", lat: 50.92, lon: 11.58, departure: "2026-11-25T19:50:00Z" }, duration: 60, k: 1 },
    { place: { name: "Eisenach", lat: 50.98, lon: 10.33, departure: "2026-11-25T19:30:00Z" }, duration: 60, k: 0 },
  ] };
  const res = combineReachability(home, out, inn);
  assert.deepEqual(res.map((r) => r.name), ["Weimar", "Jena Paradies"]); // Eisenach: zu kurz; Anger: keine Bahn
  assert.equal(res[0].stay, (20.5 - 7 - 1 / 3) * 3600);
});

test("Rundreise-Vorschlag: neue Bundesländer, eine Station pro Nacht, erreichbar", () => {
  const home = P("Erfurt Hbf", 50.97, 11.04);
  const r = suggestRoundtrip(home, 5, ["DE-SN"], { maxHours: 6, homeState: "DE-TH" });
  assert.equal(r.length, 4);
  const st = r.map((x) => x.state);
  assert.equal(new Set(st).size, 4);
  assert.ok(!st.includes("DE-SN") && !st.includes("DE-TH"));
  assert.deepEqual(suggestRoundtrip(home, 1, []), []);
});

test("Unterkunft: Preis einschätzen", () => {
  assert.equal(estimatePrice({ tourism: "hostel" }).rating, "likely");
  assert.equal(estimatePrice({ tourism: "hotel", stars: "4" }).rating, "unlikely");
  assert.equal(estimatePrice({ tourism: "hotel", price: "45 EUR" }).rating, "likely");
  assert.equal(estimatePrice({ tourism: "hotel", price: "79,00" }).rating, "unlikely");
  assert.equal(estimatePrice({ tourism: "hotel", name: "B&B HOTEL Erfurt" }).rating, "likely");
  assert.equal(estimatePrice({ tourism: "guest_house" }).rating, "maybe");
});

test("Abfahrtstafel: Fernverkehr ausblenden, Dubletten entfernen, sortieren", () => {
  const mk = (mode, name, dep, trip) => ({ mode, displayName: name, tripId: trip, place: { name: "Erfurt Hbf", departure: dep, scheduledDeparture: dep }, tripTo: { name: "X" } });
  const list = [
    mk("TRAM", "2", "2026-11-25T07:05:00Z", "t1"),
    mk("HIGHSPEED_RAIL", "ICE 1", "2026-11-25T07:01:00Z", "t2"),
    mk("REGIONAL_RAIL", "RB20", "2026-11-25T07:00:00Z", "t3"),
    mk("REGIONAL_RAIL", "RB20", "2026-11-25T07:00:00Z", "t3"),
  ];
  const r = prepareDepartures(list);
  assert.deepEqual(r.map((x) => x.displayName), ["RB20", "2"]);
  assert.equal(prepareDepartures(list, { showLongDistance: true }).length, 3);
  assert.equal(groupOf("SUBURBAN"), "sbahn");
  assert.equal(groupOf("SUBWAY"), "ubahn");
});

test("Wanderwege: Netz, Länge, Link", () => {
  const i = hikingInfo({ name: "Rennsteig", network: "nwn", distance: "169,3", from: "Hörschel", to: "Blankenstein" });
  assert.equal(i.label, "National");
  assert.equal(i.km, 169.3);
  assert.equal(i.ends, "Hörschel → Blankenstein");
  assert.equal(hikingInfo({ ref: "X1" }).name, "X1");
  const etappe = hikingInfo({ name: "Etappe", distance: "15", ascent: "300 m", descent: "250" });
  assert.equal(etappe.ascent, 300); assert.equal(etappe.descent, 250); assert.ok(Math.abs(etappe.hours - 4.5) < 1e-9, "3,75 h Strecke + 1,5 h Höhe / 2");
  const fern = hikingInfo({ name: "E8", distance: "4390" });
  assert.equal(fern.hours, null, "keine Gehzeit für Fernwege");
  assert.equal(fern.days, 220);
  assert.equal(waymarkedLink("relation/12345"), "https://hiking.waymarkedtrails.org/#route?id=12345");
});

test("Bibliotheken: WLAN und Art erkennen", () => {
  const i = libraryInfo({ name: "Stadtbibliothek Erfurt", internet_access: "wlan", opening_hours: "Mo-Fr 10:00-19:00" });
  assert.equal(i.wifi, true);
  assert.equal(i.type, "Bibliothek");
  assert.equal(libraryInfo({ name: "Universitätsbibliothek" }).type, "Hochschulbibliothek");
  assert.equal(libraryInfo({}).wifi, false);
});

test("Unterwegs-Modus: Orte richtig einordnen", () => {
  assert.equal(classify({ amenity: "social_facility", name: "Bahnhofsmission Erfurt" }).cat, "help");
  assert.equal(classify({ amenity: "social_facility", social_facility: "food_bank", name: "Tafel" }).cat, "freefood");
  assert.equal(classify({ amenity: "food_sharing" }).cat, "freefood");
  assert.equal(classify({ shop: "supermarket", brand: "Lidl" }).cat, "cheapfood");
  assert.equal(classify({ shop: "supermarket", brand: "Edeka" }), null);
  assert.equal(classify({ amenity: "toilets", fee: "no" }).free, true);
  assert.equal(classify({ amenity: "toilets", fee: "yes" }).free, false);
  assert.equal(classify({ amenity: "drinking_water" }).cat, "water");
  assert.equal(classify({ amenity: "shelter", shelter_type: "public_transport" }), null);
  assert.equal(classify({ amenity: "device_charging_station" }).cat, "power");
  const cafe = classify({ amenity: "cafe", internet_access: "wlan", "internet_access:fee": "no" });
  assert.equal(cafe.cat, "wifi");
  const lib = classify({ amenity: "library", internet_access: "wlan" });
  assert.equal(lib.cat, "library");
  assert.ok(lib.extras.includes("wifi"));
  assert.ok(lib.extras.includes("power?"));
  const mc = classify({ amenity: "fast_food", brand: "McDonald's", internet_access: "wlan", "internet_access:fee": "no" });
  assert.equal(mc.cat, "cheapfood");
  assert.deepEqual(mc.extras, ["wifi"]);
  assert.equal(classify({ amenity: "bench" }), null);
});

test("Overpass: zuletzt erfolgreicher Server zuerst", () => {
  assert.deepEqual(endpointOrder(["a", "b", "c"], 0), ["a", "b", "c"]);
  assert.deepEqual(endpointOrder(["a", "b", "c"], 2), ["c", "a", "b"]);
  // kürzlich ausgefallene Server ans Ende, abgelaufene Sperre zählt nicht
  assert.deepEqual(endpointOrder(["a", "b", "c"], 0, { a: 2000, b: 500 }, 1000), ["b", "c", "a"]);
});

test("Unterwegs-Modus: typische Fehlerquellen", () => {
  // Tagespflege, Pflegeheim, Frauenhaus sind keine Obdachlosenhilfe
  assert.equal(classify({ amenity: "social_facility", social_facility: "day_care", "social_facility:for": "senior" }), null);
  assert.equal(classify({ amenity: "social_facility", social_facility: "shelter", "social_facility:for": "woman" }), null);
  assert.equal(classify({ amenity: "social_facility", social_facility: "day_care", "social_facility:for": "homeless" }).note, "Tagesaufenthalt/Wärmestube");
  // Nicht öffentlich
  assert.equal(classify({ amenity: "toilets", access: "customers" }), null);
  assert.equal(classify({ amenity: "shower", access: "private" }), null);
  assert.equal(classify({ amenity: "canteen", access: "employees" }), null);
  // Wasser
  assert.equal(classify({ amenity: "water_point" }), null);
  assert.equal(classify({ amenity: "water_point", drinking_water: "yes" }).cat, "water");
  assert.equal(classify({ amenity: "drinking_water", drinking_water: "no" }), null);
  assert.match(classify({ amenity: "drinking_water", seasonal: "yes" }).note, /saisonal/);
  // Gebühr unbekannt ist nicht „kostenlos“
  assert.equal(classify({ amenity: "device_charging_station" }).free, false);
  assert.equal(classify({ amenity: "device_charging_station", fee: "no" }).free, true);
  // Tafel ist keine Suppenküche
  assert.match(classify({ amenity: "social_facility", name: "Frankfurter Tafel" }).note, /Tafel/);
  // E-Auto-Ladesäule mit Schuko ist keine Handy-Steckdose
  assert.equal(classify({ amenity: "charging_station", "socket:schuko": "1" }), null);
  // Bibliothek ohne WLAN-Angabe: eigene Kategorie, ehrlicher Hinweis
  const lib = classify({ amenity: "library" });
  assert.equal(lib.cat, "library");
  assert.match(lib.note, /Bibliotheksausweis/);
});

test("Öffnungszeiten eindeutschen", () => {
  assert.equal(ohDe("Th, Fr 14:30-17:30; Su 14:30-16:30"), "Do, Fr 14:30–17:30; So 14:30–16:30");
  assert.equal(ohDe("Mo-Fr 08:00-18:00; PH off"), "Mo-Fr 08:00–18:00; Feiertag geschlossen");
  assert.equal(ohDe("24/7"), "rund um die Uhr");
  assert.equal(ohDe(""), null);
});

test("Unterwegs-Abfrage: Rechteck statt around, keine Namenssuche über alles", () => {
  const bb = bboxAround({ lat: 50.1071, lon: 8.6638 }, 1500).split(",").map(Number);
  assert.ok(Math.abs(bb[2] - bb[0] - 0.02695) < 0.0002); // 2 × 1,5 km in Breitengrad
  assert.ok(bb[3] - bb[1] > bb[2] - bb[0]); // in Längengrad breiter (Deutschland)
  const q = budgetQuery(bb.join(","));
  assert.match(q, /\[bbox:50\.0936/);
  assert.doesNotMatch(q, /around/);
  assert.doesNotMatch(q, /^\s*nwr\["name"/m);
});

test("buildReachTree: Orte entlang einer Strecke werden zu einer Linie verbunden", () => {
  const home = P("Start", 50.0, 10.0);
  const d = (name, lat, lon, outMinutes) => ({ ...P(name, lat, lon), outMinutes });
  // Nach Norden: A → B → C, nach Osten: D → E, dazu ein Abzweig F von B nach Westen
  const dests = [
    d("C", 50.6, 10.0, 90), d("A", 50.2, 10.0, 20), d("B", 50.4, 10.0, 50),
    d("E", 50.0, 10.6, 70), d("D", 50.0, 10.3, 30), d("F", 50.4, 9.8, 65),
  ];
  const { nodes, branches } = buildReachTree(home, dests);
  const parentOf = (n) => { const x = nodes.find((y) => y.name === n); return x.parent < 0 ? "Start" : nodes[x.parent].name; };
  assert.equal(parentOf("A"), "Start");
  assert.equal(parentOf("B"), "A");
  assert.equal(parentOf("C"), "B");
  assert.equal(parentOf("D"), "Start");
  assert.equal(parentOf("E"), "D");
  assert.equal(parentOf("F"), "B");
  const lines = branches.map((b) => [b.from.name, ...b.stops.map((s) => s.name)].join("-")).sort();
  assert.deepEqual(lines, ["B-F", "Start-A-B-C", "Start-D-E"]);
  assert.equal(branches.find((b) => b.end.name === "C").stops.length, 3);
});

test("buildReachTree: leere Eingabe", () => {
  assert.deepEqual(buildReachTree(P("S", 50, 10), []), { nodes: [], branches: [] });
});

test("classifyFree: Parks, Museen, Kirchen, Bücherschränke", () => {
  assert.equal(classifyFree({ leisure: "park", name: "Karlsaue" }).cat, "park");
  assert.equal(classifyFree({ leisure: "park" }), null, "Parks ohne Namen weglassen");
  assert.equal(classifyFree({ leisure: "garden", name: "Hof", "garden:type": "private" }), null);
  assert.equal(classifyFree({ leisure: "garden", name: "Botanischer Garten", "garden:type": "botanical" }).note, "Botanischer Garten");
  assert.equal(classifyFree({ leisure: "park", name: "Privatpark", access: "private" }), null);
  const m = classifyFree({ tourism: "museum", name: "Stadtmuseum", fee: "no" });
  assert.equal(m.cat, "museum"); assert.equal(m.free, true);
  assert.equal(classifyFree({ tourism: "museum", name: "Kunsthalle" }).free, false, "Eintritt unbekannt = nicht kostenlos");
  assert.equal(classifyFree({ amenity: "place_of_worship", name: "Dom", building: "cathedral" }).cat, "church");
  assert.equal(classifyFree({ amenity: "public_bookcase" }).cat, "books");
  assert.equal(classifyFree({ leisure: "fitness_station" }).cat, "fitness");
  assert.equal(classifyFree({ shop: "mall", name: "City-Point" }).cat, "mall");
  assert.equal(classifyFree({ historic: "castle", name: "Löwenburg", fee: "yes" }).free, false);
  assert.equal(classifyFree({ amenity: "bench" }), null);
});

test("bboxHectares: grobe Fläche aus dem Rechteck", () => {
  // 0,01° × 0,01° bei 51° ≈ 1,113 km × 0,700 km ≈ 78 ha
  const ha = bboxHectares({ minlat: 51, maxlat: 51.01, minlon: 9, maxlon: 9.01 });
  assert.ok(ha > 70 && ha < 85, `ha=${ha}`);
  assert.equal(bboxHectares(undefined), 0);
});

test("parseCity: Nominatim-Antwort → Name, Rechteck, Umriss als lat/lon", () => {
  const c = parseCity({
    name: "Kassel", osm_type: "relation", boundingbox: ["51.26", "51.37", "9.35", "9.57"],
    geojson: { type: "Polygon", coordinates: [[[9.35, 51.26], [9.57, 51.26], [9.57, 51.37], [9.35, 51.26]]] },
  });
  assert.equal(c.name, "Kassel");
  assert.deepEqual(c.bounds, [51.26, 9.35, 51.37, 9.57]);
  assert.deepEqual(c.outline[0][1], [51.26, 9.57]);
  assert.equal(parseCity({ osm_type: "node", boundingbox: ["1", "2", "3", "4"] }), null, "Punkt statt Gemeindegrenze");
  assert.equal(parseCity(null), null);
});

test("Wandern: Höhenmeter lesen, Gehzeit nach DIN 33466, Markierung", () => {
  assert.equal(parseMeters("450"), 450);
  assert.equal(parseMeters("450 m"), 450);
  assert.equal(parseMeters("1.200 m"), 1200);
  assert.equal(parseMeters("1,2 km"), 1200);
  assert.equal(parseMeters("viel"), null);
  assert.equal(parseMeters(undefined), null);
  // 12 km, 600 Hm hoch, 600 runter: Strecke 3 h, Höhe 2 h + 1,2 h = 3,2 h → 3,2 + 3/2 = 4,7 h
  assert.ok(Math.abs(walkHours(12, 600, 600) - 4.7) < 1e-9);
  assert.equal(walkHours(8), 2);
  assert.equal(walkHours(null), null);
  assert.equal(fmtHours(4.7), "4 h 45 min");
  assert.equal(fmtHours(2), "2 h");
  assert.equal(fmtHours(0.5), "30 min");
  assert.equal(symbolText("red:white:red_bar"), "rot Balken auf weiß");
  assert.equal(symbolText("blue:white:blue_lower:X1:black"), "blau Winkel unten auf weiß, Text „X1“");
  assert.equal(symbolText(null), null);
});

test("Stadt: Ladenkategorien, Bahnhofsumriss, im Bahnhof oder Umkreis", () => {
  assert.equal(shopCategory({ shop: "supermarket" }), "food");
  assert.equal(shopCategory({ amenity: "cafe" }), "bakery");
  assert.equal(shopCategory({ amenity: "fast_food" }), "eat");
  assert.equal(shopCategory({ amenity: "pharmacy" }), "health");
  assert.equal(shopCategory({ shop: "newsagent" }), "press");
  assert.equal(shopCategory({ amenity: "atm" }), "money");
  assert.equal(shopCategory({ amenity: "toilets" }), "service");
  assert.equal(shopCategory({ shop: "clothes" }), "other");
  assert.equal(shopCategory({ shop: "vacant" }), null);
  assert.equal(shopCategory({ amenity: "bench" }), null);

  assert.equal(wayToPolygon([{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, { lat: 1, lon: 1 }]), null, "offener Weg");
  const poly = wayToPolygon([{ lat: 50.0, lon: 7.0 }, { lat: 50.002, lon: 7.0 }, { lat: 50.002, lon: 7.003 }, { lat: 50.0, lon: 7.003 }, { lat: 50.0, lon: 7.0 }]);
  const st = { lat: 50.001, lon: 7.0015 };
  const shops = placeShops(st, [
    { id: "n/1", lat: 50.001, lon: 7.001, tags: { shop: "bakery", name: "Im Bahnhof" } },
    { id: "n/2", lat: 50.004, lon: 7.0015, tags: { shop: "kiosk", name: "Vorplatz" } },
    { id: "n/3", lat: 50.02, lon: 7.0, tags: { shop: "kiosk", name: "Zu weit" } },
    { id: "n/4", lat: 50.001, lon: 7.002, tags: { amenity: "bench" } },
    { id: "n/1", lat: 50.001, lon: 7.001, tags: { shop: "bakery", name: "Doppelt" } },
  ], [poly]);
  assert.deepEqual(shops.map((s) => [s.tags.name, s.inside]), [["Im Bahnhof", true], ["Vorplatz", false]]);
  // ohne Umriss: nah am Bahnhofspunkt zählt als „im Bahnhof“
  assert.equal(placeShops(st, [{ id: "a", lat: 50.0012, lon: 7.0015, tags: { shop: "kiosk" } }]).at(0).inside, true);
});

test("Stadt: Hauptbahnhof wählen, Linien aus Abfahrten", () => {
  const city = { name: "Koblenz", lat: 50.356, lon: 7.598 };
  const S = (name, lat, lon, rail = true) => ({ type: "STOP", name, lat, lon, rail });
  const pick = pickMainStation(city, [S("Koblenz Stadtmitte", 50.357, 7.596), S("Koblenz Hbf", 50.351, 7.589), S("Bushalt Markt", 50.36, 7.6, false), S("Köln Hbf", 50.94, 6.96)]);
  assert.equal(pick.name, "Koblenz Hbf");
  assert.equal(pickMainStation(city, [S("Bushalt", 50.36, 7.6, false)]), null);

  const d = (group, routeShortName, headsign) => ({ group, routeShortName, headsign, mode: "BUS" });
  const lines = linesFromDepartures([d("bus", "10", "Lützel"), d("bus", "10", "Lützel"), d("bus", "10", "Horchheim"), d("bus", "2", "Metternich"), d("zug", "RE 1", "Trier")]);
  assert.deepEqual(lines.map((l) => l.name), ["2", "10", "RE 1"], "numerisch sortiert");
  assert.deepEqual(lines.find((l) => l.name === "10").dests, ["Lützel", "Horchheim"]);
});

test("Infrastruktur: Einordnung, Spannung, Abschnitte zusammenfassen", () => {
  assert.equal(voltageText("380000;110000"), "380 kV / 110 kV");
  assert.equal(voltageText("20000"), "20 kV");
  assert.equal(voltageText(""), null);
  assert.equal(maxKv("110000;380000"), 380);
  const sub = classifyInfra({ power: "substation", voltage: "110000", operator: "Westnetz" });
  assert.equal(sub.cat, "power"); assert.equal(sub.kind, "Umspannwerk");
  assert.deepEqual(sub.facts, ["110 kV", "Betreiber: Westnetz"]);
  assert.equal(classifyInfra({ power: "plant", "plant:source": "coal" }).kind, "Kraftwerk (Kohle)");
  assert.equal(classifyInfra({ bridge: "viaduct", railway: "rail" }).kind, "Viadukt");
  assert.equal(classifyInfra({ waterway: "lock_gate" }).kind, "Schleuse");
  assert.equal(classifyInfra({ man_made: "tower", "tower:type": "communication", height: "180", start_date: "1975-05" }).facts.join("|"), "Höhe 180 m|seit 1975");
  assert.equal(classifyInfra({ railway: "signal_box" }).kind, "Stellwerk");
  assert.equal(classifyInfra({ "disused:railway": "station" }).cat, "lost");
  assert.equal(classifyInfra({ railway: "abandoned" }).cat, "rail");
  assert.equal(classifyInfra({ amenity: "bench" }), null);
  assert.equal(infraTitle({ "bridge:name": "Pfaffendorfer Brücke" }, "Brücke"), "Pfaffendorfer Brücke");
  const seg = (id, lat) => ({ id, lat, lon: 7.6, cat: "bridge", title: "Moselbrücke", tags: {} });
  const merged = mergeSegments([seg("a", 50.35), seg("b", 50.3505), seg("c", 50.40)], distanceKm);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].parts, 2);
});

test("Buchen: Ortsname, Hostelworld-Name, Suchlinks", () => {
  assert.equal(cityName("Koblenz Hbf"), "Koblenz");
  assert.equal(cityName("Frankfurt (Main) Hbf"), "Frankfurt");
  assert.equal(cityName("Köln Messe/Deutz"), "Köln");
  assert.equal(cityName("Berlin Ostkreuz"), "Berlin Ostkreuz", "unbekannte Zusätze bleiben");
  assert.equal(cityName("Bad Ems"), "Bad Ems");
  assert.equal(hostelworldSlug("München"), "munich");
  assert.equal(hostelworldSlug("Würzburg"), "wurzburg");
  assert.equal(hostelworldSlug("Göttingen"), "gottingen");
  assert.equal(hostelworldSlug("Bad Ems"), "bad-ems");

  const r = bookingLinks({ name: "Koblenz Hbf" }, { checkin: "2026-12-05", checkout: "2026-12-07", adults: 2, maxPrice: 40 });
  assert.equal(r.city, "Koblenz");
  const booking = r.budget[0].url;
  assert.match(booking, /^https:\/\/www\.booking\.com\/searchresults\.de\.html\?ss=Koblenz&checkin=2026-12-05&checkout=2026-12-07&group_adults=2/);
  assert.match(booking, /order=price/);
  assert.match(decodeURIComponent(booking), /nflt=ht_id=203;ht_id=205;ht_id=216;price=EUR-min-40-1$/);
  const privat = r.budget.find((l) => l.label === "Privatzimmer").url;
  assert.equal(privat, "https://www.airbnb.de/s/Koblenz/homes?checkin=2026-12-05&checkout=2026-12-07&adults=2&price_max=40&room_types%5B%5D=Private%20room");
  assert.equal(r.budget.find((l) => l.site === "Hostelworld").url, "https://www.hostelworld.com/hostels/europe/germany/koblenz/");
  assert.equal(r.budget.find((l) => l.site === "Kayak").url, "https://www.kayak.de/hotels/Koblenz/2026-12-05/2026-12-07/2adults");
  assert.match(r.rentals[0].url, /room_types%5B%5D=Entire%20home%2Fapt/);
  assert.match(r.rentals[2].note, /2 Nächte/);
  // Umlaute im Ortsnamen werden für die URL kodiert
  assert.match(bookingLinks({ name: "Würzburg Hbf" }, { checkin: "2026-12-05", checkout: "2026-12-06" }).budget[0].url, /ss=W%C3%BCrzburg/);
});

test("listOptions: Rückfahrten ohne Doppelte, ohne überholte, ohne Fernverkehr", () => {
  const A = P("Koblenz", 50.35, 7.59), B = P("Mainz", 50.0, 8.26);
  const re = (s, e) => itin([leg("REGIONAL_RAIL", A, B, s, e, { displayName: "RE2" })]);
  const ice = itin([leg("HIGHSPEED_RAIL", A, B, "09:00", "09:50", { displayName: "ICE 123" })]);
  const opts = listOptions([re("10:00", "11:30"), re("09:00", "10:30"), re("09:00", "10:30"), re("09:10", "11:40"), ice, re("11:00", "12:30")]);
  // 09:10 → 11:40 ist überholt (09:00 → 10:30 und 10:00 → 11:30 sind besser), ICE nicht mit D-Ticket
  assert.deepEqual(opts.map((o) => o.startTime.slice(11, 16)), ["09:00", "10:00", "11:00"]);
  assert.deepEqual(listOptions([]), []);
});

test("YouTuber: Tempo Bahn und Autobahn, Brücken-Regeln, Antwort aufteilen", async () => {
  const { parseSpeed, parseHeight, classifySpeed, speedVisible, classifyInfra } = await import("../js/planner/infra.js");
  const { splitInfra } = await import("../js/api/overpass.js");
  assert.equal(parseSpeed("none"), Infinity);
  assert.equal(parseSpeed("DE:motorway"), Infinity);
  assert.equal(parseSpeed("signals"), "variabel");
  assert.equal(parseSpeed("120;80"), 120);
  assert.equal(parseSpeed("60 mph"), 97);
  assert.equal(parseHeight("82.5 m"), 83);
  const bahn = classifySpeed({ railway: "rail", maxspeed: "300" });
  const frei = classifySpeed({ highway: "motorway", maxspeed: "none", ref: "A 9" });
  const t120 = classifySpeed({ highway: "motorway", maxspeed: "120" });
  assert.equal(frei.label, "unbegrenzt");
  assert.equal(classifySpeed({ highway: "primary", maxspeed: "100" }), null); // keine normalen Straßen
  assert.equal(speedVisible(bahn, { railMin: 250 }), true);
  assert.equal(speedVisible(classifySpeed({ railway: "rail", maxspeed: "160" }), { railMin: 200 }), false);
  assert.equal(speedVisible(frei, { motorway: "none" }), true);
  assert.equal(speedVisible(t120, { motorway: "none" }), false);
  assert.equal(speedVisible(t120, { motorway: "le120" }), true);
  // Brücken: normale Straßenbrücke raus, Autobahn/über Autobahn/hoch/Bahn drin
  assert.equal(classifyInfra({ bridge: "yes", highway: "residential", name: "Kleine Brücke" }), null);
  assert.equal(classifyInfra({ bridge: "yes", highway: "motorway", ref: "A 7" }).kind, "Autobahnbrücke");
  assert.equal(classifyInfra({ bridge: "yes", highway: "tertiary", _overMotorway: true }).kind, "Brücke über die Autobahn");
  const hoch = classifyInfra({ bridge: "yes", highway: "secondary", height: "185", name: "Kochertalbrücke" });
  assert.deepEqual([hoch.kind, hoch.facts[0]], ["Brücke", "185 m hoch"]);
  assert.equal(classifyInfra({ bridge: "yes", railway: "rail", name: "Göltzschtalbrücke" }).kind, "Eisenbahnbrücke");
  const r = splitInfra({ elements: [
    { type: "way", id: 1, center: { lat: 50, lon: 10 }, tags: { bridge: "yes", railway: "rail", name: "X" } },
    { type: "marker", tags: { part: "over" } },
    { type: "way", id: 1, center: { lat: 50, lon: 10 }, tags: { bridge: "yes", railway: "rail", name: "X" } },
    { type: "way", id: 2, center: { lat: 50, lon: 10.001 }, tags: { bridge: "yes", highway: "tertiary" } },
    { type: "marker", tags: { part: "speed" } },
    { type: "way", id: 3, geometry: [{ lat: 50, lon: 10 }, { lat: 50.1, lon: 10 }], tags: { highway: "motorway", maxspeed: "none" } },
    { type: "marker", tags: { part: "lines" } },
  ] }, { lat: 50, lon: 10 });
  assert.equal(r.points.length, 2);
  assert.ok(r.points.every((p) => p.tags._overMotorway));
  assert.equal(r.speed.length, 1);
  assert.equal(r.lines.length, 0);
});

test("Merkliste: Reise speichern, Standardstrecke umschalten", async () => {
  globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } };
  const { state, saveTrip, toggleRoute, isRouteSaved, exportAll } = await import("../js/state.js");
  const A = { name: "Erfurt Hbf", lat: 50.97, lon: 11.04, stopId: "x:1" }, B = { name: "Leipzig Hbf", lat: 51.35, lon: 12.38 };
  const it = { startTime: "2026-12-01T07:00:00Z", endTime: "2026-12-01T09:00:00Z", duration: 7200, transfers: 0, legs: [{ mode: "REGIONAL_RAIL", from: A, to: B, startTime: "2026-12-01T07:00:00Z", endTime: "2026-12-01T09:00:00Z", steps: [1, 2], alternatives: [] }] };
  assert.equal(saveTrip({ from: A, to: B, itinerary: it }), true);
  assert.equal(saveTrip({ from: A, to: B, itinerary: it }), false); // doppelt
  assert.equal(state.trips[0].itinerary.legs[0].steps, undefined); // große Felder weg
  assert.equal(toggleRoute(A, B), true);
  assert.equal(isRouteSaved({ ...A, name: "anders" }, B), true); // gleiche stopId
  assert.equal(toggleRoute(A, B), false);
  assert.equal(isRouteSaved(A, B), false);
  assert.ok(JSON.parse(exportAll()).trips.length === 1);
});

test("Bubatzkarte: Einrichtungen erkennen, Zonenradius, Fußgängerzone 7–20 Uhr", async () => {
  const { classifyBubatz, zoneRadius, pedestrianBanActive, bubatzQuery } = await import("../js/planner/bubatz.js");
  assert.equal(classifyBubatz({ amenity: "school" }), "school");
  assert.equal(classifyBubatz({ amenity: "kindergarten" }), "kids");
  assert.equal(classifyBubatz({ amenity: "community_centre", community_centre: "youth_centre" }), "kids");
  assert.equal(classifyBubatz({ leisure: "playground" }), "playground");
  assert.equal(classifyBubatz({ leisure: "pitch", access: "private" }), null);
  assert.equal(classifyBubatz({ highway: "pedestrian" }), "pedestrian");
  assert.equal(classifyBubatz({ amenity: "bench" }), null);
  assert.equal(zoneRadius(null), 100);
  const r = zoneRadius({ minlat: 50, maxlat: 50.001, minlon: 10, maxlon: 10.001 }); // ca. 111 × 71 m
  assert.ok(r > 160 && r < 170);
  assert.equal(pedestrianBanActive(new Date("2026-11-26T12:00:00Z")), true); // 13 Uhr
  assert.equal(pedestrianBanActive(new Date("2026-11-26T20:30:00Z")), false); // 21:30 Uhr
  assert.match(bubatzQuery("1,2,3,4"), /\[bbox:1,2,3,4\]/);
});
