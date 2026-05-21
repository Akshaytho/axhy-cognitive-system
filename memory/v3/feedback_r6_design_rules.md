---
name: R6 design rules (consolidated)
description: R6 is the canonical supervisor design. 100% fidelity required — no new colors, no approximations, side-by-side comparison mandatory before any claim. Merged from 4 files locked 2026-05-17 PM.
type: feedback
---

# R6 Design Rules (4 locks consolidated)

## 1. R6 is the design canon
R6 (`axhy-v3/docs/prototypes/supervisor-mobile-r6/`) is the single source of supervisor mobile design truth. R1 = older implementation, presumed stale. When R1 conflicts with R6, replace R1. Four personas coexist (worker/supervisor/HR/admin) — don't break others while building supervisor.

## 2. Pixel-faithful fidelity
Match every R6 color, spacing, type weight, radius EXACTLY. Never invent colors or pick "close enough" semantics. If R6 uses a color not in `@axhy/ui-tokens`, add it to tokens first with a semantic name citing R6. Never inline hex literals in components.

**Type scale:** body 15/22, heading 22/26, display 28/31, caption 11/15 uppercase tracked.
**Spacing:** 4/8/12/16/20/24/32/40/48/64/80/128 only.
**Radius:** r1=6 chips, r2=10 inputs, r3=14 cards, r4=20 sheets.
**Quality bar:** Linear/Stripe/Vercel — pixel-faithful, deliberate, big-company discipline.

## 3. 100% match + working scenarios
- **PASS** = exercised end-to-end with an artifact (screenshot/API/trace). No pass from code reading.
- **CODE_PATH_PRESENT** = code exists but not exercised this session.
- **FAIL** = exercised and broke. Include failure mode.
- **DEFERRED** = precondition absent. Name the blocker.
- ~80% match is NOT done. ~95% is NOT done. Only 100% is done.

## 4. Side-by-side comparison required
Before claiming "matches R6": (1) capture R6 rendered at 390x844, (2) capture implementation at same viewport, (3) read both PNGs, (4) write per-element gap list (matches/drifts/missing/extra), (5) fix every drift before surfacing.

**Banned phrases until comparison done:** "This matches R6", "Sprint complete", "Production-ready".
**Allowed:** "Built; comparison pending", "Code works on happy path; visual coverage pending".

**Checklist per surface:** top chrome, tab bar, floating elements, empty/loading/error/populated states, cross-tab nav, sub-screens, cross-persona ripples.
