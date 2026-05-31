# 01 Provider-Runtime: Interface und Deterministic-Provider

Status: Ready
MVP-Modul: provider-runtime
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 1, 4, 5.5
Parallelisierbar: ja, Foundation; parallel zu Ticket 02

## Ziel

Der einzige Ort fuer externe Reasoning-Provider. Dieses Ticket definiert das
`reviewJson`-Interface, das gemeinsame Decision-/Output-Schema und die
blockierende `deterministic`-Impl. Alle anderen MVP-Tickets codieren gegen
dieses Interface, damit der Reviewer ohne Code-Aenderung zwischen
`deterministic` und spaeter `codex-cli` tauschbar bleibt.

## Scope

- Interface-Kontrakt:
  ```text
  AgentProvider.reviewJson({ task, input, schema })
    -> { decision, reasons[], default_action, proposed_actions[], data }
  ```
- `decision` aus `{ "accepted", "retry", "ask_user", "stop" }`.
- `task` aus `{ "goal_expansion", "topic_fit", "coverage_review", "plan_review" }`.
- `proposed_actions[]` = `{ action, label, params, safe_default }`; nur bei
  `retry`/`ask_user` gefuellt.
- `default_action` ist `string | null` und darf **nur** auf eine Action mit
  `safe_default: true` zeigen; existiert keine sichere Default-Aktion, ist
  `default_action: null`.
- `deterministic`-Impl als Default: regelbasiert (die Regeln selbst sind Tickets
  03/04), keine externe Abhaengigkeit, liefert immer valides JSON gegen `schema`
  -> kein JSON-Retry noetig.
- Schema-Validierung: ein Provider-Ergebnis ohne `safe_default` oder mit
  `default_action` auf eine unsichere Action ist schema-invalid und wird
  abgelehnt.
- JSON-Extraktions-/Repair-Layer vorbereiten (Schema-Datei + Result-Datei,
  maximal **ein** Format-Reparatur-Retry, danach Fallback `ask_user`). Im MVP
  wird er nur von `deterministic` trivial bedient; der scharfe Verbraucher ist
  der gated `codex-cli`-Adapter in Ticket 08.
- Provider-Metadaten pro Gate erfassen: `provider`, `task`, `latency_ms`,
  `attempts` (werden in Ticket 05 ins `agent_state.json` geschrieben).

## Nicht im Scope

- Die konkreten Reviewer-Regeln (Tickets 03/04).
- Der `codex-cli`-Adapter und die Prompt-Templates (Ticket 08, gated nach
  Auth-Smoke).
- Card-Rendering (Ticket 06) und State-Persistenz (Ticket 05).

## Abhaengigkeiten

- Keine harten Code-Abhaengigkeiten; nur der bestehende `learn`-Dispatch in
  `scrape.js` als spaeterer Einstiegspunkt.

## Blocker

- Keine. Foundation-Ticket.

## Umsetzungshinweise

- Neues Verzeichnis `src/learning/agent/provider-runtime/`.
- Das Decision-/Output-Schema ist die gemeinsame Vokabel fuer alle Reviewer und
  Cards; es wird einmal hier definiert und ueberall importiert, nicht dupliziert.
- `safe_default` ist Teil des Schemas, nicht nur Card-Text. Die `yes`-Falle (ein
  blankes `yes` darf nie eine riskante Aktion ausloesen) wird durch die
  Schema-Regel `default_action -> safe_default: true` strukturell verhindert.
- Der Repair-Layer ist providerneutral: er bekommt einen Result-Kanal und ein
  `schema`, validiert, repariert maximal einmal, faellt sonst auf `ask_user`.

## Akzeptanzkriterien

- `reviewJson` ist als stabiles Interface definiert und vom
  `deterministic`-Provider implementiert.
- Jede `reviewJson`-Antwort traegt `decision`, `reasons[]`, `default_action`,
  `proposed_actions[]` und `data`.
- Jede `proposed_actions[]`-Action traegt `safe_default`.
- Provider-JSON ohne `safe_default` oder mit `default_action` auf eine unsichere
  Action wird als schema-invalid abgelehnt.
- Provider-Metadaten (`provider`, `task`, `latency_ms`, `attempts`) sind pro
  Aufruf abrufbar.
- Der `deterministic`-Provider erzeugt nie ein JSON-Retry.

## Tests / Verifikation

- Schema-Validierung akzeptiert eine vollstaendige Decision und lehnt eine
  ab, der `safe_default` fehlt (vgl. Spec Test 7).
- `default_action`, das auf eine `safe_default: false`-Action zeigt, ist
  schema-invalid.
- `default_action: null` ist gueltig, wenn keine sichere Aktion existiert.
- Der Repair-Layer macht maximal einen Reparatur-Retry und faellt danach auf
  `ask_user`.

## Uebergabe an Folge-Tickets

- Tickets 03/04 implementieren die Reviewer-Regeln hinter diesem Interface.
- Ticket 05 schreibt die Provider-Metadaten in den State.
- Ticket 06 rendert `default_action`/`safe_default` als Card.
- Ticket 08 haengt den gated `codex-cli`-Adapter an denselben Repair-Layer.
