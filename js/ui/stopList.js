// Liste von Zielen/Zwischenstopps mit Reihenfolge, Entfernen und einem Auswahlfeld je Eintrag
// (Nächte oder Aufenthalt). Vorher in Planen, International und Verbindung je einmal kopiert.
import { el, toast } from "./dom.js";

/**
 * @param field    Name des Feldes je Eintrag, z. B. "nights" oder "stayMin"
 * @param makeSelect (wert, onChange) → <select>
 * @param initial  Startwert für neue Einträge (Zahl oder Funktion)
 * @param empty    Text, wenn die Liste leer ist
 * @param onChange wird nach jeder Änderung aufgerufen (z. B. speichern)
 */
export function stopList({ field, makeSelect, initial, empty, items = [], onChange = () => {} }) {
  const node = el("ul", { class: "list" });
  let list = items;
  const render = () => {
    node.replaceChildren(...list.map((s, i) => {
      const sel = makeSelect(s[field], (v) => { s[field] = v; onChange(list); });
      sel.setAttribute("aria-label", `${field === "nights" ? "Nächte" : "Aufenthalt"} in ${s.place.name}`);
      return el("li", {},
        el("div", { class: "grow" }, el("strong", {}, `${i + 1}. ${s.place.name}`)),
        sel,
        el("button", { class: "btn small", title: "nach oben", "aria-label": `${s.place.name} nach oben`, disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); } }, "↑"),
        el("button", { class: "btn small", title: "entfernen", "aria-label": `${s.place.name} entfernen`, onclick: () => { list.splice(i, 1); changed(); } }, "✕"));
    }));
    if (!list.length) node.append(el("li", { class: "muted small" }, empty));
  };
  const changed = () => { render(); onChange(list); };
  render();
  return {
    node,
    get items() { return list; },
    set(items) { list = items; changed(); },
    add(place, { silent = false } = {}) {
      list.push({ place, [field]: typeof initial === "function" ? initial() : initial });
      changed();
      if (!silent) toast(`${place.name} hinzugefügt`);
    },
    copy: () => list.map((x) => ({ ...x })),
  };
}
