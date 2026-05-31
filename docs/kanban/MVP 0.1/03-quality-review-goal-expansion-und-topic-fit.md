# 03 Quality-Review: Goal-Expansion und Topic-Fit

Status: Backlog
MVP-Modul: quality-review
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 5.1, 5.2, 6
Parallelisierbar: ja, nach Tickets 01 und 02; parallel zu Ticket 04

## Ziel

Die zwei gekoppelten Reviewer der ersten Phasen plus das gemeinsame
Gate-Decision-Modell. Goal-Expansion liefert die kanonische Match-Basis,
Topic-Fit bewertet Kandidaten auf **Kandidaten-Ebene** und schreibt den
gefilterten Downstream-Kandidatensatz. Dies ist der kritische Pfad gegen den
Term-Mismatch-Bug (deutscher Goal matcht nie englische Topics) und gegen den
Accounting-False-Positive.

## Scope

### Goal-Expansion (`task: "goal_expansion"`)

- Input: normalisierter Contract (Goal, Level, Sprache, Materialien).
- Strukturiert zu
  `{ domain_terms, synonyms, translations, topic_terms, language, level, exclusions }`
  ueber eine kleine statische Synonym-/Uebersetzungs-Map
  (z.B. `kardiologie -> { synonyms: [heart disease], translations: [cardiology, cardiovascular] }`).
- Unbekannte Goals werden tokenisiert und unveraendert als `domain_terms`
  uebernommen.
- `topic_terms` = lowercased, deduplizierte Vereinigung aus
  `domain_terms + synonyms + translations`. Das ist die **einzige** Liste,
  gegen die Topic-Fit matcht (nie `domain_terms` allein).
- `selector_terms` = `topic_terms` plus Token aus dem Original-Goal; wird in
  Phase 3 an `selectCourseCandidates` uebergeben (Bruecke aus Ticket 02).
- Decision: `accepted`. Ausnahme: Goal leer oder zu vage (< 2 bedeutungstragende
  Tokens) -> `ask_user` mit Bitte um Praezisierung.
- Output `data`: die Expansion-Struktur inkl. `topic_terms` und
  `selector_terms`; wird als `goal-expansion.json` persistiert.

### Topic-Fit (`task: "topic_fit"`)

- Input: Kandidaten (`title`, `score`, `signals.topics`,
  `thematic_fit { has_goal_match, matched_tokens, gate }`) plus `topic_terms`.
- Selector-Aufruf mit `selector_terms` (Teil des MVP-Contracts, nicht spaetere
  Verbesserung).
- Regel pro Kandidat (Mismatch- statt Overlap-Logik):
  - **Title-only weak signal:** `matched_tokens` nur im `title`, nicht in
    `signals.topics` -> Verdacht.
  - **Topic-Path-Validierung:** mindestens ein `topic_terms`-Eintrag muss in
    `signals.topics` auftauchen, sonst thematisch unbestaetigt.
  - **Mismatch-Regel:** hoher `score` bei leerer Topic-Bestaetigung -> Verdacht
    (der `accounting-in-regional-growth`-Fall).
- Position rekonstruieren: `matched_tokens` traegt keine Position (kombinierter
  Haystack in `contract.js`); `title`-Match = Token in tokenisiertem `title`,
  `topics`-Bestaetigung = Token in `signals.topics`.
- Candidate-level Verdicts: jeder Kandidat bekommt `accept | reject |
  low_confidence`. Ein einzelner Mismatch verwirft nur diesen Kandidaten, nicht
  den Satz. Output-`data` traegt `verdicts` und `accepted_candidate_ids`.
- Gate-Decision (aggregiert):
  - mindestens ein `accept` -> `accepted` mit ausschliesslich den
    `accept`-Kandidaten; `low_confidence` wird verworfen, solange der User nicht
    `continue anyway` waehlt.
  - kein `accept`, aber `low_confidence` -> `ask_user` mit
    `[broaden, refine, continue_anyway]`; `continue_anyway` ist
    `safe_default: false`.
  - alle `reject` / leerer Satz -> `ask_user` (broaden/refine), kein stiller
    Stop.

