// Reiter „Abfahrten“: Bahnhof eingeben → alle Fahrten, die mit dem D-Ticket gehen
// (Regionalzug, S-Bahn, U-Bahn, Tram, Bus, Fähre), inkl. Haltestellen direkt am Bahnhof.
import { el, clear, toast, spinnerLine, errorLine, direktLink } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { stationPanel, hikingPanel, libraryPanel } from "./details.js";
import { budgetPanel } from "./budgetTab.js";
import { map, groups, fitPoints, pinIcon, focusOn, trackLabel } from "./map.js";
import { nav } from "./nav.js";
import { addFavorite } from "../state.js";
import { stopTimes, trip as fetchTrip, reverseStop } from "../api/transitous.js";
import { prepareDepartures, MODE_GROUPS } from "../planner/departures.js";
import { berlinToISO, fmtTime, todayBerlin, berlinDate } from "../lib/time.js";
import { legPoints } from "../lib/polyline.js";
import { isRide } from "../lib/legs.js";
import { lineName } from "../planner/dticket.js";
import { badgeFor } from "./dom.js";

const FILTER_GROUPS = ["zug", "sbahn", "ubahn", "tram", "bus", "faehre"];

let station = null;
let listBox, infoBox, detailBox;
let active = new Set(FILTER_GROUPS);
let showFern = false;
let arrivals = false;
let items = [];
let nextCursor = null;
let whenDate, whenTime;

export function initBoardTab(root) {
  const input = placeInput({ label: "Bahnhof / Haltestelle", id: "board-stop", stopsOnly: true, onSelect: (p) => open(p) });
  whenDate = el("input", { type: "date", value: todayBerlin() });
  whenTime = el("input", { type: "time", value: "" });
  const nowBtn = el("button", { class: "btn small", onclick: () => { whenDate.value = todayBerlin(); whenTime.value = ""; reload(); } }, "Jetzt");
  const chips = FILTER_GROUPS.map((g) =>
    el("button", { class: "chip", "aria-pressed": "true", style: { borderLeft: `4px solid var(--m-${g})` }, onclick: (e) => {
      if (active.has(g)) active.delete(g); else active.add(g);
      e.currentTarget.setAttribute("aria-pressed", String(active.has(g)));
      render();
    } }, MODE_GROUPS[g].label));
  const fern = el("input", { type: "checkbox", onchange: (e) => { showFern = e.target.checked; render(); } });
  const arr = el("select", { onchange: (e) => { arrivals = e.target.value === "arr"; reload(); } }, el("option", { value: "dep" }, "Abfahrten"), el("option", { value: "arr" }, "Ankünfte"));
  infoBox = el("div");
  listBox = el("div");
  detailBox = el("div");
  whenDate.onchange = whenTime.onchange = () => reload();

  root.append(
    el("h2", {}, "Abfahrtstafel"),
    el("p", { class: "lead" }, "Was fährt hier mit dem Deutschlandticket? Inklusive Bus, Tram und U-Bahn am Bahnhofsvorplatz."),
    input.node,
    el("div", { class: "row" }, el("div", { class: "field" }, el("label", {}, "Datum"), whenDate), el("div", { class: "field" }, el("label", {}, "Uhrzeit"), whenTime), el("div", { class: "field" }, el("label", {}, "Zeigen"), arr), el("div", { class: "field", style: { flex: "0 0 auto" } }, nowBtn)),
    el("div", { class: "chips", role: "group", "aria-label": "Verkehrsmittel filtern" }, chips),
    el("label", { class: "check small" }, fern, "Fernverkehr ausgegraut mit anzeigen"),
    infoBox, detailBox, listBox);

  nav.board.open = (p) => { input.value = p; nav.switchTab("board"); open(p); };

  // Klick auf die Karte, während der Reiter offen ist: nächste Haltestelle
  map.on("contextmenu", async (e) => {
    if (root.hidden) return;
    const s = await reverseStop(e.latlng.lat, e.latlng.lng).catch(() => null);
    if (s) { input.value = s; open(s); }
  });
}

