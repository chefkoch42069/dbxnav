// Reiter „Planen“: Einstieg über die Reiseart, danach passt sich die Planung an.
import { el, clear, busy, toast, spinnerLine, errorLine, extLink, direktLink, bahnLink } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { renderItinerary, weatherChip, lodgingPanel, bookingPanel, stationPanel, sightsPanel, hikingPanel, libraryPanel, lazyDetails, stayText } from "./details.js";
import { map, groups, drawItinerary, fitPoints, pinIcon, popupContent, focusOn, DAY_COLORS } from "./map.js";
import { nav } from "./nav.js";
import { state, setPref, saveTour, addFavorite, addJournal } from "../state.js";
import { plan, oneToAll } from "../api/transitous.js";
import { planTour, latestDeparture, transitArrival } from "../planner/tour.js";
import { combineReachability } from "../planner/daytrip.js";
import { buildReachTree } from "../planner/reachTree.js";
import { suggestRoundtrip } from "../planner/roundtrip.js";
import { pickBest, pickLatest, DTICKET_RULES } from "../planner/dticket.js";
import { renderTour, slimDays } from "./tourView.js";
import { berlinToISO, fmtTime, fmtDate, fmtDuration, todayBerlin, nextWeekday, addDays } from "../lib/time.js";
import { stateAt } from "../lib/geo.js";
import { uid } from "../lib/store.js";
import { STATES } from "../config.js";
import { loadStates } from "./statesData.js";
import { addItineraryToCollector, visitedStates } from "../collector.js";
import { budgetPanel } from "./budgetTab.js";
import { prefetchTour } from "../offline.js";

const KINDS = {
  day: { title: "Tagestrip", sub: "abends zurück" },
  weekend: { title: "Wochenende", sub: "1–2 Nächte" },
  multi: { title: "Mehrtagestour", sub: "3–14 Tage" },
};

const api = { plan };
let root, formBox, resultBox;
let kind = null;
let start;

export function initPlanTab(container) {
  root = container;
  start = placeInput({
    label: "Start", id: "plan-start", value: state.prefs.home,
    onSelect: (p) => { setPref("home", p); focusOn(p.lat, p.lon, 10); },
  });
  const kindBtns = Object.entries(KINDS).map(([k, v]) =>
    el("button", { class: "kind", "aria-pressed": "false", "data-kind": k, onclick: () => selectKind(k) }, el("strong", {}, v.title), el("span", {}, v.sub)));
  formBox = el("div");
  resultBox = el("div");
  root.append(
    el("h2", {}, "Wie lange bist du unterwegs?"),
    el("p", { class: "lead" }, "Nur Nahverkehr – alles mit dem Deutschlandticket."),
    el("div", { class: "kinds" }, kindBtns),
    formBox, resultBox);

  nav.plan.setStart = (p) => { start.value = p; setPref("home", p); };
  nav.plan.addStop = (p) => { selectKind("multi"); multi.addStop(p); };
  nav.plan.openTour = (t) => { selectKind(t.kind === "weekend" ? "weekend" : "multi", { keepResult: true }); showTour(t); };
  nav.plan.suggestRoundtrip = () => { selectKind("multi"); multi.focusSuggest(); };
}

function selectKind(k, { keepResult = false } = {}) {
  kind = k;
  root.querySelectorAll(".kind").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === k)));
  clear(formBox);
  if (!keepResult) clear(resultBox);
  formBox.append(start.node);
  if (k === "day") dayForm();
  if (k === "weekend") weekendForm();
  if (k === "multi") multi.form();
}

const needStart = () => {
  if (!start.value) { toast("Bitte zuerst einen Start wählen."); start.focus(); return null; }
  return start.value;
};

const hoursSelect = (value, opts = [3, 4, 5, 6, 7, 8, 9, 10]) =>
  el("select", {}, opts.map((h) => el("option", { value: h, selected: +h === +value }, `${h} h`)));

