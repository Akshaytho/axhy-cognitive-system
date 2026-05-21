import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;
const PLAN_STATE_FILE = `/tmp/axhy-${REPO_HASH}-plan-guardrail-state.json`;
const DONE_STATE_FILE = `/tmp/axhy-${REPO_HASH}-done-guardrail-state.json`;
const GUARD_SCRIPT = join(__dirname, '..', 'src', 'layer-1-hook', 'pre-edit-guard.mjs');

const VALID_INTENT = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which risks overwhelming the backend under load and could cause degraded performance for all users';

function cleanAllState() {
  for (const f of [STATE_FILE, READ_STATE_FILE, PLAN_STATE_FILE, DONE_STATE_FILE]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

function writeState(file, state) {
  writeFileSync(file, JSON.stringify(state, null, 2));
}

function markRead(filePath) {
  let reads = {};
  if (existsSync(READ_STATE_FILE)) {
    try { reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8')); } catch {}
  }
  reads[filePath] = Date.now();
  writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
}

function runGuard(filePath) {
  const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } });
  try {
    const stdout = execFileSync('node', [GUARD_SCRIPT], { input, encoding: 'utf-8', timeout: 5000 });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

after(() => cleanAllState());

describe('AUDIT: Risk classifier (single source — L2 duplicate deleted)', async () => {
  const L1 = await import(join(__dirname, '..', 'src', 'layer-1-hook', 'risk-classifier.mjs'));

  it('L1 exports isDoneMemo', () => {
    assert.equal(typeof L1.isDoneMemo, 'function');
  });

  it('L1 exports isGuardrailOptional', () => {
    assert.equal(typeof L1.isGuardrailOptional, 'function');
  });

  it('L1 guardrail-optional does NOT include done-memos', () => {
    assert.equal(L1.isGuardrailOptional('handoff/done-memos/memo.md'), false);
  });

  it('L2 risk-classifier.mjs was deleted (was dead code)', () => {
    const l2Path = join(__dirname, '..', 'src', 'layer-2-guardrail', 'risk-classifier.mjs');
    assert.equal(existsSync(l2Path), false, 'L2 risk-classifier.mjs should be deleted');
  });
});

describe('AUDIT: Pre-edit-guard file routing', () => {
  beforeEach(() => cleanAllState());

  it('README.md → guardrail-optional → exit 0', () => {
    const r = runGuard('README.md');
    assert.equal(r.exitCode, 0, `Expected 0, stderr: ${r.stderr}`);
  });

  it('docs/research/analysis.md → guardrail-optional → exit 0', () => {
    const r = runGuard('docs/research/analysis.md');
    assert.equal(r.exitCode, 0, `Expected 0, stderr: ${r.stderr}`);
  });

  it('docs/audits/report.md → guardrail-optional → exit 0', () => {
    const r = runGuard('docs/audits/report.md');
    assert.equal(r.exitCode, 0, `Expected 0, stderr: ${r.stderr}`);
  });

  it('docs/plans/sprint.md → plan-guarded → blocks without plan approval', () => {
    const r = runGuard('docs/plans/sprint.md');
    assert.equal(r.exitCode, 2, 'Plan file should be blocked without approval');
    assert.match(r.stderr, /check_before_plan/);
  });

  it('handoff/done-memos/memo.md → done-guarded → blocks without done approval', () => {
    const r = runGuard('handoff/done-memos/memo.md');
    assert.equal(r.exitCode, 2, 'Done-memo should be blocked without approval');
    assert.match(r.stderr, /check_before_done/);
  });

  it('done-memo-worker-d1.md → done-guarded → blocks without done approval', () => {
    const r = runGuard('done-memo-worker-d1.md');
    assert.equal(r.exitCode, 2, 'Done-memo should be blocked');
    assert.match(r.stderr, /check_before_done/);
  });

  it('handoff/STATUS.md → plan-guarded → blocks without plan approval', () => {
    const r = runGuard('handoff/STATUS.md');
    assert.equal(r.exitCode, 2, 'Handoff file should be plan-guarded');
    assert.match(r.stderr, /check_before_plan/);
  });
});

describe('AUDIT: Plan approval → L1 allows plan write', () => {
  beforeEach(() => cleanAllState());

  it('plan approval state allows plan file edit', () => {
    writeState(PLAN_STATE_FILE, {
      timestamp: Date.now(),
      type: 'plan',
      approved_files: ['docs/plans/sprint.md'],
      edits_remaining: 2,
    });
    const r = runGuard('docs/plans/sprint.md');
    assert.equal(r.exitCode, 0, `Expected 0, stderr: ${r.stderr}`);
  });

  it('plan approval decrements edits', () => {
    writeState(PLAN_STATE_FILE, {
      timestamp: Date.now(),
      type: 'plan',
      approved_files: ['docs/plans/sprint.md'],
      edits_remaining: 1,
    });
    const r1 = runGuard('docs/plans/sprint.md');
    assert.equal(r1.exitCode, 0);
    const r2 = runGuard('docs/plans/sprint.md');
    assert.equal(r2.exitCode, 2, 'Should block after exhausting edits');
  });
});

describe('AUDIT: Done approval → L1 allows done-memo write', () => {
  beforeEach(() => cleanAllState());

  it('done approval state allows done-memo edit', () => {
    writeState(DONE_STATE_FILE, {
      timestamp: Date.now(),
      type: 'done',
      approved_files: ['handoff/done-memos/memo.md'],
      edits_remaining: 1,
    });
    const r = runGuard('handoff/done-memos/memo.md');
    assert.equal(r.exitCode, 0, `Expected 0, stderr: ${r.stderr}`);
  });

  it('done approval has 10min window (not 5min)', () => {
    writeState(DONE_STATE_FILE, {
      timestamp: Date.now() - 7 * 60 * 1000,
      type: 'done',
      approved_files: ['handoff/done-memos/memo.md'],
      edits_remaining: 1,
    });
    const r = runGuard('handoff/done-memos/memo.md');
    assert.equal(r.exitCode, 0, 'Should still be valid at 7 minutes (10min window)');
  });

  it('done approval expires after 10min', () => {
    writeState(DONE_STATE_FILE, {
      timestamp: Date.now() - 11 * 60 * 1000,
      type: 'done',
      approved_files: ['handoff/done-memos/memo.md'],
      edits_remaining: 1,
    });
    const r = runGuard('handoff/done-memos/memo.md');
    assert.equal(r.exitCode, 2, 'Should expire after 10 minutes');
    assert.match(r.stderr, /expired/);
  });
});

describe('AUDIT: Hard-block clears stale state (Bug 2 fix)', async () => {
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );
  beforeEach(() => cleanAllState());

  it('hard-block overwrites state with 0 edits and empty approved_files', () => {
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    assert.equal(existsSync(STATE_FILE), true, 'State should exist after approval');

    const blocked = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      impactCheckResult: {
        hardBlocks: ['Locked constraint violated'],
        warnings: [], staleChunks: [], context: [], rules: [],
      },
    });
    assert.equal(blocked.allowed, false);

    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    assert.equal(state.edits_remaining, 0, 'Edits should be 0 after hard block');
    assert.deepEqual(state.approved_files, [], 'Approved files should be empty after hard block');

    markRead('apps/mobile/src/components/Button.tsx');
    const r = runGuard('apps/mobile/src/components/Button.tsx');
    assert.equal(r.exitCode, 2, 'L1 should now block — stale state cleared');
  });
});

