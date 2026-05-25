
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyRisk } from '../layer-1-hook/risk-classifier.mjs';
import { validateIntent } from './intent-validator.mjs';
import { validateEvidence, getRequiredFields } from './evidence-validator.mjs';
import { suggestMaturity } from './maturity-selector.mjs';
import { generateNextQuestion, validateAnswer } from './next-question.mjs';
import { calculateConfidence } from './confidence.mjs';
import {
  writeGuardrailState,
  readGuardrailState,
  markQuestionAnswered,
  createApprovalState,
  readBuildGuardrailState,
  verifyPlannedFileHashes,
} from './state-tracker.mjs';

export function checkBeforeEdit({
  intent,
  filePaths,
  changeType,
  answeredQuestion,
  evidence,
  reasoningEvidence,
  fileReadStatus = {},
  testStatus = {},
  impactCheckResult = null,
}) {
  // Route answer submissions immediately — before intent/filePaths validation.
  // Previous bug: requiring `&& evidence` here caused fallthrough to the
  // filePaths check (line 42) when evidence was missing, returning the
  // misleading "No file paths provided" error on answer retries.
  // validateAnswer inside handleAnswerSubmission validates evidence separately
  // and returns a clear "Evidence is required" error if missing.
  if (answeredQuestion) {
    return handleAnswerSubmission(answeredQuestion, evidence, filePaths);
  }

  const intentResult = validateIntent(intent);
  if (!intentResult.valid) {
    return {
      allowed: false,
      reason: intentResult.reason,
      suggestion: 'Rewrite your intent with 30+ words describing what you are changing and why.',
    };
  }

  if (!filePaths || filePaths.length === 0) {
    return {
      allowed: false,
      reason: 'No file paths provided. Specify which files you intend to edit.',
    };
  }

  const primaryFile = filePaths[0];

  // Compute highest risk across ALL files — not just the first one.
  // A multi-file edit putting a low-risk file first must not bypass
  // HIGH risk gates (evidence requirements, edit budgets, build preflight).
  const risk = filePaths.reduce((worst, fp) => {
    const r = classifyRisk(fp);
    if (r.level === 'high') return r;
    if (r.level === 'medium' && worst.level !== 'high') return r;
    return worst;
  }, classifyRisk(primaryFile));

  // Validate structured reasoning evidence for medium/high risk files.
  // H1 fix (2026-05-23): reasoning_evidence is REQUIRED for high/medium risk.
  // Previously optional (backward compat) — but this let high-risk edits
  // proceed without articulating invariants_preserved, risk_if_wrong, etc.
  if (risk.level === 'high' || risk.level === 'medium') {
    if (!reasoningEvidence) {
      return {
        allowed: false,
        reason: `Evidence lacks specificity in: ${getRequiredFields(risk.level).join(', ')}. Include at least one concrete reference (file path, function name, or line number).`,
        suggestion: 'Provide substantive structured reasoning evidence.',
        required_evidence: getRequiredFields(risk.level),
      };
    }
    const evidenceResult = validateEvidence(reasoningEvidence, risk.level);
    if (!evidenceResult.valid) {
      return {
        allowed: false,
        reason: evidenceResult.reason,
        suggestion: evidenceResult.guidance
          ? `Provide reasoning evidence:\n${evidenceResult.guidance}`
          : 'Provide substantive structured reasoning evidence.',
        required_evidence: getRequiredFields(risk.level),
      };
    }
  }
  const maturity = suggestMaturity({ filePath: primaryFile, changeType, intent });

  const fileWasRead = fileReadStatus[primaryFile] === true;
  const testsExist = testStatus[primaryFile] === true;

  const hardBlocks = impactCheckResult?.hardBlocks || [];
  const warnings = impactCheckResult?.warnings || [];
  const staleChunks = impactCheckResult?.staleChunks || [];
  const context = impactCheckResult?.context || [];
  const rules = impactCheckResult?.rules || [];

  if (hardBlocks.length > 0) {
    writeGuardrailState(createApprovalState({
      intent,
      approvedFiles: [],
      editsRemaining: 0,
      requiresAnswer: false,
      confidence: 'blocked',
      confidenceReason: 'Hard blocks from locked constraints.',
      hardBlocks,
    }));
    return {
      allowed: false,
      reason: 'Hard blocks from locked constraints.',
      hardBlocks,
      maturityMode: maturity.mode,
      suggestion: 'These locked constraints prevent this change. Surface to founder before proceeding.',
    };
  }

  // Build preflight integration: for new_feature changes on medium/high risk,
  // check that check_before_build was run recently (within 30 minutes).
  const BUILD_PREFLIGHT_MAX_AGE_MS = 30 * 60 * 1000;
  if (changeType === 'new_feature' && (risk.level === 'high' || risk.level === 'medium')) {
    try {
      const buildState = readBuildGuardrailState();
      if (!buildState) {
        // Hard block: E14 non-deferrable items require explicit preflight declaration.
        // A session that skips check_before_build entirely cannot prove non-deferrable
        // items (security, crash prevention, data loss, secrets, doc truth) are addressed.
        return {
          allowed: false,
          reason: 'No enterprise build preflight found. New features on medium/high-risk files require ' +
            'check_before_build to declare how E1-E14 enterprise baseline items will be satisfied.',
          suggestion: 'Run check_before_build with slice_name, plan_reference, planned_files, and structured_fields ' +
            'before calling check_before_edit for new features. Non-deferrable items (security, ownership, ' +
            'crash prevention, data loss, secrets, documentation truth) must be addressed — "will handle later" is rejected.',
          edits_remaining: 0,
          maturityMode: maturity.mode,
        };
      } else {
        // --- Stale pre-approval gate (hash-based invalidation) ---
        // If planned files changed since approval, the approval is stale.
        // Catches the scenario: founder approves slice at 8pm, makes changes
        // overnight, new session boots with stale approval and builds against
        // outdated assumptions. Time-based staleness (30min) only catches
        // elapsed time — this catches actual content drift.
        if (buildState.planned_file_hashes) {
          const hashCheck = verifyPlannedFileHashes(buildState.planned_file_hashes);
          if (!hashCheck.valid) {
            const driftList = hashCheck.driftedFiles.map(d => `  - ${d.file} (${d.reason})`).join('\n');
            return {
              allowed: false,
              reason: 'Build pre-approval is stale — planned files changed since approval.',
              suggestion: `The following files changed since check_before_build ran:\n${driftList}\n\n` +
                'Re-run check_before_build to create a fresh approval based on the current codebase state. ' +
                'The previous approval was based on file contents that no longer match.',
              edits_remaining: 0,
              maturityMode: maturity.mode,
              stale_files: hashCheck.driftedFiles,
            };
          }
        }

        // Time-based staleness warning (still useful even when hashes match)
        if (Date.now() - buildState.timestamp > BUILD_PREFLIGHT_MAX_AGE_MS) {
          warnings.push(
            `Enterprise build preflight is stale (ran ${Math.round((Date.now() - buildState.timestamp) / 60000)} minutes ago). ` +
            'Consider re-running check_before_build if starting a new slice.'
          );
        }
      }
    } catch {
      // Non-blocking: if build state read fails, continue without warning
    }
  }

  // Grep-before-fix: for bug fixes, remind to search for the same pattern
  // across the codebase before fixing it in a single file. Repeated bugs
  // often live in multiple files with the same architecture.
  if (changeType === 'bug_fix') {
    warnings.push(
      'Bug fix: before applying this fix, grep/search all files in the same architecture ' +
      'for the same pattern. Repeated bugs often exist in multiple files. Fix all instances ' +
      'together, not one at a time.'
    );
  }

  // Read file content for concurrency analysis in next-question generator.
  // Only read if file exists and is reasonable size (< 500KB).
  let fileContent = null;
  try {
    const absPath = primaryFile.startsWith('/') ? primaryFile : resolve(process.cwd(), primaryFile);
    if (existsSync(absPath)) {
      const stats = statSync(absPath);
      if (stats.size < 500 * 1024) {
        fileContent = readFileSync(absPath, 'utf-8');
      }
    }
  } catch {
    // File read failed — proceed without content-based questions
  }

  const nextQuestions = generateNextQuestion({
    filePath: primaryFile,
    intent,
    riskLevel: risk.level,
    fileWasRead,
    testsExist,
    fileContent,
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

  const approvedFiles = filePaths;

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

  // Build response incrementally — only include fields with information value.
  // Empty arrays, redundant duplicates, and "all checks passed" reasons
  // are omitted to keep the iteration payload lean.
  const missingDeps = buildMissingDeps({ fileWasRead, testsExist });
  const response = {
    allowed: !requiresAnswer,
    approved_files: approvedFiles,
    edits_remaining: risk.editsAllowed,
    requires_answer: requiresAnswer,
    maturityMode: maturity.mode,
  };

  // Only include confidence info when it's actionable (below threshold)
  if (confidence.score < 90) {
    response.confidence = confidence.level;
    response.confidence_score = confidence.score;
    response.confidence_reason = confidence.reason;
  }

  // Only include missing_dependencies when there are some
  if (missingDeps.length > 0) response.missing_dependencies = missingDeps;

  // Only include warnings when there are some — they carry signal
  if (warnings.length > 0) response.warnings = warnings;

  // Only include stale chunks if any (they need verification)
  if (staleChunks.length > 0) response.staleChunks = staleChunks;

  // Rules and context: only top 3, truncated. Skip if empty.
  if (rules.length > 0) response.rules = rules.slice(0, 3);
  if (context.length > 0) {
    response.context = context.slice(0, 3).map(c => ({
      source: c.source,
      similarity: c.similarity,
      content: (c.content || '').slice(0, 100),
    }));
  }

  // Only include primary question when answer is actually required.
  // Drop the duplicate `all` array — primary already contains the actionable question.
  if (requiresAnswer && nextQuestions?.primary) {
    response.next_question = nextQuestions.primary;
  }

  return response;
}

function handleAnswerSubmission(answeredQuestion, evidence, filePaths = []) {
  const validation = validateAnswer(answeredQuestion, evidence);
  if (!validation.valid) {
    return {
      allowed: false,
      reason: validation.reason,
      suggestion: 'Provide a substantive answer with real evidence (file paths, grep results, test outputs).',
    };
  }

  // State-freeze fix: pass filePaths to markQuestionAnswered so it
  // updates approved_files. Without this, answering a question for file B
  // would return stale approved_files from file A's earlier approval.
  const state = markQuestionAnswered(answeredQuestion, evidence, filePaths);
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
