# 11 V1 Insights fuer Agenten-MVP

Status: Insight / Input fuer naechste Build-Phase
Datum: 2026-05-29

## Kontext

Nach Umsetzung des deterministischen V1-Harness wurde ein kompletter Workflow
mit dem Thema `Kardiologie` und Level `beginner` getestet.

Testlauf:

```bash
node src/scrape.js learn v1 run \
  --goal "Ich will Kardiologie lernen" \
  --current-level beginner \
  --target-outcome "Grundlagen verstehen und klinische Konzepte einordnen" \
  --style practical \
  --language de \
  --preferred-materials "lecture videos,readings,problem sets" \
  --out output/learning-paths/test-v1-cardiology-beginner-20260529 \
  --force
```

Ergebnis:

- `contract`: completed
- `candidates`: failed
- Run-Status: `failed:candidates`
- Gate: `candidates_present` failed
- Diagnose: `No course candidates found.`

Ein zweiter Test mit englischerem Goal
`cardiovascular physiology anatomy for beginners` fand zwar Kandidaten, stoppte
aber bei `failed:materials`, weil keine usable Sources fuer den Lernpfad
gefunden wurden.

## Zentrale Erkenntnisse

Der deterministische Harness funktioniert als Integrations- und Diagnosewerkzeug.
Er bricht nicht irgendwo spaet im Flow, sondern an klaren Gates mit
reproduzierbaren Artefakten ab.

Das Kardiologie-Beispiel zeigt aber, dass der erste Agenten-MVP nicht nur
Schritte orchestrieren darf. Er muss vor allem mit Domain-Mismatch, Sprache,
Coverage und fehlenden Quellen umgehen.

Ein spaeterer Accounting-Test zeigte eine zweite Qualitaetskante: Nach
automatischem Deep Rescreen und Unit-Export lief der V1-Flow zwar komplett
durch, aber ein Kurs zu regional economic growth kam wegen des Wortes
`Accounting` im Titel in den Plan, obwohl seine Topics eher `Economics` und
`Urban Studies` sind. Das ist kein Source-Coverage-Problem mehr, sondern ein
Topic-Fit-/Ambiguitaetsproblem im Selector.

Der gleiche Accounting-Test zeigte ausserdem ein Unit-Titel-Problem: Einige
Units wurden aus sprechenden Lecture-Note-Titeln gebildet, andere nur aus
PDF-Dateinamen wie `lec1.pdf` oder `lec2.pdf`. Das entsteht, weil der
Unit-Exporter aktuell Materialtitel und Resource-Pfade gruppiert, aber noch
keine didaktisch lesbaren Unit-Titel normalisiert.

## Agenten-MVP Anforderungen

### 1. Goal Expansion vor Candidate Selection

Der Agent muss User-Ziele vor der deterministischen Candidate Selection
normalisieren und erweitern.

Beispiel:

- User sagt: `Kardiologie`
- Erweiterte Suchsignale:
  - `cardiology`
  - `cardiovascular`
  - `heart`
  - `medicine`
  - `health`
  - `physiology`
  - `anatomy`
  - `biomedicine`

Diese Expansion muss sichtbar im Run-Artefakt gespeichert werden, damit spaeter
nachvollziehbar bleibt, warum bestimmte Kurse vorgeschlagen oder ausgeschlossen
wurden.

### 2. No-Candidate ist kein harter Produktabbruch

`failed:candidates` ist fuer den Harness korrekt, fuer den Agenten-MVP aber ein
Interaktionspunkt.

Der Agent sollte bei No-Candidates:

- den Mismatch erklaeren, z.B. "Ich finde keine expliziten Kardiologie-Kurse im
  lokalen OCW-Korpus."
- alternative Suchrichtungen anbieten:
  - `cardiovascular physiology`
  - `anatomy and physiology`
  - `biomedical engineering`
  - `health and medicine`
  - `clinical data / medical AI`
- den User entscheiden lassen, ob der Lernpfad breiter oder technischer werden
  soll.
- optional den Contract neu schreiben und den Harness erneut starten.

### 3. Candidate-Fit und Source-Fit getrennt behandeln

Der englische Zweittest zeigt: Kandidaten koennen thematisch grob passen, aber
trotzdem fuer V1 nicht nutzbar sein, wenn Units oder usable Sources fehlen.

Der Agent darf deshalb nicht nur "passende Kurse" suchen, sondern muss nach dem
Material-Screening entscheiden:

- `good_candidate_but_no_sources`
- `good_candidate_with_gaps`
- `usable_candidate`
- `needs_rescreening`
- `needs_external_source_strategy`

Diese Statuswerte sollten in der Agenten-Schicht oder einem Folge-Ticket als
Review-Entscheidung sichtbar werden.

### 4. Gap Reports muessen userfaehig werden

Die aktuelle Diagnose ist technisch korrekt, aber fuer User noch zu knapp.

Der MVP-Agent sollte aus Gates und Gaps eine kurze, handlungsorientierte
Antwort bauen:

- was gesucht wurde
- was gefunden wurde
- warum der Flow gestoppt hat
- welche naechsten Optionen sinnvoll sind

Beispiel:

