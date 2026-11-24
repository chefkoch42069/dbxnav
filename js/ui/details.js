// Wiederverwendbare Ansichten: Verbindung, Unterkünfte, Bahnhofs-Infos, Ausflugsziele, Wetter.
import { el, clear, badgeFor, spinnerLine, errorLine, extLink, osmLink, toast } from "./dom.js";
import { fmtTime, fmtDuration, diffSec } from "../lib/time.js";
import { checkLeg, lineName } from "../planner/dticket.js";
import { estimatePrice, ratingOrder, TYPE_LABEL } from "../planner/accommodation.js";
import { accommodations, stationInfo, stationCategory, sights, sightCategory, hikingRoutes, hikingRouteGeometry, waymarkedLink, libraries, MAX_MAP_KM } from "../api/overpass.js";
import { reverseStop } from "../api/transitous.js";
import { walkHours, fmtHours } from "../planner/hiking.js";
import { nav } from "./nav.js";
import { forecast } from "../api/weather.js";
import { map, groups, popupContent, focusOn, fitPoints, pinIcon, trackLabel, showOverlay } from "./map.js";
import { addFavorite } from "../state.js";
import { APP } from "../config.js";

export function renderItinerary(it) {
  const ul = el("ul", { class: "legs" });
  for (const leg of it.legs) {
    if (leg.mode === "WALK") {
      if (leg.duration >= 120) ul.append(el("li", {}, el("span", { class: "t muted" }, fmtTime(leg.startTime)), el("span", { class: "muted" }, "🚶"), el("span", { class: "muted small" }, `${Math.round(leg.duration / 60)} min Fußweg`)));
      continue;
    }
    const chk = checkLeg(leg);
    ul.append(
      el("li", {},
        el("span", { class: "t" }, fmtTime(leg.startTime)),
        badgeFor(leg),
        el("div", {},
          el("div", {}, leg.from.name, " → ", leg.to.name),
          el("div", { class: "muted small" }, `an ${fmtTime(leg.endTime)}`, leg.headsign ? ` · Richtung ${leg.headsign}` : "", leg.from.track ? ` · ${trackLabel(leg.from.track)}` : ""),
          chk.note ? el("div", { class: `note ${chk.level}` }, chk.note) : null
        )
      )
    );
  }
  return el("div", {},
    el("div", { class: "chips" },
      el("span", { class: "chip static" }, `${fmtTime(it.startTime)} – ${fmtTime(it.endTime)}`),
      el("span", { class: "chip static" }, fmtDuration(it.duration)),
      el("span", { class: "chip static" }, `${it.transfers} Umstieg${it.transfers === 1 ? "" : "e"}`)),
    ul);
}

export function weatherChip(place, date) {
  const chip = el("span", { class: "chip static", title: "Wetter (DWD über Bright Sky)" }, "Wetter …");
  forecast(place, date)
    .then((w) => {
      if (!w) return (chip.textContent = "Wetter: keine Vorhersage");
      chip.textContent = `${w.emoji} ${w.min}–${w.max} °C${w.rainMm ? ` · ${w.rainMm} mm` : ""}`;
    })
    .catch(() => (chip.textContent = "Wetter nicht verfügbar"));
  return chip;
}

/** Unterkünfte bis 50 € um einen Ort. */
export function lodgingPanel(place, { radius = 3000 } = {}) {
  const box = el("div", {}, spinnerLine(`Suche Unterkünfte um ${place.name} …`));
  const showAll = el("input", { type: "checkbox" });
  (async () => {
    try {
      const items = (await accommodations(place, radius)).map((a) => ({ ...a, est: estimatePrice(a.tags) }));
      items.sort((a, b) => ratingOrder[a.est.rating] - ratingOrder[b.est.rating] || a.dist - b.dist);
      groups.lodging.clearLayers();
      const render = () => {
        const list = items.filter((a) => showAll.checked || a.est.rating !== "unlikely");
        const ul = el("ul", { class: "list" });
        for (const a of list.slice(0, 40)) {
          const t = a.tags;
          const m = L.circleMarker([a.lat, a.lon], { radius: 7, color: "#fff", weight: 2, fillColor: a.est.rating === "likely" ? "#1e7b45" : a.est.rating === "maybe" ? "#b26a00" : "#b3261e", fillOpacity: 1 })
            .bindPopup(() => popupContent(lodgingInfo(a)));
          groups.lodging.addLayer(m);
          ul.append(el("li", {},
            el("div", { class: "grow" },
              el("strong", {}, t.name),
              el("span", { class: "muted small" }, `${TYPE_LABEL[t.tourism] || t.tourism} · ${a.dist.toFixed(1)} km`, t.stars ? ` · ${t.stars}★` : ""),
              el("span", {}, el("span", { class: `rating ${a.est.rating}` }, a.est.rating === "likely" ? "≤ 50 € wahrscheinlich" : a.est.rating === "maybe" ? "Preis prüfen" : "eher teurer"), " ", el("span", { class: "muted small" }, a.est.reason))),
            el("button", { class: "btn small", onclick: () => { focusOn(a.lat, a.lon, 16); m.openPopup(); } }, "Karte")));
        }
        clear(box).append(
          el("p", { class: "muted small" }, `${list.length} Unterkünfte im Umkreis von ${radius / 1000} km. OSM kennt selten Preise – die Einschätzung ist grob, max. ${APP.maxPricePerNight} € pro Nacht.`),
          el("label", { class: "check small" }, showAll, "auch eher teure zeigen"),
          list.length ? ul : el("p", {}, "Nichts gefunden. Tipp: Ort eine Station weiter wählen – außerhalb großer Städte ist es oft günstiger."));
      };
      showAll.onchange = render;
      render();
    } catch (e) {
      clear(box).append(errorLine(e));
    }
  })();
  return box;
}