// ---------------------------------------------------------------- Tagestrip
function dayForm() {
  const date = el("input", { type: "date", value: todayBerlin() });
  const dep = el("input", { type: "time", value: "07:00" });
  const back = el("input", { type: "time", value: "22:00" });
  const maxOne = el("select", {}, [1, 1.5, 2, 2.5, 3, 4, 5].map((h) => el("option", { value: h, selected: h === 2.5 }, `${String(h).replace(".", ",")} h`)));
  const minStay = el("select", {}, [1, 2, 3, 4, 6].map((h) => el("option", { value: h, selected: h === 3 }, `${h} h`)));
  const go = el("button", { class: "btn primary block" }, "Ziele finden");
  formBox.append(
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Datum"), date), el("div", { class: "field" }, el("label", {}, "Los ab"), dep), el("div", { class: "field" }, el("label", {}, "Zurück bis"), back)),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Max. Fahrzeit je Richtung"), maxOne), el("div", { class: "field" }, el("label", {}, "Min. Aufenthalt"), minStay)),
    go);
  go.onclick = () => {
    const s = needStart();
    if (!s) return;
    busy(go, () => runDayTrip(s, { date: date.value, dep: dep.value, back: back.value, maxMin: +maxOne.value * 60, minStay: +minStay.value * 3600 }));
  };
}

const colorForMinutes = (m) => (m <= 60 ? "#1e7b45" : m <= 105 ? "#7cb342" : m <= 150 ? "#f2a900" : m <= 210 ? "#ef6c00" : "#c62828");

/**
 * Erreichbare Orte als Linien vom Start aus zeichnen, jeder Abschnitt in der Farbe seiner Fahrzeit.
 * Nur Linienenden bekommen einen Punkt; Antippen eines Abschnitts wählt den Ort an seinem Ende.
 */
function drawReachTree(home, tree, layer, { onClick, popup } = {}) {
  const bind = (layer, d) => {
    layer.bindTooltip(`${d.name} · ${fmtDuration(d.outMinutes * 60)}`, { sticky: true });
    if (popup) layer.bindPopup(() => popup(d));
    if (onClick) layer.on("click", () => onClick(d));
    return layer;
  };
  // Erst eine helle Kontur unter alle Abschnitte, damit die Linien auf jeder Grundkarte lesbar bleiben.
  const segs = tree.nodes.map((d) => [d.parent < 0 ? home : tree.nodes[d.parent], d]);
  for (const [a, b] of segs) L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: "#fff", weight: 7, opacity: 0.8, interactive: false }).addTo(layer);
  for (const [a, b] of segs) bind(L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: colorForMinutes(b.outMinutes), weight: 4, opacity: 0.95, lineCap: "round" }), b).addTo(layer);
  for (const br of tree.branches) {
    const d = br.end;
    bind(L.circleMarker([d.lat, d.lon], { radius: 5, color: "#fff", weight: 1.5, fillColor: colorForMinutes(d.outMinutes), fillOpacity: 1 }), d).addTo(layer);
  }
}

const branchPoints = (br) => [br.from, ...br.stops].map((p) => [p.lat, p.lon]);

