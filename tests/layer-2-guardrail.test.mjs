import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;

function cleanState() {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  if (existsSync(READ_STATE_FILE)) unlinkSync(READ_STATE_FILE);
}

const VALID_INTENT = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which risks overwhelming the backend under load and could cause degraded performance for all users';

// --- Intent Validator ---

describe('Intent Validator', async () => {
  const { validateIntent } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'intent-validator.mjs')
  );

  it('should reject empty intent', () => {
    const result = validateIntent('');
    assert.equal(result.valid, false);
    assert.match(result.reason, /required/i);
  });

  it('should reject null intent', () => {
    const result = validateIntent(null);
    assert.equal(result.valid, false);
  });

  it('should reject intent under 30 words', () => {
    const result = validateIntent('fix the bug in chat route');
    assert.equal(result.valid, false);
    assert.match(result.reason, /too short/i);
  });

  it('should reject intent missing risk aspect', () => {
    const noRisk = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which will change the behavior of message sending for all users in the system significantly';
    const result = validateIntent(noRisk);
    assert.equal(result.valid, false);
    assert.match(result.reason, /risk/i);
  });

  it('should accept well-formed intent with all aspects', () => {
    const result = validateIntent(VALID_INTENT);
    assert.equal(result.valid, true);
  });
});

// --- Maturity Selector ---

describe('Maturity Selector', async () => {
  const { suggestMaturity } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'maturity-selector.mjs')
  );

  it('should suggest founder mode for CLAUDE.md', () => {
    const result = suggestMaturity({ filePath: 'CLAUDE.md' });
    assert.equal(result.mode, 'founder');
  });

  it('should suggest founder mode for locked docs', () => {
    const result = suggestMaturity({ filePath: 'docs/locked/chat-rules.md' });
    assert.equal(result.mode, 'founder');
  });

  it('should suggest senior mode for prisma schema', () => {
    const result = suggestMaturity({ filePath: 'prisma/schema.prisma' });
    assert.equal(result.mode, 'senior');
  });

  it('should suggest professional mode for route files', () => {
    const result = suggestMaturity({ filePath: 'apps/backend/src/routes/chat.ts' });
    assert.equal(result.mode, 'professional');
  });

  it('should use changeType over filePath when both present', () => {
    const result = suggestMaturity({ filePath: 'src/utils/helper.ts', changeType: 'config_change' });
    assert.equal(result.mode, 'founder');
  });

  it('should default to professional when no signals', () => {
    const result = suggestMaturity({ filePath: 'src/components/Button.tsx' });
    assert.equal(result.mode, 'professional');
  });

  it('should detect observer mode from intent', () => {
    const result = suggestMaturity({ filePath: 'src/foo.ts', intent: 'I need to audit this code' });
    assert.equal(result.mode, 'observer');
  });
});

// --- Next Question Engine ---

describe('Next Question Engine', async () => {
  const { generateNextQuestion, validateAnswer } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'next-question.mjs')
  );

  it('should generate a required question for high-risk files', () => {
    const result = generateNextQuestion({
      filePath: 'CLAUDE.md',
      intent: VALID_INTENT,
      riskLevel: 'high',
      fileWasRead: true,
      testsExist: true,
    });
    assert.ok(result);
    assert.equal(result.requires_answer, true);
    assert.ok(result.primary.next_best_question.includes('CLAUDE.md'));
  });

  it('should generate question when file not read', () => {
    const result = generateNextQuestion({
      filePath: 'src/routes/chat.ts',
      intent: VALID_INTENT,
      riskLevel: 'medium',
      fileWasRead: false,
      testsExist: true,
    });
    assert.ok(result);
    assert.equal(result.requires_answer, true);
    assert.match(result.primary.how_to_answer, /read_file/);
  });

  it('should return null when no concerns exist for low-risk read file with tests', () => {
    const result = generateNextQuestion({
      filePath: 'src/components/Button.tsx',
      intent: VALID_INTENT,
      riskLevel: 'low',
      fileWasRead: true,
      testsExist: true,
    });
    assert.equal(result, null);
  });

  it('should detect destructive intent and require answer', () => {
    const result = generateNextQuestion({
      filePath: 'src/utils/helper.ts',
      intent: 'I want to delete the legacy helper functions because they risk breaking if left unused and we need to remove dead code to reduce confusion and maintenance burden on the team going forward',
      riskLevel: 'low',
      fileWasRead: true,
      testsExist: true,
    });
    assert.ok(result);
    assert.equal(result.requires_answer, true);
    assert.match(result.primary.next_best_question, /depend/i);
  });

  it('should detect schema change intent', () => {
    const result = generateNextQuestion({
      filePath: 'prisma/schema.prisma',
      intent: 'Adding a new column to the User table for tracking last login timestamp because we need this migration for the analytics dashboard and there is risk of data loss if not handled properly',
      riskLevel: 'high',
      fileWasRead: true,
      testsExist: true,
    });
    assert.ok(result);
    const schemaQ = result.all.find(q => q.current_uncertainty.includes('schema'));
    assert.ok(schemaQ);
  });

  // Answer validation
  it('should reject empty answer', () => {
    const result = validateAnswer('', []);
    assert.equal(result.valid, false);
  });

  it('should reject answer without evidence', () => {
    const result = validateAnswer('The function is safe to change', []);
    assert.equal(result.valid, false);
    assert.match(result.reason, /evidence/i);
  });

  it('should reject answer with trivial evidence', () => {
    const result = validateAnswer('The function is safe to change', ['ok', 'yes']);
    assert.equal(result.valid, false);
  });

  it('should accept answer with substantive evidence', () => {
    const result = validateAnswer(
      'The function is only called from routes/chat.ts line 42, confirmed by grep',
      ['grep -rn "helperFn" src/ → only routes/chat.ts:42', 'No other callers found']
    );
    assert.equal(result.valid, true);
  });
});