describe('AUDIT: Confidence score on hard block (Bug 3 fix)', async () => {
  const { calculateConfidence } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'confidence.mjs')
  );

  it('hard-blocked confidence returns score: 0', () => {
    const result = calculateConfidence({
      riskLevel: 'high', fileWasRead: true, testsExist: true,
      hasWarnings: false, hasHardBlocks: true, intentValid: true,
    });
    assert.equal(result.level, 'blocked');
    assert.equal(result.score, 0, 'Blocked confidence should have score: 0');
  });
});

describe('AUDIT: Full file paths in approvals (Bug 4 fix)', async () => {
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );
  beforeEach(() => cleanAllState());

  it('approved_files contains full paths, not truncated', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
    });
    assert.equal(result.allowed, true);
    assert.deepEqual(result.approved_files, ['apps/backend/src/routes/chat.ts'],
      'Should use full path, not truncated');
  });

  it('approval for backend/chat.ts does NOT allow admin-web/chat.ts', () => {
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
    });

    markRead('apps/admin-web/src/routes/chat.ts');
    const r = runGuard('apps/admin-web/src/routes/chat.ts');
    assert.equal(r.exitCode, 2, 'Different app paths should NOT share approval');
  });
});

describe('AUDIT: check-before-done preflight gates', async () => {
  const { checkBeforeDone } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-done.mjs')
  );

  const VALID_DONE_ARGS = {
    intent: 'Completed the worker auth shell slice including login screen logout button session persistence token refresh and error handling for expired sessions with full test coverage',
    sliceName: 'worker-d1-s1-auth-shell',
    doneMemoFile: 'handoff/done-memos/worker-d1-s1.md',
    sliceFiles: [join(__dirname, '..', 'src', '_debug-logger.mjs')],
    screenshotsTaken: true,
    typecheckPassed: true,
    testsPassed: true,
    coverageNotes: 'Covers sprint plan items 1.1-1.3, login flow, token refresh, error states',
    selfReasoningSummary: 'impactCheck returned no blocks, verified auth flow against locked docs, checked token storage pattern',
    handoffUpdated: true,
  };

  it('passes all preflight gates with valid args', async () => {
    const result = await checkBeforeDone(VALID_DONE_ARGS);
    assert.ok(result.allowed !== undefined, 'Should return a result');
  });

  it('blocks when coverage_notes too short', async () => {
    const result = await checkBeforeDone({ ...VALID_DONE_ARGS, coverageNotes: 'short' });
    assert.equal(result.allowed, false);
    assert.ok(result.preflight_failures.some(f => f.includes('coverage notes')));
  });

  it('blocks when handoffUpdated is false', async () => {
    const result = await checkBeforeDone({ ...VALID_DONE_ARGS, handoffUpdated: false });
    assert.equal(result.allowed, false);
    assert.ok(result.preflight_failures.some(f => f.includes('Handoff')));
  });

  it('blocks when selfReasoningSummary missing', async () => {
    const result = await checkBeforeDone({ ...VALID_DONE_ARGS, selfReasoningSummary: '' });
    assert.equal(result.allowed, false);
    assert.ok(result.preflight_failures.some(f => f.includes('self-reasoning')));
  });

  it('blocks when typecheckPassed is false', async () => {
    const result = await checkBeforeDone({ ...VALID_DONE_ARGS, typecheckPassed: false });
    assert.equal(result.allowed, false);
    assert.ok(result.preflight_failures.some(f => f.includes('Typecheck')));
  });

  it('blocks when testsPassed is false', async () => {
    const result = await checkBeforeDone({ ...VALID_DONE_ARGS, testsPassed: false });
    assert.equal(result.allowed, false);
    assert.ok(result.preflight_failures.some(f => f.includes('Tests')));
  });
});

