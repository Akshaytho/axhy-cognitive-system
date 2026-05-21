---
name: Wave 4b external advisory review (cost/cap design)
description: External engineer/founder advisor reviewed Wave 4b cost-control design 2026-05-11; locked 10 design decisions for Wave 4b ship and Wave 4c/4d follow-ups
type: project
originSessionId: 4d204c5b-c118-4c43-b328-481815a60b2e
---
External advisor (founder's friend; experienced engineer) reviewed Wave 4b's AI cost-control design on 2026-05-11 and gave structured guidance. Founder has accepted the recommendations.

**Why:** Wave 4b shipped 14 commits (cost cap + LivingDoc + cross-tenant isolation) but had design ambiguities around per-supervisor caps, reconciliation, burst behavior, and pricing comms. Advisor brought outsider perspective — particularly that current real cost (~₹0.028/chat) is fine, but uncontrolled future behavior (abuse/bug/prompt-injection) is the actual risk.

**How to apply:** Use these as locked design decisions for Wave 4b ship-readiness and Wave 4c/4d planning. Do NOT re-debate. Surface to founder only if a downstream constraint contradicts one of them.

**The 10 locked decisions:**

1. **Wave 4b ship gate:** real-device iPhone smoke + ONE burst stress test (50 chats in 5 min, 1 supervisor, 1 tenant, LivingDoc update mid-session). Both must pass before declaring shipped.

2. **Cap-shape (Wave 4b stays, Wave 4c expands):**
   - Company soft warn ₹3,000/day → notify owner/founder (current shipped behavior)
   - Company hard cap ₹5,000/day → block company-wide AI (current shipped behavior)
   - Supervisor soft cap ₹33/day → warn supervisor only, do NOT notify owner (Wave 4c)
   - Supervisor hard cap ₹100-150/day → block that supervisor only (Wave 4c)

3. **Per-supervisor schema (Wave 4c):** new `UserDailyAiSpend` table, NOT a reset column on User. Preserves history for analytics.
   ```
   UserDailyAiSpend (id, companyId, userId, date, estimatedSpendInr,
     actualSpendInr nullable, inputTokens, outputTokens, cacheTokens,
     requestCount, softWarnedAt nullable, hardBlockedAt nullable,
     createdAt, updatedAt)
   unique key: (companyId, userId, date)
   ```

4. **Rate table reconciliation (Wave 4d):** keep hardcoded `TOKEN_COSTS_INR_PER_1K` for instant per-chat estimate. Add daily cron pulling from OpenAI usage API → write `estimated/actual/variance` per day. Alert if variance > **20%** (NOT 10% — small absolute deltas look like big % at low usage). Channel: founder phone/email first; admin dashboard badge later; Slack only if team grows.

5. **Burst-test cadence:**
   - Mocked cap/cost unit tests → every PR
   - Real OpenAI burst test → nightly on staging
   - Real OpenAI burst test → manual trigger before prod deploy
   - Real iPhone smoke → before release / after major UX changes
   The 50-chat real-OpenAI test costs ~₹1.40/run at current rates; affordable nightly, NOT every PR.

6. **Cache-hit-ratio surfacing:**
   - Internal admin/founder card: yes, basic only ("hit ratio %, requests, est spend, avg cost/chat last 7 days")
   - Customer admin: not yet
   - Supervisor app: never (no benefit)

7. **Cap-recovery UX:** NO manual override button. Midnight-only auto-reset. Founder can fix from DB in genuine emergency. Reason: "once owners can reset, the cap becomes a suggestion, not a guardrail." Future options (top-up, founder-approved override, paid extension) deferred until real customer demand.

8. **Pricing/marketing copy:** "AI is included in your subscription, with fair-use protection to keep the service reliable." NO metered tier introduced yet. Caps stay silent + internal.

9. **Notification noise discipline:** soft caps (₹33/day supervisor) do NOT notify owner — would create noise. Owner notified only when usage becomes commercially or operationally meaningful (i.e., company soft warn at ₹3K/day or hard cap at ₹5K/day).

10. **Core principle (the meta-rule):** "Real-time controls should be simple and fast. Financial truth should be reconciled later. Customer UX should stay calm. Founder visibility should be immediate. Do not give customers escape hatches until you have real usage data."

**Round 2 locks (added 2026-05-11 same-day after architecture context shared):**

11. **Outbox cap-awareness:** dispatcher MUST NOT obey AI cap. Cap blocks AI chat completions only. Critical operational notifications (payroll, attendance, cap-alert itself, audit events) must always flow. Implementation = priority classes:
    - CRITICAL: ai_budget_capped, payroll-impacting, attendance corrections, failed state transitions, system integrity
    - NORMAL: routine assignment notifications, supervisor reminders, non-urgent updates
    - LOW: analytics summaries, digest messages
    
    Dispatcher has its own rate limits + dedupe rules independent of AI cap. Specific dedup rules:
    - `owner.ai_budget_capped`: deliver once per company per day
    - Repeated assignment failure alerts: collapse into one digest
    - Same idempotency key: deliver once
    - Same event-type + entity + short time window: suppress duplicates

12. **DecisionCard tracking (Wave 4b minimum-fields, full dashboard later):**
    Add to ChatMessage:
    - `decisionCardType` — which propose_* tool was emitted
    - `decisionCardStatus` enum: `PROPOSED | APPLIED | REJECTED | FAILED | EXPIRED`
    - `rejectionReason` nullable enum
    - `costInr` (already shipped Phase 1)
    
    Rejection reason taxonomy:
    `OVERLAP_CONFLICT | WORKER_ON_LEAVE | WORKER_NOT_FOUND | SITE_NOT_FOUND | STATE_ALREADY_CHANGED | STALE_LIVING_DOC | SUPERVISOR_CANCELLED | BACKEND_VALIDATION_FAILED`
    
    Internal naming: NOT "wasted cost." Use `rejectedDecisionCardCostInr / invalidProposalRate / proposalApplySuccessRate`. The headline metric: `DecisionCard apply success rate = applied / generated`.

13. **LivingDoc governance (Wave 4e separate wave):** limits apply to ACTIVE rules only (REJECTED/EXPIRED kept for audit, NOT included in Tier 2 prompt).
    - Soft warning at 200 ACTIVE rules — internal warning surfaces, does NOT block. Message: "This supervisor's LivingDoc is getting large. Consider archiving stale rules or merging duplicates."
    - Hard block at 500 ACTIVE rules — block new additions until cleanup. Message: "Memory limit reached. Archive or merge older rules before adding new ones."
    - PENDING rules: warn if too many pending confirmations
    - Rule-quality layer at proposal time: dedupe check, conflict-with-ACTIVE check, vagueness check, scope check (company/supervisor/worker), auto-expiry check
    
    Principle: "LivingDoc should store durable operational memory, not become a transcript dump."

14. **WAVE-SPLIT LOCKED (replaces my earlier ad-hoc split):**
    
    **Wave 4b — before ship (THIS WAVE):**
    - Real iPhone smoke test (5 scenarios)
    - Burst test: 50 chats / 5 min, LivingDoc version-bump mid-burst
    - Confirm idempotent `/chat/apply`
    - Confirm company cap blocks chat but not history
    - Confirm `owner.ai_budget_capped` outbox is deduped once per day
    - Nice-to-have: store DecisionCard status fields + rejection reason if quick
    
    **Wave 4c — cost + supervisor controls:**
    - `UserDailyAiSpend` table (per advisor decision #3)
    - Supervisor soft cap ₹33/day (warn) + hard cap ₹100-150/day (block-just-this-supervisor)
    - Internal usage card (cache hit ratio + spend + req count + avg cost/chat)
    - Per-supervisor cost breakdown
    
    **Wave 4d — financial truth:**
    - OpenAI billing reconciliation (daily cron)
    - Estimated vs actual variance tracking
    - Founder alert if variance >20%
    - Actual-cost backfill into `UserDailyAiSpend.actualSpendInr`
    
    **Wave 4e — LivingDoc governance:**
    - 200 ACTIVE-rule soft warning
    - 500 ACTIVE-rule hard block
    - Duplicate / conflict detection at propose time
    - Expiry rules
    - Archive / merge flow

**Architecture validation:**
Advisor explicitly validated our core safety boundary: "AI proposes, supervisor confirms, backend validates, state machine decides — that is the correct architecture for an operational system where labour records, payroll, and auditability matter." This is a STRONG external endorsement and should NOT be re-debated; "AI auto-execute" mode is now permanently off the table.

**Maturity-direction lock:**
"The next maturity step is not 'more AI'. It is operational control around AI proposals: cost, conflicts, memory growth, and alert noise." Use this as the framing lens for any Wave 4c+ scope decisions.

**Round 3 locks (added 2026-05-11 same-day after my pushback round; advisor accepted 1+2+4, counter-pushed on 3):**

15. **DecisionCard fields PROMOTED to Wave 4b must-have** (was nice-to-have): minimum fields = `decisionCardType, decisionCardStatus, decisionCardId, applyAttemptedAt, appliedAt, failedAt, failureReason, expiresAt`. Plus `livingDocVersionAtProposal, livingDocVersionAtApply` for observability. Reason: every chat written before Wave 4c-without-fields = permanently null analytics data; can't backfill from rotated logs.

16. **`STALE_LIVING_DOC` DROPPED from rejection enum.** Reason: most version changes don't invalidate proposals; failing on version diff produces false positives. Track `livingDocVersionMismatchRate` separately as debug observability, NOT as a DecisionCard rejection.

17. **Status enum renamed: `REJECTED` → `DISMISSED`**:
    ```
    PROPOSED   = AI emitted, waiting for supervisor action
    APPLIED    = Supervisor tapped Apply, backend wrote ok
    DISMISSED  = Supervisor actively cancelled (new "Not now" button)
    FAILED     = Supervisor tapped Apply, backend rejected
    EXPIRED    = No supervisor action before expiry window
    ```
    Failure reasons (FAILED status only):
    `OVERLAP_CONFLICT | WORKER_ON_LEAVE | WORKER_NOT_FOUND | SITE_NOT_FOUND | STATE_ALREADY_CHANGED | BACKEND_VALIDATION_FAILED | PERMISSION_DENIED | TENANT_CONTEXT_MISMATCH | IDEMPOTENCY_REPLAY_CONFLICT | UNKNOWN`

18. **"Not now" / Dismiss button added to Wave 4b** if mobile-UI cost is cheap. Reason: without it can't distinguish supervisor-disagreed vs supervisor-busy vs app-closed vs card-irrelevant. Significantly improves DecisionCard quality analytics from day 1.

19. **DecisionCard expiry: 24 hours default for Wave 4b.** Type-specific expiry deferred:
    - Attendance/leave/assignment/swap/shift_change: 24h or until shift start
    - LivingDoc/complaint: 7 days
    But Wave 4b ships a single 24h default; type-specific is a Wave 4c+ refinement.

20. **Outbox dedup key uses IST/operating date, NOT UTC.** Key shape: `ai_budget_capped:${companyId}:${operatingDateIST}`. Reason: cap reset boundary is local-day, so dedup boundary must match — otherwise weird cross-midnight dedupe failures.

21. **LivingDoc 500-rule rule REVISED with classification (advisor counter-pushed me; he won):** above 500 ACTIVE rules:
    - Automatic extraction → block always
    - Manual SAFETY_CRITICAL → allow ("Lakshmi pregnant, no heavy lifting")
    - Manual OPERATION_CRITICAL → allow with red-banner warning
    - Manual NORMAL_MEMORY → block until cleanup ("Mukesh likes tea")
    
    My original "manual always allowed" stance was rejected: rationale = "once you say manual adds are always allowed, the hard cap is no longer a hard cap, becomes a warning, supervisors keep adding, LivingDoc bloats over months." Hard limit must stay hard for the bottom category to preserve guardrail meaning.
    
    **Open implementation question (next round):** how is rule classification determined? Options: (A) AI infers `severity` field at propose time, (B) supervisor picks via DecisionCard radio, (C) rule-based keyword heuristic, (D) AI suggests + supervisor confirms.

22. **Vagueness check REVISED — partial accept:** no second LLM call (I was right on that), but DO add cheap deterministic sanity checks at propose time:
    - No workerId/siteId/clientId/rule subject → ask clarification
    - No date/frequency/condition where required → ask clarification
    - Rule text below minimum useful length → ask clarification
    - Rule text contains only generic quality words ("do better", "clean properly") → ask clarification
    
    All mechanical, no LLM call needed. Wave 4e scope.

**Architecture endorsement reinforced:**
After seeing how chat + assignments fit together, advisor wrote: "Your core safety boundary is already right: AI proposes, supervisor confirms, backend validates, state machine decides. That is the correct architecture for an operational system where labour records, payroll, and auditability matter." This is the second explicit endorsement of the DecisionCard+state-machine pattern. Cannot re-debate without strong evidence of harm.

**Wave 4b MUST-HAVE before ship (final list):**
- Real iPhone smoke test (5 scenarios)
- Burst test (50 chats / 5 min, LivingDoc version bump mid-burst, all 8 invariants)
- DecisionCard lifecycle fields + status enum (renamed)
- "Not now" / Dismiss button if mobile-UI cost is cheap
- 24h default DecisionCard expiry
- Outbox dedup using IST date for `ai_budget_capped`
- Confirm idempotent `/chat/apply`
- Confirm company cap blocks chat NOT dispatcher

This is the locked Wave 4b ship-gate. Write a plan against this list, no scope creep, no scope cuts.

**Round 4 locks (final, 2026-05-11 same-day — advisor confirmed alignment "strong enough to build"):**

23. **Q9 LOCKED: LivingDoc severity = lightweight Option D (AI suggests + supervisor low-friction override).**
    - Tool schema gains: `severity: SAFETY_CRITICAL | OPERATION_CRITICAL | NORMAL_MEMORY` + `severityReason: string`
    - DecisionCard renders: "Memory type: [suggested]. Reason: [...]. [Change]"
    - Default flow: supervisor taps Apply without touching severity
    - Override flow: tap "Change" → 3-option picker
    - Backend stores: `severitySuggestedByAi, severityFinal, severityChangedBySupervisor (bool), severityReason`
    - Backend enforces (above 500 ACTIVE):
      - SAFETY_CRITICAL → allow
      - OPERATION_CRITICAL → allow with warning banner
      - NORMAL_MEMORY → block with cleanup-required message
      - Source = auto_extractor → block regardless of category
    - Reason advisor rejected pure A: severity is a CONTROL DECISION (gates the cap bypass), not just metadata. Pure-AI classification = AI can quietly weaken the cap by overclassifying. Hybrid keeps AI ergonomics + human guardrail.
    - Future analytics enabled: AI overclassification rate, supervisor change frequency, per-company critical-override count, hard-cap-bypass rate.

24. **Q10 LOCKED: Separate `POST /chat/dismiss/:cardId` endpoint** (NOT extended `/chat/apply`).
    - Reason: apply mutates operational state (state machines, audit, outbox); dismiss only updates lifecycle. Mixing them conflates semantics.
    - Dismiss endpoint behavior:
      - Verify tenant context (RLS via `withTenantContext`)
      - Verify supervisor can access this card
      - Verify card is currently `PROPOSED`
      - Set `decisionCardStatus = DISMISSED`, `dismissedAt = now()`
      - Optionally store `dismissedByUserId`
      - Return 200
    - Dismiss endpoint MUST NOT: call AI, enqueue operational outbox, mutate AssignmentConfig, mutate VisitInstance
    - Lightweight audit row: nice-to-have, not required Wave 4b unless cheap

25. **SHIP-GATE CHECKLIST LOCKED (12-item, advisor-authored):**
    Wave 4b is NOT shipped until ALL pass:
    1. Real iPhone smoke test passes
    2. Burst test (50 chats / 5 min) passes
    3. LivingDoc version bump during burst works
    4. DecisionCard lifecycle fields persist correctly
    5. Apply path remains idempotent
    6. Dismiss path works
    7. 24h expiry works
    8. Company AI cap blocks chat but not history
    9. Cap breach creates exactly one `owner.ai_budget_capped` outbox row per company per IST day
    10. Outbox dispatcher is NOT blocked by AI cap
    11. Existing tenant isolation tests still pass
    12. No AI path writes directly to DB without supervisor confirmation

26. **WAVE 4b EXPLICITLY NOT DOING (no scope creep allowed):**
    - No per-supervisor cost cap (Wave 4c)
    - No customer-facing cost dashboard (Wave 4c)
    - No OpenAI billing reconciliation (Wave 4d)
    - No full LivingDoc cleanup UI (Wave 4e)
    - No LLM-based vagueness checker (deferred indefinitely)
    - No manual owner reset button for daily cap (deferred indefinitely)

**Discussion-mode CLOSED. Plan-mode OPEN.** Advisor's last words: "I would stop debating and write the implementation plan. The design is now strong enough to build."
