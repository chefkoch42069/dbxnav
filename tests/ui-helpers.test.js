import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fmtMinutes, addMinutes, diffMin } from "../js/lib/time.js";
import { isRide, rideLegs } from "../js/lib/legs.js";

test("Dauer-Beschriftung ab 15 Minuten", () => {
  assert.equal(fmtMinutes(15), "15 min");
  assert.equal(fmtMinutes(30), "30 min");
  assert.equal(fmtMinutes(60), "1 h");
  assert.equal(fmtMinutes(90), "1 h 30 min");
  assert.equal(fmtMinutes(150), "2 h 30 min");
  assert.equal(addMinutes("2026-11-25T08:00:00.000Z", -30), "2026-11-25T07:30:00.000Z");
  assert.equal(diffMin("2026-11-25T08:00:00Z", "2026-11-25T08:45:00Z"), 45);
});

test("Fahrt oder Fußweg", () => {
  assert.equal(isRide({ mode: "BUS" }), true);
  assert.equal(isRide({ mode: "ODM" }), true);
  assert.equal(isRide({ mode: "WALK" }), false);
  assert.equal(rideLegs({ legs: [{ mode: "WALK" }, { mode: "REGIONAL_RAIL" }, { mode: "BIKE" }] }).length, 1);
});

test("Farbskala passt sich der Höchstdauer an", async () => {
  // timeScale.js importiert dom.js (braucht kein DOM beim Laden)
  const { thresholds } = await import("../js/ui/timeScale.js");
  assert.deepEqual(thresholds(120), [30, 60, 90, 120]);
  assert.deepEqual(thresholds(30), [10, 15, 25, 30]);
  assert.deepEqual(thresholds(15), [5, 10, 15]); // doppelte Stufen fallen weg
});

// Wartung: jede App-Datei muss im Service Worker stehen, sonst fehlt sie offline.
test("Service Worker kennt alle App-Dateien", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const listed = new Set([...sw.matchAll(/"([^"]+\.(?:js|css|html|geojson))"/g)].map((m) => m[1]));
  const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : [p];
  });
  const files = [...walk("js"), ...walk("css"), "index.html", "data/bundeslaender.geojson", "data/europa.geojson"];
  const missing = files.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `fehlen in sw.js: ${missing.join(", ")}`);
  for (const f of listed) assert.doesNotThrow(() => statSync(new URL(`../${f}`, import.meta.url)), `sw.js nennt ${f}, gibt es aber nicht`);
});
