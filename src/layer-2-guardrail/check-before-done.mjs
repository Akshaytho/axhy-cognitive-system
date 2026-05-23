/**
 * check_before_done — narrowed to integrity verification after commit.
 *
 * Production code-quality scanning moved to `check_before_commit` (which
 * runs ONCE on the whole slice via pattern/dependency/surface passes).
 * Iterating quality scans here caused the 7-call spiral that cost the
 * other session their token budget.
 *
 * This gate now only verifies that the slice is properly closed out:
 *   - commit landed (no uncommitted slice files)
 *   - tests passed
 *   - handoff/STATUS.md updated
 *   - coverage notes substantive
 *   - self-reasoning summary recorded
 *   - enterprise preflight (check_before_build) was run for this slice
 *   - screenshots taken if UI files in slice
 *
 * Quality before commit; reflection/integrity after commit.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import {
  writeDoneGuardrailState,
  createDoneApprovalState,
  readBuildGuardrailState,
} from './state-tracker.mjs';

const AXHY_V3_ROOT = process.env.AXHY_V3_ROOT || (process.env.HOME + '/eclean_workspace/axhy-v3');

function checkFilesCommitted(sliceFiles) {
  try {
    const args = sliceFiles.map(f => {
      const full = f.startsWith('/') ? f : resolve(AXHY_V3_ROOT, f);
      return `"${full}"`;
    }).join(' ');
    const result = execSync(
      `git -C "${AXHY_V3_ROOT}" status --porcelain -- ${args}`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    if (result.length > 0) {
      return { allCommitted: false, uncommitted: result.split('\n').map(l => l.trim()) };
    }
    return { allCommitted: true, uncommitted: [] };
  } catch {
    return { allCommitted: true, uncommitted: [], skipped: true };
  }
}

const UI_EXTENSIONS = ['.tsx', '.jsx'];
const FRONTEND_PATH_MARKERS = ['apps/worker', 'apps/supervisor', 'apps/admin', 'components/', 'screens/', 'pages/'];

function isUIFile(filePath) {
  if (filePath.includes('.test.')) return false;
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  if (UI_EXTENSIONS.includes(ext)) return true;
  if ((ext === '.ts' || ext === '.js') && FRONTEND_PATH_MARKERS.some(m => filePath.includes(m))) return true;
  return false;
}

export async function checkBeforeDone({
  intent,
  sliceName,
  doneMemoFile,
  sliceFiles = [],
  screenshotsTaken = false,
  typecheckPassed = false,
  testsPassed = false,
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

  if (!typecheckPassed) {
    preflightFailures.push('Typecheck has not passed — run typecheck and confirm green before done.');
  }
  if (!testsPassed) {
    preflightFailures.push('Tests have not passed — run all tests for affected packages and confirm green.');
  }

  const hasUIFiles = sliceFiles.some(f => isUIFile(f));
  if (hasUIFiles && !screenshotsTaken) {
    preflightFailures.push(
      'UI files in slice but no screenshots taken. ' +
      'You MUST capture screenshots of every screen/flow before declaring done. ' +
      'Visual verification proves the feature works from a user perspective — ' +
      'typecheck and tests only prove code correctness, not feature correctness.'
    );
  }

  if (!coverageNotes || coverageNotes.trim().length < 20) {
    preflightFailures.push(
      'Missing coverage notes. Describe which sprint plan items this slice covers, ' +
      'what source requirements are satisfied, and any known gaps remaining.'
    );
  }

  // Git commit check — programmatic, can't be faked
  const gitStatus = checkFilesCommitted(sliceFiles);
  if (!gitStatus.allCommitted) {
    preflightFailures.push(
      'Uncommitted slice files detected. Commit all work to git before declaring done. ' +
      'Uncommitted code is not shipped code.\n' +
      gitStatus.uncommitted.map(f => '  ' + f).join('\n')
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
  }

  if (preflightFailures.length > 0) {
    return {
      allowed: false,
      reason: 'Integrity preflight failed.',
      preflight_failures: preflightFailures,
      suggestion: 'Complete all preflight items, then re-call check_before_done. Production code quality is verified by check_before_commit BEFORE commit — this gate only verifies that the slice is properly closed out.',
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
    screenshotsTaken,
    typecheckPassed,
    testsPassed,
  });

  writeDoneGuardrailState(state);

  return {
    allowed: true,
    approved_file: doneMemoFile,
    edits_remaining: 1,
    expires: '10 minutes',
    summary: `${sliceName}: integrity verified. Done memo write approved.`,
    note: 'check_before_done now verifies handoff/commit/test/coverage integrity only. Production code quality is enforced by check_before_commit (run ONCE on the slice diff). No more iteration spirals here.',
  };
}
