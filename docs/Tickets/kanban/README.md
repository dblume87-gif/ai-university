# Kanban Tickets V0.6 bis V1

Diese Tickets schneiden die offenen Recommended-Build-Order-Punkte 4-10 aus
`docs/V0_TO_V1_LEARNING_PATH_PLAN.md` in parallelisierbare Arbeitspakete.
Punkt 3, die kleine Unit-Source-Mapping-Schicht fuer MIT 6.0001, gilt als
vorgelagerte Arbeit und wird nur als Abhaengigkeit referenziert.

## Aktueller Stand

Stand: 2026-05-31

- Punkte 4-10 sind implementiert und per `npm test` verifiziert; ihre Tickets
  liegen jetzt unter [Prototype/](Prototype/).
- Punkt 6 hat zusaetzlich einen dokumentierten Live-Spike unter
  `docs/spike-artifacts/path-notebook-upload-wait-20260528/`.
- Punkt 10 ist als deterministischer End-to-End-Harness implementiert und per
  `npm test` sowie CLI-Smoke-Run verifiziert.
- Der Kardiologie-Testlauf ist als Insight fuer den ersten Agenten-MVP
  dokumentiert: [V1 Insights fuer Agenten-MVP](11-v1-insights-agent-mvp.md).
- Der naechste Bauabschnitt ist als eigenes Board abgeleitet:
  [Agent-Orchestration-MVP](MVP/) (aus der
  [MVP-Spec](../draft/agent-orchestration-mvp-spec.md)).

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
| 4 | [User-gesteuerte Asset-Erstellung](Prototype/04-user-gesteuerte-asset-erstellung.md) | Done | umgesetzt mit Asset-Store und `learn assets` Zugriff |
| 5 | [Mindmap Orientierung und Routing](Prototype/05-mindmap-orientierung-und-routing.md) | Done | umgesetzt mit lokaler Hierarchie und heuristischem Matching |
| 6 | [Upload/Wait-Spike fuer Path-Notebooks](Prototype/06-upload-wait-spike-path-notebooks.md) | Done | Spike abgeschlossen; Empfehlung: Go with caveats |
| 7 | [Contract Normalizer und Candidate Selector](Prototype/07-contract-normalizer-und-candidate-selector.md) | Done | umgesetzt mit deterministischem Selector und Thematic-Fit-Gate |
| 8 | [Hybrid Material Screening Gate](Prototype/08-hybrid-material-screening-gate.md) | Done | umgesetzt mit cached material overview und gaps |
| 8b | [Learning Path Planner Baseline](Prototype/08b-learning-path-planner-baseline.md) | Done | umgesetzt mit deterministischem JSON/Markdown-Plan |
| 9 | [Path-Notebook Upload/Wait/Resume](Prototype/09-path-notebook-upload-wait-resume.md) | Done | umgesetzt mit dry-run/resume-faehigem Notebook-State |
| 10 | [V1 End-to-End-Harness](Prototype/10-v1-end-to-end-flow.md) | Done | deterministischer Run-Harness vor Agenten-Orchestrator |
| 11 | [V1 Insights fuer Agenten-MVP](11-v1-insights-agent-mvp.md) | Insight | Erkenntnisse aus Kardiologie-Testlauf und Agenten-MVP-Risiken |

## Parallelisierungsuebersicht

- Erledigt: 04, 05, 06, 07, 08, 08b, 09, 10.
- Naechster Schritt: Agenten-MVP auf Basis des deterministischen Harness mit
  Goal Expansion, Gate-Interpretation und userfaehigen Recovery-Branches. Der
  Schnitt in baubare Arbeitspakete liegt im
  [Agent-Orchestration-MVP-Board](MVP/).

## Folge-Board: Agent-Orchestration-MVP

Der interaktive Chat-Loop und die vier Review-Gates sind als eigenes Board aus
der [MVP-Spec](../draft/agent-orchestration-mvp-spec.md) abgeleitet:
[docs/kanban/MVP/](MVP/). Foundation-Tickets (01 Provider-Runtime, 02
Contract-Selector-Bridge) sind sofort startbar; die uebrigen bauen darauf auf.

## Implementierte CLI-Anker

- `learn asset ...` und `learn assets list|show|download`
- `learn mindmap show|match`
- `learn contract ...`
- `learn candidates ...`
- `learn screen-materials ...`
- `learn plan ...`
- `learn notebook ...`
- `learn v1 run ...`
