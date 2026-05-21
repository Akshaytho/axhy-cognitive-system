---
name: Stale decisions auto-dismiss (vanish) after 48h
description: Pending supervisor decisions older than 48h auto-dismiss with an audit log — they vanish from the queue, not just demote to a "stale" section
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
When a supervisor decision (any kind — swap-request, leave-approval,
replacement-invite, flagged review, SupervisorDecision row) has been
**pending for more than 48 hours from `createdAt`**, the system
**auto-dismisses** the row. The row vanishes from `/supervisor/decisions`,
its `dismissedAt` is set, and a `DWI_AUTO_DISMISSED` audit event is
emitted with `reason: "auto-dismissed: no action for 48h"`.

**Why (founder lock 2026-05-18 PM, REVISES earlier same-day decision):**
The earlier rule was "move to STALE section after 48h". Founder's later
reframe was sharper: "stale cards should expire after 48hrs ... then he
will be serious from next time, they will vanish, I need to take action."
The pedagogy is that the supervisor learns urgency — if you don't act in
48h, the work item is gone. A passive "STALE section" lets the queue
grow forever and trains the supervisor to ignore old items. Vanishing
creates a real cost (work that needed his attention is now untraceable
from his queue) and gives him incentive to handle each item the first
time he sees it.

**Why we do NOT auto-apply instead of dismiss:**
A worker who requested swap/leave thinks the supervisor decided. If we
silently auto-applied, the worker would be confused (they got something
they didn't follow up on). Dismiss is safer — it just means "the
supervisor never acted; here's the audit trail."

**Why we do NOT escalate to admin instead:**
Founder rejected escalate-to-admin 2026-05-18 AM as too clever for v3.

**How to apply:**
- Cutoff: `now() - createdAt > 48h` (uses Asia/Kolkata day boundary
  alignment so "48h" matches Ravi's intuitive timeline, not UTC drift).
- Failed-review rows are NEVER auto-dismissed — they're a different
  lane (AI compliance review) with its own UX.
- Auto-dismiss writes happen on the **read path** of
  `/supervisor/decisions`: a small batch UPDATE + audit insert at the
  top of the request before the queue is loaded. Race-safe — the
  conditional `updateMany` (`WHERE id IN (...) AND appliedAt IS NULL
  AND dismissedAt IS NULL`) prevents double-dismissing a row mid-apply.
- The audit event kind is `DWI_AUTO_DISMISSED` (distinct from the
  manual `DWI_DISMISSED`) so HR + Mr. Reddy can see how many decisions
  fell through per supervisor.
- The audit's `actorId` is the row's `supervisorId` (not `null`/system)
  so the dropdown timeline reads "Ravi's decision auto-dismissed after
  48h" rather than "system dismissed". Keeps accountability with the
  human who owned the queue.
- Cap the batch at 100 rows per read to avoid pathological cleanup
  stalls when a supervisor returns from a 2-week vacation.
- DOES NOT replace the "Stale" section design lock — that section is
  REMOVED. The DecisionSectionT enum should not contain `'STALE'` anymore.

**Surface area:**
- `packages/shared-schema/src/zod/decisions.ts` — remove `'STALE'` from
  `DecisionSectionSchema`; remove `stale` from `counts`.
- `apps/backend/src/lib/services/decisions-service.ts` — replace the
  `applyStaleness` function with `autoSweepStaleDecisions`; revert
  `SECTION_PRIORITY` back to 0/1/2 (FAILED_REVIEW=2); revert the
  `decodeCursor` priority bound.
- `apps/mobile/components/decisions/SectionHeader.tsx` — remove `STALE`
  label + dot color.
- `apps/mobile/app/(supervisor)/decisions.tsx` — remove `STALE` from
  `SECTION_ORDER` + grouped buckets.
- Replace the `supervisor-decisions-stale-section.test.ts` regression
  with an auto-dismiss test: a 49h-old decision read by the supervisor
  must (a) NOT appear in the response and (b) have `dismissedAt` set in
  the DB + a `DWI_AUTO_DISMISSED` audit event.

**Decision history:**
- 2026-05-18 AM: founder picked "Move to STALE section after 48h"
  (replaces "Auto-dismiss after 7 days").
- 2026-05-18 PM: founder reversed — "vanish at 48h, not just demote".
  THIS is the current canonical lock.
