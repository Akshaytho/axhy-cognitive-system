---
name: Axhy Brain — self-improving AI memory system
description: What axhy brain IS (AI that remembers + improves every session), how it works (vector DB + audit + learnings), and the correct commands. "start axhy brain" = brain:build, NOT audit.
type: reference
originSessionId: c3bef54a-22e9-47b2-859c-ada004fb2a17
---
## What is Axhy Brain?

Axhy Brain is the system that makes the AI **remember across sessions and get smarter with every mistake**. Claude's context window has hard limits — in a project this size (1,286 files, 60K master plan, 12 locked docs), older instructions compress away mid-session. Axhy Brain solves this by storing knowledge in pgvector (PostgreSQL vector DB) so any session can search it semantically.

It is the backbone of the **self-reasoning protocol** (`axhy-v3/docs/protocols/self-reasoning.md`). Before writing any code, Claude runs `impactCheck("what I'm about to do")` — the brain searches its vector DB and returns:
- **hardBlocks** — locked constraints that STOP the work until founder decides
- **staleChunks** — docs that may be outdated, verify against current code first
- **relevantContext** — specs, learnings, ADRs that inform the decision

Without the brain running, `impactCheck()` and `vectorSearch()` return empty — the AI loses its memory and can silently repeat past mistakes.

## What's in the brain?

The brain embeds these docs into pgvector (`axhy_brain.chunks` table):
- **Locked docs** (`docs/locked/`) — 12+ constitutional docs (chat rules, abuse prevention, code standards, etc.)
- **Specs** (`docs/specs/`) — design documents (vector RAG spec, redis spec, etc.)
- **Learnings** (`docs/learnings/`) — self-written lessons from past mistakes, each with detection patterns
- **ADRs** (`docs/adrs/`) — architecture decision records
- **Protocols** (`docs/protocols/`) — self-reasoning, doc-discipline, etc.

Each doc gets a vector embedding + persona tag + metadata. Semantic search finds the right context even when the exact words don't match.

## Two halves of the system

| Half | What it does | Needs DB? |
|---|---|---|
| **brain:build** (vector DB) | Embeds docs into pgvector. Powers `impactCheck()` + `vectorSearch()`. The AI's long-term memory. | Yes — Railway Postgres |
| **audit** (session health) | Runs local grep checks from learning patterns. Catches known violations before code ships. The AI's immune system. | No — filesystem only |

Both halves work together: learnings written by audit failures get embedded by brain:build, so future sessions find them via impactCheck before the same mistake repeats.

## Commands

| User says | Command | What it does |
|---|---|---|
| "start axhy brain" / "turn on axhy brain" / "build brain" / "update brain" / "embed brain" | See brain:build command below | Embeds all docs into pgvector with real OpenAI embeddings. Run when new docs added. ~46 min with field fanout. |
| (automatic on session start per CLAUDE.md) | `pnpm --filter @axhy/ai-tools run audit` | Local grep checks. Runs automatically. ~5s. |
| "compact brain" | `pnpm --filter @axhy/ai-tools brain:compact` | Compresses old/duplicate chunks |
| "seed locked docs" | `pnpm --filter @axhy/ai-tools brain:lock-seed` | Seeds locked doc embeddings specifically |

**Critical:** When user says "start axhy brain", run `brain:build` via Railway — NOT `audit`. Audit is separate and automatic.

## The correct brain:build command

```bash
export $(grep OPENAI_API_KEY /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/.env.local) && \
  FIELD_FANOUT_ENABLED=true railway run --service Postgres -- \
  pnpm --filter @axhy/ai-tools brain:build
```

This command requires THREE things:
1. **OPENAI_API_KEY** from `apps/backend/.env.local` — for real OpenAI embeddings
2. **DATABASE_PUBLIC_URL** from Railway Postgres service (`--service Postgres`) — for external DB access
3. **FIELD_FANOUT_ENABLED=true** — splits docs into section-level embeddings for precise retrieval

**Why all three are required:**
- Railway Postgres service gives `DATABASE_PUBLIC_URL` (external hostname) but does NOT have `OPENAI_API_KEY`
- Railway default service has `OPENAI_API_KEY` but its `DATABASE_URL` uses `postgres.railway.internal` (internal-only, unreachable from local)
- Without `FIELD_FANOUT_ENABLED`, large docs (like Enterprise Production Standard) are embedded as one averaged vector, too vague for specific queries
- You must source from BOTH services + enable field fanout

