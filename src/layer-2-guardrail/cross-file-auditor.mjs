/**
 * Cross-File Auditor — checks argument consistency across call sites.
 *
 * When a function is defined with parameter `workerId` but a caller passes
 * `userId`, this is almost always an entity-type mismatch bug. This auditor
 * finds these cross-file mismatches by:
 *
 * 1. Extracting function signatures from changed files (parameter names + types)
 * 2. Finding call sites in the same changed files
 * 3. Checking if argument names suggest a different entity type than the parameter
 *
 * This caught CRIT-1 in the 2026-05-24 product review: R2 object key used
 * `userId` where `workerId` was expected, breaking every photo upload.
 *
 * Export shape matches dependency-scanner.mjs: single function taking
 * (changedFiles, searchRoot) returning { mismatches: [...] }.
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

/**
 * Entity-type groups. Parameters/arguments whose names contain one of these
 * stems are classified into that entity group. A mismatch is when a parameter
 * belongs to one group but the argument belongs to a different group.
 */
const ENTITY_GROUPS = {
  user: ['userId', 'userIds', 'user_id'],
  worker: ['workerId', 'workerIds', 'worker_id'],
  supervisor: ['supervisorId', 'supervisorIds', 'supervisor_id'],
  company: ['companyId', 'companyIds', 'company_id'],
  tenant: ['tenantId', 'tenantIds', 'tenant_id'],
  visit: ['visitId', 'visitIds', 'visit_id'],
  facility: ['facilityId', 'facilityIds', 'facility_id'],
};

/**
 * Build a reverse lookup: name → group
 */
function buildEntityLookup() {
  const lookup = new Map();
  for (const [group, names] of Object.entries(ENTITY_GROUPS)) {
    for (const name of names) {
      lookup.set(name.toLowerCase(), group);
    }
  }
  return lookup;
}

const ENTITY_LOOKUP = buildEntityLookup();

/**
 * Classify a parameter/argument name into an entity group, or null if generic.
 */
function classifyEntityName(name) {
  const lower = name.toLowerCase();
  // Exact match first
  if (ENTITY_LOOKUP.has(lower)) return ENTITY_LOOKUP.get(lower);
  // Suffix match: check if name ends with a known entity ID
  for (const [group, names] of Object.entries(ENTITY_GROUPS)) {
    for (const entityName of names) {
      if (lower.endsWith(entityName.toLowerCase())) return group;
    }
  }
  return null;
}

/**
 * Extract function/method signatures from a TypeScript/JavaScript file.
 * Returns Map<functionName, {params: [{name, entityGroup}], line}>
 */
function extractSignatures(content) {
  const sigs = new Map();
  const lines = content.split('\n');

  // Match function declarations, arrow functions, and method definitions
  const fnRegex = /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{)/;
  const paramRegex = /\(([^)]*)\)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and type definitions
    if (/^\s*(\/\/|\/\*|\*|type\s|interface\s)/.test(line)) continue;

    const fnMatch = line.match(fnRegex);
    if (!fnMatch) continue;

    const fnName = fnMatch[1] || fnMatch[2] || fnMatch[3];
    if (!fnName) continue;

    // Extract parameters — may span multiple lines, so collect until closing paren
    let paramStr = '';
    const paramStart = line.match(paramRegex);
    if (paramStart) {
      paramStr = paramStart[1];
    } else {
      // Multi-line params — collect up to 5 lines
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
      const multiMatch = block.match(paramRegex);
      if (multiMatch) paramStr = multiMatch[1];
    }

    if (!paramStr.trim()) continue;

    // Parse parameter names (strip types, defaults, destructuring)
    const params = paramStr
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('...'))
      .map((p) => {
        // Handle destructuring: { workerId, companyId }: Params → extract inner names
        const destructMatch = p.match(/\{\s*([^}]+)\}/);
        if (destructMatch) {
          return destructMatch[1].split(',').map((d) => {
            const name = d.trim().split(/\s*[:=]\s*/)[0].trim();
            return { name, entityGroup: classifyEntityName(name) };
          });
        }
        // Simple param: strip type annotation and default
        const name = p.split(/\s*[:=]\s*/)[0].trim();
        return [{ name, entityGroup: classifyEntityName(name) }];
      })
      .flat()
      .filter((p) => p.entityGroup !== null); // Only care about entity-typed params

    if (params.length > 0) {
      sigs.set(fnName, { params, line: i + 1 });
    }
  }

  return sigs;
}

/**
 * Find call sites of known functions and check argument entity-type consistency.
 */
function findMismatches(content, filePath, signatures) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\/|\/\*|\*|type\s|interface\s|import\s)/.test(line)) continue;

    for (const [fnName, sig] of signatures) {
      // Check if this line calls the function
      const callRegex = new RegExp(`\\b${fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
      if (!callRegex.test(line)) continue;

      // Extract the call arguments (look at surrounding lines for object literals)
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

      // Check for named arguments in object literal: fnName({ userId: ... })
      for (const param of sig.params) {
        // Look for a different entity name being passed for this parameter
        const argPattern = new RegExp(`${param.name}\\s*[:=]\\s*(\\w+)`, 'g');
        let match;
        while ((match = argPattern.exec(block)) !== null) {
          const argValue = match[1];
          const argGroup = classifyEntityName(argValue);
          if (argGroup && argGroup !== param.entityGroup) {
            findings.push({
              file: filePath,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              param: param.name,
              paramGroup: param.entityGroup,
              argValue,
              argGroup,
              functionName: fnName,
              context: `${argValue} (${argGroup}) passed as ${param.name} (${param.entityGroup}) in call to ${fnName}`,
            });
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Audit cross-file argument consistency across changed files.
 *
 * @param {string[]} changedFiles - Absolute paths to changed files
 * @param {string} _searchRoot - Root directory (unused currently, reserved for future cross-file search)
 * @returns {{ mismatches: Array<{file, line, snippet, param, paramGroup, argValue, argGroup, functionName, context}> }}
 */
export function auditCrossFileConsistency(changedFiles, _searchRoot) {
  const allSignatures = new Map();
  const tsExtensions = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx']);

  // Phase 1: Extract signatures from all changed files
  for (const filePath of changedFiles) {
    if (!tsExtensions.has(extname(filePath))) continue;
    if (!existsSync(filePath)) continue;

    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }

    const sigs = extractSignatures(content);
    for (const [name, sig] of sigs) {
      allSignatures.set(name, { ...sig, definedIn: filePath });
    }
  }

  if (allSignatures.size === 0) return { mismatches: [] };

  // Phase 2: Check call sites in changed files for mismatches
  const allMismatches = [];

  for (const filePath of changedFiles) {
    if (!tsExtensions.has(extname(filePath))) continue;
    if (!existsSync(filePath)) continue;

    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }

    const mismatches = findMismatches(content, filePath, allSignatures);
    allMismatches.push(...mismatches);
  }

  return { mismatches: allMismatches };
}
