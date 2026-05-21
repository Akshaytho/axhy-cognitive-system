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

  if (TEMPORARY_INDICATORS.some(p => p.test(content))) {
    return {
      category: 'temporary_context',
      reason: 'Contains temporal/ephemeral language',
      ...CATEGORIES.temporary_context,
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

  const hasProduct = PRODUCT_TERMS.some(t => new RegExp(`\\b${t}\\b`, 'i').test(lower));
  const hasCore = CORE_TERMS.some(t => lower.includes(t));

  if (hasProduct) {
    return {
      category: 'product_rule',
      reason: 'Contains product-specific terms',
      ...CATEGORIES.product_rule,
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

export { CATEGORIES, PRODUCT_TERMS, CORE_TERMS };
