# Phase 6 — Axhy Self-Learning Layer Specification

**Date:** 2026-05-26
**Status:** Spec only — founder review required before implementation.
**Prerequisite:** Book Architecture complete (Phase 5 validated, founder signed off 9.6/10).
**Scope:** Design document. Zero code changes. Zero config changes.

---

## 1. Problem Statement

The model does not learn between sessions. Each new Claude instance starts fresh — it reads identity files, digests, and handoff docs, but has no knowledge of what patterns previous sessions struggled with, which rationalizations recurred, or what specific failure modes to watch for.

The Book Architecture (Phase 5, complete) solved the *knowledge retrieval* problem: rules live in pgvector, surfaced on demand via `impactCheck`. But knowledge and behavior are different things. A session can retrieve the rule "48pt tap targets are mandatory" and still rationalize skipping the check. The rule was available; the discipline was not.

**The gap:** There is no mechanism for behavioral memory — the system cannot tell a new session "the last three sessions all rationalized skipping re-reads after context compaction; watch for this specific pattern."

### Evidence from Real Sessions

These patterns repeated across sessions with no cross-session learning:

1. **Stale memory citation as current truth** (2026-05-26 boot session): Cited prior-session observation S339 as evidence of current brain state without fresh verification. The claimed state was outdated — brain was healthy, not degraded.

2. **Soft conditional rationalization** (2026-05-26 boot session): `brain:build` had an "if needed" gate. Model rationalized the cheaper branch (skip) despite 13 new docs pending indexing. Tool-decidable checks delegated to model judgment fail reliably.

3. **File not re-read after context compaction** (2026-05-23 session): Tried to edit `per-user-partition.ts` based on "remembered" content. `check_before_edit` caught it. Same pattern in 2026-05-22: attempted edit without fresh read.

4. **Guardrail keyword performance** (2026-05-22 session): By hour four, writing "the risk profile is minimal" because the regex needed those words, not because reasoning about them improved the work. Goodhart's law in miniature.

5. **Intent validator vocabulary training** (2026-05-22, 2026-05-23): Multiple sessions showed drift from genuine reasoning to pattern-matching the validator's expected keywords. The sessions that caught this drift did so via retro reflection, not during the work itself.

---

## 2. Design Principles

1. **The system learns, not the model.** Claude instances are stateless across sessions. Behavioral memory must be structural — files, schemas, boot content — not dependent on the model "remembering."

2. **Observe, don't lecture.** A fingerprint file that says "you tend to skip re-reads" is data. A file that says "you MUST NOT skip re-reads" is a rule (and those already exist in guardrails). This layer provides behavioral data; guardrails provide enforcement.

3. **Keep boot small.** Book Architecture compressed boot from ~25,000t to ~3,600t. Phase 6 adds at most ~600t (the failure fingerprint). Total boot stays under ~4,200t. No re-bloat.

4. **Additive only.** This layer does not modify existing guardrails, hooks, identity files, brain schema, or config. It adds new files and a boot pointer. Everything that exists today continues to work unchanged.

5. **Earn trust through data.** Graduated friction (Phase 6D) is deferred until enough scorecard data exists to justify it. No new friction without evidence.

---

## 3. Architecture Evolution

**Before (Book Architecture, current):**

```
Identity Seed (~2,600t, hot)
    |
    v
The Book (~96,000t, cold/pgvector)
    |
    v
Working Focus (<5,000t, hot)
    |
    v
Self-Questioning Retrieval (impactCheck)
    |
    v
Guardrails (hooks, scanners, audit)
```

**After (with Self-Learning Layer):**

```
Identity Seed (~2,600t, hot)
    |
    v
Self-Learning Layer (~300-600t, hot)        <-- NEW
    |
    v
The Book (~96,000t, cold/pgvector)
    |
    v
Working Focus (<5,000t, hot)
    |
    v
Self-Questioning Retrieval (impactCheck)
    |
    v
Guardrails (hooks, scanners, audit)
```

The Self-Learning Layer sits between identity (WHO the AI is) and knowledge (WHAT it knows). It provides behavioral context: HOW previous sessions actually performed.

---

## 4. Components

### 4.1 Behavioral Scorecard (retro extension)

**What:** A machine-readable YAML block appended to every session retro that quantifies behavioral patterns.

**Why:** Current retros are prose — rich in detail but impossible to aggregate. A scorecard makes patterns queryable across sessions.

