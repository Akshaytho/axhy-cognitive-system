import { readFileSync } from 'node:fs';
import { PRODUCT_TERMS } from '../memory-firewall/classifier.mjs';

const POINTER_EXCEPTION_PATTERN = /PROJECT_ENTRYPOINT\.md|Axhy system/;

export function auditCoreMind(coreMindContent) {
  if (!coreMindContent || typeof coreMindContent !== 'string') {
    return { clean: false, violations: ['CORE_MIND content is empty or missing'] };
  }

  const lines = coreMindContent.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (POINTER_EXCEPTION_PATTERN.test(line)) continue;

    for (const term of PRODUCT_TERMS) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(line)) {
        violations.push({
          line: i + 1,
          term,
          content: line.trim(),
        });
      }
    }
  }

  return {
    clean: violations.length === 0,
    violations,
    scanned_lines: lines.length,
    checked_terms: PRODUCT_TERMS.length,
  };
}

export function auditCoreMindFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return auditCoreMind(content);
}
