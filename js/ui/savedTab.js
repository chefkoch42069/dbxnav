// Reiter „Merkliste“ mit Unter-Reitern: Reisen, Strecken, Orte, Touren, Tagebuch, Sicherung.
import { el, clear, toast, badgeFor } from "./dom.js";
import { load, save } from "../lib/store.js";
import { summarize } from "../planner/connection.js";
import { fmtTime, fmtDuration, berlinDate } from "../lib/time.js";
import { map, focusOn } from "./map.js";
import { nav } from "./nav.js";
import { state, onChange, removeById, addJournal, exportAll, importAll, persist } from "../state.js";
import { fmtDate, todayBerlin } from "../lib/time.js";

let root;

export function initSavedTab(container) {
  root = container;
  onChange((k) => { if (["favorites", "tours", "journal", "trips", "routes"].includes(k)) render(); });
  render();
}

function render() {
  const favs = el("ul", { class: "list" }, state.favorites.map((f) =>
    el("li", {}, el("div", { class: "grow" }, el("strong", {}, f.name), el("span", { class: "muted small" }, f.kind)),
      el("button", { class: "btn small", onclick: () => focusOn(f.lat, f.lon, 14) }, "Karte"),
      el("button", { class: "btn small", onclick: () => nav.board.open(f) }, "Abfahrten"),
      el("button", { class: "btn small", title: "Verbindung hierhin", onclick: () => nav.route.open({ to: f }) }, "🔀 Hin"),
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

  const trips = el("ul", { class: "list" }, state.trips.map((t) => {
    const x = summarize(t.itinerary);
    const past = Date.parse(x.dep) < Date.now();
    return el("li", { style: past ? { opacity: 0.6 } : null },
      el("div", { class: "grow" },
        el("strong", {}, `${t.from.name} → ${t.to.name}`),
        el("span", { class: "muted small" }, `${fmtDate(berlinDate(x.dep))} · ${fmtTime(x.dep)}–${fmtTime(x.arr)} · ${fmtDuration(x.duration)} · ${x.transfers ? `${x.transfers} Umst.` : "direkt"}${past ? " · vorbei" : ""}`),
        el("span", { class: "conn-lines" }, x.lines.map((l) => badgeFor({ mode: l.mode, displayName: l.name })))),
      el("button", { class: "btn small", onclick: () => nav.route.showTrip(t) }, "Öffnen"),
      el("button", { class: "btn small", title: "Gleiche Strecke neu suchen", onclick: () => nav.route.open({ from: t.from, to: t.to }) }, "Neu suchen"),
      el("button", { class: "btn small", title: "löschen", "aria-label": "Reise löschen", onclick: () => removeById("trips", t.id) }, "✕"));
  }));
  const pastTrips = state.trips.filter((t) => Date.parse(summarize(t.itinerary).dep) < Date.now());

  const routes = el("ul", { class: "list" }, state.routes.map((r) =>
    el("li", {}, el("div", { class: "grow" }, el("strong", {}, `${r.from.name} → ${r.to.name}`)),
      el("button", { class: "btn small primary", onclick: () => nav.route.open(r) }, "Suchen"),
      el("button", { class: "btn small", title: "Rückfahrt suchen", onclick: () => nav.route.open({ from: r.to, to: r.from }) }, "⇄"),
      el("button", { class: "btn small", title: "entfernen", "aria-label": "Strecke entfernen", onclick: () => removeById("routes", r.id) }, "✕"))));

  const SECTIONS = {
    trips: [`Reisen (${state.trips.length})`, () => [
      state.trips.length ? trips : el("p", { class: "muted small" }, "Noch keine Reise gespeichert. In „Verbindung“ eine Fahrt aufklappen → „☆ Reise speichern“."),
      pastTrips.length ? el("button", { class: "btn small", onclick: () => { if (confirm(`${pastTrips.length} vergangene Reisen löschen?`)) { state.trips = state.trips.filter((t) => !pastTrips.includes(t)); persist("trips"); } } }, "Vergangene löschen") : null]],
    routes: [`Strecken (${state.routes.length})`, () => [
      el("p", { class: "muted small" }, "Standardstrecken erscheinen auch oben im Reiter „Verbindung“ – ein Klick sucht sofort."),
      state.routes.length ? routes : el("p", { class: "muted small" }, "Noch keine. In „Verbindung“ Start und Ziel wählen → „☆ Strecke merken“.")]],
    places: [`Orte (${state.favorites.length})`, () => [
      state.favorites.length ? favs : el("p", { class: "muted small" }, "Bahnhöfe, Ziele und Unterkünfte mit ☆ merken. Gemerkte Bahnhöfe stehen in „Verbindung“ als Schnellwahl.")]],
    tours: [`Touren (${state.tours.length})`, () => [state.tours.length ? tours : el("p", { class: "muted small" }, "Noch keine Tour gespeichert.")]],
    journal: ["Tagebuch", () => [journalForm, journal]],
    backup: ["Sicherung", () => [backup]],
  };
  let current = load("savedSection", "trips");
  if (!SECTIONS[current]) current = "trips";
  const body = el("div");
  const tabs = Object.entries(SECTIONS).map(([k, [label]]) => el("button", { class: "chip", "aria-pressed": String(k === current), onclick: () => { current = k; save("savedSection", k); show(); } }, label));
  const show = () => {
    tabs.forEach((b, i) => b.setAttribute("aria-pressed", String(Object.keys(SECTIONS)[i] === current)));
    clear(body).append(...SECTIONS[current][1]().filter(Boolean));
  };
  const journalForm = el("div", { class: "card" },
      el("div", { class: "row" }, el("div", { class: "field", style: { flex: "0 0 150px" } }, el("label", {}, "Datum"), jDate), el("div", { class: "field" }, el("label", {}, "Titel"), jTitle)),
      jText,
      el("button", { class: "btn primary small", style: { marginTop: "8px" }, onclick: () => {
        if (!jTitle.value.trim()) return toast("Bitte einen Titel eingeben.");
        addJournal({ date: jDate.value, title: jTitle.value.trim(), text: jText.value });
        toast("Eintrag gespeichert");
      } }, "Eintrag hinzufügen"));
  const backup = el("div", {},
    el("p", { class: "muted small" }, "Alles liegt nur in diesem Browser. Zum Umziehen aufs Handy: exportieren und dort einspielen."),
    el("div", { class: "btns" },
      el("button", { class: "btn", onclick: () => {
        const a = el("a", { href: URL.createObjectURL(new Blob([exportAll()], { type: "application/json" })), download: `reiseplaner-${todayBerlin()}.json` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, "Exportieren"),
      el("button", { class: "btn", onclick: () => file.click() }, "Einspielen"), file));
  show();
  clear(root).append(el("h2", {}, "Merkliste"), el("div", { class: "subtabs", role: "group", "aria-label": "Bereiche" }, tabs), body);
}
