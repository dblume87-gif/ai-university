# 001b - Search-Agent MVP

Status: Done

## Kontext

Der bisherige Agent-Prototyp hat gezeigt, dass deterministische One-Shot-Auswahl
zu starr ist. Die deterministischen Bausteine sind wertvoll — aber als
**kontrollierte Werkzeuge, die ein Agent gezielt nutzt**, nicht als versteckte
Ranking-Policy. Das MVP wird deshalb sauber getrennt neu aufgebaut:
`ocw-pipeline` bleibt Bausteinkasten und wird nur **importiert**; der neue
MVP-Pfad bekommt einen eigenen Ordner.

Dieses Ticket baut den **ersten, engen Happy Path**: Ein User schildert im Chat,
was er lernen will; der Agent findet passende Kurse in der Library und gibt eine
**Fit-Einschaetzung** samt **Datengrundlage** zurueck. Auf Bitte des Users sucht
der Agent erneut/breiter.

## Ziel

```text
User: "Ich will etwas ueber Supply Chain Management lernen."
Agent: ruft searchCourses auf -> bewertet die Evidence ->
       "Diese 3 Kurse passen am besten: ... . Grundlage: Titel, Topics und
        Materialzahlen aus der Library."
User: "Zeig mir noch breiter gefasste Optionen."
Agent: ruft searchCourses erneut, anders parametrisiert auf -> antwortet.
```

- MVP-Code lebt getrennt vom Prototyp, unter `mvp/`.
- Eine deterministische Funktion (`searchCourses`) wird als **Agent-Tool**
  modelliert; sie liefert **ehrliche Evidence**, keine fachliche Entscheidung.
- Der Agent (codex) faellt das **Fit-Urteil** auf Basis der Evidence.
- Man kann mit dem Agenten chatten und mehrfach (breiter/verfeinert) suchen.

## Abhaengigkeiten

- **[000](000-mvp-package-skeleton.md)** richtet das `mvp/`-Package, die
  `data/library.db`-Kopie und den Import-Boundary ein (parallel, spike-unabh.).
