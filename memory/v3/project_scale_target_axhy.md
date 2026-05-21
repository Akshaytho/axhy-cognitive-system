---
name: scale-target-axhy
description: Per-company scale target locked 2026-05-17 PM — 2K workers minimum, 100s of supervisors, many HRs, many admins, India multi-tenant. Every design decision (UI density, query plans, pagination, pulse counters) must hold at this scale, not at demo scale.
type: project
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Scale target (locked 2026-05-17 PM)

**Fact:** Each tenant on Axhy will run with **2,000+ workers, 100+ supervisors, many HRs, many admins**. Geography: India. Operating model: multi-tenant SaaS, many such tenants.

**Why:** Founder said 2026-05-17 PM: *"imagine we are going to be working with multiple conapnies where minum employees inti is 2k workers 100s of supervsiors and many HR's ok and admins and that too in india ok."* This is the engineering target — not aspirational, the design floor. A solution that's clean at 25 workers but breaks at 2K is unacceptable.

**How to apply:**
- **Query plans:** Every aggregator (`/supervisor/today`, `/supervisor/summary`, dispatcher, payroll) must hold at 2K workers per tenant. Add covering indexes; reject patterns that scan whole tables; bound joins by site portfolio not by tenant.
- **UI density:** Lists must paginate / virtualize. A supervisor with 30 sites and 200 workers can't render a flat list. Use grouping, search, filters.
- **Pulse counters / state derivation:** Computation must be O(portfolio) not O(tenant).
- **Performance budget:** `/supervisor/today` < 500ms p95 at 2K-worker tenant. `/supervisor/summary` < 1s p95. Profile before shipping; add EXPLAIN-derived indexes where needed.
- **Real-life scenarios:** Any plain-English scenario file MUST include scenes at this scale (e.g. "Supervisor opens Today with 8 sites and 60 workers and a flagged visit alert; load time, scrollability, glance-readability all hold"). Don't write scenes around 4-worker happy paths.
- **Multi-role coexistence:** Worker + Supervisor + HR + Admin all operate concurrently per tenant. Cross-persona effects (one supervisor's binding change ripples to HR view) must be designed for thousands of concurrent users per tenant, not single-user demos.
- **India-specific:** SMS via MSG91; phone numbers E.164 `+91`; locale defaults `hi`/`te` per worker; festival/holiday calendar matters for shift planning.
