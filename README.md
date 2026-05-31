# AI University

AI University ist ein Lern- und Produktionsprojekt rund um AI-Kurse, Community und Tooling. Die aktive Softwarebasis konzentriert sich auf eine kurszentrierte Ingestion-Pipeline fuer MIT OpenCourseWare und auf einen neuen CLI-first Search-Agent-MVP: Kurse finden, Evidence aus einer lokalen SQLite-Library lesen, agentisch einschaetzen und spaeter in NotebookLM-gestuetzte Lernpfade ueberfuehren.

Der NotebookLM-Integration-Spike vom 2026-05-22 hat bestaetigt, dass `notebooklm ask --json` mit Source-IDs, strikt wirkendem `-s` Source-Filter, `learning-guide` Mode und Mindmap-Generierung fuer einen spaeteren source-grounded Lernloop ausreicht. Der aktuelle MVP-Schritt ist davor bewusst enger: ein eigener `mvp/`-Pfad, in dem ein Codex-basierter Chat-Agent kontrollierte Tools nutzt, statt dass deterministische Ranking-Regeln versteckt die fachliche Entscheidung treffen.

## Aktueller Fokus

- MIT-OCW-Kurse per Discovery finden.
- Kursmetadaten und Materiallage screenen.
- Kurse nach Materialqualitaet und NotebookLM-Tauglichkeit kuratieren.
- `ocw-pipeline/library.db` als lokalen Source of Truth pflegen.
- NotebookLM-Manifeste, Upload-Queues, Upload-Logs und Asset-Indizes erzeugen.
- NotebookLM-Chat, Mindmaps und Source-Routing fuer personalisierte Lernpfade validieren.
- Search-Agent-MVP unter `mvp/` testen: Chat -> `searchCourses` -> Course Evidence -> Agent-Fit-Urteil.
- NotebookLM-gestuetzte Lernpfade nachgelagert auf der Course-Evidence-Schicht aufbauen.

## Repo-Struktur

| Pfad | Zweck |
|------|-------|
| `PROJECT_SUMMARY.md` | Laufender Projektstand, Produktkontext und naechste Schritte |
| `ocw-pipeline/` | Node.js CLI fuer OCW Discovery, Screening, Kuration und NotebookLM |
| `ocw-pipeline/library.db` | SQLite-Datenbank fuer Kurse, Materialien und NotebookLM-Status |
| `mvp/` | Neuer sauber getrennter Search-Agent-MVP mit eigener `library.db`-Kopie, Codex-Provider-Adapter und Tool-Loop |
| `ocw-pipeline/output/notebooklm/` | Generierte NotebookLM-Manifeste, Upload-Queues, Logs und Asset-Indizes |
| `docs/` | Aktuelle Architektur-, Datenmodell-, Runbook- und Entscheidungsdoku |
| `docs/NOTEBOOKLM_INTEGRATION_SPIKE.md` | Ergebnis des NotebookLM-Chat-/Mindmap-Spikes |
| `docs/V0_TO_V1_LEARNING_PATH_PLAN.md` | Umsetzungsplan vom Walking Skeleton zur V1 |
| `docs/archive/` | Aeltere Planungsdokumente, nicht mehr die aktuelle Softwaredoku |
| `archive/` | Aeltere Hilfsskripte und Inventare |
| `asset-gen/` | Notizen und Planung fuer spaetere NotebookLM-Content-Generierung |

## Schneller Einstieg

```bash
cd ocw-pipeline
npm install
npm run db:init
npm run scrape -- status
```

Typische naechste Befehle:

```bash
npm run discover:test
npm run scrape -- screen --all --fast --deep-tier 1,2
npm run scrape -- shortlist --limit 10
npm run scrape -- notebooklm ready
```

Die detaillierte CLI-Dokumentation steht in [ocw-pipeline/README.md](ocw-pipeline/README.md).

Search-Agent-MVP testen:

```bash
cd mvp
npm test
npm run chat -- --new --message "Ich will Business Strategy lernen"
```

Der MVP nutzt `mvp/data/library.db` und fuehrt Kurs-Suchanfragen als kontrolliertes Agentenwerkzeug aus. Native Codex-MCP-Tool-Calls wurden gespiked, sind im Headless-Modus aber approval-abhaengig; deshalb nutzt der Produktpfad aktuell einen eigenen Agent-Tool-Loop.

## Wichtige Dokumente

- [Projektstand](PROJECT_SUMMARY.md)
- [Architektur](docs/ARCHITECTURE.md)
- [Datenmodell](docs/DATA_MODEL.md)
- [Runbooks](docs/RUNBOOKS.md)
- [Entscheidungen](docs/DECISIONS.md)
- [NotebookLM Integration Spike](docs/NOTEBOOKLM_INTEGRATION_SPIKE.md)
- [V0 zu V1 Lernpfad-Plan](docs/V0_TO_V1_LEARNING_PATH_PLAN.md)
- [Learning Path Orchestrator Zielbild](docs/LEARNING_PATH_ORCHESTRATOR_PLAN.md)
- [OCW-Pipeline Entwicklerhandbuch](ocw-pipeline/README.md)
- [Search-Agent-MVP README](mvp/README.md)
- [Ticket-Board und Done-Historie](docs/Tickets/kanban/README.md)

## Arbeitsprinzip

Die aktuelle Entwicklung ist bewusst lokal und nachvollziehbar gehalten: SQLite statt Server-Backend, explizite Freigaben vor NotebookLM-Uploads und generierte Artefakte im Repo-Workspace. Dadurch kann das Projekt frueh produktiv genutzt werden, ohne dass jede spaetere Plattformentscheidung schon feststehen muss.
