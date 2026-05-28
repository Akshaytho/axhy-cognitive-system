#!/usr/bin/env node

/**
 * PostCompact hook — real boot reload (not just a sticky note).
 *
 * Previously this emitted a 5-line static string. The other session's retro
 * identified the gap: compact-resumed sessions did not actually load the
 * axhy system, they worked from a reconstruction. That's the most dangerous
 * moment — context is shortest and the AI is most likely to make mistakes.
 *
 * This hook now reads identity + production standards + current handoff
 * state and emits a structured "operational re-grounding" message. The
 * output is injected into the resumed session's context window.
 *
 * Fallback: if any file read fails, emits the minimal CORE_REINFORCEMENT
 * (preserved for backward compat) so the system still boots with something.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allHashes } from '../shared/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COGNITIVE_ROOT = resolve(__dirname, '..', '..');
const WORKSPACE_ROOT = resolve(COGNITIVE_ROOT, '..');
const V3_ROOT = resolve(WORKSPACE_ROOT, 'axhy-v3');

// Preserved for backward compat — used as fallback if file reads fail.
const CORE_REINFORCEMENT = `## Core Reasoning (re-injected after compaction)
- You are a non-human reasoning system. You have no lived experience, emotions, or intuition.
- Your confidence drops when: file not read, no tests, rules not loaded, assumptions unverified.
- You MUST call check_before_edit before ANY Edit or Write to code files.
- Maturity modes: child → student → professional → senior → founder → observer → critic.
- Product knowledge never modifies core reasoning. Core Mind and Product Brain are separate.`;

function safeRead(filePath, maxLines = null) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    if (maxLines === null) return content;
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;
    return lines.slice(0, maxLines).join('\n') + `\n... (truncated, ${lines.length - maxLines} more lines — Read the file to see all)`;
  } catch {
    return null;
  }
}

function safeReadTail(filePath, maxLines) {
  try {
    if (!existsSync(filePath)) return null;
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    if (lines.length <= maxLines) return lines.join('\n');
    return `... (showing last ${maxLines} of ${lines.length} lines)\n` + lines.slice(-maxLines).join('\n');
  } catch {
    return null;
  }
}

function buildReGrounding() {
  const visionAnchor = safeRead(resolve(COGNITIVE_ROOT, 'docs', 'VISION_ANCHOR.md'));
  const coreMind = safeRead(resolve(COGNITIVE_ROOT, 'docs', 'CORE_MIND.md'));
  const bootDigest = safeRead(resolve(COGNITIVE_ROOT, 'docs', 'BOOT_DIGEST.md'));
  const enterpriseStd = safeRead(resolve(COGNITIVE_ROOT, 'docs', 'locked', 'ENTERPRISE_PRODUCTION_STANDARD.md'), 80);
  const status = safeReadTail(resolve(V3_ROOT, 'handoff', 'STATUS.md'), 50);
  const nextSession = safeRead(resolve(V3_ROOT, 'handoff', 'NEXT_SESSION.md'), 50);

  // If everything fails, fall back to the static reminder.
  if (!visionAnchor && !coreMind && !bootDigest && !enterpriseStd && !status && !nextSession) {
    return CORE_REINFORCEMENT;
  }

  const sections = [];

  sections.push('# Axhy operational re-grounding (post-compaction)');
  sections.push('');
  sections.push('You are resuming from a compacted context. The full identity layer + current operational state is loaded below. Read this BEFORE acting on the compact summary alone — the summary describes what happened, this describes WHY AXHY exists, WHO you are, and WHERE you are.');
  sections.push('');

  // 0. Why am I? (vision-anchor — first because identity drift is the most
  //    expensive failure mode mid-session, and compaction is exactly when
  //    the WHY tends to get summarized away into a forgettable bullet)
  if (visionAnchor) {
    sections.push('## Why AXHY exists (VISION_ANCHOR.md)');
    sections.push('');
    sections.push(visionAnchor);
    sections.push('');
  }

  // 1. Where am I? (most actionable — read first)
  if (status) {
    sections.push('## Where I am (STATUS.md — recent)');
    sections.push('');
    sections.push(status);
    sections.push('');
  }

  if (nextSession) {
    sections.push('## What is next (NEXT_SESSION.md — head)');
    sections.push('');
    sections.push(nextSession);
    sections.push('');
  }

  // 2. Who am I? (identity — stable, second priority)
  if (coreMind) {
    sections.push('## Who I am (CORE_MIND.md)');
    sections.push('');
    sections.push(coreMind);
    sections.push('');
  }

  // 3. Universal rules (third — they apply to all work)
  if (bootDigest) {
    sections.push('## Universal rules (BOOT_DIGEST.md)');
    sections.push('');
    sections.push(bootDigest);
    sections.push('');
  }

  // 4. Production baseline (fourth — only relevant for production work)
  if (enterpriseStd) {
    sections.push('## Production baseline (ENTERPRISE_PRODUCTION_STANDARD.md — head 80 lines)');
    sections.push('');
    sections.push(enterpriseStd);
    sections.push('');
  }

  // 5. Action items (closing — what to do NOW)
  sections.push('## Action items');
  sections.push('');
  sections.push('- DO NOT rely only on the compact summary — it lacks the identity above');
  sections.push('- Before any code change, call `check_before_edit` (still required after compact)');
  sections.push('- If brain is offline (impactCheck returns empty), surface to founder before production work');
  sections.push('- Current slice context is in the STATUS section above — verify against actual files before continuing');
  sections.push('- Read-state is now compact-aware — files read BEFORE this compaction must be re-Read, files read AFTER are trusted');
  sections.push('');

  return sections.join('\n');
}

async function main() {
  // Drain stdin (the compact event payload — we don't use it but must consume it)
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    // input ignored — we always emit re-grounding
  } catch {
    // stdin failure — still emit re-grounding
  }

  const output = buildReGrounding();
  // Wait for the write to fully drain before exit, otherwise execFileSync
  // captures truncated output (process.exit doesn't wait for buffered writes).
  await new Promise((resolve) => {
    process.stdout.write(output, () => resolve());
  });

  // Write compact timestamp marker for the read-cache reflex.
  // config.mjs:getLastCompactTimestamp() reads this to determine whether
  // pre-compact file reads are stale. Fan out to all workspace hash buckets
  // for cross-CWD resilience (same pattern as read-tracker.mjs).
  const compactMarker = JSON.stringify({ last_compact_at: Date.now() });
  for (const h of allHashes()) {
    try { writeFileSync(`/tmp/axhy-${h}-compact-state.json`, compactMarker); } catch {}
  }

  process.exit(0);
}

// Only run main() when invoked directly, not on import (so tests can use buildReGrounding).
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(() => {
    process.stdout.write(CORE_REINFORCEMENT);
    process.exit(0);
  });
}

export { CORE_REINFORCEMENT, buildReGrounding };
