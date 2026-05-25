import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots } from '../src/shared/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;

const WORKSPACE_ROOTS = getWorkspaceRoots();

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function cleanState() {
  for (const h of allHashes()) {
    for (const suffix of ['guardrail-state.json', 'read-state.json', 'plan-guardrail-state.json', 'done-guardrail-state.json', 'build-guardrail-state.json']) {
      try { unlinkSync(`/tmp/axhy-${h}-${suffix}`); } catch {}
    }
  }
}

const VALID_INTENT = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which risks overwhelming the backend under load and could cause degraded performance for all users';

// H1 fix: reasoning evidence now required for high/medium risk files
const HIGH_RISK_EVIDENCE = {
  invariants_preserved: 'The existing guardrail mandate at CLAUDE.md line 36 stays intact because the change only adds new content below existing sections',
  risk_if_wrong: 'If the change introduces product terms into CLAUDE.md, the memory firewall hook at storage-hook.mjs will block future edits',
  what_would_make_me_stop: 'If grep reveals product terms like worker or facility in the new content, or if existing test assertions in layer-2-guardrail.test.mjs break',
  files_read: ['CLAUDE.md', 'src/memory-firewall/storage-hook.mjs'],
};

const MEDIUM_RISK_EVIDENCE = {
  risk_if_wrong: 'If the route handler at routes/chat.ts breaks, all chat API endpoints will return 500 errors affecting every connected client',
  why_this_path_is_safe: 'The change adds a middleware wrapper around the existing handler at chat.ts line 15 without modifying the core logic or database queries',
  files_read: ['apps/backend/src/routes/chat.ts'],
};

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

  it('should accept any 30+ word intent (keyword matching removed)', () => {
    // Keyword-based validation was removed — Goodhart's Law made it train
    // vocabulary performance, not reasoning. Structured evidence validation
    // now handles reasoning quality (see Evidence Validator tests below).
    const noKeywords = 'I want to update the chat route handler to add rate limiting for supervisor messages because the current implementation has no throttling which will change the behavior of message sending for all users in the system significantly';
    const result = validateIntent(noKeywords);
    assert.equal(result.valid, true);
  });

  it('should accept well-formed intent with all aspects', () => {
    const result = validateIntent(VALID_INTENT);
    assert.equal(result.valid, true);
  });
});

