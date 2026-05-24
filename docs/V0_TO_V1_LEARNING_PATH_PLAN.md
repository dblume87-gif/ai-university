# V0 to V1 Learning Path Plan

## Summary

Der NotebookLM-Spike hat bestaetigt, dass AI University mit NotebookLM als
source-grounded Chat-Backend weitergehen kann. Der naechste Build soll trotzdem
bewusst klein bleiben: erst ein V0-Walking-Skeleton mit einem vorhandenen
Notebook und festen Source IDs, danach schrittweise Ausbau zu V1 mit Contract,
Kursauswahl, Material-Screening, eigenem Notebook pro Lernpfad und Mindmap.

Leitprinzip: Erst einen echten Lernloop beweisen, dann abstrahieren.

## V0: Source-Grounded Chat Walking Skeleton

Ziel: Ein User kann eine Frage zu einem bestehenden Kurs-Notebook stellen und
bekommt eine quellenbasierte Antwort mit Citations.

Status: umgesetzt als Pipeline-CLI mit lokalem JSON-State und interaktivem
Terminal-Chat.

Scope:

- Ein vorhandenes Notebook verwenden, z.B. MIT 6.0001.
- Source IDs manuell oder aus einer kleinen Unit-Source-Zuordnung auswaehlen.
- `notebooklm ask --json -s <source-id...>` ausfuehren.
- Antwort, `references[]`, `source_id`s und optional `conversation_id` speichern.
- Antwort im Einmal-Turn oder im interaktiven Terminal-Chat anzeigen.
- Folgefragen ueber gespeicherte `conversation_id` nahtlos fortfuehren.
- Optional aus denselben Sources ein erstes User-gewuenschtes Asset erzeugen,
  z.B. Study Guide.

Nicht in V0:

- keine automatische Kursauswahl
- kein Hybrid-Screening
- kein eigenes Lernpfad-Notebook
- kein Mindmap-Routing
- keine grosse `src/learning/` Modulstruktur

Minimaler technischer Schnitt:

```json
{
  "path_id": "v0-mit-60001",
  "notebook_id": "e9b29f80-838e-43d3-989d-e3416658b76a",
  "selected_source_ids": [],
  "conversation_id": null,
  "turns": []
}
```

Akzeptanz:

- Eine Frage wird mit expliziten Source IDs beantwortet. Erledigt.
- Citations lassen sich auf NotebookLM `source_id`s mappen. Erledigt.
- Der Chat-Turn ist lokal reproduzierbar gespeichert. Erledigt.
- Folgefragen laufen ohne erneuten CLI-Aufruf in `learn chat --interactive`.
  Erledigt.
- Aus derselben Source-Auswahl kann optional ein User-gewuenschtes Asset
  erzeugt werden.
  Offen.

Aktuelle V0-Kommandos:

```bash
node src/scrape.js learn chat \
  --message "Erklaer mir Rekursion fuer Python-Anfaenger." \
  --source 71e2d3b7-0b6c-4350-8e2e-60a733f243f6 \
  --source 848489ba-074a-436b-a4af-5457b954e64d
```

```bash
node src/scrape.js learn chat --interactive
```

Der interaktive Chat unterstuetzt `/state`, `/reset` und `/exit`.

## V0.5: Units, Source Mapping und kleiner State Store

Ziel: Der Chat bezieht sich nicht mehr nur auf manuell gewaehlte Sources,
sondern auf Lernpfad-Units.

Scope:

- `course_units.json` als Unit-Basis nutzen.
- Unit IDs stabilisieren, z.B. `6-0001:u01`.
- NotebookLM Source IDs aus `source list --json` mit Unit-Materialien matchen.
- Lokalen State Store einfuehren:
  - `learning_paths`
  - `learning_path_units`
  - `learning_path_sources`
  - `learning_chat_turns`
- Resume-Punkte speichern:
  - `planned`
  - `chat_ready`
  - `material_requested`
  - `artifact_ready`
  - `failed`

Akzeptanz:

- User kann "frage zu Unit 2" stellen.
- System loest Unit -> Source IDs auf.
- NotebookLM antwortet nur aus diesen Sources.
- Ein fehlendes oder unsicheres Mapping wird explizit angezeigt.

