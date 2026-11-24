// ÖPNVKarte: Klick auf die Karte zeigt die nächste Haltestelle mit ihren Linien und den nächsten Abfahrten.
import { el, badgeFor, errorLine, spinnerLine, toast } from "./dom.js";
import { map, currentBase, popupContent } from "./map.js";
import { nav } from "./nav.js";
import { reverseStop, stopTimes } from "../api/transitous.js";
import { prepareDepartures, MODE_GROUPS } from "../planner/departures.js";
import { linesFromDepartures } from "../planner/city.js";
import { distanceKm } from "../lib/geo.js";
import { fmtTime } from "../lib/time.js";

const ORDER = ["zug", "sbahn", "ubahn", "tram", "bus", "faehre", "fern"];

/** Linien einer Haltestelle als Badges, je Verkehrsmittel eine Zeile, mit Hauptzielen im Tooltip. */
export function linesBlock(deps) {
  const lines = linesFromDepartures(deps);
  const rows = ORDER.map((g) => [g, lines.filter((l) => l.group === g)]).filter(([, ls]) => ls.length);
  return el("div", { class: "lines" }, rows.map(([g, ls]) =>
    el("div", { class: "lines-row" }, el("span", { class: "muted small", style: { minWidth: "86px", display: "inline-block" } }, MODE_GROUPS[g].label),
      ls.map((l) => { const b = badgeFor(l.dep); b.title = l.dests.length ? `Richtung ${l.dests.join(", ")}` : ""; return b; }))));
}

/** @param isActive () => boolean – nur reagieren, wenn kein Reiter den Klick selbst braucht */
export function initTransitClick({ isActive }) {
  let clickId = 0;
  map.on("click", async (e) => {
    if (currentBase !== "ÖPNVKarte" || e.propagatedFrom || !isActive()) return;
    const id = ++clickId;
    const box = el("div", { style: { minWidth: "220px" } }, spinnerLine("Suche Haltestelle …"));
    const pop = L.popup({ maxWidth: 320 }).setLatLng(e.latlng).setContent(popupContent(box)).openOn(map);
    try {
      const s = await reverseStop(e.latlng.lat, e.latlng.lng);
      if (id !== clickId) return;
      if (!s) { box.replaceChildren(el("p", { class: "muted" }, "Keine Haltestelle in der Nähe.")); return; }
      const m = Math.round(distanceKm({ lat: e.latlng.lat, lon: e.latlng.lng }, s) * 1000);
      pop.setLatLng([s.lat, s.lon]);
      box.replaceChildren(el("strong", {}, `🚏 ${s.name}`), el("div", { class: "muted small" }, `${m} m vom Klickpunkt`), spinnerLine("Lade Linien …"));
      const res = await stopTimes(s.stopId || `${s.lat},${s.lon}`, new Date().toISOString(), { n: 60, radius: 150 });
      if (id !== clickId) return;
      const deps = prepareDepartures(res.stopTimes, { showLongDistance: true });
      const next = deps.filter((d) => d.dticket.ok).slice(0, 5);
      box.replaceChildren(...[ // filter: replaceChildren schreibt null sonst als Text
        el("strong", {}, `🚏 ${s.name}`), el("div", { class: "muted small" }, `${m} m vom Klickpunkt`),
        deps.length ? linesBlock(deps) : el("p", { class: "muted small" }, "In den nächsten Stunden keine Abfahrten."),
        next.length ? el("div", { class: "small", style: { marginTop: "6px" } }, el("div", { class: "muted" }, "Nächste Abfahrten (D-Ticket):"),
          next.map((d) => el("div", {}, `${fmtTime(d.time)} `, badgeFor(d), ` ${d.headsign || d.tripTo?.name || ""}`, d.delayMin > 0 ? el("span", { class: "delay" }, ` +${d.delayMin}`) : null))) : null,
        el("div", { class: "btns", style: { marginTop: "6px" } },
          el("button", { class: "btn small", onclick: () => { map.closePopup(); nav.board.open(s); } }, "Abfahrtstafel"),
          el("button", { class: "btn small", onclick: () => { nav.plan.setStart(s); toast(`Start: ${s.name}`); } }, "Als Start")),
      ].filter(Boolean));
      pop.update();
    } catch (err) {
      if (id === clickId) box.replaceChildren(errorLine(err));
    }
  });
}