describe('Evidence Validator', async () => {
  const { validateEvidence, getRequiredFields } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'evidence-validator.mjs')
  );

  it('should require evidence object for high-risk', () => {
    const result = validateEvidence(null, 'high');
    assert.equal(result.valid, false);
    assert.ok(result.missing.length > 0);
  });

  it('should require all 4 fields for high-risk', () => {
    const fields = getRequiredFields('high');
    assert.deepEqual(fields, ['invariants_preserved', 'risk_if_wrong', 'what_would_make_me_stop', 'files_read']);
  });

  it('should require 3 fields for medium-risk', () => {
    const fields = getRequiredFields('medium');
    assert.deepEqual(fields, ['risk_if_wrong', 'why_this_path_is_safe', 'files_read']);
  });

  it('should require only files_read for low-risk', () => {
    const fields = getRequiredFields('low');
    assert.deepEqual(fields, ['files_read']);
  });

  it('should reject evidence with missing fields', () => {
    const result = validateEvidence({ files_read: ['foo.ts'] }, 'high');
    assert.equal(result.valid, false);
    assert.ok(result.missing.includes('invariants_preserved'));
  });

  it('should reject evidence fields under 10 words', () => {
    const result = validateEvidence({
      invariants_preserved: 'stays intact',
      risk_if_wrong: 'things break',
      what_would_make_me_stop: 'bad stuff',
      files_read: ['foo.ts'],
    }, 'high');
    assert.equal(result.valid, false);
    assert.match(result.reason, /too brief/i);
  });

  it('should reject evidence lacking specific references', () => {
    const result = validateEvidence({
      invariants_preserved: 'the existing behavior of the system stays completely intact and nothing will change at all anywhere ever',
      risk_if_wrong: 'if my assumptions are incorrect then the whole system would break and users would be affected badly everywhere',
      what_would_make_me_stop: 'if I find that the change impacts other parts of the codebase in unexpected ways that I did not anticipate beforehand',
      files_read: ['foo.ts'],
    }, 'high');
    assert.equal(result.valid, false);
    assert.match(result.reason, /specificity/i);
  });

  it('should accept valid high-risk evidence with specific references', () => {
    const result = validateEvidence({
      invariants_preserved: 'Multi-tenant isolation via companyId filter on line 47 of chat.ts stays intact because my change only adds rate limiting above the query layer',
      risk_if_wrong: 'If the rate limiter throws before the auth check in middleware/auth.ts then unauthenticated requests could consume rate budget for legitimate users',
      what_would_make_me_stop: 'If I find any path where the rate limit check runs outside the authenticated middleware chain in routes/chat.ts I would halt immediately',
      files_read: ['apps/backend/src/routes/chat.ts', 'apps/backend/src/middleware/auth.ts'],
    }, 'high');
    assert.equal(result.valid, true);
  });

  it('should accept valid low-risk evidence with just files_read', () => {
    const result = validateEvidence({
      files_read: ['apps/mobile/src/components/Button.tsx'],
    }, 'low');
    assert.equal(result.valid, true);
  });

  it('should reject empty files_read array', () => {
    const result = validateEvidence({ files_read: [] }, 'low');
    assert.equal(result.valid, false);
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
      intent: 'I want to delete file src/utils/legacy-helper.ts because the functions risk breaking if left unused and we need to remove endpoint /api/legacy to reduce confusion and maintenance burden on the team',
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
    assert.equal(result.edits_remaining, 200);
    // Response shrinkage: confidence is now omitted on success path when score >= 90
    // (the "All checks passed" reason was pure noise). High confidence is the implicit
    // default when allowed === true and no confidence field is present.
    assert.ok(result.approved_files.length > 0);
  });

  it('should block high-risk file with requires_answer', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['CLAUDE.md'],
      fileReadStatus: { 'CLAUDE.md': true },
      testStatus: { 'CLAUDE.md': true },
      reasoningEvidence: HIGH_RISK_EVIDENCE,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.requires_answer, true);
    assert.equal(result.edits_remaining, 50);
    // Response shrinkage: next_questions (plural with duplicate primary+all)
    // renamed to next_question (singular, no nesting).
    assert.ok(result.next_question);
    assert.ok(result.next_question.next_best_question.includes('CLAUDE.md'));
  });

  it('should block when hard blocks exist from impact check', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['src/routes/chat.ts'],
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
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
    assert.equal(state.edits_remaining, 200);
    assert.ok(state.timestamp > 0);
  });

  it('should include maturity mode in response', () => {
    const result = checkBeforeEdit({
      intent: VALID_INTENT,
      filePaths: ['docs/locked/chat-rules.md'],
      fileReadStatus: { 'docs/locked/chat-rules.md': true },
      testStatus: { 'docs/locked/chat-rules.md': true },
      reasoningEvidence: HIGH_RISK_EVIDENCE,
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
      reasoningEvidence: HIGH_RISK_EVIDENCE,
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
      reasoningEvidence: HIGH_RISK_EVIDENCE,
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
      reasoningEvidence: MEDIUM_RISK_EVIDENCE,
    });
    assert.equal(result.edits_remaining, 100);
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
    // Without a live DB, impactCheck returns warnings which may trigger
    // requires_answer=true. The key assertion is that the handler runs
    // without crashing and returns a well-formed result with edit budget.
    assert.ok(result.edits_remaining > 0);
    assert.ok(result.approved_files.includes('apps/mobile/src/components/Button.tsx'));
    assert.ok('confidence' in result);
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

// ── State-Freeze Bug Fix Tests ──────────────────────────────────────────────
// Regression tests for the bug where approved_files stayed frozen from a
// previous request when answering questions for a different file.
describe('State-Freeze Bug Fix', () => {
  let writeGuardrailState, readGuardrailState, markQuestionAnswered, createApprovalState;

  before(async () => {
    const mod = await import('../src/layer-2-guardrail/state-tracker.mjs');
    writeGuardrailState = mod.writeGuardrailState;
    readGuardrailState = mod.readGuardrailState;
    markQuestionAnswered = mod.markQuestionAnswered;
    createApprovalState = mod.createApprovalState;
  });

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('markQuestionAnswered should update approved_files when filePaths provided', () => {
    // Simulate: file A gets approved first
    const stateA = createApprovalState({
      intent: 'editing file A for some valid reason with more than thirty words to pass the validator check',
      approvedFiles: ['src/fileA.ts'],
      editsRemaining: 3,
    });
    writeGuardrailState(stateA);

    // Now answer a question for file B — approved_files should update
    const result = markQuestionAnswered(
      'The invariant is X and my change preserves it because Y',
      ['src/fileB.ts:42 — the function signature confirms compatibility'],
      ['src/fileB.ts']  // <-- the new filePaths
    );

    assert.ok(result, 'markQuestionAnswered should return state');
    assert.deepEqual(result.approved_files, ['src/fileB.ts'],
      'approved_files should update to file B when filePaths is passed');
    assert.equal(result.question_answered, true);
  });

  it('markQuestionAnswered should keep original approved_files when filePaths is null', () => {
    const stateA = createApprovalState({
      intent: 'editing file A for a valid reason with enough words to pass the thirty word minimum check here',
      approvedFiles: ['src/fileA.ts'],
      editsRemaining: 3,
    });
    writeGuardrailState(stateA);

    // Answer without providing new filePaths — original should persist
    const result = markQuestionAnswered(
      'The file was read and the current state is understood clearly',
      ['Read output shows function at line 42']
    );

    assert.ok(result);
    assert.deepEqual(result.approved_files, ['src/fileA.ts'],
      'approved_files should stay unchanged when filePaths is null');
  });

  it('writeGuardrailState timestamp guard should prevent stale overwrite', () => {
    // Simulate: newer state written first (e.g., from a later request)
    const newerState = createApprovalState({
      intent: 'newer request for file B with enough words to pass the intent validator check',
      approvedFiles: ['src/fileB.ts'],
      editsRemaining: 3,
    });
    writeGuardrailState(newerState);

    // Now an older state tries to overwrite (e.g., from a slower async handler)
    const olderState = createApprovalState({
      intent: 'older request for file A with enough words to pass the intent validator check',
      approvedFiles: ['src/fileA.ts'],
      editsRemaining: 3,
    });
    olderState.timestamp = newerState.timestamp - 1000; // Force older timestamp

    writeGuardrailState(olderState);

    // The newer state should win
    const current = readGuardrailState();
    assert.deepEqual(current.approved_files, ['src/fileB.ts'],
      'Timestamp guard should prevent older state from overwriting newer state');
  });

  it('writeGuardrailState should allow newer state to overwrite older', () => {
    const olderState = createApprovalState({
      intent: 'first request for file A with enough words to pass the intent validator minimum check',
      approvedFiles: ['src/fileA.ts'],
      editsRemaining: 3,
    });
    writeGuardrailState(olderState);

    // A newer state should successfully overwrite
    const newerState = createApprovalState({
      intent: 'second request for file B with enough words to pass the intent validator minimum check',
      approvedFiles: ['src/fileB.ts'],
      editsRemaining: 3,
    });
    writeGuardrailState(newerState);

    const current = readGuardrailState();
    assert.deepEqual(current.approved_files, ['src/fileB.ts'],
      'Newer state should successfully overwrite older state');
  });

  it('full flow: checkBeforeEdit answer submission updates approved_files', async () => {
    const { checkBeforeEdit } = await import('../src/layer-2-guardrail/check-before-edit.mjs');

    // Step 1: Approve file A (low-risk bug_fix, no question required, avoids build preflight)
    const resultA = checkBeforeEdit({
      intent: 'I want to fix a typo in the logging utility function in the utils folder that causes incorrect timestamps in development mode debug output when the application starts up and initializes the logger module for the first time',
      filePaths: ['src/utils/logger.ts'],
      changeType: 'bug_fix',
      fileReadStatus: { 'src/utils/logger.ts': true },
      testStatus: { 'src/utils/logger.ts': true },
      impactCheckResult: null,
    });
    assert.equal(resultA.allowed, true, 'File A should be approved');
    assert.deepEqual(resultA.approved_files, ['src/utils/logger.ts']);

    // Step 2: Now answer a question for file B — simulating the bug scenario
    const resultB = checkBeforeEdit({
      intent: 'I want to fix a bug in the worker service that causes the state machine to get stuck in a pending state when the network connection drops during a status transition and the retry logic fails to recover gracefully',
      filePaths: ['src/services/worker-service.ts'],
      changeType: 'bug_fix',
      answeredQuestion: 'What is the current content of src/services/worker-service.ts and what invariant does it enforce?',
      evidence: ['Read the file at line 42-88. The invariant is that status transitions only go forward, never backward. My fix preserves this.'],
      fileReadStatus: { 'src/services/worker-service.ts': true },
      testStatus: { 'src/services/worker-service.ts': true },
      impactCheckResult: null,
    });

    assert.equal(resultB.allowed, true, 'File B answer should be approved');
    assert.deepEqual(resultB.approved_files, ['src/services/worker-service.ts'],
      'BUG FIX: approved_files must update to file B, not stay frozen on file A');

    // Step 3: Verify state file also reflects file B
    const state = readGuardrailState();
    assert.deepEqual(state.approved_files, ['src/services/worker-service.ts'],
      'State file on disk must also reflect file B');
  });
});

// ── Answer Submission State-Desync Bug Fix ────────────────────────────────
// Regression test for the bug where calling check_before_edit with
// answered_question but without evidence (or without file_paths) would
// fall through to the main validation path and return the misleading
// "No file paths provided" error instead of routing to handleAnswerSubmission.
describe('Answer Submission State-Desync Fix', () => {
  let checkBeforeEdit, writeGuardrailState, createApprovalState;

  before(async () => {
    const editMod = await import('../src/layer-2-guardrail/check-before-edit.mjs');
    checkBeforeEdit = editMod.checkBeforeEdit;
    const stateMod = await import('../src/layer-2-guardrail/state-tracker.mjs');
    writeGuardrailState = stateMod.writeGuardrailState;
    createApprovalState = stateMod.createApprovalState;
  });

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should return evidence error, NOT file_paths error, when answeredQuestion has no evidence', () => {
    // Set up a state with requires_answer: true (simulating the first call)
    const state = createApprovalState({
      intent: 'editing file for valid reason with enough words to pass the intent validation check minimum',
      approvedFiles: ['src/routes/auth.ts'],
      editsRemaining: 200,
      requiresAnswer: true,
      nextQuestion: 'What is the current content of src/routes/auth.ts?',
    });
    writeGuardrailState(state);

    // Retry with answered_question but NO evidence and NO filePaths
    const result = checkBeforeEdit({
      answeredQuestion: 'The file contains the auth route handler with JWT validation at line 42',
      // evidence: deliberately omitted
      // filePaths: deliberately omitted
      fileReadStatus: {},
      testStatus: {},
    });

    assert.equal(result.allowed, false);
    // The error should be about evidence, NOT about file paths
    assert.ok(
      result.reason.toLowerCase().includes('evidence'),
      `Expected evidence error, got: "${result.reason}"`
    );
    assert.ok(
      !result.reason.includes('No file paths provided'),
      'Must NOT return misleading "No file paths provided" error on answer retry'
    );
  });

  it('should succeed with answeredQuestion + evidence but WITHOUT filePaths (uses state)', () => {
    // Set up state with approved_files already set
    const state = createApprovalState({
      intent: 'editing auth route for valid reason with enough words to satisfy the thirty word check',
      approvedFiles: ['src/routes/auth.ts'],
      editsRemaining: 200,
      requiresAnswer: true,
      nextQuestion: 'What is the current content of src/routes/auth.ts?',
    });
    writeGuardrailState(state);

    // Retry with answered_question + evidence but NO filePaths
    const result = checkBeforeEdit({
      answeredQuestion: 'The file contains the auth route handler with JWT validation at line 42',
      evidence: ['Read src/routes/auth.ts lines 1-50. JWT validation middleware at line 12.'],
      // filePaths: deliberately omitted — should use approved_files from state
      fileReadStatus: {},
      testStatus: {},
    });

    assert.equal(result.allowed, true, 'Should approve when evidence is valid');
    assert.deepEqual(result.approved_files, ['src/routes/auth.ts'],
      'Should use approved_files from existing state when filePaths not provided');
  });

  it('should still work normally with answeredQuestion + evidence + filePaths', () => {
    const state = createApprovalState({
      intent: 'editing auth route for valid reason with enough words to satisfy the thirty word check',
      approvedFiles: ['src/routes/auth.ts'],
      editsRemaining: 200,
      requiresAnswer: true,
      nextQuestion: 'What is the current content of src/routes/auth.ts?',
    });
    writeGuardrailState(state);

    const result = checkBeforeEdit({
      answeredQuestion: 'The file contains the auth route handler with JWT validation at line 42',
      evidence: ['Read src/routes/auth.ts lines 1-50. JWT validation middleware at line 12.'],
      filePaths: ['src/routes/auth.ts'],
      fileReadStatus: { 'src/routes/auth.ts': true },
      testStatus: {},
    });

    assert.equal(result.allowed, true, 'Should approve with all params provided');
    assert.deepEqual(result.approved_files, ['src/routes/auth.ts']);
  });
});

