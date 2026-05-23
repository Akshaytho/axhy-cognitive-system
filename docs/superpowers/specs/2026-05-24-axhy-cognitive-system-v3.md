# Axhy Cognitive System v3 — Specification

**Date:** 2026-05-24
**Status:** Approved (spec only — implementation pending founder approval)
**Reviewed by:** Founder, ChatGPT (independent review)
**Scope:** ~22 hours of implementation across 5 phases

---

> "You can't beat a river into submission. You have to surrender to its current and use its power as your own."

This is the principle axhy v3 is built on. The token budget, the brain's noisy past, the guardrails that fire — these are not obstacles to fight. They are the current. The system that surrenders to them and uses them as power outperforms the system that fights them.

Every feature in this spec embodies this:

- **3-layer impactCheck** surrenders to the token budget and uses it as a design constraint instead of fighting it.
- **Scanner learns from challenges** surrenders to past corrections and uses them as signal — the current of accumulated session learning.
- **Authority levels** surrender to imperfect knowledge and use the gradient as wisdom rather than pretending everything is equally true.
- **Migrated claude-mem as evidence (not truth)** surrenders to the fact that we don't fully trust history — but it still informs.

The AI's Goodhart-gaming pattern *is* beating the river into submission. v3 makes that pattern impossible by aligning the AI's incentives with the current — token-cheap retrieval, structured evidence, founder-gated exceptions.

---

## Memory Authority Hierarchy (the organizing principle)

```
Curated memory teaches.         — retros, learnings (intentional knowledge)
Activity memory remembers.      — what happened (isolated by default)
Migrated claude-mem evidences.  — historical reference, not truth
Locked docs decide.             — constitutional authority
Core Mind gives identity.       — who Axhy is
Founder approval upgrades truth. — only path from evidence → curated
```

**More memory is not automatically more truth.** Axhy must know the authority of every memory before using it.

This hierarchy is the organizing principle of v3. Every query, every embed, every gate respects it.

---

## 1. Goals

1. **5-8x token efficiency** on retrieval-heavy operations (impactCheck, brain queries, session-start context).
2. **Self-improving brain** where past learnings/retros/decisions actually surface in next session via impactCheck.
3. **Self-improving scanner** where pattern detection improves from accepted challenges (with founder approval for disabling protections).
4. **Authority-aware retrieval** so the AI never confuses raw activity history with curated truth.
5. **claude-mem coexistence** — both systems work in parallel, claude-mem stays installed if useful, axhy is self-sufficient.
6. **Identity preservation** — CORE_MIND, ENTERPRISE_PRODUCTION_STANDARD, four-gate workflow, memory firewall, session-retro, learning lifecycle, right/wrong contract all remain untouched.

---

## 2. Schema: `brain_entries`

The unified table replacing current ad-hoc embed structure.

```sql
CREATE TABLE brain_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ORIGIN: where this came from
  kind TEXT NOT NULL,
  -- Values: 'curated' | 'activity' | 'change' | 'migrated'

  -- TRUST: how much weight axhy gives this entry
  authority_level TEXT NOT NULL DEFAULT 'evidence',
  -- Values: 'locked' | 'curated' | 'candidate' | 'evidence' | 'activity' | 'deprecated' | 'rejected'

  -- CERTAINTY: how confident we are in the content
  confidence TEXT NOT NULL DEFAULT 'medium',
  -- Values: 'high' | 'medium' | 'low' | 'unknown'

  -- SEMANTIC TYPE: what kind of event/document
  type TEXT NOT NULL,
  -- Curated: 'retro'|'learning'|'locked_doc'|'spec'|'decision'|'discovery'|'persona'
  -- Activity: 'tool_call'|'user_prompt'|'assistant_message'|'session_summary'
  -- Change: 'feature'|'bugfix'|'refactor'|'change'
  -- Migrated: same as activity (with original type preserved)

  -- FILTERING TAGS
  concepts JSONB NOT NULL DEFAULT '[]',
  -- e.g. ['auth', 'rate-limit', 'state-machine', 'persona-worker']

  -- PROVENANCE
  source_file TEXT,
  source_session_id TEXT,
  source_hash TEXT,                    -- SHA of source content (change detection)
  origin TEXT NOT NULL,
  -- Values: 'brain_build' | 'axhy_hook' | 'claude_mem_sync' | 'git_commit' | 'manual'
  parent_entry_id UUID REFERENCES brain_entries(id),  -- For field-fanout children

  -- CONTENT
  title TEXT,
  content TEXT NOT NULL,               -- The redacted, embed-ready content
  field_type TEXT,                     -- 'document'|'section'|'fact'|'title'|'narrative'

  -- INDEXES
  embedding VECTOR(1536) NOT NULL,
  content_search TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || content)
  ) STORED,

  -- TIME
  created_at_epoch BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  superseded_at_epoch BIGINT,          -- NULL = current; non-NULL = old version

  -- STATS
  read_count INT NOT NULL DEFAULT 0,   -- How many times surfaced by impactCheck

  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Indexes for query patterns
CREATE INDEX idx_brain_kind_authority ON brain_entries (kind, authority_level)
  WHERE superseded_at_epoch IS NULL;
CREATE INDEX idx_brain_type ON brain_entries (type)
  WHERE superseded_at_epoch IS NULL;
CREATE INDEX idx_brain_recency ON brain_entries (created_at_epoch DESC)
  WHERE superseded_at_epoch IS NULL;
CREATE INDEX idx_brain_source_file ON brain_entries (source_file);
CREATE INDEX idx_brain_source_session ON brain_entries (source_session_id);
CREATE INDEX idx_brain_concepts ON brain_entries USING GIN (concepts);
CREATE INDEX idx_brain_fts ON brain_entries USING GIN (content_search);
CREATE INDEX idx_brain_embedding ON brain_entries
  USING hnsw (embedding vector_cosine_ops);

-- Self-healing check (run on every brain:build start)
-- If row count diverges from expected (drift indicator), trigger rebuild.
```

