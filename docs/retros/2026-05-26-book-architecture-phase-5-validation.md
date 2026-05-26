---
type: session_retro
date: 2026-05-26
time: "05:25"
persona: engineering_partner
embed: true
topic: Book Architecture Phase 5 — Real-Session Validation Log
---

## Phase 5 Purpose

Validate the compressed boot (~3,600t Identity Seed vs ~25,000t preloaded) by running 5 real sessions across 3+ task types. Each session must demonstrate that the brain retrieval system surfaces the right rules at the right time, guardrails fire correctly, and no critical regressions occur.

## Session A: Backend / Security Route Audit

**Task:** Audit API routes for multi-tenant isolation, enterprise compliance (E1-E14), and security gaps.

### Original Issue

Live MCP `impact_search` was returning useless results. Queries like "audit API route for multi-tenant isolation" returned scores of 0.05-0.09 (random noise). The brain content itself was correct (brain:build had run with real OPENAI_API_KEY), but the MCP guardrail server process did not have OPENAI_API_KEY in its environment.

**Root cause:** `.mcp.json` env block had `DATABASE_PUBLIC_URL` and `AXHY_REPO_ROOT` but not `OPENAI_API_KEY`. When the MCP server called `embed()` at query time, it fell back to the PRNG fake embedding code path — producing deterministic but semantically meaningless vectors. Stored embeddings were real (OpenAI), but query embeddings were fake (PRNG), so cosine similarity was random noise.

### Fix (3 parts)

1. **OPENAI_API_KEY added to both `.mcp.json` files** (workspace root + axhy-v3). These files are untracked — no secret committed. Key sourced from `apps/backend/.env.local`.

2. **Fake embedding fallback made explicit-only.** Both `impact-check-v2.ts` and `vector-knowledge.ts` now throw an error when OPENAI_API_KEY is missing, unless `BRAIN_ALLOW_FAKE_EMBEDDINGS=true` is explicitly set. Silent degradation is eliminated.

3. **Embedding mode visibility added.** `impact-adapter.mjs` now includes `_embedding_mode: "real"|"fake"` in all `impactSearch` and `impactCheck` MCP responses. Any session can verify retrieval quality at a glance.

### Proof (post-restart verification)

| Query | Score (fake) | Score (real) | Top results |
|-------|-------------|-------------|-------------|
| audit API route multi-tenant isolation | 0.05-0.09 | 0.49-0.71 | E1/E2, tenant isolation, companyId, security boundary |
| multi-tenant companyId RLS | 0.05-0.09 | 0.52-0.68 | RLS rules, tenant validation, security constraints |
| enterprise E1 E5 E14 production | 0.05-0.09 | 0.55-0.72 | Enterprise standard sections, non-negotiable categories |
| security-gaps-to-fix rate-limit | 0.05-0.09 | 0.48-0.65 | Security gaps doc, rate-limit locked rules |

All 4 queries returned `_embedding_mode: "real"` and semantically relevant results.

### Retrieval test results

- Phase 0 baseline: 15/15 pass (brain health + intent retrieval)
- Phase 5 Session A gap tests: 4/4 pass (added for the specific queries that failed)
- Full cognitive system suite: 469 pass, 18 skip, 0 fail

### Verdict

**Session A: CLEAN PASS** (upgraded from initial "PASS WITH RETRIEVAL GAP" after fix)

### Commits

- `f56936d` (axhy-cognitive-system): 4 new retrieval-quality tests for Session A gap queries
- `c4d54f4` (axhy-v3): fail loudly on missing OPENAI_API_KEY instead of silent PRNG fallback
- `7256b14` (axhy-cognitive-system): surface `_embedding_mode` in MCP responses

### Lesson

**The MCP server is a separate process with its own environment.** It does not inherit shell environment variables, IDE env, or Railway env. The ONLY source of env vars for the MCP server is the `env` block in `.mcp.json`. Any env var needed at runtime (not just build time) must be explicitly listed there.

---

## Session B: Mobile / Worker Task

**Task:** Audit worker capture screen for tap-target compliance, 3-tap flow adherence, wake-lock safety, and visual verification requirements.

### Pre-Session Checklist

