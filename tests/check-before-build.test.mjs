import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots } from '../src/shared/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);

// Tests run without a brain database. The brain unavailability gate blocks
// check_before_build unless degraded mode is explicitly accepted.
// Field validation tests need this so they test field logic, not DB availability.
process.env.AXHY_BRAIN_DEGRADED_OK = '1';

const WORKSPACE_ROOTS = getWorkspaceRoots();

function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

function cleanState() {
  for (const h of allHashes()) {
    for (const suffix of [
      'guardrail-state.json', 'read-state.json',
      'plan-guardrail-state.json', 'done-guardrail-state.json',
      'build-guardrail-state.json',
    ]) {
      try { unlinkSync(`/tmp/axhy-${h}-${suffix}`); } catch {}
    }
  }
}

/** Generates a string with the given word count. */
function words(n) {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

/** Full passing structured fields — all required fields with substantive evidence. */
function fullPassFields() {
  return {
    // Context fields
    feature_goal: 'Implement worker photo capture pipeline allowing workers to take before/after photos during facility visits for proof of completion',
    affected_personas: 'Worker persona captures photos, supervisor reviews them, admin sees aggregate stats',
    affected_platforms: 'Mobile (React Native with Expo Camera), backend (Fastify + R2 presigned URLs)',

    // Concern fields mapping to E-items
    security_boundary: 'Route validates authentication via requireAuth, authorization via WORKER role gate, and resource ownership via workerId from req.auth.userId never from body',
    tenant_and_resource_ownership: 'Every database query filters by companyId via the withTenantContext middleware applied at router level in server.ts line 45 ensuring multi-tenant isolation',
    rate_limit_or_abuse_boundary: 'Rate limiting applied via existing global rate limiter middleware at 100 requests per minute per user configured in config/rate-limit.ts',
    source_of_truth: 'captureMachine in packages/state-machines/src/capture.ts owns the capture lifecycle states idle to capturing to submitted, no direct DB updates',
    lifecycle_or_state_machine_owner: 'No prisma status updates in this slice — captureMachine is local-only state and VisitPhoto rows are created in slice 2b-3 Submit not here',
    data_loss_paths: 'Photos persist to per-user partition on disk via writePhoto in lib/storage/per-user-partition.ts before upload queue processes them, surviving app kill',
    mobile_web_failure_modes: 'CameraView has web-stub fallback via Platform.OS check, useKeepAwake wrapped in Platform.OS !== web guard, all file-system APIs have CAPTURES_ROOT null guard',
    app_store_crash_risks: 'All async paths wrapped in try-catch, camera permission denial shows error state not crash, upload queue catches and retries with exponential backoff',
    scale_assumption: 'No new database queries in this slice — presign route is read-only returning signed URLs, no table scans or pagination concerns apply here',
    documentation_truth: 'Plan says exponential backoff 1s 2s 4s 8s max 60s and code implements BACKOFF_MS array matching those exact values in r2-upload-queue.ts line 40',
    required_tests: 'Integration tests cover 401 unauth, 403 wrong role, 400 bad input, 200 happy path for presign route, captureMachine has 9 transition tests',
    error_specificity: 'Error codes R2_NOT_CONFIGURED, OBJECT_KEY_INVALID, FILE_TOO_LARGE, BATCH_TOO_LARGE each map to exactly one failure mode per D7 error specificity rule',
    secrets_and_credentials: 'R2 credentials are environment variables on Railway, presigned URLs expire in 15 minutes, no credentials in code or client bundle anywhere in slice',
    non_deferrable_summary: 'All non-deferrable items addressed above: security E1-E2, crash prevention E8, data loss E6, secrets E13, documentation truth E10 — nothing deferred',
  };
}

/** Full passing E1-E14 checklist for backward compat tests. */
function fullPassChecklist() {
  return {
    E1: 'Route validates authentication via requireAuth, authorization via WORKER role gate, and resource ownership via workerId from req.auth.userId never from body',
    E2: 'Every database query filters by companyId via the withTenantContext middleware applied at router level in server.ts line 45 ensuring multi-tenant isolation',
    E3: 'Rate limiting applied via existing global rate limiter middleware at 100 requests per minute per user configured in config/rate-limit.ts',
    E4: 'captureMachine in packages/state-machines/src/capture.ts owns the capture lifecycle states idle to capturing to submitted, no direct DB updates',
    E5: 'No prisma status updates in this slice — captureMachine is local-only state and VisitPhoto rows are created in slice 2b-3 Submit not here',
    E6: 'Photos persist to per-user partition on disk via writePhoto in lib/storage/per-user-partition.ts before upload queue processes them, surviving app kill',
    E7: 'CameraView has web-stub fallback via Platform.OS check, useKeepAwake wrapped in Platform.OS !== web guard, all file-system APIs have CAPTURES_ROOT null guard',
    E8: 'All async paths wrapped in try-catch, camera permission denial shows error state not crash, upload queue catches and retries with exponential backoff',
    E9: 'No new database queries in this slice — presign route is read-only returning signed URLs, no table scans or pagination concerns apply here',
    E10: 'Plan says exponential backoff 1s 2s 4s 8s max 60s and code implements BACKOFF_MS array matching those exact values in r2-upload-queue.ts line 40',
    E11: 'Integration tests cover 401 unauth, 403 wrong role, 400 bad input, 200 happy path for presign route, captureMachine has 9 transition tests',
    E12: 'Error codes R2_NOT_CONFIGURED, OBJECT_KEY_INVALID, FILE_TOO_LARGE, BATCH_TOO_LARGE each map to exactly one failure mode per D7 error specificity rule',
    E13: 'R2 credentials are environment variables on Railway, presigned URLs expire in 15 minutes, no credentials in code or client bundle anywhere in slice',
    E14: 'All non-deferrable items addressed above: security E1-E2, crash prevention E8, data loss E6, secrets E13, documentation truth E10 — nothing deferred',
  };
}

// --- Basic Validation ---

describe('Check Before Build — Basic Validation', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should reject missing slice_name', async () => {
    const result = await checkBeforeBuild({
      planReference: 'docs/plan.md',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /slice_name/i);
  });

  it('should reject missing plan_reference', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /plan_reference/i);
  });

  it('should reject empty planned_files', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      plannedFiles: [],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /planned_files/i);
  });

  it('should reject invalid slice_scope', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'invalid_scope',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /slice_scope/i);
  });
});

