# NotebookLM Integration Spike Plan

## Summary

Der Spike verifiziert die realen Outputs der existierenden `notebooklm`-CLI gegen
ein vorhandenes Notebook mit Sources. Ziel ist Go/No-Go fuer den geplanten
NotebookLM-Adapter des Learning Path Orchestrators (siehe
[LEARNING_PATH_ORCHESTRATOR_PLAN.md](LEARNING_PATH_ORCHESTRATOR_PLAN.md)),
nicht der Bau neuer Architektur.

Ergebnis ist `docs/NOTEBOOKLM_INTEGRATION_SPIKE.md` plus rohe JSON-Artefakte
unter `docs/spike-artifacts/`.

## Scope

**In Scope:**

- CLI-Capabilities verifizieren: `ask --json`, `-s` Source-Filter,
  `configure --mode learning-guide`, `source list --json`,
  `generate mind-map --json`, `artifact list --json`, `download mind-map --json`.
- Latenz, Zitierbarkeit, Conversation-Handling, Mindmap-Struktur dokumentieren.

**Out of Scope:**

- Kein Code unter `src/learning/`.
- Keine neuen Abstraktionen, kein State-Modell.
- Keine produktiven Pipeline-Aenderungen.
- Kein neues Notebook erstellen, kein Source-Upload.
- Mindmap-Generierung ist erlaubt (siehe Mindmap-Pfad unten), weil sie
  nicht-destruktiv ist und sonst das wichtigste Acceptance Criterium offen
  bliebe.

## Pre-Flight

Lokal bereits bestaetigte Commands:

```bash
notebooklm ask --json
notebooklm ask -s <source-id>
notebooklm configure --mode learning-guide
notebooklm source list --json
notebooklm generate mind-map --json
notebooklm artifact list --json
notebooklm download mind-map --json
```

Vor Spike-Start:

```bash
notebooklm --version                    # Version festhalten
notebooklm list --json                  # Auth funktioniert? Notebooks vorhanden?
```

Falls Auth abgelaufen ist oder Netzwerk blockiert: nur diesen Blocker
dokumentieren. Re-Login und neue Ausfuehrung brauchen separate Freigabe.

## Ablauf

### 0. Notebook-Auswahl und Baseline

```bash
notebooklm list --json
notebooklm status --json                # aktuellen Mode / aktive Conversation capturen
notebooklm source list -n <nb-id> --json
notebooklm artifact list -n <nb-id> --json
```

- Ein bestehendes Notebook mit mindestens 3-4 Sources auswaehlen.
- Aktuellen `mode` festhalten (wird in Schritt 3 geaendert und am Ende
  zurueckgesetzt).
- Pruefen, ob bereits eine Mindmap als Artifact existiert. Wenn ja: Pfad A
  (bestehende Mindmap). Wenn nein: Pfad B (einmalige Generierung).

### 1. `ask --json` Antwort-Struktur

```bash
notebooklm ask "Was ist das zentrale Thema des Materials?" \
  -n <nb-id> -c new --json > docs/spike-artifacts/ask-default.json
```

Im Output pruefen:

- Gibt es ein `references` / `citations` / `sources`-Array mit Source-IDs
  (nicht nur `[1]`, `[2]`)?
- Lassen sich Inline-Marker `[1]` zuverlaessig auf Source-IDs mappen?
- Gibt es eine `conversation_id` fuer Follow-ups?

### 2. `-s` Strikt-Filter (methodisch sauber)

**Wichtig:** Frage so waehlen, dass die *beste* Antwort in einer
**ausgeschlossenen** Source steht. Sonst ist nicht unterscheidbar, ob `-s`
gefiltert hat oder ob NotebookLM zufaellig dieselben Sources gewaehlt haette.

Vorgehen:

1. Eine Frage formulieren, deren Inhalt klar nur in `src-3` steht.
2. Mit `-s src-1 -s src-2` ausfuehren (also `src-3` explizit ausgeschlossen):

```bash
notebooklm ask "<Frage, die nur src-3 beantworten kann>" \
  -n <nb-id> -s <src-1> -s <src-2> -c new --json \
  > docs/spike-artifacts/ask-filtered-strict.json
```

3. Drei moegliche Ergebnisse einordnen:

   - Antwort zitiert nur `src-1` / `src-2` mit "konnte das nicht beantworten"
     → strikter Filter, korrekt.
   - Antwort zitiert `src-3` trotz Ausschluss → Filter wird ignoriert,
     Architektur-Risiko.
   - Antwort halluziniert, ohne Source-Bezug → ebenfalls Risiko.

### 3. `learning-guide` Mode

```bash
notebooklm configure -n <nb-id> --mode learning-guide
notebooklm ask "Erklaer mir <Kernkonzept> fuer jemanden mit Grundkenntnissen" \
  -n <nb-id> -c new --json > docs/spike-artifacts/ask-learning-guide.json
```

- Inhaltliche Unterschiede zum Default-Mode aus Schritt 1 vergleichen.
- Reicht der Mode fuer Tutor-UX, oder braucht es zusaetzlich `--persona`?

