// Unterwegs-Modus: kostenlose und billige Orte aus OSM-Tags erkennen.

export const BUDGET_CATS = {
  help: { label: "Hilfe & Bahnhofsmission", icon: "🤝" },
  freefood: { label: "Essen kostenlos", icon: "🥫" },
  cheapfood: { label: "Essen billig", icon: "🥖" },
  power: { label: "Strom / Steckdose", icon: "🔌" },
  wifi: { label: "WLAN gratis", icon: "📶" },
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
  return t.amenity === "device_charging_station" || isYes(t.power_supply) || Object.keys(t).some((k) => /^socket:(schuko|typee|type_e|cee|usb)/i.test(k));
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
  let cat = null, note = null, free = false;

  if (/bahnhofsmission/i.test(name)) { cat = "help"; free = true; note = "Hilfe, Tee/Kaffee, Ruheraum, Beratung"; }
  else if (/^(soup_kitchen|food_bank)$/.test(sf) || /\btafel\b|suppenküche/i.test(name)) { cat = "freefood"; free = true; note = sf === "food_bank" ? "Tafel – meist mit Berechtigung" : "Suppenküche"; }
  else if (t.amenity === "food_sharing" || /fairteiler|foodsharing/i.test(name)) { cat = "freefood"; free = true; note = "Foodsharing-Fairteiler: einfach nehmen"; }
  else if (t.amenity === "social_facility" || sf) {
    if (/^(shelter|outreach|day_care)$/.test(sf) || /homeless|obdachlos|wohnungslos/i.test(`${t["social_facility:for"] || ""} ${name}`)) {
      cat = "help"; free = true; note = sf === "shelter" ? "Notunterkunft" : "Anlaufstelle";
    } else return null;
  }
  else if (t.amenity === "drinking_water" || t.amenity === "water_point") { cat = "water"; free = true; }
  else if (t.amenity === "toilets") { cat = "toilets"; free = feeNo; note = feeNo ? "kostenlos" : t.fee === "yes" ? "kostenpflichtig" : "Gebühr unbekannt"; }
  else if (t.amenity === "shower") { cat = "shower"; free = feeNo; note = feeNo ? "kostenlos" : t.fee === "yes" ? "kostenpflichtig" : null; }
  else if (t.amenity === "device_charging_station") { cat = "power"; free = feeNo || t.fee !== "yes"; note = "Handy-Ladestation"; }
  else if (t.amenity === "give_box") { cat = "give"; free = true; note = "Verschenkregal/-schrank"; }
  else if (t.amenity === "shelter") {
    if (t.shelter_type === "public_transport" || t.shelter_type === "field_shelter") return null;
    cat = "shelter"; free = true; note = { basic_hut: "Hütte", lean_to: "Unterstand (offen)", weather_shelter: "Wetterschutz" }[t.shelter_type] || "Unterstand";
  }
  else if (t.shop === "supermarket") { if (!DISCOUNTER.test(name)) return null; cat = "cheapfood"; note = "Discounter"; }
  else if (t.shop === "bakery") { cat = "cheapfood"; note = "Bäckerei – abends oft Reste günstiger"; }
  else if (t.amenity === "fast_food") { cat = "cheapfood"; note = CHEAP_CHAINS.test(name) ? "Imbiss/Kette" : "Imbiss"; }
  else if (t.amenity === "canteen") { cat = "cheapfood"; note = "Kantine/Mensa – Zugang prüfen"; }
  else if (t.amenity === "library") { cat = extras.includes("wifi") ? "wifi" : "power"; free = true; note = "Bibliothek – WLAN, Steckdosen, warm & trocken"; if (!extras.includes("power")) extras.push("power?"); }
  else if (extras.includes("wifi")) { cat = "wifi"; free = true; }
  else if (extras.includes("power")) { cat = "power"; }
  else return null;

  return { cat, free, extras: extras.filter((e) => e !== cat), note };
}

export function extraLabel(e) {
  return { wifi: "📶 WLAN", power: "🔌 Strom", "power?": "🔌 oft Steckdosen" }[e] || e;
}