### Gate-Decision-Modell (gemeinsam, Abschnitt 6)

- Vier Decisions: `accepted | retry | ask_user | stop`.
- `retry` startet nie autonom; `proposed_actions` werden Card-Optionen, erst
  nach User-Freigabe Re-Run mit angepassten Params (Ticket 07 fuehrt aus).
- Retry-Budget: Default 2 pro Schritt, im State mitgefuehrt; erschoepft -> nur
  noch `accepted | ask_user | stop`.
- Actions sind gate-skopiert, nie global (Dispatch gegen die aktive Card,
  Ticket 07).

## Nicht im Scope

- Source-Coverage- und Plan-Quality-Reviewer (Ticket 04).
- Das Schreiben von `candidates.raw.json`/`candidates.json` als Datei
  (Orchestrator-Persistenz, Ticket 05/07) — hier nur die Verdicts und
  `accepted_candidate_ids` liefern.
- codex-cli-Prompts (Ticket 08).

## Abhaengigkeiten

- Ticket 01: `reviewJson`-Interface + Decision-Schema.
- Ticket 02: `selector_terms`-Bruecke in `contract.js`.
- Bestehende Kandidaten-Felder aus `contract.js`.

## Blocker

- Synonym-/Uebersetzungs-Map fehlt fuer die Test-Domaenen (Accounting, Intro-CS,
  Kardiologie).

## Umsetzungshinweise

- Ehrlicher Vorbehalt: die Regel bleibt ein **schwaches Baseline-Signal**, das an
  der Qualitaet von `signals.topics` haengt. Sie ist das reproduzierbare
  Referenz-Orakel, nicht der Anspruch auf vollstaendige semantische
  Unterscheidung — das echte Reasoning liefert der codex-Reviewer (Ticket 08).
- Topic-Fit ergaenzt das bestehende `thematic_fit_passed`-Gate aus `v1-run`,
  ueberschreibt es nicht.
- `low_confidence`-Kandidaten werden nie automatisch uebernommen.

## Akzeptanzkriterien

- Goal-Expansion liefert `topic_terms` als Vereinigung aus
  `domain_terms + synonyms + translations`.
- Ein deutscher Goal mit englischer Translation in den Kurs-Topics fuehrt zu
  `accept`, nicht faelschlich zu `reject`/`ask_user`.
- Topic-Fit liefert pro Kandidat ein Verdict und `accepted_candidate_ids`.
- Ein hoch gescorter Kurs mit `accounting` nur im Titel, nicht in
  `signals.topics`, wird **nicht** akzeptiert.
- Leerer/vager Goal -> `ask_user`; alle `reject` -> `ask_user`, kein stiller
  Stop.
- Erschoepftes Retry-Budget verhindert weitere `retry`-Decisions.

## Tests / Verifikation

- Spec-Test 2b (Term-Normalisierung + Selector-Bruecke): deutscher Goal
  `Kardiologie`, Kurs mit `cardiology` in `signals.topics` -> `accept`. Schuetzt
  gegen den `domain_terms`-only-Bug vor und nach dem Selector.
- Spec-Test 3 (Accounting-Falle): hoch gescorter `accounting`-nur-im-Titel-Kurs
  -> `ask_user` (broaden/refine); nach `broaden` veraenderte Auswahl.
- Spec-Test 3b (Low-Confidence): ein `accept` + ein `low_confidence` -> ohne
  Freigabe nur der `accept`; reiner Low-Confidence-Satz -> `ask_user`, erst
  `continue anyway` uebernimmt ihn.

## Uebergabe an Folge-Tickets

- Ticket 04 liest nur die akzeptierten Kandidaten fuer Source-Coverage.
- Ticket 05/07 persistieren `candidates.raw.json` (Audit) und `candidates.json`
  (gefilterte Downstream-Source-of-Truth) und nehmen `goal_expansion` in den
  `course_discovery`-Fingerprint auf.
- Ticket 08 liefert bei Topic-Fit dieselben candidate-level Verdicts.
