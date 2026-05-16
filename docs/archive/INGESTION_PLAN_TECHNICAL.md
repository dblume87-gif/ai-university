# AI University Ingestion Plan — Technische Details

> Archivhinweis: Dieses Dokument stammt aus der Planungsphase. Die aktuelle Softwaredokumentation steht in `../ARCHITECTURE.md`, `../DATA_MODEL.md`, `../RUNBOOKS.md` und `../DECISIONS.md`.

Detaildokument zu Schemas, Scoring, Design-Entscheidungen und Implementierungsregeln.
Uebersicht und Pipeline: [INGESTION_PLAN.md](INGESTION_PLAN.md)

## 1. Screening — Details

### Aktiver Scope: kurszentriertes Screening

Der erste Build bewertet Kurse unabhaengig von einem aktiven Lernpfad. Entscheidend ist, ob ein Kurs technisch und didaktisch gut genug ist, um in die Library aufgenommen, materialseitig normalisiert und spaeter in NotebookLM geladen zu werden.

Lernpfad-Manifest, Slot-Matching und `course_candidates.json` werden bewusst aus der aktiven Entwicklung herausgenommen. Sie bleiben als spaeterer Kuratierungs-Layer moeglich, blockieren aber nicht den ersten Ingestion-Build.

### Erfasste Screening-Signale

- Kurscode, Titel, Semester/Jahr, Level
- Instructor(s), Department(s)
- Topics
- Learning Resource Types
- Course Description
- Material-Menue: Lecture Notes, Lecture Videos, Readings, Assignments, Projects, Exams
- Download Course vorhanden ja/nein
- Interne OCW-Ressourcen vs. externe Quellen
- Erste Schaetzung: Anzahl Lecture Notes, Videos, PDFs, Sessions

### Screening-Output

- Kandidat mit Status `screened`
- Vorlaeufiger Tier-Score
- Begruendung und Warnungen
- Empfehlung: `selected`, `hold` oder `rejected`
- Schaetzung, ob der Kurs spaeter `ready_for_notebooklm` werden kann

### Screening Feasibility Checks

- Kurs-Metadaten sind auf der Website erkennbar
- Materialseiten sind vorhanden oder klar verlinkt
- PDF-Quellen wirken leicht auffindbar und extrahierbar
- Videoquellen wirken leicht auffindbar oder fehlende Videos sind frueh erkennbar
- Lecture-/Session-Struktur wirkt ableitbar
- Externe Quellen sind klar benannt
- Kurs kann begruendet einem vorlaeufigen Tier zugeordnet werden

### Screening-Scoring

Materialqualitaet und Automatisierbarkeit haben Vorrang. Gute Themen oder bekannte Kursnamen reichen nicht fuer `selected`, wenn Struktur oder Quellenlage schwach sind.

Scoring-Reihenfolge:

1. **Minimum Gate:** ableitbare Unterrichtseinheiten und voraussichtlich mindestens 2 Quellen pro Einheit.
2. **Materialqualitaet:** leicht extrahierbare PDFs, erkennbare Videos oder Lecture Notes, klare Materialseiten, interne OCW-Ressourcen.
3. **Einheitenstruktur:** Lectures, Sessions, Chapters oder Module sind klar ableitbar.
4. **Automatisierbarkeit:** Quellen sind strukturiert, stabil und ohne Sonderparser erfassbar.
5. **NotebookLM-Tauglichkeit:** Materialmenge und Quellenmix sind fuer NotebookLM sinnvoll nutzbar.

Hybrid-Pruefung:

- Zuerst wird der Kurs auf Kurslevel bewertet.
- Bei knappen oder riskanten Kandidaten wird stichprobenartig auf Unterrichtseinheiten geprueft.
- Kandidaten ohne Minimum Gate werden nicht `selected`.

## 2. Kursauswahl — Details

### Auswahlregel

- Ein Kurs kann `selected` werden, wenn Materiallage, Einheitenstruktur und Automatisierbarkeit stark genug sind.
- Ein Kurs mit guter Materiallage, aber deutlichen Mapping- oder Quellenrisiken landet auf `hold`.
- Ein Kurs ohne ableitbare Unterrichtseinheiten oder ohne ausreichende Quellen wird `rejected` oder bleibt auf `needs_fix`.

