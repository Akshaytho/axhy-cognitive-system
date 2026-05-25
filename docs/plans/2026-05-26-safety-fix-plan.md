# Safety Fix Plan — 6 Critical Issues

**Status: AWAITING FOUNDER APPROVAL**
**Date:** 2026-05-26
**Source:** 2026-05-24 Cognitive System Review (4-reviewer panel, scored 6.2/10 safety)
**Validated by:** 2026-05-26 Preservation Audit (confirmed all 6 issues persist)

---

## Guiding Constraints

- Do not touch CORE_MIND.md
- Do not touch ENTERPRISE_PRODUCTION_STANDARD.md
- Do not weaken the four-gate workflow
- Do not change Book Architecture yet
- Do not optimise tokens yet
- Preserve first. Stabilize second. Reorganize third. Optimize fourth.

---

## Implementation Order

Fix 1 (fail-open) > Fix 2 (first-file risk) > Fix 3 (challenge namespace) > Fix 5 (HMAC fallback) > Fix 4 (workflow cycle) > Fix 6 (tests)

Rationale: Fix 1 is highest-severity (security hooks silently pass on crash). Fix 2 is an active bypass vector. Fix 3 is a privilege escalation path. Fix 5 removes dead fallback code. Fix 4 resolves a workflow deadlock (more complex, benefits from earlier fixes being stable). Fix 6 adds regression coverage for all prior fixes.

---

## Fix 1: Fail-Open Error Handling

**Severity:** Critical
**Issue:** Security hooks (`bash-guard.mjs`, `pre-edit-guard.mjs`) use `process.exit(0)` in their top-level catch blocks. Exit code 0 = success = action proceeds. A crash in any security hook silently approves the action.
**Principle violated:** E-standard crash prevention (fail-closed on security boundaries).

### Files to Change

| File | Line | Current | Proposed |
|------|------|---------|----------|
| `src/layer-1-hook/bash-guard.mjs` | main catch block (bottom of file) | `process.exit(0)` | `process.exit(2)` |
| `src/layer-1-hook/pre-edit-guard.mjs` | main catch block (bottom of file) | `process.exit(0)` | `process.exit(2)` |

### Files NOT Changed (intentional)

| File | Reason |
|------|--------|
| `src/layer-1-hook/storage-hook.mjs` | Telemetry/memory hook. Fail-open correct. Blocking telemetry on crash would break session flow. |
| `src/layer-4-git/pre-commit.mjs` | Already exits non-zero on error (git hooks treat any non-zero as block). |

### Verification

