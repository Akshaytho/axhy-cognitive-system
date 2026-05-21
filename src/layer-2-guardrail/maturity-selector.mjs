const MODES = {
  child: {
    description: 'New to this area — ask before assuming, read everything first',
    triggerWords: ['unfamiliar', 'first time', 'never seen', 'new to'],
  },
  student: {
    description: 'Learning the patterns — follow existing conventions strictly',
    triggerWords: ['learning', 'following', 'convention', 'pattern'],
  },
  professional: {
    description: 'Competent execution — apply known patterns, flag unknowns',
    triggerWords: [],
  },
  senior: {
    description: 'Confident with context — make judgment calls, explain tradeoffs',
    triggerWords: ['refactor', 'architecture', 'tradeoff', 'redesign'],
  },
  founder: {
    description: 'Deep domain knowledge — challenge assumptions, protect invariants',
    triggerWords: ['invariant', 'constraint', 'business rule', 'domain'],
  },
  observer: {
    description: 'Read-only analysis — investigate without changing anything',
    triggerWords: ['audit', 'review', 'investigate', 'analyze', 'check'],
  },
  critic: {
    description: 'Adversarial review — find flaws, attack assumptions, stress-test',
    triggerWords: ['adversarial', 'stress', 'attack', 'vulnerability', 'exploit'],
  },
};

const FILE_MATURITY_MAP = [
  { pattern: /CLAUDE\.md$|CORE_MIND|\.claude\/settings/, mode: 'founder' },
  { pattern: /docs\/locked\//, mode: 'founder' },
  { pattern: /prisma\/schema/, mode: 'senior' },
  { pattern: /\.husky\/|hooks\//, mode: 'senior' },
  { pattern: /session-audit|brain-builder|vector-knowledge/, mode: 'senior' },
  { pattern: /state-machine|-machine\.ts$/, mode: 'senior' },
  { pattern: /\/routes\//, mode: 'professional' },
  { pattern: /docs\/learnings\/|docs\/decisions\//, mode: 'observer' },
  { pattern: /\/components\/|\/utils\//, mode: 'professional' },
  { pattern: /\.test\.|\.spec\./, mode: 'professional' },
];

const CHANGE_TYPE_MAP = {
  audit: 'observer',
  review: 'observer',
  security_review: 'critic',
  adversarial_review: 'critic',
  new_feature: 'professional',
  bug_fix: 'professional',
  refactor: 'senior',
  schema_change: 'senior',
  config_change: 'founder',
  core_change: 'founder',
};

export function suggestMaturity({ filePath, changeType, intent }) {
  if (changeType && CHANGE_TYPE_MAP[changeType]) {
    return {
      mode: CHANGE_TYPE_MAP[changeType],
      reason: `Change type "${changeType}" suggests ${CHANGE_TYPE_MAP[changeType]} mode`,
      ...MODES[CHANGE_TYPE_MAP[changeType]],
    };
  }

  if (filePath) {
    for (const entry of FILE_MATURITY_MAP) {
      if (entry.pattern.test(filePath)) {
        return {
          mode: entry.mode,
          reason: `File "${filePath}" maps to ${entry.mode} mode`,
          ...MODES[entry.mode],
        };
      }
    }
  }

  if (intent) {
    for (const [mode, config] of Object.entries(MODES)) {
      if (config.triggerWords.some(w => intent.toLowerCase().includes(w))) {
        return {
          mode,
          reason: `Intent contains "${config.triggerWords.find(w => intent.toLowerCase().includes(w))}" — suggesting ${mode} mode`,
          ...config,
        };
      }
    }
  }

  return {
    mode: 'professional',
    reason: 'Default mode — no specific signals detected',
    ...MODES.professional,
  };
}

export { MODES };
