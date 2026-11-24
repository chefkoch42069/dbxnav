// Bundesländer-Umrisse (Natural Earth, gemeinfrei; vereinfacht).
let data = null;
let pending = null;
export function loadStates() {
  if (data) return Promise.resolve(data);
  pending ||= fetch("data/bundeslaender.geojson").then((r) => r.json()).then((d) => (data = d));
  return pending;
}
export const statesData = () => data;
