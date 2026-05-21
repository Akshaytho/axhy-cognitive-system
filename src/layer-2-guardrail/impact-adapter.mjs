
import { existsSync, readFileSync } from 'node:fs';

let realImpactCheck = null;
let realVectorSearch = null;

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
  try {
    const mod = await import('/Users/thotaakshay/eclean_workspace/axhy-v3/packages/ai-tools/src/vector-knowledge.ts');
    realImpactCheck = mod.impactCheck;
    realVectorSearch = mod.vectorSearch;
    return true;
  } catch {
    return false;
  }
}

export async function impactCheck(changeDescription, persona, riskLevel = 'low') {
  if (isBrainRebuilding()) {
    const result = fallbackResult('Brain is rebuilding — using cached/fallback results', riskLevel);
    result._brainRebuilding = true;
    return result;
  }

  if (realImpactCheck) {
    try {
      const result = await realImpactCheck(changeDescription, persona);
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
  return realImpactCheck !== null;
}
