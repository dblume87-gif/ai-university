# 10 V1 End-to-End-Harness

Status: Done
Build-Order-Punkt: 10
Parallelisierbar: nein, Integration nach 04-09 und 08b

## Ziel

Ticket 10 baut keinen finalen Produkt-Flow und keine Agenten-Schicht. Es kapselt
die vorhandenen V1-Bausteine in einen deterministischen End-to-End-Harness, der
einen kompletten Run reproduzierbar ausfuehrt, Artefakte speichert und harte
Gates prueft.

Der Harness ist das Integrationsrueckgrat fuer die spaetere Agenten-Orchestrator-
Schicht.

## Scope

- CLI-Einstieg fuer einen V1-Run, z.B.
  `learn v1 run --goal "Ich will AI Apps bauen"`.
- Pro Run einen eigenen Artefaktordner erzeugen, z.B.
  `output/learning-paths/<run-id>/`.
- Deterministisch ausfuehren:
  - Contract normalisieren oder laden.
  - Top-3-5 Kandidaten aus Ticket 07 bestimmen.
  - Hybrid Material Screening aus Ticket 08 ausfuehren.
  - Learning Path Planner Baseline aus Ticket 08b ausfuehren.
  - Path-Notebook Workflow aus Ticket 09 im Default als Dry-Run ausfuehren.
- Schrittstatus, Artefaktpfade, Gates, Warnungen und Fehler in `run.json` und
  `RUN.md` speichern.
- V1-Budgets erzwingen:
  - maximal 3-5 Kurskandidaten pro Contract
  - maximal 8-12 Units im ersten Lernplan
  - maximal 40-60 Sources pro Lernpfad-Notebook
  - keine unkontrollierten parallelen `ask`-Calls
- Optionaler Live-Notebook-Modus nur explizit, z.B. `--live-notebook` oder ohne
  `--dry-run`, damit Tests standardmaessig keine externen NotebookLM-Side-
  Effects haben.

## Nicht im Scope

- Agentische Zielklaerung, Re-Ranking oder freie Planoptimierung.
- Produktions-UI.
- Automatische Asset-Produktion.
- Echter Chat als Teil des Harness-Defaults.
- Mindmap-Erzeugung im Dry-Run, wenn kein echtes Notebook mit `sources_ready`
  existiert.
- Vollstaendige Qualitaetsbewertung des Lernplans.

## Abhaengigkeiten

- Ticket 04: Asset-Erstellung und Asset-Store fuer spaetere Handoffs.
- Ticket 05: Mindmap-Anzeige und Topic-Routing fuer spaetere Handoffs.
- Ticket 06: Upload/Wait-Spike-Ergebnisse.
- Ticket 07: Contract Normalizer und Candidate Selector inklusive
  Thematic-Fit-Gate.
- Ticket 08: Material Screening Gate.
- Ticket 08b: Learning Path Planner Baseline.
- Ticket 09: Path-Notebook Upload/Wait/Resume.

## Gates

- Keine Kandidaten -> Run stoppt mit `failed:candidates`.
- Keine usable Sources -> Run stoppt mit `failed:materials`.
- Kein Lernplan mit Units -> Run stoppt mit `failed:plan`.
- Notebook-State nicht `sources_ready` -> Run stoppt oder warnt je nach
  Dry-Run-/Live-Modus.
- Kandidaten ohne `thematic_fit.gate: "passed"` duerfen nicht in den Run
  eingehen.

## Handoffs

- Mindmap: im Dry-Run als `skipped:live_notebook_required` dokumentieren; im
  Live-Modus erst nach `sources_ready` anschliessen.
- Chat: keine NotebookLM-Frage im Harness; pruefen, dass Units Source IDs fuer
  spaeteres `learn chat` enthalten.
- Assets: keine automatische Asset-Erzeugung; pruefen, dass Unit-/Source-
  Kontexte fuer spaeteres `learn asset` vorhanden sind.

## Akzeptanzkriterien

- Ein einzelner CLI-Run erzeugt Contract, Candidates, Material-Screening,
  Learning Path und Path-Notebook-State in einem Run-Ordner.
- `run.json` enthaelt Schrittstatus, Artefaktpfade, Gate-Ergebnisse und
  Warnungen.
- `RUN.md` fasst denselben Run fuer Review lesbar zusammen.
- Dry-Run endet fuer das Golden Scenario "Ich will AI Apps bauen" mit einem
  Notebook-State `sources_ready`.
- Der Run verwendet keine fachfremden Kandidaten, die am Thematic-Fit-Gate
  scheitern.
- Der Harness ist wiederholbar, ohne bestehende Run-Artefakte still zu
  ueberschreiben.

## Tests / Verifikation

- Golden Scenario "Ich will AI Apps bauen" erzeugt einen Run-Ordner mit:
  - `contract.json`
  - `candidates.json`
  - `material-screening.json`
  - `learning-path.json`
  - `learning-path.md`
  - `path-notebook-state.json`
  - `run.json`
  - `RUN.md`
- Candidate-Output enthaelt keine fachfremden Kurse wie Microeconomics.
- Material-Screening enthaelt `candidate_courses`, `course_material_overviews`,
  `usable_sources`, `gaps` und `recommendation_basis`.
- Learning Path enthaelt 8-12 Units mit required/optional Source IDs.
- Notebook Dry-Run erzeugt `sources_ready` und maximal 60 Sources.
- Fehlerfall mit leerem oder zu vagem Contract schreibt einen fehlgeschlagenen
  Run mit Diagnose.

## Erkenntnisse aus erstem Domain-Test

Der Harness wurde nach Umsetzung mit `Kardiologie` und `current_level:
beginner` getestet. Der Run stoppte reproduzierbar bei `failed:candidates`, weil
die deterministische Candidate Selection keine explizit passenden Kurskandidaten
aus dem lokalen OCW-Korpus fand.

Ein zweiter Test mit englischerem Goal
`cardiovascular physiology anatomy for beginners` erreichte die Candidate-Phase,
stoppte aber bei `failed:materials`, weil keine usable Sources fuer den Lernpfad
vorlagen.

Interpretation:

- Der Harness erfuellt seine Integrationsaufgabe: Gates stoppen frueh und
  nachvollziehbar.
- Der erste Agenten-MVP muss No-Candidate- und No-Usable-Sources-Faelle aktiv
  behandeln, statt nur einen deterministischen Run auszufuehren.
- Domain- und Sprach-Expansion gehoeren vor die Candidate Selection, z.B.
  `Kardiologie` -> `cardiology`, `cardiovascular`, `heart`, `medicine`,
  `physiology`, `anatomy`.
- Medizinische Themen brauchen einen Bildungs-Scope und duerfen nicht als
  Diagnose- oder Therapieberatung gerahmt werden.

Details: [V1 Insights fuer Agenten-MVP](11-v1-insights-agent-mvp.md).

## Uebergabe an Folge-Tickets

- Agenten-Orchestrator nutzt diesen Harness als deterministische Toolchain.
- Agenten-Orchestrator interpretiert Gates und kann bei `failed:candidates` oder
  `failed:materials` Goal Expansion, breitere Suchrichtungen oder User-Review
  starten.
- UX-/Review-Tickets koennen `run.json`, `RUN.md` und die erzeugten Artefakte
  anzeigen.
- Offene Caveats aus NotebookLM-Live-Upload, Mindmap-Instabilitaet und
  Source-Fehlern werden als Folgearbeit dokumentiert.
