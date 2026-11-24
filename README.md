# dbxnav – D-Ticket Reiseplaner

Mit dem Deutschlandticket durchs ganze Land: Tagestrips, Wochenenden und Mehrtagestouren
**nur im Nahverkehr**, mit Unterkünften bis 50 € pro Nacht, bevorzugt außerhalb großer Städte.

Statische Web-App ohne Build-Schritt: Leaflet + Transitous (MOTIS) + OpenStreetMap/Overpass.

## Starten

```bash
python3 -m http.server 8080
```

Dann <http://localhost:8080> öffnen. Für den Offline-Modus (Service Worker) braucht es
`localhost` oder HTTPS, z. B. GitHub Pages.

Tests (reine Planungslogik, Node ≥ 20):

```bash
npm test
```

## Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` testet, erzeugt die Ortsdaten und veröffentlicht die App,
bei jedem Push auf `main`, jeden Montag (frische OSM-Daten) und auf Knopfdruck (Actions → „GitHub Pages“ → „Run workflow“).

Einmalig einrichten:

1. Repository öffentlich machen **oder** ein GitHub-Abo mit Pages für private Repos nutzen.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.

Danach läuft die App unter `https://<benutzer>.github.io/dbxnav/`, mit HTTPS. Damit funktionieren auch Standort und Offline-Modus.

## Ortsdaten

Unterkünfte, Bahnhofs-Infos, Bibliotheken und der Homeless-Modus lesen vorab erzeugte Daten aus `data/poi/`.
Parks als Multipolygon-Relation fehlen darin; die ergänzt der Homeless-Modus live über Overpass.
Das geht schnell, braucht keinen fremden Server und funktioniert offline. Fehlen die Daten, etwa beim lokalen Start, fragt die App wie bisher Overpass.
Ausflugsziele und Wanderwege-Liste kommen weiterhin live von Overpass.

Selbst erzeugen (braucht `osmium-tool` und `pip install osmium`):

```bash
curl -LO https://download.geofabrik.de/europe/germany/thueringen-latest.osm.pbf
grep -v '^#' tools/filter-tags.txt | grep . > /tmp/expr.txt
osmium tags-filter thueringen-latest.osm.pbf --expressions=/tmp/expr.txt -o filtered.osm.pbf
python3 tools/build_poi.py filtered.osm.pbf data/poi
```

`data/poi/` steht in `.gitignore`. Die Daten werden nicht eingecheckt, sondern beim Veröffentlichen erzeugt.

## Funktionen

**Einstieg „Wie lange bist du unterwegs?“**

| Reiseart | Was die App liefert |
|---|---|
| Tagestrip | Karte aller Ziele, die hin **und** zurück am selben Tag gehen (Transitous `one-to-all` hin + zurück), mit Aufenthaltsdauer und spätester Rückfahrt. Pro Ziel: Hin- und letzte Rückfahrt, Ausflugsziele aus OSM (Burgen, Seen, Aussicht, Museen), Bahnhofs-Infos, Wetter. |
| Wochenende | Ziel wählen (oder „Ziele in Reichweite“ auf der Karte antippen), 1–2 Nächte, Unterkünfte am Zielort, Rückfahrt. |
| Mehrtagestour | Mehrere Ziele, Rundreise-Modus, **Etappen nach max. Fahrstunden pro Tag**: zu lange Abschnitte werden am letzten sinnvollen Umstieg geteilt, ein kleinerer Übernachtungsort lässt sich als Alternative wählen. |

Für alle Reisearten:

- **Warnung „letzte Verbindung“**: pro Etappe, bis wann man spätestens losfahren muss (Nachtzüge gibt es mit dem D-Ticket nicht).
- **D-Ticket-Prüfung** jedes Abschnitts: ICE/IC/Fernbus raus, Fähren und Rufbusse mit Hinweis, IC-Ausnahmestrecken aus `js/config.js`.
- **Unterkünfte aus OSM** mit grober Preiseinschätzung (Hostel/Camping/Budget-Kette = wahrscheinlich ≤ 50 €, 4★ = eher teurer, explizite Preis-Tags werden ausgewertet).
- **Wanderwege**: markierte Routen um jedes Ziel (international bis lokal, Länge, Rundweg) mit Link zu Höhenprofil/Verlauf bei Waymarked Trails, dazu die Kartenebene „Wanderwege“.
- **Bibliotheken** in der Nähe: Öffnungszeiten und WLAN, gut für Regentage und zum Handy-Laden.
- **Wetter** am Etappenort (DWD-Daten über Bright Sky) und **Regenradar** des DWD als Kartenebene.
- Links zum Gegenprüfen bei **bahn.de/DB Navigator** und zu **direkt.bahn.guru** („Wohin komme ich direkt?“).

