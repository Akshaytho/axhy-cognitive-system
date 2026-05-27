---
name: Medium-to-major changes require enterprise-grade QA
description: Any system-level refactor or new code (auth, schema, state machines, multi-tenant boundaries, middleware) must pass 7-point enterprise QA before done — not just unit tests + one happy-path integration test
type: feedback
originSessionId: f1-design-brainstorm-2026-05-27
---
Scale of change demands proportional verification. Unit tests + one integration test is not enough for changes that touch auth, schema, state machines, multi-tenant boundaries, or anything under `apps/backend/src/middleware/`.

**Required for "done" on medium-to-major changes:**

1. **Unit tests** — every branch covered.
2. **Real-DB integration tests** — via `railway run -- pnpm --filter @axhy/backend test:integration`. No mocked Prisma.
3. **Prod-grade QA walk** — against Railway production with each affected persona token. Inspect data shape, side-effect tables, latency, and audit trail per the 2026-05-27 four-layer learning.
4. **Adversarial pass** — explicitly attempt the failure modes the change is meant to prevent. Each must 401/403/fail correctly.
5. **Cross-persona panel review** — worker, supervisor, HR, COMPANY_ADMIN, SUPER_ADMIN perspectives.
6. **Findings doc** — `_QA_FINDINGS_<date>.md` in `axhy-v3/handoff/` (nil report acceptable if no findings).
7. **`check_before_done`** — runs all of the above as a structural gate.

**What counts as "medium-to-major":**
- Auth middleware changes (`requireAuth`, `requireRole`, token issuance/validation)
- Prisma schema migrations on active tables
- State machine transitions or guards
- Multi-tenant boundary changes (`withTenantContext`, companyId filtering)
- New route registration in server.ts
- Any change to `apps/backend/src/middleware/`

**Why:** Founder direction 2026-05-27: "if there are big changes like this... need proper QA prod enterprise level testing." The F1 trust-model arc and F31 anonymize scrub are the first changes held to this bar.

**How to apply:**
- Before starting a system-level change, confirm whether it crosses the medium-to-major threshold
- If yes, plan the 7-point QA into the session budget (typically adds 30-60 min)
- `check_before_done` will enforce this — don't try to skip steps
- For small/localized changes (typo fixes, UI tweaks, doc updates), normal unit + integration tests suffice
