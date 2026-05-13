# AI University Ingestion Plan

Arbeitsdokument fuer den ersten Pipeline-Teil: MIT OCW Kurse screenen, auswaehlen, Materialien zusammenstellen und fuer NotebookLM freigeben.

## Ziel

Aus MIT OCW und verwandten Kursquellen sollen programmatisch Kurse gefunden, bewertet, normalisiert und in eine saubere Freigabeliste fuer NotebookLM gebracht werden. Geeignet ist ein Kurs nur dann, wenn er zu einem aktiven, mit dem Nutzer abgestimmten Lernpfad passt.

Der Fokus dieses Plans endet bewusst vor der Video-Generierung:

`screening -> kursauswahl -> materialzusammenstellung -> manifest/qa -> ready-liste -> freigabe -> notebooklm upload`

## Pipeline

### 1. Screening

Kurse werden auf der MIT OCW Website entdeckt und gegen den aktiven Lernpfad vorbewertet. Das Screening nutzt keine globale Themenlogik, sondern sucht Kandidaten pro Lernpfad-Slot.

Source of Truth:

- `learning_path_manifest.json` beschreibt den aktiven Lernpfad.
- In v1 gibt es genau einen aktiven Lernpfad.
- Der Lernpfad ist eine Sequenz von Slots, kein Skill-Graph.
- Jeder Slot liefert eigene `search_keywords` fuer die OCW-Suche.

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
- Zuordnung zu genau einem Lernpfad-Slot oder Status `hold`/`rejected`
- pro Slot ein empfohlener Kurs plus bis zu 3 Alternativen

Screening Feasibility Checks:

- Kurs-Metadaten sind auf der Website erkennbar
- Materialseiten sind vorhanden oder klar verlinkt
- PDF-Quellen wirken leicht auffindbar und extrahierbar
- Videoquellen wirken leicht auffindbar oder fehlende Videos sind frueh erkennbar
- Lecture-/Session-Struktur wirkt ableitbar
- externe Quellen sind klar benannt
- Kurs kann begruendet einem vorlaeufigen Tier zugeordnet werden

#### Lernpfad-Manifest

Mindestfelder pro Slot:

```json
{
  "slot_id": "python-foundations",
  "title": "Programming Foundations",
  "learning_goal": "Learner can read, write, and reason about small programs.",
  "level": "beginner",
  "expected_prerequisites": [],
  "accepted_course_role": "primary",
  "search_keywords": ["programming", "python", "computer science"]
}
```

Slot-Felder:

- `slot_id`: stabiler Identifier fuer Manifest, Kandidatenliste und Library-Status
- `title`: kurzer Name des Lernpfad-Schritts
- `learning_goal`: was der Nutzer nach diesem Schritt koennen soll
- `level`: erwartetes Niveau, z.B. `beginner`, `intermediate`, `advanced`
- `expected_prerequisites`: vorherige Kenntnisse oder Slot-IDs
- `accepted_course_role`: erwartete Rolle des Kurses, z.B. `primary`, `supporting`, `specialization`
- `search_keywords`: Suchbegriffe fuer OCW-Kandidaten pro Slot

#### Screening-Scoring

Materialqualitaet hat Vorrang vor abstraktem Fit. Ein Kurs braucht trotzdem einen konkreten Slot-Match; gute Materialien allein reichen nicht fuer `selected`.

Scoring-Reihenfolge:

1. **Minimum Gate:** ableitbare Unterrichtseinheiten und voraussichtlich mindestens 2 Quellen pro Einheit.
2. **Materialqualitaet:** leicht extrahierbare PDFs, erkennbare Videos oder Lecture Notes, klare Materialseiten, interne OCW-Ressourcen.
3. **Slot-Fit:** Kurs passt zu `learning_goal`, `level`, `expected_prerequisites` und `accepted_course_role`.
4. **Automatisierbarkeit:** Quellen sind strukturiert, stabil und ohne Sonderparser erfassbar.
5. **Kuratierungswert:** Kurs ist der beste Kandidat fuer genau diesen Slot oder eine sinnvolle Alternative.

Hybrid-Pruefung:

- Zuerst wird der Kurs auf Kurslevel bewertet.
- Bei knappen Top-Kandidaten wird stichprobenartig auf Unterrichtseinheiten geprueft.
- Kandidaten ohne Minimum Gate erscheinen nicht als Alternative.

### 2. Kursauswahl

