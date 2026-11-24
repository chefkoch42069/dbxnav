// Reiter „Verbindung“: Start und Ziel eingeben → Verbindungen nur mit dem Deutschlandticket.
// Auf Wunsch zum Vergleich auch ICE/IC (ausgegraut), damit man sieht, was der Nahverkehr kostet.
import { el, clear, toast, busy, spinnerLine, errorLine, badgeFor, bahnLink } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { renderItinerary } from "./details.js";
import { groups, drawItinerary, fitPoints, pinIcon } from "./map.js";
import { nav } from "./nav.js";
import { state, addJournal } from "../state.js";
import { load, save } from "../lib/store.js";
import { searchConnections } from "../api/transitous.js";
import { connectionModes, summarize, mergeConnections, compareWithFern, highlights, connectionKey } from "../planner/connection.js";
import { DTICKET_RULES } from "../planner/dticket.js";
import { latestDeparture, transitArrival } from "../planner/tour.js";
import { berlinToISO, berlinDate, fmtTime, fmtDuration, fmtDate, todayBerlin } from "../lib/time.js";
import { addItineraryToCollector } from "../collector.js";

const api = { plan: (f, t, iso, o) => searchConnections(f, t, iso, { ...o, modes: o.modes || connectionModes() }).then((r) => r.itineraries) };
let from, to, via, resultBox, recentBox;
let results = [], cursors = {}, lastQuery = null, openKey = null;
const recent = load("routeRecent", []);

const nowHHMM = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function initRouteTab(root) {
  from = placeInput({ label: "Von", id: "route-from", value: state.prefs.home });
  to = placeInput({ label: "Nach", id: "route-to" });
  via = placeInput({ label: "Über (optional)", id: "route-via", stopsOnly: true, placeholder: "Bahnhof, über den es gehen soll" });
  const swap = el("button", { class: "btn small", title: "Start und Ziel tauschen", "aria-label": "Start und Ziel tauschen" }, "⇅ tauschen");
  swap.onclick = () => { const a = from.value, b = to.value; from.value = b; to.value = a; };

  const date = el("input", { type: "date", value: todayBerlin() });
  const time = el("input", { type: "time", value: nowHHMM() });
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

  const query = () => ({
    from: from.value, to: to.value, via: via.value,
    iso: berlinToISO(date.value, time.value || "00:00"), arriveBy: mode.value === "arr",
    opts: {
      maxTransfers: +maxT.value, transferTimeFactor: slow.checked ? 1.5 : 1, wheelchair: wheel.checked,
      modes: connectionModes({ railOnly: railOnly.checked }),
    },
    compare: compare.checked,
    compareModes: connectionModes({ railOnly: railOnly.checked, compare: true }),
  });

  go.onclick = () => {
    if (!from.value || !to.value) return toast("Bitte Start und Ziel wählen.");
    busy(go, () => run(query()));
  };

  nav.route = {
    open: ({ from: f, to: t } = {}) => {
      if (f) from.value = f;
      if (t) to.value = t;
      nav.switchTab("route");
      if (from.value && to.value) busy(go, () => run(query()));
    },
  };

  root.append(
    el("h2", {}, "Verbindung"),
    el("p", { class: "lead" }, "Von A nach B – nur Züge, Busse und Bahnen, die mit dem Deutschlandticket gehen."),
    from.node,
    el("div", { style: { display: "flex", justifyContent: "flex-end", margin: "-4px 0 2px" } }, swap),
    to.node,
    el("div", { class: "row" },
      el("div", { class: "field" }, el("label", {}, "Datum"), date),
      el("div", { class: "field" }, el("label", {}, "Uhrzeit"), time),
      el("div", { class: "field" }, el("label", {}, "Zeit gilt für"), mode),
      el("div", { class: "field", style: { flex: "0 0 auto" } }, nowBtn)),
    el("details", {}, el("summary", {}, "Optionen"),
      via.node,
      el("div", { class: "field" }, el("label", {}, "Umstiege"), maxT),
      el("label", { class: "check small" }, railOnly, "Nur Bahn (ohne Bus, Tram, U-Bahn)"),
      el("label", { class: "check small" }, slow, "Mehr Zeit zum Umsteigen"),
      el("label", { class: "check small" }, wheel, "Barrierefrei (Rollstuhl)"),
      el("label", { class: "check small" }, compare, "ICE/IC zum Vergleich zeigen (ausgegraut)")),
    go,
    resultBox,
    recentBox);
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
