---
name: supervisor-sprint-mode
description: Founder decided 2026-05-17 PM to drop the rev-by-rev plan-and-friend-review cycle for the supervisor app sprint. Target 3 days. Friend explicitly said the prior cadence was ~100x slower than needed.
type: feedback
originSessionId: 1001131c-a992-4c63-be9a-cf950b9e6d43
---
# Supervisor app sprint mode (locked 2026-05-17 PM)

**Why:** Friend explicitly told the founder that the rev-by-rev plan→friend-review→ask-question→re-plan cycle was ~100x slower than needed. At that pace, the supervisor app would take a year. Founder decided to compress: skip the per-rev review cycle, batch panel review at end of sprint, target 3-day supervisor app completion.

**How to apply:** This is mode discipline — it overrides the per-plan friend-review pattern, NOT the underlying engineering discipline.

## What this mode SKIPS

- Surfacing every plan revision to friend before any code.
- Multi-turn `AskUserQuestion` loops between exploration and implementation.
- Per-slice adversarial panel review. Batch at end of sprint instead.
- Per-feature `handoff/feature-queue/INDEX.md` updates. Batch at end of sprint.
- Asking the user every defensible engineering choice (route paths, helper signatures, etc.). Make the reasonable call; surface only true blockers.
- The 13-step handoff read chain (`README.md` → `STATUS.md` → `execution-state/INDEX.md` → ...). Resume them after sprint ends if needed; for sprint use the dedicated `NEXT_SESSION.md`.

## What this mode KEEPS

- Real-DB integration tests against Railway sandbox (no mocks for service-layer tests).
- `pnpm typecheck` before declaring any sub-slice done.
- Panel review for UI per `feedback_no_ui_code_without_panel_approval.md` — but ONCE at end of sprint, not per slice.
- Production-grade rules (`feedback_production_grade_workflow_rules.md`): invariants enforced, no check-then-act races, no final state before domain effect, no stubs that pretend success.
- Planning-discipline rules (`feedback_planning_decision_rules.md`) AT THE CODE LEVEL: every claim points to a real `file:line`; no fabricated fields/helpers; bootstrap vs reusable distinction; one-verb steps (verify/add/modify/defer).
- Multi-tenant `withTenantContext` discipline — never accept `companyId` from client.
- Bootstrap vs reusable separation — sprint code is reusable product logic, NOT seed/migration.

## What this mode still SURFACES immediately

- Schema decisions that would block future work.
- Discovered destructive actions (DB drops, prod data risk).
- Real ambiguity in user intent (not engineering choice).
- Detected fabricated claims caught by typecheck or test runs — fix in place, surface the catch.

## Scope boundary

This mode applies to: the supervisor app sprint (2026-05-17 PM → ~2026-05-20).

This mode does NOT apply to: future schema migrations (P1 DWI / P1 HRUpdate / P1.5+ work), production deploys, anything beyond the sprint window. After sprint, default discipline returns.

## Friend's standing-rules carryover

Friend's planning-discipline rules from 2026-05-17 AM (`feedback_planning_decision_rules.md`) still apply in spirit but compress in cadence:
- "Never promote a guess into a plan fact" still holds at code level — every field/helper/route claim must verify in code.
- "Every claim points to one real thing" still holds.
- "No stubs that pretend success" still holds.
- "Operate in bigger batches" (friend's own meta-rule) is what this mode operationalizes — sprint-scale batching, not slice-scale.

## Pattern for next session resume

1. Read `axhy-v3/handoff/NEXT_SESSION.md` (the supervisor-sprint version).
2. Read this memory entry.
3. Read the approved plan at `~/.claude/plans/tranquil-crunching-plum.md`.
4. Start coding Sub-slice 1 immediately. No re-plan.
5. Batch status updates at end of each sprint day.
