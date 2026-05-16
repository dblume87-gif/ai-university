# AI University

AI University ist ein Lern- und Produktionsprojekt rund um AI-Kurse, Community und Tooling. Der aktuelle Entwicklungsstand konzentriert sich auf eine kurszentrierte Ingestion-Pipeline fuer MIT OpenCourseWare: Kurse finden, screenen, in einer SQLite-Library verwalten und fuer NotebookLM vorbereiten.

Die Planung fuer Lernpfade, YouTube-Publishing und On-Demand-Inhalte bleibt wichtig, aber die aktive Softwarebasis ist im Moment die lokale OCW-Pipeline.

## Aktueller Fokus

- MIT-OCW-Kurse per Discovery finden.
- Kursmetadaten und Materiallage screenen.
- Kurse nach Materialqualitaet und NotebookLM-Tauglichkeit kuratieren.
- `ocw-pipeline/library.db` als lokalen Source of Truth pflegen.
- NotebookLM-Manifeste, Upload-Queues, Upload-Logs und Asset-Indizes erzeugen.

## Repo-Struktur

| Pfad | Zweck |
|------|-------|
| `PROJECT_SUMMARY.md` | Laufender Projektstand, Produktkontext und naechste Schritte |
| `ocw-pipeline/` | Node.js CLI fuer OCW Discovery, Screening, Kuration und NotebookLM |
| `ocw-pipeline/library.db` | SQLite-Datenbank fuer Kurse, Materialien und NotebookLM-Status |
| `ocw-pipeline/output/notebooklm/` | Generierte NotebookLM-Manifeste, Upload-Queues, Logs und Asset-Indizes |
| `docs/` | Aktuelle Architektur-, Datenmodell-, Runbook- und Entscheidungsdoku |
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
- [OCW-Pipeline Entwicklerhandbuch](ocw-pipeline/README.md)

## Arbeitsprinzip

Die aktuelle Entwicklung ist bewusst lokal und nachvollziehbar gehalten: SQLite statt Server-Backend, explizite Freigaben vor NotebookLM-Uploads und generierte Artefakte im Repo-Workspace. Dadurch kann das Projekt frueh produktiv genutzt werden, ohne dass jede spaetere Plattformentscheidung schon feststehen muss.
