
import { isPlanFile } from '../layer-1-hook/risk-classifier.mjs';
import { validateSourceHierarchy } from './source-hierarchy.mjs';
import { auditPlanContent, getExistingMachines } from './plan-content-auditor.mjs';
import { impactCheck } from './impact-adapter.mjs';
import {
  writePlanGuardrailState,
  createPlanApprovalState,
} from './state-tracker.mjs';

const ARCHITECTURE_EVIDENCE_KEYS = [
  { key: 'state_machines', label: 'State machines (packages/state-machines/src/)', minItems: 0 },
  { key: 'prisma_models', label: 'Prisma models (packages/shared-schema/prisma/schema.prisma)', minItems: 0 },
  { key: 'routes', label: 'Backend routes (apps/backend/src/routes/)', minItems: 0 },
  { key: 'mobile_screens', label: 'Mobile screens (apps/mobile/app/)', minItems: 0 },
  { key: 'locked_docs', label: 'Locked docs (docs/locked/)', minItems: 1 },
  { key: 'tokens_components', label: 'UI tokens/components (packages/ui-tokens/)', minItems: 0 },
];

function validateEvidence(evidence, key) {
  if (!Array.isArray(evidence)) return false;
  if (evidence.length === 0) return true;
  return evidence.every(item =>
    item && typeof item === 'object' && typeof item.file === 'string' && item.file.length > 0 && typeof item.relevance === 'string' && item.relevance.length > 0
  );
}

export async function checkBeforePlan({
  intent,
  targetPlanFile,
  sourceDocs = [],
  affectedProductArea = '',
  architectureEvidence = {},
  architectureInventory = {},
  planContent = '',
}) {
  const evidence = Object.keys(architectureEvidence).length > 0 ? architectureEvidence : architectureInventory;
  const usingBooleans = Object.values(evidence).some(v => typeof v === 'boolean');

  if (usingBooleans) {
    return {
      allowed: false,
      reason: 'Booleans are no longer accepted for architecture_evidence. Provide concrete findings.',
      required_format: {
        state_machines: [{ file: 'packages/state-machines/src/worker.ts', exports: ['workerMachine'], relevance: 'Worker activation must go through workerMachine transition' }],
        locked_docs: [{ file: 'docs/locked/chat-behavior-rules.md', key_rules: ['No direct state updates'], relevance: 'Constrains how state changes are implemented' }],
      },
      suggestion: 'Read each architecture area, extract file paths and exported names, then provide evidence arrays.',
    };
  }

  if (!intent || typeof intent !== 'string' || intent.trim().split(/\s+/).length < 20) {
    return {
      allowed: false,
      reason: 'Plan intent too short (need 20+ words). Describe WHAT plan you are writing, WHY, what product area it covers, and what sources inform it.',
    };
  }

  if (!targetPlanFile) {
    return {
      allowed: false,
      reason: 'No target_plan_file specified. Which plan file are you writing to?',
    };
  }

  if (!isPlanFile(targetPlanFile)) {
    return {
      allowed: false,
      reason: `File "${targetPlanFile}" is not classified as a plan file. Use check_before_edit for code files.`,
    };
  }

  const missingEvidence = [];
  const invalidEvidence = [];
  for (const item of ARCHITECTURE_EVIDENCE_KEYS) {
    const val = evidence[item.key];
    if (!val || !Array.isArray(val)) {
      missingEvidence.push(item);
    } else if (item.minItems > 0 && val.length < item.minItems) {
      missingEvidence.push({ ...item, note: `Need at least ${item.minItems} item(s)` });
    } else if (!validateEvidence(val, item.key)) {
      invalidEvidence.push({ ...item, note: 'Each item needs { file, relevance } at minimum' });
    }
  }

  if (missingEvidence.length > 0 || invalidEvidence.length > 0) {
    return {
      allowed: false,
      reason: 'Architecture evidence incomplete. Before writing a plan, you MUST provide concrete findings from reading existing architecture.',
      missing_evidence: missingEvidence.map(i => ({
        key: i.key,
        label: i.label,
        note: i.note || `Read and provide findings: ${i.label}`,
      })),
      invalid_evidence: invalidEvidence.map(i => ({
        key: i.key,
        label: i.label,
        note: i.note,
      })),
      existing_machines: getExistingMachines().map(m => ({ name: m.name, file: m.file })),
      suggestion: 'Read each architecture area, then provide evidence arrays with { file, exports/key_fields/endpoints, relevance } per item.',
    };
  }

  if (sourceDocs.length === 0) {
    return {
      allowed: false,
      reason: 'No source_docs provided. Every plan must cite its sources. Include existing architecture paths, locked docs, and canonical plan references.',
    };
  }

  const sourceResult = validateSourceHierarchy(sourceDocs);
  if (!sourceResult.valid) {
    return {
      allowed: false,
      reason: 'Source hierarchy violation — persona docs cannot be primary implementation source.',
      source_errors: sourceResult.errors,
      source_warnings: sourceResult.warnings,
      classified_sources: sourceResult.classified,
      suggestion: 'Add existing architecture sources (state machines, Prisma schema, routes) alongside persona docs.',
    };
  }

  let impactResult = null;
  try {
    impactResult = await impactCheck(intent, 'plan', 'low');
  } catch {}

  const hardBlocks = impactResult?.hardBlocks || [];
  if (hardBlocks.length > 0) {
    return {
      allowed: false,
      reason: 'Hard blocks from locked constraints.',
      hardBlocks: hardBlocks.map(b => typeof b === 'string' ? b : b.content || b.reason || JSON.stringify(b)),
      suggestion: 'These locked constraints conflict with your plan intent. Surface to founder.',
    };
  }

  let contentAudit = null;
  if (planContent && planContent.trim().length > 0) {
    contentAudit = auditPlanContent(planContent, targetPlanFile);
    if (contentAudit.hasErrors) {
      return {
        allowed: false,
        reason: 'Plan content contradicts existing state machines.',
        content_violations: contentAudit.violations.filter(v => v.severity === 'error'),
        content_warnings: contentAudit.violations.filter(v => v.severity === 'warning'),
        existing_machines: contentAudit.existingMachines,
        suggestion: 'Rewrite sections that mention direct DB updates or enum fields for entities managed by state machines.',
      };
    }
  }

  const state = createPlanApprovalState({
    intent,
    approvedFiles: [targetPlanFile],
    editsRemaining: 2,
    sourceDocs,
    sourceWarnings: sourceResult.warnings,
    architectureInventory: evidence,
    contentWarnings: contentAudit?.violations?.filter(v => v.severity === 'warning') || [],
    affectedProductArea,
  });

  writePlanGuardrailState(state);

  return {
    allowed: true,
    approved_files: [targetPlanFile],
    edits_remaining: 2,
    expires: '5 minutes',
    source_hierarchy: sourceResult.classified,
    source_warnings: sourceResult.warnings,
    content_warnings: contentAudit?.violations?.filter(v => v.severity === 'warning') || [],
    existing_machines: getExistingMachines().map(m => ({ name: m.name, file: m.file })),
    architecture_evidence: evidence,
    impact_warnings: (impactResult?.softWarnings || []).map(w => typeof w === 'string' ? w : w.content || w.reason || JSON.stringify(w)),
    rule: 'Persona docs are reference only — never treat as implementation truth without reconciling against existing architecture.',
  };
}

export { ARCHITECTURE_EVIDENCE_KEYS };