// --- Confidence Calculator ---

describe('Confidence Calculator', async () => {
  const { calculateConfidence } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'confidence.mjs')
  );

  it('should return high confidence for low-risk, read file with tests', () => {
    const result = calculateConfidence({
      riskLevel: 'low',
      fileWasRead: true,
      testsExist: true,
      hasWarnings: false,
      hasHardBlocks: false,
      intentValid: true,
    });
    assert.equal(result.level, 'high');
    assert.ok(result.score >= 80);
  });

  it('should return blocked when hard blocks exist', () => {
    const result = calculateConfidence({
      riskLevel: 'low',
      fileWasRead: true,
      testsExist: true,
      hasWarnings: false,
      hasHardBlocks: true,
      intentValid: true,
    });
    assert.equal(result.level, 'blocked');
  });

  it('should reduce confidence for high-risk unread file without tests', () => {
    const result = calculateConfidence({
      riskLevel: 'high',
      fileWasRead: false,
      testsExist: false,
      hasWarnings: true,
      hasHardBlocks: false,
      intentValid: true,
    });
    assert.equal(result.level, 'low');
    assert.ok(result.score < 50);
  });

  it('should reduce confidence for medium-risk with warnings', () => {
    const result = calculateConfidence({
      riskLevel: 'medium',
      fileWasRead: true,
      testsExist: true,
      hasWarnings: true,
      hasHardBlocks: false,
      intentValid: true,
    });
    assert.equal(result.level, 'medium');
  });
});

// --- Check Before Edit (orchestrator) ---