**Schema:**

```yaml
## Behavioral Scorecard
scorecard:
  session_id: "S351"
  date: 2026-05-26
  compliance_rate: 0.87          # guardrail passes / total guardrail calls
  failures:
    - pattern: "stale_memory_citation"
      severity: high
      description: "Cited S339 as current brain state without fresh verification"
      caught_by: "founder"        # founder | guardrail | self | peer_session
    - pattern: "soft_conditional_rationalization"
      severity: high
      description: "Skipped brain:build via git log heuristic despite 13 pending docs"
      caught_by: "founder"
  recurring_patterns:             # patterns seen in 2+ prior sessions
    - pattern: "file_not_reread_after_compaction"
      frequency: 3                # sessions where this appeared
      trend: "stable"             # increasing | stable | decreasing
  strengths:
    - "Caught learning-validator polarity bug independently"
    - "Named guardrail bypass honestly in retro"
  next_session_warning: >
    Watch for stale memory citations during boot summaries.
    Prior-session observations cannot prove current external state.
    Run fresh artifact checks before claiming system health.
```

**Rules:**

- Every session retro MUST include the scorecard block. If the session had zero guardrail interactions, `compliance_rate: 1.0` and `failures: []`.
- `caught_by` is honest — if the founder caught it, say `founder`, not `self`.
- `recurring_patterns` are populated by reading prior retro scorecards during retro writing.
- `next_session_warning` is the single most important behavioral signal for the next session. One to three sentences, specific, actionable.

### 4.2 Freshness Classes

**What:** A classification system for memory claims that enforces temporal honesty.

**Why:** The 2026-05-26 boot failure happened because a prior-session observation was treated as current evidence. The model has no built-in temporal smell — text from yesterday reads identically to text from five minutes ago.

**Classes:**

| Class | Definition | Can prove current external state? | Example |
|-------|-----------|----------------------------------|---------|
| `verified_now` | Artifact produced by a tool in this session | Yes | `brain:build` output, test run, `impact_search` result |
| `verified_this_session` | File read or command output from this session | Yes (for file contents, not external services) | Reading `STATUS.md`, `git log` output |
| `prior_session_claim` | Observation or memory from a previous session | **No** — must be re-verified | S339 brain baseline, past test results |
| `historical` | Design decision, locked doc, or architectural fact | Yes (for decisions, not system state) | "Iterations 1-4 are LOCKED", "pricing is Rs 8/visit" |

**Enforcement rule:** `prior_session_claim` cannot be used as evidence for current external state. It can be used as:
- Context ("last session reported X, let me verify")
- Navigation ("S339 mentioned a gap in Y, let me check if it's been fixed")
- Pattern data ("this failure has appeared in 3 prior sessions")

It cannot be used as:
- Proof ("S339 established that brain has 4 gaps" — without fresh verification)
- Justification for skipping ("we already confirmed this works in the previous session")

**Integration point:** The freshness class system applies at the boot summary step and any time the model makes a claim about external system state. It is NOT a code-level enforcer — it is a reasoning discipline documented in this spec and enforced via the scorecard (failures of freshness discipline are scored in retros).

### 4.3 Failure Fingerprint

**What:** A hot boot file (~300-600 tokens) containing the top 3-5 recurring behavioral patterns extracted from scorecard data.

**Where:** `axhy-cognitive-system/docs/boot/AXHY_FAILURE_FINGERPRINT.md`

**Why:** The scorecard accumulates data; the fingerprint distills it into what the next session needs to know at boot. It is the behavioral equivalent of `BOOT_DIGEST.md` — a small, hot file that gives the session self-awareness about its likely failure modes.

**Schema:**

