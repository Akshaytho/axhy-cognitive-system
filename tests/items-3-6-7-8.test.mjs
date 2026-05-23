/**
 * Tests for build plan Items 3, 6, 7, 8:
 *
 * Item 3: Build-edit integration — check_before_edit warns about missing/stale
 *         build preflight for new_feature on medium/high-risk files.
 * Item 6: Bash guard — scripting language bypass patterns (python, perl, ruby,
 *         sed, cat, tee, shell redirect) that write workspace files outside Edit.
 * Item 7: Retro handling — docs/retros/*.md classified as guardrail-optional.
 * Item 8: Grep-before-fix — bug_fix changeType triggers a grep warning.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots } from '../src/shared/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);

const WORKSPACE_ROOTS = getWorkspaceRoots();

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function cleanState() {
  for (const h of allHashes()) {
    for (const suffix of [
      'guardrail-state.json', 'read-state.json',
      'plan-guardrail-state.json', 'done-guardrail-state.json',
      'build-guardrail-state.json',
    ]) {
      try { unlinkSync(`/tmp/axhy-${h}-${suffix}`); } catch {}
    }
  }
}

const VALID_INTENT = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which risks overwhelming the backend under load and could cause degraded performance for all users';

// H1 fix: reasoning evidence required for high/medium risk files
const MEDIUM_RISK_EVIDENCE = {
  risk_if_wrong: 'If the route handler at routes/chat.ts breaks, all chat API endpoints will return 500 errors affecting every connected client',
  why_this_path_is_safe: 'The change adds a middleware wrapper around the existing handler at chat.ts line 15 without modifying the core logic or database queries',
  files_read: ['apps/backend/src/routes/chat.ts'],
};

const HIGH_RISK_EVIDENCE = {
  invariants_preserved: 'The existing schema definition at schema.prisma stays intact because the change only adds new model fields below existing definitions',
  risk_if_wrong: 'If the schema migration at schema.prisma breaks, all database operations will fail affecting the entire application stack',
  what_would_make_me_stop: 'If the migration creates a non-reversible schema change or if check-before-build.test.mjs integration tests break',
  files_read: ['prisma/schema.prisma'],
};

// ─── Item 3: Build-edit integration ──────────────────────────────

describe('Item 3: Build-Edit Integration', async () => {
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should warn when new_feature on medium-risk file has no build preflight', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      changeType: 'new_feature',
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });
    const buildWarning = result.warnings.find(w => w.includes('build preflight'));
    assert.ok(buildWarning, 'Should include build preflight warning');
    assert.match(buildWarning, /check_before_build/);
  });

  it('should warn when new_feature on high-risk file has no build preflight', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['prisma/schema.prisma'],
      changeType: 'new_feature',
      fileReadStatus: { 'prisma/schema.prisma': true },
      testStatus: { 'prisma/schema.prisma': true },
      reasoningEvidence: HIGH_RISK_EVIDENCE,
    });
    const buildWarning = result.warnings.find(w => w.includes('build preflight'));
    assert.ok(buildWarning, 'High-risk new_feature should get build preflight warning');
  });

  it('should NOT warn for new_feature on LOW-risk file (no build preflight needed)', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      changeType: 'new_feature',
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    const buildWarning = (result.warnings || []).find(w => w.includes('build preflight'));
    assert.equal(buildWarning, undefined, 'Low-risk files should not trigger build preflight warning');
  });

  it('should NOT warn for bug_fix on medium-risk file (build preflight is for new_feature)', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      changeType: 'bug_fix',
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });
    const buildWarning = (result.warnings || []).find(w => w.includes('enterprise build preflight'));
    assert.equal(buildWarning, undefined, 'bug_fix should not trigger enterprise build preflight warning');
  });

  it('should warn when build preflight is stale (>30 min)', () => {
    // Write a build state that's 35 minutes old
    const staleState = {
      timestamp: Date.now() - 35 * 60 * 1000,
      type: 'build',
      slice_name: 'test-slice',
    };
    for (const h of allHashes()) {
      try {
        writeFileSync(`/tmp/axhy-${h}-build-guardrail-state.json`, JSON.stringify(staleState));
      } catch {}
    }

    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      changeType: 'new_feature',
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });
    const staleWarning = (result.warnings || []).find(w => w.includes('stale'));
    assert.ok(staleWarning, 'Should warn about stale build preflight');
  });

  it('should NOT warn when build preflight is fresh (<30 min)', () => {
    // Write a fresh build state
    const freshState = {
      timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
      type: 'build',
      slice_name: 'test-slice',
    };
    for (const h of allHashes()) {
      try {
        writeFileSync(`/tmp/axhy-${h}-build-guardrail-state.json`, JSON.stringify(freshState));
      } catch {}
    }

    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      changeType: 'new_feature',
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });
    const buildWarning = (result.warnings || []).find(w =>
      w.includes('build preflight') || w.includes('enterprise build preflight')
    );
    assert.equal(buildWarning, undefined, 'Fresh build state should not trigger warning');
  });
});

// ─── Item 6: Bash Guard — Scripting Language Bypass Patterns ─────

describe('Item 6: Bash Guard — Workspace Bypass Patterns', () => {
  const BASH_GUARD_SCRIPT = join(__dirname, '..', 'src', 'layer-1-hook', 'bash-guard.mjs');
  const WORKSPACE_ROOT = WORKSPACE_ROOTS[0]; // e.g., /Users/thotaakshay/eclean_workspace

  function runBashGuard(command) {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
    });
    try {
      const stdout = execFileSync('node', [BASH_GUARD_SCRIPT], {
        input,
        encoding: 'utf-8',
        timeout: 5000,
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (err) {
      return {
        exitCode: err.status,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
      };
    }
  }

  // --- Category 1: State file protection (existing, verify still works) ---

  it('should BLOCK redirect to guardrail state file', () => {
    const result = runBashGuard(`echo '{}' > /tmp/axhy-abcd1234-guardrail-state`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /guardrail state/i);
  });

  it('should BLOCK tee to build-guardrail-state file', () => {
    const result = runBashGuard(`echo '{}' | tee /tmp/axhy-abcd1234-build-guardrail-state`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /guardrail state/i);
  });

  it('should BLOCK edit limit inflation', () => {
    const result = runBashGuard(`echo 'edits_remaining: 99'`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Edit limit inflation/);
  });

  // --- Category 2: Scripting language bypass patterns ---

  it('should BLOCK python -c with open(w) — file write bypass', () => {
    const result = runBashGuard(`python3 -c "open('${WORKSPACE_ROOT}/src/app.ts','w').write('hacked')"`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Python -c.*bypasses Edit/i);
  });

  it('should BLOCK perl -pi (in-place edit)', () => {
    const result = runBashGuard(`perl -pi -e 's/foo/bar/g' ${WORKSPACE_ROOT}/src/app.ts`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Perl.*bypasses Edit/i);
  });

  it('should BLOCK perl -i (in-place edit, alternate flag order)', () => {
    const result = runBashGuard(`perl -i -pe 's/old/new/' ${WORKSPACE_ROOT}/src/app.ts`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Perl.*bypasses Edit/i);
  });

  it('should BLOCK ruby -e File.write', () => {
    const result = runBashGuard(`ruby -e "File.write('${WORKSPACE_ROOT}/src/app.ts','hacked')"`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Ruby.*bypasses Edit/i);
  });

  it('should BLOCK sed -i on workspace files', () => {
    const result = runBashGuard(`sed -i'' 's/foo/bar/' ${WORKSPACE_ROOT}/src/app.ts`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /sed.*bypasses Edit/i);
  });

  it('should BLOCK sed -i on code file extensions', () => {
    const result = runBashGuard(`sed -i 's/foo/bar/' some/path/file.json`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /sed.*bypasses Edit/i);
  });

  it('should BLOCK cat redirect to workspace file', () => {
    const result = runBashGuard(`cat some.txt > ${WORKSPACE_ROOT}/src/app.ts`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /cat redirect.*bypasses Edit/i);
  });

  it('should BLOCK tee to workspace file', () => {
    const result = runBashGuard(`echo 'data' | tee ${WORKSPACE_ROOT}/src/app.ts`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /tee.*bypasses Edit/i);
  });

  it('should BLOCK shell redirect to workspace code file', () => {
    const result = runBashGuard(`echo 'data' > ${WORKSPACE_ROOT}/src/config.json`);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /redirect.*bypasses Edit/i);
  });

  // --- Safe commands that should NOT be blocked ---

  it('should ALLOW read-only cat (no redirect)', () => {
    const result = runBashGuard(`cat ${WORKSPACE_ROOT}/src/app.ts`);
    assert.equal(result.exitCode, 0);
  });

  it('should ALLOW grep on workspace files', () => {
    const result = runBashGuard(`grep -rn 'function' ${WORKSPACE_ROOT}/src/`);
    assert.equal(result.exitCode, 0);
  });

  it('should ALLOW ls on workspace', () => {
    const result = runBashGuard(`ls -la ${WORKSPACE_ROOT}/src/`);
    assert.equal(result.exitCode, 0);
  });

  it('should ALLOW git commands', () => {
    const result = runBashGuard(`git status`);
    assert.equal(result.exitCode, 0);
  });

  it('should ALLOW python read-only (no open(w))', () => {
    const result = runBashGuard(`python3 -c "print('hello')"`);
    assert.equal(result.exitCode, 0);
  });

  it('should ALLOW non-Bash tool_name (passthrough)', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { command: `perl -pi -e 's/foo/bar/g' file.ts` },
    });
    try {
      execFileSync('node', [BASH_GUARD_SCRIPT], {
        input,
        encoding: 'utf-8',
        timeout: 5000,
      });
      // exit 0 = passed
      assert.ok(true);
    } catch (err) {
      assert.fail(`Should pass non-Bash tools through, got exit ${err.status}`);
    }
  });
});

// ─── Item 7: Retro Handling — guardrail-optional ─────────────────

describe('Item 7: Retro Files — Guardrail Optional', async () => {
  const { isGuardrailOptional } = await import(
    join(__dirname, '..', 'src', 'layer-1-hook', 'risk-classifier.mjs')
  );

  it('should mark docs/retros/sprint-10-retro.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/retros/sprint-10-retro.md'), true);
  });

  it('should mark docs/retros/any-file.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/retros/any-file.md'), true);
  });

  it('should mark docs/audits/security-audit.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/audits/security-audit.md'), true);
  });

  it('should mark docs/findings/bug-analysis.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/findings/bug-analysis.md'), true);
  });

  it('should mark docs/research/analysis.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/research/analysis.md'), true);
  });

  it('should NOT mark docs/locked/chat-rules.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/locked/chat-rules.md'), false);
  });

  it('should NOT mark docs/plans/sprint-10.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/plans/sprint-10.md'), false);
  });

  it('should NOT mark src/routes/chat.ts as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('src/routes/chat.ts'), false);
  });
});

// ─── Item 8: Grep-Before-Fix — bug_fix warning ──────────────────

describe('Item 8: Grep-Before-Fix Warning', async () => {
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should add grep warning for bug_fix changeType', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      changeType: 'bug_fix',
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    const grepWarning = (result.warnings || []).find(w => w.includes('grep'));
    assert.ok(grepWarning, 'bug_fix should produce a grep warning');
    assert.match(grepWarning, /same pattern/i);
    assert.match(grepWarning, /multiple files/i);
  });

  it('should NOT add grep warning for new_feature changeType', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      changeType: 'new_feature',
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    const grepWarning = (result.warnings || []).find(w => w.includes('grep'));
    assert.equal(grepWarning, undefined, 'new_feature should NOT get grep warning');
  });

  it('should NOT add grep warning when changeType is undefined', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    const grepWarning = (result.warnings || []).find(w => w.includes('grep'));
    assert.equal(grepWarning, undefined, 'No changeType should NOT get grep warning');
  });

  it('should include grep warning but NOT build preflight warning for bug_fix on medium-risk', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      changeType: 'bug_fix',
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });
    const grepWarning = (result.warnings || []).find(w => w.includes('grep'));
    assert.ok(grepWarning, 'bug_fix should still get grep warning on medium-risk file');
    // Should NOT get build preflight warning (that's new_feature only)
    const buildWarning = (result.warnings || []).find(w => w.includes('enterprise build preflight'));
    assert.equal(buildWarning, undefined, 'bug_fix should not trigger build preflight');
  });
});
