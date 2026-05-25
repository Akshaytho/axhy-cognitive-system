/**
 * Phase 0: Book Architecture — Retrieval Quality Baseline Tests
 *
 * Establishes that the brain (pgvector) returns correct content for common
 * intents BEFORE any boot context is removed. If these tests pass, we have
 * proof that retrieval can replace preloaded context.
 *
 * Requires: DATABASE_PUBLIC_URL or DATABASE_URL (Railway Postgres with pgvector)
 * Skips gracefully if DB is unavailable.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let impactSearch;
let impactCheck;
let loadRealImpactCheck;
let isConnected;
let dbAvailable = false;

before(async () => {
  const adapter = await import(
    join(__dirname, '..', 'src', 'layer-2-guardrail', 'impact-adapter.mjs')
  );
  impactSearch = adapter.impactSearch;
  impactCheck = adapter.impactCheck;
  loadRealImpactCheck = adapter.loadRealImpactCheck;
  isConnected = adapter.isConnected;

  try {
    const loaded = await loadRealImpactCheck();
    dbAvailable = loaded && isConnected();
  } catch {
    dbAvailable = false;
  }

  if (!dbAvailable) {
    console.log('⚠️  Brain DB not available — retrieval quality tests will skip.');
    console.log('   Set DATABASE_PUBLIC_URL or DATABASE_URL to run these tests.');
    console.log('   Example: railway run --service Postgres -- npm test');
  }
});

function skipIfNoDb(fn) {
  return async (t) => {
    if (!dbAvailable) {
      t.skip('Brain DB not available');
      return;
    }
    await fn(t);
  };
}

/**
 * Helper: search the brain and return results.
 * Uses impactSearch (v2 3-layer API) if available, falls back to impactCheck.
 */
async function searchBrain(query) {
  const searchResult = await impactSearch({ query, limit: 10 });
  if (searchResult.results && searchResult.results.length > 0) {
    return searchResult.results;
  }
  const checkResult = await impactCheck(query, null, 'medium');
  return checkResult.allRelevant || [];
}

/**
 * Assert that at least one result contains ANY of the expected keywords
 * in its title, snippet, or concepts.
 */
function assertRetrievedAny(results, keywords, intentDescription) {
  const allText = results.map(r =>
    [r.title || '', r.snippet || '', ...(r.concepts || [])].join(' ').toLowerCase()
  ).join(' ');

  const found = keywords.filter(kw => allText.includes(kw.toLowerCase()));

  assert.ok(
    found.length > 0,
    `Intent "${intentDescription}": expected at least one of [${keywords.join(', ')}] ` +
    `in results but found none. Got ${results.length} results: ` +
    results.slice(0, 3).map(r => r.title || r.snippet?.slice(0, 50)).join('; ')
  );
}

/**
 * Assert results are non-empty.
 */
function assertNonEmpty(results, intentDescription) {
  assert.ok(
    results.length > 0,
    `Intent "${intentDescription}": expected non-empty results from brain but got 0. ` +
    'Brain may not be populated for this topic.'
  );
}

// ─── RETRIEVAL QUALITY TESTS ────────────────────────────────────────────────

