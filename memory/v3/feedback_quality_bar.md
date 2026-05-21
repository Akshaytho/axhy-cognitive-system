---
name: Quality bar (consolidated)
description: 40-year team quality, permanent code, production-ready every commit, Play Store performance. No patches, no shortcuts. Merged from 4 files locked 2026-05-10 through 2026-05-18.
type: feedback
---

# Quality Bar (4 locks consolidated)

## Core principle
Every line of v3 code is written as if a 40-year-veteran team authored it for a global FM operating system. No MVP framing — this is the permanent product. No patch code, no "good enough for now."

## Production-ready every commit (10 criteria)
1. **Error handling** — every await has rejection behavior; typed errors, never raw Error; no empty catch blocks; transactions commit or rollback fully
2. **Edge cases** — null/undefined/empty/zero/negative/max-int reasoned about; concurrency (race-free SQL, idempotency); timezone (UTC vs IST documented)
3. **Multi-tenant safety** — every query scoped by companyId; cross-tenant test for every new route
4. **Observability** — structured logs (key=value) with companyId + requestId; no console.log in production paths
5. **Types** — strict mode, no `any`, no `as unknown as X`; Zod for external input
6. **Tests** — real Railway DB (not mocked Prisma); boundary condition coverage; concurrency tests
7. **Rollback** — additive migrations; reverse SQL in commit; feature flags when risky
8. **No hardcoded values** — URLs/ports → env vars; phone/emails → @axhy/copy; thresholds → @axhy/business-rules; brand → @axhy/ui-tokens
9. **No partial stubs** — every function returns correct type for every path; stubs are explicit with name + comment
10. **Lint + typecheck + tests green** before commit

## Permanent code rules
- No hardcoded literals — magic numbers/strings → named constants
- No copy-paste between layers — a second instance = a function
- Service boundaries explicit — typed interfaces, one-file swap for external deps
- Scale-aware — queries bounded, lists paginate, aggregators stream
- Names tell the truth — getX doesn't write, DEFAULT_FOO is the actual default
- Code reads as junior-dev-written with 40-year judgment — no clever one-liners

## Play Store performance
- Long lists: FlatList (not ScrollView+map) above 20 items
- Rows: React.memo with stable useCallback handlers
- TanStack Query: staleTime 30s for Today/Decisions/Activity, 5min for /me
- Loading: skeletons not blank screens
- Animations: Reanimated on UI thread, not Animated on JS thread
- No console.log in render hot paths in production
- Target: tap-to-content <100ms, scrolling 50 rows = smooth, no blank screens during auth→content

## Before-commit self-check
1. Would 100-tenant production load survive this code RIGHT NOW?
2. Would malformed input produce user-clear + audit-traceable error?
3. Would two concurrent requests produce deterministic result?
4. If the column/table/route is missing (rollback), what happens?
5. If paged at 2am, is the log line enough to diagnose?