describe('Check Before Edit', async () => {
  const { checkBeforeEdit } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-edit.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should reject invalid intent', () => {
    const result = checkBeforeEdit({
      intent: 'fix bug',
      filePaths: ['src/routes/chat.ts'],
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /too short/i);
  });

  it('should reject missing file paths', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: [],
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /No file paths/);
  });

  it('should approve low-risk file with valid intent (file read, tests exist)', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    assert.equal(result.allowed, true);
    assert.equal(result.edits_remaining, 3);
    assert.equal(result.confidence, 'high');
    assert.ok(result.approved_files.length > 0);
  });

  it('should block high-risk file with requires_answer', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      fileReadStatus: { 'CLAUDE.md': true },
      testStatus: { 'CLAUDE.md': true },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.requires_answer, true);
    assert.equal(result.edits_remaining, 1);
    assert.ok(result.next_questions);
    assert.ok(result.next_questions.primary.next_best_question.includes('CLAUDE.md'));
  });

  it('should block when hard blocks exist from impact check', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['src/routes/chat.ts'],
      impactCheckResult: {
        hardBlocks: ['Locked constraint: chat rate limit is 10/min per supervisor'],
        warnings: [],
        staleChunks: [],
        context: [],
        rules: [],
      },
    });
    assert.equal(result.allowed, false);
    assert.ok(result.hardBlocks.length > 0);
  });

  it('should write state file on approval', () => {
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
    });
    assert.ok(existsSync(STATE_FILE));
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    assert.equal(state.edits_remaining, 3);
    assert.ok(state.timestamp > 0);
  });

  it('should include maturity mode in response', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['docs/locked/chat-rules.md'],
      fileReadStatus: { 'docs/locked/chat-rules.md': true },
      testStatus: { 'docs/locked/chat-rules.md': true },
    });
    assert.equal(result.maturityMode, 'founder');
  });

  it('should accept answered question with evidence and unlock edit', () => {
    // First call: creates state with requires_answer=true
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      fileReadStatus: { 'CLAUDE.md': true },
      testStatus: { 'CLAUDE.md': true },
    });

    // Second call: answer the question
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      answeredQuestion: 'The CLAUDE.md enforces the guardrail mandate and core reasoning invariants',
      evidence: ['grep -n "guardrail" CLAUDE.md → line 15, 22', 'Read full file, no product terms found'],
    });
    assert.equal(result.allowed, true);
    assert.equal(result.requires_answer, false);
  });

  it('should reject answered question without proper evidence', () => {
    checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      fileReadStatus: { 'CLAUDE.md': true },
      testStatus: { 'CLAUDE.md': true },
    });

    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      answeredQuestion: 'Its fine',
      evidence: [],
    });
    assert.equal(result.allowed, false);
  });

  it('should include warnings and stale chunks from impact check', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/mobile/src/components/Button.tsx'],
      fileReadStatus: { 'apps/mobile/src/components/Button.tsx': true },
      testStatus: { 'apps/mobile/src/components/Button.tsx': true },
      impactCheckResult: {
        hardBlocks: [],
        warnings: ['Button style changes may affect mobile layout'],
        staleChunks: [{ source: 'docs/ui-spec.md', similarity: 0.7 }],
        context: [{ source: 'docs/design-tokens.md', similarity: 0.9, content: 'color tokens' }],
        rules: [{ source: '.claude/rules/mobile.md', content: 'use design tokens' }],
      },
    });
    assert.equal(result.allowed, true);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.staleChunks.length, 1);
    assert.equal(result.rules.length, 1);
    assert.equal(result.context.length, 1);
  });

  it('should return medium-risk edit count for route files', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['apps/backend/src/routes/chat.ts'],
      fileReadStatus: { 'apps/backend/src/routes/chat.ts': true },
      testStatus: { 'apps/backend/src/routes/chat.ts': true },
    });
    assert.equal(result.edits_remaining, 2);
  });
});

// --- Server tool definition ---

describe('Server Tool Definition', async () => {
  const { EDIT_TOOL_DEFINITION, PLAN_TOOL_DEFINITION, DONE_TOOL_DEFINITION, handleEditToolCall } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'server.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should export a valid edit tool definition', () => {
    assert.equal(EDIT_TOOL_DEFINITION.name, 'check_before_edit');
    assert.ok(EDIT_TOOL_DEFINITION.inputSchema);
    assert.ok(EDIT_TOOL_DEFINITION.inputSchema.properties.intent);
    assert.ok(EDIT_TOOL_DEFINITION.inputSchema.properties.file_paths);
    assert.deepEqual(EDIT_TOOL_DEFINITION.inputSchema.required, ['intent', 'file_paths']);
  });

  it('should export plan and done tool definitions', () => {
    assert.equal(PLAN_TOOL_DEFINITION.name, 'check_before_plan');
    assert.ok(PLAN_TOOL_DEFINITION.inputSchema.properties.architecture_evidence);
    assert.equal(DONE_TOOL_DEFINITION.name, 'check_before_done');
    assert.ok(DONE_TOOL_DEFINITION.inputSchema.properties.coverage_notes);
    assert.ok(DONE_TOOL_DEFINITION.inputSchema.required.includes('coverage_notes'));
  });

  it('should handle edit tool call via handleEditToolCall', async () => {
    const result = await handleEditToolCall({
      intent: VALID_INTENT,
      file_paths: ['apps/mobile/src/components/Button.tsx'],
    });
    assert.equal(result.allowed, true);
    assert.ok(result.edits_remaining > 0);
  });
});

// --- Quality Gate Context-Aware Skips ---

