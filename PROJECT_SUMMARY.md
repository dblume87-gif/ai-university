# AI University — Project Summary

**Start:** 2026-04-13  
**Last Updated:** 2026-05-16  
**Started by:** Dondi187 (Discord) in #ai-university  
**Platform:** OpenClaw + Discord

---

## Rolle dieses Dokuments

Dieses Dokument beschreibt den laufenden Projektstand, Produktkontext und die naechsten Schritte. Es ist bewusst keine Installations- oder API-Dokumentation.

Fuer den Einstieg ins Repo siehe [README.md](README.md). Fuer die aktive Pipeline siehe [ocw-pipeline/README.md](ocw-pipeline/README.md).

---

## Was ist AI University?

AI University ist eine AI-powered Learning Platform fuer kuratierte Lernpfade aus hochwertigen Kursmaterialien. Der aktuelle Build konzentriert sich auf MIT OpenCourseWare und verwandte Kursquellen: Kurse werden entdeckt, gescreent, materialseitig bewertet, fuer NotebookLM vorbereitet und spaeter als deutschsprachige Erklaervideos, YouTube-Inhalte und Website-Kursseiten ausgespielt.

Der Fokus hat sich vom fruehen Lernpfad-First-Plan zu einer robusteren kurszentrierten Ingestion verschoben. Lernpfade bleiben ein spaeterer Kuratierungs-Layer; zuerst wird die Kurs-Library technisch sauber gemacht.

Langfristig soll ein Nutzer nicht nur fertige Kursvideos sehen, sondern aus einem spezifischen NotebookLM-Kurs eigene massgeschneiderte Videos oder Materialien bestellen koennen.

**Kern-Ziele:**

- [x] Erste Kursmaterialien aus MIT OCW und How2AI erfassen
- [x] Erste NotebookLM-Notebooks fuer Kursmaterialien anlegen
- [x] Erste AI-Erklaervideos aus NotebookLM generieren
- [x] Ingestion-Plan fuer kurszentriertes Screening und NotebookLM-Freigabe erstellen
- [x] SQLite-basierte Kurs-Library (`ocw-pipeline/library.db`) aufbauen
- [x] MIT-OCW-Pipeline fuer Discovery, Screening, Shortlist und Aehnlichkeitssuche implementieren
- [x] NotebookLM-CLI-Anbindung fuer Ready-Listen, Manifeste, Uploads und Online-Sync implementieren
- [x] Bestehende Online-Notebooks mit `library.db` synchronisieren
- [ ] NotebookLM-Upload-Pipeline im Alltag stabilisieren und Duplikate bereinigen
- [ ] Kurs-Manifeste pro Library-Kurs normalisieren
- [ ] NotebookLM-Video-Generierung unter Tageslimit planen
- [ ] YouTube-Upload und Kursseite aufbauen
- [ ] On-Demand-Generierung fuer Nutzeranfragen entwickeln

---

## Aktueller High-Level Ablauf

1. **Discovery**
   - MIT OCW Kurse werden per Scraper gefunden.
   - Discovery kann ueber Suchquery oder Department-Seiten laufen.
   - Ergebnisse landen in `ocw-pipeline/library.db`.

2. **Screening**
   - `data.json`, `content_map.json` und sichtbare Kursseiten-Metadaten werden ausgewertet.
   - Bewertet werden Materialqualitaet, Lecture-/Session-Struktur, PDFs, Videos, Assignments, Exams, externe Quellen und Automatisierbarkeit.
   - Ergebnis: Tier, Score, Warnungen und Status (`screened`, `hold`, etc.).

3. **Kuratierung**
   - `shortlist` zeigt gute Kandidaten nach Materiallage.
   - `similar` findet verwandte Kurse ueber Topics, Department und Titelwoerter.
   - Lernpfad-Zuordnung ist aktuell nicht blockierend.

4. **NotebookLM-Ready Gate**
   - `notebooklm ready` zeigt Kurse mit genug NotebookLM-tauglichen Quellen.
   - `notebooklm approve` setzt die explizite Freigabe.
   - `notebooklm export` erzeugt `notebooklm_manifest.json` und `UPLOAD_QUEUE.md`.