Aus gescreenten Kursen wird entschieden, was in die Library aufgenommen wird.

Moegliche Entscheidungen:

- `selected`: Kurs soll aufgenommen werden
- `hold`: spannend, aber erst spaeter oder mit mehr Pruefung
- `rejected`: passt nicht zur AI University Pipeline

Slot-Match-Regel:

- Ein Kurs kann nur `selected` werden, wenn er zu einem konkreten Slot im aktiven Lernpfad passt.
- Pro Slot gibt es maximal einen `recommended_course`.
- Pro Slot bleiben bis zu 3 `top_3_alternates` sichtbar.
- Ein Kurs ohne passenden Slot wird nicht `selected`, auch wenn er viele Materialien hat.
- Ein Kurs mit passendem Slot, aber unklaren Materialien landet hoechstens auf `hold` oder als schwache Alternative.

Auswahlkriterien:

- Relevanz fuer AI University
- Materialvollstaendigkeit
- Klare Lecture-/Session-Struktur
- NotebookLM-Tauglichkeit
- Aktualitaet oder didaktischer Klassiker
- Geringe Redundanz zu bereits aufgenommenen Kursen
- Erwarteter Lernpfad-Wert

#### Relevanz fuer AI University

Relevanz meint nicht das Thema des Kurses. KI-spezifische Kurse waren nur der erste Testlauf. Ein Kurs kann auch relevant sein, wenn er Grundlagen, Methoden, Werkzeuge oder Kontext liefert, die fuer einen spaeteren Lernpfad gebraucht werden.

Relevanz-Kriterien:

- **Lernpfad-Fit:** Der Kurs passt in einen geplanten Lernpfad, z.B. Einstieg, Grundlagen, Intermediate, Advanced oder Spezialmodul.
- **Prerequisite-Wert:** Der Kurs vermittelt Voraussetzungen fuer andere Kurse, z.B. Programmieren, Mathematik, Statistik, Algorithmen oder wissenschaftliches Arbeiten.
- **Anschlussfaehigkeit:** Der Kurs laesst sich sinnvoll mit vorhandenen oder geplanten Kursen kombinieren.
- **Erklaervideo-Potenzial:** Die Einheiten lassen sich in eigenstaendige, verstaendliche Erklaervideos oder Lernmodule uebersetzen.
- **User-Nutzen:** Der Kurs beantwortet einen erwartbaren Lernbedarf der Zielgruppe.
- **Kuratierungswert:** Der Kurs hilft, aus vielen OCW-Angeboten einen sinnvollen, gefuehrten Lernweg zu bauen.
- **Produktionswert:** Der Kurs ist nicht nur akademisch interessant, sondern kann praktisch in NotebookLM, YouTube und die Website-Pipeline ueberfuehrt werden.

Nicht als Relevanz-Kriterium zaehlen:

- Das Thema ist KI/ML/DL.
- Der Kurs klingt modern oder trendig.
- Der Kurs hat viele Materialien, aber keinen klaren Platz im Lernangebot.
- Der Kurs ist von MIT und deshalb automatisch wichtig.

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

### 4. Manifest und Post-Ingestion QA

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
  "learning_path_slot_id": "python-foundations",
  "slot_match": {
    "role": "primary",
    "score": 87,
    "reason": "Strong material coverage and clear fit for the slot learning goal."
  },
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

Zentrale Interfaces:

- `learning_path_manifest.json`: aktiver Lernpfad als Sequenz von Slots.
- `course_candidates.json`: gescreente Kandidaten pro Slot, inklusive `recommended_course`, `top_3_alternates`, `hold` und `rejected`.
- `library_manifest.json`: zentrale Statusuebersicht aller gescreenten Kurse, inklusive Slot-Zuordnung, Pipeline-Status und `approved_at`.
- optionales `course_manifest.json`: normalisierte Kursdetails im Kursordner nach der Materialzusammenstellung.

`course_candidates.json` speichert pro Slot:

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

Post-Ingestion QA Checks:

- Kurs-Metadaten vollstaendig genug
- Lecture-/Session-Reihenfolge plausibel
- lokale PDFs existieren oder nicht-lokale Quellen sind bewusst als externe Referenz markiert
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

- klarer Slot-Match im aktiven Lernpfad
- klare Lecture-Struktur
- Lecture Notes oder Slides als PDFs
- mindestens 2 Quellen pro Unterrichtseinheit
- ueberwiegend OCW-interne Ressourcen
- gute Automatisierbarkeit

