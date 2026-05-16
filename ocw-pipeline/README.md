# MIT OCW Pipeline

Phase 1: Discovery der Kurs-IDs via Playwright (JS-gerenderte Seiten)
Phase 2+3: Screening via HTTP + JSON (data.json, content_map.json)

## Architektur

```
discovery/          ← Playwright: Kurssuche + Department Pages scrapen
screening/          ← HTTP: data.json + content_map.json pro Kurs
lib/                ← Shared: Schema, DB, Utilities
```

## Setup

```bash
cd ocw-pipeline
npm init -y
npm install crawlee playwright
npx playwright install chromium
```

## Workflow

1. **Discovery** → Kurs-IDs sammeln (Playwright)
2. **Bulk-Screening** → data.json pro Kurs fetchen + parsen
3. **Detail-Check** → content_map.json für Material-Analyse
4. **Output** → library.db updaten

## Screening-Modi

```bash
# Vollständiger Deep Scan wie bisher: Kursdaten + alle Resource-Details + Materialien
node src/scrape.js screen --all

# Schnelles Vorscreening: Kursdaten + content_map, keine Material-Detail-Requests
node src/scrape.js screen --all --fast

# Empfohlen für große Batches: schnell vorsortieren, nur Tier 1/2 tief materialisieren
node src/scrape.js screen --all --fast --deep-tier 1,2
```

## Kurs-Shortlist

```bash
# Top 5 Review-Kandidaten nach Materialqualität
node src/scrape.js shortlist

# Mehr Kandidaten anzeigen
node src/scrape.js shortlist --limit 10

# Thematisch filtern
node src/scrape.js shortlist --topic "Economics"

# Nach MIT Department Number filtern
node src/scrape.js shortlist --department 18 --min-pdfs 10

# Kurse mit bestimmten Materialien priorisieren
node src/scrape.js shortlist --material psets --sort psets
```

Die Shortlist ist nicht-mutierend: Sie liest nur aus `library.db` und setzt keine Kurse auf
`selected`. Das Ranking nutzt Materialqualität (Videos, PDFs, Notes/Slides,
Problem Sets, Exams und Materialmix). `level` wird nur angezeigt und beeinflusst
den Score nicht.

## Ähnliche Kurse

```bash
# Top 5 Kurse mit ähnlichen Topics, Departments und Titelwörtern
node src/scrape.js similar 6-622-power-electronics-spring-2023

# Mehr ähnliche Kurse anzeigen, inklusive Hold/Tier-3-Kurse
node src/scrape.js similar 6-622-power-electronics-spring-2023 --limit 10 --include-hold
```

Die Ähnlichkeitssuche ist ebenfalls nicht-mutierend. Topics sind das stärkste
Signal, Departments das zweite Signal, gemeinsame Titelwörter das schwächste.

## Lokale Kursordner importieren

```bash
# Lokale Testphase-Kurse aus ../library prüfen, ohne DB-Änderung
node src/scrape.js local import --dry-run

# Lokale PDFs, Markdown-Dateien und Video-Links strukturiert in library.db aufnehmen
node src/scrape.js local import

# Vor dem lokalen Import OCW-Metadaten erneut schnell scrapen
node src/scrape.js local import --rescreen --fast

# Nur einen Kurs importieren
node src/scrape.js local import --course-id 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
```

Der lokale Import ersetzt nur Materialien mit `source_kind='local_library'`.
Online gescrapte OCW-Materialien bleiben erhalten. NotebookLM-Status wie
`uploaded_to_notebooklm` werden beim Re-Screening bewahrt.

## NotebookLM-Anschluss

Der erste Anschluss ist bewusst ein Freigabe- und Manifest-Schritt. Er lädt noch
nicht automatisch hoch, sondern erzeugt eine saubere Upload-Queue für NotebookLM
oder NotebookLM Enterprise.

```bash
# Kandidaten mit genug Material für NotebookLM anzeigen
node src/scrape.js notebooklm ready

# Kurs explizit für NotebookLM freigeben
node src/scrape.js notebooklm approve 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016

# NotebookLM-Manifest und Upload-Queue erzeugen
node src/scrape.js notebooklm export 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --mark-ready

# Upload mit der lokal installierten `notebooklm` CLI testen
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --notebook-id <id> --dry-run

# Online-Notebooks gegen library.db abgleichen
node src/scrape.js notebooklm sync --dry-run

# Treffer in library.db als uploaded_to_notebooklm markieren
node src/scrape.js notebooklm sync --with-metadata

# In ein bestehendes Notebook hochladen
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --notebook-id <id> --wait

# Neues Notebook erstellen und Quellen hochladen
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --create --wait

# Mehr Quellen exportieren, z.B. für NotebookLM Pro/Enterprise
node src/scrape.js notebooklm export 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --max-sources 300
```

Output:

- `library/notebooklm/<course-id>/notebooklm_manifest.json`
- `library/notebooklm/<course-id>/UPLOAD_QUEUE.md`
- `library/notebooklm/<course-id>/notebooklm_upload_log.json` nach `upload`

Das Manifest priorisiert PDFs, danach Videos und Webseiten. Archive und Code
werden nicht exportiert, weil sie für NotebookLM-Quellen meist erst normalisiert
werden müssen.

## Screening-Signale aus data.json

- `learning_resource_types` (Lecture Notes, Videos, Problem Sets...)
- `level` (Undergraduate/Graduate)
- `topics` (AI, CS, ML...)
- `instructors` (Array)
- `course_description`

## Screening-Signale aus content_map.json

- Anzahl Resources pro Typ
- PDF-URLs direkt extrahierbar
- Video-Embeds/Youtube-IDs
- Lecture-zu-Material Mapping
