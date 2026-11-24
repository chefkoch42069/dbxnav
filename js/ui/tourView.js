// Anzeige einer geplanten Tour (Tageskarten, Karte, Übernachtungen) – für D-Ticket und Interrail.
import { el, clear, busy, toast, bahnLink } from "./dom.js";
import { renderItinerary, weatherChip, lodgingPanel, stationPanel, sightsPanel, hikingPanel, libraryPanel, lazyDetails } from "./details.js";
import { groups, drawItinerary, fitPoints, pinIcon, DAY_COLORS } from "./map.js";
import { nav } from "./nav.js";
import { state, saveTour, addJournal } from "../state.js";
import { latestDeparture, transitArrival } from "../planner/tour.js";
import { DTICKET_RULES } from "../planner/dticket.js";
import { fmtTime, fmtDate, fmtDuration } from "../lib/time.js";
import { addItineraryToCollector } from "../collector.js";
import { budgetPanel } from "./budgetTab.js";
import { prefetchTour } from "../offline.js";

/** Große Felder entfernen, bevor eine Tour gespeichert wird. */
export function slimDays(days) {
  return days.map((d) => d.itinerary ? { ...d, itinerary: { ...d.itinerary, legs: d.itinerary.legs.map(({ steps, alternatives, tripFrom, tripTo, ...l }) => l) } } : d);
}

