# 02 Contract Selector-Bridge (selector_terms)

Status: Ready
MVP-Modul: contract.js (bestehend, eng erweitert)
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 3, 5.1, 5.2
Parallelisierbar: ja, Foundation; parallel zu Ticket 01

## Ziel

Goal-Expansion muss **vor** dem Selector wirken, nicht erst beim Reviewer. Ohne
diese Bruecke filtert `selectCourseCandidates` deutschsprachige Goals wie
`Kardiologie` schon vor dem Topic-Fit-Gate aus, weil der Selector intern auf
`contract.goal` matcht. Dieses Ticket erweitert `contract.js` eng, damit die
englischen/kanonischen Suchterme aus der Goal-Expansion in den Selector
gelangen.

## Scope

- `selectCourseCandidates` akzeptiert optional `selectorTerms`/`selector_terms`.
- `scoreGoal` nutzt diese Terme statt ausschliesslich
  `expandGoalTokens(contract.goal)`.
- Der normalisierte Contract bleibt userfaehig unveraendert: `goal` bleibt der
  Originalauftrag, er wird **nicht** mit englischen Suchstrings ueberschrieben,
  damit Cards, Berichte und Chat weiter den User-Auftrag zeigen.
- Default-Verhalten ohne `selector_terms` bleibt bit-identisch zum heutigen
  Selector (Rueckwaertskompatibilitaet fuer `learn v1 run`, `learn candidates`).

## Nicht im Scope

- Die Erzeugung von `selector_terms`/`topic_terms` selbst (das ist die
  Goal-Expansion in Ticket 03).
- Aenderungen am Thematic-Fit-Gate-Output (`thematic_fit.gate`,
  `has_goal_match`, `matched_tokens` bleiben).
- Topic-Fit-Reviewer-Logik (Ticket 03).

## Abhaengigkeiten

- Bestehendes `selectCourseCandidates`/`scoreGoal`/`expandGoalTokens` in
  `contract.js`.

## Blocker

- Keine. Foundation-Ticket.

## Umsetzungshinweise

- Bewusst eine **enge** Erweiterung, keine Selector-Neuschreibung: nur ein
  optionaler Parameter und ein Term-Quellen-Swap in `scoreGoal`.
- `selector_terms` (aus Ticket 03) sind `topic_terms` plus die Token aus dem
  Original-Goal; dieses Ticket konsumiert sie nur, definiert sie nicht.
- Wegen dieser Bruecke wird `course_discovery` spaeter von `goal_expansion`
  abhaengig (Resume-Fingerprint, Ticket 05) — hier nur als Konsequenz notieren.

## Akzeptanzkriterien

- `selectCourseCandidates` laeuft mit und ohne `selector_terms`.
- Ohne `selector_terms` ist der Output identisch zum heutigen Verhalten.
- Mit `selector_terms` matcht der Selector gegen die uebergebenen Terme statt
  nur gegen `expandGoalTokens(contract.goal)`.
- `contract.goal` bleibt im normalisierten Contract der Originaltext.

## Tests / Verifikation

- Regression: bestehende `learn-contract`-Tests bleiben gruen
  (Default-Pfad unveraendert).
- Deutscher Goal `Kardiologie` mit `selector_terms` inkl. `cardiology` bringt
  einen Kurs durch den Selector, dessen `signals.topics` `cardiology`
  enthalten — der ohne Bruecke vor dem Review verschwaende. Dies ist die
  Selector-Haelfte von Spec-Test 2b.

## Uebergabe an Folge-Tickets

- Ticket 03 erzeugt `selector_terms`/`topic_terms` und ruft den Selector mit
  ihnen auf.
- Ticket 05 nimmt `goal_expansion` in `course_discovery.depends_on` und den
  Fingerprint auf.
