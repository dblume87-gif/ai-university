# AI University MVP

This package is the clean MVP path for the AI University agent. It is separate from `ocw-pipeline`, which remains the prototype, tool bench, and test environment.

## Scripts

```bash
npm test
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

This package currently contains only the skeleton and an import-boundary smoke test. Agent providers, tools, workflows, and artifact handling will be added in later tickets.

## Data

`mvp/data/library.db` is intentionally local to the MVP package so MVP tests and experiments do not depend on mutable prototype output paths.
