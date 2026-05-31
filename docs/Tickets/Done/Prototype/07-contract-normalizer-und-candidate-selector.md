# 07 Contract Normalizer und Candidate Selector

Status: Done
Build-Order-Punkt: 7
Parallelisierbar: ja, vorbereitbar parallel zu 04-06

## Ziel

Ein User Contract wird in eine stabile lokale Struktur normalisiert. Daraus
waehlt das Backend Top-3-5 Kurskandidaten aus `library.db`, die als Eingang fuer
das Material-Screening dienen.

## Scope

- Contract-Felder aus dem V1-Plan uebernehmen:
  - `goal`
  - `current_level`
  - `time_budget`
  - `target_outcome`
  - `style`
  - `language`
  - `preferred_materials`
- Minimalen Normalizer fuer CLI- oder JSON-Eingaben definieren.
- Candidate Selector auf `library.db` bauen.
- Top-3-5 Kandidaten mit Begruendung ausgeben.
- Signale nutzen: Topics, Course Title, Level, Materialqualitaet,
  NotebookLM-Tauglichkeit aus `library.db`, praktische oder konzeptuelle
  Passung.
- Thematic-Fit-Gate anwenden: Materialqualitaet, Beginner-Fit und
  Praxis-Signale duerfen nur Kurse boosten, die einen positiven Goal-/Topic-Fit
  haben.
- Jedes Contract-Feld muss im JSON-Output sichtbar bleiben und entweder als
  Scoring-Signal, Filter, Prompt-/Language-Metadatum oder dokumentierter Default
  erklaert werden.

## Testbarer Contract

Minimaler Test-Contract:

```json
{
  "goal": "Ich will AI Apps bauen",
  "current_level": "beginner",
  "target_outcome": "prototype",
  "style": "practical",
  "language": "de",
  "preferred_materials": ["lecture videos", "projects"]
}
```

Feldwirkung fuer die deterministische Baseline:

- `goal`: erzeugt Keyword-/Synonym-Signale fuer Topics, Title und Description.
  Ein positiver Goal-/Topic-Fit ist Gate fuer die Top-K-Auswahl; fachfremde
  Kurse werden nicht nur wegen guter Materiallage aufgenommen.
- `current_level`: beeinflusst Level-Passung, z.B. `beginner` bevorzugt
  einsteigerfreundliche Undergraduate-/Intro-Kurse.
- `target_outcome`: beeinflusst Praxis-/Output-Passung, z.B. `prototype`
  bevorzugt Kurse mit Programming Assignments, Projects oder app-nahen Topics.
- `style`: beeinflusst Material- und Kursmix, z.B. `practical` bevorzugt
  Uebungen, Projekte und konkrete Implementierung gegenueber rein theoretischen
  Kursen.
- `language`: wird im normalisierten Contract und Output gespeichert; Kursauswahl
  bleibt solange unveraendert, bis mehrsprachige Kursdaten existieren.
- `preferred_materials`: mappt User-Begriffe auf vorhandene Materialsignale,
  z.B. `lecture videos` -> Lecture Videos/Youtube, `projects` -> Projects oder
  Programming Assignments.

## Nicht im Scope

- Vollstaendige UI fuer Contract-Erfassung.
- LLM-basierte Kursauswahl als Pflicht.
- Agentische oder freie semantische Interpretation des Contract-Texts.
- Finaler Lernplan.
- Re-Screening von Materialien; das gehoert zu Ticket 08.

## Abhaengigkeiten

- Bestehende `library.db` mit Kurs-, Screening- und NotebookLM-Feldern.
- Bestehende Curation-Helfer wie Shortlist/Similar als moegliche Basis.
- Contract-Datenmodell aus `docs/LEARNING_PATH_ORCHESTRATOR_PLAN.md`.

## Blocker

- Keine verwertbaren Kurse in `library.db`.
- Contract ist so unvollstaendig, dass Ziel oder Niveau nicht ableitbar sind.
- Kandidaten liefern keine konkreten Course IDs fuer Ticket 08.

## Umsetzungshinweise

