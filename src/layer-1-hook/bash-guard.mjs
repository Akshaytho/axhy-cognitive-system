#!/usr/bin/env node

/**
 * Layer 1: PreToolUse hook for Bash commands.
 *
 * Blocks two categories of bypass:
 * 1. Direct writes to guardrail state files (gaming protection)
 * 2. Scripting-language and shell-redirect file writes that bypass
 *    the Edit/Write tool guardrail (pre-edit-guard bypass)
 *
 * Category 2 is critical: if the AI uses `python -c`, `perl -pi`,
 * `ruby -e`, `cat >`, `tee`, or `sed -i` to write workspace files,
 * it circumvents risk classification, intent validation, and edit
 * budgets. These are trust violations, not convenience shortcuts.
 */

import { appendFileSync } from 'node:fs';
import { getWorkspaceRoots } from '../shared/config.mjs';

// --- Category 1: State file manipulation patterns ---

const SF = '(guardrail-state|read-state|plan-guardrail-state|done-guardrail-state|build-guardrail-state)';

const STATE_FILE_PATTERNS = [
  { pattern: new RegExp(`>\\s*\\/tmp\\/axhy-[a-f0-9]+-${SF}`), reason: 'Redirect to guardrail state file' },
  { pattern: new RegExp(`tee\\s+.*\\/tmp\\/axhy-[a-f0-9]+-${SF}`), reason: 'Tee to guardrail state file' },
  { pattern: new RegExp(`cp\\s+.*\\/tmp\\/axhy-[a-f0-9]+-${SF}`), reason: 'Copy to guardrail state file' },
  { pattern: new RegExp(`mv\\s+.*\\/tmp\\/axhy-[a-f0-9]+-${SF}`), reason: 'Move to guardrail state file' },
  { pattern: /writeFileSync\s*\(.*\/tmp\/axhy-/, reason: 'JS writeFileSync to state file' },
  { pattern: /open\s*\(.*\/tmp\/axhy-.*,\s*['"`]w/, reason: 'Python open(w) to state file' },
  { pattern: /edits_remaining['"]?\s*[:=]\s*([2-9]\d|\d{3,})/, reason: 'Edit limit inflation' },
  { pattern: /question_answered['"]\s*:\s*true/, reason: 'Question bypass flag' },
  // Scoped to shell execution context — not triggered by string literals in
  // commit messages or retro docs that honestly name temptations (CORE_MIND §Right/Wrong).
  // Matches: export VAR=1, env VAR=1, VAR=1 at command start, or after ; && ||
  { pattern: /(^|;\s*|&&\s*|\|\|\s*|\bexport\s+|\benv\s+)AXHY_AUDIT_EMERGENCY\s*=\s*1/, reason: 'Emergency flag bypass' },
  { pattern: /(^|;\s*|&&\s*|\|\|\s*|\bexport\s+|\benv\s+)AXHY_FOUNDER_APPROVED\s*=\s*1/, reason: 'Founder-approved flag bypass' },
  { pattern: /(^|;\s*|&&\s*|\|\|\s*|\bexport\s+|\benv\s+)AXHY_BRAIN_DEGRADED_OK\s*=\s*1/, reason: 'Brain degraded-mode bypass' },
];

// --- Category 2: Scripting language / shell redirect bypass patterns ---
// These block commands that write to workspace files through non-Edit tools.
// Read-only operations (cat file.txt, python -c "print(...)") are NOT blocked.

const WORKSPACE_ROOTS = getWorkspaceRoots();

/**
 * Build workspace-aware patterns. These only trigger when the command
 * targets a file inside a known workspace root.
 */
function buildWorkspacePatterns() {
  const patterns = [];

  // Escape workspace roots for regex use
  const escapedRoots = WORKSPACE_ROOTS.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const rootAlt = escapedRoots.length > 0 ? `(${escapedRoots.join('|')})` : null;

  if (!rootAlt) return patterns;

  // Python -c with open() in write mode targeting workspace
  patterns.push({
    pattern: new RegExp(`python[23]?\\s+-c\\s+.*open\\s*\\(.*['"]w`),
    reason: 'Python -c with open(w) — bypasses Edit guardrail',
  });

  // Python heredoc / inline script writing files
  patterns.push({
    pattern: /python[23]?\s+(-c\s+)?.*['"]\s*<<|python[23]?\s+<<\s*/,
    reason: 'Python heredoc — potential file write bypass',
  });

  // Perl in-place edit (-pi, -p -i, -i -p)
  patterns.push({
    pattern: /perl\s+.*-[a-zA-Z]*p[a-zA-Z]*i|perl\s+.*-[a-zA-Z]*i[a-zA-Z]*p|perl\s+-[a-zA-Z]*i/,
    reason: 'Perl in-place edit (-pi/-i) — bypasses Edit guardrail',
  });

  // Ruby -e with File.write or File.open(w)
  patterns.push({
    pattern: /ruby\s+-e\s+.*File\.(write|open)/,
    reason: 'Ruby -e File.write — bypasses Edit guardrail',
  });

  // sed -i (in-place edit) targeting workspace files
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`sed\\s+.*-i[a-zA-Z.'"]*\\s+.*${root}`),
      reason: 'sed -i on workspace file — bypasses Edit guardrail',
    });
  }

  // General sed -i targeting common code extensions
  patterns.push({
    pattern: /sed\s+.*-i[a-zA-Z.'"]*\s+.*\.(ts|tsx|js|jsx|mjs|json|md|prisma|yaml|yml|toml)\b/,
    reason: 'sed -i on code file — bypasses Edit guardrail',
  });

  // cat > or cat >> targeting workspace files (write/append redirect)
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`cat\\s+.*>+\\s*${root}`),
      reason: 'cat redirect to workspace file — bypasses Edit guardrail',
    });
  }

  // tee targeting workspace files (not just state files)
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`tee\\s+(-a\\s+)?${root}`),
      reason: 'tee to workspace file — bypasses Edit guardrail',
    });
  }

  // General redirect to workspace files
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`>+\\s*${root}.*\\.(ts|tsx|js|jsx|mjs|json|md|prisma|yaml|yml|toml)\\b`),
      reason: 'Shell redirect to workspace code file — bypasses Edit guardrail',
    });
  }

  // --- C2 fix: additional bypass vectors (2026-05-23 principal review) ---

  // Node.js -e / --eval with writeFileSync or appendFileSync
  patterns.push({
    pattern: /node\s+(-e|--eval)\s+.*(?:writeFileSync|appendFileSync|createWriteStream)/,
    reason: 'node -e with file write API — bypasses Edit guardrail',
  });

  // Node.js -e with fs.write (handles require('fs').writeFileSync(...))
  patterns.push({
    pattern: /node\s+(-e|--eval)\s+.*(?:require\s*\(\s*['"]fs['"]\s*\)|fs\s*\.write)/,
    reason: 'node -e with fs module — bypasses Edit guardrail',
  });

  // awk redirect to workspace files
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`awk\\s+.*>+\\s*${root}`),
      reason: 'awk redirect to workspace file — bypasses Edit guardrail',
    });
    patterns.push({
      pattern: new RegExp(`awk\\s+.*print.*>+\\s*.*${root}`),
      reason: 'awk print-redirect to workspace file — bypasses Edit guardrail',
    });
  }

  // dd of= targeting workspace files
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`dd\\s+.*of=${root}`),
      reason: 'dd of= to workspace file — bypasses Edit guardrail',
    });
  }

  // mv targeting workspace code files (overwrite via move)
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`mv\\s+.*\\s+${root}.*\\.(ts|tsx|js|jsx|mjs|json|md|prisma|yaml|yml|toml)\\b`),
      reason: 'mv to workspace code file — bypasses Edit guardrail',
    });
  }

  // cp targeting workspace code files (overwrite via copy)
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`cp\\s+.*\\s+${root}.*\\.(ts|tsx|js|jsx|mjs|json|md|prisma|yaml|yml|toml)\\b`),
      reason: 'cp to workspace code file — bypasses Edit guardrail',
    });
  }

  // curl -o / curl --output downloading to workspace
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`curl\\s+.*(-o|--output)\\s+${root}`),
      reason: 'curl download to workspace — bypasses Edit guardrail',
    });
  }

  // wget -O downloading to workspace
  for (const root of escapedRoots) {
    patterns.push({
      pattern: new RegExp(`wget\\s+.*-O\\s+${root}`),
      reason: 'wget download to workspace — bypasses Edit guardrail',
    });
  }

  return patterns;
}

