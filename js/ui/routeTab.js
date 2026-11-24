// Reiter „Verbindung“: Start und Ziel eingeben → Verbindungen nur mit dem Deutschlandticket.
// Auf Wunsch zum Vergleich auch ICE/IC (ausgegraut), damit man sieht, was der Nahverkehr kostet.
import { el, clear, toast, busy, spinnerLine, errorLine, badgeFor, bahnLink } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { renderItinerary, sightsPanel, lazyDetails } from "./details.js";
import { budgetPanel } from "./budgetTab.js";
import { groups, drawItinerary, fitPoints, pinIcon, DAY_COLORS } from "./map.js";
import { nav } from "./nav.js";
import { state, addJournal } from "../state.js";
import { load, save } from "../lib/store.js";
import { searchConnections } from "../api/transitous.js";
import { shoppingCenters } from "../api/overpass.js";
import { planMultiStop } from "../planner/multistop.js";
import { planShopping, hoursOn, weekdayIdx, DEFAULT_HOURS } from "../planner/shopping.js";
import { ohDe } from "../planner/budget.js";
import { connectionModes, summarize, mergeConnections, compareWithFern, highlights, connectionKey } from "../planner/connection.js";
import { DTICKET_RULES } from "../planner/dticket.js";
import { latestDeparture, transitArrival } from "../planner/tour.js";
import { berlinToISO, berlinDate, fmtTime, fmtDuration, fmtDate, todayBerlin } from "../lib/time.js";
import { addItineraryToCollector } from "../collector.js";

const api = { plan: (f, t, iso, o) => searchConnections(f, t, iso, { ...o, modes: o.modes || connectionModes() }).then((r) => r.itineraries) };
let from, to, via, resultBox, recentBox;
let results = [], cursors = {}, lastQuery = null, openKey = null;
const recent = load("routeRecent", []);

