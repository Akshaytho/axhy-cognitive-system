/**
 * Scans plan content for anti-patterns that contradict existing architecture.
 * Used by check_before_plan (pre-write) and session audit (post-hoc).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const AXHY_V3_ROOT = process.env.AXHY_V3_ROOT || (process.env.HOME + '/eclean_workspace/axhy-v3');
const STATE_MACHINES_DIR = resolve(AXHY_V3_ROOT, 'packages/state-machines/src');

const ANTI_PATTERNS = [
  {
    name: 'enum_field_for_states',
    pattern: /\b(enum\s+field|enum\s+column|status\s+enum|state\s+enum)\b/gi,
    message: 'Uses "enum field/column" language. If a state machine exists for this entity, state is managed by the machine, not a raw enum.',
  },
  {
    name: 'direct_status_update',
    pattern: /\b(direct\s+(?:DB|database)\s+(?:\w+\s+){0,2}(?:update|write|set))\b/gi,
    message: 'Mentions direct DB/status update. Status mutations must go through state machine transition functions.',
  },
  {
    name: 'prisma_state_update',
    pattern: /prisma\.\w+\.update\(\s*\{[^}]*state\b/gi,
    message: 'Shows prisma.x.update with state field. State changes must go through the machine transition function.',
  },
  {
    name: 'server_side_status',
    pattern: /\bserver[- ]side\s+status\b/gi,
    message: 'Uses "server-side status" language. Status is managed by XState v5 machines, not server-side enum fields.',
  },
  {
    name: 'raw_status_assignment',
    pattern: /\bstatus\s*[:=]\s*['"`](ACTIVE|INACTIVE|PENDING|COMPLETED|CANCELLED|APPROVED|REJECTED)\b/gi,
    message: 'Hardcodes status assignment. State transitions must use machine events, not direct assignments.',
  },
  {
    name: 'stays_as_enum',
    pattern: /\b(stay|stays|remain|remains)\s+(server[- ]side\s+)?(as\s+)?enum\s+field/gi,
    message: 'States entities "stay as enum fields" — contradicts state machine discipline if machines exist for these entities.',
  },
];

const NEGATION_CONTEXT_TOKENS = /\b(no|not|never|n't|neither|nor|without|avoid|avoids|avoided|forbidden|wrong|incorrect|superseded|contradicts?|correction|phrasing\s+is|originally\s+said|the\s+canonical\s+doc\s+says|must\s+not|should\s+not|do\s+not|don't)\b/i;

const AFFIRMATION_BEFORE_MATCH = /\b(must|should|shall|need(s|ed)?\s+to|will|always)\b[^.]{0,80}$/i;

function isMatchInBacktickSpan(line, posInLine) {
  const before = line.slice(0, posInLine);
  const backtickCount = (before.match(/`/g) || []).length;
  return backtickCount % 2 === 1;
}

function isMatchInDoubleQuoteSpan(content, matchStart, matchLen) {
  const before = content.slice(Math.max(0, matchStart - 400), matchStart);
  const after = content.slice(matchStart + matchLen, Math.min(content.length, matchStart + matchLen + 400));
  const lastOpen = before.lastIndexOf('"');
  if (lastOpen === -1) return false;
  const afterLastOpen = before.slice(lastOpen + 1);
  if (afterLastOpen.includes('"')) return false;
  const nextClose = after.indexOf('"');
  if (nextClose === -1) return false;
  const beforeNextClose = after.slice(0, nextClose);
  if (beforeNextClose.includes('"')) return false;
  return true;
}

function hasNegationWithoutAffirmation(textBefore) {
  if (!NEGATION_CONTEXT_TOKENS.test(textBefore)) return false;
  const hasAffirmation = AFFIRMATION_BEFORE_MATCH.test(textBefore) && !/\bnot\b|n't\b/i.test(textBefore);
  return !hasAffirmation;
}

function shouldSkipMatch(content, matchStart, matchText) {
  const lineStart = content.lastIndexOf('\n', matchStart - 1) + 1;
  const lineEndRaw = content.indexOf('\n', matchStart);
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw;
  const line = content.slice(lineStart, lineEnd);
  const posInLine = matchStart - lineStart;

  const textBeforeOnLine = line.slice(0, posInLine);
  if (hasNegationWithoutAffirmation(textBeforeOnLine)) return true;

  const inBackticks = isMatchInBacktickSpan(line, posInLine);
  const inDoubleQuotes = isMatchInDoubleQuoteSpan(content, matchStart, matchText.length);
  if (inBackticks || inDoubleQuotes) {
    const ctxBefore = content.slice(Math.max(0, matchStart - 400), matchStart);
    if (hasNegationWithoutAffirmation(ctxBefore)) return true;
  }

  return false;
}

export function getExistingMachines() {
  const machines = [];
  if (!existsSync(STATE_MACHINES_DIR)) return machines;

  try {
    const files = readdirSync(STATE_MACHINES_DIR);
    for (const file of files) {
      if (file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'index.ts') {
        const name = file.replace('.ts', '');
        machines.push({
          name: `${name}Machine`,
          file: resolve(STATE_MACHINES_DIR, file),
          entity: name,
        });
      }
    }
  } catch {}

  return machines;
}

export function auditPlanContent(content, filePath = '') {
  const violations = [];
  const machines = getExistingMachines();
  const machineEntities = machines.map(m => m.entity);

  const lines = content.split('\n');

  for (const antiPattern of ANTI_PATTERNS) {
    antiPattern.pattern.lastIndex = 0;
    let match;
    while ((match = antiPattern.pattern.exec(content)) !== null) {
      if (shouldSkipMatch(content, match.index, match[0])) {
        continue;
      }

      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const lineContent = lines[lineNum - 1]?.trim() || '';

      const contextStart = Math.max(0, lineNum - 6);
      const contextEnd = Math.min(lines.length, lineNum + 5);
      const context = lines.slice(contextStart, contextEnd).join(' ');

      const relatedMachine = machineEntities.find(entity => {
        const entityPattern = new RegExp(`\\b${entity}\\b`, 'i');
        return entityPattern.test(context);
      });

      violations.push({
        pattern: antiPattern.name,
        message: antiPattern.message,
        line: lineNum,
        lineContent,
        matchedText: match[0],
        relatedMachine: relatedMachine ? `${relatedMachine}Machine` : null,
        severity: relatedMachine ? 'error' : 'warning',
      });
    }
  }

  return {
    filePath,
    violations,
    existingMachines: machines.map(m => ({ name: m.name, file: m.file })),
    hasErrors: violations.some(v => v.severity === 'error'),
    hasWarnings: violations.some(v => v.severity === 'warning'),
  };
}

export function auditPlanFile(filePath) {
  if (!existsSync(filePath)) {
    return { filePath, violations: [], error: 'File not found' };
  }
  const content = readFileSync(filePath, 'utf-8');
  return auditPlanContent(content, filePath);
}

export { ANTI_PATTERNS };
