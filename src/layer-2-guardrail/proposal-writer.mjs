/**
 * Proposal Writer — C2: writes auto-skip proposals for founder approval.
 *
 * When a scanner pattern accumulates enough accepted challenges to warrant
 * an auto-skip exception, this module writes a structured proposal to
 * docs/scanner-proposals/. The proposal sits inert until the founder
 * explicitly approves it via the approve_scanner_exception MCP tool (C3).
 *
 * Without founder approval, auto-skip NEVER activates. This is a hard
 * safety constraint — the AI learns what's noise, but only the founder
 * can authorize silencing a scanner rule.
 *
 * Proposal structure:
 *   - proposal_id: unique identifier
 *   - pattern_id: which scanner pattern this applies to
 *   - evidence: array of accepted challenge entries that justify this
 *   - skip_rule: { file_pattern, code_shape } — what to skip
 *   - risk_assessment: why this is safe to skip
 *   - approved: false (until founder approves)
 *   - approved_at: null (set on approval)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clusterAcceptedChallenges, COGNITIVE_ROOT } from './challenge-log.mjs';

const PROPOSALS_DIR = resolve(COGNITIVE_ROOT, 'docs', 'scanner-proposals');

const SKIP_PROPOSAL_THRESHOLD = 3;

/**
 * Check if any patterns have reached the threshold for a skip proposal.
 * Writes proposals for patterns that qualify but don't already have one.
 *
 * @returns {Array<{ proposal_id, pattern_id, status }>} proposals written
 */
export function generateProposals() {
  if (process.env.LEARNED_EXCEPTIONS_ENABLED !== 'true') return [];

  const clusters = clusterAcceptedChallenges();
  const written = [];

  for (const [patternId, cluster] of clusters) {
    if (cluster.count < SKIP_PROPOSAL_THRESHOLD) continue;

    // Check if a proposal already exists for this pattern
    if (proposalExistsFor(patternId)) continue;

    const proposal = buildProposal(patternId, cluster);
    writeProposal(proposal);
    written.push({
      proposal_id: proposal.proposal_id,
      pattern_id: patternId,
      status: 'pending_approval',
    });
  }

  return written;
}

/**
 * Check if a proposal already exists for a pattern_id.
 */
function proposalExistsFor(patternId) {
  if (!existsSync(PROPOSALS_DIR)) return false;

  let files;
  try {
    files = readdirSync(PROPOSALS_DIR).filter(f => f.endsWith('.json'));
  } catch {
    return false;
  }

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(PROPOSALS_DIR, file), 'utf-8'));
      if (data.pattern_id === patternId) return true;
    } catch {
      // Skip malformed files
    }
  }

  return false;
}

/**
 * Build a proposal object from a challenge cluster.
 */
function buildProposal(patternId, cluster) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const proposalId = `${dateStr}-${patternId}`;

  // Derive file pattern from contexts — find common directory/extension
  const contexts = [...cluster.contexts];
  const filePattern = deriveFilePattern(contexts);

  // Build risk assessment from challenge evidence
  const explanations = cluster.challenges.map(c => c.explanation).filter(Boolean);
  const riskAssessment = explanations.length > 0
    ? `Pattern "${patternId}" was successfully challenged ${cluster.count} times with substantive evidence. ` +
      `Common reason: ${explanations[0].slice(0, 200)}`
    : `Pattern "${patternId}" has ${cluster.count} accepted challenges.`;

  return {
    proposal_id: proposalId,
    pattern_id: patternId,
    created_at: now.toISOString(),
    challenge_count: cluster.count,
    evidence: cluster.challenges.map(c => ({
      timestamp: c.timestamp,
      file_path: c.file_path,
      line_number: c.line_number,
      explanation: c.explanation,
      finding_id: c.finding_id,
    })),
    skip_rule: {
      file_pattern: filePattern,
      code_shape: null, // Future: pattern-specific code shape matching
    },
    risk_assessment: riskAssessment,
    approved: false,
    approved_at: null,
    approved_by: null,
  };
}

/**
 * Derive a file pattern regex string from a set of file paths.
 * Conservative: if paths share a common directory or extension, use that.
 * Otherwise, use a catch-all that requires manual refinement.
 */
