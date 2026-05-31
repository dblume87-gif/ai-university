# AI University — Project Summary

**Start:** 2026-04-13  
**Last Updated:** 2026-05-31  
**Started by:** Dondi187 (Discord) in #ai-university  
**Platform:** OpenClaw + Discord

---

## Rolle dieses Dokuments

Dieses Dokument beschreibt den laufenden Projektstand, Produktkontext und die naechsten Schritte. Es ist bewusst keine Installations- oder API-Dokumentation.

Fuer den Einstieg ins Repo siehe [README.md](README.md). Fuer die aktive Pipeline siehe [ocw-pipeline/README.md](ocw-pipeline/README.md).

---

## Was ist AI University?

AI University ist eine AI-powered Learning Platform fuer kuratierte Lernpfade aus hochwertigen Kursmaterialien. Der aktuelle Build konzentriert sich auf MIT OpenCourseWare und verwandte Kursquellen: Kurse werden entdeckt, gescreent, materialseitig bewertet, fuer NotebookLM vorbereitet und als Basis fuer personalisierte Lernpfade, source-grounded Chat, Mindmaps und spaetere deutschsprachige Erklaervideos genutzt.

Der Fokus hat sich vom fruehen Lernpfad-First-Plan zu einer robusteren kurszentrierten Ingestion verschoben. Seit dem NotebookLM-Integration-Spike vom 2026-05-22 ist klar: Lernpfade koennen als naechster Layer agentisch aufgebaut werden. Am 2026-05-31 wurde dafuer ein sauber getrennter Search-Agent-MVP unter `mvp/` begonnen: Der Agent chattet mit dem User, fordert `searchCourses` als kontrolliertes Tool an, bekommt Course Evidence aus der lokalen Library und faellt erst danach das Fit-Urteil.

Langfristig soll ein Nutzer nicht nur fertige Kursvideos sehen, sondern in einem eigenen Lernpfad-Notebook mit Quellen chatten, Themen per Mindmap erkunden und daraus massgeschneiderte Materialien bestellen koennen.

**Kern-Ziele:**

- [x] Erste Kursmaterialien aus MIT OCW und How2AI erfassen
- [x] Erste NotebookLM-Notebooks fuer Kursmaterialien anlegen
- [x] Erste AI-Erklaervideos aus NotebookLM generieren
- [x] Ingestion-Plan fuer kurszentriertes Screening und NotebookLM-Freigabe erstellen
- [x] SQLite-basierte Kurs-Library (`ocw-pipeline/library.db`) aufbauen
- [x] MIT-OCW-Pipeline fuer Discovery, Screening, Shortlist und Aehnlichkeitssuche implementieren
- [x] NotebookLM-CLI-Anbindung fuer Ready-Listen, Manifeste, Uploads und Online-Sync implementieren
- [x] Bestehende Online-Notebooks mit `library.db` synchronisieren
- [x] NotebookLM-Chat-/Mindmap-Spike gegen vorhandenes Kurs-Notebook durchfuehren
- [x] Zielbild fuer Learning Path Orchestrator dokumentieren
- [x] Eigenen `mvp/`-Pfad mit lokaler `library.db`-Kopie und Import-Boundary anlegen
- [x] Codex-MCP-Tool-Calling-Spike durchfuehren und Approval-Grenze dokumentieren
- [x] Search-Agent-MVP mit Codex-Provider-Adapter, eigenem Tool-Loop, `searchCourses` und `conversation.jsonl` bauen
- [ ] Search-Agent-MVP fachlich verbessern: Query-Expansion, bessere Evidence und User-Freigabe fuer Kandidaten
- [ ] Source-grounded Chat auf bestehendem Notebook auf die Course-Evidence-Schicht aufsetzen
- [ ] Persistenten Learning-Path-State mit Resume-Punkten einfuehren
- [ ] V1-Lernpfad-Orchestrator mit Contract, Kursauswahl, Material-Screening und eigenem Path-Notebook bauen
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

