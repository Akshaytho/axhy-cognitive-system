/**
 * Evidence Validator — replaces keyword-based intent validation with
 * structured reasoning evidence.
 *
 * Instead of checking whether the intent string contains magic words like
 * "risk" or "affects", this validates that the AI has provided concrete,
 * falsifiable reasoning about its intended change.
 *
 * Evidence requirements scale with risk:
 *   LOW:    files_read only (prove you looked at the code)
 *   MEDIUM: + risk_if_wrong, why_this_path_is_safe
 *   HIGH:   + invariants_preserved, what_would_make_me_stop
 */

const MIN_FIELD_WORDS = 10;

// What a file path reference looks like in evidence text
const SPECIFIC_REFERENCE = /(?:[\w.-]+\.(?:ts|tsx|mjs|js|json|md|prisma)|line\s+\d+|function\s+\w+|\w+\(\)|\/[\w/.-]+)/i;

const EVIDENCE_SCHEMA = {
  high: ['invariants_preserved', 'risk_if_wrong', 'what_would_make_me_stop', 'files_read'],
  medium: ['risk_if_wrong', 'why_this_path_is_safe', 'files_read'],
  low: ['files_read'],
};

const FIELD_DESCRIPTIONS = {
  invariants_preserved: 'What existing behavior stays intact and why your change does not break it',
  risk_if_wrong: 'What breaks if your assumptions are incorrect',
  what_would_make_me_stop: 'Conditions that would cause you to halt and re-evaluate',
  why_this_path_is_safe: 'Evidence that this approach will not cause harm',
  files_read: 'List of files you actually read before forming this intent',
};

/**
 * Validate structured reasoning evidence for a given risk level.
 *
 * @param {object} evidence - The reasoning evidence object
 * @param {string} riskLevel - 'high', 'medium', or 'low'
 * @returns {{ valid: boolean, reason?: string, missing?: string[] }}
 */
export function validateEvidence(evidence, riskLevel) {
  if (!evidence || typeof evidence !== 'object') {
    const required = EVIDENCE_SCHEMA[riskLevel] || EVIDENCE_SCHEMA.low;
    return {
      valid: false,
      reason: `Structured reasoning evidence required for ${riskLevel}-risk files.`,
      missing: required,
      guidance: buildGuidance(required),
    };
  }

  const requiredFields = EVIDENCE_SCHEMA[riskLevel] || EVIDENCE_SCHEMA.low;
  const missing = [];
  const tooShort = [];
  const lacksSpecificity = [];

  for (const field of requiredFields) {
    const value = evidence[field];

    // files_read is an array
    if (field === 'files_read') {
      if (!Array.isArray(value) || value.length === 0) {
        missing.push(field);
      }
      continue;
    }

    // All other fields are strings
    if (!value || typeof value !== 'string') {
      missing.push(field);
      continue;
    }

    const words = value.trim().split(/\s+/);
    if (words.length < MIN_FIELD_WORDS) {
      tooShort.push({ field, wordCount: words.length });
      continue;
    }

    // Check for at least one specific reference (file path, function name, line number)
    if (!SPECIFIC_REFERENCE.test(value)) {
      lacksSpecificity.push(field);
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Missing evidence fields: ${missing.join(', ')}.`,
      missing,
      guidance: buildGuidance(missing),
    };
  }

  if (tooShort.length > 0) {
    const details = tooShort.map(t => `${t.field} (${t.wordCount} words, need ${MIN_FIELD_WORDS}+)`);
    return {
      valid: false,
      reason: `Evidence too brief: ${details.join('; ')}. Provide substantive reasoning, not placeholders.`,
    };
  }

  if (lacksSpecificity.length > 0) {
    return {
      valid: false,
      reason: `Evidence lacks specificity in: ${lacksSpecificity.join(', ')}. Include at least one concrete reference (file path, function name, or line number).`,
    };
  }

  return { valid: true };
}

/**
 * Get the required evidence fields for a given risk level.
 */
export function getRequiredFields(riskLevel) {
  return EVIDENCE_SCHEMA[riskLevel] || EVIDENCE_SCHEMA.low;
}

/**
 * Build human-readable guidance for missing fields.
 */
function buildGuidance(missingFields) {
  return missingFields.map(field => {
    const desc = FIELD_DESCRIPTIONS[field] || field;
    return `  ${field}: ${desc}`;
  }).join('\n');
}
