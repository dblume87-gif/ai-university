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

## NotebookLM Chat-Integration pruefen

Der vollstaendige Spike ist dokumentiert in:

```text
docs/NOTEBOOKLM_INTEGRATION_SPIKE.md
docs/spike-artifacts/
```

Schnelle manuelle Checks:

```bash
notebooklm --version
notebooklm list --json
notebooklm source list -n <notebook-id> --json
notebooklm ask "Was ist das zentrale Thema?" -n <notebook-id> --json
```

Source-gefilterte Frage:

```bash
notebooklm ask "Erklaere Rekursion einfach." \
  -n <notebook-id> \
  -s <source-id-1> \
  -s <source-id-2> \
  --json
```

Tutor-Modus:

```bash
notebooklm configure -n <notebook-id> --mode learning-guide
notebooklm ask "Erklaer mir das fuer Anfaenger und stelle eine Kontrollfrage." -n <notebook-id> --json
notebooklm configure -n <notebook-id> --mode default
```

Mindmap:

```bash
notebooklm generate mind-map -n <notebook-id> --json
notebooklm download mind-map docs/spike-artifacts/mindmap.json -n <notebook-id> --json
```

Wichtige Erkenntnisse:

- `ask --json` liefert `references[]` mit konkreten `source_id`s.
- `-s` verhielt sich im Spike als strikter Source-Filter.
- Nicht `-c new` verwenden. Fuer eine echte Conversation-ID erst ohne `-c`
  fragen, dann die zurueckgegebene UUID fuer Follow-ups nutzen.
- Mindmap-JSON enthaelt keine Source IDs und muss nachtraeglich auf Units/Sources
  gemappt werden.

## V0 Learning Path Walking Skeleton

V0 soll bewusst klein bleiben und noch keine vollstaendige Lernpfad-Automation
bauen.

Empfohlener Ablauf:

1. Bestehendes Notebook mit ready Sources auswaehlen.
2. Kleine Unit- oder Source-Auswahl festlegen.
3. User-Frage mit konkreten Sources an NotebookLM schicken:

```bash
notebooklm ask "<user question>" \
  -n <notebook-id> \
  -s <source-id-1> \
  -s <source-id-2> \
  --json
```

4. Antwort, `references[]`, `source_id`s und optional `conversation_id` speichern.
5. Antwort mit Citations im Chat anzeigen.
6. Optional aus derselben Source-Auswahl Material erzeugen:

```bash
notebooklm generate report \
  "Erstelle einen kurzen Study Guide zu dieser Unit." \
  -n <notebook-id> \
  -s <source-id-1> \
  -s <source-id-2> \
  --format study-guide \
  --language de \
  --wait \
  --json
```

Akzeptanz fuer V0:

- Eine Frage wird mit festen Source IDs beantwortet.
- Citations sind auf NotebookLM Sources mapbar.
- Die Antwort kann als Chat-Turn gespeichert werden.
- Aus denselben Sources kann ein erstes Material erzeugt werden.

Pipeline-CLI fuer Schritt 1:

```bash
cd ocw-pipeline
node src/scrape.js learn chat \
  --message "Erklaer mir Rekursion fuer Python-Anfaenger." \
  --source 71e2d3b7-0b6c-4350-8e2e-60a733f243f6 \
  --source 848489ba-074a-436b-a4af-5457b954e64d
```

Folgefragen verwenden automatisch dieselbe NotebookLM-Conversation und die
gespeicherten Sources:

```bash
node src/scrape.js learn chat \
  --message "Ich rate: Ohne Base Case laeuft die Rekursion endlos?"
```

Interaktiver Chat fuer nahtlose Folgefragen ohne neuen CLI-Aufruf:

```bash
node src/scrape.js learn chat --interactive
```

Wenn noch keine Sources im State gespeichert sind, den ersten interaktiven Start
mit Sources ausfuehren:

```bash
node src/scrape.js learn chat --interactive \
  --source 71e2d3b7-0b6c-4350-8e2e-60a733f243f6 \
  --source 848489ba-074a-436b-a4af-5457b954e64d
```

Session-Kommandos:

- `/state` zeigt State-Pfad, Conversation-ID und aktuelle Sources.
- `/reset` startet beim naechsten Turn eine neue NotebookLM-Conversation und
  behaelt die Sources.
- `/exit` beendet den interaktiven Chat.

Unit -> NotebookLM Source Mapping fuer MIT 6.0001 erzeugen:

```bash
node src/scrape.js learn units map
```

Danach kann der Chat mit einer Unit statt manuellen Source IDs gestartet werden:

```bash
node src/scrape.js learn chat \
  --unit 6 \
  --message "Erklaer mir Rekursion einfach."
```

Auch interaktiv:

```bash
node src/scrape.js learn chat --unit 6 --interactive
```

Explizite `--source` Flags haben Vorrang vor `--unit`.

Default-State:

```text
ocw-pipeline/output/learning-paths/v0-mit-60001/chat_state.json
```

Default Unit-Map:

```text
ocw-pipeline/output/learning-paths/v0-mit-60001/unit_source_map.json
```

Der lokale Store speichert die echte `conversation_id` aus NotebookLM und nutzt
sie beim naechsten Turn automatisch fuer Follow-ups. `conversation_id: "new"`
wird nicht als echte Conversation gespeichert.
