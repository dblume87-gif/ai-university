# 04 Quality-Review: Source-Coverage und Plan-Quality

Status: Backlog
MVP-Modul: quality-review
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 5.3, 5.4, 6
Parallelisierbar: ja, nach Ticket 01; parallel zu Ticket 03

## Ziel

Die zwei Reviewer der spaeten Phasen: Source-Coverage prueft pro Kurs, ob
nutzbare Quellen vorliegen, bevor der Planner Units baut; Plan-Quality flaggt
rohe Dateinamen, Units ohne Sources und Course-ID-Mismatches. Beide teilen das
Gate-Decision-Modell aus Ticket 03/Abschnitt 6.

## Scope

### Source-Coverage (`task: "coverage_review"`)

- Wichtige Korrektur: `screenCandidateMaterials` faehrt `rescreenMissing`
  (Deep Scan) und `exportMissingUnits` (Unit Export) **per Default intern**,
  bevor der Reviewer den Output sieht. Daher ruft Phase 4 die **initiale**
  Screening-Runde mit `rescreenMissing: false, exportMissingUnits: false` auf —
  der Reviewer sieht die rohe Coverage ohne Auto-Recovery.
- Input: die gefilterte `candidates.json` aus Ticket 03, **nicht**
  `candidates.raw.json`. Rejected Candidates duerfen Coverage und Planner nicht
  erreichen.
- Regel pro Kurs (nicht nur global aggregiert): Coverage als `course_coverage`
  je akzeptiertem Kandidaten, damit ein quellenreicher Kurs keinen leeren
  Nachbarkurs maskiert.
  - **keine neue Screening-Arbeit:** vorhandene Felder wiederverwenden —
    `courseMaterialOverviews[].usable_sources`, `no_usable_sources`,
    `usable_source_count` aus `material-screening.js`.
  - alle akzeptierten Kurse mit `usable_sources.length === 0` -> `retry` mit
    `[recover_sources]` (User-Freigabe noetig).
  - einzelne Kurse leer oder Coverage-Ratio unter Schwelle -> `ask_user` mit
    `recover_sources` plus `continue_anyway` (`safe_default: false`).
  - sonst -> `accepted`.
- **Eine Recovery-Action statt zwei:** `recover_sources` setzt intern
  `rescreenMissing: true` **und** `exportMissingUnits: true` (Deep Scan + Unit
  Export laufen immer gemeinsam, 1:1 zum In-Session-Kommando `deep scan`).
- Nach Freigabe startet die Phase das Screening erneut mit aktivierten Flags —
  der user-approved Re-Run *ist* die Recovery (Ausfuehrung in Ticket 07).

### Plan-Quality (`task: "plan_review"`)

- Input: `buildLearningPathPlan`-Output (`units`, `selected_courses`,
  `sources`).
- Flaggt:
  - **rohe Dateinamen** breit, nicht nur `^lec\d+\.pdf$`: Titel mit Endung
    (`\.(pdf|pptx?|docx?)$`), eingebettete Course-Codes (`[A-Z]{2,}\d`),
    `_`/CamelCase-zusammengeklebte Tokens, reine Nummern, sehr kurze Titel
    (< 3 Woerter), hoher Anteil nicht-sprachlicher Tokens.
  - **Units ohne Sources**.
  - **Course-ID-Mismatch** zwischen Unit und `selected_courses`.
- Decision: Flags vorhanden -> `ask_user` mit
  `[normalize_titles, drop_unit, continue_anyway]`; sonst `accepted`.
- `normalize_titles` ist eine deterministische Titel-Normalisierung
  (z.B. `lec1.pdf` -> `Lecture 1`), die den Plan vor Freigabe aktualisiert.

## Nicht im Scope

- Goal-Expansion und Topic-Fit (Ticket 03).
- Die tatsaechliche Ausfuehrung der Recovery-/Normalisierungs-Re-Runs (Ticket 07).
- Die Atomic-Write-Mechanik fuer `learning-path.json`/`.md` (Ticket 05).
- codex-cli-Prompts (Ticket 08).

## Abhaengigkeiten

- Ticket 01: `reviewJson`-Interface + Decision-Schema.
- Ticket 03: Gate-Decision-Modell und `candidates.json`-Form.
- Bestehende `material-screening.js` und `planner.js`.

## Blocker

- `candidates.json` aus Ticket 03 fehlt (Coverage darf nicht
  `candidates.raw.json` lesen).

## Umsetzungshinweise

- `normalize_titles` muss spaeter JSON **und** Markdown synchron neu schreiben
  (`learning-path.json`, eingebettetes/gerendertes Markdown, `learning-path.md`)
  — ein JSON-only Patch gilt als fehlgeschlagen. Die Atomic-Write-Mechanik dafuer
  liegt in Ticket 05; dieses Ticket definiert nur, *welche* Artefakte
  synchron sein muessen.
- Per-`unit`-Coverage faengt zusaetzlich downstream ab; hier geht es um die
  fruehere, billigere Pruefung pro Kurs.

## Akzeptanzkriterien

- Coverage wird pro akzeptiertem Kurs gemessen, nicht nur global.
- Alle Kurse leer -> `retry` mit `recover_sources`; einzelne leer/duenn ->
  `ask_user` mit `recover_sources` + `continue_anyway` (unsicher).
- `recover_sources` ist genau eine Action und setzt beide Recovery-Flags.
- Plan-Quality flaggt rohe Dateinamen breit, Units ohne Sources und
  Course-ID-Mismatch.
- Flags vorhanden -> `ask_user` mit `[normalize_titles, drop_unit,
  continue_anyway]`.

## Tests / Verifikation

- Spec-Test 4 (Coverage-Retry): Kandidat ohne nutzbare Sources, initiale Phase
  mit deaktiviertem rescreen/export -> `retry` mit `recover_sources`; nach
  Freigabe Re-Run -> nicht-leere `usable_sources`. Zusatz: zwei Kurse (A voll,
  B leer) -> per-Kurs-Coverage flaggt B statt es durch A zu maskieren.
- Spec-Test 5 (Plan-Quality): Plan mit rohem `lec1.pdf`-Titel -> `ask_user`;
  nach `normalize_titles` lesbarer Titel in `learning-path.json` **und**
  `learning-path.md` (Synchronitaet wird ueber Ticket 05 verifiziert).

## Uebergabe an Folge-Tickets

- Ticket 05 stellt die Atomic-Write-/Hash-Mechanik fuer die
  `normalize_titles`-Aktualisierung.
- Ticket 07 fuehrt die user-approved Recovery- und Normalisierungs-Re-Runs aus.
- Ticket 08 liefert dieselben Actions als codex-Variante.
