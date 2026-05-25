/**
 * Append-only audit log for guardrail events.
 * Every approval create/consume/deny/expire is logged.
 * Pre-commit can cross-reference changed files against this log.
 */

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const AUDIT_LOG_FILE = `/tmp/axhy-${REPO_HASH}-audit.jsonl`;

export function logEvent(event, detail = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    epoch: Date.now(),
    repo_hash: REPO_HASH,
    event,
    ...detail,
  };
  try {
    appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {}
}

export function logApprovalCreated({ tool, intent, approvedFiles, editsRemaining, confidence }) {
  logEvent('approval_created', {
    tool,
    intent_hash: createHash('md5').update(intent || '').digest('hex').slice(0, 12),
    approved_files: approvedFiles,
    edits_remaining: editsRemaining,
    confidence,
  });
}

export function logApprovalConsumed({ tool, file, editsRemainingAfter }) {
  logEvent('approval_consumed', {
    tool,
    file,
    edits_remaining_after: editsRemainingAfter,
  });
}

export function logApprovalDenied({ tool, file, reason }) {
  logEvent('approval_denied', { tool, file, reason });
}

export function logApprovalExpired({ tool, file, elapsedMs }) {
  logEvent('approval_expired', { tool, file, elapsed_ms: elapsedMs });
}

export function logDoneGate({ sliceName, grade, pass }) {
  logEvent(pass ? 'done_gate_passed' : 'done_gate_blocked', {
    slice_name: sliceName,
    grade,
  });
}

export function logEmergencyBypass({ context }) {
  logEvent('emergency_bypass_attempted', { context });
}

export function logTamperDetected({ detail }) {
  logEvent('tamper_detected', { detail });
}

/**
 * Log when a session acknowledges skipping a step with justification.
 * Used by check_before_done when the session says "no, I didn't run X because Y."
 * Over time, patterns emerge: "this AI always skips impactCheck on low-risk slices"
 * — data the founder can use to decide which rules graduate to structural gates.
 *
 * The other session's request: "make the skipped responses logged, not just
 * accepted-and-forgotten."
 */
export function logSkipAcknowledgment({ sliceName, skippedStep, justification }) {
  logEvent('skip_acknowledged', {
    slice_name: sliceName,
    skipped_step: skippedStep,
    justification: (justification || '').slice(0, 500),
  });
}

export function getRecentEvents(windowMs = 30 * 60 * 1000) {
  if (!existsSync(AUDIT_LOG_FILE)) return [];
  try {
    const lines = readFileSync(AUDIT_LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean);
    const cutoff = Date.now() - windowMs;
    return lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.epoch >= cutoff);
  } catch {
    return [];
  }
}

export function verifyFileHasApproval(filePath) {
  const events = getRecentEvents();
  const created = events.find(e =>
    e.event === 'approval_created' &&
    (e.approved_files || []).some(f => filePath.endsWith(f) || f.endsWith(filePath))
  );
  const consumed = events.find(e =>
    e.event === 'approval_consumed' && e.file === filePath
  );
  return { hasApproval: !!created, wasConsumed: !!consumed, created, consumed };
}

export { AUDIT_LOG_FILE };
