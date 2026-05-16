# NotebookLM Content Generation Commands

**Projekt:** AI University  
**Stand:** 2026-05-16  
**CLI:** `notebooklm-py` / `NotebookLM CLI, version 0.3.4`

Diese Datei ist die erste Befehlsuebersicht fuer Content-Erstellung ueber die NotebookLM CLI. Sie kommt vor dem spaeteren Prompt Manager und dient als Grundlage fuer Templates, QA und Asset-Registry.

## Grundprinzip

NotebookLM generiert Inhalte aus einem aktiven oder explizit angegebenen Notebook:

```bash
notebooklm use <notebook-id>
notebooklm generate <format> "Beschreibung oder Prompt" --language de --wait --json
```

Alternativ kann bei fast allen Generate-Befehlen das Notebook direkt angegeben werden:

```bash
notebooklm generate <format> "Beschreibung" --notebook <notebook-id> --language de --wait --json
```

Einzelne Quellen lassen sich mit `--source` einschraenken:

```bash
notebooklm generate video "Erklaere nur diese Lecture." --source <source-id> --language de --wait --json
```

Mehrere Quellen:

```bash
notebooklm generate audio "Deep Dive aus diesen Quellen." --source <source-id-1> --source <source-id-2> --language de --wait --json
```

## Gemeinsame Optionen

| Option | Bedeutung |
|---|---|
| `-n, --notebook <id>` | Notebook ID setzen; sonst wird das aktive Notebook verwendet |
| `-s, --source <id>` | Nur bestimmte Source IDs verwenden; mehrfach nutzbar |
| `--language de` | Ausgabe auf Deutsch erzeugen |
| `--wait` | Auf Fertigstellung warten |
| `--no-wait` | Job starten und sofort zurueckkehren; Default bei vielen Formaten |
| `--retry <n>` | Bei Rate Limits mehrfach mit Backoff versuchen |
| `--json` | Maschinenlesbare Ausgabe fuer Pipeline/Registry |

Empfohlener Pipeline-Default:

```bash
--language de --wait --retry 3 --json
```

## Generate: Audio

Audio Overview / Podcast.

