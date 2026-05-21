---
name: Don't nag about key rotation
description: User knows the OpenAI + Railway keys are leaked and will rotate on their own schedule — do not repeatedly surface this as a recommendation
type: feedback
originSessionId: 1a4c25f5-30c9-4353-94d6-883d107148a7
---
Do not proactively recommend or remind the user to rotate the leaked OpenAI key or Railway Postgres password. They are aware and will handle it on their timeline.

**Why:** User explicitly said "i will rotate them later dont say again" on 2026-04-19 after I recommended rotation as the highest-value next move. They already know the risk — repeating it is noise.

**How to apply:** When asked "what's next" or proposing priorities, do NOT include key rotation in the list. Only mention it if the user explicitly says `rotate keys` (the trigger in RESUME.md) or directly asks about key/credential status.
