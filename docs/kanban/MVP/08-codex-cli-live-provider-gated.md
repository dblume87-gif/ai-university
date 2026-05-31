# 08 codex-cli Live-Provider (gated, Auth-Smoke)

Status: Blocked
MVP-Modul: provider-runtime (codex-cli-Impl)
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 4, 5.5, 13
Parallelisierbar: nein, gated; nach Tickets 01/03/04, nicht CI-blockierend

## Ziel

Der zweite Reviewer hinter demselben `reviewJson`-Interface: echtes
LLM-Reasoning ueber `codex exec`. Bewusst **gated und nicht-blockierend** — der
MVP-Erfolg haengt am `deterministic`-Provider. Dieser Adapter wird erst scharf
geschaltet, nachdem ein Auth-Smoke beweist, dass codex headless ueber die
Subscription laeuft. Schlaegt der Smoke fehl, bleibt der MVP `deterministic`-only
und dieses Ticket wird die erste Post-MVP-Aufgabe.

## Scope

### Auth-/Verfuegbarkeits-Smoke (Vorbedingung)

- codex ist lokal aktuell **nicht installiert**. Vor jedem Prompt muss ein Smoke
  beweisen, dass `codex exec` (a) installiert/erreichbar ist und (b) ueber die
  ChatGPT/Codex-**Subscription**-Auth laeuft, **nicht** still auf einen API-Key
  zurueckfaellt.
- Schlaegt der Smoke fehl -> Adapter bleibt deaktiviert, kein `--provider
  codex-cli`, MVP laeuft `deterministic`-only.

### codex-cli-Adapter

- **Kein** stdout-Parsing. Strukturiertes Ergebnis ueber Schema-Datei +
  Result-Datei:
  ```bash
  codex exec \
    --cd ocw-pipeline \
    --sandbox read-only \
    --ask-for-approval never \
    --ephemeral \
    --output-schema <schema-file> \
    --output-last-message <result-file> \
    -
  ```
- Adapter liest JSON aus `<result-file>`; `stdout`/`--json` nur Debug-/Event-Log.
- Validierung gegen `schema`, **maximal ein** Format-Reparatur-Retry (Repair-
  Layer aus Ticket 01); danach Fallback `ask_user`.
- Provider-Metadaten (`provider`, `task`, `latency_ms`, `attempts`) pro Gate.

### Prompt-Templates (5.5)

- Pro Task ein constraintes Template in `provider-runtime`.
- System-Teil: Rolle festlegen ("du bewertest einen Pipeline-Output, fuehrst
  keine Aktionen aus, liest keine Files, gibst nur JSON nach `schema` zurueck").
- User-Teil: `input` (Step-Output) + `schema`.
- Output strikt `{ decision, reasons[], default_action, proposed_actions[],
  data }`; jede Action mit `safe_default`.
- `proposed_actions` nur aus der pro Task erlaubten Menge (identisch zu den
  deterministischen Regeln: `broaden/refine/continue_anyway`,
  `recover_sources/continue_anyway`,
  `normalize_titles/drop_unit/continue_anyway`).
- Bei Topic-Fit dieselben candidate-level Verdicts
  (`accept|reject|low_confidence` + `accepted_candidate_ids`) wie Ticket 03.

## Nicht im Scope

- Aenderungen an der Session-Logik (Ticket 07) — der Provider ist ohne
  Code-Aenderung tauschbar.
- Weitere Provider (`claude-code`, `gemini-*`, `openai-api`) — deferred.

## Abhaengigkeiten

- Ticket 01: Interface + Repair-Layer.
- Tickets 03/04: deterministische Regeln als Referenz-Orakel.
- Externer Auth-Smoke (Vorbedingung).

## Blocker

- codex nicht installiert / Auth-Smoke nicht bestanden.

## Umsetzungshinweise

- Die deterministischen Regeln aus 5.1-5.4 sind das **Referenz-Orakel**: die
  Prompts sollen auf den Test-Fixtures dieselben Decisions liefern; Abweichungen
  sind ein Prompt-Bug oder ein echter Reasoning-Gewinn und werden manuell
  gesichtet.
- `claude-code` ist bewusst **nicht** der Live-Provider: headless `claude -p`
  laeuft nicht nachhaltig ueber die Subscription (faellt in API-Billing/Limit);
  codex laeuft headless ueber die lokale Subscription.

## Akzeptanzkriterien

- Der Auth-Smoke ist ein eigener, manuell ausloesbarer Schritt.
- Ohne bestandenen Smoke ist `--provider codex-cli` nicht verfuegbar.
- Der Adapter liest ausschliesslich aus der Result-Datei, nie aus stdout.
- Maximal ein Format-Repair, danach Fallback `ask_user`.
- `proposed_actions` bleiben auf die pro Task erlaubte Menge beschraenkt.
- Topic-Fit liefert dieselben candidate-level Verdicts wie die Regel.

## Tests / Verifikation

- codex-cli ist **nicht in CI**. Manueller Opt-in-Smoke-Test fuehrt den Happy
  Path mit `--provider codex-cli` aus und prueft: (a) `codex exec` laeuft ueber
  Subscription-Auth, (b) alle vier Gates liefern valides JSON, (c) die Decisions
  weichen auf den Fixtures nicht grob von den deterministischen Referenz-Orakeln
  ab.

## Uebergabe an Folge-Tickets

- Weitere Provider (`gemini-api`, `gemini-cli`, `openai-api`, `claude-code`)
  koennen denselben Adapter-Pfad nutzen — deferred.
