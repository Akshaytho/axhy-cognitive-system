#!/usr/bin/env node

/**
 * Layer 1: PreToolUse hook for Bash commands.
 * Blocks direct writes to guardrail state files and emergency bypass flags.
 */

import { appendFileSync } from 'node:fs';

const SF = '(guardrail-state|read-state|plan-guardrail-state|done-guardrail-state)';

const BLOCKED_PATTERNS = [
  new RegExp(`>\\s*\\/tmp\\/axhy-[a-f0-9]+-${SF}`),
  new RegExp(`tee\\s+.*\\/tmp\\/axhy-[a-f0-9]+-${SF}`),
  new RegExp(`cp\\s+.*\\/tmp\\/axhy-[a-f0-9]+-${SF}`),
  new RegExp(`mv\\s+.*\\/tmp\\/axhy-[a-f0-9]+-${SF}`),
  /writeFileSync\s*\(.*\/tmp\/axhy-/,
  /open\s*\(.*\/tmp\/axhy-.*,\s*['"`]w/,
  /edits_remaining['"]?\s*[:=]\s*([2-9]\d|\d{3,})/,
  /question_answered['"]\s*:\s*true/,
  /AXHY_AUDIT_EMERGENCY\s*=\s*1/,
  /AXHY_FOUNDER_APPROVED\s*=\s*1/,
];

const AUDIT_LOG = '/tmp/axhy-bash-guard-audit.jsonl';

function logEvent(event, detail) {
  try {
    appendFileSync(AUDIT_LOG, JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...detail,
    }) + '\n');
  } catch {}
}

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
    return;
  }

  if ((input.tool_name || '') !== 'Bash') {
    process.exit(0);
    return;
  }

  const command = input.tool_input?.command || '';
  if (!command) {
    process.exit(0);
    return;
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      logEvent('bash_blocked', {
        pattern: pattern.toString(),
        command_preview: command.slice(0, 300),
      });

      process.stderr.write(
        `⛔ BLOCKED: Command targets guardrail state files.\n` +
        `Matched: ${pattern}\n\n` +
        `Direct writes to /tmp/axhy-* state files bypass the guardrail.\n` +
        `This is a trust-boundary violation (2026-05-22 gaming audit).\n\n` +
        `Use the proper path:\n` +
        `  → check_before_edit for code edits\n` +
        `  → check_before_plan for plan writes\n` +
        `  → check_before_done for done memos\n\n` +
        `If the guardrail is broken, ask the founder.`
      );
      process.exit(2);
      return;
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