1. `node src/layer-1-hook/bash-guard.mjs` with corrupted state file -> must exit 2 (not 0)
2. `node src/layer-1-hook/pre-edit-guard.mjs` with corrupted state file -> must exit 2 (not 0)
3. Existing test suite must still pass (guards don't crash under normal conditions)

### Risk

**Low.** Exit code change only affects the crash path. Normal operation (valid state, proper approvals) never hits the catch block.

---

## Fix 2: First-File-Only Risk Assessment

**Severity:** High
**Issue:** `check-before-edit` (in `server.mjs` handleEditToolCall) uses only `filePaths[0]` when computing risk for impactCheck integration. The pre-edit-guard also classifies risk using the primary file. If a multi-file edit puts a low-risk file first, HIGH-risk files escape full scrutiny.

### File to Change

`src/layer-1-hook/pre-edit-guard.mjs`

### Current Code (conceptual)

```javascript
const primaryFile = filePaths[0];
const risk = classifyRisk(primaryFile);
```

### Proposed Change

```javascript
// Compute highest risk across ALL files in the edit set
let risk = 'low';
for (const fp of filePaths) {
  const r = classifyRisk(fp);
  if (r === 'high') { risk = 'high'; break; }
  if (r === 'medium' && risk === 'low') { risk = 'medium'; }
}
```

### Also Update: `src/layer-2-guardrail/server.mjs` (handleEditToolCall)

The MCP server already computes highest risk for impactCheck thresholds (lines 145-150) but this logic should be verified to align with the guard's classification. No code change expected here — just verification that both use `classifyRisk` consistently.

### Verification

1. Unit test: multi-file edit with `[low-risk-file, high-risk-file]` -> classified as HIGH
2. Unit test: single high-risk file -> still HIGH (no regression)
3. Unit test: all low-risk files -> still LOW

### Risk

**Low.** Strictly tightens an existing gate. No new permissions granted. Worst case: some previously-passing edits now require higher evidence threshold (correct behavior).

---

## Fix 3: Challenge-Response Token Namespacing

**Severity:** High
**Issue:** Challenge-response files live at un-namespaced paths (`/tmp/axhy-founder-challenge.json`, `/tmp/axhy-founder-response`). If two repos share the same machine, a challenge issued for repo A can be answered from repo B = cross-repo privilege escalation. Additionally, the challenge-response logic is duplicated in `pre-commit.mjs` (lines 50-107) and `persona-doc-guard.mjs`.

### Implementation

Create a shared module to eliminate duplication and add namespacing:

**New file:** `src/shared/challenge-response.mjs`

```javascript
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);

// NAMESPACED paths (the fix)
const CHALLENGE_FILE = `/tmp/axhy-${REPO_HASH}-founder-challenge.json`;
const RESPONSE_FILE = `/tmp/axhy-${REPO_HASH}-founder-response`;

const EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

export function issueChallenge(scope, files = []) {
  const token = randomBytes(3).toString('hex'); // 6-char hex
  const challenge = {
    token,
    scope,
    files,
    issued_at: Date.now(),
    expires_at: Date.now() + EXPIRY_MS,
    repo_hash: REPO_HASH,
  };
  writeFileSync(CHALLENGE_FILE, JSON.stringify(challenge, null, 2));
  return challenge;
}

export function verifyChallengeResponse(scope) {
  if (!existsSync(CHALLENGE_FILE)) return { valid: false, reason: 'no_challenge' };
  if (!existsSync(RESPONSE_FILE)) return { valid: false, reason: 'no_response' };

  const challenge = JSON.parse(readFileSync(CHALLENGE_FILE, 'utf-8'));
  const response = readFileSync(RESPONSE_FILE, 'utf-8').trim();

  // Scope must match
  if (challenge.scope !== scope) return { valid: false, reason: 'scope_mismatch' };
  // Not expired
  if (Date.now() > challenge.expires_at) return { valid: false, reason: 'expired' };
  // Token must match
  if (response !== challenge.token) return { valid: false, reason: 'token_mismatch' };
  // Repo hash must match (defense-in-depth against file moves)
  if (challenge.repo_hash !== REPO_HASH) return { valid: false, reason: 'repo_mismatch' };

  return { valid: true, token: challenge.token, files: challenge.files };
}

export function getResponseFilePath() {
  return RESPONSE_FILE;
}

export function getChallengeFilePath() {
  return CHALLENGE_FILE;
}
```

### Files to Refactor

| File | Change |
|------|--------|
| `src/layer-4-git/pre-commit.mjs` | Replace inline challenge-response logic (lines 50-107) with `import { issueChallenge, verifyChallengeResponse } from '../shared/challenge-response.mjs'` |
| `src/audit/persona-doc-guard.mjs` | Replace `verifyChallengeResponse` and `issueChallenge` functions with imports from shared module |

### Verification

1. Unit test: challenge issued in repo A, response file from repo B -> rejected (repo_mismatch)
2. Unit test: challenge with scope 'locked_docs', verify with scope 'persona_docs' -> rejected (scope_mismatch)
3. Unit test: expired token -> rejected
4. Unit test: valid flow (issue -> respond -> verify) -> accepted
5. Integration: `git commit` with locked doc change -> challenge issued at namespaced path -> response at namespaced path -> commit proceeds

### Risk

**Medium.** Refactoring two files that run in git hooks. Must ensure the new shared module is importable from both call sites (same relative path assumptions). Testing must cover the git hook integration path.

---

## Fix 5: HMAC Unsigned Fallback Removal

**Severity:** Medium
**Issue:** `pre-edit-guard.mjs` `readFromAnyVerified()` tracks a `bestUnsigned` state file as fallback. If no signed state is found, it returns the unsigned one. Since all writers now call `signState()`, this fallback is dead code that weakens the integrity guarantee.

### File to Change

`src/layer-1-hook/pre-edit-guard.mjs`

### Current Logic (in readFromAnyVerified)

```javascript
let best = null;
let bestUnsigned = null;
// ... loop over state files ...
if (verifyState(parsed)) {
  best = parsed;  // HMAC valid
} else {
  bestUnsigned = parsed;  // HMAC missing/invalid
}
// ...
return best || bestUnsigned;  // <-- THE FALLBACK
```

### Proposed Change

```javascript
let best = null;
// ... loop over state files ...
if (verifyState(parsed)) {
  best = parsed;  // HMAC valid
} else {
  // Log warning but do NOT use unsigned state
  process.stderr.write(`[axhy] WARNING: unsigned state file found, ignoring\n`);
}
// ...
return best;  // No fallback — unsigned state is rejected
```

### Verification

1. Unit test: only unsigned state files exist -> returns null (edit blocked)
2. Unit test: signed state exists -> returns it (no regression)
3. Unit test: mix of signed + unsigned -> returns signed, ignores unsigned
4. Integration: full edit flow with valid approval -> still works

### Risk

**Low.** All state writers sign since the HMAC implementation. If any edge case still produces unsigned state, this fix will surface it as a hard block (correct — we WANT to know about unsigned state rather than silently trusting it).

---

## Fix 4: Workflow Cycle Resolution (Option B)

**Severity:** High
**Issue:** `check_before_commit` requires `check_before_done` (line 177-198), but `check_before_done` requires files to be committed via `git status --porcelain` check (lines 32-49, called at line ~305-313). This creates a deadlock: can't commit without done, can't done without commit.

### Resolution: Option B — Remove Git Status Check from Done

The correct flow is: build -> edit -> done -> commit. The done-checkpoint is a "before commit" self-audit, not a "post-commit" verification. Remove the git status requirement.

### File to Change

`src/layer-2-guardrail/check-before-done.mjs`

### Changes

1. **Remove `checkFilesCommitted` function** (lines ~32-49)
2. **Remove the call to `checkFilesCommitted`** (line ~305-313 area)
3. **Update file header comment** from "after commit" to "before commit — slice self-audit gate"
4. **Update any error messages** referencing "files must be committed"

### What Stays

Everything else in check_before_done stays:
- Intent quality check
- Done memo path validation
- Slice name/files validation
- Typecheck verification
- Test verification
- Screenshot requirement for UI files
- Coverage notes
- Self-reasoning summary
- Handoff update check
- Enterprise preflight (build state) verification
- Declaration-vs-delivery diff

### Verification

1. Full workflow test: check_before_build -> check_before_edit -> check_before_done -> check_before_commit (no deadlock)
2. Unit test: check_before_done with uncommitted files -> now passes (no git status gate)
3. Unit test: check_before_commit still requires check_before_done state to exist
4. Existing done-gate tests still pass (they test quality criteria, not git status)

### Risk

**Medium.** Removing a check. But the check was WRONG (created a deadlock). The real protection is that check_before_commit gates on done-state existing — you can't skip the done self-audit. The git status check added no security value because you couldn't reach it without having already passed all the quality gates.

---

## Fix 6: Additional check_before_commit Tests

**Severity:** Low (but prevents regressions of Fixes 1-5)

### Test File

`tests/safety-fixes.test.mjs` (new file, 19 tests)

### Test Groups

**Group 1: Done-Checkpoint Gate (4 tests)**
- commit with build state but no done state -> blocked
- commit with build state AND done state (same slice) -> passes done gate
- commit without build state -> done gate not enforced (operational commits)
- commit with done state for DIFFERENT slice than build state -> blocked

**Group 2: Cross-File Auditor Integration (3 tests)**
- function signature change in file A, caller in file B not updated -> warning
- function signature change with caller updated -> no warning
- renamed export with stale import in dependent -> warning

**Group 3: Dependency Scanner (2 tests)**
- broken import path -> blocker
- changed file with untouched dependents -> warning

**Group 4: Surface Scanner (3 tests)**
- UI file changed without visual evidence -> blocker
- UI file changed with valid visual evidence manifest -> passes
- non-UI file changed -> no surface requirement

**Group 5: Challenge + Deferral (4 tests)**
- valid challenge accepted -> finding removed from blockers
- invalid challenge (wrong finding_id) -> finding stays
- founder-approved deferral -> blocker moved to deferred list
- deferral for non-existent finding_id -> no effect

**Group 6: Full Pipeline (3 tests)**
- clean slice (no patterns, deps ok, surface ok) -> passed=true
- missing slice_name -> immediate reject
- missing tests_run -> immediate reject

### Also Add to Existing Test Files

- `tests/layer-1-hook.test.mjs`: 2 tests for exit code 2 on crash (Fix 1)
- `tests/layer-2-guardrail.test.mjs`: 3 tests for multi-file risk classification (Fix 2)

### Verification

All 24 new tests pass. Existing 448 tests still pass.

### Risk

**None.** Tests only. No production code changes.

---

## Implementation Checklist

- [ ] Fix 1: Change exit(0) to exit(2) in bash-guard.mjs and pre-edit-guard.mjs
- [ ] Fix 2: Loop over all files for risk classification in pre-edit-guard.mjs
- [ ] Fix 3: Create shared/challenge-response.mjs, refactor pre-commit.mjs and persona-doc-guard.mjs
- [ ] Fix 5: Remove bestUnsigned fallback in pre-edit-guard.mjs readFromAnyVerified
- [ ] Fix 4: Remove checkFilesCommitted from check-before-done.mjs, update header
- [ ] Fix 6: Write 24 new tests across safety-fixes.test.mjs and existing test files
- [ ] Run full test suite (448 existing + 24 new = 472 tests)
- [ ] Commit with message describing all 6 fixes

---

## What This Plan Does NOT Do

- Does not touch CORE_MIND.md or ENTERPRISE_PRODUCTION_STANDARD.md
- Does not implement Book Architecture (deferred)
- Does not optimize tokens (deferred)
- Does not weaken any existing gate (strictly tightens)
- Does not change config values (budgets, windows, thresholds)
- Does not modify locked docs
- Does not add new features or change existing workflow semantics

---

## Approval Request

Akshay — this plan covers the 6 safety fixes from the review panel. Each fix has exact file paths, line numbers, current vs proposed code, verification steps, and risk assessment. Implementation order minimizes blast radius (highest severity first, tests last).

**Ready to implement on your approval.**
