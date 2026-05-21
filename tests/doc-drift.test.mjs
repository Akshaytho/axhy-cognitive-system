import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scanDocForCodeRefs, checkRefExists } from '../src/doc-drift/auditor.mjs';

const TMP = '/tmp/axhy-drift-test';

describe('scanDocForCodeRefs', () => {
  it('should extract file references', () => {
    mkdirSync(TMP, { recursive: true });
    const doc = join(TMP, 'test.md');
    writeFileSync(doc, [
      '# Test Doc',
      'See `src/routes/chat.ts` for the chat handler.',
      'The `UserService` class manages users.',
      'Call `processVisit()` to trigger.',
      'Located at packages/shared-schema/src/types.ts',
    ].join('\n'));

    const refs = scanDocForCodeRefs(doc);
    assert.ok(refs.includes('src/routes/chat.ts'), 'should find file path');
    assert.ok(refs.includes('UserService'), 'should find class name');
    assert.ok(refs.some(r => r.includes('packages/shared-schema')), 'should find package path');

    rmSync(TMP, { recursive: true });
  });

  it('should return empty for doc with no code refs', () => {
    mkdirSync(TMP, { recursive: true });
    const doc = join(TMP, 'plain.md');
    writeFileSync(doc, '# Plain doc\nThis is just text with no code references.\n');

    const refs = scanDocForCodeRefs(doc);
    assert.equal(refs.length, 0);

    rmSync(TMP, { recursive: true });
  });
});

describe('checkRefExists', () => {
  it('should find existing file paths', () => {
    const result = checkRefExists('src/personas/resolver.mjs', '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system');
    assert.equal(result.exists, true);
    assert.equal(result.type, 'path');
  });

  it('should report missing file paths', () => {
    const result = checkRefExists('src/nonexistent/file.ts', '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system');
    assert.equal(result.exists, false);
  });
});