**Verbindung**: Start und Ziel eingeben → Verbindungen nur mit Zügen, Bussen und Bahnen, die mit dem Deutschlandticket gehen.
- Abfahrt oder Ankunft, „über“ einen Bahnhof, Umstiege begrenzen, nur Bahn, mehr Umstiegszeit, barrierefrei
- Früher/später blättern, schnellste und umstiegsärmste Verbindung markiert, Details mit Karte
- Optional ICE/IC zum Vergleich (ausgegraut, z. B. „wärst ca. 1 h 13 min schneller“)
- Rückfahrt mit einem Klick, letzte Verbindung des Tages, bei DB gegenprüfen, „Bin ich gefahren“ (Sammler + Tagebuch)
- Letzte Suchen, Sprung aus Abfahrtstafel („Verbindung von hier“) und Merkliste („Hin“)
- Fahrradmitnahme fehlt bewusst: Die deutschen Fahrplandaten enthalten sie meist nicht, die Suche würde fälschlich „keine Verbindung“ melden.

**International (Interrail Global Pass)**:
- Länderkarte: wo der Pass gilt (grün), Wohnland (gelb, nur je eine Fahrt hinaus und zurück), Länder außerhalb (grau).
- „Erreichbare Ziele zeigen“: Fernbahnhöfe in Europa, die man ab dem Start in X Stunden erreicht. Antippen fügt das Ziel zur Tour hinzu.
- Tourplanung wie beim D-Ticket (Etappen nach Fahrzeit, letzte Verbindung, Unterkünfte), aber mit ICE/IC/TGV/Railjet und optional Nachtzügen. Ein Nachtzug ist ein ganzer Reisetag ohne Hotel.
- Hinweise pro Abschnitt: Reservierungspflicht (Faustregel je Land, Eurostar, Nachtzüge), Privatbahnen ohne Pass (Italo, FlixTrain, Iryo, Ouigo, WESTbahn, RegioJet, Leo Express), Stadtverkehr nicht im Pass.
- Pass-Übersicht: Reisetage, Spanne, Anzahl Reservierungen und die passende Variante (flexibel 4/5/7/10/15 Tage oder durchgehend).
- Warnung, wenn eine Fahrt mitten in der Reise nur durchs Wohnland führt.

Länderliste, Reservierungs-Faustregel und Privatbahnen stehen in `INTERRAIL` in `js/config.js` und sind als *ungeprüft* markiert.
Bitte vor der Reise auf interrail.eu bestätigen.

**Abfahrtstafel**: Bahnhof eingeben → alle Abfahrten oder Ankünfte mit D-Ticket, also Regionalzug, S-Bahn,
U-Bahn, Tram, Bus und Fähre, auch von Haltestellen direkt am Bahnhof. Filter je Verkehrsmittel, Verspätungen,
Gleis, Fernverkehr optional ausgegraut. Antippen zeigt den Fahrtverlauf auf der Karte, und von jedem Halt kann man
weiter zu dessen Abfahrten springen. Ein langer Druck bzw. Rechtsklick auf die Karte wählt die nächste Haltestelle.

**Stadt**: Stadt eingeben (z. B. Koblenz) → der Hauptbahnhof wird gesucht (andere Bahnhöfe der Stadt zum Umschalten),
die Karte wechselt auf die ÖPNVKarte mit 500-m-Kreis. Gezeigt werden alle Linien nach Verkehrsmittel (mit Hauptzielen),
die Zahl der Abfahrten in der nächsten Stunde, dazu alle Läden und Einrichtungen **im Bahnhof** (im Bahnhofsumriss aus OSM)
und **bis 500 m** drumherum: Lebensmittel, Bäcker & Café, Imbiss & Restaurant, Drogerie & Apotheke, Presse & Reisebedarf,
Geld & Post, Bahnhofs-Service (WC, Schließfächer, Fahrradparken …), mit Öffnungszeiten und Ebene.

