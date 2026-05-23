import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { checkBeforeCommit } = await import(
  join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-commit.mjs')
);
const { scanPatterns, PATTERNS } = await import(
  join(__dirname, '..', 'src', 'layer-2-guardrail', 'pattern-scanner.mjs')
);
const { scanDependencies, extractImports } = await import(
  join(__dirname, '..', 'src', 'layer-2-guardrail', 'dependency-scanner.mjs')
);
const { scanSurface, isUiFile, validateManifest } = await import(
  join(__dirname, '..', 'src', 'layer-2-guardrail', 'surface-scanner.mjs')
);
const { evaluateChallenge, applyChallenges } = await import(
  join(__dirname, '..', 'src', 'layer-2-guardrail', 'challenge-log.mjs')
);

let workDir;
function makeFile(relPath, content) {
  const full = join(workDir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'axhy-commit-test-'));
});

after(() => {
  try { rmSync(workDir, { recursive: true, force: true }); } catch {}
});

describe('check_before_commit: input validation', () => {
  it('rejects missing slice_name', () => {
    const r = checkBeforeCommit({ changedFiles: ['a.ts'], testsRun: ['pnpm test'] });
    assert.equal(r.passed, false);
    assert.match(r.summary, /slice_name/i);
  });

  it('rejects empty changed_files', () => {
    const r = checkBeforeCommit({ sliceName: 'x', changedFiles: [], testsRun: ['pnpm test'] });
    assert.equal(r.passed, false);
    assert.match(r.summary, /no changed files/i);
  });

  it('rejects missing tests_run', () => {
    const r = checkBeforeCommit({ sliceName: 'x', changedFiles: ['a.ts'], testsRun: [] });
    assert.equal(r.passed, false);
    assert.match(r.summary, /no tests/i);
  });
});

describe('pattern scanner: grouping behavior', () => {
  it('groups same-pattern findings across multiple files (no per-file iteration)', () => {
    const f1 = makeFile('a.ts', `
async function fetchA() {
  const data = await fetch('/api/a');
  return data.json();
}
`);
    const f2 = makeFile('b.ts', `
async function fetchB() {
  const data = await fetch('/api/b');
  return data.json();
}
`);
    const groups = scanPatterns([f1, f2]);
    const asyncGroup = groups.find(g => g.pattern === 'unhandled_async');
    assert.ok(asyncGroup, 'should find unhandled_async group');
    assert.equal(asyncGroup.occurrences.length, 2, 'should group both occurrences');
  });
});

describe('pattern scanner: known false positives DO NOT fire', () => {
  it('requireAuth function DEFINITION is not flagged (no missing_auth pattern exists)', () => {
    const f = makeFile('middleware/auth.ts', `
export function requireAuth(roles) {
  return async (req, res, next) => {
    // ... auth logic
  };
}
`);
    const groups = scanPatterns([f]);
    // No pattern with id like 'missing_auth' or 'missing_role' exists in the scanner
    assert.ok(!groups.some(g => /missing_auth|role_check/.test(g.pattern)));
  });

  it('async with try/catch NOT at position 1 (guards before try) is permitted', () => {
    const f = makeFile('routes/submit.ts', `
async function handleSubmit(req, res) {
  if (!req.body) return res.status(400).json({ error: 'missing body' });
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const result = await processSubmit(req.body);
    return res.json(result);
  } catch (err) {
    console.error('submit failed', err);
    return res.status(500).json({ error: 'internal' });
  }
}
`);
    const groups = scanPatterns([f]);
    const asyncGroup = groups.find(g => g.pattern === 'unhandled_async');
    assert.ok(!asyncGroup || asyncGroup.occurrences.length === 0,
      'try/catch anywhere in body should satisfy the check');
  });

  it('ROUTES constant VALUES are not flagged as hardcoded routes', () => {
    const f = makeFile('routes/chat.ts', `
const ROUTES = {
  CHAT: '/api/chat',
  THREADS: '/api/chat/threads',
};

app.get(ROUTES.CHAT, handler);
`);
    const groups = scanPatterns([f]);
    const routeGroup = groups.find(g => g.pattern === 'hardcoded_route');
    assert.ok(!routeGroup, 'ROUTES constant declaration should not be flagged');
  });

  it('inline string literals in app.get/post ARE still flagged', () => {
    const f = makeFile('routes/inline.ts', `
app.get('/api/inline', handler);
`);
    const groups = scanPatterns([f]);
    const routeGroup = groups.find(g => g.pattern === 'hardcoded_route');
    assert.ok(routeGroup, 'inline route literal should still be flagged');
    assert.equal(routeGroup.occurrences.length, 1);
  });
});