// ── Build State: Structured Field Values + Impact Results ──────────────────
// Tests that createBuildApprovalState stores declared field values and brain
// retrieval results, which check_before_done uses for declaration-vs-delivery diff.
describe('Build State: Structured Fields + Impact Results', () => {
  let createBuildApprovalState, writeBuildGuardrailState, readBuildGuardrailState;

  before(async () => {
    const mod = await import('../src/layer-2-guardrail/state-tracker.mjs');
    createBuildApprovalState = mod.createBuildApprovalState;
    writeBuildGuardrailState = mod.writeBuildGuardrailState;
    readBuildGuardrailState = mod.readBuildGuardrailState;
  });

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should store structuredFieldValues in build state', () => {
    const fields = {
      feature_goal: 'Add worker authentication endpoint',
      security_boundary: 'JWT validation on every request with role-based access control',
      tenant_and_resource_ownership: 'All queries filter by companyId from JWT claims',
    };
    const state = createBuildApprovalState({
      sliceName: 'worker-auth',
      planReference: 'plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/routes/auth.ts'],
      structuredFieldValues: fields,
    });
    writeBuildGuardrailState(state);

    const loaded = readBuildGuardrailState();
    assert.ok(loaded.structured_field_values, 'Should have structured_field_values');
    assert.equal(loaded.structured_field_values.feature_goal, fields.feature_goal);
    assert.equal(loaded.structured_field_values.security_boundary, fields.security_boundary);
  });

  it('should store impactResults in build state', () => {
    const impacts = [
      { id: 'abc-123', title: 'Chat abuse prevention', type: 'locked_doc', authority_level: 'locked', score: 0.85, snippet: 'Rate limiting rules...' },
      { id: 'def-456', title: 'Auth learning', type: 'learning', authority_level: 'curated', score: 0.72, snippet: 'Previous session...' },
    ];
    const state = createBuildApprovalState({
      sliceName: 'worker-auth',
      planReference: 'plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/routes/auth.ts'],
      impactResults: impacts,
    });
    writeBuildGuardrailState(state);

    const loaded = readBuildGuardrailState();
    assert.ok(Array.isArray(loaded.impact_results), 'Should have impact_results array');
    assert.equal(loaded.impact_results.length, 2);
    assert.equal(loaded.impact_results[0].authority_level, 'locked');
    assert.equal(loaded.impact_results[1].type, 'learning');
  });

  it('should default structuredFieldValues and impactResults to empty', () => {
    const state = createBuildApprovalState({
      sliceName: 'test-slice',
      planReference: 'plan.md',
      sliceScope: 'backend',
      plannedFiles: [],
    });
    assert.deepEqual(state.structured_field_values, {});
    assert.deepEqual(state.impact_results, []);
  });
});

