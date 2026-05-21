---
name: Keep UI simple — show plain options, let admin decide, no AI-style suggestions
description: When a scenario needs a decision, show 2–3 static options as bullet points. Don't have the system propose specific workers, chained-assignments, or smart picks — there's no AI agent yet.
type: feedback
originSessionId: ae10a9e4-4289-4889-8a2d-5c091a896996
---
**The system shows options, the admin picks one.** When a situation needs a decision (e.g. no viable floater left for an UNCOVERED slot), render a simple modal with 2–3 plain-text options as bullet points. Admin reads, thinks, picks. The system then executes the mechanical part of whatever they picked.

**What the system does NOT do (yet):**
- Propose a specific worker to chain-assign ("Arjun finishes at 11 AM, double him up at Sapphire")
- Recommend which low-fit candidate to dispatch
- Auto-schedule anything beyond the approved state-machine transitions
- Simulate or predict outcomes of the admin's choice

**Why:** User said 2026-04-20 reviewing the scenario simulator plan: "there is no ai agent right … we show 3 options in points so he do's it manually we cant make anymore complicated then this just show 3 options as points he can see on ui to think for better solution himself." They rejected a Scenario 2 proposal that had the system pre-compute "Arjun→Sapphire 11 AM" — too smart, overreaches the current capability, and removes the admin's judgement where judgement actually matters.

**How to apply:**
- **Escalation modals = static option list.** Example for "no viable candidate":
  - Dispatch a low-fit floater (log your reason)
  - Mark site as UNCOVERED and send the client message
  - Pick an active worker to double-up after their current site ends (admin searches & picks manually)
- **Admin does the picking.** If option 3 needs "which worker doubles up," the admin searches workers and picks — system does NOT pre-filter "workers who finish before 11 AM."
- **Mechanical follow-through is fine.** Once admin chooses, the system handles: create the assignment, cancel the original, fire the notification, draft the client message, log the reason. That's plumbing, not judgement.
- **Simple counts and guards are fine.** "Anita is on her 4th site today" is a count, not an AI pick. Show the warning. Let admin decide.
- **Data to help admin, not decisions for admin.** Showing "sorted by distance" or "current load: 3/5" in a table is fine. Saying "recommend Anita" is not.
- **Reassess when an AI agent exists.** This rule applies until there's an agent that can legitimately reason about chains, skills+proximity+load holistically, and own the decision. Until then, every "smart suggestion" is actually just a heuristic pretending to be smart — and if it's wrong, the admin wears the blame.
