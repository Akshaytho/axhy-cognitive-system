---
name: Rotation items deferred to pre-release
description: Railway Postgres + Anthropic key rotations + git-filter-repo scrub are user-owned, pre-release gated. Don't block ship or nag.
type: project
originSessionId: ae10a9e4-4289-4889-8a2d-5c091a896996
---
Pre-release pending (2026-04-22 decision):
- **Railway Postgres password** — `yamanote.proxy.rlwy.net:31983/railway`. Leaked in git history commits `ed4ea478` + `594502e` (`eclean-v2-b2b` repo). Documented unrotated in commit `857b409`.
- **Anthropic API key** — exposed via old Railway build log.
- **git-filter-repo scrub** — on `eclean-v2-b2b` to remove the leaked password from history. Requires force-push to main.

**Why:** User will rotate before client #1 onboarding. All application-side code-level P0 fixes already shipped (P0.1 IDOR, P0.3 SHA pin, P0.4 OTP prod gate — commits e2daec4, 1ecbaf7, bbb0a2e, c85785b on 2026-04-22).

**How to apply:** Don't re-prompt the user for rotation. Don't force the scrub without explicit "go". Track as pre-release gate in /docs if a launch checklist exists. The code-side fixes stand on their own — system is safer today than it was yesterday even without rotation.