describe('Quality Gate False-Positive Filters', async () => {
  const { runPatternChecks } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'quality-gate.mjs')
  );

  function findCheck(findings, checkId) {
    return findings.find(f => f.checkId === checkId);
  }

  it('should skip role_check in Prisma schema files', () => {
    const content = '/// The authenticate middleware guards this model\nmodel User { id Int @id }';
    const findings = runPatternChecks(content, 'packages/shared-schema/prisma/schema.prisma');
    assert.equal(findCheck(findings, 'role_check'), undefined);
  });

  it('should skip role_check in comment lines', () => {
    const content = '// authenticate middleware is applied at the router level\nconst x = 1;';
    const findings = runPatternChecks(content, 'src/routes/auth.ts');
    assert.equal(findCheck(findings, 'role_check'), undefined);
  });

  it('should STILL catch real role_check in code', () => {
    const content = 'app.use(authenticate);\nconst data = fetchData();\nreturn data;';
    const findings = runPatternChecks(content, 'src/routes/worker.ts');
    assert.ok(findCheck(findings, 'role_check'));
  });

  it('should skip real_timer_in_test on production files', () => {
    const content = 'setTimeout(() => server.close(), 5000);';
    const findings = runPatternChecks(content, 'src/server.ts', false);
    assert.equal(findCheck(findings, 'real_timer_in_test'), undefined);
  });

  it('should catch real_timer_in_test on test files', () => {
    const content = 'await new Promise(resolve => setTimeout(resolve, 5000));';
    const findings = runPatternChecks(content, 'src/server.test.ts', true);
    assert.ok(findCheck(findings, 'real_timer_in_test'));
  });

  it('should skip unsafe_test_cast on production files', () => {
    const content = 'const mod = imported as unknown as OneSignalModule;';
    const findings = runPatternChecks(content, 'src/lib/onesignal.ts', false);
    assert.equal(findCheck(findings, 'unsafe_test_cast'), undefined);
  });

  it('should skip hardcoded_route on route definitions', () => {
    const content = "app.post('/auth/otp/request', async (req, res) => {});";
    const findings = runPatternChecks(content, 'src/routes/auth.ts');
    assert.equal(findCheck(findings, 'hardcoded_route'), undefined);
  });

  it('should STILL catch hardcoded_route on consumers', () => {
    const content = "const res = await fetch('/auth/otp/request');";
    const findings = runPatternChecks(content, 'src/lib/api.ts');
    assert.ok(findCheck(findings, 'hardcoded_route'));
  });

  it('should skip hardcoded_url in const declarations', () => {
    const content = "const POLICY_URL = 'https://axhy.app/privacy';";
    const findings = runPatternChecks(content, 'src/consent.tsx');
    assert.equal(findCheck(findings, 'hardcoded_url'), undefined);
  });

  it('should skip hardcoded_role in Expo Router paths', () => {
    const content = "router.push('/(supervisor)/profile');";
    const findings = runPatternChecks(content, 'src/navigation.ts');
    assert.equal(findCheck(findings, 'hardcoded_role'), undefined);
  });

  it('should skip hardcoded_state_value with word boundary (previousState)', () => {
    const content = "return { previousState: 'PENDING_ACTIVATION', newState: 'ACTIVE' };";
    const findings = runPatternChecks(content, 'src/services/otp.ts');
    assert.equal(findCheck(findings, 'hardcoded_state_value'), undefined);
  });

  it('should skip hardcoded_state_value in Prisma @default', () => {
    const content = "status String @default('ACTIVE')";
    const findings = runPatternChecks(content, 'prisma/schema.prisma');
    assert.equal(findCheck(findings, 'hardcoded_state_value'), undefined);
  });

  it('should skip hardcoded_state_value in read-side where clause', () => {
    const content = "const active = await prisma.membership.findMany({\n  where: {\n    status: 'ACTIVE',\n    companyId,\n  }\n});";
    const findings = runPatternChecks(content, 'src/routes/auth.ts');
    assert.equal(findCheck(findings, 'hardcoded_state_value'), undefined);
  });

  it('should skip hardcoded_state_value in test files', () => {
    const content = "const worker = { state: 'PENDING_ACTIVATION', phone: '+91...' };";
    const findings = runPatternChecks(content, 'test/auth.test.ts', true);
    assert.equal(findCheck(findings, 'hardcoded_state_value'), undefined);
  });

  it('should skip unhandled_async when try/catch is within 20 lines', () => {
    const lines = [
      'async function handleVerify(code: string) {',
      '  try {',
      '    const a = 1;', '    const b = 2;', '    const c = 3;',
      '    const d = 4;', '    const e = 5;', '    const f = 6;',
      '    const g = 7;', '    const h = 8;', '    const i = 9;',
      '    const result = await verifyOTP(code);',
      '    return result;',
      '  } catch (err) {',
      '    setError(err.message);',
      '  }',
      '}',
    ];
    const content = lines.join('\n');
    const findings = runPatternChecks(content, 'src/otp.tsx');
    assert.equal(findCheck(findings, 'unhandled_async'), undefined);
  });

  it('should skip magic_number in comment lines', () => {
    const content = '// timeout is :51 seconds for retry\nconst x = 1;';
    const findings = runPatternChecks(content, 'src/lib/timer.ts');
    assert.equal(findCheck(findings, 'magic_number'), undefined);
  });

  it('should skip magic_number in Prisma files', () => {
    const content = 'digits Int @db.SmallInt @default(30)';
    const findings = runPatternChecks(content, 'prisma/schema.prisma');
    assert.equal(findCheck(findings, 'magic_number'), undefined);
  });

  it('should skip unhandled_async in test files (vitest pattern)', () => {
    const content = "it('accepts WORKER-only membership', async () => {\n  const result = await verifyOTP('123456');\n  expect(result).toBeDefined();\n});";
    const findings = runPatternChecks(content, 'lib/identity-lifecycle.test.ts', true);
    assert.equal(findCheck(findings, 'unhandled_async'), undefined);
  });

  it('should skip unsafe_test_cast in test files (vitest mock pattern)', () => {
    const content = "const setTokens = vi.fn() as unknown as ReturnType<typeof vi.fn>;";
    const findings = runPatternChecks(content, 'lib/identity-lifecycle.test.ts', true);
    assert.equal(findCheck(findings, 'unsafe_test_cast'), undefined);
  });

  it('should STILL catch unsafe_cast (as Role) in production code', () => {
    const content = "const role = membership.role as Role;";
    const findings = runPatternChecks(content, 'src/routes/auth.ts', false);
    assert.ok(findCheck(findings, 'unsafe_cast'));
  });

  it('should STILL catch unhandled_async in production code without try/catch', () => {
    const content = "async function handleLogout() {\n  await logout();\n  router.push('/login');\n}";
    const findings = runPatternChecks(content, 'src/components/profile.tsx', false);
    assert.ok(findCheck(findings, 'unhandled_async'));
  });
});

