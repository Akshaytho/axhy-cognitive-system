import { classifyRisk } from '../layer-1-hook/risk-classifier.mjs';
import { validateIntent } from './intent-validator.mjs';
import { suggestMaturity } from './maturity-selector.mjs';
import { generateNextQuestion, validateAnswer } from './next-question.mjs';
import { calculateConfidence } from './confidence.mjs';
import {
  writeGuardrailState,
  readGuardrailState,
  markQuestionAnswered,
  createApprovalState,
} from './state-tracker.mjs';

export function checkBeforeEdit({
  intent,
  filePaths,
  changeType,
  answeredQuestion,
  evidence,
  fileReadStatus = {},
  testStatus = {},
  impactCheckResult = null,
}) {
  if (answeredQuestion && evidence) {
    return handleAnswerSubmission(answeredQuestion, evidence);
  }

  const intentResult = validateIntent(intent);
  if (!intentResult.valid) {
    return {
      allowed: false,
      reason: intentResult.reason,
      suggestion: 'Rewrite your intent with 30+ words covering: purpose, affected behavior, and risk.',
    };
  }

  if (!filePaths || filePaths.length === 0) {
    return {
      allowed: false,
      reason: 'No file paths provided. Specify which files you intend to edit.',
    };
  }

  const primaryFile = filePaths[0];
  const risk = classifyRisk(primaryFile);
  const maturity = suggestMaturity({ filePath: primaryFile, changeType, intent });

  const fileWasRead = fileReadStatus[primaryFile] !== false;
  const testsExist = testStatus[primaryFile] !== false;

  const hardBlocks = impactCheckResult?.hardBlocks || [];
  const warnings = impactCheckResult?.warnings || [];
  const staleChunks = impactCheckResult?.staleChunks || [];
  const context = impactCheckResult?.context || [];
  const rules = impactCheckResult?.rules || [];

  if (hardBlocks.length > 0) {
    return {
      allowed: false,
      reason: 'Hard blocks from locked constraints.',
      hardBlocks,
      maturityMode: maturity.mode,
      suggestion: 'These locked constraints prevent this change. Surface to founder before proceeding.',
    };
  }

  const nextQuestions = generateNextQuestion({
    filePath: primaryFile,
    intent,
    riskLevel: risk.level,
    fileWasRead,
    testsExist,
  });

  const confidence = calculateConfidence({
    riskLevel: risk.level,
    fileWasRead,
    testsExist,
    hasWarnings: warnings.length > 0,
    hasHardBlocks: false,
    intentValid: true,
  });

  const requiresAnswer = nextQuestions?.requires_answer || false;
  const primaryQuestion = nextQuestions?.primary?.next_best_question || null;

  const approvedFiles = filePaths.map(fp => {
    const parts = fp.split('/');
    return parts.length > 2 ? parts.slice(-2).join('/') : fp;
  });

  const state = createApprovalState({
    intent,
    approvedFiles,
    editsRemaining: risk.editsAllowed,
    requiresAnswer,
    nextQuestion: primaryQuestion,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    maturityMode: maturity.mode,
    warnings,
    hardBlocks: [],
    rules,
    context,
  });

  writeGuardrailState(state);

  return {
    allowed: !requiresAnswer,
    approved_files: approvedFiles,
    edits_remaining: risk.editsAllowed,
    expires: '5 minutes',
    requires_answer: requiresAnswer,
    confidence: confidence.level,
    confidence_score: confidence.score,
    confidence_reason: confidence.reason,
    missing_dependencies: buildMissingDeps({ fileWasRead, testsExist }),
    maturityMode: maturity.mode,
    maturityDescription: maturity.description,
    hardBlocks: [],
    warnings,
    staleChunks,
    rules,
    next_questions: nextQuestions ? {
      primary: nextQuestions.primary,
      all: nextQuestions.all,
    } : null,
    context,
  };
}

function handleAnswerSubmission(answeredQuestion, evidence) {
  const validation = validateAnswer(answeredQuestion, evidence);
  if (!validation.valid) {
    return {
      allowed: false,
      reason: validation.reason,
      suggestion: 'Provide a substantive answer with real evidence (file paths, grep results, test outputs).',
    };
  }

  const state = markQuestionAnswered(answeredQuestion, evidence);
  if (!state) {
    return {
      allowed: false,
      reason: 'No active guardrail state found. Call check_before_edit first.',
    };
  }

  return {
    allowed: true,
    reason: 'Question answered with evidence. Edit approved.',
    approved_files: state.approved_files,
    edits_remaining: state.edits_remaining,
    expires: '5 minutes',
    requires_answer: false,
  };
}

function buildMissingDeps({ fileWasRead, testsExist }) {
  const deps = [];
  if (!fileWasRead) deps.push('File not read recently — read it first');
  if (!testsExist) deps.push('No tests found — consider writing tests');
  return deps;
}
