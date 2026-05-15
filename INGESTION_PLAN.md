# AI University Ingestion Plan

Arbeitsdokument fuer den ersten Pipeline-Teil: MIT OCW Kurse screenen, auswaehlen, Materialien zusammenstellen und fuer NotebookLM freigeben.

Details zu Schemas, Scoring-Regeln und Designentscheidungen: [INGESTION_PLAN_TECHNICAL.md](INGESTION_PLAN_TECHNICAL.md)

## Ziel

Aus MIT OCW und verwandten Kursquellen sollen programmatisch Kurse gefunden, bewertet, normalisiert und in eine saubere Freigabeliste fuer NotebookLM gebracht werden. In der aktiven Entwicklung steht zuerst die kurszentrierte Ingestion: Materiallage, Extrahierbarkeit, Unterrichtseinheiten, QA und NotebookLM-Freigabe. Lernpfade bleiben ein spaeterer Kuratierungs-Layer und sind fuer den ersten Build keine Voraussetzung.

Der Fokus dieses Plans endet bewusst vor der Video-Generierung:

`screening -> kursauswahl -> materialzusammenstellung -> manifest/qa -> ready-liste -> freigabe -> notebooklm upload`

## Pipeline

### 1. Screening

Kurse werden auf der MIT OCW Website entdeckt und kurszentriert vorbewertet. Das Screening bewertet Materialqualitaet, Extrahierbarkeit, Unterrichtseinheiten, Automatisierbarkeit und NotebookLM-Tauglichkeit. Ergebnis ist ein vorlaeufiger Tier-Score plus Warnungen.

### 2. Kursauswahl

Aus gescreenten Kursen wird entschieden, was in die Library aufgenommen wird (`selected`, `hold`, `rejected`). Ein Kurs kann `selected` werden, wenn Materiallage, Struktur und Automatisierbarkeit fuer die AI-University-Pipeline stark genug sind. Eine spaetere Lernpfad-Zuordnung ist optional und blockiert die erste Ingestion nicht.

### 3. Materialzusammenstellung

Fuer ausgewaehlte Kurse werden Materialien gesammelt: Lecture Notes, Videos, Readings, Assignments, Exams, Transcripts. PDFs werden lokal gespeichert, alles andere als URL-Referenz. Ergebnis ist ein Kursordner in `library/`.

### 4. Manifest und Post-Ingestion QA

Alle Quellen werden in ein einheitliches `course_manifest.json` normalisiert. Danach wird geprueft, ob Metadaten vollstaendig sind, Lecture-Reihenfolge stimmt, Materialien erreichbar sind und keine blockierenden Probleme vorliegen.

### 5. Ready-Liste fuer NotebookLM

Eine Uebersicht zeigt alle Kurse, die technisch fuer NotebookLM bereit sind, mit Tier, Anzahl Lectures/PDFs/Videos und Warnungen. Status: `ready_for_notebooklm`, `needs_review`, `needs_fix`.

### 6. Freigabe

Vor jedem NotebookLM-Upload gibt es eine explizite Freigabe (`approved_for_notebooklm`). Nicht automatisch hochladen, nur weil ein Kurs technisch bereit ist.

### 7. NotebookLM Upload

Notebook erstellen oder bestehende Notebook-ID verwenden, Sources hochladen, fehlgeschlagene Uploads protokollieren, Notebook-ID speichern. Status: `uploaded_to_notebooklm`.

### 8. Post-Upload Validation

Pruefen, ob alle Sources akzeptiert wurden, fehlgeschlagene PDFs/URLs erfasst sind und der Kurs bereit fuer Video-Generierung ist. Status: `notebooklm_validated`.

## Tier-Regeln

| Tier | Bedeutung | Typische Merkmale |
|------|-----------|-------------------|
| 1 | Sehr guter Kandidat fuer fruehe Pipeline | Klare Lecture-Struktur, PDFs leicht extrahierbar, >= 2 Quellen/Einheit, ueberwiegend OCW-intern |
| 2 | Wertvoll, braucht Normalisierung | Materialien vorhanden, aber uneinheitlich; externe Quellen, Luecken oder Mapping-Probleme |
| 3 | Spezialmodul oder spaeterer Zusatz | Non-Credit, Case Study, Ethics/Fairness, wenig klassische Lecture-Struktur |
| Hold/Reject | Nicht sofort aufnehmbar | Zu wenig Material, kaum automatisierbar, kaputte Quellen oder keine sinnvolle Einheitenteilung |

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

## Zentrale Dateien

| Datei | Rolle |
|-------|-------|
| `library.db` | Zentrale SQLite-Datenbank: Pipeline-Status, Freigaben, Queries |
| `course_manifest.json` | Normalisierte Kursdetails im Kursordner (nach Materialzusammenstellung) |
| `learning_path_manifest.json` | Spaeterer Kuratierungs-Layer fuer Lernpfade; nicht Teil des ersten Builds |
| `course_candidates.json` | Optionaler spaeterer Review-Output fuer lernpfadgebundenes Screening |

## Naechste Arbeitsschritte

1. Tier-Score als Punktesystem fuer Materialqualitaet, Struktur, Extrahierbarkeit und Automatisierbarkeit festlegen.
2. `library.db` anlegen und Migrations-Skript schreiben.
3. Existing Library gegen `library.db`-Schema mappen.
4. `ready_for_notebooklm` Gate implementierbar machen.
5. Danach erst NotebookLM-Upload-Automation anbinden.
6. Lernpfad-Manifest und lernpfadgebundenes Screening spaeter als Kuratierungs-Layer wieder aufnehmen.
