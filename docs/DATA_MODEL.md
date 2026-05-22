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

Geplante Tabellen fuer den Learning-Path-Orchestrator werden bewusst getrennt
von den bestehenden Kurs-Tabellen eingefuehrt. Die bestehende Library bleibt
weiterhin Source of Truth fuer Kurse und Materialien; Lernpfade referenzieren
Kurse, Units, NotebookLM-Source-IDs und Artefakte.

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

## NotebookLM Chat-Output

Der Integration-Spike vom 2026-05-22 hat fuer `notebooklm ask --json` diese
relevante Struktur bestaetigt:

```json
{
  "answer": "... [1] ...",
  "conversation_id": "b7b5e1f3-2356-4265-b07a-154d1ab5d61c",
  "turn_number": 1,
  "is_follow_up": true,
  "references": [
    {
      "source_id": "dda154ab-abd4-42f9-ae2e-f404b3c85f1f",
      "citation_number": 1,
      "cited_text": "This is a class in programming.",
      "start_char": 3560,
      "end_char": 3591,
      "chunk_id": "643e45c5-dc83-4080-b872-8f4cc492b1fb"
    }
  ]
}
```

Wichtige Modellannahmen:

- `source_id` ist der primaere Routing-Key fuer quellenbasierten Chat.
- Inline-Citations wie `[1]` werden ueber `citation_number` auf References gemappt.
- `turn_number` war im Spike nicht verlaesslich aussagekraeftig und sollte nicht
  als Sequenz-Source-of-Truth verwendet werden.
- Fuer Follow-ups muss eine echte `conversation_id` gespeichert werden. Nicht
  `-c new` verwenden.

## Geplante Learning-Path-Tabellen

V0/V1 sollte eigene Tabellen oder aequivalente JSON-State-Dateien einfuehren,
bevor lange NotebookLM-Workflows produktiv laufen:

| Tabelle | Zweck |
|---------|-------|
| `learning_contracts` | Normalisierte User-Ziele, Constraints und Praeferenzen |
| `learning_paths` | Lernpfad-Kopf, Status, Notebook-ID, Mindmap-Status und Resume-Punkt |
| `learning_path_units` | Ausgewaehlte Units, Reihenfolge, Lernziel, Schwierigkeit und Aufwand |
| `learning_path_sources` | Mapping von Path/Unit zu NotebookLM `source_id`, Material-ID und Pflicht/Optional |
| `learning_chat_turns` | User-Fragen, NotebookLM-Antworten, Citations, Conversation-ID und Source-Auswahl |
| `learning_artifacts` | Erzeugte Study Guides, Quiz, Flashcards, Mindmaps, Reports, Audio/Video |

Minimaler V0-State:

```json
{
  "path_id": "...",
  "notebook_id": "...",
  "selected_source_ids": [],
  "conversation_id": null,
  "last_step": "chat_ready",
  "artifacts": []
}
```

V1-State:

```json
{
  "contract_id": "...",
  "path_id": "...",
  "status": "planned|screening|ready_for_notebook|uploading|mindmap_ready|active|failed",
  "selected_courses": [],
  "units": [],
  "sources": [],
  "notebook": {
    "notebook_id": "...",
    "status": "planned|creating|uploading|ready|failed"
  },
  "mindmap": {
    "status": "pending|generated|downloaded|failed",
    "local_path": null
  }
}
```
