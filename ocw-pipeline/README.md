# MIT OCW Pipeline

Die MIT OCW Pipeline ist die aktive Softwarebasis von AI University. Sie entdeckt Kurse, screent Materiallage und Metadaten, verwaltet den lokalen Kursstatus in SQLite und erzeugt NotebookLM-taugliche Manifeste, Upload-Queues, Upload-Logs und Asset-Indizes.

Der CLI-Einstieg liegt in `src/scrape.js`. Die lokale Datenbank `library.db` ist der Source of Truth fuer Kursstatus, Materialien und NotebookLM-Zuordnung.

## Setup

```bash
cd ocw-pipeline
npm install
npx playwright install chromium
npm run db:init
npm run scrape -- status
```

Optional fuer NotebookLM-Uploads und Sync:

```bash
npm run notebooklm:install
npm run notebooklm:check
```

## Architektur

```text
src/discovery/      Playwright: Kurssuche und Department-Seiten
src/screening/      HTTP/HTML/JSON: data.json, content_map.json, Course Website
src/curation/       Shortlist und Aehnlichkeitssuche
src/local/          Import lokaler Kursordner
src/notebooklm/     Ready Gate, Manifest, Upload, Sync, Asset Index
src/lib/            SQLite, Schema und geteilte Hilfsfunktionen
```

Mehr Kontext: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## NPM Scripts

| Command | Zweck |
|---------|-------|
| `npm run discover` | Discovery ueber `src/scrape.js discover` |
| `npm run discover:test` | Kleine Discovery-Testsuche nach `python` |
| `npm run screen` | Screening-Einstieg |
| `npm run scrape -- <args>` | Generischer CLI-Einstieg |
| `npm run db:init` | Datenbank initialisieren/migrieren |
| `npm run notebooklm:install` | NotebookLM CLI installieren |
| `npm run notebooklm:check` | NotebookLM CLI pruefen |
| `npm run notebooklm:ready` | NotebookLM-Kandidaten anzeigen |
| `npm run notebooklm:export -- <course-id>` | Manifest und Upload-Queue erzeugen |
| `npm run notebooklm:upload -- <course-id> --create` | Notebook erstellen und Quellen hochladen |
| `npm run notebooklm:sync` | Online-Notebooks mit `library.db` abgleichen |
| `npm run notebooklm:assets` | NotebookLM-Artefakte indexieren |

## Basis-Workflow

1. **Discovery:** Kurs-IDs sammeln und als `discovered` in `library.db` speichern.
2. **Screening:** Kursdaten, Content Map und Materiallage auswerten.
3. **Kuratierung:** Gute Kandidaten per Shortlist und Similarity finden.
4. **NotebookLM Gate:** Kandidaten pruefen und explizit freigeben.
5. **Export/Upload/Sync:** Manifeste erzeugen, Quellen hochladen und Online-Notebooks abgleichen.

Status und Datenmodell: [../docs/DATA_MODEL.md](../docs/DATA_MODEL.md)

## Vollkatalog-Discovery in Batches

Die Vollkatalog-Discovery liest die OCW-Sitemap und kann in fortsetzbaren
Batches laufen. Das ist robuster als ein einzelner Lauf ueber alle Kurse.

```bash
# Erste 250 Kurse
node src/scrape.js discover --all --offset 0 --batch-size 250

# Naechste 250 Kurse
node src/scrape.js discover --all --offset 250 --batch-size 250

# Dry Run zum Pruefen
node src/scrape.js discover --all --offset 500 --batch-size 10 --dry-run
```

## Screening-Modi

```bash
# Vollständiger Deep Scan wie bisher: Kursdaten + alle Resource-Details + Materialien
node src/scrape.js screen --all

# Schnelles Vorscreening: Kursdaten + content_map, keine Material-Detail-Requests
node src/scrape.js screen --all --fast

# Empfohlen für große Batches: schnell vorsortieren, nur Tier 1/2 tief materialisieren
node src/scrape.js screen --all --fast --deep-tier 1,2
```

`--fast` vermeidet Material-Detail-Requests und eignet sich fuer groessere Batches. `--deep-tier 1,2` vertieft danach nur starke Kandidaten.

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

Der NotebookLM-Anschluss ist bewusst gated: erst Kandidaten anzeigen, dann freigeben, dann Manifest/Upload-Queue erzeugen, danach optional mit der lokal installierten `notebooklm` CLI hochladen oder Online-Notebooks synchronisieren.

```bash
# Kandidaten mit genug Material für NotebookLM anzeigen
node src/scrape.js notebooklm ready

# Kurs explizit für NotebookLM freigeben
node src/scrape.js notebooklm approve 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016

# NotebookLM-Manifest und Upload-Queue erzeugen
node src/scrape.js notebooklm export 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --mark-ready

# Upload mit der lokal installierten `notebooklm` CLI testen
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --notebook-id <id> --dry-run

# Dry Run für ein neu zu erstellendes Notebook; schreibt nur Manifest + Upload-Log
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --create --dry-run

# Online-Notebooks gegen library.db abgleichen
node src/scrape.js notebooklm sync --dry-run

# Treffer in library.db als uploaded_to_notebooklm markieren
node src/scrape.js notebooklm sync --with-metadata

# In ein bestehendes Notebook hochladen
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --notebook-id <id> --wait

# Neues Notebook erstellen und Quellen hochladen
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --create --wait

# Bei erster fehlerhafter Quelle abbrechen; sonst werden Fehler geloggt und der Rest weiter versucht
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --create --stop-on-error

# Mehr Quellen exportieren, z.B. für NotebookLM Pro/Enterprise
node src/scrape.js notebooklm export 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --max-sources 300
```

Output:

- `output/notebooklm/<course-id>/notebooklm_manifest.json`
- `output/notebooklm/<course-id>/UPLOAD_QUEUE.md`
- `output/notebooklm/<course-id>/notebooklm_upload_log.json` nach `upload`
- `output/notebooklm/assets/index.json` und `output/notebooklm/assets/INDEX.md` nach `notebooklm assets`

Das Manifest exportiert nur direkte Dokumentquellen sowie YouTube-/Video-Links:
PDFs, Markdown/Text, Office-Dokumente, Praesentationen, Tabellen und CSV/TSV.
Normale Webseiten, externe Linklisten, Bilder, Archive und Code werden nicht
exportiert. Quellen koennen aus `source_url` oder, bei lokal importierten Kursen,
aus `local_path` kommen. `upload --dry-run` schreibt keine NotebookLM-Statusänderung
in `library.db`.

## Typische Fehlerquellen

- **NotebookLM CLI fehlt:** `npm run notebooklm:install` ausfuehren und danach `npm run notebooklm:check`.
- **Keine Ready-Kandidaten:** Zuerst Discovery und Deep Screening ausfuehren; `notebooklm ready` benoetigt Materialien mit `source_url`.
- **Upload ohne Notebook-ID:** Entweder `--notebook-id <id>` oder `--create` verwenden.
- **Falsche Output-Pfade:** Generierte NotebookLM-Dateien liegen unter `ocw-pipeline/output/notebooklm/`, nicht unter einem Root-`library/`-Ordner.
- **Lokaler Import ueberschreibt Online-Materialien nicht:** Der Import ersetzt nur Materialien mit `source_kind='local_library'`.

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
