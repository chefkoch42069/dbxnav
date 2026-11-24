// YouTuber-Modus: öffentliche Infrastruktur aus OSM-Tags erkennen und beschreiben.

export const INFRA_CATS = {
  power: { label: "Strom", icon: "⚡" },
  bridge: { label: "Brücken & Viadukte", icon: "🌉" },
  tunnel: { label: "Tunnel", icon: "🚇" },
  water: { label: "Wasser & Schleusen", icon: "🌊" },
  tower: { label: "Türme", icon: "📡" },
  rail: { label: "Bahnanlagen", icon: "🚂" },
  lost: { label: "Lost Places", icon: "🏚️" },
};

const SOURCES = { wind: "Wind", solar: "Solar", coal: "Kohle", lignite: "Braunkohle", gas: "Gas", nuclear: "Atom", hydro: "Wasserkraft", biomass: "Biomasse", biogas: "Biogas", waste: "Müll", oil: "Öl", geothermal: "Geothermie", battery: "Batteriespeicher" };
const TOWER_TYPES = { communication: "Funkturm", observation: "Aussichtsturm", cooling: "Kühlturm", bell_tower: "Glockenturm", lighting: "Lichtmast", defensive: "Wehrturm", water: "Wasserturm", monitoring: "Messturm", watchtower: "Wachturm" };

/** „380000;110000“ → „380 kV / 110 kV“ */
export function voltageText(v) {
  if (!v) return null;
  const parts = String(v).split(/[;,]/).map((x) => parseInt(x, 10)).filter((x) => x > 0);
  if (!parts.length) return null;
  return [...new Set(parts)].sort((a, b) => b - a).map((x) => (x >= 1000 ? `${Math.round(x / 1000)} kV` : `${x} V`)).join(" / ");
}

/** Höchste Spannung in kV (für die Linienfarbe). */
export function maxKv(v) {
  const parts = String(v || "").split(/[;,]/).map((x) => parseInt(x, 10)).filter((x) => x > 0);
  return parts.length ? Math.max(...parts) / 1000 : 0;
}

const year = (d) => (d ? (String(d).match(/\d{4}/) || [])[0] || null : null);

/**
 * @returns {{cat:string, kind:string, facts:string[]} | null}
 *   kind = Art des Objekts (z. B. „Umspannwerk“), facts = kurze Angaben für Liste und Popup
 */
export function classifyInfra(t) {
  const facts = [];
  const add = (x) => x && facts.push(x);
  let cat = null, kind = null;

  if (t.power === "plant") { cat = "power"; kind = `Kraftwerk${SOURCES[t["plant:source"]] ? ` (${SOURCES[t["plant:source"]]})` : ""}`; add(t["plant:output:electricity"] && `Leistung ${t["plant:output:electricity"]}`); }
  else if (t.power === "substation") { cat = "power"; kind = "Umspannwerk"; add(voltageText(t.voltage)); }
  else if (t.power === "generator" && t["generator:source"] === "wind") { cat = "power"; kind = "Windrad"; add(t["generator:output:electricity"] && `Leistung ${t["generator:output:electricity"]}`); }
  else if (t.power === "line") { cat = "power"; kind = "Hochspannungsleitung"; add(voltageText(t.voltage)); }
  else if (t.man_made === "bridge" || t.bridge === "viaduct" || (t.bridge && t["bridge:name"])) {
    cat = "bridge"; kind = t.bridge === "viaduct" ? "Viadukt" : t.railway ? "Eisenbahnbrücke" : "Brücke";
    add(t["bridge:structure"] && { arch: "Bogenbrücke", truss: "Fachwerk", suspension: "Hängebrücke", cable_stayed: "Schrägseilbrücke", beam: "Balkenbrücke" }[t["bridge:structure"]]);
  }
  else if (t.tunnel && (t["tunnel:name"] || t.railway)) { cat = "tunnel"; kind = t.railway ? "Eisenbahntunnel" : "Tunnel"; }
  else if (t.waterway === "dam") { cat = "water"; kind = "Staudamm"; }
  else if (t.waterway === "weir") { cat = "water"; kind = "Wehr"; }
  else if (t.waterway === "lock_gate" || t.lock === "yes") { cat = "water"; kind = "Schleuse"; }
  else if (t.man_made === "water_tower") { cat = "water"; kind = "Wasserturm"; }
  else if (t.man_made === "water_works") { cat = "water"; kind = "Wasserwerk"; }
  else if (t.man_made === "wastewater_plant") { cat = "water"; kind = "Kläranlage"; }
  else if (t.man_made === "tower") { cat = "tower"; kind = TOWER_TYPES[t["tower:type"]] || "Turm"; }
  else if (/^(signal_box|turntable|traverser|roundhouse)$/.test(t.railway || "")) {
    cat = "rail"; kind = { signal_box: "Stellwerk", turntable: "Drehscheibe", traverser: "Schiebebühne", roundhouse: "Lokschuppen" }[t.railway];
  }
  else if (/^(abandoned|disused)$/.test(t.railway || "")) { cat = "rail"; kind = t.railway === "abandoned" ? "Stillgelegte Strecke (abgebaut)" : "Stillgelegte Strecke"; }
  else if (t["abandoned:railway"] === "station" || t["disused:railway"] === "station") { cat = "lost"; kind = "Ehemaliger Bahnhof"; }
  else if (t.military === "bunker" || t.building === "bunker") { cat = "lost"; kind = "Bunker"; }
  else if (t.building === "ruins" || t.abandoned === "yes") { cat = "lost"; kind = "Verlassenes Gebäude"; }
  else return null;

  add(t.operator && `Betreiber: ${t.operator}`);
  add(t.height && `Höhe ${String(t.height).replace(/\s*m$/, "")} m`);
  const y = year(t.start_date);
  add(y && `seit ${y}`);
  return { cat, kind, facts };
}

/** Titel für Liste und Popup: Name, sonst Art. */
export function infraTitle(t, kind) {
  return t.name || t["bridge:name"] || t["tunnel:name"] || kind;
}

/**
 * Gleiche Bauwerke aus mehreren OSM-Wegen (z. B. Brückenabschnitte) zusammenfassen:
 * gleiche Kategorie und gleicher Name, weniger als maxM auseinander.
 */
export function mergeSegments(items, distanceKm, maxM = 400) {
  const out = [];
  for (const it of items) {
    const name = it.title;
    const twin = name && out.find((o) => o.cat === it.cat && o.title === name && distanceKm(o, it) * 1000 < maxM);
    if (twin) { twin.parts = (twin.parts || 1) + 1; continue; }
    out.push({ ...it });
  }
  return out;
}
