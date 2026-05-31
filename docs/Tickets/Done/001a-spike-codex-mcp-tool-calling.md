# 001a - Spike: codex Tool-Calling via MCP beweisen

Status: Done

## Kontext

Der MVP-Search-Agent (Ticket [001b](001b-search-agent-mvp.md)) steht und faellt
mit einer einzigen unbewiesenen Annahme: Kann `codex exec` headless ueber die
lokale ChatGPT/Codex-**Subscription** ein von uns bereitgestelltes Tool aufrufen,
das Ergebnis sehen und darauf antworten?

Der bestehende Agent-Layer in `ocw-pipeline/src/learning/agent/provider-runtime`
ruft codex bisher nur als **One-Shot-Reviewer** auf (`--output-schema` →
strukturiertes JSON, kein Tool-Calling). Agentisches Tool-Calling ist neu und
ungeprueft. Bevor wir Produktcode bauen, klaeren wir das in einem
**Wegwerf-Spike**.

Vorab verifiziert (2026-05-31):

- `codex-cli 0.135.0` ist installiert (`/opt/homebrew/bin/codex`).
- Auth ist Subscription: `auth.json` hat `tokens`, **kein** `OPENAI_API_KEY`.
- codex hat `mcp` (externe MCP-Server konsumieren) und `mcp add <name> -- <cmd>`
  bzw. `-c mcp_servers.<name>...`-Overrides.
- `codex exec` unterstuetzt `--sandbox read-only`, `--ephemeral`,
  `--skip-git-repo-check`, `--output-schema`, `--output-last-message`, `--json`.

## Ziel

Mit minimalem Wegwerf-Code beweisen, dass der native MCP-Tool-Calling-Pfad
trägt — oder, falls nicht, das fruehzeitig herausfinden und den Fallback
festhalten.

Konkret beweisen:

1. **Tool-Calling:** codex ruft waehrend eines nicht-interaktiven `exec`-Laufs
   ein lokales MCP-Tool `search_courses(query)` auf.
2. **Datengrundlage:** die finale Antwort enthaelt **echte** `course_id`s aus der
   `library.db` (keine Halluzination) und benennt die Datengrundlage.
3. **Subscription-Auth:** der Lauf gelingt ueber die Subscription, nicht ueber
   einen API-Key-Fallback.
4. **Multi-Turn per Replay:** ein zweiter Turn — die bisherige Konversation als
   Kontext **neu eingespielt** (kein `exec resume`) plus „suche breiter" — loest
   einen erneuten, anders parametrisierten `search_courses`-Aufruf aus.

## Umfang

Alles unter `mvp/spike/` (eigenes, throwaway `package.json`):

- **Minimaler MCP-stdio-Server** mit genau einem Tool `search_courses(query)`.
  Bewusst dumm: grobe LIKE-Suche auf `title`/`topics` gegen die echte
  `ocw-pipeline/library.db`, gibt 3-5 Treffer (`course_id`, `title`, `topics`)
  zurueck. Es geht um den **Mechanismus**, nicht um Suchqualitaet.
- **Runner-Skript**, das den Server **per `-c mcp_servers.*`-Override**
  registriert (die globale `~/.codex/config.toml` bleibt unberuehrt) und
  `codex exec --cd <spike-dir> --skip-git-repo-check --sandbox read-only
  --ephemeral --output-schema <answer-schema> --output-last-message <result>
  --json` mit einem Such-Prompt startet.
- **Finale-Antwort-Schema** (`answer-schema.json`), das codex zwingt,
  `{ used_search_tool, courses[], data_basis }` zu liefern.
- **Pass/Fail-Auswertung**, die `--json`-Events (Tool-Aufruf sichtbar?) und die
  Result-Datei (echte `course_id`s? Datengrundlage benannt?) prueft.
- **Zweiter Turn**, der die Replay-Annahme aus Ticket 001b testet.
- **README** mit Pass/Fail-Kriterien und dem, was das Ergebnis fuer 001b bedeutet.

## Nicht-Ziele

- Kein echtes `searchCourses` (kein Wrap von `selectCourseCandidates`).
- Kein Course-Evidence-Objekt, keine Fit-Qualitaet.
- Keine Conversation-Persistenz, kein `conversation.jsonl`.
- Keine Provider-Abstraktion, kein CLI.
- Keine globale codex-Config aendern (nur `-c`-Overrides).

## Pass/Fail

**PASS**, wenn alle vier Ziele erfuellt sind:

- Event-Log zeigt einen echten `search_courses`-Aufruf.
- Result-JSON: `used_search_tool: true`, `courses[]` mit ≥1 echtem `course_id`
  aus der DB, `data_basis` benennt Titel/Topics.
- Lauf ohne API-Key (Subscription-Auth).
- Zweiter Replay-Turn loest einen erneuten, breiteren `search_courses`-Aufruf aus.

**Ergebnis steuert 001b:**

- **PASS mit Approval-Bypass** → MCP-Mechanik ist bewiesen, aber 001b baut die
  Produktlogik nicht direkt auf native headless MCP-Freigaben.
- **FAIL bei Tool-Calling** → Fallback in 001b: „eigener Loop" ueber
  `--output-schema`, bei dem codex `{tool_call}` **oder** `{final}` ausgibt und
  wir den Tool-Aufruf selbst ausfuehren, das Ergebnis anhaengen und erneut
  `exec`en. (Funktioniert unabhaengig von codex' MCP-Faehigkeiten.)
- **FAIL bei Replay-Turn** → Conversation-Design in 001b neu bewerten.

## Entscheidungen

- **Replay statt `exec resume`** (begruendet): wir besitzen den Verlauf als
  Source of Truth, bleiben `--ephemeral` und provider-agnostisch; `resume` waere
  codex-spezifischer Lock-in mit doppelter Source of Truth und kaum Nutzen bei
  kurzen Such-Chats.
- **MCP-Tool-Calling ist der Primaerpfad**, „eigener Loop" der Fallback.
- Der Spike ist **Wegwerf-Code** und darf nach dem Beweis geloescht werden; nur
  die Erkenntnisse (Pass/Fail + exakter funktionierender `codex exec`-Aufruf)
  fliessen in 001b.

## Ergebnis 2026-05-31

- Subscription-Auth erkannt (`auth_mode: chatgpt`).
- Lokaler MCP-Server wird von `codex exec` initialisiert und `tools/list`
  funktioniert.
- `codex exec --sandbox read-only` cancelled den MCP-Tool-Call im Headless-Lauf,
  bevor `tools/call` den Server erreicht.
- `codex exec --dangerously-bypass-approvals-and-sandbox` ruft
  `search_courses` erfolgreich auf; beide Turns liefern echte `course_id`s aus
  `mvp/data/library.db`.
- Entscheidung fuer 001b: Adapter + eigener Agent-Tool-Loop. Die OCW-Suche ist
  ein Agentenwerkzeug, aber der MVP ist nicht von nativer MCP-Approval-UI
  abhaengig.
