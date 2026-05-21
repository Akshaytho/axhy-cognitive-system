#!/usr/bin/env node

import { classifyKnowledge, validateCorePrinciplePromotion } from './classifier.mjs';
import { readFileSync } from 'node:fs';

const MEMORY_PATHS = [
  /memory\/.*\.md$/,
  /docs\/learnings\//,
  /feedback_.*\.md$/,
];

const CORE_MIND_PATHS = [
  /CORE_MIND\.md$/,
  /CLAUDE\.md$/,
];

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
    return;
  }

  const toolName = input.tool_name || '';
  if (toolName !== 'Write' && toolName !== 'Edit') {
    process.exit(0);
    return;
  }

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.filePath || '';
  if (!filePath) {
    process.exit(0);
    return;
  }

  const isCoreMind = CORE_MIND_PATHS.some(p => p.test(filePath));
  if (isCoreMind) {
    const content = toolInput.content || toolInput.new_string || '';
    if (content) {
      const promotion = validateCorePrinciplePromotion(content);
      if (!promotion.allowed) {
        process.stderr.write(
          `⛔ MEMORY FIREWALL: Blocked write to core mind file.\n` +
          `Product terms found: ${promotion.contaminating_terms.join(', ')}\n` +
          `Core Mind must contain ONLY universal reasoning, never product knowledge.\n` +
          `File: ${filePath}\n`
        );
        process.exit(2);
        return;
      }
    }
  }

  const isMemory = MEMORY_PATHS.some(p => p.test(filePath));
  if (isMemory) {
    const content = toolInput.content || toolInput.new_string || '';
    if (content) {
      const classification = classifyKnowledge(content);
      process.stderr.write(
        `📋 Memory Firewall: classified as "${classification.category}" → ${classification.destination || 'see rules'}\n`
      );

      if (classification.category === 'external_research') {
        process.stderr.write(
          `⚠️  External research detected. Validation path: candidate → reviewed → tested → approved.\n` +
          `This content should go to docs/learnings/candidate/, not directly to locked docs or core.\n`
        );
      }

      if (classification.category === 'core_principle') {
        process.stderr.write(
          `⚠️  Core principle detected — requires explicit founder approval before storing.\n`
        );
      }
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
