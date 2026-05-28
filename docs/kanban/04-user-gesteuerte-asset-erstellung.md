# 04 User-gesteuerte Asset-Erstellung

Status: Backlog
Build-Order-Punkt: 4
Parallelisierbar: ja, sobald Punkt 3 stabile Unit-Source-Kontexte liefert

## Ziel

User koennen aus einem bestehenden Chat-, Unit- oder Source-Kontext explizit ein
NotebookLM-Asset erzeugen, z.B. Study Guide, Quizfragen, Flashcards, Mindmap
oder Report.

## NotebookLM-Assets

Die erstellbaren Asset-Typen kommen aus der lokalen NotebookLM-CLI
(`notebooklm generate --help` und `notebooklm download --help`):

- `audio`: Audio overview / Podcast.
- `video`: Video overview.
- `cinematic-video`: Cinematic video overview.
- `slide-deck`: Slide Deck.
- `quiz`: Quiz.
- `flashcards`: Flashcards. Die Artifact-List-Filter-Option nutzt dafuer
  `flashcard`.
- `infographic`: Infographic.
- `data-table`: Data Table.
- `mind-map`: Mind Map.
- `report`: Report mit `--format briefing-doc`, `study-guide`, `blog-post` oder
  `custom`.
- `revise-slide`: Revision einer einzelnen Folie in einem bestehenden Slide
  Deck; kein eigenstaendiger Erstgenerierungs-Asset-Typ.

## Scope

- CLI-Einstieg fuer explizite Asset-Erstellung planen und umsetzen, z.B.
  `learn asset --type quiz`.
- CLI-Zugriff auf erzeugte Assets planen und umsetzen:
  - `learn assets list --path-id ...`
  - `learn assets show <asset-id>`
  - `learn assets download <asset-id>`
- Aktuelle `selected_source_ids` aus Chat-State wiederverwenden oder aus
  `--unit` ueber das Unit-Source-Mapping aufloesen.
- Optional den letzten Chat-Turn als Instruktionskontext in den Prompt
  aufnehmen.
- NotebookLM `generate` oder `ask` passend zum Asset-Typ nutzen.
- Asset lokal reproduzierbar speichern mit `asset_id`, `type`, `prompt`,
  `notebook_id`, `selected_source_ids`, optional `conversation_id`,
  `references[]` oder Artifact-Metadata und `created_at`.
- Nach `learn asset ...` `asset_id`, Status, lokalen Pfad und ggf. Download-
  Hinweis ausgeben.

## Lokaler Zugriff

Assets liegen lernpfadbezogen unter:

```text
ocw-pipeline/output/learning-paths/<path-id>/assets/<asset-id>/
```

Pro Asset:

- `asset.json`: Metadaten, Prompt, Notebook-ID, Source IDs, CLI-Command,
  NotebookLM-Rohresultat oder Artifact-Metadata.
- `content.md`: direkt erzeugte Textinhalte aus `notebooklm ask --json`, wenn
  vorhanden.
- Heruntergeladene NotebookLM-Dateien im selben Asset-Ordner, z.B. Markdown,
  JSON, CSV, PDF, PPTX, Bild, Audio oder Video.

Zusatzindex:

```text
ocw-pipeline/output/learning-paths/<path-id>/assets/index.json
ocw-pipeline/output/learning-paths/<path-id>/assets/INDEX.md
```

Der bestehende globale NotebookLM-Asset-Index unter
`ocw-pipeline/output/notebooklm/assets/` bleibt unveraendert. Ticket 04 ergaenzt
einen lernpfadbezogenen Asset-Zugriff fuer V0/V1-Lernkontexte.

## NotebookLM-Strategie

- Direkt lokal nutzbar ohne Download: source-grounded Textassets via
  `notebooklm ask --json`.
- Nur Metadaten ohne Download: `notebooklm artifact list --json` und bei Bedarf
  `notebooklm artifact get <artifact-id>`.
- Fuer lokalen Inhalt per Download materialisieren: `audio`, `video`,
  `cinematic-video`, `slide-deck`, `infographic`, `data-table`, `mind-map`,
  `report`, `quiz` und `flashcards`.
