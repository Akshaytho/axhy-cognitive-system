---
name: Planning rules (consolidated)
description: 10 planning decision rules + real-life scenarios before implementation + features explained + review findings batch + find all errors first + re-derive from invariants on turn 3+. Merged from 6 files.
type: feedback
---

# Planning Rules (6 locks consolidated)

## 1. Planning decision rules (10 rules, installed 2026-05-17 by friend)
1. Never promote a guess into a plan fact. Unverified claims → "Unknowns needing a pick."
2. Every core plan claim points to one real thing (schema field, helper, route with file:line).
3. Before designing a fallback, check it preserves the contract. If contract changes, rename the slice.
4. No placeholders that pretend success. No "log + advance" stubs. No enabled buttons with no write path.
5. Differentiate bootstrap-only logic from reusable product logic. If seed-only, name/scope it that way.
6. When reusing a helper, inherit its policy surface. New helper must enforce same policy OR declare itself a bypass.
7. Don't merge review findings with implementation in one turn — present plan first, get approval, then implement.
8. Every derivation locks: evidence (file:line), timestamp, window, filter, threshold.
9. If a plan revision changes a helper's contract → update ALL callers in the same revision.
10. Inspect existing repo patterns before designing new abstractions.

## 2. Features explained + real-life scenarios before implementation
Pre-implementation docs have TWO layers:
- **Layer A — Feature explanations:** what/why/where/when/who/how-used-in-real-life for each feature
- **Layer B — Scenarios:** normal flows + edge cases + cross-persona impact, in plain English

Save at `axhy-v3/handoff/<persona>-real-life-scenarios.md`. A real supervisor at an Indian cleaning company should read it and nod. After implementation, verify all scenes pass.

## 3. Address all review findings at once
When friend gives N findings, address ALL in ONE plan + ONE commit. Don't split into micro-iterations (2 + 2.5 + 2.6).

## 4. Find all errors first, then plan, then execute
When ONE error is detected: pause, sweep exhaustively for ALL instances of the same class + adjacent classes, identify root cause, write comprehensive plan, surface full inventory, execute as one batch. One-at-a-time fixing creates a thrash loop.

## 5. Re-derive from invariants on turn 3+
When a plan reaches turn 3+ on the same scope, STOP patching. (1) State what must ALWAYS be true, (2) design the smallest correct shape satisfying those invariants, (3) write the picks. New draft should be SMALLER not larger. Proven with F-007: v7 reset dissolved 12 mechanisms from v1–v6.