7. **Search-Agent-MVP (`mvp/`)**
   - User startet einen CLI-Chat und beschreibt, was er lernen will.
   - Der Codex-Provider gibt entweder einen `searchCourses`-Tool-Request oder eine finale Antwort aus.
   - Der lokale Tool-Loop fuehrt `searchCourses` read-only gegen `mvp/data/library.db` aus und schreibt User-, Tool- und Agent-Eintraege in `conversation.jsonl`.
   - Der Agent bewertet die Evidence aus Titel, Topics, Material-Counts und markierten Weak Signals; die deterministische Suche liefert Evidence, nicht die endgueltige fachliche Entscheidung.

8. **Learning Path Orchestrator (naechster Layer)**
   - Course Evidence wird mit Material-Screening, Kandidaten-Freigabe und NotebookLM-Quellen verbunden.
   - Source-grounded Chat nutzt spaeter `notebooklm ask --json -s <source-id...>` fuer konkrete Notebook-Quellen.
   - V1 erweitert dies zu Contract -> Kursauswahl -> Material-Screening -> Lernplan -> eigenem Path-Notebook -> Mindmap -> Chat/Materialien.

---

## Tech Stack

| Tool | Status | Notes |
|------|--------|-------|
| **MIT OCW** | aktiv | Primaere Kursquelle |
| **How2AI / MAS.S60** | aktiv | Moderner Zusatzkurs mit Slides, Papers und Videos |
| **NotebookLM** | aktiv | Kurs-Notebooks, Sources und AI-Content-Generierung |
| **NotebookLM CLI** | aktiv | Online-Notebooks listen, Metadaten lesen, Sources uploaden, Sync mit `library.db`, source-grounded Chat, Mindmaps |
| **SQLite** | aktiv | `ocw-pipeline/library.db` als Source of Truth fuer Kursstatus |
| **Search-Agent-MVP** | aktiv | Eigenes `mvp/`-Package mit Codex-Provider-Adapter, Tool-Loop und lokaler `library.db`-Kopie |
| **Node.js OCW Pipeline** | aktiv | Discovery, Screening, Shortlist, Similar, NotebookLM-Integration |
| **YouTube** | geplant/teilweise aktiv | Kanal vorhanden, Upload-Pipeline noch ausbauen |
| **Discord** | geplant/aktiv | Interface und Community-Kanal |
| **OpenClaw** | aktiv | Workspace und Orchestrierung |
| **Supabase** | optional | Moegliches Backend fuer Status, Nutzer, Website |
| **yt-dlp** | installiert | Video-Download-Werkzeug |

---

## Aktuelle Library

`ocw-pipeline/library.db` enthaelt aktuell **2574 gescreente/verwaltete Kurse**.

| Status | Anzahl |
|--------|-------:|
| `screened` | 1395 |
| `uploaded_to_notebooklm` | 17 |
| `hold` | 1162 |

Zusaetzlich gibt es eine aeltere lokale Materialsammlung in `library/` mit **10 MIT-Kursen + How2AI**. Diese bleibt nuetzlich, ist aber nicht mehr der einzige Status-Source-of-Truth.

Siehe auch:

- `archive/INVENTORY.md`
- `ocw-pipeline/library.db`
- `ocw-pipeline/README.md`

---

## NotebookLM Stand

Die NotebookLM-CLI ist angebunden. Online wurden im Spike 29 Notebooks gefunden. `library.db` enthaelt aktuell 17 Kurse mit Status `uploaded_to_notebooklm`.

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

### NotebookLM Integration Spike

Der Spike am 2026-05-22 gegen MIT 6.0001 hat bestaetigt:

