const HIGH_RISK_PATTERNS = [
  /CLAUDE\.md$/,
  /CORE_MIND\.md$/,
  /PROJECT_ENTRYPOINT\.md$/,
  /\.claude\/settings\.json$/,
  /settings\.json$/,
  /\.husky\//,
  /mcp-guardrail\//,
  /cognitive-system\//,
  /session-audit\.ts$/,
  /brain-builder\.ts$/,
  /vector-knowledge\.ts$/,
  /docs\/locked\//,
  /prisma\/schema/,
  /\.env/,
  /memory-firewall/,
  /anti-corruption/,
  /\.mcp\.json$/,
  /\.claude\/settings.*\.json$/,
];

const MEDIUM_RISK_PATTERNS = [
  /\/routes\//,
  /state-machine/,
  /-machine\.ts$/,
  /packages\/ai-tools\/src\//,
  /docs\/learnings\//,
  /docs\/decisions\//,
  /docs\/protocols\//,
];

const PLAN_GUARDED_PATTERNS = [
  /docs\/plans\/.*\.md$/,
  /docs\/personas\/.*\.md$/,
  /handoff\/(?!done-memos\/).*\.md$/,
  /SPRINT_PLAN\.md$/i,
  /IMPLEMENTATION_PLAN\.md$/i,
];

const GUARDRAIL_OPTIONAL_PATTERNS = [
  /docs\/research\/.*\.md$/,
  /docs\/findings\/.*\.md$/,
  /handoff\/done-memos\/.*\.md$/,
  /README\.md$/,
  /docs\/audits\/.*\.md$/,
  /docs\/done-memos\/.*\.md$/,
];

export function classifyRisk(filePath) {
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(filePath)) return { level: 'high', editsAllowed: 1 };
  }
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(filePath)) return { level: 'medium', editsAllowed: 2 };
  }
  return { level: 'low', editsAllowed: 3 };
}

export function isPlanFile(filePath) {
  return PLAN_GUARDED_PATTERNS.some(p => p.test(filePath));
}

export function isGuardrailOptional(filePath) {
  for (const pattern of GUARDRAIL_OPTIONAL_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }
  return false;
}
