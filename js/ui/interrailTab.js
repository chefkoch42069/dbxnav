// Reiter „International“: Interrail Global Pass – wo er gilt, wohin man in X Stunden kommt,
// und Touren mit derselben Planung wie beim D-Ticket (Etappen, letzte Verbindung, Unterkünfte).
import { el, clear, busy, toast, spinnerLine, errorLine, extLink, durationSelect, optionSelect, DURATIONS, plain } from "./dom.js";
import { stopList } from "./stopList.js";
import { timeScale } from "./timeScale.js";
import { cityName } from "../planner/booking.js";
import { placeInput } from "./placeInput.js";
import { map, groups, fitPoints, pinIcon, popupContent } from "./map.js";
import { renderTour, slimDays } from "./tourView.js";
import { nav } from "./nav.js";
import { state, setPref } from "../state.js";
import { plan, oneToAll } from "../api/transitous.js";
import { planTour } from "../planner/tour.js";
import { makeInterrailRules, travelDays, recommendPass, homeViolations } from "../planner/interrail.js";
import { INTERRAIL } from "../config.js";
import { makeLocator, distanceKm } from "../lib/geo.js";
import { berlinToISO, todayBerlin, addDays, fmtDuration, fmtMinutes, diffSec } from "../lib/time.js";
import { uid, load, save } from "../lib/store.js";
import { loadCountries } from "./statesData.js";

const api = { plan };
let locate = null; // (lat, lon) → ISO-Code
let countryNames = {};
let countryLayer = null;
let resultBox, stops;
const opts = load("interrail", { home: INTERRAIL.defaultHome, allowNight: true, avoidReservation: false, maxHours: 8 });

async function ensureCountries() {
  if (locate) return;
  const fc = await loadCountries();
  locate = makeLocator(fc);
  countryNames = Object.fromEntries(fc.features.map((f) => [f.properties.id, f.properties.name]));
  countryLayer = L.geoJSON(fc, {
    style: (f) => {
      const id = f.properties.id;
      const valid = INTERRAIL.countries.includes(id);
      const home = id === opts.home;
      return { color: "#fff", weight: 1, fillOpacity: valid ? 0.35 : 0.12, fillColor: home ? "#f2a900" : valid ? "#1e7b45" : "#888" };
    },
    onEachFeature: (f, layer) => {
      const id = f.properties.id;
      const txt = id === opts.home ? "Wohnland: Pass nur für Hin- und Rückreise" : INTERRAIL.countries.includes(id) ? "Interrail gilt" : "nicht im Pass";
      layer.bindTooltip(`${f.properties.name}: ${txt}`, { sticky: true });
    },
  });
}

const rules = () => makeInterrailRules({ countryOf: locate, home: opts.home, allowNight: opts.allowNight, avoidReservation: opts.avoidReservation });

function showCountries(on = true) {
  if (!countryLayer) return;
  if (on) { groups.countries.clearLayers(); groups.countries.addLayer(countryLayer); countryLayer.setStyle(countryLayer.options.style); }
  else groups.countries.clearLayers();
}