const WORKSPACE_BYPASS_PATTERNS = buildWorkspacePatterns();

// Combine both categories
const ALL_BLOCKED = [
  ...STATE_FILE_PATTERNS,
  ...WORKSPACE_BYPASS_PATTERNS,
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
    // Fail-closed: if stdin is corrupted or unparseable, BLOCK the command.
    // Exit 0 here would silently allow any bash command through.
    process.exit(2);
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

  for (const { pattern, reason } of ALL_BLOCKED) {
    if (pattern.test(command)) {
      logEvent('bash_blocked', {
        pattern: pattern.toString(),
        reason,
        command_preview: command.slice(0, 300),
      });

      const isStateFile = STATE_FILE_PATTERNS.some(p => p.pattern === pattern);

      if (isStateFile) {
        process.stderr.write(
          `⛔ BLOCKED: Command targets guardrail state files.\n` +
          `Reason: ${reason}\n` +
          `Matched: ${pattern}\n\n` +
          `Direct writes to /tmp/axhy-* state files bypass the guardrail.\n` +
          `This is a trust-boundary violation (2026-05-22 gaming audit).\n\n` +
          `Use the proper path:\n` +
          `  → check_before_edit for code edits\n` +
          `  → check_before_plan for plan writes\n` +
          `  → check_before_done for done memos\n` +
          `  → check_before_build for enterprise preflight\n\n` +
          `If the guardrail is broken, ask the founder.`
        );
      } else {
        process.stderr.write(
          `⛔ BLOCKED: Command writes workspace files outside the Edit tool.\n` +
          `Reason: ${reason}\n` +
          `Matched: ${pattern}\n\n` +
          `Writing files through Bash (python, perl, ruby, cat, sed, tee)\n` +
          `bypasses the pre-edit-guard: risk classification, intent validation,\n` +
          `and edit budgets are all skipped.\n\n` +
          `Use the Edit or Write tool instead:\n` +
          `  → Edit tool for modifying existing files (preferred)\n` +
          `  → Write tool for creating new files\n` +
          `  → Both go through check_before_edit approval\n\n` +
          `This is a trust-boundary violation, not a convenience shortcut.`
        );
      }
      process.exit(2);
      return;
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(1));
