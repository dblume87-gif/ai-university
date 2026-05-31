# 001 - MVP Skeleton und Tool Boundary

Status: Ready

## Kontext

Der bisherige Agent-Prototyp in `ocw-pipeline` hat gezeigt, dass eine deterministische One-Shot-Auswahl fuer Kurse zu starr ist. Gleichzeitig sind die vorhandenen deterministischen Bausteine wertvoll: Sie sollen nicht Fallback sein, sondern kontrollierte Werkzeuge, die ein Agent gezielt nutzt.

Das MVP soll deshalb sauber getrennt neu aufgebaut werden. `ocw-pipeline` bleibt Bausteinkasten, Testumgebung und Experimentierfeld. Der neue MVP-Pfad bekommt einen eigenen Ordner mit nur den Elementen, die wir nach Tests wirklich brauchen.

## Ziel

Einen neuen MVP-Ordner anlegen und die erste Tool-Grenze definieren:

- Der MVP-Code lebt getrennt vom Prototyp.
- Deterministische Funktionen werden als Agent-Tools modelliert.
- Agent-Workflows entscheiden auf Basis von Evidence, nicht auf Basis versteckter Ranking-Policy.
- `ocw-pipeline` wird nur als importierter Werkzeugkasten genutzt.

## Vorgeschlagene Struktur

```text
mvp/
  README.md
  src/
    agent/
    tools/
      ocw-library.js
      ocw-materials.js
      ocw-website.js
    workflows/
      course-retrieval.js
    artifacts/
      schemas.js
      run-state.js
  test/
  output/
```

## Scope

Dieses Ticket baut nur den Skeleton und ein erstes read-only Library-Tool.

Umfang:

- `mvp/README.md` mit Architekturregeln erstellen.
- Tool-Interface fuer Agent-Werkzeuge definieren.
- Erstes Tool `searchCourses` als Adapter auf die vorhandene OCW-Library bauen.
- Course-Evidence-Objekt definieren, das fachlichen Fit und Datengrundlage getrennt ausweist.
- Einen kleinen Test schreiben, der eine Library-Suche ausfuehrt und Evidence zurueckgibt.

## Nicht-Ziele

- Noch keinen vollstaendigen Agent-Loop bauen.
- Noch keine Website-Probes automatisieren.
- Noch keine Source-Recovery migrieren.
- Keine Prototyp-Dateien aus `ocw-pipeline` verschieben oder loeschen.
- Kein freies SQL vom Agenten ausfuehren.

## Architekturregeln

- `mvp` darf Werkzeuge aus `ocw-pipeline` importieren.
- `ocw-pipeline` darf `mvp` nicht importieren.
- Deterministische Funktionen liefern Evidence oder Actions, aber keine endgueltige fachliche Entscheidung.
- Agenten duerfen Tools mehrfach nutzen und Ergebnisse vergleichen.
- Datenbankzugriff bleibt read-only und laeuft ueber kontrollierte Tool-Funktionen.

## Akzeptanzkriterien

- Ein neuer `mvp/` Ordner existiert mit README, `src/`, `test/` und `output/`.
- `mvp/src/tools/ocw-library.js` stellt mindestens `searchCourses(input)` bereit.
- `searchCourses` gibt normalisierte Course Evidence zurueck:
  - `course_id`
  - `title`
  - `fit_evidence`
  - `material_evidence`
  - `recovery_evidence`
  - `source`
- Ein Test zeigt, dass eine Strategy-Suche relevante Kurse findet, ohne dass generische Treffer wie reine `analysis`/`matrix` Matches dominieren.
- `npm test` oder ein MVP-spezifischer Testbefehl ist dokumentiert und gruen.

## Offene Fragen

- Soll `mvp` ein eigenes `package.json` bekommen oder zunaechst die Root-/`ocw-pipeline`-Dependencies nutzen?
- Soll das erste Tool direkt gegen `ocw-pipeline/library.db` laufen oder einen expliziten `--db`/Config-Pfad verlangen?
- Wollen wir Course Evidence zuerst als JSON Schema festziehen oder pragmatisch mit Tests stabilisieren?
