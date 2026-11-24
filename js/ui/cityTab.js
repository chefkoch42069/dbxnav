// Reiter „Stadt“: Stadt eingeben → Hauptbahnhof mit Linien, Ausstattung und Läden im Bahnhof und bis 500 m drumherum.
import { el, clear, toast, spinnerLine, errorLine, extLink, osmLink, direktLink } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { map, groups, focusOn, pinIcon, setBase } from "./map.js";
import { nav } from "./nav.js";
import { addFavorite } from "../state.js";
import { geocode, stopTimes } from "../api/transitous.js";
import { stationShops, stationInfo } from "../api/overpass.js";
import { prepareDepartures } from "../planner/departures.js";
import { SHOP_CATS, placeShops, pickMainStation } from "../planner/city.js";
import { ohDe } from "../planner/budget.js";
import { hikingPanel, libraryPanel, sightsPanel, lodgingPanel, bookingPanel, lazyDetails } from "./details.js";
import { linesBlock } from "./transitClick.js";
import { distanceKm } from "../lib/geo.js";

const RADIUS_M = 500;
let box;
let loadId = 0;

export function initCityTab(root) {
  const input = placeInput({ label: "Stadt", id: "city-name", placeholder: "z. B. Koblenz", snapToStop: false, onSelect: (p) => load(p) });
  box = el("div");
  root.append(
    el("h2", {}, "Stadt"),
    el("p", { class: "lead" }, "Stadt eingeben: Infos zum Hauptbahnhof und alle Läden im Bahnhof und bis 500 m drumherum."),
    input.node, box);
  nav.city.open = (p) => { input.value = p; nav.switchTab("city"); load(p); };
}

/** Hauptbahnhof zur Stadt suchen. Ist p schon ein Bahnhof, wird er genommen. */
async function findStation(p) {
  if (p.type === "STOP" && p.rail) return { station: p, others: [] };
  const [hbf, plain] = await Promise.all([geocode(`${p.name} Hbf`).catch(() => []), geocode(p.name).catch(() => [])]);
  const all = [...hbf, ...plain];
  const station = pickMainStation(p, all);
  // Weitere Bahnhöfe derselben Stadt: höchstens 20 km entfernt, nicht derselbe Bahnhof unter anderem Namen (< 300 m)
  const others = [...new Map(all.filter((s) => s.type === "STOP" && s.rail).map((s) => [s.name, s])).values()]
    .filter((s) => station && distanceKm(p, s) < 20 && distanceKm(station, s) > 0.3)
    .slice(0, 6);
  return { station, others };
}

async function load(p, forced = null) {
  const id = ++loadId;
  const stale = () => id !== loadId;
  clear(box).append(spinnerLine(`Suche den Hauptbahnhof von ${p.name} …`));
  groups.places.clearLayers();
  try {
    const { station, others } = forced ? { station: forced, others: [] } : await findStation(p);
    if (stale()) return;
    if (!station) { clear(box).append(el("div", { class: "alert warn" }, `Kein Bahnhof zu „${p.name}“ gefunden.`)); return; }
    setBase("ÖPNVKarte");
    focusOn(station.lat, station.lon, 16);
    L.circle([station.lat, station.lon], { radius: RADIUS_M, color: "#1b4f9c", weight: 2, dashArray: "6 6", fill: false, interactive: false }).addTo(groups.places);
    L.marker([station.lat, station.lon], { icon: pinIcon("🚉") }).addTo(groups.places).bindPopup(station.name.replace(/[<>&]/g, ""));

    const linesBox = el("div", {}, spinnerLine("Lade Linien und Takt …"));
    const shopsBox = el("div", {}, spinnerLine("Suche Läden im Bahnhof und bis 500 m …"));
    const dl = direktLink(station);
    clear(box).append(
      el("div", { class: "card" },
        el("h3", { style: { marginTop: 0 } }, `🚉 ${station.name}`),
        el("p", { class: "muted small" }, [p.name !== station.name ? `Hauptbahnhof von ${p.name}` : null, station.area, station.state].filter(Boolean).join(" · ")),
        el("div", { class: "btns" },
          el("button", { class: "btn small primary", onclick: () => nav.board.open(station) }, "Abfahrtstafel"),
          el("button", { class: "btn small", onclick: () => { nav.plan.setStart(station); toast(`Start: ${station.name}`); } }, "Als Start"),
          el("button", { class: "btn small", onclick: () => toast(addFavorite(station, "Bahnhof") ? "Gemerkt" : "Schon gemerkt") }, "☆ Merken"),
          el("button", { class: "btn small", onclick: () => nav.budget.open(p) }, "🌳 Homeless-Modus"),
          dl ? el("a", { class: "btn small", href: dl, target: "_blank", rel: "noopener" }, "Wohin direkt?") : null),
        others.length ? el("p", { class: "small", style: { marginBottom: 0 } }, "Anderer Bahnhof: ",
          others.map((o) => el("button", { class: "chip", onclick: () => load(p, o) }, o.name))) : null),
      el("h3", {}, "Linien & Takt"), linesBox,
      el("h3", {}, "Läden & Einrichtungen"), shopsBox,
      lazyDetails("🛏 Übernachten: Hostels, Motels, Airbnb, Ferienwohnungen", () => bookingPanel(p)),
      lazyDetails("Unterkünfte aus OpenStreetMap (mit Preiseinschätzung)", () => lodgingPanel(station)),
      lazyDetails("Sehenswertes in der Nähe", () => sightsPanel(station)),
      lazyDetails("Wanderwege in der Umgebung", () => hikingPanel(station)),
      lazyDetails("Bibliotheken (WLAN, Regentag)", () => libraryPanel(station)));

    loadLines(station, linesBox, stale);
    loadShops(station, shopsBox, stale);
  } catch (e) {
    if (!stale()) clear(box).append(errorLine(e));
  }
}

