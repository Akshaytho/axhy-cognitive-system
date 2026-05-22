/**
 * Centralized configuration loader for the axhy cognitive system.
 *
 * Reads .axhy/config.json once per process. Falls back to hardcoded defaults
 * if the config file is missing or malformed — system always boots.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from src/shared/ to repo root (axhy-cognitive-system/)
const REPO_ROOT = resolve(__dirname, '..', '..');
const CONFIG_PATH = resolve(REPO_ROOT, '.axhy', 'config.json');

// Hardcoded defaults — used if config file is missing
const DEFAULTS = {
  workspace_roots: [
    '/Users/thotaakshay/eclean_workspace',
    '/Users/thotaakshay/eclean_workspace/axhy-v3',
    '/Users/thotaakshay/eclean_workspace/axhy-cognitive-system',
  ],
  timeouts: {
    approval_window_ms: 900000,       // 15 minutes
    done_approval_window_ms: 1200000, // 20 minutes
    read_window_ms: 600000,           // 10 minutes
  },
  budgets: {
    high_risk_edits: 1,
    medium_risk_edits: 5,
    low_risk_edits: 8,
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
