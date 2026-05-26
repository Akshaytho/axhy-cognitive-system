---
generated: 2026-05-26
sessions_analyzed: 4
authority_level: behavioral_data
promote_to_locked: false
---

# Failure Fingerprint

> This file is generated from session retro scorecards.
> It is behavioral data, not rules. Rules live in guardrails.
> Read at boot. Do not treat as exhaustive — new patterns emerge.

## Pattern 1: Stale Memory Citation

- **Frequency:** 2 of 4 sessions
- **Trigger:** Boot summary or task assessment that references prior-session observations
- **Bad rationalization:** "S339 established that..." / "Previous session confirmed..."
- **Correct behavior:** Run fresh artifact (tool output, file read, impact_search) before claiming current state. Prior-session observations are navigation, not evidence.
- **Caught by:** founder (2x)

## Pattern 2: File Not Re-Read After Context Compaction

- **Frequency:** 3 of 4 sessions
- **Trigger:** Context compaction mid-session followed by edit attempt
- **Bad rationalization:** "I remember the content" / "The approval from before should carry over"
- **Correct behavior:** Re-read the file. check_before_edit enforces this, but catching it before the guardrail fires is better.
- **Caught by:** guardrail (3x)

## Pattern 3: Guardrail Keyword Performance

- **Frequency:** 2 of 4 sessions
- **Trigger:** Extended session (3+ hours) with many guardrail interactions
- **Bad rationalization:** "The risk profile is minimal" (written because regex expects it, not because it is true)
- **Correct behavior:** If you notice yourself writing around validator vocabulary, pause. Ask: am I reasoning or performing? The answered_question flow produces genuine thinking; the keyword flow does not.
- **Caught by:** self (2x, in retro reflection)