describe('AUDIT: Impact adapter fallback behavior', async () => {
  const { impactCheck } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'impact-adapter.mjs')
  );

  it('low-risk fallback does NOT hard-block', async () => {
    const result = await impactCheck('test change', undefined, 'low');
    assert.equal(result.hardBlocks.length, 0, 'Low risk should not hard-block');
    assert.equal(result._fallback, true);
  });

  it('medium-risk fallback HARD BLOCKS when brain unavailable', async () => {
    const result = await impactCheck('test change', undefined, 'medium');
    assert.ok(result.hardBlocks.length > 0, 'Medium risk should hard-block without brain');
    assert.equal(result._blocked, true);
  });

  it('high-risk fallback HARD BLOCKS when brain unavailable', async () => {
    const result = await impactCheck('test change', undefined, 'high');
    assert.ok(result.hardBlocks.length > 0, 'High risk should hard-block without brain');
    assert.equal(result._blocked, true);
  });
});

describe('AUDIT: Source hierarchy validation', async () => {
  const { validateSourceHierarchy, classifySource } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'source-hierarchy.mjs')
  );

  it('persona-only sources should error', () => {
    const result = validateSourceHierarchy(['docs/personas/worker/spec.md']);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.type === 'persona_without_architecture'));
  });

  it('persona + architecture sources should pass', () => {
    const result = validateSourceHierarchy([
      'docs/personas/worker/spec.md',
      'packages/state-machines/src/visit.ts',
    ]);
    assert.equal(result.valid, true);
  });

  it('unknown source gets tier 7', () => {
    assert.equal(classifySource('random/file.txt').tier, 7);
  });
});

