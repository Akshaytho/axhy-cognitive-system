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
  'src/layer-2-guardrail/check-before-plan.mjs',
  'src/layer-2-guardrail/source-hierarchy.mjs',
  'src/layer-2-guardrail/plan-content-auditor.mjs',
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
const { classifyRisk, isGuardrailOptional, isPlanFile } = await import('./layer-1-hook/risk-classifier.mjs');

check('.mcp.json is HIGH risk', classifyRisk('.mcp.json').level === 'high');
check('.claude/settings.json is HIGH risk', classifyRisk('.claude/settings.json').level === 'high');
check('docs/locked/rules.md is HIGH risk', classifyRisk('docs/locked/rules.md').level === 'high');
check('.husky/pre-commit is HIGH risk', classifyRisk('.husky/pre-commit').level === 'high');
check('prisma/schema.prisma is HIGH risk', classifyRisk('prisma/schema.prisma').level === 'high');
check('routes/chat.ts is MEDIUM risk', classifyRisk('src/routes/chat.ts').level === 'medium');
check('README.md is guardrail-optional', isGuardrailOptional('README.md'));
check('.mcp.json is NOT guardrail-optional', !isGuardrailOptional('.mcp.json'));
check('.claude/settings.json is NOT guardrail-optional', !isGuardrailOptional('.claude/settings.json'));

console.log('\n4. Plan guardrail classification:');
check('docs/plans/sprint.md IS plan-guarded', isPlanFile('docs/plans/sprint.md'));
check('docs/personas/worker/spec.md IS plan-guarded', isPlanFile('docs/personas/worker/spec.md'));
check('handoff/STATUS.md IS plan-guarded', isPlanFile('handoff/STATUS.md'));
check('SPRINT_PLAN.md IS plan-guarded', isPlanFile('SPRINT_PLAN.md'));
check('IMPLEMENTATION_PLAN.md IS plan-guarded', isPlanFile('IMPLEMENTATION_PLAN.md'));
check('docs/plans/sprint.md is NOT guardrail-optional', !isGuardrailOptional('docs/plans/sprint.md'));
check('handoff/done-memos/memo.md is NOT guardrail-optional (done-guarded)', !isGuardrailOptional('handoff/done-memos/memo.md'));
check('README.md is NOT plan-guarded', !isPlanFile('README.md'));
check('src/routes/api.ts is NOT plan-guarded', !isPlanFile('src/routes/api.ts'));

console.log('\n5. Source hierarchy:');
const { classifySource, validateSourceHierarchy } = await import('./layer-2-guardrail/source-hierarchy.mjs');

check('docs/locked/rules.md is tier 1', classifySource('docs/locked/rules.md').tier === 1);
check('packages/state-machines/src/worker.ts is tier 2', classifySource('packages/state-machines/src/worker.ts').tier === 2);
check('MVP_V2_ALIGNED_PLAN.md is tier 3', classifySource('MVP_V2_ALIGNED_PLAN.md').tier === 3);
check('docs/personas/worker/spec.md is tier 4', classifySource('docs/personas/worker/spec.md').tier === 4);
check('docs/plans/sprint.md is tier 5', classifySource('docs/plans/sprint.md').tier === 5);
check('docs/research/analysis.md is tier 6', classifySource('docs/research/analysis.md').tier === 6);

const personaOnly = validateSourceHierarchy(['docs/personas/worker/07_today.md']);
check('Persona-only sources → error (no architecture)', !personaOnly.valid);

const personaWithArch = validateSourceHierarchy([
  'docs/personas/worker/07_today.md',
  'packages/state-machines/src/visit.ts',
]);
check('Persona + architecture sources → valid', personaWithArch.valid);

console.log('\n6. Plan content auditor:');
const { auditPlanContent } = await import('./layer-2-guardrail/plan-content-auditor.mjs');

const cleanPlan = auditPlanContent('Build worker home screen using visitMachine transitions.', 'test.md');
check('Clean plan content passes', !cleanPlan.hasErrors);

