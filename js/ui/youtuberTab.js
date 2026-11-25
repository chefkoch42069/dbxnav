// Reiter „YouTuber-Modus“: Karten öffentlicher Infrastruktur und Drehorte im Kartenausschnitt –
// Bahn (Strecken, Tempo, Signale, Oberleitung), Wasserstraßen, Strom, Brücken, Tunnel, Türme, Lost Places.
import { el, clear, toast, spinnerLine, errorLine, extLink, osmLink } from "./dom.js";
import { map, groups, focusOn, setBase, emojiIcon } from "./map.js";
import { nav } from "./nav.js";
import { addFavorite } from "../state.js";
import { INFRA_LAYERS } from "../config.js";
import { infraPlaces } from "../api/overpass.js";
import { reverseStop } from "../api/transitous.js";
import { INFRA_CATS, classifyInfra, infraTitle, mergeSegments, maxKv } from "../planner/infra.js";
import { distanceKm } from "../lib/geo.js";

const MIN_ZOOM = 12; // Punkte
const LINE_ZOOM = 13; // Leitungen und stillgelegte Strecken (viele Daten)
const ORDER = Object.keys(INFRA_CATS);
const layers = {};
let active = new Set(ORDER);
let items = [];
let lines = [];
let resultBox;

const wikiLink = (w) => {
  const m = /^([a-z-]+):(.+)$/.exec(w || "");
  return m ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].replace(/ /g, "_"))}` : null;
};

export function initYoutuberTab(root) {
  // zIndex über der Grundkarte, auch wenn die Grundkarte später gewechselt wird
  for (const [name, cfg] of Object.entries(INFRA_LAYERS)) layers[name] = L.tileLayer(cfg.url, { zIndex: 10, ...cfg.options });
  const toggles = Object.keys(layers).map((name) => {
    const cb = el("input", { type: "checkbox", onchange: (e) => (e.target.checked ? layers[name].addTo(map) : layers[name].remove()) });
    map.on("layeradd layerremove", () => { cb.checked = map.hasLayer(layers[name]); });
    return el("label", { class: "check small" }, cb, name);
  });

  const searchBtn = el("button", { class: "btn primary block" });
  const updateBtn = () => {
    const ok = map.getZoom() >= MIN_ZOOM;
    searchBtn.disabled = !ok;
    searchBtn.textContent = ok ? "Infrastruktur im Kartenausschnitt suchen" : "Zum Suchen näher heranzoomen";
  };
  map.on("zoomend", updateBtn);
  updateBtn();
  searchBtn.onclick = () => search();

  const chips = ORDER.map((k) => el("button", { class: "chip", "aria-pressed": "true", onclick: (e) => {
    if (active.has(k)) active.delete(k); else active.add(k);
    e.currentTarget.setAttribute("aria-pressed", String(active.has(k)));
    render();
  } }, INFRA_CATS[k].icon, " ", INFRA_CATS[k].label));
  resultBox = el("div");

  root.append(
    el("h2", {}, "YouTuber-Modus"),
    el("p", { class: "lead" }, "Öffentliche Infrastruktur auf der Karte: für Drehorte, Recherche und Hintergrundwissen."),
    el("h3", {}, "Infrastruktur-Karten"),
    el("div", { class: "infra-toggles" }, toggles),
    el("div", { class: "btns", style: { margin: "6px 0 10px" } },
      el("button", { class: "btn small", onclick: () => setBase("ÖPNVKarte") }, "ÖPNVKarte als Grundkarte"),
      el("button", { class: "btn small", onclick: () => { Object.values(layers).forEach((l) => l.remove()); } }, "Alle Karten aus")),
    el("h3", {}, "Drehorte & Bauwerke"),
    el("p", { class: "muted small" }, `Kraftwerke, Umspannwerke, Windräder, Brücken, Tunnel, Staudämme, Schleusen, Türme, Stellwerke, Drehscheiben, Bunker und verlassene Bahnhöfe aus OpenStreetMap. Ab Zoom ${LINE_ZOOM} auch Hochspannungsleitungen und stillgelegte Bahnstrecken.`),
    searchBtn,
    el("div", { class: "chips", role: "group", "aria-label": "Kategorien", style: { marginTop: "8px" } }, chips),
    resultBox,
    el("details", { class: "tips" }, el("summary", {}, "⚠️ Recht & Sicherheit beim Drehen"),
      el("ul", { class: "small" },
        el("li", {}, "Bahnanlagen und Gleise nie betreten: Lebensgefahr (Oberleitung 15.000 V, auch ohne Berührung) und Ordnungswidrigkeit. Gefilmt wird von öffentlichen Wegen und Bahnsteigen."),
        el("li", {}, "Auf DB-Bahnhöfen ist privates Filmen für den Eigenbedarf meist ok, kommerzielle Drehs brauchen eine Genehmigung der DB."),
        el("li", {}, ["Drohnen: Über Bahnanlagen, Kraftwerken, Umspannwerken, Industrieanlagen und Wasserstraßen gelten Flugverbotszonen. Vorher auf ", extLink("https://maptool-dipul.dfs.de/", "dipul.de"), " prüfen."]),
        el("li", {}, "Lost Places sind fast immer Privatgelände: Betreten ohne Erlaubnis ist Hausfriedensbruch, dazu Einsturzgefahr. Eigentümer fragen."),
        el("li", {}, "Kraftwerke, Umspannwerke und Bundeswehr-Gelände: Fotografieren von außen ist meist erlaubt, Absperrungen und Schilder beachten."))));

  async function search() {
    const b = map.getBounds().pad(-0.02);
    const center = map.getCenter();
    const withLines = map.getZoom() >= LINE_ZOOM;
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(5)).join(",");
    searchBtn.disabled = true;
    clear(resultBox).append(spinnerLine("Frage OpenStreetMap ab …"));
    try {
      const res = await infraPlaces({ lat: center.lat, lon: center.lng }, bbox, { withLines });
      const raw = res.points.map((e) => { const c = classifyInfra(e.tags); return c ? { ...e, ...c, title: infraTitle(e.tags, c.kind) } : null; }).filter(Boolean);
      items = mergeSegments(raw, distanceKm);
      lines = res.lines.map((l) => ({ ...l, info: classifyInfra(l.tags) })).filter((l) => l.info);
      render();
    } catch (e) {
      clear(resultBox).append(errorLine(e));
    } finally {
      updateBtn();
    }
  }
}

function popup(it) {
  const w = wikiLink(it.tags.wikipedia);
  const stopBtn = el("button", { class: "btn small" }, "Nächste Haltestelle");
  stopBtn.onclick = async () => {
    stopBtn.disabled = true;
    const s = await reverseStop(it.lat, it.lon).catch(() => null);
    if (!s) { toast("Keine Haltestelle gefunden"); stopBtn.disabled = false; return; }
    map.closePopup();
    nav.board.open(s);
  };
  return el("div", { style: { minWidth: "200px" } },
    el("strong", {}, `${INFRA_CATS[it.cat].icon} ${it.title}`), el("br"),
    el("span", { class: "muted small" }, it.kind), it.parts > 1 ? el("span", { class: "muted small" }, ` · ${it.parts} Abschnitte`) : null,
    it.facts.length ? [el("br"), it.facts.join(" · ")] : null,
    it.tags.description ? [el("br"), el("span", { class: "small" }, it.tags.description)] : null,
    el("div", { class: "btns", style: { marginTop: "6px" } },
      stopBtn,
      el("button", { class: "btn small", onclick: () => toast(addFavorite({ name: it.title, lat: it.lat, lon: it.lon }, "Drehort") ? "Gemerkt" : "Schon gemerkt") }, "☆ Merken")),
    el("div", { class: "small", style: { marginTop: "4px" } },
      extLink(osmLink(it.lat, it.lon, 18), "OSM"),
      w ? [" · ", extLink(w, "Wikipedia")] : null,
      it.tags.website ? [" · ", extLink(it.tags.website, "Web")] : null));
}

function lineStyle(l) {
  if (l.info.cat === "power") {
    const kv = maxKv(l.tags.voltage);
    return { color: kv >= 220 ? "#c62828" : kv >= 110 ? "#ef6c00" : "#8d6e63", weight: kv >= 220 ? 3 : 2, opacity: 0.85 };
  }
  return { color: "#6d4c41", weight: 3, dashArray: "6 6", opacity: 0.85 }; // stillgelegte Bahn
}

function render() {
  groups.infra.clearLayers();
  for (const l of lines) {
    if (!active.has(l.info.cat)) continue;
    L.polyline(l.coords, lineStyle(l))
      .bindTooltip([l.tags.name, l.info.kind, ...l.info.facts].filter(Boolean).join(" · "), { sticky: true })
      .addTo(groups.infra);
  }
  const list = items.filter((it) => active.has(it.cat));
  const markers = new Map();
  for (const it of list) {
    const m = L.marker([it.lat, it.lon], {
      icon: emojiIcon(INFRA_CATS[it.cat].icon, 20),
      title: it.title,
    }).bindPopup(() => popup(it));
    m.addTo(groups.infra);
    markers.set(it, m);
  }
  const byCat = {};
  for (const it of list) (byCat[it.cat] ||= []).push(it);
  const lineCount = (cat) => lines.filter((l) => l.info.cat === cat && active.has(cat)).length;
  const frag = [el("p", { class: "muted small" },
    ORDER.filter((k) => byCat[k] || lineCount(k)).map((k) => `${INFRA_CATS[k].icon} ${(byCat[k] || []).length}${lineCount(k) ? ` + ${lineCount(k)} Linien` : ""}`).join("  ") || "Hier ist nichts davon in OSM eingetragen.")];
  if (lines.some((l) => l.info.cat === "power")) frag.push(el("p", { class: "small" }, "Leitungen: ", el("span", { style: { color: "#c62828", fontWeight: 700 } }, "━ 220/380 kV"), "  ", el("span", { style: { color: "#ef6c00", fontWeight: 700 } }, "━ 110 kV"), "  ", el("span", { style: { color: "#8d6e63", fontWeight: 700 } }, "━ darunter"), "  ", el("span", { style: { color: "#6d4c41" } }, "┅ stillgelegte Bahn")));
  for (const k of ORDER) {
    const arr = byCat[k];
    if (!arr) continue;
    // Benannte zuerst – die sind für Recherche und Titel interessanter
    arr.sort((a, b) => (Boolean(b.tags.name) - Boolean(a.tags.name)) || a.dist - b.dist);
    frag.push(el("details", { open: arr.length <= 8 },
      el("summary", {}, `${INFRA_CATS[k].icon} ${INFRA_CATS[k].label} (${arr.length})`),
      el("ul", { class: "list" }, arr.slice(0, 30).map((it) => el("li", {},
        el("div", { class: "grow" }, el("strong", {}, it.title),
          el("span", { class: "muted small" }, [it.kind !== it.title ? it.kind : null, ...it.facts, `${it.dist.toFixed(1)} km`].filter(Boolean).join(" · "))),
        el("button", { class: "btn small", onclick: () => { focusOn(it.lat, it.lon, 17); markers.get(it)?.openPopup(); } }, "Karte"))))));
  }
  frag.push(el("p", { class: "muted small" }, "Daten © OpenStreetMap-Mitwirkende"));
  clear(resultBox).append(...frag);
}
