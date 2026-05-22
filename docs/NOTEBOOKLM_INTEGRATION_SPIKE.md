# NotebookLM Integration Spike

**Date:** 2026-05-22  
**CLI:** NotebookLM CLI, version 0.3.4  
**Notebook:** `e9b29f80-838e-43d3-989d-e3416658b76a`  
**Title:** Introduction to Computer Science and Programming in Python (MIT 6.0001)

## Summary

NotebookLM is usable as the source-grounded chat backend for the Learning Path
Orchestrator, with caveats.

`ask --json` returns structured references with concrete `source_id`s,
`citation_number`s, cited text, character offsets, and chunk IDs. Source
filtering with repeated `-s` works strictly in the tested case. Mind maps can be
generated and downloaded as JSON, but the downloaded mind map is a text
hierarchy only and does not include source IDs. Mindmap-to-unit/source routing
therefore needs a heuristic or embedding/LLM matching layer.

The largest caveat is conversation handling: `--new` is not a valid flag despite
the help text mentioning it, and `-c new` is treated as a literal conversation
ID. To start or continue usable conversations, call `ask` without `-c` first,
capture the returned UUID, then pass that UUID with `-c`.

## Artifacts

Raw JSON and timing artifacts were written under:

```text
docs/spike-artifacts/
```

Key files:

- `list.json`
- `source-list.json`
- `artifact-list-before.json`
- `ask-default.json`
- `ask-filtered-strict.json`
- `ask-learning-guide.json`
- `ask-no-conversation-flag.json`
- `ask-followup-real-conversation.json`
- `mindmap-generate.json`
- `mindmap.json`
- `artifact-list-after-mindmap.json`
- `latency-*.json`
- `latency-*.time`

## Tested Commands

```bash
notebooklm --version
notebooklm list --json
notebooklm status --json
notebooklm source list -n <nb-id> --json
notebooklm artifact list -n <nb-id> --json
notebooklm ask "..." -n <nb-id> --json
notebooklm ask "..." -n <nb-id> -s <src-1> -s <src-2> --json
notebooklm configure -n <nb-id> --mode learning-guide
notebooklm configure -n <nb-id> --mode default
notebooklm generate mind-map -n <nb-id> --json
notebooklm download mind-map docs/spike-artifacts/mindmap.json -n <nb-id> --json
notebooklm history -n <nb-id> --clear
```

`notebooklm ask ... --new --json` was also tested and failed with:

```text
Error: No such option: --new
```

## JSON Schemas Observed

### `source list --json`

```json
{
  "notebook_id": "...",
  "notebook_title": "...",
  "sources": [
    {
      "index": 1,
      "id": "dda154ab-abd4-42f9-ae2e-f404b3c85f1f",
      "title": "1. What is Computation?",
      "type": "SourceType.YOUTUBE",
      "url": null,
      "status": "ready",
      "status_id": 2,
      "created_at": "2026-04-14T00:46:12"
    }
  ],
  "count": 24
}
```

All 24 tested MIT 6.0001 sources were `ready`.

### `ask --json`

```json
{
  "answer": "... [1-4] ...",
  "conversation_id": "b7b5e1f3-2356-4265-b07a-154d1ab5d61c",
  "turn_number": 1,
  "is_follow_up": true,
  "references": [
    {
      "source_id": "dda154ab-abd4-42f9-ae2e-f404b3c85f1f",
      "citation_number": 1,
      "cited_text": "This is a class in programming.",
      "start_char": 3560,
      "end_char": 3591,
      "chunk_id": "643e45c5-dc83-4080-b872-8f4cc492b1fb"
    }
  ]
}
```

Notes:

- Inline citations like `[1]` map to `references[].citation_number`.
- Each reference includes a concrete NotebookLM `source_id`.
- The default broad question produced many references: 733 entries across
  multiple source IDs.
- `turn_number` remained `1` in tested outputs, even for follow-up calls, so do
  not rely on it yet.

### Strict Source Filter

Filtered sources:

- `dda154ab-abd4-42f9-ae2e-f404b3c85f1f` - Lecture 1 YouTube
- `332e7f9f-661e-44fe-a7dc-3eae3eb25bd4` - Lecture 1 PDF

Question intentionally asked about Lecture 10 complexity while excluding
Lecture 10 sources.

Result:

```json
{
  "answer": "The answer is not available in the selected sources...",
  "references": []
}
```

Additional filter checks were added after review:

