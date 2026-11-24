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
- **Wetter** am Etappenort (DWD-Daten über Bright Sky) und **Regenradar** des DWD als Kartenebene.
- Links zum Gegenprüfen bei **bahn.de/DB Navigator** und zu **direkt.bahn.guru** („Wohin komme ich direkt?“).

**Abfahrtstafel**: Bahnhof eingeben → alle Abfahrten oder Ankünfte mit D-Ticket, also Regionalzug, S-Bahn,
U-Bahn, Tram, Bus und Fähre, auch von Haltestellen direkt am Bahnhof. Filter je Verkehrsmittel, Verspätungen,
Gleis, Fernverkehr optional ausgegraut. Antippen zeigt den Fahrtverlauf auf der Karte, und von jedem Halt kann man
weiter zu dessen Abfahrten springen. Ein langer Druck bzw. Rechtsklick auf die Karte wählt die nächste Haltestelle.

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
| Regenradar (zuschaltbar) | DWD WMS `dwd:Niederschlagsradar` | |

Bewusst weggelassen: OpenInfraMap und Osiris (kein Nutzen fürs Bahnreisen, Osiris ohne Lizenz).

## Pflegen

Alles Konfigurierbare steht in `js/config.js`: Preisobergrenze, Verkehrsmittel, Kartenebenen,
Offline-Grenzen, **IC-Ausnahmestrecken** und die Knotenbahnhöfe je Bundesland für den Rundreise-Vorschlag.

## Offene Punkte

- **IC-Ausnahmen** (IC 87 Gäubahn, IC 56 Bremen–Norddeich) sind als *ungeprüft* markiert und müssen vor jeder Saison
  bestätigt werden. Die Regeln ändern sich meist zum Fahrplanwechsel im Dezember. IC 87 führt Transitous ohnehin als Regionalverkehr.
- Die Parameter des **direkt.bahn.guru**-Links (`?origin=<EVA>&local=true`) sind nicht verifiziert.
- Overpass, also Unterkünfte, Bahnhofs-Infos und Ausflugsziele, konnte in der Entwicklungsumgebung nicht live getestet werden.
- Die Preise in OSM sind lückenhaft. Die 50-€-Grenze ist eine Schätzung und keine Garantie.

## Projektaufbau

```
index.html, css/, sw.js, manifest.webmanifest
js/config.js          zentrale Einstellungen
js/api/               Transitous, Overpass, Wetter
js/planner/           reine Logik (getestet): D-Ticket-Prüfung, Etappen, Touren, Tagestrip, Rundreise, Unterkünfte, Abfahrten
js/ui/                Reiter, Karte, Eingabefelder
data/                 Bundesländer (Natural Earth, gemeinfrei, vereinfacht)
vendor/leaflet/       Leaflet 1.9.4 (für offline)
tests/                node:test
```

Daten: © OpenStreetMap-Mitwirkende, Fahrpläne über [Transitous](https://transitous.org), Wetter: Deutscher Wetterdienst.
