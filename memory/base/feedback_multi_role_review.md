---
name: Review every feature from multiple role perspectives
description: When auditing or building UI/UX, role-play worker, supervisor, COMPANY_ADMIN, SUPER_ADMIN, developer, founder — not just generic "user"
type: feedback
originSessionId: 347b6c25-58bd-48ad-b5ea-b9afb772c022
---
When reviewing or designing a feature, role-play through every user that touches it:

- **Worker (low-literacy, on-site, stressed)** — can I find this in 2 taps? Is the primary action one big button?
- **Supervisor** — can I monitor N workers at once? Can I find a specific one in seconds?
- **COMPANY_ADMIN** — am I blocked by missing search/pagination at 1000+ rows? Can I fix my typos? Can I export data?
- **SUPER_ADMIN** — can I see across tenants? Do I have the escape hatches (hard delete, GDPR, audit log)?
- **Developer** — does the code say WHY, not just WHAT? Are there type holes, lint errors, dead code, `TODO`s?
- **Founder** — does this help me sell? Does it protect retained data for future analytics/ML? Does it lock out competitors?

**Why:** 2026-04-15, user said: "think like a how a illerate user think" + "think like human and developer founder worker admin how those features should be working." Generic "user" testing misses the concrete pain each role experiences.

**How to apply:**
- For any UX audit, produce findings grouped by role affected, not just by screen
- For any new feature, write a 1-line "role test" for each: who uses this, what's their context, does the current design serve that context?
- In code reviews, check whether the change helps or hurts each role's workflow
- Flag features that serve only one role at the expense of another (e.g. super-admin data dump screen that confuses a company admin)
