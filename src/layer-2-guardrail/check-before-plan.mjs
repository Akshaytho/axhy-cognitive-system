import { isPlanFile } from '../layer-1-hook/risk-classifier.mjs';
import { validateSourceHierarchy } from './source-hierarchy.mjs';
import { auditPlanContent, getExistingMachines } from './plan-content-auditor.mjs';
import { impactCheck } from './impact-adapter.mjs';
import {
  writePlanGuardrailState,
  createPlanApprovalState,
} from './state-tracker.mjs';

const ARCHITECTURE_INVENTORY_ITEMS = [
  { key: 'state_machines_checked', label: 'State machines (packages/state-machines/src/)' },
  { key: 'prisma_schema_checked', label: 'Prisma schema (packages/shared-schema/prisma/schema.prisma)' },
  { key: 'existing_routes_checked', label: 'Existing backend routes (apps/backend/src/routes/)' },
  { key: 'mobile_structure_checked', label: 'Mobile app structure (apps/mobile/app/)' },
  { key: 'locked_docs_checked', label: 'Locked docs (docs/locked/)' },
  { key: 'tokens_components_checked', label: 'UI tokens/components (packages/ui-tokens/)' },
];

export async function checkBeforePlan({
  intent,
  targetPlanFile,
  sourceDocs = [],
  affectedProductArea = '',
  architectureInventory = {},
  planContent = '',
}) {
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

  const missingInventory = [];
  for (const item of ARCHITECTURE_INVENTORY_ITEMS) {
    if (!architectureInventory[item.key]) {
      missingInventory.push(item);
    }
  }

  if (missingInventory.length > 0) {
    return {
      allowed: false,
      reason: 'Architecture inventory incomplete. Before writing an implementation plan, you MUST check existing architecture.',
      missing_checks: missingInventory.map(i => ({
        key: i.key,
        label: i.label,
        instruction: `Read and understand: ${i.label}`,
      })),
      existing_machines: getExistingMachines().map(m => ({ name: m.name, file: m.file })),
      suggestion: 'Read each architecture area listed above, then re-call check_before_plan with all inventory fields set to true.',
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
    architectureInventory,
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
    architecture_inventory: architectureInventory,
    impact_warnings: (impactResult?.softWarnings || []).map(w => typeof w === 'string' ? w : w.content || w.reason || JSON.stringify(w)),
    rule: 'Persona docs are reference only — never treat as implementation truth without reconciling against existing architecture.',
  };
}

export { ARCHITECTURE_INVENTORY_ITEMS };
