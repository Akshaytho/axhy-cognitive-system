#!/usr/bin/env node

/**
 * Layer 1: PreToolUse hook for Edit/Write tools.
 *
 * Claude Code calls this BEFORE every Edit or Write.
 * Reads tool input from stdin (JSON), checks guardrail state,
 * exits 0 (allow) or 2 (block).
 *
 * Checks in order:
 *  1. Is file guardrail-optional? (docs/plans, README, etc.) → allow
 *  2. Was guardrail (check_before_edit) called recently?
 *  3. Is the target file in approved_files?
 *  4. Was the file Read recently (read-before-edit)?
 *  5. Are edits_remaining > 0?
 *  6. Is the approval still within the 5-minute window?
 *  7. If requires_answer=true and not answered → block
 *  8. Allow + decrement edits_remaining
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { classifyRisk, isGuardrailOptional } from './risk-classifier.mjs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-guardrail-state.json`;
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;
const APPROVAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const READ_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function readState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function readReadState() {
  if (!existsSync(READ_STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function wasFileReadRecently(filePath) {
  const reads = readReadState();
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

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  const filePath = toolInput.file_path || toolInput.filePath || '';
  if (!filePath) {
    block('No file_path found in tool input.');
    return;
  }

  // 1. Guardrail-optional files (pure documentation)
  if (isGuardrailOptional(filePath)) {
    allow();
    return;
  }

  // 2. Check guardrail state exists
  const state = readState();
  if (!state) {
    block(
      `⛔ BLOCKED: No guardrail approval found.\n` +
      `You must call axhy_guardrail.check_before_edit before editing code files.\n` +
      `File: ${filePath}`
    );
    return;
  }

  // 3. Check file is in approved_files (normalized path matching)
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

  // 4. Read-before-edit: was this file Read recently?
  if (!wasFileReadRecently(filePath)) {
    block(
      `⛔ BLOCKED: You haven't Read this file recently.\n` +
      `Read the file first to understand its current state, then try editing.\n` +
      `File: ${filePath}`
    );
    return;
  }

  // 5. Check edits remaining
  if ((state.edits_remaining || 0) <= 0) {
    block(
      `⛔ BLOCKED: Edit limit reached for this approval.\n` +
      `Call check_before_edit again to get a fresh approval.\n` +
      `File: ${filePath}`
    );
    return;
  }

  // 6. Check time window
  const elapsed = Date.now() - (state.timestamp || 0);
  if (elapsed > APPROVAL_WINDOW_MS) {
    block(
      `⛔ BLOCKED: Guardrail approval expired (${Math.round(elapsed / 1000)}s ago).\n` +
      `Call check_before_edit again for a fresh approval.\n` +
      `File: ${filePath}`
    );
    return;
  }

  // 7. Check requires_answer
  if (state.requires_answer && !state.question_answered) {
    block(
      `⛔ BLOCKED: Unanswered question from guardrail.\n` +
      `Question: ${state.next_question || '(see guardrail output)'}\n` +
      `Answer it by re-calling check_before_edit with answered_question and evidence.`
    );
    return;
  }

  // 8. Allow and decrement
  state.edits_remaining = (state.edits_remaining || 1) - 1;
  writeState(state);

  allow();
}

main().catch(err => {
  block(`Pre-edit guard error: ${err.message}`);
});
