---
name: Auto-rebuild knowledge graph after any code/docs change
description: After modifying source files in apps/, packages/, docs/, or scripts/, run the graph builder before ending the session
type: feedback
originSessionId: 82c1e765-05aa-4232-adcd-c1cbb65e6360
---
When a session has modified files in `apps/`, `packages/`, `docs/`, `scripts/`,
or `tools/`, BEFORE ending the session (or before declaring "done") run:

```bash
railway run --service Postgres -- pnpm --filter @axhy/knowledge-graph graph:build
```

The husky post-commit hook should fire automatically on every commit, but:
- It runs in the background and may not finish before the session ends
- A session might run multiple commits
- The pre-push hook only fires on push, not commit

So the discipline is: end-of-session, verify the graph is fresh by re-running
graph:build manually + graph:audit. The audit PASSING confirms:
- All `@derives(ADR-NNNN)` references point to existing ADR files
- No orphan code (every export carries lineage)
- All current code is embedded as chunks for semantic search

**Why:** Akshay asked on 2026-04-29 "is graph memory even updating?" — found
that the graph was stale (1 chunk from Day 2 instead of 100+ from Days 1–4).
Lost trust in the architecture even though the architecture was correct;
just no one was running the builder. Hooks exist to prevent recurrence, but
session-end manual run is the second line of defense.

**How to apply:**

- After any series of code edits, before "Day N done" claim → run graph:build
- After an ADR is added, run graph:build
- After a Prisma schema change, run graph:build
- The build is incremental (only re-embeds changed chunks); typically <5 sec
  unless many files changed
- Audit ran daily as a CI job once GitHub is set up (Day 7 work)

**Failures to act on:**

- Audit reports dead-links (referenced ADR not on disk) → run scripts/backfill-adr-stubs.mjs
- Audit reports orphans (file with no @derives) → add the annotation
- Audit reports new chunk count drop (stale data) → the build skipped; investigate

**Surfaces this rule does NOT cover:**

- Conversational replies that don't touch any file
- Reading-only sessions (codebase exploration)
- Pure CI/tooling-only changes that don't affect derives or schemas