function lodgingInfo(a) {
  const t = a.tags;
  return [
    el("strong", {}, t.name), el("br"),
    el("span", { class: "muted" }, TYPE_LABEL[t.tourism] || t.tourism), el("br"),
    t["addr:street"] ? [`${t["addr:street"]} ${t["addr:housenumber"] || ""}`, el("br")] : null,
    t.phone ? [`☎ ${t.phone}`, el("br")] : null,
    t.website ? [extLink(t.website, "Webseite"), " · "] : null,
    extLink(osmLink(a.lat, a.lon), "OSM"), " · ",
    extLink(`https://www.google.com/search?q=${encodeURIComponent(`${t.name} ${t["addr:city"] || ""} Preis`)}`, "Preis suchen"), el("br"),
    el("button", { class: "btn small", onclick: () => toast(addFavorite({ name: t.name, lat: a.lat, lon: a.lon }, "Unterkunft") ? "Gemerkt" : "Schon gemerkt") }, "☆ Merken"),
  ];
}

const STATION_ICON = { Toiletten: "🚻", Schließfächer: "🧳", Supermarkt: "🛒", Bäckerei: "🥐", "Kiosk/Späti": "🏪", Apotheke: "💊", Trinkwasser: "🚰", Geldautomat: "🏧" };

export function stationPanel(place) {
  const box = el("div", {}, spinnerLine("Lade Infos aus OpenStreetMap …"));
  stationInfo(place)
    .then((items) => {
      groups.places.clearLayers();
      const byCat = {};
      for (const it of items) (byCat[stationCategory(it.tags)] ||= []).push(it);
      const ul = el("ul", { class: "list" });
      for (const [cat, list] of Object.entries(byCat).sort()) {
        const near = list[0];
        ul.append(el("li", {}, el("div", { class: "grow" }, el("strong", {}, `${STATION_ICON[cat] || "•"} ${cat}`),
          el("span", { class: "muted small" }, `${list.length}× · nächste ${Math.round(near.dist * 1000)} m${near.tags.name ? ` (${near.tags.name})` : ""}${near.tags.opening_hours ? ` · ${near.tags.opening_hours}` : ""}`))));
        for (const it of list.slice(0, 5)) {
          groups.places.addLayer(L.marker([it.lat, it.lon], { icon: L.divIcon({ className: "", html: `<div style="font-size:18px">${STATION_ICON[cat] || "•"}</div>`, iconSize: [20, 20] }) })
            .bindPopup(`${cat}${it.tags.name ? ": " + it.tags.name.replace(/[<>&]/g, "") : ""}`));
        }
      }
      clear(box).append(items.length ? ul : el("p", { class: "muted" }, "In OSM ist hier nichts eingetragen."), el("p", { class: "muted small" }, "Umkreis 600 m, Daten © OpenStreetMap-Mitwirkende."));
    })
    .catch((e) => clear(box).append(errorLine(e)));
  return box;
}

const SIGHT_ICON = { "Burg/Schloss": "🏰", Ruine: "🏚️", Historisch: "🏛️", See: "🌊", Aussicht: "🔭", Museum: "🖼️", "Natur/Park": "🌳", Sehenswert: "⭐" };