- Ausgabe als JSON speichern, damit Ticket 08 sie direkt lesen kann.
- Score und Begruendung trennen: Score fuer Sortierung, Begruendung fuer Review.
- Maximal 3-5 Kandidaten ausgeben, passend zum V1-Budget.
- Kandidaten ohne positiven `goal`-Match werden aus der Top-K-Liste gefiltert.
  Der Output enthaelt `thematic_fit.gate`, `has_goal_match` und
  `matched_tokens`.
- Candidate Selection nutzt nur `library.db` als Auswahl- und Rankingbasis.
  Lokale `output/notebooklm/<course-id>/course_units.json`-Artefakte duerfen den
  Selector nicht boosten; sie gehoeren ins Material-Screening und Planning-Gate.
- Fehlende Praeferenzen mit konservativen Defaults dokumentieren.
- Selector ist deterministisch und regel-/signalbasiert; LLM/Agent kann spaeter
  als Re-Ranker ergaenzt werden, ist aber nicht Teil dieses Tickets.
- Scoring-Begruendung muss pro Kandidat zeigen, welche Contract-Felder positiv,
  neutral oder negativ beigetragen haben.
- Erkenntnis aus V1-Domain-Test: Der deterministische Selector matcht aktuell
  nur explizite Token/Synonyme. Fuer den Agenten-MVP braucht es eine vorgelagerte
  Goal Expansion, besonders fuer deutsche oder fachsprachliche Ziele. Beispiel:
  `Kardiologie` sollte vor der Candidate Selection auf Signale wie
  `cardiology`, `cardiovascular`, `heart`, `medicine`, `physiology` und
  `anatomy` erweitert werden.
- No-Candidates ist fuer diesen Selector ein valider Gate-Stop, fuer den
  Agenten-MVP aber ein Recovery-Branch mit Erklaerung, alternativen Suchzielen
  und optionalem Re-Run.

## Akzeptanzkriterien

- Ein Contract kann lokal normalisiert und gespeichert werden.
- Der normalisierte Contract enthaelt `goal`, `current_level`, `target_outcome`,
  `style`, `language` und `preferred_materials`.
- Der Selector gibt 3-5 konkrete Course IDs oder eine klare No-Candidates-Meldung
  aus.
- Jeder Kandidat enthaelt Score, zentrale Signale und Begruendung.
- Jeder Kandidat enthaelt nachvollziehbare Field-Contributions fuer relevante
  Contract-Felder.
- Jeder Kandidat in der Top-K-Liste hat `thematic_fit.gate: "passed"`.
- Ausgabe ist stabil genug, um Ticket 08 ohne manuelle Interpretation zu starten.

## Tests / Verifikation

- Golden Scenario "Ich will AI Apps bauen" priorisiert Python/GenAI/Prompting vor
  Deep-Learning-Mathe.
- Golden Scenario "Ich will AI Apps bauen" nimmt fachfremde Kurse wie
  Microeconomics trotz guter Materialien nicht in die Top 5 auf.
- Derselbe Goal-Text mit `current_level: beginner` bevorzugt Intro- oder
  Undergraduate-Kurse gegenueber fortgeschrittenen Spezialkursen.
- `target_outcome: prototype` und `style: practical` erhoehen Kurse mit Projects,
  Programming Assignments oder Problem Sets.
- `preferred_materials: ["lecture videos", "projects"]` erhoeht Kurse mit
  Lecture Videos/Youtube und Project-/Programming-Assignment-Materialien.
- `language: de` bleibt im Output erhalten und wird als Antwort-/Asset-Sprache
  fuer Folge-Tickets weitergereicht, ohne Kursdaten still zu uebersetzen.
- Golden Scenario "Ich will Backprop verstehen" priorisiert Neural-Network- und
  Calculus-nahe Kurse.
- Leerer oder zu vager Contract bricht mit klarer Validierungsmeldung ab.
- Limit bleibt bei maximal 5 Kandidaten.
- Domain-Test `Kardiologie` dokumentiert den erwarteten No-Candidates-Fall und
  dient als Regression fuer spaetere Goal-Expansion.

## Uebergabe an Folge-Tickets

- Ticket 08 liest Candidate Course IDs und Begruendungen als Screening-Eingang.
- Ticket 08b liest den normalisierten Contract als Planning-Eingang.
- Ticket 10 nutzt denselben Contract- und Candidate-Output im End-to-End-Flow.
- Agenten-MVP liest No-Candidates als interpretierbares Signal, nicht als
  finales Produktergebnis.
