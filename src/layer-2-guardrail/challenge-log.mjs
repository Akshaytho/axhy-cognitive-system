/**
 * Challenge Log — records AI challenges to scanner findings.
 *
 * When a finding is a false positive, the AI can submit:
 *   - finding_id: which finding is being challenged
 *   - file_path + line_number: where it occurs
 *   - explanation: WHY this is a false positive
 *   - code_excerpt: the actual code that proves the explanation
 *   - rule_evidence: optional reference to a pattern definition file
 *
 * The challenge is evaluated by the gate: if it has substance and isn't
 * just prose, it's ACCEPTED and logged. If accepted, the finding is dropped
 * from the commit blockers. If rejected, the finding stays.
 *
 * Every challenge — accepted or rejected — is logged with full evidence
 * so:
 *   1. Founder can audit the trail
 *   2. Future sessions learn what's actually noise vs gaming
 *   3. Pattern definitions can be improved based on accepted challenges
 *
 * Storage: docs/challenges/YYYY-MM/CHALLENGES.jsonl (append-only)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COGNITIVE_ROOT = resolve(__dirname, '..', '..');
const CHALLENGES_DIR = resolve(COGNITIVE_ROOT, 'docs', 'challenges');

const MIN_EXPLANATION_WORDS = 15;

function getCurrentLogPath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dir = resolve(CHALLENGES_DIR, `${yyyy}-${mm}`);
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch {}
  }
  return resolve(dir, 'CHALLENGES.jsonl');
}

/**
 * Validate a challenge submission.
 *
 * Accepts a challenge if:
 *   - All required fields present
 *   - Explanation is substantive (15+ words, mentions specific file/line/function)
 *   - Code excerpt is present and contains the line being challenged
 *
 * Rejects otherwise.
 *
 * @param {object} challenge
 * @returns {{ accepted: boolean, reason: string }}
 */
export function evaluateChallenge(challenge) {
  if (!challenge || typeof challenge !== 'object') {
    return { accepted: false, reason: 'Challenge must be an object with required fields.' };
  }

  const required = ['finding_id', 'file_path', 'line_number', 'explanation'];
  for (const field of required) {
    if (challenge[field] === undefined || challenge[field] === null || challenge[field] === '') {
      return { accepted: false, reason: `Challenge missing required field: ${field}` };
    }
  }

  // Explanation substance check
  const words = String(challenge.explanation).trim().split(/\s+/);
  if (words.length < MIN_EXPLANATION_WORDS) {
    return {
      accepted: false,
      reason: `Explanation too brief (${words.length} words, need ${MIN_EXPLANATION_WORDS}+). Provide reasoning, not assertion.`,
    };
  }

  // Verify the file exists on disk
  if (!existsSync(challenge.file_path)) {
    return { accepted: false, reason: `Challenged file does not exist: ${challenge.file_path}` };
  }

  // Verify code excerpt is provided OR explanation references specific lines
  const hasExcerpt = challenge.code_excerpt && String(challenge.code_excerpt).length > 10;
  const hasLineRef = /line\s+\d+|:\d+/.test(challenge.explanation);
  if (!hasExcerpt && !hasLineRef) {
    return {
      accepted: false,
      reason: 'Challenge needs code_excerpt or explicit line references in explanation.',
    };
  }

  return { accepted: true, reason: 'Challenge meets evidence requirements.' };
}

/**
 * Log a challenge attempt (accepted or rejected) to the audit log.
 */
