import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots } from '../src/shared/config.mjs';

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

function writeGuardrailState(overrides = {}) {
  const state = {
    timestamp: Date.now(),
    intent: 'Test intent with enough words to satisfy the thirty word minimum requirement for validation purposes here',
    approved_files: ['apps/backend/src/routes/chat.ts'],
    edits_remaining: 3,
    requires_answer: false,
    question_answered: false,
    next_question: null,
    ...overrides,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state));
  return state;
}

function writeReadState(filePath) {
  const reads = existsSync(READ_STATE_FILE)
    ? JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8'))
    : {};
  reads[filePath] = Date.now();
  writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
}

function markFileRead(filePath) {
  let reads = {};
  if (existsSync(READ_STATE_FILE)) {
    try { reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8')); } catch {}
  }
  reads[filePath] = Date.now();
  writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
}

function runGuard(toolInput) {
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: toolInput,
  });

  try {
    const stdout = execFileSync('node', [GUARD_SCRIPT], {
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

// --- TESTS ---

describe('Layer 1: PreToolUse Hook (pre-edit-guard)', () => {
  beforeEach(() => cleanState());
  after(() => cleanState());

  describe('Blocking without guardrail', () => {
    it('should BLOCK edit when no guardrail state exists', () => {
      const result = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.match(result.stderr, /BLOCKED/);
      assert.match(result.stderr, /check_before_edit/);
    });
  });

  describe('Approved file check', () => {
    it('should BLOCK edit to unapproved file', () => {
      writeGuardrailState({ approved_files: ['routes/chat.ts'] });
      markFileRead('apps/backend/src/routes/attendance.ts');
      const result = runGuard({ file_path: 'apps/backend/src/routes/attendance.ts' });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /not in approved scope/);
    });

    it('should ALLOW edit to approved file', () => {
      writeGuardrailState({ approved_files: ['routes/chat.ts'] });
      markFileRead('apps/backend/src/routes/chat.ts');
      const result = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(result.exitCode, 0);
    });
  });

  describe('Read-before-edit enforcement', () => {
    it('should BLOCK edit when file was not read recently', () => {
      // Use a file that actually exists on disk — the read-check is
      // intentionally skipped for non-existent files (new file creation).
      writeGuardrailState({ approved_files: ['bash-guard.mjs'] });
      // Don't mark file as read
      const result = runGuard({ file_path: 'src/layer-1-hook/bash-guard.mjs' });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /haven't Read this file/);
    });

    it('should BLOCK edit when file read was too long ago', () => {
      writeGuardrailState({ approved_files: ['bash-guard.mjs'] });
      // Write read state 15 minutes ago (beyond 10-min window)
      const reads = { 'src/layer-1-hook/bash-guard.mjs': Date.now() - 15 * 60 * 1000 };
      writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
      const result = runGuard({ file_path: 'src/layer-1-hook/bash-guard.mjs' });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /haven't Read this file/);
    });
  });

  describe('Edit limit enforcement', () => {
    it('should BLOCK when edits_remaining is 0', () => {
      writeGuardrailState({
        approved_files: ['routes/chat.ts'],
        edits_remaining: 0,
      });
      markFileRead('apps/backend/src/routes/chat.ts');
      const result = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /Edit limit reached/);
    });

    it('should decrement edits_remaining on successful edit', () => {
      writeGuardrailState({
        approved_files: ['routes/chat.ts'],
        edits_remaining: 3,
      });
      markFileRead('apps/backend/src/routes/chat.ts');

      // First edit
      const r1 = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(r1.exitCode, 0);

      // Check state was decremented
      const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      assert.equal(state.edits_remaining, 2);
    });
  });

  describe('Time window enforcement', () => {
    it('should BLOCK when approval is expired (>2 hours)', () => {
      writeGuardrailState({
        approved_files: ['routes/chat.ts'],
        timestamp: Date.now() - 121 * 60 * 1000, // 121 min ago (beyond 2hr session budget)
      });
      markFileRead('apps/backend/src/routes/chat.ts');
      const result = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /expired/);
    });
  });

  describe('Next-question enforcement', () => {
    it('should BLOCK when requires_answer=true and not answered', () => {
      writeGuardrailState({
        approved_files: ['routes/chat.ts'],
        requires_answer: true,
        question_answered: false,
        next_question: 'What is the max message rate for supervisors?',
      });
      markFileRead('apps/backend/src/routes/chat.ts');
      const result = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /Unanswered question/);
    });

    it('should ALLOW when requires_answer=true but question was answered', () => {
      writeGuardrailState({
        approved_files: ['routes/chat.ts'],
        requires_answer: true,
        question_answered: true,
      });
      markFileRead('apps/backend/src/routes/chat.ts');
      const result = runGuard({ file_path: 'apps/backend/src/routes/chat.ts' });
      assert.equal(result.exitCode, 0);
    });
  });

  describe('Guardrail-optional files', () => {
    it('should ALLOW editing README.md without guardrail', () => {
      const result = runGuard({ file_path: 'README.md' });
      assert.equal(result.exitCode, 0);
    });

    it('should ALLOW editing research docs without guardrail', () => {
      const result = runGuard({ file_path: 'docs/research/analysis.md' });
      assert.equal(result.exitCode, 0);
    });
  });
});

describe('Risk Classifier', async () => {
  const { classifyRisk, isGuardrailOptional } = await import(
    join(__dirname, '..', 'src', 'layer-1-hook', 'risk-classifier.mjs')
  );

  it('should classify CLAUDE.md as high-risk', () => {
    assert.equal(classifyRisk('CLAUDE.md').level, 'high');
    assert.equal(classifyRisk('CLAUDE.md').editsAllowed, 50);
  });

  it('should classify .husky/pre-commit as high-risk', () => {
    assert.equal(classifyRisk('.husky/pre-commit').level, 'high');
  });

  it('should classify docs/locked/chat-rules.md as high-risk', () => {
    assert.equal(classifyRisk('docs/locked/chat-rules.md').level, 'high');
  });

  it('should classify prisma/schema.prisma as high-risk', () => {
    assert.equal(classifyRisk('prisma/schema.prisma').level, 'high');
  });

  it('should classify routes/chat.ts as medium-risk', () => {
    assert.equal(classifyRisk('apps/backend/src/routes/chat.ts').level, 'medium');
    assert.equal(classifyRisk('apps/backend/src/routes/chat.ts').editsAllowed, 100);
  });

  it('should classify session-audit.ts as high-risk', () => {
    assert.equal(classifyRisk('packages/ai-tools/src/session-audit.ts').level, 'high');
  });

  it('should classify a regular component as low-risk', () => {
    assert.equal(classifyRisk('apps/mobile/src/components/Button.tsx').level, 'low');
    assert.equal(classifyRisk('apps/mobile/src/components/Button.tsx').editsAllowed, 200);
  });

  it('should mark docs/research/*.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/research/analysis.md'), true);
  });

  it('should NOT mark docs/locked/*.md as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('docs/locked/chat-rules.md'), false);
  });

  it('should NOT mark routes/*.ts as guardrail-optional', () => {
    assert.equal(isGuardrailOptional('apps/backend/src/routes/chat.ts'), false);
  });
});
