/**
 * check_before_done — pre-commit slice self-audit gate.
 *
 * Called BEFORE commit (after editing, before check_before_commit).
 * Correct workflow: build → edit → done → commit.
 *
 * Production code-quality scanning lives in `check_before_commit` (which
 * runs ONCE on the whole slice via pattern/dependency/surface passes).
 * Iterating quality scans here caused the 7-call spiral that cost the
 * other session their token budget.
 *
 * This gate verifies the slice is ready to commit:
 *   - tests passed
 *   - handoff/STATUS.md updated
 *   - coverage notes substantive
 *   - self-reasoning summary recorded
 *   - enterprise preflight (check_before_build) was run for this slice
 *   - screenshots taken if UI files in slice
 *
 * Self-audit before commit; quality scanning at commit time.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  writeDoneGuardrailState,
  createDoneApprovalState,
  readBuildGuardrailState,
} from './state-tracker.mjs';

const AXHY_V3_ROOT = process.env.AXHY_V3_ROOT || (process.env.HOME + '/eclean_workspace/axhy-v3');

const UI_EXTENSIONS = ['.tsx', '.jsx'];
const FRONTEND_PATH_MARKERS = ['apps/worker', 'apps/supervisor', 'apps/admin', 'components/', 'screens/', 'pages/'];

function isUIFile(filePath) {
  if (filePath.includes('.test.')) return false;
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  if (UI_EXTENSIONS.includes(ext)) return true;
  if ((ext === '.ts' || ext === '.js') && FRONTEND_PATH_MARKERS.some(m => filePath.includes(m))) return true;
  return false;
}

/**
 * Extract meaningful terms from a text block for keyword overlap checks.
 * Filters out common English stop words and very short words.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'was',
  'one', 'our', 'out', 'has', 'have', 'this', 'that', 'with', 'from', 'will',
  'each', 'make', 'like', 'been', 'long', 'very', 'when', 'what', 'were', 'into',
  'them', 'more', 'some', 'time', 'just', 'also', 'than', 'must', 'every', 'does',
  'being', 'only', 'would', 'should', 'could', 'about', 'which', 'their', 'there',
  'these', 'other', 'after', 'before', 'using', 'used', 'need', 'needs', 'based',
]);

function extractKeyTerms(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 25);
}

/**
 * Non-deferrable fields — the ones sessions most often declare but skip.
 * Maps to E1 (security), E2 (ownership), E6 (data loss), E8 (crash), E13 (secrets).
 */
const NON_DEFERRABLE_KEYS = [
  'security_boundary',
  'tenant_and_resource_ownership',
  'data_loss_paths',
  'app_store_crash_risks',
  'secrets_and_credentials',
];

/**
 * Compare declarations from check_before_build against done summary.
 * Returns an array of delivery gaps (empty = all addressed).
 *
 * Heuristic: for each non-deferrable declaration, extract key terms and
 * check whether the combined done text mentions any of them. If zero
 * overlap, the declaration was likely not addressed.
 *
 * Also checks locked constraints from brain retrieval.
 */
function diffDeclarationsVsDelivery(buildState, intent, coverageNotes, selfReasoningSummary) {
  const gaps = [];
  const declared = buildState.structured_field_values;
  if (!declared || typeof declared !== 'object') return gaps;

  // Combine all done-time text for matching
  const doneText = [
    intent || '',
    coverageNotes || '',
    selfReasoningSummary || '',
  ].join(' ').toLowerCase();

  // Check each non-deferrable declaration
  for (const key of NON_DEFERRABLE_KEYS) {
    if (!declared[key]) continue;
    const declaredText = typeof declared[key] === 'string'
      ? declared[key]
      : JSON.stringify(declared[key]);
    const keyTerms = extractKeyTerms(declaredText);
    if (keyTerms.length === 0) continue;

    const matchedTerms = keyTerms.filter(t => doneText.includes(t));
    // If less than 20% of key terms appear in done text, flag as gap
    const overlapRatio = matchedTerms.length / keyTerms.length;
    if (overlapRatio < 0.2) {
      gaps.push({
        field: key,
        declared: declaredText.substring(0, 200),
        concern: `Declared in build preflight but not mentioned in done summary (0/${keyTerms.length} key terms found)`,
      });
    }
  }

  // Check locked constraints from brain retrieval
  const impactResults = buildState.impact_results;
  if (Array.isArray(impactResults) && impactResults.length > 0) {
    const lockedResults = impactResults.filter(r => r.authority_level === 'locked');
    for (const r of lockedResults) {
      const title = (r.title || r.snippet || '');
      const titleTerms = extractKeyTerms(title);
      if (titleTerms.length === 0) continue;
      const mentioned = titleTerms.some(t => doneText.includes(t));
      if (!mentioned) {
        gaps.push({
          field: `locked_constraint`,
          declared: title.substring(0, 200),
          concern: 'Locked constraint surfaced during build preflight but not addressed in done summary',
        });
      }
    }
  }

  return gaps;
}

