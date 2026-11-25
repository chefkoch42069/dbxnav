// Einstieg: Karte, Reiter, Service Worker.
import { initMap, map, groups } from "./ui/map.js";
import { nav } from "./ui/nav.js";
import { initPlanTab } from "./ui/planTab.js";
import { initBoardTab } from "./ui/boardTab.js";
import { initCollectTab } from "./ui/collectTab.js";
import { initBudgetTab } from "./ui/budgetTab.js";
import { initSavedTab } from "./ui/savedTab.js";
import { initCityTab } from "./ui/cityTab.js";
import { initYoutuberTab } from "./ui/youtuberTab.js";
import { initTransitClick } from "./ui/transitClick.js";
import { registerSW } from "./offline.js";
import { loadStates } from "./ui/statesData.js";

initMap();

const panel = document.getElementById("panel");
const tabs = [...document.querySelectorAll(".tabs button")];
const moreBtn = document.getElementById("moreBtn");
const moreMenu = document.getElementById("moreMenu");
const menuItems = [...moreMenu.querySelectorAll("[data-tab]")];

function switchTab(name) {
  tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  menuItems.forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === name)));
  moreBtn.classList.toggle("active", menuItems.some((b) => b.dataset.tab === name)); // Merkliste/Sammler offen
  document.querySelectorAll("[data-panel]").forEach((s) => (s.hidden = s.dataset.panel !== name));
  if (name === "collect") groups.collector.addTo(map); else groups.collector.remove();
  panel.classList.remove("collapsed");
  panel.scrollTop = 0;
}
nav.switchTab = switchTab;
tabs.forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

// Runder Knopf links: Menü mit Merkliste und Sammler
const setMenu = (open) => { moreMenu.hidden = !open; moreBtn.setAttribute("aria-expanded", String(open)); };
moreBtn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(moreMenu.hidden); });
menuItems.forEach((b) => b.addEventListener("click", () => { setMenu(false); switchTab(b.dataset.tab); }));
document.addEventListener("click", (e) => { if (!moreMenu.hidden && !e.target.closest(".more")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !moreMenu.hidden) { setMenu(false); moreBtn.focus(); } });
document.getElementById("panelGrip").addEventListener("click", () => panel.classList.toggle("collapsed"));

initPlanTab(document.getElementById("tab-plan"));
initBoardTab(document.getElementById("tab-board"));
initCityTab(document.getElementById("tab-city"));
initBudgetTab(document.getElementById("tab-budget"));
initYoutuberTab(document.getElementById("tab-youtuber"));
initCollectTab(document.getElementById("tab-collect"));
initSavedTab(document.getElementById("tab-saved"));

// Homeless-Modus und YouTuber sind Zusatzmodi im Stadt-Reiter: ihre Bereiche dorthin hängen
for (const [key, id] of [["homeless", "tab-budget"], ["youtuber", "tab-youtuber"]]) {
  const section = document.getElementById(id);
  section.removeAttribute("data-panel"); // nicht mehr von switchTab ein-/ausblenden
  nav.city.attachAddon(key, section);
}

// Klick auf die ÖPNVKarte: Haltestellen-Infos – außer wenn der Homeless-Modus sichtbar ist (nutzt Klicks selbst)
initTransitClick({ isActive: () => Boolean(document.getElementById("tab-budget").closest("[hidden]")) });

loadStates().catch(() => {});
registerSW();
