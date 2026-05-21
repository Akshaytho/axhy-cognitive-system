---
name: Axhy v3 Product Framing — Supervisor Operating Brain (META lock)
description: Deep product-interpretation rules for v3 implementation. Sits ABOVE the doc-discipline protocol for implementation decisions. Locked 2026-05-13 by external advisor. Covers the 11 product principles (operating brain, three layers, AI memory model, cost-control via deltas, Claude-managed agent guardrails, HR ack as context-loading, serial replacement, consequence awareness, today/tomorrow/week computation, default daily plan, supervisor-cluster scope). Read this BEFORE any P1–P5 schema/route/agent implementation work; before any new spec; before any framing revision; before approving any plan that touches DWI, ReplacementInvite, HRUpdate, the chat extraction loop, the proposed-plan view, or the daily AI context layer. Length is intentional — friend said "more detailed than i gave so you don't forget how we do things when implementing code." Treat as the source-of-truth product interpretation.
type: feedback
originSessionId: 1001131c-a992-4c63-be9a-cf950b9e6d43
---
**Status:** Active (META lock — sits above doc-discipline for implementation decisions)
**Origin:** 2026-05-13 — external advisor directive to Akshay, forwarded verbatim
**Replaces:** nothing — first-version
**Validated branch (at lock time):** `feat/phase-c-wave-4b-chat-completion`
**Primary owner:** every Claude session implementing or specifying Axhy v3

> **Anti-refactor purpose.** This memory exists to make implementation drift expensive to notice and easy to prevent. The 11 principles below are the product interpretation. Every implementation decision (P1 schema migration onward) should reference at least one of these. If an implementation choice conflicts with any principle here, stop and flag — don't code through it.

---

# 1. Core product principle — supervisor operating brain

**Axhy is NOT:** an operations dashboard, a decision queue, a workflow management system, an HR tool, or a scheduling tool.

**Axhy IS:** a supervisor operating brain for a single supervisor inside a large company. The company may have 5,000+ employees; the supervisor only manages a local cluster (e.g., 30–60 workers across 5–8 sites). The product helps this one human do that one job better.

**Product principle stated as four words:** **Minimal surface. Strong memory. Consequence awareness. Future awareness.**

## 1.1 What this means in practice

- **Minimal surface** — the UI is small and exception-driven. Every visible element earns its place. Default is "nothing to show, you're fine"; the system only surfaces what needs attention. The 5-tab supervisor mobile design (Today / Decisions / Activity / Chat / Profile) is the minimum-viable surface; do not expand it without genuine product need.

- **Strong memory** — the system remembers everything that matters across days: HR rules acked, site rules, supervisor preferences, worker patterns, decisions made, history of replacements, leave records. The supervisor never has to repeat themselves to the AI. Memory lives in DB truth (permanent) + daily AI context (rolling).

- **Consequence awareness** — every important action should be paired with the system's best guess at consequences. "If you approve this leave, here's what breaks tomorrow." "If you accept this replacement, the original worker's site loses coverage at 6pm." No important action should ship without consequence framing.

- **Future awareness** — the supervisor lives in today / tomorrow / this week, not just today. The system surfaces near-future implications proactively (when truth changes, the future view updates).

## 1.2 What the product is NOT

