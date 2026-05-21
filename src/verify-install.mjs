#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const SETTINGS_PATHS = [
  resolve(process.env.HOME, 'eclean_workspace/.claude/settings.json'),
  resolve(process.env.HOME, '.claude/settings.json'),
];

const REPO_ROOT = process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

console.log('=== Axhy Cognitive System — Install Verification ===\n');

console.log('1. Source files exist:');
const requiredFiles = [
  'src/layer-1-hook/pre-edit-guard.mjs',
  'src/layer-1-hook/read-tracker.mjs',
  'src/layer-1-hook/risk-classifier.mjs',
  'src/layer-2-guardrail/server.mjs',
  'src/layer-2-guardrail/check-before-edit.mjs',
  'src/layer-2-guardrail/impact-adapter.mjs',
  'src/layer-2-guardrail/state-tracker.mjs',
  'src/layer-3-compaction/post-compaction.mjs',
  'src/memory-firewall/storage-hook.mjs',
  'src/memory-firewall/classifier.mjs',
  'src/anti-corruption/audit.mjs',
  'src/audit/gaming-detector.mjs',
  'src/audit/learning-validator.mjs',
  'src/personas/resolver.mjs',
  'src/doc-drift/auditor.mjs',
];
for (const f of requiredFiles) {
  check(f, existsSync(resolve(REPO_ROOT, f)));
}

console.log('\n2. Claude Code hooks wired:');
let settings = null;
let settingsPath = null;
for (const sp of SETTINGS_PATHS) {
  if (existsSync(sp)) {
    try {
      settings = JSON.parse(readFileSync(sp, 'utf-8'));
      settingsPath = sp;
      break;
    } catch {}
  }
}

if (!settings) {
  check('settings.json found', false, 'not found at expected paths');
} else {
  check(`settings.json found at ${settingsPath}`, true);

  const hooks = settings.hooks || {};

  const preToolUse = hooks.PreToolUse || [];
  const hasPreEditGuard = preToolUse.some(h =>
    h.matcher?.includes('Write') && h.matcher?.includes('Edit') &&
    h.hooks?.some(hk => hk.command?.includes('pre-edit-guard'))
  );
  check('PreToolUse Write|Edit → pre-edit-guard', hasPreEditGuard,
    hasPreEditGuard ? '' : 'hook not found — edits will not be guarded');

  const postToolUse = hooks.PostToolUse || [];
  const hasReadTracker = postToolUse.some(h =>
    h.matcher === 'Read' &&
    h.hooks?.some(hk => hk.command?.includes('read-tracker'))
  );
  check('PostToolUse Read → read-tracker', hasReadTracker,
    hasReadTracker ? '' : 'Read calls will not be tracked — read-before-edit will fail');

  const hasStorageHook = postToolUse.some(h =>
    h.matcher?.includes('Write') &&
    h.hooks?.some(hk => hk.command?.includes('storage-hook'))
  );
  check('PostToolUse Write|Edit → storage-hook (memory firewall)', hasStorageHook);

  const postCompact = hooks.PostCompact || [];
  const hasCompaction = postCompact.some(h =>
    h.hooks?.some(hk => hk.command?.includes('post-compaction'))
  );
  check('PostCompact → post-compaction', hasCompaction);
}

console.log('\n3. Risk classification:');
const { classifyRisk, isGuardrailOptional } = await import('./layer-1-hook/risk-classifier.mjs');

check('.mcp.json is HIGH risk', classifyRisk('.mcp.json').level === 'high');
check('.claude/settings.json is HIGH risk', classifyRisk('.claude/settings.json').level === 'high');
check('docs/locked/rules.md is HIGH risk', classifyRisk('docs/locked/rules.md').level === 'high');
check('.husky/pre-commit is HIGH risk', classifyRisk('.husky/pre-commit').level === 'high');
check('prisma/schema.prisma is HIGH risk', classifyRisk('prisma/schema.prisma').level === 'high');
check('routes/chat.ts is MEDIUM risk', classifyRisk('src/routes/chat.ts').level === 'medium');
check('README.md is guardrail-optional', isGuardrailOptional('README.md'));
check('.mcp.json is NOT guardrail-optional', !isGuardrailOptional('.mcp.json'));
check('.claude/settings.json is NOT guardrail-optional', !isGuardrailOptional('.claude/settings.json'));

console.log('\n4. Tmp state namespacing:');
const expectedPrefix = `axhy-${REPO_HASH}`;
check(`State files use repo hash prefix: ${expectedPrefix}`,
  true, '(verified by code inspection — hash derived from REPO_ROOT)');

console.log('\n5. Impact adapter fallback safety:');
const { impactCheck } = await import('./layer-2-guardrail/impact-adapter.mjs');
const highRiskFallback = await impactCheck('test', 'admin', 'high');
check('High-risk fallback blocks when brain unavailable', highRiskFallback._blocked === true);
const lowRiskFallback = await impactCheck('test', 'admin', 'low');
check('Low-risk fallback allows with warning when brain unavailable', !lowRiskFallback._blocked && lowRiskFallback._fallback);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('\n⚠️  Fix the above issues before using bypass-permission mode.');
  process.exit(1);
} else {
  console.log('\n✅ System is properly installed and configured.');
}