export function renderTour(resultBox, tour, { rules = DTICKET_RULES, api, replan, summary = null, dayNotes = null } = {}) {
  clear(resultBox);
  groups.route.clearLayers();
  groups.daytrip.clearLayers();
  groups.trip.clearLayers();
  groups.places.clearLayers();
  const { params, days } = tour;
  const pts = [];
  const totalTravel = days.reduce((s, d) => s + (d.itinerary?.duration || 0), 0);
  const nights = days.filter((d) => d.overnight).reduce((s, d) => s + (d.nights || 1), 0);
  const lastDate = days.length ? days[days.length - 1].date : params.startDate;

  const saveBtn = el("button", { class: "btn small" }, state.tours.some((t) => t.id === tour.id) ? "✓ Gespeichert" : "Speichern");
  saveBtn.onclick = () => { saveTour(tour); saveBtn.textContent = "✓ Gespeichert"; toast("Tour in der Merkliste gespeichert"); };
  const doneBtn = el("button", { class: "btn small" }, "✓ Bin ich gefahren");
  doneBtn.onclick = () => busy(doneBtn, async () => {
    let n = 0;
    for (const d of days) if (d.itinerary) n += await addItineraryToCollector(d.itinerary);
    addJournal({ date: params.startDate, title: tour.name, text: days.map((d) => `${fmtDate(d.date)}: ${d.from.name} → ${d.to.name}`).join("\n"), tourId: tour.id });
    toast(`${n} Abschnitte im Sammler, Tagebuch-Eintrag angelegt`);
  });
  const offBtn = el("button", { class: "btn small" }, "Offline-Paket");
  offBtn.onclick = () => busy(offBtn, async () => { saveTour(tour); saveBtn.textContent = "✓ Gespeichert"; await prefetchTour(tour, (msg) => (offBtn.lastChild.textContent = ` ${msg}`)); });

  resultBox.append(
    el("h3", {}, tour.name),
    el("div", { class: "chips" },
      el("span", { class: "chip static" }, `${fmtDate(params.startDate)} – ${fmtDate(lastDate)}`),
      el("span", { class: "chip static" }, `${nights} Nächte`),
      el("span", { class: "chip static" }, `${fmtDuration(totalTravel)} Fahrzeit`),
      el("span", { class: "chip static" }, `max. ${params.maxHours} h/Tag`)),
    summary ? summary(tour) : null,
    el("div", { class: "btns" }, saveBtn, doneBtn, offBtn));

  const latestQueue = [];
  days.forEach((d, i) => {
    const color = DAY_COLORS[i % DAY_COLORS.length];
    const card = el("div", { class: "card day", style: { borderLeftColor: color } });
    card.append(el("h4", {}, `Tag ${i + 1} · ${fmtDate(d.date)}`), el("div", {}, el("strong", {}, d.from.name), " → ", el("strong", {}, d.to.name)));
    if (d.error) card.append(el("div", { class: "alert no" }, d.error, ". Tipp: andere Abfahrtszeit oder Zwischenziel probieren."));
    if (!d.reachedTarget && d.finalTarget) card.append(el("div", { class: "muted small" }, `Etappe auf dem Weg nach ${d.finalTarget.name} (Tageslimit ${params.maxHours} h)`));
    if (d.slightlyOver) card.append(el("div", { class: "muted small" }, "Etwas länger als dein Tageslimit – dafür kein Übernachtungsstopp kurz vor dem Ziel."));
    if (d.overLimit) card.append(el("div", { class: "alert warn" }, "Diese Etappe ist länger als dein Tageslimit – es gibt unterwegs keinen sinnvollen Halt."));
    if (d.nightTrain) card.append(el("div", { class: "alert info" }, "🌙 Nachtzug: Übernachtung im Zug – Reservierung (Sitz/Liege/Schlafwagen) nötig."));
    if (dayNotes) card.append(...[dayNotes(d, i, tour)].flat().filter(Boolean));
    if (d.itinerary) {
      card.append(renderItinerary(d.itinerary, rules));
      pts.push(...drawItinerary(d.itinerary, groups.route, { color }));
      const warn = el("div", { class: "alert warn" }, el("span", { class: "spinner" }), " Prüfe letzte Verbindung …");
      card.append(warn);
      latestQueue.push(async () => {
        try {
          const last = await latestDeparture(d.from, d.to, d.date, api, "23:59", rules);
          warn.replaceChildren(last
            ? `⏰ Letzte Verbindung: spätestens ${fmtTime(last.startTime)} ab ${d.from.name} losfahren (an ${fmtTime(transitArrival(last))}). ${rules.latestHint}`
            : "⏰ Keine spätere Verbindung am selben Tag gefunden – nicht trödeln!");
        } catch {
          warn.replaceChildren("Letzte Verbindung konnte nicht geprüft werden (offline?).");
        }
      });
      card.append(el("div", { class: "btns" },
        el("a", { class: "btn small", href: bahnLink(d.from, d.to, d.itinerary.startTime), target: "_blank", rel: "noopener", title: rules.verifyTitle }, "Bei DB gegenprüfen"),
        el("button", { class: "btn small", onclick: () => nav.board.open(d.from) }, "Abfahrten")));
    }
    if (d.overnight) {
      const o = d.overnight;
      L.marker([o.lat, o.lon], { icon: pinIcon(i + 1, color) }).addTo(groups.route).bindPopup(`Nacht ${i + 1}: ${o.name.replace(/[<>&]/g, "")}`);
      const night = el("div", { class: "card", style: { background: "var(--soft)" } },
        el("strong", {}, `🛏 Übernachtung in ${o.name}`, d.nights > 1 ? ` (${d.nights} Nächte)` : ""),
        el("div", { class: "chips" }, weatherChip(o, d.date)),
        lazyDetails(`Unterkünfte bis 50 € um ${o.name}`, () => lodgingPanel(o)),
        lazyDetails("Infos am Bahnhof", () => stationPanel(o)),
        lazyDetails("Wanderwege in der Umgebung", () => hikingPanel(o)),
        lazyDetails("Bibliotheken (WLAN, Regentag)", () => libraryPanel(o)),
        lazyDetails("Kostenlos & billig (Essen, Strom, WLAN, Wasser)", () => budgetPanel(o)),
        d.nights > 1 ? lazyDetails("Ausflugsziele für den freien Tag", () => sightsPanel(o)) : null);
      if (d.alternatives?.length > 1) {
        const sel = el("select", {}, el("option", { value: "" }, "Lieber woanders übernachten …"),
          d.alternatives.filter((a) => a.place.name !== o.name).map((a, k) => el("option", { value: k }, `${a.place.name} (an ${fmtTime(a.arrival)})`)));
        const alts = d.alternatives.filter((a) => a.place.name !== o.name);
        sel.onchange = () => {
          if (sel.value === "") return;
          const alt = alts[+sel.value].place;
          const stops = [...params.stops];
          const idx = Math.max(0, stops.findIndex((s) => s.place.name === d.finalTarget?.name));
          stops.splice(idx, 0, { place: alt, nights: 1 });
          replan?.({ ...params, stops });
        };
        night.append(el("div", { class: "field", style: { marginTop: "8px" } }, el("label", {}, "Kleinerer Ort = oft günstiger"), sel));
      }
      card.append(night);
    }
    resultBox.append(card);
  });
  L.marker([params.start.lat, params.start.lon], { icon: pinIcon("⌂") }).addTo(groups.route).bindPopup(params.start.name.replace(/[<>&]/g, ""));
  fitPoints(pts, 11);
  // „Letzte Verbindung“ nacheinander abfragen, um Transitous nicht zu überlasten
  (async () => { for (const job of latestQueue) await job(); })();
}

