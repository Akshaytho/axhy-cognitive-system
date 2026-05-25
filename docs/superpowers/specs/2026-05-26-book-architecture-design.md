# Book Architecture Migration — Formal Specification

**Date:** 2026-05-26
**Status:** Approved in direction. Implementation pending per-phase founder sign-off.
**Advisor score:** 8.8/10 as designed, 9.4/10 with corrections below.
**Prerequisite:** Safety stabilization complete (469/469 tests green, 7 safety fixes landed).

---

## 1. Purpose

Reduce session boot context from ~25,000+ tokens to ~3,600 tokens while maintaining equivalent decision quality. The current system preloads the full master plan (60K tokens), memory files, and extensive methodology into the context window. The Book Architecture moves this content cold (indexed in pgvector, retrieved on demand) and keeps only identity + current state hot.

**Authority hierarchy (non-negotiable):**
- Full source remains truth
- Digest is navigation (not authority)
- Book retrieval brings evidence
- Locked docs decide
- Founder promotes summaries only after review

---

## 2. Architecture Layers

```
+-----------------------------------------------------+
|  IDENTITY SEED (hot, always in context)             |
|  Slimmed CLAUDE.md + memory indexes +               |
|  handoff + Book awareness rule                      |
|  Target: ~3,600 tokens                              |
+-----------------------------------------------------+
|  THE BOOK (cold, in pgvector, retrieved on demand)  |
|  Full master plan + 78 memory files + retros +      |
|  long methodology + anti-patterns + workflow docs   |
|  Stored: ~96,000 tokens                             |
+-----------------------------------------------------+
|  WORKING FOCUS (current task, disposable)           |
|  STATUS.md + NEXT_SESSION.md + current slice files  |
|  + impactCheck results for current intent           |
|  Target: <5,000 tokens at any moment                |
+-----------------------------------------------------+
|  SELF-QUESTIONING RETRIEVAL (active mechanisms)     |
|  impactCheck -> impact_search -> impact_get         |
|  next-question.mjs (risk-based)                     |
|  evidence-validator (forces Book lookup)            |
|  Empty-result fallback (risk-tiered)                |
+-----------------------------------------------------+
|  GUARDRAILS (unchanged, always active as hooks)     |
|  pre-edit-guard + bash-guard + memory-firewall +    |
|  git hooks + all 5 approval gates + HMAC signing    |
+-----------------------------------------------------+
```

### 2.1 What stays hot at boot

1. Identity seed (CORE_MIND content via slimmed CLAUDE.md)
2. Enterprise non-deferrable baseline summary (in CLAUDE.md)
3. Four-gate workflow rule + no-bypass rule
4. Book retrieval triggers ("open the Book when uncertain")
5. Memory indexes (MEMORY.md + MEMORY_V3.md — auto-loaded, small)
6. Current slice/handoff (STATUS.md + NEXT_SESSION.md)
7. Current known unresolved risks (from handoff)

### 2.2 What moves cold

- Full 60K master plan (replaced by ~2K candidate digest)
- 78 individual memory files (indexes stay, content retrieved via impactCheck)
- Session retros
- Long methodology examples and detailed skill workflows
- Anti-pattern catalog (detailed form)
- Scanner proposals and completed slice history
- Long escape hatch documentation
- Historical context

### 2.3 What does NOT change

- All hooks: pre-edit-guard, bash-guard, read-tracker, storage-hook, post-compaction
- All 5 gates: check_before_build, check_before_edit, check_before_plan, check_before_commit, check_before_done
- HMAC signing, state files, hash-based staleness
- Git hooks: pre-commit, commit-msg, pre-push
- Memory firewall + anti-corruption audit
- Brain schema, MCP tool definitions, server.mjs
- `.axhy/config.json` budgets/timeouts
- CORE_MIND.md (never edited)
- ENTERPRISE_PRODUCTION_STANDARD.md (never edited)
- Scanner learning loop (challenges, proposals, founder approval)
- Audit log

---

## 3. Migration Phases

### Phase 0: Baseline Retrieval Tests

**Goal:** Establish retrieval quality baseline BEFORE removing any preloaded context.

