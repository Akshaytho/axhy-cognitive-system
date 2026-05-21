---
name: Phase C locks (consolidated)
description: Schema lock (18 tables, 6 buckets), Calendar table lock, 6 panel-locked answers, scope lock. All locked 2026-05-09.
type: project
---

# Phase C Locks (4 files consolidated, all locked 2026-05-09)

## Schema: 18 tables, 6 buckets
`people/` User, Membership, Device | `places/` Company, Site | `work/` Assignment, SiteSupervisorBinding, Visit, VisitPhoto, GpsTrailPoint, ChangeRequest | `decisions/` HandoffPackage | `chat/` ChatMessage, ChatToolCall, CalendarEntry | `infra/` AuditEvent, Notification, OutboxEvent

Founder cut a 50-table draft to 17+1. Anything beyond this gets added when a real scenario demands it.

## Calendar table (18th)
`chat/CalendarEntry` — soft-state planning surface. NOTE/DEMAND/TENTATIVE/EVENT per-date entries. AI reads 30-day window for context. Soft→hard promotion via DecisionCard. Distinct from hard state (Assignment/Visit/ChangeRequest).

## 6 panel-locked answers
1. Currency = INR paise, single Decimal column — no multi-currency
2. No WorkerProfile table — User + Membership covers it
3. Analytics = on-demand aggregation, no materialized views yet
4. Only gstin + pan for company tax fields
5. No Equipment table — defer until a scenario demands it
6. No SalesRep role — defer until scale justifies

## Scope
Supervisor mobile surface + assignment primitive. Sequence: finish Phase B leftovers FIRST (swap-requests, visit-end, dispatcher, Railway migrate), then Phase C.
