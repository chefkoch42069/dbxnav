// Darstellung: Hell / Nachtfahrplan / automatisch, Sonnenmodus (hoher Kontrast), Webfont und „ruhig“ (keine Animation).
// Gespeichert in den Einstellungen; gesetzt als Attribute/Klassen auf <html>, das Stylesheet macht den Rest.
import { state, setPref } from "../state.js";

const root = document.documentElement;

/** Datensparen: Browser-Einstellung „Save-Data“ (Chrome/Android). */
const saveData = () => Boolean(navigator.connection?.saveData);
const homelessOn = () => Boolean(state.prefs.addons?.homeless);

/** Einstellungen auf <html> anwenden. Ohne Argumente: aktuellen Stand neu anwenden (z. B. nach Zusatzmodus-Wechsel). */
export function applyDisplay() {
  const theme = state.prefs.theme || "auto";
  if (theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
  if (state.prefs.contrast === "high") root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
  // Schrift nur, wenn Daten und Akku keine Rolle spielen; „optional“ blockiert ohnehin nie die Anzeige
  root.classList.toggle("webfont", !saveData() && !homelessOn());
  // Homeless-Modus: keine Animationen (Akku)
  root.classList.toggle("calm", homelessOn() || saveData());
}

/** Darstellungs-Knöpfe im ☰-Menü verdrahten. */
export function initDisplay(menu) {
  const themeBtns = [...menu.querySelectorAll("[data-theme-choice]")];
  const contrastBtn = menu.querySelector("[data-contrast-toggle]");
  const sync = () => {
    const theme = state.prefs.theme || "auto";
    themeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === theme)));
    contrastBtn?.setAttribute("aria-pressed", String(state.prefs.contrast === "high"));
  };
  themeBtns.forEach((b) => b.addEventListener("click", () => { setPref("theme", b.dataset.themeChoice); applyDisplay(); sync(); }));
  contrastBtn?.addEventListener("click", () => { setPref("contrast", state.prefs.contrast === "high" ? "normal" : "high"); applyDisplay(); sync(); });
  applyDisplay();
  sync();
}