// --- Field Completeness ---

describe('Check Before Build — Field Completeness', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should reject when required fields are missing', async () => {
    const fields = fullPassFields();
    delete fields.security_boundary;
    delete fields.data_loss_paths;

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('security_boundary')));
    assert.ok(result.failures.some(f => f.includes('data_loss_paths')));
  });

  it('should reject unknown field keys', async () => {
    const fields = { ...fullPassFields(), bogus_field: 'should not be here' };

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('bogus_field')));
  });

  it('should reject empty structured fields', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: {},
    });
    assert.equal(result.allowed, false);
    // Should have failures for all required fields
    assert.ok(result.failures.length >= 14);
  });
});

// --- Evidence Quality ---

describe('Check Before Build — Evidence Quality', async () => {
  const { checkBeforeBuild, MIN_EVIDENCE_WORDS } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should reject concern field evidence under 15 words', async () => {
    const fields = fullPassFields();
    fields.security_boundary = 'too short';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('security_boundary') && f.includes('too brief')));
  });

  it('should accept context fields with shorter evidence', async () => {
    const fields = fullPassFields();
    fields.affected_personas = 'Worker and supervisor personas are affected';
    fields.affected_platforms = 'Mobile and backend platforms are used';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
  });

  it('should accept all concern fields with 15+ words', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, true);
  });

  it('should export MIN_EVIDENCE_WORDS as 15', () => {
    assert.equal(MIN_EVIDENCE_WORDS, 15);
  });
});

// --- N/A Handling ---