- `notebooklm ask --json` liefert Antworten mit `references[]`, konkreten `source_id`s, Citation-Nummern, Textspans und Chunk IDs.
- `-s <source-id>` verhielt sich im Test als strikter Source-Filter.
- `configure --mode learning-guide` reicht fuer einen V0-Tutor-Chat.
- `generate mind-map` und `download mind-map` funktionieren.
- Mindmap-JSON enthaelt nur Text-Hierarchie, keine Source IDs.
- Chat-Latenz lag in der Probe grob bei 25-37 Sekunden.
- Conversation Handling: nicht `-c new` nutzen; ohne `-c` starten, echte `conversation_id` speichern, dann mit `-c <uuid>` fortsetzen.

Siehe [docs/NOTEBOOKLM_INTEGRATION_SPIKE.md](docs/NOTEBOOKLM_INTEGRATION_SPIKE.md).

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
| `mvp/` | Neuer Search-Agent-MVP: Chat, Codex-Provider-Adapter, `searchCourses`, Conversation-Artefakte |
| `mvp/README.md` | Bedienung, Architekturregeln und manueller Happy-Path-Test des Search-Agent-MVP |
| `ocw-pipeline/src/notebooklm/manifest.js` | NotebookLM Ready/Approve/Export/Upload/Sync |
| `ocw-pipeline/library.db` | SQLite Source of Truth fuer Kursstatus, Materialien und NotebookLM-IDs |
| `ocw-pipeline/README.md` | OCW-Pipeline- und NotebookLM-CLI-Dokumentation |
| `docs/ARCHITECTURE.md` | Aktueller Systemueberblick und Datenfluss |
| `docs/DATA_MODEL.md` | SQLite-Tabellen, Statuswerte und NotebookLM-Felder |
| `docs/RUNBOOKS.md` | Wiederholbare Arbeitsablaeufe fuer Entwicklung und Betrieb |
| `docs/DECISIONS.md` | Kurzer Decision Log fuer Architekturentscheidungen |
| `docs/NOTEBOOKLM_INTEGRATION_SPIKE.md` | Ergebnis des NotebookLM-Chat-/Mindmap-Spikes |
| `docs/NOTEBOOKLM_INTEGRATION_SPIKE_PLAN.md` | Plan fuer den NotebookLM-Integration-Spike |
| `docs/LEARNING_PATH_ORCHESTRATOR_PLAN.md` | Zielbild fuer personalisierte Lernpfade |
| `docs/V0_TO_V1_LEARNING_PATH_PLAN.md` | Konkreter V0-zu-V1-Implementierungsplan |
| `docs/archive/INGESTION_PLAN.md` | Archivierter Planungsstand fuer Ingestion |
| `docs/archive/INGESTION_PLAN_TECHNICAL.md` | Archivierte technische Planungsdetails |
| `archive/INVENTORY.md` | Generiertes Inventar der vorhandenen lokalen Kursmaterialien |
| `archive/AI_COURSES.md` | Kandidatenliste aus MIT OCW fuer fruehere AI/ML/DL-Suche |
| `archive/batch_upload.py` | Aelterer Batch-Upload vorhandener MIT-Kurse zu NotebookLM |
| `archive/build_inventory.py` | Generiert `INVENTORY.md` aus der lokalen Library |

---

## Naechste Schritte

1. Search-Agent-MVP fachlich verbessern: Query-Expansion, bessere Kurs-Evidence und Kandidaten nur nach User-Freigabe behalten.
2. Material-Screening und Source-Recovery additiv an `searchCourses`/Course Evidence anschliessen.
3. Minimalen Learning-Path-State/Resume Store definieren.
4. Source-grounded NotebookLM-Chat auf freigegebene Kurse und konkrete Source IDs aufsetzen.
5. Aus Chat-Antworten optionale Unit-Materialien oder Topic-Deep-Dives erzeugen.
6. Online-Notebook-Duplikat fuer MIT 6.0001 entscheiden: behalten, loeschen oder als Alias dokumentieren.
7. YouTube-Upload- und Kursseiten-Publishing vorbereiten.

---

## Discord Channel

- **Channel:** #ai-university (ID: `1493334080970952886`)
- **Start-Datum:** 2026-04-13
