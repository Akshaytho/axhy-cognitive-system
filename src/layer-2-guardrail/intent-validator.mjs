/**
 * Intent Validator — simplified.
 *
 * Validates that the intent string meets minimum quality standards.
 * Keyword-based pattern matching was removed (Goodhart's Law: it trained
 * vocabulary performance, not genuine reasoning). Structured reasoning
 * evidence is now validated separately by evidence-validator.mjs.
 *
 * What remains: length check (forces the AI to write enough to think)
 * and basic presence validation.
 */

const MIN_WORD_COUNT = 30;

export function validateIntent(intent) {
  if (!intent || typeof intent !== 'string') {
    return {
      valid: false,
      reason: 'Intent is required. Describe WHAT you want to change and WHY.',
    };
  }

  const words = intent.trim().split(/\s+/);
  if (words.length < MIN_WORD_COUNT) {
    return {
      valid: false,
      reason: `Intent too short (${words.length} words, need ${MIN_WORD_COUNT}+). Describe what you are changing, why, and what could go wrong.`,
    };
  }

  return { valid: true };
}
