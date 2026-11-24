// Google-Encoded-Polyline dekodieren (Transitous liefert precision 6 oder 7).
export function decodePolyline(str, precision = 6) {
  const factor = 10 ** precision;
  const out = [];
  let index = 0, lat = 0, lon = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lon += delta;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

export function encodePolyline(points, precision = 6) {
  const factor = 10 ** precision;
  let pLat = 0, pLon = 0, s = "";
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let r = "";
    while (v >= 0x20) { r += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return r + String.fromCharCode(v + 63);
  };
  for (const [la, lo] of points) {
    const a = Math.round(la * factor), b = Math.round(lo * factor);
    s += enc(a - pLat) + enc(b - pLon);
    pLat = a; pLon = b;
  }
  return s;
}

export function legPoints(leg) {
  const g = leg?.legGeometry;
  if (!g?.points) return [[leg.from.lat, leg.from.lon], [leg.to.lat, leg.to.lon]];
  return decodePolyline(g.points, g.precision ?? 6);
}