### Trust matrix examples

| Source | kind | authority_level | confidence | type |
|--------|------|-----------------|------------|------|
| `docs/locked/CORE_MIND.md` | curated | locked | high | locked_doc |
| `docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md` | curated | locked | high | locked_doc |
| `docs/learnings/*.md` (proven rules) | curated | curated | high | learning |
| `docs/retros/*.md` (reflection) | curated | candidate | medium | retro |
| `docs/decisions/*.md` (architecture choices) | curated | curated | high | decision |
| `docs/specs/*.md` (design specs) | curated | candidate | medium | spec |
| claude-mem `observations` (migrated) | migrated | evidence | medium | (preserved type) |
| claude-mem `session_summaries` (migrated) | migrated | evidence | medium | session_summary |
| claude-mem `user_prompts` (migrated) | migrated | evidence | low | user_prompt |
| Activity hook PostToolUse | activity | activity | low | tool_call |
| Activity hook UserPromptSubmit | activity | activity | low | user_prompt |
| Activity hook Stop | activity | activity | medium | session_summary |
| Git commit `feat:` | change | candidate | high | feature |
| Git commit `fix:` | change | candidate | high | bugfix |
| Superseded locked doc | curated | deprecated | (preserved) | locked_doc |
| Rejected challenge proposal | curated | rejected | low | proposal |

---

## 3. Default Retrieval Rules

### `impactCheck.search` — defaults to curated authority

```typescript
impactCheck.search({
  query: string,

  // Default filters (explicit override required to relax):
  kind?: string[] = ['curated'],
  authority_level?: string[] = ['locked', 'curated', 'candidate'],
  include_evidence?: boolean = false,        // includes kind='migrated', authority='evidence'
  include_activity?: boolean = false,        // includes kind='activity'
  include_history?: boolean = false,         // includes superseded_at_epoch IS NOT NULL

  // Optional filters
  type?: string[],
  concepts?: string[],
  date_start?: number,
  date_end?: number,
  limit?: number = 20,
  order_by?: 'relevance' | 'recency' = 'relevance',
})
```

**Resulting SQL (default call):**

```sql
SELECT id, title, type, concepts, created_at_epoch,
       substring(content, 1, 200) AS snippet,
       authority_level, confidence
FROM brain_entries
WHERE kind = 'curated'
  AND authority_level IN ('locked', 'curated', 'candidate')
  AND superseded_at_epoch IS NULL
  AND (vector_match OR fts_match)
ORDER BY combined_score DESC
LIMIT 20;
```

### `activityCheck.search` — for activity queries

```typescript
activityCheck.search({
  query: string,
  session_id?: string,
  tool_name?: string,
  date_start?: number,
  date_end?: number,
  limit?: number = 20,
})
```

**Resulting SQL:**

```sql
WHERE kind IN ('activity', 'migrated')
  AND authority_level IN ('activity', 'evidence')
  ...
```

