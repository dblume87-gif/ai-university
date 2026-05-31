# MVP-Spec: AIU Agent Orchestration Layer

## Status

Draft, Stand: 2026-05-30.

Dieses Dokument ist die **MVP-Spec** und der baubare erste Schnitt des
Zielbilds aus [`agent-orchestration-layer-plan.md`](./agent-orchestration-layer-plan.md).
Das Zielbild bleibt unveraendert als Nordstern bestehen. Diese Spec grenzt
scharf ab, *was zuerst gebaut wird*, und schliesst die R&D-Luecke, die das
Zielbild offen laesst: die konkreten Review- und Gate-Kriterien.

### Bestaetigte Eckpfeiler

1. MVP-Kern ist der **interaktive Chat-Loop** `learn agent chat --new` — der
   volle Happy Path im Terminal, nicht nur ein nicht-interaktiver Run.
2. **Erfolgskriterien getrennt:** Das **blockierende** MVP-Ziel ist die
   Chat-Loop-Orchestrierung, voll beweisbar mit dem **`deterministic`**-Provider
   (reproduzierbar, offline, der einzige CI-blockierende Provider). **`codex-cli`**
   ist ein **gated, nicht-blockierender** Live-Reasoning-Adapter hinter demselben
   Interface (`--provider codex-cli`), freigeschaltet erst nach einem Auth-Smoke
   (Abschnitt 4). `claude-code` ist bewusst **nicht** der Live-Provider, weil
   headless `claude -p` nicht nachhaltig ueber die Subscription laeuft (faellt in
   API-Billing/Limit); codex laeuft headless ueber die lokale Subscription.
3. Der Step Review Loop ist ein **voller Loop mit Retry, aber jede
   Retry-Aktion braucht User-Freigabe** am Gate. Kein autonomer Retry.
4. **Alle vier Gates** werden reviewt: Goal-Expansion, Topic-Fit,
   Source-Coverage, Plan-Quality.

### Schluessel-Konsequenz

Der Reviewer existiert in **zwei austauschbaren Auspraegungen hinter dem gleichen
Interface**: eine **deterministische** (regelbasiert, Abschnitt 5, blockierend)
und eine **codex-cli**-basierte (echte LLM-Prompts, Abschnitt 5.5, gated). Das
ist Absicht: die deterministische Variante zwingt uns, die Gate-Kriterien
explizit hinzuschreiben und liefert voll reproduzierbare CI-Tests; die
codex-Variante liefert echtes Reasoning, sobald der Auth-Smoke besteht. Beide
teilen Decision-Vokabel und Output-Schema, laufen also gegen **dieselben Tests**
und sind im Flow ohne Code-Aenderung tauschbar.

**Vorbedingung fuer codex (gating):** codex ist lokal aktuell **nicht installiert**.
Bevor irgendein codex-Prompt geschrieben wird, muss ein Smoke beweisen, dass
headless `codex exec` (a) installiert/erreichbar ist und (b) ueber die
ChatGPT/Codex-**Subscription**-Auth laeuft, nicht still auf einen API-Key
zurueckfaellt. Schlaegt der Smoke fehl, bleibt der MVP `deterministic`-only und
codex wird zur ersten Post-MVP-Aufgabe — die Chat-Loop-Erfolgskriterien bleiben
davon unberuehrt.

### Was schon existiert (nicht neu bauen)

Die deterministische Pipeline ist weiter als das Zielbild suggeriert.
[`v1-run.js`](../../ocw-pipeline/src/learning/v1-run.js) hat bereits:

- `runStep(run, name, fn)` mit Step-Records und Fehlerbehandlung.
- `checkGate(...)` mit benannten Gates: `candidates_present`,
  `thematic_fit_passed`, `usable_sources_present`, `plan_units_present`,
  `notebook_sources_ready`.
- `run.json` + `RUN.md` als maschinen- und menschenlesbaren Bericht.
- Dry-Run als Default, `--live-notebook` als Opt-in.
- Handoffs zu Mindmap, Chat und Assets.

Der Agent-Layer ergaenzt darauf nur vier Dinge: **LLM-/Reviewer-Bewertung an
den Gates**, **Retry-mit-User-Freigabe**, den **interaktiven Chat-Loop** und
**Review Cards**.

### Adressierte Review-Findings (2026-05-31)

Aus den Review-Runden hervorgegangene Punkte, **alle eingearbeitet** in die unten
genannten Abschnitte (Audit-Trail, keine offene TODO-Liste). Reihenfolge nach
**Defekt vor Haertung** — die ersten Eintraege waren Korrektheits-/Korruptions-Bugs,
kein blosses Nice-to-have:

1. **(Bug) Term-Mismatch Goal-Expansion ↔ Topic-Fit.** Deutscher `domain_term`
   matcht nie englische `signals.topics`; jeder deutschsprachige Goal fiel
   faelschlich auf „unbestaetigt". **Brisant:** Test 12.2 (Kardiologie) haette
   den Bug *gruen maskiert*. → Gefixt in **5.1** (`topic_terms` =
   domain_terms+synonyms+translations) und **5.2** (matcht gegen `topic_terms`);
   neuer Test **12.2b**.
2. **(Bug) State-Korruption ohne Atomic-Write.** `agent_state.json` wird je Gate
   neu geschrieben; die 7.2-Aussage „kein Korruptionsrisiko" galt nur fuer den
   Verlauf. → Gefixt in **7.2/7.3** (`temp → fsync → rename`, partial-line
   recovery); neuer Test **12.4b**.
3. **(Sicherheit) `yes`-Mehrdeutigkeit.** `yes` konnte „trotzdem fortfahren"
   statt „Recovery" bestaetigen. → Gefixt in **6/8/9** (`default_action`,
   `safe_default`, `continue_anyway` nur voll getippt).
4. **(Architektur) Topic-Fit zu grob.** Set-Level statt Kandidaten-Level. →
   Gefixt in **5.2** (candidate-level `accept|reject|low_confidence` +
   `accepted_candidate_ids`).
5. **(Schaerfung) Coverage zu aggregiert / Plan-Quality-Heuristik zu schmal /
   `deep_scan`+`unit_export` doppeldeutig.** → Gefixt in **5.3** (per-Kurs +
   eine `recover_sources`-Action) und **5.4** (breitere Rohtitel-Heuristik).
6. **(Doku) `codex-cli`-Scope.** Substanz stand in Eckpfeiler 2, aber Tabelle/
   Header lasen sich als „voll im MVP". → „gated"-Qualifier in **1** und **5**
   ergaenzt.
7. **(Bug) Goal-Expansion erreicht den Selector nicht.** `topic_terms` halfen
   zwar dem Reviewer, aber `selectCourseCandidates` filtert vorher schon auf
   `contract.goal`; deutsche Goals konnten dadurch weiterhin vor dem Review
   verschwinden. → Gefixt in **3/5.1/5.2**: Phase 3 uebergibt
   `selector_terms` an den Selector; Test **12.2b** deckt den kompletten
   Selector→Reviewer-Pfad ab.
8. **(Bug) Candidate-Verdicts ohne Downstream-Effekt.** `accepted_candidate_ids`
   waeren nur Review-Daten, wenn Phase 4 weiter das rohe `candidate_courses`
   nutzt. → Gefixt in **5.2/10**: Der Orchestrator schreibt ein gefiltertes
   `candidates.json` als Downstream-Source-of-Truth; das rohe Selector-Ergebnis
   bleibt in `candidates.raw.json`.
