import test from "node:test";
import assert from "node:assert/strict";
import { P, leg, itin } from "./helpers.js";
import { connectionModes, summarize, mergeConnections, compareWithFern, highlights, connectionKey } from "../js/planner/connection.js";

const EF = P("Erfurt Hbf", 50.97, 11.04), HAL = P("Halle (Saale) Hbf", 51.48, 11.99), LEJ = P("Leipzig Hbf", 51.35, 12.38);
const re = (a, b, s, e, extra = {}) => leg("REGIONAL_RAIL", a, b, s, e, { displayName: "RE16", tripId: `re-${s}`, ...extra });

test("Verkehrsmittel: nur Bahn, Vergleich mit Fernverkehr", () => {
  assert.ok(connectionModes().includes("BUS"));
  assert.deepEqual(connectionModes({ railOnly: true }), ["REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "SUBURBAN"]);
  assert.ok(connectionModes({ compare: true }).includes("HIGHSPEED_RAIL"));
  assert.ok(!connectionModes().includes("HIGHSPEED_RAIL"));
});

test("Zusammenfassung: Abfahrt/Ankunft ohne Fußweg, Umstiege, Linien, D-Ticket", () => {
  const it = itin([leg("WALK", EF, EF, "06:55", "07:00"), re(EF, HAL, "07:00", "08:20"), leg("WALK", HAL, HAL, "08:20", "08:25"), re(HAL, LEJ, "08:30", "09:00", { displayName: "S3", mode: "SUBURBAN" })]);
  const s = summarize(it);
  assert.equal(s.dep, "2026-11-25T07:00:00Z");
  assert.equal(s.arr, "2026-11-25T09:00:00Z");
  assert.equal(s.transfers, 1);
  assert.equal(s.walkMin, 10);
  assert.equal(s.duration, 2 * 3600); // 07:00–09:00, ohne die Fußwege davor
  assert.deepEqual(s.lines.map((l) => l.name), ["RE16", "S3"]);
  assert.equal(s.ok, true);
  assert.equal(summarize(itin([leg("HIGHSPEED_RAIL", EF, LEJ, "07:00", "07:45", { displayName: "ICE 1" })])).ok, false);
});

test("Seiten zusammenführen ohne Doppelte, nach Abfahrt sortiert", () => {
  const a = itin([re(EF, LEJ, "07:00", "09:00")]), b = itin([re(EF, LEJ, "08:00", "10:00")]), c = itin([re(EF, LEJ, "06:00", "08:00")]);
  const merged = mergeConnections([a, b], [b, c]);
  assert.deepEqual(merged.map((x) => x.startTime.slice(11, 16)), ["06:00", "07:00", "08:00"]);
  assert.notEqual(connectionKey(a), connectionKey(b));
});

test("Vergleich mit Fernverkehr und Hervorhebungen", () => {
  const slow = itin([re(EF, HAL, "07:00", "08:20"), re(HAL, LEJ, "08:30", "09:00")]); // 2 h, 1 Umstieg
  const direct = itin([re(EF, LEJ, "07:10", "09:20")]); // 2 h 10, direkt
  const ice = itin([leg("HIGHSPEED_RAIL", EF, LEJ, "07:30", "08:15", { displayName: "ICE 1", tripId: "ice" })]);
  const cmp = compareWithFern([slow, direct, ice]);
  assert.equal(cmp.savedMin, 75);
  assert.equal(compareWithFern([slow, direct]), null);
  const h = highlights([slow, direct, ice]);
  assert.equal(h.fastest, connectionKey(slow));
  assert.equal(h.fewest, connectionKey(direct));
});
