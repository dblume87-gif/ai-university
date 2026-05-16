# Runbooks

Diese Runbooks beschreiben wiederholbare Arbeitsablaeufe fuer die aktuelle OCW-Pipeline. Alle Befehle werden aus `ocw-pipeline/` ausgefuehrt.

## Setup pruefen

```bash
cd ocw-pipeline
npm install
npx playwright install chromium
npm run db:init
npm run scrape -- status
```

Erwartung: `status` zeigt Zaehler fuer die bekannten Pipeline-Status und einen Total-Wert.

## Kleine Discovery testen

```bash
cd ocw-pipeline
npm run discover:test
```

Dieser Befehl sucht nach `python`, begrenzt auf wenige Ergebnisse und laeuft als Dry Run.

## Kurse entdecken

```bash
cd ocw-pipeline
node src/scrape.js discover --query "machine learning" --max 20 --headless
node src/scrape.js discover --depts --max 50 --headless
```

Danach pruefen:

```bash
node src/scrape.js status
```

## Screening ausfuehren

Schnelles Vorscreening:

```bash
cd ocw-pipeline
node src/scrape.js screen --all --fast
```

Empfohlen fuer groessere Batches:

```bash
node src/scrape.js screen --all --fast --deep-tier 1,2
```

Einzelnen Kurs screenen:

```bash
node src/scrape.js screen 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
```

## Kandidaten kuratieren

```bash
cd ocw-pipeline
node src/scrape.js shortlist --limit 10
node src/scrape.js shortlist --topic "Artificial Intelligence" --min-pdfs 5
node src/scrape.js similar 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --limit 10
```

Diese Befehle sind nicht-mutierend und lesen nur aus `library.db`.

## Lokale Kursordner importieren

Dry Run:

```bash
cd ocw-pipeline
node src/scrape.js local import --dry-run
```

Import:

```bash
node src/scrape.js local import
```

Nur einen Kurs importieren:

```bash
node src/scrape.js local import --course-id 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
```

Mit erneutem Screening:

```bash
node src/scrape.js local import --rescreen --fast
```

Hinweis: Der Import ersetzt nur Materialien mit `source_kind='local_library'`.

## NotebookLM-Kandidaten vorbereiten

Ready-Kandidaten anzeigen:

```bash
cd ocw-pipeline
node src/scrape.js notebooklm ready --limit 10
```

Kurs freigeben:

```bash
node src/scrape.js notebooklm approve 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
```

Manifest und Upload-Queue erzeugen:

```bash
node src/scrape.js notebooklm export 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --mark-ready
```

Output liegt unter:

```text
ocw-pipeline/output/notebooklm/<course-id>/
```

## NotebookLM Upload testen

NotebookLM CLI pruefen:

```bash
cd ocw-pipeline
npm run notebooklm:check
```

Dry Run gegen bestehendes Notebook:

```bash
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --notebook-id <id> --dry-run
```

Upload in bestehendes Notebook:

```bash
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --notebook-id <id> --wait
```

Neues Notebook erstellen:

```bash
node src/scrape.js notebooklm upload 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016 --create --wait
```

## NotebookLM Sync

Dry Run:

```bash
cd ocw-pipeline
node src/scrape.js notebooklm sync --dry-run --with-metadata
```

DB aktualisieren:

```bash
node src/scrape.js notebooklm sync --with-metadata
```

Der Sync matched Online-Notebooks gegen lokale Kurse und schreibt Notebook-ID sowie Source-Count zurueck in `library.db`.

## NotebookLM Assets indexieren

Nur indexieren:

```bash
cd ocw-pipeline
node src/scrape.js notebooklm assets
```

Artefakte herunterladen:

```bash
node src/scrape.js notebooklm assets --download --types video,audio,report
```

Output:

```text
ocw-pipeline/output/notebooklm/assets/index.json
ocw-pipeline/output/notebooklm/assets/INDEX.md
```
