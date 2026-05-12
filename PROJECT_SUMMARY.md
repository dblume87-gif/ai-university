# AI University — Project Summary

**Date:** 2026-04-13 (started)  
**Last Updated:** 2026-04-15  
**Started by:** Dondi187 (Discord) in #ai-university  
**Platform:** OpenClaw + Discord

---

## Was ist AI University?

Eine AI-powered Learning Platform, die MIT/OpenCourseWare Kurse scrapet, aufbereitet und mit AI-Tools wie NotebookLM nutzbar macht. Eigene Erklärvideos werden aus den Kursmaterialien generiert.

**Kern-Ziele:**
- [x] Content scrapen (Videos, Slides, Papers)
- [x] In NotebookLM als Sources importieren
- [x] AI-Erklärvideos aus Kursmaterialien generieren
- [ ] Personalisiertes Lernen — AI passt Lernpfade an
- [ ] AI Tutor — Chatbot der Fragen beantwortet, erklärt, quizt
- [ ] Auto-Assessment — AI bewertet Einsendungen, gibt Feedback

---

## Tech Stack

| Tool | Status | Notes |
|------|--------|-------|
| **MIT OCW** | ✅ aktiv | Content-Quelle für Kurse |
| **NotebookLM** | ✅ aktiv | notebooklm-py + OAuth login |
| **Discord** | ✅ aktiv | Interface für Kurszugang |
| **OpenClaw** | ✅ aktiv | Orchestrierung + Subagenten |
| **Supabase** | ✅ aktiv | Optional als Backend |
| **YouTube** | ✅ aktiv | AI University Kanal |
| **n8n** | nicht aktiv | Workflow Automation |
| **yt-dlp** | ✅ installiert | Video Downloads |

---

## Workflows

### Kurs scrapen (2-Schritt)
1. Video Links scrapen (YouTube / OCW)
2. Slides PDF scrapen (lecture-slides-code)

### NotebookLM Pipeline
1. Notebook erstellen (`notebooklm create`)
2. PDFs hinzufügen (`notebooklm source add`)
3. YouTube URLs hinzufügen (`notebooklm source add`)
4. AI Content generieren (`notebooklm generate video --style whiteboard --language de`)

### YouTube Upload
1. AI-Videos von NotebookLM downloaden
2. YouTube Playlist erstellen
3. Videos hochladen + zur Playlist hinzufügen

---

## Kurse

### A) MIT OCW Kurse (10 Kurse — komplett)

| # | Kurs | NotebookLM | Slides | Videos |
|---|------|-----------|--------|--------|
| 1 | 6.0001 Python | ✅ | 12 PDFs | 12 YT |
| 2 | 6.0002 Data Science | ✅ | 15 PDFs | 15 YT |
| 3 | 6.034 Artificial Intelligence | ✅ | 23 PDFs | 23 YT |
| 4 | 6.036 Intro to ML | ✅ | 12 PDFs | 14 YT |
| 5 | 6.7960 Deep Learning | ✅ | 23 PDFs | 24 YT |
| 6 | 6.867 Machine Learning | ✅ | 23 PDFs | ❌ |
| 7 | 6.S191 Intro to DL | ✅ | 10 PDFs | 10 YT |
| 8 | 15.773 Hands-on DL | ✅ | 13 PDFs | 11 YT |
| 9 | 6.8300 Computer Vision | ✅ | 18 PDFs | ❌ |
| 10 | RES.10-002 AI Ethics | ✅ | — | 2 YT |

### B) How2AI MAS.S60 Spring 2025 (1 Kurs — neu!)

**Notebook:** `d9648f39-95c4-4267-a636-3e62b4eed301`  
**URL:** https://notebooklm.google.com/notebook/d9648f39-95c4-4267-a636-3e62b4eed301

| Einheit | Slides | Papers | Videos |
|---------|--------|--------|--------|
| Week 01 Introduction | ✅ | 3 | ✅ |
| Week 01 AI Research | ✅ | — | ✅ |
| Week 02 Data | ✅ | 1 | ✅ |
| Week 02 Tools | ✅ | — | ✅ |
| Week 04 Model Architectures | ✅ | 5 | ✅ |
| Week 05 Multimodal 1 | ✅ | 2 | ✅ |
| Week 06 Multimodal 2 | ✅ | 1 | ✅ |
| Week 07 Multimodal 3 | ✅ | 3 | ✅ |
| Week 09 Large Foundation Models | ✅ | 3 | ✅ |
| Week 11 Large Multimodal Models | ✅ | 3 | ✅ |
| Week 12 Generative AI | ✅ | 4 | ❌ |
| Week 14 Interactive Agents | ✅ | 3 | ✅ |
| Week 15 Human AI Interaction | ✅ | 4 | ✅ |

