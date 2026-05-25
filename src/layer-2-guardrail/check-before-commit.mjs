/**
 * check_before_commit — slice-level production review.
 *
 * This replaces the per-file iteration loop with batch review:
 *   - Pattern pass: anti-patterns grouped by rule across all changed files
 *   - Dependency pass: one-hop import/dependent analysis
 *   - Surface pass: UI files require visual evidence manifest
 *   - Challenge path: AI can challenge false-positive findings with evidence
 *
 * Returns ONE consolidated checklist. The AI fixes patterns across all
 * files in one pass, then commits. No more 7-iteration spiral.
 *
 * Inputs (camelCase internal; MCP server converts from snake_case):
 *   {
 *     sliceName: 'worker-mvp-2b-2',
 *     changedFiles: ['apps/backend/src/routes/foo.ts', ...],
 *     visualEvidence: {              // required if any UI files changed
 *       command: '...',
 *       captured_at: 'ISO',
 *       screenshots: [...],
 *       ai_observations: '...',
 *       ui_files_covered: [...],
 *     },
 *     testsRun: ['test command 1', 'test command 2'],
 *     reasoningEvidence: { ... },    // same shape as check_before_edit
 *     challenges: [ { finding_id, file_path, line_number, explanation, code_excerpt } ],
 *     knownGaps: 'Things you know are missing but acceptable',
 *     founderApprovedDeferrals: ['deferral id 1', ...],
 *   }
 *
 * Returns:
 *   {
 *     passed: bool,
 *     blockers: [...],          // findings of severity 'blocker' that weren't challenged
 *     warnings: [...],          // findings of severity 'warning'
 *     info: [...],              // findings of severity 'info'
 *     pattern_groups: [...],    // pattern-grouped findings (the actionable list)
 *     dependency_findings: {...},
 *     surface_findings: [...],
 *     accepted_challenges: [...],
 *     rejected_challenges: [...],
 *     summary: 'short string',
 *   }
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPatterns } from './pattern-scanner.mjs';
import { scanDependencies } from './dependency-scanner.mjs';
import { scanSurface } from './surface-scanner.mjs';
import { auditCrossFileConsistency } from './cross-file-auditor.mjs';
import { applyChallenges } from './challenge-log.mjs';
import { readBuildGuardrailState, readDoneGuardrailState } from './state-tracker.mjs';
import { logSkipAcknowledgment } from './audit-log.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COGNITIVE_ROOT = resolve(__dirname, '..', '..');
const WORKSPACE_ROOT = resolve(COGNITIVE_ROOT, '..');

/**
 * Normalize a file path to absolute. Accepts paths relative to workspace
 * root or already-absolute paths.
 */
function toAbsolute(filePath) {
  if (filePath.startsWith('/')) return filePath;
  return resolve(WORKSPACE_ROOT, filePath);
}

/**
 * Determine the search root for dependency analysis.
 * Walks up from the first changed file looking for a package.json or .git.
 */
function findSearchRoot(absChangedFiles) {
  if (absChangedFiles.length === 0) return WORKSPACE_ROOT;
  const first = absChangedFiles[0];
  let dir = dirname(first);
  for (let i = 0; i < 10; i++) {
    // Stop at workspace root
    if (dir === WORKSPACE_ROOT || dir === '/') return WORKSPACE_ROOT;
    // Stop at apps/ or packages/ subdir (search the relevant app/package only)
    if (/\/(apps|packages)\/[^/]+$/.test(dir)) return dir;
    dir = dirname(dir);
  }
  return WORKSPACE_ROOT;
}

/**
 * Flatten pattern groups into a single findings array.
 */
function flattenPatternGroups(groups) {
  const findings = [];
  for (const group of groups) {
    for (const occurrence of group.occurrences) {
      findings.push({
        finding_id: occurrence.finding_id,
        severity: group.severity,
        pattern: group.pattern,
        description: group.description,
        file: occurrence.file,
        line: occurrence.line,
        snippet: occurrence.snippet,
        context: occurrence.context,
      });
    }
  }
  return findings;
}

/**
 * Flatten dependency findings into a single findings array.
 */
function flattenDependencyFindings(deps) {
  const findings = [];
  for (const broken of deps.broken_imports) {
    findings.push({
      finding_id: broken.finding_id,
      severity: 'blocker',
      pattern: 'broken_import',
      description: 'Import path does not resolve to a file on disk',
      file: broken.file,
      context: `Import "${broken.import}" not found`,
    });
  }
  for (const untouched of deps.untouched_dependents) {
    findings.push({
      finding_id: untouched.finding_id,
      severity: 'warning',
      pattern: 'untouched_dependents',
      description: 'Changed file has dependents that were not also changed',
      file: untouched.file,
      context: `${untouched.dependents.length} files depend on this one and may need updating: ${untouched.dependents.slice(0, 3).join(', ')}${untouched.dependents.length > 3 ? '...' : ''}`,
    });
  }
  return findings;
}

/**
 * Run the full check_before_commit batch review.
 */
