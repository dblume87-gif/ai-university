# 05 Run-State: Persistenz, Atomic-Write und Resume

Status: Backlog
MVP-Modul: run-state
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 7, 10
Parallelisierbar: ja, nach Ticket 01; parallel zu Tickets 03/04/06

## Ziel

Der crash-sichere Run-Zustand mit nahtlosem Resume. `agent_state.json` haelt
Run-Zustand und Pointer (kein Verlauf), der Chat-Verlauf liegt append-only in
`conversation.jsonl`, Gate-Aktionen werden transaktional und atomar
geschrieben, und Resume validiert Artefakte ueber Hash + Fingerprint statt blind
einen Pfad zu laden.

## Scope

### `agent_state.json` (Run-Zustand + Pointer)

- Felder: `run_id`, `status` (`running|completed|stopped|failed`), `mode`
  (`dry_run|live_notebook`), `providers`, `phase`, `inputs`, `steps{}`,
  `conversation { log_path, last_turn_id }`, `handoffs`.
- Pro Step: `status`
  (`accepted|running|failed|stale|waiting_for_user|waiting_for_live_approval`),
  `depends_on`, `step_version`, `input_fingerprint`, `accepted_output`
  (`artifact_path`, `artifact_sha256`, `schema`, `summary`), `review`
  (`decision`, `provider`, `artifact_path`).
- Provider-Metadaten aus Ticket 01 (`provider`, `task`, `latency_ms`,
  `attempts`) pro Gate ablegen.
- `input_fingerprint` = `hash(step_name, step_version, task_policy_version,
  relevante User-/CLI-Inputs, akzeptierte Dependency-artifact_sha256,
  providerrelevante Settings)`.
- **Selector-Bruecke (kritisch):** `course_discovery.depends_on` enthaelt
  `goal_expansion`, und dessen `artifact_sha256` geht in den
  `course_discovery`-Fingerprint ein. Sonst aendert sich die Synonym-Map
  (-> andere `selector_terms` -> andere Kandidaten), aber Resume ueberspringt
  `course_discovery` faelschlich als unveraendert.

### `conversation.jsonl` (append-only Verlauf)

- Jeder relevante User-/Agent-Turn wird **sofort append-only** angehaengt; der
  Verlauf wird nie voll neu geschrieben.
- Jede Zeile endet auf `\n`; beim Resume wird eine letzte unvollstaendige Zeile
  (ohne `\n`) als abgebrochener Append verworfen (partial-line recovery).
- `agent_state.json` haelt nur `conversation.last_turn_id` als Pointer.

### Transaktionale Gate-Persistenz

Reihenfolge pro Gate-Aktion:
1. User-Turn an `conversation.jsonl` appenden (Zeile + `\n`).
2. Gate-Entscheidung in `agent_state.json` speichern.
3. Accepted Output / Review Decision schreiben (inkl. `artifact_sha256`).
4. Erst danach den naechsten Step starten.

### Atomic-Write-Pflicht

- `agent_state.json`, `reviews/<step>.review.json`, Accepted-Output-JSONs und
  Markdown-Begleitdateien werden nie in-place ueberschrieben, sondern als
  `write temp -> fsync -> rename` (POSIX-atomar) geschrieben.
- Ein `atomicWriteArtifact`-Wrapper kapselt das. Direkte `writeFileSync`-Saver
  sind im Agent-Flow nicht zulaessig fuer `agent_state.json`, `candidates.json`,
  `material-screening.json`, `learning-path.json`, `learning-path.md`.
- Bestehende `save*`-Funktionen nur nutzen, wenn auf Atomic-Write umgestellt
  oder ueber den Wrapper geschrieben.
- Liefert die Mechanik fuer `normalize_titles` (Ticket 04), das
  `learning-path.json` und `.md` gemeinsam neu schreibt und neu hasht.

### Resume (`learn agent chat --run <run-id>`)

