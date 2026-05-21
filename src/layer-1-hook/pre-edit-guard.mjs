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
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { classifyRisk, isGuardrailOptional, isPlanFile, isDoneMemo } from './risk-classifier.mjs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const PLAN_STATE_FILE = `/tmp/axhy-${REPO_HASH}-plan-guardrail-state.json`;
const DONE_STATE_FILE = `/tmp/axhy-${REPO_HASH}-done-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;
const APPROVAL_WINDOW_MS = 5 * 60 * 1000;
const DONE_APPROVAL_WINDOW_MS = 10 * 60 * 1000;
const READ_WINDOW_MS = 10 * 60 * 1000;

function readJsonState(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

function writeJsonState(file, state) {
  writeFileSync(file, JSON.stringify(state, null, 2));
}

function wasFileReadRecently(filePath) {
  const reads = readJsonState(READ_STATE_FILE) || {};
  const lastRead = reads[filePath];
  if (!lastRead) return false;
  return (Date.now() - lastRead) < READ_WINDOW_MS;
}

function block(reason) {
  process.stderr.write(reason);
  process.exit(2);
}

function allow() {
  process.exit(0);
}

function checkGuardedFile(filePath, stateFile, windowMs, toolName) {
  const state = readJsonState(stateFile);
  if (!state) {
    block(
      `⛔ BLOCKED: No ${toolName} approval found.\n` +
      `You must call axhy_guardrail.${toolName} before writing this file.\n` +
      `File: ${filePath}`
    );
    return;
  }

  const approvedFiles = state.approved_files || [];
  const normalizedPath = resolve(filePath);
  const fileApproved = approvedFiles.some(approved => {
    if (normalizedPath.includes(approved)) return true;
    const normalizedApproved = resolve(REPO_ROOT, approved);
    return normalizedPath === normalizedApproved || normalizedPath.startsWith(normalizedApproved + '/');
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

  const elapsed = Date.now() - (state.timestamp || 0);
  if (elapsed > windowMs) {
    block(
      `⛔ BLOCKED: ${toolName} approval expired (${Math.round(elapsed / 1000)}s ago).\n` +
      `Call ${toolName} again.\n` +
      `File: ${filePath}`
    );
    return;
  }

  state.edits_remaining = (state.edits_remaining || 1) - 1;
  writeJsonState(stateFile, state);
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
  const state = readJsonState(STATE_FILE);
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
    if (normalizedPath.includes(approved)) return true;
    const normalizedApproved = resolve(REPO_ROOT, approved);
    return normalizedPath === normalizedApproved || normalizedPath.startsWith(normalizedApproved + '/');
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
  allow();
}

main().catch(err => { block(`Pre-edit guard error: ${err.message}`); });