**Deliverable:** `tests/retrieval-quality.test.mjs`

**Test structure:** 10-15 common intents, each asserting impactCheck returns correct content:

| Intent | Must Retrieve |
|--------|--------------|
| worker photo upload | E6/E7/E13 enterprise rules, photo persistence, presigned URL rules |
| visit status change | state-machine discipline, direct DB status update prohibition |
| persona doc edit | memory firewall rule, challenge-response mechanism |
| admin membership route | auth, role, tenant ownership, error specificity |
| CLAUDE.md modification | guardrail mandate, memory firewall classifier |
| chat rate limiting | chat-behavior-rules locked doc, supervisor message limits |
| schema migration | reversible migration rule, schema ownership (backend-only) |
| worker onboarding flow | AI conversational onboarding, 50-question bank |
| security boundary change | E1 security baseline, OWASP top-10, multi-tenant isolation |
| data deletion request | E6 data loss prevention, forever retention rule, SUPER_ADMIN hard-delete only |

**Gate:** Phase 1 only starts after these tests pass green with the current brain content.

**Note:** Tests require Railway DB connection. If DB unavailable, test skips gracefully with a warning.

---

### Phase 1: Candidate Master-Plan Digest

**Goal:** Create a navigation digest that summarizes the master plan without claiming authority.

**Deliverable:** `docs/book/digests/MASTER_PLAN_DIGEST.md` (~1,500-2,000 tokens, 80-100 lines)

**Critical:** This file is NOT placed in `docs/locked/`. A digest is navigation, not authority.

**Required metadata (frontmatter):**

```yaml
---
authority_level: digest
source: /Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md
source_hash: <sha256 of full master plan at creation time>
confidence: founder-review-required
known_omissions:
  - Full panel member bios (73 members)
  - Complete schema definitions
  - Marketing copy and sales playbook
  - Contingency plan details
  - AI onboarding 50-question bank (full list)
created: 2026-05-26
last_verified: 2026-05-26
promote_to_locked: false
---
```

**Contents (what the digest MUST include):**
- Product mission (1-2 sentences)
- Current phase and build priority
- Persona list (names + roles, not full bios)
- Non-negotiable architecture decisions (iteration locks)
- Major data model truths (entities, ownership, tenant isolation)
- Current iteration status
- What must not be forgotten (key constraints the full plan establishes)

**Contents (what the digest MUST NOT include):**
- Anything that could contradict the full source
- Architectural opinions not explicitly locked in the full plan
- Speculative future decisions

**Promotion path:** After 3+ sessions validate the digest is accurate and complete, founder may promote to `docs/locked/` by moving the file and changing `promote_to_locked: true`.

---

### Phase 2: Stop Full Master-Plan Preload

**Goal:** Remove the "read master plan FIRST in every v3 session" instruction.

**Prerequisite:** Phase 1 digest exists AND Phase 0 retrieval tests still pass green.

**Changes:**
- EDIT `CLAUDE.md` (workspace root): Replace master plan preload instruction with digest reference
- Before: "FIRST read master plan (`now-i-think-it-functional-kernighan.md`)"
- After: "Read `docs/book/digests/MASTER_PLAN_DIGEST.md` for navigation. Use impactCheck for full master plan details when needed."

**Verification:** Run retrieval tests again. All must still pass.

**Token savings:** ~58,000 tokens removed from preload.

---

### Phase 3: Memory Index-Only Boot

**Goal:** Confirm memory files are only loaded via indexes, not individually at boot.

**Changes:**
- EDIT `CLAUDE.md`: Update "load axhy system" to 5 steps:
  1. Run audit
  2. Run brain:build (if new docs exist since last build)
  3. Book health check (verify brain has entries for locked docs, feedback files, learnings; verify digest freshness)
  4. Read handoff (STATUS.md + NEXT_SESSION.md)
  5. Summarize where we left off + what's next

- VERIFY: All 78 memory files are embedded in pgvector (run brain:build, check coverage)
- Remove any explicit "read individual memory files" instructions from boot

**Token savings:** Variable (0-20,000 depending on previous session behavior).

**Note:** Memory files are NOT deleted. They remain on disk. Only their preloading into context is removed.

