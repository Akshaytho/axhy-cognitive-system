import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_MIND_PATH = join(__dirname, '..', 'docs', 'CORE_MIND.md');

describe('Anti-Corruption Audit', async () => {
  const { auditCoreMind, auditCoreMindFile } = await import(
    join(__dirname, '..', 'src', 'anti-corruption', 'audit.mjs')
  );

  describe('auditCoreMind (string input)', () => {
    it('should pass clean core mind content', () => {
      const clean = `# CORE MIND
You are a non-human reasoning system.
Confidence drops when assumptions are unverified.
Call check_before_edit before any edit.`;
      const result = auditCoreMind(clean);
      assert.equal(result.clean, true);
      assert.equal(result.violations.length, 0);
    });

    it('should catch product term "workers"', () => {
      const dirty = `# CORE MIND
Workers must check in before starting.`;
      const result = auditCoreMind(dirty);
      assert.equal(result.clean, false);
      assert.ok(result.violations.some(v => v.term === 'workers'));
    });

    it('should catch product term "supervisors"', () => {
      const dirty = `# CORE MIND
Supervisors assign tasks to teams.`;
      const result = auditCoreMind(dirty);
      assert.equal(result.clean, false);
      assert.ok(result.violations.some(v => v.term === 'supervisors'));
    });

    it('should catch product term "cleaning"', () => {
      const dirty = `# CORE MIND
Cleaning schedules must be verified.`;
      const result = auditCoreMind(dirty);
      assert.equal(result.clean, false);
      assert.ok(result.violations.some(v => v.term === 'cleaning'));
    });

    it('should catch product term "facility"', () => {
      const dirty = `# CORE MIND
Each facility has unique requirements.`;
      const result = auditCoreMind(dirty);
      assert.equal(result.clean, false);
      assert.ok(result.violations.some(v => v.term === 'facility'));
    });

    it('should catch product term "visit"', () => {
      const dirty = `# CORE MIND
Every visit must be verified with photos.`;
      const result = auditCoreMind(dirty);
      assert.equal(result.clean, false);
    });

    it('should allow the PROJECT_ENTRYPOINT pointer exception', () => {
      const withPointer = `# CORE MIND
You are a non-human reasoning system.
Project context: see PROJECT_ENTRYPOINT.md for Axhy system details.`;
      const result = auditCoreMind(withPointer);
      assert.equal(result.clean, true);
    });

    it('should catch multiple violations', () => {
      const dirty = `# CORE MIND
Workers at each facility must complete cleaning visits on time.`;
      const result = auditCoreMind(dirty);
      assert.equal(result.clean, false);
      assert.ok(result.violations.length >= 3);
    });

    it('should report line numbers correctly', () => {
      const dirty = `Line 1 is fine
Line 2 is fine
Workers break the rules here`;
      const result = auditCoreMind(dirty);
      assert.equal(result.violations[0].line, 3);
    });

    it('should reject empty content', () => {
      const result = auditCoreMind('');
      assert.equal(result.clean, false);
    });
  });

  describe('auditCoreMindFile (real file)', () => {
    it('should pass the actual CORE_MIND.md file', () => {
      const result = auditCoreMindFile(CORE_MIND_PATH);
      assert.equal(result.clean, true, `CORE_MIND.md has violations: ${JSON.stringify(result.violations)}`);
    });
  });
});
