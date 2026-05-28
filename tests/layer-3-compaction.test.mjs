import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots } from '../src/shared/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPACTION_SCRIPT = join(__dirname, '..', 'src', 'layer-3-compaction', 'post-compaction.mjs');

function runCompaction(input = '{}') {
  try {
    const stdout = execFileSync('node', [COMPACTION_SCRIPT], {
      input,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '' };
  }
}

describe('Layer 3: PostCompaction Hook — real boot reload', () => {
  it('should emit operational re-grounding header', () => {
    const result = runCompaction('{}');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /operational re-grounding/i);
  });

  it('should warn against relying only on compact summary', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /compact summary/i);
  });

  it('should include identity content from CORE_MIND.md', () => {
    const result = runCompaction('{}');
    // CORE_MIND.md has sections like Nature, Limits, Maturity Modes
    assert.match(result.stdout, /Who I am|CORE_MIND/);
    assert.match(result.stdout, /Maturity Modes/i);
  });

  it('should include universal rules from BOOT_DIGEST.md', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /Universal rules|BOOT_DIGEST/i);
  });

  it('should include action items at end', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /Action items/);
    assert.match(result.stdout, /check_before_edit/);
  });

  it('should be substantially richer than the old 5-line reminder', () => {
    const result = runCompaction('{}');
    // Old output was ~500 chars. New boot reload should be at least 2KB.
    assert.ok(result.stdout.length > 2000, `Boot output too short: ${result.stdout.length} chars`);
  });

  it('should describe compact-aware read-state behavior', () => {
    const result = runCompaction('{}');
    assert.match(result.stdout, /compact-aware|files read.*BEFORE.*compaction/i);
  });

  it('should exit 0 even with invalid input', () => {
    const result = runCompaction('not json');
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 100, 'Should still emit some output on invalid input');
  });
});

describe('PostCompaction module exports', async () => {
  const mod = await import(
    join(__dirname, '..', 'src', 'layer-3-compaction', 'post-compaction.mjs')
  );

  it('should export CORE_REINFORCEMENT constant (backward compat fallback)', () => {
    assert.ok(typeof mod.CORE_REINFORCEMENT === 'string');
    assert.match(mod.CORE_REINFORCEMENT, /non-human/);
  });

  it('should export buildReGrounding function', () => {
    assert.ok(typeof mod.buildReGrounding === 'function');
  });

  it('CORE_REINFORCEMENT should NOT contain product terms', () => {
    const productTerms = ['worker', 'supervisor', 'visit', 'cleaning', 'facility', 'tenant'];
    for (const term of productTerms) {
      assert.ok(
        !mod.CORE_REINFORCEMENT.toLowerCase().includes(term),
        `CORE_REINFORCEMENT contains product term: "${term}"`
      );
    }
  });

  it('buildReGrounding should NOT hang on import (isMainModule guard)', () => {
    // If main() ran on import, this test process would have produced output
    // by now. Just verifying the import completed.
    assert.ok(true);
  });
});

describe('PostCompaction compact-state marker', () => {
  const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
  const REPO_HASH = createHash('md5').update(join(REPO_ROOT, '..')).digest('hex').slice(0, 8);

  function allTestHashes() {
    const set = new Set([REPO_HASH]);
    for (const r of getWorkspaceRoots()) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
    return [...set];
  }

  afterEach(() => {
    for (const h of allTestHashes()) {
      try { unlinkSync(`/tmp/axhy-${h}-compact-state.json`); } catch {}
    }
  });

  it('should write compact-state.json with last_compact_at timestamp', () => {
    const before = Date.now();
    runCompaction('{}');
    const after = Date.now();

    // Check at least one hash bucket has the marker
    let found = false;
    for (const h of allTestHashes()) {
      const path = `/tmp/axhy-${h}-compact-state.json`;
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        assert.ok(typeof data.last_compact_at === 'number', 'last_compact_at should be a number');
        assert.ok(data.last_compact_at >= before, 'last_compact_at should be >= test start time');
        assert.ok(data.last_compact_at <= after, 'last_compact_at should be <= test end time');
        found = true;
        break;
      }
    }
    assert.ok(found, 'compact-state.json should be written to at least one hash bucket');
  });
});