**Online buchen**: Bei jeder Übernachtung einer Tour und im Stadt-Reiter fertige Suchlinks, mit Anreise, Nächten,
Personen und Preisgrenze schon ausgefüllt. Für billige Unterkünfte: Booking.com (Hostels, Motels, Pensionen oder alles,
billigste zuerst), Hostelworld, Airbnb-Privatzimmer, Jugendherbergen (DJH), Kayak-Preisvergleich. Für Ferienwohnungen:
Airbnb (ganze Wohnung) und Booking.com (Ferienwohnungen & -häuser). Die Preise stehen erst auf den Seiten selbst: Freie
Schnittstellen gibt es dort nicht, und das automatische Auslesen verbieten ihre Nutzungsbedingungen. Unterkünfte aus OSM
mit eigener Webseite haben in der Liste einen „Web“-Knopf, direkt buchen ist oft billiger.

**ÖPNVKarte anklicken**: Ist die ÖPNVKarte die Grundkarte, zeigt ein Klick die nächste Haltestelle mit allen Linien
und den nächsten D-Ticket-Abfahrten, mit Sprung zur Abfahrtstafel (nicht im Homeless-Modus, der Klicks selbst nutzt).

**Wanderwege**: Länge, Auf- und Abstieg, Gehzeit nach DIN 33466 (bei Fernwegen Tage à 20 km), Start und Ziel,
Wegmarkierung in Worten (aus `osmc:symbol`), Betreuer, Beschreibung, Links zu Höhenprofil und Website.
„Auf Karte“ zeichnet den Verlauf und sucht die nächsten Haltestellen an Start und Ziel.

**YouTuber-Modus**: Karten öffentlicher Infrastruktur zum Zuschalten (OpenRailwayMap: Strecken, Höchstgeschwindigkeit,
Signale, Elektrifizierung; OpenSeaMap: Wasserstraßen & Schleusen; Radwege) und Drehorte im Kartenausschnitt aus OSM:
Kraftwerke, Umspannwerke, Windräder, Brücken & Viadukte, Tunnel, Staudämme, Wehre, Schleusen, Wasserwerke, Türme,
Stellwerke, Drehscheiben, Bunker, verlassene Bahnhöfe, ab Zoom 13 auch Hochspannungsleitungen (nach Spannung gefärbt)
und stillgelegte Bahnstrecken. Popups mit Spannung, Höhe, Baujahr, Betreiber, Wikipedia und „Nächste Haltestelle“.
Hinweise zu Recht & Sicherheit (Bahnanlagen, Drohnen-Flugverbotszonen, Lost Places). OpenInfraMap fehlt bewusst:
nur Vektorkacheln, die Leaflet ohne Zusatzbibliothek nicht zeigt.

**Homeless-Modus**: durch den Tag kommen, für eine **ganze Stadt** (Stadtgrenze aus OSM über Nominatim, gestrichelt
auf der Karte, die Karte wechselt dabei auf die ÖPNVKarte) oder einen Umkreis um Bahnhof, Standort oder Kartenpunkt:
billig essen (Discounter, Bäcker, Imbiss, Tafeln/Suppenküchen/Foodsharing-Fairteiler), Handy-Ladestationen und Steckdosen,
Gratis-WLAN, Bibliotheken, Bahnhofsmission und Angebote für Wohnungslose. Dazu **Parks** (größte zuerst) und kostenlose Orte:
Aussichtspunkte, Sehenswertes, Museen (Eintritt frei markiert), große Kirchen, Einkaufszentren, Outdoor-Fitness, Badestellen,
Bücherschränke. Außerdem Trinkwasser, Toiletten, Duschen, Schutzhütten, Verschenkregale. Filter je Kategorie, „nur kostenlose“,
Öffnungszeiten auf Deutsch, Fußweg-Link, Tipps für den Tag (Essen, Strom & WLAN, wohin tagsüber, Hygiene, Hilfe).
Für ganz große Städte fällt die Suche nach Essen/Strom/WLAN auf 3 km um den eingegebenen Ort zurück, falls die Abfrage zu groß wird.
Eine Kurzfassung gibt es bei jedem Übernachtungsort und Tagesziel.

Bewusst streng, lieber weniger als Falsches: Orte mit `access=private/customers/…` werden nicht gezeigt, „kostenlos“ heißt
in OSM als kostenlos eingetragen, „Hilfe“ nur bei `social_facility:for=homeless/underprivileged` (nicht Tagespflege oder
Pflegeheime), Wasserstellen nur mit Trinkwasser, saisonale Brunnen mit Hinweis.

