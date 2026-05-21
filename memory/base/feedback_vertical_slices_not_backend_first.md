---
name: Vertical slices, not "all backend first, then UI"
description: After ~3 foundational backend slices, the next slice should be a real consumer surface (UI / notifications / worker app) so it can push backend adjustments. Building too much abstract backend before a real surface tests it is a design smell.
type: feedback
originSessionId: 5f823f24-0cb4-45a4-b955-4b6761916b4a
---
**Rule:** development cadence is **small backend foundation → real consumer surface → feedback loop → refine backend**. Never "finish all backend, then finally do UI." UI exposes hidden product gaps; ignoring that loop too long means we build the wrong backend shape.

**Why:** owner directive 2026-05-16 after F-004 merged. Owner asked "do we only build backend first then go to UI — but UI might need changes and because of that even backend might need changes right?" Friend confirmed: yes — UI can and should force backend changes when needed; the right model is **vertical slices**, not abstract backend forever. This is the same principle that drove the rule-26 (inspect existing repo patterns) and rule-27 (pre-decided product behavior is an input) locks earlier: stay grounded in real surfaces.

**Concrete cadence for axhy-v3 specifically (2026-05-16):**

1. **Foundation built** — F-001 (effective-binding routing), F-002 (chat-writes-proposed-decisions), S-001 (same-day freeze), F-003 (cron + binding-expire-sweep), F-004 (HandoffPackage composer + writer). All DONE on main.
2. **Next slice picked: F-007** (notification dispatcher) — consumes HANDOFF_PACKAGE_GENERATED + BINDING_ENDED_AUTO + DWI events. Backend-only but **a real consumer of F-003/F-004**, not just more abstract backend.
3. **After F-007:** F-005 (admin-web HR portal — Kavitha's surface) and F-006 (worker mobile scaffold — Suresh's surface). These are the actual UI/persona surfaces that will likely push backend refinements.
4. **Friend's principle:** "Backend should lead only enough to create stable primitives. After that, a surface must consume it, otherwise we keep designing in abstraction."

**How to apply going forward:**

- Don't argue for "one more backend slice" if a consumer surface is overdue. The signal: if the slice produces only emit/audit events with no consumer at all on the same release, it's pure abstraction.
- Backend-only slices ARE OK when they're (a) primitive infrastructure for downstream surfaces (F-001 to F-004 fit this) OR (b) a real consumer of an already-emitted event (F-007 fits this — it consumes F-003 + F-004 events). Both count as "real surfaces" in the cadence rule.
- When a UI/persona slice exposes a backend gap (missing field, wrong payload shape, missing event), DO NOT defer the backend change to "later." Open a small backend correction slice in the same chain, ship it, then continue the UI slice. The feedback loop is the point.
- Resist the urge to add more abstract backend "while we're here." Three consecutive backend-only slices without a consumer surface is a warning sign.

**What this rule does NOT mean:**

- It does NOT mean "ship UI without backend foundation." Friend specifically rejected "UI first with no foundation."
- It does NOT mean "skip rule 27 + rule 26 + rule 24 (production-grade) on UI slices." All the existing discipline still applies — UI slices still go through scope + panel + scope review.
- It does NOT mean "any consumer counts as a real surface." A test-only consumer or a stub that nobody actually uses doesn't satisfy the cadence rule. The surface has to be the surface a persona actually touches (or a service a real production code path runs).

**Tied to existing rules:**

- Rule 26 (inspect existing repo patterns before designing) — same principle applied to code patterns.
- Rule 27 (pre-decided product behavior is an input) — same principle applied to product decisions.
- This rule applies the principle to **slice ordering**: surfaces feed backend, not the other way around.

**Source:** owner directive 2026-05-16, friend's relay verbatim: "Do not think in terms of 'backend completely first, UI later.' Think in terms of vertical slices: build the minimum backend foundation → then build a real consumer surface → then let that surface expose backend gaps → then refine backend."
