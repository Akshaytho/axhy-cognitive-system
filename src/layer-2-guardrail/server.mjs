#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { checkBeforeEdit } from './check-before-edit.mjs';
import { checkBeforePlan } from './check-before-plan.mjs';
import { checkBeforeDone } from './check-before-done.mjs';
import { checkBeforeBuild } from './check-before-build.mjs';
import { impactCheck, loadRealImpactCheck, isConnected } from './impact-adapter.mjs';
import { classifyRisk } from '../layer-1-hook/risk-classifier.mjs';
import { logApprovalCreated, logApprovalDenied } from './audit-log.mjs';
import {
  getRepoRoot, getRepoHash, getTimeouts, getFileReadTimestamp,
} from '../shared/config.mjs';

// H7+L2 fix (2026-05-23): use centralized identity and config instead of local duplicates.
const REPO_ROOT = getRepoRoot();
const REPO_HASH = getRepoHash();

const EDIT_TOOL_DEFINITION = {
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
      reasoning_evidence: {
        type: 'object',
        description: 'Structured reasoning evidence. Required fields depend on file risk level. HIGH: invariants_preserved, risk_if_wrong, what_would_make_me_stop, files_read. MEDIUM: risk_if_wrong, why_this_path_is_safe, files_read. LOW: files_read only.',
        properties: {
          invariants_preserved: {
            type: 'string',
            description: 'What existing behavior stays intact and why your change does not break it (10+ words with specific references).',
          },
          risk_if_wrong: {
            type: 'string',
            description: 'What breaks if your assumptions are incorrect (10+ words with specific references).',
          },
          what_would_make_me_stop: {
            type: 'string',
            description: 'Conditions that would cause you to halt and re-evaluate (10+ words with specific references).',
          },
          why_this_path_is_safe: {
            type: 'string',
            description: 'Evidence that this approach will not cause harm (10+ words with specific references).',
          },
          files_read: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of files you actually read before forming this intent.',
          },
        },
      },
    },
    required: ['intent', 'file_paths'],
  },
};

const PLAN_TOOL_DEFINITION = {
  name: 'check_before_plan',
  description: 'Call this BEFORE writing any plan, sprint plan, implementation plan, persona doc, or handoff file. Requires architecture evidence (concrete findings from reading state machines, Prisma schema, routes, mobile structure, locked docs, and UI tokens). Validates source hierarchy — persona docs are NOT implementation truth. Audits plan content for anti-patterns (direct DB updates, enum fields where machines exist).',
  inputSchema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'What plan you are writing and why (20+ words). Include: product area, what sources inform it, what it will specify.',
      },
      target_plan_file: {
        type: 'string',
        description: 'The plan file you intend to write or edit.',
      },
      source_docs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Source documents this plan is based on. MUST include existing architecture paths (state machines, schema, routes) if the plan touches those areas.',
      },
      affected_product_area: {
        type: 'string',
        description: 'Which product area: worker, supervisor, admin, backend, shared.',
      },
      architecture_evidence: {
        type: 'object',
        properties: {
          state_machines: { type: 'array', items: { type: 'object' }, description: 'Findings from packages/state-machines/src/ — each item: { file, exports, relevance }' },
          prisma_models: { type: 'array', items: { type: 'object' }, description: 'Findings from Prisma schema — each item: { file, key_fields, relevance }' },
          routes: { type: 'array', items: { type: 'object' }, description: 'Findings from backend routes — each item: { file, endpoints, relevance }' },
          mobile_screens: { type: 'array', items: { type: 'object' }, description: 'Findings from mobile app structure — each item: { file, relevance }' },
          locked_docs: { type: 'array', items: { type: 'object' }, description: 'Findings from docs/locked/ — each item: { file, key_rules, relevance }. At least 1 required.' },
          tokens_components: { type: 'array', items: { type: 'object' }, description: 'Findings from UI tokens/components — each item: { file, relevance }' },
        },
        description: 'Concrete findings from reading existing architecture. Each key is an evidence array with { file, relevance } per item. Empty arrays allowed except locked_docs (min 1).',
      },
      plan_content: {
        type: 'string',
        description: 'Optional: the plan content you intend to write, for pre-write anti-pattern scanning.',
      },
    },
    required: ['intent', 'target_plan_file', 'source_docs', 'architecture_evidence'],
  },
};

// H7+L2 fix: use centralized getFileReadTimestamp (scans all hash buckets)
// and getTimeouts().read_window_ms (config-driven, not hardcoded).
function getFileReadStatus(filePaths) {
  const windowMs = getTimeouts().read_window_ms;
  const status = {};
  for (const fp of filePaths) {
    const ts = getFileReadTimestamp(fp);
    status[fp] = ts > 0 && (Date.now() - ts) < windowMs;
  }
  return status;
}

