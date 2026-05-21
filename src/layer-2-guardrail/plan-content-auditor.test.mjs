import { readFileSync } from 'node:fs';
import { auditPlanContent } from './plan-content-auditor.mjs';

let passed = 0;
let failed = 0;

function assert(condition, label, debug) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    if (debug) console.log('        debug:', JSON.stringify(debug, null, 2));
    failed++;
  }
}

console.log('Test 1: current WORKER_MVP_SPRINT_PLAN.md should pass (all 5 prior matches are in negation context)');
{
  const planPath = '/Users/thotaakshay/eclean_workspace/axhy-v3/docs/personas/worker/WORKER_MVP_SPRINT_PLAN.md';
  const content = readFileSync(planPath, 'utf-8');
  const result = auditPlanContent(content, planPath);
  const errors = result.violations.filter(v => v.severity === 'error');
  assert(errors.length === 0, `current plan has 0 errors (got ${errors.length})`, errors.slice(0, 3));
}

console.log('\nTest 2: non-negated "leave state will be a plain enum field" — must still be caught');
{
  const bad = `# Plan\n\nThe leave state will be a plain enum field on the LeaveRequest table.\nNo machine needed.`;
  const result = auditPlanContent(bad, 'test-plan-2.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length >= 1, `non-negated enum-field claim caught (got ${errors.length})`, result.violations);
}

console.log('\nTest 3: prescriptive `prisma.worker.update({ state })` (no negation, no quote-context) — must still be caught');
{
  const bad = `# Plan\n\nTo activate a worker after OTP, the handler will call \`prisma.worker.update({ state: 'ACTIVE' })\` directly.`;
  const result = auditPlanContent(bad, 'test-plan-3.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length >= 1, `prescriptive prisma state update caught (got ${errors.length})`, result.violations);
}

console.log('\nTest 4: clear negation in backticks — must skip');
{
  const ok = `# Plan\n\nDo NOT write \`prisma.x.update({ state })\` directly. Use the state machine transition function instead.`;
  const result = auditPlanContent(ok, 'test-plan-4.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length === 0, `negated prisma update in backticks skipped (got ${errors.length})`, result.violations);
}

console.log('\nTest 5: quotation context with "wrong" — must skip');
{
  const ok = `# Plan\n\n> The earlier draft said "WorkerState stays server-side as an enum field." That phrasing is wrong; the workerMachine owns transitions.`;
  const result = auditPlanContent(ok, 'test-plan-5.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length === 0, `quoted-then-rejected enum claim skipped (got ${errors.length})`, result.violations);
}

console.log('\nTest 6: affirmation-with-must override — prescriptive "must" should not be skipped even with a stray "not"');
{
  const bad = `# Plan\n\nThe handler must call \`prisma.worker.update({ state: 'ACTIVE' })\` so the cron job is not delayed.`;
  const result = auditPlanContent(bad, 'test-plan-6.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length >= 1, `prescriptive "must" affirmation overrides distant "not" (got ${errors.length})`, result.violations);
}

console.log('\nTest 7: mixed line — affirm machine call, negate raw update (real-world pattern from worker plan line 134)');
{
  const ok = `5. **OTP** — Backend must fire \`workerMachine.send({ type: 'OTP_VERIFIED' })\` for activation — not a direct \`prisma.worker.update({ state: 'ACTIVE' })\`. Audit the handler.`;
  const result = auditPlanContent(ok, 'test-plan-7.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length === 0, `affirm-machine + negate-raw line skipped (got ${errors.length})`, result.violations);
}

console.log('\nTest 8: server-side status enum (positive claim, no negation) — must catch');
{
  const bad = `# Plan\n\nLeaveRequest status enum is the source of truth, server-side. Worker app reads it.`;
  const result = auditPlanContent(bad, 'test-plan-8.md');
  const errors = result.violations.filter(v => v.severity === 'error' || v.severity === 'warning');
  assert(errors.length >= 1, `server-side status enum claim caught (got ${errors.length})`, result.violations);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
