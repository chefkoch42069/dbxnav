// Suchlinks zu Buchungsseiten: Ort, Datum, Personen und Preisgrenze schon ausgefüllt.
// Preise selbst holt die App nicht (keine freien Schnittstellen, Auslesen der Seiten ist dort verboten).

/** „Koblenz Hbf“, „Frankfurt (Main) Hbf“, „Köln Messe/Deutz“ → Ortsname für die Suche. */
export function cityName(name) {
  return String(name || "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+(Hbf|Hauptbahnhof|Bahnhof|Bf|ZOB|Busbahnhof)\b.*$/i, "")
    .replace(/\s+(Süd|Nord|Ost|West|Mitte|Zentrum|Stadtmitte|Messe\/Deutz|Messe)$/i, "")
    .replace(/,.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Hostelworld nutzt englische Namen für einige Städte, sonst Umlaute ohne „e“ (Würzburg → wurzburg).
const HW_NAMES = { münchen: "munich", köln: "cologne", nürnberg: "nuremberg", "frankfurt am main": "frankfurt", frankfurt: "frankfurt" };
export function hostelworldSlug(city) {
  const c = city.toLowerCase().trim();
  if (HW_NAMES[c]) return HW_NAMES[c];
  return c.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const nightsBetween = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));

/**
 * @param place {name}  @param o {checkin, checkout (JJJJ-MM-TT), adults, maxPrice (€ pro Nacht)}
 * @returns {{budget: Link[], rentals: Link[], city: string}}  Link = {label, site, url, note}
 */
export function bookingLinks(place, { checkin, checkout, adults = 1, maxPrice = 50 }) {
  const city = cityName(place.name);
  const q = encodeURIComponent(city);
  const n = nightsBetween(checkin, checkout);
  const bk = (filters) => `https://www.booking.com/searchresults.de.html?ss=${q}&checkin=${checkin}&checkout=${checkout}` +
    `&group_adults=${adults}&no_rooms=1&group_children=0&order=price&nflt=${encodeURIComponent(filters)}`;
  const price = `price=EUR-min-${maxPrice}-1`; // Booking: Preis pro Nacht
  const ab = (roomType) => `https://www.airbnb.de/s/${q}/homes?checkin=${checkin}&checkout=${checkout}&adults=${adults}` +
    `&price_max=${maxPrice}${roomType ? `&room_types%5B%5D=${encodeURIComponent(roomType)}` : ""}`;

  return {
    city,
    budget: [
      { site: "Booking.com", label: "Hostels, Motels & Pensionen", url: bk(`ht_id=203;ht_id=205;ht_id=216;${price}`), note: `bis ${maxPrice} €/Nacht, billigste zuerst` },
      { site: "Booking.com", label: "Alle Unterkünfte", url: bk(price), note: `bis ${maxPrice} €/Nacht, billigste zuerst` },
      { site: "Hostelworld", label: "Hostels", url: `https://www.hostelworld.com/hostels/europe/germany/${hostelworldSlug(city)}/`, note: "Fehlerseite = dort keine Hostels" },
      { site: "Airbnb", label: "Privatzimmer", url: ab("Private room"), note: `oft am billigsten, bis ${maxPrice} €/Nacht + Gebühren` },
      { site: "Jugendherberge (DJH)", label: "Jugendherbergen", url: `https://www.jugendherberge.de/suche/?q=${q}`, note: "DJH-Mitgliedschaft nötig (Jahresbeitrag)" },
      { site: "Kayak", label: "Preisvergleich", url: `https://www.kayak.de/hotels/${q}/${checkin}/${checkout}/${adults}adults`, note: "vergleicht viele Seiten – dort nach Preis sortieren" },
    ],
    rentals: [
      { site: "Airbnb", label: "Ganze Wohnung", url: ab("Entire home/apt"), note: `bis ${maxPrice} €/Nacht + Gebühren` },
      { site: "Booking.com", label: "Ferienwohnungen & -häuser", url: bk(`ht_id=201;ht_id=220;${price}`), note: `bis ${maxPrice} €/Nacht, billigste zuerst` },
      { site: "Airbnb", label: "Alle Unterkünfte", url: ab(null), note: n > 1 ? `${n} Nächte – Wochen-/Mehrtagesrabatte möglich` : "ohne Zimmertyp-Filter" },
    ],
  };
}