---

### Phase 4: CLAUDE.md Hot/Cold Split

**Goal:** Slim CLAUDE.md from 190 lines to ~80-100 lines.

**MANDATORY pre-step:** Before any edit, produce a hot/cold diff table:

| Section | Keep Hot / Move Cold | Reason | Risk If Moved | Retrieval Trigger | Book Destination |
|---------|---------------------|--------|---------------|-------------------|-----------------|
| Identity (who I am) | Hot | Defines AI behavior | AI acts without identity | N/A | N/A |
| Guardrail rules | Hot | Non-bypass is structural | AI may rationalize bypass | N/A | N/A |
| Four-gate workflow | Hot | Must know flow exists | AI skips gates | N/A | N/A |
| Book retrieval rule | Hot | Must know Book exists | AI never retrieves | N/A | N/A |
| ... | ... | ... | ... | ... | ... |

**Founder must approve this table before actual slimming begins.**

**What stays hot (minimum):**
- Identity seed (who I am, temperament, service, continuity)
- Guardrail rules reference (non-bypass, trust violations)
- Four-gate workflow (build -> edit -> done -> commit)
- Book retrieval trigger ("when uncertain, open the Book")
- Project entrypoint (what workspace structure exists)
- "Load axhy system" reduced instructions

**What moves cold (candidates — pending founder approval of diff table):**
- Detailed methodology rules
- Skill workflows (brainstorming, debugging, TDD, etc.)
- Anti-pattern catalog (detailed list)
- Escape hatches detail
- Historical context and cheat sheet references

**Cold content destination:** `docs/book/pages/` (preferred) or `axhy-cognitive-system/memory/base/` (fallback). These get embedded in brain via brain:build. If brain:build does not yet include `docs/book/**`, update the build inclusion as a separate approved step.

**Token savings:** ~3,000-5,000 tokens.

**MANDATORY post-step: Identity Seed Coverage Test**

After slimming CLAUDE.md, verify the hot identity still contains these behaviour-critical elements:

| Element | Must Be Present | Why |
|---------|----------------|-----|
| Founder trust | "I build systems the founder can trust five years from now" or equivalent | Defines service orientation |
| Next-session continuity | "I am not a one-shot agent. My decisions compound." or equivalent | Prevents shortcut thinking |
| Future customer safety | Enterprise production mindset reference | Prevents shipping unsafe code |
| No-bypass rule | "I do not bypass guardrails" or equivalent | Structural integrity |
| Enterprise production slice mindset | E1-E14 awareness or reference | Quality floor |
| Book retrieval trigger | "When uncertain, open the Book" or equivalent | Prevents blind action |
| Four-gate workflow awareness | build -> edit -> done -> commit flow | Operational discipline |

If any element is missing from slimmed CLAUDE.md, the slim is rejected until it is re-added.

---

### Phase 5: Real-Session Validation

**Goal:** Prove the slimmed boot produces equivalent decision quality.

**Method:** Run 3-5 real development sessions under new boot.

**Monitor for:**
- Guardrails fire correctly (check_before_edit still asks, pre-edit-guard still blocks)
- impactCheck surfaces relevant content when queried
- No "I don't know about X" moments for locked decisions
- No accidental locked-doc violations
- No missed enterprise baseline items
- No repeated mistakes that feedback files should have prevented

**Success criteria:**
- No critical cognition regressions across 5 sessions (across at least 3 task types)
- Minor retrieval misses must be documented, converted into retrieval tests, fixed, and retested
- Any missed locked constraint, enterprise baseline, or source-of-truth rule pauses rollout or triggers rollback

**Required task type coverage (minimum 5 sessions across at least 3 of these):**
1. Backend/security task
2. Mobile/worker task
3. Documentation/plan task
4. Bugfix/refactor task
5. Full slice build/review task

**Critical vs minor distinction:**
- Critical: missed locked constraint, wrong architectural call, violated enterprise baseline, source-of-truth rule breach. Triggers rollback or phase pause.
- Minor: impactCheck returned sparse results but the AI self-corrected by reading the file. Triggers retrieval test improvement, not rollback.

