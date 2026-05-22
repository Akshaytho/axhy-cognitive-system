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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { classifyRisk, isGuardrailOptional, isPlanFile, isDoneMemo } from './risk-classifier.mjs';
import { logApprovalConsumed, logApprovalDenied, logApprovalExpired } from '../layer-2-guardrail/audit-log.mjs';

const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const PLAN_STATE_FILE = `/tmp/axhy-${REPO_HASH}-plan-guardrail-state.json`;
const DONE_STATE_FILE = `/tmp/axhy-${REPO_HASH}-done-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;
const APPROVAL_WINDOW_MS = 15 * 60 * 1000;
const DONE_APPROVAL_WINDOW_MS = 20 * 60 * 1000;
const READ_WINDOW_MS = 10 * 60 * 1000;

const WORKSPACE_ROOTS = [
  '/Users/thotaakshay/eclean_workspace',
  '/Users/thotaakshay/eclean_workspace/axhy-v3',
  '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system',
];

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function readJsonState(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

function readFromAny(file) {
  // Read-side mirror of writeJsonState fanout (introduced 67089ba): state files are fanned
  // out to /tmp/axhy-{hash}-{suffix} for every workspace hash. Scan all candidates and return
  // the most-recent-timestamp valid state, so a state written from one cwd is findable from another.
  const suffix = file.replace(/.*axhy-[a-f0-9]+-/, '');
  let best = null;
  let bestTs = -1;
  for (const h of allHashes()) {
    const candidate = `/tmp/axhy-${h}-${suffix}`;
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
      const ts = parsed && typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (ts > bestTs) { best = parsed; bestTs = ts; }
    } catch {}
  }
  return best;
}

function writeJsonState(file, state) {
  const suffix = file.replace(/.*axhy-[a-f0-9]+-/, '');
  const json = JSON.stringify(state, null, 2);
  for (const h of allHashes()) {
    try { writeFileSync(`/tmp/axhy-${h}-${suffix}`, json); } catch {}
  }
}

function wasFileReadRecently(filePath) {
  // Glob every /tmp/axhy-*-read-state.json bucket: any cwd-shift (pnpm
  // filter, expo CLI, playwright subagent) can land the Read in a hash
  // bucket whose workspace-root isn't in WORKSPACE_ROOTS. Enumerating
  // existing files is more robust than maintaining a hardcoded list.
  // Every timestamp considered came from a real Read tool invocation.
  let mostRecent = 0;
  let candidates = [];
  try {
    const all = readdirSync('/tmp');
    for (const name of all) {
      if (name.startsWith('axhy-') && name.endsWith('-read-state.json')) {
        candidates.push(`/tmp/${name}`);
      }
    }
  } catch {}
  for (const candidate of candidates) {
    const reads = readJsonState(candidate);
    if (!reads) continue;
    const ts = reads[filePath];
    if (typeof ts === 'number' && ts > mostRecent) mostRecent = ts;
  }
  if (!mostRecent) return false;
  return (Date.now() - mostRecent) < READ_WINDOW_MS;
}

function block(reason) {
  process.stderr.write(reason);
  process.exit(2);
}

function allow() {
  process.exit(0);
}

function checkGuardedFile(filePath, stateFile, windowMs, toolName) {
  const state = readFromAny(stateFile);
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
  const state = readFromAny(STATE_FILE);
  if (!state) {
    block(
      `⛔ BLOCKED: No guardrail approval found.\n` +
      `You must call axhy_guardrail.check_before_edit before editing code files.\n` +
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
      `⛔ BLOCKED: File not in approved scope.\n` +
      `Approved files: ${approvedFiles.join(', ')}\n` +
      `You tried to edit: ${filePath}\n` +
      `Call check_before_edit again with this file in your intent.`
    );
    return;
  }

  if (!wasFileReadRecently(filePath)) {
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

  const elapsed = Date.now() - (state.timestamp || 0);
  if (elapsed > APPROVAL_WINDOW_MS) {
    block(`⛔ BLOCKED: Approval expired (${Math.round(elapsed / 1000)}s ago).\nCall check_before_edit again.\nFile: ${filePath}`);
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