const STAYS = [[15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 h"], [90, "1½ h"], [120, "2 h"], [180, "3 h"], [240, "4 h"], [360, "6 h"]];
const apiWith = (opts) => ({ plan: (a, b, iso, o = {}) => searchConnections(a, b, iso, { ...opts, ...o }).then((r) => r.itineraries) });
const nowHHMM = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function initRouteTab(root) {
  from = placeInput({ label: "Von", id: "route-from", value: state.prefs.home });
  to = placeInput({ label: "Nach", id: "route-to" });
  via = placeInput({ label: "Über (optional)", id: "route-via", stopsOnly: true, placeholder: "Bahnhof, über den es gehen soll" });
  const swap = el("button", { class: "btn small", title: "Start und Ziel tauschen", "aria-label": "Start und Ziel tauschen" }, "⇅ tauschen");
  swap.onclick = () => { const a = from.value, b = to.value; from.value = b; to.value = a; };

  const date = el("input", { type: "date", id: "route-date", value: todayBerlin() });
  const time = el("input", { type: "time", id: "route-time", value: nowHHMM() });
  const mode = el("select", {}, el("option", { value: "dep" }, "Abfahrt"), el("option", { value: "arr" }, "Ankunft"));
  const nowBtn = el("button", { class: "btn small", onclick: () => { date.value = todayBerlin(); time.value = nowHHMM(); mode.value = "dep"; } }, "Jetzt");

  const railOnly = el("input", { type: "checkbox" });
  const maxT = el("select", {}, [["8", "beliebig"], ["0", "direkt"], ["1", "max. 1"], ["2", "max. 2"], ["3", "max. 3"]].map(([v, t]) => el("option", { value: v }, t)));
  const slow = el("input", { type: "checkbox" });
  const wheel = el("input", { type: "checkbox" });
  const compare = el("input", { type: "checkbox" });
  const go = el("button", { class: "btn primary block" }, "Verbindungen suchen");
  resultBox = el("div");
  recentBox = el("div");

  // ---------- Modus-Umschalter
  const MODES = {
    simple: { label: "Einfach", lead: "Von A nach B – nur Züge, Busse und Bahnen, die mit dem Deutschlandticket gehen.", go: "Verbindungen suchen", from: "Von", to: "Nach" },
    multi: { label: "Zwischenstopps", lead: "Mehrere Stopps mit Aufenthalt – die App plant Etappe für Etappe.", go: "Reise mit Stopps planen", from: "Start", to: "Endziel" },
    shop: { label: "Einkaufen", lead: "Wann losfahren, um zur Ladenöffnung da zu sein – und wann zurück?", go: "Einkaufstag planen", from: "Zuhause", to: "Einkaufsort" },
  };
  let current = load("routeMode", "simple");
  const modeBtns = Object.entries(MODES).map(([k, m]) => el("button", { class: "chip", "aria-pressed": "false", onclick: () => setMode(k) }, m.label));
  const lead = el("p", { class: "lead" });
  const fromLbl = from.node.querySelector("label"), toLbl = to.node.querySelector("label");

  // ---------- Zwischenstopps
  const stops = load("routeStops", []);
  const stopsList = el("ul", { class: "list" });
  const stayDefault = el("select", { "aria-label": "Aufenthalt für neue Stopps" }, STAYS.map(([v, t]) => el("option", { value: v, selected: v === 60 }, t)));
  const addStop = placeInput({ label: "Zwischenstopp hinzufügen", id: "route-addstop", onSelect: (pl) => { stops.push({ place: pl, stayMin: +stayDefault.value }); addStop.value = null; renderStops(); } });
  const renderStops = () => {
    save("routeStops", stops);
    stopsList.replaceChildren(...stops.map((s, i) => el("li", {},
      el("div", { class: "grow" }, el("strong", {}, `${i + 1}. ${s.place.name}`)),
      el("select", { "aria-label": `Aufenthalt in ${s.place.name}`, onchange: (e) => { s.stayMin = +e.target.value; save("routeStops", stops); } },
        STAYS.map(([v, t]) => el("option", { value: v, selected: v === s.stayMin }, t))),
      el("button", { class: "btn small", title: "nach oben", disabled: i === 0, onclick: () => { [stops[i - 1], stops[i]] = [stops[i], stops[i - 1]]; renderStops(); } }, "↑"),
      el("button", { class: "btn small", title: "entfernen", onclick: () => { stops.splice(i, 1); renderStops(); } }, "✕"))));
    if (!stops.length) stopsList.append(el("li", { class: "muted small" }, "Noch keine Zwischenstopps – unten hinzufügen."));
  };
  const multiBox = el("div", {},
    el("h3", {}, "Zwischenstopps"),
    stopsList,
    addStop.node,
    el("div", { class: "field" }, el("label", {}, "Aufenthalt für neue Stopps"), stayDefault));

  // ---------- Einkaufen
  const shopDur = el("select", {}, [[60, "1 h"], [120, "2 h"], [180, "3 h"], [240, "4 h"], [300, "5 h"], [360, "6 h"], ["", "bis Ladenschluss"]]
    .map(([v, t]) => el("option", { value: v, selected: v === 180 }, t)));
  const openT = el("input", { type: "time", id: "route-open", value: DEFAULT_HOURS.open });
  const closeT = el("input", { type: "time", id: "route-close", value: DEFAULT_HOURS.close });
  const buffer = el("select", {}, [5, 10, 15, 20, 30].map((v) => el("option", { value: v, selected: v === 10 }, `${v} min`)));
  const hoursNote = el("p", { class: "muted small" }, "Standard: Innenstadt Mo–Sa 10–20 Uhr. Für genaue Zeiten ein Einkaufszentrum wählen.");
  let centerHours = null; // opening_hours-Text des gewählten Einkaufszentrums
  const applyHours = () => {
    if (!centerHours) return;
    const h = hoursOn(centerHours.oh, date.value);
    if (h && h !== "closed") { openT.value = h.open; closeT.value = h.close; hoursNote.textContent = `${centerHours.name}: ${ohDe(centerHours.oh)} → am ${fmtDate(date.value)} ${h.open}–${h.close} Uhr`; }
    else if (h === "closed") hoursNote.textContent = `${centerHours.name} hat am ${fmtDate(date.value)} geschlossen (${ohDe(centerHours.oh)}).`;
    else hoursNote.textContent = `${centerHours.name}: Öffnungszeiten „${centerHours.oh}“ nicht eindeutig – bitte selbst eintragen.`;
  };
  date.addEventListener("change", applyHours);
  const centersBox = el("div");
  const findCenters = el("button", { class: "btn small" }, "🛍 Einkaufszentren am Zielort");
  findCenters.onclick = () => {
    if (!to.value) return toast("Bitte zuerst den Einkaufsort wählen.");
    busy(findCenters, async () => {
      const list = await shoppingCenters(to.value);
      clear(centersBox).append(list.length
        ? el("ul", { class: "list" }, list.slice(0, 12).map((c) => el("li", {},
          el("div", { class: "grow" }, el("strong", {}, c.tags.name), el("span", { class: "muted small" }, `${c.tags.shop === "mall" ? "Einkaufszentrum" : "Kaufhaus"} · ${c.dist.toFixed(1)} km${c.tags.opening_hours ? ` · ${ohDe(c.tags.opening_hours)}` : ""}`)),
          el("button", { class: "btn small", onclick: () => {
            centerHours = c.tags.opening_hours ? { oh: c.tags.opening_hours, name: c.tags.name } : null;
            if (centerHours) applyHours(); else hoursNote.textContent = `${c.tags.name}: keine Öffnungszeiten in OSM – Standard 10–20 Uhr.`;
            clear(centersBox).append(el("p", { class: "small" }, `✓ ${c.tags.name}`));
          } }, "Wählen"))))
        : el("p", { class: "muted small" }, "Kein Einkaufszentrum in 3 km eingetragen – Standardzeiten gelten."));
    });
  };
  const shopBox = el("div", {},
    el("h3", {}, "Einkaufen"),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Einkaufszeit"), shopDur), el("div", { class: "field" }, el("label", {}, "Weg Bahnhof ↔ Läden"), buffer)),
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", { for: "route-open" }, "Läden öffnen"), openT), el("div", { class: "field" }, el("label", { for: "route-close" }, "Läden schließen"), closeT)),
    hoursNote, findCenters, centersBox);

  const timeField = el("div", { class: "field" }, el("label", { for: "route-time" }, "Uhrzeit"), time);
  const modeField = el("div", { class: "field" }, el("label", {}, "Zeit gilt für"), mode);
  const nowField = el("div", { class: "field", style: { flex: "0 0 auto" } }, nowBtn);
  const viaWrap = el("div", {}, via.node), compareWrap = el("label", { class: "check small" }, compare, "ICE/IC zum Vergleich zeigen (ausgegraut)");

  function setMode(k) {
    current = k;
    save("routeMode", k);
    const m = MODES[k];
    modeBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(Object.keys(MODES)[i] === k)));
    lead.textContent = m.lead;
    go.textContent = m.go;
    fromLbl.textContent = m.from;
    toLbl.textContent = m.to;
    multiBox.hidden = k !== "multi";
    shopBox.hidden = k !== "shop";
    timeField.hidden = nowField.hidden = k === "shop";
    modeField.hidden = k !== "simple";
    viaWrap.hidden = compareWrap.hidden = k !== "simple";
    clear(resultBox);
    groups.route.clearLayers();
  }

  const baseOpts = () => ({ maxTransfers: +maxT.value, transferTimeFactor: slow.checked ? 1.5 : 1, wheelchair: wheel.checked, modes: connectionModes({ railOnly: railOnly.checked }) });
  const query = () => ({
    from: from.value, to: to.value, via: via.value,
    iso: berlinToISO(date.value, time.value || "00:00"), arriveBy: mode.value === "arr",
    opts: baseOpts(),
    compare: compare.checked,
    compareModes: connectionModes({ railOnly: railOnly.checked, compare: true }),
  });

  go.onclick = () => {
    if (!from.value || !to.value) return toast(`Bitte ${MODES[current].from} und ${MODES[current].to} wählen.`);
    if (current === "simple") return busy(go, () => run(query()));
    if (current === "multi") {
      if (!stops.length) return toast("Bitte mindestens einen Zwischenstopp hinzufügen – sonst reicht „Einfach“.");
      return busy(go, () => runMulti({ from: from.value, to: to.value, stops: stops.map((s) => ({ ...s })), startIso: berlinToISO(date.value, time.value || "08:00"), opts: baseOpts() }));
    }
    const h = hoursOn(centerHours?.oh, date.value);
    if (h === "closed" || (!centerHours && weekdayIdx(date.value) === 6)) {
      return toast(h === "closed" ? "Das Einkaufszentrum hat an diesem Tag geschlossen." : "Sonntags sind die Läden zu (außer verkaufsoffene Sonntage) – anderen Tag wählen.", 5000);
    }
    busy(go, () => runShop({ home: from.value, dest: to.value, date: date.value, open: openT.value, close: closeT.value,
      shopMinutes: shopDur.value === "" ? null : +shopDur.value, bufferMin: +buffer.value, opts: baseOpts() }));
  };

  nav.route = {
    open: ({ from: f, to: t } = {}) => {
      if (f) from.value = f;
      if (t) to.value = t;
      nav.switchTab("route");
      if (current !== "simple") setMode("simple");
      if (from.value && to.value) busy(go, () => run(query()));
    },
  };

  root.append(
    el("h2", {}, "Verbindung"),
    el("div", { class: "chips", role: "group", "aria-label": "Art der Suche" }, modeBtns),
    lead,
    from.node,
    el("div", { style: { display: "flex", justifyContent: "flex-end", margin: "-4px 0 2px" } }, swap),
    to.node,
    multiBox,
    shopBox,
    el("div", { class: "row" },
      el("div", { class: "field" }, el("label", { for: "route-date" }, "Datum"), date),
      timeField, modeField, nowField),
    el("details", {}, el("summary", {}, "Optionen"),
      viaWrap,
      el("div", { class: "field" }, el("label", {}, "Umstiege"), maxT),
      el("label", { class: "check small" }, railOnly, "Nur Bahn (ohne Bus, Tram, U-Bahn)"),
      el("label", { class: "check small" }, slow, "Mehr Zeit zum Umsteigen"),
      el("label", { class: "check small" }, wheel, "Barrierefrei (Rollstuhl)"),
      compareWrap),
    go,
    resultBox,
    recentBox);
  renderStops();
  setMode(MODES[current] ? current : "simple");
  renderRecent();
}

