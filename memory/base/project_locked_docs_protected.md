---
name: docs/locked/ folder is protected — never delete or modify
description: Any file under /Users/thotaakshay/eclean_workspace/axhy-cognitive-system/docs/locked/ must not be deleted or modified by Claude without Akshay's explicit in-turn permission
type: project
originSessionId: 23ff8633-8261-4b35-8d00-54991ea03ee2
---
The folder `/Users/thotaakshay/eclean_workspace/axhy-cognitive-system/docs/locked/` holds strategic roadmap documents that must persist across sessions and survive AI context resets. These files are reference material that Akshay has explicitly asked future-Claude to read when specific triggers fire.

**Rules:**
1. **Never delete** any file under `docs/locked/` — not during cleanup, not during refactors, not when consolidating docs.
2. **Never modify** any file there unless Akshay explicitly asks in the current turn.
3. **Always check** `docs/locked/README.md` and individual files when Akshay mentions scale milestones or asks "what did we decide about X?"
4. **Surface proactively** — when Akshay describes a situation matching a locked doc's trigger criteria, mention the doc and ask if he wants to act on it.

**Known locked docs (as of 2026-04-23):**

- `docs/locked/README.md` — folder guide + file index
- `docs/locked/TESTING_STRATEGY_AT_SCALE.md` — tiered testing/observability roadmap.
  - Trigger: Axhy crosses 10 paying customers, OR a production incident that a higher-tier tool would have caught, OR Akshay asks about scaling tests/monitoring, OR a new engineer joins the team.

**How to apply:**
- On any session where Akshay mentions customer count ≥10, scaling testing, observability, or production incidents — open `docs/locked/TESTING_STRATEGY_AT_SCALE.md` and reference it in the discussion.
- When writing code that touches test infrastructure (new Playwright specs, new monitoring endpoints, etc.), check whether locked docs prescribe an approach.
- If a locked doc appears to be outdated, do NOT edit it — raise it with Akshay first. He'll decide whether to update or deprecate.