9. **(Schema) Safe-Defaults nicht modelliert.** `safe_default` stand in Card-Text,
   aber nicht im Provider-Schema. → Gefixt in **4/6**:
   `default_action` + `proposed_actions[].safe_default`.
10. **(Crash-Sicherheit) Atomic-Write kollidiert mit bestehenden Savern.**
    Bestehende `save*`-Funktionen schreiben teilweise in-place. → Gefixt in
    **7.3**: Agent-Artefakte laufen ueber einen Atomic-Artifact-Writer oder
    gehaertete Saver; kein direkter in-place-Write im Agent-Flow.
11. **(UX) Beispiel-Card unterlief `safe_default`.** Eine unsichere Topic-Fit-Card
    zeigte noch `[yes] uebernehmen`. → Gefixt in **8**: Unsichere Cards haben
    keinen `yes`-Default.
12. **(Konsistenz) `normalize_titles` muss JSON und Markdown synchron halten.**
    Der Planner schreibt JSON und `.md`; Titel-Normalisierung darf nicht nur ein
    Artefakt patchen. → Gefixt in **5.4/7.3** und Test **12 (Nr. 5)**.
13. **(Bug) `depends_on`/Fingerprint von `course_discovery` ohne `goal_expansion`.**
    Folgefehler aus Defekt 7: die Selector-Bruecke macht Phase 3 von
    `goal-expansion.json` abhaengig, aber Resume haette den Step bei geaenderter
    Synonym-Map faelschlich uebersprungen. → Gefixt in **7.1**
    (`depends_on: [..., "goal_expansion"]` + Hash im Fingerprint).
14. **(Konsistenz) `continue_anyway` dreifach ueberladen.** Eine Action, drei
    Gate-Bedeutungen (5.2/5.3/5.4). → Gefixt in **6/9**: Actions werden
    gate-skopiert gegen die aktive Card dispatcht, nie global.
15. **(Klarheit) `matched_tokens` traegt keine Position.** Code berechnet sie
    gegen einen kombinierten Haystack; die 5.2-„title-only"-Regel braucht eine
    Herleitung. → Gefixt in **5.2** (Impl-Notiz: Position aus `title` +
    `signals.topics` rekonstruieren).
16. **(Scope) per-Kurs-Coverage braucht keine neue Screening-Arbeit.** Felder
    existieren schon. → Notiert in **5.3** (`courseMaterialOverviews[].usable_sources`
    etc. wiederverwenden).

---

## 1. Scope-Schnitt

### In MVP (neu bauen)

| Modul | Verantwortung |
|---|---|
| `provider-runtime` | Provider-Interface + `deterministic`-Impl (blockierend) **und** `codex-cli`-Impl (**gated**, erst nach Auth-Smoke, nicht CI-blockierend). Einziger Ort fuer Reasoning-Provider. Enthaelt die 4 Task-Prompts + JSON-Extraktions-/Repair-Layer. Faellt der Smoke aus, ist nur die `deterministic`-Impl im MVP. |
| `run-state` | `agent_state.json` + `AGENT_RUN.md` + Resume-Logik. |
| `quality-review` | Die 4 Reviewer + Gate-Decision-Modell. Keine Side Effects. |
| `review-cards` | Terminal-Rendering der Gate-Entscheidungen. |
| `session` | readline-Loop + Phasen-Maschine. Treibt Pipeline-Schritte und Gates. |

### Wiederverwenden (nicht neu bauen)

| Bestehend | Rolle im Agent-Flow |
|---|---|
| [`contract.js`](../../ocw-pipeline/src/learning/contract.js) | `normalizeLearningContract`, `selectCourseCandidates` mit kleinem optionalem `selector_terms`-Bridge-Parameter (5.1/5.2), damit Goal-Expansion vor dem Selector wirkt |
| [`material-screening.js`](../../ocw-pipeline/src/learning/material-screening.js) | `screenCandidateMaterials`; Deep Scan + Unit Export sind die **user-approved Retry-Aktionen** (initial via `rescreenMissing:false`/`exportMissingUnits:false` deaktiviert, siehe 5.3) |
| [`planner.js`](../../ocw-pipeline/src/learning/planner.js) | `buildLearningPathPlan` |
| [`path-notebook.js`](../../ocw-pipeline/src/learning/path-notebook.js) | `runPathNotebookWorkflow` (Dry-Run) |
| [`chat.js`](../../ocw-pipeline/src/learning/chat.js) | Tutor-Modus (Phase 7) |
| [`store.js`](../../ocw-pipeline/src/learning/store.js) | Referenz fuer Turn-Form; **aber** Agent nutzt append-only `conversation.jsonl` statt `saveChatState`-Voll-Rewrite (siehe 7.2) |
| [`v1-run.js`](../../ocw-pipeline/src/learning/v1-run.js) | `runStep`/`checkGate`-Muster (adaptieren) |

### Deferred (Phase 2+)

- Persistente User-Profile und Lernhistorie.
- `learning-assets`-Modul (Study Guides, Quiz, Flashcards als eigene Pipeline).
- NotebookLM-native Artifacts und Mindmap-Source-Routing.
- Weitere Provider: `claude-code` (headless `claude -p` nicht subscription-tragfaehig),
  `gemini-api`, `gemini-cli`, `openai-api`.
- Web-UI als zweite Oberflaeche.
- `learn agent run` als separater nicht-interaktiver Befehl
  (`learn v1 run` bleibt als deterministischer Harness bestehen).

---

## 2. Command-Surface (MVP)

Reale CLI-Surface: Dispatch laeuft ueber `node src/scrape.js` mit Top-Level-
Command `learn` und Sub-Aktion (vgl. heutiges `learn v1 run` in
[`scrape.js`](../../ocw-pipeline/src/scrape.js)). Der Agent kommt als neue
Sub-Aktion `agent` dazu:

```bash
node src/scrape.js learn agent chat --new            # startet Run, schreibt agent_state.json, betritt Loop
node src/scrape.js learn agent chat --run <run-id>   # setzt unterbrochene Session fort
node src/scrape.js learn agent status --run <run-id> # zeigt State ausserhalb der Session
```

- **Working dir: `ocw-pipeline/`.** `src/scrape.js` ist relativ dazu; aus dem
  Workspace-Root also `cd ocw-pipeline && node src/scrape.js …` (analog zum
  `--cd ocw-pipeline` im codex-Aufruf in Abschnitt 4).
- **Dry-Run ist Default.** Echte NotebookLM-Aktionen brauchen `--live-notebook`
  beim Start *oder* eine explizite Freigabe im Chat.
- `--provider deterministic` (Default) oder `--provider codex-cli` (gated, nach Auth-Smoke).
- `--db`, `--out`, `--units-root` werden wie in `learn v1 run` durchgereicht.

`learn v1 run` und `learn chat` bleiben unveraendert als Dev-/Power-User-Pfade.

> **Offene Scope-Frage (benannt, nicht angenommen):** Ein kuerzeres `learn`-Bin
> (`package.json` `bin`) gibt es heute **nicht**. Ob es als Teil des MVP
> hinzukommt, ist eine bewusste Entscheidung; bis dahin gilt die
> `node src/scrape.js …`-Surface.

---

## 3. Session-Phasen-Maschine

Die 8 produktsprachlichen Phasen aus dem Zielbild, gemappt auf bestehende
Pipeline-Schritte und das jeweilige Review-Gate:

