export function calculateConfidence({ riskLevel, fileWasRead, testsExist, hasWarnings, hasHardBlocks, intentValid }) {
  if (hasHardBlocks) {
    return {
      level: 'blocked',
      reason: 'Hard blocks from locked constraints prevent this change.',
    };
  }

  let score = 100;
  const reasons = [];

  if (riskLevel === 'high') {
    score -= 30;
    reasons.push('high-risk file');
  } else if (riskLevel === 'medium') {
    score -= 15;
    reasons.push('medium-risk file');
  }

  if (!fileWasRead) {
    score -= 25;
    reasons.push('file not read recently');
  }

  if (!testsExist) {
    score -= 20;
    reasons.push('no tests found');
  }

  if (hasWarnings) {
    score -= 10;
    reasons.push('warnings from impact check');
  }

  if (!intentValid) {
    score -= 20;
    reasons.push('intent validation concerns');
  }

  let level;
  if (score >= 80) level = 'high';
  else if (score >= 50) level = 'medium';
  else level = 'low';

  return {
    level,
    score,
    reason: reasons.length > 0 ? `Confidence reduced by: ${reasons.join(', ')}` : 'All checks passed',
  };
}
