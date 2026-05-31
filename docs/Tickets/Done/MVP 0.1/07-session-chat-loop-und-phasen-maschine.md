# 07 Session: Chat-Loop, Phasen-Maschine und In-Session-Kommandos

Status: Blocked
MVP-Modul: session
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 2, 3, 6, 9
Parallelisierbar: nein, Integration nach Tickets 03/04/05/06

## Ziel

Der MVP-Kern: der interaktive Chat-Loop `learn agent chat --new`, der die acht
Produktphasen ueber die bestehenden Pipeline-Schritte und die vier Gates
treibt. Dies ist das blockierende MVP-Ziel (voll beweisbar mit dem
`deterministic`-Provider) und bindet alle anderen Tickets zusammen.

## Scope

### Command-Surface

- Dispatch ueber `node src/scrape.js learn agent ...` (Working dir
  `ocw-pipeline/`):
  ```bash
  node src/scrape.js learn agent chat --new
  node src/scrape.js learn agent chat --run <run-id>
  node src/scrape.js learn agent status --run <run-id>
  ```
- Dry-Run ist Default; echte NotebookLM-Aktionen brauchen `--live-notebook` beim
  Start **oder** explizite Freigabe im Chat.
- `--provider deterministic` (Default) oder `--provider codex-cli` (gated,
  Ticket 08).
- `--db`, `--out`, `--units-root` wie in `learn v1 run` durchreichen.
- `learn v1 run` und `learn chat` bleiben unveraendert.
- Offene Scope-Frage (benannt, nicht angenommen): ein kuerzeres `learn`-Bin
  (`package.json` `bin`) existiert heute nicht; bis zur bewussten Entscheidung
  gilt die `node src/scrape.js ...`-Surface.

### Phasen-Maschine

Acht Phasen, gemappt auf Reuse-Schritt und Gate:

| # | Phase | Schritt (reuse) | Gate |
|---|---|---|---|
| 1 | Ziel verstehen | `normalizeLearningContract` | — (`ask_user` wenn leer/vage) |
| 2 | Suchrichtung festlegen | Goal-Expansion | Goal-Expansion |
| 3 | Kurse waehlen | `selectCourseCandidates` | Topic-Fit |
| 4 | Quellen pruefen | `screenCandidateMaterials` | Source-Coverage |
| 5 | Lernpfad bauen | `buildLearningPathPlan` | Plan-Quality |
| 6 | Lernraum vorbereiten | `runPathNotebookWorkflow` (dry-run) | Notebook-Readiness (deterministisch) |
| 7 | Loslernen | `chat.js` Tutor | — |
| 8 | Weiterfuehren | Resume | — |

- Loop pro Phase: Schritt ausfuehren -> Reviewer bewertet -> Decision
  (`accepted` -> naechste Phase; `retry` -> Card + Freigabe + Re-Run mit
  angepassten Params; `ask_user` -> Card + warten; `stop` -> Run beenden, State
  sichern).
- Bruecke 2 -> 3: Phase 3 ruft `selectCourseCandidates` mit `selector_terms` aus
  `goal-expansion.json` auf (Bruecke aus Ticket 02/03).
- Bruecke 3 -> 4: Orchestrator schreibt `candidates.raw.json` (roh) und
  `candidates.json` (akzeptiert/gefiltert); alle Downstream-Schritte lesen nur
  `candidates.json`.

### Retry- und Action-Dispatch

- Auch bei `decision: "retry"` startet der Agent **nie autonom** neu: erst nach
  `yes`/Auswahl Re-Run mit angepassten Params.
- Retry-Budget Default 2 pro Schritt, im State mitgefuehrt.
- `yes` loest **nur** die `safe_default: true`-Aktion aus; riskante Aktionen
  (`continue_anyway`) muessen voll getippt werden (`continue anyway`).
- Actions sind **gate-skopiert**: jede Eingabe wird gegen die `proposed_actions`
  der gerade offenen Card dispatcht, nie ueber einen globalen Handler. Nicht
  angebotene Actions -> "nicht verfuegbar"-Hinweis statt stiller
  Fehlinterpretation.
- `recover_sources`-Re-Run setzt `rescreenMissing: true`/
  `exportMissingUnits: true`; `normalize_titles`-Re-Run aktualisiert
  `learning-path.json` und `.md` ueber den Atomic-Writer (Ticket 05).

### In-Session-Kommandos

`yes`, `broaden`, `deep scan` (-> `recover_sources`), `continue anyway`,
`skip notebook`, `status`, `quit`. Alles andere ist freie User-Aeusserung
(Zielklaerung Phase 1 oder Tutor-Frage Phase 7).

## Nicht im Scope

- Die Reviewer-Regeln (Tickets 03/04) und das Card-Rendering (Ticket 06).
- State-Schema und Atomic-Write-Mechanik (Ticket 05).
- codex-cli (Ticket 08).
- `learn agent run` als separater nicht-interaktiver Befehl (deferred).

## Abhaengigkeiten

- Ticket 03: Goal-Expansion + Topic-Fit + Gate-Decision-Modell.
- Ticket 04: Source-Coverage + Plan-Quality.
- Ticket 05: State, Persistenz, Resume, Atomic-Write.
- Ticket 06: Card-Rendering.
- Bestehend: `contract.js`, `material-screening.js`, `planner.js`,
  `path-notebook.js`, `chat.js`, `scrape.js`-Dispatch.

## Blocker

- Tickets 03, 04, 05, 06 nicht fertig.

## Umsetzungshinweise

- Neues Verzeichnis `src/learning/agent/session/` (readline-Loop + Phasen-
  Maschine + Kommando-Parsing).
- Die transaktionale Gate-Persistenz (Ticket 05, Schritte 1-4) wird hier
  getrieben: User-Turn appenden -> Decision speichern -> Accepted Output
  schreiben -> erst dann naechster Step.
- Persistenz ist Source of Truth, In-Memory-Kontext nur Cache.

## Akzeptanzkriterien

- `learn agent chat --new` startet einen Run, schreibt `agent_state.json` und
  betritt den Loop.
- Alle vier Gates werden im Loop reviewt; jede Retry-Aktion braucht
  User-Freigabe (kein autonomer Retry).
- `yes` greift nur bei sicheren Default-Aktionen; riskante Aktionen nur voll
  getippt.
- Eingaben werden gate-skopiert gegen die aktive Card dispatcht.
- Downstream-Schritte lesen nur `candidates.json`, nie `candidates.raw.json`.
- Dry-Run ist Default; Live-Notebook nur per Flag oder expliziter Freigabe.

## Tests / Verifikation

- Spec-Test 1 (E2E Happy Path): Fixture-Corpus-Ziel (Accounting oder Intro-CS),
  `chat --new` bis Dry-Run-Plan mit gescripteten `yes`-Antworten -> `status:
  completed`, alle Steps `accepted`.
- Spec-Test 2 (No-Candidate/Recovery, Kardiologie): gescripteter Pfad
  `broaden` -> `refine`; Agent zeigt Recovery-Cards, bricht nicht still ab.
- Spec-Test 7 (Safe-Default/`yes`): `yes` auf unsicherer Card ist No-op mit
  Hinweis; erst `continue anyway` fuehrt die Aktion aus.
- Gate-skopierter Dispatch: eine nicht angebotene Action -> "nicht
  verfuegbar"-Hinweis.

## Uebergabe an Folge-Tickets

- Ticket 08 schaltet `--provider codex-cli` ohne Loop-Aenderung scharf.
- Ticket 09 fuehrt den vollen Testplan gegen den Loop aus.
- Deferred: `learn agent run`, persistente User-Profile, Web-UI.
