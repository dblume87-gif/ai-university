# AI University MVP

This package is the clean MVP path for the AI University agent. It is separate from `ocw-pipeline`, which remains the prototype, tool bench, and test environment.

## Scripts

```bash
npm test
npm run chat -- --help
npm run chat -- --new --message "Ich will Business Strategy lernen"
```

## Architecture Rules

- `mvp` may import tools from `../ocw-pipeline`.
- `ocw-pipeline` must not import `mvp`.
- Imports from `ocw-pipeline` use relative paths for now, for example `../../ocw-pipeline/src/learning/contract.js`.
- `mvp/data/library.db` is the local MVP data basis, copied from `ocw-pipeline/library.db`.
- Database access must be read-only and go through controlled tool functions.
- Tools return evidence or possible actions, never the final domain decision.
- LLM access must go through a provider interface.

## Current Scope

This package currently contains the first search-agent happy path:

- `searchCourses(input)` returns course evidence from the local library.
- The Codex CLI provider asks the model for either a `searchCourses` tool request or a final answer.
- The chat loop executes requested tools locally, appends results to `conversation.jsonl`, and replays the conversation into the next `codex exec` turn.
- CLI sessions live under `mvp/output/chat/<session-id>/`.

## Architecture

The MVP intentionally avoids embedding the old deterministic ranking flow as a hidden fallback. Deterministic code is exposed as agent-owned tools:

- `searchCourses` reads `mvp/data/library.db` read-only and wraps `normalizeLearningContract` plus `selectCourseCandidates` from `ocw-pipeline`.
- Tool output is Course Evidence: title, topics, material metadata counts, fit evidence, weak-signal notes, and source.
- The agent decides which courses fit the user goal. The tool does not make the final recommendation.
- `conversation.jsonl` is the replay source of truth for multi-turn chat.

Native Codex MCP tool-calling was proven in `mvp/spike`, but headless `codex exec --sandbox read-only` cancels MCP tool calls before `tools/call` reaches the server. MCP works with approval/sandbox bypass, so the product path uses the explicit JSON tool-loop instead of depending on native MCP approval behavior.

## Data

`mvp/data/library.db` is intentionally local to the MVP package so MVP tests and experiments do not depend on mutable prototype output paths.

## Manual Chat Test

Start a new session:

```bash
npm run chat -- --new --message "Ich will Business Strategy lernen"
```

Continue with a broader search using the printed session path:

```bash
npm run chat -- --session <session-dir> --message "Such breiter, auch strategic management und competitive advantage"
```

Expected behavior: the first turn requests `searchCourses`, the loop executes it, and the agent answers with fit judgments grounded in title, topics, material counts, and weak-signal notes. The second turn should request `searchCourses` again with a broader query.

## Current Caveats

- Course material counts are metadata only and are marked as unverified; material screening is not part of this MVP slice yet.
- Weak signals such as generic `business`, `management`, `analysis`, or `matrix` matches are returned deliberately so the agent can reject or qualify them.
- Chat requires a working local Codex CLI subscription login.
- Generated chat sessions under `mvp/output/chat/` are local artifacts and are ignored by git.