- **[001a](001a-spike-codex-mcp-tool-calling.md)** muss **grün** sein. Der dort
  bewiesene, exakt funktionierende `codex exec`-Aufruf (MCP-Primaerpfad oder
  „eigener Loop"-Fallback) ist die Grundlage des Provider-Adapters hier.

## Zu bauende Dateien (im Geruest aus 000)

```text
mvp/src/
  agent/providers/codex-cli.js   # Provider-Adapter (MCP-Plumbing aus ocw-pipeline reused)
  tools/ocw-library.js           # searchCourses -> Course Evidence (MCP-Tool)
  workflows/chat-loop.js         # Replay-basierter Multi-Turn-Loop
  artifacts/conversation.js      # append-only conversation.jsonl
  cli.js                         # Einstieg: chat-Session starten
```

Package-Skeleton, `data/library.db` und die Verzeichnisse kommen aus 000 und
werden hier vorausgesetzt, nicht erneut angelegt.

## Course Evidence (gelockt)

`searchCourses` wrappt `selectCourseCandidates` aus
[contract.js](../../ocw-pipeline/src/learning/contract.js) und gibt pro Kurs
zurueck:

- `course_id`
- `title`
- `topics` — kuratierte Themen (Teil der Datengrundlage)
- `material_evidence` — Library-Counts (total + Aufschluesselung aus
  `signals.materials`), **klar markiert als „aus Metadaten, ungeprueft"**
- `fit_evidence` — `score`, `matched_tokens`, Kurz-Begruendung; enthaelt
  **auch schwache Signale**, damit der Agent selbst verwerfen kann
- `source` — Herkunft der Evidence (z.B. `library.db / selectCourseCandidates`)

`recovery_evidence` wird **bewusst weggelassen** und erst mit dem
Material-Screening additiv ergaenzt — ein dauerhaft leeres Feld waere
irrefuehrend.

## searchCourses-Contract

- **Input:** `{ query, level?, language?, limit? }`. Ruft intern
  `normalizeLearningContract` + `selectCourseCandidates`.
- **Output:** Liste von Course-Evidence-Objekten (s.o.).
- **Tool, nicht Filter:** das Tool sortiert **nicht** generische Treffer vor; es
  liefert ehrliche Evidence inkl. schwacher Signale. Das Fit-Urteil (auch das
  Verwerfen generischer `analysis`/`matrix`-Treffer) faellt der **Agent**.
- Goal-Expansion / `selector_terms` sind **deferred**.

## Conversation & Multi-Turn

- **Replay, nicht `exec resume`** (Entscheidung aus 001a): jeder Turn ist ein
  frischer `codex exec --ephemeral`, in den die bisherige Konversation
  (User-Nachrichten, fruehere Tool-Ergebnisse, Agent-Antworten) als Kontext
  eingespielt wird.
- **`conversation.jsonl`** (append-only, pro Session unter `mvp/output/`) ist die
  **einzige Source of Truth** des Verlaufs.
- „Suche breiter / weitere Kurse" loest einen erneuten, anders parametrisierten
  `searchCourses`-Aufruf aus.

## Provider

- codex ueber den in 001a bewiesenen Pfad; die **MCP-/exec-Plumbing**
  (Aufruf, Schema-Validierung, JSON-Repair, Auth-Erkennung) wird aus
  [provider-runtime](../../ocw-pipeline/src/learning/agent/provider-runtime/index.js)
  wiederverwendet, nicht neu erfunden.
- Hinter einem schlanken Provider-Interface, damit codex spaeter tauschbar ist.

## Nicht-Ziele

- Kein Lernpfad, keine Course-Selection-Freigabe, keine Kandidaten-Persistenz.
- Kein Material-Screening, keine Source-Recovery (→ kein `recovery_evidence`).
- Keine Website-Probes, keine NotebookLM-Aktionen, keine Assets.
- Keine vier Review-Gates / Phasen-Maschine aus dem alten Orchestrierungs-Spec.
- Kein deterministischer Reviewer-Provider / Mock-CI-Harness als MVP-Ziel.
- Kein freies SQL vom Agenten; DB-Zugriff bleibt read-only ueber das Tool.
- Keine Prototyp-Dateien aus `ocw-pipeline` verschieben oder loeschen.

## Architekturregeln

- `mvp` darf `ocw-pipeline` importieren; `ocw-pipeline` **nicht** `mvp`.
- `mvp` hat ein eigenes `package.json`.
- `mvp/data/library.db` ist die lokale MVP-Datenbasis (Kopie).
- Tools liefern **Evidence oder Actions**, nie die endgueltige fachliche
  Entscheidung.
- DB-Zugriff bleibt read-only und laeuft ueber kontrollierte Tool-Funktionen.
- LLM-Zugriff laeuft ueber ein Provider-Interface; erster Provider ist codex-cli.

## Akzeptanzkriterien

- (Voraussetzung aus 000: `mvp/`-Package + `data/library.db` + Import-Boundary
  stehen.)
- `searchCourses(input)` liefert normalisierte Course Evidence mit `course_id`,
  `title`, `topics`, `material_evidence`, `fit_evidence`, `source`.
- Ein dokumentierter CLI-Befehl startet eine Chat-Session.
- **Manueller Happy-Path-Test** (live gegen codex): User fragt nach Kursen →
  Agent nutzt `searchCourses` → Agent gibt Fit-Einschaetzung + Datengrundlage
  (Titel, Topics, Material-Counts); zweite User-Bitte „breiter" loest erneute
  Suche aus.
- **Deterministischer Tool-Test** (CI, gegen Fixture-DB): eine Strategy-Suche
  findet relevante Kurse, und die zurueckgegebene Evidence enthaelt die schwachen
  Signale (generische `analysis`/`matrix`-Treffer) **als markierte Evidence**,
  ohne sie zu unterdruecken — damit der Agent sie verwerfen *kann*.
- `npm test` (oder MVP-spezifischer Befehl) ist dokumentiert und gruen.

## Test-Strategie

- **Deterministisch in CI:** nur `searchCourses` (reine Funktion gegen
  Fixture-DB) — schuetzt, dass der Agent **vertrauenswuerdige** Evidence bekommt.
- **Manuell / live:** der Chat-Loop gegen codex. Bewusst **kein** Mock-CI-Harness
  fuer den Loop in diesem Ticket — die Form soll sich erst im echten Chat
  beweisen; deterministische Loop-Regression kommt spaeter, wenn sie steht.

## Entscheidungen

- Package-Boundary und `library.db`-Kopie sind nach 000 ausgelagert.
- Course Evidence pragmatisch ueber Tests stabilisiert, kein formales JSON-Schema
  vorab; `recovery_evidence` deferred bis Material-Screening.
- Tool liefert ehrliche Evidence, Agent urteilt.
- Multi-Turn ueber Replay; `conversation.jsonl` ist Source of Truth.
- Provider-Plumbing aus `ocw-pipeline/provider-runtime` wiederverwenden.

## Ergebnis 2026-05-31

- `searchCourses(input)` gebaut: nutzt `normalizeLearningContract` und
  `selectCourseCandidates`, gibt Course Evidence mit Topics, Material-Counts,
  Fit-Evidence und markierten Weak Signals zurueck.
- Wegen 001a-Approval-Ergebnis: Produktpfad nutzt einen eigenen
  Agent-Tool-Loop statt nativer headless MCP-Calls.
- `conversation.jsonl` ist append-only Source of Truth pro Session unter
  `mvp/output/chat/<session-id>/`.
- CLI:
  `npm run chat -- --new --message "Ich will Business Strategy lernen"`.
- Live getestet: zweiter Turn mit „Such breiter..." loest eine neue Suche mit
  breiterer Query aus.
- `npm test` gruen.
