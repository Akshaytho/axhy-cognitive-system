/**
 * Dependency Scanner — one-hop import/dependent analysis.
 *
 * For each changed file:
 *   - Imports: what THIS file depends on
 *   - Dependents: what depends on THIS file (via grep across the codebase)
 *
 * Flags:
 *   - Changed file's dependents that were NOT also changed (potential
 *     signature mismatch — caller wasn't updated)
 *   - Broken imports (file imports something that doesn't exist)
 *
 * v1 uses regex-based import detection. This is approximate and conservative.
 * Upgrade path: TypeScript compiler API for AST-accurate import graphs.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';

const SOURCE_EXTS = ['.ts', '.tsx', '.mjs', '.js', '.jsx'];

// Match: import x from 'y', import { x } from 'y', import 'y'
const IMPORT_REGEX = /^\s*import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/gm;
const REQUIRE_REGEX = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Strip backtick template literal CONTENT before regex scanning.
 * Calibration fix: test files have `const content = \`import { foo } from './foo';\``
 * — those are test fixtures, not real imports. Replace template content with
 * empty templates, preserving line breaks so other tooling stays line-accurate.
 */
function stripTemplateLiterals(content) {
  return content.replace(/`(?:\\.|[^`\\])*`/gs, (match) => {
    const newlines = (match.match(/\n/g) || []).length;
    return '``' + '\n'.repeat(newlines);
  });
}

function extractImports(content) {
  const imports = new Set();
  // Calibration fix: strip template literals so `import...` inside tests isn't matched
  const cleaned = stripTemplateLiterals(content);
  let match;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(cleaned)) !== null) {
    imports.add(match[1]);
  }
  REQUIRE_REGEX.lastIndex = 0;
  while ((match = REQUIRE_REGEX.exec(cleaned)) !== null) {
    imports.add(match[1]);
  }
  return [...imports];
}

/**
 * Resolve a relative import to an absolute file path on disk.
 * Returns null if the resolved file doesn't exist (broken import).
 */
function resolveImport(importPath, fromFile) {
  // Only handle relative imports — external packages are not tracked
  if (!importPath.startsWith('.')) return null;

  const baseDir = dirname(fromFile);
  const resolved = resolve(baseDir, importPath);

  // Try exact path first
  if (existsSync(resolved)) {
    try {
      if (statSync(resolved).isFile()) return resolved;
    } catch {}
  }

  // Try with each known extension
  for (const ext of SOURCE_EXTS) {
    const withExt = resolved + ext;
    if (existsSync(withExt)) return withExt;
  }

  // Try as a directory with index file
  for (const ext of SOURCE_EXTS) {
    const indexPath = resolve(resolved, 'index' + ext);
    if (existsSync(indexPath)) return indexPath;
  }

  return null; // broken import
}

/**
 * Walk a directory tree collecting source files.
 * Used to build the dependent graph.
 */
function collectSourceFiles(rootDir, maxFiles = 5000) {
  const files = [];
  const stack = [rootDir];

  while (stack.length && files.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      // Skip noise
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'dist' || entry.name === 'build') continue;
      if (entry.name === '_archive') continue;

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && SOURCE_EXTS.includes(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/**
 * Find files that import a given target file.
 * One-hop search across the source tree.
 */
function findDependents(targetFile, searchRoot) {
  const dependents = [];
  const sourceFiles = collectSourceFiles(searchRoot);

  for (const file of sourceFiles) {
    if (file === targetFile) continue;
    let content;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }

    const imports = extractImports(content);
    for (const imp of imports) {
      if (!imp.startsWith('.')) continue;
      const resolved = resolveImport(imp, file);
      if (resolved === targetFile) {
        dependents.push(file);
        break;
      }
    }
  }
  return dependents;
}

/**
 * Scan a set of changed files for dependency-related findings.
 *
 * Returns findings grouped by category:
 *   - broken_imports: file imports something that doesn't resolve
 *   - untouched_dependents: changed file has dependents that weren't also changed
 */
export function scanDependencies(changedFiles, searchRoot) {
  const findings = {
    broken_imports: [],
    untouched_dependents: [],
  };

  const changedSet = new Set(changedFiles.map(f => resolve(f)));

  for (const filePath of changedFiles) {
    if (!existsSync(filePath)) continue;
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }

    // Broken imports
    const imports = extractImports(content);
    for (const imp of imports) {
      if (!imp.startsWith('.')) continue;
      const resolved = resolveImport(imp, filePath);
      if (resolved === null) {
        findings.broken_imports.push({
          file: filePath,
          import: imp,
          finding_id: `broken_import:${filePath}:${imp}`,
        });
      }
    }

    // Dependents that weren't changed
    const dependents = findDependents(resolve(filePath), searchRoot);
    const untouched = dependents.filter(d => !changedSet.has(d));
    if (untouched.length > 0) {
      findings.untouched_dependents.push({
        file: filePath,
        dependents: untouched,
        finding_id: `untouched_dependents:${filePath}`,
        note: 'These files import the changed file. If you changed its signature/exports, they may need updating.',
      });
    }
  }

  return findings;
}

export { extractImports, resolveImport, findDependents };