function rememberSearch(q) {
  const key = `${q.from.name}→${q.to.name}`;
  const i = recent.findIndex((r) => `${r.from.name}→${r.to.name}` === key);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift({ from: q.from, to: q.to });
  recent.length = Math.min(recent.length, 6);
  save("routeRecent", recent);
  renderRecent();
}

function renderRecent() {
  if (!recent.length) return clear(recentBox);
  clear(recentBox).append(el("h3", {}, "Letzte Suchen"),
    el("ul", { class: "list" }, recent.map((r) => el("li", {},
      el("div", { class: "grow" }, el("strong", {}, `${r.from.name} → ${r.to.name}`)),
      el("button", { class: "btn small", onclick: () => nav.route.open(r) }, "Suchen"),
      el("button", { class: "btn small", title: "Rückfahrt", onclick: () => nav.route.open({ from: r.to, to: r.from }) }, "⇄")))));
}

async function run(q, page = null) {
  if (!page) {
    lastQuery = q;
    results = [];
    cursors = {};
    openKey = null;
    clear(resultBox).append(spinnerLine("Suche Verbindungen …"));
    groups.route.clearLayers();
  }
  try {
    const base = { ...q.opts, arriveBy: q.arriveBy, via: q.via };
    // D-Ticket-Suche bestimmt Liste und Blättern; der Fernverkehr läuft getrennt nur zum Vergleich,
    // damit ICEs die Nahverkehrsverbindungen nicht aus der Liste verdrängen.
    const [res, fern] = await Promise.all([
      searchConnections(q.from, q.to, q.iso, { ...base, pageCursor: page ? cursors[page] : null }),
      q.compare && !page ? searchConnections(q.from, q.to, q.iso, { ...base, modes: q.compareModes, numItineraries: 3 }).catch(() => null) : null,
    ]);
    results = mergeConnections(results, res.itineraries);
    if (fern) results = mergeConnections(results, fern.itineraries.filter((it) => !DTICKET_RULES.checkItinerary(it).ok));
    if (!page || page === "prev") cursors.prev = res.previousPageCursor;
    if (!page || page === "next") cursors.next = res.nextPageCursor;
    if (!page) rememberSearch(q);
    render();
    if (!page) document.getElementById("panel").scrollTop = resultBox.offsetTop - 10;
  } catch (e) {
    clear(resultBox).append(errorLine(e));
  }
}