export function checkBeforeCommit(input) {
  const {
    sliceName,
    changedFiles = [],
    visualEvidence = null,
    testsRun = [],
    reasoningEvidence = null,
    challenges = [],
    knownGaps = '',
    founderApprovedDeferrals = [],
  } = input || {};

  // ── Input validation ──
  if (!sliceName || typeof sliceName !== 'string') {
    return { passed: false, summary: 'Missing slice_name', blockers: [{ message: 'slice_name is required' }] };
  }
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { passed: false, summary: 'No changed files declared', blockers: [{ message: 'changed_files must be a non-empty array' }] };
  }
  if (!Array.isArray(testsRun) || testsRun.length === 0) {
    return {
      passed: false,
      summary: 'No tests run',
      blockers: [{ message: 'tests_run must list test commands that were executed for this slice' }],
    };
  }

  // ── Mandatory done-checkpoint gate ──
  // If a build approval exists for this slice, check_before_done MUST have
  // been called before commit. This prevents sessions from shipping slices
  // without the self-audit at slice-close (the "confident session skips
  // advisory steps" pattern identified by the 45-year AI principal).
  //
  // Only gated when a build state exists for the SAME slice — operational
  // commits (hotfixes, config changes) without a build state are unaffected.
  try {
    const buildState = readBuildGuardrailState();
    if (buildState && buildState.slice_name === sliceName) {
      const doneState = readDoneGuardrailState();
      if (!doneState || doneState.slice_name !== sliceName) {
        return {
          passed: false,
          summary: `Blocked: check_before_done not called for slice "${sliceName}"`,
          blockers: [{
            message: `Mandatory done-checkpoint missing. A build approval exists for slice "${sliceName}" ` +
              'but check_before_done has not been called. The done-checkpoint verifies: ' +
              'impactCheck was run, identity layer was read, tests passed, handoff updated, ' +
              'and declarations match deliveries. Call check_before_done before committing.',
            severity: 'blocker',
            pattern: 'missing_done_checkpoint',
          }],
          done_checkpoint_required: true,
          slice_name: sliceName,
        };
      }
    }
  } catch {
    // Non-blocking: if state read fails, continue with the scanner pipeline
  }

  const absChangedFiles = changedFiles.map(toAbsolute);
  const searchRoot = findSearchRoot(absChangedFiles);

  // ── Pass 1: Pattern scan ──
  const patternGroups = scanPatterns(absChangedFiles);
  const patternFindings = flattenPatternGroups(patternGroups);

  // ── Pass 2: Dependency scan ──
  const dependencyFindings = scanDependencies(absChangedFiles, searchRoot);
  const flatDeps = flattenDependencyFindings(dependencyFindings);

  // ── Pass 3: Surface scan ──
  const surfaceResult = scanSurface(absChangedFiles, visualEvidence);
  const surfaceFindings = surfaceResult.findings;

  // ── Pass 4: Cross-file argument consistency ──
  let crossFileFindings = [];
  try {
    const crossFileResult = auditCrossFileConsistency(absChangedFiles, searchRoot);
    if (crossFileResult.mismatches && crossFileResult.mismatches.length > 0) {
      crossFileFindings = crossFileResult.mismatches.map(m => ({
        finding_id: `cross-file:${m.file}:${m.line}:${m.param}`,
        severity: 'warning',
        pattern: 'cross_file_entity_mismatch',
        description: m.context,
        file: m.file,
        line: m.line,
        snippet: m.snippet,
        context: m.context,
      }));
    }
  } catch {
    // Cross-file audit failed — continue without it
  }

  // ── Apply challenges ──
  const allFindings = [...patternFindings, ...flatDeps, ...surfaceFindings, ...crossFileFindings];
  const {
    remainingFindings,
    acceptedChallenges,
    rejectedChallenges,
  } = applyChallenges(allFindings, challenges);

  // ── Categorize by severity ──
  const blockers = remainingFindings.filter(f => f.severity === 'blocker');
  const warnings = remainingFindings.filter(f => f.severity === 'warning');
  const info = remainingFindings.filter(f => f.severity === 'info');

  // ── Defer founder-approved blockers ──
  const deferralSet = new Set(founderApprovedDeferrals);
  const activeBlockers = blockers.filter(b => !deferralSet.has(b.finding_id));
  const deferredBlockers = blockers.filter(b => deferralSet.has(b.finding_id));

  // ── Build response ──
  const passed = activeBlockers.length === 0;
  const summary = passed
    ? `OK to commit. ${warnings.length} warnings, ${info.length} info. Slice: ${sliceName} (${changedFiles.length} files)`
    : `Blocked: ${activeBlockers.length} blockers across ${new Set(activeBlockers.map(b => b.file)).size} files. Fix patterns, not individual files.`;

  return {
    passed,
    summary,
    slice_name: sliceName,
    files_reviewed: changedFiles.length,
    blockers: activeBlockers,
    warnings,
    info,
    deferred_blockers: deferredBlockers,
    pattern_groups: patternGroups,
    dependency_findings: dependencyFindings,
    surface: {
      ui_files: surfaceResult.uiFiles,
      manifest_valid: surfaceResult.manifest_valid,
    },
    accepted_challenges: acceptedChallenges,
    rejected_challenges: rejectedChallenges,
    tests_run: testsRun,
    known_gaps: knownGaps || null,
  };
}