async function open(p) {
  station = p;
  clear(detailBox);
  groups.trip.clearLayers();
  L.marker([p.lat, p.lon], { icon: pinIcon("🚉") }).addTo(groups.trip);
  focusOn(p.lat, p.lon, Math.max(map.getZoom(), 14));
  const dl = direktLink(p);
  infoBox.replaceChildren(el("div", { class: "btns" },
    el("button", { class: "btn small", onclick: () => toast(addFavorite(p, "Bahnhof") ? "Gemerkt" : "Schon gemerkt") }, "☆ Merken"),
    el("button", { class: "btn small", onclick: () => { nav.plan.setStart(p); nav.switchTab("plan"); toast(`Start: ${p.name}`); } }, "Als Start"),
    el("button", { class: "btn small", onclick: () => nav.route.open({ from: p }) }, "🔀 Verbindung von hier"),
    el("button", { class: "btn small", onclick: () => { clear(detailBox).append(el("div", { class: "card" }, el("h4", {}, `Infos am Bahnhof ${p.name}`), stationPanel(p))); } }, "Bahnhofs-Infos"),
    el("button", { class: "btn small", onclick: () => { clear(detailBox).append(el("div", { class: "card" }, el("h4", {}, `Wanderwege um ${p.name}`), hikingPanel(p))); } }, "🥾 Wanderwege"),
    el("button", { class: "btn small", onclick: () => { clear(detailBox).append(el("div", { class: "card" }, el("h4", {}, `Bibliotheken um ${p.name}`), libraryPanel(p))); } }, "📚 Bibliotheken"),
    el("button", { class: "btn small", onclick: () => nav.budget.open(p) }, "🥖🔌🌳 Homeless-Modus"),
    dl ? el("a", { class: "btn small", href: dl, target: "_blank", rel: "noopener" }, "Wohin direkt?") : null));
  await reload();
}

async function reload() {
  if (!station) return;
  items = [];
  nextCursor = null;
  clear(listBox).append(spinnerLine("Lade Fahrplan …"));
  await loadMore();
}

async function loadMore() {
  try {
    const iso = whenTime.value ? berlinToISO(whenDate.value, whenTime.value)
      : whenDate.value === todayBerlin() ? new Date().toISOString() : berlinToISO(whenDate.value, "00:00");
    const id = station.stopId || `${station.lat},${station.lon}`;
    const res = await stopTimes(id, iso, { n: 60, radius: 250, arriveBy: arrivals, pageCursor: nextCursor || undefined });
    nextCursor = res.nextPageCursor || null;
    const fresh = prepareDepartures(res.stopTimes, { showLongDistance: true });
    const seen = new Set(items.map((x) => `${x.tripId}|${x.time}`));
    items.push(...fresh.filter((x) => !seen.has(`${x.tripId}|${x.time}`)));
    fetchedAt = Date.now();
    render();
  } catch (e) {
    clear(listBox).append(errorLine(e));
  }
}

let fetchedAt = 0;
let liveTimer = null;

/** Live-Status: Form + Text (nicht nur Farbe), Zeitangabe läuft mit, pulst einmal bei neuen Daten. */
function liveStatus() {
  const offline = navigator.onLine === false;
  const rt = items.some((x) => x.realTime);
  const kind = offline ? "off" : rt ? "rt" : "plan";
  const text = () => {
    const sec = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
    const ago = sec < 60 ? `vor ${sec} s` : `vor ${Math.round(sec / 60)} min`;
    if (kind === "off") return `Offline – gespeicherte Daten von ${ago}`;
    return kind === "rt" ? `Echtzeit · aktualisiert ${ago}` : `Nur Fahrplan, keine Echtzeitdaten · geladen ${ago}`;
  };
  const label = el("span", {}, text());
  const box = el("div", { class: `live ${kind} pulse`, role: "status" }, el("span", { class: "live-dot", "aria-hidden": "true" }), label);
  clearInterval(liveTimer);
  liveTimer = setInterval(() => {
    if (!box.isConnected) return clearInterval(liveTimer);
    if (!document.hidden) label.textContent = text(); // nur Text, keine Animation
  }, 15000);
  return box;
}

