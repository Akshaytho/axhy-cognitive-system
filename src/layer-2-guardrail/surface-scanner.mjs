/**
 * Surface Scanner — visual evidence enforcement for UI changes.
 *
 * The other session's retro caught a real wake-lock crash that screenshots
 * surfaced but pure code-review would have missed. The lesson: for UI
 * changes, code-only review is insufficient — you must look at what
 * users will see.
 *
 * This scanner enforces that any UI file change in the slice comes with
 * a visual evidence manifest:
 *
 *   {
 *     "slice": "worker-2b-2",
 *     "command": "pnpm test:visual worker-capture",
 *     "captured_at": "2026-05-22T15:30:00Z",
 *     "screenshots": [
 *       "screenshots-worker-d1-s2b-2/01-permissions.png",
 *       "screenshots-worker-d1-s2b-2/02-camera.png"
 *     ],
 *     "ui_files_covered": ["apps/mobile/app/(auth)/permissions.tsx"],
 *     "ai_observations": "Permissions screen renders both Camera and Location prompts. Camera screen shows uncaught wake-lock overlay on web — bug, not just web quirk."
 *   }
 *
 * Filesystem timestamps alone are gameable (touch). The manifest forces
 * the AI to articulate what was captured, when, and what was observed —
 * which is harder to fake than a backdated file mtime.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// File patterns that indicate UI surfaces
const UI_PATTERNS = [
  /apps\/mobile\/.*\.(tsx|jsx)$/,
  /apps\/admin-web\/.*\.(tsx|jsx)$/,
  /apps\/supervisor-mobile\/.*\.(tsx|jsx)$/,
  /packages\/ui-tokens\//,
  /components\/.*\.(tsx|jsx)$/,
];

const MIN_OBSERVATION_WORDS = 10;

export function isUiFile(filePath) {
  return UI_PATTERNS.some(p => p.test(filePath));
}

/**
 * Validate a visual evidence manifest object.
 *
 * @param {object} manifest - The manifest from the input
 * @param {string[]} uiFilesInSlice - UI files changed in this slice
 * @returns {{ valid: boolean, findings: Array }}
 */
function validateManifest(manifest, uiFilesInSlice) {
  const findings = [];

  if (!manifest || typeof manifest !== 'object') {
    findings.push({
      finding_id: 'visual_evidence:missing_manifest',
      severity: 'blocker',
      message: 'UI files changed but no visual evidence manifest provided. Run the visual test and provide manifest path.',
    });
    return { valid: false, findings };
  }

  // Required fields
  const required = ['command', 'captured_at', 'screenshots', 'ai_observations'];
  for (const field of required) {
    if (!manifest[field]) {
      findings.push({
        finding_id: `visual_evidence:missing_${field}`,
        severity: 'blocker',
        message: `Manifest missing required field: ${field}`,
      });
    }
  }
  if (findings.length > 0) return { valid: false, findings };

  // Screenshots must exist on disk
  const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
  if (screenshots.length === 0) {
    findings.push({
      finding_id: 'visual_evidence:no_screenshots',
      severity: 'blocker',
      message: 'Manifest declares no screenshots. UI changes require visual proof.',
    });
  }

  for (const shotPath of screenshots) {
    if (!existsSync(shotPath)) {
      findings.push({
        finding_id: `visual_evidence:missing_screenshot:${shotPath}`,
        severity: 'blocker',
        message: `Manifest references screenshot that does not exist on disk: ${shotPath}`,
      });
    }
  }

  // AI observation must be substantive (not just "captured" or "screenshots taken")
  const obs = manifest.ai_observations || '';
  const words = obs.trim().split(/\s+/);
  if (words.length < MIN_OBSERVATION_WORDS) {
    findings.push({
      finding_id: 'visual_evidence:shallow_observation',
      severity: 'blocker',
      message: `AI observations too brief (${words.length} words, need ${MIN_OBSERVATION_WORDS}+). Describe what you saw — what changed, what looked correct, what looked wrong.`,
    });
  }

  // Verify captured_at is parseable and reasonable
  if (manifest.captured_at) {
    const captureTime = Date.parse(manifest.captured_at);
    if (isNaN(captureTime)) {
      findings.push({
        finding_id: 'visual_evidence:invalid_timestamp',
        severity: 'warning',
        message: `Manifest captured_at is not a valid ISO timestamp: ${manifest.captured_at}`,
      });
    } else {
      // Compare against UI file mtimes — informational, not authoritative
      for (const uiFile of uiFilesInSlice) {
        if (!existsSync(uiFile)) continue;
        try {
          const fileMtime = statSync(uiFile).mtimeMs;
          if (fileMtime > captureTime + 60000) {  // 1-minute grace
            findings.push({
              finding_id: `visual_evidence:stale_capture:${uiFile}`,
              severity: 'warning',
              message: `UI file ${uiFile} was modified AFTER screenshot capture (file_mtime > captured_at). Re-run visual test.`,
            });
          }
        } catch {}
      }
    }
  }

  // Sanity: every UI file in slice should be referenced in manifest.ui_files_covered
  const covered = new Set((manifest.ui_files_covered || []).map(f => resolve(f)));
  const uncoveredUi = uiFilesInSlice.filter(f => !covered.has(resolve(f)));
  if (uncoveredUi.length > 0 && uiFilesInSlice.length > 0) {
    findings.push({
      finding_id: 'visual_evidence:uncovered_ui_files',
      severity: 'warning',
      message: `Some UI files changed but not declared in manifest.ui_files_covered: ${uncoveredUi.join(', ')}`,
    });
  }

  const blockers = findings.filter(f => f.severity === 'blocker');
  return { valid: blockers.length === 0, findings };
}

/**
 * Scan changed files for UI surface concerns.
 *
 * @param {string[]} changedFiles
 * @param {object} visualEvidence - The visual_evidence object from input
 * @returns {{ uiFiles, manifest_valid, findings }}
 */
export function scanSurface(changedFiles, visualEvidence) {
  const uiFiles = changedFiles.filter(isUiFile);

  // No UI files changed → no surface checks needed
  if (uiFiles.length === 0) {
    return { uiFiles: [], manifest_valid: true, findings: [] };
  }

  // UI files changed → manifest required
  const { valid, findings } = validateManifest(visualEvidence, uiFiles);

  return {
    uiFiles,
    manifest_valid: valid,
    findings,
  };
}

export { validateManifest, UI_PATTERNS };
