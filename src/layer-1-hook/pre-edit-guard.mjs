#!/usr/bin/env node

/**
 * Layer 1: PreToolUse hook for Edit/Write tools.
 *
 * Checks in order:
 *  1. Guardrail-optional? → allow
 *  2. Done-memo? → check done-guardrail state (quality gate must pass)
 *  3. Plan-guarded? → check plan-guardrail state
 *  4-9. Code file? → check edit-guardrail state (existing flow)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyRisk, isGuardrailOptional, isPlanFile, isDoneMemo } from './risk-classifier.mjs';
import { logApprovalConsumed, logApprovalDenied, logApprovalExpired } from '../layer-2-guardrail/audit-log.mjs';
import {
  getRepoRoot, getTimeouts, getStateFilePath,
  allHashes, signState, verifyState,
  wasFileReadRecently, readStateFromAny,
} from '../shared/config.mjs';

const REPO_ROOT = getRepoRoot();
const STATE_FILE = getStateFilePath('guardrail-state.json');
const PLAN_STATE_FILE = getStateFilePath('plan-guardrail-state.json');
const DONE_STATE_FILE = getStateFilePath('done-guardrail-state.json');

const _timeouts = getTimeouts();
const APPROVAL_WINDOW_MS = _timeouts.approval_window_ms;
const DONE_APPROVAL_WINDOW_MS = _timeouts.done_approval_window_ms;

/**
 * Read state from any hash bucket with HMAC verification (C1 fix).
 * Rejects forged, tampered, and unsigned state files.
 * All writers now sign via signState() — unsigned fallback removed.
 */
function readFromAnyVerified(suffix) {
  let best = null;
  let bestTs = -1;

  for (const h of allHashes()) {
    const candidate = `/tmp/axhy-${h}-${suffix}`;
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
      const ts = parsed && typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (verifyState(parsed)) {
        if (ts > bestTs) { best = parsed; bestTs = ts; }
      } else {
        process.stderr.write(`[axhy] WARNING: unsigned/invalid state file ignored: ${candidate}\n`);
      }
    } catch {}
  }
  return best;
}

/**
 * Write state back to all buckets (e.g., after decrementing edits_remaining).
 * Re-signs the state to maintain HMAC integrity.
 */
function writeJsonState(file, state) {
  const suffix = file.replace(/.*axhy-[a-f0-9]+-/, '');
  const signed = signState(state);
  const json = JSON.stringify(signed, null, 2);
  for (const h of allHashes()) {
    try { writeFileSync(`/tmp/axhy-${h}-${suffix}`, json); } catch {}
  }
}

function block(reason) {
  process.stderr.write(reason);
  process.exit(2);
}

function allow() {
  process.exit(0);
}

