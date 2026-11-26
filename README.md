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
| Mehrtagestour | Mehrere Ziele, Rundreise-Modus, **Etappen nach max. Fahrstunden pro Tag**: zu lange Abschnitte werden am letzten sinnvollen Umstieg geteilt, ein kleinerer Übernachtungsort lässt sich als Alternative wählen. Ohne Rundreise (einfache Fahrt) folgen gleich die **Rückfahrten** zum Start: die nächsten D-Ticket-Verbindungen ab einer Stunde nach Ankunft (Datum/Uhrzeit änderbar), die letzte Rückfahrt des Tages und, wenn der Rückweg zu lang ist, „Rückweg als Tour planen“. |

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
- **Mit Zwischenstopps**: beliebig viele Stopps mit eigener Aufenthaltszeit (15 min bis 6 h). Die App plant Etappe für Etappe, jede startet erst nach dem Aufenthalt. Pro Stopp gibt es Ideen für die Wartezeit (Sehenswertes, günstig essen, WLAN, Toiletten).
- **Einkaufen**: Zuhause, Einkaufsort, Datum, gewünschte Einkaufszeit (oder bis Ladenschluss). Die App berechnet die späteste Abfahrt, mit der man zur Ladenöffnung da ist, und die beste Rückfahrt danach, mit Warnung vor der letzten Verbindung. Öffnungszeiten: Standard Mo–Sa 10–20 Uhr oder aus einem Einkaufszentrum in OSM (`opening_hours` wird für den gewählten Tag ausgewertet). Sonntag und geschlossene Tage werden abgefangen.
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

**YouTuber** (Zusatzmodus im Stadt-Reiter): Karten öffentlicher Infrastruktur zum Zuschalten (OpenRailwayMap: Strecken, Höchstgeschwindigkeit,
Signale, Elektrifizierung; OpenSeaMap: Wasserstraßen & Schleusen; Radwege) und Drehorte im Kartenausschnitt aus OSM:
Kraftwerke, Umspannwerke, Windräder, Brücken & Viadukte, Tunnel, Staudämme, Wehre, Schleusen, Wasserwerke, Türme,
Stellwerke, Drehscheiben, Bunker, verlassene Bahnhöfe, ab Zoom 13 auch Hochspannungsleitungen (nach Spannung gefärbt)
und stillgelegte Bahnstrecken. Popups mit Spannung, Höhe, Baujahr, Betreiber, Wikipedia und „Nächste Haltestelle“.
Hinweise zu Recht & Sicherheit (Bahnanlagen, Drohnen-Flugverbotszonen, Lost Places). OpenInfraMap fehlt bewusst:
nur Vektorkacheln, die Leaflet ohne Zusatzbibliothek nicht zeigt.