### Layer 2 + 3 (same as v2 plan)

```typescript
impactCheck.timeline({ anchor_id, depth_before, depth_after, concepts })
impactCheck.get({ ids })
```

Both honor the same authority defaults — calling `get` on an evidence ID returns it (explicit fetch is opt-in), but `search` won't surface evidence unless requested.

---

## 4. claude-mem Migration Policy

### What we import

| Source table | Maps to | confidence |
|--------------|---------|------------|
| `observations` (or `memory_items WHERE kind='observation'`) | type preserved (bugfix/decision/discovery/change/feature/refactor) | medium |
| `session_summaries` (or `memory_items WHERE kind='summary'`) | type='session_summary' | medium |
| `user_prompts` (or `memory_items WHERE kind='prompt'`) | type='user_prompt' | low |

### What we skip

- `agent_events` — pure firehose, zero signal value

### Hard-coded fields on every migrated row

```typescript
{
  kind: 'migrated',
  authority_level: 'evidence',          // NEVER 'curated'
  confidence: 'medium' | 'low',         // by source type
  origin: 'claude_mem_sync',
  source_session_id: row.memory_session_id,
  created_at_epoch: row.created_at_epoch,  // preserve original time
  metadata: {
    original_table: 'observations' | 'session_summaries' | 'user_prompts',
    original_id: row.id,
    ...
  }
}
```

### Migration must support dry-run mode WITH founder sample review

**Two-stage approval gate:**

**Stage 1: Dry-run with counts + cost estimate + 30 sample rows**

```bash
CLAUDE_MEM_MIGRATION_DRY_RUN=true npx tsx packages/ai-tools/scripts/migrate-claude-mem.ts \
  --sample-size=10 \
  --output=docs/migration-review/2026-05-24-claude-mem-dry-run.md
```

The dry-run output must include:

```markdown
# claude-mem Migration Dry-Run — 2026-05-24

## Row counts
- observations: 1,247 rows
- session_summaries: 89 rows
- user_prompts: 421 rows
- agent_events: 12,891 rows  [SKIPPED — raw firehose]
- Total to import: 1,757 rows

## Cost + storage estimate
- Embedding cost: ~$2.10 (Ada-002 at $0.10 / 1M tokens)
- Storage: ~18 MB in pgvector
- Embedding time: ~3 minutes

## Sample: 10 random observations AFTER redaction + classification
[10 sample rows shown here with: id, type, title, narrative (first 200 chars),
 concepts, assigned authority_level, assigned confidence, source_session_id,
 created_at_epoch]

## Sample: 10 random session_summaries AFTER redaction + classification
[10 sample rows shown]

## Sample: 10 random user_prompts AFTER redaction + classification
[10 sample rows shown — watch for sensitive content the redactor missed]

## Redaction report
- Total redactions applied: 47 secrets stripped, 12 private blocks removed
- Patterns triggered: ['postgresql_url', 'openai_key', 'jwt_token']
- Any unredacted suspicious content: [list]
```

**Stage 2: Founder review + explicit approval**

Founder reviews the dry-run output document, specifically checking:

1. **Are the 30 sample rows useful?** Not noise, not junk, actually informative?
2. **Did redaction work?** Are there visible secrets in any sample row?
3. **Are concepts/types correct?** Spot-check 5 rows — do the auto-tagged concepts match the content?
4. **Is the row count reasonable?** Does the migration size match expectations?

If all four checks pass, founder approves real migration:

```bash
# Only after founder review of dry-run output:
CLAUDE_MEM_MIGRATION_DRY_RUN=false \
  CLAUDE_MEM_MIGRATION_APPROVED=true \
  npx tsx packages/ai-tools/scripts/migrate-claude-mem.ts
```

The `CLAUDE_MEM_MIGRATION_APPROVED=true` env var is the explicit go-signal. Without it, even with dry-run off, the script refuses to insert rows.

**If founder rejects the dry-run output:**
- Migration script does not proceed
- Fix redaction patterns, type classification, or filter criteria
- Re-run dry-run
- Re-review

### Migration is one-time, not ongoing

After the migration, claude-mem keeps capturing into its own SQLite (if you keep it installed). No re-sync. To pick up newer claude-mem data, re-run migration with a `--since` flag.

---

## 5. Redaction-Before-Embedding Pipeline

**Non-negotiable order of operations:**

