
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  getRepoHash, allHashes, getStateFilePath,
  signState, readStateFromAny,
} from '../shared/config.mjs';

const REPO_HASH = getRepoHash();
const STATE_FILE = getStateFilePath('guardrail-state.json');
const READ_STATE_FILE = getStateFilePath('read-state.json');
const PLAN_STATE_FILE = getStateFilePath('plan-guardrail-state.json');
const DONE_STATE_FILE = getStateFilePath('done-guardrail-state.json');
const BUILD_STATE_FILE = getStateFilePath('build-guardrail-state.json');

/**
 * Write state to all hash buckets with HMAC signature.
 * For object content: signs then serializes.
 * For read-state (key-value map without timestamp): writes unsigned
 * (read-state is not an approval — it tracks file reads).
 */
function writeToAll(suffix, content) {
  let json;
  if (typeof content === 'string') {
    json = content;
  } else if (suffix === 'read-state.json') {
    // Read state is a simple {filePath: timestamp} map, not an approval.
    // No HMAC needed — it's not a trust boundary (the read-before-edit
    // check is defense-in-depth, not the primary gate).
    json = JSON.stringify(content, null, 2);
  } else {
    // Sign all approval state objects before writing
    const signed = signState(content);
    json = JSON.stringify(signed, null, 2);
  }
  for (const h of allHashes()) {
    try { writeFileSync(`/tmp/axhy-${h}-${suffix}`, json); } catch {}
  }
}

export function readGuardrailState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return null; }
}

export function writeGuardrailState(state) {
  // Timestamp guard: never overwrite a newer state with an older one.
  // Prevents async race conditions where an earlier handler resolves
  // after a later one and clobbers its approved_files.
  const existing = readGuardrailState();
  if (existing && existing.timestamp && state.timestamp
      && existing.timestamp > state.timestamp) {
    return; // Existing state is newer — skip write
  }
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

export function markQuestionAnswered(answeredQuestion, evidence, filePaths = null) {
  const state = readGuardrailState();
  if (!state) return null;
  state.question_answered = true;
  state.answered_question = answeredQuestion;
  state.evidence = evidence;
  // State-freeze fix: update approved_files when answering a question
  // for a different file than what's currently in state. Without this,
  // answering a question for file B keeps approved_files from file A.
  if (filePaths && filePaths.length > 0) {
    state.approved_files = filePaths;
  }
  // Refresh timestamp so this write passes the timestamp guard
  state.timestamp = Date.now();
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

// Build guardrail state (enterprise preflight)
// Uses readStateFromAny for cross-CWD resilience (H3 fix):
// if check_before_build ran from a different cwd, the state is still findable.
export function readBuildGuardrailState() {
  return readStateFromAny('build-guardrail-state.json');
}

export function writeBuildGuardrailState(state) {
  writeToAll('build-guardrail-state.json', state);
}

export function createBuildApprovalState({
  sliceName, planReference, sliceScope, plannedFiles,
  checklist = { passed: [], na: [] },
  structuredFieldValues = {},
  impactResults = [],
}) {
  return {
    timestamp: Date.now(), type: 'build',
    slice_name: sliceName,
    plan_reference: planReference,
    slice_scope: sliceScope,
    planned_files: plannedFiles,
    checklist,
    // Store the declared structured field values so check_before_done can diff
    // what was declared at build time against what was actually delivered.
    // This closes the "declare but don't deliver" gap (CHEAT 12 pattern).
    structured_field_values: structuredFieldValues,
    // Store brain retrieval results so check_before_done can verify locked
    // constraints were addressed — involuntary brain consultation.
    impact_results: impactResults,
    // Build approval does not gate individual file edits (that's check_before_edit).
    // It records that enterprise preflight was completed for this slice.
    // check_before_done references this state to verify preflight was run.
  };
}

export { STATE_FILE, READ_STATE_FILE, PLAN_STATE_FILE, DONE_STATE_FILE, BUILD_STATE_FILE };
