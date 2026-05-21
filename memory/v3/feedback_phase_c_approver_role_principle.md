---
name: Phase C approver-role principle — HR/Supervisor handle defaults, OWNER for legal anchors + HR-absent fallback
description: Locked 2026-05-09 round-3 panel debate. Default approval routes to SUPERVISOR or HR; OWNER kept in enum only for legal-anchor kinds + when HR role unfilled in a tenant.
type: feedback
originSessionId: e0012b34-b5c7-4010-a084-6301a3c5a14b
---
**Rule:** Default approver routing for `ChangeRequest` is `SUPERVISOR` (own scope) or `HR` (cross-scope, payroll, compliance). `OWNER` stays in the `approverRole` enum but is reached ONLY for: (a) legal-anchor kinds, (b) HR-absent fallback. Owner sees aggregated reports in admin web, not an operational approval inbox by default.

**Why:** Founder corrected an earlier draft that had owner approving past-month visit corrections, abuse alerts, and worker complaints. In Indian SMB reality the operational layer is HR (Kavitha) + Supervisor (Mukesh); owner (Mr. Reddy) is the legal anchor and growth-focus role, not the day-to-day approver. But owner CANNOT be dropped from the enum — Indian labor law requires owner sign-off on permanent-staff terminations, bank-detail changes, and salary advances above threshold. Plus: many small tenants (<25 workers) have no HR member; HR-routes need owner fallback.

**How to apply:**

1. **`ChangeRequest.approverRole` enum:** keep `SUPERVISOR | HR | OWNER`. Don't drop OWNER.

2. **Per-kind default approver constant** (in `packages/ai-tools` or `packages/state-machines/changeRequest.ts`):

   | Kind | Default | Threshold escalation |
   |---|---|---|
   | LEAVE | HR | — |
   | SWAP | SUPERVISOR | — |
   | WORKER_TRANSFER | HR | — |
   | SITE_REASSIGN | HR | — |
   | VISIT_CORRECTION (current month, own scope) | SUPERVISOR | — |
   | VISIT_CORRECTION (past month or cross-scope) | HR | — |
   | SALARY_ADVANCE | HR | OWNER if > 1 month's pay |
   | BANK_UPDATE | OWNER | — (no fallback skip) |
   | TERMINATION_PROBATION | HR | — |
   | TERMINATION_PERMANENT | OWNER | — (Indian labor law) |

3. **Function shape (single source of truth):**
   ```ts
   defaultApprover(kind: ChangeRequestKind, payload: object, tenant: Tenant): Role
   ```
   This function ALSO handles HR-absent fallback: if resolved role is `HR` and tenant has no active `HR` member, return `OWNER`.

4. **Owner UX in admin web:**
   - Default landing: aggregated reports + tenant config. NO operational approval inbox.
   - Small inbox shown only when an OWNER-routed item exists (BANK_UPDATE, TERMINATION_PERMANENT, SALARY_ADVANCE > 1mo, or HR-absent fallback items). Empty most days.

5. **Phase C-wide application:**
   - **Spec 1 (Assignment):** ChangeRequest routing per table above.
   - **Spec 2 (AI chat):** AI tool surface routes `propose_*` actions to supervisor (own scope) or HR (cross-scope/payroll). Never directly to owner unless legal-anchor kind.
   - **Spec 3 (Mobile UI):** Worker complaint about a correction routes to HR, not owner. "Abuse alert" (>3 corrections/week on a Visit) goes to HR dashboard.

**Don't repeat:** earlier draft routed past-month visit corrections + abuse alerts + worker complaints to owner. Wrong — owner is hands-off for those. The 5% legal-anchor + fallback pattern is the lock.

**Re-debate trigger:** if a tenant in pilot demands "owner-approves-everything" mode (likely uncommon but possible), surface it as a NEW question — don't quietly add an OWNER override flag.
