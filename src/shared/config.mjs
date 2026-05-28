/**
 * Centralized configuration loader for the axhy cognitive system.
 *
 * Reads .axhy/config.json once per process. Falls back to hardcoded defaults
 * if the config file is missing or malformed — system always boots.
 *
 * Also provides centralized REPO_ROOT, REPO_HASH, allHashes(), state file
 * path helpers, and HMAC signing for state file integrity (C1/M1/M3 fixes).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from src/shared/ to repo root (axhy-cognitive-system/)
const COGNITIVE_SYSTEM_ROOT = resolve(__dirname, '..', '..');
const CONFIG_PATH = resolve(COGNITIVE_SYSTEM_ROOT, '.axhy', 'config.json');

// ── Repo root: consistent derivation used by ALL components ──
// Priority: CLAUDE_PROJECT_DIR > AXHY_REPO_ROOT > cwd()
// Previously inconsistent: server.mjs missed CLAUDE_PROJECT_DIR (M3 fix).
const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);

// Hardcoded defaults — used if config file is missing
const DEFAULTS = {
  workspace_roots: [
    '/Users/thotaakshay/eclean_workspace',
    '/Users/thotaakshay/eclean_workspace/axhy-v3',
    '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system',
  ],
  timeouts: {
    approval_window_ms: 7200000,       // 2 hours — session budget (Phase-0 fix)
    done_approval_window_ms: 7200000,  // 2 hours — session budget (Phase-0 fix)
    read_window_ms: 600000,            // 10 minutes
  },
  budgets: {
    // Phase-0 fix: generous per-approval budgets. Sessions run 1-2 hours.
    // check_before_edit still validates intent/evidence/risk per file.
    // check_before_commit is the quality gate that catches violations at commit.
    high_risk_edits: 50,
    medium_risk_edits: 100,
    low_risk_edits: 200,
  },
};

let _cached = null;

function loadConfig() {
  if (_cached) return _cached;

  if (!existsSync(CONFIG_PATH)) {
    _cached = DEFAULTS;
    return _cached;
  }

  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    _cached = {
      workspace_roots: Array.isArray(raw.workspace_roots) ? raw.workspace_roots : DEFAULTS.workspace_roots,
      timeouts: {
        approval_window_ms: raw.timeouts?.approval_window_ms ?? DEFAULTS.timeouts.approval_window_ms,
        done_approval_window_ms: raw.timeouts?.done_approval_window_ms ?? DEFAULTS.timeouts.done_approval_window_ms,
        read_window_ms: raw.timeouts?.read_window_ms ?? DEFAULTS.timeouts.read_window_ms,
      },
      budgets: {
        high_risk_edits: raw.budgets?.high_risk_edits ?? DEFAULTS.budgets.high_risk_edits,
        medium_risk_edits: raw.budgets?.medium_risk_edits ?? DEFAULTS.budgets.medium_risk_edits,
        low_risk_edits: raw.budgets?.low_risk_edits ?? DEFAULTS.budgets.low_risk_edits,
      },
    };
    return _cached;
  } catch {
    _cached = DEFAULTS;
    return _cached;
  }
}

export function getWorkspaceRoots() {
  return loadConfig().workspace_roots;
}

export function getTimeouts() {
  return loadConfig().timeouts;
}

export function getBudgets() {
  return loadConfig().budgets;
}

/** Reset the cache — used in tests to reload config after changes. */
export function resetConfigCache() {
  _cached = null;
}

/** Get the config file path — used in tests. */
export function getConfigPath() {
  return CONFIG_PATH;
}

// ── Centralized repo identity (M1/M3 fix) ──
// Previously duplicated across state-tracker.mjs, pre-edit-guard.mjs,
// server.mjs, and all test files — each with slightly different logic.

export function getRepoRoot() {
  return REPO_ROOT;
}

export function getRepoHash() {
  return REPO_HASH;
}

/**
 * All hash buckets: repo hash + every workspace root hash.
 * State files are fanned out to all buckets on write so they're
 * findable regardless of which cwd the reader runs from.
 */
export function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of getWorkspaceRoots()) {
    set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  }
  return [...set];
}

/**
 * Get the path for a state file by suffix.
 * E.g., getStateFilePath('guardrail-state.json') → '/tmp/axhy-{hash}-guardrail-state.json'
 */
export function getStateFilePath(suffix) {
  return `/tmp/axhy-${REPO_HASH}-${suffix}`;
}

// ── HMAC state file signing (C1 fix) ──
// Prevents forged state files. The secret is deterministic from the repo
// (so all processes — MCP server, hooks — derive the same key) but not
// guessable from outside the filesystem.
//
// Threat model: AI forging state files via bash commands is blocked by
// bash-guard. HMAC catches any forgery that slips past bash-guard (e.g.,
// via a missed command pattern). It does NOT protect against an attacker
// with filesystem access — that's a different threat.

