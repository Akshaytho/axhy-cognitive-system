import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUARD_SCRIPT = join(
  __dirname,
  '..',
  'src',
  'layer-1-hook',
  'pre-ask-guard.mjs'
);
const REPO_ROOT = process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const AUDIT_LOG = `/tmp/axhy-${REPO_HASH}-ask-guard-audit.jsonl`;

function cleanState() {
  try {
    unlinkSync(AUDIT_LOG);
  } catch {}
}

function runGuard(input, env = {}) {
  try {
    const stdout = execFileSync('node', [GUARD_SCRIPT], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, ...env },
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

describe('Layer 1: PreToolUse Hook (pre-ask-guard)', () => {
  beforeEach(() => cleanState());
  after(() => cleanState());

  describe('Tool name filtering', () => {
    it('should ALLOW non-AskUserQuestion tool calls (Bash)', () => {
      const result = runGuard({
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      });
      assert.equal(result.exitCode, 0);
    });

    it('should ALLOW Edit tool calls', () => {
      const result = runGuard({
        tool_name: 'Edit',
        tool_input: { file_path: '/tmp/foo' },
      });
      assert.equal(result.exitCode, 0);
    });
  });

  describe('AskUserQuestion blocking without marker', () => {
    it('should BLOCK AskUserQuestion when question has no marker', () => {
      const result = runGuard({
        tool_name: 'AskUserQuestion',
        tool_input: {
          questions: [
            { question: 'Which auth library should we use?', options: [] },
          ],
        },
      });
      assert.equal(result.exitCode, 2);
      assert.match(
        result.stderr,
        /BLOCKED: AskUserQuestion without brain check/
      );
      assert.match(result.stderr, /impact_search/);
      assert.match(result.stderr, /\[BRAIN_CHECKED\]/);
    });

    it('should write an audit entry for blocked questions', () => {
      runGuard({
        tool_name: 'AskUserQuestion',
        tool_input: {
          questions: [{ question: 'What database should we use?', options: [] }],
        },
      });
      assert.ok(
        existsSync(AUDIT_LOG),
        'Audit log should exist after a blocked call'
      );
      const lines = readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n');
      const entry = JSON.parse(lines[0]);
      assert.equal(entry.action, 'blocked');
      assert.match(entry.question, /database/);
    });
  });

  describe('AskUserQuestion marker recognition', () => {
    it('should ALLOW AskUserQuestion prefixed with [BRAIN_CHECKED]', () => {
      const result = runGuard({
        tool_name: 'AskUserQuestion',
        tool_input: {
          questions: [
            {
              question:
                '[BRAIN_CHECKED] Brain had no answer — which library should we use?',
              options: [],
            },
          ],
        },
      });
      assert.equal(result.exitCode, 0, `stderr: ${result.stderr}`);
    });

    it('should ALLOW AskUserQuestion prefixed with [BYPASS_BRAIN]', () => {
      const result = runGuard({
        tool_name: 'AskUserQuestion',
        tool_input: {
          questions: [
            {
              question:
                '[BYPASS_BRAIN] no DATABASE_URL — emergency human-input needed',
              options: [],
            },
          ],
        },
      });
      assert.equal(result.exitCode, 0);
    });

    it('should write an audit entry for allowed questions with marker', () => {
      runGuard({
        tool_name: 'AskUserQuestion',
        tool_input: {
          questions: [
            { question: '[BRAIN_CHECKED] test question', options: [] },
          ],
        },
      });
      assert.ok(existsSync(AUDIT_LOG));
      const entry = JSON.parse(
        readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n')[0]
      );
      assert.equal(entry.action, 'allowed');
      assert.equal(entry.marker, '[BRAIN_CHECKED]');
    });
  });

  describe('Fail-open semantics', () => {
    it('should ALLOW when AXHY_DECIDE_BEFORE_ASK=off', () => {
      const result = runGuard(
        {
          tool_name: 'AskUserQuestion',
          tool_input: {
            questions: [{ question: 'no marker', options: [] }],
          },
        },
        { AXHY_DECIDE_BEFORE_ASK: 'off' }
      );
      assert.equal(result.exitCode, 0);
    });

    it('should ALLOW when questions array is empty', () => {
      const result = runGuard({
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [] },
      });
      assert.equal(result.exitCode, 0);
    });

    it('should ALLOW when input is empty object (defensive)', () => {
      const result = runGuard({});
      assert.equal(result.exitCode, 0);
    });
  });
});