describe('pattern scanner: real violations DO fire', () => {
  it('flags async without any try/catch', () => {
    const f = makeFile('routes/unhandled.ts', `
async function broken() {
  const data = await fetch('/api/x');
  return data.json();
}
`);
    const groups = scanPatterns([f]);
    assert.ok(groups.find(g => g.pattern === 'unhandled_async'));
  });

  it('flags as any cast', () => {
    const f = makeFile('cast.ts', `
const data = userInput as any;
`);
    const groups = scanPatterns([f]);
    assert.ok(groups.find(g => g.pattern === 'as_any_cast'));
  });

  it('flags empty catch block', () => {
    const f = makeFile('silent.ts', `
try { something(); } catch (err) {}
`);
    const groups = scanPatterns([f]);
    assert.ok(groups.find(g => g.pattern === 'silent_catch'));
  });

  it('flags TODO in committed code', () => {
    const f = makeFile('todo.ts', `// TODO: fix this later`);
    const groups = scanPatterns([f]);
    assert.ok(groups.find(g => g.pattern === 'todo_in_committed_code'));
  });
});

describe('dependency scanner', () => {
  it('extracts import paths from a file', () => {
    const content = `
import { foo } from './foo';
import bar from '../bar/index';
import 'side-effect';
const lib = require('./lib');
`;
    const imports = extractImports(content);
    assert.ok(imports.includes('./foo'));
    assert.ok(imports.includes('../bar/index'));
    assert.ok(imports.includes('side-effect'));
    assert.ok(imports.includes('./lib'));
  });

  it('flags broken imports (relative path not found)', () => {
    const f = makeFile('app/broken.ts', `import { x } from './nonexistent';`);
    const result = scanDependencies([f], workDir);
    assert.equal(result.broken_imports.length, 1);
    assert.equal(result.broken_imports[0].import, './nonexistent');
  });

  it('does not flag valid relative imports', () => {
    const target = makeFile('app/target.ts', `export const x = 1;`);
    const f = makeFile('app/caller.ts', `import { x } from './target';`);
    const result = scanDependencies([f], workDir);
    assert.equal(result.broken_imports.length, 0);
  });
});

describe('surface scanner: UI file detection', () => {
  it('identifies mobile component as UI file', () => {
    assert.equal(isUiFile('apps/mobile/components/Button.tsx'), true);
  });

  it('identifies admin-web component as UI file', () => {
    assert.equal(isUiFile('apps/admin-web/pages/dashboard.tsx'), true);
  });

  it('does not identify backend route as UI file', () => {
    assert.equal(isUiFile('apps/backend/src/routes/chat.ts'), false);
  });
});

describe('surface scanner: manifest validation', () => {
  it('blocks UI changes without manifest', () => {
    const result = scanSurface(['apps/mobile/components/Foo.tsx'], null);
    assert.equal(result.manifest_valid, false);
    assert.ok(result.findings.some(f => /missing_manifest/.test(f.finding_id)));
  });

  it('blocks manifest without ai_observations', () => {
    const result = scanSurface(['apps/mobile/components/Foo.tsx'], {
      command: 'pnpm test:visual',
      captured_at: new Date().toISOString(),
      screenshots: [],
    });
    assert.equal(result.manifest_valid, false);
    assert.ok(result.findings.some(f => /missing_ai_observations/.test(f.finding_id)));
  });

  it('blocks shallow ai_observations (under 10 words)', () => {
    const shot = makeFile('apps/mobile/screenshots/01.png', '');
    const result = scanSurface(['apps/mobile/components/Foo.tsx'], {
      command: 'pnpm test:visual',
      captured_at: new Date().toISOString(),
      screenshots: [shot],
      ai_observations: 'looks fine',
    });
    assert.equal(result.manifest_valid, false);
    assert.ok(result.findings.some(f => /shallow_observation/.test(f.finding_id)));
  });

  it('accepts valid manifest with substantive observations', () => {
    const shot = makeFile('apps/mobile/screenshots/02.png', '');
    const result = scanSurface(['apps/mobile/components/Foo.tsx'], {
      command: 'pnpm test:visual worker-capture',
      captured_at: new Date().toISOString(),
      screenshots: [shot],
      ui_files_covered: ['apps/mobile/components/Foo.tsx'],
      ai_observations: 'Component renders correctly with both buttons visible, primary action highlighted, no overlapping elements observed',
    });
    assert.equal(result.manifest_valid, true);
  });

  it('passes through when no UI files changed', () => {
    const result = scanSurface(['apps/backend/src/routes/chat.ts'], null);
    assert.equal(result.manifest_valid, true);
    assert.equal(result.findings.length, 0);
  });
});

