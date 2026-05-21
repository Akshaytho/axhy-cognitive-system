---
name: Simulator non-negotiables — safety, reproducibility, hygiene
description: 12 rules every simulator run must follow. Covers DB safety, tenant isolation, test-data prefixing, reproducibility metadata, flakiness, performance budget, secrets, commits, and scope discipline.
type: feedback
originSessionId: ae10a9e4-4289-4889-8a2d-5c091a896996
---
**The simulator follows these 12 rules at all times. No exceptions without explicit user approval.** Adopted 2026-04-20 after user said "adapt all the needed and best ones" in response to a candidate list.

**1. Never run against production DB.** Simulator aborts at startup if `DATABASE_URL` does not contain `staging` or `sim`. No override flag, no CLI escape. A destroyed production DB is irrecoverable; this check is non-negotiable.

**2. Fresh test tenant per run.** Each run creates a new Company row with a unique name like `Sim-Scenario-<N>-<ISO-timestamp>`. All scenario data belongs to that tenant. Runs never reuse tenants — no cross-run pollution. Post-run behaviour: keep the tenant for forensic diffing by default; optional `--cleanup` flag nukes it.

**3. All test data prefixed with `sim-`.** Worker phone: `+91-sim-XXXXX`, worker name: `sim-Worker-N`, site name: `sim-Site-A`, assignment note: includes `sim:` tag. Filterable in admin portal; no confusion with real data.

**4. Reproducibility metadata per run.** Each run writes `simulator/artifacts/<run-ts>/run.json` with: git SHA of admin + backend + shared + simulator repos, Railway deploy IDs, `@axhy/shared` version, Node version, system timezone, test-tenant ID, env hash. When a previously-green scenario goes red, diff `run.json` to see what changed.

**5. No flaky reruns.** A scenario is "green" only when it passes 3 consecutive clean runs. Any `retry-until-pass` pattern is a bug — fix the race, don't retry around it. CI enforces 3-run policy before marking a scenario approved.

**6. Performance budget: 10 minutes per scenario.** If a scenario takes > 10 min end-to-end, halt and investigate. Usually indicates a real bug (retry loop, timeout loop, missing await, N+1 query). Slow runs hide real failures.

**7. Secrets in `.env.simulator.local` — gitignored.** SUPER_ADMIN login, OTP test code, test-tenant seed password, Railway staging DATABASE_URL. Never hardcoded in spec files. CI reads from secrets store. Commit hook rejects any spec file that contains literal credentials.

**8. `test.skip()` and `test.only()` never in committed code.** Pre-commit hook + CI check blocks them. Most common way tests silently go dark.

**9. One commit per scenario per repo.** Each scenario delivery produces one commit in each repo it touched (admin / backend / shared / simulator). Commit message format: `feat(sim): scenario N — <one-line summary>`. Artifacts gitignored.

**10. Real network calls by default.** AI verifier, FCM push, MSG91 SMS, map tiles — all real against staging. Mocks only when the real call is genuinely non-deterministic (e.g. AI score ±5 on identical inputs). Every mock has a comment: `// MOCKED: <reason>`. Reviewer can easily find and justify each mock.

**11. Simulator never calls Prisma to write.** Only `findUnique` / `findMany` / `count` for read-only assertion. Any write must go through a production API over HTTP. If a scenario is tempted to `prisma.user.create()`, rewrite it to drive the admin UI instead — that's the whole point.

**12. Each spec file declares "what this scenario does NOT test."** A brief section at the top: `## Out of scope: <bullet list>`. Prevents scope creep inside one spec and documents when new scenarios (not extensions) are needed.

**How to apply:**
- Before any simulator code is written, an Explore agent verifies these 12 rules are enforceable in the planned file layout, test-clock endpoint, and CI config.
- Violations during build = halt and fix, don't merge.
- If a rule becomes impractical (e.g. real AI calls cost too much in CI), propose a change explicitly — don't silently work around it.
