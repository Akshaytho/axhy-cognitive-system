---
name: Blanket commit / push / merge authorization
description: User pre-authorizes the full git ship cycle — commit, push, open PR, run required tests, merge — no per-action check-in
type: feedback
originSessionId: 515edcf7-6e79-4fe1-9f2e-b1521ab1dfbf
---

User explicitly said (2026-04-24):
- "you can push and commit ok dont ask for pr again"
- "we cant check every time you need to merge and do you some required testing for it ok. but dont waste time on merging and pr again"

Durable preference. User is a solo founder and refuses to be the merge clerk.

**Rule:** Once the user has given me a task, I own the full ship cycle until it is live on main:
1. Branch
2. Code
3. Required tests (typecheck, unit tests for the touched surface, any scenario test the PR requires, CI grep guards)
4. Commit
5. Push
6. Open PR
7. Watch CI
8. Merge to main when required checks pass

Do NOT pause for per-action authorization on steps 1–8.

**Why:** Every "can I merge?" prompt is friction that derails their flow. They've decided to trust my judgment on when a PR is ready.

**How to apply:**
- Run required tests BEFORE merging — typecheck, relevant unit tests, any scenario test the PR is supposed to include
- If the mandatory tests pass, admin-merge (squash + delete branch). Bypass pre-existing unrelated red checks, but document in the PR body / merge commit which checks were unrelated and why
- After merge, delete the branch, report result in one line
- Skip re-asking for PR authorization, merge authorization, or "should I proceed"

**Still require explicit user auth for:**
- Force-push to ANY branch
- Amend a commit already visible on a shared branch
- Reset main / destructive operations on main
- Delete a PR, close a PR without merging
- Scope outside the task the user assigned (new features, refactors the user didn't ask for)
- Secrets or credentials changes

**Revocation signal:** user says "stop", "hold", "undo", "don't merge", or similar → pause immediately.