### Auswahlkriterien

- Relevanz fuer AI University
- Materialvollstaendigkeit
- Klare Lecture-/Session-Struktur
- NotebookLM-Tauglichkeit
- Aktualitaet oder didaktischer Klassiker
- Geringe Redundanz zu bereits aufgenommenen Kursen
- Erwarteter Pipeline-Wert

### Relevanz fuer AI University

Relevanz meint im ersten Build nicht die Position in einem aktiven Lernpfad. Ein Kurs ist relevant, wenn er als eigenstaendige Library-Einheit nutzbar ist und spaeter in NotebookLM, Erklaervideos, Website oder Lernpfade ueberfuehrt werden kann.

Relevanz-Kriterien:

- **Eigenstaendiger Lernwert:** Der Kurs vermittelt verwertbare Inhalte als Kurs oder Modul.
- **Anschlussfaehigkeit:** Der Kurs laesst sich spaeter sinnvoll mit vorhandenen oder geplanten Kursen kombinieren.
- **Erklaervideo-Potenzial:** Die Einheiten lassen sich in eigenstaendige, verstaendliche Erklaervideos oder Lernmodule uebersetzen.
- **User-Nutzen:** Der Kurs beantwortet einen erwartbaren Lernbedarf der Zielgruppe.
- **Kuratierungswert:** Der Kurs hilft, aus vielen OCW-Angeboten einen sinnvollen, gefuehrten Lernweg zu bauen.
- **Produktionswert:** Der Kurs ist nicht nur akademisch interessant, sondern kann praktisch in NotebookLM, YouTube und die Website-Pipeline ueberfuehrt werden.

Nicht als Relevanz-Kriterium zaehlen:

- Das Thema ist KI/ML/DL.
- Der Kurs klingt modern oder trendig.
- Der Kurs hat viele Materialien, aber keinen klaren Platz im Lernangebot.
- Der Kurs ist von MIT und deshalb automatisch wichtig.

## 3. Materialzusammenstellung — Details

Materialtypen:

- Lecture Slides / Lecture Notes PDFs
- Lecture Videos oder Video-URLs
- Readings / Papers
- Assignments / Problem Sets
- Exams / Solutions
- Projects
- Transcripts, wenn vorhanden
- OCW `data.json`, `content_map.json` oder Course ZIP, wenn verfuegbar

Output:

- Kursordner in `library/`
- Lokale Dateien und/oder normalisierte Quellen
- Rohdateien wie `FILELIST.md`, `LECTURE_VIDEOS.md`, `README.md`, `RESOURCE.md`

## 4. Manifest und Post-Ingestion QA — Details

### course_manifest.json Schema

```json
{
  "course_id": "MIT-6.0001",
  "title": "Introduction to Computer Science and Programming in Python",
  "source_url": "https://ocw.mit.edu/...",
  "term": "Fall 2016",
  "level": ["Undergraduate"],
  "topics": ["Artificial Intelligence"],
  "status": "normalized",
  "tier": 1,
  "lectures": [
    {
      "number": 1,
      "title": "What is computation?",
      "materials": [
        {
          "type": "slides",
          "source_url": "https://ocw.mit.edu/...",
          "local_path": null,
          "extraction_status": "extractable"
        }
      ],
      "source_video_url": "https://www.youtube.com/watch?v=...",
      "warnings": []
    }
  ],
  "warnings": []
}
```

### Zentrale Interfaces

- `library.db`: zentrale SQLite-Datenbank mit Status aller gescreenten Kurse, Pipeline-Status und `approved_at`.
- optionales `course_manifest.json`: normalisierte Kursdetails im Kursordner nach der Materialzusammenstellung.
- `learning_path_manifest.json`: spaeterer Kuratierungs-Layer, nicht Teil des ersten Builds.
- `course_candidates.json`: optionaler spaeterer Review-Output fuer lernpfadgebundenes Screening.

### Spaeter: course_candidates.json Schema

