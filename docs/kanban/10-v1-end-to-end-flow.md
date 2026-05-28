# 10 V1 End-to-End-Flow

Status: Blocked
Build-Order-Punkt: 10
Parallelisierbar: nein, Integration nach 04-09 und 08b

## Ziel

Der V1-Flow verbindet Contract, Kandidatenauswahl, Material-Screening,
Lernplan, eigenes Path-Notebook, Mindmap, Chat und user-gesteuerte
Asset-Erstellung zu einem durchgehenden Lernpfad.

## Scope

- Contract erfassen oder laden.
- Top-3-5 Kandidaten aus Ticket 07 bestimmen.
- Hybrid Material Screening aus Ticket 08 ausfuehren.
- Learning Path Planner Baseline aus Ticket 08b ausfuehren.
- Eigenes Path-Notebook ueber Ticket 09 erstellen und auf `sources_ready`
  bringen.
- Mindmap erzeugen, speichern und als Orientierung anbieten.
- Chat auf Unit-, Topic- oder freie Frage-Kontexte routen.
- User-gesteuerte Asset-Erstellung aus Unit-, Chat- oder Topic-Kontext anbieten.

## Nicht im Scope

- Automatische Asset-Produktion ohne User-Befehl.
- Unbegrenzte Kurs- oder Source-Auswahl.
- Produktions-UI, falls CLI/JSON fuer V1-Akzeptanz reicht.

## Abhaengigkeiten

- Ticket 04: Asset-Erstellung aus Kontext.
- Ticket 05: Mindmap-Anzeige und Topic-Routing.
- Ticket 06: Upload/Wait-Spike-Ergebnisse.
- Ticket 07: Contract Normalizer und Candidate Selector.
- Ticket 08: Material Screening Gate.
- Ticket 08b: Learning Path Planner Baseline.
- Ticket 09: Path-Notebook Upload/Wait/Resume.

## Blocker

- Kein stabiler End-to-End-Flow ohne Path-Notebook.
- Kein Lernplan ohne Materialuebersicht und Planner-Baseline.
- Kein Mindmap-Schritt ohne `sources_ready`.
- Keine Asset-Integration ohne user-gesteuerte Asset-Erstellung.

## Umsetzungshinweise

- Flow muss die V1-Budgets erzwingen:
  - maximal 3-5 Kurskandidaten pro Contract
  - maximal 8-12 Units im ersten Lernplan
  - maximal 40-60 Sources pro Lernpfad-Notebook
  - keine unkontrollierten parallelen `ask`-Calls
- NotebookLM-Chat mit sichtbarem Loading-State planen.
- Lernplan erst nach Materialuebersicht ueber Ticket 08b finalisieren.
- Jeder Lernpfad hat genau ein eigenes Notebook.

## Akzeptanzkriterien

- Ein Contract erzeugt ueber Ticket 08b einen Lernpfad mit konkreten Units und
  Quellen.
- Lernplan wird erst nach Materialuebersicht finalisiert.
- Jeder Lernpfad hat genau ein eigenes Notebook.
- Pflichtquellen sind verarbeitet, bevor Mindmap erzeugt wird.
- Chat kann auf Unit-, Topic- oder freie Frage-Kontexte routen.
- Asset-Erstellung ist user-gesteuert und nutzt den aktuellen Lernkontext.

## Tests / Verifikation

- Golden Scenario "Ich will AI Apps bauen" erzeugt passenden Kurs-/Unit-Mix.
- Golden Scenario "Ich will Backprop verstehen" erzeugt neural-network-nahe
  Units und Quellen.
- Chat-Frage zu einer Unit nutzt nur passende Source IDs.
- Mindmap-Thema fuehrt zu Kandidaten statt stillem schwachem Routing.
- Asset-Anforderung nutzt dieselben Sources wie der aktive Kontext.

## Uebergabe an Folge-Tickets

- Nach Abschluss kann V1 in kleinere UX-, Qualitaets- und Persistenz-Tickets
  zerlegt werden.
- Offene Caveats aus NotebookLM-Latenz, Mindmap-Instabilitaet und Source-Fehlern
  werden als Folgearbeit dokumentiert.