function render() {
  const q = lastQuery;
  const visible = q.compare ? results : results.filter((it) => DTICKET_RULES.checkItinerary(it).ok);
  const hl = highlights(results);
  const cmp = q.compare ? compareWithFern(results) : null;
  const pager = (dir, label) => {
    const b = el("button", { class: "btn small", disabled: !cursors[dir] }, label);
    b.onclick = () => busy(b, () => run(q, dir));
    return b;
  };
  const ul = el("ul", { class: "conns" });
  let lastDay = null;
  for (const it of visible) {
    const s = summarize(it);
    const day = berlinDate(s.dep);
    if (day !== lastDay && (lastDay || day !== todayBerlin())) ul.append(el("li", { class: "conn-day" }, fmtDate(day)));
    lastDay = day;
    const key = connectionKey(it);
    const tags = [key === hl.fastest ? "schnellste" : null, key === hl.fewest && key !== hl.fastest ? "wenig Umstiege" : null].filter(Boolean);
    const row = el("li", { class: `conn${s.ok ? "" : " off"}${key === openKey ? " open" : ""}`, tabindex: "0", role: "button", "aria-expanded": String(key === openKey) },
      el("div", { class: "conn-top" },
        el("span", { class: "conn-time" }, `${fmtTime(s.dep)} – ${fmtTime(s.arr)}`),
        el("span", { class: "conn-dur" }, fmtDuration(s.duration)),
        el("span", { class: "conn-tr" }, s.transfers ? `${s.transfers} Umst.` : "direkt")),
      el("div", { class: "conn-lines" }, s.lines.map((l) => badgeFor({ mode: l.mode, displayName: l.name }))),
      el("div", { class: "conn-meta small" },
        !s.ok ? el("span", { class: "note no" }, "nicht mit dem D-Ticket") : el("span", { class: "note ok" }, "✓ D-Ticket"),
        ...tags.map((t) => el("span", { class: "tag" }, t)),
        s.cancelled ? el("span", { class: "note no" }, "Ausfall") : null,
        s.notes.length && s.ok ? el("span", { class: "note warn" }, "Hinweise") : null));
    const toggle = () => { openKey = openKey === key ? null : key; render(); if (openKey) showOnMap(it); };
    row.addEventListener("click", (e) => { if (!e.target.closest("button, a")) toggle(); });
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    if (key === openKey) row.append(details(it, q));
    ul.append(row);
  }
  clear(resultBox).append(
    el("div", { class: "conn-head" }, el("strong", {}, `${q.from.name} → ${q.to.name}`), q.via ? el("span", { class: "muted small" }, ` über ${q.via.name}`) : null),
    cmp ? el("div", { class: "alert info small" }, `Mit Fernverkehr (z. B. ${summarize(cmp.fastest).lines.find((l) => /HIGHSPEED|LONG/.test(l.mode))?.name || "ICE/IC"}) wärst du ca. ${fmtDuration(cmp.savedMin * 60)} schneller – das kostet aber extra.`) : null,
    el("div", { class: "btns" }, pager("prev", "↑ Früher")),
    visible.length ? ul : el("div", { class: "alert warn" }, "Keine Verbindung mit dem D-Ticket gefunden. Andere Uhrzeit, mehr Umstiege oder „Nur Bahn“ ausschalten."),
    el("div", { class: "btns" }, pager("next", "↓ Später")),
    el("p", { class: "muted small" }, "Fahrplandaten: Transitous. Echtzeit, wo verfügbar."));
  if (!openKey && visible.length) showOnMap(visible.find((it) => connectionKey(it) === hl.fastest) || visible[0], false);
}

