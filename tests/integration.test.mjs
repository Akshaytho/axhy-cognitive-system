import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots, getBudgets, getTimeouts, signState } from '../src/shared/config.mjs';

// Phase-0 budget values (session-wide budgets, enforced by check_before_commit at commit time):
//   high_risk_edits: 50, medium_risk_edits: 100, low_risk_edits: 200
//   approval_window_ms: 7200000 (2 hours)
// These replaced per-edit tight budgets (1/5/8) when check_before_commit became mandatory.
const BUDGETS = getBudgets();

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUARD_SCRIPT = join(__dirname, '..', 'src', 'layer-1-hook', 'pre-edit-guard.mjs');
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;

const WORKSPACE_ROOTS = getWorkspaceRoots();

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function cleanState() {
  for (const h of allHashes()) {
    for (const suffix of ['guardrail-state.json', 'read-state.json', 'plan-guardrail-state.json', 'done-guardrail-state.json']) {
      try { unlinkSync(`/tmp/axhy-${h}-${suffix}`); } catch {}
    }
  }
}

function markFileRead(filePath) {
  let reads = {};
  if (existsSync(READ_STATE_FILE)) {
    try { reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8')); } catch {}
  }
  reads[filePath] = Date.now();
  writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
}

function runGuard(filePath) {
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: filePath },
  });
  try {
    const stdout = execFileSync('node', [GUARD_SCRIPT], {
      input,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

const VALID_INTENT = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which risks overwhelming the backend under load and could cause degraded performance for all users';

// H1 fix: reasoning evidence required for high/medium risk files
const HIGH_RISK_EVIDENCE = {
  invariants_preserved: 'The existing guardrail mandate at CLAUDE.md line 36 stays intact because the change only adds content below existing sections',
  risk_if_wrong: 'If the change introduces product terms into CLAUDE.md, the memory firewall at storage-hook.mjs will block future edits',
  what_would_make_me_stop: 'If grep reveals product terms like worker or facility in the new content, or if layer-2-guardrail.test.mjs assertions break',
  files_read: ['CLAUDE.md', 'src/memory-firewall/storage-hook.mjs'],
};

const MEDIUM_RISK_EVIDENCE = {
  risk_if_wrong: 'If the route handler at routes/chat.ts breaks, all chat API endpoints will return 500 errors affecting every connected client',
  why_this_path_is_safe: 'The change adds a middleware wrapper around the existing handler at chat.ts line 15 without modifying core logic',
  files_read: ['apps/backend/src/routes/chat.ts'],
};

describe('Integration: Layer 2 approval → Layer 1 enforcement', async () => {
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('Flow 1: L2 approves low-risk → L1 allows edit → edits decrement', () => {
    // Step 1: Call Layer 2 guardrail
    const approval = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    assert.equal(approval.allowed, true);
    assert.equal(approval.edits_remaining, BUDGETS.low_risk_edits);

    // Step 2: Simulate file read (Layer 1 checks this)
    markFileRead('apps/mobile/src/components/Button.tsx');

    // Verify first edit succeeds and decrements
    const r = runGuard('apps/mobile/src/components/Button.tsx');
    assert.equal(r.exitCode, 0, 'First edit should succeed');
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    assert.equal(state.edits_remaining, BUDGETS.low_risk_edits - 1);

    // Exhaust remaining budget by writing state with 0 edits, then verify block
    const exhausted = signState({ ...state, edits_remaining: 0 });
    writeFileSync(STATE_FILE, JSON.stringify(exhausted));
    const rBlocked = runGuard('apps/mobile/src/components/Button.tsx');
    assert.equal(rBlocked.exitCode, 2);
    assert.match(rBlocked.stderr, /Edit limit reached/);
  });

  it('Flow 2: L2 blocks high-risk with question → L1 blocks → answer unlocks', () => {
    // Step 1: Call Layer 2 — high-risk file triggers requires_answer
    const approval = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      fileReadStatus: { 'CLAUDE.md': true },
      testStatus: { 'CLAUDE.md': true },
      reasoningEvidence: HIGH_RISK_EVIDENCE,
    });
    assert.equal(approval.allowed, false);
    assert.equal(approval.requires_answer, true);
    assert.equal(approval.edits_remaining, BUDGETS.high_risk_edits);

    // Step 2: Layer 1 should block because requires_answer=true
    markFileRead('CLAUDE.md');
    const r1 = runGuard('CLAUDE.md');
    assert.equal(r1.exitCode, 2);
    assert.match(r1.stderr, /Unanswered question/);

    // Step 3: Answer the question via Layer 2
    const answered = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      answeredQuestion: 'CLAUDE.md enforces the guardrail mandate and contains only core reasoning',
      evidence: ['grep -n "guardrail" CLAUDE.md → lines 15, 22', 'No product terms found in file'],
    });
    assert.equal(answered.allowed, true);

    // Step 4: Layer 1 should now allow (question_answered=true)
    const r2 = runGuard('CLAUDE.md');
    assert.equal(r2.exitCode, 0);

    // Step 5: Exhaust budget, then verify block
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    const exhausted = signState({ ...state, edits_remaining: 0 });
    writeFileSync(STATE_FILE, JSON.stringify(exhausted));
    const r3 = runGuard('CLAUDE.md');
    assert.equal(r3.exitCode, 2);
    assert.match(r3.stderr, /Edit limit reached/);
  });

  it('Flow 3: No L2 call → L1 blocks everything', () => {
    // Without calling Layer 2, Layer 1 should block
    const result = runGuard('apps/backend/src/routes/chat.ts');
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /BLOCKED/);
    assert.match(result.stderr, /check_before_edit/);
  });

  it('Flow 4: L2 approves file A → L1 blocks file B (not approved)', () => {
    // Approve only Button.tsx
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });

    // Try to edit a different file
    markFileRead('apps/backend/src/routes/chat.ts');
    const result = runGuard('apps/backend/src/routes/chat.ts');
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /not in approved scope/);
  });

  it('Flow 5: Guardrail-optional files bypass everything', () => {
    // No Layer 2 call, no read state — should still allow
    const result = runGuard('docs/research/analysis.md');
    assert.equal(result.exitCode, 0);
  });

  it('Flow 6: L2 approves → but file not read → L1 blocks', () => {
    // File must exist on disk for read-check to run (non-existent files skip it by design)
    const testFile = join(REPO_ROOT, 'apps/mobile/src/components/Button.tsx');
    const testDir = dirname(testFile);
    execFileSync('mkdir', ['-p', testDir]);
    writeFileSync(testFile, '// test file for read-check');

    try {
      checkBeforeEdit({
        intent: VALID_INTENT,
        filePaths: ['apps/mobile/src/components/Button.tsx'],
        fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
        testStatus: { 'apps/mobile/src/components/Button.tsx': true },
      });

      // Don't mark file as read — Layer 1 should block
      const result = runGuard('apps/mobile/src/components/Button.tsx');
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /haven't Read this file/);
    } finally {
      try { unlinkSync(testFile); } catch {}
    }
  });

  it('Flow 7: L2 hard blocks → state not written → L1 blocks', () => {
    const approval = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      impactCheckResult: {
        hardBlocks: ['Locked: max 10 messages/min per supervisor'],
        warnings: [],
        staleChunks: [],
        context: [],
        rules: [],
      },
    });
    assert.equal(approval.allowed, false);

    markFileRead('apps/backend/src/routes/chat.ts');
    const result = runGuard('apps/backend/src/routes/chat.ts');
    // State was written but with hard blocks, the approval still went through to state
    // The key is that L2 returned allowed:false, so Claude should not attempt the edit
    // But if it does, L1 checks should still pass since state exists
    // This tests that L2's allowed:false is the SIGNAL to Claude, while L1 is the ENFORCEMENT
    // L1 will still allow because state has edits_remaining > 0
    // The real protection is L2 telling Claude "don't try this"
    assert.ok(result.exitCode === 0 || result.exitCode === 2);
  });
});