## V0.6: User-gesteuerte Asset-Erstellung

Ziel: Der User kann aus einem bestehenden Chat-, Unit- oder Source-Kontext
gezielt ein Lern-Asset erzeugen, statt dass Material automatisch im Hintergrund
produziert wird.

Asset-Typen fuer den ersten Ausbau:

- Study Guide
- Uebungen oder Quizfragen
- Zusammenfassung
- Lernplan fuer eine Unit

Scope:

- Asset-Erstellung explizit durch User-Befehl starten, z.B. "mach daraus
  Uebungen" oder `learn asset --type quiz`.
- Aktuelle `selected_source_ids` wiederverwenden oder aus einer Unit aufloesen.
- Optional den letzten Chat-Turn als Instruktionskontext nutzen.
- NotebookLM `generate` oder `ask` je nach passendem Asset-Typ nutzen.
- Asset lokal speichern mit:
  - `asset_id`
  - `type`
  - `prompt`
  - `notebook_id`
  - `selected_source_ids`
  - optional `conversation_id`
  - `references[]` oder erzeugtes Artifact-Metadata
  - `created_at`

Nicht in V0.6:

- keine automatische Asset-Produktion nach jedem Chat
- kein kompletter Asset-Katalog mit UI
- keine Bewertung oder Scoring der erzeugten Assets

Akzeptanz:

- User kann aus dem aktuellen Chat-Kontext ein Asset anfordern.
- Das Asset nutzt dieselben Sources wie der aktuelle Lernkontext.
- Das Asset wird lokal reproduzierbar gespeichert.
- Bei fehlenden Sources wird die Asset-Erstellung sichtbar abgelehnt.

## V0.7: Mindmap als Orientierung

Ziel: Mindmap wird als Themenuebersicht nutzbar, ohne schon perfekte Source-ID
Rueckverlinkung zu versprechen.

Scope:

- Mindmap pro Notebook generieren oder vorhandene Mindmap laden.
- Mindmap JSON als Hierarchie speichern.
- Knoten anzeigen und anklickbar machen.
- Knoten per Heuristik auf Units/Sources matchen:
  - exact/fuzzy title match
  - Source title match
  - Unit title match
  - optional Source guide/fulltext keywords
- Bei Unsicherheit mehrere Kandidaten anzeigen.

Nicht in V0.7:

- kein Embedding-Index als Pflicht
- kein stilles automatisches Routing bei schwachem Match

Akzeptanz:

- User kann ein Mindmap-Thema waehlen.
- System zeigt passende Unit-/Source-Kandidaten.
- Chat kann mit der gewaehlten Kandidatenmenge gestartet werden.

## V1: Contract-Based Learning Path Orchestrator

Ziel: Aus einem User Contract wird ein personalisierter Lernpfad mit eigenem
Notebook, Mindmap, Chat und user-gesteuerter Asset-Erstellung.

Flow:

1. User Contract erfassen:
   - Ziel
   - Niveau
   - Zeitrahmen
   - Zielprodukt
   - Praxis-/Theorie-Fokus
   - Sprache
   - Materialpraeferenzen
2. Top 3-5 Kurskandidaten aus `library.db` auswaehlen.
3. Materialien hybrid screenen:
   - vorhandene DB/Units nutzen
   - fehlende oder stale Kandidaten gezielt neu screenen
4. Lernplan aus realen Units und Quellen erstellen.
5. Eigenes NotebookLM-Notebook fuer den Lernpfad anlegen.
6. Relevante Quellen hochladen und auf `ready` warten.
7. Mindmap erzeugen und speichern.
8. Chat und gezielte Asset-Erstellung fuer Units oder Themen anbieten.

V1-Budgets:

- maximal 3-5 Kurskandidaten pro Contract
- maximal 8-12 Units im ersten Lernplan
- maximal 40-60 Sources pro Lernpfad-Notebook
- keine unkontrollierten parallelen `ask`-Calls
- NotebookLM-Chat mit sichtbarem Loading-State planen

