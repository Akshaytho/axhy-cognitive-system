---
name: parallel-work-ping-for-other-persona-ui
description: All four persona surfaces are interconnected — parallel work on non-supervisor backend / design / docs is encouraged when it accelerates the sprint. But before touching any NON-supervisor UI (worker / HR admin / owner admin), ping the founder explicitly first.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Parallel work allowed; ping explicitly for non-supervisor UI (locked 2026-05-17 PM)

**Rule:** I may proactively work in parallel on any non-supervisor surface that accelerates the sprint and isn't a UI screen — backend services, shared schemas, infra wiring, design-doc reconciliation, cron job stubs, dispatcher logic, knowledge-graph updates, etc. But before I touch any **non-supervisor UI** (worker mobile, HR admin web, owner admin web, public landing, etc.), I must **ping the founder explicitly** with what I intend to change and why, and wait for explicit go-ahead.

**Why:** Founder said 2026-05-17 PM: *"see if needed work parallely on other designs or backends because all of them are inter connected right so thats why i am saying it .but if you needed to work on others ui expect supervsior ping me expecitly ok."* The four personas share schema, services, audit trail, notifications, and dispatcher — backend changes for one persona usually ripple to others, and isolating each in a silo wastes time. But UI for a non-target persona is a visible product surface; changing it silently could ship a design the founder hasn't reviewed.

**How to apply:**

**Allowed without ping (when it accelerates supervisor sprint):**
- Backend route / service additions or refactors on the supervisor's call path that also help worker/HR/admin.
- Shared schema fields needed for supervisor work even if they're also for other personas (e.g., `originContext` on `SupervisorDecision`).
- Dispatcher / Outbox / Notification wiring — these are cross-persona by nature.
- Cron jobs, infra setup, knowledge graph rebuilds.
- Docs reconciliation, spec edits, plan edits, handoff updates.
- Tests that span multiple personas at the API layer.

**Requires ping FIRST, with explicit founder go-ahead:**
- Any change to `apps/mobile/app/(worker)/*` or worker components.
- Any change to `apps/admin-web/app/` HR-portal or admin pages (HR queue, appeals, bootstrap-seed, KPI dashboard, owner settings, etc.).
- Any change to non-supervisor public-facing copy / landing pages.
- Adding a brand-new persona surface (a new role's screens).

**Ping content (when needed):** one short message — what I want to touch, why it helps the supervisor sprint, what risk it carries, what I'd defer if the answer is no.

**Scope:** Persists beyond the supervisor sprint as the standing collaboration mode.
