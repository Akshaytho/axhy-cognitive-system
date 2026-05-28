#!/usr/bin/env node

/**
 * Layer 1: orchestrator-counter.mjs — PreToolUse hook on Read + Edit + Write.
 *
 * Enforces delegation discipline structurally: when I do too many
 * substantive Read/Edit/Write operations without delegating to a Task
 * sub-agent, the hook blocks my next op and forces the delegation decision.
 *
 * Why: written rules to "delegate substantive work" get forgotten under
 * cognitive pressure (same gap every prior session retro named). A hook
 * fires every relevant tool call — cannot drift.
 *
 * State: /tmp/axhy-{hash}-orchestrator-state.json
 *   { count_since_last_task: int, last_call_at: ts }
 *
 * Counter rules:
 *   - Read, Edit, Write, MultiEdit increment the counter
 *   - Task (Agent) call resets the counter to 0
 *   - Other tools (Bash, Grep, etc.) pass through without affecting count
 *
 * Threshold (env-configurable):
 *   AXHY_ORCHESTRATOR_THRESHOLD (default 6 — calibrated empirically)
 *
 * Bypass mechanisms:
 *   - [ORCHESTRATOR_EXCEPTION] marker in tool input fields (file_path,
 *     command, intent, description) — passes through with audit log entry
 *   - AXHY_ORCHESTRATOR=off env — fully disables the hook
 *
 * Fail-open: any parse or state error exits 0 (allow). The hook never
 * blocks tool execution due to its own bug.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.AXHY_REPO_ROOT ||
  process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const STATE_FILE = `/tmp/axhy-${REPO_HASH}-orchestrator-state.json`;
const AUDIT_LOG = `/tmp/axhy-${REPO_HASH}-orchestrator-audit.jsonl`;

const DEFAULT_THRESHOLD = 6;
const THRESHOLD = parseInt(
  process.env.AXHY_ORCHESTRATOR_THRESHOLD || String(DEFAULT_THRESHOLD),
  10
);

const MONITORED = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);
const RESET_TOOLS = new Set(['Task', 'Agent']);

function readState() {
  if (!existsSync(STATE_FILE)) {
    return { count_since_last_task: 0, last_call_at: 0 };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { count_since_last_task: 0, last_call_at: 0 };
  }
}

function writeState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // State write failure must not break the hook
  }
}

function logAudit(event) {
  try {
    appendFileSync(
      AUDIT_LOG,
      JSON.stringify({ ...event, ts: Date.now() }) + '\n'
    );
  } catch {
    // Audit failure must not break the hook
  }
}

function block(message) {
  process.stderr.write(message);
  process.exit(2);
}

function hasExceptionMarker(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const fields = [
    toolInput.file_path,
    toolInput.command,
    toolInput.intent,
    toolInput.description,
    toolInput.old_string,
    toolInput.new_string,
  ];
  return fields.some(
    f => typeof f === 'string' && f.includes('[ORCHESTRATOR_EXCEPTION]')
  );
}

async function main() {
  // Operations escape hatch
  if (process.env.AXHY_ORCHESTRATOR === 'off') {
    process.exit(0);
    return;
  }

  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    if (!raw.trim()) {
      process.exit(0);
      return;
    }
    input = JSON.parse(raw);
  } catch {
    // Fail-open on malformed input
    process.exit(0);
    return;
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Task call: reset counter (orchestrator pattern fulfilled)
  if (RESET_TOOLS.has(toolName)) {
    writeState({ count_since_last_task: 0, last_call_at: Date.now() });
    logAudit({ action: 'reset', tool: toolName });
    process.exit(0);
    return;
  }

  // Not a monitored tool: pass through without affecting count
  if (!MONITORED.has(toolName)) {
    process.exit(0);
    return;
  }

  // Bypass marker: increment but allow, with audit
  if (hasExceptionMarker(toolInput)) {
    const state = readState();
    state.count_since_last_task += 1;
    state.last_call_at = Date.now();
    writeState(state);
    logAudit({
      action: 'bypass',
      tool: toolName,
      count: state.count_since_last_task,
    });
    process.exit(0);
    return;
  }

  // Check threshold
  const state = readState();
  const newCount = state.count_since_last_task + 1;

  if (newCount > THRESHOLD) {
    logAudit({
      action: 'block',
      tool: toolName,
      count: newCount,
      threshold: THRESHOLD,
    });
    block(
      `⛔ ORCHESTRATOR: ${newCount} substantive ops without delegation.\n\n` +
        `You have done ${newCount - 1} prior Read/Edit/Write calls in this ` +
        `work segment without spawning a Task sub-agent. This is the hoarding ` +
        `pattern that bloats your context.\n\n` +
        `Options:\n` +
        `  1. Spawn a Task sub-agent with a structured brief (preferred)\n` +
        `  2. If this single op must stay in-context, prefix any tool input ` +
        `field with [ORCHESTRATOR_EXCEPTION] + brief reason\n\n` +
        `Current threshold: ${THRESHOLD} (env: AXHY_ORCHESTRATOR_THRESHOLD)\n` +
        `Disable for ops: AXHY_ORCHESTRATOR=off\n`
    );
    return;
  }

  // Under threshold: increment and pass through
  writeState({ count_since_last_task: newCount, last_call_at: Date.now() });
  logAudit({ action: 'allow', tool: toolName, count: newCount });
  process.exit(0);
}

main().catch(() => process.exit(0));