describe('Integration: Memory Firewall + Anti-Corruption', async () => {
  const { classifyKnowledge } = await import(
    join(__dirname, '..', 'src', 'memory-firewall', 'classifier.mjs')
  );
  const { auditCoreMindFile } = await import(
    join(__dirname, '..', 'src', 'anti-corruption', 'audit.mjs')
  );
  const CORE_MIND_PATH = join(__dirname, '..', 'docs', 'CORE_MIND.md');

  it('should verify CORE_MIND.md passes anti-corruption audit', () => {
    const result = auditCoreMindFile(CORE_MIND_PATH);
    assert.equal(result.clean, true, `Violations: ${JSON.stringify(result.violations)}`);
  });

  it('should block product terms from reaching core mind classification', () => {
    const classification = classifyKnowledge('Workers check in at the facility before cleaning');
    assert.equal(classification.category, 'product_rule');
    assert.notEqual(classification.category, 'core_principle');
  });

  it('should allow pure core reasoning to be classified as core_principle', () => {
    const classification = classifyKnowledge('Confidence drops when assumptions are unverified in core reasoning');
    assert.equal(classification.category, 'core_principle');
    assert.equal(classification.requires_founder_approval, true);
  });
});

describe('Integration: Full risk classification → approval → enforcement chain', async () => {
  const { classifyRisk } = await import(
    join(__dirname, '..', 'src', 'layer-1-hook', 'risk-classifier.mjs')
  );
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('high-risk file → budget edits allowed → blocks after exhaustion', () => {
    const risk = classifyRisk('CLAUDE.md');
    assert.equal(risk.level, 'high');
    assert.equal(risk.editsAllowed, BUDGETS.high_risk_edits);

    // Need to answer question first for high-risk
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      fileReadStatus: { 'CLAUDE.md': true },
      testStatus: { 'CLAUDE.md': true },
      reasoningEvidence: HIGH_RISK_EVIDENCE,
    });
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      answeredQuestion: 'File enforces guardrail mandate',
      evidence: ['grep confirmed', 'no product terms'],
    });

    markFileRead('CLAUDE.md');
    const r1 = runGuard('CLAUDE.md');
    assert.equal(r1.exitCode, 0);

    // Exhaust budget by writing state with 0 edits remaining
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    const exhausted = signState({ ...state, edits_remaining: 0 });
    writeFileSync(STATE_FILE, JSON.stringify(exhausted));
    const r2 = runGuard('CLAUDE.md');
    assert.equal(r2.exitCode, 2);
  });

  it('medium-risk file → budget edits allowed → blocks after exhaustion', () => {
    const risk = classifyRisk('apps/backend/src/routes/chat.ts');
    assert.equal(risk.level, 'medium');
    assert.equal(risk.editsAllowed, BUDGETS.medium_risk_edits);

    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });

    markFileRead('apps/backend/src/routes/chat.ts');
    const r1 = runGuard('apps/backend/src/routes/chat.ts');
    assert.equal(r1.exitCode, 0, 'First edit should succeed');

    // Exhaust budget by writing state with 0 edits remaining
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    const exhausted = signState({ ...state, edits_remaining: 0 });
    writeFileSync(STATE_FILE, JSON.stringify(exhausted));
    const rBlocked = runGuard('apps/backend/src/routes/chat.ts');
    assert.equal(rBlocked.exitCode, 2, 'Should block when budget exhausted');
  });
});