async function runDayTrip(home, o) {
  clear(resultBox).append(spinnerLine("Frage Erreichbarkeit bei Transitous ab (hin und zurück) …"));
  groups.daytrip.clearLayers();
  groups.trip.clearLayers();
  groups.route.clearLayers();
  const [outb, inb] = await Promise.all([
    oneToAll(home, berlinToISO(o.date, o.dep), { maxMinutes: o.maxMin }),
    oneToAll(home, berlinToISO(o.date, o.back), { maxMinutes: o.maxMin, arriveBy: true }),
  ]);
  const dests = combineReachability(home, outb, inb, { minStaySec: o.minStay });
  clear(resultBox);
  if (!dests.length) {
    resultBox.append(el("div", { class: "alert warn" }, "Keine Ziele gefunden. Mehr Fahrzeit oder kürzeren Aufenthalt probieren."));
    return;
  }
  const tree = buildReachTree(home, dests);
  drawReachTree(home, tree, groups.daytrip, { onClick: (d) => showDayDest(home, d, o) });
  L.marker([home.lat, home.lon], { icon: pinIcon("⌂") }).addTo(groups.daytrip).bindPopup(home.name);
  fitPoints([[home.lat, home.lon], ...dests.map((d) => [d.lat, d.lon])], 10);

  // Liste: eine Zeile je Linie (benannt nach dem Endpunkt), die Halte darin aufklappbar.
  const sortSel = el("select", {}, [["importance", "Bedeutung"], ["stay", "Längster Aufenthalt"], ["near", "Kürzeste Fahrt"]].map(([v, t]) => el("option", { value: v }, t)));
  const list = el("div");
  const maxOf = (br, f) => Math.max(...br.stops.map(f));
  const stopItem = (d) => el("li", {}, el("div", { class: "grow" }, el("strong", {}, d.name),
    el("span", { class: "muted small" }, `${fmtDuration(d.outMinutes * 60)} hin · frühestens an ${fmtTime(d.arrival)} · letzte Rückfahrt ${fmtTime(d.lastReturn)} · ${stayText(d.arrival, d.lastReturn)} Zeit`)),
    el("button", { class: "btn small", onclick: () => showDayDest(home, d, o) }, "Details"));
  const renderList = () => {
    const arr = [...tree.branches];
    if (sortSel.value === "importance") arr.sort((a, b) => maxOf(b, (s) => s.importance) - maxOf(a, (s) => s.importance));
    if (sortSel.value === "stay") arr.sort((a, b) => maxOf(b, (s) => s.stay) - maxOf(a, (s) => s.stay));
    if (sortSel.value === "near") arr.sort((a, b) => a.stops[0].outMinutes - b.stops[0].outMinutes);
    list.replaceChildren(...arr.slice(0, 40).map((br) => {
      const first = br.stops[0], last = br.end;
      const range = br.stops.length > 1 ? `${fmtDuration(first.outMinutes * 60)} – ${fmtDuration(last.outMinutes * 60)}` : fmtDuration(last.outMinutes * 60);
      const det = el("details", { class: "branch" },
        el("summary", {}, el("i", { class: "swatch", style: { background: colorForMinutes(last.outMinutes) } }),
          br.from === home ? `Richtung ${last.name}` : `${br.from.name} → ${last.name}`,
          el("span", { class: "muted small" }, ` · ${br.stops.length} ${br.stops.length === 1 ? "Halt" : "Halte"} · ${range}`)),
        el("ul", { class: "list" }, br.stops.map(stopItem)));
      det.addEventListener("toggle", () => { if (det.open) fitPoints(branchPoints(br), 11); });
      return det;
    }));
  };
  sortSel.onchange = renderList;
  renderList();
  const dl = direktLink(home);
  resultBox.append(
    el("h3", {}, `${dests.length} Ziele auf ${tree.branches.length} Strecken, hin und zurück am selben Tag`),
    el("div", { class: "legend small" }, ...[[60, "≤ 1 h"], [105, "≤ 1¾ h"], [150, "≤ 2½ h"], [210, "≤ 3½ h"], [999, "länger"]].map(([m, t]) => el("span", { style: { marginRight: "8px" } }, el("i", { style: { background: colorForMinutes(m) } }), t))),
    dl ? el("p", { class: "small" }, "Ohne Umstieg erreichbar: ", extLink(dl, "direkt.bahn.guru (nur Regionalverkehr)")) : null,
    el("div", { class: "field" }, el("label", {}, "Sortieren"), sortSel),
    list);
}