**Sammler**: gefahrene Strecken als farbige Linien und Bundesländer zum Abhaken (automatisch aus den Strecken,
manuell korrigierbar). **Rundreise-Vorschlag**: „N Tage, zeig mir eine Runde durch Länder, in denen ich noch nicht war“.

**Merkliste**: Favoriten, gespeicherte Touren, Reisetagebuch und Export/Import als JSON.

**Offline-Paket** pro Tour: Kacheln entlang der Route in Maßen (max. 400, Zoom 9–12, nur ÖPNVKarte)
und Unterkünfte an den Übernachtungsorten.

## Karten

| Ebene | Quelle | Hinweis |
|---|---|---|
| OSM Deutschland (Grundkarte) | FOSSGIS e.V. | Für den Eigengebrauch ok. **Vor einer Weitergabe beim Betreiber nachfragen** oder eine andere Quelle nehmen. Wird nicht vorgeladen. |
| ÖPNVKarte (Grundkarte) | memomaps, CC BY-SA 2.0 | Daten werden nicht regelmäßig aktualisiert. |
| OpenRailwayMap (zuschaltbar) | CC BY-SA 2.0 | Strecken, Elektrifizierung |
| Wanderwege (zuschaltbar) | Waymarked Trails, CC BY-SA 3.0 | |
| Regenradar (zuschaltbar) | DWD WMS `dwd:Niederschlagsradar` | |

Bewusst weggelassen: OpenInfraMap und Osiris (kein Nutzen fürs Bahnreisen, Osiris ohne Lizenz).

## Pflegen

Alles Konfigurierbare steht in `js/config.js`: Preisobergrenze, Verkehrsmittel, Kartenebenen,
Offline-Grenzen, **IC-Ausnahmestrecken** und die Knotenbahnhöfe je Bundesland für den Rundreise-Vorschlag.

## Offene Punkte

- **IC-Ausnahmen** (IC 87 Gäubahn, IC 56 Bremen–Norddeich) sind als *ungeprüft* markiert und müssen vor jeder Saison
  bestätigt werden. Die Regeln ändern sich meist zum Fahrplanwechsel im Dezember. IC 87 führt Transitous ohnehin als Regionalverkehr.
- Die Parameter des **direkt.bahn.guru**-Links (`?origin=<EVA>&local=true`) sind nicht verifiziert.
- Overpass war aus der Entwicklungsumgebung nicht erreichbar, ebenso Geofabrik. Die Daten-Pipeline wurde mit einer
  kleinen handgeschriebenen OSM-Datei getestet. Der erste echte Lauf mit ganz Deutschland passiert in der GitHub Action.
  Overpass braucht keinen API-Schlüssel. Bei Überlast (502/504/429) wechselt die App automatisch zwischen vier
  Servern (`OVERPASS_ENDPOINTS` in `js/config.js`) und stellt Server, die gerade ausgefallen sind, für drei Minuten ans Ende.
- Viele OSM-Einträge haben keine Angaben zu Gebühr, Zugang oder Zielgruppe. Der Homeless-Modus zeigt solche Orte
  entsprechend vorsichtig an.
- Die Preise in OSM sind lückenhaft. Die 50-€-Grenze ist eine Schätzung und keine Garantie.

## Projektaufbau

```
index.html, css/, sw.js, manifest.webmanifest
js/config.js          zentrale Einstellungen
js/api/               Transitous, Overpass, Wetter
js/planner/           reine Logik (getestet): D-Ticket-Prüfung, Etappen, Touren, Tagestrip, Rundreise, Unterkünfte, Abfahrten, Homeless-Modus
js/ui/                Reiter, Karte, Eingabefelder
data/                 Bundesländer und europäische Länder (Natural Earth, gemeinfrei, vereinfacht)
vendor/leaflet/       Leaflet 1.9.4 (für offline)
tools/                Daten-Pipeline: OSM-Auszug → Ortsdaten-Kacheln
.github/workflows/    Tests, Daten erzeugen, GitHub Pages
tests/                node:test
```

Daten: © OpenStreetMap-Mitwirkende, Fahrpläne über [Transitous](https://transitous.org), Wetter: Deutscher Wetterdienst.