**Total:** 13 Slides, 28 Papers (arXiv PDFs), 12 YouTube Videos

---

## YouTube Kanal

**Kanal:** AI University  
**URL:** https://www.youtube.com/@aiuniversity

### Playlists
- **Python Programming Fundamentals** (PLDK9LaaawGj...) — 12 AI-Videos ( NotebookLM generiert, 00-09)

---

## Erstellte AI-Videos

| Video | Kurs | Stil | Sprache | Dauer | Datei |
|-------|------|-------|--------|--------|--------|
| "KI für (fast) alles" | How2AI Week 1 | Whiteboard | Deutsch | ~5min | MAS.S60-Week01-Weisswandtafel.mp4 |
| 10x Python-Erklärungen | MIT 6.0001 | NotebookLM | Deutsch | je 2-5min | Lecture_00-09.mp4 |

---

## Workspace Struktur

```
ai-university/
├── AGENTS.md
├── AI_COURSES.md
├── PROJECT_SUMMARY.md
├── batch_upload.py              # Batch Upload Script für NotebookLM
│
├── downloads/
│   ├── MIT-6.0001/             # AI-generierte Videos (00-09)
│   │   └── Lecture_00.mp4 ... Lecture_09.mp4
│   └── MAS.S60-Week01-Weisswandtafel.mp4
│
└── library/
    ├── MIT-6.0001-.../        # 10 MIT OCW Kurse
    ├── MIT-6.0002-.../
    ├── MIT-6.034-.../
    ├── MIT-6.036-.../
    ├── MIT-6.7960-.../
    ├── MIT-6.867-.../         # + Problem Sets, Exams, Solutions
    ├── MIT-6.S191-.../
    ├── MIT-15.773-.../
    ├── MIT-6.8300-.../
    └── MIT-RES.10-002-.../
    │
    └── MAS.S60-How2AI-Spring2025/   # How2AI Kurs
        ├── READINGS_OVERVIEW.md
        ├── Week_01_Introduction/
        │   ├── README.md
        │   ├── lec1 - introduction.pdf
        │   ├── arxiv_1206.5538.pdf    (Representation Learning)
        │   ├── arxiv_1705.09406.pdf   (Multimodal ML Survey)
        │   └── arxiv_2209.03430.pdf   (Foundations of Multimodal ML)
        ├── Week_01_AI_Research/
        ├── Week_02_Data_Structure_Information/
        ├── Week_02_Practical_AI_Tools/
        ├── Week_04_Model_Architectures/
        ├── Week_05_Multimodal_1/
        ├── Week_06_Multimodal_2/
        ├── Week_07_Multimodal_3/
        ├── Week_09_Large_Foundation_Models/
        ├── Week_11_Large_Multimodal_Models/
        ├── Week_12_Generative_AI/
        ├── Week_14_Interactive_Agents/
        └── Week_15_Human_AI_Interaction/
```

---

## Scripts & Tools

| Script | Zweck |
|--------|-------|
| `batch_upload.py` | Alle Kurse zu NotebookLM hochladen (PDFs + YouTubes) |
| `notebooklm` (CLI) | NotebookLM API via notebooklm-py |

---

## NotebookLM Notebooks (IDs)

| Kurs | Notebook ID |
|------|------------|
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
| **MAS.S60 How2AI** | `d9648f39-95c4-4267-a636-3e62b4eed301` |

---

## Offene Tasks

- [ ] How2AI Videos für alle 12 verfügbaren Weeks generieren (wie Week 1)
- [ ] YouTube Playlist für How2AI erstellen
- [ ] YouTube Upload für alle AI-Videos (Python + How2AI)
- [ ] Discord Interface für Kursnavigation aufbauen
- [ ] Restliche 78 AI-Kurse aus MIT OCW scrapen

---

## Daten & Fakten

- **11 Kurse** in NotebookLM
- **~160 Vorlesungen** (Videos + Slides)
- **1 AI-Erklärvideo** generiert (How2AI Week 1, Whiteboard, Deutsch)
- **10 AI-Videos** vom Python Notebook (zum Upload bereit)
- **28+ Papers** als PDF gedownloaded
- **Scrape-Daten:** MIT OCW Kurse 2026-04-13, How2AI 2026-04-14

---

## Discord Channel

- **Channel:** #ai-university (ID: 1493334080972886)
- **Guild:** Allgemein
- **Start-Datum:** 2026-04-13