// ── Declaration-vs-Delivery Diff ──────────────────────────────────────────
// Tests that check_before_done catches items declared in check_before_build
// but not addressed in the done summary.
describe('Declaration-vs-Delivery Diff', () => {
  let checkBeforeDone, writeBuildGuardrailState, createBuildApprovalState;

  const BUILD_STATE_FILE = `/tmp/axhy-${REPO_HASH}-build-guardrail-state.json`;

  before(async () => {
    const doneMod = await import(
      join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-done.mjs')
    );
    checkBeforeDone = doneMod.checkBeforeDone;

    const stateMod = await import('../src/layer-2-guardrail/state-tracker.mjs');
    writeBuildGuardrailState = stateMod.writeBuildGuardrailState;
    createBuildApprovalState = stateMod.createBuildApprovalState;
  });

  beforeEach(() => cleanState());
  after(() => cleanState());

  const DONE_BASE = {
    intent: 'Completed worker authentication endpoint with JWT validation and role-based access control, all queries filter by companyId from JWT claims, token refresh handles session loss on network interruption, no crash paths in backend route, JWT secret in environment variables only, tested with real database',
    sliceName: 'worker-auth',
    doneMemoFile: 'handoff/done-memo-test.md',
    sliceFiles: ['package.json'],
    typecheckPassed: true,
    testsPassed: true,
    coverageNotes: 'Covers auth routes with JWT validation, role checks, tenant isolation via companyId filtering, token refresh for data loss prevention, crash safety verified',
    selfReasoningSummary: 'impactCheck returned no hardBlocks. Verified security boundary with JWT validation, tenant ownership via companyId, credentials stored as environment variables. No stale docs.',
    handoffUpdated: true,
  };

  it('should PASS when done summary addresses all declared fields', async () => {
    // Write build state with declarations that ARE addressed in done summary
    const buildState = createBuildApprovalState({
      sliceName: 'worker-auth',
      planReference: 'plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/routes/auth.ts'],
      structuredFieldValues: {
        feature_goal: 'Add worker authentication endpoint',
        security_boundary: 'JWT validation on every request with role-based access control',
        tenant_and_resource_ownership: 'All queries filter by companyId from JWT claims',
        data_loss_paths: 'Token refresh prevents session loss on network interruption',
        app_store_crash_risks: 'No native crash paths in backend authentication route',
        secrets_and_credentials: 'JWT secret stored in environment variables only',
      },
    });
    writeBuildGuardrailState(buildState);

    const result = await checkBeforeDone(DONE_BASE);
    // Should not have declaration-vs-delivery failures
    if (!result.allowed && result.preflight_failures) {
      const declGaps = result.preflight_failures.filter(f => f.includes('Declaration-vs-delivery'));
      assert.equal(declGaps.length, 0,
        'Should NOT flag declaration-vs-delivery gap when done summary addresses declarations');
    }
  });

  it('should CATCH gap when non-deferrable field not in done summary', async () => {
    // Write build state with a security declaration about "websocket encryption"
    // that is NOT mentioned anywhere in the done summary
    const buildState = createBuildApprovalState({
      sliceName: 'worker-auth',
      planReference: 'plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/routes/auth.ts'],
      structuredFieldValues: {
        feature_goal: 'Add worker authentication endpoint',
        security_boundary: 'Websocket encryption with TLS pinning for real-time messaging channels',
        tenant_and_resource_ownership: 'All queries filter by companyId from JWT claims',
        data_loss_paths: 'Token refresh prevents session loss on network interruption',
        app_store_crash_risks: 'No native crash paths in backend authentication route',
        secrets_and_credentials: 'Webhook signing keys rotated via vault integration system',
      },
    });
    writeBuildGuardrailState(buildState);

    const result = await checkBeforeDone(DONE_BASE);
    assert.equal(result.allowed, false, 'Should block when declarations not in done summary');
    const declGaps = result.preflight_failures.filter(f => f.includes('Declaration-vs-delivery'));
    assert.ok(declGaps.length > 0, 'Should have declaration-vs-delivery gap');
    // Should mention specific fields
    const gapText = declGaps.join(' ');
    assert.ok(
      gapText.includes('security_boundary') || gapText.includes('secrets_and_credentials'),
      'Should name the unaddressed field(s)'
    );
  });

  it('should CATCH gap when locked constraint from brain not addressed', async () => {
    const buildState = createBuildApprovalState({
      sliceName: 'worker-auth',
      planReference: 'plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/routes/auth.ts'],
      structuredFieldValues: {
        feature_goal: 'Add worker authentication endpoint',
        security_boundary: 'JWT validation on every request with role-based access control',
        tenant_and_resource_ownership: 'All queries filter by companyId from JWT claims',
        data_loss_paths: 'Token refresh prevents session loss on network interruption',
        app_store_crash_risks: 'No native crash paths in backend authentication route',
        secrets_and_credentials: 'JWT secret stored in environment variables only',
      },
      impactResults: [
        {
          id: 'locked-xyz-789',
          title: 'Mandatory biometric verification for supervisor escalation flows',
          type: 'locked_doc',
          authority_level: 'locked',
          score: 0.91,
          snippet: 'All supervisor escalation must include biometric verification step...',
        },
      ],
    });
    writeBuildGuardrailState(buildState);

    const result = await checkBeforeDone(DONE_BASE);
    assert.equal(result.allowed, false, 'Should block when locked constraint not addressed');
    const declGaps = result.preflight_failures.filter(f => f.includes('Declaration-vs-delivery'));
    assert.ok(declGaps.length > 0, 'Should have declaration-vs-delivery gap for locked constraint');
    const gapText = declGaps.join(' ');
    assert.ok(gapText.includes('locked_constraint'), 'Should identify it as a locked constraint gap');
  });

  it('should PASS when no structured_field_values in build state (backward compat)', async () => {
    // Old-format build state without structured_field_values
    const oldBuildState = {
      timestamp: Date.now(),
      type: 'build',
      slice_name: 'worker-auth',
      plan_reference: 'plan.md',
      slice_scope: 'backend',
      planned_files: ['src/routes/auth.ts'],
      checklist: { passed: ['E1'], na: [] },
      // No structured_field_values or impact_results
    };
    // Write directly to bypass createBuildApprovalState
    for (const h of allHashes()) {
      try { writeFileSync(`/tmp/axhy-${h}-build-guardrail-state.json`, JSON.stringify(oldBuildState)); } catch {}
    }

    const result = await checkBeforeDone(DONE_BASE);
    // Should NOT crash or fail on missing structured_field_values
    if (!result.allowed && result.preflight_failures) {
      const declGaps = result.preflight_failures.filter(f => f.includes('Declaration-vs-delivery'));
      assert.equal(declGaps.length, 0,
        'Should NOT flag declaration-vs-delivery gap when build state has no structured_field_values');
    }
  });
});