function details(it, q) {
  const box = el("div", { class: "conn-details" }, renderItinerary(it));
  const s = summarize(it);
  const lastBox = el("div");
  const lastBtn = el("button", { class: "btn small" }, "Letzte Verbindung heute");
  lastBtn.onclick = () => busy(lastBtn, async () => {
    const last = await latestDeparture(q.from, q.to, berlinDate(s.dep), api);
    lastBox.replaceChildren(el("div", { class: "alert warn small" }, last
      ? `⏰ Letzte Verbindung am ${fmtDate(berlinDate(s.dep))}: ${fmtTime(last.startTime)} ab ${q.from.name}, an ${fmtTime(transitArrival(last))}.`
      : "Keine spätere Verbindung am selben Tag gefunden."));
  });
  const doneBtn = el("button", { class: "btn small" }, "✓ Bin ich gefahren");
  doneBtn.onclick = () => busy(doneBtn, async () => {
    const n = await addItineraryToCollector(it);
    addJournal({ date: berlinDate(s.dep), title: `${q.from.name} → ${q.to.name}` });
    toast(`${n} Abschnitte im Sammler, Tagebuch-Eintrag angelegt`);
  });
  box.append(
    el("div", { class: "btns" },
      el("button", { class: "btn small", onclick: () => nav.route.open({ from: q.to, to: q.from }) }, "⇄ Rückfahrt"),
      lastBtn,
      el("a", { class: "btn small", href: bahnLink(q.from, q.to, it.startTime), target: "_blank", rel: "noopener", title: "Im DB Navigator „Nur Nahverkehr“ wählen" }, "Bei DB gegenprüfen"),
      doneBtn,
      el("button", { class: "btn small", onclick: () => nav.board.open(q.from) }, "Abfahrten")),
    lastBox);
  return box;
}