```bash
notebooklm generate audio [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--format` | `deep-dive`, `brief`, `critique`, `debate` |
| `--length` | `short`, `default`, `long` |
| `--language` | z.B. `de` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate audio "Deutschsprachiger Deep Dive fuer motivierte Anfaenger: klare Intuition, Beispiele, wichtigste Takeaways." --format deep-dive --length default --language de --wait --json
```

```bash
notebooklm generate audio "Kurzes Briefing fuer eine Kursvorschau: wichtigste Begriffe, warum es relevant ist, was man danach kann." --format brief --length short --language de --wait --json
```

## Generate: Video

Video Overview / Erklaervideo.

```bash
notebooklm generate video [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--format` | `explainer`, `brief`, `cinematic` |
| `--style` | `auto`, `classic`, `whiteboard`, `kawaii`, `anime`, `watercolor`, `retro-print`, `heritage`, `paper-craft` |
| `--language` | z.B. `de` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Hinweis: `--format cinematic` erzeugt dokumentarisches AI-Video mit Veo 3, ignoriert `--style`, dauert ca. 30-40 Minuten und benoetigt Google AI Ultra.

Beispiele:

```bash
notebooklm generate video "Deutschsprachiges AI-University-Erklaervideo fuer motivierte Anfaenger: klare Intuition, ein durchgehendes Beispiel, Schritt-fuer-Schritt-Erklaerung, am Ende 5 Takeaways und eine Uebungsfrage." --format explainer --style whiteboard --language de --wait --retry 3 --json
```

```bash
notebooklm generate video "Sehr kurzes Kursvorschau-Video: Problem, Kernidee, Nutzen, 3 wichtigste Begriffe, keine Nebendetails." --format brief --style classic --language de --wait --json
```

```bash
notebooklm generate video "Erklaere nur diese Lecture wie ein guter Uni-Tutor: erst Motivation, dann Kernkonzept, dann Beispiel, dann typische Fehler." --source <source-id> --format explainer --style whiteboard --language de --wait --json
```

## Generate: Cinematic Video

Alias fuer `generate video --format cinematic`.

```bash
notebooklm generate cinematic-video [OPTIONS] [DESCRIPTION]
```

Beispiel:

```bash
notebooklm generate cinematic-video "Dokumentarisches Erklaervideo ueber die zentrale Idee dieses Kurses, mit ruhigem professionellem Ton und starken visuellen Metaphern." --language de --wait --retry 3 --json
```

## Generate: Slide Deck

Slide Deck aus Notebook-Quellen.

```bash
notebooklm generate slide-deck [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--format` | `detailed`, `presenter` |
| `--length` | `default`, `short` |
| `--language` | z.B. `de` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate slide-deck "Praesentationsdeck fuer eine deutschsprachige Lerneinheit: klare Storyline, Lernziele, Beispiele, Uebungsfragen, Sprecherhinweise." --format presenter --length default --language de --wait --json
```

```bash
notebooklm generate slide-deck "Kurzes Uebersichtsdeck fuer YouTube-Video-Planung: Hook, 5 Kapitel, Visual-Ideen, Takeaways." --format detailed --length short --language de --wait --json
```

## Generate: Report

Bericht, Study Guide, Blog Post oder Custom Report.

```bash
notebooklm generate report [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--format` | `briefing-doc`, `study-guide`, `blog-post`, `custom` |
| `--append` | Zusatzanweisung fuer nicht-custom Formate |
| `--language` | z.B. `de` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate report --format study-guide --append "Zielgruppe: deutschsprachige Anfaenger. Bitte mit Lernzielen, Glossar, Beispielen und Kontrollfragen." --language de --wait --json
```

```bash
notebooklm generate report "Erstelle ein Produktionsbriefing fuer ein Erklaervideo: Zielgruppe, Hook, Storyline, Kapitel, visuelle Ideen, Fachbegriffe, QA-Risiken." --format custom --language de --wait --json
```

```bash
notebooklm generate report --format blog-post --append "Ton: klar, praxisnah, AI-University-Stil. Kein Marketing-Blabla." --language de --wait --json
```

## Generate: Quiz

Quizfragen aus Notebook-Quellen.

```bash
notebooklm generate quiz [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--quantity` | `fewer`, `standard`, `more` |
| `--difficulty` | `easy`, `medium`, `hard` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate quiz "Teste Kernkonzepte, Verstaendnis und typische Missverstaendnisse. Keine reinen Trivia-Fragen." --quantity standard --difficulty medium --wait --json
```

```bash
notebooklm generate quiz "Einstiegsquiz fuer Anfaenger vor der Lerneinheit." --quantity fewer --difficulty easy --wait --json
```

## Generate: Flashcards

Karteikarten aus Notebook-Quellen.

```bash
notebooklm generate flashcards [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--quantity` | `fewer`, `standard`, `more` |
| `--difficulty` | `easy`, `medium`, `hard` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate flashcards "Wichtige Begriffe, Definitionen und Mini-Beispiele fuer deutschsprachige Lernende." --quantity more --difficulty medium --wait --json
```

```bash
notebooklm generate flashcards "Nur Grundlagenbegriffe, keine fortgeschrittenen Details." --quantity standard --difficulty easy --wait --json
```

## Generate: Infographic

Infografik aus Notebook-Quellen.

```bash
notebooklm generate infographic [OPTIONS] [DESCRIPTION]
```

Optionen:

| Option | Werte |
|---|---|
| `--orientation` | `landscape`, `portrait`, `square` |
| `--detail` | `concise`, `standard`, `detailed` |
| `--style` | `auto`, `sketch-note`, `professional`, `bento-grid`, `editorial`, `instructional`, `bricks`, `clay`, `anime`, `kawaii`, `scientific` |
| `--language` | z.B. `de` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate infographic "Visualisiere die wichtigsten Konzepte dieser Lecture als Lernposter: Begriffe, Beziehungen, Beispiel, Takeaways." --orientation portrait --detail detailed --style instructional --language de --wait --json
```

```bash
notebooklm generate infographic "Quadratische Social-Media-Zusammenfassung mit 5 Kernideen und einem klaren Lernpfad." --orientation square --detail concise --style bento-grid --language de --wait --json
```

## Generate: Data Table

Datentabelle aus Quellen. Beschreibung ist erforderlich.

```bash
notebooklm generate data-table [OPTIONS] DESCRIPTION
```

Optionen:

| Option | Werte |
|---|---|
| `--language` | z.B. `de` |
| `--source` | Source ID, mehrfach nutzbar |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate data-table "Vergleich der wichtigsten Konzepte: Begriff, Definition, Beispiel, typische Fehler, Relevanz fuer AI University." --language de --wait --json
```

```bash
notebooklm generate data-table "Timeline der Lecture: Abschnitt, Thema, benoetigtes Vorwissen, Lernziel, moegliches Video-Kapitel." --source <source-id> --language de --wait --json
```

## Generate: Mind Map

Mind Map aus Notebook-Quellen.

```bash
notebooklm generate mind-map [OPTIONS]
```

Optionen:

| Option | Werte |
|---|---|
| `--notebook` | Notebook ID |
| `--source` | Source ID, mehrfach nutzbar |
| `--json` | Maschinenlesbare Ausgabe |

Beispiele:

```bash
notebooklm generate mind-map --notebook <notebook-id> --json
```

```bash
notebooklm generate mind-map --source <source-id> --json
```

## Generate: Revise Slide

Einzelne Folie eines bereits generierten Slide Decks ueberarbeiten.

```bash
notebooklm generate revise-slide DESCRIPTION --artifact <artifact-id> --slide <index>
```

Optionen:

| Option | Bedeutung |
|---|---|
| `--artifact <id>` | Slide-Deck-Artifact-ID; erforderlich |
| `--slide <index>` | Nullbasierter Folienindex; `0` ist die erste Folie |
| `--notebook <id>` | Notebook ID |
| `--wait`, `--retry`, `--json` | Pipeline-Optionen |

Beispiele:

```bash
notebooklm generate revise-slide "Mache die Folie didaktischer: kuerzerer Titel, ein klares Beispiel, weniger Text." --artifact <artifact-id> --slide 3 --wait --json
```

```bash
notebooklm generate revise-slide "Ersetze Fachjargon durch eine Anfaenger-Erklaerung und fuege eine visuelle Analogie hinzu." --artifact <artifact-id> --slide 5 --wait --json
```

## Download: Generierte Assets

Generierte Inhalte koennen anschliessend heruntergeladen werden:

```bash
notebooklm download <type> [OPTIONS]
```

Verfuegbare Download-Typen:

| Typ | Erwartetes Ergebnis |
|---|---|
| `audio` | Audio-Datei |
| `video` | Video-Datei |
| `cinematic-video` | Cinematic Video-Datei |
| `slide-deck` | PDF oder PPTX |
| `infographic` | Bilddatei |
| `report` | Markdown |
| `mind-map` | JSON |
| `data-table` | CSV |
| `flashcards` | Flashcard Deck |
| `quiz` | Quizfragen |

Im bestehenden Scraper gibt es bereits einen Asset-Indexing-Befehl:

```bash
node src/scrape.js notebooklm assets <course-id> --download --types video,audio,report
```

Weitere Typen koennen spaeter in die Pipeline aufgenommen werden:

```bash
node src/scrape.js notebooklm assets <course-id> --download --types video,audio,report,slide-deck,infographic,quiz,flashcards,data-table,mind-map
```

## Empfohlene AI-University Defaults

### Erklaervideo

```bash
notebooklm generate video "Deutschsprachiges AI-University-Erklaervideo fuer motivierte Anfaenger: klare Intuition, ein durchgehendes Beispiel, Schritt-fuer-Schritt-Erklaerung, am Ende 5 Takeaways und eine Uebungsfrage." --format explainer --style whiteboard --language de --wait --retry 3 --json
```

### Kursvorschau

```bash
notebooklm generate video "Sehr kurzes Kursvorschau-Video: Problem, Kernidee, Nutzen, 3 wichtigste Begriffe, keine Nebendetails." --format brief --style classic --language de --wait --retry 3 --json
```

### Study Guide

```bash
notebooklm generate report --format study-guide --append "Zielgruppe: deutschsprachige Anfaenger. Bitte mit Lernzielen, Glossar, Beispielen, Kontrollfragen und naechstem Lernschritt." --language de --wait --retry 3 --json
```

### Production Briefing

```bash
notebooklm generate report "Erstelle ein Produktionsbriefing fuer ein Erklaervideo: Zielgruppe, Hook, Storyline, Kapitel, visuelle Ideen, Fachbegriffe, QA-Risiken und moegliche Halluzinationsfallen." --format custom --language de --wait --retry 3 --json
```

## Offene Punkte fuer den Prompt Manager

- Prompt Templates versionieren, z.B. `explainer_beginner_de.v1`.
- Pro Generierung speichern: Notebook ID, Course ID, Source IDs, Command, Prompt, Format, Style, Language, Artifact ID, Status.
- QA-Status einfuehren: `generated`, `needs_review`, `approved`, `needs_regen`, `published`.
- Regeneration-Patterns definieren: kuerzer, einfacher, mehr Beispiele, weniger Fachsprache, staerkerer Tutor-Stil.
- Download und Asset-Index mit `library/notebooklm/assets/index.json` verbinden.