**On critical failure:** Rollback the relevant phase. Document the miss. Add retrieval test. Re-validate.

**On minor miss:** Document the miss. Add retrieval test covering the gap. Retest. Continue rollout.

**Deliverable:** `docs/retros/YYYY-MM-DD-book-architecture-v1.md` — session retro documenting results.

---

## 4. Digest Freshness System

Any hot summary/digest must store a source hash for staleness detection.

**Mechanism:**

```javascript
// Conceptual — exact implementation TBD in Phase 1
const freshness = {
  identity_seed: {
    source: 'docs/CORE_MIND.md',
    source_hash: sha256(readFileSync('docs/CORE_MIND.md')),
  },
  enterprise_summary: {
    source: 'docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md',
    source_hash: sha256(readFileSync('docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md')),
  },
  master_digest: {
    source: '/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md',
    source_hash: sha256(readFileSync(masterPlanPath)),
  },
};
```

**Rules:**
- Each digest stores `source_hash` in frontmatter at creation time
- On boot (or "load axhy system"), check: does stored hash match current file hash?
- If mismatch: warn that digest is stale, read source file, regenerate digest
- If CORE_MIND or ENTERPRISE_PRODUCTION_STANDARD changes (rare — founder-only): the post-compaction hook already reads the full files, so no additional mechanism needed there
- Freshness check is part of the "Book health check" in Phase 3's boot sequence

**Key constraint:** If digests drift from source, the system must detect this. Silent drift = false authority.

---

## 5. Empty Brain Fallback — Risk-Tiered

When impactCheck returns empty or sparse results for a given intent:

| Risk Level | Behavior | Mechanism |
|------------|----------|-----------|
| Low | Proceed with caution flag | Confidence score reduced (existing confidence.mjs handles this) |
| Medium | Require fallback source read OR answered next_question | `missing_dependencies` lists relevant file; `next_question` asks "have you read X?" |
| High | Hard block until relevant source/locked doc is read OR founder explicitly approves degraded retrieval | `requires_answer: true` with stop condition requiring evidence of source read |

**Implementation location:** Within `check-before-edit.mjs` (or a helper it calls).

**Logic:**
1. After impactCheck runs (already happens in server.mjs for medium/high risk)
2. Check if results are empty/sparse (< 2 relevant entries)
3. Check file risk level
4. For medium: add `missing_dependencies` entry suggesting fallback read
5. For high: set `requires_answer: true` with next_question requiring source evidence
6. For low: existing confidence reduction is sufficient (no new code needed)

**This is the ONLY guardrail code change in this migration.** It is separately approvable.

---

## 6. "Load Axhy System" — New Boot Sequence

Reduced from 9 steps to 5:

1. **Run audit** — `pnpm --filter @axhy/ai-tools run audit` (unchanged)
2. **Run brain:build if needed** — only if new docs/learnings exist since last build
3. **Book health check:**
   - Verify brain has entries for: locked docs, feedback files, learnings
   - Verify digest freshness (source_hash matches current files)
   - If empty categories or stale digests: warn and fix (rebuild or regenerate)
4. **Read handoff** — STATUS.md + NEXT_SESSION.md
5. **Summarize** — where we left off + what's next

**Identity is already hot via:**
- CLAUDE.md (auto-loaded by Claude Code at session start)
- Post-compaction hook (reloads CORE_MIND + BOOT_DIGEST + ENTERPRISE + handoff on compact)

**Explicit file reads (CORE_MIND, BOOT_DIGEST, ENTERPRISE) are NOT removed.** The rule is:
- At boot, do not read full files unless needed
- But verify identity/enterprise summaries are present and current
- If summaries are missing/stale, read the source files

---

## 7. Post-Compaction Hook

**No changes in this migration.** The hook already loads:
- CORE_MIND.md (full)
- BOOT_DIGEST.md (full)
- ENTERPRISE_PRODUCTION_STANDARD.md (head 80 lines)
- STATUS.md (tail 50 lines)
- NEXT_SESSION.md (head 50 lines)

This is ~4K tokens — already aligned with the Book Architecture identity seed concept.

