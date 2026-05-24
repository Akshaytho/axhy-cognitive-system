import { getBudgets } from '../shared/config.mjs';

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

const DONE_MEMO_PATTERNS = [
  /done-memo.*\.md$/i,
  /handoff\/done-memos\/.*\.md$/,
];

const GUARDRAIL_OPTIONAL_PATTERNS = [
  /docs\/research\/.*\.md$/,
  /docs\/findings\/.*\.md$/,
  /README\.md$/,
  /docs\/audits\/.*\.md$/,
  /docs\/retros\/.*\.md$/,
];

export function classifyRisk(filePath) {
  // Phase-0 fix: read budgets from config instead of hardcoding.
  // Session-wide budgets (2hr window, generous edit counts) replace the
  // per-edit budget that exhausted mid-work. check_before_commit is the
  // quality gate that catches violations at commit time.
  const budgets = getBudgets();
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(filePath)) {
      return { level: "high", editsAllowed: budgets.high_risk_edits };
    }
  }
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(filePath)) {
      return { level: "medium", editsAllowed: budgets.medium_risk_edits };
    }
  }
  return { level: "low", editsAllowed: budgets.low_risk_edits };
}

export function isPlanFile(filePath) {
  const result = PLAN_GUARDED_PATTERNS.some(p => p.test(filePath));
  return result;
}

export function isDoneMemo(filePath) {
  const result = DONE_MEMO_PATTERNS.some(p => p.test(filePath));
  return result;
}

export function isGuardrailOptional(filePath) {
  for (const pattern of GUARDRAIL_OPTIONAL_PATTERNS) {
    if (pattern.test(filePath)) {
      return true;
    }
  }
  return false;
}
