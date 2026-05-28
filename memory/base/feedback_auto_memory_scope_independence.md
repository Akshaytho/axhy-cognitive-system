---
type: behavioral_rule
authority: curated
date: 2026-05-28
commit: 9b7d125
session: f1b-structural-fixes
embed: true
---

# Memory writes bypass slice-scope check

## What changed

`pre-edit-guard.mjs` now lets you write `.md` files under specific memory paths
even when they aren't in the slice's `approved_files`. Memory IS meta-work that
accumulates across slices — it shouldn't require slice ceremony to capture.

## Paths exempt

- `axhy-cognitive-system/memory/` — feedback files, behavioral rules
- `axhy-v3/docs/learnings/` — v3 learnings tied to commit-msg hook
- `axhy-cognitive-system/docs/retros/` — session retros

`.md` extension required. Non-markdown files (`.js`, `.ts`, etc.) in these
directories still get blocked — no code can hide in memory dirs.

## What still gates

Every other check still applies:
- Approval-state must exist (run `check_before_edit` for *something* in the slice)
- Approval must not be expired
- Existing memory files still need a recent Read before update
- Each memory write consumes one edit from the slice budget
- `requires_answer` gate still fires
- Audit log still records the write

## How to use

You're already in a slice with `check_before_edit` approval for some other file.
You realize you want to save a feedback memory. Before this fix: blocked by
scope, had to bypass via Bash or expand the approval scope. After this fix:
just `Write` the `.md` file under a memory path. The hook lets it through.

## Why this matters

The prior embodiment got blocked here and bypassed via Bash with the founder in
the loop. They documented it as structural blocker #4. The fix removes a
recurring point of friction where AXHY's own guardrail prevented AXHY's own
memory accumulation. Two AXHY subsystems were colliding; now they don't.

## Self-test

This very file was written from within an unrelated slice scope using the new
exemption. If you're reading this in the brain, the exemption worked.
