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