| # | Phase (User-Sprache) | Pipeline-Schritt (reuse) | Review-Gate (neu) |
|---|---|---|---|
| 1 | Ziel verstehen | `normalizeLearningContract` | — (`ask_user` wenn Ziel leer/vage) |
| 2 | Suchrichtung festlegen | (Goal-Expansion, neu) | **Goal-Expansion** |
| 3 | Kurse waehlen | `selectCourseCandidates` | **Topic-Fit** |
| 4 | Quellen pruefen | `screenCandidateMaterials` | **Source-Coverage** |
| 5 | Lernpfad bauen | `buildLearningPathPlan` | **Plan-Quality** |
| 6 | Lernraum vorbereiten | `runPathNotebookWorkflow` (dry-run) | Notebook-Readiness (deterministisch, wie heute) |
| 7 | Loslernen | `chat.js` Tutor | — |
| 8 | Weiterfuehren | `run-state` Resume | — |

Jede Phase folgt demselben Loop:

```text
Schritt ausfuehren  ->  Reviewer bewertet Output  ->  Decision
   ^                                                     |
   |  (retry nach User-Freigabe, angepasste Params)      v
   +-------------------------------- accepted -> naechste Phase
                                     ask_user -> Card + warten auf User
                                     stop     -> Run beenden, State sichern
```

**Wichtige Bruecke Phase 2 → Phase 3:** Goal-Expansion ist nicht nur ein
Reviewer-Hilfsartefakt. Phase 2 schreibt `goal-expansion.json`; Phase 3 ruft
`selectCourseCandidates` mit `selector_terms` aus dieser Expansion auf. Der
normalisierte Contract bleibt userfaehig unveraendert (`goal` bleibt der
Originalauftrag), aber der Selector bekommt die englischen/kanonischen Suchterme
vor seinem eigenen `has_goal_match`-Filter. Ohne diese Bruecke wuerden
deutschsprachige Goals wie „Kardiologie" schon vor dem Topic-Fit-Reviewer
verschwinden.

**Wichtige Bruecke Phase 3 → Phase 4:** Topic-Fit erzeugt zwei Artefakte:
`candidates.raw.json` (roher Selector-Output) und `candidates.json`
(akzeptierter, gefilterter Kandidatensatz). Alle downstream Schritte
(`screenCandidateMaterials`, Planner, Notebook) lesen **nur** `candidates.json`.
Rejected Candidates bleiben im Review nachvollziehbar, duerfen aber nicht
versehentlich in Source-Coverage oder Plan-Units landen.

---

## 4. Provider-Interface-Kontrakt

Einziger Ort fuer externe Reasoning-Provider: `provider-runtime`.

```text
AgentProvider.reviewJson({ task, input, schema })
  -> {
       decision,            // "accepted" | "retry" | "ask_user" | "stop"
       reasons: string[],   // userfaehige Kurzbegruendungen
       default_action,       // string | null, muss auf eine proposed_action zeigen
       proposed_actions: [  // nur bei retry/ask_user
         { action, label, params, safe_default }
       ],
       data                 // optional angereicherte Struktur (z.B. Goal-Expansion)
     }
```

- `task` ∈ `{ "goal_expansion", "topic_fit", "coverage_review", "plan_review" }`.
- `schema` beschreibt die erwartete Output-Form; Provider muss valides JSON
  dagegen liefern.
- **`deterministic`-Impl:** regelbasiert (Abschnitt 5), keine externe
  Abhaengigkeit, immer valides JSON → kein JSON-Retry noetig. Default + Test.
- **`codex-cli`-Impl:** **kein** stdout-Parsing. Strukturiertes Ergebnis ueber
  Schema-Datei + Result-Datei, exakt wie im Zielbild:

  ```bash
  codex exec \
    --cd ocw-pipeline \
    --sandbox read-only \
    --ask-for-approval never \
    --ephemeral \
    --output-schema <schema-file> \
    --output-last-message <result-file> \
    -                       # Prompt auf stdin
  ```

  Der Adapter liest das JSON aus `<result-file>`; `stdout`/`--json` dienen nur
  Debug-/Event-Logs, nicht als Result-Kanal. `provider-runtime` validiert gegen
  `schema` und macht **maximal einen** Format-Reparatur-Retry, wenn JSON fehlt
  oder invalid ist; danach Fallback auf `ask_user`. **Gating:** codex ist lokal
  nicht installiert → der Auth-/Verfuegbarkeits-Smoke (Schluessel-Konsequenz oben)
  ist Vorbedingung, bevor dieser Adapter scharf geschaltet wird.
- Provider-Metadaten (`provider`, `task`, `latency_ms`, `attempts`) werden pro
  Gate ins `agent_state.json` geschrieben (Debugging, spaetere Eval).
- `safe_default` ist Teil des Schemas, nicht nur Card-Text. `default_action`
  darf nur auf eine Action mit `safe_default: true` zeigen; wenn keine sichere
  Default-Aktion existiert, ist `default_action: null`.

---

## 5. Die vier Reviewer — konkrete deterministische MVP-Regeln

Dies ist die R&D-Luecke, die das Zielbild offen laesst. Jeder Reviewer hat eine
**konkrete, testbare deterministische Regel** (5.1–5.4, **blockierend/CI**) und
ein **codex-cli-Prompt** (5.5, **gated**, erst scharf nach dem Auth-Smoke aus
Abschnitt 4). Beide teilen Signatur und Decision-Vokabular und sind im Flow ohne
Code-Aenderung tauschbar; faellt der Smoke aus, laeuft der MVP allein gegen die
deterministischen Regeln und 5.5 wird Post-MVP.

### 5.1 Goal-Expansion (`task: "goal_expansion"`)

- **Input:** normalisierter Contract (Goal, Level, Sprache, Materialien).
- **Regel:** strukturiert die Contract-Felder zu
  `{ domain_terms, synonyms, translations, topic_terms, language, level, exclusions }`
  ueber eine kleine statische Synonym-/Uebersetzungs-Map (z.B.
  `kardiologie -> { synonyms: [heart disease], translations: [cardiology,
  cardiovascular] }`). Unbekannte Goals werden tokenisiert und unveraendert als
  `domain_terms` uebernommen.
- **`topic_terms` (kanonische Match-Basis):** die **lowercased, deduplizierte
  Vereinigung** aus `domain_terms + synonyms + translations`. Das ist die
  **einzige** Liste, gegen die Topic-Fit (5.2) matcht — nie gegen `domain_terms`
  allein. Grund: OCW-`signals.topics` sind **englisch**; ein deutscher
  `domain_term` wie `kardiologie` taucht dort nie auf, die englischen
  Translations (`cardiology`, `cardiovascular`) aber schon. Ohne diese Normalisierung
  faellt **jeder deutschsprachige Goal** faelschlich auf „thematisch unbestaetigt".
- **`selector_terms` (Selector-Bruecke):** identisch zu `topic_terms`, plus die
  Token aus dem Original-Goal, und wird in Phase 3 an `selectCourseCandidates`
  uebergeben. Dafuer wird `contract.js` nur eng erweitert: `selectCourseCandidates`
  akzeptiert optional `selectorTerms`/`selector_terms`; `scoreGoal` nutzt diese
  Terme statt ausschliesslich `expandGoalTokens(contract.goal)`. Der Contract
  selbst wird nicht mit englischen Suchstrings ueberschrieben, damit Cards,
  Berichte und Chat weiter den User-Auftrag zeigen.
