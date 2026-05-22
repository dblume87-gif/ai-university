# Learning Path Orchestrator Plan

## Summary

Der Learning Path Orchestrator erweitert AI University von einer kurszentrierten
Ingestion-Pipeline zu einem personalisierten Lernsystem.

Dieses Dokument beschreibt das Zielbild. Der unmittelbare Implementierungspfad
steht in [V0_TO_V1_LEARNING_PATH_PLAN.md](V0_TO_V1_LEARNING_PATH_PLAN.md). V0
ist bewusst kleiner: source-grounded Chat auf einem bestehenden Notebook mit
expliziten Source IDs, bevor Contract, Kursauswahl, eigenes Path-Notebook und
Mindmap-Routing voll automatisiert werden.

Der User gibt zuerst einen Learning Contract ab. Danach waehlt das Backend
relevante Kurse aus, screent deren Materialien, erstellt auf dieser Faktenbasis
einen Lernplan, legt fuer den Lernpfad ein eigenes NotebookLM-Notebook an und
erzeugt nach erfolgreichem Upload eine Mindmap. Die Mindmap dient als
Themenuebersicht und Navigation fuer Chat, Deep Dives und optionale
Materialproduktion.

Chatten mit den Quellen ist der primaere Lernmodus. Materialien werden erst
erzeugt, wenn der User sie explizit anfordert.

Der NotebookLM-Integration-Spike
[NOTEBOOKLM_INTEGRATION_SPIKE.md](NOTEBOOKLM_INTEGRATION_SPIKE.md) hat
bestaetigt, dass `notebooklm ask --json` konkrete `source_id`s in
`references[]` liefert und `-s <source-id>` im Test als strikter Source-Filter
funktionierte. Caveats: Mindmap-JSON enthaelt keine Source IDs, Chat-Latenz lag
bei grob 25-37 Sekunden, und Follow-ups muessen mit echter `conversation_id`
statt `-c new` arbeiten.

## Core Flow

1. **Learning Contract erfassen**
   - User beschreibt Lernziel, Niveau, Zielprodukt, Zeitrahmen, Stil, Sprache
     und Materialpraeferenzen.
   - Der Agent normalisiert diese Angaben zu einem strukturierten Contract.

2. **Relevante Kurse auswaehlen**
   - Das Backend waehlt initial Top 3-5 Kurskandidaten.
   - Signale:
     - Topics
     - Course Title
     - Level
     - Materialqualitaet
     - NotebookLM-Tauglichkeit
     - vorhandene `course_units.json`
     - praktische, konzeptuelle oder akademische Passung zum Contract

3. **Materialien screenen**
   - Hybrid-Strategie:
     - vorhandene `library.db`-, `materials`- und `course_units.json`-Daten
       nutzen
     - fehlende, stale oder unvollstaendige Kandidaten gezielt neu screenen
     - bei Bedarf Course Units neu exportieren
   - Ergebnis ist eine Materialuebersicht pro Kandidatenkurs.

4. **Lernplan erstellen**
   - Der Lernplan wird erst nach der Materialuebersicht finalisiert.
   - Er basiert auf konkreten Kurs-Units und real verfuegbaren Quellen.
   - Jede Unit enthaelt:
     - Lernziel
     - relevante Quellen
     - empfohlene Reihenfolge
     - Schwierigkeit
     - geschaetzter Aufwand
     - Skip- und Deep-Dive-Hinweise
     - Materialluecken oder Annahmen

5. **Eigenes Notebook pro Lernpfad**
   - Jeder finalisierte Lernpfad bekommt ein eigenes NotebookLM-Notebook.
   - Notebook-Titel folgt einem stabilen Muster, z.B.
     `AIU Path: <short goal> - <session_id>`.
   - Nur relevante Materialien der ausgewaehlten Units werden hochgeladen.
   - Statuswerte:
     - `creating_notebook`
     - `uploading_sources`
     - `sources_ready`
     - `mindmap_ready`
     - `failed`

6. **Mindmap erzeugen**
   - Nach Upload und Verarbeitung aller Pflichtquellen wird automatisch eine
     Mindmap erzeugt.
   - Beispielkommando:

```bash
notebooklm generate mind-map --notebook <notebook-id> --json
```

   - Die Mindmap wird lokal gespeichert und dem User als Themenuebersicht
     angeboten.
   - Mindmap-Knoten werden auf Units und Source IDs gemappt.

