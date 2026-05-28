---
type: session_outcome
authority: curated
date: 2026-05-28
session: f1b-structural-fixes-continued
embed: true
commits:
  - 9b7d125  # auto-memory scope independence
  - cf960da  # brain entry for #1
  - 85ff7e4  # design spec decide-before-ask
  - 7974e78  # .claude/projects path added to exemption
  - cd3c290  # Wave 1 fixes (next-question + check-before-edit + post-commit)
  - 3f96559  # brain-builder auto-memory scan (axhy-v3 main)
---

# Wave 1 structural fixes shipped 2026-05-28

## What landed structurally

Six commits across two repos closed the loops the prior session identified
in their verification audit.

### Loop 1: memory writes blocked by slice scope
- `pre-edit-guard.mjs`: added `MEMORY_PATH_PREFIXES` allowlist + `isMemoryWrite()`
  helper. Memory writes (.md under specific paths) bypass scope check.
- Initial list was incomplete — `.claude/projects/-Users-thotaakshay-eclean-workspace/memory/`
  was missing. Added in commit 7974e78 after audit caught it.
- **Verified:** this very file written using the exemption without slice approval.

### Loop 2: nonsense "what is current content?" for non-existent files
- `next-question.mjs`: added `fileExists` default param.
  `if (fileExists && !fileWasRead)` now suppresses the question for new files.
- `check-before-edit.mjs`: threads `existsSync(absPath)` (already computed at
  line 196) into the `generateNextQuestion` call at line 213.
- **Verified:** 148/148 layer-1+layer-2 tests pass.

### Loop 3: silent brain-staleness on commits without DB
- `post-commit.mjs`: writes `/tmp/axhy-brain-stale-since.txt` with
  `${timestamp},${commit_sha}` when DATABASE_URL is unset. Cleans up on
  rebuild path.
- **Verified in production:** the brain-builder commit (3f96559) itself
  triggered this — marker written for that exact commit. Loud not silent.

### Loop 4: auto-memory invisible to impact_search
- `brain-builder.ts`: adds `AUTO_MEMORY_DIR` scan to walk
  `~/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/*.md`.
- After next `brain:build` runs, all auto-memory feedback files become
  queryable via `impact_search`. Currently half-persisted (boot reads the
  index, mid-session impact_search misses them).

## What every test confirmed

- Layer-1 hook: 29/29 pass
- Layer-2 guardrail: 119/119 pass (148/148 combined)
- Full cognitive-system suite serial: 477/477 pass, 0 fail, 22 pre-existing
  skips
- Smoke test 1: writing the original audit feedback file from slice scope
- Smoke test 2: writing the decide-before-ask design spec from slice scope
- Smoke test 3: writing this file from slice scope (still works)
- Smoke test 4: brain-stale marker fired on the brain-builder commit itself

## Budget-state lesson discovered mid-session

The `check_before_edit` MCP server allocates fresh budget (50 edits) when
state is expired/missing, but returns `edits_remaining: 0` when re-approving
a recently-consumed file. The 5-minute `APPROVAL_WINDOW_MS` expiry is what
resets the budget. This is item #5 from the audit (state-fragmentation),
partially verified now. Workaround: wait for expiry OR request multiple
files in a single approval to use the batched budget.

## What did NOT land this session

The audit listed 14 items. This session shipped items #1, #2, #3, #4, #13,
#14 — six closed loops. Still pending:

- **#9 (highest impact): decide-before-ask gate** — NEW FILE at
  `src/layer-2-guardrail/check-before-ask.mjs`. Full design spec is
  embedded in the brain at `memory/base/design_decide_before_ask_gate.md`.
  Estimated 4-6 hours. Single focused session recommended.
- **#5: vision-anchor re-injection** — post-compaction.mjs already loads
  identity but missing obs 3354/3355.
- **#6: interaction-shape patterns** in pattern-scanner.mjs (design_doc_dump,
  multi_choice_enum_question, brand_frame_summoning).
- **#7/#11: chunk-merge in brain-builder** — currently bulk-replaces all
  chunks per file on rebuild, losing per-chunk staleness signal.
- **#8: impact_search staleness signal** (embedded_at in result objects).
- **#10: session-end persistence enforcement** (Stop hook blocks if
  learnings articulated but not persisted).
- **#12: embodied-claim tracker** (PostToolUse hook captures "I'll" / "from
  now on" commitments into brain entries).

## What the next embodiment should do

1. Read this file at boot (via brain-first orientation in CLAUDE.md).
2. If decide-before-ask gate is the priority, read
   `memory/base/design_decide_before_ask_gate.md` for full spec, then
   execute it as a focused slice with TDD.
3. If brain-stale marker is present at `/tmp/axhy-brain-stale-since.txt`,
   run `brain:build` before relying on `impact_search` results.
4. Wave 2 of the audit (items #5, #6, #10, #12) compounds on what's shipped.

## Verification commands

```bash
# Cognitive system tests
cd axhy-cognitive-system && node --test --test-concurrency=1 tests/

# Brain-stale marker present?
cat /tmp/axhy-brain-stale-since.txt

# Brain has this memory file?
# After next brain:build:
impact_search("wave 1 structural fixes shipped")
```
