/**
 * Pattern Scanner — finds anti-patterns across all changed files in ONE pass,
 * grouped by pattern (not by file).
 *
 * This is the architectural fix for the per-file iteration problem: instead
 * of finding "unhandled_async in a.ts → fix → find unhandled_async in b.ts
 * → fix → ...", the scanner returns:
 *
 *   { pattern: 'unhandled_async', occurrences: [
 *       { file: 'a.ts', line: 42, snippet: '...' },
 *       { file: 'b.ts', line: 67, snippet: '...' },
 *       { file: 'c.ts', line: 89, snippet: '...' },
 *     ]}
 *
 * One pattern, all instances, fix once across all files. Mirrors Semgrep's
 * "Group by Rule" default view.
 *
 * Patterns are deliberately conservative — they should fire on clear
 * violations only. False positives become learnings via challenge-log.mjs.
 */

import { readFileSync, existsSync } from 'node:fs';
import { getLearnedPatterns } from './review-learning-rules.mjs';

/**
 * Each pattern definition has:
 *   - id: stable identifier used in challenges and audit
 *   - severity: blocker | warning | info
 *   - description: human-readable
 *   - filePattern: regex on file path (skip files that don't match)
 *   - scan: (content, filePath) => [{ line, snippet, context }]
 *
 * Patterns intentionally exclude function DEFINITION sites and configuration
 * constants — those were the false positives the other session named.
 */
const PATTERNS = [
  {
    id: 'unhandled_async',
    severity: 'blocker',
    description: 'Async function with awaited work but no try/catch anywhere in the body',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
    scan: scanUnhandledAsync,
  },
  {
    id: 'as_any_cast',
    severity: 'warning',
    description: 'Type assertion to "any" — bypasses type safety',
    filePattern: /\.(ts|tsx)$/,
    scan: scanAsAnyCast,
  },
  {
    id: 'silent_catch',
    // Calibration: empty catches are SOMETIMES bugs and SOMETIMES intentional
    // best-effort cleanup. Marked as warning (not blocker) so founder can triage.
    // To make a silent catch valid, add: a comment explaining intent, `continue`,
    // `break`, a return statement, log call, or throw. Empty catch alone gets flagged.
    severity: 'warning',
    description: 'catch block that swallows errors without logging, re-throwing, or documenting intent',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
    skipPattern: /\.test\.(ts|tsx|mjs|js|jsx)$|\/tests?\/|pre-commit\.mjs$|commit-msg\.mjs$/,
    scan: scanSilentCatch,
  },
  {
    id: 'hardcoded_route',
    severity: 'warning',
    description: 'Hardcoded route string in app.get/post/put/delete/patch literal — should use ROUTES constant',
    filePattern: /routes\/.*\.ts$|server\.ts$|app\.ts$/,
    scan: scanHardcodedRoute,
  },
  {
    id: 'missing_tenant_filter',
    severity: 'blocker',
    description: 'Prisma query without companyId/tenantId filter — multi-tenant isolation risk',
    filePattern: /routes\/.*\.ts$|services\/.*\.ts$/,
    scan: scanMissingTenantFilter,
  },
  {
    id: 'todo_in_committed_code',
    severity: 'info',
    description: 'TODO/FIXME left in code — track in issues, not source',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
    scan: scanTodoComments,
  },
];

// ── Pattern implementations ──

function scanUnhandledAsync(content, filePath) {
  const findings = [];
  // Calibration fix: strip template literal content. Tests embed async function
  // declarations inside backtick strings as fixtures — those are not real code.
  const cleaned = stripTemplateLiterals(content);
  const lines = cleaned.split('\n');
  // Match async function declarations or async arrow functions
  const asyncFnRegex = /^(\s*)(?:export\s+)?(?:async\s+function\s+(\w+)|const\s+(\w+)\s*[:=]\s*async\s*(?:\([^)]*\)|\w+)\s*=>|async\s+(\w+)\s*\([^)]*\)\s*\{)/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(asyncFnRegex);
    if (!m) continue;
    const fnName = m[2] || m[3] || m[4] || 'anonymous';

    // Find the function body — collect lines until matching closing brace at same indent
    const bodyLines = [];
    let depth = 0;
    let started = false;
    for (let j = i; j < Math.min(i + 200, lines.length); j++) {
      const line = lines[j];
      for (const ch of line) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
      }
      bodyLines.push(line);
      if (started && depth === 0) break;
    }
    const body = bodyLines.join('\n');

    // Skip if function body has no await — nothing to wrap
    if (!/\bawait\s+/.test(body)) continue;

    // Skip if body has try/catch ANYWHERE — try not required at position 1.
    // Calibration fix: ES2019 optional catch binding allows `catch {}` without
    // parens. Accept both `catch (` and `catch {`.
    if (/\btry\s*\{/.test(body) && /\bcatch\s*[({]/.test(body)) continue;

    // Calibration fix: skip if function is called with .catch() elsewhere in the file
    // (the main().catch(...) pattern at script entry points handles errors at call site).
    if (fnName && fnName !== 'anonymous') {
      const callCatchRegex = new RegExp(`\\b${fnName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\([^)]*\\)\\s*\\.\\s*catch\\s*\\(`);
      if (callCatchRegex.test(content)) continue;
    }

    findings.push({
      line: i + 1,
      snippet: lines[i].trim().slice(0, 120),
      context: `async function "${fnName}" awaits without try/catch`,
    });
  }
  return findings;
}

function scanAsAnyCast(content) {
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Match "as any" but not "as Anything" or "as anybody"
    if (/\bas\s+any\b(?!\w)/.test(lines[i])) {
      findings.push({
        line: i + 1,
        snippet: lines[i].trim().slice(0, 120),
        context: 'Type assertion to any',
      });
    }
    // Phase-0 fix (Bug 5): multi-line detection — `as` at end of line,
    // `any` at start of next. Prettier won't produce this, but hand-written
    // code or deliberate evasion might.
    else if (/\bas\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*any\b(?!\w)/.test(lines[i + 1])) {
      findings.push({
        line: i + 1,
        snippet: (lines[i].trim() + ' ' + lines[i + 1].trim()).slice(0, 120),
        context: 'Multi-line type assertion to any',
      });
    }
  }
  return findings;
}