describe('challenge-with-evidence', () => {
  it('rejects challenge with missing fields', () => {
    const ev = evaluateChallenge({ finding_id: 'foo' });
    assert.equal(ev.accepted, false);
    assert.match(ev.reason, /missing required field/i);
  });

  it('rejects challenge with too-brief explanation', () => {
    const f = makeFile('chall/file.ts', `// real file`);
    const ev = evaluateChallenge({
      finding_id: 'foo',
      file_path: f,
      line_number: 1,
      explanation: 'false positive',
    });
    assert.equal(ev.accepted, false);
    assert.match(ev.reason, /too brief/i);
  });

  it('rejects challenge without code excerpt or line references', () => {
    const f = makeFile('chall/file2.ts', `// real file`);
    const ev = evaluateChallenge({
      finding_id: 'foo',
      file_path: f,
      line_number: 1,
      explanation: 'This is not a real issue because the code is correct and my framework handles this case well',
    });
    assert.equal(ev.accepted, false);
    assert.match(ev.reason, /excerpt|line references/i);
  });

  it('accepts substantive challenge with file:line reference', () => {
    const f = makeFile('chall/file3.ts', `// real file`);
    const ev = evaluateChallenge({
      finding_id: 'unhandled_async:foo.ts:42',
      file_path: f,
      line_number: 42,
      explanation: 'On line 42 the try/catch wraps the awaited call below at line 45-50, the scanner missed it due to a guard expression preceding the try block',
      code_excerpt: 'try { await x() } catch (e) { ... }',
    });
    assert.equal(ev.accepted, true);
  });

  it('applyChallenges drops accepted findings and keeps rejected ones', () => {
    const f = makeFile('chall/file4.ts', `// real file`);
    const findings = [
      { finding_id: 'A', severity: 'blocker', file: 'a.ts', line: 1 },
      { finding_id: 'B', severity: 'blocker', file: 'b.ts', line: 2 },
    ];
    const challenges = [
      {
        finding_id: 'A',
        file_path: f,
        line_number: 1,
        explanation: 'Detailed reason with line 1 reference proving this is not actually the pattern being flagged here in this specific case',
        code_excerpt: 'real code',
      },
      {
        finding_id: 'B',
        file_path: f,
        line_number: 2,
        explanation: 'short',  // will be rejected
      },
    ];
    const { remainingFindings, acceptedChallenges, rejectedChallenges } = applyChallenges(findings, challenges);
    assert.equal(remainingFindings.length, 1, 'A should be removed');
    assert.equal(remainingFindings[0].finding_id, 'B');
    assert.equal(acceptedChallenges.length, 1);
    assert.equal(rejectedChallenges.length, 1);
  });
});

describe('orchestrator: end-to-end pass and block', () => {
  it('passes on clean slice with no findings', () => {
    const f = makeFile('clean/ok.ts', `export const x = 1;\n`);
    const result = checkBeforeCommit({
      sliceName: 'clean-test',
      changedFiles: [f],
      testsRun: ['pnpm test'],
    });
    assert.equal(result.passed, true);
    assert.equal(result.blockers.length, 0);
  });

  it('blocks when blocker-severity findings exist', () => {
    // Use unhandled_async (still a blocker) — silent_catch was downgraded to warning
    // after calibration since silent catches are often intentional best-effort writes.
    const f = makeFile('bad/unhandled.ts', `
async function broken() {
  const data = await fetch('/api/x');
  return data;
}
`);
    const result = checkBeforeCommit({
      sliceName: 'block-test',
      changedFiles: [f],
      testsRun: ['pnpm test'],
    });
    assert.equal(result.passed, false);
    assert.ok(result.blockers.length > 0);
  });

  it('groups blockers by pattern in pattern_groups', () => {
    const f1 = makeFile('bad/a.ts', `try { x(); } catch (e) {}`);
    const f2 = makeFile('bad/b.ts', `try { y(); } catch (e) {}`);
    const result = checkBeforeCommit({
      sliceName: 'multi-file-pattern',
      changedFiles: [f1, f2],
      testsRun: ['pnpm test'],
    });
    const silentGroup = result.pattern_groups.find(g => g.pattern === 'silent_catch');
    assert.ok(silentGroup, 'should have silent_catch group');
    assert.equal(silentGroup.occurrences.length, 2, 'should aggregate both files in one group');
  });

  it('challenge with evidence drops blocker, allows pass', () => {
    const f = makeFile('bad/c.ts', `try { z(); } catch (e) {}`);
    const result = checkBeforeCommit({
      sliceName: 'challenge-test',
      changedFiles: [f],
      testsRun: ['pnpm test'],
      challenges: [
        {
          finding_id: `silent_catch:${f}:1`,
          file_path: f,
          line_number: 1,
          explanation: 'On line 1 the catch is intentional fire-and-forget cleanup pattern used by the test infrastructure here',
          code_excerpt: 'try { z(); } catch (e) {}',
        },
      ],
    });
    assert.equal(result.accepted_challenges.length, 1);
    assert.equal(result.passed, true);
  });

  it('founder-approved deferrals move blockers out of active list', () => {
    // Use unhandled_async (blocker) since silent_catch became a warning post-calibration.
    const f = makeFile('bad/d.ts', `
async function broken() {
  const data = await fetch('/api/x');
  return data;
}
`);
    const findingId = `unhandled_async:${f}:2`;
    const result = checkBeforeCommit({
      sliceName: 'defer-test',
      changedFiles: [f],
      testsRun: ['pnpm test'],
      founderApprovedDeferrals: [findingId],
    });
    assert.equal(result.passed, true);
    assert.equal(result.deferred_blockers.length, 1);
  });
});