function deriveFilePattern(filePaths) {
  if (filePaths.length === 0) return '$.^'; // matches nothing

  // Check if all files share a common extension
  const extensions = new Set(filePaths.map(f => {
    const dot = f.lastIndexOf('.');
    return dot !== -1 ? f.slice(dot) : '';
  }).filter(Boolean));

  if (extensions.size === 1) {
    const ext = [...extensions][0].replace('.', '\\.');
    return `${ext}$`;
  }

  // Check if all files share a common directory prefix
  const dirs = filePaths.map(f => {
    const lastSlash = f.lastIndexOf('/');
    return lastSlash !== -1 ? f.slice(0, lastSlash) : '';
  }).filter(Boolean);

  if (dirs.length > 0) {
    // Find longest common prefix
    let common = dirs[0];
    for (const dir of dirs.slice(1)) {
      while (!dir.startsWith(common) && common.length > 0) {
        common = common.slice(0, common.lastIndexOf('/'));
      }
    }
    if (common.length > 3) return common.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return '$.^'; // matches nothing — founder must refine
}

/**
 * Write a proposal to disk as a JSON file.
 */
function writeProposal(proposal) {
  if (!existsSync(PROPOSALS_DIR)) {
    try { mkdirSync(PROPOSALS_DIR, { recursive: true }); } catch { /* ignore */ }
  }

  const filePath = resolve(PROPOSALS_DIR, `${proposal.proposal_id}.json`);
  writeFileSync(filePath, JSON.stringify(proposal, null, 2) + '\n');
}

/**
 * C3: Approve a proposal by ID. Sets approved=true and approved_at.
 *
 * @param {string} proposalId - The proposal_id to approve
 * @returns {{ success: boolean, reason: string, proposal?: object }}
 */
export function approveProposal(proposalId) {
  if (!existsSync(PROPOSALS_DIR)) {
    return { success: false, reason: 'No proposals directory found.' };
  }

  const filePath = resolve(PROPOSALS_DIR, `${proposalId}.json`);
  if (!existsSync(filePath)) {
    return { success: false, reason: `Proposal not found: ${proposalId}` };
  }

  let proposal;
  try {
    proposal = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { success: false, reason: `Failed to read proposal: ${err.message}` };
  }

  if (proposal.approved) {
    return { success: false, reason: `Proposal already approved at ${proposal.approved_at}` };
  }

  proposal.approved = true;
  proposal.approved_at = new Date().toISOString();
  proposal.approved_by = 'founder';

  try {
    writeFileSync(filePath, JSON.stringify(proposal, null, 2) + '\n');
  } catch (err) {
    return { success: false, reason: `Failed to write approval: ${err.message}` };
  }

  return { success: true, reason: 'Proposal approved.', proposal };
}

/**
 * List all proposals with their status.
 *
 * @returns {Array<{ proposal_id, pattern_id, approved, created_at }>}
 */
export function listProposals() {
  if (!existsSync(PROPOSALS_DIR)) return [];

  let files;
  try {
    files = readdirSync(PROPOSALS_DIR).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  return files.map(file => {
    try {
      const data = JSON.parse(readFileSync(resolve(PROPOSALS_DIR, file), 'utf-8'));
      return {
        proposal_id: data.proposal_id,
        pattern_id: data.pattern_id,
        approved: data.approved,
        created_at: data.created_at,
        challenge_count: data.challenge_count,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Log demotion events to docs/scanner-learning.md (append-only).
 */
export function logDemotion(patternId, reason, challengeCount) {
  const learningLog = resolve(COGNITIVE_ROOT, 'docs', 'scanner-learning.md');
  const timestamp = new Date().toISOString();

  const entry = `\n## ${timestamp} — ${patternId} demoted to warning\n\n` +
    `- **Reason:** ${reason}\n` +
    `- **Accepted challenges:** ${challengeCount}\n` +
    `- **Effect:** Severity demoted from blocker → warning in matching context\n`;

  try {
    if (!existsSync(learningLog)) {
      writeFileSync(learningLog, '# Scanner Learning Log\n\nAuto-generated log of scanner severity demotions and approved exceptions.\n');
    }
    appendFileSync(learningLog, entry);
  } catch {
    // Logging failure is non-blocking
  }
}

export { PROPOSALS_DIR };
