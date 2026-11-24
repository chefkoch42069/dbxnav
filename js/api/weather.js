// Wetter am Etappenort – Daten des DWD über Bright Sky (https://brightsky.dev).
import { WEATHER } from "../config.js";
import { getJSON } from "./http.js";
import { addDays } from "../lib/time.js";

const ICONS = {
  "clear-day": "☀️", "clear-night": "🌙", "partly-cloudy-day": "⛅", "partly-cloudy-night": "☁️",
  cloudy: "☁️", fog: "🌫️", wind: "💨", rain: "🌧️", sleet: "🌨️", snow: "❄️", hail: "🌨️", thunderstorm: "⛈️",
};

export function summarizeDay(hours) {
  const day = hours.filter((h) => {
    const hr = new Date(h.timestamp).getUTCHours();
    return hr >= 6 && hr <= 19;
  });
  const src = day.length ? day : hours;
  if (!src.length) return null;
  const temps = src.map((h) => h.temperature).filter((t) => t != null);
  const rain = src.reduce((s, h) => s + (h.precipitation || 0), 0);
  const counts = {};
  for (const h of src) if (h.icon) counts[h.icon] = (counts[h.icon] || 0) + 1;
  const icon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    min: temps.length ? Math.round(Math.min(...temps)) : null,
    max: temps.length ? Math.round(Math.max(...temps)) : null,
    rainMm: Math.round(rain * 10) / 10,
    icon, emoji: ICONS[icon] || "🌡️",
  };
}

export async function forecast(place, date) {
  const url = `${WEATHER.brightSky}/weather?lat=${place.lat}&lon=${place.lon}&date=${date}&last_date=${addDays(date, 1)}&tz=Europe/Berlin`;
  const res = await getJSON(url, { timeout: 15000 });
  return summarizeDay(res?.weather || []);
}