export async function checkBeforeDone({
  intent,
  sliceName,
  doneMemoFile,
  sliceFiles = [],
  screenshotsTaken = false,
  typecheckPassed = false,
  testsPassed = false,
  typecheckCommand = '',
  testCommand = '',
  screenshotPaths = [],
  flowCompleteness = [],
  coverageNotes = '',
  selfReasoningSummary = '',
  handoffUpdated = false,
  manualChecks = {},
}) {
  if (!intent || typeof intent !== 'string' || intent.trim().split(/\s+/).length < 15) {
    return {
      allowed: false,
      reason: 'Intent too short (need 15+ words). Describe what the slice accomplished and what was verified.',
    };
  }

  if (!doneMemoFile) {
    return {
      allowed: false,
      reason: 'No done_memo_file specified. Where will the done memo be written?',
    };
  }

  if (!sliceName) {
    return {
      allowed: false,
      reason: 'No slice_name. Name the slice being completed (e.g., "worker-d1-s1-auth-shell").',
    };
  }

  if (sliceFiles.length === 0) {
    return {
      allowed: false,
      reason: 'No slice_files listed. Provide every file created or modified in this slice for quality review.',
    };
  }

  const preflightFailures = [];
  const verificationResults = { typecheck: 'unknown', tests: 'unknown', screenshots: 'unknown' };

  // ── Typecheck: prefer programmatic verification over self-reported boolean ──
  if (typecheckCommand && typeof typecheckCommand === 'string') {
    try {
      execSync(typecheckCommand, { encoding: 'utf-8', timeout: 30000, cwd: AXHY_V3_ROOT });
      verificationResults.typecheck = 'verified_pass';
    } catch (err) {
      verificationResults.typecheck = 'verified_fail';
      const output = (err.stdout || err.stderr || '').slice(0, 500);
      preflightFailures.push(
        `Typecheck FAILED (programmatic verification via "${typecheckCommand}").\n` +
        `Output: ${output}\nFix type errors before declaring done.`
      );
    }
  } else if (!typecheckPassed) {
    verificationResults.typecheck = 'self_reported_fail';
    preflightFailures.push(
      'Typecheck has not passed — run typecheck and confirm green before done. ' +
      'Better: pass typecheck_command (e.g. "pnpm -r run typecheck") for programmatic verification.'
    );
  } else {
    verificationResults.typecheck = 'self_reported_pass';
  }

  // ── Tests: prefer programmatic verification over self-reported boolean ──
  if (testCommand && typeof testCommand === 'string') {
    try {
      execSync(testCommand, { encoding: 'utf-8', timeout: 60000, cwd: AXHY_V3_ROOT });
      verificationResults.tests = 'verified_pass';
    } catch (err) {
      verificationResults.tests = 'verified_fail';
      const output = (err.stdout || err.stderr || '').slice(0, 500);
      preflightFailures.push(
        `Tests FAILED (programmatic verification via "${testCommand}").\n` +
        `Output: ${output}\nFix failing tests before declaring done.`
      );
    }
  } else if (!testsPassed) {
    verificationResults.tests = 'self_reported_fail';
    preflightFailures.push(
      'Tests have not passed — run all tests for affected packages and confirm green. ' +
      'Better: pass test_command (e.g. "pnpm --filter @axhy/backend test") for programmatic verification.'
    );
  } else {
    verificationResults.tests = 'self_reported_pass';
  }

  // ── Screenshots: prefer path verification over self-reported boolean ──
  const hasUIFiles = sliceFiles.some(f => isUIFile(f));
  if (hasUIFiles) {
    if (Array.isArray(screenshotPaths) && screenshotPaths.length > 0) {
      const missing = screenshotPaths.filter(p => !existsSync(p));
      if (missing.length > 0) {
        verificationResults.screenshots = 'verified_fail';
        preflightFailures.push(
          `Screenshot paths declared but ${missing.length} file(s) not found on disk:\n` +
          missing.map(p => '  ' + p).join('\n') +
          '\nCapture screenshots before declaring done.'
        );
      } else {
        verificationResults.screenshots = 'verified_pass';
      }
    } else if (!screenshotsTaken) {
      verificationResults.screenshots = 'self_reported_fail';
      preflightFailures.push(
        'UI files in slice but no screenshots taken. ' +
        'You MUST capture screenshots of every screen/flow before declaring done. ' +
        'Visual verification proves the feature works from a user perspective — ' +
        'typecheck and tests only prove code correctness, not feature correctness. ' +
        'Better: pass screenshot_paths with actual file paths for verification.'
      );
    } else {
      verificationResults.screenshots = 'self_reported_pass';
    }
  }

  // ── Flow completeness: ensure all expected behaviors are enumerated ──
  if (Array.isArray(flowCompleteness) && flowCompleteness.length > 0) {
    const incomplete = flowCompleteness.filter(f =>
      !f.verified || typeof f.description !== 'string' || f.description.trim().length < 5
    );
    if (incomplete.length > 0) {
      preflightFailures.push(
        `Flow completeness: ${incomplete.length} expected behavior(s) not verified:\n` +
        incomplete.map(f => `  - ${f.description || '(no description)'}`).join('\n') +
        '\nVerify each behavior works end-to-end before declaring done.'
      );
    }
  }

  if (!coverageNotes || coverageNotes.trim().length < 20) {
    preflightFailures.push(
      'Missing coverage notes. Describe which sprint plan items this slice covers, ' +
      'what source requirements are satisfied, and any known gaps remaining.'
    );
  }

  if (!selfReasoningSummary || selfReasoningSummary.trim().length < 20) {
    preflightFailures.push(
      'Missing self-reasoning summary (20+ chars). Before non-trivial work, you must run ' +
      'the 7-phase self-reasoning protocol including impactCheck(). Describe what it returned, ' +
      'what assumptions were verified, and what locked constraints were checked.'
    );
  }

  if (!handoffUpdated) {
    preflightFailures.push(
      'Handoff files not updated. Before declaring done, update NEXT_SESSION.md and STATUS.md ' +
      'so the next session knows the current state without hunting for done memos.'
    );
  }

  // Enterprise preflight check — verify check_before_build was run for this slice
  const buildState = readBuildGuardrailState();
  if (!buildState) {
    preflightFailures.push(
      'No enterprise production preflight found. Before declaring done, you must have ' +
      'run check_before_build at the start of this slice to declare how each E1–E14 ' +
      'enterprise baseline item would be satisfied. Run check_before_build now, then ' +
      're-call check_before_done.'
    );
  } else if (buildState.slice_name !== sliceName) {
    preflightFailures.push(
      `Enterprise preflight exists but for a different slice ("${buildState.slice_name}" vs "${sliceName}"). ` +
      'Run check_before_build for the current slice, then re-call check_before_done.'
    );
  } else {
    // --- Declaration-vs-delivery diff ---
    // Build state matches this slice. Compare what was declared at build time
    // against what the done summary claims was delivered.
    // Non-deferrable fields (security, ownership, data loss, crash, secrets)
    // get extra scrutiny — these are the items sessions most often declare but skip.
    const deliveryGaps = diffDeclarationsVsDelivery(buildState, intent, coverageNotes, selfReasoningSummary);
    if (deliveryGaps.length > 0) {
      preflightFailures.push(
        `Declaration-vs-delivery gap: ${deliveryGaps.length} item(s) declared during ` +
        `check_before_build were not addressed in the done summary:\n` +
        deliveryGaps.map(g => `  - [${g.field}] ${g.concern}`).join('\n') +
        '\n\nEither address these items in your done summary or explain why they are no longer applicable.'
      );
    }
  }

  if (preflightFailures.length > 0) {
    return {
      allowed: false,
      reason: 'Integrity preflight failed.',
      preflight_failures: preflightFailures,
      suggestion: 'Complete all preflight items, then re-call check_before_done. This is a pre-commit self-audit gate (workflow: build → edit → done → commit). Production code quality is verified by check_before_commit at commit time.',
    };
  }

  // All integrity preflight checks passed. Approve done memo write.
  // Note: production code quality scanning happens in check_before_commit
  // (which runs ONCE on the slice). This gate does NOT iterate on patterns.
  const state = createDoneApprovalState({
    sliceName,
    doneMemoFile,
    sliceFiles,
    grade: { grade: 'integrity_passed', label: 'Integrity Verified', pass: true },
    summary: `${sliceName}: all integrity preflight checks passed. Quality was reviewed at commit time by check_before_commit.`,
    remainingIssues: [],
    screenshotsTaken: verificationResults.screenshots.includes('pass'),
    typecheckPassed: verificationResults.typecheck.includes('pass'),
    testsPassed: verificationResults.tests.includes('pass'),
    verificationResults,
    flowCompleteness: flowCompleteness || [],
  });

  writeDoneGuardrailState(state);

  return {
    allowed: true,
    approved_file: doneMemoFile,
    edits_remaining: 1,
    expires: '10 minutes',
    summary: `${sliceName}: integrity verified. Done memo write approved.`,
    note: 'check_before_done is a pre-commit self-audit gate (workflow: build → edit → done → commit). It verifies tests/handoff/coverage/enterprise-preflight integrity. Production code quality is then enforced by check_before_commit at commit time.',
  };
}
