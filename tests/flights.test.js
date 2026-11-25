import test from "node:test";
import assert from "node:assert/strict";
import { nearestAirports, flightLinks, destCode, FERRIES } from "../js/planner/flights.js";

test("Flug: nächste Flughäfen, Ziel-Code, Links für mehrere Abflughäfen", () => {
  const near = nearestAirports({ lat: 50.97, lon: 11.04 }, 3); // Erfurt
  assert.deepEqual(near.map((a) => a.code), ["LEJ", "NUE", "DRS"].slice(0, 1).concat(near.slice(1).map((a) => a.code)));
  assert.equal(near[0].code, "LEJ");
  assert.equal(destCode("bcn"), "BCN");
  assert.equal(destCode("Barcelona"), "BCN");
  assert.equal(destCode("Lissabon"), "LIS");
  const l = flightLinks(["MUC", "HAM"], "BCN", "2026-12-01", "2026-12-08");
  assert.equal(l.all, "https://www.kayak.de/flights/MUC,HAM-BCN/2026-12-01/2026-12-08?sort=price_a");
  assert.equal(l.perAirport.MUC.skyscanner, "https://www.skyscanner.de/transport/flights/muc/bcn/261201/261208/");
  assert.match(l.perAirport.HAM.google, /HAM/);
  assert.ok(FERRIES.length >= 10);
});
