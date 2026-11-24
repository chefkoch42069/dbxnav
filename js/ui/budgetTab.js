// Reiter „Homeless-Modus“: billig essen, Strom & WLAN, Parks und kostenlose Orte für den Tag –
// rund um einen Punkt oder für eine ganze Stadt (Stadtgrenze aus OSM). Daten aus OpenStreetMap.
import { el, clear, toast, spinnerLine, errorLine, extLink, osmLink, plain } from "./dom.js";
import { placeInput } from "./placeInput.js";
import { map, groups, fitPoints, focusOn, pinIcon, setBase, emojiIcon } from "./map.js";
import { nav } from "./nav.js";
import { state, addFavorite } from "../state.js";
import { budgetPlaces, freePlaces, bboxAround } from "../api/overpass.js";
import { cityAt } from "../api/city.js";
import { dataInfo } from "../api/localPoi.js";
import { BUDGET_CATS, classify, extraLabel, ohDe } from "../planner/budget.js";
import { FREE_CATS, classifyFree, bboxHectares } from "../planner/homeless.js";

export const TAB_NAME = "Homeless-Modus";
const CATS = { ...BUDGET_CATS, ...FREE_CATS };
const CHIP_GROUPS = [
  ["Essen, Strom & WLAN", ["cheapfood", "freefood", "power", "wifi", "library", "help"]],
  ["Parks & kostenlos", Object.keys(FREE_CATS)],
  ["Grundbedarf", ["water", "toilets", "shower", "shelter", "give"]],
];
const ORDER = CHIP_GROUPS.flatMap(([, keys]) => keys);
const FALLBACK_RADIUS = 3000; // wenn keine Stadtgrenze gefunden wird oder die Stadt zu groß ist

let active = new Set(ORDER);
let onlyFree = false;
let items = [];
let center = null;
let city = null; // { name, bounds, outline } im Stadt-Modus
let notes = []; // Hinweise zur letzten Suche (Rückfall auf Umkreis, Overpass überlastet …)
let resultBox;
let searchId = 0; // verhindert, dass eine ältere Antwort eine neuere überschreibt

