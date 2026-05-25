#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getWorkspaceRoots } from '../shared/config.mjs';

const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.AXHY_REPO_ROOT || process.cwd();
const REPO_HASH = createHash('md5').update(REPO_ROOT).digest('hex').slice(0, 8);
const READ_STATE_FILE = `/tmp/axhy-${REPO_HASH}-read-state.json`;

const WORKSPACE_ROOTS = getWorkspaceRoots();
function allHashes() {
  const set = new Set([REPO_HASH]);
  for (const r of WORKSPACE_ROOTS) set.add(createHash('md5').update(r).digest('hex').slice(0, 8));
  return [...set];
}

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
  if (toolName !== 'Read') {
    process.exit(0);
    return;
  }

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.filePath || '';
  if (!filePath) {
    process.exit(0);
    return;
  }

  let reads = {};
  if (existsSync(READ_STATE_FILE)) {
    try { reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8')); } catch {}
  }
  reads[filePath] = Date.now();
  const json = JSON.stringify(reads);
  // Fan out to all workspace hash buckets (matches writeToAll pattern)
  for (const h of allHashes()) {
    try { writeFileSync(`/tmp/axhy-${h}-read-state.json`, json); } catch {}
  }
  process.exit(0);
}

main().catch(() => process.exit(1));
