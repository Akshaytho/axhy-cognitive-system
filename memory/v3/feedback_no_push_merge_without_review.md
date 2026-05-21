---
name: No push / merge without founder review
description: Founder explicitly locked 2026-05-11 — do NOT push branches, do NOT merge PRs, do NOT run git push or git merge until founder has personally checked the work. Local file edits are fine.
type: feedback
originSessionId: 4d204c5b-c118-4c43-b328-481815a60b2e
---
Founder said exactly: "from now dont push and merge code i will check ok"

**Why:** Founder wants to review code in their editor before any code lands on remote / main. They've been doing rapid iterative product design with an external advisor — code direction is changing every few hours. Pushing without review risks shipping a half-baked design or one that contradicts an in-flight reframing.

**How to apply:**
- Free to: create new files, edit existing files, scaffold prototypes, run tests locally
- Do NOT: `git push`, `git push --force`, `git merge`, `gh pr merge`, `git rebase main`, or anything that propagates code beyond the local working tree
- When work is ready for review: write the changes locally, summarize what was done, and let founder open the diff in their editor. Wait for explicit "ok push" or "ok merge" before any remote / branch-integration command.
- Older pre-authorization for commit+push (`feedback_commit_push_auto_authorized.md`) is **SUPERSEDED for now** by this stricter rule. If/when founder lifts this, re-enable the older default.
- Local commits are a grey zone — prefer to NOT commit unless founder asks. Working-tree-only is safest while this rule is active.

**This applies to:**
- All branches in `axhy-v3/`
- All branches in any other repo in the workspace
- Both `main` and feature branches (founder wants to see even feature-branch pushes before they happen)

**Related locks:** `feedback_commit_push_auto_authorized.md` (superseded), `feedback_plan_mode_for_medium_major_changes.md` (plan-mode discipline; complements this rule).