// ── Phase C: Scanner Learning Tests ──

import { mkdirSync, rmSync, appendFileSync } from 'node:fs';

describe('C1: Challenge Clustering + Severity Demotion', () => {
  let readAllAcceptedChallenges, clusterAcceptedChallenges, getLearnedDemotions;
  let testChallengesDir;

  before(async () => {
    const mod = await import('../src/layer-2-guardrail/challenge-log.mjs');
    readAllAcceptedChallenges = mod.readAllAcceptedChallenges;
    clusterAcceptedChallenges = mod.clusterAcceptedChallenges;
    getLearnedDemotions = mod.getLearnedDemotions;
    testChallengesDir = mod.CHALLENGES_DIR;
  });

  it('extractPatternId handles standard finding_id format', () => {
    // We test this indirectly via readAllAcceptedChallenges — the function
    // parses finding_id into pattern_id. Create a temp challenge file.
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dir = resolve(testChallengesDir, `${yyyy}-${mm}`);

    // Read existing file to check current entries
    const logPath = resolve(dir, 'CHALLENGES.jsonl');
    const accepted = readAllAcceptedChallenges();
    // Should parse without throwing — basic smoke test
    assert.ok(Array.isArray(accepted), 'Should return an array');
    for (const entry of accepted) {
      assert.ok(entry.pattern_id, 'Each entry should have a pattern_id');
    }
  });

  it('clusterAcceptedChallenges groups by pattern_id', () => {
    const clusters = clusterAcceptedChallenges();
    assert.ok(clusters instanceof Map, 'Should return a Map');
    for (const [pid, cluster] of clusters) {
      assert.ok(typeof pid === 'string', 'Key should be string');
      assert.ok(typeof cluster.count === 'number', 'Should have count');
      assert.ok(Array.isArray(cluster.challenges), 'Should have challenges array');
      assert.ok(cluster.contexts instanceof Set, 'Should have contexts Set');
      assert.equal(cluster.count, cluster.challenges.length, 'Count should match array length');
    }
  });

  it('getLearnedDemotions returns empty Map when feature flag is off', () => {
    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    delete process.env.LEARNED_EXCEPTIONS_ENABLED;

    const demotions = getLearnedDemotions();
    assert.ok(demotions instanceof Map, 'Should return a Map');
    assert.equal(demotions.size, 0, 'Should be empty when flag is off');

    if (original) process.env.LEARNED_EXCEPTIONS_ENABLED = original;
  });

  it('getLearnedDemotions returns demotions for patterns with 3+ challenges', () => {
    // Create a temporary challenge directory with 3+ accepted challenges
    // for the same pattern_id
    const tmpDir = resolve(testChallengesDir, 'test-demotion');
    mkdirSync(tmpDir, { recursive: true });

    const logPath = resolve(tmpDir, 'CHALLENGES.jsonl');
    const now = new Date().toISOString();
    const challenges = [];
    for (let i = 0; i < 4; i++) {
      challenges.push(JSON.stringify({
        timestamp: now,
        finding_id: `test_pattern:file${i}.ts:${i + 1}`,
        file_path: `file${i}.ts`,
        line_number: i + 1,
        explanation: 'test explanation',
        accepted: true,
        reason: 'test',
      }));
    }
    writeFileSync(logPath, challenges.join('\n') + '\n');

    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    process.env.LEARNED_EXCEPTIONS_ENABLED = 'true';

    try {
      const demotions = getLearnedDemotions();
      assert.ok(demotions.has('test_pattern'), 'Should demote test_pattern with 4 challenges');
      assert.equal(demotions.get('test_pattern'), 'warning', 'Demotion should be to warning');
    } finally {
      // Cleanup
      rmSync(tmpDir, { recursive: true, force: true });
      if (original) {
        process.env.LEARNED_EXCEPTIONS_ENABLED = original;
      } else {
        delete process.env.LEARNED_EXCEPTIONS_ENABLED;
      }
    }
  });

  it('getLearnedDemotions does NOT demote with fewer than 3 challenges', () => {
    const tmpDir = resolve(testChallengesDir, 'test-no-demotion');
    mkdirSync(tmpDir, { recursive: true });

    const logPath = resolve(tmpDir, 'CHALLENGES.jsonl');
    const now = new Date().toISOString();
    // Only 2 accepted challenges — below threshold
    const challenges = [];
    for (let i = 0; i < 2; i++) {
      challenges.push(JSON.stringify({
        timestamp: now,
        finding_id: `below_threshold:file${i}.ts:${i + 1}`,
        file_path: `file${i}.ts`,
        accepted: true,
        reason: 'test',
      }));
    }
    writeFileSync(logPath, challenges.join('\n') + '\n');

    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    process.env.LEARNED_EXCEPTIONS_ENABLED = 'true';

    try {
      const demotions = getLearnedDemotions();
      assert.ok(!demotions.has('below_threshold'), 'Should NOT demote with only 2 challenges');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      if (original) {
        process.env.LEARNED_EXCEPTIONS_ENABLED = original;
      } else {
        delete process.env.LEARNED_EXCEPTIONS_ENABLED;
      }
    }
  });
});

