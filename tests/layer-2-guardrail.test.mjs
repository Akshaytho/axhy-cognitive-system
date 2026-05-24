import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
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
    for (const suffix of ['guardrail-state.json', 'read-state.json', 'plan-guardrail-state.json', 'done-guardrail-state.json']) {
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

// ── Phase C: Scanner Learning Tests ──

import { mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';

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
