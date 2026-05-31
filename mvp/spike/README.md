# 001a Spike: Codex MCP Tool Calling

This is throwaway spike code for proving whether headless `codex exec` can call a local MCP tool.

## Run

```bash
cd mvp/spike
npm start
```

The runner starts `codex exec` with local `-c mcp_servers.*` overrides. It does not mutate the global Codex config.

By default the spike uses `SPIKE_CODEX_MODE=bypass-approvals`, because current headless `codex exec --sandbox read-only` lists the MCP tool but cancels the tool call before `tools/call` reaches the server.

To reproduce the blocked safe mode:

```bash
SPIKE_CODEX_MODE=read-only npm start
```

## Pass Criteria

- Codex calls `search_courses`.
- Final JSON sets `used_search_tool: true`.
- Final JSON contains real `course_id` values from `mvp/data/library.db`.
- `data_basis` mentions `library.db`, `title`, and `topics`.
- A replayed second turn calls `search_courses` again with a broader/different query.

Run artifacts are written to `mvp/spike/output/<timestamp>/`.

## Result

Native MCP tool-calling works for the local `search_courses` server when Codex is started with `--dangerously-bypass-approvals-and-sandbox`. In read-only headless mode, Codex discovers the tool and emits an MCP tool-call event, but the call is cancelled by the approval layer before the server receives it.

Decision for 001b: do not make native MCP approval behavior the MVP dependency. Build the product chat around an adapter and an explicit agent/tool loop, so deterministic tools remain agent-owned tools while the runtime stays testable.
