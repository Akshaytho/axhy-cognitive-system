#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectDiffGaming } from '../audit/gaming-detector.mjs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();

function log(tag, msg) { console.log(`[${tag}] ${msg}`); }
function fail(msg) { console.error(msg); process.exit(1); }

function hasDbUrl() {
  return !!(process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.AXHY_DB_URL);
}

async function main() {
  // 1. Graph audit (if DB available)
  if (hasDbUrl()) {
    log('pre-push', 'Running graph audit...');
    try {
      execSync('pnpm --filter @axhy/knowledge-graph graph:audit', {
        cwd: REPO_ROOT, stdio: 'inherit',
      });
    } catch {
      log('pre-push', 'Graph audit failed — orphans or dead-links detected.');
      fail('');
    }
  } else {
    log('pre-push', 'No DATABASE_URL — skipping graph audit.');
  }

  // 2. Session audit (defense in depth — catches --no-verify commits)
  const tsxCandidates = [
    join(REPO_ROOT, 'packages/ai-tools/node_modules/.bin/tsx'),
    join(REPO_ROOT, 'apps/backend/node_modules/.bin/tsx'),
    join(REPO_ROOT, 'node_modules/.bin/tsx'),
  ];
  const tsxBin = tsxCandidates.find(c => existsSync(c));
  const auditScript = join(REPO_ROOT, 'packages/ai-tools/src/session-audit.ts');

  if (tsxBin && existsSync(auditScript)) {
    log('pre-push', 'Running compliance audit...');
    try {
      execFileSync(tsxBin, [auditScript], { cwd: REPO_ROOT, stdio: 'inherit' });
      log('pre-push', 'Audit clean.');
    } catch {
      log('pre-push', 'PUSH BLOCKED — audit violations found.');
      fail('');
    }
  }

  // 3. Diff-based gaming detection
  log('pre-push', 'Scanning push diff for gaming patterns...');
  let pushDiff = '';
  try {
    const remoteRef = execSync('git rev-parse @{upstream} 2>/dev/null || echo origin/main', {
      cwd: REPO_ROOT, encoding: 'utf-8',
    }).trim();
    pushDiff = execSync(`git diff ${remoteRef}...HEAD`, {
      cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024,
    });
  } catch {}

  if (pushDiff) {
    const gaming = detectDiffGaming(pushDiff);
    for (const d of gaming.details) {
      if (d.severity === 'BLOCKER') {
        log('pre-push', `GAMING DETECTED: ${d.message}`);
        log('pre-push', 'Founder: git push --no-verify to override.');
        fail('');
      } else {
        log('pre-push', d.message);
      }
    }
  }

  log('pre-push', 'All checks passed.');
}

main().catch(err => {
  console.error(`[pre-push] Error: ${err.message}`);
  process.exit(1);
});