function scanSilentCatch(content) {
  const findings = [];
  const lines = content.split('\n');
  // Calibration fix: match both catch (e) {} and catch {} (ES2019 optional binding).
  // Also skip `.catch(` Promise chain methods (not the catch keyword).
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?<![.\w])catch\s*(?:\(([^)]*)\)\s*)?\{/);
    if (!m) continue;
    const errVar = (m[1] || '').trim();

    // Collect the catch body
    let depth = 0;
    let started = false;
    const bodyLines = [];
    for (let j = i; j < Math.min(i + 30, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
      }
      bodyLines.push(lines[j]);
      if (started && depth === 0) break;
    }
    const body = bodyLines.slice(1, -1).join('\n').trim();

    // Calibration: distinguish truly silent catches from documented-intent ones.
    // catch { /* intentional */ } documents intent.
    // catch { continue; } and catch { break; } are loop control flow.
    const bodyRaw = bodyLines.slice(1, -1).join('\n');
    const hasComment = /\/\/|\/\*/.test(bodyRaw);
    const hasContinue = /\bcontinue\b/.test(body);
    const hasBreak = /\bbreak\b/.test(body);

    // Truly empty + no comment = silent
    if (body === '' && !hasComment) {
      findings.push({
        line: i + 1,
        snippet: lines[i].trim().slice(0, 120),
        context: 'Empty catch block with no comment or control flow',
      });
      continue;
    }

    // Has body but doesn't reference error/log/throw/return AND no documented intent
    const usesError = errVar && new RegExp(`\\b${errVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body);
    const logs = /console\.|logger\.|log\(|sentry|capture/i.test(body);
    const throws = /\bthrow\b/.test(body);
    const returns = /\breturn\b/.test(body);

    if (!usesError && !logs && !throws && !returns && !hasComment && !hasContinue && !hasBreak) {
      findings.push({
        line: i + 1,
        snippet: lines[i].trim().slice(0, 120),
        context: 'catch block does not log, throw, reference error, or document intent',
      });
    }
  }
  return findings;
}

function scanHardcodedRoute(content) {
  const findings = [];
  const lines = content.split('\n');
  // ONLY match inline route literals in app.METHOD(...) calls.
  // Excludes ROUTES.X references and const declarations.
  const routeCallRegex = /\b(?:app|router|fastify)\s*\.\s*(get|post|put|delete|patch|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip lines defining the ROUTES constant or assigning to it
    if (/^\s*(const|let|var)\s+ROUTES\s*[=:]/.test(line)) continue;
    if (/^\s*ROUTES\s*[:=]/.test(line)) continue;

    const m = line.match(routeCallRegex);
    if (!m) continue;

    findings.push({
      line: i + 1,
      snippet: line.trim().slice(0, 120),
      context: `Inline route string "${m[2]}" in ${m[1].toUpperCase()} — extract to ROUTES constant`,
    });
  }
  return findings;
}

function scanMissingTenantFilter(content) {
  const findings = [];
  const lines = content.split('\n');
  // Look for Prisma findMany/findFirst/update/delete WITHOUT companyId or tenantId in the where
  const prismaRegex = /prisma\.\w+\.(findMany|findFirst|findUnique|update|delete|deleteMany|updateMany|count|aggregate)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    if (!prismaRegex.test(lines[i])) continue;

    // Collect next 20 lines (the query options block)
    const block = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
    // Must reach a closing brace - if not in block, skip
    if (!block.includes('})')) continue;
    const queryBlock = block.slice(0, block.indexOf('})') + 2);

    if (/companyId|tenantId|orgId|where:\s*\{\s*id:/i.test(queryBlock)) continue;

    findings.push({
      line: i + 1,
      snippet: lines[i].trim().slice(0, 120),
      context: 'Prisma query without companyId/tenantId filter or specific id lookup',
    });
  }
  return findings;
}

// Phase-0 fix (Bug 6): regex for issue-tracked TODOs. These reference active
// tickets (TODO(#123), FIXME(JIRA-456)) and should NOT be flagged — they are
// tracked work, not forgotten deferred work.
const TRACKED_TODO_REGEX = /\b(TODO|FIXME)\s*\(\s*[#A-Z]+-?\d+\s*\)/;

function scanTodoComments(content) {
  const findings = [];
  const lines = content.split('\n');
  // Phase-0 fix (Bug 6): track block comment state across lines.
  // Previously only detected single-line // comments, missing:
  //   /* TODO: fix this */
  //   /** ... TODO ... */ (JSDoc)
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inside a block comment: check for TODO and track end
    if (inBlockComment) {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line) && !TRACKED_TODO_REGEX.test(line)) {
        findings.push({
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          context: 'Tracking comment in block comment',
        });
      }
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }

    // Check for block comment start on this line (outside strings)
    const blockStart = findBlockCommentStart(line);
    if (blockStart !== -1) {
      const afterBlock = line.slice(blockStart);
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(afterBlock) && !TRACKED_TODO_REGEX.test(afterBlock)) {
        findings.push({
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          context: 'Tracking comment in block comment',
        });
      }
      if (!afterBlock.includes('*/')) inBlockComment = true;
      continue;
    }

    // Single-line // comment check (existing logic)
    const commentStart = findCommentStart(line);
    if (commentStart === -1) continue;
    const commentPart = line.slice(commentStart);
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(commentPart) && !TRACKED_TODO_REGEX.test(commentPart)) {
      findings.push({
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        context: 'Tracking comment in committed code',
      });
    }
  }
  return findings;
}

/**
 * Find where a // comment starts on a line, ignoring // inside string literals.
 * Returns -1 if no comment present. Conservative — handles the common case
 * of TODO inside regex/string false positives.
 */
function findCommentStart(line) {
  let inSingle = false, inDouble = false, inBacktick = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (prev === '\\') continue;
    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick && ch === '/' && line[i + 1] === '/') {
      return i;
    }
  }
  return -1;
}

/**
 * Find where a block comment starts on a line, outside string literals.
 * Returns -1 if no block comment start found.
 */
function findBlockCommentStart(line) {
  let inSingle = false, inDouble = false, inBacktick = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (prev === '\\') continue;
    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick && ch === '/' && line[i + 1] === '*') {
      return i;
    }
  }
  return -1;
}

/**
 * Scan a set of files and return findings grouped by pattern.
 *
 * @param {string[]} filePaths - Absolute paths to changed files
 * @returns {Array<{pattern, severity, description, occurrences}>}
 */
export function scanPatterns(filePaths) {
  const groups = new Map();

  // Merge built-in patterns with learned rules from code reviews.
  // Learned rules follow the same {id, severity, description, filePattern, scan} shape.
  // Wrapped in try/catch so a bad learned rule never breaks built-in scanning.
  let allPatterns = PATTERNS;
  try {
    const learned = getLearnedPatterns();
    if (Array.isArray(learned) && learned.length > 0) {
      allPatterns = [...PATTERNS, ...learned];
    }
  } catch {
    // Learned rules failed to load — continue with built-in patterns only
  }

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }
    // Phase-0 fix (Bug 5): strip zero-width Unicode characters that could
    // hide keywords from regex detection. These 5 codepoints are never
    // legitimate in JavaScript/TypeScript source code.
    content = content.replace(/[​‌‍﻿­]/g, '');

    for (const pattern of allPatterns) {
      if (!pattern.filePattern.test(filePath)) continue;
      // Calibration fix: per-pattern skip list (e.g., silent_catch skips test files)
      if (pattern.skipPattern && pattern.skipPattern.test(filePath)) continue;

      const findings = pattern.scan(content, filePath);
      if (findings.length === 0) continue;

      if (!groups.has(pattern.id)) {
        groups.set(pattern.id, {
          pattern: pattern.id,
          severity: pattern.severity,
          description: pattern.description,
          occurrences: [],
        });
      }
      const group = groups.get(pattern.id);
      for (const finding of findings) {
        group.occurrences.push({
          file: filePath,
          line: finding.line,
          snippet: finding.snippet,
          context: finding.context,
          finding_id: `${pattern.id}:${filePath}:${finding.line}`,
        });
      }
    }
  }

  return [...groups.values()];
}

/**
 * Strip backtick template literal content (preserving line breaks) before
 * regex scanning. Test files often embed code-as-fixtures inside template
 * literals — those should not be flagged as real code.
 */
function stripTemplateLiterals(content) {
  return content.replace(/`(?:\\.|[^`\\])*`/gs, (match) => {
    const newlines = (match.match(/\n/g) || []).length;
    return '``' + '\n'.repeat(newlines);
  });
}

export { PATTERNS };
