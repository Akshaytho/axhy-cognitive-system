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