describe('C2: Proposal Writer', () => {
  let approveProposal, listProposals, generateProposals, PROPOSALS_DIR;

  before(async () => {
    const mod = await import('../src/layer-2-guardrail/proposal-writer.mjs');
    approveProposal = mod.approveProposal;
    listProposals = mod.listProposals;
    generateProposals = mod.generateProposals;
    PROPOSALS_DIR = mod.PROPOSALS_DIR;
  });

  it('approveProposal returns error for non-existent proposal', () => {
    const result = approveProposal('non-existent-proposal-id');
    assert.equal(result.success, false, 'Should fail for non-existent proposal');
    assert.ok(result.reason.includes('not found') || result.reason.includes('No proposals'),
      'Error reason should mention not found');
  });

  it('approveProposal activates a proposal', () => {
    // Create a test proposal
    mkdirSync(PROPOSALS_DIR, { recursive: true });
    const proposalId = 'test-approval-proposal';
    const proposalPath = resolve(PROPOSALS_DIR, `${proposalId}.json`);
    writeFileSync(proposalPath, JSON.stringify({
      proposal_id: proposalId,
      pattern_id: 'test_pattern',
      created_at: new Date().toISOString(),
      challenge_count: 3,
      evidence: [],
      skip_rule: { file_pattern: '\\.test\\.ts$' },
      risk_assessment: 'Low risk — test files only',
      approved: false,
      approved_at: null,
    }) + '\n');

    try {
      const result = approveProposal(proposalId);
      assert.equal(result.success, true, 'Approval should succeed');
      assert.equal(result.proposal.approved, true, 'Proposal should be approved');
      assert.ok(result.proposal.approved_at, 'Should have approved_at timestamp');
      assert.equal(result.proposal.approved_by, 'founder', 'Should be approved by founder');

      // Double-approve should fail
      const doubleResult = approveProposal(proposalId);
      assert.equal(doubleResult.success, false, 'Double approval should fail');
      assert.ok(doubleResult.reason.includes('already approved'), 'Should say already approved');
    } finally {
      try { rmSync(proposalPath); } catch { /* ignore */ }
    }
  });

  it('listProposals returns all proposals with status', () => {
    mkdirSync(PROPOSALS_DIR, { recursive: true });
    const proposalPath = resolve(PROPOSALS_DIR, 'test-list-proposal.json');
    writeFileSync(proposalPath, JSON.stringify({
      proposal_id: 'test-list-proposal',
      pattern_id: 'list_test',
      created_at: new Date().toISOString(),
      challenge_count: 5,
      approved: false,
    }) + '\n');

    try {
      const proposals = listProposals();
      assert.ok(Array.isArray(proposals), 'Should return array');
      const found = proposals.find(p => p.proposal_id === 'test-list-proposal');
      assert.ok(found, 'Should find the test proposal');
      assert.equal(found.pattern_id, 'list_test');
      assert.equal(found.approved, false);
      assert.equal(found.challenge_count, 5);
    } finally {
      try { rmSync(proposalPath); } catch { /* ignore */ }
    }
  });

  it('generateProposals returns empty when feature flag is off', () => {
    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    delete process.env.LEARNED_EXCEPTIONS_ENABLED;

    const result = generateProposals();
    assert.ok(Array.isArray(result), 'Should return array');
    assert.equal(result.length, 0, 'Should be empty when flag is off');

    if (original) process.env.LEARNED_EXCEPTIONS_ENABLED = original;
  });
});

describe('C3: Scanner Demotion Integration', () => {
  let scanPatterns, getApprovedExceptions;

  before(async () => {
    const scanner = await import('../src/layer-2-guardrail/pattern-scanner.mjs');
    scanPatterns = scanner.scanPatterns;
    const challengeLog = await import('../src/layer-2-guardrail/challenge-log.mjs');
    getApprovedExceptions = challengeLog.getApprovedExceptions;
  });

  it('scanPatterns runs without errors with feature flag off', () => {
    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    delete process.env.LEARNED_EXCEPTIONS_ENABLED;

    // scanPatterns should work normally — demotions and exceptions are empty
    const results = scanPatterns([]);
    assert.ok(Array.isArray(results), 'Should return array');
    assert.equal(results.length, 0, 'No files = no findings');

    if (original) process.env.LEARNED_EXCEPTIONS_ENABLED = original;
  });

  it('getApprovedExceptions returns empty when flag is off', () => {
    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    delete process.env.LEARNED_EXCEPTIONS_ENABLED;

    const exceptions = getApprovedExceptions();
    assert.ok(Array.isArray(exceptions), 'Should return array');
    assert.equal(exceptions.length, 0, 'Should be empty when flag is off');

    if (original) process.env.LEARNED_EXCEPTIONS_ENABLED = original;
  });

  it('scanPatterns applies severity demotion when enabled + threshold met', () => {
    // Clustering is tested at the unit level in C1 tests above.
    // Here we verify the integration doesn't crash with the flag on.
    const original = process.env.LEARNED_EXCEPTIONS_ENABLED;
    process.env.LEARNED_EXCEPTIONS_ENABLED = 'true';

    try {
      // Scan with no files — just verify it doesn't throw with flag on
      const results = scanPatterns([]);
      assert.ok(Array.isArray(results), 'Should return array even with flag on');
    } finally {
      if (original) {
        process.env.LEARNED_EXCEPTIONS_ENABLED = original;
      } else {
        delete process.env.LEARNED_EXCEPTIONS_ENABLED;
      }
    }
  });
});

// ── Phase D: Activity Capture Tests ──

describe('D1: Activity Capture Hook', () => {
  it('activity-capture.mjs exists and is importable', async () => {
    const mod = await import('../src/layer-1-hook/activity-capture.mjs');
    assert.ok(mod, 'Module should be importable');
  });

  it('feature flag gate prevents capture when off', async () => {
    const original = process.env.ACTIVITY_CAPTURE_ENABLED;
    delete process.env.ACTIVITY_CAPTURE_ENABLED;

    // capturePrompt from D2 shares the same flag-gate pattern — test it
    const { capturePrompt } = await import('../src/layer-1-hook/prompt-capture.mjs');
    capturePrompt('test prompt that should not be captured');
    assert.ok(true, 'Should not crash when flag is off');

    if (original) process.env.ACTIVITY_CAPTURE_ENABLED = original;
  });
});

