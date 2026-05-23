
const CATEGORIES = {
  core_principle: {
    destination: 'CORE_MIND (rare)',
    approval: 'founder_explicit',
    description: 'Universal reasoning principle — never product-specific',
  },
  product_rule: {
    destination: 'docs/learnings or feedback',
    approval: 'auto_via_audit',
    description: 'Axhy product-specific rule or constraint',
  },
  project_memory: {
    destination: 'memory/v3/project_*.md',
    approval: 'auto',
    description: 'Project status, who is doing what, timeline',
  },
  temporary_context: {
    destination: 'session_only',
    approval: 'none',
    description: 'Ephemeral context that does not persist',
  },
  external_research: {
    destination: 'candidate_needs_validation',
    approval: 'review_test_approve',
    description: 'Research from external sources — must be validated before use',
  },
  candidate_learning: {
    destination: 'docs/learnings/candidate/',
    approval: 'audit_validates',
    description: 'Potential learning that needs review',
  },
  rejected: {
    destination: 'archived_never_loaded',
    approval: 'none',
    description: 'Deprecated or incorrect knowledge',
  },
};

const PRODUCT_TERMS = [
  'worker', 'workers', 'supervisor', 'supervisors',
  'visit', 'visits', 'cleaning', 'r6', 'proof-first',
  'route-hardening', 'facility', 'facilities',
  'tenant', 'tenants', 'axhy', 'eclean',
  'assignment', 'assignments', 'attendance', 'swap', 'swaps',
  'living.?doc', 'policy', 'policies',
];

const CORE_TERMS = [
  'reasoning', 'confidence', 'maturity mode', 'core mind',
  'anti-corruption', 'guardrail', 'memory firewall',
  'non-human', 'lived experience', 'assumption',
];

const EXTERNAL_INDICATORS = [
  /\b(according to|research shows|study|paper|article|blog|stack.?overflow)\b/i,
  /\b(gpt|chatgpt|gemini|copilot|claude said)\b/i,
  /\bhttps?:\/\//i,
];