export function initInterrailTab(root) {
  const start = placeInput({ label: "Start", id: "ir-start", value: state.prefs.home, onSelect: (p) => setPref("home", p) });
  const homeSel = el("select", { "aria-label": "Wohnland" });
  const countryBtn = el("button", { class: "btn" }, "🗺️ Länderkarte");
  const legend = el("div", { class: "legend small", hidden: true },
    el("span", { style: { marginRight: "10px" } }, el("i", { style: { background: "#1e7b45" } }), "Pass gilt"),
    el("span", { style: { marginRight: "10px" } }, el("i", { style: { background: "#f2a900" } }), "Wohnland (nur Hin/Rück)"),
    el("span", {}, el("i", { style: { background: "#888" } }), "nicht im Pass"));

  ensureCountries().then(() => {
    const ids = Object.keys(countryNames).filter((id) => INTERRAIL.countries.includes(id)).sort((a, b) => countryNames[a].localeCompare(countryNames[b]));
    homeSel.replaceChildren(...ids.map((id) => el("option", { value: id, selected: id === opts.home }, countryNames[id])));
  }).catch(() => toast("Ländergrenzen konnten nicht geladen werden."));
  homeSel.onchange = () => { opts.home = homeSel.value; save("interrail", opts); if (groups.countries.getLayers().length) showCountries(true); };
  countryBtn.onclick = async () => {
    await ensureCountries();
    const on = !groups.countries.getLayers().length;
    showCountries(on);
    legend.hidden = !on;
    if (on) map.fitBounds([[35, -10], [66, 32]]);
  };

  // --- Wohin komme ich?
  const hours = durationSelect(DURATIONS.reach, 360);
  const transfers = optionSelect([[0, "direkt"], [1, "max. 1 Umstieg"], [2, "max. 2 Umstiege"]], 1);
  const reachBtn = el("button", { class: "btn primary block" }, "Erreichbare Ziele zeigen");
  const reachInfo = el("div");
  reachBtn.onclick = () => {
    const s = start.value;
    if (!s) return toast("Bitte zuerst einen Start wählen.");
    busy(reachBtn, () => runReach(s, +hours.value, +transfers.value, reachInfo));
  };

  // --- Tour
  stops = stopList({
    field: "nights", initial: 1, empty: "Noch keine Ziele. Unten eintippen oder in der Karte ein erreichbares Ziel antippen.",
    makeSelect: (v, onChange) => optionSelect([1, 2, 3, 4, 5].map((n) => [n, `${n} N.`]), v, { onchange: (e) => onChange(+e.target.value) }),
  });
  const add = placeInput({ label: "Ziel hinzufügen", id: "ir-add", placeholder: "Stadt oder Bahnhof in Europa", onSelect: (p) => { stops.add(p); add.value = null; } });
  const round = el("input", { type: "checkbox", checked: true });
  const date = el("input", { type: "date", value: addDays(todayBerlin(), 1) });
  const dep = el("input", { type: "time", value: "08:00" });
  const maxH = durationSelect(DURATIONS.day, Math.round(opts.maxHours * 60));
  const night = el("input", { type: "checkbox", checked: opts.allowNight });
  const noRes = el("input", { type: "checkbox", checked: opts.avoidReservation });
  const go = el("button", { class: "btn primary block" }, "Interrail-Tour planen");
  resultBox = el("div");
  go.onclick = async () => {
    const s = start.value;
    if (!s) return toast("Bitte einen Start wählen.");
    const list = stops.copy();
    if (!list.length) return toast("Bitte mindestens ein Ziel hinzufügen.");
    Object.assign(opts, { allowNight: night.checked, avoidReservation: noRes.checked, maxHours: +maxH.value / 60 });
    save("interrail", opts);
    const params = { start: s, stops: list, roundtrip: round.checked, startDate: date.value, departTime: dep.value, maxHours: opts.maxHours };
    busy(go, () => runTour({ name: `Interrail: ${list.map((x) => cityName(x.place.name)).join(" – ")}`, params }));
  };

  nav.interrail.addStop = (p) => stops.add(p);
  nav.interrail.openTour = async (t) => { await ensureCountries(); nav.switchTab("intl"); show(t); };

  root.append(
    el("h2", {}, "International"),
    el("p", { class: "lead" }, `Interrail Global Pass: ${INTERRAIL.countries.length} Länder, Fernzüge inklusive.`),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Wohnland"), homeSel), el("div", { class: "field", style: { flex: "0 0 auto" } }, countryBtn)),
    legend,
    start.node,
    el("h3", {}, "Wohin komme ich?"),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Zeit ab 7 Uhr"), hours), el("div", { class: "field" }, el("label", {}, "Umstiege"), transfers)),
    reachBtn, reachInfo,
    el("h3", {}, "Tour planen"),
    stops.node, add.node,
    el("label", { class: "check" }, round, "Rundreise (am Ende zurück zum Start)"),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Start am"), date), el("div", { class: "field" }, el("label", {}, "Abfahrt"), dep), el("div", { class: "field" }, el("label", {}, "Max./Tag"), maxH)),
    el("label", { class: "check small" }, night, "Nachtzüge erlauben (sparen eine Übernachtung)"),
    el("label", { class: "check small" }, noRes, "Reservierungspflichtige Züge meiden (TGV, AVE, Frecciarossa …)"),
    go,
    resultBox,
    el("details", {}, el("summary", {}, "Regeln & Tipps"),
      el("ul", { class: "small" },
        el("li", {}, "Im Wohnland gilt der Pass nur für eine Fahrt hinaus und eine zurück – dazwischen z. B. mit dem D-Ticket fahren."),
        el("li", {}, "Reservierungspflicht (Faustregel): Hochgeschwindigkeits- und Fernzüge in Frankreich, Spanien, Italien, Portugal, Schweden, Norwegen, Polen, Griechenland, Türkei, dazu Eurostar und alle Nachtzüge."),
        el("li", {}, "Privatbahnen wie Italo, FlixTrain, Iryo, Ouigo, WESTbahn, RegioJet, Leo Express sind nicht im Pass."),
        el("li", {}, "Nachtzug ab 19 Uhr zählt nur als ein Reisetag (Abfahrtstag)."),
        el("li", {}, "Stadtverkehr (U-Bahn, Tram, Bus) ist nicht im Pass enthalten."),
        el("li", {}, "Länderliste, Preise und Regeln ändern sich – aktuell auf ", extLink("https://www.interrail.eu/de", "interrail.eu"), ". ", INTERRAIL.checked))));
}


