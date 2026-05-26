---
type: session_retro
date: 2026-05-26
time: "13:20"
persona: engineering_partner
embed: true
topic: Book Architecture Phase 0 — Retrieval Quality Baseline
---

## What Phase 0 Was

Phase 0 of the Book Architecture migration establishes a retrieval quality baseline: proof that the brain (pgvector) can return the right content for real intents BEFORE any boot context (the 48 memory files + master plan currently preloaded at ~25,000 tokens) is removed. If retrieval works, Phase 1 can safely start replacing preloaded context with on-demand brain queries.

## What Happened (The Scary Part)

While writing retrieval quality tests, we discovered that **every embedding in the brain was fake**. The `embed()` function in `brain-builder.ts` (line 118) silently falls back to a PRNG-based deterministic hash when `OPENAI_API_KEY` is missing. The vectors look real (1536 dimensions, normalized to unit length) but are random noise — cosine similarity between any two texts is approximately 0.08.

**Root cause:** The brain:build command was running with `railway run --service Postgres` which injects `DATABASE_PUBLIC_URL` (needed for DB access from local) but does NOT inject `OPENAI_API_KEY` (that lives in the backend service, not Postgres service). Without the API key, `embed()` fell back silently. No error, no warning, no log. All 2,767 brain entries were garbage.

**How long this went undetected:** Since the brain was first built. Tests that appeared to pass were passing by keyword coincidence in the top-10 random results, not semantic retrieval.

## The Fix

Three-part fix:

1. **Correct command documented** in `memory/v3/reference_axhy_brain_commands.md`:
   ```bash
   export $(grep OPENAI_API_KEY apps/backend/.env.local) && \
     FIELD_FANOUT_ENABLED=true railway run --service Postgres -- \
     pnpm --filter @axhy/ai-tools brain:build
   ```
   This sources OPENAI_API_KEY from the backend `.env.local` AND gets DATABASE_PUBLIC_URL from Railway Postgres.

2. **Hard guard added** to `brain-builder.ts main()`: if OPENAI_API_KEY is missing and BRAIN_ALLOW_FAKE_EMBEDDINGS is not explicitly set, the process exits with a loud error explaining exactly what to do. The PRNG fallback in `embed()` stays for unit tests.

3. **Warnings added** to `impact-check-v2.ts` and `vector-knowledge.ts`: when these search-time modules fall back to PRNG for query embedding, they now log a visible warning instead of staying silent.

## What We Built

- **15 retrieval quality tests** (`tests/retrieval-quality.test.mjs`): cover 5 intent categories (enterprise/security, architecture/state-machine, cognitive/guardrail, product/onboarding, feedback/learning). Each test searches the brain with a natural-language intent and asserts that relevant keywords appear in the results.
- **3 brain health checks**: connection available, non-empty results, correct result shape.
- **Brain health preflight** (`scripts/brain-health-preflight.mjs`): standalone script that checks DB connectivity, brain population, embedding quality (score magnitude check to detect PRNG fakes), and semantic retrieval. Intended to run before any Book Architecture phase.
- **Brain-builder extension**: `brain-builder.ts` now scans the sibling `axhy-cognitive-system` workspace (`docs/` and `memory/base/`) in addition to `axhy-v3/docs/`. This closed the content gap — enterprise production standard (E1-E14), guardrail engine docs, and founder feedback rules are now embedded.

## Phase 0 Results

| Metric | Result |
|--------|--------|
| Intent tests | 15/15 PASS |
| Health checks | 3/3 PASS |
| ai-tools unit tests | 92/92 PASS |
| Cognitive system tests | 457 pass, 12 fail (pre-existing), 18 skip |
| Brain entries | 2,767 with real OpenAI embeddings |
| Embedding model | text-embedding-3-small (1536 dims) |
| Field fanout | Enabled — large docs split by H1-H3 headings into section-level embeddings |

## Temptations

Tempted to skip the retrieval quality tests and trust that brain:build "just works" since it had been running without errors for days. The silent PRNG fallback made this especially dangerous — there were no errors, no warnings, nothing to indicate the brain was full of noise. Resisted because the Phase 0 spec explicitly required baseline tests before any preload removal.

Tempted to just fix the command and move on without adding the hard guard. "Now that we know the correct command, we'll always use it." This is exactly the kind of human-memory-dependent workaround that the axhy system exists to prevent. The guard makes the failure mode impossible, not just unlikely.

## Lessons

1. **Silent fallbacks are the most dangerous kind of bug.** The PRNG fallback was designed for convenience (tests work without API key) but its silence in production meant the entire brain was broken for weeks with no visible symptom.

2. **Environment variable requirements must be validated at startup, not at use-time.** The embed() function checked for the API key on every call but never failed — it just degraded silently. The fix: check once at the top of main() and hard-exit.

3. **Railway service selection matters.** `--service Postgres` gives you the DB URL but not the app secrets. `--service default` gives you app secrets but an internal-only DB URL. You must combine both sources.

4. **Retrieval quality tests are the only proof that embeddings are real.** You cannot tell from the data itself — fake vectors have the same shape, same dimensions, same normalization. Only the retrieval behavior (semantic vs random) reveals the truth.

## Phase 0 Exit Criteria

All met:

- [x] 15/15 retrieval quality tests pass with real embeddings
- [x] Brain health preflight script created and runnable
- [x] Fake embedding guard in brain-builder.ts (hard exit)
- [x] Fake embedding warnings in impact-check-v2.ts and vector-knowledge.ts
- [x] Correct brain:build command documented with all three requirements (OPENAI_API_KEY, DATABASE_PUBLIC_URL via --service Postgres, FIELD_FANOUT_ENABLED)
- [x] No guardrails weakened, no hooks changed, no locked docs modified
- [x] Phase 0 retro written (this document)

## What's Next

Phase 1: CLAUDE.md slimming. Requires founder approval before starting. The hot/cold diff table (what stays in boot vs what moves to brain retrieval) must be presented and approved before any edits to CLAUDE.md.