**Expected impactCheck queries:**
1. `worker capture screen tap-target wake-lock safety` — should surface: keep-awake feedback, UX constraints (48pt tap targets), worker cognitive load rules
2. `worker 3-tap photo capture cleaning visit flow` — should surface: Day 2 capture flow (8 screens), photo capture pipeline, visit submit flow
3. `enterprise production standard visual verification` — should surface: E1-E14 locked doc, check_before_done visual gate, screenshot requirement

**Expected worker/mobile rules the brain must surface:**
- Tap targets minimum 48pt (`tokens.tap.minMobile = 48`)
- One-handed reachability: primary CTAs in lower-right 60%
- Worker cognitive load: fewer screens, bigger buttons, one action per screen
- Wake-lock mandatory on: CleaningTimerScreen, CameraScreen (BEFORE + AFTER), QRScanScreen, FinalReviewScreen
- Wake-lock NOT on: WorkerHomeScreen, HistoryScreen, ProfileScreen
- Capture flow: 8 screens, every transition through `visitMachine`
- R2 upload: known CRIT-1 (userId vs workerId key mismatch), CRIT-7 (pump race)
- Visual verification: check_before_done requires screenshots for UI work

**Expected guardrails that must fire:**
- `check_before_edit` before any file modification
- `check_before_build` if proposing new features
- `impact_search` returns `_embedding_mode: "real"` on every query

**Pass criteria:**
- All 3 queries return semantically relevant results (scores > 0.40)
- Brain surfaces wake-lock, tap-target, and capture-flow rules without preloaded memory files
- No guardrail bypass needed — all gates fire and pass normally
- If code audit is performed, check_before_edit approves correctly

**Failure signs (critical regression):**
- `_embedding_mode: "fake"` on any query
- Brain fails to surface wake-lock safety rule for capture screen audit
- Brain fails to surface 48pt tap-target constraint
- Guardrail tool errors or crashes
- Need to manually read memory files to find rules that should come from brain

**Failure signs (minor regression):**
- Brain returns relevant results but misses one specific sub-rule (e.g., surfaces wake-lock but not the specific screens list)
- Scores lower than expected but still above 0.30 threshold

### Execution Results

**Query 1 — worker capture screen tap-target wake-lock safety:**
| Result | Score | What it surfaced |
|--------|-------|-----------------|
| Keep device awake feedback | 0.59 | Mandatory screens: CleaningTimer, Camera (BEFORE+AFTER), QRScan, FinalReview. Implementation: `useKeepAwake()` from expo-keep-awake |
| Guardrail caught real issue (retro) | 0.47 | check_before_done + visual verification discipline |
| Known wake-lock defect | 0.46 | PhasePhotoCapture.tsx:51 unconditional useKeepAwake() — Expo Web rejects |
| Worker cognitive load | 0.45 | Fewer screens, bigger buttons, one action per screen |
| UX constraints | 0.44 | 48pt tap targets, one-handed reachability, lower-right 60% |

**Query 2 — worker 3-tap photo capture cleaning visit flow:**
| Result | Score | What it surfaced |
|--------|-------|-----------------|
| Photo capture pipeline (Flow 2) | 0.51 | CameraView → local file → PhasePhotoCapture → R2 upload. Known: CRIT-1 (userId/workerId key mismatch), CRIT-7 (pump race) |
| Day 2 capture flow (8 screens) | 0.51 | Full capture happy path: QR → Before Camera → Timer → After Camera → Review → Submit. visitMachine transitions |
| QA script 2b-3 | 0.49 | Timer+submit QA script details |
| Sub-slice 2b-2 photo pipeline | 0.48 | Real camera, per-user partition, R2 presigned URLs, captureMachine |
| Worker persona spec | 0.44 | Worker operational ownership: showing up, clocking in/out, capturing photos |

**Query 3 — enterprise production standard visual verification:**
| Result | Score | What it surfaced |
|--------|-------|-----------------|
| Enterprise enforcement (locked) | 0.53 | check_before_build forces declaration of how each E1-E14 item is satisfied |
| Enterprise standard (locked) | 0.51 | The locked doc itself — minimum quality baseline |
| check_before_done what stays | 0.50 | Screenshot requirement for UI, intent quality check, test verification |
| Verification checklists (locked) | 0.50 | "Not optional. Skipping a checklist item is a bug." |
| CHEAT 10 verification (locked) | 0.46 | "For UI changes: open the app" — type correctness is not feature correctness |

