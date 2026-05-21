---
name: Investigate around reported issues, don't just log
description: When user reports a bug/issue during audit or debugging, grep/read related code to surface adjacent issues — passive logging misses the 80% that lives next door
type: feedback
originSessionId: 23ff8633-8261-4b35-8d00-54991ea03ee2
---
When the user reports an issue during an audit or debugging session, do NOT just log the issue verbatim and move on. Open the code, grep for related patterns, read the relevant file, and surface adjacent issues the user didn't see.

**Why:** User corrected this explicitly during the 2026-04-23 pre-launch audit of Axhy. They said "when i say issues you need to check not only list them then you might find something else too right?". One reported issue (Help panel links leaving admin portal) became 6 logged issues (dead code in ResourceLink component, marketing nav Sign-in CTA for logged-in users, cookie consent re-prompt, etc.) once I read help-panel.tsx + (marketing)/layout.tsx.

**How to apply:**
- Every user-reported bug is a probe, not the full finding. Grep / Read the file(s) the symptom points to before logging.
- Expand the bug entry with: exact file:line references, root cause, scope of change (where else this pattern lives), and any adjacent bugs discovered in the same file.
- Even when user says "don't fix, just list" — still investigate to produce a deeper/more accurate list. "Don't fix" ≠ "don't look."
- If investigation surfaces N adjacent issues, log each as its own entry (B3, B4, B5...) with cross-references so triage can bundle them.