describe('calibration fixes from real-world validation', () => {
  it('does NOT flag async main() when caller uses .catch() handler', () => {
    const f = makeFile('script.mjs', `
async function main() {
  const data = await fetch('/api/foo');
  return data.json();
}

main().catch(err => process.exit(1));
`);
    const groups = scanPatterns([f]);
    const asyncGroup = groups.find(g => g.pattern === 'unhandled_async');
    assert.ok(!asyncGroup || asyncGroup.occurrences.length === 0,
      'main().catch() pattern should be recognized as a valid error handler');
  });

  it('recognizes catch with no parens (ES2019 optional binding) as handled', () => {
    const f = makeFile('catch-no-parens.ts', `
async function fetcher() {
  try {
    const data = await fetch('/api/x');
    return data;
  } catch {
    return null;
  }
}
`);
    const groups = scanPatterns([f]);
    const asyncGroup = groups.find(g => g.pattern === 'unhandled_async');
    assert.ok(!asyncGroup || asyncGroup.occurrences.length === 0,
      'catch { ... } without parens should count as a handler');
  });

  it('does NOT flag async functions inside template literals (test fixtures)', () => {
    // Use array.join to avoid backtick-in-backtick escape problems.
    const bt = '`';
    const f = makeFile('test-fixture.test.mjs', [
      'const fixture = ' + bt,
      'async function broken() {',
      "  const data = await fetch('/api/x');",
      '  return data;',
      '}',
      bt + ';',
      "const otherFn = async () => 'safe';",
    ].join('\n'));
    const groups = scanPatterns([f]);
    const asyncGroup = groups.find(g => g.pattern === 'unhandled_async');
    assert.ok(!asyncGroup || asyncGroup.occurrences.length === 0,
      'async inside template literal is a fixture, not real code');
  });

  it('does NOT flag broken imports inside template literals', () => {
    const bt = '`';
    const f = makeFile('test-imports.test.mjs', [
      'const sample = ' + bt,
      "import { foo } from './nonexistent';",
      "import bar from '../also-fake';",
      bt + ';',
    ].join('\n'));
    const result = scanDependencies([f], workDir);
    assert.equal(result.broken_imports.length, 0,
      'imports inside template literals are test fixtures, not real imports');
  });

  it('does NOT fire silent_catch on .test.mjs files (intentional cleanup)', () => {
    const f = makeFile('cleanup.test.mjs', `
function cleanState() {
  try { unlinkSync('/tmp/foo') } catch {}
  try { unlinkSync('/tmp/bar') } catch {}
}
`);
    const groups = scanPatterns([f]);
    const silentGroup = groups.find(g => g.pattern === 'silent_catch');
    assert.ok(!silentGroup || silentGroup.occurrences.length === 0,
      'test cleanup empty catches are intentional');
  });

  it('DOES still fire silent_catch on production source files', () => {
    const f = makeFile('production.ts', `
function unsafe() {
  try { runCriticalThing(); } catch {}
}
`);
    const groups = scanPatterns([f]);
    const silentGroup = groups.find(g => g.pattern === 'silent_catch');
    assert.ok(silentGroup && silentGroup.occurrences.length > 0,
      'production silent catches must still be flagged');
  });

  it('does NOT flag TODO inside string literals or regex', () => {
    const f = makeFile('scanner.ts', `
const TODO_PATTERN = /\\\\b(TODO|FIXME|XXX|HACK)\\\\b/;
const message = 'Search for TODO comments';
const real_code = 'no comment here';
`);
    const groups = scanPatterns([f]);
    const todoGroup = groups.find(g => g.pattern === 'todo_in_committed_code');
    assert.ok(!todoGroup || todoGroup.occurrences.length === 0,
      'TODO inside string/regex literals should not be flagged');
  });

  it('DOES still flag real TODO comments', () => {
    const f = makeFile('with-todo.ts', `
function foo() {
  // TODO: implement this properly
  return null;
}
`);
    const groups = scanPatterns([f]);
    const todoGroup = groups.find(g => g.pattern === 'todo_in_committed_code');
    assert.ok(todoGroup && todoGroup.occurrences.length > 0,
      'real TODO comments must still be flagged');
  });
});