| Case | Selected Sources | Expected | Result |
| --- | --- | --- | --- |
| Lecture 10 complexity while selecting Lecture 1 | Lecture 1 video + PDF | unavailable | No references, no excluded sources |
| Aliasing/mutability while selecting Lecture 1 | Lecture 1 video + PDF | unavailable or only weakly covered | Only selected Lecture 1 sources cited; answer said the selected sources do not cover the concept deeply |
| OOP/classes while selecting recursion sources | Lecture 6 video + PDF | unavailable | No references, no excluded sources; answer mentioned prior conversation context |
| Recursion while selecting recursion sources | Lecture 6 video + PDF | answer available | All references came only from selected recursion sources |

Conclusion: `-s` behaved as a citation-strict source filter across these tested
cases. NotebookLM did not cite excluded sources. However, answers can still
include conversational phrasing or prior-context hints even when no references
are returned. The adapter should treat `references[].source_id` as the source of
truth for grounded claims, not every sentence in the answer.

### Learning Guide Mode

Tested:

```bash
notebooklm configure -n <nb-id> --mode learning-guide
notebooklm ask "Erklaer mir Rekursion ..." -n <nb-id> -s <recursion-video> -s <recursion-pdf> --json
notebooklm configure -n <nb-id> --mode default
```

Observed:

- Answer used tutor-like structure.
- It included an analogy, step-by-step explanation, and a control question.
- References were restricted to the two selected recursion sources.
- `references` contained 80 entries, all from the two selected source IDs.

Recommendation: `learning-guide` is good enough for V0 tutor UX. A custom
`--persona` can be added later for AI University tone, but is not required for
the first adapter.

### Mind Map

Generated:

```bash
notebooklm generate mind-map -n <nb-id> --json
```

Generation output:

```json
{
  "mind_map": {
    "name": "Einführung in die Informatik und Programmiereffizienz",
    "children": []
  },
  "note_id": "..."
}
```

Downloaded `mindmap.json` shape:

```json
{
  "name": "Einführung in die Informatik und Programmiereffizienz",
  "children": [
    {
      "name": "Informatik Grundlagen",
      "children": [
        { "name": "Berechnungen ausführen" },
        { "name": "Ergebnisse speichern" }
      ]
    }
  ]
}
```

Artifact list after generation:

```json
{
  "artifacts": [
    {
      "id": "e557b6b2-c88d-472a-b49c-074520d7070c",
      "type": "Mind Map",
      "title": "Einführung in die Informatik und Programmiereffizienz"
    }
  ],
  "count": 1
}
```

Conclusion:

- Mind map JSON is a hierarchy: `name` plus nested `children`.
- No source IDs, citation IDs, or explicit node IDs are present in the
  downloaded mind map.
- There are not even stable node IDs. A persisted node reference can only be a
  text path such as `Informatik Grundlagen > Berechnungen ausführen`.
- Regenerating a mind map may rename, move, merge, split, or duplicate labels.
- Mindmap-to-unit/source mapping is therefore fragile and must be treated as an
  architecture risk, not just a small implementation detail. It requires
  title/text matching against unit titles, source titles, and maybe source
  guide/fulltext keywords; embeddings or LLM classification may be needed later.

## Latency

The first sample ran five timed `ask --json` calls concurrently with `-c new`.
That sample is useful only as a rough concurrent-load check. It is not a clean
serial chat UX distribution, and `-c new` is not a real new-conversation flag.

| Run | Real Time |
| --- | ---: |
| 1 | 36.61s |
| 2 | 35.32s |
| 3 | 25.16s |
| 4 | 32.96s |
| 5 | 34.99s |

Concurrent sample:

- p50: 34.99s
- max / rough p95 for this small sample: 36.61s

An addendum then ran five calls serially, clearing local history before each and
calling `ask` without `-c`. This is closer to user-facing serial latency, but
still not a perfect cold-start measurement: the CLI returned the same
conversation UUID across calls, so NotebookLM may still retain server-side
conversation continuity.

| Serial Run | Real Time |
| --- | ---: |
| 1 | 43.58s |
| 2 | 27.92s |
| 3 | 30.55s |
| 4 | 28.80s |
| 5 | 26.13s |

Serial addendum sample:

- p50: 28.80s
- max / rough p95 for this small sample: 43.58s

UX implication:

- Chat needs a visible loading state.
- Streaming would be valuable if the CLI/API supports it later.
- Parallel ask calls work, but V0 should avoid firing many concurrent tutor
  questions from one user flow.