function checkGuardedFile(filePath, stateFile, windowMs, toolName) {
  const suffix = stateFile.replace(/.*axhy-[a-f0-9]+-/, '');
  const state = readFromAnyVerified(suffix);
  if (!state) {
    block(
      `⛔ BLOCKED: No ${toolName} approval found.\n` +
      `You must call axhy_guardrail.${toolName} before writing this file.\n` +
      `File: ${filePath}`
    );
    return;
  }

  const elapsed = Date.now() - (state.timestamp || 0);
  if (elapsed > windowMs) {
    block(
      `⛔ BLOCKED: ${toolName} approval expired (${Math.round(elapsed / 1000)}s ago).\n` +
      `Call ${toolName} again.\n` +
      `File: ${filePath}`
    );
    return;
  }

  const approvedFiles = state.approved_files || [];
  const normalizedPath = resolve(filePath);
  const fileApproved = approvedFiles.some(approved => {
    const normalizedApproved = resolve(REPO_ROOT, approved);
    if (normalizedPath === normalizedApproved || normalizedPath.startsWith(normalizedApproved + '/')) return true;
    return normalizedPath.endsWith('/' + approved);
  });
  if (!fileApproved) {
    block(
      `⛔ BLOCKED: File not in approved scope for ${toolName}.\n` +
      `Approved: ${approvedFiles.join(', ')}\n` +
      `You tried to write: ${filePath}\n` +
      `Call ${toolName} again with this file.`
    );
    return;
  }

  if ((state.edits_remaining || 0) <= 0) {
    block(
      `⛔ BLOCKED: Edit limit reached for ${toolName}.\n` +
      `Call ${toolName} again for a fresh approval.\n` +
      `File: ${filePath}`
    );
    return;
  }

  state.edits_remaining = (state.edits_remaining || 1) - 1;
  writeJsonState(stateFile, state);
  logApprovalConsumed({ tool: toolName, file: filePath, editsRemainingAfter: state.edits_remaining });
  allow();
}

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    block('Failed to parse tool input from stdin.');
    return;
  }

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.filePath || '';
  if (!filePath) { block('No file_path found in tool input.'); return; }

  // 1. Guardrail-optional
  if (isGuardrailOptional(filePath)) { allow(); return; }

  // 2. Done-memo — requires quality gate
  if (isDoneMemo(filePath)) {
    checkGuardedFile(filePath, DONE_STATE_FILE, DONE_APPROVAL_WINDOW_MS, 'check_before_done');
    return;
  }

  // 3. Plan-guarded
  if (isPlanFile(filePath)) {
    checkGuardedFile(filePath, PLAN_STATE_FILE, APPROVAL_WINDOW_MS, 'check_before_plan');
    return;
  }

  // 4-9. Code files — existing flow
  // Check order matches checkGuardedFile: exists → expiry → scope → read → limit → question
  const state = readFromAnyVerified('guardrail-state.json');
  if (!state) {
    block(
      `⛔ BLOCKED: No guardrail approval found.\n` +
      `You must call axhy_guardrail.check_before_edit before editing code files.\n` +
      `File: ${filePath}`
    );
    return;
  }

  const elapsed = Date.now() - (state.timestamp || 0);
  if (elapsed > APPROVAL_WINDOW_MS) {
    block(`⛔ BLOCKED: Approval expired (${Math.round(elapsed / 1000)}s ago).\nCall check_before_edit again.\nFile: ${filePath}`);
    return;
  }

  const approvedFiles = state.approved_files || [];
  const normalizedPath = resolve(filePath);
  const fileApproved = approvedFiles.some(approved => {
    const normalizedApproved = resolve(REPO_ROOT, approved);
    if (normalizedPath === normalizedApproved || normalizedPath.startsWith(normalizedApproved + '/')) return true;
    return normalizedPath.endsWith('/' + approved);
  });
  if (!fileApproved) {
    block(
      `⛔ BLOCKED: File not in approved scope.\n` +
      `Approved files: ${approvedFiles.join(', ')}\n` +
      `You tried to edit: ${filePath}\n` +
      `Call check_before_edit again with this file in your intent.`
    );
    return;
  }

  // Read-recently check is intentionally skipped when the target file does not
  // exist on disk yet — for true new-file creation there is no current state to
  // have read, so the "verify current state before editing" intent is moot.
  // Approval-scope (above) and edit-budget (below) still run, so the new path
  // must still be in the approved file list and still consumes one edit.
  const fileExists = existsSync(resolve(REPO_ROOT, filePath));
  if (fileExists && !wasFileReadRecently(filePath)) {
    block(
      `⛔ BLOCKED: You haven't Read this file recently.\n` +
      `Read the file first, then try editing.\n` +
      `File: ${filePath}`
    );
    return;
  }

  if ((state.edits_remaining || 0) <= 0) {
    block(`⛔ BLOCKED: Edit limit reached.\nCall check_before_edit again.\nFile: ${filePath}`);
    return;
  }

  if (state.requires_answer && !state.question_answered) {
    block(
      `⛔ BLOCKED: Unanswered question from guardrail.\n` +
      `Question: ${state.next_question || '(see guardrail output)'}\n` +
      `Answer by re-calling check_before_edit with answered_question and evidence.`
    );
    return;
  }

  state.edits_remaining = (state.edits_remaining || 1) - 1;
  writeJsonState(STATE_FILE, state);
  logApprovalConsumed({ tool: 'check_before_edit', file: filePath, editsRemainingAfter: state.edits_remaining });
  allow();
}

main().catch(err => { block(`Pre-edit guard error: ${err.message}`); });