7. **Chatten mit Quellen**
   - User kann im Chat direkt zu Inhalten, Units oder Mindmap-Themen fragen.
   - Der Agent waehlt eine passende Kombination von Quellen aus:
     - aktive Unit
     - Mindmap-Knoten
     - related Units
     - semantisch passende Quellen aus dem Lernpfad
   - NotebookLM wird ueber einen Adapter gefragt.
   - Die Antwort ist quellenbasiert und kann optionale naechste Aktionen
     vorschlagen.

8. **Optionale Materialproduktion**
   - Aus Chat, Unit oder Mindmap-Thema kann der User Materialien anfordern.
   - Beispiele:
     - Study Guide
     - Quiz
     - Flashcards
     - Uebungen
     - Deep-Dive-Erklaerung
     - Audio, Video oder Slides
   - Materialien werden nicht ungefragt erzeugt.

## Material Modes

### Unit Materials

Unit-Materialien folgen dem geplanten Curriculum.

Beispiele:

- "Erstelle mir fuer Unit 2 einen Study Guide."
- "Mach fuer die Grundlagen-Units Quizfragen."
- "Gib mir Uebungen zu Unit 4."

Eigenschaften:

- nutzt Quellen, die den gewaehlten Units zugeordnet sind
- optional mit Kontext aus vorherigen Units
- stabil und reproduzierbar entlang des Lernplans
- geeignet fuer Study Guides, Aufgaben, Zusammenfassungen und Checks

### Topic Deep Dives

Topic Deep Dives starten bei einer konkreten User-Frage oder einem
Mindmap-Thema.

Beispiele:

- "Erklaer mir Backpropagation tiefer."
- "Ich will mehr zu Prompt Evaluation."
- "Was bedeutet Attention in diesem Lernpfad?"

Eigenschaften:

- nutzt Mindmap-Knoten, relevante Units und passende Source IDs
- darf mehrere Units quer verbinden
- ist frage- und kontextbezogen
- veraendert den urspruenglichen Lernplan nicht automatisch
- kann spaeter als Zusatznotiz an den Pfad gehaengt werden

## Data Contracts

### Learner Contract

```json
{
  "contract_id": "...",
  "goal": "...",
  "current_level": "...",
  "target_outcome": "...",
  "time_budget": "...",
  "style": "practical|conceptual|academic",
  "language": "de",
  "preferred_materials": [],
  "constraints": []
}
```

### Material Screening Output

```json
{
  "contract_id": "...",
  "candidate_courses": [],
  "screening_mode": "hybrid_cached_live",
  "course_material_overviews": [],
  "usable_sources": [],
  "gaps": [],
  "recommendation_basis": []
}
```

### Learning Path State

```json
{
  "path_id": "...",
  "contract_id": "...",
  "selected_courses": [],
  "units": [],
  "sources": [],
  "notebook": {
    "title": "...",
    "notebook_id": null,
    "status": "planned|creating|uploading|ready|failed"
  },
  "mindmap": {
    "status": "pending|generated|downloaded|failed",
    "artifact_id": null,
    "local_path": null,
    "nodes": []
  },
  "material_bundle_options": []
}
```

### Chat Contract

```json
{
  "path_id": "...",
  "notebook_id": "...",
  "message": "...",
  "context": {
    "active_unit_id": "...",
    "mindmap_node_id": "...",
    "recent_chat_turns": []
  },
  "source_policy": "auto_relevant_sources",
  "response_style": "tutor",
  "language": "de"
}
```

### Chat Resolution Output

```json
{
  "chat_id": "...",
  "selected_source_ids": [],
  "related_unit_ids": [],
  "related_mindmap_node_ids": [],
  "notebooklm_query": "...",
  "answer": "...",
  "suggested_next_actions": [
    "produce_unit_material",
    "produce_topic_deep_dive",
    "ask_followup"
  ]
}
```

### Unit Material Contract

```json
{
  "mode": "unit_material",
  "path_id": "...",
  "notebook_id": "...",
  "unit_ids": ["unit-01", "unit-02"],
  "bundle": "schnellstart|ueben|tiefgang",
  "complexity": "easy|standard|deep",
  "outputs": ["study_guide", "quiz", "exercises"],
  "source_policy": "unit_assigned_sources_only",
  "progress_context": {
    "include_previous_units": true,
    "include_next_unit_preview": false
  },
  "language": "de"
}
```

### Topic Deep Dive Contract

```json
{
  "mode": "topic_deep_dive",
  "path_id": "...",
  "notebook_id": "...",
  "topic": "...",
  "mindmap_node_id": "...",
  "related_unit_ids": [],
  "bundle": "schnellstart|ueben|tiefgang",
  "complexity": "easy|standard|deep",
  "outputs": ["deep_explanation", "examples", "practice_questions"],
  "source_policy": "topic_relevant_sources",
  "depth_goal": "clarify|expand|master",
  "language": "de"
}
```

