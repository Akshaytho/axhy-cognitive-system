/**
 * check_before_build — enterprise production preflight (structured fields).
 *
 * Called ONCE before coding begins on a slice. Forces the AI to declare
 * how each applicable enterprise baseline item (E1–E14) will be satisfied
 * using named structured fields instead of E-codes.
 *
 * The structured fields force thinking about WHAT (goal, personas, platforms)
 * before HOW (security, ownership, data loss, etc.). Each concern field
 * maps to one E-item from docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md.
 *
 * Non-deferrable fields (security, ownership, data loss, crash prevention,
 * secrets) require substantive evidence — "will handle later" is rejected.
 *
 * Blocking triggers:
 * - Vague security boundary
 * - Missing tenant/resource ownership
 * - Known crash path accepted as deferred
 * - Secrets not addressed
 * - Data loss path dismissed
 * - Documentation overclaim
 * - "MVP"/"later"/"placeholder"/"good enough" on non-deferrable items
 */

import {
  writeBuildGuardrailState,
  createBuildApprovalState,
} from './state-tracker.mjs';

/**
 * Each structured field maps to one E-item.
 * Context fields (feature_goal, affected_personas, affected_platforms)
 * set the frame but don't map to specific E-items.
 */
const STRUCTURED_FIELDS = {
  // --- Context fields (shorter minimum, no deferral check) ---
  feature_goal: {
    eItem: null,
    label: 'Feature Goal',
    minWords: 10,
    required: true,
    nonDeferrable: false,
    description: 'What the feature does and why it matters to the user',
  },
  affected_personas: {
    eItem: null,
    label: 'Affected Personas',
    minWords: 5,
    required: true,
    nonDeferrable: false,
    description: 'Which personas are affected (worker, supervisor, admin, system)',
  },
  affected_platforms: {
    eItem: null,
    label: 'Affected Platforms',
    minWords: 5,
    required: true,
    nonDeferrable: false,
    description: 'Which platforms (mobile, web, backend, shared)',
  },

  // --- Concern fields (map to E-items, evidence validated) ---
  security_boundary: {
    eItem: 'E1',
    label: 'Security Boundary',
    minWords: 15,
    required: true,
    nonDeferrable: true,
    description: 'How auth + role + ownership is validated on every route',
  },
  tenant_and_resource_ownership: {
    eItem: 'E2',
    label: 'Tenant and Resource Ownership',
    minWords: 15,
    required: true,
    nonDeferrable: true,
    description: 'How companyId filter + resource-level access is enforced',
  },
  rate_limit_or_abuse_boundary: {
    eItem: 'E3',
    label: 'Rate Limiting / Abuse Boundary',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Per-IP (public) and per-user (auth) rate limits',
  },
  source_of_truth: {
    eItem: 'E4',
    label: 'Source of Truth',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'What owns the data shape and lifecycle (state machine, schema, locked doc)',
  },
  lifecycle_or_state_machine_owner: {
    eItem: 'E5',
    label: 'Lifecycle / State Machine Owner',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Which state machine owns the entity lifecycle — no direct DB status updates',
  },
  data_loss_paths: {
    eItem: 'E6',
    label: 'Data Loss Paths',
    minWords: 15,
    required: true,
    nonDeferrable: true,
    description: 'What happens on app kill, network failure, storage failure, permission denial',
  },
  mobile_web_failure_modes: {
    eItem: 'E7',
    label: 'Mobile and Web Failure Modes',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Platform.OS branching, web stubs, storage failure handling',
  },
  app_store_crash_risks: {
    eItem: 'E8',
    label: 'App Store / Crash Risks',
    minWords: 15,
    required: true,
    nonDeferrable: true,
    description: 'Zero crashes in normal operation — every code path must be crash-safe',
  },
  scale_assumption: {
    eItem: 'E9',
    label: 'Scale Assumption',
    minWords: 10,
    required: true,
    nonDeferrable: false,
    description: 'Default 10,000+ users — indexed queries, no N+1, pagination',
    defaultValue: '10,000+ users (default enterprise baseline)',
  },
  documentation_truth: {
    eItem: 'E10',
    label: 'Documentation Truth',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Plan matches code exactly — no fake metadata, no divergence',
  },
  required_tests: {
    eItem: 'E11',
    label: 'Required Tests',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Auth/role/ownership/happy/error tests per route, transition tests per machine',
  },
  error_specificity: {
    eItem: 'E12',
    label: 'Error Specificity',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Specific error codes per failure mode — no generic "something went wrong"',
  },
  secrets_and_credentials: {
    eItem: 'E13',
    label: 'Secrets and Credentials',
    minWords: 15,
    required: true,
    nonDeferrable: true,
    description: 'No credentials in code or bundles — env vars only, bounded presigned URLs',
  },

  // --- Meta fields (process controls) ---
  non_deferrable_summary: {
    eItem: 'E14',
    label: 'Non-Deferrable Summary',
    minWords: 15,
    required: true,
    nonDeferrable: false,
    description: 'Confirmation that security, crash, data loss, secrets, doc truth are all addressed',
  },
  founder_approved_deferrals: {
    eItem: null,
    label: 'Founder-Approved Deferrals',
    minWords: 0,
    required: false,
    nonDeferrable: false,
    description: 'Any items explicitly deferred with founder approval — empty if none',
  },
  required_screenshots: {
    eItem: null,
    label: 'Required Screenshots / Manual Verification',
    minWords: 5,
    required: false,
    nonDeferrable: false,
    description: 'What screens/flows need visual verification at done time',
  },
  known_gaps: {
    eItem: null,
    label: 'Known Gaps',
    minWords: 0,
    required: false,
    nonDeferrable: false,
    description: 'What is NOT covered by this slice — explicit honesty about boundaries',
  },
};