let _hmacSecret = null;

function getHmacSecret() {
  if (_hmacSecret) return _hmacSecret;
  // Derive from package.json content + cognitive system root path.
  // Deterministic across all processes reading from the same repo.
  // Changes if package.json changes (invalidates old state — intentional).
  const pkgPath = resolve(COGNITIVE_SYSTEM_ROOT, 'package.json');
  let pkgContent = '';
  try { pkgContent = readFileSync(pkgPath, 'utf-8'); } catch {}
  _hmacSecret = createHash('sha256')
    .update(pkgContent)
    .update(COGNITIVE_SYSTEM_ROOT)
    .update('axhy-state-integrity-v1')
    .digest('hex');
  return _hmacSecret;
}

/**
 * Sign a state object. Returns a new object with `_sig` field.
 * The signature covers all fields EXCEPT `_sig` itself.
 */
export function signState(state) {
  const { _sig, ...payload } = state; // strip any existing sig
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  const sig = createHmac('sha256', getHmacSecret()).update(json).digest('hex');
  return { ...payload, _sig: sig };
}

/**
 * Verify a signed state object. Returns true if valid.
 * Returns false if missing `_sig` or signature doesn't match.
 */
export function verifyState(state) {
  if (!state || !state._sig) return false;
  const { _sig, ...payload } = state;
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  const expected = createHmac('sha256', getHmacSecret()).update(json).digest('hex');
  const sigBuf = Buffer.from(_sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Read file status across ALL hash buckets (C3 fix).
 * Replaces the /tmp glob with deterministic allHashes() iteration.
 * Returns the most recent timestamp for the given filePath, or 0.
 */
export function getFileReadTimestamp(filePath) {
  let mostRecent = 0;
  for (const h of allHashes()) {
    const candidate = `/tmp/axhy-${h}-read-state.json`;
    if (!existsSync(candidate)) continue;
    try {
      const reads = JSON.parse(readFileSync(candidate, 'utf-8'));
      const ts = reads[filePath];
      if (typeof ts === 'number' && ts > mostRecent) mostRecent = ts;
    } catch {}
  }
  return mostRecent;
}

/**
 * Read the last compaction timestamp from any hash bucket.
 * Written by PostCompact hook (layer-3-compaction/post-compaction.mjs).
 * Returns 0 if no compact has occurred or state file is missing/corrupt.
 */
export function getLastCompactTimestamp() {
  let mostRecent = 0;
  for (const h of allHashes()) {
    const candidate = `/tmp/axhy-${h}-compact-state.json`;
    if (!existsSync(candidate)) continue;
    try {
      const data = JSON.parse(readFileSync(candidate, 'utf-8'));
      const ts = data && typeof data.last_compact_at === 'number' ? data.last_compact_at : 0;
      if (ts > mostRecent) mostRecent = ts;
    } catch {}
  }
  return mostRecent;
}

/**
 * Check if a file was read recently enough to trust its content is in context.
 *
 * Compact-aware mode (preferred): if a compaction has occurred this session,
 * the file must have been read AFTER the last compaction. Content read before
 * compaction is gone from the AI's working context — a re-read is required.
 *
 * Time-window fallback: if no compaction has occurred yet, falls back to the
 * configured read_window_ms (default 10 min) for backward compatibility.
 *
 * Used by both L1 (pre-edit-guard) and L2 (server.mjs) for consistency (H7 fix).
 */
export function wasFileReadRecently(filePath) {
  const readTs = getFileReadTimestamp(filePath);
  if (!readTs) return false;

  const compactTs = getLastCompactTimestamp();

  if (compactTs > 0) {
    // Compact-aware: file must have been read AFTER the last compaction.
    // Content from before compaction is lost from context.
    return readTs > compactTs;
  }

  // No compaction yet this session — fall back to time window.
  return (Date.now() - readTs) < getTimeouts().read_window_ms;
}

/**
 * Read a state file from any hash bucket, returning the most recent.
 * Used for cross-CWD resilience (H3 fix for build state, etc.)
 */
export function readStateFromAny(suffix) {
  let best = null;
  let bestTs = -1;
  for (const h of allHashes()) {
    const candidate = `/tmp/axhy-${h}-${suffix}`;
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
      const ts = parsed && typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      if (ts > bestTs) { best = parsed; bestTs = ts; }
    } catch {}
  }
  return best;
}

/** Reset HMAC secret cache — for tests. */
export function resetHmacSecret() {
  _hmacSecret = null;
}
