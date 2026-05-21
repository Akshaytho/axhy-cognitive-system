---
name: Panel process (consolidated)
description: Panel approval required for all changes. Plan mode for medium/major. 1-year horizon. Adversarial checkpoint at wave end. Spec coverage in done-memos. Merged from 6 files locked 2026-05-10.
type: feedback
---

# Panel Process (6 locks consolidated)

## 1. Panel approval for ALL actions (3 iterations of the rule)
Every codebase action — UI, architecture, package wiring, refactors, deletes, deps, configs, even verbal suggestions — requires panel debate FIRST. Panel decides AND executes through Claude; founder interrupts/corrects, never approves step-by-step. No hardcoded values, no cheap shortcuts, no "placeholder" UI (a visual decision IS a decision).

**Memory hygiene:** update existing MDs, don't create new ones for duplicated info.

## 2. Plan mode + panel for medium/major changes
Every medium or major change → EnterPlanMode → panel critique → founder approval → THEN code. Plans must list files affected, panel voices, risks, rollback strategy. Trivial changes skip plan mode but still get panel.

**What's trivial:** typo fix, comment update, one-line config. Everything else = non-trivial.

## 3. 1-year horizon thinking
Every panel voice frames the day-365 reality (Mr. Reddy after a year of use, Suresh's 1000th login, Mukesh managing 200 workers) — not first-impression delight. First impressions matter, but they're 1 of 365 days. Design for the repeat user, not the demo.

## 4. Founder sees only important decisions
Panel debates every change internally. Surface to founder ONLY on: real forks (2+ viable approaches with different tradeoffs), money decisions, locked-decision modifications, security/billing, master plan changes. Everything else = panel decides autonomously.

## 5. Adversarial panel at wave end
End-of-wave panel asks "what's MISSING from spec?" not "did the wave succeed?" Named voices expected to find gaps. Performative panel (everyone agrees = rubber stamp) is worse than no panel. Gaps listed in coverage matrix.

## 6. Done-memo spec coverage matrix
Every done-memo walks the spec section-by-section, marking each ✅/❌/⚠️. If <100%, status is "shipped with known gaps" not "complete". Caught 2026-05-10 when Wave 4a-PRO claimed "complete" while ~30% of Spec 2 shipped.