**Homeless-Modus** (Zusatzmodus im Stadt-Reiter, sucht automatisch für die eingegebene Stadt): durch den Tag kommen, für eine **ganze Stadt** (Stadtgrenze aus OSM über Nominatim, gestrichelt
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

**Sammler** (runder Knopf ☰ links oben): gefahrene Strecken als farbige Linien und Bundesländer zum Abhaken (automatisch aus den Strecken,
manuell korrigierbar). **Rundreise-Vorschlag**: „N Tage, zeig mir eine Runde durch Länder, in denen ich noch nicht war“.

**Merkliste** (runder Knopf ☰ links oben): Favoriten, gespeicherte Touren, Reisetagebuch und Export/Import als JSON.

**Offline-Paket** pro Tour: Kacheln entlang der Route in Maßen (max. 400, Zoom 9–12, nur ÖPNVKarte)
und Unterkünfte an den Übernachtungsorten.

## Darstellung

Gestaltet nach dem Ergebnis der Experten-Runde in `docs/arena/2026-11-25-futuristisches-design.md` („Präzision statt Effekte“):

- **Abfahrtstafel** wie ein Zugzielanzeiger: dunkler Block, echte Tabelle mit Spalten Zeit / Verspätung / Linie / Ziel / Gleis,
  Zeiten in Festbreitenschrift, Verspätung als eigene Spalte („+4“, „±0“, „fällt aus“).
- **Live-Status** über der Tafel mit Form *und* Text: ● Echtzeit, ○ nur Fahrplan, ⊘ offline – „aktualisiert vor 30 s“.
- **Reisezeitkarte** doppelt codiert: Farbe *und* Linienstärke (kurze Fahrt = dicke Linie), Minuten an jedem Linienende,
  dunkle Begleitlinie statt Leuchteffekt, Linien werden einmal in 200 ms eingeblendet.
- **Raster:** 4-px-Abstände, Radius 4 px, Haarlinien statt Schatten, rechteckige Linien-Badges, Ziffern überall in fester Breite.
- **Farben:** Weiß und fast Schwarz (lesbar in der Sonne), Grün als einzige Markenfarbe, Gelb nur für Hinweise und den Fokusring.
- **Modi** im ☰-Menü: Automatisch / Hell / Nachtfahrplan (dunkel) und Sonnenmodus (hoher Kontrast); folgen sonst
  `prefers-color-scheme`, `prefers-contrast` und `forced-colors`.
- **Bedienung:** SVG-Symbole mit Text für die Navigation, gelber Fokusring, Tippflächen mindestens 44 px auf Touchgeräten,
  Animationen nur kurz und nie bei `prefers-reduced-motion` oder im Homeless-Modus.
- **Schrift:** Fira Sans (OFL), selbst gehostet, auf deutsche Zeichen gekürzt: zwei Schnitte zusammen 27 KB, `font-display: optional`,
  wird bei Datensparmodus und im Homeless-Modus nicht geladen. Lizenz in `vendor/fonts/OFL-Fira-Sans.txt`.

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

- **Ladegröße:** Die App-Shell liegt bei rund 229 KB gzip (eigenes JS 117 KB) und damit über dem Budget aus der Design-Runde
  (150 KB / 75 KB). Grund: Alle Reiter werden beim Start geladen. Nächster Schritt wäre, Reiter erst beim Öffnen zu laden
  (`import()`) und `data/europa.geojson` nur für den Interrail-Reiter.
- **Emoji** in Kategorien (Homeless-Modus, YouTuber, Läden) sind noch nicht durch SVG-Symbole ersetzt; sie stehen dort immer neben Text.

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

### YouTuber-Modus: Tempo und Brücken
- **Tempo Bahn:** Strecken farbig nach Höchstgeschwindigkeit (OSM `maxspeed`), Filter aus/alle/ab 100/160/200/250/300 km/h.
- **Tempo Autobahn:** nur Autobahnen (`highway=motorway`), Filter alle / nur unbegrenzt / ≥ 130 / ≤ 120 / ≤ 100 / variabel. `maxspeed=none` und `DE:motorway` gelten als unbegrenzt.
- **Brücken:** Straßenbrücken nur noch, wenn sie Autobahnbrücken sind, über eine Autobahn führen oder mindestens 80 m hoch sind (`height`). Eisenbahnbrücken und Viadukte bleiben. Filter „nur ≥ 80 m“ und „nur über Autobahnen“.

### Flug & Fähre (Reiter International)
- **Flughäfen vergleichen:** für die nächsten 3/5/8 oder alle deutschen Flughäfen die Anreise mit dem D-Ticket (Abfahrt, Ankunft, Dauer), sortiert nach Fahrzeit. Dazu fertig ausgefüllte Links zu Google Flights, Skyscanner und Kayak sowie **ein Kayak-Link für alle Abflughäfen zusammen** (Kayak vergleicht dann z. B. München und Hamburg in einer Suche).
- **Fähren ab Deutschland:** Ostsee, Nordsee-Inseln, Bodensee – mit Anreise zum Hafen per D-Ticket und Links zur Preissuche.
- Preise selbst ruft die App nicht ab: Dafür gibt es keine freie Schnittstelle, ein Schlüssel ließe sich ohne Server nicht geheim halten, und Auslesen der Anbieterseiten verbieten deren Bedingungen (und CORS im Browser).

### Satellitenkarte
Dritte Grundkarte „Satellit“ (Esri World Imagery, mit Quellenhinweis).

### Reisen, Strecken und Bahnhöfe speichern
- **Reise speichern:** In „Verbindung“ eine Fahrt aufklappen → „☆ Reise speichern“. Merkliste → Reisen zeigt sie mit Zeiten und Linien; „Öffnen“ zeigt alle Abschnitte, „Neu suchen“ sucht die Strecke aktuell.
- **Standardstrecke:** „☆ Strecke merken“ speichert Start/Ziel. Erscheint oben in „Verbindung“ als Knopf (ein Klick sucht) und in Merkliste → Strecken.
- **Bahnhöfe:** „☆ Start“ / „☆ Ziel“ merken den Bahnhof; gemerkte Bahnhöfe stehen als Schnellwahl über den Eingabefeldern.
- Merkliste hat Unter-Reiter: Reisen, Strecken, Orte, Touren, Tagebuch, Sicherung. Reisen und Strecken sind in Export/Import enthalten.
