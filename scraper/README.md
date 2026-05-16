# MIT OCW Scraper

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
cd scraper
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
