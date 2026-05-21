/**
 * Quality Gate — enforces principal-engineer code standards before "done" claims.
 *
 * Called by check_before_done. Reviews every file in a slice against
 * production-grade standards. Blocks done-memo writes until quality passes.
 *
 * Grade scale:
 *   Junior (L1)       — happy path works, many gaps
 *   Mid (L2)          — solid but missing edge cases, some hardcoding
 *   Senior (L3)       — production-ready, proper error handling, tested
 *   Principal (L4)    — scalable, zero trust-boundary gaps, exemplary patterns
 *   Distinguished (L5) — teaches others, anticipates future requirements
 *
 * Required: L3+ to pass. L1/L2 = blocked with fix list.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const AXHY_V3_ROOT = process.env.AXHY_V3_ROOT || '/Users/thotaakshay/eclean_workspace/axhy-v3';

const CHECK_CATEGORIES = [
  {
    id: 'trust_boundaries',
    name: 'Trust Boundaries & Security',
    weight: 'critical',
    checks: [
      { id: 'role_check', pattern: /requireAuth|authenticate/g, antiPattern: /(?<!requireRole\([^)]*\))(?:req\.auth|auth\.user)/g, message: 'Auth check without role validation — any authenticated user can access' },
      { id: 'unsafe_cast', pattern: /as\s+(Role|UserRole|string)/g, message: 'Unsafe type cast at trust boundary — validate with Zod instead of casting' },
      { id: 'no_company_filter', pattern: /prisma\.\w+\.(findMany|findFirst|findUnique|update|delete)\(/g, antiPattern: /companyId/g, message: 'DB query without companyId filter — multi-tenant isolation gap' },
      { id: 'raw_sql_injection', pattern: /\$queryRaw`[^`]*\$\{/g, message: 'Raw SQL with interpolation — use $queryRawUnsafe with parameterized queries' },
      { id: 'no_input_validation', pattern: /req\.body\./g, antiPattern: /parse|safeParse|validate/g, message: 'Direct req.body access without Zod validation' },
    ],
  },
  {
    id: 'transaction_safety',
    name: 'Transaction Safety & Race Conditions',
    weight: 'critical',
    checks: [
      { id: 'multi_query_no_tx', message: 'Multiple related DB queries without transaction wrapping' },
      { id: 'no_row_lock', message: 'State read + write without SELECT FOR UPDATE — lost-update race possible' },
      { id: 'fire_and_forget', pattern: /\.then\(\s*\)\s*\.catch\(\s*\)/g, message: 'Fire-and-forget async — errors silently swallowed' },
    ],
  },
  {
    id: 'error_handling',
    name: 'Error Handling & Resilience',
    weight: 'high',
    checks: [
      { id: 'unhandled_async', pattern: /async\s+function|=>\s*\{[^}]*await\b/g, antiPattern: /try\s*\{|\.catch\(/g, message: 'Async function without try/catch or .catch()' },
      { id: 'empty_catch', pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g, message: 'Empty catch block — errors silently swallowed' },
      { id: 'no_loading_state', message: 'Async UI action without loading/disabled state — double-tap risk' },
      { id: 'no_error_feedback', message: 'Error caught but no user-visible feedback (toast, alert, error state)' },
    ],
  },
  {
    id: 'hardcoding',
    name: 'No Hardcoding',
    weight: 'high',
    checks: [
      { id: 'hardcoded_route', pattern: /['"`]\/(auth|worker|supervisor)\//g, message: 'Hardcoded route path — use a ROUTES constant map' },
      { id: 'hardcoded_role', pattern: /['"`](WORKER|SUPERVISOR|OWNER|HR|ADMIN)['"`]/g, antiPattern: /enum|const|type|import/g, message: 'Hardcoded role string — use Role enum/constant' },
      { id: 'magic_number', pattern: /:\s*\d{2,4}[,;}\s]/g, antiPattern: /tokens\.|spacing\.|fontSize|lineHeight|fontWeight|flex:|zIndex:|opacity:|elevation:/g, message: 'Magic number — use token or named constant' },
      { id: 'hardcoded_url', pattern: /['"`]https?:\/\/[^'"`]+['"`]/g, antiPattern: /env|config|process\./g, message: 'Hardcoded URL — use environment config' },
      { id: 'hardcoded_timeout', pattern: /setTimeout\([^,]+,\s*\d+\)/g, antiPattern: /const|TIMEOUT|_MS/g, message: 'Hardcoded timeout value — use named constant' },
    ],
  },
  {
    id: 'state_machine_discipline',
    name: 'State Machine Discipline',
    weight: 'critical',
    checks: [
      { id: 'direct_state_update', pattern: /prisma\.\w+\.update\(\s*\{[^}]*(?:state|status)\s*:/g, message: 'Direct DB state/status update — must go through machine transition function' },
      { id: 'hardcoded_state_value', pattern: /(?:state|status)\s*[:=]\s*['"`](ACTIVE|PENDING|COMPLETED|CANCELLED|APPROVED|REJECTED)/gi, antiPattern: /machine|transition|actor|send|assert|expect|test|describe/g, message: 'Hardcoded state value — derive from machine transition result' },
    ],
  },
  {
    id: 'performance',
    name: 'Performance & Scalability',
    weight: 'medium',
    checks: [
      { id: 'n_plus_one', message: 'Potential N+1 query — fetching related records in a loop' },
      { id: 'missing_index', message: 'Query on non-indexed column used in WHERE clause' },
      { id: 'unnecessary_rerender', pattern: /useEffect\(\s*\(\)\s*=>\s*\{[^}]*setState/g, message: 'useEffect setting state on every render — potential infinite loop or unnecessary re-render' },
    ],
  },
  {
    id: 'test_quality',
    name: 'Test Quality',
    weight: 'high',
    checks: [
      { id: 'happy_path_only', message: 'Only happy-path tests — missing error/edge case coverage' },
      { id: 'no_auth_test', message: 'Protected route without unauthorized-access test' },
      { id: 'no_race_test', message: 'Concurrent-safe code without race condition test' },
      { id: 'real_timer_in_test', pattern: /setTimeout|new Promise.*resolve.*\d{3,}/g, message: 'Real timer wait in test — use fake timers for speed' },
      { id: 'unsafe_test_cast', pattern: /as\s+unknown\s+as/g, message: 'Double cast in test — bypasses type safety, tests may miss runtime errors' },
    ],
  },
  {
    id: 'production_readiness',
    name: 'Production Readiness',
    weight: 'high',
    checks: [
      { id: 'no_monitoring', message: 'Error path without monitoring (Sentry, metrics, structured log with level=error)' },
      { id: 'no_graceful_degradation', message: 'External service call without timeout/retry/fallback' },
      { id: 'missing_http_status', message: 'Error response without appropriate HTTP status code' },
      { id: 'console_log', pattern: /console\.(log|debug|info)\(/g, antiPattern: /test|spec|\.test\./g, message: 'console.log in production code — use structured logger' },
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture & Scalability',
    weight: 'medium',
    checks: [
      { id: 'circular_import', message: 'Circular import detected — breaks dependency direction' },
      { id: 'god_function', message: 'Function >50 lines — split into smaller focused functions' },
      { id: 'tight_coupling', message: 'Direct dependency on implementation detail — use interface/abstraction' },
    ],
  },
];

export function runPatternChecks(fileContent, filePath, isTestFile = false) {
  const findings = [];

  for (const category of CHECK_CATEGORIES) {
    for (const check of category.checks) {
      if (!check.pattern) continue;
      if (isTestFile && ['hardcoded_route', 'hardcoded_role', 'magic_number', 'console_log'].includes(check.id)) continue;

      check.pattern.lastIndex = 0;
      const matches = [];
      let match;
      while ((match = check.pattern.exec(fileContent)) !== null) {
        const beforeMatch = fileContent.slice(0, match.index);
        const lineNum = beforeMatch.split('\n').length;
        matches.push({ text: match[0], line: lineNum });
      }

      if (matches.length === 0) continue;

      if (check.antiPattern) {
        const contextLines = fileContent.split('\n');
        const filtered = matches.filter(m => {
          const start = Math.max(0, m.line - 3);
          const end = Math.min(contextLines.length, m.line + 2);
          const context = contextLines.slice(start, end).join('\n');
          check.antiPattern.lastIndex = 0;
          return !check.antiPattern.test(context);
        });
        if (filtered.length === 0) continue;
        findings.push({
          category: category.id,
          categoryName: category.name,
          weight: category.weight,
          checkId: check.id,
          message: check.message,
          file: filePath,
          occurrences: filtered.map(m => ({ line: m.line, text: m.text })),
          count: filtered.length,
        });
      } else {
        findings.push({
          category: category.id,
          categoryName: category.name,
          weight: category.weight,
          checkId: check.id,
          message: check.message,
          file: filePath,
          occurrences: matches.map(m => ({ line: m.line, text: m.text })),
          count: matches.length,
        });
      }
    }
  }

  return findings;
}

export function gradeFindings(findings) {
  const criticals = findings.filter(f => f.weight === 'critical').length;
  const highs = findings.filter(f => f.weight === 'high').length;
  const mediums = findings.filter(f => f.weight === 'medium').length;

  if (criticals >= 3) return { grade: 'L1', label: 'Junior', pass: false, reason: `${criticals} critical issues — fundamental gaps at trust boundaries` };
  if (criticals >= 1) return { grade: 'L2', label: 'Mid-level', pass: false, reason: `${criticals} critical + ${highs} high issues — solid start but not production-safe` };
  if (highs >= 4) return { grade: 'L2', label: 'Mid-level', pass: false, reason: `${highs} high issues — needs hardening before production` };
  if (highs >= 1) return { grade: 'L3', label: 'Senior', pass: true, reason: `${highs} high issues remaining — production-capable with known risks` };
  if (mediums >= 3) return { grade: 'L3', label: 'Senior', pass: true, reason: `Clean on critical/high but ${mediums} medium issues — solid work` };
  if (mediums >= 1) return { grade: 'L4', label: 'Principal', pass: true, reason: `Only ${mediums} medium issues — exemplary engineering` };
  return { grade: 'L5', label: 'Distinguished', pass: true, reason: 'Zero issues detected — exceptional quality' };
}

export function auditSliceFiles(filePaths) {
  const allFindings = [];

  for (const fp of filePaths) {
    const fullPath = fp.startsWith('/') ? fp : resolve(AXHY_V3_ROOT, fp);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');
    const isTest = /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(fp);
    const findings = runPatternChecks(content, fp, isTest);
    allFindings.push(...findings);
  }

  const grade = gradeFindings(allFindings);

  return {
    findings: allFindings,
    grade,
    summary: {
      critical: allFindings.filter(f => f.weight === 'critical').length,
      high: allFindings.filter(f => f.weight === 'high').length,
      medium: allFindings.filter(f => f.weight === 'medium').length,
      low: allFindings.filter(f => f.weight === 'low').length,
      total: allFindings.length,
      filesChecked: filePaths.length,
    },
  };
}

export { CHECK_CATEGORIES };
