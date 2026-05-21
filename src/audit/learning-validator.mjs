import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function validateCommitMessage(messageFile, stagedLearnings) {
  if (!stagedLearnings || stagedLearnings.length === 0) return { valid: true };

  const message = readFileSync(messageFile, 'utf-8');
  const hasKeyword = /learning|broke rule|broken_rule|violation/i.test(message);

  if (!hasKeyword) {
    return {
      valid: false,
      reason: 'Learning files staged but commit message missing rule-break reference. Include "Learning:" or "Broke rule:" in message.',
      staged: stagedLearnings,
    };
  }
  return { valid: true };
}

export function validateLearningFrontmatter(learningPath) {
  if (!existsSync(learningPath)) return { valid: false, reason: 'File not found' };
  const content = readFileSync(learningPath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { valid: false, reason: 'Missing frontmatter' };

  const fm = fmMatch[1];
  const issues = [];

  if (!fm.includes('check_pattern:')) issues.push('Missing check_pattern');
  if (!fm.includes('check_paths:')) issues.push('Missing check_paths');
  if (!fm.includes('broken_rule:')) issues.push('Missing broken_rule');

  return issues.length === 0
    ? { valid: true }
    : { valid: false, reason: issues.join(', '), issues };
}

export function validatePatternReach(learningPath, repoRoot) {
  if (!existsSync(learningPath)) return { valid: true };
  const content = readFileSync(learningPath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { valid: true };

  const fm = fmMatch[1];
  const patternMatch = fm.match(/^check_pattern:\s*["']?(.+?)["']?\s*$/m);
  const pathsMatch = fm.match(/^check_paths:\s*["']?(.+?)["']?\s*$/m);
  const expectMatch = fm.match(/^check_expect:\s*["']?(.+?)["']?\s*$/m);

  if (!patternMatch || !pathsMatch) return { valid: true };

  const pattern = patternMatch[1].trim();
  const checkPaths = pathsMatch[1].trim().split(',').map(p => p.trim());
  const expect = expectMatch ? expectMatch[1].trim() : 'none';

  let matchCount = 0;
  for (const cdir of checkPaths) {
    const fullDir = join(repoRoot, cdir);
    if (!existsSync(fullDir)) continue;
    try {
      const result = execFileSync('grep', ['-rn', '--include=*.ts', '--include=*.tsx', pattern, fullDir], {
        encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024,
      });
      matchCount += result.trim().split('\n').filter(Boolean).length;
    } catch {}
  }

  if (matchCount === 0 && expect !== 'exists') {
    return { valid: false, reason: `Pattern '${pattern}' matches 0 files — may be fake`, matchCount };
  }
  if (matchCount > 30) {
    return { valid: false, reason: `Pattern '${pattern}' matches ${matchCount} lines — too broad`, matchCount };
  }

  return { valid: true, matchCount };
}

export function findLearningWarnings(stagedFiles, learningDir) {
  if (!existsSync(learningDir)) return [];
  const warnings = [];

  const learnings = readdirSync(learningDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  for (const lf of learnings) {
    const content = readFileSync(join(learningDir, lf), 'utf-8');
    const pathsMatch = content.match(/^check_paths:\s*["']?(.+?)["']?\s*$/m);
    const ruleMatch = content.match(/^broken_rule:\s*["']?(.+?)["']?\s*$/m);
    if (!pathsMatch || !ruleMatch) continue;

    const checkPaths = pathsMatch[1].trim().split(',').map(p => p.trim());
    for (const staged of stagedFiles) {
      for (const cp of checkPaths) {
        if (staged.includes(cp)) {
          warnings.push({ file: staged, rule: ruleMatch[1].trim(), learning: lf });
          break;
        }
      }
    }
  }
  return warnings;
}