**Am Ende des Spikes:**

```bash
notebooklm configure -n <nb-id> --mode <ursprünglicher-mode>
```

### 4. Mindmap-Struktur

**Pfad A (Mindmap existiert bereits):**

```bash
notebooklm download mind-map docs/spike-artifacts/mindmap.json \
  -n <nb-id> --json
```

**Pfad B (Mindmap einmalig generieren — bewusste Ausnahme zur read-only-Regel):**

```bash
notebooklm generate mind-map -n <nb-id> --json \
  > docs/spike-artifacts/mindmap-generate.json
# warten bzw. artifact pollen, dann:
notebooklm download mind-map docs/spike-artifacts/mindmap.json \
  -n <nb-id> --json
```

JSON-Struktur dokumentieren:

- Nodes / Edges / Hierarchie.
- Haben Nodes Source-IDs verlinkt oder nur Text?
- Wie sind Knoten benannt (gut genug fuer Unit-Matching, oder zu vage)?

### 5. Latenz

5-10 `ask`-Aufrufe, **jeweils mit `-c new`**, damit Conversation-Kontext die
Messung nicht verfaelscht:

```bash
for i in 1..10; do
  time notebooklm ask "<unterschiedliche Frage>" -n <nb-id> -c new --json > /dev/null
done
```

p50 und p95 grob notieren. Variante (mit/ohne `-c new`) im Report explizit
markieren.

### 6. Conversation Follow-up

Falls Schritt 1 eine `conversation_id` lieferte:

```bash
notebooklm ask "Kannst du das vereinfachen?" \
  -n <nb-id> -c <conversation-id> --json \
  > docs/spike-artifacts/ask-followup.json
```

- Funktioniert Follow-up gegen explizite Conversation-ID?
- Wird die History sichtbar im Output (also nutzt NotebookLM den Vorkontext)?

### 7. Cleanup

```bash
notebooklm configure -n <nb-id> --mode <ursprünglicher-mode>
notebooklm history -n <nb-id> --clear      # Test-Conversations aufraeumen
```

## Report-Inhalt (`docs/NOTEBOOKLM_INTEGRATION_SPIKE.md`)

1. CLI-Version und Liste der getesteten Commands.
2. Redigierte JSON-Schema-Auszuege fuer:
   - `list --json`
   - `source list --json`
   - `ask --json` (default)
   - `ask --json` mit Source-Filter
   - `artifact list --json`
   - `download mind-map --json`
3. Antworten auf die kritischen Fragen:
   - Liefert `ask --json` konkrete Source-IDs?
   - Sind Inline-Citations auf Source-IDs mapbar?
   - Ist `-s` ein strikter Source-Filter (mit Beleg aus Schritt 2)?
   - Gibt es Conversation-IDs fuer Follow-ups?
   - Wie sieht Mindmap-JSON aus?
   - Enthaelt die Mindmap Source-IDs oder nur Text?
   - Reicht `learning-guide` fuer Tutor-UX?
   - Welche Latenz hat `ask` ungefaehr?

4. **Capability-Matrix** (Tabelle mit Go / Caveat / Blocker pro Fragestellung).

5. **Empfehlung** (eine der drei Optionen, hergeleitet aus der Matrix):
   - NotebookLM-Adapter reicht aus.
   - Adapter reicht mit Einschraenkungen — Einschraenkungen explizit nennen.
   - Browser-Automation oder eigener Retrieval-Fallback noetig.

## Acceptance Criteria

- Klare Aussage, ob `ask --json` als quellenbasierter Chat-Adapter taugt.
- Klare Aussage, ob `-s` fuer Source-Routing zuverlaessig genug ist
  (basierend auf dem methodisch sauberen Test aus Schritt 2, nicht auf
  "fuehlt sich aehnlich an").
- Klare Aussage, wie schwer Mindmap-zu-Unit/Source-Mapping wird.
- Rohe JSON-Outputs unter `docs/spike-artifacts/` verfuegbar, damit kuenftige
  Architekturentscheidungen das Schema nachschauen koennen ohne den Spike
  neu zu fahren.

## Execution Constraints

- Existing-Notebook-Modus ist der Default.
- Kein neues Notebook, kein Source-Upload.
- Mindmap-Generierung ist eine bewusste Ausnahme (nicht-destruktiv).
- `configure --mode` veraendert den Notebook-State und wird am Ende
  zurueckgesetzt.
- Test-Conversations werden am Ende per `history --clear` entfernt.
- Falls Auth abgelaufen oder Netzwerk blockiert: Blocker dokumentieren,
  Re-Login braucht separate Freigabe.
- JSON-Beispiele im Report werden gekuerzt und ggf. von personenbezogenen
  oder irrelevanten Notebook-Daten bereinigt.
- Quota-Hinweis: ca. 15-20 `ask`-Aufrufe; falls NotebookLM ein Tageskontingent
  hat, vorab pruefen.