- Ein `accepted` Step wird **nur** uebersprungen, wenn alle stimmen:
  `status === accepted` **und** Artefakt existiert **und** Datei-Hash ==
  `artifact_sha256` **und** `input_fingerprint` passt **und**
  `step_version`/Schema/Task-Policy kompatibel. Sonst:
  - `running` -> als `interrupted` markiert und neu gestartet.
  - `failed` -> nicht blind neu; gespeicherte Card/`next_action` zeigen.
  - `stale`/`invalidated` -> neu gestartet.
  - `waiting_for_user` -> dieselbe Card erneut.
  - `waiting_for_live_approval` -> keine Side Effects bis Freigabe.
  - NotebookLM-Side-Effects laufen idempotent ueber `path-notebook-state.json`
    weiter.
- `AGENT_RUN.md` als lesbarer Spiegel (Phasen, Card-Zusammenfassungen,
  Entscheidungen, Retry-History), analog zu `RUN.md`, aber chat-orientiert.

### Datei-Layout pro Run (`output/learning-paths/<run-id>/`)

`agent_state.json`, `conversation.jsonl`, `AGENT_RUN.md`,
`reviews/<step>.review.json`, `cards/<phase>.md`, `contract.json`,
`goal-expansion.json`, `candidates.raw.json`, `candidates.json`,
`material-screening.json`, `learning-path.json` / `.md`,
`path-notebook-state.json`.

## Nicht im Scope

- Die Reviewer-Logik (Tickets 03/04).
- Der readline-Loop und das Dispatchen von Karten (Ticket 07).
- Card-Rendering (Ticket 06).

## Abhaengigkeiten

- Ticket 01: Decision-/Review-Schema fuer `review`-Eintraege und
  Provider-Metadaten.
- Bestehendes `v1-run.js` (`runStep`/`checkGate`-Muster) als Adaptionsbasis.
- Bestehendes `store.js` als Referenz fuer Turn-Form (aber append-only statt
  Voll-Rewrite).

## Blocker

- Keine harten; profitiert vom Decision-Schema aus Ticket 01.

## Umsetzungshinweise

- Append-only schuetzt nur den **Verlauf**; `agent_state.json` wird je Gate neu
  geschrieben und braucht daher zwingend Atomic-Write.
- Ein Crash zwischen Schritt 2 und 3 hinterlaesst eine Decision ohne Artefakt;
  der Hash-/Fingerprint-Check erkennt das als `stale` und faehrt den Step neu.
- Schema ist 1:1 kompatibel mit dem Zielbild
  (`agent-orchestration-layer-plan.md`).

## Akzeptanzkriterien

- `agent_state.json` traegt Pointer + `artifact_sha256` + `input_fingerprint`,
  keinen Verlauf.
- `conversation.jsonl` ist append-only und ueberlebt Ctrl+C ohne Korruption.
- Alle State-/Review-/Accepted-Output-Artefakte gehen ueber Atomic-Write.
- `course_discovery.depends_on` enthaelt `goal_expansion`, dessen Hash im
  Fingerprint.
- Resume ueberspringt `accepted` Steps nur bei vollstaendig gueltigem Hash +
  Fingerprint; ein manipuliertes Artefakt loest `stale` + Re-Run aus.

## Tests / Verifikation

- Spec-Test 4b (Atomic-Write/Crash): Abbruch nach Schritt 2 vor Schritt 3 ->
  Resume erkennt Decision-ohne-Artefakt als `stale` und faehrt neu; eine
  kuenstlich abgeschnittene letzte `conversation.jsonl`-Zeile wird verworfen,
  ohne den Parser zu killen.
- Spec-Test 6 (Resume): Abbruch nach akzeptiertem Gate 3, `--run <id>` neu ->
  Wiedereinstieg beim ersten nicht-`accepted` Step, intaktes
  `conversation.jsonl` mit erhaltener `last_turn_id`; manipuliertes Artefakt ->
  `stale` + Re-Run.

## Uebergabe an Folge-Tickets

- Ticket 07 treibt die transaktionale Gate-Persistenz im Loop und liest den
  State beim Resume.
- Ticket 04 nutzt den `atomicWriteArtifact`-Wrapper fuer `normalize_titles`.
- Ticket 09 verifiziert Crash-Sicherheit und Resume end-to-end.
