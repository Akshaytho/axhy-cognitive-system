import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { getRepoHash } from './config.mjs';

const REPO_HASH = getRepoHash();
const CHALLENGE_FILE = `/tmp/axhy-${REPO_HASH}-founder-challenge.json`;
const RESPONSE_FILE = `/tmp/axhy-${REPO_HASH}-founder-response`;
const CHALLENGE_EXPIRY_MS = 2 * 60 * 1000;

export function issueChallenge(scope, files = []) {
  const token = randomBytes(3).toString('hex').toUpperCase();
  const challenge = {
    token,
    scope,
    files,
    timestamp: Date.now(),
    expires_at: Date.now() + CHALLENGE_EXPIRY_MS,
    repo_hash: REPO_HASH,
  };
  writeFileSync(CHALLENGE_FILE, JSON.stringify(challenge, null, 2));
  return token;
}

export function verifyChallengeResponse(scope) {
  if (!existsSync(CHALLENGE_FILE) || !existsSync(RESPONSE_FILE)) {
    return { verified: false, reason: 'no_challenge' };
  }
  try {
    const challenge = JSON.parse(readFileSync(CHALLENGE_FILE, 'utf-8'));
    const response = readFileSync(RESPONSE_FILE, 'utf-8').trim();

    if (scope && challenge.scope !== scope) {
      return { verified: false, reason: 'scope_mismatch' };
    }
    if (challenge.repo_hash && challenge.repo_hash !== REPO_HASH) {
      return { verified: false, reason: 'repo_mismatch' };
    }
    const elapsed = Date.now() - (challenge.timestamp || 0);
    if (elapsed >= CHALLENGE_EXPIRY_MS) {
      return { verified: false, reason: 'expired' };
    }
    if (response !== challenge.token) {
      return { verified: false, reason: 'token_mismatch' };
    }

    try { unlinkSync(CHALLENGE_FILE); } catch {}
    try { unlinkSync(RESPONSE_FILE); } catch {}
    return { verified: true, token: challenge.token, files: challenge.files };
  } catch {
    return { verified: false, reason: 'parse_error' };
  }
}

export function readExistingChallenge(scope) {
  if (!existsSync(CHALLENGE_FILE)) return null;
  try {
    const existing = JSON.parse(readFileSync(CHALLENGE_FILE, 'utf-8'));
    const age = Date.now() - (existing.timestamp || 0);
    if (age < CHALLENGE_EXPIRY_MS && existing.token) {
      if (!scope || existing.scope === scope) {
        return existing.token;
      }
    }
  } catch {}
  return null;
}

export function getResponseFilePath() {
  return RESPONSE_FILE;
}

export function getChallengeFilePath() {
  return CHALLENGE_FILE;
}
