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

/**
 * maxspeed → km/h. „none“ und „DE:motorway“ (keine Begrenzung, nur Richtgeschwindigkeit) = Infinity,
 * „signals“/„variable“ = "variabel", unbekannt = null. „mph“ wird umgerechnet, bei „120;80“ zählt der höchste Wert.
 */
export function parseSpeed(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^(none|DE:motorway|DE:autobahn)$/i.test(s)) return Infinity;
  if (/^(signals|variable)$/i.test(s)) return "variabel";
  const nums = s.split(/[;|]/).map((x) => { const m = /(\d+(?:\.\d+)?)\s*(mph)?/.exec(x); return m ? parseFloat(m[1]) * (m[2] ? 1.609 : 1) : NaN; }).filter((x) => x > 0);
  return nums.length ? Math.round(Math.max(...nums)) : null;
}

/** „82 m“, „82.5“, „270 ft“ → Meter */
export function parseHeight(v) {
  const m = /(\d+(?:[.,]\d+)?)\s*(ft)?/.exec(String(v || ""));
  return m ? Math.round(parseFloat(m[1].replace(",", ".")) * (m[2] ? 0.3048 : 1)) : null;
}

export const HIGH_BRIDGE_M = 80;

/** Linien für die Tempo-Karte: Bahnstrecke oder Autobahn mit Geschwindigkeit. */
export function classifySpeed(t) {
  if (t.highway === "motorway") {
    const v = parseSpeed(t.maxspeed);
    const cond = t["maxspeed:conditional"] ? " (zeitweise begrenzt)" : "";
    return { kind: "motorway", speed: v, label: v === Infinity ? `unbegrenzt${cond}` : v === "variabel" ? "variabel (Verkehrsbeeinflussung)" : v ? `${v} km/h` : "Tempo unbekannt", ref: t.ref || null };
  }
  if (/^(rail|light_rail)$/.test(t.railway || "")) {
    const v = parseSpeed(t.maxspeed);
    return v && v !== Infinity && v !== "variabel" ? { kind: "rail", speed: v, label: `${v} km/h`, ref: t.ref || t.name || null } : null;
  }
  return null;
}

/** Filter für die Tempo-Karte. rail: Mindest-km/h; motorway: "all" | "none" | "130+" | "le120" | "le100" | "var". */
export function speedVisible(line, { railMin = 0, motorway = "all" } = {}) {
  if (line.kind === "rail") return railMin >= 0 && line.speed >= railMin;
  const v = line.speed;
  switch (motorway) {
    case "off": return false;
    case "none": return v === Infinity;
    case "130+": return v === Infinity || (typeof v === "number" && v >= 130);
    case "le120": return typeof v === "number" && v !== Infinity && v <= 120;
    case "le100": return typeof v === "number" && v !== Infinity && v <= 100;
    case "var": return v === "variabel";
    default: return true;
  }
}

export function speedColor(line) {
  const v = line.speed;
  if (line.kind === "motorway") {
    if (v === Infinity) return "#1565c0";
    if (v === "variabel") return "#8e24aa";
    if (typeof v !== "number") return "#9e9e9e";
    return v >= 130 ? "#2e7d32" : v >= 100 ? "#f9a825" : "#e65100";
  }
  return v >= 250 ? "#b71c1c" : v >= 200 ? "#e53935" : v >= 160 ? "#fb8c00" : v >= 120 ? "#fdd835" : v >= 80 ? "#7cb342" : "#90a4ae";
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
  else if (t.man_made === "bridge" || t.bridge) {
    // Straßenbrücken nur, wenn sie zur Autobahn gehören, über eine Autobahn führen oder sehr hoch sind
    const h = parseHeight(t.height);
    const high = h != null && h >= HIGH_BRIDGE_M;
    const road = t.highway && !t.railway;
    if (road && t.highway !== "motorway" && !t._overMotorway && !high) return null;
    if (!road && !t.railway && t.man_made !== "bridge" && t.bridge !== "viaduct" && !high && !t._overMotorway) return null;
    cat = "bridge";
    kind = t.highway === "motorway" ? "Autobahnbrücke" : t._overMotorway ? `Brücke über die Autobahn${t._motorwayRef ? ` ${t._motorwayRef}` : ""}` : t.bridge === "viaduct" ? "Viadukt" : t.railway ? "Eisenbahnbrücke" : "Brücke";
    if (high) facts.push(`${h} m hoch`);
    if (t.highway === "motorway" && t.ref) facts.push(t.ref);
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
  if (cat !== "bridge") add(t.height && `Höhe ${String(t.height).replace(/\s*m$/, "")} m`);
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
