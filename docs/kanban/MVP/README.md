# Kanban Tickets Agent-Orchestration-MVP

Diese Tickets schneiden die
[MVP-Spec Agent Orchestration Layer](../../draft/agent-orchestration-mvp-spec.md)
in parallelisierbare Arbeitspakete. Der MVP-Kern ist der interaktive Chat-Loop
`learn agent chat --new`, voll beweisbar mit dem blockierenden
`deterministic`-Provider; `codex-cli` ist gated und nicht-blockierend.

Die deterministische Pipeline (Contract, Selector, Material-Screening, Planner,
Path-Notebook, V1-Harness) existiert bereits und wird wiederverwendet — siehe
[Prototype-Tickets 04-10](../Prototype/) und
[V1 Insights fuer Agenten-MVP](../11-v1-insights-agent-mvp.md). Der Agent-Layer
ergaenzt nur fuenf neue Module: Provider-Bewertung an den Gates,
Retry-mit-User-Freigabe, den interaktiven Chat-Loop und Review-Cards.

## Aktueller Stand

Stand: 2026-05-31

- Spec finalisiert (drei Review-Runden eingearbeitet, Audit-Trail in der Spec).
- Tickets aus der Spec abgeleitet; Umsetzung noch nicht begonnen.

## Kanban-Spalten

- `Ready`: kann sofort begonnen werden.
- `Backlog`: fachlich beschrieben, abhaengig von vorgelagerter Arbeit.
- `Blocked`: harte Abhaengigkeit fehlt.
- `In Progress`: aktiv in Arbeit.
- `Done`: akzeptiert und verifiziert.

## Ticket-Reihenfolge

| Nr | Ticket | MVP-Modul | Status | Abhaengig von |
|----|--------|-----------|--------|---------------|
| 01 | [Provider-Runtime Interface und Deterministic](01-provider-runtime-interface-und-deterministic.md) | provider-runtime | Ready | — |
| 02 | [Contract Selector-Bridge (selector_terms)](02-contract-selector-bridge.md) | contract.js | Ready | — |
| 03 | [Quality-Review: Goal-Expansion und Topic-Fit](03-quality-review-goal-expansion-und-topic-fit.md) | quality-review | Backlog | 01, 02 |
| 04 | [Quality-Review: Source-Coverage und Plan-Quality](04-quality-review-source-coverage-und-plan-quality.md) | quality-review | Backlog | 01, 03 |
| 05 | [Run-State: Persistenz, Atomic-Write und Resume](05-run-state-persistenz-und-resume.md) | run-state | Backlog | 01 |
| 06 | [Review-Cards: Terminal-Rendering](06-review-cards-terminal-rendering.md) | review-cards | Backlog | 01 |
| 07 | [Session: Chat-Loop, Phasen-Maschine und Kommandos](07-session-chat-loop-und-phasen-maschine.md) | session | Blocked | 03, 04, 05, 06 |
| 08 | [codex-cli Live-Provider (gated, Auth-Smoke)](08-codex-cli-live-provider-gated.md) | provider-runtime | Blocked | 01, 03, 04, Auth-Smoke |
| 09 | [Deterministic Test-Suite und E2E](09-deterministic-test-suite-und-e2e.md) | querschnitt (Tests) | Backlog | 03-07 |

## Parallelisierungsuebersicht

- Sofort startbar (Foundation): 01 und 02 parallel.
- Danach parallel: 03, 04, 05, 06 (alle gegen das Interface aus 01; 03 zusaetzlich
  gegen die Bruecke aus 02; 04 gegen `candidates.json` aus 03).
- Integration: 07 buendelt 03/04/05/06 zum Loop (blockierendes MVP-Ziel).
- Gated/nicht-blockierend: 08 (codex-cli) erst nach Auth-Smoke; faellt der Smoke,
  bleibt der MVP `deterministic`-only und 08 wird erste Post-MVP-Aufgabe.
- Tests: 09 begleitet 03-07; E2E-Teile erst nach 07.

## Neue Module (Spec Abschnitt 11)

Unter `ocw-pipeline/src/learning/agent/`:

```text
provider-runtime/   # reviewJson-Interface + deterministic-Provider (+ codex-cli, gated)
run-state/          # agent_state.json + conversation.jsonl + AGENT_RUN.md + Resume
quality-review/     # 4 Reviewer + Gate-Decision-Modell
review-cards/       # Terminal-Card-Rendering
session/            # readline-Loop + Phasen-Maschine + In-Session-Kommandos
```

## Bewusst deferred (Phase 2+)

- Weitere Provider: `claude-code`, `gemini-api`, `gemini-cli`, `openai-api`.
- `learning-assets` (Study Guides, Quiz, Flashcards) als eigene Pipeline.
- NotebookLM-native Artifacts und Mindmap-Source-Routing.
- Persistente User-Profile und Lernhistorie.
- Web-UI als zweite Oberflaeche.
- `learn agent run` als separater nicht-interaktiver Befehl.
