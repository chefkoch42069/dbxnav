// Erreichbarkeit als Streckennetz: Statt jeden Bahnhof einzeln zu zeigen, wird jeder Ort mit dem
// nächstgelegenen früher erreichten Ort verbunden. So entstehen Linien vom Start bis zum Endpunkt.
// one-to-all liefert keine Gleisgeometrie, die Abschnitte sind daher gerade Verbindungen zwischen Bahnhöfen.
import { distanceKm } from "../lib/geo.js";

// Strafe für Vorgänger, die weiter vom Start weg liegen als der Ort selbst (verhindert Zickzack).
const BACKTRACK_PENALTY = 0.5;

// Schnelle Näherung (equirektangulär) für die O(n²)-Suche; auf Deutschlands Maßstab genau genug.
const KM_PER_DEG = 111.32;
const fastKm = (a, b, cosLat) => Math.hypot((b.lat - a.lat) * KM_PER_DEG, (b.lon - a.lon) * KM_PER_DEG * cosLat);

/**
 * @param home  Startort {lat, lon}
 * @param dests Orte mit {lat, lon, outMinutes}
 * @returns {{ nodes, branches }}
 *   nodes:    Orte (aufsteigend nach Fahrzeit) mit parent (Index in nodes, -1 = Start) und children
 *   branches: Linien { from (Start oder Ort), stops (Orte in Fahrtrichtung), end (letzter Ort) }
 */
export function buildReachTree(home, dests) {
  const homeKm = (p) => distanceKm(home, p);
  const nodes = dests
    .map((d) => ({ ...d, _home: homeKm(d), parent: -1, children: [] }))
    .sort((a, b) => a.outMinutes - b.outMinutes || a._home - b._home);

  const cosLat = Math.cos((home.lat * Math.PI) / 180);
  for (let i = 0; i < nodes.length; i++) {
    const d = nodes[i];
    let best = -1, bestScore = d._home; // direkt vom Start
    for (let j = 0; j < i; j++) {
      const c = nodes[j];
      const score = fastKm(c, d, cosLat) + BACKTRACK_PENALTY * Math.max(0, c._home - d._home);
      if (score < bestScore) { bestScore = score; best = j; }
    }
    d.parent = best;
  }
  const roots = [];
  nodes.forEach((n, i) => (n.parent < 0 ? roots : nodes[n.parent].children).push(i));

  // Längste Fortsetzung (in Minuten) je Teilbaum: die bleibt auf derselben Linie, alles andere zweigt ab.
  const reach = new Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    reach[i] = Math.max(nodes[i].outMinutes, ...nodes[i].children.map((c) => reach[c]));
  }
  const branches = [];
  const startBranch = (first, from) => {
    const stops = [];
    for (let i = first; i !== undefined;) {
      stops.push(nodes[i]);
      const kids = nodes[i].children;
      const main = kids.reduce((m, c) => (m === undefined || reach[c] > reach[m] ? c : m), undefined);
      for (const c of kids) if (c !== main) pending.push([c, nodes[i]]);
      i = main;
    }
    branches.push({ from, stops, end: stops[stops.length - 1] });
  };
  const pending = roots.map((r) => [r, home]);
  while (pending.length) startBranch(...pending.shift());

  for (const n of nodes) delete n._home;
  return { nodes, branches };
}
