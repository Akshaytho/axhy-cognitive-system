import { execFileSync } from 'node:child_process';
import {
  verifyChallengeResponse,
  issueChallenge,
  getResponseFilePath,
} from '../shared/challenge-response.mjs';

export function checkPersonaDocChanges(repoRoot) {
  let modified = [];
  let added = [];

  try {
    const modOut = execFileSync('git', ['diff', '--cached', '--diff-filter=M', '--name-only', '--', 'docs/personas/*.md', 'docs/personas/**/*.md'], {
      cwd: repoRoot, encoding: 'utf-8',
    }).trim();
    if (modOut) modified = modOut.split('\n').filter(Boolean);
  } catch {}

  try {
    const addOut = execFileSync('git', ['diff', '--cached', '--diff-filter=A', '--name-only', '--', 'docs/personas/*.md', 'docs/personas/**/*.md'], {
      cwd: repoRoot, encoding: 'utf-8',
    }).trim();
    if (addOut) added = addOut.split('\n').filter(Boolean);
  } catch {}

  if (modified.length === 0 && added.length === 0) {
    return { allowed: true };
  }

  // Challenge-response gate (replaces dead AXHY_FOUNDER_APPROVED env var).
  const challenge = verifyChallengeResponse('persona-doc');
  if (!challenge.verified) {
    const allFiles = [...modified, ...added];
    const token = issueChallenge('persona-doc', allFiles);
    const responseFile = getResponseFilePath();
    return {
      allowed: false,
      reason: 'Changes to docs/personas/ require founder approval (challenge-response).',
      modified,
      added,
      challengeToken: token,
      fix: `Founder runs in terminal within 2 minutes:\n    echo ${token} > ${responseFile}\n\nThen AI re-runs: git commit ...`,
    };
  }

  const missingAmendment = [];
  for (const file of modified) {
    try {
      const diff = execFileSync('git', ['diff', '--cached', '--', file], {
        cwd: repoRoot, encoding: 'utf-8',
      });
      if (!diff.includes('+## Amendment')) {
        missingAmendment.push(file);
      }
    } catch {}
  }

  if (missingAmendment.length > 0) {
    return {
      allowed: false,
      reason: 'Modified persona docs need amendment trail.',
      missingAmendment,
      fix: 'Add "## Amendment YYYY-MM-DD" section with: What changed, Why, Requested by',
    };
  }

  return { allowed: true, founderApproved: true, mechanism: 'challenge-response' };
}