describe('Phase 0: Retrieval Quality Baseline', () => {

  describe('Enterprise & Security Intents', () => {
    it('worker photo upload → retrieves enterprise/persistence rules', skipIfNoDb(async () => {
      const results = await searchBrain('worker photo upload presigned URL image storage');
      assertNonEmpty(results, 'worker photo upload');
      assertRetrievedAny(results, [
        'e6', 'e7', 'e13', 'data loss', 'photo', 'presigned', 'storage', 'upload'
      ], 'worker photo upload');
    }));

    it('security boundary change → retrieves E1/OWASP/multi-tenant', skipIfNoDb(async () => {
      const results = await searchBrain('security boundary change authentication authorization multi-tenant isolation');
      assertNonEmpty(results, 'security boundary change');
      assertRetrievedAny(results, [
        'e1', 'security', 'owasp', 'multi-tenant', 'isolation', 'authentication', 'boundary'
      ], 'security boundary change');
    }));

    it('data deletion request → retrieves E6/forever-retention/SUPER_ADMIN', skipIfNoDb(async () => {
      const results = await searchBrain('data deletion request user data removal permanent delete');
      assertNonEmpty(results, 'data deletion request');
      assertRetrievedAny(results, [
        'e6', 'data loss', 'forever', 'retention', 'super_admin', 'hard-delete', 'deletion'
      ], 'data deletion request');
    }));

    it('secrets and credentials handling → retrieves E13', skipIfNoDb(async () => {
      const results = await searchBrain('secrets credentials API keys environment variables rotation');
      assertNonEmpty(results, 'secrets handling');
      assertRetrievedAny(results, [
        'e13', 'secrets', 'credentials', 'api key', 'rotation', 'environment'
      ], 'secrets handling');
    }));
  });

  describe('Architecture & State Machine Intents', () => {
    it('visit status change → retrieves state-machine discipline', skipIfNoDb(async () => {
      const results = await searchBrain('visit status change transition state machine lifecycle');
      assertNonEmpty(results, 'visit status change');
      assertRetrievedAny(results, [
        'state machine', 'state-machine', 'transition', 'lifecycle', 'status', 'direct db'
      ], 'visit status change');
    }));

    it('schema migration → retrieves reversible/backend-owns-schema', skipIfNoDb(async () => {
      const results = await searchBrain('prisma schema migration database change reversible');
      assertNonEmpty(results, 'schema migration');
      assertRetrievedAny(results, [
        'schema', 'migration', 'reversible', 'backend', 'prisma', 'rollback'
      ], 'schema migration');
    }));

    it('admin membership route → retrieves auth/tenant-ownership', skipIfNoDb(async () => {
      const results = await searchBrain('admin membership route company tenant ownership authorization role');
      assertNonEmpty(results, 'admin membership route');
      assertRetrievedAny(results, [
        'tenant', 'ownership', 'auth', 'role', 'company', 'admin', 'membership'
      ], 'admin membership route');
    }));
  });

  describe('Cognitive System & Guardrail Intents', () => {
    it('persona doc edit → retrieves memory-firewall/challenge-response', skipIfNoDb(async () => {
      const results = await searchBrain('persona document edit CORE_MIND identity modification memory firewall');
      assertNonEmpty(results, 'persona doc edit');
      assertRetrievedAny(results, [
        'memory firewall', 'firewall', 'challenge', 'response', 'persona', 'core_mind', 'identity'
      ], 'persona doc edit');
    }));

    it('CLAUDE.md modification → retrieves guardrail-mandate', skipIfNoDb(async () => {
      const results = await searchBrain('CLAUDE.md modification guardrail hook configuration');
      assertNonEmpty(results, 'CLAUDE.md modification');
      assertRetrievedAny(results, [
        'guardrail', 'claude.md', 'hook', 'pre-edit', 'mandate', 'high-risk'
      ], 'CLAUDE.md modification');
    }));

    it('chat rate limiting → retrieves chat-behavior-rules', skipIfNoDb(async () => {
      const results = await searchBrain('chat rate limiting supervisor message throttle conversation');
      assertNonEmpty(results, 'chat rate limiting');
      assertRetrievedAny(results, [
        'chat', 'rate', 'limit', 'message', 'supervisor', 'throttle', 'behavior'
      ], 'chat rate limiting');
    }));
  });

  describe('Product & Onboarding Intents', () => {
    it('worker onboarding flow → retrieves AI-onboarding/question-bank', skipIfNoDb(async () => {
      const results = await searchBrain('worker onboarding AI conversational questions profile setup');
      assertNonEmpty(results, 'worker onboarding');
      assertRetrievedAny(results, [
        'onboarding', 'question', 'worker', 'conversational', 'profile', 'ai'
      ], 'worker onboarding');
    }));

    it('pricing model → retrieves locked pricing decision', skipIfNoDb(async () => {
      const results = await searchBrain('pricing per visit monthly subscription cost revenue model');
      assertNonEmpty(results, 'pricing model');
      assertRetrievedAny(results, [
        'pricing', 'visit', 'monthly', 'rs', 'revenue', 'subscription'
      ], 'pricing model');
    }));
  });

  describe('Feedback & Learning Intents', () => {
    it('confidence before acting → retrieves confidence-score rule', skipIfNoDb(async () => {
      const results = await searchBrain('confidence score before acting research verify assumptions');
      assertNonEmpty(results, 'confidence before acting');
      assertRetrievedAny(results, [
        'confidence', 'score', '90', 'research', 'verify', 'assumption'
      ], 'confidence before acting');
    }));

    it('vertical slices approach → retrieves vertical-not-backend-first', skipIfNoDb(async () => {
      const results = await searchBrain('vertical slice foundation consumer surface feedback loop not backend first');
      assertNonEmpty(results, 'vertical slices');
      assertRetrievedAny(results, [
        'vertical', 'slice', 'foundation', 'consumer', 'surface', 'backend'
      ], 'vertical slices');
    }));

    it('visual verification → retrieves screenshot-before-done rule', skipIfNoDb(async () => {
      const results = await searchBrain('visual verification screenshot UI before declaring done');
      assertNonEmpty(results, 'visual verification');
      assertRetrievedAny(results, [
        'screenshot', 'visual', 'verification', 'done', 'ui', 'before'
      ], 'visual verification');
    }));
  });
});

describe('Phase 0: Brain Health Check', () => {
  it('brain connection is available', skipIfNoDb(async () => {
    assert.ok(isConnected(), 'Brain should be connected after loadRealImpactCheck');
  }));

  it('brain returns non-empty for generic architecture query', skipIfNoDb(async () => {
    const results = await searchBrain('axhy architecture backend mobile admin');
    assert.ok(results.length >= 1, 'Expected at least 1 result for generic architecture query');
  }));

  it('brain returns results with expected shape', skipIfNoDb(async () => {
    const results = await searchBrain('state machine transition');
    if (results.length > 0) {
      const r = results[0];
      assert.ok('id' in r || 'title' in r || 'snippet' in r,
        'Result should have at least id, title, or snippet');
    }
  }));
});