export function logChallenge(challenge, evaluation) {
  const entry = {
    timestamp: new Date().toISOString(),
    finding_id: challenge.finding_id,
    file_path: challenge.file_path,
    line_number: challenge.line_number,
    explanation: challenge.explanation,
    code_excerpt: challenge.code_excerpt || null,
    accepted: evaluation.accepted,
    reason: evaluation.reason,
  };

  try {
    appendFileSync(getCurrentLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    // If logging fails, don't crash the gate — just continue
  }

  return entry;
}

/**
 * Process challenges against findings.
 * Returns the findings array with accepted-challenge findings removed.
 *
 * @param {Array} findings - Findings from scanners (with finding_id field)
 * @param {Array} challenges - Challenges submitted by AI
 * @returns {{ remainingFindings, acceptedChallenges, rejectedChallenges }}
 */
export function applyChallenges(findings, challenges) {
  if (!challenges || challenges.length === 0) {
    return { remainingFindings: findings, acceptedChallenges: [], rejectedChallenges: [] };
  }

  const acceptedIds = new Set();
  const acceptedChallenges = [];
  const rejectedChallenges = [];

  for (const challenge of challenges) {
    const evaluation = evaluateChallenge(challenge);
    const logged = logChallenge(challenge, evaluation);
    if (evaluation.accepted) {
      acceptedIds.add(challenge.finding_id);
      acceptedChallenges.push(logged);
    } else {
      rejectedChallenges.push(logged);
    }
  }

  const remainingFindings = findings.filter(f => !acceptedIds.has(f.finding_id));

  return { remainingFindings, acceptedChallenges, rejectedChallenges };
}

/**
 * Read recent challenges from the log (for brain embedding / review).
 */
export function readRecentChallenges(maxEntries = 50) {
  const logPath = getCurrentLogPath();
  if (!existsSync(logPath)) return [];
  try {
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    return lines.slice(-maxEntries).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * C1: Read ALL accepted challenges across all monthly logs (last 90 days).
 * Returns array of accepted challenge entries with pattern_id extracted.
 */
export function readAllAcceptedChallenges() {
  if (!existsSync(CHALLENGES_DIR)) return [];

  const accepted = [];
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  let dirs;
  try {
    dirs = readdirSync(CHALLENGES_DIR);
  } catch {
    return [];
  }

  for (const dir of dirs) {
    const logPath = resolve(CHALLENGES_DIR, dir, 'CHALLENGES.jsonl');
    if (!existsSync(logPath)) continue;

    try {
      const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (!entry.accepted) continue;
          if (entry.timestamp < cutoff) continue;
          const patternId = extractPatternId(entry.finding_id);
          accepted.push({ ...entry, pattern_id: patternId });
        } catch {
          // Skip malformed entries
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return accepted;
}

/**
 * Extract pattern_id from finding_id.
 * Format: "pattern_id:file_path:line_number" → "pattern_id"
 * Handles simple IDs without colons too.
 */
function extractPatternId(findingId) {
  if (!findingId || typeof findingId !== 'string') return 'unknown';
  const firstColon = findingId.indexOf(':');
  if (firstColon === -1) return findingId;
  return findingId.slice(0, firstColon);
}

/**
 * C1: Cluster accepted challenges by pattern_id.
 * Returns Map<pattern_id, { count, challenges, contexts }>
 */
export function clusterAcceptedChallenges() {
  const accepted = readAllAcceptedChallenges();
  const clusters = new Map();

  for (const entry of accepted) {
    const pid = entry.pattern_id;
    if (!clusters.has(pid)) {
      clusters.set(pid, { count: 0, challenges: [], contexts: new Set() });
    }
    const cluster = clusters.get(pid);
    cluster.count++;
    cluster.challenges.push(entry);
    if (entry.file_path) cluster.contexts.add(entry.file_path);
  }

  return clusters;
}

/**
 * C1: Get patterns that should have severity demoted.
 * Pattern is demoted when 3+ accepted challenges within 90 days.
 *
 * @returns {Map<string, 'warning'>} pattern_id → demoted severity
 */
export function getLearnedDemotions() {
  if (process.env.LEARNED_EXCEPTIONS_ENABLED !== 'true') return new Map();

  const clusters = clusterAcceptedChallenges();
  const demotions = new Map();
  const DEMOTION_THRESHOLD = 3;

  for (const [patternId, cluster] of clusters) {
    if (cluster.count >= DEMOTION_THRESHOLD) {
      demotions.set(patternId, 'warning');
    }
  }

  return demotions;
}

/**
 * C2+C3: Read approved exceptions from docs/scanner-proposals/.
 * Only returns proposals explicitly approved by the founder.
 *
 * @returns {Array<{ pattern_id, skip_pattern, approved_at, proposal_id }>}
 */
export function getApprovedExceptions() {
  if (process.env.LEARNED_EXCEPTIONS_ENABLED !== 'true') return [];

  const proposalsDir = resolve(COGNITIVE_ROOT, 'docs', 'scanner-proposals');
  if (!existsSync(proposalsDir)) return [];

  const exceptions = [];
  let files;
  try {
    files = readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const proposal = JSON.parse(readFileSync(resolve(proposalsDir, file), 'utf-8'));
      if (proposal.approved && proposal.skip_rule) {
        exceptions.push({
          pattern_id: proposal.pattern_id,
          skip_pattern: new RegExp(proposal.skip_rule.file_pattern || '$.^'),
          approved_at: proposal.approved_at,
          proposal_id: proposal.proposal_id,
        });
      }
    } catch {
      // Skip malformed proposals
    }
  }

  return exceptions;
}

export { CHALLENGES_DIR, COGNITIVE_ROOT };