/** Erreichbarkeit mit Fernzügen; Bahnhöfe mit ähnlicher Lage (verschiedene Datenquellen) zusammenfassen. */
async function runReach(s, maxMin, maxTransfers, info) {
  await ensureCountries();
  clear(info).append(spinnerLine("Frage Transitous ab (Fernverkehr Europa) …"));
  groups.daytrip.clearLayers();
  const res = await oneToAll(s, berlinToISO(addDays(todayBerlin(), 1), "07:00"),
    { maxMinutes: maxMin, maxTransfers, modes: ["HIGHSPEED_RAIL", "LONG_DISTANCE"] });
  const r = rules();
  const scale = timeScale(maxMin);
  const minKm = maxMin <= 60 ? 5 : 15;
  // Bahnhöfe mit fast gleicher Lage (mehrere Datenquellen) zusammenfassen – über ein Raster
  // statt jeden mit jedem zu vergleichen (bei ~90.000 Einträgen sonst spürbar langsam).
  const CELL = 0.02;
  const grid = new Map();
  const best = [];
  const cellOf = (p) => [Math.floor(p.lat / CELL), Math.floor(p.lon / (CELL * 1.5))];
  const findNear = (p) => {
    const [cy, cx] = cellOf(p);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const b of grid.get(`${cy + dy},${cx + dx}`) || []) if (distanceKm(b, p) < 2) return b;
    }
    return null;
  };
  for (const x of res.all || []) {
    const p = x.place;
    if (!(p.modes || []).some((m) => m === "HIGHSPEED_RAIL" || m === "LONG_DISTANCE")) continue;
    const near = findNear(p);
    if (near) {
      if ((p.importance || 0) > near.importance) { near.name = p.name; near.importance = p.importance || 0; }
      near.minutes = Math.min(near.minutes, x.duration);
      continue;
    }
    if (distanceKm(s, p) < minKm) continue;
    const item = { name: p.name, lat: p.lat, lon: p.lon, stopId: p.stopId, importance: p.importance || 0, minutes: x.duration };
    best.push(item);
    const key = cellOf(p).join(",");
    grid.has(key) ? grid.get(key).push(item) : grid.set(key, [item]);
  }
  const shown = best.map((b) => ({ ...b, country: r.countryOf(b) })).filter((b) => INTERRAIL.countries.includes(b.country))
    .sort((a, b) => b.importance - a.importance).slice(0, 350);
  for (const d of shown) {
    L.circleMarker([d.lat, d.lon], { radius: 4 + Math.min(6, d.importance * 300), color: "#fff", weight: 1.5, fillColor: scale.color(d.minutes), fillOpacity: 0.95 })
      .bindTooltip(`${plain(d.name)} · ${fmtDuration(d.minutes * 60)}`)
      .bindPopup(() => popupContent([el("strong", {}, d.name), el("br"), `${countryNames[d.country] || d.country} · ca. ${fmtDuration(d.minutes * 60)}`, el("br"),
        el("button", { class: "btn small primary", onclick: () => { stops.add({ name: d.name, lat: d.lat, lon: d.lon, stopId: d.stopId }); map.closePopup(); } }, "+ Zur Tour")]))
      .addTo(groups.daytrip);
  }
  L.marker([s.lat, s.lon], { icon: pinIcon("⌂") }).addTo(groups.daytrip);
  fitPoints([[s.lat, s.lon], ...shown.map((d) => [d.lat, d.lon])], 9);
  const nCountries = new Set(shown.map((d) => d.country)).size;
  const until = 7 * 60 + maxMin;
  const untilText = `${Math.floor(until / 60)}:${String(until % 60).padStart(2, "0")} Uhr`;
  clear(info).append(
    el("p", { class: "small" }, shown.length
      ? `${shown.length} Fernbahnhöfe in ${nCountries} ${nCountries === 1 ? "Land" : "Ländern"} – Ankunft bis spätestens ${untilText} bei Abfahrt ab 7 Uhr morgen (Wartezeit auf den ersten Zug zählt mit).`
      : `In ${fmtMinutes(maxMin)} ab 7 Uhr ist kein Fernbahnhof erreichbar – mehr Zeit oder mehr Umstiege wählen.`),
    shown.length ? scale.legend() : null,
    el("p", { class: "muted small" }, "Punkt antippen → „+ Zur Tour“. Nur Fernzüge; Regionalzüge erweitern die Reichweite noch."));
}

