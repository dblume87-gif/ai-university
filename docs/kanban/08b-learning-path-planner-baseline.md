# 08b Learning Path Planner Baseline

Status: Backlog
Build-Order-Punkt: V1 Flow 4
Parallelisierbar: nein, harte Abhaengigkeit von 07 und 08

## Ziel

Aus normalisiertem Contract und Materialuebersicht entsteht ein deterministischer
Learning Path mit 8-12 Units, konkreten Quellen, Reihenfolge und klar markierten
Gaps. Diese Baseline kommt ohne Agenten- oder LLM-Unterstuetzung aus.

## Scope

- Normalisierten Contract aus Ticket 07 lesen.
- Materialuebersicht, Usable Sources und Gaps aus Ticket 08 lesen.
- Units regelbasiert auswaehlen, sortieren und auf maximal 8-12 Units begrenzen.
- Pro Unit speichern:
  - `unit_id`
  - `title`
  - `learning_goal`
  - `order`
  - `difficulty`
  - `estimated_effort`
  - `source_ids`
  - `required_source_ids`
  - `optional_source_ids`
  - `gaps`
  - `reason`
- Lernplantext aus Templates erzeugen, nicht per LLM.
- Output als JSON und Markdown speichern, damit Ticket 09 und 10 ihn direkt
  weiterverwenden koennen.

## Nicht im Scope

- LLM-/Agent-basierte didaktische Planung.
- Freie semantische Interpretation vager Ziele.
- NotebookLM-Notebook-Erstellung oder Upload.
- Mindmap-Erzeugung.
- Chat oder Asset-Erstellung.

## Abhaengigkeiten

- Ticket 07 liefert normalisierten Contract und Candidate Course IDs.
- Ticket 08 liefert Materialuebersicht, Usable Sources und Gaps.
- `course_units.json` oder aequivalente Unit-Daten sind fuer ausgewaehlte Kurse
  verfuegbar oder als Gap markiert.

## Blocker

- Kein normalisierter Contract.
- Keine Materialuebersicht fuer Kandidaten.
- Keine Units mit realen Quellen und keine sinnvoll markierbaren Gaps.
- Contract-Felder sind so unvollstaendig, dass keine Reihenfolge oder
  Schwierigkeit ableitbar ist.

## Umsetzungshinweise

- Der Planner ist deterministisch und template-basiert.
- `current_level: beginner` bevorzugt Grundlagen-, Intro- und niedrigere
  Schwierigkeitsstufen frueh im Plan.
- `target_outcome: prototype` und `style: practical` bevorzugen Units mit
  Projects, Programming Assignments, Problem Sets oder konkreten
  Implementierungsquellen.
- `preferred_materials` priorisiert passende Source-Typen, darf aber keine Units
  ohne Pflichtquellen erzwingen.
- `language` wird in JSON und Markdown weitergereicht und fuer Template-Texte
  genutzt.
- Gaps werden sichtbar in den Plan geschrieben statt durch Annahmen ersetzt.

## Akzeptanzkriterien

- Ein Contract plus Materialuebersicht erzeugt einen Learning-Path-Output.
- Der Plan enthaelt maximal 8-12 Units.
- Jede Unit hat echte Sources oder klar markierte Gaps.
- Pflicht- und optionale Quellen sind getrennt.
- Reihenfolge, Lernziel, Schwierigkeit und Aufwand sind fuer jede Unit
  nachvollziehbar.
- Output ist stabil genug, damit Ticket 09 nur noch relevante Quellen hochladen
  muss.

## Tests / Verifikation

- Golden Scenario "Ich will AI Apps bauen" erzeugt einen praktischen
  Python/AI/Prototype-nahen Unit-Mix.
- Golden Scenario "Ich will Backprop verstehen" erzeugt neural-network-nahe
  Grundlagen- und Vertiefungsunits.
- `current_level: beginner` verschiebt Grundlagen vor fortgeschrittene Units.
- `target_outcome: prototype` und `style: practical` erhoehen Units mit
  Project-/Programming-/Problem-Set-Quellen.
- Plan bricht mit klarer Meldung ab, wenn keine Units oder Sources verfuegbar
  sind.
- Markdown und JSON enthalten dieselben Unit IDs und Source IDs.

## Uebergabe an Folge-Tickets

- Ticket 09 liest `required_source_ids` und `optional_source_ids` fuer den
  Path-Notebook-Upload.
- Ticket 10 nutzt den fertigen Learning Path als Integrationsartefakt.