// --- Done-Memo Process Gates ---

describe('Done-Memo Process Gates', async () => {
  const { checkBeforeDone } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-done.mjs')
  );

  const BASE_ARGS = {
    intent: 'Completed backend routes for worker today endpoint with real DB tests against Railway sandbox, covering GET /worker/today and GET /worker/visits/:id with proper tenant isolation',
    sliceName: 'worker-d1-s2a-1-backend-today',
    doneMemoFile: 'handoff/done-memo-test.md',
    sliceFiles: ['package.json'],
    screenshotsTaken: false,
    typecheckPassed: true,
    testsPassed: true,
    coverageNotes: 'Covers sprint plan items 2a-1: backend routes for /worker/today and /worker/visits/:id. No UI in this sub-slice.',
    selfReasoningSummary: 'impactCheck returned no hardBlocks. Verified locked constraints on multi-tenant isolation. No stale docs found.',
    handoffUpdated: true,
  };

  it('should block when self_reasoning_summary is missing', async () => {
    const result = await checkBeforeDone({ ...BASE_ARGS, selfReasoningSummary: '' });
    assert.equal(result.allowed, false);
    const hasSelfReasoning = result.preflight_failures.some(f => f.includes('self-reasoning'));
    assert.ok(hasSelfReasoning, 'Should mention self-reasoning in preflight failure');
  });

  it('should block when handoff_updated is false', async () => {
    const result = await checkBeforeDone({ ...BASE_ARGS, handoffUpdated: false });
    assert.equal(result.allowed, false);
    const hasHandoff = result.preflight_failures.some(f => f.includes('Handoff'));
    assert.ok(hasHandoff, 'Should mention handoff in preflight failure');
  });

  it('should block when self_reasoning_summary is too short', async () => {
    const result = await checkBeforeDone({ ...BASE_ARGS, selfReasoningSummary: 'ran impactCheck' });
    assert.equal(result.allowed, false);
    const hasSelfReasoning = result.preflight_failures.some(f => f.includes('self-reasoning'));
    assert.ok(hasSelfReasoning);
  });

  it('should pass when all process gates are satisfied', async () => {
    const result = await checkBeforeDone(BASE_ARGS);
    // May still fail on quality gate (no real files), but should NOT fail on preflight
    if (!result.allowed && result.preflight_failures) {
      const processGates = result.preflight_failures.filter(f =>
        f.includes('self-reasoning') || f.includes('Handoff') || f.includes('Uncommitted')
      );
      assert.equal(processGates.length, 0, 'No process gate failures when all gates satisfied');
    }
  });
});