function render() {
  if (!station) return;
  const list = items.filter((x) => (x.dticket.ok ? active.has(x.group) : showFern));
  // Abfahrtstafel als echte Tabelle: Zeit | Verspätung | Linie | Ziel | Gleis
  const tbody = el("tbody");
  const table = el("table", { class: "board" },
    el("caption", { class: "sr-only" }, `${arrivals ? "Ankünfte" : "Abfahrten"} ${station.name}`),
    el("thead", {}, el("tr", {},
      el("th", { class: "c-time", scope: "col" }, "Zeit"),
      el("th", { class: "c-delay", scope: "col" }, "+/−"),
      el("th", { class: "c-line", scope: "col" }, "Linie"),
      el("th", { scope: "col" }, arrivals ? "Von" : "Nach"),
      el("th", { class: "c-track", scope: "col" }, "Gleis"))),
    tbody);
  let lastDay = null;
  for (const x of list) {
    const day = berlinDate(x.time);
    if (lastDay && day !== lastDay) tbody.append(el("tr", { class: "day" }, el("td", { colspan: "5" }, day.split("-").reverse().join("."))));
    lastDay = day;
    const other = arrivals ? x.tripFrom?.name : x.headsign || x.tripTo?.name;
    const cancelled = x.cancelled || x.tripCancelled;
    const delay = cancelled ? el("span", { class: "delay x" }, "fällt aus")
      : x.delayMin == null ? null
      : el("span", { class: `delay ${x.delayMin <= 0 ? "ontime" : ""}` }, x.delayMin > 0 ? `+${x.delayMin}` : "±0");
    const row = el("tr", { class: `dep${x.dticket.ok ? "" : " off"}`, tabindex: "0", title: x.dticket.note || "" },
      el("td", { class: "t" }, fmtTime(x.time)),
      el("td", {}, delay),
      el("td", {}, badgeFor(x)),
      el("td", { class: "dest" }, other || "–",
        x.stopName && station && x.stopName !== station.name ? el("span", { class: "muted small", style: { display: "block" } }, x.stopName) : null,
        x.dticket.note ? el("span", { class: `note ${x.dticket.level}`, style: { display: "block" } }, x.dticket.note) : null),
      el("td", { class: "track" }, trackLabel(x.track).replace(/^Gl\. /, "")));
    row.addEventListener("click", () => showTrip(x));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTrip(x); } });
    tbody.append(row);
  }
  const counts = FILTER_GROUPS.map((g) => [g, items.filter((x) => x.dticket.ok && x.group === g).length]).filter(([, n]) => n);
  clear(listBox).append(
    liveStatus(),
    el("p", { class: "muted small" }, items.length ? `Verkehrsmittel hier: ${counts.map(([g, n]) => `${MODE_GROUPS[g].label} (${n})`).join(", ") || "–"}` : ""),
    list.length ? table : el("p", { class: "muted" }, "Keine passenden Fahrten. Filter prüfen oder später laden."),
    ...(nextCursor ? [el("button", { class: "btn block", onclick: (e) => { e.currentTarget.disabled = true; loadMore(); } }, "Spätere laden")] : []),
    el("p", { class: "muted small" }, "Fahrplandaten: Transitous. Tipp: Rechtsklick/langes Drücken auf die Karte wählt die nächste Haltestelle."));
}

async function showTrip(x) {
  clear(detailBox).append(spinnerLine("Lade Fahrtverlauf …"));
  try {
    const t = await fetchTrip(x.tripId);
    const leg = t.legs.find(isRide) || t.legs[0];
    const stops = [leg.from, ...(leg.intermediateStops || []), leg.to];
    const hereIdx = stops.findIndex((s) => s.name === x.stopName || s.stopId === x.place?.stopId);
    groups.trip.clearLayers();
    const pts = legPoints(leg);
    L.polyline(pts, { color: "#0f5132", weight: 5 }).addTo(groups.trip);
    stops.forEach((s, i) => L.circleMarker([s.lat, s.lon], { radius: i === hereIdx ? 7 : 4, color: "#0f5132", fillColor: "#fff", fillOpacity: 1, weight: 2 }).bindTooltip(s.name).addTo(groups.trip));
    fitPoints(pts, 13);
    const ul = el("ul", { class: "stops" }, stops.map((s, i) =>
      el("li", { class: i === hereIdx ? "here" : i < hereIdx ? "past" : null },
        el("span", { class: "t" }, fmtTime(s.departure || s.arrival)),
        el("span", {}, s.name, s.track ? el("span", { class: "muted small" }, ` · ${trackLabel(s.track)}`) : ""),
        el("button", { class: "btn small", style: { marginLeft: "auto" }, onclick: () => nav.board.open({ name: s.name, lat: s.lat, lon: s.lon, stopId: s.stopId }) }, "Abfahrten"))));
    clear(detailBox).append(el("div", { class: "card" },
      el("div", { class: "row", style: { alignItems: "center" } }, el("h4", { style: { margin: 0 } }, badgeFor(x), " ", x.headsign || leg.to.name), el("button", { class: "btn small", style: { flex: "0 0 auto" }, onclick: () => { clear(detailBox); groups.trip.clearLayers(); } }, "Schließen")),
      el("p", { class: "muted small" }, [x.agencyName, x.dticket.note].filter(Boolean).join(" · ")),
      ul));
    document.getElementById("panel").scrollTop = 0;
  } catch (e) {
    clear(detailBox).append(errorLine(e));
  }
}
