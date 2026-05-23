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
    severity: 'blocker',
    description: 'catch block that swallows errors without logging or re-throwing',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
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
  const lines = content.split('\n');
  // Match async function declarations or async arrow functions
  const asyncFnRegex = /^(\s*)(?:export\s+)?(?:async\s+function\s+(\w+)|const\s+(\w+)\s*[:=]\s*async\s*(?:\([^)]*\)|\w+)\s*=>|async\s+(\w+)\s*\([^)]*\)\s*\{)/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(asyncFnRegex);
    if (!m) continue;
    const fnName = m[2] || m[3] || m[4] || 'anonymous';
    const indent = m[1].length;

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

    // Skip if body has try/catch ANYWHERE — fixes the "try not first statement" false positive
    if (/\btry\s*\{/.test(body) && /\bcatch\s*\(/.test(body)) continue;

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
  }
  return findings;
}

function scanSilentCatch(content) {
  const findings = [];
  const lines = content.split('\n');
  // Find catch { ... } blocks
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/catch\s*\(([^)]*)\)\s*\{/);
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

    // Empty catch is silent
    if (body === '') {
      findings.push({
        line: i + 1,
        snippet: lines[i].trim().slice(0, 120),
        context: 'Empty catch block',
      });
      continue;
    }

    // Catch that doesn't reference the error variable, log, throw, or return error
    const usesError = errVar && new RegExp(`\\b${errVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body);
    const logs = /console\.|logger\.|log\(|sentry|capture/i.test(body);
    const throws = /\bthrow\b/.test(body);
    const returns = /\breturn\b/.test(body);

    if (!usesError && !logs && !throws && !returns) {
      findings.push({
        line: i + 1,
        snippet: lines[i].trim().slice(0, 120),
        context: 'catch block does not log, throw, or reference error',
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

function scanTodoComments(content) {
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(lines[i])) {
      findings.push({
        line: i + 1,
        snippet: lines[i].trim().slice(0, 120),
        context: 'Tracking comment in committed code',
      });
    }
  }
  return findings;
}

/**
 * Scan a set of files and return findings grouped by pattern.
 *
 * @param {string[]} filePaths - Absolute paths to changed files
 * @returns {Array<{pattern, severity, description, occurrences}>}
 */
export function scanPatterns(filePaths) {
  const groups = new Map();

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }

    for (const pattern of PATTERNS) {
      if (!pattern.filePattern.test(filePath)) continue;

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

export { PATTERNS };