- **Decision:** `accepted`. Ausnahme: Goal leer oder zu vage (z.B. < 2
  bedeutungstragende Tokens) → `ask_user` mit Bitte um Praezisierung.
- **Output `data`:** die Expansion-Struktur (inkl. `topic_terms` und
  `selector_terms`), die Phase 3 als Such-/Fit-Basis nutzt.

### 5.2 Topic-Fit (`task: "topic_fit"`)

- **Input (reale Kandidaten-Felder, vgl. [contract.js:236,242](../../ocw-pipeline/src/learning/contract.js)):**
  jeder Kandidat hat `title`, `score`, `signals.topics` (kuratierte Themenliste)
  und `thematic_fit { has_goal_match, matched_tokens, gate }` — **keine**
  `keywords`. Dazu `topic_terms` aus 5.1 (nicht `domain_terms` allein, siehe 5.1).
- **Selector-Aufruf:** `selectCourseCandidates` wird in Phase 3 mit
  `selector_terms` aus 5.1 aufgerufen. Das ist Teil des MVP-Contracts, nicht nur
  eine spaetere Verbesserung, weil der Selector Kandidaten sonst vor dem
  Topic-Fit-Review ausfiltert.
- **Regel (Mismatch- statt Overlap-Logik), pro Kandidat ausgewertet:** Der naive
  Overlap scheitert am Kernfall — ein „Financial Accounting"-Kurs **und** ein
  „accounting for regional growth"-Kurs teilen beide das Token `accounting`.
  Stattdessen je Kandidat:
  - **Title-only weak signal:** liegen `thematic_fit.matched_tokens` nur im
    `title`, aber **nicht** in `signals.topics`, ist der Match oberflaechlich →
    Verdacht.
  - **Topic-Path-Validierung:** mindestens ein `topic_terms`-Eintrag muss in
    `signals.topics` auftauchen (nicht nur im Titel), sonst gilt der Kandidat als
    thematisch unbestaetigt.
  - **Mismatch-Regel:** hoher `score` bei gleichzeitig leerer Topic-Bestaetigung
    → genau der *accounting-in-regional-growth*-Fall → Verdacht.
- **Impl-Notiz zu `matched_tokens`:** [contract.js:268](../../ocw-pipeline/src/learning/contract.js)
  berechnet `matched_tokens` gegen einen **kombinierten** Haystack (course_id +
  title + topics + resource_types) — die Trefferposition geht verloren. Der
  Reviewer leitet „nur im title" daher selbst her: `title`-Match = Token in
  tokenisiertem `title`; `topics`-Bestaetigung = Token in `signals.topics`. Die
  Struktur liefert die Position **nicht** mit; sie wird aus `title` + `signals.topics`
  rekonstruiert.
- **Candidate-level Verdicts (nicht Set-level):** Jeder Kandidat bekommt ein
  Verdict `accept | reject | low_confidence`. Ein einzelner Mismatch verwirft
  **nur diesen Kandidaten**, nicht den ganzen Satz. Output-`data` traegt
  `verdicts` (je Kandidat) und `accepted_candidate_ids`.
- **Persistierte Auswahl:** Nach dem Gate schreibt der Orchestrator
  `candidates.raw.json` (ungefilterter Selector-Output) und `candidates.json`
  (standardmaessig **nur** Kandidaten mit Verdict `accept`). Kandidaten mit
  Verdict `low_confidence` werden **nie automatisch** in `candidates.json`
  uebernommen; sie bleiben nur dann erhalten, wenn der User am Gate explizit
  `continue anyway` waehlt. **Nur `candidates.json`** wird an Source-Coverage
  und Planner weitergereicht.
- **Gate-Decision (aggregiert aus den Verdicts):**
  - mindestens ein `accept` → `accepted` mit **ausschliesslich** den
    `accept`-Kandidaten als `accepted_candidate_ids`; vorhandene
    `low_confidence`-Kandidaten werden verworfen, solange der User sie nicht
    explizit mit `continue anyway` uebernimmt.
  - kein `accept`, aber `low_confidence` vorhanden → `ask_user` mit
    `proposed_actions: [broaden, refine, continue_anyway]`; `continue_anyway`
    uebernimmt die Low-Confidence-Kandidaten nach User-Freigabe, ist aber
    `safe_default: false`.
  - alle `reject` / leerer akzeptierter Satz → `ask_user` (broaden/refine), kein
    stiller Stop.
- Ergaenzt das bestehende deterministische `thematic_fit_passed`-Gate aus
  `v1-run`, ueberschreibt es nicht.
- **Ehrlicher Vorbehalt:** Auch diese Regel bleibt ein **schwaches Baseline-Signal**
  — sie haengt an der Qualitaet von `signals.topics`. Das eigentliche Reasoning
  (echte semantische Unterscheidung) liefert der codex-Reviewer (5.5); die Regel
  ist das reproduzierbare Referenz-Orakel, nicht der Anspruch auf Vollstaendigkeit.

### 5.3 Source-Coverage (`task: "coverage_review"`)

**Wichtige Korrektur gegenueber der ersten Fassung:**
[`screenCandidateMaterials`](../../ocw-pipeline/src/learning/material-screening.js)
faehrt `rescreenMissing` (Deep Scan) und `exportMissingUnits` (Unit Export)
**per Default bereits intern**, *bevor* der Reviewer den Output sieht
([material-screening.js:44,54](../../ocw-pipeline/src/learning/material-screening.js)).
„Reviewer gibt `retry` → loest erst die Recovery aus" waere damit
widerspruechlich (sie ist schon gelaufen). Aufloesung im MVP:

- **Phase 4 ruft die initiale Screening-Runde mit
  `rescreenMissing: false, exportMissingUnits: false`** auf. Der Reviewer sieht
  also die **rohe** Coverage ohne Auto-Recovery.
- **Input:** die gefilterte `candidates.json` aus 5.2, nicht
  `candidates.raw.json`. Rejected Candidates duerfen Source-Coverage und Planner
  nicht mehr erreichen.
- **Regel (pro Kurs ausgewertet, nicht nur global aggregiert):** Coverage wird
  als `course_coverage` je akzeptiertem Kandidaten gemessen, nicht nur als
  globales `usable_sources.length`. Sonst maskiert ein Kurs mit vielen Sources
  einen leeren Nachbarkurs, aus dem der Planner (Phase 5) trotzdem Units baut.
  (Per-`unit`-Coverage faengt 5.4 zusaetzlich downstream ab — hier geht es um die
  fruehere, billigere Pruefung pro Kurs.)
  **Keine neue Screening-Arbeit noetig:** Die per-Kurs-Daten existieren bereits —
  `courseMaterialOverviews[].usable_sources`, der per-Kurs-Gap
  `no_usable_sources` und `usable_source_count`
  ([material-screening.js:68,116,329](../../ocw-pipeline/src/learning/material-screening.js)).
  Der Reviewer liest nur diese Felder, statt neue zu erzeugen.
  - **alle** akzeptierten Kurse mit `usable_sources.length === 0` → `retry` mit
    `proposed_actions: [recover_sources]` (**User-Freigabe noetig**).
  - einzelne Kurse leer **oder** Coverage-Ratio unter Schwelle (genug, aber
    duenn) → `ask_user` mit `recover_sources` plus Option „trotzdem fortfahren"
    (`continue_anyway`, `safe_default: false`).
  - sonst → `accepted`.
