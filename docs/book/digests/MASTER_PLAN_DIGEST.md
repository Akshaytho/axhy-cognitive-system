---
authority_level: digest
source: /Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md
source_hash: 1cb2ac2a03c4b8c080fb563c17a6abc4d47b3fc70f2969b1c75659d95e8462f1
source_lines: 3309
confidence: founder-review-required
known_omissions:
  - Full panel member bios (73 members — names and roles only below)
  - Complete Prisma schema definitions (entity names and relationships only)
  - Marketing copy and sales playbook (sections W, X)
  - Contingency plan details (section T)
  - AI onboarding 50-question bank full list (section R)
  - V2 lessons narrative (section F)
  - Engineering practices detail (section Y)
  - Monitoring and observability (section Z)
  - Brand identity and tone of voice (section AA)
  - Feature gap log (section BB)
  - Decision tree for when founder is stuck (section CC)
created: 2026-05-26
last_verified: 2026-05-26
promote_to_locked: false
---

# Master Plan Digest

> **This is navigation, not authority.** The full master plan (3,309 lines) is the source of truth. Use `impactCheck("your intent")` to retrieve relevant details. Read the full source only when impactCheck points there or you need exact wording.
>
> **Source freshness:** If `source_hash` does not match the current master plan hash, this digest is stale and must not be used for decisions until regenerated.

## Product

Axhy is the first cleaning operations platform that learns each customer's business through conversation, runs day-to-day with voice and AI verification, and gets smarter the longer it's used. B2B SaaS for Indian cleaning/facility-management companies (30-500 workers, 10-100+ sites). Founder: Akshay Thota, solo, bootstrapped, Hyderabad.

**Pricing:** Rs 5,000/month minimum + Rs 8/visit + Rs 10/visit for long-duration. AI cost silent (never line-itemed). 30-day founder-led pilot for first 10 customers.

## Personas (roles, not full bios)

Worker, Supervisor, HR, Owner (COMPANY_ADMIN), SUPER_ADMIN (Axhy team only). Panel has 73 virtual members covering architecture, AI, UX, security, Indian B2B, compliance, mobile, DevOps, QA, field ops, customer education, and more.

## Architecture

Turborepo monorepo: `apps/` (worker-mobile, supervisor-mobile, admin-web, backend) + `packages/` (shared-schema, state-machines, ui-tokens, ai-tools, api-client). Backend: Fastify + Prisma + BullMQ on Railway (Singapore). Mobile: Expo SDK 54+ with EAS. Web: Next.js 15. DB: Postgres on Railway. Voice STT: Sarvam.ai (India) + Whisper (US). LLM: Claude Sonnet 4.6 + Haiku 4.5. Photos: Cloudflare R2/Images.

## Hard Rules (non-negotiable, section E)

1. **Multi-tenant isolation** — every table has companyId, server injects it, RLS as defense-in-depth
2. **Privacy/DPDP** — voice deleted within 24h, personal columns scrubbed on erasure, work records stay forever anonymized, hard-delete is SUPER_ADMIN only
3. **AI architecture** — AI only at user-input boundary, never inside cascades, never writes DB without human confirmation, never makes personnel suggestions
4. **State machines** — every domain entity has a typed state machine, every transition writes an event, cascade via outbox pattern (depth capped at 3)
5. **Schema/code** — backend owns all DB schema, TypeScript strict, no `any`, no mocks in integration tests, no TODO in committed code
6. **Operations** — manual onboarding first 10 customers, AI cost dashboard visible daily, pilot-end warnings
7. **Pricing** — AI cost never line-itemed, don't sell below Rs 15K/month effective
8. **UX** — worker 3-tap-or-fewer, 48pt tap targets, 700+ weight, one-handed reachability, AI quiet by default

## Iteration Locks (section G)

| # | Topic | Status |
|---|-------|--------|
| 1 | Tenant model and user identity | LOCKED |
| 2 | Marketing website and signup flow | LOCKED |
| 3 | First-time tenant onboarding | LOCKED |
| 4 | Worker mobile app (with NFRs) | LOCKED |
| 5 | Supervisor mobile app | PARTIAL (11 open questions) |
| 6 | Per-user living docs | PARTIAL (7 open questions) |
| 7 | AI conversational onboarding | PARTIAL (4 open questions) |

**Open questions:** ~22 total across iterations 5-7 (section H). Founder answers needed before those iterations proceed.

## Data Model Truths

- One company = one customer. No franchises in v3.0.
- One phone can be in multiple companies (CompanyMembership joins User to Company).
- Roles: OWNER, COMPANY_ADMIN, HR, SUPERVISOR, WORKER, SUPER_ADMIN.
- Worker who quits company A and joins B keeps same User account; old membership becomes ENDED.
- On erasure: scrub personal columns, work records stay forever anonymized. Same database.
- State machines: VisitState, WorkerState, SiteState, LeaveRequestState, DeviceState.

## Current Build Status (verify against STATUS.md)

Worker mobile capture flow through sub-slice 2b-4 DONE. Admin/HR backend wave-2-prep DONE. Super-admin owner bootstrap DONE and deployed to Railway prod. Next: wave-2 cross-persona QA, then leave/swap request machines.

> This section can become stale. Always verify current progress against `axhy-v3/handoff/STATUS.md` and `axhy-v3/handoff/NEXT_SESSION.md`.

## Future Iterations (not started)

6: Admin web portal. 7: HR portal. 8: Super admin portal. 9: Cross-cutting plumbing (notifications, voice pipeline, audit log, outbox, DPDP).

## Deferred to v3.1+

Vector RAG, voice-driven doc updates, smart templates, Telugu doc support, cross-supervisor visibility, WhatsApp Business API, multi-region, TTS for low-literacy, MCP server (at 15 tenants).

## When to Open the Full Master Plan

Open the full source or retrieve exact sections when:
- Implementing a locked iteration (need full decision details from section G)
- Answering founder questions about open questions (section H)
- Changing pricing, onboarding, AI boundaries, data model, or retention rules
- Modifying persona workflows (supervisor, worker, HR, admin)
- Making decisions that depend on omitted sections (schemas, marketing, contingency)
- Digest and impactCheck results disagree (full source resolves conflicts)

## Digest Limitations

This digest is not enough for implementation details. It does not contain complete Prisma schemas, full workflow step-by-step details, full panel reasoning behind decisions, the complete 50-question AI onboarding bank, marketing/sales copy, contingency plans, or engineering practice specifics. For any of these, use `impactCheck` or read the full master plan directly.

## Key Constraints to Remember

- AI is thin (input boundary only) — this is the gross margin moat (80%+ vs competitors' 30-50%)
- Per-customer living context is the defensibility moat (6 months of accumulated rules)
- No AI suggestions for personnel — system shows 2-3 options, human picks
- Worker pay is salary-only — NO per-task pricing (explicitly rejected)
- Notifications are state-machine-triggered, never AI-triggered
- All visits billable including failed/flagged/incomplete
