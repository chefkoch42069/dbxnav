import test from "node:test";
import assert from "node:assert/strict";
import { berlinToISO, fmtTime, berlinDate, addDays, fmtDuration, nextWeekday } from "../js/lib/time.js";
import { decodePolyline, encodePolyline } from "../js/lib/polyline.js";
import { distanceKm, stateAt, statesAlong, tilesAlong, simplify } from "../js/lib/geo.js";
import { readFileSync } from "node:fs";

const states = JSON.parse(readFileSync(new URL("../data/bundeslaender.geojson", import.meta.url)));

test("Berliner Zeit: Winter und Sommer", () => {
  assert.equal(berlinToISO("2026-11-25", "08:00"), "2026-11-25T07:00:00.000Z");
  assert.equal(berlinToISO("2026-07-01", "08:00"), "2026-07-01T06:00:00.000Z");
  assert.equal(fmtTime("2026-11-25T21:30:00Z"), "22:30");
  assert.equal(berlinDate("2026-11-25T23:30:00Z"), "2026-11-26");
});

test("Datum und Dauer", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(fmtDuration(3 * 3600 + 5 * 60), "3 h 05 min");
  assert.equal(fmtDuration(45 * 60), "45 min");
  assert.equal(nextWeekday("2026-11-24", 6), "2026-11-28"); // Di → Sa
});

test("Polyline hin und zurück", () => {
  const pts = [[50.97, 11.03], [51.345695, 12.380428], [48.1, -1.5]];
  const back = decodePolyline(encodePolyline(pts, 6), 6);
  back.forEach((p, i) => { assert.ok(Math.abs(p[0] - pts[i][0]) < 1e-6); assert.ok(Math.abs(p[1] - pts[i][1]) < 1e-6); });
});

test("Bundesland per Punkt", () => {
  assert.equal(stateAt(50.97, 11.03, states), "DE-TH"); // Erfurt
  assert.equal(stateAt(52.52, 13.40, states), "DE-BE"); // Berlin (nicht Brandenburg)
  assert.equal(stateAt(53.08, 8.81, states), "DE-HB"); // Bremen (nicht Niedersachsen)
  assert.equal(stateAt(48.14, 11.56, states), "DE-BY");
  assert.equal(stateAt(48.85, 2.35, states), null); // Paris
  const along = statesAlong([[50.97, 11.03], [51.48, 11.97], [51.34, 12.38]], states, 1);
  assert.deepEqual(along.sort(), ["DE-SN", "DE-ST", "DE-TH"]);
});

test("Distanz, Vereinfachen, Kacheln", () => {
  assert.ok(Math.abs(distanceKm({ lat: 50.97, lon: 11.03 }, { lat: 51.34, lon: 12.38 }) - 103) < 3);
  assert.equal(simplify([[0, 0], [0.00001, 0.5], [0, 1]]).length, 2);
  const tiles = tilesAlong([[50.97, 11.03], [51.34, 12.38]], [10, 11], 1000);
  assert.ok(tiles.length > 5 && tiles.length < 60);
  assert.equal(tilesAlong([[50.97, 11.03], [51.34, 12.38]], [12], 3).length, 3);
});

test("Ortsdaten-Kacheln: gleiche Kachel-Nummern wie tools/build_poi.py", async () => {
  const { tilesForBounds, boundsAround } = await import("../js/api/localPoi.js");
  // build_poi.py: (50.97244, 11.0375) → 2173/1371, (48.1373, 11.5754) → 2179/1421
  assert.deepEqual(tilesForBounds([50.97244, 11.0375, 50.97244, 11.0375], 12), ["2173/1371"]);
  assert.deepEqual(tilesForBounds([48.1373, 11.5754, 48.1373, 11.5754], 12), ["2179/1421"]);
  const keys = tilesForBounds(boundsAround({ lat: 50.97, lon: 11.03 }, 1500), 12);
  assert.ok(keys.length >= 1 && keys.length <= 4);
});
