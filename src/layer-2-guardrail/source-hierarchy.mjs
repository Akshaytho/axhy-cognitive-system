
const SOURCE_TIERS = [
  { tier: 1, name: 'locked_docs', patterns: [/docs\/locked\//] },
  { tier: 2, name: 'state_machines', patterns: [/packages\/state-machines\/src\//] },
  { tier: 2, name: 'prisma_schema', patterns: [/prisma\/schema\.prisma/] },
  { tier: 2, name: 'existing_routes', patterns: [/apps\/(backend|mobile|admin-web)\/src\/routes\//] },
  { tier: 2, name: 'existing_code', patterns: [/apps\/(backend|mobile|admin-web)\/src\//] },
  { tier: 2, name: 'shared_packages', patterns: [/packages\/(shared-schema|ui-tokens)\/src\//] },
  { tier: 3, name: 'canonical_plan', patterns: [/MVP_V2_ALIGNED_PLAN\.md/, /DO_NOT_BUILD_MVP\.md/] },
  { tier: 4, name: 'persona_docs', patterns: [/docs\/personas\//] },
  { tier: 5, name: 'sprint_plans', patterns: [/SPRINT_PLAN\.md/i, /docs\/plans\//] },
  { tier: 5, name: 'implementation_plans', patterns: [/IMPLEMENTATION_PLAN\.md/i] },
  { tier: 6, name: 'external_research', patterns: [/docs\/research\//, /docs\/findings\//] },
];

export function classifySource(filePath) {
  for (const tier of SOURCE_TIERS) {
    if (tier.patterns.some(p => p.test(filePath))) {
      return { tier: tier.tier, name: tier.name };
    }
  }
  return { tier: 7, name: 'unknown' };
}

export function validateSourceHierarchy(sourceDocs) {
  const classified = sourceDocs.map(doc => ({
    path: doc,
    ...classifySource(doc),
  }));

  const warnings = [];
  const errors = [];

  const hasPersonaDocs = classified.some(d => d.tier === 4);
  const hasArchitecture = classified.some(d => d.tier === 2);

  if (hasPersonaDocs && !hasArchitecture) {
    errors.push({
      type: 'persona_without_architecture',
      message: 'Persona docs used as source without checking existing architecture (state machines, Prisma schema, routes). Persona docs are NOT implementation truth.',
      affected: classified.filter(d => d.tier === 4).map(d => d.path),
    });
  }

  const hasSprintPlan = classified.some(d => d.tier === 5);
  const hasHigherAuth = classified.some(d => d.tier <= 3);

  if (hasSprintPlan && !hasHigherAuth) {
    warnings.push({
      type: 'sprint_without_authority',
      message: 'Sprint/implementation plan used without locked docs, architecture, or canonical plan as authority source.',
      affected: classified.filter(d => d.tier === 5).map(d => d.path),
    });
  }

  const hasExternal = classified.some(d => d.tier === 6);
  if (hasExternal && !hasHigherAuth) {
    warnings.push({
      type: 'external_without_validation',
      message: 'External research used without higher-authority source for validation.',
      affected: classified.filter(d => d.tier === 6).map(d => d.path),
    });
  }

  return { classified, warnings, errors, valid: errors.length === 0 };
}

export { SOURCE_TIERS };
