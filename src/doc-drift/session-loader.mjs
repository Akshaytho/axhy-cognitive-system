import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolvePersona } from '../personas/resolver.mjs';

const MEMORY_BASE = '/Users/thotaakshay/.claude/projects/-Users-thotaakshay-eclean-workspace/memory';
const V3_MEMORY = join(MEMORY_BASE, 'v3');

const ALWAYS_LOAD = [
  join(MEMORY_BASE, 'MEMORY.md'),
  join(V3_MEMORY, 'MEMORY_V3.md'),
];

export function getAlwaysLoadFiles() {
  const files = [...ALWAYS_LOAD];

  const v3Dir = V3_MEMORY;
  if (existsSync(v3Dir)) {
    for (const f of readdirSync(v3Dir)) {
      if (f.startsWith('feedback_') && f.endsWith('.md')) {
        files.push(join(v3Dir, f));
      }
    }
  }

  const baseDir = MEMORY_BASE;
  if (existsSync(baseDir)) {
    for (const f of readdirSync(baseDir)) {
      if (f.startsWith('feedback_') && f.endsWith('.md')) {
        files.push(join(baseDir, f));
      }
    }
  }

  return files.filter(f => existsSync(f));
}

export function getPersonaFiles(intent, filePaths = []) {
  const personaDir = '/Users/thotaakshay/eclean_workspace/axhy-v3/docs/personas';
  if (!existsSync(personaDir)) return [];

  const resolved = resolvePersona(intent, filePaths);
  const files = [];

  for (const persona of resolved.personas) {
    const dir = join(personaDir, persona);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.md')) {
        files.push(join(dir, f));
      }
    }
  }

  if (resolved.personas.length > 1 || resolved.confidence === 'low') {
    const combinedDir = join(personaDir, 'combined');
    if (existsSync(combinedDir)) {
      for (const f of readdirSync(combinedDir)) {
        if (f.endsWith('.md')) {
          files.push(join(combinedDir, f));
        }
      }
    }
  }

  return files;
}

export function buildSessionManifest(intent, filePaths = []) {
  const always = getAlwaysLoadFiles();
  const persona = getPersonaFiles(intent, filePaths);

  const seen = new Set();
  const deduped = [];
  for (const f of [...always, ...persona]) {
    if (!seen.has(f)) {
      seen.add(f);
      deduped.push(f);
    }
  }

  return {
    files: deduped,
    alwaysCount: always.length,
    personaCount: persona.length,
    totalCount: deduped.length,
  };
}
