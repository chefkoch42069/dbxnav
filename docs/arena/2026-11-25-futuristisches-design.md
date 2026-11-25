# Expert Arena: Wie kann das Design des D-Ticket-Reiseplaners futuristischer aussehen?

> **Status:** Konsens bis auf einen Punkt (Kartenfilter, 4:1 dagegen)
> **Datum:** 25.11.2026
> **Experten (gespielte Personas auf Grundlage öffentlicher Positionen):** David Sheldon-Hicks (Film-Interfaces), Erik Spiekermann (Typografie, Wegeleitsysteme), Léonie Watson (Barrierefreiheit), Alex Russell (Web-Performance), Jakob Nielsen (Usability, Advocatus Diaboli mit Veto)
> **Hinweis:** Die Experten waren KI-Agenten in diesen Rollen, keine echten Aussagen der Personen.

---

## Urteil

Futuristisch wird die App durch **Präzision**, nicht durch Effekte: eine echte Abfahrtstafel, Ziffern in fester Breite, ein strenges Raster, ein ehrlicher Live-Status, kontrastreiche Linien auf der Karte und eine Oberfläche, die sich anpasst (Dunkel-, Sonnen- und Hochkontrastmodus). Glas, Weichzeichner, Neon-Leuchten und Daueranimationen sind auf billigen Handys in der Sonne schädlich und wurden einstimmig verworfen.

---

## Verlauf der Debatte

