import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePersona, resolveFromIntent, resolveFromPaths } from '../src/personas/resolver.mjs';

describe('resolveFromIntent', () => {
  it('should detect supervisor keywords', () => {
    const result = resolveFromIntent('fix the today tab layout');
    assert.ok(result.includes('supervisor'));
  });

  it('should detect worker keywords', () => {
    const result = resolveFromIntent('add voice capture to worker flow');
    assert.ok(result.includes('worker'));
  });

  it('should detect admin keywords', () => {
    const result = resolveFromIntent('update the dashboard overview');
    assert.ok(result.includes('admin'));
  });

  it('should detect multiple personas', () => {
    const result = resolveFromIntent('supervisor assigns worker to site');
    assert.ok(result.includes('supervisor'));
    assert.ok(result.includes('worker'));
  });

  it('should return empty for generic intent', () => {
    const result = resolveFromIntent('refactor the utils module');
    assert.equal(result.length, 0);
  });

  it('should handle null/empty intent', () => {
    assert.deepEqual(resolveFromIntent(null), []);
    assert.deepEqual(resolveFromIntent(''), []);
  });
});

describe('resolveFromPaths', () => {
  it('should map worker-mobile path', () => {
    const result = resolveFromPaths(['apps/worker-mobile/src/screens/Timer.tsx']);
    assert.ok(result.includes('worker'));
  });

  it('should map admin-web path', () => {
    const result = resolveFromPaths(['apps/admin-web/src/pages/Overview.tsx']);
    assert.ok(result.includes('admin'));
  });

  it('should map supervisor-mobile path', () => {
    const result = resolveFromPaths(['apps/supervisor-mobile/src/tabs/Today.tsx']);
    assert.ok(result.includes('supervisor'));
  });

  it('should map shared packages to combined', () => {
    const result = resolveFromPaths(['packages/shared-schema/src/types.ts']);
    assert.ok(result.includes('combined'));
  });

  it('should deduplicate', () => {
    const result = resolveFromPaths([
      'apps/worker-mobile/src/a.tsx',
      'apps/worker-mobile/src/b.tsx',
    ]);
    assert.equal(result.length, 1);
  });

  it('should handle empty paths', () => {
    assert.deepEqual(resolveFromPaths([]), []);
    assert.deepEqual(resolveFromPaths(null), []);
  });
});

describe('resolvePersona', () => {
  it('should return high confidence for single clear match', () => {
    const result = resolvePersona('fix the today tab', []);
    assert.equal(result.confidence, 'high');
    assert.ok(result.personas.includes('supervisor'));
  });

  it('should return medium confidence for multiple matches', () => {
    const result = resolvePersona('supervisor assigns worker', []);
    assert.equal(result.confidence, 'medium');
    assert.ok(result.personas.length >= 2);
  });

  it('should fallback to combined with low confidence', () => {
    const result = resolvePersona('refactor utils', []);
    assert.deepEqual(result.personas, ['combined']);
    assert.equal(result.confidence, 'low');
    assert.equal(result.source, 'fallback');
  });

  it('should combine intent and path signals', () => {
    const result = resolvePersona('fix admin route', ['apps/worker-mobile/src/x.tsx']);
    assert.ok(result.personas.includes('admin'));
    assert.ok(result.personas.includes('worker'));
  });
});