5. **NotebookLM CLI Upload und Sync**
   - `notebooklm upload` nutzt die lokal installierte `notebooklm` CLI.
   - `notebooklm sync` liest online vorhandene Notebooks und schreibt Notebook-IDs + Source-Counts zurueck in `library.db`.
   - Doppelte Notebooks werden erkannt und gemeldet.

6. **Video- und Publishing-Pipeline**
   - NotebookLM-Erklaervideos generieren; aktuelles Bottleneck: Tageslimit und Kuratierung.
   - Videos lokal sammeln, zu YouTube hochladen und spaeter auf Kursseiten anzeigen.

---

## Tech Stack

| Tool | Status | Notes |
|------|--------|-------|
| **MIT OCW** | aktiv | Primaere Kursquelle |
| **How2AI / MAS.S60** | aktiv | Moderner Zusatzkurs mit Slides, Papers und Videos |
| **NotebookLM** | aktiv | Kurs-Notebooks, Sources und AI-Content-Generierung |
| **NotebookLM CLI** | aktiv | Online-Notebooks listen, Metadaten lesen, Sources uploaden, Sync mit `library.db` |
| **SQLite** | aktiv | `ocw-pipeline/library.db` als Source of Truth fuer Kursstatus |
| **Node.js OCW Pipeline** | aktiv | Discovery, Screening, Shortlist, Similar, NotebookLM-Integration |
| **YouTube** | geplant/teilweise aktiv | Kanal vorhanden, Upload-Pipeline noch ausbauen |
| **Discord** | geplant/aktiv | Interface und Community-Kanal |
| **OpenClaw** | aktiv | Workspace und Orchestrierung |
| **Supabase** | optional | Moegliches Backend fuer Status, Nutzer, Website |
| **yt-dlp** | installiert | Video-Download-Werkzeug |

---

## Aktuelle Library

`ocw-pipeline/library.db` enthaelt aktuell **112 gescreente/verwaltete Kurse**.

| Status | Anzahl |
|--------|-------:|
| `screened` | 73 |
| `uploaded_to_notebooklm` | 5 |
| `hold` | 34 |

Zusaetzlich gibt es eine aeltere lokale Materialsammlung in `library/` mit **10 MIT-Kursen + How2AI**. Diese bleibt nuetzlich, ist aber nicht mehr der einzige Status-Source-of-Truth.

Siehe auch:

- `archive/INVENTORY.md`
- `ocw-pipeline/library.db`
- `ocw-pipeline/README.md`

---

## NotebookLM Stand

Die NotebookLM-CLI ist angebunden. Online wurden 25 Notebooks gefunden; davon sind 5 eindeutig mit lokalen Kursen in `library.db` synchronisiert.

| Kurs | Status | Sources | Notebook ID |
|------|--------|--------:|-------------|
| MIT 6.0001 Python | `uploaded_to_notebooklm` | 24 | `e9b29f80-838e-43d3-989d-e3416658b76a` |
| MIT 6.0002 Computational Thinking | `uploaded_to_notebooklm` | 35 | `b783ff81-777f-4def-ac19-ef824acb0621` |
| MIT 6.034 Artificial Intelligence | `uploaded_to_notebooklm` | 46 | `a99d5700-fffe-4e56-b251-9a3005a80ea2` |
| MIT 15.773 Hands-on Deep Learning | `uploaded_to_notebooklm` | 24 | `d9203b2c-389e-4246-bfaf-7cc5a3e68ef7` |
| MAS.S60 How2AI Spring 2025 | `uploaded_to_notebooklm` | 86 | `d9648f39-95c4-4267-a636-3e62b4eed301` |

Bekannte Online-Notebooks, die noch nicht eindeutig mit `library.db` synchronisiert sind:

- MIT 6.036 Introduction to Machine Learning
- MIT 6.7960 Deep Learning
- MIT 6.S191 Introduction to Deep Learning
- MIT 6.8300 Advances in Computer Vision
- MIT 6.867 Machine Learning
- MIT RES.10-002 Ethics of AI: Bias

Auffaelligkeit:

- MIT 6.0001 existiert online doppelt. Primary ist `Introduction to Computer Science and Programming in Python (MIT 6.0001)`, Duplicate ist `Introduction to Python MIT`.

Relevante Kommandos:

