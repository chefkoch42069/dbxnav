// Reiter „Unterwegs“: kostenlos & billig rund um einen Bahnhof oder den Standort –
// Essen, Strom, WLAN, Wasser, Toiletten, Duschen, Hilfe. Daten aus OpenStreetMap.
import { el, clear, toast, spinnerLine, errorLine, extLink, osmLink } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { map, groups, fitPoints, focusOn, pinIcon } from "./map.js";
import { nav } from "./nav.js";
import { state, addFavorite } from "../state.js";
import { budgetPlaces } from "../api/overpass.js";
import { dataInfo } from "../api/localPoi.js";
import { BUDGET_CATS, classify, extraLabel, ohDe } from "../planner/budget.js";

const ORDER = Object.keys(BUDGET_CATS);
let active = new Set(ORDER);
let onlyFree = false;
let items = [];
let center = null;
let resultBox;
let searchId = 0; // verhindert, dass eine ältere Antwort eine neuere überschreibt

const walkLink = (from, to) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.lat},${from.lon};${to.lat},${to.lon}`;

/** OSM-Ergebnis → klassifizierte Liste (pro Objekt eine Hauptkategorie). */
export function prepareBudget(raw) {
  return raw.map((e) => ({ ...e, c: classify(e.tags) })).filter((e) => e.c);
}

function marker(it) {
  const c = BUDGET_CATS[it.c.cat];
  return L.marker([it.lat, it.lon], {
    icon: L.divIcon({ className: "", html: `<div style="font-size:20px;filter:drop-shadow(0 1px 1px #0008)">${c.icon}</div>`, iconSize: [22, 22] }),
    title: it.tags.name || c.label,
  });
}

function itemRow(it, from, m) {
  const c = BUDGET_CATS[it.c.cat];
  const t = it.tags;
  const meta = [
    it.dist < 1 ? `${Math.round(it.dist * 1000)} m` : `${it.dist.toFixed(1)} km`,
    it.c.free ? "kostenlos" : null,
    ...it.c.extras.map(extraLabel),
  ].filter(Boolean).join(" · ");
  return el("li", {},
    el("div", { class: "grow" },
      el("strong", {}, `${c.icon} ${t.name || t.brand || c.label}`),
      el("span", { class: "muted small" }, [it.c.note, meta].filter(Boolean).join(" · ")),
      t.opening_hours ? el("span", { class: "muted small" }, `🕒 ${ohDe(t.opening_hours)}`) : null),
    el("a", { class: "btn small", href: walkLink(from, it), target: "_blank", rel: "noopener", title: "Fußweg bei OpenStreetMap", "aria-label": "Fußweg bei OpenStreetMap" }, "🚶"),
    el("button", { class: "btn small", onclick: () => { focusOn(it.lat, it.lon, 17); m?.openPopup(); } }, "Karte"));
}

function popup(it, from) {
  const c = BUDGET_CATS[it.c.cat];
  const t = it.tags;
  return el("div", {},
    el("strong", {}, `${c.icon} ${t.name || c.label}`), el("br"),
    it.c.note ? [it.c.note, el("br")] : null,
    it.c.extras.length ? [it.c.extras.map(extraLabel).join(" · "), el("br")] : null,
    t.opening_hours ? [`🕒 ${ohDe(t.opening_hours)}`, el("br")] : null,
    extLink(walkLink(from, it), "Fußweg"), " · ", extLink(osmLink(it.lat, it.lon), "OSM"), el("br"),
    el("button", { class: "btn small", onclick: () => toast(addFavorite({ name: t.name || c.label, lat: it.lat, lon: it.lon }, c.label) ? "Gemerkt" : "Schon gemerkt") }, "☆ Merken"));
}

/** Kompakte Version für Übernachtungsorte/Tagesziele (ohne Filter). */
export function budgetPanel(place) {
  const box = el("div", {}, spinnerLine("Suche kostenlose & billige Orte …"));
  budgetPlaces(place, 1200)
    .then((raw) => {
      const list = prepareBudget(raw);
      groups.places.clearLayers();
      const best = {};
      for (const it of list) (best[it.c.cat] ||= []).push(it);
      const ul = el("ul", { class: "list" });
      for (const cat of ORDER) {
        for (const it of (best[cat] || []).filter((x) => cat !== "toilets" || x.c.free).slice(0, 3)) {
          const m = marker(it).bindPopup(() => popup(it, place));
          groups.places.addLayer(m);
          ul.append(itemRow(it, place, m));
        }
      }
      clear(box).append(list.length ? ul : el("p", { class: "muted" }, "Nichts in OSM eingetragen."),
        el("button", { class: "btn small", onclick: () => { nav.budget.open(place); } }, "Alles im Reiter „Unterwegs“ zeigen"));
    })
    .catch((e) => clear(box).append(errorLine(e)));
  return box;
}

export function initBudgetTab(root) {
  const where = placeInput({ label: "Wo bist du?", id: "budget-where", value: state.prefs.home, snapToStop: false, onSelect: (p) => search(p) });
  const radius = el("select", { onchange: () => center && search(center) },
    [[500, "500 m"], [1500, "1,5 km"], [3000, "3 km"]].map(([v, t]) => el("option", { value: v, selected: v === 1500 }, t)));
  // Sichtbaren Kartenausschnitt durchsuchen – nur wenn nah genug herangezoomt (sonst riesige Abfrage).
  const MIN_ZOOM = 14;
  const viewBtn = el("button", { class: "btn block" }, "Diesen Kartenausschnitt durchsuchen");
  const updateViewBtn = () => {
    const ok = map.getZoom() >= MIN_ZOOM;
    viewBtn.disabled = !ok;
    viewBtn.textContent = ok ? "Diesen Kartenausschnitt durchsuchen" : "Für Kartenausschnitt näher heranzoomen";
  };
  map.on("zoomend", updateViewBtn);
  updateViewBtn();
  viewBtn.onclick = () => {
    const b = map.getBounds().pad(-0.05);
    const c = map.getCenter();
    const bounds = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(5)).join(",");
    search({ name: "Kartenausschnitt", lat: c.lat, lon: c.lng }, bounds);
  };
  // Tippen auf die Karte, während der Reiter offen ist: dort suchen
  map.on("click", (e) => {
    if (root.hidden) return;
    search({ name: "Punkt auf der Karte", lat: e.latlng.lat, lon: e.latlng.lng });
  });
  const chips = ORDER.map((k) => el("button", { class: "chip", "aria-pressed": "true", onclick: (e) => {
    if (active.has(k)) active.delete(k); else active.add(k);
    e.currentTarget.setAttribute("aria-pressed", String(active.has(k)));
    render();
  } }, BUDGET_CATS[k].icon, " ", BUDGET_CATS[k].label));
  const allBtn = el("button", { class: "btn small", onclick: () => {
    const on = active.size !== ORDER.length;
    active = new Set(on ? ORDER : []);
    chips.forEach((c) => c.setAttribute("aria-pressed", String(on)));
    render();
  } }, "alle an/aus");
  const free = el("input", { type: "checkbox", onchange: (e) => { onlyFree = e.target.checked; render(); } });
  resultBox = el("div");

  async function search(p, bounds = null) {
    const id = ++searchId;
    center = p;
    where.value = p;
    clear(resultBox).append(spinnerLine(bounds ? "Suche im Kartenausschnitt …" : `Suche im Umkreis von ${radius.selectedOptions[0].text} um ${p.name} …`));
    groups.places.clearLayers();
    L.marker([p.lat, p.lon], { icon: pinIcon("●") }).addTo(groups.places);
    try {
      const raw = await budgetPlaces(p, +radius.value, bounds);
      if (id !== searchId) return; // inzwischen neue Suche gestartet
      items = prepareBudget(raw);
      render(!bounds);
      if (window.innerWidth <= 760) document.getElementById("panel").scrollTop = resultBox.offsetTop - 12;
    } catch (e) {
      if (id === searchId) clear(resultBox).append(errorLine(e));
    }
  }

  nav.budget.open = (p) => { nav.switchTab("budget"); search(p); };

  root.append(
    el("h2", {}, "Unterwegs"),
    el("p", { class: "lead" }, "Kostenlos & billig in der Nähe: Essen, Strom, WLAN, Wasser, Toiletten, Duschen und Hilfe."),
    where.node,
    el("p", { class: "muted small", style: { margin: "-4px 0 8px" } }, "Bahnhof/Ort eingeben, 📍 für deinen Standort – oder einfach auf die Karte tippen."),
    el("div", { class: "field" }, el("label", {}, "Umkreis"), radius),
    viewBtn,
    el("div", { style: { height: "8px" } }),
    el("div", { class: "chips", role: "group", "aria-label": "Kategorien" }, chips),
    el("div", { class: "row", style: { alignItems: "center" } }, el("label", { class: "check small" }, free, "nur kostenlose"), el("div", { style: { flex: "0 0 auto" } }, allBtn)),
    resultBox,
    el("details", {}, el("summary", {}, "Tipps"),
      el("ul", { class: "small" },
        el("li", {}, "Bahnhofsmission: an über 100 Bahnhöfen, kostenlos, für alle – ", extLink("https://www.bahnhofsmission.de/", "bahnhofsmission.de")),
        el("li", {}, "Bibliotheken: Aufenthalt meist ohne Ausweis – warm, trocken, oft Steckdosen. WLAN gibt es teils nur mit Bibliotheksausweis (oft günstig oder kostenlos)."),
        el("li", {}, "Bäckereien geben abends oft Reste günstiger ab; viele Ketten haben Gratis-WLAN."),
        el("li", {}, "Im Winter: Kältehilfe/Kältebus der Stadt – oft über die Bahnhofsmission erreichbar."),
        el("li", {}, "Notfall: 112. Die Daten stammen aus OpenStreetMap und können veraltet sein."))));
}

function render(fit = false) {
  if (!center) return;
  groups.places.clearLayers();
  const list = items.filter((it) => active.has(it.c.cat) && (!onlyFree || it.c.free));
  L.marker([center.lat, center.lon], { icon: pinIcon("●") }).addTo(groups.places).bindPopup(center.name.replace(/[<>&]/g, ""));
  const byCat = {};
  for (const it of list) (byCat[it.c.cat] ||= []).push(it);
  const frag = [];
  const counts = ORDER.filter((k) => byCat[k]).map((k) => `${BUDGET_CATS[k].icon} ${byCat[k].length}`);
  frag.push(el("p", { class: "muted small" }, list.length ? counts.join("  ") : ""));
  for (const k of ORDER) {
    const arr = byCat[k];
    if (!arr) continue;
    const ul = el("ul", { class: "list" });
    arr.slice(0, 15).forEach((it) => {
      const m = marker(it).bindPopup(() => popup(it, center));
      groups.places.addLayer(m);
      ul.append(itemRow(it, center, m));
    });
    arr.slice(15).forEach((it) => groups.places.addLayer(marker(it).bindPopup(() => popup(it, center))));
    frag.push(el("h3", {}, `${BUDGET_CATS[k].icon} ${BUDGET_CATS[k].label} (${arr.length})`), ul);
  }
  if (!list.length) frag.push(el("p", { class: "muted" }, items.length ? "Mit diesen Filtern nichts gefunden." : "Hier ist in OSM nichts eingetragen. Größeren Umkreis probieren."));
  const src = el("p", { class: "muted small" }, "Daten © OpenStreetMap-Mitwirkende");
  dataInfo().then((d) => { src.textContent = d ? `Daten © OpenStreetMap-Mitwirkende · Stand ${d.generated.slice(0, 10).split("-").reverse().join(".")}` : "Daten © OpenStreetMap-Mitwirkende · live über Overpass"; });
  frag.push(src);
  clear(resultBox).append(...frag);
  if (fit && list.length) fitPoints([[center.lat, center.lon], ...list.map((i) => [i.lat, i.lon])], 16);
}