```json
{
  "slot_id": "python-foundations",
  "recommended_course": "MIT-6.0001",
  "top_3_alternates": ["MIT-6.00SC"],
  "candidates": [
    {
      "course_id": "MIT-6.0001",
      "status": "selected",
      "tier": 1,
      "score": 87,
      "warnings": [],
      "reason": "Clear sequence, strong PDFs, videos, and good slot fit."
    }
  ]
}
```

Dieses Schema ist nicht Teil des ersten Ingestion-Builds. Es wird erst relevant, wenn lernpfadgebundenes Screening wieder aufgenommen wird.

### Post-Ingestion QA Checks

- Kurs-Metadaten vollstaendig genug
- Lecture-/Session-Reihenfolge plausibel
- Lokale PDFs existieren oder nicht-lokale Quellen sind bewusst als externe Referenz markiert
- Video-URLs normalisiert
- Fehlende Videos/Slides bewusst markiert
- Duplikate erkannt
- Sehr grosse Dateien markiert
- Externe Quellen markiert
- Materialmenge fuer NotebookLM plausibel

Output: Status `ready_for_review` oder `needs_fix`

## Tier-Regeln — Details

### Tier 1

Sehr guter Kandidat fuer fruehe Pipeline.

- Klare Lecture-Struktur
- Lecture Notes oder Slides als PDFs
- Mindestens 2 Quellen pro Unterrichtseinheit
- Ueberwiegend OCW-interne Ressourcen
- Gute Automatisierbarkeit

### Tier 2

Wertvoll, aber vor Upload mit Normalisierung oder manueller Pruefung.

- Materialien vorhanden, aber uneinheitlich
- Externe Quellen oder Sonderstruktur
- Videos oder Slides teilweise fehlend
- Lecture-Mapping nicht 1:1

### Tier 3

Spezialmodul oder spaeterer Zusatz.

- Non-Credit, Case Study, Ethics/Fairness, Workshop oder Modulstruktur
- Wenig klassische Lecture-Struktur
- Gut fuer Zusatzmaterial, aber nicht als erste Video-Pipeline

### Hold / Reject

- Zu wenig Material
- Kaum automatisierbar
- Stark externe oder kaputte Quellen
- Keine sinnvolle Einheitenteilung

## Designentscheidungen

### Aktiver Entwicklungsfokus

- Der erste Build ist kurszentriert.
- Kurse werden nach Materialqualitaet, Extrahierbarkeit, Einheitenstruktur, Automatisierbarkeit und NotebookLM-Tauglichkeit bewertet.
- Lernpfade, Slot-Matching und Kandidatenranking werden spaeter als Kuratierungs-Layer wieder aufgenommen.

### Datenspeicherung

Die Library soll perspektivisch eine grosse OCW-Kursmenge verwalten. Eine einzelne JSON-Datei fuer den zentralen Status waere bei dieser Groessenordnung unhandlich: Jedes Update wuerde die gesamte Datei laden und zurueckschreiben, Git-Diffs waeren nicht lesbar, und Queries ueber Status, Tier, Warnungen oder Freigaben waeren nur als In-Memory-Filter moeglich.

Daher gilt:

- **JSON** fuer normalisierte Kursdetails und spaetere kleine Konfigurations-/Review-Dateien.
- **SQLite** (`library.db`) fuer den zentralen Library-Status aller Kurse.

SQLite bleibt eine lokale Datei ohne Server und ist in Python nativ verfuegbar. Queries wie `SELECT * FROM courses WHERE tier = 1 AND status = 'screened'` ersetzen JSON-Filterlogik.

Spaetere Lernpfad-Dateien wie `learning_path_manifest.json` und `course_candidates.json` sind kein Status-Source-of-Truth. Pipeline-Status, Freigaben und Queries liegen in `library.db`.

### SQLite-Schema (`library.db`)

