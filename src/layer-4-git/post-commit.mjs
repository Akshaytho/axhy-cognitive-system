#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const BRAIN_LOCK = '/tmp/axhy-brain-rebuilding.lock';
const GRAPH_LOG = '/tmp/axhy-graph-build.log';
const BRAIN_LOG = '/tmp/axhy-brain-build.log';

function log(tag, msg) { console.log(`[${tag}] ${msg}`); }

function hasDbUrl() {
  return !!(process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || process.env.AXHY_DB_URL);
}

const BRAIN_STALE_MARKER = '/tmp/axhy-brain-stale-since.txt';

async function main() {
  if (!hasDbUrl()) {
    log('post-commit', 'No DATABASE_URL set — skipping graph + brain rebuild.');
    // Loud-not-silent: write a marker file so the next boot can warn that
    // the brain is behind code. Boot procedure reads this and surfaces a
    // "BRAIN STALE since commit X — run brain:build before relying on
    // impact_search" message to the next embodiment.
    try {
      const commitSha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
      writeFileSync(BRAIN_STALE_MARKER, `${Date.now()},${commitSha}\n`);
      log('post-commit', `Wrote brain-stale marker (${BRAIN_STALE_MARKER}) for commit ${commitSha.slice(0, 7)}.`);
    } catch (err) {
      // Marker write failed — don't block commit, just continue. The
      // silent-skip behavior is preserved as the worst-case fallback.
    }
    return;
  }
  // Brain is being rebuilt — clear any stale marker from prior skipped commits.
  try { unlinkSync(BRAIN_STALE_MARKER); } catch {}

  // Write lock file so impact-adapter knows brain is rebuilding
  writeFileSync(BRAIN_LOCK, JSON.stringify({ started: Date.now(), pid: process.pid }));

  // Graph rebuild in background
  try {
    execSync(`pnpm --filter @axhy/knowledge-graph graph:build > ${GRAPH_LOG} 2>&1 &`, {
      cwd: REPO_ROOT, shell: true,
    });
    log('post-commit', `Graph rebuild dispatched (log: ${GRAPH_LOG})`);
  } catch {
    log('post-commit', 'Graph rebuild failed to start.');
  }

  // Brain rebuild in background — remove lock when done
  try {
    execSync(`(pnpm --filter @axhy/ai-tools brain:build > ${BRAIN_LOG} 2>&1; rm -f ${BRAIN_LOCK}) &`, {
      cwd: REPO_ROOT, shell: true,
    });
    log('post-commit', `Brain rebuild dispatched (log: ${BRAIN_LOG})`);
    log('post-commit', 'Lock file written — impactCheck will wait until rebuild completes.');
  } catch {
    // Clean up lock if spawn failed
    if (existsSync(BRAIN_LOCK)) unlinkSync(BRAIN_LOCK);
    log('post-commit', 'Brain rebuild failed to start.');
  }
}

main().catch(err => {
  if (existsSync(BRAIN_LOCK)) unlinkSync(BRAIN_LOCK);
  console.error(`[post-commit] Error: ${err.message}`);
});
