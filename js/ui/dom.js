// Mini-DOM-Helfer. Texte aus OSM/Fahrplan werden immer als Text gesetzt (kein innerHTML).
import { groupOf } from "../planner/departures.js";
import { lineName } from "../planner/dticket.js";

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const clear = (n) => { while (n.firstChild) n.firstChild.remove(); return n; };

let toastTimer;
export function toast(msg, ms = 3200) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/** Button während einer async-Aktion sperren und Spinner zeigen. */
export async function busy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), " ", label);
  try {
    return await fn();
  } catch (e) {
    toast(e.message || String(e), 5000);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

export function badgeFor(legOrStop) {
  const g = groupOf(legOrStop.mode);
  const name = lineName(legOrStop).replace(/\s*\(\d+\)$/, "");
  const style = legOrStop.routeColor && g !== "zug" ? { background: `#${legOrStop.routeColor}`, color: `#${legOrStop.routeTextColor || "fff"}` } : null;
  return el("span", { class: `badge ${g}`, style }, name);
}

export function spinnerLine(text) {
  return el("p", { class: "muted" }, el("span", { class: "spinner" }), " ", text);
}

export function errorLine(e) {
  return el("div", { class: "alert no" }, e.message || String(e),
    e.details?.length ? el("details", { class: "small" }, el("summary", {}, "Details"), el("ul", {}, e.details.map((d) => el("li", {}, d)))) : null);
}

// ---- Links zu bestehenden Diensten (verlinken statt neu bauen) ----
export function evaOf(stopId) {
  const m = /(?:^|:)(80\d{5})(?::|$)/.exec(stopId || "");
  return m ? m[1] : null;
}

export function direktLink(place) {
  const eva = evaOf(place.stopId);
  if (!eva) return null;
  return `https://direkt.bahn.guru/?origin=${eva}&local=true`;
}

export function bahnLink(from, to, isoTime) {
  const p = new URLSearchParams({ so: from.name, zo: to.name, kl: "2", hd: (isoTime || "").slice(0, 19), hza: "D" });
  return `https://www.bahn.de/buchung/fahrplan/suche#${p.toString()}`;
}

export function osmLink(lat, lon, zoom = 17) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

export function extLink(href, text) {
  return el("a", { href, target: "_blank", rel: "noopener" }, text);
}