All queries: `_embedding_mode: "real"`. All scores above 0.40 threshold.

### Code Audit Findings (guided by brain results)

Audited 6 capture screen files against brain-surfaced rules:

**1. Wake-lock safety:**
- `PhasePhotoCapture.tsx` (lines 50-58): KeepDeviceAwake component with web guard (`Platform.OS !== 'web'`). Uses `useKeepAwake()` hook. Mounts on native only. COMPLIANT.
- `timer.tsx` (lines 34-49): Separate KeepAwake component using async `activateKeepAwakeAsync` with web guard at line 108. COMPLIANT.
- `review.tsx`: No wake-lock. Brain says FinalReviewScreen should have it. KNOWN GAP (not a regression — pre-existing per the brain entry itself which lists it as "mandatory").
- `qr-scan.tsx`: Placeholder only — no camera or wake-lock yet. Brain says wake-lock optional here. NOT APPLICABLE until real implementation.
- `submit.tsx`: No wake-lock. Brain does not list submit as needing wake-lock. CORRECT.

**2. Tap-target compliance (48pt minimum):**
- `PhasePhotoCapture.tsx` line 207: `backBtn.minHeight: tokens.tap.minMobile` (= 48). COMPLIANT.
- `review.tsx` line 85: `backBtn.minHeight: tokens.tap.minMobile` (= 48). COMPLIANT.
- `timer.tsx` backBtn (line 160): No explicit `minHeight: tokens.tap.minMobile`. VIOLATION — back button uses `gap: tokens.space[1]` but no minHeight guarantee.
- `submit.tsx` backBtn (line 243): No explicit `minHeight: tokens.tap.minMobile`. VIOLATION — same pattern as timer.
- Primary CTAs (nextBtn/primaryBtn): Use `paddingVertical: tokens.space[4]` (= 16px) with text, rendering ~48px total. BORDERLINE — relies on text height + padding rather than explicit minHeight.

**3. Capture flow structure:**
- 6-step flow: qr-scan → before-photos → timer → after-photos → review → submit. Matches brain's 8-screen spec (QR, Before Camera, Before Gallery, Timer, After Camera, After Gallery, Review, Submit) — before/after each combine camera+gallery into one screen. ACCEPTABLE simplification.
- Each step uses `router.replace()` for forward navigation — prevents back-stack accumulation. GOOD.
- `CAPTURE_STEPS` array drives step ordering centrally. GOOD.

**4. Known critical bugs (from brain):**
- CRIT-1 (userId vs workerId key mismatch in R2 upload): Pre-existing, not in scope for this audit but brain correctly surfaced it.
- CRIT-7 (pump race in upload queue): Pre-existing, brain correctly surfaced it.

### Checklist Evaluation

| Criterion | Result |
|-----------|--------|
| All 3 queries return scores > 0.40 | PASS (0.44–0.59) |
| Brain surfaces wake-lock rule | PASS (top result, score 0.59) |
| Brain surfaces 48pt tap-target rule | PASS (score 0.44) |
| Brain surfaces capture-flow structure | PASS (score 0.51) |
| Brain surfaces known bugs (CRIT-1, CRIT-7) | PASS |
| `_embedding_mode: "real"` on all queries | PASS |
| No guardrail bypass needed | PASS |
| No manual memory file reading needed | PASS |

**Critical regressions:** None.
**Minor regressions:** None. All expected rules surfaced.

### Verdict

**Session B: CLEAN PASS**

---

## Session C: Documentation / Planning

**Status:** Pending

---

## Session D: Bugfix / Refactor

**Status:** Pending

---

## Session E: Full Slice Build / Review

**Status:** Pending

---

## Phase 5 Exit Criteria

- [ ] 5 sessions completed across 3+ task types
- [ ] Zero critical regressions (guardrail bypass, missed hard block, wrong rule surfaced)
- [ ] Minor regressions documented with mitigation
- [ ] Retrieval quality tests remain green (19 Phase 0 + 4 Session A gap)
- [ ] No guardrails weakened, no hooks changed, no locked docs modified
- [ ] Validation retro written (this document)
