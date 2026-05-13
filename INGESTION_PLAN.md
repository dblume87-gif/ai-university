# AI University Ingestion Plan

Arbeitsdokument fuer den ersten Pipeline-Teil: MIT OCW Kurse screenen, auswaehlen, Materialien zusammenstellen und fuer NotebookLM freigeben.

## Ziel

Aus MIT OCW und verwandten Kursquellen sollen programmatisch geeignete AI/ML/DL-Kurse gefunden, bewertet, normalisiert und in eine saubere Freigabeliste fuer NotebookLM gebracht werden.

Der Fokus dieses Plans endet bewusst vor der Video-Generierung:

`screening -> kursauswahl -> materialzusammenstellung -> manifest/qa -> ready-liste -> freigabe -> notebooklm upload`

## Pipeline

### 1. Screening

Kurse werden auf der MIT OCW Website entdeckt und vorbewertet.

Erfasste Signale:

- Kurscode, Titel, Semester/Jahr, Level
- Instructor(s), Department(s)
- Topics
- Learning Resource Types
- Course Description
- Material-Menue: Lecture Notes, Lecture Videos, Readings, Assignments, Projects, Exams
- Download Course vorhanden ja/nein
- Interne OCW-Ressourcen vs. externe Quellen
- Erste Schaetzung: Anzahl Lecture Notes, Videos, PDFs, Sessions

Output:

- Kandidat mit Status `screened`
- Vorlaeufiger Tier-Score
- Begruendung und Warnungen

### 2. Kursauswahl

Aus gescreenten Kursen wird entschieden, was in die Library aufgenommen wird.

Moegliche Entscheidungen:

- `selected`: Kurs soll aufgenommen werden
- `hold`: spannend, aber erst spaeter oder mit mehr Pruefung
- `rejected`: passt nicht zur AI University Pipeline

Auswahlkriterien:

- Relevanz fuer AI University
- Materialvollstaendigkeit
- Klare Lecture-/Session-Struktur
- NotebookLM-Tauglichkeit
- Aktualitaet oder didaktischer Klassiker
- Geringe Redundanz zu bereits aufgenommenen Kursen
- Erwarteter Lernpfad-Wert

### 3. Materialzusammenstellung

Fuer ausgewaehlte Kurse werden Materialien gesammelt und lokal oder als Quellenreferenz erfasst.

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
- lokale Dateien und/oder normalisierte Quellen
- Rohdateien wie `FILELIST.md`, `LECTURE_VIDEOS.md`, `README.md`, `RESOURCE.md`

### 4. Manifest und QA

Alle uneinheitlichen Quellen werden in eine einheitliche Maschinenform gebracht.

Geplanter Manifest-Name:

- `course_manifest.json`