async function loadLines(station, target, stale) {
  try {
    const res = await stopTimes(station.stopId || `${station.lat},${station.lon}`, new Date().toISOString(), { n: 120, radius: 300 });
    if (stale()) return;
    const deps = prepareDepartures(res.stopTimes, { showLongDistance: true });
    const hour = Date.now() + 3600e3;
    const nextHour = deps.filter((d) => Date.parse(d.time) <= hour);
    const ok = nextHour.filter((d) => d.dticket.ok).length;
    clear(target).append(
      deps.length ? linesBlock(deps) : el("p", { class: "muted" }, "Keine Abfahrten gefunden."),
      el("p", { class: "muted small" }, `In der nächsten Stunde ${nextHour.length} Abfahrten am Bahnhof und am Vorplatz, davon ${ok} mit dem D-Ticket. Auf eine Linie zeigen: Hauptziele.`));
  } catch (e) {
    if (!stale()) clear(target).append(errorLine(e));
  }
}

async function loadShops(station, target, stale) {
  let shops, note = null;
  try {
    const { elements, polygons } = await stationShops(station, RADIUS_M);
    shops = placeShops(station, elements, polygons, { radiusM: RADIUS_M });
    if (!polygons.length) note = "Kein Bahnhofsgebäude in OSM gefunden: „im Bahnhof“ heißt hier höchstens 60 m vom Bahnsteig-Punkt.";
  } catch (e) {
    // Overpass überlastet: eigene Daten (nur Supermarkt, Bäcker, Kiosk, Apotheke, WC, Schließfächer …)
    try {
      shops = placeShops(station, await stationInfo(station, RADIUS_M), [], { radiusM: RADIUS_M });
      note = `Nur eine Auswahl (Server überlastet: ${e.message}). Später nochmal probieren für alle Läden.`;
    } catch {
      if (!stale()) clear(target).append(errorLine(e));
      return;
    }
  }
  if (stale()) return;
  for (const s of shops) {
    const c = SHOP_CATS[s.cat];
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "", html: `<div style="font-size:18px;filter:drop-shadow(0 1px 1px #0008)">${c.icon}</div>`, iconSize: [20, 20] }), title: s.tags.name || c.label })
      .bindPopup(() => el("div", {}, el("strong", {}, `${c.icon} ${shopName(s)}`), el("br"), s.inside ? "im Bahnhof" : `${s.distM} m`,
        s.tags.opening_hours ? [el("br"), `🕒 ${ohDe(s.tags.opening_hours)}`] : null, el("br"), extLink(osmLink(s.lat, s.lon), "OSM")))
      .addTo(groups.places);
  }
  const inside = shops.filter((s) => s.inside);
  const around = shops.filter((s) => !s.inside);
  const section = (title, list) => {
    const byCat = {};
    for (const s of list) (byCat[s.cat] ||= []).push(s);
    return [el("h4", {}, `${title} (${list.length})`),
      ...Object.keys(SHOP_CATS).filter((k) => byCat[k]).map((k) =>
        el("details", { open: list === inside || byCat[k].length <= 4 },
          el("summary", {}, `${SHOP_CATS[k].icon} ${SHOP_CATS[k].label} (${byCat[k].length})`),
          el("ul", { class: "list" }, byCat[k].slice(0, 25).map(shopRow))))];
  };
  // append() schreibt null als Text „null“ – darum über el() bündeln, das null überspringt
  clear(target).append(el("div", {},
    note ? el("div", { class: "alert warn small" }, note) : null,
    shops.length ? null : el("p", { class: "muted" }, "Keine Läden in OSM eingetragen."),
    ...(inside.length ? section("Im Bahnhof", inside) : []),
    ...(around.length ? section(`Im Umkreis bis ${RADIUS_M} m`, around) : []),
    el("p", { class: "muted small" }, "Daten © OpenStreetMap-Mitwirkende. Öffnungszeiten aus OSM, können veraltet sein.")));
}

