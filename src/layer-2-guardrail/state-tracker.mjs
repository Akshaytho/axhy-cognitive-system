import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;

export function readGuardrailState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeGuardrailState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function recordFileRead(filePath) {
  let reads = {};
  if (existsSync(READ_STATE_FILE)) {
    try {
      reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8'));
    } catch {}
  }
  reads[filePath] = Date.now();
  writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
}

export function createApprovalState({
  intent,
  approvedFiles,
  editsRemaining,
  requiresAnswer = false,
  nextQuestion = null,
  confidence = 'medium',
  confidenceReason = '',
  maturityMode = 'professional',
  warnings = [],
  hardBlocks = [],
  rules = [],
  context = [],
}) {
  return {
    timestamp: Date.now(),
    intent,
    approved_files: approvedFiles,
    edits_remaining: editsRemaining,
    requires_answer: requiresAnswer,
    question_answered: false,
    next_question: nextQuestion,
    confidence,
    confidence_reason: confidenceReason,
    maturity_mode: maturityMode,
    warnings,
    hard_blocks: hardBlocks,
    rules,
    context,
  };
}

export function markQuestionAnswered(answeredQuestion, evidence) {
  const state = readGuardrailState();
  if (!state) return null;

  state.question_answered = true;
  state.answered_question = answeredQuestion;
  state.evidence = evidence;
  writeGuardrailState(state);
  return state;
}

export { STATE_FILE, READ_STATE_FILE };
