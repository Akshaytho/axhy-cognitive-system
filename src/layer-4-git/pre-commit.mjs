#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkPersonaDocChanges } from '../audit/persona-doc-guard.mjs';
import { findLearningWarnings } from '../audit/learning-validator.mjs';

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();

function log(tag, msg) { console.log(`[${tag}] ${msg}`); }
function fail(msg) { console.error(msg); process.exit(1); }

async function main() {
  // 1. lint-staged
  try {
    execSync('pnpm exec lint-staged', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    fail('[lint] lint-staged failed.');
  }

  // 2. Persona doc guard (replaces old locked doc guard)
  const personaCheck = checkPersonaDocChanges(REPO_ROOT);
  if (!personaCheck.allowed) {
    log('persona', `BLOCKED: ${personaCheck.reason}`);
    if (personaCheck.modified?.length) {
      log('persona', `Modified: ${personaCheck.modified.join(', ')}`);
    }
    if (personaCheck.added?.length) {
      log('persona', `New: ${personaCheck.added.join(', ')}`);
    }
    if (personaCheck.missingAmendment?.length) {
      log('persona', `Missing amendment: ${personaCheck.missingAmendment.join(', ')}`);
    }
    log('persona', personaCheck.fix);
    fail('');
  }

  // 3. Also guard docs/locked/ (backward compat until fully migrated to personas)
  try {
    const lockedMod = execFileSync('git', ['diff', '--cached', '--diff-filter=MA', '--name-only', '--', 'docs/locked/*.md'], {
      cwd: REPO_ROOT, encoding: 'utf-8',
    }).trim();
    if (lockedMod && process.env.AXHY_FOUNDER_APPROVED !== '1') {
      log('locked', 'BLOCKED: Changes to docs/locked/ require founder approval.');
      log('locked', `Files: ${lockedMod}`);
      log('locked', 'AXHY_FOUNDER_APPROVED=1 git commit ...');
      fail('');
    }
  } catch {}

  // 4. Session audit (calls the existing session-audit.ts)
  if (process.env.AXHY_AUDIT_EMERGENCY === '1') {
    log('audit', 'EMERGENCY OVERRIDE — audit skipped.');
  } else {
    const tsxCandidates = [
      join(REPO_ROOT, 'packages/ai-tools/node_modules/.bin/tsx'),
      join(REPO_ROOT, 'apps/backend/node_modules/.bin/tsx'),
      join(REPO_ROOT, 'node_modules/.bin/tsx'),
    ];
    const tsxBin = tsxCandidates.find(c => existsSync(c));
    const auditScript = join(REPO_ROOT, 'packages/ai-tools/src/session-audit.ts');

    if (tsxBin && existsSync(auditScript)) {
      log('audit', 'Running compliance audit...');
      try {
        execFileSync(tsxBin, [auditScript], { cwd: REPO_ROOT, stdio: 'inherit' });
        log('audit', 'All checks passed.');
      } catch (err) {
        log('audit', 'COMMIT BLOCKED — fix violations above.');
        log('audit', 'False positive? Add "// audit-ok" comment.');
        log('audit', 'Emergency? AXHY_AUDIT_EMERGENCY=1 git commit ...');
        fail('');
      }
    } else {
      log('audit', 'tsx or session-audit.ts not found — skipping.');
    }
  }

  // 5. Learning warnings for staged files
  let stagedFiles = [];
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: REPO_ROOT, encoding: 'utf-8',
    }).trim();
    if (out) stagedFiles = out.split('\n').filter(Boolean);
  } catch {}

  const learningDir = join(REPO_ROOT, 'docs/learnings');
  if (stagedFiles.length > 0 && existsSync(learningDir)) {
    const warnings = findLearningWarnings(stagedFiles, learningDir);
    if (warnings.length > 0) {
      log('audit', 'LEARNING WARNINGS for staged files:');
      for (const w of warnings) {
        log('audit', `  ${w.file} → ${w.rule} (${w.learning})`);
      }
      log('audit', 'Review these learnings before proceeding.');
    }
  }

  log('pre-commit', 'All checks passed.');
}

main().catch(err => {
  console.error(`[pre-commit] Error: ${err.message}`);
  process.exit(1);
});