Kernfelder:

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
          "path": "MIT6_0001F16_Lec1.pdf",
          "status": "available"
        }
      ],
      "source_video_url": "https://www.youtube.com/watch?v=...",
      "warnings": []
    }
  ],
  "warnings": []
}
```

QA-Checks:

- Kurs-Metadaten vollstaendig genug
- Lecture-/Session-Reihenfolge plausibel
- PDFs existieren lokal
- Video-URLs normalisiert
- Fehlende Videos/Slides bewusst markiert
- Duplikate erkannt
- sehr grosse Dateien markiert
- externe Quellen markiert
- Materialmenge fuer NotebookLM plausibel

Output:

- Status `ready_for_review` oder `needs_fix`

### 5. Ready-Liste fuer NotebookLM

Eine Uebersicht zeigt alle Kurse, die technisch fuer NotebookLM bereit sind.

Felder:

- Kurs
- Tier
- Status
- Anzahl Lectures/Sessions
- Anzahl PDFs
- Anzahl Videos
- Warnungen
- geschaetzte NotebookLM-Source-Anzahl
- empfohlene Upload-Strategie

Status:

- `ready_for_notebooklm`
- `needs_review`
- `needs_fix`

### 6. Freigabe

Vor jedem NotebookLM-Upload gibt es eine explizite Freigabe.

Freigabe-Status:

- `approved_for_notebooklm`

Nicht automatisch hochladen, nur weil ein Kurs technisch bereit ist.

### 7. NotebookLM Upload

Nach Freigabe:

- Notebook erstellen oder bestehende Notebook-ID verwenden
- Sources hochladen
- fehlgeschlagene Uploads protokollieren
- Notebook-ID speichern
- Status `uploaded_to_notebooklm`

### 8. Post-Upload Validation

Nach dem Upload pruefen:

- Wurden alle Sources akzeptiert?
- Gibt es fehlgeschlagene PDFs/URLs?
- Ist die Notebook-ID gespeichert?
- Ist der Kurs bereit fuer Video-Generierung?

Output:

- Status `notebooklm_validated`

## Tier-Regeln

### Tier 1

Sehr guter Kandidat fuer fruehe Pipeline.

Typische Merkmale:

- AI/ML/DL-relevant
- klare Lecture-Struktur
- Lecture Notes oder Slides als PDFs
- Lecture Videos vorhanden
- ueberwiegend OCW-interne Ressourcen
- gute Automatisierbarkeit

### Tier 2

Wertvoll, aber vor Upload mit Normalisierung oder manueller Pruefung.

Typische Merkmale:

- relevante Inhalte
- Materialien vorhanden, aber uneinheitlich
- externe Quellen oder Sonderstruktur
- Videos oder Slides teilweise fehlend
- Lecture-Mapping nicht 1:1

### Tier 3

Spezialmodul oder spaeterer Zusatz.

Typische Merkmale:

- Non-Credit, Case Study, Ethics/Fairness, Workshop oder Modulstruktur
- wenig klassische Lecture-Struktur
- gut fuer Zusatzmaterial, aber nicht als erste Video-Pipeline

### Hold / Reject

Kurs wird nicht sofort aufgenommen.

Gruende:

- zu wenig Material
- AI-Bezug schwach
- kaum automatisierbar
- stark externe oder kaputte Quellen
- keine sinnvolle Einheitenteilung

## Statusmodell

```text
discovered
screened
selected
ingested
normalized
ready_for_review
ready_for_notebooklm
approved_for_notebooklm
uploaded_to_notebooklm
notebooklm_validated
```

Problemstatus:

```text
hold
needs_fix
rejected
```

## Erste Beobachtungen aus vorhandener Library

Die bisherigen MIT-Kurse nutzen meist:

- `FILELIST.md`
- `LECTURE_VIDEOS.md`
- lokale PDFs

How2AI nutzt:

- `README.md` pro Woche
- `RESOURCE.md` pro Woche
- lokale Slides und Papers

MIT RES.10-002 zeigt:

- OCW `data.json`
- `content_map.json`
- Course ZIP
- Transcripts und Videos

Konsequenz:

Es braucht Parser fuer mehrere Quellformen, aber ein gemeinsames Manifest als Ziel.

## Offene Designfragen

- Wird `course_manifest.json` pro Kursordner gespeichert oder gibt es zusaetzlich ein zentrales `library_manifest.json`?
- Sollen gescreente, aber noch nicht ausgewaehlte Kurse in einer Datei wie `course_candidates.json` landen?
- Welche Mindestanforderungen gelten fuer `ready_for_notebooklm`?
- Sollen Kurse ohne Videos trotzdem fuer NotebookLM zugelassen werden?
- Wie viele Sources pro Notebook sind praktisch sinnvoll?
- Welche Quellen werden nur referenziert und welche lokal gespeichert?
- Wie wird menschliche Freigabe dokumentiert?

## Naechste Arbeitsschritte

1. Screening-Schema definieren.
2. Tier-Score als Punktesystem festlegen.
3. Manifest-Schema finalisieren.
4. Existing Library gegen Manifest-Schema mappen.
5. `ready_for_notebooklm` Gate definieren.
6. Danach erst NotebookLM-Upload-Automation anbinden.
