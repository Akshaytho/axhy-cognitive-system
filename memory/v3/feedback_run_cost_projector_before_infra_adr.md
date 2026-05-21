---
name: Run cost projector before locking any new infra / AI ADR
description: Before proposing or locking any ADR that adds infra or AI services, run scripts/project-costs.mjs and embed the result in the ADR body
type: feedback
originSessionId: 82c1e765-05aa-4232-adcd-c1cbb65e6360
---
When proposing or locking any new ADR (in `docs/decisions/`) that touches:
- New infrastructure (database, queue, cache, file storage, CDN)
- A new AI provider or model
- A new third-party service that bills by usage

ALWAYS, before bringing the panel debate to founder:

1. Run `node scripts/project-costs.mjs --scenario big` (and `pilot` for low end)
2. Capture the per-customer cost + % of revenue numbers
3. Fill the "Cost at scale" table in the ADR body (template requires this)
4. If the new cost would push AI > 20% of revenue at the `big` scenario, surface
   to founder as a red flag — propose alternatives before locking

**Why:** Akshay flagged on 2026-04-29 that we were leaving money on the table
(GitHub Actions cron firing daily, naive Opus-everywhere model choice). Per-surface
model policy ADR-0023 saved ~₹820K/month at 5-customer scale. He wants me to
catch the next one BEFORE it lands, not after the bill arrives.

**How to apply:**

- Done as part of the ADR draft, NOT as a follow-up
- Number embedded in the ADR's "Cost at scale" section (template requires this)
- Numbers are sticky — if the underlying constants in `scripts/project-costs.mjs`
  change, refresh the table

**ADRs that auto-trigger this rule going forward:**

- New backend service / database / cache
- New AI surface (add to the model-policy table in `@axhy/ai-tools`)
- New external API integration with usage-based pricing
- Schema migrations that materially change row volume (e.g. audit-event volume)

**Surfaces this rule does NOT cover:**

- Pure-code refactors with no infra change
- Documentation changes
- Test additions
- Internal tooling that runs once
