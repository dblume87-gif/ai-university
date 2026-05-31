# Kanban Tickets und MVP-Stand

Dieses Board dokumentiert zwei Straenge:

- die abgeschlossenen Prototype-/MVP-0.1-Tickets aus dem alten
  `ocw-pipeline`-basierten Orchestrierungsansatz;
- den neuen, sauber getrennten Search-Agent-MVP unter `mvp/`, der nach den
  Tickets 000, 001a und 001b gestartet wurde.

## Aktueller Stand

Stand: 2026-05-31

- Punkte 4-10 sind implementiert und per `npm test` verifiziert; ihre Tickets
  liegen jetzt unter [Done/Prototype/](../Done/Prototype/).
- Punkt 6 hat zusaetzlich einen dokumentierten Live-Spike unter
  `docs/spike-artifacts/path-notebook-upload-wait-20260528/`.
- Punkt 10 ist als deterministischer End-to-End-Harness implementiert und per
  `npm test` sowie CLI-Smoke-Run verifiziert.
- Der Kardiologie-Testlauf ist als Insight fuer den ersten Agenten-MVP
  dokumentiert: [V1 Insights fuer Agenten-MVP](11-v1-insights-agent-mvp.md).
- Das alte deterministische Agent-Orchestration-Board ist abgeschlossen und
  archiviert unter [Done/MVP 0.1/](../Done/MVP%200.1/).
- Der neue MVP-Pfad ist nicht mehr im alten `ocw-pipeline`-Layer verankert,
  sondern lebt unter `mvp/`:
  [000 Skeleton](../Done/000-mvp-package-skeleton.md),
  [001a Codex-MCP-Spike](../Done/001a-spike-codex-mcp-tool-calling.md),
  [001b Search-Agent-MVP](../Done/001b-search-agent-mvp.md).

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
| 4 | [User-gesteuerte Asset-Erstellung](../Done/Prototype/04-user-gesteuerte-asset-erstellung.md) | Done | umgesetzt mit Asset-Store und `learn assets` Zugriff |
| 5 | [Mindmap Orientierung und Routing](../Done/Prototype/05-mindmap-orientierung-und-routing.md) | Done | umgesetzt mit lokaler Hierarchie und heuristischem Matching |
| 6 | [Upload/Wait-Spike fuer Path-Notebooks](../Done/Prototype/06-upload-wait-spike-path-notebooks.md) | Done | Spike abgeschlossen; Empfehlung: Go with caveats |
| 7 | [Contract Normalizer und Candidate Selector](../Done/Prototype/07-contract-normalizer-und-candidate-selector.md) | Done | umgesetzt mit deterministischem Selector und Thematic-Fit-Gate |
| 8 | [Hybrid Material Screening Gate](../Done/Prototype/08-hybrid-material-screening-gate.md) | Done | umgesetzt mit cached material overview und gaps |
| 8b | [Learning Path Planner Baseline](../Done/Prototype/08b-learning-path-planner-baseline.md) | Done | umgesetzt mit deterministischem JSON/Markdown-Plan |
| 9 | [Path-Notebook Upload/Wait/Resume](../Done/Prototype/09-path-notebook-upload-wait-resume.md) | Done | umgesetzt mit dry-run/resume-faehigem Notebook-State |
| 10 | [V1 End-to-End-Harness](../Done/Prototype/10-v1-end-to-end-flow.md) | Done | deterministischer Run-Harness vor Agenten-Orchestrator |
| 11 | [V1 Insights fuer Agenten-MVP](11-v1-insights-agent-mvp.md) | Insight | Erkenntnisse aus Kardiologie-Testlauf und Agenten-MVP-Risiken |
| 000 | [MVP Package Skeleton und Tool-Boundary](../Done/000-mvp-package-skeleton.md) | Done | eigener `mvp/`-Ordner, lokale DB-Kopie, Import-Boundary |
| 001a | [codex Tool-Calling via MCP beweisen](../Done/001a-spike-codex-mcp-tool-calling.md) | Done | MCP funktioniert mit Approval/Sandbox-Bypass; Headless Safe-Mode cancelled Tool-Call |
| 001b | [Search-Agent MVP](../Done/001b-search-agent-mvp.md) | Done | Codex-Provider-Adapter, eigener Agent-Tool-Loop, `searchCourses`, `conversation.jsonl` |

## Parallelisierungsuebersicht

- Erledigt: Prototype 04-10, MVP 0.1, neuer MVP-Skeleton/Spike/Search-Agent
  000-001b.
- Naechster Schritt: Search-Agent-MVP fachlich verbessern. Wichtig sind bessere
  Query-Expansion, bessere Kurs-Evidence, Material-Screening als additiver
  Evidence-Layer und User-Freigabe, bevor Kandidaten dauerhaft behalten werden.

## Architekturstand

`ocw-pipeline` bleibt Bausteinkasten und Testumgebung. Der neue MVP-Pfad lebt
unter `mvp/` und nutzt eine lokale Kopie von `library.db`. Deterministische
Funktionen sind dort Werkzeuge des Agenten, nicht versteckte Fallback-Policy.

Der Codex-MCP-Spike hat gezeigt: Native MCP-Tool-Calls funktionieren technisch,
brauchen im Headless-Lauf aber Approval/Sandbox-Bypass. Der Produktpfad nutzt
deshalb einen eigenen Agent-Tool-Loop: Codex fordert `searchCourses` per
strukturiertem JSON an, der lokale Loop fuehrt das Tool aus und replayt die
Conversation.

## Implementierte CLI-Anker

- `learn asset ...` und `learn assets list|show|download`
- `learn mindmap show|match`
- `learn contract ...`
- `learn candidates ...`
- `learn screen-materials ...`
- `learn plan ...`
- `learn notebook ...`
- `learn v1 run ...`
