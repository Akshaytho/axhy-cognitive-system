import { execFileSync } from 'node:child_process';

const FOUNDER_ENV = 'AXHY_FOUNDER_APPROVED';

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

  if (process.env[FOUNDER_ENV] !== '1') {
    return {
      allowed: false,
      reason: 'Changes to docs/personas/ require founder approval.',
      modified,
      added,
      fix: `${FOUNDER_ENV}=1 git commit ...`,
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

  return { allowed: true, founderApproved: true };
}
