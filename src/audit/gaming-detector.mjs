import { execFileSync } from 'node:child_process';

// Only WILDCARD-BYPASS tags count toward the gaming-detection budget.
// Design-intent tags (such as raw-ok, stream-ok, learned-ok, auth-exempt,
// tenant-exempt) document approved departures and are not gaming. This
// list mirrors packages/ai-tools/src/session-audit.ts SKIP_PATTERNS.
const SKIP_PATTERNS = [
  '// audit-ok',
  '// budget-exempt',
  '// apply-ok',
];

const GAMING_KEYWORDS = [
  { pattern: '//.*\\$executeRaw\\|//.*\\$queryRaw', label: '$executeRaw/$queryRaw in comments', threshold: 6 },
  { pattern: '//.*assertWithinBudget', label: 'assertWithinBudget in comments', threshold: 4 },
];

function grep(pattern, dirs, exts) {
  const args = ['-rn', '-E'];
  for (const e of exts) args.push(`--include=*${e}`);
  args.push(pattern);
  args.push(...dirs);
  try {
    return execFileSync('grep', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
      .trim().split('\n')
      .filter(l => l && !l.includes('node_modules') && !l.includes('/dist/') && !l.includes('session-audit.ts'));
  } catch (err) {
    if (err.status === 1) return [];
    return [];
  }
}

export function detectSkipBudget(repoRoot) {
  let totalSkips = 0;
  const details = [];

  for (const pat of SKIP_PATTERNS) {
    const grepPat = pat.replace('// ', '//\\s*');
    const hits = grep(grepPat, [`${repoRoot}/apps`, `${repoRoot}/packages`], ['.ts', '.tsx']);
    totalSkips += hits.length;
  }

  if (totalSkips > 15) {
    details.push({ severity: 'BLOCKER', message: `${totalSkips} audit-skip comments (budget: 15). Remove skips and fix real violations.` });
  } else if (totalSkips > 8) {
    details.push({ severity: 'HIGH', message: `${totalSkips} audit-skip comments (warning at 8). Review each skip.` });
  }

  return { totalSkips, budget: 15, details };
}

export function detectCommentGaming(repoRoot) {
  const details = [];
  for (const kw of GAMING_KEYWORDS) {
    const hits = grep(kw.pattern, [`${repoRoot}/apps/backend/src`], ['.ts']);
    const filtered = hits.filter(h => !h.includes('.test.') && !h.includes('@derives'));
    if (filtered.length > kw.threshold) {
      details.push({
        severity: 'MEDIUM',
        message: `${kw.label}: ${filtered.length} occurrences (threshold ${kw.threshold}). Review for evasion.`,
      });
    }
  }
  return details;
}

export function detectDiffGaming(pushDiff) {
  if (!pushDiff) return { newSkips: 0, commentTricks: 0, details: [] };
  const details = [];

  const addedLines = pushDiff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const newSkips = addedLines.filter(l =>
    SKIP_PATTERNS.some(p => l.includes(p))
  ).length;

  if (newSkips > 5) {
    details.push({ severity: 'BLOCKER', message: `${newSkips} new audit-skip comments in this push. Gaming detected.` });
  } else if (newSkips > 0) {
    details.push({ severity: 'INFO', message: `${newSkips} new skip comments. Review in PR.` });
  }

  const commentTricks = addedLines.filter(l =>
    /^\+\s*\/\//.test(l) &&
    /\$executeRaw|\$queryRaw|assertWithinBudget|withTenantContext|rateLimit|semaphore/.test(l)
  ).length;

  if (commentTricks > 3) {
    details.push({ severity: 'MEDIUM', message: `${commentTricks} new comments contain audit keywords. Possible evasion.` });
  }

  return { newSkips, commentTricks, details };
}
