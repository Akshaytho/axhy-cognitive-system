/**
 * Review-Learning Rules — converts code review findings into permanent
 * scanner rules that prevent the same class of bug from recurring.
 *
 * This module is the feedback loop between code reviews and automated
 * enforcement. When a code review finds a systemic pattern (not a one-off
 * typo), the reviewer adds a rule here. pattern-scanner.mjs imports these
 * rules and merges them into the main PATTERNS array.
 *
 * Shape: each rule follows the same {id, severity, description, filePattern,
 * skipPattern?, scan} interface as PATTERNS in pattern-scanner.mjs.
 *
 * Origin tracking: every rule has a `source` field pointing to the review
 * that spawned it, so the founder can trace why a rule exists.
 */

/**
 * LEARNED_RULES — each entry was born from a real code review finding.
 * Add new rules here when a review reveals a systemic pattern.
 */
const LEARNED_RULES = [
  {
    id: 'id-type-mismatch-in-call',
    severity: 'warning',
    description: 'Variable named "userId" passed to a parameter expecting "workerId" (or vice versa) — likely entity-type mismatch',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
    skipPattern: /\.test\.(ts|tsx|mjs|js|jsx)$|\/tests?\//,
    source: '2026-05-24-product-code-review.md — CRIT-1: R2 key uses userId instead of workerId',
    scan: scanIdTypeMismatchInCall,
  },
  {
    id: 'unsafe-role-cast',
    severity: 'warning',
    description: 'String cast to role/enum type without validation — bypasses type safety at runtime',
    filePattern: /\.(ts|tsx)$/,
    skipPattern: /\.test\.(ts|tsx)$|\/tests?\//,
    source: '2026-05-24-product-code-review.md — HIGH-3: role strings cast without Zod/enum validation',
    scan: scanUnsafeRoleCast,
  },
  {
    id: 'fetch-no-timeout',
    severity: 'warning',
    description: 'fetch() or axios() call without explicit timeout — can hang indefinitely on mobile networks',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
    skipPattern: /\.test\.(ts|tsx|mjs|js|jsx)$|\/tests?\/|\.config\./,
    source: '2026-05-24-product-code-review.md — HIGH-7: API calls without timeout on mobile',
    scan: scanFetchNoTimeout,
  },
  {
    id: 'setinterval-async',
    severity: 'blocker',
    description: 'Async function inside setInterval — unbounded concurrent invocations if interval < execution time',
    filePattern: /\.(ts|tsx|mjs|js|jsx)$/,
    skipPattern: /\.test\.(ts|tsx|mjs|js|jsx)$|\/tests?\//,
    source: '2026-05-24-product-code-review.md — CRIT-5: async-in-setInterval unbounded concurrency',
    scan: scanSetIntervalAsync,
  },
  {
    id: 'unhandled-promise-in-useeffect',
    severity: 'warning',
    description: 'Async call in useEffect without .catch() or try/catch — unhandled rejection crashes React',
    filePattern: /\.(tsx|jsx)$/,
    skipPattern: /\.test\.(tsx|jsx)$|\/tests?\//,
    source: '2026-05-24-product-code-review.md — CRIT-6: PhasePhotoCapture throws to nowhere',
    scan: scanUnhandledPromiseInUseEffect,
  },
];

// ── Scan implementations ──

/**
 * Detects calls like `uploadPhoto({ userId: ... })` where the parameter
 * name suggests one entity type but the variable passed is another.
 *
 * Common mismatch pairs: userId↔workerId, companyId↔tenantId
 */
