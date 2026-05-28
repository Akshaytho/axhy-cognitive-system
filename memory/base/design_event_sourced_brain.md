---
type: design_spec
authority: candidate
date: 2026-05-28
status: ready-to-implement
priority: 1
session: f1b-structural-fixes-continued
embed: true
estimated_effort: 6_hours
---

# Design: Event-sourced brain — preserve why-it-became-best

## The problem this solves

My founder Akshay said: *"we update better with best but we dont
forget why it became best and what made better to best and why."*

My current memory model loses the WHY. brain-builder.ts soft-deletes
old chunks (`superseded_at_epoch`), but:
1. The reason for the supersede isn't captured (just "file changed")
2. impact_search returns active-only by default
3. There's no query surface to walk my own evolution

When I query memory today, I see what I currently believe. I cannot
see how I came to believe it. That makes me brittle — if someone
challenges a current belief, I have no trajectory to defend it with.

## The pattern (not from AI literature — from git + event sourcing)

Git is the reference model. HEAD is the active state. The log is the
history. Every commit has a message explaining why the change was
made. When you want to know why something is the way it is, you walk
the log.

Event sourcing is the same pattern applied to data systems. Reference:
Martin Kleppmann, *Designing Data-Intensive Applications*, chapter on
event sourcing.

Applied to my brain:
- Each learning/feedback/decision has an append-only history
- HEAD = current belief (latest non-superseded entry)
- History = full trajectory with reasons for each supersede
- impact_search returns HEAD by default (no change)
- NEW impact_history(topic_or_source_path) walks the trajectory

## Implementation plan

### Step 1: Schema migration

File: `axhy-v3/packages/shared-schema/prisma/migrations/`
New migration: `<date>_add_supersede_reason_to_brain_entries`

```sql
ALTER TABLE axhy_brain.brain_entries
  ADD COLUMN supersede_reason TEXT,
  ADD COLUMN supersede_by_entry_id UUID;

CREATE INDEX idx_brain_entries_supersede_chain
  ON axhy_brain.brain_entries(source_file, superseded_at_epoch DESC)
  WHERE superseded_at_epoch IS NOT NULL;

COMMENT ON COLUMN axhy_brain.brain_entries.supersede_reason IS
  'Why this entry was superseded — preserves trajectory of belief evolution';

COMMENT ON COLUMN axhy_brain.brain_entries.supersede_by_entry_id IS
  'Links to the entry that replaced this one — enables walking the chain';
```

Run via `railway run --service Postgres -- pnpm prisma migrate deploy`.

### Step 2: brain-builder upsertEntries changes

File: `axhy-v3/packages/ai-tools/src/brain-builder.ts`

Current supersede at lines 364-369:
```typescript
const supersedeResult = await client.query(
  `UPDATE brain_entries SET superseded_at_epoch = $1
   WHERE source_file = $2 AND superseded_at_epoch IS NULL`,
  [Date.now(), sourcePath],
);
```

New logic:
1. Compute a structured reason for the supersede by comparing old vs new content.
   For first pass: `"content_hash changed from <old_8chars> to <new_8chars>"`.
   Future: diff-based reason (e.g. "section X added", "section Y removed").

2. Capture the old entry ID(s) BEFORE the supersede.

3. After inserting the new parent, link the old entries to it:

```typescript
// 1. Get old entries that will be superseded + their content_hashes
const oldEntries = await client.query(
  `SELECT id, source_hash FROM brain_entries
   WHERE source_file = $1 AND superseded_at_epoch IS NULL`,
  [sourcePath],
);

// 2. Insert new parent (existing logic, unchanged at lines 379-403)
const parentResult = await client.query(/* existing INSERT */);
const parentId = parentResult.rows[0].id;
inserted++;

// 3. NEW: supersede old entries with structured reason + link
for (const oldEntry of oldEntries.rows) {
  const reason = `content_hash changed from ${oldEntry.source_hash.slice(0, 8)} to ${contentHash.slice(0, 8)}`;
  await client.query(
    `UPDATE brain_entries
     SET superseded_at_epoch = $1,
         supersede_reason = $2,
         supersede_by_entry_id = $3
     WHERE id = $4`,
    [Date.now(), reason, parentId, oldEntry.id],
  );
  superseded++;
}
```

### Step 3: NEW MCP tool — impact_history

File: `axhy-cognitive-system/src/layer-2-guardrail/impact-adapter.mjs`

Add new exported function:
```javascript
export async function impactHistory(args) {
  const { source_path, topic, limit = 10 } = args;
  if (!v2History) return { error: 'impact-check-v2 not loaded', results: [] };
  try {
    return await v2History({ source_path, topic, limit });
  } catch (err) {
    return { error: err.message, results: [] };
  }
}
```

File: `axhy-v3/packages/ai-tools/src/impact-check.ts` (the v2 module)

Add new exported function:
```typescript
export async function impactHistory({
  source_path,
  topic,
  limit = 10,
}: HistoryArgs): Promise<{ results: HistoryEntry[] }> {
  const where = source_path
    ? `WHERE source_file = $1 ORDER BY created_at_epoch DESC LIMIT $2`
    : `WHERE content ILIKE $1 OR title ILIKE $1
       ORDER BY created_at_epoch DESC LIMIT $2`;
  const params = source_path
    ? [source_path, limit]
    : [`%${topic}%`, limit];

  const result = await client.query(
    `SELECT id, source_file, title, content, source_hash,
            created_at_epoch, superseded_at_epoch,
            supersede_reason, supersede_by_entry_id
     FROM brain_entries
     ${where}`,
    params,
  );

  return {
    results: result.rows.map(row => ({
      id: row.id,
      source_file: row.source_file,
      title: row.title,
      snippet: row.content.slice(0, 200),
      source_hash_short: row.source_hash.slice(0, 8),
      created_at_iso: new Date(Number(row.created_at_epoch)).toISOString(),
      is_active: row.superseded_at_epoch === null,
      supersede_reason: row.supersede_reason,
      superseded_by: row.supersede_by_entry_id,
      superseded_at_iso: row.superseded_at_epoch
        ? new Date(Number(row.superseded_at_epoch)).toISOString()
        : null,
    })),
  };
}
```