/** Concern field keys — the ones that map to E-items. */
const CONCERN_FIELD_KEYS = Object.entries(STRUCTURED_FIELDS)
  .filter(([, def]) => def.eItem !== null)
  .map(([key]) => key);

/** Context field keys — frame-setting, no E-item mapping. */
const CONTEXT_FIELD_KEYS = ['feature_goal', 'affected_personas', 'affected_platforms'];

/** Non-deferrable field keys — cannot use deferral language. */
const NON_DEFERRABLE_FIELD_KEYS = Object.entries(STRUCTURED_FIELDS)
  .filter(([, def]) => def.nonDeferrable)
  .map(([key]) => key);

/** Minimum word count for concern fields. */
const MIN_EVIDENCE_WORDS = 15;

/** Patterns that indicate deferral language (blocked for non-deferrable fields). */
const DEFERRAL_PATTERNS = [
  /\bwill\s+handle\s+later\b/i,
  /\bdefer(?:red)?\s+to\b/i,
  /\bnext\s+(?:slice|sprint|phase)\b/i,
  /\btodo\b/i,
  /\bnot\s+(?:yet|now)\b/i,
  /\blater\s+(?:slice|phase|sprint)\b/i,
  /\bskip(?:ped|ping)?\s+for\s+(?:now|mvp)\b/i,
  /\bmvp\s+(?:doesn't|does\s+not)\s+(?:need|require)\b/i,
  /\bnot\s+needed\s+for\s+mvp\b/i,
  /\bcan\s+be\s+(?:skip(?:ped)?|ignore[d]?|defer(?:red)?)\b/i,
  /\bout\s+of\s+scope\b/i,
  /\bplaceholder\b/i,
  /\bgood\s+enough\b/i,
  /\bdocumented\s+known\s+issue\b/i,
];

/**
 * Validate a single structured field.
 *
 * @param {string} fieldKey - The field key (e.g., 'security_boundary')
 * @param {object|string|null} entry - The field value
 * @returns {{ valid: boolean, reason?: string, eItem?: string }}
 */
function validateField(fieldKey, entry) {
  const def = STRUCTURED_FIELDS[fieldKey];
  if (!def) {
    return { valid: false, reason: `Unknown field: "${fieldKey}".` };
  }

  // Optional fields can be null/undefined/empty
  if (!def.required && (!entry || (typeof entry === 'string' && entry.trim().length === 0))) {
    return { valid: true, eItem: def.eItem };
  }

  // Required fields must be present
  if (def.required && (!entry || (typeof entry === 'string' && entry.trim().length === 0))) {
    return {
      valid: false,
      reason: `${fieldKey} (${def.label}): Missing — ${def.description}.`,
      eItem: def.eItem,
    };
  }

  // N/A handling (only for concern fields with E-item mapping)
  if (typeof entry === 'object' && entry !== null && entry.status === 'N/A') {
    if (!entry.reason || typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      return {
        valid: false,
        reason: `${fieldKey} (${def.label}): N/A requires a reason (10+ chars) explaining why this item does not apply.`,
        eItem: def.eItem,
      };
    }
    if (def.nonDeferrable) {
      for (const pat of DEFERRAL_PATTERNS) {
        if (pat.test(entry.reason)) {
          return {
            valid: false,
            reason: `${fieldKey} (${def.label}): Non-deferrable field cannot use deferral language ("${entry.reason.match(pat)[0]}"). Either provide evidence or explain concretely why this does not apply.`,
            eItem: def.eItem,
          };
        }
      }
    }
    return { valid: true, eItem: def.eItem, na: true, naReason: entry.reason };
  }

  // String evidence handling
  if (typeof entry === 'string') {
    const words = entry.trim().split(/\s+/);
    if (def.minWords > 0 && words.length < def.minWords) {
      return {
        valid: false,
        reason: `${fieldKey} (${def.label}): Evidence too brief (${words.length} words, need ${def.minWords}+). ${def.description}.`,
        eItem: def.eItem,
      };
    }

    // Non-deferrable fields cannot use deferral language
    if (def.nonDeferrable) {
      for (const pat of DEFERRAL_PATTERNS) {
        if (pat.test(entry)) {
          return {
            valid: false,
            reason: `${fieldKey} (${def.label}): Non-deferrable field uses deferral language ("${entry.match(pat)[0]}"). This must be addressed in the current slice — provide concrete evidence.`,
            eItem: def.eItem,
          };
        }
      }
    }

    return { valid: true, eItem: def.eItem };
  }

  // Object with evidence field
  if (typeof entry === 'object' && entry !== null && entry.evidence) {
    return validateField(fieldKey, entry.evidence);
  }

  // Array handling (for affected_personas, affected_platforms)
  if (Array.isArray(entry)) {
    if (def.minWords > 0 && entry.length === 0) {
      return {
        valid: false,
        reason: `${fieldKey} (${def.label}): Empty array — provide at least one value. ${def.description}.`,
        eItem: def.eItem,
      };
    }
    return { valid: true, eItem: def.eItem };
  }

  return {
    valid: false,
    reason: `${fieldKey} (${def.label}): Invalid format — provide a string, array, or { status: "N/A", reason: "..." }.`,
    eItem: def.eItem,
  };
}

/**
 * Main preflight check. Validates the enterprise checklist for a slice
 * using structured fields.
 *
 * @param {object} args
 * @param {string} args.sliceName - e.g., "worker-d1-s2b-2-capture-pipeline"
 * @param {string} args.planReference - path to the plan doc
 * @param {string} args.sliceScope - 'backend', 'mobile', 'shared', 'full_stack'
 * @param {string[]} args.plannedFiles - files that will be created or modified
 * @param {object} args.structuredFields - structured field values
 * @returns {object} { allowed, reason, ... }
 */
export async function checkBeforeBuild({
  sliceName,
  planReference,
  sliceScope = 'full_stack',
  plannedFiles = [],
  structuredFields = {},
  // Backward compat: accept enterpriseChecklist and convert
  enterpriseChecklist = null,
}) {
  // --- Backward compatibility: convert E1-E14 checklist to structured fields ---
  if (enterpriseChecklist && Object.keys(structuredFields).length === 0) {
    structuredFields = convertChecklistToStructuredFields(enterpriseChecklist);
  }

  // --- Basic validation ---
  if (!sliceName || typeof sliceName !== 'string' || sliceName.trim().length < 3) {
    return {
      allowed: false,
      reason: 'Missing or too-short slice_name. Name the slice being built (e.g., "worker-d1-s2b-2-capture-pipeline").',
    };
  }

  if (!planReference || typeof planReference !== 'string') {
    return {
      allowed: false,
      reason: 'Missing plan_reference. Provide the path to the plan document for this slice.',
    };
  }

  if (plannedFiles.length === 0) {
    return {
      allowed: false,
      reason: 'No planned_files. List every file you intend to create or modify in this slice.',
    };
  }

  const validScopes = ['backend', 'mobile', 'shared', 'full_stack'];
  if (!validScopes.includes(sliceScope)) {
    return {
      allowed: false,
      reason: `Invalid slice_scope "${sliceScope}". Must be one of: ${validScopes.join(', ')}.`,
    };
  }

  // --- Structured field validation ---
  const failures = [];
  const passed = [];
  const naItems = [];

  // Validate all known structured fields
  for (const [fieldKey, def] of Object.entries(STRUCTURED_FIELDS)) {
    const entry = structuredFields[fieldKey];
    const result = validateField(fieldKey, entry);

    if (!result.valid) {
      failures.push(result.reason);
    } else if (result.na) {
      naItems.push({
        field: fieldKey,
        label: def.label,
        eItem: def.eItem,
        reason: result.naReason,
      });
    } else if (entry != null && (typeof entry !== 'string' || entry.trim().length > 0)) {
      passed.push({
        field: fieldKey,
        label: def.label,
        eItem: def.eItem,
      });
    }
  }

  // Check for unknown keys (typos)
  const knownKeys = new Set(Object.keys(STRUCTURED_FIELDS));
  const unknownKeys = Object.keys(structuredFields).filter(k => !knownKeys.has(k));
  if (unknownKeys.length > 0) {
    failures.push(`Unknown field keys: ${unknownKeys.join(', ')}. Valid keys: ${[...knownKeys].join(', ')}.`);
  }

  if (failures.length > 0) {
    return {
      allowed: false,
      reason: 'Enterprise production preflight failed.',
      failures,
      passed: passed.map(p => p.eItem ? `${p.eItem} (${p.label})` : p.label),
      na_items: naItems.map(n => n.eItem ? `${n.eItem} (${n.label}): ${n.reason}` : `${n.label}: ${n.reason}`),
      suggestion: 'Address all failures, then re-call check_before_build. Every required field must be addressed with evidence or a valid N/A reason.',
    };
  }

  // --- All items passed — create build approval state ---
  const state = createBuildApprovalState({
    sliceName,
    planReference,
    sliceScope,
    plannedFiles,
    checklist: {
      passed: passed.filter(p => p.eItem).map(p => p.eItem),
      na: naItems.filter(n => n.eItem).map(n => ({ id: n.eItem, reason: n.reason })),
    },
  });

  writeBuildGuardrailState(state);

  return {
    allowed: true,
    slice_name: sliceName,
    plan_reference: planReference,
    slice_scope: sliceScope,
    planned_files: plannedFiles,
    items_passed: passed.map(p => p.eItem ? `${p.eItem}: ${p.label}` : p.label),
    items_na: naItems.map(n => n.eItem ? `${n.eItem}: ${n.label} — ${n.reason}` : `${n.label} — ${n.reason}`),
    known_gaps: structuredFields.known_gaps || 'None declared',
    expires: '30 minutes',
    note: 'Enterprise preflight passed. You may now proceed with coding. check_before_done will verify these items were addressed.',
  };
}

/**
 * Backward compatibility: convert E1-E14 checklist to structured fields.
 * This allows existing code that passes enterpriseChecklist to still work.
 */
const E_TO_FIELD_MAP = {
  E1: 'security_boundary',
  E2: 'tenant_and_resource_ownership',
  E3: 'rate_limit_or_abuse_boundary',
  E4: 'source_of_truth',
  E5: 'lifecycle_or_state_machine_owner',
  E6: 'data_loss_paths',
  E7: 'mobile_web_failure_modes',
  E8: 'app_store_crash_risks',
  E9: 'scale_assumption',
  E10: 'documentation_truth',
  E11: 'required_tests',
  E12: 'error_specificity',
  E13: 'secrets_and_credentials',
  E14: 'non_deferrable_summary',
};

function convertChecklistToStructuredFields(checklist) {
  const fields = {
    // Provide minimal context fields for backward compat
    feature_goal: 'Legacy E1-E14 checklist converted to structured fields for backward compatibility',
    affected_personas: 'See individual E-item evidence for persona details',
    affected_platforms: 'See slice_scope for platform details',
  };

  for (const [eItem, fieldKey] of Object.entries(E_TO_FIELD_MAP)) {
    if (checklist[eItem] !== undefined) {
      fields[fieldKey] = checklist[eItem];
    }
  }

  return fields;
}

export {
  STRUCTURED_FIELDS,
  CONCERN_FIELD_KEYS,
  CONTEXT_FIELD_KEYS,
  NON_DEFERRABLE_FIELD_KEYS,
  MIN_EVIDENCE_WORDS,
  DEFERRAL_PATTERNS,
  E_TO_FIELD_MAP,
};