function showDayDest(home, d, o) {
  const box = el("div", { class: "card" });
  const conn = el("div");
  const btnConn = el("button", { class: "btn primary small" }, "Hin- und Rückfahrt planen");
  btnConn.onclick = () => busy(btnConn, async () => {
    groups.route.clearLayers();
    const [there, back] = await Promise.all([
      plan(home, d, berlinToISO(o.date, o.dep)),
      plan(d, home, berlinToISO(o.date, o.back), { arriveBy: true, numItineraries: 5 }),
    ]);
    const hin = pickBest(there), zur = pickLatest(back);
    clear(conn);
    const pts = [];
    if (hin) { conn.append(el("h4", {}, "Hinfahrt"), renderItinerary(hin)); pts.push(...drawItinerary(hin, groups.route, { color: DAY_COLORS[0] })); }
    else conn.append(el("div", { class: "alert no" }, "Keine Hinfahrt gefunden."));
    if (zur) {
      conn.append(el("h4", {}, "Letzte Rückfahrt"), el("div", { class: "alert warn" }, `Spätestens um ${fmtTime(zur.startTime)} ab ${d.name} losfahren!`), renderItinerary(zur));
      pts.push(...drawItinerary(zur, groups.route, { color: DAY_COLORS[1] }));
    } else conn.append(el("div", { class: "alert no" }, `Keine Rückfahrt bis ${o.back} gefunden.`));
    if (hin && zur) conn.append(el("p", {}, `Aufenthalt: ${stayText(hin.endTime, zur.startTime)}`),
      el("button", { class: "btn small", onclick: async () => { const n = (await addItineraryToCollector(hin)) + (await addItineraryToCollector(zur)); addJournal({ date: o.date, title: `Tagestrip nach ${d.name}` }); toast(`${n} Abschnitte im Sammler, Tagebuch-Eintrag angelegt`); } }, "✓ Bin ich gefahren"));
    fitPoints(pts);
  });
  box.append(
    el("h4", {}, d.name),
    el("div", { class: "chips" },
      el("span", { class: "chip static" }, `frühestens an ${fmtTime(d.arrival)}`),
      el("span", { class: "chip static" }, `zurück spätestens ${fmtTime(d.lastReturn)}`),
      el("span", { class: "chip static" }, `${stayText(d.arrival, d.lastReturn)} vor Ort`),
      weatherChip(d, o.date)),
    el("div", { class: "btns" }, btnConn,
      el("button", { class: "btn small", onclick: () => toast(addFavorite(d, "Ausflugsziel") ? "Gemerkt" : "Schon gemerkt") }, "☆ Merken"),
      el("button", { class: "btn small", onclick: () => nav.board.open(d) }, "Abfahrten"),
      direktLink(d) ? el("a", { class: "btn small", href: direktLink(d), target: "_blank", rel: "noopener" }, "Direkt von hier") : null),
    conn,
    lazyDetails("Lohnende Ausflugsziele (Burgen, Seen, Aussicht)", () => sightsPanel(d)),
    lazyDetails("Wanderwege in der Umgebung", () => hikingPanel(d)),
    lazyDetails("Bibliotheken (WLAN, Regentag)", () => libraryPanel(d)),
    lazyDetails("Kostenlos & billig (Essen, Strom, WLAN, Wasser)", () => budgetPanel(d)),
    lazyDetails("Infos am Bahnhof (WC, Schließfächer, Supermarkt)", () => stationPanel(d)));
  const old = resultBox.querySelector(".card.daydest");
  box.classList.add("daydest");
  if (old) old.replaceWith(box); else resultBox.prepend(box);
  focusOn(d.lat, d.lon, Math.max(map.getZoom(), 10));
  document.getElementById("panel").scrollTop = 0;
}

