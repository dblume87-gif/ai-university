# 05 Mindmap Orientierung und Routing

Status: Backlog
Build-Order-Punkt: 5
Parallelisierbar: teilweise, parallel zu 04 und 06 moeglich

## Ziel

Das NotebookLM-Asset `mind-map` wird als Themenuebersicht nutzbar. User koennen
ein Mindmap-Thema waehlen und daraus passende Unit-/Source-Kandidaten fuer Chat
oder Assets ableiten.

## Scope

- Vorhandenes NotebookLM-`mind-map`-Artifact bevorzugt laden, wenn es schon
  existiert.
- Mindmap ueber `notebooklm generate mind-map -n <notebook-id> --json`
  erzeugen, wenn kein passendes Artifact vorhanden ist.
- Mindmap ueber
  `notebooklm download mind-map <path> -n <notebook-id> --json` lokal speichern.
- Heruntergeladenes NotebookLM-Mindmap-JSON als lokale Hierarchie lesen.
- Knoten textuell anzeigen und fuer Auswahl referenzierbar machen.
- Mindmap-Knoten heuristisch auf Units/Sources matchen:
  - exact/fuzzy title match
  - Source title match
  - Unit title match
  - optional Source guide/fulltext keywords
- Bei unsicherem Match mehrere Kandidaten anzeigen und Auswahl verlangen.

## Nicht im Scope

- Embedding-Index als Pflicht.
- Stilles automatisches Routing bei schwachem Match.
- Garantie stabiler Mindmap-Node-IDs ueber mehrere Generierungen.

## Abhaengigkeiten

- Punkt 3: Unit -> ready NotebookLM Source IDs.
- NotebookLM CLI unterstuetzt `generate mind-map` und `download mind-map`.
- Lokales Routing arbeitet auf dem heruntergeladenen NotebookLM-Mindmap-JSON.
- Unit- und Source-Titel aus bestehendem Unit-Source-Mapping.

## Blocker

- Mindmap-JSON enthaelt keine Source IDs.
- Mindmap-JSON enthaelt keine stabilen Node IDs.
- Zu schwache Heuristik kann keine verwertbaren Unit-/Source-Kandidaten liefern.

## Umsetzungshinweise

- Persistente Mindmap-Referenzen nur als Textpfade modellieren.
- Matching-Ergebnis mit Confidence oder Warnungen speichern.
- Chat-Start erst nach expliziter Kandidatenauswahl erlauben, wenn mehrere
  plausible Matches existieren.
- Source-Routing weiter ueber wiederholtes `-s <source-id>` ausfuehren.

## Akzeptanzkriterien

- User kann eine vorhandene oder neu erzeugte Mindmap anzeigen.
- User kann ein Mindmap-Thema waehlen.
- System zeigt passende Unit-/Source-Kandidaten mit Unsicherheiten.
- Chat kann mit der gewaehlten Kandidatenmenge gestartet werden.
- Unsichere Matches fuehren nicht zu stillem Source-Routing.

## Tests / Verifikation

- Generate- oder Download-Result fuer MIT 6.0001 liegt als JSON vor.
- Knotenliste wird aus NotebookLM-Mindmap-JSON gelesen.
- Ein bekannter Knoten wird auf mindestens eine passende Unit oder Source
  gemappt.
- Ein mehrdeutiger Knoten zeigt mehrere Kandidaten.
- Ein Knoten ohne Match zeigt eine klare Meldung und startet keinen Chat.
- Matching auf Units/Sources bleibt heuristisch, weil NotebookLM-Mindmap-JSON
  keine Source IDs und keine stabilen Node IDs garantiert.

## Uebergabe an Folge-Tickets

- Ticket 10 nutzt Mindmap-Auswahl als Topic-Kontext fuer V1-Chat.
- Ticket 04 kann spaeter Assets aus gewaehlten Mindmap-Kandidaten erzeugen.
