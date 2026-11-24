import test from "node:test";
import assert from "node:assert/strict";
import { P, leg, itin } from "./helpers.js";
import { checkLeg, checkItinerary, pickBest, pickLatest, matchException } from "../js/planner/dticket.js";
import { cutCandidates, chooseCut, truncateItinerary } from "../js/planner/stages.js";
import { planTour } from "../js/planner/tour.js";
import { combineReachability } from "../js/planner/daytrip.js";
import { suggestRoundtrip } from "../js/planner/roundtrip.js";
import { estimatePrice } from "../js/planner/accommodation.js";
import { prepareDepartures, groupOf } from "../js/planner/departures.js";
import { hikingInfo, libraryInfo, waymarkedLink } from "../js/api/overpass.js";
import { classify } from "../js/planner/budget.js";

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
  assert.equal(lib.cat, "wifi");
  assert.ok(lib.extras.includes("power?"));
  const mc = classify({ amenity: "fast_food", brand: "McDonald's", internet_access: "wlan", "internet_access:fee": "no" });
  assert.equal(mc.cat, "cheapfood");
  assert.deepEqual(mc.extras, ["wifi"]);
  assert.equal(classify({ amenity: "bench" }), null);
});
