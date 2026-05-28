---
type: design_spec
authority: candidate
date: 2026-05-28
status: ready-to-implement
priority: 1
session: f1b-structural-fixes
embed: true
---

# Design: decide-before-ask gate

## Why this exists

Across 4+ sessions the founder has flagged the same failure: Claude asks
multi-part questions when the brain already has the answer (founder preferences,
locked decisions, prior choices). The rule "founder sees only important
decisions" lives as a memory file but gets ignored under cognitive pressure
because no hook enforces it. This is the other Claude's structural improvement #1.

## What it does

Before any `AskUserQuestion` tool call reaches the founder:

1. Hook intercepts the tool call.
2. Hook extracts question text + topic keywords.
3. Hook runs `impact_search("founder preference on $TOPIC")` via the brain.
4. If results score > 0.5, hook either:
   - **Strict mode:** blocks the tool call, returns brain results as
     `additional_context`, requires the AI to either use the brain answer or
     re-call with `bypass_brain: true` + justification.
   - **Advisory mode (MVP):** allows the tool call but prepends brain results
     to the question so the AI sees them and can self-correct.
5. If results score ≤ 0.5, allows the tool call through unchanged.

## File layout

```
axhy-cognitive-system/
  src/
    layer-1-hook/
      pre-ask-guard.mjs       NEW — the gate
    shared/
      brain-query.mjs         NEW — abstraction for hook→brain calls
  tests/
    pre-ask-guard.test.mjs    NEW — 8-10 tests
```

## Hook wiring (settings.json)

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "AskUserQuestion",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/pre-ask-guard.mjs"
      }]
    }
  ]
}
```

## How the hook talks to the brain

Two viable approaches:

**A) Direct pgvector query** — hook imports pg client, connects via
`DATABASE_URL`, runs the same vector-similarity query the MCP server uses.
Pro: self-contained, no MCP dependency. Con: duplicates query logic.

**B) Subprocess MCP call** — hook spawns the MCP server in stdio mode, sends
`tools/call` for `impact_search`, parses response. Pro: single source of truth.
Con: cold-start latency, requires MCP server binary path.

**Recommended:** A for MVP — query directly via pgvector. The brain schema is
stable enough that drift between hook and MCP is low risk.

## Topic extraction

Heuristic for MVP:
1. Take question text.
2. Strip filler words ("should we", "do you want", etc.).
3. Take remaining nouns + verbs as the search query.
4. If question has options, include option labels in query.

Example:
- Question: "Should we use bcrypt or SHA-256 for refresh tokens?"
- Extracted: "refresh tokens bcrypt SHA-256 hashing"
- Brain query: `impact_search("founder preference refresh tokens bcrypt SHA-256 hashing")`

## Tests to write

1. Allow when brain returns no results
2. Allow when top result score < 0.5
3. Advisory: inject brain context when top score 0.5-0.8
4. Block: top score > 0.8, no `bypass_brain` flag
5. Allow with `bypass_brain: true` + justification
6. Block when `bypass_brain: true` but justification < 10 words
7. Handle brain-unreachable (DB down) — fail open with audit log
8. Topic-extraction unit tests (3-4 cases)
9. Audit log entry written for every bypass

## Invariants to preserve

- No interference with non-`AskUserQuestion` tool calls
- Hook fails open (allow) if brain unreachable — never block on infrastructure
- Bypass mechanism exists but is logged (audit traceability)
- Founder can disable via env var: `AXHY_DECIDE_BEFORE_ASK=off`

## Score thresholds (initial — tune via observation)

- `< 0.5` — brain has nothing useful, allow question through
- `0.5 - 0.8` — brain has hints, advisory mode (inject context)
- `> 0.8` — brain has clear answer, blocking mode

## Estimated effort

- Scaffolding + topic extraction + hook wiring: 1-2 hours
- Brain query integration: 1-2 hours
- 8-10 tests: 1-2 hours
- Tuning thresholds in real session: ongoing

Total ship-ready: ~4-6 hours of focused work.

## Dependencies

- pgvector access from hook (DB connection string in env)
- Brain has been built recently (`brain:build` run with embeddings)
- Observations 3354/3355 still queryable

## Sequencing

This depends on no other unshipped fix. Can be built as a standalone slice.

## What the next embodiment should do

1. Read this file.
2. Read `pre-edit-guard.mjs` for the hook pattern.
3. Read the MCP server's `impact_search` implementation for the query shape.
4. Write `pre-ask-guard.mjs` mirroring `pre-edit-guard.mjs` structure.
5. Write tests first (TDD), 8-10 cases.
6. Wire into settings.json.
7. Start in advisory mode for one session to observe behavior.
8. Promote to blocking once thresholds tune correctly.
9. Persist a brain entry describing the shipped behavior.