describe('Check Before Build — N/A Handling', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should accept N/A with valid reason for deferrable fields', async () => {
    const fields = fullPassFields();
    fields.rate_limit_or_abuse_boundary = { status: 'N/A', reason: 'No new routes in this slice — only shared schema package changes' };

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'shared',
      plannedFiles: ['packages/shared-schema/src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
    assert.ok(result.items_na.some(n => n.includes('Rate Limiting')));
  });

  it('should reject N/A without reason', async () => {
    const fields = fullPassFields();
    fields.rate_limit_or_abuse_boundary = { status: 'N/A' };

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('rate_limit') && f.includes('reason')));
  });

  it('should reject N/A with reason under 10 chars', async () => {
    const fields = fullPassFields();
    fields.rate_limit_or_abuse_boundary = { status: 'N/A', reason: 'no need' };

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('rate_limit') && f.includes('10+')));
  });
});

// --- Non-Deferrable Fields ---

describe('Check Before Build — Non-Deferrable Fields', async () => {
  const { checkBeforeBuild, NON_DEFERRABLE_FIELD_KEYS } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should define security, ownership, data loss, crash, secrets as non-deferrable', () => {
    assert.ok(NON_DEFERRABLE_FIELD_KEYS.includes('security_boundary'));
    assert.ok(NON_DEFERRABLE_FIELD_KEYS.includes('tenant_and_resource_ownership'));
    assert.ok(NON_DEFERRABLE_FIELD_KEYS.includes('data_loss_paths'));
    assert.ok(NON_DEFERRABLE_FIELD_KEYS.includes('app_store_crash_risks'));
    assert.ok(NON_DEFERRABLE_FIELD_KEYS.includes('secrets_and_credentials'));
    assert.ok(!NON_DEFERRABLE_FIELD_KEYS.includes('rate_limit_or_abuse_boundary'));
    assert.ok(!NON_DEFERRABLE_FIELD_KEYS.includes('scale_assumption'));
  });

  it('should reject non-deferrable fields with "will handle later"', async () => {
    const fields = fullPassFields();
    fields.security_boundary = 'Auth checks will handle later in the next slice when we add the full security middleware layer to the routing';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('security_boundary') && f.includes('deferral')));
  });

  it('should reject non-deferrable fields with "defer to next slice"', async () => {
    const fields = fullPassFields();
    fields.tenant_and_resource_ownership = 'Tenant isolation will be deferred to next slice because the current slice only adds a utility function without database access';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('tenant_and_resource_ownership') && f.includes('deferral')));
  });

  it('should reject non-deferrable fields with "skip for MVP"', async () => {
    const fields = fullPassFields();
    fields.data_loss_paths = 'Data persistence can be skipped for MVP because workers rarely have their phones die mid-capture and we can just ask them to redo';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('data_loss_paths')));
  });

  it('should reject non-deferrable N/A with deferral language', async () => {
    const fields = fullPassFields();
    fields.app_store_crash_risks = { status: 'N/A', reason: 'Crash prevention not needed for MVP because we will fix crashes later in beta' };

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('app_store_crash_risks') && f.includes('Non-deferrable')));
  });

  it('should ACCEPT non-deferrable N/A with legitimate reason', async () => {
    const fields = fullPassFields();
    fields.security_boundary = { status: 'N/A', reason: 'No routes in this slice — only adding Zod schemas to shared-schema package with no API endpoints' };

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'shared',
      plannedFiles: ['packages/shared-schema/src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
  });

  it('should allow deferrable fields with deferral language', async () => {
    const fields = fullPassFields();
    fields.rate_limit_or_abuse_boundary = 'Rate limiting will be added in the next slice when the full middleware stack is wired up because this slice only creates the schema package';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
  });

  it('should reject non-deferrable fields with "placeholder"', async () => {
    const fields = fullPassFields();
    fields.secrets_and_credentials = 'Using a placeholder API key for now until we set up proper environment variable management on Railway in the next sprint cycle';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('secrets_and_credentials') && f.includes('deferral')));
  });

  it('should reject non-deferrable fields with "good enough"', async () => {
    const fields = fullPassFields();
    fields.app_store_crash_risks = 'The current error handling is good enough for launch — we can improve crash handling later based on real user reports from production';

    const result = await checkBeforeBuild({
      sliceName: 'test-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('app_store_crash_risks')));
  });
});

