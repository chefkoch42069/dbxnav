// Homeless-Modus: kostenlose und billige Orte aus OSM-Tags erkennen.

export const BUDGET_CATS = {
  help: { label: "Hilfe & Bahnhofsmission", icon: "🤝" },
  freefood: { label: "Essen kostenlos", icon: "🥫" },
  cheapfood: { label: "Essen billig", icon: "🥖" },
  power: { label: "Strom / Steckdose", icon: "🔌" },
  wifi: { label: "WLAN gratis", icon: "📶" },
  library: { label: "Bibliothek (warm & trocken)", icon: "📚" },
  water: { label: "Trinkwasser", icon: "🚰" },
  toilets: { label: "Toilette", icon: "🚻" },
  shower: { label: "Dusche", icon: "🚿" },
  shelter: { label: "Unterstand / Hütte", icon: "🛖" },
  give: { label: "Verschenken", icon: "🎁" },
};

const DISCOUNTER = /\b(aldi|lidl|netto|penny|norma|kaufland|nah ?& ?gut|diska|np[- ]markt)\b/i;
const CHEAP_CHAINS = /\b(mcdonald|burger king|kfc|subway|backwerk|back-factory|ditsch|kamps|döner|doener|imbiss)\b/i;

const isYes = (v) => /^(yes|wlan|wifi|free|public)$/i.test(v || "");

/** Gratis-WLAN? (explizit kostenlos oder Bibliothek mit WLAN) */
export function hasFreeWifi(t) {
  const wifi = /^(wlan|yes|wifi|public)$/i.test(t.internet_access || "");
  return wifi && (t["internet_access:fee"] === "no" || (t.amenity === "library" && t["internet_access:fee"] !== "yes"));
}

export function hasPower(t) {
  // socket:* nur werten, wenn es keine E-Auto-Ladesäule ist (die haben oft auch socket:schuko)
  return t.amenity === "device_charging_station" || isYes(t.power_supply) ||
    (t.amenity !== "charging_station" && Object.keys(t).some((k) => /^socket:(schuko|typee|type_e|usb)/i.test(k)));
}

const HOMELESS_FOR = /homeless|underprivileged|displaced|obdachlos|wohnungslos/i;

/** OSM-Öffnungszeiten grob eindeutschen: „Th, Fr 14:30-17:30; Su off“ → „Do, Fr 14:30–17:30; So geschlossen“. */
export function ohDe(oh) {
  if (!oh) return null;
  const days = { Mo: "Mo", Tu: "Di", We: "Mi", Th: "Do", Fr: "Fr", Sa: "Sa", Su: "So", PH: "Feiertag", SH: "Schulferien" };
  if (oh.trim() === "24/7") return "rund um die Uhr";
  return oh
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/g, (d) => days[d])
    .replace(/\boff\b|\bclosed\b/g, "geschlossen")
    .replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, "$1–$2")
    .replace(/;\s*/g, "; ");
}

/**
 * Hauptkategorie + Zusatz-Infos eines OSM-Objekts, oder null wenn uninteressant.
 * @returns {{cat:string, free:boolean, extras:string[], note:string|null} | null}
 */
export function classify(t) {
  const name = `${t.name || ""} ${t.brand || ""} ${t.operator || ""}`;
  const sf = t.social_facility || "";
  const extras = [];
  if (hasFreeWifi(t)) extras.push("wifi");
  if (hasPower(t)) extras.push("power");
  const feeNo = t.fee === "no" || t.charge === "0";
  const feeNote = feeNo ? null : t.fee === "yes" ? "kostenpflichtig" : "Gebühr unbekannt";
  // Nicht öffentlich zugänglich (Restaurant-WC, Werkskantine, Vereinsdusche …) → weglassen
  if (/^(private|no|customers|permit|employees|members)$/.test(t.access || "")) return null;
  let cat = null, note = null, free = false;

  if (/bahnhofsmission/i.test(name)) { cat = "help"; free = true; note = "Hilfe, Tee/Kaffee, Ruheraum, Beratung"; }
  else if (sf === "food_bank" || /\btafel\b/i.test(name)) { cat = "freefood"; free = true; note = "Tafel – meist mit Berechtigungsnachweis"; }
  else if (sf === "soup_kitchen" || /suppenküche/i.test(name)) { cat = "freefood"; free = true; note = "Suppenküche"; }
  else if (t.amenity === "food_sharing" || /fairteiler|foodsharing/i.test(name)) { cat = "freefood"; free = true; note = "Foodsharing-Fairteiler: einfach nehmen"; }
  else if (t.amenity === "social_facility" || sf) {
    // Nur Angebote für Wohnungslose/Bedürftige – nicht Tagespflege, Pflegeheime, Frauenhäuser usw.
    if (!HOMELESS_FOR.test(`${t["social_facility:for"] || ""} ${name}`)) return null;
    cat = "help"; free = true;
    note = { shelter: "Notunterkunft", day_care: "Tagesaufenthalt/Wärmestube", outreach: "Beratung/Streetwork" }[sf] || "Anlaufstelle";
  }
  else if (t.amenity === "drinking_water" || t.amenity === "water_point") {
    if (t.drinking_water === "no" || (t.amenity === "water_point" && t.drinking_water !== "yes")) return null;
    cat = "water"; free = true;
    if (t.seasonal && t.seasonal !== "no") note = "nur saisonal – im Winter oft abgestellt";
  }
  else if (t.amenity === "toilets") { cat = "toilets"; free = feeNo; note = feeNo ? null : feeNote; }
  else if (t.amenity === "shower") { cat = "shower"; free = feeNo; note = feeNo ? null : feeNote; }
  else if (t.amenity === "device_charging_station") { cat = "power"; free = feeNo; note = feeNo ? "Handy-Ladestation" : `Handy-Ladestation · ${feeNote}`; }
  else if (t.amenity === "give_box") { cat = "give"; free = true; note = "Verschenkregal/-schrank"; }
  else if (t.amenity === "shelter") {
    if (t.shelter_type === "public_transport" || t.shelter_type === "field_shelter") return null;
    cat = "shelter"; free = true; note = { basic_hut: "Hütte", lean_to: "Unterstand (offen)", weather_shelter: "Wetterschutz" }[t.shelter_type] || "Unterstand";
  }
  else if (t.shop === "supermarket") { if (!DISCOUNTER.test(name)) return null; cat = "cheapfood"; note = "Discounter"; }
  else if (t.shop === "bakery") { cat = "cheapfood"; note = "Bäckerei – abends oft Reste günstiger"; }
  else if (t.amenity === "fast_food") { cat = "cheapfood"; note = CHEAP_CHAINS.test(name) ? "Imbiss/Kette" : "Imbiss"; }
  else if (t.amenity === "canteen") { cat = "cheapfood"; note = "Kantine/Mensa – Zugang prüfen"; }
  else if (t.amenity === "library") {
    cat = "library"; free = true;
    note = extras.includes("wifi") ? "WLAN laut OSM frei" : "WLAN oft nur mit Bibliotheksausweis";
    if (!extras.includes("power")) extras.push("power?");
  }
  else if (extras.includes("wifi")) { cat = "wifi"; free = true; }
  else if (extras.includes("power")) { cat = "power"; }
  else return null;

  return { cat, free, extras: extras.filter((e) => e !== cat), note };
}

export function extraLabel(e) {
  return { wifi: "📶 WLAN", power: "🔌 Strom", "power?": "🔌 oft Steckdosen" }[e] || e;
}