function scanIdTypeMismatchInCall(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  // Pairs of entity IDs that should never be swapped
  const mismatchPairs = [
    { param: /workerId\s*[:=]/, value: /\buserId\b/, desc: 'userId passed as workerId' },
    { param: /userId\s*[:=]/, value: /\bworkerId\b/, desc: 'workerId passed as userId' },
    { param: /companyId\s*[:=]/, value: /\btenantId\b/, desc: 'tenantId passed as companyId' },
    { param: /tenantId\s*[:=]/, value: /\bcompanyId\b/, desc: 'companyId passed as tenantId' },
    { param: /supervisorId\s*[:=]/, value: /\bworkerId\b/, desc: 'workerId passed as supervisorId' },
    { param: /workerId\s*[:=]/, value: /\bsupervisorId\b/, desc: 'supervisorId passed as workerId' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and type definitions
    if (/^\s*(\/\/|\/\*|\*|type\s|interface\s)/.test(line)) continue;

    for (const pair of mismatchPairs) {
      if (pair.param.test(line) && pair.value.test(line)) {
        findings.push({
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          context: pair.desc,
        });
      }
    }
  }
  return findings;
}

/**
 * Detects `as Role`, `as UserRole`, or similar enum casts from string
 * without Zod validation or enum check. Safe patterns like
 * `Role[value]` or `z.nativeEnum(Role).parse(value)` are excluded.
 */
function scanUnsafeRoleCast(content, filePath) {
  const findings = [];
  const lines = content.split('\n');
  // Match "as SomeRole" or "as SomeType" where the type name ends in Role/Type/Status/Kind
  const castRegex = /\bas\s+([\w]+(?:Role|Type|Status|Kind))\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip type definitions and imports
    if (/^\s*(type\s|interface\s|import\s|export\s+type)/.test(line)) continue;
    // Skip if line has Zod validation
    if (/z\.\w+|\.parse\(|\.safeParse\(|nativeEnum/.test(line)) continue;

    const m = line.match(castRegex);
    if (!m) continue;

    // Check surrounding context (2 lines above) for validation
    const context = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
    if (/z\.\w+|\.parse\(|\.safeParse\(|nativeEnum|Object\.values\(/.test(context)) continue;

    findings.push({
      line: i + 1,
      snippet: line.trim().slice(0, 120),
      context: `Unsafe cast to ${m[1]} without validation`,
    });
  }
  return findings;
}

/**
 * Detects fetch() or axios calls without a timeout option.
 * Mobile networks can hang for minutes — every external call needs a timeout.
 */
function scanFetchNoTimeout(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;

    // Check for fetch() calls
    if (/\bfetch\s*\(/.test(line)) {
      // Look at the next 10 lines for the options object
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      // Skip if AbortController/signal/timeout is present
      if (/AbortController|signal\s*:|timeout|AbortSignal\.timeout/.test(block)) continue;
      // Skip if it's a type definition or import
      if (/^\s*(type|interface|import)\s/.test(line)) continue;

      findings.push({
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        context: 'fetch() without timeout/AbortController — can hang on slow networks',
      });
    }

    // Check for axios calls without timeout
    if (/\baxios\s*\.\s*(get|post|put|patch|delete|request)\s*\(/.test(line) || /\baxios\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      if (/timeout\s*:/.test(block)) continue;

      findings.push({
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        context: 'axios call without timeout option — can hang on slow networks',
      });
    }
  }
  return findings;
}

/**
 * Detects async functions or await expressions inside setInterval callbacks.
 * If the async work takes longer than the interval, multiple invocations
 * pile up unbounded.
 */
function scanSetIntervalAsync(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match setInterval with async callback
    if (/\bsetInterval\s*\(\s*async\b/.test(line)) {
      findings.push({
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        context: 'async function in setInterval — use setTimeout chain or queue instead',
      });
      continue;
    }

    // Match setInterval where the callback body contains await
    if (/\bsetInterval\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
      // Find the callback body
      let depth = 0;
      let started = false;
      let callbackEnd = -1;
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === '(' || ch === '{') { depth++; started = true; }
          if (ch === ')' || ch === '}') depth--;
        }
        if (started && depth <= 0) { callbackEnd = j; break; }
      }
      if (callbackEnd > i) {
        const callbackBody = lines.slice(i, callbackEnd + 1).join('\n');
        if (/\bawait\s+/.test(callbackBody)) {
          findings.push({
            line: i + 1,
            snippet: line.trim().slice(0, 120),
            context: 'setInterval callback contains await — unbounded concurrency risk',
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Detects async calls inside useEffect without error handling.
 * Pattern: useEffect(() => { someAsyncFn(); }, [...]) where
 * someAsyncFn has no .catch() and no surrounding try/catch.
 */
function scanUnhandledPromiseInUseEffect(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\buseEffect\s*\(/.test(line)) continue;

    // Collect the useEffect body (up to 30 lines)
    const bodyLines = [];
    let depth = 0;
    let started = false;
    for (let j = i; j < Math.min(i + 30, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === '(' || ch === '{') { depth++; started = true; }
        if (ch === ')' || ch === '}') depth--;
      }
      bodyLines.push(lines[j]);
      if (started && depth <= 0) break;
    }
    const body = bodyLines.join('\n');

    // Skip if no async work in the effect
    if (!/\bawait\s+/.test(body) && !/\.\s*then\s*\(/.test(body)) continue;

    // Check for error handling
    const hasCatch = /\.catch\s*\(/.test(body);
    const hasTryCatch = /\btry\s*\{/.test(body) && /\bcatch\s*[({]/.test(body);

    if (!hasCatch && !hasTryCatch) {
      findings.push({
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        context: 'useEffect with async work but no .catch() or try/catch — unhandled rejection',
      });
    }
  }
  return findings;
}

/**
 * Returns learned rules in the same shape as PATTERNS in pattern-scanner.mjs,
 * ready to be merged into the main scan loop.
 */
export function getLearnedPatterns() {
  return LEARNED_RULES.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    description: rule.description,
    filePattern: rule.filePattern,
    skipPattern: rule.skipPattern,
    scan: rule.scan,
  }));
}

export { LEARNED_RULES };