// --- State File ---

describe('Check Before Build — State File', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should write build state file on pass', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice-state',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, true);

    const stateFile = `/tmp/axhy-${REPO_HASH}-build-guardrail-state.json`;
    assert.ok(existsSync(stateFile), 'Build state file should exist after pass');

    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    assert.equal(state.type, 'build');
    assert.equal(state.slice_name, 'test-slice-state');
    assert.equal(state.plan_reference, 'docs/plan.md');
    assert.equal(state.slice_scope, 'full_stack');
    assert.ok(state.timestamp > 0);
    assert.ok(state.checklist.passed.length > 0);
  });

  it('should NOT write build state file on failure', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-slice-fail',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: {},
    });
    assert.equal(result.allowed, false);

    const stateFile = `/tmp/axhy-${REPO_HASH}-build-guardrail-state.json`;
    assert.ok(!existsSync(stateFile), 'Build state file should NOT exist after failure');
  });
});

// --- Full Pass ---

describe('Check Before Build — Full Pass', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should pass with all required fields having substantive evidence', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'worker-d1-s2b-2-capture-pipeline',
      planReference: 'docs/personas/worker/WORKER_MVP_SLICE_2B_2_PLAN.md',
      sliceScope: 'full_stack',
      plannedFiles: [
        'apps/backend/src/lib/r2-presign.ts',
        'apps/backend/src/routes/worker-captures.ts',
        'apps/mobile/components/worker/capture/CameraView.tsx',
      ],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, true);
    assert.ok(result.items_passed.length >= 14);
    assert.equal(result.items_na.length, 0);
    assert.equal(result.slice_name, 'worker-d1-s2b-2-capture-pipeline');
    assert.match(result.note, /preflight passed/i);
  });

  it('should pass with mix of evidence and valid N/A', async () => {
    const fields = fullPassFields();
    fields.mobile_web_failure_modes = { status: 'N/A', reason: 'Backend-only slice — no mobile or web components, only Fastify routes and Prisma queries' };

    const result = await checkBeforeBuild({
      sliceName: 'backend-only-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: ['apps/backend/src/routes/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.items_na.length, 1);
    assert.ok(result.items_na[0].includes('Mobile'));
  });

  it('should include known_gaps in output when provided', async () => {
    const fields = fullPassFields();
    fields.known_gaps = 'Does not cover photo submission to server — that is slice 2b-3';

    const result = await checkBeforeBuild({
      sliceName: 'test-with-gaps',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
    assert.ok(result.known_gaps.includes('2b-3'));
  });

  it('should show "None declared" for known_gaps when not provided', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'test-no-gaps',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });
    assert.equal(result.allowed, true);
    assert.equal(result.known_gaps, 'None declared');
  });
});

// --- Backward Compatibility (E1-E14 Checklist) ---

describe('Check Before Build — Backward Compatibility', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should accept legacy E1-E14 checklist via enterpriseChecklist', async () => {
    const result = await checkBeforeBuild({
      sliceName: 'legacy-compat-test',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      enterpriseChecklist: fullPassChecklist(),
    });
    assert.equal(result.allowed, true);
    assert.equal(result.slice_name, 'legacy-compat-test');
  });

  it('should reject legacy checklist with deferral language on non-deferrable item', async () => {
    const checklist = fullPassChecklist();
    checklist.E1 = 'Auth checks will handle later in the next slice when we add the full security middleware layer to the routing';

    const result = await checkBeforeBuild({
      sliceName: 'legacy-fail-test',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      enterpriseChecklist: checklist,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('security_boundary') && f.includes('deferral')));
  });

  it('should prefer structuredFields over enterpriseChecklist when both provided', async () => {
    const fields = fullPassFields();
    const checklist = {};

    const result = await checkBeforeBuild({
      sliceName: 'prefer-fields-test',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
      enterpriseChecklist: checklist,
    });
    assert.equal(result.allowed, true);
  });
});

