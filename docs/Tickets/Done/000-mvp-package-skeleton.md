# 000 - MVP Package Skeleton und Tool-Boundary

Status: Ready

## Kontext

Der MVP wird sauber getrennt vom Prototyp aufgebaut: `ocw-pipeline` bleibt
Bausteinkasten und wird nur **importiert**, der neue Pfad lebt unter `mvp/` mit
eigenem `package.json`. Diese Trennung ist **Fundament** und **spike-unabhaengig**
— Ordnergrenze, Package-Boundary und DB-Kopie sehen in beiden Ausgaengen von
[001a](001a-spike-codex-mcp-tool-calling.md) identisch aus. Sie kann daher
**sofort und parallel zum Spike** eingerichtet werden und entblockt
[001b](001b-search-agent-mvp.md).

Dies ist bewusst **kein** Feature-Code: keine `codex-cli.js`, kein
`searchCourses`, kein Chat-Loop. Nur das tragfaehige, leere Geruest und der
bewiesene Import-Pfad — alles, was vom Spike-Ergebnis abhaengt, bleibt 001b.

## Ziel

Ein valides, leeres `mvp/`-Package, das:

- ein eigenes `package.json` hat,
- die OCW-Library als lokale Datenbasis mitbringt,
- nachweislich eine Funktion aus `ocw-pipeline` importieren kann (und die
  Boundary-Richtung dokumentiert),
- mit `npm test` gruen laeuft (Smoke).

## Umfang

```text
mvp/
  package.json          # eigenes Package, type: module, Scripts dokumentiert
  README.md             # Architekturregeln (s.u.)
  data/
    library.db          # Kopie aus ocw-pipeline/library.db
  src/
    agent/providers/    # leer (.gitkeep) - Inhalt kommt in 001b
    tools/              # leer (.gitkeep)
    workflows/          # leer (.gitkeep)
    artifacts/          # leer (.gitkeep)
  test/
    boundary.test.js    # Import-Smoke
  output/               # .gitkeep
```

- `mvp/package.json` anlegen (`type: module`, `test`-Script, minimale Deps —
  nur was spike-unabhaengig ist, z.B. `better-sqlite3`; MCP-SDK kommt mit 001b).
- `mvp/README.md` mit den Architekturregeln.
- `ocw-pipeline/library.db` → `mvp/data/library.db` kopieren.
- Verzeichnis-Geruest mit `.gitkeep` (keine leeren Platzhalter-JS-Dateien, die vor
  dem Spike ohnehin falsch waeren).
- **Import-Boundary-Smoke** (`test/boundary.test.js`): importiert z.B.
  `selectCourseCandidates` aus `ocw-pipeline` und ruft sie gegen
  `mvp/data/library.db` mit einem trivialen Goal auf — beweist, dass der
  Cross-Package-Import funktioniert.

## Offene Entscheidung: Import-Mechanismus

Wie importiert `mvp` aus `ocw-pipeline`? Vor dem Bau zu entscheiden:

1. **Relative Pfad-Imports** (`../../ocw-pipeline/src/learning/contract.js`) —
   simpel, kein Install, aber koppelt an interne Struktur. *Empfehlung fuer den
   MVP*, da wir bewusst tief in den Werkzeugkasten greifen und nichts
   publishen.
2. **`file:`-Dependency** + `exports`-Feld in `ocw-pipeline/package.json` —
   sauberere Grenze, aber `ocw-pipeline` hat heute kein `exports`; muesste
   ergaenzt werden (erlaubt, da reine Config).
3. **npm-Workspaces** am Repo-Root — global, groesserer Eingriff.

## Nicht-Ziele

- Keine `codex-cli.js`, kein `searchCourses`, kein Chat-Loop (→ 001b).
- Keine leeren/falschen Platzhalter-Code-Dateien.
- `ocw-pipeline` nicht umbauen (hoechstens `exports` ergaenzen, falls Option 2
  gewaehlt wird).

## Architekturregeln (in README festhalten)

- `mvp` darf `ocw-pipeline` importieren; `ocw-pipeline` **nicht** `mvp`.
- `mvp` hat ein eigenes `package.json`; `mvp/data/library.db` ist die lokale
  MVP-Datenbasis.
- DB-Zugriff bleibt read-only und laeuft ueber kontrollierte Tool-Funktionen.
- Tools liefern Evidence oder Actions, nie die endgueltige fachliche
  Entscheidung.
- LLM-Zugriff laeuft ueber ein Provider-Interface.

## Akzeptanzkriterien

- `mvp/` existiert mit `package.json`, `README.md`, `data/library.db`, dem
  `src/`-Geruest, `test/` und `output/`.
- `mvp/data/library.db` ist eine Kopie der aktuellen `ocw-pipeline/library.db`.
- Der Import-Mechanismus ist entschieden und im README dokumentiert.
- `test/boundary.test.js` importiert eine `ocw-pipeline`-Funktion und laeuft
  gegen `mvp/data/library.db` gruen.
- `npm test` (in `mvp/`) ist dokumentiert und gruen.

## Entscheidungen

- Skeleton ist **spike-unabhaengig** und laeuft parallel zu 001a.
- Geruest bleibt **leer** (`.gitkeep`), bis der Spike die Provider-/Tool-Form
  klaert — kein Feature-Code vorab.
- Import-Mechanismus: Default-Empfehlung relative Pfade; final im Ticket
  entschieden und im README fixiert.