- **Runde 1:** Sheldon-Hicks eröffnete mit einem „Signal-Modus“ (Nachtblau, leuchtende Badges), ausrollenden Linien, Live-Puls und einem CSS-Filter auf den Kartenkacheln. Spiekermann: „Die App sieht aus wie ein Bioladen“. Er forderte eine eigene Schrift (Fira Sans), ein 4-px-Raster und eine echte Abfahrtstafel. Watson stellte fest, dass die Reisezeitkarte heute **nur über Farbe** codiert und damit gegen WCAG 1.4.1 verstößt. Russell legte ein Budget vor (App-Shell ≤ 150 KB, ≤ 16 ms pro Bild, keine Daueranimation) und rechnete vor: Weichzeichner kosten auf Mali-GPUs 8–15 ms pro Bild. Nielsen kündigte Vetos gegen Glas, Neon als Standard und dekorative Animation an.
- **Technischer Wendepunkt:** Die Karte zeichnet ihre Linien auf eine Zeichenfläche (`preferCanvas`). CSS-Animationen wie `stroke-dashoffset` greifen dort nicht. Ein Ausrollen müsste die ganze Fläche bei jedem Bild neu zeichnen.
- **Russell → Spiekermann:** `font-display: swap` verschiebt das Layout auf schwachem Netz. Spiekermann gab nach („Er hat recht, und das ärgert mich“) und reduzierte auf einen Schnitt unter 25 KB mit `optional`.
- **Russell, Nielsen, Watson → Sheldon-Hicks:** Leuchten entsteht durch Kontrast (eine dunkle, breitere Linie darunter), nicht durch Weichzeichner. Sheldon-Hicks übernahm das als „den besseren Film-Trick“. Er zog die Ausroll-Animation, den Dauer-Puls und den Kartenfilter (`invert`) zurück.
- **Watson** gab ihre Forderung nach einem rein hellen Design auf. Sie akzeptiert die dunkle Abfahrtstafel, weil die Kontraste stimmen (Weiß auf #111 etwa 18:1, Gelb #f2c14e etwa 11:1).
- **Nielsen** ordnete alle 20 Vorschläge ein. Seine Vetos gegen den Kachelfilter und den Dauer-Puls bleiben aktiv.

---

## Hauptargumente für die gewählte Lösung

| # | Argument | Von | Warum überzeugend |
|---|---|---|---|
| 1 | Die Abfahrtstafel im Stil echter Zugzielanzeiger ist ein bekanntes Muster und wirkt gerade dadurch modern | Spiekermann, Nielsen | Nutzer verstehen sie sofort, ohne Lernaufwand |
| 2 | Ziffern in fester Breite und eine eigene Verspätungsspalte „+4“ | Spiekermann, Nielsen | Zeiten lassen sich schneller vergleichen, kostet 0 Byte |
| 3 | Leuchten durch eine dunkle Begleitlinie statt durch Weichzeichner | Russell, Sheldon-Hicks | Gleiche Wirkung, etwa doppelte statt zehnfache Zeichenkosten |
| 4 | Die Reisezeit doppelt codieren (Farbe plus Linienstärke plus Minuten am Ende) | Watson | Behebt einen bestehenden WCAG-Verstoß, hilft bei Rot-Grün-Schwäche und in der Sonne |
| 5 | Live-Status mit Text und Form statt nur Farbe | Nielsen, Watson | Zeigt den Systemstatus (Heuristik 1), ist barrierefrei |
| 6 | SVG-Symbole mit Textlabel statt Emoji | Spiekermann, Watson, Russell | Sehen auf jedem Gerät gleich aus, werden korrekt vorgelesen, unter 8 KB |

## Gegenargumente (und warum tragbar)

| # | Argument | Von | Warum tragbar |
|---|---|---|---|
| 1 | Ein Webfont kostet Bytes beim ersten Besuch | Russell | Ein Schnitt unter 25 KB, `optional`: beim ersten Besuch die Systemschrift, danach aus dem Cache. Entfällt im Homeless-Modus und bei aktivem Datensparmodus |
| 2 | Eine dunkle Tafel im hellen Theme könnte blenden | Nielsen | Kontrast 18:1 bzw. 11:1, Bedingung: Test draußen ohne Ablesefehler |
| 3 | Animationen kosten Akku | Russell | Nur einmalig, ≤ 200 ms, nur `opacity`/`transform`, nie im Homeless-Modus und bei `prefers-reduced-motion` |

## Verbleibender Dissens

- **Filter auf den Kartenkacheln:** Spiekermann möchte ein leichtes `saturate(.6)` als Option, damit die Datenlinien hervortreten. Nielsen (**Veto**), Russell (kostet mehrere Millisekunden pro Bild beim Verschieben) und Watson (verfälscht Linienfarben) sind dagegen. Sheldon-Hicks hat den Filter zurückgezogen. **Ergebnis: kein Kachelfilter.** Für einen gedämpften Hintergrund lieber eine Grundkarte wählen, die schon so gestaltet ist.

---

## Empfehlung

Ein „Präzisions-Redesign“ statt eines „Science-Fiction-Redesigns“. Es macht die App futuristischer, weil es klarer und schneller ist, und es behebt nebenbei einen echten Barrierefreiheitsmangel (die Reisezeitkarte nur in Farbe). Jede Änderung muss Russells Budget einhalten und darf laut Nielsen die Kernaufgaben (Verbindung finden, Abfahrt ablesen, kostenlosen Strom finden) nicht verlangsamen.

## Maßnahmenplan

1. **Typografie:** `font-variant-numeric: tabular-nums` für alle Zeiten, rechtsbündig, Verspätung in eigener Spalte. Optional ein Schnitt Fira Sans (OFL) als Latin-Subset unter 25 KB, `font-display: optional`, nicht im Homeless-Modus oder bei Datensparmodus.
2. **Abfahrtstafel:** dunkler Block (#111), Schrift weiß/gelb, als echte Tabelle mit Kopfzeilen, feste Spalten Zeit, Linie, Ziel, Gleis, keine Leuchteffekte.
3. **Raster und Formen:** 4-px-Basis (4/8/16/24), Radius 10 → 4 px, rechteckige Linien-Badges mit fester Breite, Haarlinien statt Schatten. Schaltflächen bleiben klar als anklickbar erkennbar.
4. **Farbe:** Hintergrund Weiß, Text fast Schwarz, Grün als einzige Markenfarbe, Gelb nur für Hinweise und Fokus (nie als Textfarbe auf Weiß).
5. **Karte:** dunkle Begleitlinie unter den Linien statt Leuchteffekt, Reisezeit doppelt codiert (Linienstärke plus Minuten-Labels an den Enden, farbenblind-taugliche Skala). Linienebene einmal in 200 ms einblenden. Kein Kachelfilter.
6. **Live-Status:** Punkt plus Text („Echtzeit · vor 30 s“, „Offline-Daten“), unterscheidbare Formen (gefüllt, Ring, durchgestrichen), leuchtet nur einmal bei neuen Daten auf.
7. **Modi:** Dunkles Theme „Nachtfahrplan“ über `prefers-color-scheme` und einen Schalter (Wahl wird gespeichert), Sonnen- und Hochkontrastmodus über `prefers-contrast` und `forced-colors`.
8. **Bedienung:** SVG-Symbole (Sprite unter 8 KB) immer mit Textlabel, gelber Fokusring ≥ 2 px, nie vom unteren Panel verdeckt, Tippflächen ≥ 44 px, Übergänge ≤ 200 ms nur bei Interaktion.
9. **Prüfen:** Budget auf einem 150-€-Android über langsames 4G (App-Shell ≤ 150 KB, ≤ 16 ms pro Bild, Reaktion ≤ 200 ms). Fünf-Nutzer-Tests draußen vorher und nachher mit denselben drei Kernaufgaben, auch mit Screenreader und mit Menschen aus der Homeless-Zielgruppe.
