# Kanban Tickets V0.6 bis V1

Diese Tickets schneiden die offenen Recommended-Build-Order-Punkte 4-10 aus
`docs/V0_TO_V1_LEARNING_PATH_PLAN.md` in parallelisierbare Arbeitspakete.
Punkt 3, die kleine Unit-Source-Mapping-Schicht fuer MIT 6.0001, gilt als
vorgelagerte Arbeit und wird nur als Abhaengigkeit referenziert.

## Kanban-Spalten

- `Ready`: kann sofort begonnen werden.
- `Backlog`: fachlich beschrieben, aber abhaengig von vorgelagerter Arbeit oder
  Priorisierung.
- `Blocked`: harte Abhaengigkeit fehlt.
- `In Progress`: aktiv in Arbeit.
- `Done`: akzeptiert und verifiziert.

## Ticket-Reihenfolge

| Punkt | Ticket | Status | Parallelisierung |
|-------|--------|--------|------------------|
| 4 | [User-gesteuerte Asset-Erstellung](04-user-gesteuerte-asset-erstellung.md) | Backlog | parallel zu 05, 06, 07 |
| 5 | [Mindmap Orientierung und Routing](05-mindmap-orientierung-und-routing.md) | Backlog | teilweise parallel zu 04, 06, 07 |
| 6 | [Upload/Wait-Spike fuer Path-Notebooks](06-upload-wait-spike-path-notebooks.md) | Ready | sofort parallel |
| 7 | [Contract Normalizer und Candidate Selector](07-contract-normalizer-und-candidate-selector.md) | Backlog | sofort vorbereitbar |
| 8 | [Hybrid Material Screening Gate](08-hybrid-material-screening-gate.md) | Backlog | nach 07 |
| 8b | [Learning Path Planner Baseline](08b-learning-path-planner-baseline.md) | Backlog | nach 07 und 08 |
| 9 | [Path-Notebook Upload/Wait/Resume](09-path-notebook-upload-wait-resume.md) | Blocked | nach 06 und 08b |
| 10 | [V1 End-to-End-Flow](10-v1-end-to-end-flow.md) | Blocked | nach 04-09 und 08b |

## Parallelisierungsuebersicht

- Sofort parallel: 04, 05, 06, 07.
- Danach: 08 nach 07.
- Danach: 08b nach 07 und 08.
- Danach: 09 nach 06 und 08b.
- Danach: 10 nach 04-09 und 08b.
