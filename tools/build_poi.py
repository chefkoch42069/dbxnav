#!/usr/bin/env python3
"""
Baut die Ortsdaten der App aus einem OpenStreetMap-Auszug.

    python3 tools/build_poi.py gefiltert.osm.pbf _site/data/poi

Ergebnis:
    index.json            Datenstand, Kachel-Zoom, Liste vorhandener Kacheln
    12/<x>/<y>.json       Orte je Kachel (Zoom 12 ≈ 6 × 6 km)

Jeder Ort: [osm-id, lat, lon, {tags}], Parks & Gratis-Orte als Weg zusätzlich [süd, west, nord, ost].
Wege werden auf ihren Mittelpunkt reduziert. Relationen (z. B. große Parks als Multipolygon) fehlen,
die holt die App bei Bedarf live über Overpass.
Welche Orte und Tags hineinkommen, steht unten in KEEP_* – passend zu js/planner/*.
"""
import datetime
import json
import math
import os
import sys

import osmium

ZOOM = 12

AMENITY = {
    "drinking_water", "water_point", "toilets", "shower", "device_charging_station", "food_sharing",
    "give_box", "shelter", "social_facility", "library", "fast_food", "canteen",
    "locker", "lockers", "luggage_locker", "pharmacy", "atm",
}
SHOP = {"supermarket", "bakery", "convenience", "kiosk"}
TOURISM = {"hotel", "hostel", "guest_house", "motel", "apartment", "camp_site", "alpine_hut", "chalet", "wilderness_hut"}

# Homeless-Modus: Parks & kostenlose Orte (wie freePlacesQuery in js/api/overpass.js)
FREE_LEISURE_NAMED = {"park", "garden", "nature_reserve"}
FREE_LEISURE = {"fitness_station", "swimming_area"}
FREE_TOURISM = {"viewpoint", "attraction", "museum"}
FREE_HISTORIC_NAMED = {"castle", "ruins", "city_gate", "monument", "palace", "fort"}

# Nur diese Tags werden gespeichert (hält die Dateien klein).
KEEP_TAGS = {
    "name", "brand", "operator", "amenity", "shop", "tourism", "access", "fee", "charge",
    "opening_hours", "internet_access", "internet_access:fee", "power_supply",
    "social_facility", "social_facility:for", "drinking_water", "seasonal", "shelter_type",
    "stars", "price", "price:room", "price:bed", "website", "contact:website", "phone", "contact:phone",
    "addr:street", "addr:housenumber", "addr:city", "library", "vending", "wheelchair",
    "leisure", "historic", "natural", "garden:type", "building",
}


def wanted_free(tags):
    named = "name" in tags
    leisure, amenity = tags.get("leisure"), tags.get("amenity")
    if leisure in FREE_LEISURE or amenity == "public_bookcase" or tags.get("shop") == "mall":
        return True
    if tags.get("tourism") in FREE_TOURISM:
        return True
    if named and (leisure in FREE_LEISURE_NAMED or tags.get("historic") in FREE_HISTORIC_NAMED or tags.get("natural") == "beach"):
        return True
    return amenity == "place_of_worship" and tags.get("building") in ("cathedral", "church") and "wikipedia" in tags


def wanted(tags):
    if wanted_free(tags):
        return True
    if tags.get("amenity") in AMENITY or tags.get("shop") in SHOP or tags.get("tourism") in TOURISM:
        return True
    if "social_facility" in tags or tags.get("power_supply") == "yes":
        return True
    return tags.get("internet_access:fee") == "no" and tags.get("internet_access") in ("wlan", "yes", "wifi", "public")


def tile_of(lat, lon, z=ZOOM):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    lat_r = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n)
    return x, y


class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.tiles = {}
        self.count = 0

    def add(self, oid, lat, lon, tags, bounds=None):
        slim = {k: v for k, v in tags.items() if k in KEEP_TAGS}
        item = [oid, round(lat, 5), round(lon, 5), slim]
        if bounds and wanted_free(tags):
            item.append([round(v, 5) for v in bounds])  # [süd, west, nord, ost] → Parkgröße in der App
        self.tiles.setdefault(tile_of(lat, lon), []).append(item)
        self.count += 1

    def node(self, n):
        if not n.tags:
            return
        tags = {t.k: t.v for t in n.tags}
        if wanted(tags) and n.location.valid():
            self.add(f"node/{n.id}", n.location.lat, n.location.lon, tags)

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        if not wanted(tags):
            return
        pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        if not pts:
            return
        # Mittelpunkt des umgebenden Rechtecks – wie Overpass „out center“
        lats, lons = [p[0] for p in pts], [p[1] for p in pts]
        self.add(f"way/{w.id}", (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2, tags,
                 (min(lats), min(lons), max(lats), max(lons)))


def main(src, out):
    c = Collector()
    c.apply_file(src, locations=True)
    os.makedirs(out, exist_ok=True)
    for (x, y), items in c.tiles.items():
        d = os.path.join(out, str(ZOOM), str(x))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{y}.json"), "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    index = {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": os.environ.get("POI_SOURCE", os.path.basename(src)),
        "license": "© OpenStreetMap-Mitwirkende, ODbL",
        "zoom": ZOOM,
        "count": c.count,
        "tiles": sorted(f"{x}/{y}" for x, y in c.tiles),
    }
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"))
    print(f"{c.count} Orte in {len(c.tiles)} Kacheln → {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
