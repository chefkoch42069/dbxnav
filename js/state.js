// Gemeinsamer Zustand: Merkliste, Touren, Tagebuch, Sammler. Alles lokal im Browser.
import { load, save, uid } from "./lib/store.js";

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (what) => listeners.forEach((fn) => fn(what));

export const state = {
  favorites: load("favorites", []),
  tours: load("tours", []),
  journal: load("journal", []),
  collector: load("collector", { legs: [], manualStates: {} }),
  prefs: load("prefs", { home: null, baseLayer: null, maxHours: 6, departTime: "08:00" }),
};

export function persist(key) {
  save(key, state[key]);
  emit(key);
}

export function setPref(k, v) {
  state.prefs[k] = v;
  persist("prefs");
}

export function addFavorite(place, kind = "Ort") {
  if (state.favorites.some((f) => f.name === place.name && Math.abs(f.lat - place.lat) < 1e-3)) return false;
  state.favorites.unshift({ id: uid(), name: place.name, lat: place.lat, lon: place.lon, stopId: place.stopId, kind, added: new Date().toISOString() });
  persist("favorites");
  return true;
}

export function removeById(key, id) {
  const coll = key === "legs" ? state.collector.legs : state[key];
  const i = coll.findIndex((x) => x.id === id);
  if (i >= 0) coll.splice(i, 1);
  persist(key === "legs" ? "collector" : key);
}

export function saveTour(tour) {
  const i = state.tours.findIndex((t) => t.id === tour.id);
  if (i >= 0) state.tours[i] = tour; else state.tours.unshift(tour);
  persist("tours");
}

export function addJournal(entry) {
  state.journal.unshift({ id: uid(), date: entry.date, title: entry.title, text: entry.text || "", tourId: entry.tourId });
  state.journal.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  persist("journal");
}

export function exportAll() {
  return JSON.stringify({ version: 1, exported: new Date().toISOString(), favorites: state.favorites, tours: state.tours, journal: state.journal, collector: state.collector }, null, 1);
}

export function importAll(json) {
  const d = JSON.parse(json);
  for (const k of ["favorites", "tours", "journal", "collector"]) if (d[k]) { state[k] = d[k]; persist(k); }
}
