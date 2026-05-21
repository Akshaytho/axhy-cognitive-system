---
name: Integration tests vs water-flow tests — use both
description: Integration tests catch regressions before merge; water-flow tests catch reality after deploy. Not a competition — different jobs, both needed.
type: feedback
originSessionId: 23ff8633-8261-4b35-8d00-54991ea03ee2
---
Integration tests and water-flow tests serve different purposes. Never pick one over the other — use both for different moments.

**Integration tests** (vitest, in-memory, mocks Redis/R2/OpenAI):
- Fast (seconds). Run on every commit. Catch **regressions** — "did my new code break yesterday's feature?"
- Blind spot: they mock external systems. When mocks lie (R2 signing rules, OpenAI response shape, env vars), tests pass but prod fails.
- Lives in `/backend/src/**/*.test.ts` and `/admin/tests/**/*.test.ts`.

**Water-flow tests** (real HTTP against production Railway, real R2, real OpenAI, real DB, real BullMQ):
- Slow. Cost real money. But only way to prove the whole stack works end-to-end.
- Caught on 2026-04-23 pre-launch: B10 (state-machine migration leftover), B12 (R2 SignatureDoesNotMatch), Railway env mismatch. None of these were visible to integration tests — fixtures were updated to match new code, mocks never saw the real R2 bug, env issues don't show in tests at all.
- Pattern: scripts in `/backend/scripts/seed-*.ts` hit real HTTP endpoints and the real BullMQ pipeline. Use `axhy-sandbox` tenant for isolation per `feedback_prod_only_testing.md`.

**When to use which:**
| Situation | Use |
|---|---|
| Before merging code | Integration tests — fast, prevents regressions |
| Before launching / after deploy | Water flow — proves reality |
| After a state-machine migration | **Water flow mandatory** — mocks/fixtures lie exactly here |
| Investigating a customer bug | Water flow — reproduce on real stack |
| Daily CI | Integration (water flow too expensive per-commit) |

**Why this matters:** Integration tests catching a state-machine migration bug requires the test fixtures to stay in the OLD shape after migration — which developers always update — so the integration suite goes green while prod stays broken. Water flow uses production data so the bug shows up on first run.

Default assumption going forward: every non-trivial backend change should get an integration test (regression safety net) AND a water-flow smoke (reality check) before it's considered done.