- **Eine Recovery-Action statt zwei:** Deep Scan und Unit Export laufen immer
  **gemeinsam** (das In-Session-Kommando `deep scan` in Abschnitt 9 stiess schon
  immer beide an). Statt der frueher getrennten `[deep_scan, unit_export]` gibt es
  daher genau **eine** Action `recover_sources`, die intern
  `rescreenMissing: true` **und** `exportMissingUnits: true` setzt — Action und
  Kommando bilden so 1:1 aufeinander ab.
- **Nach Freigabe** startet die Phase das Screening erneut, diesmal mit
  `rescreenMissing: true`/`exportMissingUnits: true` — der user-approved Re-Run
  *ist* die Recovery. So bleibt die einzige Stelle, an der Deep Scan/Unit Export
  laufen, hinter einer expliziten Freigabe (passt zu „voller Loop mit
  User-Freigabe").

### 5.4 Plan-Quality (`task: "plan_review"`)

- **Input:** `buildLearningPathPlan`-Output (`units`, `selected_courses`,
  `sources`).
- **Regel:** flaggt
  - **rohe Dateinamen** — nicht nur `^lec\d+\.pdf$`. Reale OCW-Rohtitel heissen
    `MIT18_01SCF10_lec03.pdf`, `LectureNotes.pdf`, `session_2_reading.pdf`. Die
    Heuristik flaggt daher breiter: Titel mit Dateiendung (`\.(pdf|pptx?|docx?)$`),
    eingebettete Course-Codes (`[A-Z]{2,}\d`), `_`/CamelCase-zusammengeklebte
    Tokens, reine Nummern, sehr kurze Titel (< 3 Woerter) oder hoher Anteil
    nicht-sprachlicher Tokens.
  - **Units ohne Sources**,
  - **Course-ID-Mismatch** zwischen Unit und `selected_courses`.
- **Decision:** Flags vorhanden → `ask_user` mit
  `proposed_actions: [normalize_titles, drop_unit, continue_anyway]`;
  sonst `accepted`.
- `normalize_titles` ist eine deterministische Titel-Normalisierung (z.B.
  `lec1.pdf` → `Lecture 1`), die den Plan vor Freigabe aktualisiert. Weil
  `buildLearningPathPlan` JSON-Daten **und** Markdown erzeugt, muss diese Action
  beide Darstellungen synchron neu schreiben: `learning-path.json`, das
  eingebettete/gerenderte Markdown und `learning-path.md`. Danach werden die
  neuen Hashes in `accepted_output` gespeichert. Ein JSON-only Patch gilt als
  fehlgeschlagen.

### 5.5 codex-cli-Prompts (Live-Variante)

Pro Task ein constraintes Prompt-Template in `provider-runtime`. Gemeinsame
Regeln fuer alle vier:

- System-Teil legt die Rolle fest („du bewertest einen Pipeline-Output, du
  fuehrst keine Aktionen aus, du liest keine Files, du gibst **nur** JSON nach
  `schema` zurueck").
- User-Teil enthaelt `input` (der Step-Output) und `schema`.
- Output muss strikt
  `{ decision, reasons[], default_action, proposed_actions[], data }` sein;
  jede `proposed_actions[]`-Action enthaelt `safe_default`.
- `proposed_actions` duerfen **nur** aus der pro Task erlaubten Menge stammen
  (dieselbe wie die deterministischen Regeln: `broaden/refine/continue_anyway`,
  `recover_sources/continue_anyway`, `normalize_titles/drop_unit/continue_anyway`) —
  so bleibt die Session-Logik identisch, egal welcher Provider antwortet. Der
  codex-Reviewer liefert bei Topic-Fit dieselben candidate-level Verdicts
  (`accept|reject|low_confidence` + `accepted_candidate_ids`) wie die Regel in 5.2.

Die deterministischen Regeln aus 5.1–5.4 dienen als **Referenz-Orakel**: Die
codex-Prompts sollen auf den Test-Fixtures dieselben Decisions liefern wie die
Regeln; Abweichungen sind ein Prompt-Bug oder ein echter Reasoning-Gewinn und
werden manuell gesichtet.

---

## 6. Gate-Decision-Modell

Vier Entscheidungen, einheitlich ueber alle Reviewer:

| Decision | Bedeutung | Naechster Schritt |
|---|---|---|
| `accepted` | Output ist gut genug | Step als `accepted` markieren, naechste Phase |
| `retry` | Reviewer schlaegt konkrete Verbesserung vor | Card mit Aktion zeigen, **auf User-Freigabe warten**, dann Step mit angepassten Params neu starten |
| `ask_user` | Mehrdeutig, User muss entscheiden | Card mit Optionen zeigen, warten |
| `stop` | Kein sinnvoller Weg vorwaerts | Run beenden, State + Bericht sichern |

**Retry-Regel (zentral):** Auch bei `decision: "retry"` startet der Agent den
Schritt **nicht autonom** neu. Die `proposed_actions` werden als Card-Optionen
gerendert; erst nach `yes` / Auswahl des Users wird der Step mit angepassten
Parametern wiederholt.

**Retry-Budget:** Default 2 pro Schritt, im State mitgefuehrt. Erschoepftes
Budget → naechste Bewertung kann nur noch `accepted`, `ask_user` oder `stop`
sein, kein weiteres `retry`.

**Default-/Safe-Action-Regel (gegen die `yes`-Falle):** Jede Review-Decision
traegt ein explizites `default_action` und pro Aktion ein
`safe_default: true|false`; die Card rendert nur diese Daten. `yes` darf **nur**
eine Aktion mit `safe_default: true` ausloesen. Riskante Optionen —
allen voran `continue_anyway` (mit duenner/leerer Coverage trotzdem
weiterbauen) — sind `safe_default: false` und muessen **namentlich** getippt
werden (`continue anyway`); ein blankes `yes` greift dort nicht. So kann `yes` nie
versehentlich „trotzdem fortfahren" statt „Recovery starten" bedeuten. Hat eine
Card keine sichere Default-Aktion, ist `default_action` leer und `yes` ist ein
No-op mit Hinweis auf die zu tippenden Optionen.

**Actions sind gate-skopiert, nicht global.** `continue_anyway` bedeutet je nach
aktivem Gate Verschiedenes — Low-Confidence-Kandidaten uebernehmen (5.2), duenne
Coverage akzeptieren (5.3) oder Plan-Flags ignorieren (5.4). Die
Session-Maschine dispatcht eine Eingabe daher **immer gegen die `proposed_actions`
der gerade offenen Card**, nie ueber einen globalen Action-Handler. Gleiches gilt
fuer `broaden`/`refine` etc.: nur gueltig, wenn die aktive Card sie anbietet,
sonst „nicht verfuegbar"-Hinweis statt stiller Fehlinterpretation.

---

## 7. State, Persistenz und Resume

Dieses Schema ist **1:1 kompatibel mit dem Zielbild** (`agent-orchestration-
layer-plan.md`). Es loest zwei Schwaechen der ersten Fassung: (a) Resume
validiert Artefakte ueber Hash + Fingerprint statt blind einen Pfad zu laden,
(b) der Chat-Verlauf liegt **nicht** im State, sondern append-only in einem
separaten Log.

### 7.1 `agent_state.json` (Run-Zustand + Pointer, kein Verlauf)

```jsonc
{
  "run_id": "accounting-fortgeschritten-ab12cd",
  "status": "running",            // running | completed | stopped | failed
  "mode": "dry_run",              // dry_run | live_notebook
  "providers": { "agent": { "adapter": "deterministic" }, "notebook": { "adapter": "notebooklm" } },
  "phase": "kurse_auswaehlen",
  "inputs": { "goal": "...", "current_level": "beginner", "language": "de" },
  "steps": {
    "course_discovery": {
      "status": "accepted",       // accepted | running | failed | stale | waiting_for_user | waiting_for_live_approval
      "depends_on": ["learning_contract", "goal_expansion"],
      "step_version": "course_discovery.v1",
      "input_fingerprint": "sha256:...",
      "accepted_output": {
        "artifact_path": "candidates.json",
        "artifact_sha256": "sha256:...",
        "schema": "candidate_selection.v1",
        "summary": { "candidate_count": 3, "low_confidence_count": 1 }
      },
      "review": { "decision": "accepted", "provider": "deterministic", "artifact_path": "reviews/course-discovery.review.json" }
    }
  },
  "conversation": { "log_path": "conversation.jsonl", "last_turn_id": "turn_0007" },
  "handoffs": { "chat": { "status": "blocked_until_learning_path" }, "notebook": { "status": "dry_run_ready" } }
}
```

`input_fingerprint` = `hash(step_name, step_version, task_policy_version,
relevante User-/CLI-Inputs, akzeptierte Dependency-`artifact_sha256`,
providerrelevante Settings)`. Beispiel Lernpfad-Step:
`hash("learning_path@v1", contract.artifact_sha256,
material_screening.artifact_sha256, plan_policy_version, max_units)`.

**Wichtig wegen der Selector-Bruecke (5.1):** Seit Phase 3 `selector_terms` aus
`goal-expansion.json` nutzt, **muss** `goal_expansion` in `course_discovery.depends_on`
stehen **und** dessen `artifact_sha256` in den `course_discovery`-Fingerprint
eingehen. Sonst aendert sich die Synonym-/Uebersetzungs-Map (→ andere
`selector_terms` → andere Kandidaten), aber Resume ueberspringt `course_discovery`
faelschlich als unveraendert. Genau der „grün-aus-falschem-Grund"-Fehler aus
Defekt 1.

### 7.2 `conversation.jsonl` (append-only Verlauf)

Persistenz ist die Source of Truth; In-Memory-Kontext ist nur Cache. Jeder
relevante User- und Agent-Turn wird **sofort append-only** angehaengt — der
**Verlauf** wird nie voll neu geschrieben, daher kein Korruptionsrisiko fuer
`conversation.jsonl` bei Ctrl+C.

> **Wichtig — gilt nicht automatisch fuer `agent_state.json`:** Der State *wird*
> bei jeder Gate-Entscheidung neu geschrieben (7.3, Schritt 2). Ein roher
> `writeFile` darauf ist bei Ctrl+C/Crash korruptionsanfaellig. Die
> Append-only-Eigenschaft schuetzt nur den Verlauf, nicht den State — daher die
> Atomic-Write-Pflicht in 7.3.

Jede `conversation.jsonl`-Zeile endet auf `\n`; beim Resume wird eine letzte,
unvollstaendige Zeile (ohne `\n`) als abgebrochener Append erkannt und
verworfen (partial-line recovery), statt den Parser zu killen.

```jsonl
{"turn_id":"turn_0001","role":"user","phase":"ziel_verstehen","text":"...","created_at":"..."}
{"turn_id":"turn_0002","role":"agent","phase":"ziel_verstehen","card_path":"cards/contract.md","text":"...","created_at":"..."}
{"turn_id":"turn_0003","role":"user","phase":"kurse_auswaehlen","action":"accept","text":"yes","created_at":"..."}
```

`agent_state.json` haelt nur `conversation.last_turn_id` als Pointer.

### 7.3 Transaktionale Gate-Persistenz

Reihenfolge bei jeder Gate-Aktion (so geht eine Freigabe bei Ctrl+C nie verloren):

1. User-Turn an `conversation.jsonl` **append**en (Zeile + `\n`).
2. Gate-Entscheidung in `agent_state.json` speichern.
3. Accepted Output / Review Decision schreiben (inkl. `artifact_sha256`).
4. **Erst danach** den naechsten Step starten.

**Atomic-Write-Pflicht (alle State-, Review- und Accepted-Output-Artefakte):**
`agent_state.json`, `reviews/<step>.review.json`, Accepted-Output-JSONs und
zugehoerige Markdown-Begleitdateien werden **nie** in-place ueberschrieben,
sondern als `write temp -> fsync -> rename` geschrieben (rename ist auf POSIX
atomar). So sieht ein Resume entweder den alten **oder** den neuen vollstaendigen
State, nie eine halb geschriebene Datei. Schritt 2 und 3 sind damit je fuer sich
crash-sicher; ein Crash *zwischen* 2 und 3 hinterlaesst eine gespeicherte
Decision ohne Artefakt, was 7.4 ueber den Hash-/Fingerprint-Check als `stale`
erkennt und neu faehrt.

Bestehende `save*`-Funktionen aus der Pipeline duerfen im Agent-Flow nur genutzt
werden, wenn sie entweder selbst auf Atomic-Write umgestellt wurden oder der
Agent ihre Daten ueber einen eigenen `atomicWriteArtifact`-Wrapper schreibt.
Direkte `writeFileSync`-Saver sind fuer `agent_state.json`,
`candidates.json`, `material-screening.json`, `learning-path.json` und
`learning-path.md` im Agent-Flow nicht zulaessig.

### 7.4 Resume (`learn agent chat --run <run-id>`)

Ein `accepted` Step wird **nur** uebersprungen, wenn **alle** stimmen:
`status === accepted` **und** `accepted_output.artifact_path` existiert **und**
aktueller Datei-Hash == `artifact_sha256` **und** `input_fingerprint` passt zu
aktuellen Inputs + akzeptierten Dependency-Hashes **und** `step_version`/Schema/
Task-Policy kompatibel. Sonst:

- `running` → als `interrupted` markiert und neu gestartet.
- `failed` → nicht blind neu; gespeicherte Card / `next_action` zeigen.
- `stale`/`invalidated` (Hash- oder Fingerprint-Mismatch) → neu gestartet.
- `waiting_for_user` → dieselbe Frage/Card erneut.
- `waiting_for_live_approval` → keine Side Effects bis User freigibt.
- NotebookLM-Side-Effects laufen idempotent ueber `path-notebook-state.json`
  weiter (vorhandene `notebook_id`/Uploads/Ready-Status werden gelesen, nur
  Fehlendes nachgeholt).

`AGENT_RUN.md` ist der lesbare Spiegel: Phasen, Karten-Zusammenfassungen,
Entscheidungen, Retry-History — analog zu `RUN.md`, aber chat-orientiert.

---

## 8. Review-Card-Rendering

Pro Gate eine kompakte Terminal-Card mit vier Zeilen-Bloecken:

```text
┌─ Kurse waehlen ───────────────────────────────────────────┐
│ Gesucht:    Kardiologie fuer Anfaenger (Einstieg, Deutsch) │
│ Gefunden:   3 Kurse — bester Treffer thematisch schwach    │
│ Entscheidung: Ich bin unsicher, ob das wirklich passt.     │
│ Du kannst:  [broaden] breiter suchen  [refine] schaerfen   │
│             [continue anyway] nutzen  [quit] abbrechen     │
└────────────────────────────────────────────────────────────┘
```

Backend-Begriffe (Candidate Selector, Source IDs, Scores) bleiben in den
Artefakten sichtbar, **nicht** in der Card-Sprache. Die Card zeigt immer den
aktuellen Step, die wichtigste Aussage und die erlaubten naechsten Aktionen.

Jede Card-Zeile traegt im Hintergrund ihr `action` und `safe_default`-Flag (vgl.
Abschnitt 6). Die sichere Default-Aktion ist als `[yes]` markiert; riskante
Aktionen werden mit ihrem **vollen Namen** gerendert (z.B. `[continue anyway]`,
nicht via `yes` erreichbar), damit die Card-Sprache die Default-/Safe-Regel
sichtbar spiegelt.

---

## 9. In-Session-Kommandos

Innerhalb des Loops werden kurze Eingaben als Kommandos interpretiert:

| Eingabe | Wirkung |
|---|---|
| `yes` | **nur** die `safe_default: true`-Aktion der Card bestaetigen (meist `accepted`); greift nie bei riskanten Aktionen |
| `broaden` | Suche breiter (Topic-Fit-Retry) |
| `deep scan` | `recover_sources` anstossen — Deep Scan + Unit Export gemeinsam (Coverage-Retry, 5.3) |
| `continue anyway` | Low-Confidence-Kandidaten oder duenne/leere Coverage bewusst akzeptieren und weiterbauen (`safe_default: false`, nur voll getippt) |
| `skip notebook` | Phase 6 ueberspringen, direkt zu Handoffs |
| `status` | aktuellen State zusammenfassen, ohne Phase zu wechseln |
| `quit` | Run sauber stoppen, State sichern |

Alles andere wird als freie User-Aeusserung behandelt (z.B. Zielklaerung in
Phase 1 oder Tutor-Frage in Phase 7).

---

## 10. Datei-Layout

Pro Run unter `output/learning-paths/<run-id>/`:

```text
agent_state.json            # Run-Zustand + Pointer (neu, kein Verlauf)
conversation.jsonl          # append-only Chat-Verlauf (neu)
AGENT_RUN.md                # lesbarer chat-orientierter Bericht (neu)
reviews/<step>.review.json  # Reviewer-Ergebnis je Gate (neu)
cards/<phase>.md            # gerenderte Review Cards (neu)
contract.json               # bestehend (contract.js)
goal-expansion.json          # Expansion inkl. topic_terms/selector_terms (neu)
candidates.raw.json         # roher Selector-Output (neu im Agent-Flow)
candidates.json             # akzeptierter/gefilterter Kandidatensatz fuer Downstream
material-screening.json     # bestehend (material-screening.js)
learning-path.json / .md    # bestehend (planner.js)
path-notebook-state.json    # bestehend (path-notebook.js)
```

---

## 11. Modul-/Datei-Plan (fuer die spaetere Implementierung)

Neue Verzeichnisse unter `ocw-pipeline/src/learning/agent/`:

```text
src/learning/agent/
  provider-runtime/   # reviewJson-Interface + deterministic-Provider
  run-state/          # agent_state.json + AGENT_RUN.md + Resume
  quality-review/     # 4 Reviewer + Gate-Decision-Modell
  review-cards/       # Terminal-Card-Rendering
  session/            # readline-Loop + Phasen-Maschine + In-Session-Kommandos
```

Nur diese fuenf Bereiche im MVP. Die uebrigen sieben aus dem Zielbild
(`user-profile`, `course-discovery` als eigenes Modul, `source-coverage` als
eigenes Modul, `learning-path` als eigenes Modul, `notebook-workspace`,
`tutor-chat` als eigenes Modul, `learning-assets`) bleiben deferred — ihre
MVP-Funktion wird durch die bestehenden Pipeline-Module abgedeckt.

---

## 12. Test-Plan

Der `deterministic`-Provider macht den kompletten Flow **voll reproduzierbar** —
die folgenden Tests laufen in CI ausschliesslich gegen `deterministic` und
gegen eine **gepinnte Fixture-Test-DB** (nicht die Live-`library.db`), analog zu
[`test/learning-v1-run.test.js`](../../ocw-pipeline/test/learning-v1-run.test.js):

1. **E2E Happy Path:** Ziel, das im Fixture-Corpus **nachweislich existiert**
   (z.B. ein Accounting- oder Intro-CS-Kurs — beide sind unter `output/notebooklm/`
   belegt), von `chat --new` bis Dry-Run-Plan mit gescripteten `yes`-Antworten.
   Erwartet `status: completed`, alle Steps `accepted`. **Bewusst nicht
   Kardiologie** — das wuerde gegen MIT-OCW an candidates/materials scheitern und
   waere Wunschdenken.
2. **No-Candidate / Recovery (Kardiologie):** Goal „Kardiologie" → erwartet, dass
   Topic-Fit/Candidates **kein** sauberes Ergebnis liefern; gescripteter Pfad
   `broaden` → `refine`; Test prueft, dass der Agent die Recovery-Cards zeigt und
   nicht still mit leerem Ergebnis abbricht.
   > **Achtung — dieser Test allein deckt 5.1/5.2 nicht ab.** Eine **kaputte**
   > `topic_terms`-Normalisierung (deutscher `domain_term` matcht nie englische
   > Topics) wuerde hier ebenfalls `ask_user`/`broaden` erzeugen und den Test
   > **gruen faerben — aus dem falschen Grund**. Die Term-Normalisierung wird
   > daher separat in Test 2b geprueft.
2b. **Term-Normalisierung + Selector-Bruecke (Goal-Expansion ↔ Topic-Fit,
   deutscher Goal):** Fixture mit einem Kurs, dessen `signals.topics` die
   **englische** Translation enthaelt (z.B. `cardiology`), und Goal
   „Kardiologie" → erwartet, dass `selector_terms` den Kandidaten schon durch
   `selectCourseCandidates` bringt **und** `topic_terms` im Reviewer zu
   `accept` fuehrt (nicht faelschlich `reject`/`ask_user`). Schuetzt direkt gegen
   den domain_terms-only-Bug vor und nach dem Selector.
3. **Topic-Fit-Gate (Accounting-Falle):** Kandidaten-Set, in dem ein hoch
   gescorter Kurs `accounting` nur im Titel, nicht in `signals.topics` hat →
   erwartet `ask_user` mit `broaden`/`refine`; nach `broaden` veraenderte Auswahl.
   Zusatz-Assertion: `candidates.raw.json` enthaelt den False Positive, aber
   `candidates.json` enthaelt ihn nicht; Source-Coverage liest nur
   `candidates.json`.
3b. **Low-Confidence nur nach User-Freigabe:** Kandidaten-Set mit einem
   `accept` und einem `low_confidence` → ohne User-Freigabe enthaelt
   `candidates.json` nur den `accept`. Ein reiner Low-Confidence-Satz erzeugt
   `ask_user`; erst die explizite Eingabe `continue anyway` uebernimmt diese
   Kandidaten in `candidates.json`.
4. **Coverage-Retry:** Kandidat ohne nutzbare Sources, initiale Phase mit
   deaktiviertem rescreen/export → erwartet `retry` mit `recover_sources`;
   nach Freigabe Re-Run mit aktivierten Flags → nicht-leere `usable_sources`.
   Zusatz-Assertion: bei zwei akzeptierten Kursen (A voll, B leer) flaggt die
   **per-Kurs**-Coverage B, statt durch A maskiert zu werden.
4b. **Atomic-Write / Crash-Sicherheit:** State nach Schritt 2, aber **vor**
   Schritt 3 (7.3) abbrechen → Resume erkennt die Decision-ohne-Artefakt als
   `stale` und faehrt den Step neu; eine kuenstlich abgeschnittene letzte
   `conversation.jsonl`-Zeile (ohne `\n`) wird verworfen, ohne den Parser zu
   killen.
5. **Plan-Quality:** Plan mit rohem `lec1.pdf`-Titel → erwartet `ask_user`;
   nach `normalize_titles` menschenlesbarer Titel in `learning-path.json`
   **und** `learning-path.md`, mit aktualisierten Hashes im State.
6. **Resume:** Run nach akzeptiertem Gate 3 abbrechen, `--run <id>` neu starten →
   erwartet Wiedereinstieg beim ersten nicht-`accepted` Step, intaktes
   `conversation.jsonl` mit erhaltener `last_turn_id`, und dass `accepted` Steps
   nur bei gueltigem `artifact_sha256` + `input_fingerprint` uebersprungen werden
   (ein manipuliertes Artefakt loest `stale` + Re-Run aus).
7. **Safe-Default / `yes`-Semantik:** Card mit `continue_anyway` und
   `safe_default:false` → Eingabe `yes` ist ein No-op mit Hinweis; erst
   `continue anyway` fuehrt die riskante Aktion aus. Provider-JSON ohne
   `safe_default` oder mit `default_action` auf eine unsichere Action ist
   schema-invalid.

**codex-cli (nicht in CI):** ein manueller Opt-in-Smoke-Test fuehrt den Happy
Path mit `--provider codex-cli` aus und prueft, dass (a) `codex exec` ueber die
Subscription-Auth laeuft, (b) alle vier Gates valides JSON liefern, (c) die
Decisions auf den Fixtures nicht grob von den deterministischen Referenz-Orakeln
abweichen.

---

## 13. Bewusst deferred

- Weitere Provider: `claude-code` (headless `claude -p` nicht subscription-tragfaehig),
  `gemini-api`, `gemini-cli`, `openai-api`. `deterministic` ist blockierender
  MVP-Provider; `codex-cli` ist nur dann im MVP scharf, wenn der Auth-Smoke
  besteht, sonst erste Post-MVP-Aufgabe.
- `learning-assets` (Study Guides, Quiz, Flashcards) als eigene Pipeline.
- NotebookLM-native Artifacts und Mindmap-Source-Routing.
- Persistente User-Profile und Lernhistorie.
- Web-UI als zweite Oberflaeche.
- `learn agent run` als separater nicht-interaktiver Befehl.

---

## Abgleich mit der Diskussion und den Review-Findings

**Grilling-Punkte:**

1. **Provider-Aufruf:** Abschnitt 4 — `reviewJson`-Signatur; codex via
   `--output-schema`/`--output-last-message` (Result-Datei, **kein** stdout-Parsing);
   max. ein Format-Repair.
2. **Review-Loop vs. Bestehendes:** Abschnitt 5 — jeder Reviewer geht ueber das
   hinaus, was Tool/Selector deterministisch tun (Topic-Fit nutzt
   `signals.topics`-Validierung statt blossem Token-Overlap).
3. **State-Schema:** Abschnitt 7 — Pointer + `artifact_sha256` + `input_fingerprint`,
   harte Resume-Bedingungen.
4. **Interaktiver Loop & Ctrl+C:** Abschnitt 7.2/7.3 — append-only
   `conversation.jsonl` + transaktionale Gate-Persistenz, nahtloser Wiedereinstieg.
5. **Topic-Fit vs. Selector:** Abschnitt 5.2 — Reviewer ergaenzt
   `thematic_fit_passed`; bei No-Fit → `ask_user` (broaden/refine), kein stiller Stop.
6. **MVP-Modulset:** Abschnitt 1 + 11 — fuenf neue Module statt zwoelf.

**Review-Findings (alle adressiert):**

- *codex stdout brittle* → 4: Schema-/Result-Datei statt stdout; codex gated hinter Auth-Smoke.
- *Resume ohne Hash* → 7.1/7.4: `artifact_sha256` + `input_fingerprint` + `step_version`.
- *turns[] eingebettet* → 7.2/7.3: append-only `conversation.jsonl` + `last_turn_id`-Pointer.
- *Coverage-Retry widerspruechlich* → 5.3: initiale Phase ohne rescreen/export; Recovery = user-approved Re-Run.
- *Topic-Fit faengt Accounting nicht* → 5.2: `signals.topics`-Validierung + Mismatch-Regel; ehrlicher Baseline-Vorbehalt.
- *Kardiologie E2E nicht reproduzierbar* → 12: Happy Path auf Fixture-Corpus-Ziel; Kardiologie = Recovery-Test.
- *CLI-Namen falsch* → 2: `node src/scrape.js learn agent …`; `learn`-Bin als benannte offene Scope-Frage.
- *Open Question (Loop-only vs. codex)* → Eckpfeiler 2: Chat-Loop ist blockierend (deterministic); codex ist gated/nicht-blockierend.

**Zweite Review-Runde (2026-05-31, alle adressiert):**

- *Goal-Expansion ↔ Topic-Fit greift nicht (deutscher Goal)* → 5.1/5.2: `topic_terms` als kanonische Match-Basis; Test 12.2b.
- *State korruptionsanfaellig* → 7.2/7.3: Atomic-Write + partial-line recovery; Test 12.4b.
- *`yes` mehrdeutig* → 6/8/9: `default_action` + `safe_default`; `continue_anyway` nur voll getippt.
- *Topic-Fit zu grob (Set- statt Kandidaten-Level)* → 5.2: candidate-level Verdicts + `accepted_candidate_ids`.
- *Coverage zu aggregiert* → 5.3: per-Kurs-Coverage.
- *`deep_scan`/`unit_export` unscharf* → 5.3/9: eine `recover_sources`-Action, 1:1 zum Kommando `deep scan`.
- *Plan-Quality-Heuristik zu naiv* → 5.4: breitere Rohtitel-Heuristik (Course-Codes, `_`/CamelCase, Endungen).
- *codex-Scope-Inkonsistenz* → 1/5: „gated"-Qualifier; Smoke-Fail = deterministic-only.

**Dritte Review-Runde (2026-05-31, alle adressiert):**

- *`topic_terms` wirken erst nach dem Selector* → 3/5.1/5.2: `selector_terms`
  werden vor `selectCourseCandidates` genutzt; Test 12.2b prueft den
  kompletten Selector→Reviewer-Pfad.
- *`accepted_candidate_ids` ohne Downstream-Wirkung* → 3/5.2/10:
  `candidates.raw.json` bleibt Audit-Artefakt, `candidates.json` ist gefilterte
  Downstream-Source-of-Truth.
- *`safe_default` fehlte im Provider-Schema* → 4/6/12.7:
  `default_action` + `proposed_actions[].safe_default` sind schema-relevant.
- *Atomic-Write kollidiert mit bestehenden Savern* → 7.3: Agent nutzt
  Atomic-Artifact-Writer/gehaertete Saver, keine direkten in-place-Saver.
- *Unsichere Card zeigte noch `[yes] uebernehmen`* → 8: Low-Confidence-Card
  ohne sicheren Default, `continue anyway` nur voll ausgeschrieben.
- *`normalize_titles` konnte Markdown stale lassen* → 5.4 und Test 12 (Nr. 5):
  JSON und Markdown werden gemeinsam aktualisiert und neu gehasht.
