---
name: push-to-production-each-slice
description: Founder 2026-05-17 PM locked — push every code change to production main as it lands; test the deployed thing, not just local. Local + production both matter. Supersedes the older "no push without founder review" rule.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Push to production each slice (locked 2026-05-17 PM)

**Rule:** After each sub-slice is green locally (tests + typecheck), commit and push to `main`. Then smoke-test the **deployed** thing on Railway. Local-only is not enough — production must be verified too.

**Why:** Founder said verbatim 2026-05-17 PM: *"from now push all codes to production and test in production too. because not only local is imp but production too."* Combined with the 3-day supervisor sprint mode, the rev-by-rev review cadence (`feedback_no_push_merge_without_review.md`, 2026-05-11) is explicitly OVERRIDDEN. Local edits piled up without production verification means launch-day surprises; he wants the live system caught up continuously.

**How to apply:**
- Each green sub-slice: `git add` → commit with descriptive message → `git push origin main` (or whatever the active sprint branch is).
- After push: smoke the **deployed Railway URL** for the changed endpoint, not just the local server. Capture a one-line confirmation per slice.
- For mobile changes: backend goes to deployed Railway; mobile is tested via Expo Web + Playwright pointing at the **deployed** backend URL (NOT a local Fastify instance).
- If a push would break a destructive guard (schema migration, mass delete, force-push), STOP and surface — those still need explicit approval. The override is for ordinary feature code, not destructive ops.
- If CI fails post-push: stop subsequent work, fix forward, re-push. Don't pile new slices on a red build.

**Supersedes:** `feedback_no_push_merge_without_review.md` (locked 2026-05-11). That rule still applies for destructive ops and main-line schema migrations; for ordinary feature code in the supervisor sprint window, this new rule wins.

**Scope:** Supervisor sprint window (2026-05-17 PM → ~2026-05-20) and forward, until the founder revokes. Not a one-off.