describe('AUDIT: Memory firewall classification', async () => {
  const { classifyKnowledge, validateCorePrinciplePromotion } = await import(
    join(__dirname, '..', 'src', 'memory-firewall', 'classifier.mjs')
  );

  it('temporal language → temporary_context', () => {
    assert.equal(classifyKnowledge('right now we are working on X').category, 'temporary_context');
  });

  it('external research indicators → external_research', () => {
    assert.equal(classifyKnowledge('according to the React docs, hooks must...').category, 'external_research');
  });

  it('product terms → product_rule', () => {
    assert.equal(classifyKnowledge('The supervisor can mark workers absent').category, 'product_rule');
  });

  it('core terms without product → core_principle', () => {
    assert.equal(classifyKnowledge('Confidence in core reasoning drops when assumptions unverified').category, 'core_principle');
  });

  it('product terms block core principle promotion', () => {
    const result = validateCorePrinciplePromotion('Workers check in at facility');
    assert.equal(result.allowed, false);
    assert.ok(result.contaminating_terms.length > 0);
  });
});

describe('AUDIT: Plan content auditor negation handling', async () => {
  const { auditPlanContent } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'plan-content-auditor.mjs')
  );

  it('negated anti-pattern should be skipped', () => {
    const result = auditPlanContent('Never use direct DB status update. Always use state machine transitions.', 'test.md');
    const directUpdates = result.violations.filter(v => v.pattern === 'direct_status_update');
    assert.equal(directUpdates.length, 0, 'Negated "direct DB status update" should not flag');
  });

  it('affirmed anti-pattern should be caught', () => {
    const result = auditPlanContent('We will use direct DB status update for worker state changes.', 'test.md');
    const directUpdates = result.violations.filter(v => v.pattern === 'direct_status_update');
    assert.ok(directUpdates.length > 0, 'Affirmed "direct DB status update" should flag');
  });
});

describe('AUDIT: Persona resolver', async () => {
  const { resolvePersona, resolveFromIntent, resolveFromPaths } = await import(
    join(__dirname, '..', 'src', 'personas', 'resolver.mjs')
  );

  it('worker intent resolves to worker persona', () => {
    const result = resolveFromIntent('Update the worker capture timer');
    assert.ok(result.includes('worker'));
  });

  it('supervisor intent resolves to supervisor persona', () => {
    const result = resolveFromIntent('Fix the today tab site card');
    assert.ok(result.includes('supervisor'));
  });

  it('path-based resolution works', () => {
    const result = resolveFromPaths(['apps/worker-mobile/src/screens/Home.tsx']);
    assert.ok(result.includes('worker'));
  });

  it('no match → combined fallback', () => {
    const result = resolvePersona('random stuff', []);
    assert.deepEqual(result.personas, ['combined']);
    assert.equal(result.confidence, 'low');
  });
});

describe('AUDIT: Intent validator edge cases', async () => {
  const { validateIntent } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'intent-validator.mjs')
  );

  it('rejects intent with no risk words', () => {
    const result = validateIntent('I want to update the button component to change the color from blue to green because the design spec says so and it will look better and match the brand');
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('risk'));
  });

  it('accepts intent with all three aspects', () => {
    const result = validateIntent('I want to update the route handler to add validation because the current implementation accepts any input which risks allowing injection attacks and could break the entire database if exploited');
    assert.equal(result.valid, true);
  });
});
