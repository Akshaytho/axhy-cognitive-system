
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;
const PLAN_STATE_FILE = `/tmp/axhy-${REPO_HASH}-plan-guardrail-state.json`;
const DONE_STATE_FILE = `/tmp/axhy-${REPO_HASH}-done-guardrail-state.json`;

const WORKSPACE_ROOTS = [
  '/Users/thotaakshay/eclean_workspace',
  '/Users/thotaakshay/eclean_workspace/axhy-v3',
  '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system',
];

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function writeToAll(suffix, content) {
  const json = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  for (const h of allHashes()) {
    try { writeFileSync(`/tmp/axhy-${h}-${suffix}`, json); } catch {}
  }
}

export function readGuardrailState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return null; }
}

export function writeGuardrailState(state) {
  writeToAll('guardrail-state.json', state);
}

export function recordFileRead(filePath) {
  let reads = {};
  if (existsSync(READ_STATE_FILE)) {
    try { reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8')); } catch {}
  }
  reads[filePath] = Date.now();
  writeToAll('read-state.json', reads);
}

export function createApprovalState({
  intent, approvedFiles, editsRemaining,
  requiresAnswer = false, nextQuestion = null,
  confidence = 'medium', confidenceReason = '',
  maturityMode = 'professional',
  warnings = [], hardBlocks = [], rules = [], context = [],
}) {
  return {
    timestamp: Date.now(), intent,
    approved_files: approvedFiles, edits_remaining: editsRemaining,
    requires_answer: requiresAnswer, question_answered: false,
    next_question: nextQuestion, confidence, confidence_reason: confidenceReason,
    maturity_mode: maturityMode, warnings, hard_blocks: hardBlocks, rules, context,
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

// Plan guardrail state
export function readPlanGuardrailState() {
  if (!existsSync(PLAN_STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(PLAN_STATE_FILE, 'utf-8')); } catch { return null; }
}

export function writePlanGuardrailState(state) {
  writeToAll('plan-guardrail-state.json', state);
}

export function createPlanApprovalState({
  intent, approvedFiles, editsRemaining,
  sourceDocs = [], sourceWarnings = [],
  architectureInventory = {}, contentWarnings = [],
  affectedProductArea = '',
}) {
  return {
    timestamp: Date.now(), type: 'plan', intent,
    approved_files: approvedFiles, edits_remaining: editsRemaining,
    source_docs: sourceDocs, source_warnings: sourceWarnings,
    architecture_inventory: architectureInventory,
    content_warnings: contentWarnings,
    affected_product_area: affectedProductArea,
  };
}

// Done guardrail state
export function readDoneGuardrailState() {
  if (!existsSync(DONE_STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(DONE_STATE_FILE, 'utf-8')); } catch { return null; }
}

export function writeDoneGuardrailState(state) {
  writeToAll('done-guardrail-state.json', state);
}

export function createDoneApprovalState({
  sliceName, doneMemoFile, sliceFiles,
  grade, summary, remainingIssues = [],
  screenshotsTaken = false, typecheckPassed = false, testsPassed = false,
}) {
  return {
    timestamp: Date.now(), type: 'done',
    slice_name: sliceName,
    approved_files: [doneMemoFile],
    edits_remaining: 1,
    grade, summary, remaining_issues: remainingIssues,
    screenshots_taken: screenshotsTaken,
    typecheck_passed: typecheckPassed,
    tests_passed: testsPassed,
    slice_files: sliceFiles,
  };
}

export { STATE_FILE, READ_STATE_FILE, PLAN_STATE_FILE, DONE_STATE_FILE };
