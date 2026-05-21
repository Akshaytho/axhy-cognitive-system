const PERSONA_KEYWORDS = {
  admin: ['admin', 'company_admin', 'dashboard', 'tenant', 'overview', 'attention', 'system page', 'admin-web', 'eclean-admin'],
  superadmin: ['super_admin', 'superadmin', 'super admin', 'platform', 'multi-tenant', 'all companies', 'system settings'],
  supervisor: ['supervisor', 'today tab', 'summary tab', 'updates tab', 'site card', 'assign', 'attendance', 'mark absent', 'swap'],
  worker: ['worker', 'capture', 'timer', 'check-in', 'check-out', 'photo', 'voice', 'worker-mobile', 'my schedule'],
  hr: ['hr', 'human resource', 'payroll', 'salary', 'leave', 'onboarding', 'training'],
};

const PATH_PERSONA_MAP = {
  'apps/admin-web': 'admin',
  'apps/backend/src/app/api/admin': 'admin',
  'apps/backend/src/app/api/super': 'superadmin',
  'apps/supervisor-mobile': 'supervisor',
  'apps/worker-mobile': 'worker',
  'packages/state-machines/src/assignment': 'supervisor',
  'packages/state-machines/src/swap': 'supervisor',
  'packages/state-machines/src/worker': 'worker',
  'packages/state-machines/src/site': 'admin',
  'packages/state-machines/src/visit': 'worker',
  'packages/ai-tools': 'combined',
  'packages/shared-schema': 'combined',
  'packages/ui-tokens': 'combined',
  'docs/locked': 'combined',
  'docs/personas': 'combined',
};

export function resolveFromIntent(intent) {
  if (!intent) return [];
  const lower = intent.toLowerCase();
  const matches = [];

  for (const [persona, keywords] of Object.entries(PERSONA_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matches.push(persona);
        break;
      }
    }
  }

  return [...new Set(matches)];
}

export function resolveFromPaths(filePaths) {
  if (!filePaths?.length) return [];
  const matches = [];

  for (const fp of filePaths) {
    for (const [pathPrefix, persona] of Object.entries(PATH_PERSONA_MAP)) {
      if (fp.includes(pathPrefix)) {
        matches.push(persona);
        break;
      }
    }
  }

  return [...new Set(matches)];
}

export function resolvePersona(intent, filePaths = []) {
  const fromIntent = resolveFromIntent(intent);
  const fromPaths = resolveFromPaths(filePaths);

  const combined = [...new Set([...fromIntent, ...fromPaths])];

  if (combined.length === 0) {
    return { personas: ['combined'], confidence: 'low', source: 'fallback' };
  }

  if (combined.length === 1) {
    return { personas: combined, confidence: 'high', source: fromIntent.length ? 'intent' : 'path' };
  }

  return { personas: combined, confidence: 'medium', source: 'mixed' };
}
