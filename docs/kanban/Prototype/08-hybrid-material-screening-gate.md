# 08 Hybrid Material Screening Gate

Status: Done
Build-Order-Punkt: 8
Parallelisierbar: nein, harte Abhaengigkeit von 07

## Ziel

Fuer die ausgewaehlten Kandidaten entsteht eine belastbare Materialuebersicht,
bevor ein Lernplan finalisiert oder ein Path-Notebook erstellt wird.

## Scope

- Candidate Course IDs aus Ticket 07 lesen.
- Vorhandene `library.db`-, `materials`- und `course_units.json`-Daten nutzen.
- Fehlende, stale oder unvollstaendige Kandidaten gezielt neu screenen.
- Bei Bedarf Course Units neu exportieren.
- Pro Kandidat eine Materialuebersicht erstellen.
- Usable Sources, Gaps und Recommendation Basis speichern.

## Nicht im Scope

- Contract-Erfassung oder Kursauswahl.
- Path-Notebook-Erstellung.
- Upload zu NotebookLM.
- Finaler V1-End-to-End-Flow.

## Abhaengigkeiten

- Ticket 07 liefert konkrete Candidate Course IDs.
- Bestehende Screening-Pipeline und Unit-Export.
- `library.db` bleibt zentrale lokale Statusquelle.

## Blocker

- Candidate Selector liefert keine Course IDs.
- Kandidaten haben weder verwertbare DB-Daten noch screenbare OCW-Daten.
- Re-Screening scheitert bei allen Kandidaten.

## Umsetzungshinweise

- Hybrid bedeutet: Cache bevorzugen, gezielt live/deep nachscreenen, wenn Daten
  fehlen oder stale sind.
- Materialuebersicht muss fuer Lernplaner und Notebook-Upload lesbar sein.
- Budget beachten: maximal 3-5 Kurskandidaten, keine unkontrollierten parallelen
  `ask`-Calls.
- Gaps explizit ausgeben statt mit Annahmen zu verdecken.
- Erkenntnis aus V1-Domain-Test: Thematisch grob passende Kandidaten reichen
  nicht. Der englische Kardiologie-Test fand Kandidaten, stoppte aber bei
  `failed:materials`, weil keine usable Sources fuer einen Lernpfad verfuegbar
  waren. Material-Screening muss deshalb Candidate-Fit und Source-Fit klar
  trennen.
- Fuer den Agenten-MVP sollten Gaps in userfaehige Kategorien uebersetzt werden,
  z.B. `good_candidate_but_no_sources`, `good_candidate_with_gaps`,
  `usable_candidate`, `needs_rescreening` oder `needs_external_source_strategy`.

## Akzeptanzkriterien

- Fuer jeden Kandidaten liegt eine Materialuebersicht oder ein klarer
  Ausschlussgrund vor.
- Usable Sources sind von Gaps getrennt.
- Fehlende oder stale Kandidaten werden gezielt nachgescreent.
- Lernplan-Finalisierung ist erst nach dieser Uebersicht moeglich.

## Tests / Verifikation

- Kandidat mit vorhandenen Units nutzt Cache ohne unnoetiges Re-Screening.
- Kandidat ohne Units fuehrt gezielten Unit-Export oder klare Gap-Meldung aus.
- Kandidat mit unbrauchbaren Materialien wird nicht still weitergereicht.
- Screening Output enthaelt `candidate_courses`, `course_material_overviews`,
  `usable_sources`, `gaps` und `recommendation_basis`.
- No-Usable-Sources-Faelle bleiben reproduzierbar und liefern genug Kontext fuer
  eine Agenten-Entscheidung oder User-Review.

## Uebergabe an Folge-Tickets

- Ticket 08b nutzt Materialuebersicht, Usable Sources und Gaps fuer die
  Learning-Path-Planung.
- Ticket 09 nutzt spaeter die vom Learning Path Planner ausgewaehlten Sources
  fuer Path-Notebook-Upload.
- Ticket 10 nutzt Materialuebersicht als Gate vor Lernplan-Finalisierung.
- Agenten-MVP nutzt Gaps als Recovery-Signal fuer Re-Screening, breitere Suche
  oder transparente User-Kommunikation.