```text
Ich habe keinen belastbaren Kardiologie-Pfad gefunden. Der lokale OCW-Korpus
enthaelt Health/Medicine-nahe Kurse, aber keine direkt nutzbare Kombination aus
Kardiologie-Kandidaten, Units und NotebookLM-faehigen Quellen. Ich kann den Pfad
breiter als "cardiovascular physiology" oder technischer als "biomedical
engineering" neu starten.
```

### 5. Medizinische Themen brauchen vorsichtige Produktgrenzen

Kardiologie ist ein medizinisches Thema. Der MVP sollte keine Diagnose- oder
Therapieberatung versprechen. Lernpfade duerfen auf Bildung, Grundlagen,
Physiologie, Biomedizin und Kursmaterialien fokussieren.

Empfehlung fuer Agenten-Antworten:

- "Lern- und Grundlagenpfad" statt "medizinische Beratung"
- keine individuellen Gesundheitsratschlaege
- Quellenbezug sichtbar halten
- bei klinischen Fragen Disclaimer oder Scope-Hinweis ausgeben

### 6. Deterministischer Harness bleibt die Toolchain

Der Agenten-MVP sollte den V1-Harness nicht ersetzen, sondern steuern:

1. User-Ziel klaeren
2. Goal Expansion erzeugen
3. `learn v1 run` ausfuehren
4. Gates aus `run.json` interpretieren
5. bei Fehlschlag gezielt replanen oder User fragen
6. bei Erfolg Mindmap, Chat und Assets als Folgeaktionen anbieten

### 7. Topic-Fit muss Titel-Matches validieren

Der Accounting-Test nach Rescreen/Unit-Export hat gezeigt: Ein einzelnes
Titelwort darf nicht reichen, wenn die Course Topics eine andere Domaene
anzeigen.

Beispiel:

- User-Ziel: `Accounting`
- Problematischer Kandidat:
  `11-481j-analyzing-and-accounting-for-regional-economic-growth-spring-2009`
- Titel enthaelt `Accounting`
- Topics zeigen aber vor allem `Economics`, `Urban Studies` und
  `Regional Planning`

Der Agenten-MVP bzw. der naechste Selector-Fix sollte deshalb:

- Titel-Matches gegen Topics validieren.
- direkte Topic-Treffer wie `Business > Accounting` staerker gewichten.
- mehrdeutige Titelworte als schwache Signale behandeln.
- Kandidaten mit Topic-Mismatch als Review- oder Low-Confidence-Fall markieren.
- den finalen Lernplan nicht aus Kandidaten bauen, deren Match nur auf einem
  mehrdeutigen Titelwort basiert.

### 8. Unit-Titel muessen didaktisch lesbar sein

Nach Deep Rescreen und Unit-Export koennen Units technisch korrekt, aber fuer
User schlecht benannt sein.

Beispiel:

- `15-511 Financial Accounting` liefert Quellen wie `lec1.pdf`, `lec2.pdf`,
  `pset1.pdf`.
- Der Unit-Exporter gruppiert daraus korrekt Unit 1, Unit 2, usw.
- Der Planner uebernimmt aber Titel wie `lec1.pdf` direkt in den Lernpfad.

Das erzeugt formal gueltige, aber wenig vertrauenswuerdige Lernpfade. Der
Agenten-MVP bzw. ein Planner-/Unit-Export-Fix sollte deshalb:

- technische Dateinamen wie `lec1.pdf` als schwache Titel erkennen.
- aus Kursname, Unit-Nummer, Parent Title und Materialtyp sprechende Fallbacks
  bauen, z.B. `Lecture 1: Financial Accounting`.
- bessere Titel aus vorhandenen OCW-Metadaten bevorzugen, falls vorhanden.
- Units mit nur technischen Titeln als Review-Hinweis markieren.
- im Lernpfad keine rohen Dateinamen als primaere Unit-Ueberschrift anzeigen,
  wenn ein lesbarer Fallback moeglich ist.

## Konkrete Folgearbeiten

- Domain-Synonym-Map fuer `Health and Medicine`, `AI Apps`, `Backprop` und
  weitere Testdomaenen einfuehren.
- `run.json` um `goal_expansion` oder `agent_notes` erweiterbar machen.
- No-Candidate- und No-Usable-Sources-Faelle als Agenten-Branches definieren.
- Material-Screening-Gaps in userlesbare Review-Hinweise uebersetzen.
- Optionales Re-Screening oder "broaden search" Kommando fuer Agenten einplanen.
- Medizinische Themen als Bildungs-Scope markieren.
- Topic-Fit-Gate ergaenzen: Titel-Match muss durch Course Topics oder mehrere
  unabhaengige Signale bestaetigt werden.
- Unit-Titel-Normalizer ergaenzen: PDF-/Dateinamen in lesbare Lernabschnitt-
  Titel umwandeln oder als Review-Bedarf markieren.

## Referenzartefakte

- `ocw-pipeline/output/learning-paths/test-v1-cardiology-beginner-20260529/run.json`
- `ocw-pipeline/output/learning-paths/test-v1-cardiology-english-beginner-20260529/run.json`
- `ocw-pipeline/output/learning-paths/test-v1-accounting-advanced-rescreen-units-20260529/run.json`