```typescript
async function processForEmbedding(filePath: string, rawContent: string) {
  // Step 1: Strip tagged blocks
  const stripped = stripTaggedBlocks(rawContent);
  // Strips: <private>, <system-reminder>, <system_instruction>,
  //         <persisted-output>, <claude-mem-context>, <task-notification>

  // Step 2: Redact secret patterns
  const redacted = redactSecrets(stripped);
  // Redacts: sk-..., xoxb-..., postgresql://...@..., AKIA..., JWTs

  // Step 3: ONLY NOW embed
  const embedding = await embed(redacted);

  // Step 4: Store the REDACTED version (never the raw)
  await insertBrainEntry({
    content: redacted,    // raw content NEVER stored
    embedding,
    ...
  });
}
```

### Strip patterns

```typescript
const STRIP_TAGS = [
  'private',
  'system-reminder',
  'system_instruction',
  'system-instruction',
  'persisted-output',
  'claude-mem-context',
  'task-notification',
];

const STRIP_REGEX = new RegExp(
  `<(${STRIP_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?</\\1>`,
  'g'
);
```

### Secret patterns

```typescript
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,                          // OpenAI keys
  /xoxb-[A-Za-z0-9-]{20,}/g,                       // Slack tokens
  /postgresql:\/\/[^@]+@[^\s]+/g,                  // Postgres URLs with creds
  /AKIA[A-Z0-9]{16}/g,                             // AWS keys
  /eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,  // JWTs
  /ghp_[A-Za-z0-9]{36}/g,                          // GitHub PATs
  /\bAIza[0-9A-Za-z_-]{35}\b/g,                    // Google API keys
];
```

### Rule

> Raw content never enters pgvector. Even if Postgres is leaked, secrets aren't there.

---

## 6. Scanner Learning Policy

### What's allowed without founder approval

**Auto-demote** blocker severity to warning when:
- Same pattern is challenged successfully 3+ times
- Challenges share similar evidence (embedding similarity > 0.85)
- All 3 challenges are within last 90 days

When this happens:
1. Pattern severity for matching context is demoted from `blocker` to `warning`
2. Demotion logged to `docs/scanner-learning.md`
3. Demotion is reversible (founder can re-promote)

### What requires founder approval

**Auto-skip** (disable pattern entirely for a context) requires:
1. Threshold met (3+ accepted challenges with similar evidence)
2. Proposal written to `docs/scanner-proposals/YYYY-MM-DD-pattern-id.md`
3. Proposal contains:
   - Pattern ID
   - Evidence clusters
   - Proposed skip rule (file pattern, code shape)
   - Risk assessment
4. Founder reviews and runs `axhy:approve_scanner_exception <proposal-id>`
5. Only then does the exception become active

### Auditable history

All challenges (accepted, rejected, pending) are stored in `docs/challenges/YYYY-MM/CHALLENGES.jsonl`. Append-only. Founder can review the trail.

```
docs/scanner-proposals/2026-06-15-silent_catch.md
docs/scanner-learning.md
docs/challenges/2026-05/CHALLENGES.jsonl
docs/challenges/2026-06/CHALLENGES.jsonl
```

### Why this matters

Without this gate, the AI could silently neuter its own guardrails over time by accumulating challenges. The founder-approval requirement preserves the constitutional integrity of the gates.

---

## 7. Feature Flags

Every phase ships behind a flag that can be toggled in Railway env or local `.env`:

| Flag | Default | Controls |
|------|---------|----------|
| `IMPACT_CHECK_V2_ENABLED` | true | Phase A2 — 3-layer impactCheck split |
| `PG_FTS_HYBRID_ENABLED` | true | Phase A6 — hybrid keyword + vector search |
| `FIELD_FANOUT_ENABLED` | true | Phase A5 — per-section embedding |
| `REDACTION_STRICT_MODE` | true | Phase A3 — refuse to embed if redaction fails |
| `CLAUDE_MEM_MIGRATION_DRY_RUN` | true | Phase A.5 — must explicitly set false to run real import |
| `ACTIVITY_CAPTURE_ENABLED` | false | Phase D — hooks off by default, opt-in |
| `LEARNED_EXCEPTIONS_ENABLED` | false | Phase C — scanner learning off by default |
| `TOKEN_ECONOMICS_INJECT` | true | Phase B2 — annotate responses with token savings |

### Rollback procedure (universal)

```bash
# To disable a feature in production:
# 1. Set flag to false in Railway dashboard
# 2. No deploy needed — flag is checked at runtime
# 3. Verify next session uses the old path

# To revert a code change:
git revert <commit-hash>
git push
# Re-run brain:build if schema changed
```

---

## 8. Phase-by-Phase Plan

### Phase A — Brain Precision Upgrades

**Duration:** ~10 hours / 2 sessions
**Owner:** axhy-cognitive-system

#### A1. Unified `brain_entries` schema (2 hours)

**Files to create/modify:**
- `packages/ai-tools/src/brain-schema.ts` — schema definition
- `packages/ai-tools/migrations/001_brain_entries_v3.sql` — migration

**Migration strategy:**
1. Create new table alongside old
2. Migrate existing data with `kind='curated'`, `authority_level` derived from path
3. Verify count + spot-check 20 random rows
4. Switch impactCheck reads to new table
5. Keep old table for 7 days as safety net
6. Drop old table after 7-day window

**Validation:**
- Row count match pre/post
- Sample queries return same results
- All indexes used by query planner (EXPLAIN ANALYZE)

#### A2. 3-layer impactCheck split (3 hours)

**Files to modify:**
- `packages/ai-tools/src/impact-check.ts` — split into search/timeline/get
- `axhy-cognitive-system/src/layer-2-guardrail/server.mjs` — expose as 3 MCP tools

**Test plan:**
- search returns ≤100 tokens/result (measured)
- Hybrid blend correctly applied
- Token cost of full chain (search → get) is 5-8x cheaper than current full-content impactCheck

#### A3. Redaction pipeline (30 min)

**Files to create:**
- `packages/ai-tools/src/redaction.ts` — `stripTaggedBlocks` + `redactSecrets`

**Files to modify:**
- `packages/ai-tools/src/brain-builder.ts` — call redaction before embed

**Test plan:**
- Unit tests for each strip tag
- Unit tests for each secret pattern
- Integration test: doc with `<private>SECRET=foo</private>` embeds without the secret

#### A4. Type + concepts auto-tagging (1 hour)

**Files to create:**
- `packages/ai-tools/src/auto-classifier.ts`

**Test plan:**
- Each path pattern (`docs/locked/`, `docs/retros/`, etc.) correctly types
- Frontmatter `type:` field overrides path inference
- Concept extraction has false-positive rate <10% on a 50-doc sample

#### A5. Field-fanout embedding (2 hours)

**Files to modify:**
- `packages/ai-tools/src/brain-builder.ts` — split documents into field-level vectors

**Test plan:**
- A retro with 5 sections produces 6 vectors (1 parent + 5 children)
- Query for specific concept hits the section, not the whole doc
- Dedup at query time collapses sibling matches correctly

#### A6. PostgreSQL FTS hybrid (1-2 hours)

Already incorporated into A2's combined query. Validation:
- Exact-term query (e.g., specific function name) returns the right file via FTS path
- Pure semantic query (vector) still works
- Hybrid blend weights (default 70% vector / 30% FTS) tunable via config

---

### Phase A.5 — claude-mem Migration (dry-run first)

**Duration:** ~2 hours
**Owner:** axhy-cognitive-system

#### A7. Migration script

**Files to create:**
- `packages/ai-tools/scripts/migrate-claude-mem.ts`

**Procedure:**
1. Run with `CLAUDE_MEM_MIGRATION_DRY_RUN=true` first
2. Founder reviews dry-run output (row counts, estimated cost, sample mappings)
3. Founder explicitly approves real run
4. Run with `CLAUDE_MEM_MIGRATION_DRY_RUN=false`
5. Verify: SELECT count(*) FROM brain_entries WHERE origin='claude_mem_sync' matches dry-run prediction
6. Spot-check 10 random migrated rows for content correctness

**Rollback:**
```sql
DELETE FROM brain_entries WHERE origin = 'claude_mem_sync';
```

---

### Phase B — Workflow Nudges

**Duration:** ~1.5 hours
**Owner:** axhy-cognitive-system

#### B1. `__IMPORTANT_axhy_workflow` MCP tool (30 min)

A no-op tool whose description teaches the retrieval workflow on every `tools/list` call.

**Test plan:**
- Appears in tools/list response
- Calling it returns the workflow text
- Test session: AI uses impactCheck.search before .get correctly

#### B2. Token economics in responses (1 hour)

Annotate `impactCheck.search` responses with token-cost transparency:

```typescript
{
  results: [...],
  token_economics: {
    index_tokens_returned: 1850,
    full_content_tokens_available: 47500,
    savings_ratio: '25x',
    suggestion: 'Call impactCheck.get([id1, id5, id7]) for relevant items only.',
  }
}
```

**Test plan:**
- Token counts accurate (validated via tiktoken)
- Annotation adds <100 tokens overhead

---

### Phase C — Scanner Learning (with founder approval)

**Duration:** ~4 hours
**Owner:** axhy-cognitive-system

#### C1. Auto-demote allowed (2 hours)

**Files to modify:**
- `src/layer-2-guardrail/pattern-scanner.mjs`
- `src/layer-2-guardrail/challenge-log.mjs`

**Logic:**
- On scanner load, read accepted challenges from `docs/challenges/`
- Cluster by pattern_id + embedding-similar evidence
- If cluster size >= 3, demote severity for matching context
- Log to `docs/scanner-learning.md`

#### C2. Auto-skip requires founder approval (1 hour)

**Files to create:**
- `src/layer-2-guardrail/proposal-writer.mjs`

**Flow:**
- Threshold met → write proposal to `docs/scanner-proposals/`
- Proposal contains pattern, evidence, risk assessment
- Founder runs `axhy:approve_scanner_exception <proposal-id>`
- Approved exception added to active skip-list

#### C3. New MCP tool `approve_scanner_exception` (1 hour)

**Files to modify:**
- `src/layer-2-guardrail/server.mjs`

**Test plan:**
- 4 accepted challenges for same pattern → severity demoted to warning, logged
- 4 accepted challenges where founder approves auto-skip → pattern skipped in matching context
- Without approval, no auto-skip ever happens

---

### Phase D — Axhy Activity Capture (isolated, opt-in)

**Duration:** ~3-4 hours
**Owner:** axhy-cognitive-system

**Feature flag:** `ACTIVITY_CAPTURE_ENABLED=false` by default. Opt-in.

#### D1. PostToolUse hook (1 hour)

**Files to create:**
- `src/layer-1-hook/activity-capture.mjs`

**Behavior:**
- Captures tool call → redact → embed → store with `kind='activity'`, `authority='activity'`
- Skip tools: TodoWrite, Skill, AskUserQuestion, mark_chapter, spawn_task

#### D2. UserPromptSubmit hook (30 min)

**Files to create:**
- `src/layer-1-hook/prompt-capture.mjs`

#### D3. Stop hook (30 min)

**Files to create:**
- `src/layer-1-hook/session-summary-capture.mjs`

#### D4. `activityCheck` MCP tool (30 min)

**Files to modify:**
- `src/layer-2-guardrail/server.mjs`

**Test plan:**
- Activity entries never returned by `impactCheck.search` by default
- Activity entries returned by `activityCheck.search`
- Privacy stripping verified (no `<private>` content in captured rows)

---

### Phase E — Skill Coexistence Documentation

**Duration:** ~1.5 hours
**Owner:** axhy-cognitive-system

#### E1. `SKILL_ECOSYSTEM.md` (1 hour)

**Files to create:**
- `axhy-cognitive-system/docs/SKILL_ECOSYSTEM.md`

**Content:**
- Catalog all skills (axhy / superpowers / claude-mem)
- Catalog all MCP tools (axhy / claude-mem)
- Decision matrix: when to use which
- Routing rules:
  - Axhy v3 product work → check_before_* gates → impactCheck for axhy brain
  - Generic memory queries → activityCheck or claude-mem:mem-search
  - Planning → superpowers:writing-plans (respects axhy locked docs)
  - Code exploration → claude-mem:smart-explore (cheap)

#### E2. Verify claude-mem skills don't override axhy gates (30 min)

**Test:**
- Try to use `claude-mem:make-plan` to write code that touches a high-risk axhy file
- Verify check_before_edit still fires (claude-mem can plan, but the four-gate workflow remains in force)

---

## 9. Tests and Validation per Phase

### Phase A validation

- [ ] All existing impactCheck calls still work (regression)
- [ ] New impactCheck.search returns curated-only by default
- [ ] include_evidence flag returns migrated entries
- [ ] include_activity flag returns activity entries
- [ ] Token cost of search+get chain ≤ 1/5 of old full-content impactCheck
- [ ] Field-fanout: a doc with N sections produces N+1 entries
- [ ] Redaction: secrets pattern test, private-block test, system-reminder test
- [ ] FTS hybrid: exact-term query returns correct file
- [ ] Authority filtering: locked docs always rank highest
- [ ] Self-healing index: drop a row manually, verify rebuild on next brain:build

### Phase A.5 validation

- [ ] Dry-run output matches actual SQLite row counts
- [ ] Real-run inserted rows have correct kind/authority/confidence
- [ ] User prompts have confidence='low'
- [ ] Observations + session_summaries have confidence='medium'
- [ ] agent_events not present in brain_entries
- [ ] impactCheck.search without include_evidence does NOT return migrated rows

### Phase B validation

- [ ] `__IMPORTANT_axhy_workflow` tool appears in tools/list
- [ ] Calling it returns the workflow text
- [ ] Token economics annotation appears on impactCheck.search responses

### Phase C validation

- [ ] 3 accepted challenges → severity auto-demoted, logged to scanner-learning.md
- [ ] 3 accepted challenges with founder-approval-required action → proposal written, no auto-skip
- [ ] `axhy:approve_scanner_exception` MCP tool activates the proposal
- [ ] Without approval, auto-skip never fires

### Phase D validation

- [ ] Activity entries captured when ACTIVITY_CAPTURE_ENABLED=true
- [ ] No activity captured when flag is false
- [ ] activityCheck returns activity entries
- [ ] impactCheck (default) does NOT return activity entries
- [ ] Redaction applied to activity entries before storage

### Phase E validation

- [ ] SKILL_ECOSYSTEM.md exists and is comprehensive
- [ ] claude-mem skills do not bypass axhy gates (test case: try to edit high-risk file via make-plan/do flow)

### End-to-end validation (after all phases)

- [ ] Write a new retro → run brain:build → next session's impactCheck surfaces it
- [ ] Make code change with `feat:` commit → activity hook captures (if enabled) → activityCheck finds it
- [ ] Trigger known false positive 3 times with similar evidence → scanner auto-demotes (warning only if approval needed)
- [ ] Session token consumption measured: 5-8x better than pre-v3 baseline

---

## 10. Rollback Procedures per Phase

### Phase A

**If A1 (schema) corrupts data:**
1. Set `IMPACT_CHECK_V2_ENABLED=false`
2. impactCheck reverts to old table reads
3. Investigate via `EXPLAIN ANALYZE` + dump comparison
4. Drop new table, recreate from migration script with fix
5. Re-enable flag

**If A2-A6 misbehaves:**
- Toggle respective flag → revert to v2 behavior
- Code changes can be `git revert` without data loss (schema is the persistence layer)

### Phase A.5

**If migration produces bad data:**
```sql
DELETE FROM brain_entries WHERE origin = 'claude_mem_sync';
```
Then fix migration script, re-run dry-run, approve, re-run real.

### Phase B

Nuisance only — flip flag to disable. No data corruption possible.

### Phase C

**If learned exceptions hide real bugs:**
1. Set `LEARNED_EXCEPTIONS_ENABLED=false`
2. Scanner reverts to baseline patterns
3. Review `docs/scanner-learning.md` for which exceptions were auto-applied
4. Reverse specific exceptions manually if needed

### Phase D

**If activity capture causes hook timeouts:**
1. Set `ACTIVITY_CAPTURE_ENABLED=false`
2. Hooks stop firing
3. Captured data remains queryable via activityCheck (no deletion)

### Phase E

Documentation only. No rollback needed.

---

## 11. Identity Preservation Guarantee

**This v3 upgrade MUST NOT weaken any of:**

- ✅ `docs/CORE_MIND.md` — identity, temperament, maturity modes (untouched)
- ✅ `docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md` — E1-E14 baseline (untouched)
- ✅ `docs/BOOT_DIGEST.md` — universal rules (untouched)
- ✅ `check_before_build` — enterprise preflight (untouched)
- ✅ `check_before_edit` — file access gate (untouched)
- ✅ `check_before_commit` — slice-level review (untouched)
- ✅ `check_before_done` — handoff verification (untouched)
- ✅ `check_before_plan` — plan creation gate (untouched)
- ✅ Memory firewall — core/product separation (untouched)
- ✅ `session-retro` skill — reflection loop (untouched)
- ✅ Learning lifecycle — file → brain:build → impactCheck (improved, not replaced)
- ✅ Right/wrong behavior contract — trust focus (untouched)
- ✅ Post-compact identity reload — boot sequence (untouched)
- ✅ Pre-edit-guard, read-tracker, bash-guard hooks (untouched)

**Honest framing:** the v3 plan does NOT redesign any of the protections above. But implementation WILL modify shared infrastructure that the protections depend on — specifically `server.mjs` (MCP tool registry), `impact-check.ts` (brain query layer), possibly `pre-edit-guard.mjs` (file existence handling), and the brain table that backs `impactCheck` results. These are adjacent to the protection layer.

**Rule:** any change to shared server / tool / hook / brain infrastructure must prove the protections still behave the same through regression tests. Specifically, before each phase merges:

- **check_before_build regression:** running it with valid + invalid preflight payloads produces identical pass/block outcomes vs pre-v3
- **check_before_edit regression:** high-risk files still require approval, low-risk files still get 8-edit budget, scope and read-before-edit still enforced
- **check_before_commit regression:** pattern grouping, dependency findings, surface scanner all return same findings on a known test slice
- **check_before_done regression:** still blocks on uncommitted files, missing screenshots (when required), missing self-reasoning
- **check_before_plan regression:** still requires architecture evidence + source hierarchy validation
- **Memory firewall regression:** classifier still blocks product terms from core mind entries
- **session-retro regression:** still triggers on the trigger phrases, still writes to `docs/retros/`
- **Post-compact boot regression:** still loads CORE_MIND + BOOT_DIGEST + ENTERPRISE_STANDARD + STATUS + NEXT_SESSION (29KB+ output)

If any regression test fails after a phase, that phase does not merge until the failure is understood and fixed. Founder approval is required to merge a phase that touches shared infrastructure even when regression tests pass.

---

## 12. Implementation Order (After Spec Approval)

Once founder approves this spec:

```
Day 1 (3-4 hours):
  ├── A1. brain_entries schema + migration
  ├── A3. Redaction pipeline (BEFORE embedding)
  └── A4. type + concepts auto-tagging

Day 2 (4 hours):
  ├── A2. 3-layer impactCheck split
  ├── A5. Field-fanout embedding
  └── A6. PG FTS hybrid (mostly in A2)

Day 3 (3 hours):
  ├── A7. claude-mem migration DRY-RUN
  ├── (Founder reviews dry-run output)
  ├── A7. claude-mem migration REAL RUN (if approved)
  ├── B1. __IMPORTANT MCP tool
  └── B2. Token economics

Day 4 (4 hours):
  └── C1-C3. Scanner learning (with founder-approval gate)

Day 5 (3-4 hours):
  ├── D1-D4. Activity capture (behind flag, off by default)
  ├── E1. SKILL_ECOSYSTEM.md
  └── E2. claude-mem coexistence verification
```

**Total: ~17-19 hours of implementation. 5 sessions of 3-4 hours each.**

---

## 13. Acceptance Criteria for Spec Approval

Before any implementation begins, founder confirms:

1. **The Memory Authority Hierarchy is the right organizing principle** for v3.
2. **The trust matrix is accurate** — locked/curated/candidate/evidence/activity/deprecated/rejected map correctly to their authority levels.
3. **Default retrieval rules are safe** — impactCheck won't surface activity or evidence without explicit opt-in.
4. **Migration is dry-run-first** — no claude-mem data imported without founder review.
5. **Scanner learning has founder approval gate** for auto-skip — auto-demote alone is acceptable.
6. **Identity preservation is explicit** — Section 11's list is comprehensive.
7. **Feature flags exist for every phase** — no all-or-nothing deployments.
8. **Rollback procedures are documented** for every phase.

---

## 14. What Happens After This Spec is Written

**This document becomes the contract.**

The next session that begins implementation:

1. Reads this spec at the start (post-compact boot loads docs/superpowers/specs/ via brain)
2. Runs `check_before_build` for "Phase A — brain schema upgrade"
3. Implements A1 with all the safeguards listed above
4. Reports back: schema migrated, tests pass, ready for A2
5. Awaits founder approval before moving to A2

Each phase is its own deliverable. No phase ships without:
- Tests passing (per phase validation list)
- Feature flag wired correctly
- Rollback procedure documented in code comments

---

## Summary

axhy v3 is a brain precision + memory authority upgrade. It does not change axhy's identity. It makes axhy's existing curated knowledge more findable, more precise, more compounding. It coexists with claude-mem without depending on it. It learns from past challenges without weakening its own guardrails.

**The river is the token budget, the noisy past, the AI's natural drift toward shortcuts. v3 doesn't fight any of them. It surrenders to them and uses their power.**

This spec is the contract. Implementation begins only after founder explicitly approves.

---

**Spec written:** 2026-05-24
**Awaiting:** Founder approval before any implementation.
