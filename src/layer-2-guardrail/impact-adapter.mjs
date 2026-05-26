
import { existsSync, readFileSync } from 'node:fs';

let realImpactCheck = null;
let realVectorSearch = null;

// v2 functions (brain_entries table, 3-layer API)
let v2ImpactCheck = null;
let v2Search = null;
let v2Timeline = null;
let v2Get = null;
let v2ActivitySearch = null;
let v2IsEnabled = null;
let v2EmbeddingMode = null;

const BRAIN_LOCK = '/tmp/axhy-brain-rebuilding.lock';
const LOCK_STALE_MS = 10 * 60 * 1000;

function isBrainRebuilding() {
  if (!existsSync(BRAIN_LOCK)) return false;
  try {
    const lock = JSON.parse(readFileSync(BRAIN_LOCK, 'utf-8'));
    if (Date.now() - lock.started > LOCK_STALE_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export async function loadRealImpactCheck() {
  const axhyV3Root = process.env.AXHY_V3_ROOT || (process.env.HOME + '/eclean_workspace/axhy-v3');

  // Try loading v2 (brain_entries)
  try {
    const v2Mod = await import(axhyV3Root + '/packages/ai-tools/src/impact-check-v2.ts');
    v2ImpactCheck = v2Mod.impactCheckV2;
    v2Search = v2Mod.search;
    v2Timeline = v2Mod.timeline;
    v2Get = v2Mod.get;
    v2ActivitySearch = v2Mod.activitySearch;
    v2IsEnabled = v2Mod.isV2Enabled;
    v2EmbeddingMode = v2Mod.embeddingMode;
  } catch {
    // v2 not available — will use v1
  }

  // Always load v1 (axhy_brain.chunks) as fallback
  try {
    const mod = await import(axhyV3Root + '/packages/ai-tools/src/vector-knowledge.ts');
    realImpactCheck = mod.impactCheck;
    realVectorSearch = mod.vectorSearch;
    return true;
  } catch {
    return v2ImpactCheck !== null;
  }
}

function useV2() {
  return v2ImpactCheck !== null && v2IsEnabled !== null && v2IsEnabled();
}

export async function impactCheck(changeDescription, persona, riskLevel = 'low') {
  if (isBrainRebuilding()) {
    const result = fallbackResult('Brain is rebuilding — using cached/fallback results', riskLevel);
    result._brainRebuilding = true;
    return result;
  }

  // v2 path: brain_entries with authority-aware retrieval
  if (useV2()) {
    try {
      const result = await v2ImpactCheck(changeDescription);
      result._version = 'v2';
      if (v2EmbeddingMode) result._embedding_mode = v2EmbeddingMode();
      return result;
    } catch (err) {
      // Fall through to v1
    }
  }

  // v1 path: axhy_brain.chunks
  if (realImpactCheck) {
    try {
      const result = await realImpactCheck(changeDescription, persona);
      result._version = 'v1';
      if (v2EmbeddingMode) result._embedding_mode = v2EmbeddingMode();
      return result;
    } catch (err) {
      return fallbackResult(`impactCheck DB error: ${err.message}`, riskLevel);
    }
  }
  return fallbackResult('No DB connection — running without vector search', riskLevel);
}

export async function vectorSearch(query, options = {}) {
  if (realVectorSearch) {
    try {
      return await realVectorSearch({ query, ...options });
    } catch {
      return [];
    }
  }
  return [];
}

// B2: Estimate token cost of snippet results vs full content retrieval.
// Rough heuristic: ~4 chars per token for English text.
function estimateTokenEconomics(results) {
  if (!results || results.length === 0) return null;
  const snippetChars = results.reduce((sum, r) => sum + (r.content || '').length, 0);
  const indexTokens = Math.ceil(snippetChars / 4);
  // Full content is typically 10-25x larger than the 200-char snippets
  const avgFullSize = 2000; // typical doc section is ~2000 chars
  const fullContentTokens = Math.ceil((results.length * avgFullSize) / 4);
  const ratio = fullContentTokens > 0 ? Math.round(fullContentTokens / Math.max(indexTokens, 1)) : 1;
  return {
    index_tokens_returned: indexTokens,
    full_content_tokens_available: fullContentTokens,
    savings_ratio: `${ratio}x`,
    suggestion: results.length > 3
      ? `Call impact_get([ids]) for the 2-3 most relevant entries only. Getting all ${results.length} would cost ~${fullContentTokens} tokens.`
      : 'Few results — safe to get all if needed.',
  };
}

// v2 search/timeline/get exports for MCP tools
export async function impactSearch(args) {
  if (!v2Search) return { error: 'impact-check-v2 not loaded', results: [] };
  try {
    const results = await v2Search(args);
    const response = { results };
    // B2: Token economics — teach the AI about retrieval cost
    const economics = estimateTokenEconomics(results);
    if (economics) response.token_economics = economics;
    // Embedding mode visibility — Claude can verify real vs fake
    if (v2EmbeddingMode) response._embedding_mode = v2EmbeddingMode();
    return response;
  } catch (err) {
    return { error: err.message, results: [], _embedding_mode: v2EmbeddingMode ? v2EmbeddingMode() : 'unknown' };
  }
}

export async function impactTimeline(args) {
  if (!v2Timeline) return { error: 'impact-check-v2 not loaded', results: [] };
  try {
    return { results: await v2Timeline(args) };
  } catch (err) {
    return { error: err.message, results: [] };
  }
}

export async function impactGet(args) {
  if (!v2Get) return { error: 'impact-check-v2 not loaded', results: [] };
  try {
    return { results: await v2Get(args.ids || []) };
  } catch (err) {
    return { error: err.message, results: [] };
  }
}

export async function impactActivitySearch(args) {
  if (!v2ActivitySearch) return { error: 'impact-check-v2 not loaded', results: [] };
  try {
    return { results: await v2ActivitySearch(args) };
  } catch (err) {
    return { error: err.message, results: [] };
  }
}

function fallbackResult(reason, riskLevel = 'low') {
  if (riskLevel === 'high' || riskLevel === 'medium') {
    return {
      hasConflicts: true,
      hardBlocks: [{
        rule: 'Product Brain unavailable',
        reason: `${reason}. Cannot safely approve ${riskLevel}-risk edit without vector search.`,
      }],
      softWarnings: [],
      staleChunks: [],
      allRelevant: [],
      _fallback: true,
      _fallbackReason: reason,
      _blocked: true,
    };
  }
  return {
    hasConflicts: false,
    hardBlocks: [],
    softWarnings: [{ rule: 'Product Brain unavailable', reason }],
    staleChunks: [],
    allRelevant: [],
    _fallback: true,
    _fallbackReason: reason,
  };
}

export function isConnected() {
  return realImpactCheck !== null || v2ImpactCheck !== null;
}
