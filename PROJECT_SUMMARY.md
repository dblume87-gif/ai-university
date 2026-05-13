# AI University — Project Summary

**Start:** 2026-04-13  
**Last Updated:** 2026-05-13  
**Started by:** Dondi187 (Discord) in #ai-university  
**Platform:** OpenClaw + Discord

---

## Was ist AI University?

AI University ist eine AI-powered Learning Platform fuer kuratierte Lernpfade aus hochwertigen Kursmaterialien. Der aktuelle Fokus liegt auf MIT OpenCourseWare und verwandten Kursquellen: Kurse werden gescreent, Materialien werden strukturiert, in NotebookLM nutzbar gemacht und spaeter als deutschsprachige Erklaervideos, YouTube-Inhalte und Website-Kursseiten ausgespielt.

Langfristig soll ein Nutzer nicht nur fertige Kursvideos sehen, sondern aus einem spezifischen NotebookLM-Kurs eigene massgeschneiderte Videos oder Materialien bestellen koennen.

**Kern-Ziele:**

- [x] Erste Kursmaterialien aus MIT OCW und How2AI erfassen
- [x] Erste NotebookLM-Notebooks fuer Kursmaterialien anlegen
- [x] Erste AI-Erklaervideos aus NotebookLM generieren
- [x] Ingestion-Plan fuer lernpfadgebundenes Kursscreening erstellen
- [ ] Programmatisches Screening gegen einen aktiven Lernpfad umsetzen
- [ ] Kurskandidaten, Library-Status und NotebookLM-Freigaben in Manifesten tracken
- [ ] NotebookLM-Upload-Pipeline mit Freigabe-Gate stabilisieren
- [ ] NotebookLM-Video-Generierung unter Tageslimit planen
- [ ] YouTube-Upload und Kursseite aufbauen
- [ ] On-Demand-Generierung fuer Nutzeranfragen entwickeln

---

## Aktueller High-Level Ablauf

1. **Screening**
   - MIT OCW Kurse programmatisch gegen einen aktiven Lernpfad screenen.
   - Kandidaten werden pro Lernpfad-Slot gesucht, nicht ueber einen globalen AI/ML-Themenfilter.

2. **Kursauswahl**
   - Pro Slot wird ein empfohlener Kurs plus bis zu 3 Alternativen vorgeschlagen.
   - Ein Kurs wird nur `selected`, wenn er zu einem konkreten Lernpfad-Slot passt.

3. **Materialzusammenstellung**
   - PDFs lokal speichern.
   - Videos, Websites und externe Artikel als URLs referenzieren.
   - Kursmaterialien in Unterrichtseinheiten normalisieren.

4. **Manifest / QA**
   - `learning_path_manifest.json`: aktiver Lernpfad als Sequenz von Slots.
   - `course_candidates.json`: gescreente Kandidaten pro Slot.
   - `library_manifest.json`: zentraler Status aller gescreenten Kurse.
   - Optional pro Kurs: `course_manifest.json`.

5. **NotebookLM-Freigabe und Upload**
   - `ready_for_notebooklm`: Kurs hat Einheiten, pro Einheit mindestens 2 Quellen, davon mindestens Slides, Video oder Lecture Notes.
   - Menschliche Freigabe wird im `library_manifest.json` dokumentiert: Status `approved_for_notebooklm` plus `approved_at`.
   - Danach Upload aller verfuegbaren Quellen in NotebookLM.

6. **Video- und Publishing-Pipeline**
   - NotebookLM-Erklaervideos generieren, aktuelles Bottleneck: ca. 20 Videos pro Tag.
   - Videos lokal sammeln, zu YouTube hochladen und auf einer weiteren Kursseite anzeigen.

---

## Tech Stack

| Tool | Status | Notes |
|------|--------|-------|
| **MIT OCW** | aktiv | Primaere Kursquelle |
| **How2AI / MAS.S60** | aktiv | Moderner Zusatzkurs mit Slides, Papers und Videos |
| **NotebookLM** | aktiv | Kurs-Notebooks und AI-Content-Generierung |
| **YouTube** | geplant/teilweise aktiv | Kanal vorhanden, Upload-Pipeline noch ausbauen |
| **Discord** | geplant/aktiv | Interface und Community-Kanal |
| **OpenClaw** | aktiv | Workspace und Orchestrierung |
| **Supabase** | optional | Moegliches Backend fuer Status, Nutzer, Website |
| **yt-dlp** | installiert | Video-Download-Werkzeug |

