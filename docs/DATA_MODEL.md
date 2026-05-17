# Datenmodell

`ocw-pipeline/library.db` ist die zentrale SQLite-Datenbank fuer die aktive Pipeline. Sie wird beim Zugriff ueber `src/lib/db.js` initialisiert und bei Bedarf um fehlende Spalten erweitert.

## Tabellen

| Tabelle | Zweck |
|---------|-------|
| `courses` | Kursmetadaten, Screening-Ergebnis, Pipeline-Status und NotebookLM-Zuordnung |
| `lectures` | Optionale Lecture-Struktur mit Video- und Slides-URLs |
| `materials` | Quellen, lokale Dateien und Materialklassifikation pro Kurs |
| `warnings` | Warnungen pro Kurs oder Lecture |
| `discovery_log` | Nachvollziehbarkeit, wann und wo ein Kurs gefunden wurde |

## `courses`

Wichtige Felder:

| Feld | Bedeutung |
|------|-----------|
| `course_id` | Stabiler lokaler Kurs-Identifier, meist OCW-Slug |
| `title`, `source_url` | Titel und Kursquelle |
| `departments`, `topics`, `instructors`, `learning_resource_types` | JSON-serialisierte OCW-Metadaten |
| `status` | Pipeline-Status |
| `tier`, `tier_score`, `screening_reason`, `warnings` | Screening-Ergebnis |
| `notebooklm_status` | NotebookLM-spezifischer Status |
| `notebooklm_manifest_path` | Relativer Pfad zum letzten Manifest |
| `notebooklm_notebook_id` | Online-Notebook-ID, falls synchronisiert oder hochgeladen |
| `notebooklm_source_count` | Anzahl hochgeladener oder exportierter Quellen |
| `discovered_at`, `screened_at`, `selected_at`, `approved_at` | Zeitpunkte wichtiger Pipeline-Schritte |

## Statuswerte

Aktive Statuswerte aus `src/lib/schema.js`:

| Status | Bedeutung |
|--------|-----------|
| `discovered` | Kurs wurde gefunden, aber noch nicht voll bewertet |
| `screened` | Kurs wurde gescreent und bewertet |
| `selected` | Kurs wurde als Kandidat ausgewaehlt |
| `ready_for_notebooklm` | Kurs hat ein NotebookLM-taugliches Manifest ohne Blocker |
| `approved_for_notebooklm` | Kurs wurde explizit fuer NotebookLM freigegeben |
| `uploaded_to_notebooklm` | Kurs wurde einem Online-Notebook zugeordnet oder hochgeladen |
| `notebooklm_validated` | Post-Upload-Validierung ist abgeschlossen |
| `needs_fix` | Blockierende Probleme muessen behoben werden |
| `hold` | Kurs bleibt bewusst zurueckgestellt |
| `rejected` | Kurs wird fuer die Pipeline verworfen |

## `materials`

Jedes Material gehoert zu einem Kurs und optional zu einer Lecture. Wichtige Felder:

| Feld | Bedeutung |
|------|-----------|
| `material_type` / `type` | Fachliche Kategorie, z.B. Lecture Notes oder Problem Sets |
| `media_type` | Technischer Typ, z.B. `pdf`, `youtube`, `video`, `markdown`, `html`, `archive`, `code` |
| `source_kind` | Herkunft, z.B. OCW-Scrape oder `local_library` |
| `source_url` | URL fuer NotebookLM-faehige Quellen |
| `local_path` | Lokaler Pfad, falls Datei im Workspace liegt |
| `extraction_status` | Zustand der Quelle, z.B. `linked` oder `downloaded` |
| `metadata_json` | JSON-serialisierte Zusatzdaten |

NotebookLM exportiert nur direkte Dokumentquellen sowie YouTube-/Video-Links.
Dokumentquellen koennen ueber `source_url` oder `local_path` kommen und muessen
eine Dokument-Endung wie `.pdf`, `.md`, `.txt`, `.docx`, `.pptx`, `.xlsx`,
`.csv` oder `.tsv` haben. Normale Webseiten, externe Linklisten, Bilder,
Archive und Code werden nicht exportiert.

## NotebookLM-Artefakte

Default-Output:

```text
ocw-pipeline/output/notebooklm/<course-id>/notebooklm_manifest.json
ocw-pipeline/output/notebooklm/<course-id>/UPLOAD_QUEUE.md
ocw-pipeline/output/notebooklm/<course-id>/notebooklm_upload_log.json
ocw-pipeline/output/notebooklm/assets/index.json
ocw-pipeline/output/notebooklm/assets/INDEX.md
```

Die DB speichert relative Manifest-Pfade aus Sicht des Workspace-Roots.