- **Not a workflow tool** — supervisors do not "process a queue" of tasks. They make decisions. The Decisions Workspace is an inbox of pending decisions, not a task queue.
- **Not a generic operations dashboard** — no "dashboard" framing. No KPI charts. No analytics panels.
- **Not a planning tool** — the supervisor does not "plan a week" in Axhy. They run today; the system surfaces what's coming. Week-view is supplementary, never the main job.
- **Not an HR system** — HR posts updates that supervisors ack. The supervisor does not do HR work.
- **Not multi-supervisor coordination** — each supervisor operates independently. No cross-supervisor handoff, sharing, delegation (per Phase D lock #6 cut).

## 1.3 Implementation consequences

- When tempted to add a new tab / view / surface: reject by default. Every new surface needs an explicit product justification beyond "we have data for it."
- When tempted to add a feature: ask "does this help the supervisor avoid a bad decision?" If no, defer.
- When tempted to display more data: ask "does the supervisor need to scan this in 3 seconds?" If no, hide it behind a tap/expand.
- When tempted to surface KPIs / metrics / analytics: don't. The supervisor's job is not numbers-watching.

---

# 2. Today / tomorrow / this week — but computed, not stored

The supervisor's mental model spans today / tomorrow / this week. The product must support this. BUT the future is NOT a separately-stored permanent schedule. The future is **computed on demand from stored truth**.

## 2.1 What gets stored vs computed

**Stored (permanent DB truth):**
- Leave: `LeaveRequest{workerId, startDate, endDate, status, ...}` — when a worker takes leave 12th–14th, those three dates are stored facts
- Assignments: `Assignment{workerId, siteId, shiftStart, shiftEnd, recurrence}` — the default/scheduled assignment shape
- Attendance: `Attendance{workerId, date, status, markedBy, ...}` — actual attended/absent fact per date
- Decisions: `DecisionWorkspaceItem{...}` — every supervisor decision with lifecycle
- ReplacementInvite: ephemeral invite lifecycle (2-min TTL)
- HRUpdate: HR rules and ack records
- Site rules: facts about each site (e.g., "Apollo doesn't allow chemicals near kitchen")
- Working notes: supervisor's private notes (WORKING_NOTE kind)
- Audit events: every state change
- Calendar facts for future-dated commitments: e.g., "worker X is unavailable on the 13th"

**Computed (not stored, generated on request):**
- Today's working roster — computed from Assignment + Attendance + Leave + replacements
- Tomorrow's expected roster — computed from Assignment + Leave + (any known replacements scheduled)
- Week-view roster — computed for each day in the week from same inputs
- "Who's short tomorrow?" — computed from expected roster vs site demand
- Consequence projections — computed from rules + current truth + proposed change

## 2.2 Why this matters

If the implementer creates a `WeeklyPlan` or `TomorrowSchedule` table that stores a generated future schedule, that table becomes a permanent shadow truth — and when underlying facts change (new leave arrives, worker calls in sick), the shadow doesn't auto-update. Implementations that "store the proposed plan" are bug factories.

The correct pattern: **propose plan = function of truth + rules + defaults at the moment of request**.

## 2.3 Implementation pattern

```
function getProposedPlanFor(supervisorId, date) {
  // Inputs are stored truth
  const assignments = stored Assignments active on date
  const leave       = stored LeaveRequests covering date
  const attendance  = stored Attendance for date (only meaningful for today/past)
  const rules       = stored site rules + HR rules + supervisor preferences
  
  // Function output is computed
  return computeProposedRoster({assignments, leave, attendance, rules, date})
}
```

The function may be cached in the daily AI context layer (per §3) for the supervisor-day, but the cache evicts when truth mutates. The cache is a performance optimization, not a source of truth.

## 2.4 The supervisor's mental experience

- "What's today?" → query stored Attendance + Assignment for today's date
- "What's tomorrow?" → compute from Assignment + Leave for tomorrow's date
- "What does my week look like?" → compute for each day in the week
- "Worker X takes leave 12th–14th" → write three LeaveRequest rows (or one row covering range); next time tomorrow/week is computed, the leave is reflected
- "Can you swap workers for Tuesday?" → if Tuesday is tomorrow, computes from current truth; if Tuesday is far, computes the proposed view, supervisor confirms, then truth changes (new Assignment row)

---

# 3. The three layers — stored truth / proposed future plan / daily AI working context

This is the load-bearing architectural distinction. Every implementer must internalize it.

## 3.1 Layer A — Stored truth

**Definition:** permanent DB rows that survive across days and represent factual state.

**Examples:**
- `LeaveRequest`, `Assignment`, `Attendance`, `DecisionWorkspaceItem`, `ReplacementInvite`, `HRUpdate`, `HRUpdateRule`, `SiteRule` (or equivalent), `AuditEvent`, `Worker`, `Site`, `Membership`, `User`, `Company`

**Properties:**
- Written via authorized API routes only (no agent-direct writes — see §6.3)
- Tenant-scoped via `companyId` on every row
- Append-only where applicable (per existing locks: HRUpdate, HRUpdateRule, AuditEvent, generally)
- Audited (every mutation emits an AuditEvent)

**Implementation rule:** if it survives the supervisor closing the app and reopening tomorrow, it's stored truth and lives here.

## 3.2 Layer B — Proposed future plan (computed view)

**Definition:** computed views generated from stored truth + defaults + rules + current changes. NEVER a stored table.

**Examples:**
- `getRosterFor(supervisorId, date)` — returns expected roster for a date
- `getWeekViewFor(supervisorId, weekStart)` — returns 7 daily rosters
- `getProposedReplacementsFor(workerId, date)` — returns candidate workers for an open shift
- `getConsequencesOf(proposedAction)` — returns expected downstream impact

**Properties:**
- Pure function over stored truth at time-of-call
- May be cached per-supervisor-per-day in Layer C (daily AI context) for performance
- Cache evicts when underlying truth mutates OR at next supervisor-day boundary
- Never accepts writes — to "modify the proposed plan," modify the underlying truth and the next call returns the updated view

**Implementation rule:** if it can be answered by reading current Layer A + applying rules, it goes here as a function. Don't make it a table.

## 3.3 Layer C — Daily AI working context

**Definition:** temporary cache / row-shape that captures the supervisor's working state for THIS day. Used for AI prompt construction and cost-control.

**Examples of what lives here:**
- What happened today for this supervisor (event delta since first chat of day)
- Today's deltas (decisions applied, leaves approved, replacements completed, notes written)
- What still needs attention (open PROPOSED decisions, unacked HR rules)
- What HR updates were acked today
- What new absences / replacements / notes / rules happened today
- Small rolling summary for AI prompt context (last N decisions, last K rule edits)

**Properties:**
- NOT permanent truth — resets / refreshes per supervisor-day
- Cache-backed (Redis or in-memory; ephemeral table acceptable)
- Tenant + supervisor scoped: `(companyId, supervisorId, date)` composite key
- TTL: 24 hours OR end-of-supervisor-day, whichever comes first
- Eviction on truth mutation: when stored truth changes for an entity in context, that entity's cached representation invalidates

**Implementation rule:** if it's specific to today's working session, it lives here. If it survives sleep, it's Layer A.

## 3.4 Why the separation matters operationally

- **Layer A** is slow to query (full DB), authoritative, audit-trail backed
- **Layer B** is computed each call but cached in Layer C for the supervisor-day
- **Layer C** is fast (cache hit), tenant-scoped, fresh per day

A chat turn does NOT need to scan Layer A end-to-end. It needs the supervisor's Layer C context (cheap, refreshed) + targeted Layer A lookups (the worker, the site, the rules in play).

## 3.5 Transitions between layers

| Direction | Mechanism |
|---|---|
| Layer A → Layer B | Pure function call: `getProposedPlanFor(...)` reads A, computes B |
| Layer B → Layer C | Caching: B function memoizes per supervisor-day in C |
| Layer C → Layer A | Action: supervisor accepts a proposed change → route writes new row in A |
| Layer C → invalidated | TTL or truth-mutation eviction |
| Layer A → Layer C | Daily-context-loader writes today's relevant facts into C at first chat of day |

## 3.6 What the layers are NOT

- Layer C is NOT a half-permanent shadow truth. If a supervisor finishes the day, the supervisor-day context for today MUST evict. Tomorrow's context is a fresh load.
- Layer B is NOT a "schedule table." There is no `WeeklyPlan` row to update.
- Layer A is NOT cached arbitrarily. Specific entities flow into Layer C per the daily-context loader; other entities are queried on-demand.

---

# 4. AI memory model — operationally realistic, not magic

The AI does NOT have forever-memory. It has structured context that loads at start-of-chat and refreshes incrementally during the day.

## 4.1 The pattern

**At first chat of the day** (or first chat after a long gap):
1. The chat route loads the daily AI working context (Layer C) for this supervisor + date
2. If Layer C is empty (first load), the daily-context-loader populates it from Layer A:
   - Recent HR rules (last N days, both acked and unacked)
   - Today's stored truth (assignments, leave covering today, attendance so far)
   - Recent supervisor decisions (last N days, applied + recent dismissed)
   - Site rules for sites this supervisor manages
   - Supervisor preferences (working notes flagged as private, but supervisor's own)
3. Layer C is now the prompt's foundation

**During the day** (subsequent chat turns):
1. Each route reads Layer C as base
2. Each route adds turn-specific Layer A lookups (the worker mentioned, the site mentioned)
3. Each truth-write (apply, ack, mark absent, etc.) updates Layer C's delta log
4. AI prompt includes Layer C base + turn-specific facts, NOT a full Layer A reload

**Across chat turns the AI sees:**
- "Here's your starting context from today" (Layer C base)
- "Here's what's changed since the last turn" (Layer C deltas)
- "Here's what's specific to this query" (turn-specific Layer A facts)

## 4.2 What NOT to do

- **Do NOT reload the world per chat turn.** A chat turn must not re-query every Assignment + every LeaveRequest + every AuditEvent. That's a cost disaster.
- **Do NOT assume AI remembers across chat sessions.** Even within a day, restarting the app may not preserve in-memory state; rely on Layer C in the DB/cache, not on conversation state alone.
- **Do NOT treat chat history as the source of truth.** Chat conversation memory is a convenience for fluent UX. The supervisor's actual context lives in Layer C; the AI references conversation history opportunistically but never authoritatively.
- **Do NOT have the AI invent facts.** If a fact is needed and the row doesn't exist, the agent reports "no data" rather than guessing.

## 4.3 Prompt construction pattern

Each chat-route prompt should be structured roughly as:

```
[System prompt — Axhy v3 + role + capabilities]
[Layer C base context]
  - Today's roster summary
  - Acked HR rules for this supervisor today
  - Recent decisions (last 5)
  - Today's open Decisions Workspace items
  - Today's deltas since first load
[Turn-specific Layer A lookups]
  - Subject worker / site / decision being discussed
  - Recent decisions for the subject entity
[Supervisor's utterance]
[Tool definitions]
```

Each section is bounded in size. The "Layer C base" is computed once per chat session and refreshed only when deltas occur.

---

# 5. Cost-control principle — deltas, not full reloads

Refreshing the entire AI context on every supervisor action is unaffordable. The implementation must use deltas.

## 5.1 The rule

**DB truth is the source of truth.** Always queryable.
**Small daily working-context cache** holds the prompt's base.
**Small daily event-delta log** captures what changed since last AI invocation.
**Reload ONLY what changed** between turns.
**Recompute future proposed views when requested**, never precompute everywhere.

## 5.2 Concrete cost-control patterns

- **Daily-context-loader runs ONCE** per supervisor-day at first chat or first API call requiring context. Subsequent loads are cache hits.
- **Truth-write hooks update the delta log** in Layer C. Apply a decision → delta entry. Ack an HR rule → delta entry. Mark absent → delta entry.
- **AI prompt prepends the delta log** since the last prompt build. If no deltas, the prompt content stays the same (and prompt-cache prefix hits with high probability).
- **Future views (tomorrow / week) are computed on request**, not precomputed at start-of-day. If supervisor never asks for tomorrow's view, it's never computed.
- **Truth-mutation triggers selective invalidation**, not full Layer C wipe. If `Assignment` for worker X changes, only X's cached representation invalidates; other workers' contexts stay warm.

## 5.3 Cost-control anti-patterns to reject

- "Every chat turn rebuilds the full prompt from scratch." → BAD. Use delta-based assembly.
- "Pre-cache tomorrow + this-week views at 6am every day." → BAD. Lazy compute on first request.
- "Refresh the entire Layer C cache every hour." → BAD. Evict on truth mutation; load once per supervisor-day.
- "AI invokes the LivingDoc tool to remember context every turn." → BAD. Layer C handles this; AI doesn't need a separate memory-refresh tool.

## 5.4 Where Anthropic prompt caching fits

The 5-minute prompt cache TTL maps to chat turns within a single supervisor session. Build the prompt so the base (Layer C + system prompt) is identical across turns within the session, and only the turn-specific tail varies. This maximizes cache hit rate per Wave 4b Phase 2's existing pattern.

---

# 6. Claude-managed agents — where, when, how, NEVER

This is one of the biggest implementation decisions. Get it wrong and we either underuse agents (capability loss) or overuse them (cost + truth corruption).

## 6.1 USE Claude-managed agents FOR:

- **Default daily assignment / proposed-plan generation** — when supervisor opens the app at 6am, an agent (or deterministic logic) computes the default expected roster from Layer A
- **First chat of the day briefing** — agent constructs a "Good morning Suresh, here's what's coming today" summary from Layer C base
- **Today / tomorrow / week proposed-plan explanation** — agent narrates the computed view in plain Telugu/Hindi/English
- **Risk / consequence explanation** — when a propose action is suggested, agent narrates the likely consequences in supervisor-friendly language
- **Light background recomputation when key truth changes** — when a leave gets approved, an agent may recompute tomorrow's roster and emit a `SYSTEM`-source `DecisionWorkspaceItem` if coverage drops below threshold
- **Daily roll-forward helper logic** — if at end-of-day, an agent prepares tomorrow's context by reading today's resolved decisions

## 6.2 DO NOT use Claude-managed agents AS:

- **The permanent source of schedule truth** — agents never own data; DB tables do
- **The only memory of what happened** — agents read from Layer A / Layer C, they don't store
- **The actor that silently rewrites truth without persisted facts** — every truth-write goes through an authorized route; agents recommend, supervisors accept, route writes
- **The thing called on every tiny UI state change** — agent invocation has a cost; UI state changes are free; don't conflate

## 6.3 GUARDRAILS — hard rules

1. **Agents NEVER write to truth tables directly.** All truth writes flow through API routes that validate caller authorization (supervisor / HR admin) and tenant boundary.
2. **Agents recommend; supervisors authorize.** Agent suggestion → `propose_*` tool call → `DecisionWorkspaceItem(status=PROPOSED)` row → supervisor reviews → supervisor taps Apply → route writes domain row → truth is updated.
3. **Future proposed views are derivable from current truth even without agent memory.** Agents are stateless from one invocation to the next. The same view-computation should produce the same output regardless of whether an agent ran before.
4. **Agents NEVER invent facts.** If a row needed for computation doesn't exist, the agent reports "no data" / "not found" rather than guessing.
5. **Agent invocations are tenant-scoped.** Every agent prompt includes the caller's `companyId`. Agent route handlers validate tenant before invoking. Cross-tenant agent calls are a hard violation.
6. **Agent invocations are bounded.** A reasonable cap is N invocations per supervisor-day per surface; exceeding triggers an alert (cost monitoring) and possibly a 429 (rate limit).

## 6.4 Trigger list for background recomputation

When stored truth (Layer A) mutates, the following triggers MAY invoke a background agent (not exhaustive, but a starting list):

- New leave approved that overlaps an existing assignment → recompute tomorrow's roster
- Mass leave on a date (>X workers off) → emit SYSTEM decision "coverage gap warning"
- Cost-cap fires (per Wave 4b) → emit SYSTEM decision "consider pausing AI"
- HR digest posted → notify supervisor
- Worker no-show beyond threshold (e.g., 3rd no-show this month) → emit SYSTEM decision "consider performance review"

Triggers NOT to use:
- Any UI state change (tap, scroll, expand)
- Any read that doesn't change truth
- Frequent low-value events (every clock-in, every minor edit)

## 6.5 Agent prompt structure

Standard agent prompt (whether briefing, consequence explainer, recomputer):

```
[System prompt — Axhy v3 + agent role + capabilities]
[Tenant boundary: companyId, supervisorId, role]
[Stored truth context (from Layer A): relevant rows only]
[Daily working context (from Layer C): today's deltas + acked rules]
[Task: specific to invocation — e.g., "Generate briefing", "Explain consequence of action X", "Recompute tomorrow's roster given new leave for worker Y"]
[Output format: structured (JSON / specific text shape)]
[Grounding rule: NEVER invent facts; if a row doesn't exist, report "no data"]
[Tenant scoping: NEVER reference entities outside companyId]
```

---

# 7. Default daily plan generation — desired, but truth-rooted

The supervisor should NOT have to manually compose every day from scratch. The system generates a default expected state.

## 7.1 What "default daily plan" means

At start-of-day for a supervisor, the system has enough information to project the expected state:

- Default assignments (recurring or explicit) for today
- Known leaves covering today (workers off)
- Recent attendance patterns (workers likely to be on time)
- Site rules (e.g., "Apollo opens at 6am")
- Site demand (workers required per site / shift)

From this, a default daily plan is generated: "Today, these 47 workers are expected at these 8 sites in these shifts; coverage is X / Y."

## 7.2 What the supervisor sees

Per R6 Today tab: a summary of the expected roster + any coverage gaps + any pending decisions. The default plan is the DISPLAY of the computed view; it's not a separately-stored artifact.

## 7.3 What happens when reality diverges from default

- Worker no-shows → Attendance row written → expected roster updates in next computation
- Leave arrives at 7am for a worker who was supposed to be at site X → LeaveRequest written → next computation shows the coverage gap → SYSTEM decision proposed "Find replacement for worker Y at site X"

## 7.4 Implementation pattern

```
function getDailyDefaultPlanFor(supervisorId, date) {
  return computeProposedRoster({
    assignments: getActiveAssignments(supervisorId, date),
    leave:       getLeaveCovering(supervisorId, date),
    attendance:  getAttendance(supervisorId, date),
    rules:       getRulesFor(supervisorId, date),
    date
  })
}
```

Pure function. Truth-rooted. Recomputable on demand. Cached per supervisor-day in Layer C for performance only.

## 7.5 Anti-pattern: "store the day plan"

Do NOT create a `DailyPlan` table that gets pre-generated at 6am and then mutated as the day progresses. That table will diverge from underlying truth and become a bug factory. The day plan is a function output, never a table.

---

# 8. HR acknowledgement — operational attention, NOT compliance evidence

The R6 prototype shows HR Updates require "5+ words in own voice" ack. The purpose is OPERATIONAL ATTENTION, not compliance.

## 8.1 The real meaning of ack

When a supervisor acks an HR update:
- The update has entered the supervisor's WORKING CONTEXT
- The AI now uses this rule in subsequent decisions during the day
- The supervisor mentally processed it (the 5-word requirement enforces engagement)

Compliance evidence (an audit trail showing the supervisor saw and acknowledged the rule) is a SIDE BENEFIT, not the primary purpose. The audit trail is real; it's just not why the ack mechanism exists.

## 8.2 What the system does on ack

1. Supervisor types ack (≥5 words own voice) → `POST /hr-updates/:id/ack`
2. Route validates word count + tenant + audience
3. Single tx: set `HRUpdate.ackedAt = now()`, `HRUpdate.ackText = $ackText`
4. Write `AuditEvent(kind = 'HR_UPDATE_ACKED')`
5. **Update Layer C (daily AI working context)** — add the acked rule to the supervisor's working set for the rest of the day
6. Subsequent AI decisions for this supervisor see the rule in prompt context

The Layer C update in step 5 is the operational-attention payoff. Without it, ack is just paperwork.

## 8.3 What happens when a rule is acked

The rule joins the supervisor's "rules in play for today" set. The AI sees it on every subsequent decision. If a supervisor acks a rule like "no chemicals near Apollo kitchen at lunchtime," then later proposes assigning a chemical-treatment worker to Apollo at 12pm, the AI should surface the conflict.

## 8.4 What NOT to do

- **Don't treat ack as a compliance checkbox.** A supervisor who types 5 generic words and moves on is gaming the system, but worse, the rule never enters context. Detection of generic acks is a future feature; the operational consequence (rule into context) is mandatory.
- **Don't let unacked rules sit silently.** The NEEDS YOUR ACK section of Updates tab exists precisely to surface unack'd rules. Push notifications fan-out per HR Updates spec.
- **Don't gate ack on chat being open.** Ack works without an active chat session; Layer C captures the ack and applies it at next chat-load.

## 8.5 Implementation consequence

The HR Updates spec mentions audit-event kinds (HR_UPDATE_POSTED, HR_UPDATE_ACKED) but does NOT yet explicitly model the Layer C update on ack. This needs to be specified in the framing doc or as an HR Updates spec amendment.

---

# 9. Replacement flow — serial by design

One replacement need = one invite at a time. 2-min expiry. Retry same worker or try another worker. **No parallel invites at launch.** This is intentional.

## 9.1 Why serial

- **Race-to-accept complexity** — if 3 invites go out and 2 workers accept, the system has to cancel one. This is solvable but adds notification complexity, cancellation flows, and supervisor confusion.
- **Notification cost** — each invite is a push (and later potentially WhatsApp). Multiplying by N candidates per opening is expensive.
- **Supervisor mental model** — "I asked Pradeep. He said no. I asked Suresh." is simpler than "I asked three people, two said yes, now what?"

## 9.2 The flow

1. Supervisor sees coverage gap (e.g., worker Y is sick, site X needs cover at 6pm)
2. Supervisor opens Replacement Picker for site X / 6pm shift
3. Picker shows candidate workers (filter by trait: preferred / known / on-shift / etc.)
4. Supervisor picks one candidate → POST /replacement-invites
5. Backend writes ReplacementInvite(status=SENT, expiresAt=now+2min)
6. Push notification fires to candidate worker
7. Either:
   - **Worker accepts** within 2 min → SENT→ACCEPTED → Assignment created
   - **Worker rejects** within 2 min → SENT→REJECTED → supervisor sees rejection, picks another candidate
   - **2 min elapses** with no response → cron sweep SENT→EXPIRED → supervisor notified
   - **Supervisor cancels mid-2-min** → SENT→CANCELLED → supervisor picks another
8. If no accept yet, supervisor picks the next candidate → new ReplacementInvite (new id, new 2-min window)

## 9.3 Why this is intentional, not a gap

When Akshay raised "should we allow parallel invites?" the answer was: not at launch. The system can handle parallel later if real product scenarios demand it (e.g., extreme urgency at 5am for a 6am shift). Currently no such scenario.

**Phase D §4 trigger to revisit:** if more than X% of replacement flows fail due to "first candidate said no and I waited too long," parallel becomes a feature request worth honoring.

## 9.4 What NOT to do

- **Don't model parallel invites as a feature gap.** Frame as: serial-by-design at launch; parallel reconsidered if specific evidence demands it.
- **Don't extend the 2-min window to "give the worker more time."** 2 min is the contract. Longer windows mean supervisors wait longer on the wrong candidate.
- **Don't auto-retry on expiry.** Supervisor sees the expiry and explicitly picks the next candidate. Auto-retry hides supervisor visibility into who said no.

---

# 10. Consequence awareness — every important action

The product principle: **no important action should happen without the system being able to show the likely consequence.**

## 10.1 What "consequence awareness" looks like

Three concrete examples from the friend's directive:
- **"If I approve this leave, what breaks tomorrow?"** — supervisor about to approve worker Y's leave for tomorrow. System shows: "Site X loses coverage at 6pm; no current backup; suggest find replacement now."
- **"If I move this worker, what site becomes weak?"** — supervisor about to swap worker A from site X to site Y. System shows: "Site X had A as its only Telugu speaker; site X's morning shift loses language coverage."
- **"If I accept this replacement, what changes?"** — supervisor about to accept Pradeep as a replacement at site Z. System shows: "Pradeep is currently on shift at site W until 5pm; accepting means site W loses Pradeep early."

## 10.2 Implementation pattern

Every `propose_*` tool the AI emits should include a `consequences` block alongside `payload` and (if needsReview) `options`:

```jsonc
{
  "tool": "propose_approve_leave",
  "payload": { workerId: "...", startDate: "...", endDate: "..." },
  "consequences": [
    {
      "kind": "COVERAGE_GAP",
      "summary": "Site Apollo loses morning coverage on 2026-05-14 (no backup currently assigned)",
      "affectedEntities": [
        { "type": "Site", "id": "apollo", "name": "Apollo Hospital" },
        { "type": "Date", "value": "2026-05-14", "shift": "morning" }
      ]
    },
    {
      "kind": "WORKER_AVAILABILITY",
      "summary": "Worker X (preferred backup) is also off on 2026-05-14",
      "affectedEntities": [...]
    }
  ]
}
```

The UI renders the consequences in the Decisions Workspace card / option-picker / Apply preview. Supervisor sees the consequence before tapping Apply.

## 10.3 Consequence computation

Consequences are computed by:
1. Applying the proposed action against current truth (Layer A)
2. Querying the computed view (Layer B) for the affected date(s)
3. Comparing pre- and post-action views
4. Identifying gaps, conflicts, or notable changes
5. Returning the consequence list

This may be done by:
- A deterministic function (preferred for fast, predictable cases)
- A Claude-managed agent (for complex cases requiring narrative explanation)

## 10.4 Launch scope

At launch, consequence awareness can begin SIMPLY:
- Each propose tool emits 0-3 consequences
- Consequences are text-summarized
- UI renders them as a small block under the decision body
- More sophisticated consequence inference is post-launch

But the PRINCIPLE is non-negotiable from day 1: no important action ships without consequence framing.

## 10.5 What NOT to do

- **Don't strip consequence support to "we'll add it later."** The contract level must include consequences from launch.
- **Don't make consequences a separate API call after Apply.** They must be visible BEFORE Apply, so the supervisor decides with the consequence in mind.
- **Don't generate consequences if the agent isn't confident.** Better to emit empty consequences[] than to hallucinate a fake "site X loses coverage" warning.

---

# 11. Today / tomorrow / this week — surface implications

The friend's framing principle 11 reinforces the operating-brain scope: the supervisor lives in today / tomorrow / this week, not just today.

## 11.1 What surfaces are needed

**At minimum (v3.0 launch):**
- Today tab (R6 already has this) — actual roster + coverage gaps + open decisions
- Tomorrow view — even if minimal: "Tomorrow's expected roster; here's the X workers short; any leaves arriving?" Could be a Tomorrow tab OR a Tomorrow section on Today.
- Week view — even if minimal: "This week at a glance; days with coverage risk; days with leave events." Could be a Week tab OR a Summary section.

**R6 surface gap:** R6 currently has Today + Summary + Updates + Decisions + Chat + Profile. Tomorrow is implicit (Summary touches it); Week is missing. The product framing flags this as a known launch gap.

**Resolution path:** either (a) add Tomorrow/Week surfaces to R6 (requires design round), or (b) accept as known launch gap with R6 covering today-dominant cases.

## 11.2 What's NOT needed (per minimal-surface principle)

- Monthly view
- Yearly view
- Multi-supervisor view (per Phase D lock #6 cut, no delegation/cross-supervisor)
- Calendar-style UI with all dates visible
- Drag-and-drop scheduling

The week is the upper bound on time horizons. Beyond a week, the supervisor doesn't plan; they react.

## 11.3 Truth flow for future dates

When a worker takes leave 12th–14th:
1. `LeaveRequest{workerId, startDate=12th, endDate=14th, status=APPROVED}` is written to Layer A
2. Next time supervisor opens Tomorrow view (suppose today is 11th), the 12th's roster is computed from Layer A and shows the worker as on leave
3. If a coverage gap exists on the 12th, SYSTEM may emit a DecisionWorkspaceItem proposing replacement candidates
4. If supervisor takes no action, the gap remains in the computed view; on the 12th morning, the gap is now Today's gap

No fake permanent future schedule is stored. The leave fact is stored; the future view is computed.

---

# 12. Implementation rules that MUST NOT drift

These are the load-bearing implementation invariants. Future sessions should treat each as non-negotiable unless explicitly relocked.

## 12.1 Truth storage rules

- All permanent facts go in stored truth tables (Layer A)
- Every row has `companyId` for tenant scoping
- Every row has audit hooks (mutation → AuditEvent)
- Append-only where applicable (HRUpdate, HRUpdateRule, AuditEvent)
- Tenant boundary enforced at the row level + the route level + the agent level

## 12.2 Computed view rules

- No future-state table. The week view is a function call.
- Computed views may be cached in Layer C per supervisor-day
- Cache evicts on truth mutation OR end-of-supervisor-day

## 12.3 Daily AI context rules

- Layer C is per `(companyId, supervisorId, date)` — composite uniqueness
- Layer C has TTL: 24h or end-of-supervisor-day, whichever comes first
- Layer C captures: today's deltas, acked rules today, recently affected entities, small rolling summary
- Layer C is NOT permanent. It is NOT the source of truth. It is performance + cost-control.

## 12.4 Agent invocation rules

- Agents NEVER write truth tables directly
- Agents recommend; routes write; supervisors authorize
- Agents are tenant-scoped (companyId in every prompt)
- Agents are bounded (invocation cap per supervisor-day)
- Agents NEVER invent facts (no-data > guess)
- Background recomputation triggers are explicit (the list above); ad-hoc invocations not allowed

## 12.5 Chat extraction rules

- Chat extraction creates `DecisionWorkspaceItem(status=PROPOSED)` rows (per D.1 §2.5)
- Apply route transitions to APPLIED; dismiss to DISMISSED; failure to FAILED
- Amend flow always creates NEW rows; never mutates APPLIED rows
- UI intent tokens (`worker:<uuid>`, etc.) are NOT persisted identifiers (per D.1 §2.7)

## 12.6 HR Updates rules

- HR posts → audience = all supervisors in companyId (launch) — per HR Updates spec §4.1
- Ack updates Layer C (operational attention) AND AuditEvent (audit trail)
- HRUpdate + HRUpdateRule are append-only (per D.1 §2.9)
- Mixed-tier digests forbidden at launch — split into separate digests per tier

## 12.7 Consequence rules

- Every propose tool emits `consequences[]` (may be empty)
- Consequences computed from Layer A + (Layer B if needed) + proposed action
- UI renders consequences BEFORE Apply; supervisor decides with consequences visible
- Agents emitting fake consequences is forbidden (no-data > guess)

## 12.8 Replacement rules

- Serial invites: one SENT at a time per replacement need
- 2-min TTL: hard reject after expiry (no grace window)
- ReplacementInvite is separate entity (NOT DecisionWorkspaceItem) — per D.1 §2.8
- Cron + route-level check both enforce TTL

---

# 13. Anti-patterns that will cause refactors

These are the most likely places future implementation drifts. Watch for them.

## 13.1 Storage anti-patterns

- ❌ "Let's create a `WeeklyPlan` table for fast lookups."
- ❌ "Store tomorrow's expected roster so we don't recompute."
- ❌ "Cache the proposed plan permanently — it changes rarely."
- ❌ "Add `dailyPlanId` FK on `Worker` so we know who's where."

All of these create shadow truth. Future views are functions, not tables.

## 13.2 Agent anti-patterns

- ❌ "Have the agent write the new Assignment row directly when the supervisor accepts."
- ❌ "Agent reads recent decisions to remember; cache the agent's working memory."
- ❌ "Invoke the agent on every chat-turn for context refresh."
- ❌ "Agent generates and stores tomorrow's schedule at 6am every day."

Agents recommend, never authoritatively store. Background recomputation is bounded.

## 13.3 Cost anti-patterns

- ❌ "Each chat turn rebuilds the full prompt from scratch."
- ❌ "Pre-compute all future views proactively at start-of-day."
- ❌ "Layer C is empty? Reload everything for this supervisor."
- ❌ "Refresh prompt every 30 seconds in case truth changed."

Use deltas. Lazy compute. Cache invalidation, not full reload.

## 13.4 Surface anti-patterns

- ❌ "Add a Dashboard tab with KPIs for the supervisor."
- ❌ "Show all 50 workers' status in a big list."
- ❌ "Add a Monthly view since we have the data."
- ❌ "Surface every decision the AI proposed today."

Minimal surface. Exception-driven. Three-layer hierarchy (scan/act/inspect).

## 13.5 Decision flow anti-patterns

- ❌ "Skip the consequence block for routine decisions to save time."
- ❌ "Let the agent emit fake consequences when the real ones aren't known."
- ❌ "Apply the action first, then explain consequences after."
- ❌ "Strip the typed-phrase ack for EMPLOYMENT tier to streamline UX."

Consequences before Apply. Ack remains the engagement gate.

## 13.6 HR ack anti-patterns

- ❌ "Allow ack via button tap to streamline UX."
- ❌ "Skip Layer C update on ack to reduce DB writes."
- ❌ "Show ack count in admin dashboard without per-ack content."
- ❌ "Treat ack as pure compliance signal; don't change AI behavior."

5-word ack stays. Layer C update is mandatory. Ack changes AI context.

---

# 14. Panel verification questions to ask before any major implementation

When a future session is about to start P1 schema migration or any substantive implementation, run the 5-voice panel (Maya / Eric / Naina / Vikram / Aanya) against these questions:

1. Did we preserve the product as a supervisor operating brain, or did we flatten it into a generic operations tool?
2. Did we preserve today / tomorrow / this week computation correctly without turning it into fake permanently stored future truth?
3. Did we define stored truth vs daily AI context vs proposed future plan clearly enough for implementation?
4. Did we explain Claude-managed agents clearly enough that they will help without becoming the wrong source of truth or cost driver?
5. Did we preserve HR acknowledgement as real supervisor attention / context-loading?
6. Did we preserve the serial replacement model intentionally?
7. Did we keep the product low-UI / high-intelligence instead of feature-heavy?
8. Where is the implementation still wrong or too weak, if anywhere?

Each "no" or "weak" answer means: stop, revise, then continue.

---

# 15. How this memory interacts with other locks

- **`feedback_doc_discipline_protocol.md`** — governs HOW docs are written. This memory governs WHAT the product is. The doc-discipline protocol is the meta-rule for the doc system; this memory is the meta-rule for the product.
- **`feedback_plan_mode_for_medium_major_changes.md`** — every medium/major change still requires plan mode + panel + founder approval. This memory adds: each plan must check against the 11 product principles.
- **`feedback_panel_thinks_one_year_horizon.md`** — panel critique is at year-365 (supervisor's day-365 experience). This memory's principles ARE the year-365 experience: minimal surface, strong memory, consequence-aware, future-aware.
- **`feedback_panel_every_change_only_important_decisions_surface.md`** — every change is panel-debated; only important decisions surface to founder. This memory: every change should also check against this product framing.
- **`feedback_supervisor_id_is_user_id.md`** — schema convention. Compatible.
- **D.1 Active spec** — Decision entity model lives within the framing here. D.1's lifecycle is the structural shape; this memory is the product-purpose framing.
- **R6 Active spec** — Surface design. This memory says: keep it minimal; today/tomorrow/week surfaces should follow if not yet there.
- **HR Updates Active spec** — Routes + policy. This memory says: ack is context-loading, not compliance.

---

# 16. Future spec changes that should follow from this memory

When the framing-doc landing plan (Stage F.1–F.4 from the previous session) executes, the following changes should land:

1. **NEW: `docs/specs/2026-05-13-product-framing.md`** — Active, containing the 11 principles + three layers + agent guardrails + consequence pattern + memory model.
2. **D.1 §2.5 HR row reframing** — compliance-evidence → operational attention / context-loading.
3. **D.1 §2.8 ReplacementInvite** — parallel-deferred → serial-by-design.
4. **D.1 new §2.12** — cross-ref to product-framing doc.
5. **R6 §2 surface inventory** — Tomorrow + Week as named gaps or stubs.
6. **R6 §4 new row #16** — surface gap (today-dominant) acknowledged.
7. **R6 §6 founder-locked decisions** — note operating-brain framing.
8. **HR Updates §3 + §10** — ack reframing.
9. **canonical-truth.md** — add framing doc to Active.

Stage F.3 should additionally resolve the 5 panel-identified weaknesses (consequence mechanism, daily context schema shape, agent invocation budget, tenant boundary on Layer C, agent grounding rule).

---

# 17. The single most important sentence

If the future implementer can only remember one thing from this memory, it is this:

> **The supervisor's truth lives in the DB. The AI helps the supervisor see the truth, predict its consequences, and decide what to change. The AI is never the truth itself.**

Everything else follows.
