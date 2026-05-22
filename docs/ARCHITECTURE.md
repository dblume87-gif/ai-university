# Architektur

AI University ist aktuell als lokales, kurszentriertes Ingestion-System gebaut. Die aktive Software liegt in `ocw-pipeline/` und verarbeitet OCW-Kurse von Discovery bis NotebookLM-Vorbereitung. Der naechste Architektur-Layer ist ein kleiner Learning-Path-Orchestrator, der vorhandene NotebookLM-Notebooks fuer quellenbasierten Chat, Mindmaps und spaetere Materialproduktion nutzt.

## Systemueberblick

```text
MIT OCW Website
  -> Discovery
  -> Screening
  -> SQLite Library
  -> Curation
  -> NotebookLM Manifest / Upload / Sync
  -> Learning Path V0: Source-grounded Chat auf bestehendem Notebook
  -> Learning Path V1: Contract -> Kursauswahl -> Material-Screening -> eigenes Path-Notebook -> Mindmap
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
| Learning Path (geplant) | `ocw-pipeline/src/learning/` | V0/V1-Orchestrierung fuer Contract, Quellenwahl, Chat, Mindmap und Materialproduktion |
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
10. V0-Learning nutzt ein bestehendes Notebook, konkrete Source IDs und `notebooklm ask --json -s <source-id...>` fuer quellenbasierten Tutor-Chat.
11. V1-Learning erzeugt aus einem User Contract erst Kurskandidaten und eine Materialuebersicht, danach einen Lernplan, ein eigenes Notebook, eine Mindmap und optionale Materialien.

## NotebookLM Chat- und Mindmap-Faehigkeiten

Der Integration-Spike vom 2026-05-22 hat bestaetigt:

- `notebooklm ask --json` liefert `references[]` mit konkreten `source_id`s.
- Inline-Citations sind ueber `citation_number` auf diese References mapbar.
- Wiederholtes `-s <source-id>` verhielt sich im Test als strikter Source-Filter.
- `configure --mode learning-guide` reicht fuer einen V0-Tutor-Modus.
- `generate mind-map` und `download mind-map` liefern eine nutzbare Themenhierarchie.
- Mindmap-Knoten enthalten keine Source IDs; Mapping auf Units/Sources braucht Heuristiken.
- Chat-Latenz lag in der Probe bei grob 25-37 Sekunden und braucht UX-seitig Loading-State.

## Learning Path Zielarchitektur

V0 ist bewusst klein:

```text
Existing Notebook + selected source_ids
  -> notebooklm ask --json -s ...
  -> Antwort + Citations anzeigen/speichern
  -> optional: Unit-Material oder Topic-Deep-Dive erzeugen
```

V1 erweitert diesen Loop:

```text
Learner Contract
  -> relevante Kurse auswaehlen
  -> Materialien hybrid screenen
  -> Lernplan aus realen Units/Sources erstellen
  -> eigenes NotebookLM-Notebook pro Lernpfad
  -> Quellen hochladen und warten
  -> Mindmap erzeugen
  -> Chat + Materialproduktion pro Unit oder Topic
```

## Wichtige Grenzen

- Lernpfade sind jetzt der naechste Layer, aber V0 startet ohne vollstaendige Kursauswahl- und Screening-Automation.
- NotebookLM-Uploads sind bewusst nicht vollautomatisch: ein Kurs braucht explizite Freigabe oder einen bewussten Upload-Befehl.
- Mindmap-zu-Source-Routing ist nicht direkt durch NotebookLM geloest, weil Mindmap-JSON keine Source IDs enthaelt.
- Supabase, Discord-Interface, YouTube-Upload und On-Demand-Generierung sind geplant oder optional, aber nicht Teil der aktiven Pipeline-Software.
