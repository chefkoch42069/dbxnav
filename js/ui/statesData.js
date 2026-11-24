// Umrisse (Natural Earth, gemeinfrei; vereinfacht): Bundesländer und europäische Länder.
const cache = {};
function load(file) {
  cache[file] ||= fetch(`data/${file}`).then((r) => r.json()).catch((e) => { delete cache[file]; throw e; });
  return cache[file];
}
let data = null;
export function loadStates() {
  return load("bundeslaender.geojson").then((d) => (data = d));
}
export const statesData = () => data;
export const loadCountries = () => load("europa.geojson");
