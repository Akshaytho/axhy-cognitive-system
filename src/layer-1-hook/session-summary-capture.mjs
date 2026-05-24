#!/usr/bin/env node

/**
 * D3: Session Summary Capture — Stop hook.
 *
 * Captures a session summary at session end → appends to activity log.
 * Reads the session's activity entries and produces a summary entry
 * with type='session_summary'.
 *
 * Gated behind ACTIVITY_CAPTURE_ENABLED=true (default: off).
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COGNITIVE_ROOT = resolve(__dirname, '..', '..');
const ACTIVITY_DIR = resolve(COGNITIVE_ROOT, 'docs', 'activity');

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
 * Summarize the session's activity from the current month's log.
 */
function buildSessionSummary(sessionId) {
  const logPath = getActivityLogPath();
  if (!existsSync(logPath)) return { tools_used: 0, files_touched: 0 };

  try {
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    let toolsUsed = 0;
    const filesSet = new Set();
    const toolNames = new Set();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (sessionId && entry.session_id !== sessionId) continue;
        if (entry.type === 'tool_use') {
          toolsUsed++;
          toolNames.add(entry.tool_name);
          // Extract file paths from input_summary
          const fileMatch = (entry.input_summary || '').match(/"file_path"\s*:\s*"([^"]+)"/);
          if (fileMatch) filesSet.add(fileMatch[1]);
        }
      } catch {
        // Skip malformed
      }
    }

    return {
      tools_used: toolsUsed,
      unique_tools: [...toolNames],
      files_touched: filesSet.size,
      files: [...filesSet].slice(0, 20), // Cap at 20 files
    };
  } catch {
    return { tools_used: 0, files_touched: 0 };
  }
}

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
    // If no stdin, still capture a summary
    input = {};
  }

  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || null;
  const summary = buildSessionSummary(sessionId);

  const entry = {
    timestamp: new Date().toISOString(),
    kind: 'activity',
    authority_level: 'activity',
    type: 'session_summary',
    session_id: sessionId,
    summary: {
      tools_used: summary.tools_used,
      unique_tools: summary.unique_tools || [],
      files_touched: summary.files_touched,
      duration_hint: input.duration || null,
    },
  };

  try {
    appendFileSync(getActivityLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    // Non-blocking
  }

  // Output for the hook system
  console.log(JSON.stringify({ captured: true, tools_used: summary.tools_used }));
  process.exit(0);
}

// Only run main() when this file is the entry point (not when imported by tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''))) {
  main().catch(() => process.exit(0));
}