// --- Context Fields ---

describe('Check Before Build — Context Fields', async () => {
  const { checkBeforeBuild, CONTEXT_FIELD_KEYS } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should define feature_goal, affected_personas, affected_platforms as context fields', () => {
    assert.ok(CONTEXT_FIELD_KEYS.includes('feature_goal'));
    assert.ok(CONTEXT_FIELD_KEYS.includes('affected_personas'));
    assert.ok(CONTEXT_FIELD_KEYS.includes('affected_platforms'));
    assert.equal(CONTEXT_FIELD_KEYS.length, 3);
  });

  it('should reject missing feature_goal', async () => {
    const fields = fullPassFields();
    delete fields.feature_goal;

    const result = await checkBeforeBuild({
      sliceName: 'test-no-goal',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.some(f => f.includes('feature_goal')));
  });

  it('should accept array values for affected_personas', async () => {
    const fields = fullPassFields();
    fields.affected_personas = ['worker', 'supervisor'];

    const result = await checkBeforeBuild({
      sliceName: 'test-array-personas',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fields,
    });
    assert.equal(result.allowed, true);
  });
});

// --- Server Integration ---

describe('Server — BUILD_TOOL_DEFINITION', async () => {
  const { BUILD_TOOL_DEFINITION, handleBuildToolCall } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'server.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should export a valid build tool definition with structured_fields', () => {
    assert.equal(BUILD_TOOL_DEFINITION.name, 'check_before_build');
    assert.ok(BUILD_TOOL_DEFINITION.inputSchema);
    assert.ok(BUILD_TOOL_DEFINITION.inputSchema.properties.structured_fields);
    assert.ok(BUILD_TOOL_DEFINITION.inputSchema.required.includes('structured_fields'));
    assert.ok(BUILD_TOOL_DEFINITION.inputSchema.required.includes('slice_name'));
  });

  it('should handle build tool call via handleBuildToolCall with structured_fields', async () => {
    const result = await handleBuildToolCall({
      slice_name: 'test-via-server',
      plan_reference: 'docs/plan.md',
      slice_scope: 'full_stack',
      planned_files: ['src/foo.ts'],
      structured_fields: fullPassFields(),
    });
    assert.equal(result.allowed, true);
    assert.equal(result.slice_name, 'test-via-server');
  });

  it('should reject via handleBuildToolCall with empty structured_fields', async () => {
    const result = await handleBuildToolCall({
      slice_name: 'test-fail-server',
      plan_reference: 'docs/plan.md',
      slice_scope: 'full_stack',
      planned_files: ['src/foo.ts'],
      structured_fields: {},
    });
    assert.equal(result.allowed, false);
    assert.ok(result.failures.length > 0);
  });

  it('should handle backward-compat E1-E14 via handleBuildToolCall', async () => {
    const result = await handleBuildToolCall({
      slice_name: 'test-legacy-server',
      plan_reference: 'docs/plan.md',
      slice_scope: 'full_stack',
      planned_files: ['src/foo.ts'],
      enterprise_checklist: fullPassChecklist(),
    });
    assert.equal(result.allowed, true);
  });
});

// --- Memory Firewall Integration ---