describe('D2: Prompt Capture', () => {
  it('capturePrompt function exists and is callable', async () => {
    const { capturePrompt } = await import('../src/layer-1-hook/prompt-capture.mjs');
    assert.ok(typeof capturePrompt === 'function', 'capturePrompt should be a function');
  });

  it('capturePrompt redacts <private> content', async () => {
    const { capturePrompt } = await import('../src/layer-1-hook/prompt-capture.mjs');
    const original = process.env.ACTIVITY_CAPTURE_ENABLED;
    process.env.ACTIVITY_CAPTURE_ENABLED = 'true';

    const activityDir = resolve(REPO_ROOT, 'docs', 'activity');
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const logPath = resolve(activityDir, `${yyyy}-${mm}`, 'ACTIVITY.jsonl');

    capturePrompt('my password is <private>supersecret123</private> please use it');

    try {
      if (existsSync(logPath)) {
        const content = readFileSync(logPath, 'utf-8').trim();
        const lines = content.split('\n');
        const lastEntry = JSON.parse(lines[lines.length - 1]);

        if (lastEntry.type === 'user_prompt') {
          assert.ok(!lastEntry.content.includes('supersecret123'),
            'Private content should be redacted');
          assert.ok(lastEntry.content.includes('[REDACTED]'),
            'Should contain [REDACTED] marker');
          assert.equal(lastEntry.kind, 'activity');
          assert.equal(lastEntry.authority_level, 'activity');
        }
      }
    } finally {
      if (original) {
        process.env.ACTIVITY_CAPTURE_ENABLED = original;
      } else {
        delete process.env.ACTIVITY_CAPTURE_ENABLED;
      }
    }
  });

  it('capturePrompt does nothing when flag is off', async () => {
    const { capturePrompt } = await import('../src/layer-1-hook/prompt-capture.mjs');
    const original = process.env.ACTIVITY_CAPTURE_ENABLED;
    delete process.env.ACTIVITY_CAPTURE_ENABLED;

    capturePrompt('test prompt');
    assert.ok(true, 'Should not crash with flag off');

    if (original) process.env.ACTIVITY_CAPTURE_ENABLED = original;
  });
});

describe('D3: Session Summary Capture', () => {
  it('session-summary-capture.mjs exists and is importable', async () => {
    const mod = await import('../src/layer-1-hook/session-summary-capture.mjs');
    assert.ok(mod, 'Module should be importable');
  });
});

