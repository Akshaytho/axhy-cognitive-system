#!/usr/bin/env node

/**
 * Brain Health Preflight — run before any Book Architecture phase.
 *
 * Checks:
 *   1. DB connection works (Railway Postgres reachable)
 *   2. brain_entries table has entries (not empty)
 *   3. Sample embedding is real (not PRNG fake — magnitude check)
 *   4. Semantic search returns relevant results for a known intent
 *
 * Usage:
 *   export $(grep OPENAI_API_KEY apps/backend/.env.local) && \
 *     railway run --service Postgres -- npm run test:brain-health
 *
 * Exit codes:
 *   0 = healthy, safe to proceed with Book Architecture phase
 *   1 = unhealthy, do NOT proceed
 *
 * Phase 0 discovery (2026-05-26): without this check, brain:build silently
 * produced PRNG fake embeddings when OPENAI_API_KEY was missing. All 2,767
 * entries had random vectors (cosine similarity ~0.08 between any texts).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXHY_V3_ROOT = process.env.AXHY_V3_ROOT || join(__dirname, '..', '..', 'axhy-v3');

let exitCode = 0;
const checks = [];

function pass(name, detail) {
  checks.push({ name, status: 'PASS', detail });
  console.log(`  ✅ ${name}: ${detail}`);
}

function fail(name, detail) {
  checks.push({ name, status: 'FAIL', detail });
  console.log(`  ❌ ${name}: ${detail}`);
  exitCode = 1;
}

async function main() {
  console.log('\n🧠 Brain Health Preflight\n');

  // ── Check 1: DB connection ──────────────────────────────────────────────
  let impactSearch, isConnected, loadRealImpactCheck;
  try {
    const adapter = await import(
      join(__dirname, '..', 'src', 'layer-2-guardrail', 'impact-adapter.mjs')
    );
    impactSearch = adapter.impactSearch;
    isConnected = adapter.isConnected;
    loadRealImpactCheck = adapter.loadRealImpactCheck;

    const loaded = await loadRealImpactCheck();
    if (loaded && isConnected()) {
      pass('DB connection', 'Railway Postgres reachable');
    } else {
      fail('DB connection', 'Could not connect to brain DB. Set DATABASE_PUBLIC_URL via railway run --service Postgres');
      console.log('\n📋 Summary: 1 check run, 1 FAILED. Brain is NOT healthy.\n');
      process.exit(1);
    }
  } catch (err) {
    fail('DB connection', `Connection error: ${err.message}`);
    console.log('\n📋 Summary: 1 check run, 1 FAILED. Brain is NOT healthy.\n');
    process.exit(1);
  }

  // ── Check 2: brain_entries populated ────────────────────────────────────
  try {
    // Use a broad query to check if the brain has any content
    const results = await impactSearch({ query: 'architecture', limit: 5 });
    const count = results.results?.length || 0;
    if (count > 0) {
      pass('Brain populated', `${count} results for generic query (brain has content)`);
    } else {
      fail('Brain populated', 'No results for generic query — brain may be empty. Run brain:build first.');
    }
  } catch (err) {
    fail('Brain populated', `Query error: ${err.message}`);
  }

  // ── Check 3: Embedding quality (not fake PRNG) ─────────────────────────
  // Real OpenAI embeddings have component magnitudes typically 0.01-0.05.
  // Fake PRNG embeddings have components clustered around ±0.002-0.003
  // (from the (x/2^31 - 0.5) * 0.1 / norm formula).
  // Check: search for a known doc and verify the score is reasonable.
  try {
    const results = await impactSearch({
      query: 'enterprise production standard security boundary authentication',
      limit: 3
    });
    if (results.results && results.results.length > 0) {
      const topScore = results.results[0].score;
      // Real embeddings: top score for a targeted query should be >= 0.3
      // Fake PRNG embeddings: scores cluster around 0.05-0.10 (random noise)
      if (topScore >= 0.25) {
        pass('Embedding quality', `Top score ${topScore.toFixed(3)} — consistent with real OpenAI embeddings`);
      } else if (topScore >= 0.15) {
        // Marginal — could be real but weak match, or partially fake
        console.log(`  ⚠️  Embedding quality: Top score ${topScore.toFixed(3)} — marginal. May need re-embedding.`);
        checks.push({ name: 'Embedding quality', status: 'WARN', detail: `Top score ${topScore.toFixed(3)}` });
      } else {
        fail('Embedding quality',
          `Top score ${topScore.toFixed(3)} — likely fake PRNG embeddings. ` +
          'Re-run brain:build with OPENAI_API_KEY sourced from apps/backend/.env.local');
      }
    } else {
      fail('Embedding quality', 'No results for targeted enterprise query — cannot verify embedding quality');
    }
  } catch (err) {
    fail('Embedding quality', `Query error: ${err.message}`);
  }

  // ── Check 4: Semantic retrieval works ───────────────────────────────────
  // A specific intent should retrieve relevant content (not random noise)
  try {
    const results = await impactSearch({
      query: 'data deletion request user data removal permanent delete',
      limit: 10
    });
    const allText = (results.results || []).map(r =>
      [r.title || '', r.snippet || '', ...(r.concepts || [])].join(' ').toLowerCase()
    ).join(' ');

    const keywords = ['data loss', 'retention', 'delete', 'deletion', 'super_admin', 'e6', 'forever'];
    const found = keywords.filter(kw => allText.includes(kw));

    if (found.length > 0) {
      pass('Semantic retrieval', `Found [${found.join(', ')}] for data-deletion intent — retrieval is semantic`);
    } else {
      fail('Semantic retrieval',
        'No relevant keywords in top-10 results for data-deletion intent. ' +
        'Brain may have fake embeddings or missing content.');
    }
  } catch (err) {
    fail('Semantic retrieval', `Query error: ${err.message}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const passed = checks.filter(c => c.status === 'PASS').length;
  const failed = checks.filter(c => c.status === 'FAIL').length;
  const warned = checks.filter(c => c.status === 'WARN').length;

  console.log(`\n📋 Summary: ${checks.length} checks — ${passed} passed, ${failed} failed, ${warned} warnings`);

  if (exitCode === 0) {
    console.log('✅ Brain is healthy. Safe to proceed with Book Architecture phase.\n');
  } else {
    console.log('❌ Brain is NOT healthy. Fix issues above before proceeding.\n');
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Brain health preflight crashed:', err);
  process.exit(1);
});
