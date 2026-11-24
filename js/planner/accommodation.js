// Unterkünfte aus OSM: Preis grob einschätzen (OSM hat selten Preise).
import { APP } from "../config.js";

const BUDGET_BRANDS = /(b&b hotel|ibis budget|a&o|a ?& ?o hostel|meininger|premi[eè]re classe|jugendherberge|djh|hostel|motel one)/i;

export function parsePrice(tags) {
  for (const k of ["price", "charge", "fee:amount", "price:room", "price:bed", "charge:room"]) {
    const v = tags[k];
    if (!v) continue;
    const m = String(v).replace(",", ".").match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

/** @returns {{rating:'likely'|'maybe'|'unlikely', reason:string, price:number|null}} */
export function estimatePrice(tags, max = APP.maxPricePerNight) {
  const price = parsePrice(tags);
  if (price != null) return price <= max ? { rating: "likely", reason: `Preis in OSM: ${price} €`, price } : { rating: "unlikely", reason: `Preis in OSM: ${price} €`, price };
  const t = tags.tourism;
  const stars = parseFloat(tags.stars);
  const brand = `${tags.brand || ""} ${tags.name || ""}`;
  if (t === "hostel" || t === "camp_site" || t === "alpine_hut" || t === "wilderness_hut") return { rating: "likely", reason: "Hostel/Camping – meist unter 50 €", price };
  if (BUDGET_BRANDS.test(brand) && !/motel one/i.test(brand)) return { rating: "likely", reason: "Budget-Kette", price };
  if (stars >= 4) return { rating: "unlikely", reason: `${stars} Sterne`, price };
  if (t === "guest_house" || t === "motel") return { rating: "maybe", reason: "Pension – oft um 50 €", price };
  if (stars === 3) return { rating: "maybe", reason: "3 Sterne – eher knapp", price };
  if (t === "apartment" || t === "chalet") return { rating: "maybe", reason: "Ferienwohnung – oft Mindestaufenthalt", price };
  return { rating: "maybe", reason: "kein Preis bekannt", price };
}

export const ratingOrder = { likely: 0, maybe: 1, unlikely: 2 };

export const TYPE_LABEL = {
  hotel: "Hotel", hostel: "Hostel", guest_house: "Pension", motel: "Motel", apartment: "Ferienwohnung",
  camp_site: "Camping", alpine_hut: "Hütte", chalet: "Ferienhaus", wilderness_hut: "Hütte",
};