## DANGER: Fake embeddings (Phase 0 discovery, 2026-05-26)

If `OPENAI_API_KEY` is missing from the environment, the `embed()` function in `brain-builder.ts` (line 118) **silently falls back to PRNG-based fake vectors**. These are deterministic hashes, NOT semantic embeddings. The brain will appear to work (entries are created, no errors) but retrieval is random noise — cosine similarity between any two texts is ~0.08 (essentially zero).

**This is not hypothetical.** Before 2026-05-26, every brain:build ran with `railway run --service Postgres` which lacked the API key. All embeddings were fake. Tests that passed were passing by keyword coincidence in random top-10 results, not semantic retrieval.

**How to verify real embeddings:** Run the retrieval quality tests:
```bash
export $(grep OPENAI_API_KEY /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/.env.local) && \
  cd /Users/thotaakshay/eclean_workspace/axhy-cognitive-system && \
  railway run --service Postgres -- \
  /Users/thotaakshay/eclean_workspace/axhy-v3/packages/ai-tools/node_modules/.bin/tsx \
  --test tests/retrieval-quality.test.mjs
```
All 15 tests must pass. If any fail, the brain may have fake embeddings.

## Why `railway run --service Postgres` is mandatory

The database URL uses `postgres.railway.internal` — an internal DNS name that **only resolves inside Railway's network**. Your laptop is outside that network.

- `railway run --service Postgres -- pnpm ...brain:build` → gets `DATABASE_PUBLIC_URL` (external hostname). **Works.**
- `railway run -- pnpm ...brain:build` → gets `DATABASE_URL` with internal hostname → **DNS fails from local.**
- `pnpm ...brain:build` (no prefix) → no DB URL at all → **fails silently.**

If `railway` CLI is not in PATH, use the full path: `~/.railway/bin/railway run -- ...`
If `pnpm` is not in PATH, use: `/Users/thotaakshay/.nvm/versions/node/v20.20.1/bin/npx pnpm ...`

**When brain:build fails with DNS/connection errors:** do NOT skip it and proceed. Surface it to the founder. The brain powers impactCheck() — without it, the AI loses its memory of locked constraints and past mistakes.

## How the brain improves itself — the simple version

```
Session starts --> audit loads learnings from past sessions
    |
Claude Code writes code
    |
Pre-commit hook runs 4-phase audit against locked docs + learned rules
    |
If BLOCKER or HIGH violations found --> BLOCK commit (MEDIUM passes through)
    |
Claude Code must:
  1. Fix the violations
  2. Write WHY it broke the rule (root cause)
  3. Generate a new learning rule with check_pattern to prevent it next time
    |
Commit-msg hook validates: "Learning:" in message + check_pattern exists
    + anti-gaming: pattern must match 1-30 real files (0 = fake, 50+ = too broad)
    |
New rule gets committed to docs/learnings/
    |
Post-commit hook runs brain:build in background (only if DATABASE_URL is set)
    |
Next session's impactCheck surfaces it via vector similarity BEFORE same mistake
    |
System gets smarter every session
```

## The full loop (verified against actual hooks 2026-05-20)

