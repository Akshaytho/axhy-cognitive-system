#!/usr/bin/env node

/**
 * D2: Prompt Capture — captures user prompts with redaction.
 *
 * Intended as a PreToolUse or notification hook. Captures the user's
 * prompt text → redacts <private> content → appends to activity log.
 *
 * Gated behind ACTIVITY_CAPTURE_ENABLED=true (default: off).
 *
 * Note: Claude Code's hook system may not have a dedicated
 * UserPromptSubmit event. This module exports the capture function
 * for use by other hooks or direct invocation.
 */

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COGNITIVE_ROOT = resolve(__dirname, '..', '..');
const ACTIVITY_DIR = resolve(COGNITIVE_ROOT, 'docs', 'activity');

const MAX_PROMPT_CHARS = 300;

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

function redact(text) {
  if (!text || typeof text !== 'string') return text;
  let redacted = text.replace(/<private>[\s\S]*?<\/private>/gi, '[REDACTED]');
  redacted = redacted.replace(/(?:password|secret|token|api[_-]?key)\s*[:=]\s*['"]?[^\s'"]+/gi, '[REDACTED]');
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9_\-./+=]+/g, 'Bearer [REDACTED]');
  return redacted;
}

function truncate(text, max) {
  if (!text || typeof text !== 'string') return text;
  if (text.length <= max) return text;
  return text.slice(0, max) + `... [truncated]`;
}

/**
 * Capture a user prompt to the activity log.
 * Can be called from other hooks or directly.
 *
 * @param {string} prompt - The user's prompt text
 * @param {object} [metadata] - Optional metadata (session_id, etc.)
 */
export function capturePrompt(prompt, metadata = {}) {
  if (process.env.ACTIVITY_CAPTURE_ENABLED !== 'true') return;
  if (!prompt || typeof prompt !== 'string') return;

  const entry = {
    timestamp: new Date().toISOString(),
    kind: 'activity',
    authority_level: 'activity',
    type: 'user_prompt',
    content: redact(truncate(prompt, MAX_PROMPT_CHARS)),
    session_id: metadata.session_id || process.env.CLAUDE_SESSION_ID || null,
  };

  try {
    appendFileSync(getActivityLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    // Non-blocking
  }
}

// When run as a standalone hook via stdin
async function main() {
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

  // Extract prompt from hook input
  const prompt = input.prompt || input.user_message || input.content || '';
  if (prompt) {
    capturePrompt(prompt, { session_id: input.session_id });
  }

  process.exit(0);
}

// Only run main() when this file is the entry point (not when imported by tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''))) {
  main().catch(() => process.exit(0));
}
