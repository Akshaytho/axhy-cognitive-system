#!/usr/bin/env node

import {
  classifyKnowledge, validateCorePrinciplePromotion,
  validateEnterpriseStandardWeakening,
} from './classifier.mjs';
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
          `⛔ MEMORY FIREWALL: Blocked external research write.\n` +
          `External research must go through validation: candidate → reviewed → tested → approved.\n` +
          `Write to docs/learnings/candidate/ instead, not directly to memory files.\n` +
          `File: ${filePath}\n`
        );
        process.exit(2);
        return;
      }

      if (classification.category === 'core_principle') {
        process.stderr.write(
          `⛔ MEMORY FIREWALL: Blocked core principle write.\n` +
          `Core principles require explicit founder approval before storing.\n` +
          `Ask the founder first, then write with their confirmation.\n` +
          `File: ${filePath}\n`
        );
        process.exit(2);
        return;
      }

      // Block candidate learnings that weaken enterprise production standards
      if (classification.category === 'candidate_learning' || classification.category === 'product_rule') {
        const weakening = validateEnterpriseStandardWeakening(content);
        if (!weakening.allowed) {
          process.stderr.write(
            `⛔ MEMORY FIREWALL: Blocked enterprise standard weakening.\n` +
            `${weakening.reason}\n` +
            `File: ${filePath}\n`
          );
          process.exit(2);
          return;
        }
      }
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
