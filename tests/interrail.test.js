import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeLocator } from "../js/lib/geo.js";
import { makeInterrailRules, travelDays, recommendPass, homeViolations } from "../js/planner/interrail.js";
import { planTour } from "../js/planner/tour.js";
import { P, leg, itin } from "./helpers.js";

const europe = JSON.parse(readFileSync(new URL("../data/europa.geojson", import.meta.url)));
const countryOf = makeLocator(europe);
const R = (o = {}) => makeInterrailRules({ countryOf, home: "DE", ...o });

const FRA = P("Frankfurt Hbf", 50.107, 8.664), PAR = P("Paris Est", 48.877, 2.359), MUC = P("München Hbf", 48.14, 11.56);
const BER = P("Berlin Hbf", 52.525, 13.369), WIE = P("Wien Hbf", 48.185, 16.377), ROM = P("Roma Termini", 41.901, 12.501);
const MIL = P("Milano Centrale", 45.486, 9.204), KYI = P("Kyiv", 50.44, 30.49), LWO = P("Lviv", 49.84, 24.0);

test("Länder-Lookup inkl. Enklaven", () => {
  assert.equal(countryOf(50.107, 8.664), "DE");
  assert.equal(countryOf(48.877, 2.359), "FR");
  assert.equal(countryOf(41.902, 12.434), "VA"); // Vatikan (Enklave) vor Italien geprüft
  assert.equal(countryOf(47.14, 9.52), "LI");
  assert.equal(countryOf(51.5, -0.12), "GB");
  assert.equal(countryOf(40, -40), null);
});

test("Interrail: ICE nach Paris ok, aber Reservierung in Frankreich", () => {
  const r = R().checkLeg(leg("HIGHSPEED_RAIL", FRA, PAR, "07:00", "11:00", { displayName: "ICE 9556", agencyName: "SNCF VOYAGEURS" }));
  assert.equal(r.ok, true);
  assert.match(r.note, /Reservierung Pflicht \(wegen FR\)/);
  assert.equal(R({ avoidReservation: true }).checkLeg(leg("HIGHSPEED_RAIL", FRA, PAR, "07:00", "11:00")).ok, false);
  // ICE innerhalb Deutschlands/Österreichs: keine Reservierungspflicht
  assert.equal(R().checkLeg(leg("HIGHSPEED_RAIL", MUC, WIE, "07:00", "11:00")).note, undefined);
});

test("Interrail: Privatbahnen, Fernbus, Stadtverkehr, Nachtzug, außerhalb", () => {
  assert.equal(R().checkLeg(leg("HIGHSPEED_RAIL", MIL, ROM, "07:00", "10:00", { agencyName: "Italo - NTV" })).ok, false);
  assert.equal(R().checkLeg(leg("LONG_DISTANCE", BER, MUC, "07:00", "12:00", { displayName: "FLX 1234", agencyName: "FlixTrain" })).ok, false);
  assert.equal(R().checkLeg(leg("COACH", BER, MUC, "07:00", "12:00")).ok, false);
  assert.equal(R().checkLeg(leg("SUBWAY", BER, BER, "07:00", "07:10")).level, "info");
  const nj = leg("NIGHT_RAIL", MUC, ROM, "20:00", "09:00", { displayName: "NJ 295" });
  assert.match(R().checkLeg(nj).note, /Nachtzug/);
  assert.equal(R({ allowNight: false }).checkLeg(nj).ok, false);
  assert.equal(R().checkLeg(leg("LONG_DISTANCE", LWO, KYI, "07:00", "12:00")).ok, false); // Ukraine nicht im Pass
});

test("Reisetage, Wohnland-Regel, Pass-Empfehlung", () => {
  const r = R();
  const out = itin([leg("HIGHSPEED_RAIL", FRA, PAR, "07:00", "11:00")]);
  const inDe = itin([leg("HIGHSPEED_RAIL", BER, MUC, "07:00", "11:00")]);
  const back = itin([leg("HIGHSPEED_RAIL", PAR, FRA, "07:00", "11:00")]);
  const city = itin([leg("SUBWAY", PAR, PAR, "07:00", "07:20")]);
  const days = [{ itinerary: out }, { itinerary: city }, { itinerary: inDe }, { itinerary: back }];
  assert.equal(travelDays(days, r), 3); // Metro-Tag zählt nicht
  assert.deepEqual(homeViolations(days, r), [2]); // Berlin–München mitten in der Reise
  assert.deepEqual(homeViolations([{ itinerary: inDe }, { itinerary: out }], r), []); // erster Tag ist erlaubt
  assert.equal(recommendPass(3, 6).label, "Global Pass flexibel: 4 Reisetage in 1 Monat");
  assert.equal(recommendPass(7, 20).days, 7);
  assert.equal(recommendPass(6, 40).within, 60); // länger als 1 Monat
  assert.equal(recommendPass(14, 15).kind, "continuous"); // fast jeden Tag unterwegs
  assert.equal(recommendPass(0, 3), null);
});

test("Tourplanung mit Interrail-Regeln: Nachtzug als ganzer Tag, Fernzüge erlaubt", async () => {
  const r = R();
  const seen = [];
  const api = {
    async plan(from, to, iso, opts) {
      seen.push(opts.modes?.includes("HIGHSPEED_RAIL"));
      if (to.name === "Roma Termini") return [itin([leg("NIGHT_RAIL", MUC, ROM, "19:00", "08:30", { displayName: "NJ 295" })])];
      return [itin([leg("HIGHSPEED_RAIL", ROM, MUC, "07:00", "16:00")])];
    },
  };
  const days = await planTour({ start: MUC, stops: [{ place: ROM, nights: 2 }], roundtrip: true, startDate: "2026-12-01", maxHours: 6 }, api, () => {}, r);
  assert.ok(seen.every(Boolean)); // Fernverkehr wurde angefragt
  assert.equal(days[0].nightTrain, true);
  assert.equal(days[0].reachedTarget, true); // nicht zerschnitten, obwohl > 6 h
  assert.equal(days.length, 2);
});
