import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx']);
const DOC_EXTENSIONS = new Set(['.md']);

const CODE_REF_PATTERNS = [
  /`([a-zA-Z][\w/.:-]+\.(ts|tsx|mjs|js|jsx))`/g,
  /`([a-zA-Z]\w+)\(\)`/g,
  /`([A-Z]\w+)`/g,
  /\b(src\/[\w/.-]+)\b/g,
  /\b(packages\/[\w/.-]+)\b/g,
  /\b(apps\/[\w/.-]+)\b/g,
];

export function scanDocForCodeRefs(docPath) {
  const content = readFileSync(docPath, 'utf-8');
  const refs = new Set();

  for (const pattern of CODE_REF_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      refs.add(match[1]);
    }
  }

  return [...refs];
}

export function checkRefExists(ref, repoRoot) {
  const fullPath = join(repoRoot, ref);
  if (existsSync(fullPath)) return { exists: true, type: 'path' };

  if (ref.includes('(')) {
    const funcName = ref.replace('()', '');
    try {
      const result = execFileSync('grep', ['-rl', `function ${funcName}\\|export.*${funcName}`, '--include=*.ts', '--include=*.tsx', '--include=*.mjs', '.'], {
        cwd: repoRoot, encoding: 'utf-8', timeout: 5000,
      }).trim();
      if (result) return { exists: true, type: 'function', foundIn: result.split('\n')[0] };
    } catch {}
  }

  if (/^[A-Z]\w+$/.test(ref)) {
    try {
      const result = execFileSync('grep', ['-rl', `class ${ref}\\|type ${ref}\\|interface ${ref}\\|export.*${ref}`, '--include=*.ts', '--include=*.tsx', '.'], {
        cwd: repoRoot, encoding: 'utf-8', timeout: 5000,
      }).trim();
      if (result) return { exists: true, type: 'type', foundIn: result.split('\n')[0] };
    } catch {}
  }

  return { exists: false };
}

export function auditDoc(docPath, repoRoot) {
  const refs = scanDocForCodeRefs(docPath);
  const stale = [];
  const valid = [];

  for (const ref of refs) {
    const check = checkRefExists(ref, repoRoot);
    if (check.exists) {
      valid.push({ ref, ...check });
    } else {
      stale.push(ref);
    }
  }

  return {
    docPath: relative(repoRoot, docPath),
    totalRefs: refs.length,
    staleRefs: stale,
    validRefs: valid,
    isStale: stale.length > 0,
    stalePct: refs.length > 0 ? Math.round((stale.length / refs.length) * 100) : 0,
  };
}

export function auditDirectory(docDir, repoRoot, options = {}) {
  const { recursive = true, threshold = 50 } = options;
  const results = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        walk(full);
      } else if (entry.isFile() && DOC_EXTENSIONS.has(extname(entry.name))) {
        const result = auditDoc(full, repoRoot);
        if (result.totalRefs > 0) {
          results.push(result);
        }
      }
    }
  }

  if (existsSync(docDir)) walk(docDir);

  const flagged = results.filter(r => r.stalePct >= threshold);
  return {
    scanned: results.length,
    flagged: flagged.length,
    docs: results.sort((a, b) => b.stalePct - a.stalePct),
    flaggedDocs: flagged,
  };
}

export function getDocAge(docPath, repoRoot) {
  try {
    const lastModified = execFileSync('git', ['log', '-1', '--format=%aI', '--', docPath], {
      cwd: repoRoot, encoding: 'utf-8', timeout: 5000,
    }).trim();
    if (!lastModified) return null;
    const age = Date.now() - new Date(lastModified).getTime();
    return { lastModified, daysOld: Math.floor(age / 86400000) };
  } catch {
    return null;
  }
}
