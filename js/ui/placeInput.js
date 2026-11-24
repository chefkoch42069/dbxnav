// Ortseingabe mit Vorschlägen aus Transitous (Haltestellen zuerst) und Standort-Knopf.
import { el, toast } from "./dom.js";
import { geocode, reverseStop } from "../api/transitous.js";

export function placeInput({ label, placeholder = "Bahnhof oder Ort", value = null, onSelect, stopsOnly = false, id }) {
  let selected = value;
  let ctrl;
  let results = [];
  let active = -1;
  const input = el("input", { type: "search", placeholder, autocomplete: "off", id, value: value?.name || "", "aria-autocomplete": "list" });
  const box = el("div", { class: "suggest", hidden: true, role: "listbox" });
  const locate = el("button", { class: "icon-btn", type: "button", title: "Meinen Standort verwenden", "aria-label": "Meinen Standort verwenden" }, "📍");
  const wrap = el("div", { class: "field" }, label ? el("label", { for: id }, label) : null, el("div", { class: "row" }, input, locate), box);

  const choose = (p) => {
    selected = p;
    input.value = p.name;
    box.hidden = true;
    onSelect?.(p);
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
    if (q.length < 2) { results = []; render(); return; }
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
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter" && results.length) { choose(results[Math.max(0, active)]); e.preventDefault(); }
    else if (e.key === "Escape") box.hidden = true;
  });
  input.addEventListener("blur", () => setTimeout(() => (box.hidden = true), 150));

  locate.addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Standort wird von diesem Browser nicht unterstützt.");
    locate.textContent = "…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
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