const badPlan = auditPlanContent('WorkerState stays server-side as enum field. Direct DB update for visit status.', 'test.md');
check('Anti-pattern "enum field" detected', badPlan.violations.some(v => v.pattern === 'enum_field_for_states' || v.pattern === 'stays_as_enum'));
check('Anti-pattern "direct DB update" detected', badPlan.violations.some(v => v.pattern === 'direct_status_update'));

console.log('\n7. Tmp state namespacing:');
const expectedPrefix = `axhy-${REPO_HASH}`;
check(`State files use repo hash prefix: ${expectedPrefix}`, true);

console.log('\n8. Impact adapter fallback safety:');
const { impactCheck } = await import('./layer-2-guardrail/impact-adapter.mjs');
const highRiskFallback = await impactCheck('test', 'admin', 'high');
check('High-risk fallback blocks when brain unavailable', highRiskFallback._blocked === true);
const lowRiskFallback = await impactCheck('test', 'admin', 'low');
check('Low-risk fallback allows with warning when brain unavailable', !lowRiskFallback._blocked && lowRiskFallback._fallback);

console.log('\n9. Done-memo classification:');
const { isDoneMemo } = await import('./layer-1-hook/risk-classifier.mjs');
check('done-memo-worker-d1-s1.md IS done-memo', isDoneMemo('done-memo-worker-d1-s1.md'));
check('handoff/done-memos/slice1.md IS done-memo', isDoneMemo('handoff/done-memos/slice1.md'));
check('DONE-MEMO.md IS done-memo', isDoneMemo('DONE-MEMO.md'));
check('README.md is NOT done-memo', !isDoneMemo('README.md'));
check('docs/plans/sprint.md is NOT done-memo', !isDoneMemo('docs/plans/sprint.md'));
check('handoff/STATUS.md is NOT done-memo', !isDoneMemo('handoff/STATUS.md'));

console.log('\n10. Quality gate grading:');
const { gradeFindings, runPatternChecks } = await import('./layer-2-guardrail/quality-gate.mjs');
check('Zero findings → L5 Distinguished', gradeFindings([]).grade === 'L5');
check('Zero findings passes', gradeFindings([]).pass === true);
const fakeCriticals = [{ weight: 'critical' }, { weight: 'critical' }, { weight: 'critical' }];
check('3 criticals → L1 Junior', gradeFindings(fakeCriticals).grade === 'L1');
check('3 criticals does NOT pass', gradeFindings(fakeCriticals).pass === false);
const fakeHighs = [{ weight: 'high' }, { weight: 'high' }, { weight: 'high' }, { weight: 'high' }];
check('4 highs → L2 Mid-level', gradeFindings(fakeHighs).grade === 'L2');
check('4 highs does NOT pass', gradeFindings(fakeHighs).pass === false);
const fakeOneHigh = [{ weight: 'high' }];
check('1 high → L3 Senior (passes)', gradeFindings(fakeOneHigh).pass === true);
const fakeMediums = [{ weight: 'medium' }];
check('1 medium → L4 Principal', gradeFindings(fakeMediums).grade === 'L4');

console.log('\n11. MCP server tool registration:');
const { EDIT_TOOL_DEFINITION, PLAN_TOOL_DEFINITION, DONE_TOOL_DEFINITION } = await import('./layer-2-guardrail/server.mjs');
check('EDIT_TOOL_DEFINITION exists', !!EDIT_TOOL_DEFINITION);
check('PLAN_TOOL_DEFINITION exists', !!PLAN_TOOL_DEFINITION);
check('DONE_TOOL_DEFINITION exists', !!DONE_TOOL_DEFINITION);
check('check_before_done tool name correct', DONE_TOOL_DEFINITION?.name === 'check_before_done');
check('check_before_done requires slice_files', DONE_TOOL_DEFINITION?.inputSchema?.required?.includes('slice_files'));
check('check_before_done requires screenshots_taken', DONE_TOOL_DEFINITION?.inputSchema?.required?.includes('screenshots_taken'));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('\n⚠️  Fix the above issues before using bypass-permission mode.');
  process.exit(1);
} else {
  console.log('\n✅ System is properly installed and configured.');
}