export async function handleEditToolCall({ intent, file_paths, change_type, answered_question, evidence, reasoning_evidence }) {
  let impactResult = null;
  if (intent && !answered_question) {
    try {
      const highestRisk = (file_paths || []).reduce((max, fp) => {
        const { level } = classifyRisk(fp);
        if (level === 'high') return 'high';
        if (level === 'medium' && max !== 'high') return 'medium';
        return max;
      }, 'low');
      const result = await impactCheck(intent, undefined, highestRisk);
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

  const result = checkBeforeEdit({
    intent,
    filePaths: file_paths,
    changeType: change_type,
    answeredQuestion: answered_question,
    evidence,
    reasoningEvidence: reasoning_evidence,
    fileReadStatus: getFileReadStatus(file_paths || []),
    testStatus: {},
    impactCheckResult: impactResult,
  });

  if (result.allowed) {
    logApprovalCreated({
      tool: 'check_before_edit',
      intent,
      approvedFiles: result.approved_files || [],
      editsRemaining: result.edits_remaining,
      confidence: result.confidence,
    });
  } else {
    logApprovalDenied({
      tool: 'check_before_edit',
      file: (file_paths || [])[0],
      reason: result.reason,
    });
  }

  return result;
}

export async function handlePlanToolCall(args) {
  return checkBeforePlan({
    intent: args.intent,
    targetPlanFile: args.target_plan_file,
    sourceDocs: args.source_docs || [],
    affectedProductArea: args.affected_product_area || '',
    architectureEvidence: args.architecture_evidence || {},
    architectureInventory: args.architecture_inventory || {},
    planContent: args.plan_content || '',
  });
}

const DONE_TOOL_DEFINITION = {
  name: 'check_before_done',
  description: 'Call this BEFORE writing a done memo or declaring any slice/task complete. Runs quality gate (9 check categories, L1-L5 grading), requires typecheck passed, tests passed, and screenshots taken (for UI work). Blocks done-memo writes until grade >= L3 (Senior). Returns fix list for self-iteration until quality passes.',
  inputSchema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'What the slice accomplished and what was verified (15+ words).',
      },
      slice_name: {
        type: 'string',
        description: 'Name of the slice being completed (e.g., "worker-d1-s1-auth-shell").',
      },
      done_memo_file: {
        type: 'string',
        description: 'File path where the done memo will be written.',
      },
      slice_files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Every file created or modified in this slice — all will be quality-reviewed.',
      },
      screenshots_taken: {
        type: 'boolean',
        description: 'Whether screenshots of every screen/flow have been captured. Required if slice has UI files.',
      },
      typecheck_passed: {
        type: 'boolean',
        description: 'Whether typecheck (tsc --noEmit) passed green.',
      },
      tests_passed: {
        type: 'boolean',
        description: 'Whether all tests for affected packages passed green.',
      },
      coverage_notes: {
        type: 'string',
        description: 'Which sprint plan items this slice covers, what source requirements are satisfied, and any known gaps remaining (20+ chars).',
      },
      self_reasoning_summary: {
        type: 'string',
        description: 'What impactCheck() returned, what assumptions were verified, what locked constraints were checked. Must run 7-phase self-reasoning protocol before non-trivial work (20+ chars).',
      },
      handoff_updated: {
        type: 'boolean',
        description: 'Whether NEXT_SESSION.md and STATUS.md were updated to reflect this slice completion. Required so the next session knows current state.',
      },
    },
    required: ['intent', 'slice_name', 'done_memo_file', 'slice_files', 'screenshots_taken', 'typecheck_passed', 'tests_passed', 'coverage_notes', 'self_reasoning_summary', 'handoff_updated'],
  },
};