// ---------------------------------------------------------------- Wochenende
function weekendForm() {
  const dest = placeInput({ label: "Ziel", id: "we-dest", placeholder: "Wohin? (oder unten in der Karte suchen)" });
  // 2 Nächte = Freitag bis Sonntag, 1 Nacht = Samstag bis Sonntag
  const date = el("input", { type: "date", value: nextWeekday(todayBerlin(), 5) });
  const nights = el("select", {}, el("option", { value: 1 }, "1 Nacht"), el("option", { value: 2, selected: true }, "2 Nächte"));
  let dateTouched = false;
  date.addEventListener("change", () => (dateTouched = true));
  nights.addEventListener("change", () => { if (!dateTouched) date.value = nextWeekday(todayBerlin(), +nights.value === 2 ? 5 : 6); });
  const dep = el("input", { type: "time", value: state.prefs.departTime || "08:00" });
  const maxH = hoursSelect(state.prefs.maxHours || 6);
  const go = el("button", { class: "btn primary block" }, "Wochenende planen");
  const find = el("button", { class: "btn block" }, "Wo lohnt sich eine Nacht? Ziele in Reichweite zeigen");
  formBox.append(dest.node,
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Anreise"), date), el("div", { class: "field" }, el("label", {}, "Dauer"), nights)),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Abfahrt"), dep), el("div", { class: "field" }, el("label", {}, "Max. Fahrzeit/Tag"), maxH)),
    go, el("div", { style: { height: "6px" } }), find);
  find.onclick = () => {
    const s = needStart();
    if (!s) return;
    busy(find, async () => {
      groups.daytrip.clearLayers();
      const res = await oneToAll(s, berlinToISO(date.value, dep.value), { maxMinutes: Math.min(+maxH.value, 5) * 60 });
      const fake = { all: (res.all || []).map((r) => ({ ...r, place: { ...r.place, departure: "2099-01-01T00:00:00Z" } })) };
      // Mindestabstand 8 km statt 40 km, sonst fehlen die Halte nahe am Start und die Linien beginnen erst weit draußen.
      const dests = combineReachability(s, res, fake, { minStaySec: 0, minDistanceKm: 8 });
      const tree = buildReachTree(s, dests);
      drawReachTree(s, tree, groups.daytrip, {
        popup: (d) => popupContent([el("strong", {}, d.name), el("br"), `${fmtDuration(d.outMinutes * 60)} Fahrt`, el("br"),
          el("button", { class: "btn small primary", onclick: () => { dest.value = { name: d.name, lat: d.lat, lon: d.lon, stopId: d.stopId }; map.closePopup(); toast(`Ziel: ${d.name}`); } }, "Als Ziel übernehmen")]),
      });
      L.marker([s.lat, s.lon], { icon: pinIcon("⌂") }).addTo(groups.daytrip).bindPopup(s.name);
      fitPoints([[s.lat, s.lon], ...dests.map((d) => [d.lat, d.lon])], 9);
      toast(`${dests.length} Orte auf ${tree.branches.length} Strecken – Linie antippen und als Ziel übernehmen.`);
    });
  };
  go.onclick = () => {
    const s = needStart();
    if (!s) return;
    if (!dest.value) return toast("Bitte ein Ziel wählen.");
    setPref("maxHours", +maxH.value); setPref("departTime", dep.value);
    const params = { start: s, stops: [{ place: dest.value, nights: +nights.value }], roundtrip: true, startDate: date.value, departTime: dep.value, maxHours: +maxH.value };
    busy(go, () => runTour({ kind: "weekend", name: `Wochenende ${dest.value.name}`, params }));
  };
}

