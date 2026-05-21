#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { checkBeforeEdit } from './check-before-edit.mjs';
import { impactCheck, loadRealImpactCheck, isConnected } from './impact-adapter.mjs';

const READ_STATE_FILE = '/tmp/axhy-read-state.json';
const READ_WINDOW_MS = 10 * 60 * 1000;

const TOOL_DEFINITION = {
  name: 'check_before_edit',
  description: 'Call this BEFORE editing any code file. Validates intent, checks risk, returns scoped approval with edit limits. High-risk files (CLAUDE.md, hooks, locked docs) get 1 edit. Medium-risk (routes, state machines) get 2. Low-risk get 3. Approval expires after 5 minutes.',
  inputSchema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'What you want to change and why (30+ words). Must include: purpose, affected behavior, and risk assessment.',
      },
      file_paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files you intend to edit.',
      },
      change_type: {
        type: 'string',
        enum: ['new_feature', 'bug_fix', 'refactor', 'schema_change', 'config_change', 'core_change', 'audit', 'review', 'security_review', 'adversarial_review'],
        description: 'Type of change being made.',
      },
      answered_question: {
        type: 'string',
        description: 'Answer to a previously asked next-question (for re-calling after a block).',
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description: 'Evidence supporting your answer (file paths, grep results, test outputs).',
      },
    },
    required: ['intent', 'file_paths'],
  },
};

function getFileReadStatus(filePaths) {
  if (!existsSync(READ_STATE_FILE)) return {};
  let reads;
  try { reads = JSON.parse(readFileSync(READ_STATE_FILE, 'utf-8')); } catch { return {}; }
  const status = {};
  for (const fp of filePaths) {
    const lastRead = reads[fp];
    status[fp] = lastRead && (Date.now() - lastRead) < READ_WINDOW_MS;
  }
  return status;
}

export async function handleToolCall({ intent, file_paths, change_type, answered_question, evidence }) {
  let impactResult = null;
  if (intent && !answered_question) {
    try {
      const result = await impactCheck(intent);
      impactResult = {
        hardBlocks: (result.hardBlocks || []).map(b => typeof b === 'string' ? b : b.content || JSON.stringify(b)),
        warnings: (result.softWarnings || []).map(w => typeof w === 'string' ? w : w.content || JSON.stringify(w)),
        staleChunks: result.staleChunks || [],
        context: (result.allRelevant || []).map(c => ({
          source: c.source_path || c.source || 'unknown',
          similarity: c.similarity || 0,
          content: (c.content || '').slice(0, 200),
        })),
        rules: [],
      };
    } catch {}
  }

  return checkBeforeEdit({
    intent,
    filePaths: file_paths,
    changeType: change_type,
    answeredQuestion: answered_question,
    evidence,
    fileReadStatus: getFileReadStatus(file_paths || []),
    testStatus: {},
    impactCheckResult: impactResult,
  });
}

export { TOOL_DEFINITION };

function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(json + '\n');
}

function handleMessage(msg) {
  const { method, id, params } = msg;

  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'axhy-guardrail', version: '0.1.0' },
      },
    });
  }

  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    return send({
      jsonrpc: '2.0',
      id,
      result: { tools: [TOOL_DEFINITION] },
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName !== 'check_before_edit') {
      return send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true },
      });
    }

    handleToolCall(args).then(result => {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      });
    }).catch(err => {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
      });
    });
    return;
  }

  if (id) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''))) {
  loadRealImpactCheck().then(ok => {
    if (ok) process.stderr.write('axhy-guardrail: connected to pgvector\n');
    else process.stderr.write('axhy-guardrail: running without pgvector (fallback mode)\n');
  });

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    try {
      handleMessage(JSON.parse(line));
    } catch {}
  });
}
