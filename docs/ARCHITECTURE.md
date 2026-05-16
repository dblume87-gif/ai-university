# Architektur

AI University ist aktuell als lokales, kurszentriertes Ingestion-System gebaut. Die aktive Software liegt in `ocw-pipeline/` und verarbeitet OCW-Kurse von Discovery bis NotebookLM-Vorbereitung.

## Systemueberblick

```text
MIT OCW Website
  -> Discovery
  -> Screening
  -> SQLite Library
  -> Curation
  -> NotebookLM Manifest / Upload / Sync
  -> spaetere Video- und Publishing-Pipeline
```

`ocw-pipeline/library.db` ist der lokale Source of Truth. Generierte NotebookLM-Artefakte liegen unter `ocw-pipeline/output/notebooklm/`.

## Komponenten

| Komponente | Pfad | Aufgabe |
|------------|------|---------|
| CLI | `ocw-pipeline/src/scrape.js` | Haupt-Einstieg fuer alle Pipeline-Kommandos |
| Discovery | `ocw-pipeline/src/discovery/` | Kurse per Suche oder Department-Seiten finden |
| Screening | `ocw-pipeline/src/screening/` | Kursdaten, Content Map und Materiallage bewerten |
| Curation | `ocw-pipeline/src/curation/` | Shortlists und aehnliche Kurse aus `library.db` lesen |
| Local Import | `ocw-pipeline/src/local/` | Vorhandene lokale Kursordner in die DB importieren |
| NotebookLM | `ocw-pipeline/src/notebooklm/` | Ready-Liste, Freigabe, Export, Upload, Sync und Asset Index |
| Shared Lib | `ocw-pipeline/src/lib/` | SQLite-Zugriff, Schema, Statuswerte |

## Datenfluss

1. `discover` schreibt gefundene Kurs-IDs und Quellen in `courses` und `discovery_log`.
2. `screen` aktualisiert Kursmetadaten, Tier, Score, Warnungen und Materialien.
3. `shortlist` und `similar` lesen aus `library.db` und veraendern keine Daten.
4. `local import` ergaenzt lokale Materialien mit `source_kind='local_library'`.
5. `notebooklm ready` liest geeignete Kandidaten aus DB und Materialien.
6. `notebooklm approve` setzt den Kursstatus auf `approved_for_notebooklm`.
7. `notebooklm export` erzeugt Manifest und Upload-Queue unter `output/notebooklm/<course-id>/`.
8. `notebooklm upload` nutzt die externe `notebooklm` CLI und schreibt ein Upload-Log.
9. `notebooklm sync` gleicht Online-Notebooks mit lokalen Kursen ab.

## Wichtige Grenzen

- Lernpfade sind ein spaeterer Kuratierungs-Layer und aktuell keine Voraussetzung fuer Ingestion.
- NotebookLM-Uploads sind bewusst nicht vollautomatisch: ein Kurs braucht explizite Freigabe oder einen bewussten Upload-Befehl.
- Supabase, Discord-Interface, YouTube-Upload und On-Demand-Generierung sind geplant oder optional, aber nicht Teil der aktiven Pipeline-Software.