const BUILD_TOOL_DEFINITION = {
  name: 'check_before_build',
  description: 'Call this BEFORE starting to code any slice. Runs the enterprise production preflight using structured fields that map to E1–E14 from docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md. Forces you to think about WHAT (goal, personas, platforms) then HOW (security, ownership, data loss, etc.). Non-deferrable fields (security_boundary, tenant_and_resource_ownership, data_loss_paths, app_store_crash_risks, secrets_and_credentials) cannot use deferral language like "MVP", "later", "placeholder", "good enough". Blocks coding until the preflight passes.',
  inputSchema: {
    type: 'object',
    properties: {
      slice_name: {
        type: 'string',
        description: 'Name of the slice being built (e.g., "worker-d1-s2b-2-capture-pipeline").',
      },
      plan_reference: {
        type: 'string',
        description: 'Path to the plan document for this slice.',
      },
      slice_scope: {
        type: 'string',
        enum: ['backend', 'mobile', 'shared', 'full_stack'],
        description: 'Primary scope: backend (routes/DB), mobile (React Native), shared (packages), full_stack (both).',
      },
      planned_files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Every file you intend to create or modify in this slice.',
      },
      structured_fields: {
        type: 'object',
        description: 'Structured enterprise preflight fields. Context fields set the frame, concern fields map to E-items (15+ words each), meta fields are process controls. Use { status: "N/A", reason: "..." } for items that do not apply.',
        properties: {
          feature_goal: { type: 'string', description: 'What the feature does and why it matters to the user (10+ words).' },
          affected_personas: { description: 'Which personas are affected (worker, supervisor, admin, system). String or array.' },
          affected_platforms: { description: 'Which platforms (mobile, web, backend, shared). String or array.' },
          security_boundary: { description: 'E1: How auth + role + ownership is validated on every route (15+ words). NON-DEFERRABLE.' },
          tenant_and_resource_ownership: { description: 'E2: How companyId filter + resource-level access is enforced (15+ words). NON-DEFERRABLE.' },
          rate_limit_or_abuse_boundary: { description: 'E3: Per-IP (public) and per-user (auth) rate limits (15+ words).' },
          source_of_truth: { description: 'E4: What owns the data shape and lifecycle — state machine, schema, locked doc (15+ words).' },
          lifecycle_or_state_machine_owner: { description: 'E5: Which state machine owns the entity lifecycle — no direct DB status updates (15+ words).' },
          data_loss_paths: { description: 'E6: What happens on app kill, network failure, storage failure, permission denial (15+ words). NON-DEFERRABLE.' },
          mobile_web_failure_modes: { description: 'E7: Platform.OS branching, web stubs, storage failure handling (15+ words).' },
          app_store_crash_risks: { description: 'E8: Zero crashes in normal operation — every code path must be crash-safe (15+ words). NON-DEFERRABLE.' },
          scale_assumption: { type: 'string', description: 'E9: Default 10,000+ users — indexed queries, no N+1, pagination (10+ words).' },
          documentation_truth: { description: 'E10: Plan matches code exactly — no fake metadata, no divergence (15+ words).' },
          required_tests: { description: 'E11: Auth/role/ownership/happy/error tests per route, transition tests per machine (15+ words).' },
          error_specificity: { description: 'E12: Specific error codes per failure mode — no generic messages (15+ words).' },
          secrets_and_credentials: { description: 'E13: No credentials in code or bundles — env vars only, bounded presigned URLs (15+ words). NON-DEFERRABLE.' },
          non_deferrable_summary: { description: 'E14: Confirmation that security, crash, data loss, secrets, doc truth are all addressed (15+ words).' },
          founder_approved_deferrals: { type: 'string', description: 'Any items explicitly deferred with founder approval. Empty string if none.' },
          required_screenshots: { type: 'string', description: 'What screens/flows need visual verification at done time.' },
          known_gaps: { type: 'string', description: 'What is NOT covered by this slice — explicit honesty about boundaries.' },
        },
      },
    },
    required: ['slice_name', 'plan_reference', 'slice_scope', 'planned_files', 'structured_fields'],
  },
};

export async function handleBuildToolCall(args) {
  return checkBeforeBuild({
    sliceName: args.slice_name,
    planReference: args.plan_reference,
    sliceScope: args.slice_scope || 'full_stack',
    plannedFiles: args.planned_files || [],
    structuredFields: args.structured_fields || {},
    // Backward compat: pass old E1-E14 checklist if provided
    enterpriseChecklist: args.enterprise_checklist || null,
  });
}

export async function handleDoneToolCall(args) {
  return checkBeforeDone({
    intent: args.intent,
    sliceName: args.slice_name,
    doneMemoFile: args.done_memo_file,
    sliceFiles: args.slice_files || [],
    screenshotsTaken: args.screenshots_taken || false,
    typecheckPassed: args.typecheck_passed || false,
    testsPassed: args.tests_passed || false,
    coverageNotes: args.coverage_notes || '',
    selfReasoningSummary: args.self_reasoning_summary || '',
    handoffUpdated: args.handoff_updated || false,
  });
}

export { EDIT_TOOL_DEFINITION, PLAN_TOOL_DEFINITION, DONE_TOOL_DEFINITION, BUILD_TOOL_DEFINITION };

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
        serverInfo: { name: 'axhy-guardrail', version: '0.4.0' },
      },
    });
  }

  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    return send({
      jsonrpc: '2.0',
      id,
      result: { tools: [EDIT_TOOL_DEFINITION, PLAN_TOOL_DEFINITION, DONE_TOOL_DEFINITION, BUILD_TOOL_DEFINITION] },
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    let handler;
    if (toolName === 'check_before_edit') {
      handler = handleEditToolCall(args);
    } else if (toolName === 'check_before_plan') {
      handler = handlePlanToolCall(args);
    } else if (toolName === 'check_before_done') {
      handler = handleDoneToolCall(args);
    } else if (toolName === 'check_before_build') {
      handler = handleBuildToolCall(args);
    } else {
      return send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true },
      });
    }

    handler.then(result => {
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