async function runTour({ name, params }) {
  await ensureCountries();
  clear(resultBox).append(spinnerLine("Plane Etappen …"));
  const progress = resultBox.firstChild;
  const r = rules();
  const days = await planTour(params, api, (d) => (progress.lastChild.textContent = ` Plane Etappen … ${d.length} Tag(e) fertig`), r);
  const tour = { id: uid(), kind: "interrail", name, params, opts: { ...opts }, days: slimDays(days), created: new Date().toISOString() };
  show(tour);
  document.getElementById("panel").scrollTop = resultBox.offsetTop - 10;
}

function show(tour) {
  const r = makeInterrailRules({ countryOf: locate, ...(tour.opts || opts) });
  renderTour(resultBox, tour, {
    rules: r,
    api,
    replan: (params) => runTour({ name: tour.name, params }).catch((e) => clear(resultBox).append(errorLine(e))),
    summary: (t) => passSummary(t, r),
    dayNotes: (d, i, t) => {
      const bad = homeViolations(t.days, r);
      return bad.includes(i) ? el("div", { class: "alert warn" },
        "Fahrt durch dein Wohnland mitten in der Reise: Der Global Pass deckt im Wohnland nur je eine Fahrt hinaus und zurück. ",
        "Hier also Fahrkarte oder D-Ticket (nur Nahverkehr) – oder ein Zwischenziel außerhalb wählen, z. B. über die Schweiz.") : null;
    },
  });
}

function passSummary(t, r) {
  const n = travelDays(t.days, r);
  const span = t.days.length ? Math.round(diffSec(`${t.days[0].date}T00:00:00Z`, `${t.days[t.days.length - 1].date}T00:00:00Z`) / 86400) + 1 : 0;
  const rec = recommendPass(n, span);
  const res = t.days.flatMap((d) => (d.itinerary ? d.itinerary.legs : [])).filter((l) => /Reservierung/.test(r.checkLeg(l).note || "")).length;
  const countries = [...new Set(t.days.flatMap((d) => (d.itinerary ? d.itinerary.legs : [])).filter((l) => l.mode !== "WALK").map((l) => r.countryOf(l.to)).filter(Boolean))];
  return el("div", { class: "card", style: { background: "var(--soft)" } },
    el("strong", {}, "🎫 Pass"),
    el("div", { class: "chips" },
      el("span", { class: "chip static" }, `${n} Reisetag${n === 1 ? "" : "e"} in ${span} Tagen`),
      el("span", { class: "chip static" }, `${countries.length} Länder`),
      res ? el("span", { class: "chip static" }, `${res}× Reservierung`) : null),
    rec ? el("p", { style: { margin: "6px 0 0" } }, "Passt: ", el("strong", {}, rec.label)) : el("p", { class: "muted" }, "Keine Pass-Fahrten in dieser Tour."),
    el("p", { class: "muted small" }, "Preise und aktuelle Varianten: ", extLink("https://www.interrail.eu/de/interrail-passes/global-pass", "interrail.eu"), ". Reservierungen kosten extra."));
}
