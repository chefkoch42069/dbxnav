// Bereich „Flug & Fähre“: Anreise zu mehreren Flughäfen/Häfen mit dem D-Ticket vergleichen,
// Preise per Link beim Anbieter (ohne eigenen Server kein Preisabruf möglich/erlaubt).
import { el, clear, busy, toast, extLink, optionSelect } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { groups, pinIcon, fitPoints, drawItinerary, DAY_COLORS } from "./map.js";
import { state } from "../state.js";
import { plan } from "../api/transitous.js";
import { pickBest } from "../planner/dticket.js";
import { summarize } from "../planner/connection.js";
import { AIRPORTS, POPULAR_DESTINATIONS, nearestAirports, flightLinks, destCode, FERRIES, ferryLinks } from "../planner/flights.js";
import { berlinToISO, todayBerlin, addDays, fmtTime, fmtDuration } from "../lib/time.js";
import { distanceKm } from "../lib/geo.js";

async function access(from, to, date, time) {
  const it = pickBest(await plan(from, to, berlinToISO(date, time)).catch(() => []));
  return it ? { it, s: summarize(it) } : null;
}

export function flightPanel() {
  const start = placeInput({ label: "Start", id: "fl-start", value: state.prefs.home });
  const dest = el("input", { type: "search", id: "fl-dest", list: "fl-dests", placeholder: "z. B. BCN oder Barcelona", autocomplete: "off" });
  const dl = el("datalist", { id: "fl-dests" }, POPULAR_DESTINATIONS.map(([c, n]) => el("option", { value: `${n} ${c}` })));
  const date = el("input", { type: "date", id: "fl-date", value: addDays(todayBerlin(), 14) });
  const ret = el("input", { type: "date", id: "fl-ret", value: addDays(todayBerlin(), 21) });
  const time = el("input", { type: "time", id: "fl-time", value: "06:00" });
  const count = optionSelect([[3, "3 nächste"], [5, "5 nächste"], [8, "8 nächste"], [AIRPORTS.length, "alle"]], 5, { id: "fl-n" });
  const go = el("button", { class: "btn primary block" }, "Flughäfen vergleichen");
  const out = el("div");

  go.onclick = () => {
    const s = start.value;
    const code = destCode(dest.value);
    if (!s) return toast("Bitte Start wählen.");
    if (!code) return toast("Ziel als Flughafen-Code (z. B. BCN) oder aus der Liste wählen.");
    busy(go, async () => {
      groups.route.clearLayers();
      const airports = nearestAirports(s, +count.value);
      clear(out).append(el("p", { class: "muted small" }, `Berechne Anreise zu ${airports.length} Flughäfen …`));
      const rows = [];
      for (const a of airports) rows.push({ a, acc: await access(s, a, date.value, time.value) }); // nacheinander, um Transitous zu schonen
      rows.sort((x, y) => (x.acc ? x.acc.s.duration : 1e9) - (y.acc ? y.acc.s.duration : 1e9));
      const links = flightLinks(airports, code, date.value, ret.value || null);
      const pts = [];
      rows.forEach(({ a, acc }, i) => {
        L.marker([a.lat, a.lon], { icon: pinIcon("✈", DAY_COLORS[i % DAY_COLORS.length]) }).addTo(groups.route).bindTooltip(`${a.code} ${a.name}`);
        pts.push([a.lat, a.lon]);
        if (acc && i < 3) pts.push(...drawItinerary(acc.it, groups.route, { color: DAY_COLORS[i % DAY_COLORS.length], weight: 3 }));
      });
      pts.push([s.lat, s.lon]);
      fitPoints(pts, 9);
      clear(out).append(
        el("div", { class: "alert info small" }, "Preise zeigt der Anbieter nach dem Klick – ohne eigenen Server darf und kann die App sie nicht abrufen. ",
          el("strong", {}, "Tipp: "), "„Alle zusammen bei Kayak“ vergleicht die Abflughäfen in einer Suche."),
        el("a", { class: "btn primary block", href: links.all, target: "_blank", rel: "noopener" }, `Alle ${airports.length} Flughäfen zusammen bei Kayak → ${code}`),
        el("ul", { class: "list" }, rows.map(({ a, acc }) => {
          const l = links.perAirport[a.code];
          return el("li", { style: { flexWrap: "wrap" } },
            el("div", { class: "grow" },
              el("strong", {}, `${a.code} · ${a.name}`),
              el("span", { class: "muted small" }, acc
                ? `Mit D-Ticket: ab ${fmtTime(acc.s.dep)}, an ${fmtTime(acc.s.arr)} · ${fmtDuration(acc.s.duration)}, ${acc.s.transfers} Umst.`
                : `keine D-Ticket-Verbindung gefunden · ${a.km} km Luftlinie`)),
            el("span", { class: "btns", style: { margin: 0 } },
              extLink(l.google, "Google"), " · ", extLink(l.skyscanner, "Skyscanner"), " · ", extLink(l.kayak, "Kayak")));
        })),
        el("p", { class: "muted small" }, "Zum Flughafen nur Nahverkehr. Für frühe Flüge vorher übernachten oder die Abfahrtszeit oben anpassen."));
    });
  };

  // --- Fähren
  const ferryOut = el("div");
  const ferryBtn = el("button", { class: "btn block" }, "Fähren ab Deutschland zeigen");
  ferryBtn.onclick = () => {
    const s = start.value;
    if (!s) return toast("Bitte Start wählen.");
    busy(ferryBtn, async () => {
      groups.route.clearLayers();
      const list = FERRIES.map((f) => ({ ...f, km: Math.round(distanceKm(s, f)) })).sort((a, b) => a.km - b.km);
      for (const f of list) L.marker([f.lat, f.lon], { icon: pinIcon("⛴", "#00809d") }).addTo(groups.route).bindTooltip(f.route);
      fitPoints([[s.lat, s.lon], ...list.map((f) => [f.lat, f.lon])], 7);
      const ports = [...new Map(list.map((f) => [f.port, f])).values()].slice(0, 6);
      const acc = {};
      for (const p of ports) acc[p.port] = await access(s, p, date.value, "07:00");
      clear(ferryOut).append(el("ul", { class: "list" }, list.map((f) => {
        const a = acc[f.port], l = ferryLinks(f);
        return el("li", { style: { flexWrap: "wrap" } },
          el("div", { class: "grow" },
            el("strong", {}, `⛴ ${f.route}`),
            el("span", { class: "muted small" }, `${f.operator}${f.night ? " · Nachtfähre" : ""} · ab ${f.port}`),
            el("span", { class: "muted small" }, a ? `Mit D-Ticket zum Hafen: ${fmtDuration(a.s.duration)}, an ${fmtTime(a.s.arr)}` : `${f.km} km entfernt${ports.includes(f) ? " · keine Verbindung gefunden" : ""}`)),
          el("span", {}, extLink(l.search, "Preise suchen"), " · ", extLink(l.directferries, "Direct Ferries"), " · ", extLink(l.ferryhopper, "Ferryhopper")));
      })), el("p", { class: "muted small" }, "Anreise berechnet für die 6 nächsten Häfen. Kurze Fähren (Flüsse, Seen) findet auch die normale Verbindungssuche."));
    });
  };

  return el("div", {},
    el("h3", {}, "✈️ Flug & ⛴ Fähre"),
    el("p", { class: "muted small" }, "Welcher Flughafen ist mit dem D-Ticket am besten erreichbar? Preise mit einem Klick beim Anbieter – auch für mehrere Abflughäfen zusammen."),
    start.node,
    el("div", { class: "field" }, el("label", { for: "fl-dest" }, "Ziel (Flughafen)"), dest, dl),
    el("div", { class: "row" },
      el("div", { class: "field" }, el("label", { for: "fl-date" }, "Hinflug"), date),
      el("div", { class: "field" }, el("label", { for: "fl-ret" }, "Rückflug (optional)"), ret)),
    el("div", { class: "row" },
      el("div", { class: "field" }, el("label", { for: "fl-time" }, "Losfahren ab"), time),
      el("div", { class: "field" }, el("label", { for: "fl-n" }, "Flughäfen"), count)),
    go, out,
    el("div", { style: { height: "10px" } }),
    ferryBtn, ferryOut);
}