- `learn assets show <asset-id>` zeigt lokale Inhalte, wenn sie vorhanden sind.
  Ohne lokale Datei zeigt der Befehl Metadaten, Status und Download-Hinweis.

## Nicht im Scope

- Automatische Asset-Produktion nach jedem Chat.
- Vollstaendiger Asset-Katalog mit UI.
- Bewertung, Scoring oder automatische Qualitaetsanalyse erzeugter Assets.

## Abhaengigkeiten

- Punkt 3: Unit -> ready NotebookLM Source IDs fuer MIT 6.0001.
- Bestehender V0-Chat-State unter `output/learning-paths/v0-mit-60001/`.
- NotebookLM-Adapter-Regeln aus `docs/V0_TO_V1_LEARNING_PATH_PLAN.md`.

## Blocker

- Keine stabilen Sources fuer den aktuellen Kontext.
- Fehlender oder leerer Unit-Source-Mapping-Eintrag.
- Unklarer Asset-Typ ohne definierte NotebookLM-Strategie.

## Umsetzungshinweise

- Explizite `--source` Flags haben Vorrang vor Unit- oder Chat-State-Kontext.
- Bei fehlenden Sources sichtbar abbrechen statt NotebookLM ohne Source-Filter
  aufzurufen.
- Fuer source-grounded Textassets bevorzugt `notebooklm ask --json` mit
  wiederholtem `-s <source-id>` verwenden.
- Fuer NotebookLM-native Artifacts Generation, Poll/Wait, Artifact-Metadaten und
  Download getrennt modellieren.
- `learn assets download <asset-id>` legt die heruntergeladene Datei im
  Asset-Ordner ab und aktualisiert `asset.json`, `index.json` und `INDEX.md`.
- `conversation_id` nur als Kontextmetadatum speichern; echte Follow-ups folgen
  weiter den V0-Chat-Regeln.

## Akzeptanzkriterien

- User kann aus aktuellem Chat-Kontext ein Asset anfordern.
- User kann aus einer Unit ein Asset anfordern.
- Das Asset nutzt dieselben Sources wie der gewaehlte Lernkontext.
- Das Asset wird lokal mit Metadaten und reproduzierbarem Prompt gespeichert.
- User sieht nach Asset-Erstellung `asset_id`, Status und lokalen Zugriffspfad.
- User kann erzeugte Assets spaeter per CLI auflisten.
- `learn assets show <asset-id>` zeigt lokale Inhalte, wenn vorhanden, sonst
  Metadaten, Artifact-Status und Download-Hinweis.
- NotebookLM-native Artifacts koennen ueber `learn assets download <asset-id>`
  lokal verfuegbar gemacht werden.
- Der lernpfadbezogene Asset-Index bleibt reproduzierbar und maschinenlesbar.
- Bei fehlenden Sources wird die Asset-Erstellung sichtbar abgelehnt.

## Tests / Verifikation

- `learn asset --type report --format study-guide --unit 6` erzeugt ein
  gespeichertes Asset aus den Unit-Sources.
- `learn asset --type quiz --unit 6` erzeugt Asset-Metadaten und gibt
  `asset_id` plus lokalen Pfad aus.
- `learn asset --type quiz --source <id>` nutzt nur die explizite Source-Auswahl.
- `learn assets list` zeigt das erzeugte Asset.
- `learn assets show <asset-id>` zeigt `content.md` bei direkt erzeugten
  Textassets.
- `learn assets show <asset-id>` zeigt Status und Metadaten, wenn noch kein
  Download existiert.
- `learn assets download <asset-id>` legt die heruntergeladene Datei im
  Asset-Ordner ab und aktualisiert Asset-Metadaten sowie Index.
- Ein unbekanntes `--unit` bricht mit klarer Fehlermeldung ab.
- Gespeicherte Asset-Datei enthaelt Source IDs, Notebook ID und Prompt.

## Uebergabe an Folge-Tickets

- Ticket 10 nutzt diesen CLI-/State-Contract fuer user-gesteuerte Assets im
  V1-End-to-End-Flow.
- Ticket 05 kann dieselbe Asset-Erstellung spaeter aus Mindmap-Themen starten.
