---
name: Push to main directly for now; switch to feature branches when shipping new features
description: v3 commit/push policy — main-direct today, feature-branch + PR pattern starts when net-new features land (planned ~2026-05-10 onwards)
type: feedback
originSessionId: 82c1e765-05aa-4232-adcd-c1cbb65e6360
---
**Rule:** For all v3 work happening *right now* (Phase A visual migration, Phase B
backend foundations being added to existing routes/schemas, infrastructure fixes,
chores) — commit straight to `main`. Railway auto-deploys main; founder reviews
on phone in real lighting. This matches the established v3 pattern (every commit
on `main` to date has been main-direct).

**Switch trigger:** when work moves from "migration / wiring / chores" into
**genuinely new feature work** that warrants a review surface (a Claude or
collaborator other than founder vetting before deploy), shift to:

```
feat/<topic> branch  →  PR  →  CI green + Railway preview env  →  merge to main
```

The user said this on 2026-05-07 and timed the switch as "in a few days" — i.e.
when Phase B starts shipping new backend routes / new tables / net-new features
that didn't exist before, not when migrating existing surfaces.

**Why:**
- Solo-founder Railway-auto-deploy flow doesn't need PR ceremony for every commit;
  it adds friction without value when there's only one reviewer (the founder
  themselves) and the deploy IS the review.
- Earlier this session (PR #1) I introduced a feature-branch + PR + Railway-preview
  gate without being asked. User called it out: that pattern is *new*, not the
  existing pattern, and it was unnecessary ceremony for a migration commit. They
  want the gate later when there's a reason for it (collaborator review, multiple
  in-flight features, etc.) — not on every push.
- Founder pre-authorization for commits + push to main is already locked in
  `feedback_commit_push_auto_authorized.md` (legacy memory). This rule clarifies
  *which branch* the auto-authorized push targets.

**How to apply:**
- Default: `git push origin main` after committing. No PR.
- Exception (today): if the work is a "genuinely new feature" — net-new route,
  new state machine, new table, new screen flow that didn't exist on `main` — ask
  the founder explicitly if they want a feature branch. Don't assume.
- Exception (post-switch): once the user announces "we're on feature branches now,"
  reverse the default — every new-feature commit goes to `feat/<topic>`, with PR.
  Migration / chore / typo / fix commits can still go straight to `main` for low-risk
  changes unless the user says otherwise.
- Existing PR #1 (`feat/phase-a-terracotta`): merge to main once CI greens — don't
  leave it open as a precedent.

**Anti-pattern:**
- Don't open feature branches "just to be safe" when the work is migration / wiring
  / fixes — that's the ceremony the user explicitly rejected.
- Don't conflate "I want code review" with "I need a feature branch." For
  pre-merge sanity, run typecheck + build + lint locally; that's the real gate.