const TEMPORARY_INDICATORS = [
  /\b(right now|currently|at the moment|this session|today's)\b/i,
  /\b(in progress|wip|todo|tmp|temp)\b/i,
];

export function classifyKnowledge(content, source = '') {
  if (!content || typeof content !== 'string') {
    return { category: 'rejected', reason: 'Empty or invalid content' };
  }

  const lower = content.toLowerCase();

  const hasProduct = PRODUCT_TERMS.some(t => new RegExp(`\\b${t}\\b`, 'i').test(lower));
  const hasCore = CORE_TERMS.some(t => lower.includes(t));

  if (hasProduct) {
    return {
      category: 'product_rule',
      reason: 'Contains product-specific terms',
      ...CATEGORIES.product_rule,
    };
  }

  if (EXTERNAL_INDICATORS.some(p => p.test(content))) {
    return {
      category: 'external_research',
      reason: 'Contains external source indicators — must be validated before use',
      ...CATEGORIES.external_research,
      validation_path: 'candidate note → reviewed → tested/validated → approved learning',
    };
  }

  if (hasCore) {
    return {
      category: 'core_principle',
      reason: 'Contains core reasoning terms without product terms — requires founder approval',
      ...CATEGORIES.core_principle,
      requires_founder_approval: true,
    };
  }

  if (TEMPORARY_INDICATORS.some(p => p.test(content))) {
    return {
      category: 'temporary_context',
      reason: 'Contains temporal/ephemeral language',
      ...CATEGORIES.temporary_context,
    };
  }

  if (/\b(sprint|milestone|deadline|blocked|deployed|shipped)\b/i.test(lower)) {
    return {
      category: 'project_memory',
      reason: 'Contains project status language',
      ...CATEGORIES.project_memory,
    };
  }

  return {
    category: 'candidate_learning',
    reason: 'Classification unclear — defaulting to candidate (never Core Principle)',
    ...CATEGORIES.candidate_learning,
  };
}

export function validateCorePrinciplePromotion(content) {
  const lower = content.toLowerCase();
  const hasProduct = PRODUCT_TERMS.some(t => new RegExp(`\\b${t}\\b`, 'i').test(lower));

  if (hasProduct) {
    return {
      allowed: false,
      reason: 'Content contains product terms and cannot be a Core Principle.',
      contaminating_terms: PRODUCT_TERMS.filter(t => new RegExp(`\\b${t}\\b`, 'i').test(lower)),
    };
  }

  return {
    allowed: true,
    requires_founder_approval: true,
    reason: 'Eligible for Core Principle — but requires explicit founder approval.',
  };
}

/**
 * Validate that a candidate learning does not attempt to weaken enterprise
 * production standards. The enterprise baseline (E1–E14) defined in
 * docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md is non-negotiable for
 * certain categories. Candidate learnings that use deferral language
 * targeting these categories are blocked.
 *
 * @param {string} content - The learning content to validate
 * @returns {{ allowed: boolean, reason?: string, matched_patterns?: string[] }}
 */
export function validateEnterpriseStandardWeakening(content) {
  if (!content || typeof content !== 'string') {
    return { allowed: true };
  }

  const lower = content.toLowerCase();

  // Enterprise baseline domains that cannot be weakened
  const PROTECTED_DOMAINS = [
    { domain: 'security', patterns: [/\bauth(?:entication|orization)?\b/, /\brole\s+(?:check|gate|guard)\b/, /\btrust\s+boundar/] },
    { domain: 'ownership', patterns: [/\btenant\s+isolation\b/, /\bcompanyId\s+filter\b/, /\bresource\s+ownership\b/, /\bmulti.?tenant\b/] },
    { domain: 'crash prevention', patterns: [/\bcrash\s+prevent/, /\bapp\s+store\s+reliab/, /\bzero\s+crash/, /\bunhandled\s+exception/] },
    { domain: 'data loss', patterns: [/\bdata\s+loss\s+prevent/, /\bpersist(?:ence|s)?\s+to\s+disk\b/, /\bapp\s+kill\b/, /\bnetwork\s+fail/] },
    { domain: 'secrets', patterns: [/\bcredential/, /\bapi\s+key/, /\bsecret/, /\b\.env\b/, /\b\.mcp\.json\b/] },
    { domain: 'documentation truth', patterns: [/\bdoc(?:umentation)?\s+truth\b/, /\bplan\s+match(?:es)?\s+code\b/] },
  ];

  // Deferral/weakening language
  const WEAKENING_PATTERNS = [
    /\bnot\s+(?:needed|necessary|required)\s+(?:for|in)\s+mvp\b/i,
    /\bskip\s+(?:for|in)\s+mvp\b/i,
    /\bmvp\s+(?:doesn't|does\s+not)\s+(?:need|require)\b/i,
    /\bover.?engineer/i,
    /\btoo\s+strict\b/i,
    /\bunnecessar(?:y|ily)\s+(?:strict|complex|overhead)\b/i,
    /\bcan\s+(?:be\s+)?(?:skip(?:ped)?|ignore[d]?|defer(?:red)?)\b/i,
    /\bnot\s+worth\s+(?:the|it)\b/i,
    /\boverkill\b/i,
  ];

  const matchedDomains = [];
  const matchedWeakening = [];

  for (const { domain, patterns } of PROTECTED_DOMAINS) {
    for (const pat of patterns) {
      if (pat.test(lower)) {
        matchedDomains.push(domain);
        break;
      }
    }
  }

  if (matchedDomains.length === 0) {
    return { allowed: true };
  }

  for (const pat of WEAKENING_PATTERNS) {
    const match = lower.match(pat);
    if (match) {
      matchedWeakening.push(match[0]);
    }
  }

  if (matchedWeakening.length === 0) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Candidate learning attempts to weaken enterprise production standards in: ${matchedDomains.join(', ')}. ` +
      `Weakening language detected: "${matchedWeakening.join('", "')}". ` +
      'Enterprise baseline items (security, ownership, crash prevention, data loss, secrets, documentation truth) ' +
      'cannot be weakened by learnings. See docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md.',
    matched_domains: matchedDomains,
    matched_patterns: matchedWeakening,
  };
}

export { CATEGORIES, PRODUCT_TERMS, CORE_TERMS };
