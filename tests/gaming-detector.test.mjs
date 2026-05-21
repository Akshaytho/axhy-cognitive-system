import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDiffGaming } from '../src/audit/gaming-detector.mjs';

describe('detectDiffGaming', () => {
  it('should pass clean diff', () => {
    const diff = `
+const x = 1;
+function doStuff() { return true; }
-const old = false;
`;
    const result = detectDiffGaming(diff);
    assert.equal(result.newSkips, 0);
    assert.equal(result.details.length, 0);
  });

  it('should flag excessive skip comments', () => {
    const lines = [];
    for (let i = 0; i < 6; i++) {
      lines.push(`+  const x${i} = val; // audit-ok`);
    }
    const diff = lines.join('\n');

    const result = detectDiffGaming(diff);
    assert.equal(result.newSkips, 6);
    const blocker = result.details.find(d => d.severity === 'BLOCKER');
    assert.ok(blocker, 'should have BLOCKER');
    assert.ok(blocker.message.includes('skip'), 'should mention skip');
  });

  it('should warn on moderate skip comments', () => {
    const lines = [];
    for (let i = 0; i < 3; i++) {
      lines.push(`+  const x${i} = val; // audit-ok`);
    }
    const diff = lines.join('\n');

    const result = detectDiffGaming(diff);
    assert.equal(result.newSkips, 3);
    assert.ok(result.details.length > 0);
  });

  it('should flag comment-keyword tricks', () => {
    const lines = [
      '+  // $executeRaw is used here for performance',
      '+  // withTenantContext ensures isolation',
      '+  // rateLimit applied to endpoint',
      '+  // semaphore controls concurrency',
    ];
    const diff = lines.join('\n');

    const result = detectDiffGaming(diff);
    const medium = result.details.find(d => d.severity === 'MEDIUM');
    assert.ok(medium, 'should flag comment keyword tricks');
  });

  it('should handle empty diff', () => {
    const result = detectDiffGaming('');
    assert.equal(result.newSkips, 0);
    assert.equal(result.details.length, 0);
  });
});