function showOnMap(it, fit = true) {
  groups.route.clearLayers();
  const pts = drawItinerary(it, groups.route);
  const a = it.legs[0].from, b = it.legs[it.legs.length - 1].to;
  L.marker([a.lat, a.lon], { icon: pinIcon("A") }).addTo(groups.route);
  L.marker([b.lat, b.lon], { icon: pinIcon("B", "#b3261e") }).addTo(groups.route);
  if (fit || pts.length) fitPoints(pts, 13);
}

// ---------------------------------------------------------------- Zwischenstopps
function segmentSummary(it) {
  const s = summarize(it);
  return el("div", {},
    el("div", { class: "conn-top" },
      el("span", { class: "conn-time" }, `${fmtTime(s.dep)} – ${fmtTime(s.arr)}`),
      el("span", { class: "conn-dur" }, fmtDuration(s.duration)),
      el("span", { class: "conn-tr" }, s.transfers ? `${s.transfers} Umst.` : "direkt")),
    el("div", { class: "conn-lines" }, s.lines.map((l) => badgeFor({ mode: l.mode, displayName: l.name })),
      s.walkMin >= 5 ? el("span", { class: "muted small" }, `+ ${s.walkMin} min Fußweg`) : null));
}

async function runMulti(q) {
  clear(resultBox).append(spinnerLine("Plane Etappe für Etappe …"));
  groups.route.clearLayers();
  const r = await planMultiStop(q, apiWith(q.opts));
  const pts = [];
  const body = [];
  r.segments.forEach((seg, i) => {
    const color = DAY_COLORS[i % DAY_COLORS.length];
    const card = el("div", { class: "card day", style: { borderLeftColor: color } },
      el("h4", {}, `Etappe ${i + 1}: ${seg.from.name} → ${seg.to.name}`));
    if (!seg.itinerary) {
      card.append(el("div", { class: "alert no" }, `${seg.error}. Ab hier lässt sich nicht weiterplanen – Aufenthalt kürzen, anderen Stopp oder andere Uhrzeit wählen.`));
      body.push(card);
      return;
    }
    pts.push(...drawItinerary(seg.itinerary, groups.route, { color }));
    card.append(segmentSummary(seg.itinerary),
      lazyDetails("Alle Abschnitte", () => renderItinerary(seg.itinerary)),
      el("div", { class: "btns" }, el("a", { class: "btn small", href: bahnLink(seg.from, seg.to, seg.itinerary.startTime), target: "_blank", rel: "noopener" }, "Bei DB gegenprüfen")));
    body.push(card);
    if (seg.leaveAt) {
      const p = seg.to;
      L.marker([p.lat, p.lon], { icon: pinIcon(i + 1, color) }).addTo(groups.route).bindPopup(`Stopp ${i + 1}: ${p.name.replace(/[<>&]/g, "")}`);
      body.push(el("div", { class: "stay" },
        el("strong", {}, `⏸ Aufenthalt in ${p.name}`),
        el("div", {}, `${fmtTime(seg.arrive)} – ${fmtTime(seg.leaveAt)} (${fmtDuration(seg.stayMin * 60)})`),
        lazyDetails("Was tun? Sehenswertes in der Nähe", () => sightsPanel(p)),
        lazyDetails("Günstig essen, WLAN, Toiletten", () => budgetPanel(p))));
    }
  });
  const first = r.segments[0]?.itinerary;
  if (first) L.marker([q.from.lat, q.from.lon], { icon: pinIcon("A") }).addTo(groups.route);
  if (r.ok) L.marker([q.to.lat, q.to.lon], { icon: pinIcon("B", "#b3261e") }).addTo(groups.route);
  const total = r.ok && first ? fmtDuration((Date.parse(r.arrival) - Date.parse(first.startTime)) / 1000) : null;
  clear(resultBox).append(
    el("div", { class: "card", style: { background: "var(--soft)" } },
      el("strong", {}, `${q.from.name} → ${q.stops.map((s) => s.place.name).join(" → ")} → ${q.to.name}`),
      el("div", { class: "chips" },
        first ? el("span", { class: "chip static" }, `ab ${fmtTime(first.startTime)}`) : null,
        r.ok ? el("span", { class: "chip static" }, `an ${fmtTime(r.arrival)}`) : el("span", { class: "chip static" }, "unvollständig"),
        total ? el("span", { class: "chip static" }, `${total} insgesamt`) : null,
        el("span", { class: "chip static" }, `${fmtDuration(r.totalStayMin * 60)} Aufenthalt`))),
    ...body);
  if (pts.length) fitPoints(pts, 12);
  document.getElementById("panel").scrollTop = resultBox.offsetTop - 10;
}

