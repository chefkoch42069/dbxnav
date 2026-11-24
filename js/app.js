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
function switchTab(name) {
  tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll("[data-panel]").forEach((s) => (s.hidden = s.dataset.panel !== name));
  if (name === "collect") groups.collector.addTo(map); else groups.collector.remove();
  panel.classList.remove("collapsed");
  panel.scrollTop = 0;
}
nav.switchTab = switchTab;
tabs.forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
document.getElementById("panelGrip").addEventListener("click", () => panel.classList.toggle("collapsed"));

initPlanTab(document.getElementById("tab-plan"));
initBoardTab(document.getElementById("tab-board"));
initCityTab(document.getElementById("tab-city"));
initBudgetTab(document.getElementById("tab-budget"));
initYoutuberTab(document.getElementById("tab-youtuber"));
initCollectTab(document.getElementById("tab-collect"));
initSavedTab(document.getElementById("tab-saved"));

// Klick auf die ÖPNVKarte: Haltestellen-Infos – außer im Homeless-Modus, der Klicks selbst nutzt
initTransitClick({ isActive: () => document.getElementById("tab-budget").hidden });

loadStates().catch(() => {});
registerSW();