```sql
CREATE TABLE courses (
    course_id            TEXT PRIMARY KEY,
    title                TEXT NOT NULL,
    source_url           TEXT,
    term                 TEXT,
    level                TEXT,          -- z.B. "Undergraduate", JSON-Array als Text
    topics               TEXT,          -- JSON-Array als Text
    status               TEXT NOT NULL, -- Statusmodell (s.u.)
    tier                 INTEGER,       -- 1, 2 oder 3
    approved_at          TEXT           -- ISO-8601-Timestamp
);

CREATE TABLE lectures (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id        TEXT NOT NULL REFERENCES courses(course_id),
    number           INTEGER,
    title            TEXT,
    source_video_url TEXT
);

CREATE TABLE materials (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id         TEXT NOT NULL REFERENCES courses(course_id),
    lecture_id        INTEGER REFERENCES lectures(id), -- NULL = kursweites Material
    type              TEXT,   -- "slides", "notes", "video", "reading", ...
    source_url        TEXT,
    local_path        TEXT,
    extraction_status TEXT    -- "extractable", "external", "missing", ...
);

CREATE TABLE warnings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  TEXT NOT NULL REFERENCES courses(course_id),
    lecture_id INTEGER REFERENCES lectures(id), -- NULL = Kurs-Level-Warnung
    severity   TEXT NOT NULL, -- "info", "warning", "blocking"
    message    TEXT NOT NULL
);
```

### Manifest-Dateien

- `library.db` ist die primaere Uebersicht aller gescreenten Kurse mit Pipeline-Status.
- Pro Kurs kann spaeter zusaetzlich ein `course_manifest.json` im Kursordner entstehen, aber `library.db` ist die Quelle fuer Status-Queries und Freigaben.
- `learning_path_manifest.json` und `course_candidates.json` sind spaetere optionale Dateien fuer lernpfadgebundene Kuratierung; dauerhafte Statusinformationen liegen in `library.db`.

### Mindestanforderungen fuer `ready_for_notebooklm`

Ein Kurs ist `ready_for_notebooklm`, wenn:

- Der Kurs in einzelne Unterrichtseinheiten aufgeteilt ist
- Jede Unterrichtseinheit mindestens 2 Quellen hat
- Pro Unterrichtseinheit mindestens eine Quelle aus Slides, Video oder Lecture Notes besteht
- Fehlende Videos bewusst markiert sind
- Lokale PDFs vorhanden sind oder die Quelle bewusst nicht als PDF-Download gefuehrt wird
- `library.db` keine blockierenden Warnungen fuer den Kurs enthaelt

Kurse ohne Videos duerfen fuer NotebookLM zugelassen werden, wenn die Unterrichtseinheiten genug andere Quellen haben.

### Screening-Ergebnis

- Das Screening-Ergebnis muss aus OCW-Daten und lokalen Ingestion-Regeln reproduzierbar sein.
- Ein Kurs mit starken Materialien und klarer Struktur kann `selected` werden.
- Ein Kurs mit unklaren Materialien, externen Sonderquellen oder Mapping-Risiken wird `hold`.
- Ein Kurs ohne ableitbare Unterrichtseinheiten oder ohne ausreichende Quellen wird nicht `selected`.

### NotebookLM Sources

- Es sollen erstmal alle verfuegbaren Materialien als Quellen in NotebookLM hinzugefuegt werden.
- Die spaetere gezielte Auswahl einzelner Quellen passiert in NotebookLM beziehungsweise in nachgelagerten Workflows.

### Lokale Speicherung

- Nur PDFs werden lokal gespeichert.
- Videos, Websites, externe Artikel und andere Webquellen werden als URLs referenziert.

### Menschliche Freigabe

Mit menschlicher Freigabe ist gemeint: Der Upload nach NotebookLM erfolgt nicht automatisch nur, weil ein Kurs technisch bereit ist.

Die Freigabe wird in `library.db` dokumentiert:

- Der Kursstatus wird auf `approved_for_notebooklm` gesetzt.
- Zusaetzlich wird nur `approved_at` gespeichert.
- Es gibt kein `approved_by` und keine verpflichtende Freigabe-Notiz.

## Erste Beobachtungen aus vorhandener Library

Die bisherigen MIT-Kurse nutzen meist:

- `FILELIST.md`
- `LECTURE_VIDEOS.md`
- Lokale PDFs

How2AI nutzt:

- `README.md` pro Woche
- `RESOURCE.md` pro Woche
- Lokale Slides und Papers

MIT RES.10-002 zeigt:

- OCW `data.json`
- `content_map.json`
- Course ZIP
- Transcripts und Videos

Konsequenz: Es braucht Parser fuer mehrere Quellformen, aber ein gemeinsames Manifest als Ziel.