// Ohne Namen lieber die Art („Schließfächer“) als den Betreiber („Bahnhofs-Service“) zeigen
const kindOf = (t) => KIND[t.shop] || KIND[t.amenity] || (/locker|luggage/.test(t.vending || "") ? "Schließfächer" : null);
const shopName = (s) => s.tags.name || s.tags.brand || kindOf(s.tags) || s.tags.operator || SHOP_CATS[s.cat].label;
const KIND = {
  supermarket: "Supermarkt", convenience: "Kiosk/Späti", kiosk: "Kiosk", bakery: "Bäcker", cafe: "Café", fast_food: "Imbiss", restaurant: "Restaurant",
  pharmacy: "Apotheke", chemist: "Drogerie", newsagent: "Presse", books: "Buchhandlung", bank: "Bank", atm: "Geldautomat", post_office: "Post",
  toilets: "Toilette", left_luggage: "Gepäckaufbewahrung", luggage_locker: "Schließfächer", lockers: "Schließfächer", locker: "Schließfächer",
  bicycle_parking: "Fahrradparken", bicycle_rental: "Leihrad", car_rental: "Autovermietung", taxi: "Taxi", police: "Polizei", ice_cream: "Eis",
  pub: "Kneipe", bar: "Bar", tobacco: "Tabak", mobile_phone: "Handyladen", drinking_water: "Trinkwasser", beverages: "Getränke",
  optician: "Optiker", hearing_aids: "Hörgeräte", ticket: "Fahrkarten", travel_agency: "Reisebüro", stationery: "Schreibwaren",
  gift: "Geschenke", bag: "Taschen", electronics: "Elektronik", "e-cigarette": "E-Zigaretten", deli: "Feinkost", butcher: "Metzger",
  greengrocer: "Obst & Gemüse", alcohol: "Spirituosen", pastry: "Konditorei", coffee: "Kaffee", food_court: "Food-Court", biergarten: "Biergarten",
  bureau_de_change: "Wechselstube", money_transfer: "Geldtransfer", lost_property_office: "Fundbüro", charging_station: "Ladesäule",
  clothes: "Kleidung", shoes: "Schuhe", florist: "Blumen", hairdresser: "Friseur", jewelry: "Schmuck", cosmetics: "Kosmetik",
  variety_store: "Sonderposten", second_hand: "Second Hand", copyshop: "Copyshop", laundry: "Waschsalon", dry_cleaning: "Reinigung",
  department_store: "Kaufhaus", mall: "Einkaufszentrum", toys: "Spielwaren", sports: "Sport", bicycle: "Fahrradladen", tattoo: "Tattoo",
  beauty: "Kosmetikstudio", massage: "Massage", erotic: "Erotik", pawnbroker: "Pfandleihe", frozen_food: "Tiefkühlkost", medical_supply: "Sanitätshaus",
};

function shopRow(s) {
  const t = s.tags;
  const kind = kindOf(t) || (t.shop ? t.shop.replace(/_/g, " ") : null);
  return el("li", {},
    el("div", { class: "grow" },
      el("strong", {}, shopName(s)),
      el("span", { class: "muted small" }, [kind, s.inside ? "im Bahnhof" : `${s.distM} m`, t.level ? `Ebene ${t.level}` : null, t.fee === "yes" ? "kostenpflichtig" : null].filter(Boolean).join(" · ")),
      t.opening_hours ? el("span", { class: "muted small" }, `🕒 ${ohDe(t.opening_hours)}`) : null),
    el("button", { class: "btn small", onclick: () => focusOn(s.lat, s.lon, 18) }, "Karte"));
}