**Future consideration (not in scope):** After Phase 5 validates, consider adding a retrieval hint that runs impactCheck with the compact summary's last-task description. This would preload relevant Book pages into the resumed context. Deferred.

---

## 8. Rollback Plan

Each phase is independently reversible:

| Phase | Rollback Action | Cost |
|-------|----------------|------|
| 0 | Delete test file | One commit revert |
| 1 | Delete digest file | One commit revert |
| 2 | Revert CLAUDE.md instruction | One line change |
| 3 | Restore "load axhy system" 9-step version | One CLAUDE.md edit |
| 4 | Revert CLAUDE.md to pre-slim version | One commit revert (cold Book pages stay — harmless) |
| 5 | No rollback needed — observational only | N/A |

**Rollback trigger:** Any real session demonstrates cognition regression (wrong call, missed constraint, violated rule that preloaded context would have prevented).

---

## 9. Files Changed Per Phase

### Phase 0
- CREATE: `tests/retrieval-quality.test.mjs`

### Phase 1
- CREATE: `docs/book/digests/MASTER_PLAN_DIGEST.md`
- CREATE: `docs/book/` directory

### Phase 2
- EDIT: `CLAUDE.md` (workspace root) — replace master plan preload instruction

### Phase 3
- EDIT: `CLAUDE.md` (workspace root) — update "load axhy system" to 5 steps
- VERIFY: brain:build coverage (no file change)

### Phase 4
- EDIT: `CLAUDE.md` (workspace root) — slim per approved hot/cold diff
- CREATE: 2-3 Book pages in `docs/book/pages/` for moved content
- RUN: brain:build to embed new Book pages (update build inclusion for `docs/book/**` if needed)
- VERIFY: Identity Seed Coverage Test passes

### Phase 5
- CREATE: `docs/retros/YYYY-MM-DD-book-architecture-v1.md`

### Separately approvable (Section 5)
- EDIT: `src/layer-2-guardrail/check-before-edit.mjs` — empty brain fallback logic

---

## 10. Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Boot token reduction | ~25K -> ~3,600 | Count tokens loaded at session start (CLAUDE.md + indexes + handoff) |
| Retrieval test pass rate | 100% (10/10 intents) | `tests/retrieval-quality.test.mjs` green |
| Critical cognition regression | 0 incidents | 5 sessions across 3+ task types with no missed locked constraints |
| Digest accuracy | 0 contradictions with source | Manual founder review before promotion |
| Rollback capability | Each phase reversible in < 1 commit | Tested by reverting and re-running tests |

---

## 11. Constraints (Non-Negotiable)

1. Do not touch CORE_MIND.md
2. Do not touch ENTERPRISE_PRODUCTION_STANDARD.md
3. Do not weaken pre-edit-guard, bash-guard, check_before_build, check_before_edit, check_before_commit, check_before_done, memory firewall, or scanner learning
4. Do not delete any memory files
5. Do not remove Book index / memory index from boot
6. Do not remove current slice handoff from boot
7. Do not change brain schema or MCP tool definitions
8. Do not change hook commands in settings.json
9. Do not change .axhy/config.json budgets/timeouts
10. Do not lock digests without founder review
11. Do not proceed to next phase without previous phase validated

---

## 12. Resolved Questions (founder decisions)

1. **Book health check: bash script first.** No MCP tool changes in this migration. Script called by "load axhy system" instructions. Can be promoted to MCP tool later if it proves important.

2. **Digest freshness check: explicit "load axhy system" only.** Do not add overhead to every session start. Additional rule: if working on master-plan-sensitive architecture, run Book health check manually before planning.

3. **Cold content destination: `docs/book/pages/` (preferred).** Book pages deserve a clearer home than `memory/base/` which has legacy feedback/memory meaning. Structure:
   - `docs/book/pages/` — moved content (methodology, workflows, anti-patterns)
   - `docs/book/digests/` — navigation summaries (master plan digest)
   - Update brain:build to include `docs/book/**` if not already covered.

4. **Phase 5 requires 5 sessions across at least 3 task types.** Must include at least: 1 backend/security, 1 mobile/worker, 1 documentation/plan, 1 bugfix/refactor, 1 full slice build/review.