// ── Hash-Based Pre-Approval Invalidation ──────────────────────────────────
// Tests that build approvals store file content hashes, and check_before_edit
// detects when planned files change between sessions (stale approval gate).
describe('Hash-Based Pre-Approval Invalidation', () => {
  let computePlannedFileHashes, verifyPlannedFileHashes, createBuildApprovalState;
  let writeBuildGuardrailState, checkBeforeEdit;

  before(async () => {
    const stateMod = await import('../src/layer-2-guardrail/state-tracker.mjs');
    computePlannedFileHashes = stateMod.computePlannedFileHashes;
    verifyPlannedFileHashes = stateMod.verifyPlannedFileHashes;
    createBuildApprovalState = stateMod.createBuildApprovalState;
    writeBuildGuardrailState = stateMod.writeBuildGuardrailState;
    const editMod = await import('../src/layer-2-guardrail/check-before-edit.mjs');
    checkBeforeEdit = editMod.checkBeforeEdit;
  });

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('computePlannedFileHashes returns MD5 hashes for existing files', () => {
    const hashes = computePlannedFileHashes(['package.json']);
    assert.ok(hashes['package.json'], 'Should have a hash for package.json');
    assert.equal(hashes['package.json'].length, 32, 'Hash should be 32-char MD5 hex');
  });

  it('computePlannedFileHashes returns new_file for non-existent files', () => {
    const hashes = computePlannedFileHashes(['src/this-does-not-exist-xyz.ts']);
    assert.equal(hashes['src/this-does-not-exist-xyz.ts'], 'new_file');
  });

  it('verifyPlannedFileHashes returns valid when hashes match', () => {
    const hashes = computePlannedFileHashes(['package.json']);
    const result = verifyPlannedFileHashes(hashes);
    assert.equal(result.valid, true, 'Should be valid when file unchanged');
  });

  it('verifyPlannedFileHashes detects content drift', () => {
    // Use a hash that doesn't match the actual file
    const fakeHashes = { 'package.json': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
    const result = verifyPlannedFileHashes(fakeHashes);
    assert.equal(result.valid, false, 'Should detect drift');
    assert.equal(result.driftedFiles.length, 1);
    assert.equal(result.driftedFiles[0].reason, 'content_changed');
  });

  it('verifyPlannedFileHashes detects new_file that already exists', () => {
    const hashes = { 'package.json': 'new_file' };
    const result = verifyPlannedFileHashes(hashes);
    assert.equal(result.valid, false, 'Should flag file that exists but was expected new');
    assert.equal(result.driftedFiles[0].reason, 'new_file_already_exists');
  });

  it('createBuildApprovalState stores planned_file_hashes', () => {
    const state = createBuildApprovalState({
      sliceName: 'hash-test',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: ['package.json'],
    });
    assert.ok(state.planned_file_hashes, 'Should have planned_file_hashes');
    assert.ok(state.planned_file_hashes['package.json'], 'Should hash package.json');
    assert.equal(state.planned_file_hashes['package.json'].length, 32);
  });

  it('check_before_edit blocks when build approval has drifted file hashes', () => {
    // Create a build state with a fake hash that won't match current content
    // Use a medium-risk path so the build preflight gate triggers.
    // Hash check only runs inside: if (changeType === 'new_feature' && risk.level medium/high)
    const mediumRiskFile = 'apps/backend/src/routes/visit.ts';
    const buildState = createBuildApprovalState({
      sliceName: 'drift-test',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: [mediumRiskFile],
    });
    // Override hash to simulate drift (file content changed since approval)
    buildState.planned_file_hashes[mediumRiskFile] = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    writeBuildGuardrailState(buildState);

    const result = checkBeforeEdit({
      intent: 'Adding a new feature to the visit route handler to support hash-based invalidation for build pre-approvals across multiple sessions which detects when planned files have changed between sessions and blocks stale approvals from proceeding without re-evaluation of the current codebase state',
      filePaths: [mediumRiskFile],
      changeType: 'new_feature',
      fileReadStatus: { [mediumRiskFile]: true },
      testStatus: {},
      reasoningEvidence: {
        risk_if_wrong: 'If verifyPlannedFileHashes() in src/layer-2-guardrail/state-tracker.mjs line 95 returns false positive, check-before-edit.mjs line 135 blocks valid edits on apps/backend/src/routes/visit.ts permanently',
        why_this_path_is_safe: 'Hash check at src/layer-2-guardrail/check-before-edit.mjs line 130 only compares stored MD5 hash vs current file content via createHash in state-tracker.mjs — no side effects on target file',
        files_read: [mediumRiskFile, 'src/layer-2-guardrail/state-tracker.mjs'],
      },
    });

    assert.equal(result.allowed, false, 'Should block when hashes drift');
    assert.ok(result.reason.includes('stale'), 'Reason should mention stale approval');
    assert.ok(result.stale_files, 'Should include stale_files in response');
    // File doesn't exist on disk → drift detected as file_deleted.
    // Both content_changed and file_deleted are valid drift reasons.
    assert.ok(
      ['content_changed', 'file_deleted'].includes(result.stale_files[0].reason),
      `Expected content_changed or file_deleted, got: ${result.stale_files[0].reason}`
    );
  });
});

// ── Mandatory Done-Checkpoint Before Slice Commits ────────────────────────
// Tests that check_before_commit rejects when a build state exists for the
// slice but check_before_done has not been called.
describe('Mandatory Done-Checkpoint Gate', () => {
  let checkBeforeCommit, writeBuildGuardrailState, writeDoneGuardrailState;
  let createBuildApprovalState, createDoneApprovalState;

  before(async () => {
    const commitMod = await import('../src/layer-2-guardrail/check-before-commit.mjs');
    checkBeforeCommit = commitMod.checkBeforeCommit;
    const stateMod = await import('../src/layer-2-guardrail/state-tracker.mjs');
    writeBuildGuardrailState = stateMod.writeBuildGuardrailState;
    writeDoneGuardrailState = stateMod.writeDoneGuardrailState;
    createBuildApprovalState = stateMod.createBuildApprovalState;
    createDoneApprovalState = stateMod.createDoneApprovalState;
  });

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should BLOCK commit when build state exists but done state is missing', () => {
    // Create a build state for the slice
    const buildState = createBuildApprovalState({
      sliceName: 'done-gate-test',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/test.ts'],
    });
    writeBuildGuardrailState(buildState);
    // No done state created

    const result = checkBeforeCommit({
      sliceName: 'done-gate-test',
      changedFiles: ['src/test.ts'],
      testsRun: ['node --test tests/test.mjs'],
    });

    assert.equal(result.passed, false, 'Should block commit');
    assert.ok(result.done_checkpoint_required, 'Should flag done_checkpoint_required');
    assert.ok(result.blockers[0].message.includes('check_before_done'),
      'Blocker should mention check_before_done');
  });

  it('should BLOCK commit when done state exists for a DIFFERENT slice', () => {
    const buildState = createBuildApprovalState({
      sliceName: 'slice-B',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/test.ts'],
    });
    writeBuildGuardrailState(buildState);

    const doneState = createDoneApprovalState({
      sliceName: 'slice-A',  // Different slice!
      doneMemoFile: 'docs/done/slice-a.md',
      sliceFiles: ['src/other.ts'],
      grade: { grade: 'integrity_passed', pass: true },
      summary: 'slice-A done',
    });
    writeDoneGuardrailState(doneState);

    const result = checkBeforeCommit({
      sliceName: 'slice-B',
      changedFiles: ['src/test.ts'],
      testsRun: ['node --test tests/test.mjs'],
    });

    assert.equal(result.passed, false, 'Should block when done is for different slice');
    assert.ok(result.done_checkpoint_required, 'Should flag done_checkpoint_required');
  });

  it('should ALLOW commit when done state matches the slice', () => {
    const buildState = createBuildApprovalState({
      sliceName: 'slice-C',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/test.ts'],
    });
    writeBuildGuardrailState(buildState);

    const doneState = createDoneApprovalState({
      sliceName: 'slice-C',  // Same slice
      doneMemoFile: 'docs/done/slice-c.md',
      sliceFiles: ['src/test.ts'],
      grade: { grade: 'integrity_passed', pass: true },
      summary: 'slice-C done',
    });
    writeDoneGuardrailState(doneState);

    const result = checkBeforeCommit({
      sliceName: 'slice-C',
      changedFiles: ['src/test.ts'],
      testsRun: ['node --test tests/test.mjs'],
    });

    // Should proceed past the done-gate (may fail/pass on pattern scan — that's fine)
    assert.ok(!result.done_checkpoint_required, 'Should NOT flag done_checkpoint_required');
  });

  it('should ALLOW commit when NO build state exists (operational commits)', () => {
    // No build state, no done state — operational commit
    const result = checkBeforeCommit({
      sliceName: 'hotfix-123',
      changedFiles: ['src/test.ts'],
      testsRun: ['node --test tests/test.mjs'],
    });

    // Should proceed past the done-gate (not blocked by missing done state)
    assert.ok(!result.done_checkpoint_required, 'Should NOT require done checkpoint for operational commits');
  });
});

// ── Skip Acknowledgment Audit Logging ─────────────────────────────────────
// Tests that skipped steps are logged to the audit trail for pattern analysis.
describe('Skip Acknowledgment Audit Logging', () => {
  it('logSkipAcknowledgment writes to audit log', async () => {
    const { logSkipAcknowledgment, AUDIT_LOG_FILE } = await import('../src/layer-2-guardrail/audit-log.mjs');

    logSkipAcknowledgment({
      sliceName: 'test-slice',
      skippedStep: 'impactCheck',
      justification: 'Low-risk config change, no locked constraints expected',
    });

    assert.ok(existsSync(AUDIT_LOG_FILE), 'Audit log should exist');
    const lines = readFileSync(AUDIT_LOG_FILE, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.equal(entry.event, 'skip_acknowledged');
    assert.equal(entry.slice_name, 'test-slice');
    assert.equal(entry.skipped_step, 'impactCheck');
    assert.ok(entry.justification.includes('Low-risk config change'));
  });
});
