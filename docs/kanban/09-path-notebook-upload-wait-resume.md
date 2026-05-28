# 09 Path-Notebook Upload/Wait/Resume

Status: Blocked
Build-Order-Punkt: 9
Parallelisierbar: nein, harte Abhaengigkeit von 06 und 08b

## Ziel

Jeder V1-Lernpfad bekommt genau ein eigenes NotebookLM-Notebook. Relevante
Sources werden hochgeladen, auf Ready verarbeitet und mit Resume-State lokal
nachvollziehbar gespeichert.

## Scope

- Path-Notebook mit stabilem Titelmuster erstellen, z.B.
  `AIU Path: <short goal> - <session_id>`.
- Relevante Pflicht- und optionale Quellen aus Ticket 08b hochladen.
- Upload- und Wait-Gate aus Ticket 06 anwenden.
- Pflichtquellen muessen verarbeitet sein, bevor Mindmap erzeugt wird.
- Lokalen Learning-Path-State mit Notebook-ID, Source-Status und Resume-Punkt
  speichern.
- Statuswerte mindestens abbilden:
  - `creating_notebook`
  - `uploading_sources`
  - `sources_ready`
  - `mindmap_ready`
  - `failed`

## Nicht im Scope

- Contract Normalizer und Candidate Selector.
- Hybrid Material Screening.
- Mindmap-Routing-Heuristik.
- Voller V1-End-to-End-Flow.

## Abhaengigkeiten

- Ticket 06 klaert NotebookLM Create/Add/Wait/List-Verhalten.
- Ticket 08b liefert Learning Path, `required_source_ids` und
  `optional_source_ids`.
- Learning-Path-State-Struktur aus `docs/DATA_MODEL.md`.

## Blocker

- Upload/Wait-Spike liefert kein belastbares Ready-Gate.
- Kein finalisierter Learning Path mit Pflichtquellen.
- NotebookLM Upload oder Processing scheitert fuer Pflichtquellen.

## Umsetzungshinweise

- Pro Lernpfad genau ein Notebook erstellen.
- V1-Budget einhalten: maximal 40-60 Sources pro Lernpfad-Notebook.
- Nur Quellen hochladen, die im Learning Path als erforderlich oder optional
  markiert sind.
- Resume-State nach jedem externen NotebookLM-Schritt schreiben.
- Optional Sources duerfen fehlschlagen, Pflichtquellen blockieren Mindmap und
  Aktivierung.

## Akzeptanzkriterien

- Ein Path-Notebook wird erstellt und lokal mit `notebook_id` gespeichert.
- Relevante Sources werden hochgeladen und mit finalem Status gespeichert.
- `sources_ready` wird erst erreicht, wenn alle Pflichtquellen verarbeitet sind.
- Fehlgeschlagene Pflichtquellen setzen den Lernpfad auf `failed` oder einen
  expliziten Review-/Retry-Zustand.
- Workflow kann nach Teilfortschritt aus lokalem State nachvollzogen werden.

## Tests / Verifikation

- Dry-Run oder kleiner Spike-Datensatz erzeugt erwarteten State-Verlauf.
- Erfolgreicher Upload fuehrt zu `sources_ready`.
- Fehlgeschlagene Pflichtquelle verhindert Mindmap-Erzeugung.
- Wiederholter Lauf erkennt vorhandene Notebook-ID und vermeidet doppeltes
  Erstellen.

## Uebergabe an Folge-Tickets

- Ticket 10 nutzt Path-Notebook-ID, Source IDs und `sources_ready` Gate.
- Ticket 05 kann Mindmap-Erzeugung fuer das neue Path-Notebook anschliessen.