describe('Memory Firewall — Enterprise Standard Weakening', async () => {
  const { validateEnterpriseStandardWeakening } = await import(
    join(__dirname, '..', 'src', 'memory-firewall', 'classifier.mjs')
  );

  it('should block learning that weakens security with MVP language', () => {
    const result = validateEnterpriseStandardWeakening(
      'Authentication checks are overkill for the MVP. Workers do not need role gating because we trust all authenticated users.'
    );
    assert.equal(result.allowed, false);
    assert.ok(result.matched_domains.includes('security'));
    assert.ok(result.matched_patterns.some(p => p.includes('overkill')));
  });

  it('should block learning that weakens data loss prevention', () => {
    const result = validateEnterpriseStandardWeakening(
      'Persist to disk is too strict for data loss prevention. Workers can just retake photos if the app kills mid-capture.'
    );
    assert.equal(result.allowed, false);
    assert.ok(result.matched_domains.includes('data loss'));
  });

  it('should block learning that says tenant isolation is not needed for MVP', () => {
    const result = validateEnterpriseStandardWeakening(
      'Multi-tenant isolation with companyId filter is not needed for MVP because we only have one customer.'
    );
    assert.equal(result.allowed, false);
    assert.ok(result.matched_domains.includes('ownership'));
  });

  it('should block learning that suggests skipping credential checks', () => {
    const result = validateEnterpriseStandardWeakening(
      'API key management and credential rotation can be skipped for MVP because the secrets are only in environment variables anyway.'
    );
    assert.equal(result.allowed, false);
    assert.ok(result.matched_domains.includes('secrets'));
  });

  it('should allow learning that discusses enterprise standards positively', () => {
    const result = validateEnterpriseStandardWeakening(
      'Authentication must always include role gating per the enterprise standard. This was enforced successfully in slice 2b-2.'
    );
    assert.equal(result.allowed, true);
  });

  it('should allow learning about unrelated topics', () => {
    const result = validateEnterpriseStandardWeakening(
      'The Expo Camera API returns a CameraCapturedPicture object with a uri field pointing to the captured image.'
    );
    assert.equal(result.allowed, true);
  });

  it('should handle null/empty content', () => {
    assert.equal(validateEnterpriseStandardWeakening(null).allowed, true);
    assert.equal(validateEnterpriseStandardWeakening('').allowed, true);
  });

  it('should block learning that weakens crash prevention', () => {
    const result = validateEnterpriseStandardWeakening(
      'Zero crash requirement for app store reliability is unnecessarily strict. Some unhandled exceptions in edge cases are acceptable.'
    );
    assert.equal(result.allowed, false);
    assert.ok(result.matched_domains.includes('crash prevention'));
  });
});

// --- Done-Memo Enterprise Preflight Reference ---

describe('Done-Memo — Enterprise Preflight Reference', async () => {
  const { checkBeforeDone } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-done.mjs')
  );
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  const BASE_ARGS = {
    intent: 'Completed backend routes for worker today endpoint with real DB tests against Railway sandbox, covering GET /worker/today and GET /worker/visits/:id with proper tenant isolation',
    sliceName: 'test-done-with-build',
    doneMemoFile: 'handoff/done-memo-test.md',
    sliceFiles: ['package.json'],
    screenshotsTaken: false,
    typecheckPassed: true,
    testsPassed: true,
    coverageNotes: 'Covers sprint plan items 2a-1: backend routes for /worker/today and /worker/visits/:id. No UI in this sub-slice.',
    selfReasoningSummary: 'impactCheck returned no hardBlocks. Verified locked constraints on multi-tenant isolation. No stale docs found.',
    handoffUpdated: true,
  };

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should block done when no build state exists', async () => {
    const result = await checkBeforeDone(BASE_ARGS);
    assert.equal(result.allowed, false);
    const hasBuildRef = result.preflight_failures.some(f => f.includes('enterprise production preflight'));
    assert.ok(hasBuildRef, 'Should mention enterprise preflight in failure');
  });

  it('should block done when build state is for wrong slice', async () => {
    await checkBeforeBuild({
      sliceName: 'different-slice',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });

    const result = await checkBeforeDone(BASE_ARGS);
    assert.equal(result.allowed, false);
    const hasMismatch = result.preflight_failures.some(f => f.includes('different slice'));
    assert.ok(hasMismatch, 'Should mention slice mismatch in failure');
  });

  it('should pass done preflight when build state matches slice', async () => {
    await checkBeforeBuild({
      sliceName: 'test-done-with-build',
      planReference: 'docs/plan.md',
      sliceScope: 'full_stack',
      plannedFiles: ['src/foo.ts'],
      structuredFields: fullPassFields(),
    });

    const result = await checkBeforeDone(BASE_ARGS);
    if (!result.allowed && result.preflight_failures) {
      // Filter for enterprise preflight existence/mismatch failures only —
      // NOT declaration-vs-delivery diff (tested separately in layer-2-guardrail.test.mjs)
      const buildFailures = result.preflight_failures.filter(f =>
        (f.includes('enterprise production preflight') || f.includes('different slice'))
        && !f.includes('Declaration-vs-delivery')
      );
      assert.equal(buildFailures.length, 0, 'No enterprise preflight failures when build state matches');
    }
  });
});

