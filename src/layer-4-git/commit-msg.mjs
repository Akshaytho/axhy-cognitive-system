#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateCommitMessage, validateLearningFrontmatter, validatePatternReach } from '../audit/learning-validator.mjs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();

function log(tag, msg) { console.log(`[${tag}] ${msg}`); }
function fail(msg) { console.error(msg); process.exit(1); }

async function main() {
  const messageFile = process.argv[2];
  if (!messageFile) {
    process.exit(0);
    return;
  }

  // Find staged learning files
  let stagedLearnings = [];
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--', 'docs/learnings/*.md'], {
      cwd: REPO_ROOT, encoding: 'utf-8',
    }).trim();
    if (out) {
      stagedLearnings = out.split('\n').filter(f => f && !f.includes('README.md'));
    }
  } catch {}

  if (stagedLearnings.length === 0) {
    process.exit(0);
    return;
  }

  // 1. Commit message must reference rule break
  const msgCheck = validateCommitMessage(messageFile, stagedLearnings);
  if (!msgCheck.valid) {
    log('learning', msgCheck.reason);
    log('learning', `Staged: ${stagedLearnings.join(', ')}`);
    fail('');
  }

  // 2. Every learning must have check_pattern frontmatter
  const missingFm = [];
  for (const lf of stagedLearnings) {
    const fullPath = join(REPO_ROOT, lf);
    if (!existsSync(fullPath)) continue;
    const fmCheck = validateLearningFrontmatter(fullPath);
    if (!fmCheck.valid) {
      missingFm.push({ file: lf, reason: fmCheck.reason });
    }
  }

  if (missingFm.length > 0) {
    log('learning', 'BLOCKED: Learning files missing required frontmatter:');
    for (const m of missingFm) {
      log('learning', `  ${m.file}: ${m.reason}`);
    }
    log('learning', 'Add: check_pattern, check_paths, check_expect to frontmatter.');
    fail('');
  }

  // 3. Anti-gaming: verify pattern matches real code (1-30 files)
  const patternIssues = [];
  for (const lf of stagedLearnings) {
    const fullPath = join(REPO_ROOT, lf);
    if (!existsSync(fullPath)) continue;
    const reach = validatePatternReach(fullPath, REPO_ROOT);
    if (!reach.valid) {
      patternIssues.push({ file: lf, reason: reach.reason });
    }
  }

  if (patternIssues.some(p => p.reason.includes('0 files'))) {
    log('learning', 'BLOCKED: Learning patterns match zero files:');
    for (const p of patternIssues.filter(p => p.reason.includes('0 files'))) {
      log('learning', `  ${p.file}: ${p.reason}`);
    }
    fail('');
  }

  for (const p of patternIssues.filter(p => p.reason.includes('too broad'))) {
    log('learning', `WARNING: ${p.file}: ${p.reason}`);
  }

  log('learning', 'Rule-breaking disclosure + valid detection patterns verified.');
}

main().catch(err => {
  console.error(`[commit-msg] Error: ${err.message}`);
  process.exit(1);
});