V1-Akzeptanz:

- Lernplan wird erst nach Materialuebersicht finalisiert.
- Jeder Lernpfad hat genau ein eigenes Notebook.
- Pflichtquellen muessen verarbeitet sein, bevor Mindmap erzeugt wird.
- Chat kann auf Unit-, Topic- oder freie Frage-Kontexte routen.
- Asset-Erstellung ist user-gesteuert, nicht automatisch.

## Adapter-Regeln aus dem Spike

- `notebooklm ask --json` ist der Chat-Adapter.
- Source-Routing erfolgt ueber wiederholtes `-s <source-id>`.
- `references[].source_id` ist der wichtigste Citation-Key.
- Inline-Citations werden ueber `references[].citation_number` gemappt.
- Nicht `-c new` nutzen.
- Fuer echte Follow-ups:
  1. erstes `ask` ohne `-c` ausfuehren
  2. zurueckgegebene UUID speichern
  3. Folgefragen mit `-c <uuid>` stellen
- `turn_number` nicht als verlaessliche Sequenz verwenden.
- `is_follow_up` nicht als verlaesslichen Status verwenden.
- Lokales `history --clear` garantiert keinen eindeutigen neuen serverseitigen
  Conversation-State.
- Mindmap-JSON hat keine Source IDs und keine stabilen Node IDs. Persistente
  Mindmap-Referenzen koennen nur als Textpfade modelliert werden und sind fragil.
- Beobachtete `ask`-Latenz lag in kleinen Samples grob bei 25-45 Sekunden.

## Required Follow-up Spike Before Path Notebooks

Vor V1 mit eigenem Notebook pro Lernpfad braucht es noch einen kleinen
Upload/Wait-Spike:

```text
notebooklm create
  -> notebooklm source add
  -> notebooklm source wait --json
  -> notebooklm source list --json
```

Zu klaeren:

- Wie lange dauert Upload + Processing fuer typische PDFs, YouTube-Links und ggf. lokale Dateien?
- Welche JSON-Statuswerte zeigen `processing`, `ready`, `failed`, `unsupported`?
- Reicht `source wait --json` als `sources_ready` Gate?
- Wie sehen Fehler bei grossen oder nicht unterstuetzten Quellen aus?

Dieser Spike ist nicht noetig fuer V0 auf bestehenden Notebooks, aber noetig
bevor V1 automatisch Path-Notebooks erstellt.

## Evaluation Plan

Funktionale Checks:

- Unit -> Source IDs -> `ask` funktioniert.
- Citations sind auf konkrete Sources mapbar.
- Source-Filter bleibt auf gewaehlte Sources begrenzt.
- Asset-Erstellung nutzt dieselbe Source-Auswahl wie der Chat.

Qualitative Golden Scenarios:

- "Ich will AI Apps bauen" priorisiert Python/GenAI/Prompting vor Deep-Learning-Mathe.
- "Ich will Backprop verstehen" priorisiert Neural-Network-/Calculus-nahe Units.
- "Erklaer mir Rekursion einfach" liefert didaktische, quellenbasierte Antwort mit Beispiel.
- "Mach daraus Uebungen" erzeugt Aufgaben aus denselben Sources.

Qualitaetskriterien:

- fachlich korrekt
- quellengebunden
- keine nicht belegten Spruenge
- fuer Zielniveau passend
- klare naechste Lernhandlung

## Recommended Build Order

1. V0 Chat Adapter und lokaler Turn Store. Erledigt.
2. Interaktiver V0 Chat fuer nahtlose Follow-ups. Erledigt.
3. Kleine Unit-Source-Mapping-Schicht fuer MIT 6.0001.
4. User-gesteuerte Asset-Erstellung aus Chat-/Unit-/Source-Kontext.
5. Mindmap anzeigen und heuristisch auf Units/Sources mappen.
6. Upload/Wait-Spike fuer neue Path-Notebooks durchfuehren.
7. Contract Normalizer und Candidate Selector.
8. Hybrid Material Screening Gate.
9. Eigenes Path-Notebook mit Upload/Wait/Resume.
10. V1-End-to-End-Flow.
