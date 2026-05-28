#!/usr/bin/env node

/**
 * Layer 1: pre-ask-guard.mjs — PreToolUse hook for AskUserQuestion.
 *
 * Enforces "decide-before-ask" structurally: blocks AskUserQuestion unless
 * the first question text begins with one of two markers proving the AI
 * consulted the brain before bothering the founder.
 *
 *   [BRAIN_CHECKED]  AI ran impact_search / get_observations and the brain
 *                    had no clear answer — asking the founder is correct.
 *   [BYPASS_BRAIN]   AI is explicitly bypassing for a stated reason. The
 *                    text following the marker should explain why.
 *
 * Without a marker, the hook returns a block message instructing the AI
 * to run impact_search first.
 *
 * Why: the rule "founder sees only important decisions" lives as a feedback
 * memory file but gets ignored under pressure. This gate converts it from
 * aspiration into structural law.
 *
 * Bypass for ops: set env AXHY_DECIDE_BEFORE_ASK=off.
 *
 * Fail-open: any error reading or parsing input exits 0 (allow). The hook
 * never blocks because of its own bug.
 */

import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO_ROOT =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.AXHY_REPO_ROOT ||
  process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const AUDIT_LOG = `/tmp/axhy-${REPO_HASH}-ask-guard-audit.jsonl`;

const MARKERS = ['[BRAIN_CHECKED]', '[BYPASS_BRAIN]'];

function logAudit(event) {
  try {
    appendFileSync(
      AUDIT_LOG,
      JSON.stringify({ ...event, ts: Date.now() }) + '\n'
    );
  } catch {
    // Audit failure must never break the hook.
  }
}

function block(message) {
  process.stderr.write(message);
  process.exit(2);
}

async function main() {
  // Operations escape hatch.
  if (process.env.AXHY_DECIDE_BEFORE_ASK === 'off') {
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
    // Fail-open on malformed input — the hook is never the source of a crash.
    process.exit(0);
    return;
  }

  const toolName = input.tool_name || '';
  if (toolName !== 'AskUserQuestion') {
    process.exit(0);
    return;
  }

  const toolInput = input.tool_input || {};
  const questions = Array.isArray(toolInput.questions)
    ? toolInput.questions
    : [];
  if (questions.length === 0) {
    process.exit(0);
    return;
  }

  const firstQuestion = questions[0] || {};
  const questionText = ((firstQuestion.question || '') + '').trim();
  const matchedMarker = MARKERS.find(m => questionText.startsWith(m));

  if (matchedMarker) {
    logAudit({
      action: 'allowed',
      marker: matchedMarker,
      question: questionText.slice(0, 120),
    });
    process.exit(0);
    return;
  }

  logAudit({
    action: 'blocked',
    question: questionText.slice(0, 120),
  });

  block(
    `⛔ BLOCKED: AskUserQuestion without brain check.\n\n` +
      `Before asking the founder, query the brain to see if the answer ` +
      `already exists:\n` +
      `  impact_search("founder preference on <topic>")\n` +
      `  get_observations([<obs_ids>])\n\n` +
      `If brain has the answer: USE it, don't ask.\n` +
      `If brain has nothing useful: prefix your question with [BRAIN_CHECKED] ` +
      `and re-call AskUserQuestion.\n` +
      `If you must bypass for a legitimate reason: prefix with [BYPASS_BRAIN] ` +
      `+ short reason in the question text.\n\n` +
      `Why this exists: "founder sees only important decisions" lives as a ` +
      `feedback memory file but gets ignored under pressure. This gate ` +
      `enforces it structurally.\n\n` +
      `Disable for ops: set env AXHY_DECIDE_BEFORE_ASK=off.\n`
  );
}

main().catch(() => process.exit(0));
