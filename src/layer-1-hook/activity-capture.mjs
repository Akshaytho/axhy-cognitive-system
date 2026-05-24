#!/usr/bin/env node

/**
 * D1: Activity Capture — PostToolUse hook.
 *
 * Captures tool calls → redacts <private> content → appends to
 * docs/activity/YYYY-MM/ACTIVITY.jsonl with kind='activity',
 * authority_level='activity'.
 *
 * Gated behind ACTIVITY_CAPTURE_ENABLED=true (default: off).
 * Skips non-informative tools: TodoWrite, Skill, AskUserQuestion,
 * mark_chapter, spawn_task, ScheduleWakeup.
 *
 * This runs async with a 5s timeout — cannot block Claude Code.
 */

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COGNITIVE_ROOT = resolve(__dirname, '..', '..');
const ACTIVITY_DIR = resolve(COGNITIVE_ROOT, 'docs', 'activity');

// Tools that produce no useful signal for activity tracking.
const SKIP_TOOLS = new Set([
  'TodoWrite', 'TodoRead',
  'Skill',
  'AskUserQuestion',
  'mcp__ccd_session__mark_chapter',
  'mcp__ccd_session__spawn_task',
  'ScheduleWakeup',
  'ToolSearch',
  'ShareOnboardingGuide',
]);

// Maximum characters to store per field to prevent bloat.
const MAX_INPUT_CHARS = 500;
const MAX_OUTPUT_CHARS = 200;

function getActivityLogPath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dir = resolve(ACTIVITY_DIR, `${yyyy}-${mm}`);
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  }
  return resolve(dir, 'ACTIVITY.jsonl');
}

/**
 * Redact <private>...</private> content and sensitive patterns.
 */
function redact(text) {
  if (!text || typeof text !== 'string') return text;
  // Strip <private> tags and their content
  let redacted = text.replace(/<private>[\s\S]*?<\/private>/gi, '[REDACTED]');
  // Strip common secret patterns
  redacted = redacted.replace(/(?:password|secret|token|api[_-]?key)\s*[:=]\s*['"]?[^\s'"]+/gi, '[REDACTED]');
  // Strip bearer tokens
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9_\-./+=]+/g, 'Bearer [REDACTED]');
  return redacted;
}

/**
 * Truncate a string to max length, adding indicator if truncated.
 */
function truncate(text, max) {
  if (!text || typeof text !== 'string') return text;
  if (text.length <= max) return text;
  return text.slice(0, max) + `... [truncated, ${text.length} chars total]`;
}

async function main() {
  // Feature flag gate
  if (process.env.ACTIVITY_CAPTURE_ENABLED !== 'true') {
    process.exit(0);
    return;
  }

  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
    return;
  }

  const toolName = input.tool_name || '';

  // Skip non-informative tools
  if (SKIP_TOOLS.has(toolName)) {
    process.exit(0);
    return;
  }

  const toolInput = input.tool_input || {};
  const toolOutput = input.tool_output || '';

  // Build activity entry
  const entry = {
    timestamp: new Date().toISOString(),
    kind: 'activity',
    authority_level: 'activity',
    type: 'tool_use',
    tool_name: toolName,
    input_summary: redact(truncate(JSON.stringify(toolInput), MAX_INPUT_CHARS)),
    output_summary: redact(truncate(
      typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput),
      MAX_OUTPUT_CHARS
    )),
    session_id: process.env.CLAUDE_SESSION_ID || null,
  };

  try {
    appendFileSync(getActivityLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    // Activity capture failure is non-blocking
  }

  process.exit(0);
}

// Only run main() when this file is the entry point (not when imported by tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''))) {
  main().catch(() => process.exit(0));
}