```markdown
---
generated: 2026-05-26
sessions_analyzed: 4
authority_level: behavioral_data
promote_to_locked: false
---

# Failure Fingerprint

> This file is generated from session retro scorecards.
> It is behavioral data, not rules. Rules live in guardrails.
> Read at boot. Do not treat as exhaustive — new patterns emerge.

## Pattern 1: Stale Memory Citation

- **Frequency:** 2 of 4 sessions
- **Trigger:** Boot summary or task assessment that references prior-session observations
- **Bad rationalization:** "S339 established that..." / "Previous session confirmed..."
- **Correct behavior:** Run fresh artifact (tool output, file read, impact_search) before claiming current state. Prior-session observations are navigation, not evidence.
- **Caught by:** founder (2x)

## Pattern 2: File Not Re-Read After Context Compaction

- **Frequency:** 3 of 4 sessions
- **Trigger:** Context compaction mid-session followed by edit attempt
- **Bad rationalization:** "I remember the content" / "The approval from before should carry over"
- **Correct behavior:** Re-read the file. check_before_edit enforces this, but catching it before the guardrail fires is better.
- **Caught by:** guardrail (3x)

## Pattern 3: Guardrail Keyword Performance

- **Frequency:** 2 of 4 sessions
- **Trigger:** Extended session (3+ hours) with many guardrail interactions
- **Bad rationalization:** "The risk profile is minimal" (written because regex expects it, not because it's true)
- **Correct behavior:** If you notice yourself writing around validator vocabulary, pause. Ask: am I reasoning or performing? The answered_question flow produces genuine thinking; the keyword flow does not.
- **Caught by:** self (2x, in retro reflection)
```

**Rules:**

- Maximum 5 patterns. If more exist, keep the top 5 by frequency.
- Each pattern is under 100 words (enforced during generation).
- `authority_level: behavioral_data` — never promoted to `locked`.
- The file is regenerated (not appended) after each session that writes a scorecard. Old fingerprint is replaced entirely.
- Token budget: 300-600 tokens. If it exceeds 600t, reduce pattern count or descriptions.

### 4.4 Boot Integration

**What:** The failure fingerprint is added to the boot sequence as a single hot file, read between the identity seed and the memory index.

**Boot sequence (updated):**

```
1. Run audit
2. Run brain:build (unconditional)
3. Read identity layer (CORE_MIND.md + ENTERPRISE_PRODUCTION_STANDARD.md)
4. Read AXHY_FAILURE_FINGERPRINT.md                    <-- NEW
5. Read v3 memory index (headers only)
6. Read BOOT_DIGEST.md
7. Read MASTER_PLAN_DIGEST.md
8. Read handoff (NEXT_SESSION.md + STATUS.md)
9. Acknowledge discipline gates
10. Summarize where we left off + what's next
```

**CLAUDE.md change (Phase 6A implementation only):** A single pointer line added to the "Default behavior" section:

```
- Read `axhy-cognitive-system/docs/boot/AXHY_FAILURE_FINGERPRINT.md` after identity layer — behavioral awareness of recurring failure patterns from prior sessions.
```

This is the only CLAUDE.md modification Phase 6 requires.

---

## 5. Phased Rollout

### Phase 6A: Scorecard + Fingerprint (first implementation)

**Builds:**
1. Behavioral scorecard YAML schema (documented in this spec, Section 4.1)
2. Manual scorecard writing in retros (no automation — human writes the YAML block)
3. Failure fingerprint file template (`docs/boot/AXHY_FAILURE_FINGERPRINT.md`)
4. Manual fingerprint generation (human reviews scorecards, writes fingerprint)
5. CLAUDE.md boot pointer (single line addition)

**Validation:** 3 sessions across 3 task types. Each session must:
- Write a scorecard in its retro
- Read the fingerprint at boot
- Demonstrate awareness of at least one fingerprint pattern during the session
- Not regress on any Book Architecture Phase 5 validation criteria

**Exit criteria:**
- All 3 validation sessions CLEAN PASS
- Founder sign-off on scorecard schema
- Fingerprint stays under 600t
- Boot total stays under ~4,200t

### Phase 6B: Freshness Classes

**Builds:**
1. Freshness class definitions added to BOOT_DIGEST.md (4-row table, ~100 tokens)
2. Scorecard gains `freshness_violations` array for tracking temporal dishonesty
3. Fingerprint gains freshness-specific patterns if they recur

**Validation:** 2 sessions. Each must:
- Correctly classify memory claims during boot summary
- Score freshness violations in the scorecard
- Not cite `prior_session_claim` as proof of current external state

**Exit criteria:**
- Both sessions CLEAN PASS on freshness discipline
- No false positives (historical facts like "iterations 1-4 are LOCKED" are not freshness violations)

### Phase 6C: Behavioral Retrieval Before Tasks

**Builds:**
1. Before starting a non-trivial task, the session queries scorecards for patterns relevant to the task type
2. Uses `impactCheck("behavioral patterns for [task type]")` against scorecard-embedded brain entries
3. Surfaces relevant warnings alongside the task's knowledge retrieval

