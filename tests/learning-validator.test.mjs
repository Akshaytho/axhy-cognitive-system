import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { validateCommitMessage, validateLearningFrontmatter } from '../src/audit/learning-validator.mjs';

const TMP = '/tmp/axhy-learning-test';

describe('validateCommitMessage', () => {
  it('should pass when message contains Learning:', () => {
    mkdirSync(TMP, { recursive: true });
    const msgFile = join(TMP, 'msg.txt');
    writeFileSync(msgFile, 'Learning: never skip tenant context in queries');
    const result = validateCommitMessage(msgFile, ['docs/learnings/test.md']);
    assert.equal(result.valid, true);
    rmSync(TMP, { recursive: true });
  });

  it('should pass when message contains Broke rule:', () => {
    mkdirSync(TMP, { recursive: true });
    const msgFile = join(TMP, 'msg.txt');
    writeFileSync(msgFile, 'Broke rule: direct DB update bypassed state machine');
    const result = validateCommitMessage(msgFile, ['docs/learnings/test.md']);
    assert.equal(result.valid, true);
    rmSync(TMP, { recursive: true });
  });

  it('should fail when message lacks keywords', () => {
    mkdirSync(TMP, { recursive: true });
    const msgFile = join(TMP, 'msg.txt');
    writeFileSync(msgFile, 'fix: update the chat handler');
    const result = validateCommitMessage(msgFile, ['docs/learnings/test.md']);
    assert.equal(result.valid, false);
    rmSync(TMP, { recursive: true });
  });
});

describe('validateLearningFrontmatter', () => {
  it('should pass with all required fields', () => {
    mkdirSync(TMP, { recursive: true });
    const file = join(TMP, 'learning.md');
    writeFileSync(file, [
      '---',
      'broken_rule: no direct DB updates',
      'check_pattern: prisma\\..*\\.update',
      'check_paths: apps/backend/src',
      'check_expect: absent',
      '---',
      '# Learning',
    ].join('\n'));

    const result = validateLearningFrontmatter(file);
    assert.equal(result.valid, true);
    rmSync(TMP, { recursive: true });
  });

  it('should fail when check_pattern is missing', () => {
    mkdirSync(TMP, { recursive: true });
    const file = join(TMP, 'learning.md');
    writeFileSync(file, [
      '---',
      'broken_rule: no direct DB updates',
      'check_paths: apps/backend/src',
      '---',
      '# Learning',
    ].join('\n'));

    const result = validateLearningFrontmatter(file);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('check_pattern'));
    rmSync(TMP, { recursive: true });
  });

  it('should fail when broken_rule is missing', () => {
    mkdirSync(TMP, { recursive: true });
    const file = join(TMP, 'learning.md');
    writeFileSync(file, [
      '---',
      'check_pattern: something',
      'check_paths: src',
      '---',
    ].join('\n'));

    const result = validateLearningFrontmatter(file);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('broken_rule'));
    rmSync(TMP, { recursive: true });
  });
});
