#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const READ_STATE_FILE = '/tmp/axhy-read-state.json';

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
  writeFileSync(READ_STATE_FILE, JSON.stringify(reads));
  process.exit(0);
}

main().catch(() => process.exit(0));