## Technical Building Blocks

### New Learning Layer

Neuer Bereich unter `ocw-pipeline/src/learning/`.

Bausteine:

- Contract Normalizer
- Course Candidate Selector
- Material Screening Gate
- Learning Path Planner
- Path Notebook Manager
- Mindmap Indexer
- Source Resolver
- Chat Orchestrator
- Production Router

### Source Resolver

Der Source Resolver bestimmt fuer Chat und Materialproduktion konkrete
NotebookLM Source IDs.

Geplante Funktionen:

- `resolveSourcesForUnit(unitIds)`
- `resolveSourcesForTopic(topicOrMindmapNodeId)`
- `resolveSourcesForChat(message, context)`

Output:

- `source_ids`
- `related_unit_ids`
- `related_mindmap_node_ids`
- Begruendung fuer die Auswahl

### NotebookLM Adapter

Die vorhandene `runNotebookLmJson(args)`-Abstraktion bleibt der technische
Einstiegspunkt fuer NotebookLM-Kommandos.

Fuer Chat/Ask wird eine eigene Adapter-Funktion vorgesehen:

```js
askNotebookLm({ notebookId, sourceIds, question })
```

Der genaue NotebookLM-Chat-Befehl wird bewusst in dieser Funktion gekapselt,
weil die lokale Doku aktuell vor allem `generate`- und `mind-map`-Kommandos
dokumentiert. Wenn die echte Schnittstelle `ask`, `chat`, Browser-Automation
oder eine andere API ist, muss spaeter nur der Adapter angepasst werden.

## CLI/API Commands

```bash
node src/scrape.js learn contract
node src/scrape.js learn candidates <contract-id>
node src/scrape.js learn screen-materials <contract-id> --top 5 --hybrid
node src/scrape.js learn plan <contract-id>
node src/scrape.js learn notebook <path-id> --create --wait
node src/scrape.js learn mindmap <path-id> --wait
node src/scrape.js learn topics <path-id>
node src/scrape.js learn chat <path-id> --message "Erklaer mir Backpropagation einfacher"
node src/scrape.js learn produce-unit <path-id> --unit unit-02 --bundle ueben --complexity standard
node src/scrape.js learn deep-dive <path-id> --topic "Backpropagation" --bundle tiefgang --complexity deep
```

Alle Commands sollen JSON ausgeben koennen, damit CLI und spaetere Web-App
denselben Contract verwenden.

## Test Plan

- Contract erzeugt passende Top 3-5 Kurskandidaten.
- Material-Screening nutzt Cache und screent stale oder fehlende Daten gezielt neu.
- Lernplan wird erst nach Materialuebersicht finalisiert.
- Lernplan enthaelt nur Units mit real verfuegbaren oder klar markierten Quellen.
- Notebook wird pro Lernpfad erstellt und Pflichtquellen werden hochgeladen.
- Mindmap wird erst nach `sources_ready` erzeugt.
- Mindmap-Knoten mappen auf Units und Source IDs.
- Chat zu aktiver Unit nutzt Unit-Sources.
- Chat zu Mindmap-Thema nutzt Mindmap-Knoten, related Units und relevante Sources.
- Freie Chat-Frage ohne exakten Treffer liefert beste Quellen plus Annahmen.
- Chat-Antwort kann in Unit-Material oder Topic-Deep-Dive ueberfuehrt werden.
- Unit-Material nutzt standardmaessig nur Quellen der ausgewaehlten Unit.
- Topic-Deep-Dive darf quer ueber mehrere Units gehen.

## Assumptions And Defaults

- V1 nutzt `hybrid_cached_live` Screening.
- Pro Contract werden initial Top 3-5 Kurskandidaten tief geprueft.
- Lernplan wird nie vor der Materialuebersicht finalisiert.
- Jeder finalisierte Lernpfad bekommt genau ein eigenes NotebookLM-Notebook.
- Mindmap-Erzeugung ist automatisch nach Upload-Completion.
- Chat ist der primaere Lernmodus.
- Materialproduktion ist optional und user-gesteuert.
- Unit-Materialien folgen dem geplanten Curriculum.
- Topic-Deep-Dives sind freie Vertiefungen innerhalb des Lernpfads.
- NotebookLM-Multimedia wird nur nach expliziter User-Auswahl erzeugt.
