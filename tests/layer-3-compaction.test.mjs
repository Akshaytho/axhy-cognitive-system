import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPACTION_SCRIPT = join(__dirname, '..', 'src', 'layer-3-compaction', 'post-compaction.mjs');

function runCompaction(input = '{}') {
  try {
    const stdout = execFileSync('node', [COMPACTION_SCRIPT], {
      input,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '' };
  }
}

describe('Layer 3: PostCompaction Hook', () => {
  it('should output core reinforcement text', () => {
    const result = runCompaction('{}');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Core Reasoning/);
    assert.match(result.stdout, /non-human reasoning system/);
  });

  it('should include guardrail mandate', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /check_before_edit/);
  });

  it('should include maturity modes', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /child/);
    assert.match(result.stdout, /professional/);
    assert.match(result.stdout, /founder/);
  });

  it('should include core/product separation reminder', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /Product knowledge never modifies core reasoning/);
  });

  it('should exit 0 even with invalid input', () => {
    const result = runCompaction('not json');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Core Reasoning/);
  });

  it('should be under 100 tokens (~500 chars)', () => {
    const result = runCompaction('{}');
    assert.ok(result.stdout.length < 600, `Output too long: ${result.stdout.length} chars`);
  });
});

describe('PostCompaction module export', async () => {
  const { CORE_REINFORCEMENT } = await import(
    join(__dirname, '..', 'src', 'layer-3-compaction', 'post-compaction.mjs')
  );

  it('should export CORE_REINFORCEMENT constant', () => {
    assert.ok(typeof CORE_REINFORCEMENT === 'string');
    assert.match(CORE_REINFORCEMENT, /non-human/);
  });

  it('should NOT contain product terms', () => {
    const productTerms = ['worker', 'supervisor', 'visit', 'cleaning', 'r6', 'facility', 'tenant'];
    for (const term of productTerms) {
      assert.ok(
        !CORE_REINFORCEMENT.toLowerCase().includes(term),
        `CORE_REINFORCEMENT contains product term: "${term}"`
      );
    }
  });
});