const walkLink = (from, to) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.lat},${from.lon};${to.lat},${to.lon}`;
const bboxStr = ([s, w, n, e]) => [s, w, n, e].map((v) => v.toFixed(5)).join(",");

/** OSM-Ergebnis → klassifizierte Liste (pro Objekt eine Hauptkategorie). */
export function prepareBudget(raw) {
  return raw.map((e) => ({ ...e, c: classify(e.tags) })).filter((e) => e.c);
}

function prepareFree(raw) {
  return raw.map((e) => ({ ...e, c: classifyFree(e.tags), ha: bboxHectares(e.bounds) })).filter((e) => e.c);
}

function marker(it) {
  const c = CATS[it.c.cat];
  return L.marker([it.lat, it.lon], {
    icon: emojiIcon(c.icon, 20),
    title: it.tags.name || c.label,
  });
}

const sizeText = (it) => (it.c.cat === "park" && it.ha >= 1 ? `ca. ${it.ha >= 100 ? Math.round(it.ha / 10) * 10 : it.ha} ha` : null);

function itemRow(it, from, m) {
  const c = CATS[it.c.cat];
  const t = it.tags;
  const meta = [
    it.dist < 1 ? `${Math.round(it.dist * 1000)} m` : `${it.dist.toFixed(1)} km`,
    sizeText(it),
    it.c.free ? "kostenlos" : null,
    ...it.c.extras.map(extraLabel),
  ].filter(Boolean).join(" · ");
  return el("li", {},
    el("div", { class: "grow" },
      el("strong", {}, `${c.icon} ${t.name || t.brand || c.label}`),
      el("span", { class: "muted small" }, [it.c.note, meta].filter(Boolean).join(" · ")),
      t.opening_hours ? el("span", { class: "muted small" }, `🕒 ${ohDe(t.opening_hours)}`) : null),
    el("a", { class: "btn small", href: walkLink(from, it), target: "_blank", rel: "noopener", title: "Fußweg bei OpenStreetMap", "aria-label": "Fußweg bei OpenStreetMap" }, "🚶"),
    el("button", { class: "btn small", onclick: () => { focusOn(it.lat, it.lon, it.c.cat === "park" ? 15 : 17); m?.openPopup(); } }, "Karte"));
}

function popup(it, from) {
  const c = CATS[it.c.cat];
  const t = it.tags;
  return el("div", {},
    el("strong", {}, `${c.icon} ${t.name || c.label}`), el("br"),
    it.c.note ? [it.c.note, el("br")] : null,
    sizeText(it) ? [sizeText(it), el("br")] : null,
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
      for (const cat of Object.keys(BUDGET_CATS)) {
        for (const it of (best[cat] || []).filter((x) => cat !== "toilets" || x.c.free).slice(0, 3)) {
          const m = marker(it).bindPopup(() => popup(it, place));
          groups.places.addLayer(m);
          ul.append(itemRow(it, place, m));
        }
      }
      clear(box).append(list.length ? ul : el("p", { class: "muted" }, "Nichts in OSM eingetragen."),
        el("button", { class: "btn small", onclick: () => { nav.budget.open(place); } }, `Ganze Stadt im ${TAB_NAME} zeigen`));
    })
    .catch((e) => clear(box).append(errorLine(e)));
  return box;
}

// ---------------------------------------------------------------- Tipps
const tip = (title, ...lis) => el("details", { class: "tips" }, el("summary", {}, title), el("ul", { class: "small" }, lis.map((x) => el("li", {}, x))));

function tipsSection() {
  return el("div", {},
    el("h3", {}, "Tipps für den Tag"),
    tip("🥖 Billig & satt essen",
      "Suppenküchen, Wärmestuben und Tagesaufenthalte: Essen kostenlos oder für 1–2 €, meist ohne Nachweis. Die Tafel braucht dagegen fast immer einen Berechtigungsnachweis.",
      "Foodsharing-Fairteiler (🥫 auf der Karte): Kühlschränke/Regale, aus denen jeder einfach nehmen darf.",
      ["„Too Good To Go“-App: Bäckereien und Supermärkte geben abends Überraschungstüten für ca. 3–5 € ab. ", extLink("https://www.toogoodtogo.com/de", "toogoodtogo.com")],
      "Bäcker kurz vor Ladenschluss fragen: Brot vom Vortag gibt es oft zum halben Preis oder geschenkt.",
      "Discounter: Haferflocken, Bananen, Brot, Erdnussbutter und Linsen in Dosen machen für wenig Geld lange satt.",
      "Mensen von Unis und Hochschulen: Gäste zahlen mehr als Studierende, essen aber trotzdem warm und billig.",
      "Kirchengemeinden bieten oft einen Mittagstisch an, meist an festen Wochentagen. Aushänge an der Kirchentür lesen."),
    tip("🔌 Strom & 📶 WLAN",
      "Bibliotheken: warm, trocken, Steckdosen und Toiletten. Rein darf man meist ohne Ausweis; fürs WLAN braucht man oft einen Bibliotheksausweis, der in vielen Städten günstig oder kostenlos ist.",
      ["Freifunk: offene, kostenlose WLANs in vielen Städten (Netzname enthält „Freifunk“). ", extLink("https://freifunk.net/", "freifunk.net")],
      "In Bayern gibt es an vielen öffentlichen Orten „@BayernWLAN“: kostenlos, ohne Anmeldung.",
      "Große Bahnhöfe haben oft kostenloses WLAN. Fast-Food-Ketten und viele Cafés haben Gratis-WLAN, teils mit Steckdosen.",
      "Mit dem Deutschlandticket: In vielen neueren Regionalzügen gibt es Steckdosen und teils WLAN. Eine längere Fahrt ist warm, sicher und lädt das Handy.",
      "Einkaufszentren: Sitzplätze, Toiletten, oft WLAN. Eine Powerbank lohnt sich, dann reicht eine Steckdose für den ganzen Tag."),
    tip("🌳 Tagsüber: wohin?",
      "Bibliotheken, Kirchen und Einkaufszentren sind warm und kostenlos. Im Sommer sind große Parks gut: Schatten, Wasser, oft Toiletten.",
      "Museen: Viele haben einen kostenlosen Tag in der Woche oder im Monat. Auf der Website nachsehen.",
      "Tagesaufenthalte/Wärmestuben (🤝 auf der Karte): Aufwärmen, Kaffee, oft Duschen, Waschmaschine und Beratung.",
      "Bahnhofsmission: an über 100 Bahnhöfen, kostenlos, für alle: Tee, Ruhe, Hilfe. Viele haben auch nachts geöffnet."),
    tip("🚿 Hygiene",
      "Duschen gibt es oft in Tagesaufenthalten und Wärmestuben. Im Hallenbad ist die warme Dusche im Eintritt dabei.",
      "Aufkleber „Nette Toilette“ an Restaurants und Läden: Dort darf man das WC kostenlos benutzen, ohne etwas zu kaufen.",
      "Viele Bahnhofstoiletten kosten Geld. Kostenlose Toiletten zeigt der Filter 🚻 mit „nur kostenlose“."),
    tip("🤝 Hilfe & Sicherheit",
      "Wohnungslosenhilfe/Beratungsstellen bieten oft eine Postadresse an, wichtig für Ämter, Bank und Krankenkasse.",
      "Ohne Krankenversicherung: In vielen Städten gibt es kostenlose Sprechstunden, z. B. Straßenambulanzen oder Malteser Medizin für Menschen ohne Krankenversicherung.",
      "Im Winter: Kältebus oder Kältehilfe der Stadt, oft über die Bahnhofsmission erreichbar. Wer draußen jemanden in Not sieht: 112.",
      "Ausweis, Handy und Geld am Körper tragen; Schließfächer gibt es an vielen Bahnhöfen.",
      "Die Daten stammen aus OpenStreetMap und können veraltet sein. Öffnungszeiten vor Ort prüfen."));
}

// ---------------------------------------------------------------- Reiter
export function initBudgetTab(root) {
  const where = placeInput({ label: "Stadt oder Ort", id: "budget-where", value: state.prefs.home, snapToStop: false, onSelect: (p) => search(p) });
  const radius = el("select", { onchange: () => center && search(center) },
    [["city", "Ganze Stadt"], [500, "500 m"], [1500, "1,5 km"], [3000, "3 km"]].map(([v, t]) => el("option", { value: v, selected: v === "city" }, t)));
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
    search({ name: "Kartenausschnitt", lat: c.lat, lon: c.lng }, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
  };
  // Tippen auf die Karte, während der Reiter offen ist: dort suchen
  map.on("click", (e) => {
    if (root.hidden) return;
    search({ name: "Punkt auf der Karte", lat: e.latlng.lat, lon: e.latlng.lng });
  });

  const chips = new Map();
  const chipRows = CHIP_GROUPS.map(([title, keys]) => el("div", {},
    el("div", { class: "muted small", style: { margin: "6px 0 2px" } }, title),
    el("div", { class: "chips", role: "group", "aria-label": title }, keys.map((k) => {
      const b = el("button", { class: "chip", "aria-pressed": "true", onclick: () => {
        if (active.has(k)) active.delete(k); else active.add(k);
        b.setAttribute("aria-pressed", String(active.has(k)));
        render();
      } }, CATS[k].icon, " ", CATS[k].label);
      chips.set(k, b);
      return b;
    }))));
  const allBtn = el("button", { class: "btn small", onclick: () => {
    const on = active.size !== ORDER.length;
    active = new Set(on ? ORDER : []);
    chips.forEach((c) => c.setAttribute("aria-pressed", String(on)));
    render();
  } }, "alle an/aus");
  const free = el("input", { type: "checkbox", onchange: (e) => { onlyFree = e.target.checked; render(); } });
  resultBox = el("div");

  /** Suche um p: ganze Stadt, fester Umkreis oder Rechteck (bounds = [s, w, n, e]). */
  async function search(p, bounds = null) {
    const id = ++searchId;
    const stale = () => id !== searchId;
    center = p;
    city = null;
    notes = [];
    items = [];
    where.value = p;
    groups.places.clearLayers();
    L.marker([p.lat, p.lon], { icon: pinIcon("●") }).addTo(groups.places);

    let bb = bounds;
    let budgetRadius = null;
    if (!bb && radius.value === "city") {
      clear(resultBox).append(spinnerLine(`Suche die Stadtgrenze um ${p.name} …`));
      city = await cityAt(p.lat, p.lon).catch(() => null);
      if (stale()) return;
      if (city) {
        bb = city.bounds;
        setBase("ÖPNVKarte");
        fitPoints([[bb[0], bb[1]], [bb[2], bb[3]]], 14);
      } else {
        notes.push(`Stadtgrenze nicht gefunden – zeige ${FALLBACK_RADIUS / 1000} km Umkreis.`);
        budgetRadius = FALLBACK_RADIUS;
      }
    } else if (!bb) {
      budgetRadius = +radius.value;
    }
    const bbText = bb ? bboxStr(bb) : bboxAround(p, budgetRadius);
    loading = true;
    render(); // Stadtgrenze und Hinweise sofort zeigen, Orte kommen nach
    resultBox.append(spinnerLine(city ? `Suche in ganz ${city.name} – kann bei großen Städten bis zu einer Minute dauern …` : bounds ? "Suche im Kartenausschnitt …" : `Suche im Umkreis von ${budgetRadius >= 1000 ? `${budgetRadius / 1000} km` : `${budgetRadius} m`} um ${p.name} …`));

    // Essen/Strom/WLAN und Parks/Aktivitäten getrennt laden: was zuerst da ist, wird schon gezeigt.
    const budgetJob = (bb ? budgetPlaces(p, 0, bbText) : budgetPlaces(p, budgetRadius))
      .catch(async (e) => {
        if (!city) throw e;
        // Große Stadt → Abfrage zu groß oder Server überlastet: Essen & Strom nur um den Punkt
        notes.push(`Essen, Strom & WLAN: Für ganz ${city.name} war die Abfrage zu groß, gezeigt wird ${FALLBACK_RADIUS / 1000} km um ${p.name}.`);
        return budgetPlaces(p, FALLBACK_RADIUS);
      })
      .then((raw) => {
        if (stale()) return;
        add(prepareBudget(raw));
      });
    const freeJob = freePlaces(p, bbText, { onLocal: (raw) => { if (!stale()) add(prepareFree(raw), true); } }).then((raw) => {
      if (stale()) return;
      add(prepareFree(raw), true);
    });
    const results = await Promise.allSettled([budgetJob, freeJob]);
    if (stale()) return;
    if (results[0].status === "rejected") notes.push(`Essen, Strom & WLAN: ${results[0].reason.message}`);
    if (results[1].status === "rejected") notes.push(`Parks & Aktivitäten: ${results[1].reason.message}`);
    loading = false;
    render(!city && !bounds);
    if (window.innerWidth <= 760) document.getElementById("panel").scrollTop = resultBox.offsetTop - 12;
  }
  let loading = false;
  function add(list, preferNew = false) {
    const ids = new Set(list.map((x) => x.id));
    // Doppelte (z. B. Einkaufszentrum mit WLAN): die Gratis-Kategorie gewinnt
    items = preferNew ? [...items.filter((x) => !ids.has(x.id)), ...list] : [...items, ...list.filter((x) => !items.some((y) => y.id === x.id))];
    loading = true;
    render();
  }

  nav.budget.open = (p) => { nav.switchTab("budget"); search(p); };

  root.append(
    el("h2", {}, TAB_NAME),
    el("p", { class: "lead" }, "Durch den Tag kommen: billig essen, Strom & WLAN, Parks und kostenlose Orte – für die ganze Stadt."),
    where.node,
    el("p", { class: "muted small", style: { margin: "-4px 0 8px" } }, "Stadt eingeben, 📍 für deinen Standort – oder einfach auf die Karte tippen. Bei „Ganze Stadt“ wechselt die Karte auf die ÖPNVKarte."),
    el("div", { class: "field" }, el("label", {}, "Gebiet"), radius),
    viewBtn,
    el("div", { style: { height: "4px" } }),
    ...chipRows,
    el("div", { class: "row", style: { alignItems: "center" } }, el("label", { class: "check small" }, free, "nur kostenlose"), el("div", { style: { flex: "0 0 auto" } }, allBtn)),
    resultBox,
    tipsSection());

  function render(fit = false) {
    if (!center) return;
    groups.places.clearLayers();
    if (city) for (const ring of city.outline) L.polyline(ring, { color: "#1b4f9c", weight: 3, dashArray: "8 6", opacity: 0.8, interactive: false }).addTo(groups.places);
    const list = items.filter((it) => active.has(it.c.cat) && (!onlyFree || it.c.free));
    L.marker([center.lat, center.lon], { icon: pinIcon("●") }).addTo(groups.places).bindPopup(plain(center.name));
    const byCat = {};
    for (const it of list) (byCat[it.c.cat] ||= []).push(it);
    if (byCat.park) byCat.park.sort((a, b) => b.ha - a.ha); // größte Parks zuerst
    const frag = [];
    if (city) frag.push(el("p", { class: "small" }, el("strong", {}, `Ganz ${city.name}`), " · Stadtgrenze gestrichelt · Karte: ÖPNVKarte"));
    for (const n of notes) frag.push(el("div", { class: "alert warn small" }, n));
    if (loading && items.length) frag.push(spinnerLine("Lade weitere Orte …"));
    const counts = ORDER.filter((k) => byCat[k]).map((k) => `${CATS[k].icon} ${byCat[k].length}`);
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
      frag.push(el("h3", {}, `${CATS[k].icon} ${CATS[k].label} (${arr.length})`), ul);
    }
    if (!list.length && !loading) frag.push(el("p", { class: "muted" }, items.length ? "Mit diesen Filtern nichts gefunden." : "Hier ist in OSM nichts eingetragen. Größeres Gebiet probieren."));
    const src = el("p", { class: "muted small" }, "Daten © OpenStreetMap-Mitwirkende");
    dataInfo().then((d) => { src.textContent = d ? `Daten © OpenStreetMap-Mitwirkende · Stand ${d.generated.slice(0, 10).split("-").reverse().join(".")}` : "Daten © OpenStreetMap-Mitwirkende · live über Overpass"; });
    frag.push(src);
    clear(resultBox).append(...frag);
    if (fit && list.length) fitPoints([[center.lat, center.lon], ...list.map((i) => [i.lat, i.lon])], 16);
  }
}
