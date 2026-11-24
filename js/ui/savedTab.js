// Reiter „Merkliste“: Favoriten, gespeicherte Touren, Reisetagebuch, Sicherung.
import { el, clear, toast } from "./dom.js";
import { map, focusOn } from "./map.js";
import { nav } from "./nav.js";
import { state, onChange, removeById, addJournal, exportAll, importAll, persist } from "../state.js";
import { fmtDate, todayBerlin } from "../lib/time.js";

let root;

export function initSavedTab(container) {
  root = container;
  onChange((k) => { if (["favorites", "tours", "journal"].includes(k)) render(); });
  render();
}

function render() {
  const favs = el("ul", { class: "list" }, state.favorites.map((f) =>
    el("li", {}, el("div", { class: "grow" }, el("strong", {}, f.name), el("span", { class: "muted small" }, f.kind)),
      el("button", { class: "btn small", onclick: () => focusOn(f.lat, f.lon, 14) }, "Karte"),
      el("button", { class: "btn small", onclick: () => nav.board.open(f) }, "Abfahrten"),
      el("button", { class: "btn small", onclick: () => { nav.plan.addStop(f); nav.switchTab("plan"); } }, "+ Tour"),
      el("button", { class: "btn small", title: "entfernen", onclick: () => removeById("favorites", f.id) }, "✕"))));

  const tours = el("ul", { class: "list" }, state.tours.map((t) =>
    el("li", {}, el("div", { class: "grow" }, el("strong", {}, t.name), el("span", { class: "muted small" }, `${fmtDate(t.params.startDate)} · ${t.days.length} Tage`)),
      el("button", { class: "btn small", onclick: () => { if (t.kind === "interrail") nav.interrail.openTour(t); else { nav.switchTab("plan"); nav.plan.openTour(t); } } }, "Öffnen"),
      el("button", { class: "btn small", title: "löschen", onclick: () => confirm(`„${t.name}“ löschen?`) && removeById("tours", t.id) }, "✕"))));

  const jDate = el("input", { type: "date", value: todayBerlin() });
  const jTitle = el("input", { type: "text", placeholder: "Titel, z. B. Saaletal-Runde" });
  const jText = el("textarea", { placeholder: "Was war schön? Was merken fürs nächste Mal?" });
  const journal = el("div", {}, state.journal.map((j) => {
    const text = el("textarea", { "aria-label": "Notiz" }, j.text);
    text.onchange = () => { j.text = text.value; persist("journal"); toast("Gespeichert"); };
    return el("div", { class: "card" },
      el("div", { class: "row", style: { alignItems: "center" } }, el("h4", { style: { margin: 0 } }, `${j.date ? fmtDate(j.date) : ""} · ${j.title}`),
        el("button", { class: "btn small", style: { flex: "0 0 auto" }, onclick: () => confirm("Eintrag löschen?") && removeById("journal", j.id) }, "✕")),
      text);
  }));

  const file = el("input", { type: "file", accept: "application/json", hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { importAll(await f.text()); toast("Sicherung eingespielt"); } catch { toast("Datei konnte nicht gelesen werden."); }
  } });

  clear(root).append(
    el("h2", {}, "Merkliste"),
    el("h3", {}, `Favoriten (${state.favorites.length})`),
    state.favorites.length ? favs : el("p", { class: "muted small" }, "Bahnhöfe, Ziele und Unterkünfte mit ☆ merken."),
    el("h3", {}, `Gespeicherte Touren (${state.tours.length})`),
    state.tours.length ? tours : el("p", { class: "muted small" }, "Noch keine Tour gespeichert."),
    el("h3", {}, "Reisetagebuch"),
    el("div", { class: "card" },
      el("div", { class: "row" }, el("div", { class: "field", style: { flex: "0 0 150px" } }, el("label", {}, "Datum"), jDate), el("div", { class: "field" }, el("label", {}, "Titel"), jTitle)),
      jText,
      el("button", { class: "btn primary small", style: { marginTop: "8px" }, onclick: () => {
        if (!jTitle.value.trim()) return toast("Bitte einen Titel eingeben.");
        addJournal({ date: jDate.value, title: jTitle.value.trim(), text: jText.value });
        toast("Eintrag gespeichert");
      } }, "Eintrag hinzufügen")),
    journal,
    el("hr"),
    el("h3", {}, "Sicherung"),
    el("p", { class: "muted small" }, "Alles liegt nur in diesem Browser. Zum Umziehen aufs Handy: exportieren und dort einspielen."),
    el("div", { class: "btns" },
      el("button", { class: "btn", onclick: () => {
        const a = el("a", { href: URL.createObjectURL(new Blob([exportAll()], { type: "application/json" })), download: `reiseplaner-${todayBerlin()}.json` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, "Exportieren"),
      el("button", { class: "btn", onclick: () => file.click() }, "Einspielen"), file));
}
