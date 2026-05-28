#!/usr/bin/env node

/**
 * Layer 1: phase7c-monitor.mjs — PostToolUse hook for Bash + Read.
 *
 * Enforces Phase 7C "tool-output-to-file" discipline by DETECTION
 * (not blocking). The rule: tool outputs >~2K chars should be saved to
 * docs/evidence/YYYY-MM-DD/EVID-NNN.md with a one-line reference in chat.
 *
 * Without enforcement the rule gets ignored under cognitive pressure
 * (audit observations 3437/3441/3458 documented this — 22 large outputs
 * in chat during a recent session = ~30K tokens of context bloat).
 *
 * What this hook does:
 *   1. Receives tool_name + tool_input + tool_response from Claude Code.
 *   2. If tool is Bash or Read and response > 2048 chars, logs a violation
 *      to /tmp/axhy-{hash}-7c-violations.jsonl.
 *   3. Never blocks. Always exits 0. Tool execution is unaffected.
 *
 * Why detection not blocking:
 *   - Blocking large outputs would break many legitimate workflows
 *     (test suite output, git log, file reads of medium files).
 *   - Detection makes the violation observable across sessions.
 *   - Boot procedure can surface "previous session had N violations"
 *     so the next embodiment sees the pattern.
 *
 * Bypass for ops: set env AXHY_PHASE_7C_MONITOR=off.
 *
 * Fail-open: any error reading or parsing input exits 0 (allow).
 * The hook never breaks because of its own bug.
 */

import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.AXHY_REPO_ROOT ||
  process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const VIOLATIONS_LOG = `/tmp/axhy-${REPO_HASH}-7c-violations.jsonl`;

const SIZE_THRESHOLD = 2048; // characters — same as Phase 7C spec
const MONITORED_TOOLS = new Set(['Bash', 'Read']);

function logViolation(event) {
  try {
    appendFileSync(
      VIOLATIONS_LOG,
      JSON.stringify({ ...event, ts: Date.now() }) + '\n'
    );
  } catch {
    // Log write failure must not break the hook.
  }
}

function safeResponseLength(toolResponse) {
  if (!toolResponse) return 0;
  if (typeof toolResponse === 'string') return toolResponse.length;
  try {
    return JSON.stringify(toolResponse).length;
  } catch {
    return 0;
  }
}

function extractContext(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  if (toolName === 'Bash') {
    return String(toolInput.command || '').slice(0, 200);
  }
  if (toolName === 'Read') {
    return String(toolInput.file_path || toolInput.filePath || '').slice(0, 200);
  }
  return '';
}

async function main() {
  // Operations escape hatch.
  if (process.env.AXHY_PHASE_7C_MONITOR === 'off') {
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
    // Fail-open on malformed input.
    process.exit(0);
    return;
  }

  const toolName = input.tool_name || '';
  if (!MONITORED_TOOLS.has(toolName)) {
    process.exit(0);
    return;
  }

  const responseLen = safeResponseLength(input.tool_response);
  if (responseLen <= SIZE_THRESHOLD) {
    process.exit(0);
    return;
  }

  logViolation({
    tool: toolName,
    size: responseLen,
    threshold: SIZE_THRESHOLD,
    context: extractContext(toolName, input.tool_input),
  });

  // Detection only — never block.
  process.exit(0);
}

main().catch(() => process.exit(0));