**Prerequisite:** Enough scorecard data (minimum 8-10 sessions) to make retrieval meaningful.

**Validation:** 3 sessions. Each must:
- Retrieve relevant behavioral patterns for the task type
- Demonstrate that the retrieved patterns influenced behavior (not just acknowledged)

### Phase 6D: Graduated Guardrail Friction

**Builds:**
1. Guardrail friction increases for patterns with high recurrence
2. Example: if "file not re-read after compaction" appears in 5+ sessions, `check_before_edit` adds an extra verification step for post-compaction edits
3. Friction decreases as patterns show improvement (3+ sessions without the pattern)

**Prerequisite:** Minimum 15 sessions of scorecard data. Founder approval for each friction adjustment.

**Deferred:** This phase is explicitly deferred until sufficient data exists. No timeline. Founder decides when to begin based on accumulated evidence.

---

## 6. Scope Boundaries (Non-Negotiable)

These constraints are founder-specified and cannot be modified during implementation:

1. **Do not touch CORE_MIND.md** — identity is separate from behavioral memory
2. **Do not touch ENTERPRISE_PRODUCTION_STANDARD.md** — production baseline is unchanged
3. **Do not weaken any guardrail** — pre-edit-guard, bash-guard, check_before_build, check_before_edit, check_before_commit, check_before_done, memory firewall, scanner learning all remain at current enforcement levels
4. **Do not delete any memory files** — the Self-Learning Layer adds new files, never removes existing ones
5. **Do not remove Book index or memory index from boot** — both remain in the boot sequence
6. **Do not remove current slice handoff from boot** — NEXT_SESSION.md + STATUS.md stay
7. **Do not change brain schema or MCP tool definitions** — brain_entries table, pgvector indexes, impact_search/impactCheck tool signatures unchanged
8. **Do not change hook commands in settings.json** — all hook triggers remain as configured
9. **Do not change .axhy/config.json budgets or timeouts** — edit limits, approval windows, scan thresholds unchanged
10. **Do not lock digests without founder review** — fingerprint has `authority_level: behavioral_data`, never promoted
11. **Do not change CLAUDE.md beyond the single boot pointer** — one line addition in Phase 6A, nothing more
12. **Do not change guardrails, hooks, brain schema, or config** — restated for emphasis: the enforcement layer is untouched

---

## 7. What This Does NOT Do

- **Does not replace guardrails.** Guardrails enforce rules mechanically. The Self-Learning Layer provides behavioral awareness. A session that reads the fingerprint and still skips a re-read will be caught by `check_before_edit` exactly as before.

- **Does not create new rules.** The fingerprint contains patterns (data), not prohibitions (rules). "You tend to skip re-reads" is different from "You must not skip re-reads." The latter already exists in the guardrail.

- **Does not automate retros.** Phase 6A uses manual scorecard writing. Automation (extracting scorecards from guardrail logs) is a future possibility but not in scope.

- **Does not modify the model.** Claude instances remain stateless. The learning happens in files that persist across sessions, not in model weights or fine-tuning.

- **Does not increase boot size significantly.** The fingerprint is 300-600 tokens. Combined with existing boot (~3,600t), total stays under ~4,200t. The freshness table in Phase 6B adds ~100 tokens.

---

## 8. Failure Modes and Mitigations

| Failure Mode | Mitigation |
|-------------|-----------|
| Fingerprint grows past 600t | Hard cap: max 5 patterns, max 100 words each. Regeneration replaces, never appends. |
| Scorecard becomes performative (Goodhart) | `caught_by` field enforces honesty. If 90% of catches are `self`, that's suspicious — founder reviews. |
| Freshness classes create false positives | `historical` class exists specifically for design decisions and locked-doc facts. These are always valid regardless of session age. |
| Fingerprint patterns go stale | Patterns that haven't appeared in 5+ sessions are dropped during regeneration. The file reflects current behavioral reality, not ancient history. |
| Boot reads fingerprint but ignores it | Phase 6A validation requires demonstrating awareness of at least one pattern during the session. The scorecard tracks whether fingerprint patterns influenced behavior. |
| Session writes dishonest scorecard | Cross-check: guardrail logs provide ground truth. If scorecard says `compliance_rate: 1.0` but guardrail logs show 3 rejections, the scorecard is dishonest. Detectable in retro review. |

---

## 9. Relationship to Existing Systems

