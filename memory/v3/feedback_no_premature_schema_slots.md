---
name: No premature schema slots — defer until real scenario demands it
description: Don't add tables/columns/state-strings for hypothetical future scenarios. Wait for a real customer or real scenario in the current conversation. Locked 2026-05-09.
type: feedback
originSessionId: 24c409db-c292-4928-af95-fd3466a6e158
---
When designing schema, do NOT add tables/columns/states for hypothetical futures (Rapido pivot, GHMC contracts, analytics product, world domination). Add only what the scenarios discussed in the current conversation demand. Future tables/columns can be added later as additive migrations — those are cheap and safe.

**Why:** Founder rejected a 50+ table audit on 2026-05-09 because the cognitive load was too high — for him, for me, and for AI agents at runtime. He explicitly said "I won't remember any of this" and "AI can't handle that many different tables at once." His direct quote: "Honeywell didn't have that many tables." The lesson: premature schema is a worse trap than late schema, because early schema has wrong shapes baked in AND piles cognitive load.

The real distinction:
- **Shape changes** (entity-shape redesigns, primary-key changes, RLS reshaping) are expensive — get them right NOW
- **Additive changes** (new table, new nullable column) are cheap — add them WHEN NEEDED, not in advance

I was conflating the two. Slotting closed-API tables for Phase E and adding hypothetical govt-compliance columns counted as "additive" (cheap to add later) but I was adding them now. That's wrong.

**How to apply:** When proposing schema changes, ask:
1. Is this needed for a scenario discussed in THIS conversation? If yes, include it. If no, defer.
2. Is this a shape change (recurrence-pattern vs daily row) or additive (new column)? Shape change = decide now. Additive = decide when needed.
3. Is the founder's working memory going to expand or shrink with this change? Shrink wins.

Don't propose "future-proof slots" unless the founder explicitly asks for them. Don't name-drop world-class scale (Sodexo, Stripe, Linear) as justification — frame from the actual scenario instead.

If unsure whether to include something, default to NOT including it. The founder will ask if he wants it.

## What to drop by default

- Tables for products not yet decided (gig/Rapido, govt contracts, analytics-as-product)
- Tables for cross-tenant features when no cross-tenant scenario exists yet
- Tables for compliance regimes we haven't entered yet (GDPR, HIPAA, etc.)
- Columns for analytics aggregates (compute on-demand instead)
- Slots for "we might want this in 3 years"

## What to keep

- Tables/columns for scenarios actually discussed
- Shapes that are expensive to retrofit (recurrence patterns, generic workflows like ChangeRequest)
- The right primitive for the load-bearing entity (Assignment as pattern, not row)
