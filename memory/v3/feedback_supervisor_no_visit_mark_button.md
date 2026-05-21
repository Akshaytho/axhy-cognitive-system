---
name: supervisor-no-visit-mark-button
description: Supervisor UI has NO "mark visit done" button anywhere. Workers do their work and clock themselves out via worker mobile. The only Visit-related thing a supervisor sees is FLAGGED visits to review (resolve / reject). All other Visit lifecycle is worker-driven.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Supervisor has no visit-mark button; only flagged-visit review (locked 2026-05-17 PM)

**Rule:** The supervisor mobile app has NO button or action that writes `Visit.state` directly — except the flagged-visit review path (Resolve / Reject on a FLAGGED visit, which transitions FLAGGED → VERIFIED or FLAGGED → CANCELLED per the canonical state machine). Workers handle their own clock-in / clock-out / photos via worker mobile (Phase D). Supervisor's relationship to Visit is **read-only except for flagged-visit review**.

**Why:** Founder said 2026-05-17 PM: *"see workers deos there work and go , so supervsior will not have any cisit mark button , only supervsior will get flagged assigment data to see and review them."* Visits are the worker's lifecycle; bringing supervisor into the middle of every visit was the V2 mistake — too many taps per shift, supervisor becomes a tap robot. R6 strips this back: visits flow on their own; supervisor is summoned only when AI flags something.

**How to apply:**
- **Backend:** No route accepts supervisor as actor for a generic "end visit" or "mark done" action. The `POST /visits/:id/end` route is deleted as part of the 2026-05-17 batch.
- **Today tab:** Worker rows show state derived from `Visit.state` (read-only) + `Attendance.status`. Mark-absent is the ONLY write supervisor can make on a worker row, and it writes `Attendance` (PERSONNEL-tier), not `Visit`.
- **FlaggedReviewSheet:** The single Visit-write surface the supervisor has. Resolve → canonical `VERIFIED`; Reject → canonical `CANCELLED`. Routed through the (currently paused) routing slice. For this sprint, the Resolve/Reject buttons render disabled with honest "Coming with P1 routing" copy per `feedback_real_life_scenarios_before_implementation.md`.
- **Activity tab:** Read-only display of visit events. No write affordances against Visit.
- **Decisions tab:** Pending supervisor decisions. EMPLOYMENT/PERSONNEL/OPERATIONAL/NOTE write paths — none of which transition Visit.state directly.
- **Chat:** AI may extract decisions that affect Visit indirectly (e.g. "mark Suresh absent" → Attendance write, not Visit write). AI never proposes "end this visit" because that surface doesn't exist.

**Implication for Today state derivation:** Until worker mobile ships (Phase D), most Visit rows will stay in default state `SCHEDULED`. The Today aggregator's "on_site" / "late" / "pending" derivation will return mostly empty buckets until worker mobile starts moving Visit through `NOTIFIED → EN_ROUTE → ON_SITE → IN_PROGRESS → PHOTOS_PENDING → VERIFIED`. This is honest — the sprint ships the UI shell + correct derivation; the data path lights up as worker mobile arrives.

**Anti-pattern banned:** Any future suggestion to add a supervisor "Mark visit done" or "Force end" button must surface this memory and the founder lock first. Adding the button silently violates the worker-owns-their-work principle and the R6 design intent.