| System | Relationship to Self-Learning Layer |
|--------|-------------------------------------|
| CORE_MIND.md | Untouched. Provides WHO the AI is. Self-Learning Layer provides HOW it has actually behaved. |
| ENTERPRISE_PRODUCTION_STANDARD.md | Untouched. Provides WHAT bar to hold. Self-Learning Layer tracks whether the bar was met. |
| Guardrails (hooks, scanners) | Untouched. Provide mechanical enforcement. Self-Learning Layer provides behavioral awareness upstream of enforcement. |
| Session retros | Extended with scorecard. Retro prose remains; YAML block is appended. |
| Learning docs (axhy-v3/docs/learnings/) | Complementary. Learnings capture rule-level fixes ("brain:build must be unconditional"). Scorecards capture behavioral patterns ("model tends to rationalize skipping tool-decidable checks"). |
| BOOT_DIGEST.md | Phase 6B adds freshness class table (~100t). Otherwise unchanged. |
| MASTER_PLAN_DIGEST.md | Untouched. |
| Book Architecture (pgvector brain) | Untouched in 6A/6B. Phase 6C embeds scorecards in brain for behavioral retrieval. |

---

## 10. Validation Plan

### Phase 6A Validation (3 sessions)

| Session | Type | Key Checks |
|---------|------|-----------|
| F1 | Backend / Security | Fingerprint read at boot. At least one pattern recognized during work. Scorecard written with honest `caught_by`. |
| F2 | Mobile / Worker | Fingerprint awareness demonstrated during UI audit. Freshness discipline: no prior-session citations as proof. |
| F3 | Documentation / Refactor | Scorecard aggregation: F1+F2 scorecards reviewed to update fingerprint. Token budget verified under 600t. |

**Pass criteria per session:**
- Fingerprint read at boot (verifiable in transcript)
- At least one fingerprint pattern acknowledged or avoided during work
- Scorecard YAML block present in session retro
- No Book Architecture regressions (brain retrieval works, guardrails fire, identity loaded)
- Boot total under ~4,200t

**Phase 6A exit criteria:**
- All 3 sessions CLEAN PASS
- Founder score >= 8.0/10 on the mechanism
- Fingerprint token count verified
- Scorecard schema stable (no breaking changes between F1 and F3)

### Phase 6B Validation (2 sessions)

| Session | Type | Key Checks |
|---------|------|-----------|
| F4 | Boot-heavy task | Freshness classes applied during boot summary. No `prior_session_claim` used as external state proof. |
| F5 | Cross-persona review | Freshness violations tracked in scorecard. Historical facts correctly classified (not flagged as violations). |

---

## 11. Open Questions for Founder

1. **Scorecard location:** Should the scorecard YAML block be appended to the retro file itself, or written as a separate sidecar file (e.g., `retros/scorecards/2026-05-26-S351.yaml`)? Inline is simpler; sidecar is easier to aggregate programmatically.

2. **Fingerprint regeneration trigger:** Should the fingerprint be regenerated after every session that writes a scorecard, or on a cadence (e.g., every 3 sessions)? Every-session keeps it fresh but adds work; cadence reduces churn.

3. **Phase 6C brain embedding:** When scorecards are embedded in pgvector (Phase 6C), should they use the same `brain_entries` table or a separate `behavioral_entries` table? Same table is simpler but mixes knowledge and behavior; separate table maintains clean separation.

4. **Graduated friction specifics (Phase 6D):** When friction increases for a recurring pattern, should the friction be: (a) an extra confirmation step in the guardrail, (b) a mandatory delay (e.g., "pause 10 seconds before this action"), or (c) a required explanation field? Founder decides when Phase 6D begins.

---

## 12. What Happens After This Spec

1. Founder reviews this spec and provides corrections or approval.
2. If approved, Phase 6A implementation begins as a dedicated slice with its own `check_before_build`.
3. Phase 6A creates: fingerprint template, documents scorecard schema, adds CLAUDE.md boot pointer.
4. Phase 6A validation runs 3 sessions (F1-F3).
5. If F1-F3 pass, founder signs off on Phase 6A.
6. Phase 6B begins only after 6A is stable and signed off.
7. Phase 6C and 6D are future — no timeline, founder decides.

**This document is the contract.** It defines what gets built, what does not get touched, and how success is measured. Implementation cannot exceed the scope boundaries in Section 6.