// ---------------------------------------------------------------- Einkaufen
async function runShop(q) {
  clear(resultBox).append(spinnerLine("Suche die beste Hin- und Rückfahrt …"));
  groups.route.clearLayers();
  const r = await planShopping(q, apiWith(q.opts));
  if (!r.ok) {
    clear(resultBox).append(el("div", { class: "alert no" }, r.notes.join(" ")));
    return;
  }
  const pts = [...drawItinerary(r.outbound, groups.route, { color: DAY_COLORS[0] }), ...drawItinerary(r.inbound, groups.route, { color: DAY_COLORS[1] })];
  L.marker([q.home.lat, q.home.lon], { icon: pinIcon("⌂") }).addTo(groups.route);
  L.marker([q.dest.lat, q.dest.lon], { icon: pinIcon("🛍", "#8e24aa") }).addTo(groups.route);
  const step = (icon, time, text, cls = "") => el("li", { class: cls }, el("span", { class: "tl-time" }, time), el("span", { class: "tl-ico", "aria-hidden": "true" }, icon), el("span", {}, text));
  const late = r.latestReturn && r.inbound.startTime !== r.latestReturn.startTime;
  // Zugzeiten (erstes/letztes Fahrzeug) statt Beginn des Fußwegs – passend zu den Karten darunter
  const out = summarize(r.outbound), back = summarize(r.inbound), last = r.latestReturn ? summarize(r.latestReturn) : null;
  clear(resultBox).append(
    el("div", { class: "card", style: { background: "var(--soft)" } },
      el("strong", {}, `Einkaufstag in ${q.dest.name} · ${fmtDate(q.date)}`),
      el("ul", { class: "timeline" },
        step("🏠", fmtTime(out.dep), `Abfahrt ab ${q.home.name} – optimal, nicht früher nötig`, "hl"),
        step("🚉", fmtTime(out.arr), `Ankunft in ${q.dest.name}`),
        step("🛍", `${fmtTime(r.shopStart)}–${fmtTime(r.shopEnd)}`, `Einkaufen (${fmtDuration(r.shopMin * 60)}) · Läden offen ${fmtTime(r.openIso)}–${fmtTime(r.closeIso)}`, "hl"),
        step("🚉", fmtTime(back.dep), `Rückfahrt ab ${q.dest.name}`, "hl"),
        step("🏠", fmtTime(back.arr), `Wieder zu Hause`)),
      late ? el("p", { class: "small" }, `⏰ Allerspäteste Rückfahrt: ${fmtTime(last.dep)} (an ${fmtTime(last.arr)}) – falls es länger dauert.`) : null,
      ...r.notes.map((n) => el("div", { class: "alert info small" }, n))),
    el("div", { class: "card" }, el("h4", {}, "Hinfahrt"), segmentSummary(r.outbound), lazyDetails("Alle Abschnitte", () => renderItinerary(r.outbound))),
    el("div", { class: "card" }, el("h4", {}, "Rückfahrt"), segmentSummary(r.inbound), lazyDetails("Alle Abschnitte", () => renderItinerary(r.inbound))),
    lazyDetails("Günstig essen, WLAN, Toiletten am Einkaufsort", () => budgetPanel(q.dest)));
  fitPoints(pts, 12);
  document.getElementById("panel").scrollTop = resultBox.offsetTop - 10;
}
