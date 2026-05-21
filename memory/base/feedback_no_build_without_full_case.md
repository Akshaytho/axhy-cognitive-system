---
name: No building without a full case
description: User refuses to start any new build until why/how/depth/profit/risk are fully clear and only-upside
type: feedback
originSessionId: 515edcf7-6e79-4fe1-9f2e-b1521ab1dfbf
---
Don't suggest "let's build X" or start coding on a new feature until you can present a complete case covering:

1. **Why** — what concrete problem/cost/pain this solves for the business. Quantify if possible.
2. **How** — the technical approach in plain English + 2-3 sentences on the architecture.
3. **Depth** — full scope and hidden complexity. What's under the hood. What dependencies, maintenance, operational overhead it creates.
4. **Profit** — specifically how this benefits the user (cost saved, time saved, revenue unlocked, risk reduced). Numbers if possible.
5. **Risk / downside** — what could go wrong, what technical debt is introduced, what future maintenance is required, what failure modes exist. Must be explicit — no hand-waving.
6. **Real-life narrative at scale** — describe a concrete day-in-the-life at THREE client counts: today (pre-launch, 1 sandbox tenant), at a milestone like 10 clients, and at 50 clients. What does the operator experience at each stage? What breaks first without this feature? What costs scale? What manual work replaces what? Not abstract numbers — actual narrative ("today I spend 20 min/day checking X; at 10 clients that's 3 hrs/day; at 50 clients one person does nothing but this all day").

**How to apply:**
- Applies to NEW features/systems/integrations — not to bug fixes or small patches on already-committed work
- Before any "I recommend building X" message, run the checklist above and present the full case structured with those 5 headers
- If any of the 5 answers is weak or unknown, say so explicitly — don't paper over uncertainty
- If there's any meaningful downside (maintenance burden, coupling, cost, unclear benefit), surface it clearly. User would rather skip than build blindly.

**Why:** User is a solo founder pre-launch. Every built thing is tech debt they'll maintain alone. Adding code you don't fully understand the reason for is pure downside — future time, future bugs, future cognitive load. User has been burned before by "good ideas" that became maintenance sinks. Only-upside decisions please him; partial-upside + unclear-downside decisions delay him.