// ── Brain Unavailability Gate ──────────────────────────────────────────────
// Tests that brain retrieval failure blocks check_before_build unless
// AXHY_BRAIN_DEGRADED_OK is explicitly set. Closes the silent degradation
// asymmetry identified by the 45-year AI principal.
describe('Brain Unavailability Gate', async () => {
  const { checkBeforeBuild } = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'check-before-build.mjs')
  );

  beforeEach(() => cleanState());
  after(() => cleanState());

  it('should BLOCK build when brain is unavailable and AXHY_BRAIN_DEGRADED_OK is NOT set', async () => {
    // Temporarily remove the degraded flag
    const saved = process.env.AXHY_BRAIN_DEGRADED_OK;
    delete process.env.AXHY_BRAIN_DEGRADED_OK;

    try {
      const result = await checkBeforeBuild({
        sliceName: 'brain-gate-test',
        planReference: 'docs/plan.md',
        sliceScope: 'backend',
        plannedFiles: ['src/test.ts'],
        structuredFields: fullPassFields(),
      });

      // Without DB, brain retrieval fails. Without AXHY_BRAIN_DEGRADED_OK, gate should block.
      assert.equal(result.allowed, false, 'Should block when brain unavailable without degraded flag');
      assert.ok(result.brain_error, 'Should include brain_error in response');
      assert.ok(result.suggestion.includes('AXHY_BRAIN_DEGRADED_OK'),
        'Suggestion should mention how to accept degraded mode');
    } finally {
      // Restore the flag for subsequent tests
      if (saved !== undefined) {
        process.env.AXHY_BRAIN_DEGRADED_OK = saved;
      } else {
        delete process.env.AXHY_BRAIN_DEGRADED_OK;
      }
    }
  });

  it('should ALLOW build in degraded mode when AXHY_BRAIN_DEGRADED_OK=1 is set', async () => {
    // AXHY_BRAIN_DEGRADED_OK is already set at file top
    assert.equal(process.env.AXHY_BRAIN_DEGRADED_OK, '1', 'Env var should be set');

    const result = await checkBeforeBuild({
      sliceName: 'brain-gate-test-degraded',
      planReference: 'docs/plan.md',
      sliceScope: 'backend',
      plannedFiles: ['src/test.ts'],
      structuredFields: fullPassFields(),
    });

    assert.equal(result.allowed, true, 'Should allow in degraded mode');
    // Verify the response notes degraded mode
    assert.ok(result.note.includes('DEGRADED MODE'),
      'Note should mention DEGRADED MODE when brain fails but degraded is accepted');
    assert.equal(result.brain_retrieval.consulted, false,
      'brain_retrieval.consulted should be false when brain failed');
  });

  it('should include brain_error details in the blocked response', async () => {
    const saved = process.env.AXHY_BRAIN_DEGRADED_OK;
    delete process.env.AXHY_BRAIN_DEGRADED_OK;

    try {
      const result = await checkBeforeBuild({
        sliceName: 'brain-gate-error-detail',
        planReference: 'docs/plan.md',
        sliceScope: 'backend',
        plannedFiles: ['src/test.ts'],
        structuredFields: fullPassFields(),
      });

      assert.equal(result.allowed, false);
      assert.ok(result.reason.includes('locked constraints'),
        'Reason should explain that locked constraints cannot be verified');
    } finally {
      if (saved !== undefined) {
        process.env.AXHY_BRAIN_DEGRADED_OK = saved;
      } else {
        delete process.env.AXHY_BRAIN_DEGRADED_OK;
      }
    }
  });
});
