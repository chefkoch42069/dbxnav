// Rundreise-Vorschlag: „7 Tage, zeig mir eine Runde durch Bundesländer, in denen ich noch nicht war.“
import { HUBS, AIR_KM_PER_HOUR } from "../config.js";
import { distanceKm } from "../lib/geo.js";

/**
 * Greedy-Rundreise: jeden Tag zum nächstgelegenen Knoten in einem noch nicht besuchten
 * Bundesland, solange man in den restlichen Tagen sicher nach Hause kommt.
 * @returns [{state, hub}] – eine Station pro Nacht
 */
export function suggestRoundtrip(home, days, visited = [], { maxHours = 6, hubs = HUBS, homeState = null } = {}) {
  const range = maxHours * AIR_KM_PER_HOUR; // Luftlinie, die an einem Tag sicher geht
  const nights = Math.max(0, days - 1);
  const done = new Set(visited);
  if (homeState) done.add(homeState);
  const route = [];
  let cur = home;
  for (let n = 0; n < nights; n++) {
    const daysLeftAfter = nights - n; // Reisetage nach dieser Nacht (inkl. Heimfahrt)
    const options = [];
    for (const [state, list] of Object.entries(hubs)) {
      if (done.has(state)) continue;
      for (const hub of list) {
        const d = distanceKm(cur, hub);
        if (d < 25 || d > range) continue;
        if (distanceKm(hub, home) > range * daysLeftAfter) continue;
        options.push({ state, hub, d });
      }
    }
    if (!options.length) break;
    // Weit genug pro Tag, aber nicht übers Limit: Ziel ~70 % der Tagesreichweite.
    options.sort((a, b) => Math.abs(a.d - range * 0.7) - Math.abs(b.d - range * 0.7));
    // Auf dem letzten Teil Richtung Heimat orientieren
    if (daysLeftAfter <= 2) options.sort((a, b) => distanceKm(a.hub, home) - distanceKm(b.hub, home));
    const pick = options[0];
    route.push({ state: pick.state, hub: pick.hub });
    done.add(pick.state);
    cur = pick.hub;
  }
  return route;
}