export function sightsPanel(place) {
  const box = el("div", {}, spinnerLine("Suche lohnende Ausflugsziele …"));
  sights(place)
    .then((items) => {
      groups.places.clearLayers();
      const ul = el("ul", { class: "list" });
      for (const it of items.slice(0, 30)) {
        const cat = sightCategory(it.tags);
        groups.places.addLayer(L.marker([it.lat, it.lon], { icon: L.divIcon({ className: "", html: `<div style="font-size:18px">${SIGHT_ICON[cat]}</div>`, iconSize: [20, 20] }) })
          .bindPopup(it.tags.name.replace(/[<>&]/g, "")));
        const wiki = it.tags.wikipedia ? `https://de.wikipedia.org/wiki/${encodeURIComponent((it.tags.wikipedia.split(":")[1] || it.tags.wikipedia).replace(/ /g, "_"))}` : null;
        ul.append(el("li", {}, el("div", { class: "grow" }, el("strong", {}, `${SIGHT_ICON[cat]} ${it.tags.name}`), el("span", { class: "muted small" }, `${cat} · ${it.dist.toFixed(1)} km`)),
          wiki ? extLink(wiki, "Wiki") : null,
          el("button", { class: "btn small", onclick: () => focusOn(it.lat, it.lon, 15) }, "Karte")));
      }
      clear(box).append(items.length ? ul : el("p", { class: "muted" }, "Keine Burgen, Seen oder Aussichtspunkte in 5 km gefunden."));
    })
    .catch((e) => clear(box).append(errorLine(e)));
  return box;
}