### Tier 2

Wertvoll, aber vor Upload mit Normalisierung oder manueller Pruefung.

Typische Merkmale:

- plausibler Slot-Match, aber nicht bester Kandidat
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
- kann zu einem Slot passen, ist aber eher `supporting` oder `specialization`

### Hold / Reject

Kurs wird nicht sofort aufgenommen.

Gruende:

- zu wenig Material
- kein passender Lernpfad-Slot
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

## Designentscheidungen

### Lernpfad

- Es gibt in v1 genau einen aktiven Lernpfad.
- Der Lernpfad wird in `learning_path_manifest.json` gespeichert.
- Der Lernpfad ist eine Sequenz von Slots.
- Kursauswahl ist moderat strikt: Ein Kurs braucht einen konkreten Slot-Match, starke Kurse duerfen aber als Alternative sichtbar bleiben.
- Kandidaten werden pro Slot ueber `search_keywords` gefunden.
- Bei mehreren passenden Kursen wird ein bester Kurs empfohlen und bis zu 3 Alternativen bleiben sichtbar.

### Manifest-Dateien

- `learning_path_manifest.json` ist Source of Truth fuer den aktiven Lernpfad.
- Es gibt ein zentrales `library_manifest.json` mit Status aller gescreenten Kurse.
- Pro Kurs kann spaeter zusaetzlich ein `course_manifest.json` im Kursordner entstehen, aber das zentrale Manifest ist die primaere Uebersicht.
- Gescreente, aber noch nicht ausgewaehlte Kurse landen in `course_candidates.json`.

### Mindestanforderungen fuer `ready_for_notebooklm`

Ein Kurs ist `ready_for_notebooklm`, wenn:

- der Kurs in einzelne Unterrichtseinheiten aufgeteilt ist
- jede Unterrichtseinheit mindestens 2 Quellen hat
- pro Unterrichtseinheit mindestens eine Quelle aus Slides, Video oder Lecture Notes besteht
- fehlende Videos bewusst markiert sind
- lokale PDFs vorhanden sind oder die Quelle bewusst nicht als PDF-Download gefuehrt wird
- das zentrale Manifest keine blockierenden Warnungen fuer den Kurs enthaelt

Kurse ohne Videos duerfen fuer NotebookLM zugelassen werden, wenn die Unterrichtseinheiten genug andere Quellen haben.

### Screening-Ergebnis

- Das Screening-Ergebnis muss aus `learning_path_manifest.json` plus OCW-Daten reproduzierbar sein.
- Ein Kurs ohne passenden Slot wird nicht `selected`, auch wenn er viele Materialien hat.
- Ein Kurs mit passendem Slot, aber unklaren Materialien wird `hold` oder schwache Alternative.
- Pro Slot gibt es maximal einen `recommended_course`.
- Pro Slot gibt es maximal 3 Alternativen.
- Kandidaten ohne ableitbare Unterrichtseinheiten oder ohne ausreichende Quellen erscheinen nicht als Alternative.

### NotebookLM Sources

- Es sollen erstmal alle verfuegbaren Materialien als Quellen in NotebookLM hinzugefuegt werden.
- Die spaetere gezielte Auswahl einzelner Quellen passiert in NotebookLM beziehungsweise in nachgelagerten Workflows.

### Lokale Speicherung

- Nur PDFs werden lokal gespeichert.
- Videos, Websites, externe Artikel und andere Webquellen werden als URLs referenziert.

### Menschliche Freigabe

Mit menschlicher Freigabe ist gemeint: Der Upload nach NotebookLM erfolgt nicht automatisch nur, weil ein Kurs technisch bereit ist.

Die Freigabe wird im zentralen `library_manifest.json` dokumentiert:

- Der Kursstatus wird auf `approved_for_notebooklm` gesetzt.
- Zusaetzlich wird nur `approved_at` gespeichert.
- Es gibt kein `approved_by` und keine verpflichtende Freigabe-Notiz.

## Naechste Arbeitsschritte

1. `learning_path_manifest.json` Schema finalisieren.
2. Tier-Score als Punktesystem fuer Materialqualitaet, Slot-Fit und Automatisierbarkeit festlegen.
3. `course_candidates.json` und `library_manifest.json` Schema finalisieren.
4. Existing Library gegen Manifest-Schema mappen.
5. `ready_for_notebooklm` Gate implementierbar machen.
6. Danach erst NotebookLM-Upload-Automation anbinden.