---

## Aktuelle Library

Lokal liegen aktuell **10 MIT-Kurse + How2AI** im Ordner `library/`.

| Kurs | Materiallage | Hinweise |
|------|--------------|----------|
| MIT 6.0001 Python | 12 PDFs, 12 Videos | Sehr sauberer Starterkurs |
| MIT 6.0002 Computational Thinking | 15 PDFs, 15 Videos | Gute Fortsetzung nach Python |
| MIT 6.034 Artificial Intelligence | 23 PDFs, 23 Videos | Klassiker, Sondernummerierung |
| MIT 6.036 Intro to ML | 12 PDFs, Video-Mapping uneinheitlich | Normalisierung noetig |
| MIT 6.7960 Deep Learning | 23 PDFs, viele Videos | Aktueller DL-Kurs, gross |
| MIT 6.867 Machine Learning | 45 PDFs, keine Videos | Gut fuer Material/Tutor, weniger fuer Video-Pipeline |
| MIT 6.S191 Intro to DL | 10 PDFs, 10 Videos | Kompakt und stark fuer Pipeline |
| MIT 15.773 Hands-on DL | 13 PDFs, 11 Videos | Praxisnah, Video/Slide-Mapping pruefen |
| MIT 6.8300 Computer Vision | 18 PDFs, Panopto-Videos | Wertvoll, aber schwieriger zu ingestieren |
| MIT RES.10-002 Ethics of AI Bias | 7 PDFs/Transcripts, Videos, OCW JSON | Spezialmodul statt Standardkurs |
| MAS.S60 How2AI Spring 2025 | 84 PDFs, 26 Markdown-Dateien | Wochenbasiert, moderne Papers/Slides/Videos |

Siehe auch: `INVENTORY.md`

---

## NotebookLM Stand

Bekannte NotebookLM-IDs:

| Kurs | Notebook ID |
|------|-------------|
| MIT 6.0001 Python | `e9b29f80-838e-43d3-989d-e40bfe2f9eb1` |
| MIT 6.0002 Data Science | `b783ff81-777f-4def-ac19-ef824acb0621` |
| MIT 6.034 AI | `a99d5700-fffe-4e56-b251-9a3005a80ea2` |
| MIT 6.036 ML | `a8fa56c6-1826-4e0f-8be5-424700da4ccb` |
| MIT 6.7960 DL | `079e535f-f79a-4d12-8815-223e6c3b3e71` |
| MIT 6.867 ML | `8e9259ed-8648-491b-8164-6efb0f1df61d` |
| MIT 6.S191 DL | `41265126-caaa-4378-affe-95e3cb6f6cbd` |
| MIT 15.773 DL | `d9203b2c-389e-4246-bfaf-7e3dd60c60e0` |
| MIT 6.8300 CV | `b29cef54-6882-4645-9395-2985e1b7e7d3` |
| MIT RES.10-002 Ethics | `37a656de-dea4-44a1-8d04-7ef76d3e0b1ae` |
| MAS.S60 How2AI | `d9648f39-95c4-4267-a636-3e62b4eed301` |

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
| `INGESTION_PLAN.md` | Arbeitsplan fuer Screening, Kursauswahl, Manifeste und NotebookLM-Freigabe |
| `INVENTORY.md` | Generiertes Inventar der vorhandenen Kursmaterialien |
| `AI_COURSES.md` | Kandidatenliste aus MIT OCW fuer fruehere AI/ML/DL-Suche |
| `batch_upload.py` | Batch-Upload vorhandener MIT-Kurse zu NotebookLM |
| `build_inventory.py` | Generiert `INVENTORY.md` aus der lokalen Library |

---

## Naechste Schritte

1. `learning_path_manifest.json` Schema finalisieren.
2. Scoring fuer Materialqualitaet, Slot-Fit und Automatisierbarkeit festlegen.
3. `course_candidates.json` und `library_manifest.json` Schema finalisieren.
4. Existing Library gegen das Manifest-Schema mappen.
5. NotebookLM-ready Gate implementieren.
6. Erst danach NotebookLM-Upload- und Video-Generierung weiter automatisieren.

---

## Discord Channel

- **Channel:** #ai-university (ID: `1493334080970952886`)
- **Start-Datum:** 2026-04-13
