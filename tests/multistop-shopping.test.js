import test from "node:test";
import assert from "node:assert/strict";
import { P, leg, itin } from "./helpers.js";
import { planMultiStop } from "../js/planner/multistop.js";
import { hoursOn, weekdayIdx, planShopping } from "../js/planner/shopping.js";

const A = P("Erfurt Hbf", 50.97, 11.04), B = P("Weimar", 50.99, 11.33), C = P("Jena Paradies", 50.92, 11.58), D = P("Leipzig Hbf", 51.35, 12.38);
const ride = (a, b, s, e) => itin([leg("REGIONAL_RAIL", a, b, s, e, { displayName: "RE" })]);
const hm = (iso) => iso.slice(11, 16);

test("Zwischenstopps: Aufenthalt wird eingehalten, jede Etappe startet nach dem Aufenthalt", async () => {
  const calls = [];
  const api = { async plan(a, b, iso) {
    calls.push(`${a.name}→${b.name}@${hm(iso)}`);
    if (b === B) return [ride(A, B, "08:00", "08:15")];
    if (b === C) return [ride(B, C, "10:30", "10:50"), ride(B, C, "10:20", "10:40")];
    return [ride(C, D, "11:30", "12:45")];
  } };
  const r = await planMultiStop({ from: A, to: D, stops: [{ place: B, stayMin: 120 }, { place: C, stayMin: 30 }], startIso: "2026-11-25T08:00:00Z" }, api);
  assert.deepEqual(calls, ["Erfurt Hbf→Weimar@08:00", "Weimar→Jena Paradies@10:15", "Jena Paradies→Leipzig Hbf@11:10"]);
  assert.equal(r.ok, true);
  assert.equal(hm(r.segments[0].leaveAt), "10:15");
  assert.equal(hm(r.segments[1].itinerary.endTime), "10:40"); // früheste Ankunft gewählt
  assert.equal(r.segments[2].leaveAt, null);
  assert.equal(hm(r.arrival), "12:45");
  assert.equal(r.totalStayMin, 150);
});

test("Zwischenstopps: fehlende Etappe bricht sauber ab", async () => {
  const r = await planMultiStop({ from: A, to: D, stops: [{ place: B, stayMin: 60 }], startIso: "2026-11-25T08:00:00Z" },
    { plan: async (a, b) => (b === B ? [ride(A, B, "08:00", "08:15")] : []) });
  assert.equal(r.ok, false);
  assert.equal(r.segments.length, 2);
  assert.ok(r.segments[1].error);
});

test("Öffnungszeiten verstehen", () => {
  assert.equal(weekdayIdx("2026-11-28"), 5); // Samstag
  assert.deepEqual(hoursOn("Mo-Sa 10:00-20:00; Su off", "2026-11-28"), { open: "10:00", close: "20:00" });
  assert.equal(hoursOn("Mo-Sa 10:00-20:00; Su off", "2026-11-29"), "closed");
  assert.deepEqual(hoursOn("Mo-Fr 09:30-19:00; Sa 10:00-18:00", "2026-11-28"), { open: "10:00", close: "18:00" });
  assert.deepEqual(hoursOn("Mo-Fr 08:00-12:00,14:00-18:00", "2026-11-25"), { open: "08:00", close: "18:00" });
  assert.deepEqual(hoursOn("24/7", "2026-11-29"), { open: "00:00", close: "23:59" });
  assert.deepEqual(hoursOn("Mo-Su 10:00-24:00; PH off", "2026-11-29"), { open: "10:00", close: "23:59" });
  assert.equal(hoursOn("sunrise-sunset", "2026-11-25"), null);
  assert.equal(hoursOn("Mo-Fr 10:00-20:00", "2026-11-29"), "closed"); // Sonntag nicht genannt
});

// Winter: Berlin = UTC+1 → 10:00 Ortszeit = 09:00Z
test("Einkaufsmodus: späteste Hinfahrt zur Öffnung, Rückfahrt nach der Einkaufszeit", async () => {
  const seen = [];
  const api = { async plan(a, b, iso, o) {
    seen.push(`${a.name}→${b.name} ${o.arriveBy ? "an" : "ab"} ${hm(iso)}`);
    if (b === D && o.arriveBy) return [ride(A, D, "06:40", "08:30"), ride(A, D, "07:00", "08:45"), ride(A, D, "06:00", "07:50")];
    if (b === A && o.arriveBy) return [ride(D, A, "20:30", "22:20")]; // letzte Rückfahrt
    if (b === A) return [ride(D, A, "13:30", "15:20"), ride(D, A, "13:15", "15:30")];
    return [];
  } };
  const r = await planShopping({ home: A, dest: D, date: "2026-11-28", open: "10:00", close: "20:00", shopMinutes: 180, bufferMin: 10 }, api);
  assert.equal(r.ok, true);
  assert.equal(seen[0], "Erfurt Hbf→Leipzig Hbf an 08:50"); // Öffnung 09:00Z minus 10 min Puffer
  assert.equal(hm(r.outbound.startTime), "07:00"); // späteste passende
  assert.equal(hm(r.shopStart), "09:00"); // pünktlich zur Öffnung
  assert.equal(hm(r.shopEnd), "12:00");
  assert.equal(r.shopMin, 180);
  assert.equal(hm(r.inbound.startTime), "13:30"); // früheste Ankunft nach 12:10
  assert.equal(hm(r.latestReturn.startTime), "20:30");
  assert.match(r.notes.join(" "), /5 min vor Ladenöffnung/);
});

test("Einkaufsmodus: bis Ladenschluss, aber danach fährt nichts mehr → verkürzen", async () => {
  const api = { async plan(a, b, iso, o) {
    if (b === D && o.arriveBy) return [ride(A, D, "07:00", "08:45")];
    if (b === A && o.arriveBy) return [ride(D, A, "18:30", "20:20")];
    if (b === A) return [ride(D, A, "19:20", "21:10")]; // nach der letzten → wird verworfen
    return [];
  } };
  const r = await planShopping({ home: A, dest: D, date: "2026-11-28", open: "10:00", close: "20:00", shopMinutes: null }, api);
  assert.equal(r.ok, true);
  assert.equal(hm(r.inbound.startTime), "18:30");
  assert.equal(hm(r.shopEnd), "18:20");
  assert.match(r.notes.join(" "), /verkürzt/);
});
