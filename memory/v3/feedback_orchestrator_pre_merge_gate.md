---
name: orchestrator-pre-merge-gate-for-parallel-subagent-sprints
description: When parallel subagents ship a multi-surface sprint, the orchestrator MUST run a hard pre-merge gate (cross-surface payload grep, race tests, inverse-notification check) BEFORE any subagent's done-memo is accepted. Sprint 1 and Sprint 2 BOTH reproduced the same cross-surface drift pattern; the locks alone don't catch it.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Orchestrator pre-merge gate for parallel-subagent sprints (locked 2026-05-18)

**Rule:** Parallel-subagent execution accelerates a sprint but does NOT improve verification rigor. Each subagent passes its own tests; none are positioned to detect cross-surface drift (mobile sends a field, backend silently ignores it). Sprint 1's deep review found this pattern (Clusters B + I). Sprint 2's deep review found it AGAIN, in exactly the same shape, AFTER the locks were in place.

The locks `feedback_tests_must_prove_the_bug_existed.md` + `feedback_root_cause_first_walkthrough_pattern.md` are NECESSARY but NOT SUFFICIENT. The missing piece is an **orchestrator-driven pre-merge gate** that runs BEFORE accepting any subagent's done-memo.

**Why:** Sprint 2 deep-review §0 meta-finding 2026-05-18: *"All 4 done memos claim 100% spec coverage with confident ticks. Yet the chat amend feature does not exist server-side, the routeKey is broken, reverse compensators are incomplete, and 'race tests' claimed in test headers do not contain any Promise.all concurrent calls."*

**The 6 gates the orchestrator runs before merging any parallel-subagent sprint:**

**Gate 1 — Cross-surface payload grep.** For every payload field the mobile claims to send, grep the backend tree for the field name. If 0 references, the field is decorative. P0 candidate.

**Gate 2 — Race tests on every new state-changing route.** Every new POST that mutates DB state must have a `Promise.all`-shaped test with 2+ concurrent callers asserting `[200, 409]`. If the test file's header claims "race test" but has no `Promise.all`, FAIL.

**Gate 3 — Inverse-notification check.** Every route emitting Notification on FORWARD transition must have a corresponding emit on its INVERSE (reverse / cancel). Asymmetric chains cause workers to plan around an outdated reality.

**Gate 4 — Done-memo spec-coverage matrix grep.** Every "DONE" row in a spec-coverage matrix is grep-verified against the codebase. If grep returns nothing, the row is FALSELY-DONE and reverted to DEFERRED.

**Gate 5 — Routes registered in server.ts.** Every new route file under `apps/backend/src/routes/` must be imported AND `register*Routes(app)` called in `server.ts`. Subagents have shipped route files without registering them.

**Gate 6 — Mobile → backend HTTP method parity.** For every `apiFetch(url, { method: 'POST' })` call in mobile, verify the backend has a matching `app.post(url, …)`. Method-mismatch is "looks shipped, isn't."

**When the gate runs:** AFTER all parallel subagents return, BEFORE any deep-review subagent dispatch. **Orchestrator (Opus) runs the gate**, not a subagent. The gate is the Opus integration step that the plan §4 mandates but parallel-subagent runs have been skipping.

**Any gate failure blocks sprint close.** Orchestrator either fixes in-session OR explicitly reverts the subagent's commit and re-dispatches with corrected brief.

**Composes with:**
- `feedback_tests_must_prove_the_bug_existed.md` — the gate is the meta-test that proves the subagent's tests are real.
- `feedback_root_cause_first_walkthrough_pattern.md` — gate failures are root causes; deep-review symptoms are downstream.
- `feedback_40_year_team_world_domination_quality_bar.md` — production-grade teams have CI gates that catch cross-surface drift.

**Scope:** Permanent. Sprint 3 onward, the gate runs on every parallel-subagent sprint.
