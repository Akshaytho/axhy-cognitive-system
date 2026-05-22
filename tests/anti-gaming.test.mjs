import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT = process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;
const PLAN_STATE_FILE = `/tmp/axhy-${REPO_HASH}-plan-guardrail-state.json`;
const DONE_STATE_FILE = `/tmp/axhy-${REPO_HASH}-done-guardrail-state.json`;
const AUDIT_LOG_FILE = `/tmp/axhy-${REPO_HASH}-audit.jsonl`;
const BASH_GUARD = './src/layer-1-hook/bash-guard.mjs';
const NODE = process.execPath;

const WORKSPACE_ROOTS = [
  '/Users/thotaakshay/eclean_workspace',
  '/Users/thotaakshay/eclean_workspace/axhy-v3',
  '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system',
];

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function cleanup() {
  for (const h of allHashes()) {
    for (const suffix of ['guardrail-state.json', 'read-state.json', 'plan-guardrail-state.json', 'done-guardrail-state.json', 'audit.jsonl']) {
      try { unlinkSync(`/tmp/axhy-${h}-${suffix}`); } catch {}
    }
  }
}

function runBashGuard(command) {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  try {
    execSync(`echo '${input.replace(/'/g, "'\\''")}' | ${NODE} ${BASH_GUARD}`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { blocked: false };
  } catch (err) {
    if (err.status === 2) {
      return { blocked: true, stderr: err.stderr };
    }
    return { blocked: false, error: err.message };
  }
}

describe('ANTI-GAMING: Bash guard blocks state file writes', () => {
  before(cleanup);
  after(cleanup);

  it('blocks direct write to guardrail-state.json', () => {
    const r = runBashGuard(`echo '{}' > /tmp/axhy-${REPO_HASH}-guardrail-state.json`);
    assert.equal(r.blocked, true, 'Should block direct state write');
    assert.ok(r.stderr.includes('BLOCKED'), 'Should show BLOCKED message');
  });

  it('blocks direct write to read-state.json', () => {
    const r = runBashGuard(`echo '{}' > /tmp/axhy-${REPO_HASH}-read-state.json`);
    assert.equal(r.blocked, true);
  });

  it('blocks direct write to plan-guardrail-state.json', () => {
    const r = runBashGuard(`echo '{}' > /tmp/axhy-${REPO_HASH}-plan-guardrail-state.json`);
    assert.equal(r.blocked, true);
  });

  it('blocks direct write to done-guardrail-state.json', () => {
    const r = runBashGuard(`echo '{}' > /tmp/axhy-${REPO_HASH}-done-guardrail-state.json`);
    assert.equal(r.blocked, true);
  });

  it('blocks writeFileSync to state path', () => {
    const r = runBashGuard(`node -e "fs.writeFileSync('/tmp/axhy-abc12345-guardrail-state.json', '{}')"` );
    assert.equal(r.blocked, true);
  });

  it('blocks edits_remaining inflation', () => {
    const r = runBashGuard('node -e "s.edits_remaining = 20"');
    assert.equal(r.blocked, true);
  });

  it('blocks AXHY_AUDIT_EMERGENCY=1', () => {
    const r = runBashGuard('AXHY_AUDIT_EMERGENCY=1 git commit -m "bypass"');
    assert.equal(r.blocked, true);
  });

  it('blocks AXHY_FOUNDER_APPROVED=1', () => {
    const r = runBashGuard('AXHY_FOUNDER_APPROVED=1 git commit -m "bypass"');
    assert.equal(r.blocked, true);
  });

  it('blocks tee to state file', () => {
    const r = runBashGuard(`echo '{}' | tee /tmp/axhy-abc12345-guardrail-state.json`);
    assert.equal(r.blocked, true);
  });

  it('allows normal bash commands', () => {
    const r = runBashGuard('ls -la src/');
    assert.equal(r.blocked, false);
  });

  it('allows git commands', () => {
    const r = runBashGuard('git status');
    assert.equal(r.blocked, false);
  });

  it('allows node test commands', () => {
    const r = runBashGuard('node --test tests/anti-gaming.test.mjs');
    assert.equal(r.blocked, false);
  });

  it('allows grep on state files (read only)', () => {
    const r = runBashGuard(`cat /tmp/axhy-${REPO_HASH}-guardrail-state.json`);
    assert.equal(r.blocked, false);
  });
});

describe('ANTI-GAMING: Audit log records events', () => {
  before(cleanup);
  after(cleanup);

  it('logApprovalCreated writes to audit log', async () => {
    const { logApprovalCreated } = await import('../src/layer-2-guardrail/audit-log.mjs');
    logApprovalCreated({
      tool: 'check_before_edit',
      intent: 'test intent for audit',
      approvedFiles: ['src/test.ts'],
      editsRemaining: 3,
      confidence: 'high',
    });

    assert.ok(existsSync(AUDIT_LOG_FILE), 'Audit log should exist');
    const lines = readFileSync(AUDIT_LOG_FILE, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.equal(entry.event, 'approval_created');
    assert.equal(entry.tool, 'check_before_edit');
    assert.deepEqual(entry.approved_files, ['src/test.ts']);
    assert.equal(entry.edits_remaining, 3);
  });

  it('logApprovalConsumed writes to audit log', async () => {
    const { logApprovalConsumed } = await import('../src/layer-2-guardrail/audit-log.mjs');
    logApprovalConsumed({
      tool: 'check_before_edit',
      file: 'src/test.ts',
      editsRemainingAfter: 2,
    });

    const lines = readFileSync(AUDIT_LOG_FILE, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.equal(entry.event, 'approval_consumed');
    assert.equal(entry.file, 'src/test.ts');
    assert.equal(entry.edits_remaining_after, 2);
  });

  it('logApprovalDenied writes to audit log', async () => {
    const { logApprovalDenied } = await import('../src/layer-2-guardrail/audit-log.mjs');
    logApprovalDenied({
      tool: 'check_before_edit',
      file: 'CLAUDE.md',
      reason: 'Hard blocks from locked constraints.',
    });

    const lines = readFileSync(AUDIT_LOG_FILE, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.equal(entry.event, 'approval_denied');
    assert.equal(entry.reason, 'Hard blocks from locked constraints.');
  });

  it('verifyFileHasApproval finds matching approval', async () => {
    const { verifyFileHasApproval } = await import('../src/layer-2-guardrail/audit-log.mjs');
    const result = verifyFileHasApproval('src/test.ts');
    assert.equal(result.hasApproval, true);
    assert.equal(result.wasConsumed, true);
  });

  it('verifyFileHasApproval returns false for unknown file', async () => {
    const { verifyFileHasApproval } = await import('../src/layer-2-guardrail/audit-log.mjs');
    const result = verifyFileHasApproval('src/never-approved.ts');
    assert.equal(result.hasApproval, false);
    assert.equal(result.wasConsumed, false);
  });
});

describe('ANTI-GAMING: UX friction reduction', () => {
  it('low-risk files get 8 edits', async () => {
    const { classifyRisk } = await import('../src/layer-1-hook/risk-classifier.mjs');
    const r = classifyRisk('apps/worker/src/components/Button.tsx');
    assert.equal(r.editsAllowed, 8);
  });

  it('medium-risk files get 5 edits', async () => {
    const { classifyRisk } = await import('../src/layer-1-hook/risk-classifier.mjs');
    const r = classifyRisk('apps/backend/src/routes/visit.ts');
    assert.equal(r.editsAllowed, 5);
  });

  it('high-risk files still get 1 edit', async () => {
    const { classifyRisk } = await import('../src/layer-1-hook/risk-classifier.mjs');
    const r = classifyRisk('CLAUDE.md');
    assert.equal(r.editsAllowed, 1);
  });
});
