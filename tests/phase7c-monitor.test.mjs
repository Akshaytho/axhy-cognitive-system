import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONITOR_SCRIPT = join(
  __dirname,
  '..',
  'src',
  'layer-1-hook',
  'phase7c-monitor.mjs'
);
const REPO_ROOT = process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const VIOLATIONS_LOG = `/tmp/axhy-${REPO_HASH}-7c-violations.jsonl`;

function cleanState() {
  try {
    unlinkSync(VIOLATIONS_LOG);
  } catch {}
}

function runMonitor(input, env = {}) {
  try {
    const stdout = execFileSync('node', [MONITOR_SCRIPT], {
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

function readViolations() {
  if (!existsSync(VIOLATIONS_LOG)) return [];
  return readFileSync(VIOLATIONS_LOG, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('Layer 1: PostToolUse Hook (phase7c-monitor)', () => {
  beforeEach(() => cleanState());
  after(() => cleanState());

  describe('Tool filtering', () => {
    it('should IGNORE non-monitored tools (Edit)', () => {
      const result = runMonitor({
        tool_name: 'Edit',
        tool_input: { file_path: '/tmp/foo' },
        tool_response: 'x'.repeat(5000),
      });
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });

    it('should IGNORE non-monitored tools (Write)', () => {
      const result = runMonitor({
        tool_name: 'Write',
        tool_input: { file_path: '/tmp/foo' },
        tool_response: 'x'.repeat(5000),
      });
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });
  });

  describe('Threshold enforcement', () => {
    it('should NOT log when Bash output is under threshold', () => {
      const result = runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_response: 'a few files',
      });
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });

    it('should LOG when Bash output exceeds 2K chars', () => {
      const result = runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'cat large.log' },
        tool_response: 'x'.repeat(3000),
      });
      assert.equal(result.exitCode, 0);
      const violations = readViolations();
      assert.equal(violations.length, 1);
      assert.equal(violations[0].tool, 'Bash');
      assert.equal(violations[0].size, 3000);
      assert.equal(violations[0].context, 'cat large.log');
    });

    it('should LOG when Read output exceeds 2K chars', () => {
      const result = runMonitor({
        tool_name: 'Read',
        tool_input: { file_path: '/Users/test/big.md' },
        tool_response: 'y'.repeat(5000),
      });
      assert.equal(result.exitCode, 0);
      const violations = readViolations();
      assert.equal(violations.length, 1);
      assert.equal(violations[0].tool, 'Read');
      assert.equal(violations[0].size, 5000);
      assert.equal(violations[0].context, '/Users/test/big.md');
    });

    it('should NOT log when Bash output is exactly at threshold', () => {
      const result = runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'echo' },
        tool_response: 'z'.repeat(2048),
      });
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });

    it('should LOG multiple consecutive violations in order', () => {
      runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'cmd1' },
        tool_response: 'a'.repeat(3000),
      });
      runMonitor({
        tool_name: 'Read',
        tool_input: { file_path: '/file2' },
        tool_response: 'b'.repeat(4000),
      });
      runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'cmd3' },
        tool_response: 'c'.repeat(5000),
      });
      const violations = readViolations();
      assert.equal(violations.length, 3);
      assert.equal(violations[0].context, 'cmd1');
      assert.equal(violations[1].context, '/file2');
      assert.equal(violations[2].context, 'cmd3');
    });
  });

  describe('Fail-open semantics', () => {
    it('should NEVER block (always exit 0)', () => {
      const result = runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'huge' },
        tool_response: 'x'.repeat(10000),
      });
      assert.equal(result.exitCode, 0, 'Hook must never block tool execution');
    });

    it('should IGNORE when AXHY_PHASE_7C_MONITOR=off', () => {
      const result = runMonitor(
        {
          tool_name: 'Bash',
          tool_input: { command: 'cmd' },
          tool_response: 'x'.repeat(5000),
        },
        { AXHY_PHASE_7C_MONITOR: 'off' }
      );
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });

    it('should EXIT cleanly on empty input', () => {
      const result = runMonitor({});
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });

    it('should EXIT cleanly when tool_response is missing', () => {
      const result = runMonitor({
        tool_name: 'Bash',
        tool_input: { command: 'cmd' },
      });
      assert.equal(result.exitCode, 0);
      assert.equal(readViolations().length, 0);
    });
  });
});