// ---------------------------------------------------------------- Mehrtagestour
const multi = (() => {
  let stops = [];
  let listBox, suggestDays, suggestBox;
  const renderStops = () => {
    if (!listBox) return;
    listBox.replaceChildren(...stops.map((s, i) =>
      el("li", {},
        el("div", { class: "grow" }, el("strong", {}, `${i + 1}. ${s.place.name}`)),
        el("select", { "aria-label": "Nächte", onchange: (e) => (s.nights = +e.target.value) }, [1, 2, 3, 4].map((n) => el("option", { value: n, selected: n === s.nights }, `${n} N.`))),
        el("button", { class: "btn small", title: "nach oben", disabled: i === 0, onclick: () => { [stops[i - 1], stops[i]] = [stops[i], stops[i - 1]]; renderStops(); } }, "↑"),
        el("button", { class: "btn small", title: "entfernen", onclick: () => { stops.splice(i, 1); renderStops(); } }, "✕"))));
    if (!stops.length) listBox.append(el("li", { class: "muted small" }, "Noch keine Ziele. Unten hinzufügen oder einen Vorschlag holen."));
  };
  return {
    addStop(p) { stops.push({ place: p, nights: 1 }); renderStops(); toast(`${p.name} hinzugefügt`); },
    focusSuggest() { suggestDays?.focus(); suggestBox?.scrollIntoView({ behavior: "smooth" }); },
    form() {
      const add = placeInput({ label: "Ziel hinzufügen", id: "multi-add", onSelect: (p) => { multi.addStop(p); add.value = null; } });
      listBox = el("ul", { class: "list" });
      const round = el("input", { type: "checkbox", checked: true });
      const date = el("input", { type: "date", value: addDays(todayBerlin(), 1) });
      const dep = el("input", { type: "time", value: state.prefs.departTime || "08:00" });
      const maxH = hoursSelect(state.prefs.maxHours || 6);
      const go = el("button", { class: "btn primary block" }, "Tour planen");
      suggestDays = el("input", { type: "number", min: 2, max: 14, value: 7 });
      const sugBtn = el("button", { class: "btn" }, "Runde vorschlagen");
      suggestBox = el("div", { class: "card" },
        el("strong", {}, "Rundreise-Vorschlag"),
        el("p", { class: "muted small" }, "Eine Runde durch Bundesländer, in denen du laut Sammler noch nicht warst – ein Ort pro Nacht."),
        el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Tage"), suggestDays), sugBtn));
      sugBtn.onclick = async () => {
        const s = needStart();
        if (!s) return;
        const fc = await loadStates();
        const homeState = stateAt(s.lat, s.lon, fc);
        const visited = [...visitedStates().all];
        const r = suggestRoundtrip(s, +suggestDays.value, visited, { maxHours: +maxH.value, homeState });
        if (!r.length) return toast("Kein Vorschlag möglich – mehr Tage oder mehr Fahrzeit pro Tag wählen.");
        stops = r.map((x) => ({ place: { name: x.hub.name, lat: x.hub.lat, lon: x.hub.lon }, nights: 1 }));
        round.checked = true;
        renderStops();
        toast(`Neu: ${r.map((x) => STATES[x.state]).join(", ")}`, 5000);
      };
      formBox.append(listBox, add.node,
        el("label", { class: "check" }, round, "Rundreise (am Ende zurück zum Start)"),
        el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Start am"), date), el("div", { class: "field" }, el("label", {}, "Abfahrt"), dep), el("div", { class: "field" }, el("label", {}, "Max./Tag"), maxH)),
        go, suggestBox);
      renderStops();
      go.onclick = () => {
        const s = needStart();
        if (!s) return;
        if (!stops.length) return toast("Bitte mindestens ein Ziel hinzufügen.");
        setPref("maxHours", +maxH.value); setPref("departTime", dep.value);
        const params = { start: s, stops: stops.map((x) => ({ ...x })), roundtrip: round.checked, startDate: date.value, departTime: dep.value, maxHours: +maxH.value };
        busy(go, () => runTour({ kind: "multi", name: `Tour ${stops.map((x) => x.place.name.replace(/ Hbf$/, "")).join(" – ")}`, params }));
      };
    },
    setStops(s) { stops = s; renderStops(); },
  };
})();

// ---------------------------------------------------------------- Tour planen & anzeigen
async function runTour({ kind: k, name, params }) {
  clear(resultBox).append(spinnerLine("Plane Etappen …"));
  const progress = resultBox.firstChild;
  const days = await planTour(params, api, (d) => (progress.lastChild.textContent = ` Plane Etappen … ${d.length} Tag(e) fertig`));
  const tour = { id: uid(), kind: k, name, params, days: slimDays(days), created: new Date().toISOString() };
  showTour(tour);
  document.getElementById("panel").scrollTop = resultBox.offsetTop - 10;
}

function showTour(tour) {
  renderTour(resultBox, tour, {
    rules: DTICKET_RULES,
    api,
    replan: (params) => runTour({ kind: tour.kind, name: tour.name, params }).catch((e) => clear(resultBox).append(errorLine(e))),
  });
}

export { showTour };
