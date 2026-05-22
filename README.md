# AI University

AI University ist ein Lern- und Produktionsprojekt rund um AI-Kurse, Community und Tooling. Die aktive Softwarebasis konzentriert sich auf eine kurszentrierte Ingestion-Pipeline fuer MIT OpenCourseWare und auf den naechsten Lernpfad-Orchestrator: Kurse finden, screenen, in einer SQLite-Library verwalten, fuer NotebookLM vorbereiten und daraus quellenbasierte Lernpfade ableiten.

Der NotebookLM-Integration-Spike vom 2026-05-22 hat bestaetigt, dass `notebooklm ask --json` mit Source-IDs, strikt wirkendem `-s` Source-Filter, `learning-guide` Mode und Mindmap-Generierung fuer einen V0-Lernloop ausreicht. Der naechste Build ist deshalb ein bewusst kleiner V0: ein Walking Skeleton fuer source-grounded Chat auf einem bestehenden Notebook, danach schrittweise Ausbau zu V1.

## Aktueller Fokus

- MIT-OCW-Kurse per Discovery finden.
- Kursmetadaten und Materiallage screenen.
- Kurse nach Materialqualitaet und NotebookLM-Tauglichkeit kuratieren.
- `ocw-pipeline/library.db` als lokalen Source of Truth pflegen.
- NotebookLM-Manifeste, Upload-Queues, Upload-Logs und Asset-Indizes erzeugen.
- NotebookLM-Chat, Mindmaps und Source-Routing fuer personalisierte Lernpfade validieren.
- V0-Lernpfad-Walking-Skeleton vor dem grossen Learning-Orchestrator bauen.

## Repo-Struktur

| Pfad | Zweck |
|------|-------|
| `PROJECT_SUMMARY.md` | Laufender Projektstand, Produktkontext und naechste Schritte |
| `ocw-pipeline/` | Node.js CLI fuer OCW Discovery, Screening, Kuration und NotebookLM |
| `ocw-pipeline/library.db` | SQLite-Datenbank fuer Kurse, Materialien und NotebookLM-Status |
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

## Arbeitsprinzip

Die aktuelle Entwicklung ist bewusst lokal und nachvollziehbar gehalten: SQLite statt Server-Backend, explizite Freigaben vor NotebookLM-Uploads und generierte Artefakte im Repo-Workspace. Dadurch kann das Projekt frueh produktiv genutzt werden, ohne dass jede spaetere Plattformentscheidung schon feststehen muss.
