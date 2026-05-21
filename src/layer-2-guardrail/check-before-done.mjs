/**
 * check_before_done — blocks done-memo writes until quality gate passes.
 *
 * Flow:
 * 1. Session calls check_before_done with slice files + done memo path
 * 2. Quality gate runs pattern checks on every file
 * 3. If criticals or too many highs → BLOCKED with fix list
 * 4. Session fixes issues and re-calls check_before_done
 * 5. Repeat until grade >= L3 (Senior)
 * 6. Only then: done-memo write is approved
 *
 * The pre-edit-guard recognizes done-memo files and checks done-guardrail state.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { auditSliceFiles, gradeFindings } from './quality-gate.mjs';
import {
  writeDoneGuardrailState,
  createDoneApprovalState,
} from './state-tracker.mjs';

const AXHY_V3_ROOT = process.env.AXHY_V3_ROOT || '/Users/thotaakshay/eclean_workspace/axhy-v3';

const UI_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

export async function checkBeforeDone({
  intent,
  sliceName,
  doneMemoFile,
  sliceFiles = [],
  screenshotsTaken = false,
  typecheckPassed = false,
  testsPassed = false,
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

  const hasUIFiles = sliceFiles.some(f => UI_EXTENSIONS.some(ext => f.endsWith(ext)) && !f.includes('.test.'));
  if (hasUIFiles && !screenshotsTaken) {
    preflightFailures.push(
      'UI files in slice but no screenshots taken. ' +
      'You MUST capture screenshots of every screen/flow before declaring done. ' +
      'Visual verification proves the feature works from a user perspective — ' +
      'typecheck and tests only prove code correctness, not feature correctness.'
    );
  }

  if (preflightFailures.length > 0) {
    return {
      allowed: false,
      reason: 'Preflight checks failed.',
      preflight_failures: preflightFailures,
      suggestion: 'Complete all preflight items, then re-call check_before_done.',
    };
  }

  const auditResult = auditSliceFiles(sliceFiles);

  if (!auditResult.grade.pass) {
    const criticals = auditResult.findings.filter(f => f.weight === 'critical');
    const highs = auditResult.findings.filter(f => f.weight === 'high');

    return {
      allowed: false,
      reason: `Quality gate: ${auditResult.grade.label} (${auditResult.grade.grade}). Required: Senior (L3)+.`,
      grade: auditResult.grade,
      must_fix: [
        ...criticals.map(f => ({
          severity: 'CRITICAL',
          file: f.file,
          check: f.checkId,
          message: f.message,
          occurrences: f.occurrences,
        })),
        ...highs.map(f => ({
          severity: 'HIGH',
          file: f.file,
          check: f.checkId,
          message: f.message,
          occurrences: f.occurrences,
        })),
      ],
      summary: auditResult.summary,
      instruction: 'Fix all CRITICAL and reduce HIGH issues, then re-call check_before_done. The gate re-runs on every call until grade >= L3.',
    };
  }

  const mediums = auditResult.findings.filter(f => f.weight === 'medium');
  const lows = auditResult.findings.filter(f => f.weight === 'low');

  const state = createDoneApprovalState({
    sliceName,
    doneMemoFile,
    sliceFiles,
    grade: auditResult.grade,
    summary: auditResult.summary,
    remainingIssues: [...mediums, ...lows].map(f => ({
      severity: f.weight.toUpperCase(),
      file: f.file,
      check: f.checkId,
      message: f.message,
    })),
    screenshotsTaken,
    typecheckPassed,
    testsPassed,
  });

  writeDoneGuardrailState(state);

  return {
    allowed: true,
    grade: auditResult.grade,
    approved_file: doneMemoFile,
    edits_remaining: 1,
    expires: '10 minutes',
    summary: auditResult.summary,
    remaining_issues: [...mediums, ...lows].map(f => ({
      severity: f.weight.toUpperCase(),
      file: f.file,
      check: f.checkId,
      message: f.message,
    })),
    note: 'Quality gate passed. Done memo write approved. Remaining medium/low issues are noted but not blocking.',
  };
}
