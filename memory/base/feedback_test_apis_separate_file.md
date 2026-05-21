---
name: Test-only APIs live in their own file, never mixed with production routes
description: Any simulator/test harness endpoints (advance-clock, seed, reset, force-transition-bypass) must be in a dedicated `_test` route file, gated behind env var, never imported from production code paths.
type: feedback
originSessionId: ae10a9e4-4289-4889-8a2d-5c091a896996
---
**Test-helper endpoints must live in a separate file from production routes.** When the scenario simulator (or any test harness) needs backend endpoints like `POST /api/_test/advance-time`, `POST /api/_test/seed-scenario`, or `POST /api/_test/reset-db`, route them through a dedicated file like `backend/src/routes/_test.routes.ts`. Don't sprinkle them into production domain files.

**Why:** User said 2026-04-20 while approving the scenario simulator plan: "see if apis needed for testing add in separate file for them ok." Ties back to the existing "no patches / production-only" rule — mixing test endpoints into production route files is the same category of sprawl that created the `dev_fake_token` mess on the mobile side. Keep the production code pure; isolate the test surface.

**How to apply:**
- **One file, one namespace:** `backend/src/routes/_test.routes.ts` (or equivalent) registered under `/api/_test/*` prefix. Every test endpoint lives here and only here.
- **Env-gated registration:** the route file is only imported/registered when `ENABLE_TEST_ENDPOINTS=true` (or `NODE_ENV !== 'production'`, whichever fits the existing pattern). Production builds must not expose `/api/_test/*` at all.
- **Sim harness on the admin/Playwright side:** any test helpers needed in admin (e.g. a "seed-scenario" button) also go in a dedicated `src/app/api/_test/` folder, same env gate.
- **Simulator code path isolation:** the simulator/harness calls `/api/_test/*` endpoints. Production code NEVER imports from the test file. No shared helpers that production and tests both import from the `_test` file — the dependency arrow points one way: test → production, never back.
- **Never patch production routes to add test knobs:** if a production route needs to behave differently under test, the test endpoint should set up the required DB state beforehand, then call the real production route. Do not add `if (isTest)` branches inside production handlers.
- **Remove on cleanup:** when a test scenario becomes obsolete, delete its endpoints from the `_test` file — don't leave stubs around.