```bash
cd ocw-pipeline
node src/scrape.js notebooklm ready
node src/scrape.js notebooklm export <course-id> --mark-ready
node src/scrape.js notebooklm upload <course-id> --create --wait
node src/scrape.js notebooklm sync --dry-run --with-metadata
node src/scrape.js notebooklm sync --with-metadata
```

---

## Erstellte AI-Videos

Lokal liegen aktuell **11 MP4-Dateien** in `downloads/`:

- `downloads/MAS.S60-Week01-Weisswandtafel.mp4`
- `downloads/MIT-6.0001/00_Vom_Koch_zum_Meister_Coder.mp4`
- `downloads/MIT-6.0001/01_Was_ist_Berechnung.mp4`
- `downloads/MIT-6.0001/02_Verzweigung_Iteration.mp4`
- `downloads/MIT-6.0001/03_Komplexitaet_zerlegen.mp4`
- `downloads/MIT-6.0001/04_The_Smartest_Solution.mp4`
- `downloads/MIT-6.0001/05_Tupel_und_Listen.mp4`
- `downloads/MIT-6.0001/06_Rekursion_Dictionaries.mp4`
- `downloads/MIT-6.0001/07_Testen_Debuggen_robuster_Code.mp4`
- `downloads/MIT-6.0001/08_OOP_Bauen_mit_Code.mp4`
- `downloads/MIT-6.0001/09_Vom_Bauplan_zum_Stammbaum.mp4`

---

## Scripts & Dokumente

| Datei | Zweck |
|-------|-------|
| `README.md` | Einstieg ins Gesamtprojekt und Links auf aktuelle Doku |
| `ocw-pipeline/src/scrape.js` | Haupt-CLI fuer Discovery, Screening, Kuratierung und NotebookLM |
| `ocw-pipeline/src/notebooklm/manifest.js` | NotebookLM Ready/Approve/Export/Upload/Sync |
| `ocw-pipeline/library.db` | SQLite Source of Truth fuer Kursstatus, Materialien und NotebookLM-IDs |
| `ocw-pipeline/README.md` | OCW-Pipeline- und NotebookLM-CLI-Dokumentation |
| `docs/ARCHITECTURE.md` | Aktueller Systemueberblick und Datenfluss |
| `docs/DATA_MODEL.md` | SQLite-Tabellen, Statuswerte und NotebookLM-Felder |
| `docs/RUNBOOKS.md` | Wiederholbare Arbeitsablaeufe fuer Entwicklung und Betrieb |
| `docs/DECISIONS.md` | Kurzer Decision Log fuer Architekturentscheidungen |
| `docs/archive/INGESTION_PLAN.md` | Archivierter Planungsstand fuer Ingestion |
| `docs/archive/INGESTION_PLAN_TECHNICAL.md` | Archivierte technische Planungsdetails |
| `archive/INVENTORY.md` | Generiertes Inventar der vorhandenen lokalen Kursmaterialien |
| `archive/AI_COURSES.md` | Kandidatenliste aus MIT OCW fuer fruehere AI/ML/DL-Suche |
| `archive/batch_upload.py` | Aelterer Batch-Upload vorhandener MIT-Kurse zu NotebookLM |
| `archive/build_inventory.py` | Generiert `INVENTORY.md` aus der lokalen Library |

---

## Naechste Schritte

1. Online-Notebook-Duplikat fuer MIT 6.0001 entscheiden: behalten, loeschen oder als Alias dokumentieren.
2. Nicht synchronisierte Online-Kurse entweder in `library.db` aufnehmen oder bewusst als externe/alte Notebooks markieren.
3. `course_manifest.json` fuer ausgewaehlte Kurse generieren und Materialnormalisierung vereinheitlichen.
4. NotebookLM-Upload mit kleinen Kursen kontrolliert testen (`--dry-run`, dann `--create --wait`).
5. NotebookLM-Video-Generierung als Queue mit Tageslimit modellieren.
6. YouTube-Upload- und Kursseiten-Publishing vorbereiten.
7. Lernpfad-Manifest spaeter wieder aufnehmen, sobald die Kurs-Library stabil ist.

---

## Discord Channel

- **Channel:** #ai-university (ID: `1493334080970952886`)
- **Start-Datum:** 2026-04-13
