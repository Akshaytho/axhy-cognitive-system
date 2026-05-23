# Enterprise Production Standard

> Locked doc. Founder-authored. Never modified during coding sessions.
> Changes require a separate constitutional session with explicit founder approval.

This standard defines the minimum quality bar that every Axhy feature must satisfy
for the part it touches. "MVP" scopes *what* ships, never *how well* it works.
A feature can be small and still be production-grade.

## Principle

Every output must satisfy the quality standard of its declared audience.
Axhy's audience is Indian cleaning companies running real operations.
Their workers carry Android phones on job sites with spotty connectivity.
Their supervisors manage 10-50 workers daily. Their admins run payroll monthly.
A crash, a data loss, or a security hole is not a "known issue" -- it is a
business-ending event for a small cleaning company that trusted this product.

---

## 14-Point Enterprise Baseline

Every slice must satisfy every applicable item below. Items that do not apply
to a slice (e.g., "mobile failure modes" for a backend-only slice) are marked
N/A with a one-line reason. Items are NEVER deferred without explicit founder
approval recorded in the plan doc.

### E1. Security Boundary

Every route validates: authentication (valid token) + authorization (correct
role) + resource ownership (the resource belongs to the requesting user's
tenant). No route is "auth-only" without role gating. No route accepts
`userId`, `workerId`, or `companyId` from the request body -- these come
from the authenticated token.

### E2. Tenant and Resource Ownership

Every database query filters by `companyId` (multi-tenant isolation).
Every resource-specific query verifies the requesting user owns or is
authorized to access that specific resource (e.g., worker can only access
their own visits, supervisor can only access their assigned workers).

### E3. Rate Limiting

Public endpoints (OTP request, health check) have per-IP rate limits.
Authenticated endpoints have per-user rate limits. Rate limits are
configured, not hardcoded. Absence of rate limiting on a new route is
a blocking deficiency, not a deferrable item.

### E4. Source of Truth

State machines own entity lifecycle (visit states, worker activation,
assignment flow). `schema.prisma` owns data shape. Locked docs own
product rules. Code that contradicts any of these is a bug, not a
"different approach." Direct DB status updates outside a machine
transition function are forbidden. Every workflow must have: a named
source of truth, a named lifecycle/state owner, an audit trail
(structured log per state change), and a recovery path (what happens
when the workflow fails mid-way).

### E5. State Machine Discipline

No `prisma.*.update({ data: { status: '...' } })` outside a machine
transition handler. No hardcoded state values in business logic
(read-side `where` clauses and test assertions are exempt).
Every state transition is tested with a real-DB integration test.
Every entity with a lifecycle must have an explicitly named state machine
owner. If no machine owns a status field, that field must not exist.

### E6. Data Loss Prevention

App kill mid-operation must not lose user data. Network failure mid-upload
must not lose local files. Permission denial (camera, location) must not
crash or lose progress. Local data persists until confirmed by the server.
If a plan claims "persists to disk," the code must actually persist to disk,
not hold data in memory only.

### E7. Mobile and Web Failure Modes

`Platform.OS` branching required for any API that behaves differently on
iOS/Android/web. `useKeepAwake()` must not be called on web (crashes).
Camera, location, and file-system APIs must have web-stub fallbacks.
Every async UI action must have loading state to prevent double-tap.
Network timeouts must be configured, not infinite. Storage failure
(disk full, write permission denied) must be handled gracefully -- not
crash the app or silently lose data.

### E8. App Store Reliability

Zero crashes in normal operation. A crash on a code path that a worker
hits daily means app store rejection and/or 1-star reviews. "Works on
my machine" is not a defense. Silent failures (catch + ignore) are also
forbidden -- errors must surface to the user or to monitoring.

### E9. Scale Readiness

Queries must be indexed for the columns used in WHERE/ORDER BY. No N+1
query patterns (fetch-in-loop). Pagination required for any list that
can grow unbounded. Connection pooling configured. These are baseline,
not optimization -- a query that scans 100K rows at 100 users will
scan 10M rows at 10K users. Default scale assumption: 10,000+ users
unless the slice plan explicitly states a smaller scope with founder
approval.

### E10. Documentation Truth

If a plan document says "queue persists to disk," the code must persist
to disk. If a plan says "exponential backoff 1s, 2s, 4s, 8s, max 60s,"
the code must implement exactly those values. Divergence between plan
and code is a deficiency. If the plan is wrong, update the plan first.
No fake metadata: hardcoded file sizes, dimensions, or timestamps when
real values are available is a documentation truth violation.

### E11. Required Tests

Every route: auth test (401 without token), role test (403 wrong role),
ownership test (403 accessing another tenant's data), happy path,
error/edge case. Every state machine: transition tests (positive and
negative). Every mobile feature: web-stub verification. Integration
tests run against real DB, not mocks.

### E12. Error Specificity

Error responses use specific error codes, not generic "something went
wrong." Each error code maps to exactly one failure mode. The client
can programmatically distinguish between "token expired," "wrong role,"
"resource not found," and "validation failed." Error messages never
expose internal details (stack traces, DB errors, file paths).

### E13. Secrets and Credentials

No credentials in committed code, ever. No credentials in client-side
bundles. API keys, DB URLs, and tokens live in environment variables.
`.env` files are `.gitignore`d. `.mcp.json` files with credentials are
never committed. Presigned URLs have bounded expiry (5-15 minutes).

### E14. Non-Deferrable Items

The following categories are NEVER deferrable to a later slice:
- Security (auth, role, ownership, tenant isolation)
- Crash prevention (no unhandled exceptions in user-facing paths)
- Data loss prevention (local persistence for in-progress work)
- Secrets (no credentials in code or client bundles)
- Documentation truth (plan matches code)

If a session believes an item should be deferred, it must record the
specific item, the reason, and get explicit founder approval in the
plan doc before proceeding. "MVP" is not blanket approval to defer
enterprise baseline items. Done claims must explicitly list known
gaps -- what is NOT covered, not just what is covered.

---

## How This Standard Is Enforced

1. **check_before_build** (MCP guardrail tool): Called before coding begins
   on any slice. Forces the AI to declare how each applicable baseline item
   will be satisfied. Blocks coding until the preflight passes.

2. **check_before_done** (MCP guardrail tool): Requires reference to the
   enterprise preflight. Verifies that declared items were actually addressed.

3. **Quality gate** (pattern checks): Catches specific violations
   (direct DB status updates, missing auth, hardcoded values) at done time.

4. **Memory firewall**: Enterprise standards cannot be weakened by candidate
   learnings. "MVP shortcut" language cannot override security, ownership,
   crash prevention, data loss prevention, secrets, or documentation truth.
