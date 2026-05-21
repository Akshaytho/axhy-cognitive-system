---
name: Future product ideas (deferred, with triggers)
description: Running list of deferred product ideas. Each has a concrete trigger condition — surface when crossed. Not a wishlist, a scheduled backlog.
type: project
originSessionId: 515edcf7-6e79-4fe1-9f2e-b1521ab1dfbf
---
## How this file works

Each idea below is deferred with a **trigger** — a specific condition that makes it the right-moment-to-build. When the trigger hits (measured against current project state), surface the idea proactively along with its full case. Don't surface ideas whose trigger hasn't hit.

Every entry must include:
- **Idea** — one-line name
- **Trigger** — the specific measurable condition (client count, ARR, admin count, dated milestone, symptom in production, etc.)
- **Why defer** — why building it now is wrong
- **Expected profit when triggered** — concrete ₹/time/risk number at the trigger point
- **Case link** — if a full 6-point case was prepared, its location. Otherwise note "re-derive at trigger time."

When suggesting an idea NOT in this file, it still needs the full 5+1 case (`feedback_no_build_without_full_case.md`). This file is for ideas already vetted and parked with a known trigger.

---

## Active deferred ideas

### 1. MCP server for Cmd+K + client integrations

- **Trigger:** 15 active COMPANY_ADMIN tenants (not sandbox). Paid accounts only.
- **Why defer:** At pre-launch + single tenant, Cmd+K token spend is ~₹10/month. Building costs 2 days and a new operational moving part. Break-even only becomes real at ~10 tenants (~₹1.5k/month saved). At 15 tenants both the cost savings AND the support-ticket reduction from reliable Cmd+K become compelling simultaneously.
- **Expected profit when triggered:**
  - Anthropic token spend on Cmd+K drops ~80% (at 15 tenants ~₹2k/mo saved, compounds linearly with growth)
  - Query latency drops 8-12s → 2-3s → fewer admins giving up and emailing the founder
  - At 50 tenants: ~₹7.5k/mo saved + ~3 hrs/day founder time reclaimed from answering "how many visits last month" questions
- **Narrative at scale:**
  - Today: 2 Cmd+K queries/week. Irrelevant cost.
  - 10 tenants: 100 queries/day. ~₹1.5k/mo. Latency complaints begin.
  - 50 tenants: 500 queries/day. ~₹7.5k/mo. Admins stop trusting Cmd+K, escalate to email. Founder bottleneck.
- **Case link:** Full 6-point case in chat transcript 2026-04-24. Re-derive quickly from the profit section if memory is lost.
- **Scope at build time:**
  - ~500 LOC MCP server (TypeScript SDK)
  - 10-20 tools covering admin-facing questions (counts, recent, history, stats)
  - Auth scoped per-tenant
  - Deploy as same-service route OR separate Railway process — decide at build time based on SSR architecture

---

## Completed ideas (moved to main memory when built)

_None yet._

---

## How to add a new deferred idea

When the user says "save this for later" or an idea is clearly not the right moment, I add it here with:

1. A one-line name
2. A specific trigger (client count, revenue milestone, production symptom, date)
3. Why it's wrong to build now
4. Rough expected profit at trigger time
5. 3-tier narrative (today / intermediate / scale)
6. Either a full case link or "re-derive at trigger time"

Never save vague triggers like "when it's useful" or "someday." The trigger must be measurable against something I can check against project state.