- Do not overfit UX specs to these small samples. Treat 25-45s as the observed
  range until larger measurements exist.

## Conversation Handling

Findings:

- `--new` is not a valid option.
- Passing `-c new` returns `"conversation_id": "new"` and should not be used as
  a real new-conversation mechanism.
- Calling `ask --json` without `-c` returned a real UUID:
  `b7b5e1f3-2356-4265-b07a-154d1ab5d61c`.
- Passing that UUID back with `-c` produced a valid follow-up answer.
- The local conversation cache was cleared with `notebooklm history --clear`.
- `turn_number` stayed `1` and `is_follow_up` stayed `true` in tested outputs,
  including apparent first turns. Treat both fields as unreliable for adapter
  state.
- Clearing local history did not force a clearly new server-side conversation in
  the addendum sample; the same UUID was returned across serial calls.
- One source-filtered negative test mentioned "our previous conversation" even
  with no references. This reinforces that groundedness must be judged from
  returned references, not from answer prose alone.

Recommendation:

- V0 adapter should not use `-c new`.
- Start a conversation by calling `ask` without `-c`.
- Store the returned UUID if the UI needs follow-up continuity.
- Use source-filtered calls for simple Q&A, but do not call them truly stateless
  unless the CLI/API provides a reliable new-conversation primitive.

## Capability Matrix

| Capability | Result | Notes |
| --- | --- | --- |
| Auth and list notebooks | Go | Required browser login; works after second login. |
| Source listing | Go | Source IDs and ready statuses are available. |
| `ask --json` citations | Go | References include source IDs, citation numbers, text spans, chunk IDs. |
| Inline citation mapping | Go | `[n]` maps to `references[].citation_number`. |
| Strict source filter `-s` | Go | Multiple tests produced citations only from selected sources; answer prose may still contain conversation-context phrasing. |
| Learning-guide mode | Go | Good enough for tutor-style V0. |
| Conversation follow-up | Caveat | Works with real UUID, but `--new` unsupported, `-c new` misleading, and local history clear does not guarantee cold server state. |
| Mindmap generation | Go | Fast generation for tested notebook. |
| Mindmap source mapping | Caveat | Mindmap JSON has no source IDs or stable node IDs; mapping is fragile and must be heuristic. |
| Ask latency | Caveat | Observed range about 25-45s across small concurrent and serial samples; needs loading UX. |
| Source upload/wait | Not tested | Out of scope for existing-notebook mode. This remains the next integration spike before path-specific notebooks. |

## Recommendation

**NotebookLM adapter reicht mit Einschraenkungen.**

It is strong enough for V0 source-grounded chat and material generation:

- Use `ask --json` for chat.
- Use repeated `-s` for source-constrained Q&A.
- Use `configure --mode learning-guide` for tutor mode.
- Use `generate mind-map` and `download mind-map` for topic overviews.

Adapter constraints to bake into implementation:

- Treat `source_id` as the primary routing primitive.
- Do not rely on `turn_number`.
- Do not use `-c new`.
- Capture and persist real `conversation_id` values returned by unscoped `ask`
  calls when follow-up continuity is required.
- Do not trust `turn_number` or `is_follow_up` as state truth.
- Mindmap nodes need post-processing to map back to Units/Sources, and persisted
  mindmap node identity is text-path based and fragile.
- UI must expect 25-45s ask latency until larger measurements exist.
- Path-specific notebooks still require a separate upload/wait spike.

## What This Spike Does Not Answer

- Source upload and processing latency for newly created path notebooks.
- Exact JSON shape of failed, processing, too-large, or unsupported sources.
- Whether `source wait --json` is sufficient as the only `sources_ready` gate in
  production.
- How stable mindmap text paths are across regeneration.
- Whether there is a hidden or future reliable "new conversation" primitive.

## Impact On Learning Path Orchestrator

The original "NotebookLM chat might be vaporware" risk is resolved. The next
implementation should still start with a small walking skeleton:

1. Pick one path/notebook.
2. Resolve a small set of source IDs manually or from unit metadata.
3. Ask NotebookLM with `-s`.
4. Show answer plus citations.
5. Offer "turn this into material" using existing `generate` commands.

Do not build the full `src/learning/` architecture before the first
source-routed chat loop is working end to end.

Before V1 creates a NotebookLM notebook per learning path, run a second small
spike for `create -> source add -> source wait -> source list` on controlled test
sources. That spike should measure upload/processing latency and failure modes.
