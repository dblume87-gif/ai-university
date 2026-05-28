# Ticket 06 Path Notebook Upload/Wait Spike

Date: 2026-05-28

## Scope

Controlled NotebookLM spike for the path-notebook flow:

1. `notebooklm create`
2. `notebooklm source add`
3. `notebooklm source wait --json`
4. `notebooklm source list --json`

The spike used an isolated notebook and did not update productive course or
learning-path state.

## Notebook

- Title: `AIU Path Upload Wait Spike 2026-05-28`
- Notebook ID: `c8419458-101a-43e5-af4f-9f44ac386d11`
- Create artifact: `create.json`
- Create timing: `create.time`
- Observed duration: `real 1.41`

## Source Case

Controlled text source:

- Title: `AIU Ticket 06 Controlled Text Source`
- Source ID: `730a26d0-ddfc-44de-a67b-34c1c73c0350`
- Type: `SourceType.PASTED_TEXT`
- Add artifact: `add-text.json`
- Add timing: `add-text.time`
- Observed add duration: `real 1.92`

## Wait Gate

`notebooklm source wait 730a26d0-ddfc-44de-a67b-34c1c73c0350 -n c8419458-101a-43e5-af4f-9f44ac386d11 --timeout 180 --json`

Result:

```json
{
  "source_id": "730a26d0-ddfc-44de-a67b-34c1c73c0350",
  "title": "AIU Ticket 06 Controlled Text Source",
  "status": "ready",
  "status_code": 2
}
```

- Wait artifact: `wait-text.json`
- Wait timing: `wait-text.time`
- Observed wait duration: `real 1.00`

## Final Source List

`source-list-after-text.json` confirmed the final status:

```json
{
  "id": "730a26d0-ddfc-44de-a67b-34c1c73c0350",
  "title": "AIU Ticket 06 Controlled Text Source",
  "type": "SourceType.PASTED_TEXT",
  "status": "ready",
  "status_id": 2
}
```

- Source-list timing: `source-list-after-text.time`
- Observed list duration: `real 1.64`

## Recommendation For Ticket 09

Go, with caveats.

- Use `source wait --json` as the first `sources_ready` gate for each uploaded
  source.
- Treat `status: "ready"` and final `source list --json` confirmation as the
  required completion evidence before advancing required sources.
- Persist after every external NotebookLM step:
  - notebook created
  - source add returned source ID
  - wait completed
  - final list observed
- For required sources, block path activation unless `source wait --json` exits
  successfully and the final source list reports `ready`.
- For optional sources, record failures but do not block the whole path.

## Caveats

- This spike validated only a controlled pasted-text source.
- PDF, YouTube, local file and unsupported-source behavior still need broader
  coverage before large automated path uploads.
- The observed machine-readable ready value was `status: "ready"` with
  `status_code: 2`.
- The initial non-escalated create call failed due to sandboxed network
  resolution, so live NotebookLM operations require network access.
