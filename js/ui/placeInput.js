// Ortseingabe mit Vorschlägen aus Transitous (Haltestellen zuerst) und Standort-Knopf.
import { el, toast } from "./dom.js";
import { geocode, reverseStop } from "../api/transitous.js";
import { load, save } from "../lib/store.js";
import { state } from "../state.js";

const RECENT_KEY = "recentPlaces";
function remember(p) {
  if (!p?.name || ["Mein Standort", "Punkt auf der Karte", "Kartenausschnitt"].includes(p.name)) return;
  const list = load(RECENT_KEY, []).filter((x) => x.name !== p.name);
  list.unshift({ name: p.name, lat: p.lat, lon: p.lon, stopId: p.stopId, rail: p.rail });
  save(RECENT_KEY, list.slice(0, 8));
}

/** Vorschläge für ein leeres Feld: Zuhause, gemerkte Bahnhöfe, zuletzt benutzt. */
function quickSuggestions(stopsOnly) {
  const out = [], seen = new Set();
  const add = (p, tag) => {
    if (!p?.name || seen.has(p.name) || (stopsOnly && !p.stopId)) return;
    seen.add(p.name);
    out.push({ name: p.name, lat: p.lat, lon: p.lon, stopId: p.stopId, type: p.stopId ? "STOP" : "PLACE", rail: p.rail ?? Boolean(p.stopId), area: tag });
  };
  add(state.prefs.home, "Zuhause");
  for (const f of state.favorites) if (f.kind === "Bahnhof" || f.stopId) add(f, "gemerkt");
  for (const r of load(RECENT_KEY, [])) add(r, "zuletzt");
  return out.slice(0, 8);
}

export function placeInput({ label, placeholder = "Bahnhof oder Ort", value = null, onSelect, stopsOnly = false, snapToStop = true, id }) {
  let selected = value;
  let ctrl;
  let results = [];
  let active = -1;
  const input = el("input", { type: "search", placeholder, autocomplete: "off", id, value: value?.name || "", "aria-autocomplete": "list" });
  const box = el("div", { class: "suggest", hidden: true, role: "listbox" });
  const locate = el("button", { class: "icon-btn", type: "button", title: "Meinen Standort verwenden", "aria-label": "Meinen Standort verwenden" }, "📍");
  const wrap = el("div", { class: "field" }, label ? el("label", { for: id }, label) : null, el("div", { class: "row" }, input, locate), box);

  const choose = (p) => {
    remember(p);
    selected = p;
    input.value = p.name;
    box.hidden = true;
    box.replaceChildren();
    onSelect?.(p);
    wrap.dispatchEvent(new CustomEvent("place", { detail: p })); // für Formulare, die auf eine Auswahl reagieren
  };

  const render = () => {
    box.replaceChildren(
      ...results.map((r, i) =>
        el("button", { type: "button", role: "option", class: i === active ? "active" : null, onmousedown: (e) => { e.preventDefault(); choose(r); } },
          r.type === "STOP" ? (r.rail ? "🚉 " : "🚏 ") : "📍 ", r.name, " ", el("small", {}, [r.area, r.state].filter(Boolean).join(", ")))
      )
    );
    box.hidden = !results.length;
  };

  let timer;
  input.addEventListener("input", () => {
    selected = null;
    clearTimeout(timer);
    const q = input.value.trim();
    // Alte Vorschläge sofort weg – sonst würde ein schnelles Enter einen veralteten Treffer wählen
    results = [];
    render();
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        let r = await geocode(q, { signal: ctrl.signal });
        if (stopsOnly) r = r.filter((x) => x.type === "STOP");
        // Bahnhöfe nach oben
        r.sort((a, b) => (b.type === "STOP") - (a.type === "STOP") || b.rail - a.rail);
        results = r.slice(0, 8);
        active = -1;
        render();
      } catch (e) {
        if (e.message !== "Abgebrochen") toast(e.message);
      }
    }, 250);
  });
  input.addEventListener("keydown", async (e) => {
    // Enter, bevor die Vorschläge da sind: sofort suchen und den ersten Treffer nehmen
    if (e.key === "Enter" && (box.hidden || !results.length) && input.value.trim().length >= 2) {
      e.preventDefault();
      clearTimeout(timer);
      box.replaceChildren(el("div", { class: "muted small", style: { padding: "8px 10px" } }, el("span", { class: "spinner" }), " Suche …"));
      box.hidden = false;
      try {
        let r = await geocode(input.value.trim());
        if (stopsOnly) r = r.filter((x) => x.type === "STOP");
        r.sort((a, b) => (b.type === "STOP") - (a.type === "STOP") || b.rail - a.rail);
        if (r[0]) choose(r[0]); else { box.hidden = true; toast("Nichts gefunden."); }
      } catch (err) { box.hidden = true; toast(err.message); }
      return;
    }
    if (box.hidden) return;
    if (e.key === "ArrowDown") { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter" && results.length) { choose(results[Math.max(0, active)]); e.preventDefault(); }
    else if (e.key === "Escape") box.hidden = true;
  });
  input.addEventListener("blur", () => setTimeout(() => (box.hidden = true), 150));
  // Leeres Feld antippen: sofort Zuhause, gemerkte und zuletzt benutzte Orte anbieten
  const showQuick = () => {
    if (input.value.trim()) return;
    results = quickSuggestions(stopsOnly);
    active = -1;
    render();
  };
  input.addEventListener("focus", showQuick);
  input.addEventListener("input", () => { if (!input.value.trim()) showQuick(); });

  locate.addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Standort wird von diesem Browser nicht unterstützt.");
    locate.textContent = "…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const here = { name: "Mein Standort", lat: pos.coords.latitude, lon: pos.coords.longitude };
        if (!snapToStop) { locate.textContent = "📍"; return choose(here); }
        try {
          const s = await reverseStop(pos.coords.latitude, pos.coords.longitude);
          choose(s || { name: "Mein Standort", lat: pos.coords.latitude, lon: pos.coords.longitude });
        } catch {
          choose({ name: "Mein Standort", lat: pos.coords.latitude, lon: pos.coords.longitude });
        } finally {
          locate.textContent = "📍";
        }
      },
      () => { locate.textContent = "📍"; toast("Standort nicht verfügbar."); },
      { timeout: 10000, maximumAge: 60000 }
    );
  });

  return {
    node: wrap,
    get value() { return selected; },
    set value(p) { selected = p; input.value = p?.name || ""; },
    focus: () => input.focus(),
  };
}
