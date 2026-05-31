# 001 - MVP Chat Agent und Library Tool Boundary

Status: Ready

## Kontext

Der bisherige Agent-Prototyp in `ocw-pipeline` hat gezeigt, dass eine deterministische One-Shot-Auswahl fuer Kurse zu starr ist. Gleichzeitig sind die vorhandenen deterministischen Bausteine wertvoll: Sie sollen nicht Fallback sein, sondern kontrollierte Werkzeuge, die ein Agent gezielt nutzt.

Das MVP soll deshalb sauber getrennt neu aufgebaut werden. `ocw-pipeline` bleibt Bausteinkasten, Testumgebung und Experimentierfeld. Der neue MVP-Pfad bekommt einen eigenen Ordner mit nur den Elementen, die wir nach Tests wirklich brauchen.

## Ziel

Einen neuen MVP-Ordner anlegen und einen ersten minimalen Agent-Loop bauen:

- Der MVP-Code lebt getrennt vom Prototyp.
- Deterministische Funktionen werden als Agent-Tools modelliert.
- Man kann mit dem Agenten chatten.
- Der Agent kann auf Anfrage Kurse aus der OCW-Library suchen.
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
      chat-loop.js
      course-retrieval.js
    artifacts/
      schemas.js
      run-state.js
  test/
  output/
```

## Scope

Dieses Ticket baut den Skeleton, ein erstes read-only Library-Tool und einen minimalen Chat-Loop.

Umfang:

- `mvp/README.md` mit Architekturregeln erstellen.
- Tool-Interface fuer Agent-Werkzeuge definieren.
- Erstes Tool `searchCourses` als Adapter auf die vorhandene OCW-Library bauen.
- Course-Evidence-Objekt definieren, das fachlichen Fit und Datengrundlage getrennt ausweist.
- Minimalen CLI-Chat bauen, in dem der User frei fragt und der Agent bei Kursfragen `searchCourses` nutzen kann.
- Conversation-State lokal im MVP-Ordner persistieren, so dass der Chat nachvollziehbar bleibt.
- Tests schreiben, die eine Library-Suche und einen einfachen Chat-Turn mit Tool-Nutzung pruefen.

## Minimaler Chat-Loop

Der erste Loop muss nur diese Faehigkeiten koennen:

- User startet eine neue Session.
- User fragt nach Kursen, z.B. `Finde gute Kurse fuer Business Strategy`.
- Agent erkennt, dass Library-Suche gebraucht wird.
- Agent ruft kontrolliert `searchCourses` auf.
- Agent antwortet mit einer kurzen, fachlichen Kursliste und nennt die Datengrundlage.
- User kann nachfragen, z.B. `zeige mehr details zu kurs 2`.

Der Agent muss in diesem Ticket noch keinen Lernpfad bauen und keine Kurse endgueltig auswaehlen.

## Nicht-Ziele

- Noch keinen vollstaendigen Lernpfad-Agenten bauen.
- Noch keine Course-Selection-Freigabe oder Kandidaten-Persistenz fuer den Lernpfad bauen.
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
- `mvp/src/workflows/chat-loop.js` stellt einen minimalen Agent-Chat bereit.
- Es gibt einen dokumentierten CLI-Befehl, um eine neue Chat-Session zu starten.
- `searchCourses` gibt normalisierte Course Evidence zurueck:
  - `course_id`
  - `title`
  - `fit_evidence`
  - `material_evidence`
  - `recovery_evidence`
  - `source`
- Ein manueller Chat-Test ist moeglich:
  - User fragt nach passenden Kursen.
  - Agent nutzt das Library-Tool.
  - Agent zeigt relevante Kurse und deren Datengrundlage.
- Ein Test zeigt, dass eine Strategy-Suche relevante Kurse findet, ohne dass generische Treffer wie reine `analysis`/`matrix` Matches dominieren.
- Ein Test zeigt, dass ein Chat-Turn eine Kursfrage in einen Tool-Call und eine lesbare Antwort uebersetzt.
- `npm test` oder ein MVP-spezifischer Testbefehl ist dokumentiert und gruen.

## Offene Fragen

- Soll `mvp` ein eigenes `package.json` bekommen oder zunaechst die Root-/`ocw-pipeline`-Dependencies nutzen?
- Soll das erste Tool direkt gegen `ocw-pipeline/library.db` laufen oder einen expliziten `--db`/Config-Pfad verlangen?
- Wollen wir Course Evidence zuerst als JSON Schema festziehen oder pragmatisch mit Tests stabilisieren?
- Soll der erste Chat-Loop direkt einen echten LLM-Provider nutzen oder zuerst einen testbaren Agent-Driver mit austauschbarem Provider-Interface?