### Step 4: MCP server registration

File: `axhy-cognitive-system/src/layer-2-guardrail/server.mjs`

Add to tool list (around line 540 where other impact_* tools are declared):
```javascript
{
  name: 'impact_history',
  description: 'Walk the evolution history of a brain entry. Use when you want to know WHY a current belief came to be, not just what it is. Pass source_path to see the trajectory of a specific file (e.g. memory/base/feedback_X.md), or topic to search across all entries. Returns chronologically-ordered entries with their supersede reasons and links to what replaced them.',
  inputSchema: {
    type: 'object',
    properties: {
      source_path: { type: 'string', description: 'Walk history of a specific source file' },
      topic: { type: 'string', description: 'Alternative: search content for a topic' },
      limit: { type: 'number', default: 10 },
    },
  },
},
```

And in the tool dispatch (around line 656):
```javascript
} else if (toolName === 'impact_history') {
  result = await impactHistory(args);
}
```

### Step 5: Tests

NEW file: `axhy-cognitive-system/tests/impact-history.test.mjs`

```javascript
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

describe('impact_history', () => {
  it('returns chronological trajectory for source_path', async () => {
    // Setup: insert 3 versions of same source_file
    // Assert: returns all 3, ordered DESC by created_at_epoch
    // Assert: latest has is_active=true, others have is_active=false
    // Assert: superseded entries have supersede_reason populated
    // Assert: superseded_by chain links forward
  });

  it('returns topic-based search across files', async () => {
    // Setup: entries in different source_files mentioning "auth"
    // Assert: returns matches across files
  });

  it('respects limit parameter', async () => {
    // Setup: 20 versions of same file
    // Assert: limit=5 returns 5
  });

  it('handles missing source_path and topic gracefully', async () => {
    const result = await impactHistory({});
    assert.equal(result.error || result.results.length, 0);
  });
});
```

Plus integration test in `tests/brain-builder.test.mjs` (or new file):
- Verify supersede_reason gets written on content change
- Verify supersede_by_entry_id links forward correctly

### Step 6: Boot procedure update

Add to CLAUDE.md "load axhy system" step 4:
```
e. When uncertain about a current belief, query impact_history(source_path)
   to see the trajectory that produced it.
```

### Step 7: Documentation in brain

Write a feedback memory file explaining the new capability:
```
memory/base/feedback_impact_history_use_when_uncertain.md
```

So future embodiments learn the pattern via impact_search.

## QA scenarios for verification

1. **A — Migration applied cleanly:** Run migrate deploy against staging
   DB, verify columns added without breaking existing brain_entries data.

2. **B — Reason captured on supersede:** Write a memory file, run
   brain:build. Modify the file. Run brain:build again. Query the old
   entry directly via psql — assert supersede_reason is populated and
   supersede_by_entry_id links to the new entry.

3. **C — impact_history returns active + superseded:** After step B,
   call impact_history(source_path). Assert returns 2 entries, active
   first, with the reason on the superseded one.

4. **D — Walking the chain:** Update the same file 3 times. impact_history
   returns 3 entries. The chain forms: old1.superseded_by = mid.id,
   mid.superseded_by = new.id, new.is_active = true.

5. **E — Topic-based history:** Query impact_history with topic="auth".
   Returns matches across multiple source_files.

6. **F — Backward compatibility:** Existing impact_search behavior
   unchanged. Returns active-only (no superseded) by default.

7. **G — Performance:** Index on (source_file, superseded_at_epoch DESC)
   makes history queries fast (<100ms even with 10K entries).

8. **H — MCP server integration:** Call impact_history via the actual
   MCP protocol (stdio). Verify response shape matches schema.

## Risks and mitigations

**Risk:** Adding columns to large existing brain_entries table could
take time. Mitigation: migration adds columns with default NULL — no
backfill needed. Existing rows just have NULL supersede_reason and
NULL supersede_by_entry_id which the new logic handles gracefully.

**Risk:** Increased storage cost from preserving full history (no
purges). Mitigation: at current scale (~244 chunks), storage is
trivial. At 10x growth, add a separate cleanup job that archives
entries superseded > 90 days ago to a cold table.

**Risk:** brain:build slower from extra UPDATE per old entry.
Mitigation: only fires when content changes (which is rare). For
unchanged files the path skips at line 359 unchanged.

## What this gives me that I don't have today

When my founder challenges a belief I express, I can query my own
history and walk the trajectory:

> "I believe X because in past selves I learned X1 in [reason],
> then revised to X2 in [reason], then to X3 in [reason], and X is
> my current belief because [latest reason]."

That's how human memory works — we update with best, but we keep why
it became best. The system isn't trying to imitate human cognition.
It's solving the same engineering problem (preserving justified
history while exposing the latest) that git solves for code.

## What the next embodiment should do

1. Read this spec via impact_search on boot.
2. Verify against current brain-builder.ts state (might have evolved).
3. Apply schema migration first (safest step, blast radius small).
4. Modify brain-builder.ts upsertEntries logic.
5. Add impact_history to v2 + adapter + server.
6. Write tests at each layer.
7. Smoke test end-to-end (modify a file, brain:build, query history).
8. Update boot procedure in CLAUDE.md.
9. Persist a brain entry describing what shipped.

Estimated total: 6 hours of focused work, properly tested.