```
Session N: Claude Code writes code that breaks a rule
    |
    +-- PRE-COMMIT HOOK (4 guards in sequence):
    |   |
    |   +-- 1. LOCKED DOC GUARD
    |   |   If docs/locked/*.md staged --> requires AXHY_FOUNDER_APPROVED=1
    |   |   Modified locked docs also need "## Amendment YYYY-MM-DD" section
    |   |
    |   +-- 2. SESSION AUDIT (session-audit.ts) — 4 phases:
    |   |   Phase 0: learning digest — prints past learnings + hot spots
    |   |            2+ breaks = REPEAT, 3+ breaks = CHRONIC
    |   |   Phase 1: structural checks (locked docs exist, no TODO/any/empty-catch,
    |   |            schema integrity, route auth, tenant isolation)
    |   |   Phase 2: compliance checks (chat behavior rules, decision flow,
    |   |            route layer completeness, operational invariants,
    |   |            security gaps, rule hierarchy, abuse prevention)
    |   |   Phase 3: learned checks — runs each learning's check_pattern
    |   |            as a LIVE GREP against check_paths
    |   |            Breadth guard: 20+ hits = pattern too broad, skipped
    |   |   Phase 4: integrity checks (anti-gaming):
    |   |            - Skip comment budget: >15 audit-ok comments = BLOCKER
    |   |            - Dead pattern detection: check_expect=exists but 0 matches
    |   |            - Comment-keyword gaming: audit keywords in comments not code
    |   |
    |   |   EXIT CODES:
    |   |     BLOCKER or HIGH found --> exit 1 --> COMMIT BLOCKED
    |   |     MEDIUM or LOW only --> exit 0 --> commit proceeds
    |   |     Emergency override: AXHY_AUDIT_EMERGENCY=1 skips audit (logged)
    |   |
    |   +-- 3. TARGETED LEARNING WARNINGS
    |   |   For each staged file, checks if any learning's check_paths
    |   |   matches it --> prints warning with the broken_rule
    |   |   (informational, does not block)
    |   |
    |   +-- 4. HANDOFF AUTO-REGEN
    |       If canonical handoff sources staged --> runs handoff:build
    |       and stages regenerated outputs
    |
    +-- Claude Code FIXES the violation
    +-- Claude Code WRITES a learning in docs/learnings/
    |   with check_pattern + check_paths + check_expect in frontmatter
    |
    +-- COMMIT-MSG HOOK validates:
    |   1. Message contains "Learning:" or "Broke rule:" (if learning files staged)
    |   2. Every learning has check_pattern in frontmatter (no detection = blocked)
    |   3. Anti-gaming: pattern must match 1-30 files in check_paths
    |      0 matches = fake pattern --> BLOCKED
    |      30+ matches = too broad --> WARNING
    |
    +-- POST-COMMIT HOOK (background, non-blocking):
    |   Only runs if DATABASE_URL / DATABASE_PUBLIC_URL / AXHY_DB_URL is set
    |   1. graph:build (knowledge graph refresh)
    |   2. brain:build (learning gets embedded with persona tag into pgvector)
    |
    +-- PRE-PUSH HOOK (defense in depth, blocks push):
        1. Graph audit — orphans or dead-links --> blocks push
        2. Full session-audit rerun — catches --no-verify commits
        3. Diff-based gaming detection:
           - >5 new audit-skip comments in push diff --> BLOCKED
           - >3 new comments containing audit keywords --> WARNING
           (Claude controls what it writes but can't hide it from the diff)

Session N+1: new session starts
    |
    +-- AUDIT Phase 0: "1 learning from past sessions"
    |   Shows: what rule, what persona, root cause
    |   Hot spots highlighted if rule broken 2+ times
    |
    +-- AUDIT Phase 3: runs the learning's check_pattern
    |   as a LIVE GREP CHECK against the codebase
    |   If same mistake exists --> severity depends on history:
    |     Normal: MEDIUM (passes through, fix when touching related code)
    |     Chronic (3+ breaks): HIGH (blocks commit)
    |     NOTE: learned checks cap at HIGH — only hardcoded invariants
    |           (Policy append-only, AuditEvent immutable) can be BLOCKER
    |
    +-- impactCheck() finds the learning via vector similarity
    |   similarity >= 0.5 + locked + hard category --> HARD BLOCK
    |   similarity >= 0.4 + unlocked + soft category --> SOFT WARNING
    |   any stale chunks --> flagged separately (don't trust until re-embedded)
    |
    +-- The audit is now SMARTER than Session N's audit

Session N+5: same rule broken 3+ times
    |
    +-- HOT SPOT detected: "CHRONIC — broken 3x"
    +-- Severity escalates: MEDIUM --> HIGH (blocks commits)
    +-- 20+ learnings: COMPACT RECOMMENDED (brain:compact merges duplicates)
```

The brain never forgets. Learnings accumulate. The AI improves with every session, independent of Claude's context window.

## Key files

- Brain builder: `packages/ai-tools/src/brain-builder.ts`
- Session audit: `packages/ai-tools/src/session-audit.ts`
- Vector search: `packages/ai-tools/src/vector-knowledge.ts`
- Self-reasoning protocol: `docs/protocols/self-reasoning.md`
- Learnings folder: `docs/learnings/` (7 active as of 2026-05-20)
- Locked docs: `docs/locked/` (12+ constitutional docs)
