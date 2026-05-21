const MIN_WORD_COUNT = 30;

const REQUIRED_ASPECTS = [
  {
    name: 'purpose',
    patterns: [
      /\b(to |in order to |so that |because |for |adding |removing |changing |fixing |updating |implementing |creating )/i,
    ],
  },
  {
    name: 'affected_behavior',
    patterns: [
      /\b(will |should |changes? |affects? |modif|updat|alter|impact|breaks? |enables? |disables? )/i,
    ],
  },
  {
    name: 'risk',
    patterns: [
      /\b(risk|careful|danger|break|regression|side.?effect|concern|worry|caveat|assumption|depend|migration)/i,
    ],
  },
];

export function validateIntent(intent) {
  if (!intent || typeof intent !== 'string') {
    return {
      valid: false,
      reason: 'Intent is required. Describe WHAT you want to change, WHY, and what RISK exists.',
    };
  }

  const words = intent.trim().split(/\s+/);
  if (words.length < MIN_WORD_COUNT) {
    return {
      valid: false,
      reason: `Intent too short (${words.length} words, need ${MIN_WORD_COUNT}+). Include: purpose, affected behavior, and risk assessment.`,
    };
  }

  const missing = [];
  for (const aspect of REQUIRED_ASPECTS) {
    const found = aspect.patterns.some(p => p.test(intent));
    if (!found) missing.push(aspect.name);
  }

  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Intent missing: ${missing.join(', ')}. A valid intent describes purpose (why), affected behavior (what changes), and risk (what could break).`,
    };
  }

  return { valid: true };
}
