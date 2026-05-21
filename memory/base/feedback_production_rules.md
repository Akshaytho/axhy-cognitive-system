---
name: Production rules (consolidated)
description: P1-P10 workflow rules + production hardening (17 gaps) + Redis required. Universal across v3.
type: feedback
---

# Production Rules (3 files consolidated)

## P1-P10 workflow rules (locked 2026-05-15)
1. Documented limitation ≠ acceptable limitation
2. Invariants enforced at DB level, not described in docs
3. No check-then-act races — use DB transactions
4. No final state before domain effect completes
5. Every state transition has audit trail
6. Every external call has timeout + retry + fallback
7. Every concurrent access point uses idempotency or locks
8. Every multi-step operation is atomic or has compensating actions
9. Every user-facing error is actionable (not "something went wrong")
10. Every background job is observable (started/completed/failed/duration)

**L4 addition (2026-05-16):** policy-first / no unnecessary complexity — if complexity exists only for a rare edge case, simplify the rule before engineering around it.

## Production hardening (BLOCKER from Wave A review)
17 gaps found: no Redis, no circuit breakers, no graceful degradation, God files. Fix before new features. Key missing: rate limiting, connection pooling, health checks, structured logging, error boundaries.

## Redis required in v3
v2 had ioredis + bullmq + cache; v3 has zero Redis. Must add back for: session cache, rate limiting, queue processing, hot-path caching. Daily slowness traced to missing cache layer.
