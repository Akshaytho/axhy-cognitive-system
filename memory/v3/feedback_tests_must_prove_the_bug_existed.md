---
name: tests-must-prove-the-bug-existed-pre-fix
description: When code review finds a bug, the fix MUST include a test that fails on the pre-fix code and passes on the post-fix code. "Tests passed before so code was correct" is a false syllogism; tests passing only proves the tests as written passed. Add the test FIRST (red), then the fix (green).
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Tests must prove the bug existed (locked 2026-05-18)

**Rule:** When a code review (human or subagent) surfaces a bug that prior tests missed, the fix-PR MUST include:

1. **A test that exercises the buggy path on the pre-fix code and FAILS.** This is the regression test. It is the proof that the bug exists.
2. **The actual code fix that makes the test pass (green).**
3. **A short note in the commit message stating which test was added for which bug**, so a future reviewer can re-run the test against the pre-fix commit (`git checkout HEAD~1 -- <fix files>; pnpm test`) and observe the failure.

**Why:** Founder said 2026-05-18 verbatim: *"at last check it like this too because for before this logic you have actually passed testcases right so why now we are getting this bugs that means logic was wrong but then testcases passed so now we are fixing logic so chnaging testcases and adding new testcases so they even cover this too right I dont know wknow aht type of testing you are doin g but i asked production grade means i think you are follwing it every where right ?"*

The failure mode this prevents:
- Wave 1 / 2 / 3 each shipped with "all tests passing" but Cluster A had two P0 privilege-escalation bugs. The tests *as written* passed; they did not test the buggy paths. "Tests passed → code is correct" is a non-sequitur. Tests passing only proves the test suite as designed passed.
- Without this rule, fixing a bug without adding a regression test means the same bug can be reintroduced silently in a future refactor.
- The pre-fix-failure assertion is the difference between a test that documents the spec and a test that enforces it.

**How to apply:**

**During fix-PR construction:**
1. **Identify the bug's buggy code path** — what input + state + caller would trigger it pre-fix?
2. **Write the test that exercises that path FIRST**, in a discoverable file (e.g. `<feature>-<bug-name>.test.ts` or a new `it()` block in the existing test file with a clear title `"REGRESSION: <one-line bug description>"`).
3. **Run the test against the unfixed code.** It must fail. If it passes, the test is wrong — refine until it fails.
4. **Apply the fix.** The test should now pass. Run the full suite to confirm no regressions.
5. **In the commit message**, name each added test alongside the cluster / bug it addresses: e.g. *"Adds `leave-requests-authorization.test.ts > non-supervisor rejected with 403` — Cluster A symptom 1."*

**Specific test patterns for the common bug families:**

- **Authorization / role gate bugs**: test that the unauthorized caller gets the expected error code (403 + envelope shape, not just status).
- **Cross-tenant isolation bugs**: test that Tenant B caller cannot see/touch Tenant A resource (404 same-envelope, no info leak).
- **Race conditions**: `Promise.all` of N concurrent calls; assert exactly one succeeds and others get the expected conflict envelope.
- **Audit payload bugs**: assert the exact JSON shape of the persisted AuditEvent.payload — including which fields are absent, which are populated, which are derived from caller vs target.
- **Schema validation bypass bugs**: assert the request shape is rejected with a 400 + BAD_INPUT envelope listing the offending field.

**Hard rule — no fix-without-test:**
- ❌ "I'll add the test later." Later doesn't come.
- ❌ "The fix is obvious so no test needed." Obvious fixes are the most likely to regress under future refactors.
- ❌ "Existing tests will cover this." If they did, the bug wouldn't have shipped.

**Test-strength checklist (every test in a production-grade repo should clear these):**
- Asserts the response BODY shape, not just the status code (e.g. `error: 'X'`, not just `statusCode: 403`).
- Asserts the persisted DB state, not just the API return value.
- Asserts the audit-event payload, not just that an audit row exists.
- Asserts the notification was queued AND not duplicated under retry.
- Asserts cross-tenant isolation on every list endpoint (not just one).
- Asserts the unauthorized + missing-tenant paths return the same 404 envelope (no info leak).

**Composes with:**
- `feedback_40_year_team_world_domination_quality_bar.md` — permanent code includes permanent test coverage.
- `feedback_production_grade_workflow_rules.md` (P6 — negative-path tests mandatory).
- `feedback_root_cause_first_walkthrough_pattern.md` — root-cause fix-PRs include tests for every symptom in the cluster.
- `feedback_confidence_score_before_acting.md` — confidence claims must be backed by tests, not just typecheck.

**Scope:** Permanent. Every bug-fix commit going forward includes the failing-pre-fix regression test. No exceptions.