const esc = (s) => String(s).replace(/[<>&"]/g, "");

/** Markierte Wanderwege in der Umgebung (OSM-Routen), Ebene „Wanderwege“ wird eingeschaltet. */
export function hikingPanel(place) {
  const box = el("div", {}, spinnerLine("Suche Wanderwege …"));
  showOverlay("Wanderwege");
  hikingRoutes(place)
    .then((items) => {
      const ul = el("ul", { class: "list" });
      for (const it of items.slice(0, 25)) ul.append(hikeItem(it));
      clear(box).append(
        items.length ? ul : el("p", { class: "muted" }, "Keine markierten Wanderwege in 6 km gefunden."),
        el("p", { class: "muted small" }, "„Auf Karte“ zeichnet den Weg und sucht die nächsten Haltestellen an Start und Ziel. „Höhenprofil“ öffnet Waymarked Trails. Gehzeit nach DIN 33466 (4 km/h, 300 Hm/h hoch, 500 Hm/h runter)."),
        el("button", { class: "btn small", onclick: () => { showOverlay("Wanderwege"); focusOn(place.lat, place.lon, 13); } }, "Wanderwege auf der Karte"));
    })
    .catch((e) => clear(box).append(errorLine(e)));
  return box;
}

function hikeItem(it) {
  const i = it.info;
  const more = el("div");
  const line = (...xs) => { const t = xs.filter(Boolean).join(" · "); return t ? el("span", { class: "muted small" }, t) : null; };
  const tooLong = i.km > MAX_MAP_KM;
  const showBtn = el("button", { class: "btn small", disabled: tooLong, title: tooLong ? "Zu lang für die Karte – Höhenprofil öffnet den ganzen Weg" : null }, "Auf Karte");
  showBtn.onclick = async () => {
    showBtn.disabled = true;
    clear(more).append(spinnerLine("Lade Verlauf …"));
    try {
      const g = await hikingRouteGeometry(it.id);
      if (!g.lines.length) throw new Error("Kein Verlauf in OSM.");
      groups.trip.clearLayers();
      for (const l of g.lines) L.polyline(l, { color: "#fff", weight: 8, opacity: 0.8, interactive: false }).addTo(groups.trip);
      for (const l of g.lines) L.polyline(l, { color: "#c2185b", weight: 4 }).bindTooltip(i.name, { sticky: true }).addTo(groups.trip);
      fitPoints(g.lines.flat(), 15);
      const km = i.km || Math.round(g.km * 10) / 10;
      const hours = i.hours ?? walkHours(km, i.ascent, i.descent);
      // Start/Ziel: Enden der längsten Linie (Wege in OSM bestehen aus vielen Abschnitten)
      const longest = g.lines.reduce((a, b) => (b.length > a.length ? b : a));
      const ends = i.roundtrip ? [longest[0]] : [longest[0], longest[longest.length - 1]];
      const stops = await Promise.all(ends.map(([lat, lon]) => reverseStop(lat, lon).catch(() => null)));
      ends.forEach(([lat, lon], k) => L.marker([lat, lon], { icon: pinIcon(k ? "Z" : "S", "#c2185b") }).addTo(groups.trip));
      clear(more).append(el("div", { class: "card small" },
        el("div", {}, `Länge ${km} km${i.km ? "" : " (aus dem Verlauf berechnet)"}${hours ? ` · Gehzeit ca. ${fmtHours(hours)}` : ""}${i.ascent == null ? " · Höhenmeter nicht in OSM" : ""}`),
        ...stops.map((s, k) => s ? el("div", {}, `${ends.length > 1 ? (k ? "Ziel" : "Start") : "Start/Ziel"}: nächste Haltestelle `, el("strong", {}, s.name), " ",
          el("button", { class: "btn small", onclick: () => nav.board.open(s) }, "Abfahrten")) : null)));
    } catch (e) {
      clear(more).append(errorLine(e));
    } finally {
      showBtn.disabled = false;
    }
  };
  return el("li", { style: { flexWrap: "wrap" } },
    el("div", { class: "grow" },
      el("strong", {}, `🥾 ${i.name}`, i.ref ? el("span", { class: "muted small" }, ` (${i.ref})`) : null),
      line(i.label, i.km ? `${i.km} km` : null, i.roundtrip ? "Rundweg" : null, `${it.dist.toFixed(1)} km entfernt`),
      line(i.ascent != null ? `↑ ${i.ascent} m` : null, i.descent != null ? `↓ ${i.descent} m` : null, i.hours ? `Gehzeit ca. ${fmtHours(i.hours)}` : null, i.days ? `Mehrtagesweg: ca. ${i.days} Tage à 20 km` : null),
      i.ends ? line(i.ends) : null,
      i.symbol ? line(`Markierung: ${i.symbol}`) : null,
      i.operator ? line(`Betreut von ${i.operator}`) : null,
      i.description ? el("span", { class: "small", style: { display: "block", marginTop: "2px" } }, i.description.length > 220 ? `${i.description.slice(0, 217)}…` : i.description) : null,
      more),
    el("div", { class: "btns", style: { flexDirection: "column", alignItems: "stretch" } },
      showBtn,
      extLink(waymarkedLink(it.id), "Höhenprofil"),
      i.website ? extLink(i.website, "Web") : null));
}

/** Bibliotheken in der Nähe: Öffnungszeiten, WLAN – gut für Regentage und zum Aufladen. */
export function libraryPanel(place) {
  const box = el("div", {}, spinnerLine("Suche Bibliotheken …"));
  libraries(place)
    .then((items) => {
      groups.places.clearLayers();
      const ul = el("ul", { class: "list" });
      for (const it of items.slice(0, 20)) {
        const i = it.info;
        const m = L.marker([it.lat, it.lon], { icon: L.divIcon({ className: "", html: '<div style="font-size:18px">📚</div>', iconSize: [20, 20] }) })
          .bindPopup(`<strong>${esc(i.name)}</strong>${i.address ? "<br>" + esc(i.address) : ""}${i.hours ? "<br>🕒 " + esc(i.hours) : ""}${i.wifi ? "<br>📶 WLAN" : ""}`);
        groups.places.addLayer(m);
        ul.append(el("li", {},
          el("div", { class: "grow" }, el("strong", {}, `📚 ${i.name}`),
            el("span", { class: "muted small" }, [i.type, `${it.dist.toFixed(1)} km`, i.wifi ? "📶 WLAN" : null].filter(Boolean).join(" · ")),
            i.hours ? el("span", { class: "muted small" }, `🕒 ${i.hours}`) : el("span", { class: "muted small" }, "Öffnungszeiten nicht in OSM")),
          i.website ? extLink(i.website, "Web") : null,
          el("button", { class: "btn small", onclick: () => { focusOn(it.lat, it.lon, 16); m.openPopup(); } }, "Karte")));
      }
      clear(box).append(items.length ? ul : el("p", { class: "muted" }, "Keine Bibliothek in 3 km gefunden."), el("p", { class: "muted small" }, "Daten © OpenStreetMap-Mitwirkende."));
    })
    .catch((e) => clear(box).append(errorLine(e)));
  return box;
}

/** Aufklappbarer Bereich, der seinen Inhalt erst beim Öffnen lädt. */
export function lazyDetails(summary, make) {
  const d = el("details", {}, el("summary", {}, summary));
  let done = false;
  d.addEventListener("toggle", () => { if (d.open && !done) { done = true; d.append(make()); } });
  return d;
}

export function stayText(arrIso, depIso) {
  return fmtDuration(diffSec(arrIso, depIso));
}

export { lineName };
