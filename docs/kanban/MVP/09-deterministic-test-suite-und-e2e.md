# 09 Deterministic Test-Suite und E2E

Status: Backlog
MVP-Modul: querschnitt (Tests)
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 12
Parallelisierbar: teilweise; Fixture-DB und Einzeltests parallel zu 03-07, E2E nach 07

## Ziel

Der `deterministic`-Provider macht den kompletten Flow voll reproduzierbar.
Dieses Ticket buendelt den blockierenden CI-Testplan, der ausschliesslich gegen
`deterministic` und eine **gepinnte Fixture-Test-DB** (nicht die Live-
`library.db`) laeuft, analog zu `test/learning-v1-run.test.js`.

## Scope

- Gepinnte Fixture-Test-DB mit Kursen aus den unter `output/notebooklm/`
  belegten Domaenen (Accounting, Intro-CS) plus den fuer Negativ-Tests noetigen
  Faellen (Kardiologie, Accounting-False-Positive, Low-Confidence-Kandidat).
- Die folgenden Tests, alle gegen `--provider deterministic`:

| Test | Inhalt |
|---|---|
| 1 | **E2E Happy Path** auf Fixture-Corpus-Ziel (Accounting/Intro-CS), `chat --new` bis Dry-Run-Plan mit gescripteten `yes` -> `status: completed`, alle Steps `accepted`. Bewusst **nicht** Kardiologie. |
| 2 | **No-Candidate/Recovery (Kardiologie)** -> Topic-Fit/Candidates liefern kein sauberes Ergebnis; Pfad `broaden` -> `refine`; Recovery-Cards statt stiller Abbruch. |
| 2b | **Term-Normalisierung + Selector-Bruecke** (deutscher Goal `Kardiologie`, Kurs mit `cardiology` in `signals.topics`) -> `selector_terms` bringt den Kandidaten durch `selectCourseCandidates` **und** `topic_terms` fuehrt zu `accept`. |
| 3 | **Topic-Fit-Gate (Accounting-Falle)** -> `accounting` nur im Titel -> `ask_user` (broaden/refine); `candidates.raw.json` enthaelt den False Positive, `candidates.json` nicht; Coverage liest nur `candidates.json`. |
| 3b | **Low-Confidence nur nach Freigabe** -> ein `accept` + ein `low_confidence`: ohne Freigabe nur der `accept` in `candidates.json`; reiner Low-Confidence-Satz -> `ask_user`; erst `continue anyway` uebernimmt. |
| 4 | **Coverage-Retry** -> Kandidat ohne Sources, initiale Phase ohne rescreen/export -> `retry` mit `recover_sources`; nach Freigabe Re-Run -> nicht-leere `usable_sources`. Zusatz: zwei Kurse (A voll, B leer) -> per-Kurs-Coverage flaggt B. |
| 4b | **Atomic-Write/Crash** -> Abbruch nach Schritt 2 vor Schritt 3 -> Resume erkennt `stale` und faehrt neu; abgeschnittene letzte `conversation.jsonl`-Zeile wird verworfen. |
| 5 | **Plan-Quality** -> roher `lec1.pdf`-Titel -> `ask_user`; nach `normalize_titles` lesbarer Titel in `learning-path.json` **und** `.md`, mit aktualisierten Hashes im State. |
| 6 | **Resume** -> Abbruch nach Gate 3, `--run <id>` neu -> Wiedereinstieg beim ersten nicht-`accepted` Step, intaktes `conversation.jsonl` mit erhaltener `last_turn_id`; manipuliertes Artefakt -> `stale` + Re-Run. |
| 7 | **Safe-Default/`yes`-Semantik** -> `yes` auf `continue_anyway`-Card ist No-op mit Hinweis; erst `continue anyway` fuehrt aus. Provider-JSON ohne `safe_default` oder mit `default_action` auf unsichere Action ist schema-invalid. |

## Nicht im Scope

- codex-cli-Tests (Ticket 08, manueller Opt-in-Smoke, nicht in CI).
- Live-NotebookLM-Side-Effects (Tests laufen im Dry-Run).
- Live-`library.db` (nur Fixture-DB).

## Abhaengigkeiten

- Tickets 03/04 (Reviewer-Regeln), 05 (State/Resume/Atomic), 06 (Cards),
  07 (Loop) — je nach Test.
- Bestehendes Testmuster aus `test/learning-v1-run.test.js`.

## Blocker

- Fixture-Test-DB fehlt.
- Loop (Ticket 07) fuer die E2E-Tests noch nicht integriert.

## Umsetzungshinweise

- **Warnung zu Test 2 allein:** Eine kaputte `topic_terms`-Normalisierung wuerde
  Test 2 ebenfalls gruen faerben — aus dem falschen Grund. Test 2b ist daher
  Pflicht und deckt den kompletten Selector -> Reviewer-Pfad ab.
- Tests gegen `deterministic` muessen bit-stabil sein; gescriptete Eingaben
  ersetzen den interaktiven readline-Input.

## Akzeptanzkriterien

- Alle Tests 1-7 (inkl. 2b/3b/4b) laufen gruen gegen `deterministic` und die
  Fixture-DB.
- Kein Test beruehrt die Live-`library.db` oder echte NotebookLM-Endpunkte.
- Test 2b schlaegt fehl, wenn die `topic_terms`-Normalisierung kaputt ist
  (Schutz gegen gruen-aus-falschem-Grund).

## Tests / Verifikation

- `npm test` enthaelt die neue Agent-Test-Suite und bleibt deterministisch.
- CI-Lauf gruen ohne codex und ohne Netzwerk-/NotebookLM-Zugriff.

## Uebergabe an Folge-Tickets

- Die Fixtures dienen Ticket 08 als Vergleichsbasis fuer den codex-Smoke
  (Referenz-Orakel).
