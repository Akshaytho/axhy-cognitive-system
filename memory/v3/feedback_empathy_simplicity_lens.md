---
name: empathy-simplicity-lens-no-overengineering
description: Before designing any fix or feature, FEEL what the supervisor (or worker / HR / owner) actually wants from the surface — not what's interesting to build. Keep solutions simple; don't over-engineer; never make the supervisor work harder to understand the screen. If a problem needs complex design, defer and surface the question — don't ship complexity by default.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Empathy + simplicity lens (locked 2026-05-18)

**Rule:** Before every fix, feature, or design choice, run two checks in order:

1. **Empathy check** — what does the actual user (the persona this screen belongs to: supervisor / worker / HR / owner / admin) WANT from this surface, right now, in their real environment (cracked-screen Redmi, Slow 3G, 5:48 AM, dog barking)? Not what's interesting to build, not what looks impressive in the panel. What does *they* need to see + tap + understand?

2. **Simplicity check** — is the simplest correct solution obvious? Ship that. If the only fix I can think of is complex, that's a signal the **problem** isn't well-understood yet — surface it as a question rather than ship complexity by default.

**Why:** Founder said 2026-05-18 verbatim: *"yes cotinie if you find any thing not working buikd them but dont over eingineeer or make them complex only build easy logic ones if not designed ok. dont misunderstand what user wants ok make it hard for him to understand never do that . feel the user how you understad all this adat right tru to feel what users wants when doing anything ."*

The failure patterns this prevents:
- **Over-engineering**: Sprint 1's W1 subagent shipped a PUBG-style multi-worker broadcast with `groupId` + Postgres advisory locks + partial unique indexes + sibling-expire compensators. Real product call: single-recipient invite. Most of that machinery was complexity nobody asked for.
- **Confusing the user**: Drawer entries showing "23 rules · 12 aliases · 8 site notes" when the user has zero rules — the *developer* understood "those are placeholder numbers" but the *supervisor* read it as truth and lost trust.
- **Misreading intent**: "Build me a 30-day sim" → I built code reviews + parallel subagents + done-memos instead of WALKING THROUGH AS SURESH for 30 minutes. The founder wanted to USE the app; I optimised for shipping code.

**How to apply:**

**Before ANY fix or feature:**
1. **Name the persona.** Not "the user" — the specific one. *Suresh Yadav, 34, supervisor, west Hyderabad, Redmi Note 11 cracked screen, 38 workers across 10 sites, opens app at 5:40 AM during the muster ping.* If I can't name the persona, I can't design for them.
2. **State what they want from THIS surface in ONE sentence.** Not "manage their day" — that's the whole app. For Today: "see who's not coming + send a cover before HR notices." For Decisions: "approve / reject the 2-3 things HR wants from me this hour." For Chat: "say the thing out loud, let AI figure out which screen to update."
3. **Design the minimum that delivers that sentence.** Anything beyond that is over-engineering.

**Three concrete tests every change passes:**

- **One-glance test:** If Suresh's eyes hit this screen for 1.5 seconds, can he decide what to do? If no → simplify.
- **One-thumb test:** Can the primary action be tapped without changing hand grip? (He's riding an Activa.) If no → relocate.
- **One-word test:** Can the headline copy be understood by a worker with class-8 English? If no → rewrite to a simpler verb + noun.

**Anti-patterns I keep falling into:**

- ❌ "Let me add a configurability option" — supervisors don't configure. They tap and move on.
- ❌ "Let me show all the metadata" — too much info IS confusion. Pick the one number.
- ❌ "Let me design for the edge case first" — design for the 95th-percentile case; cover the edge as an error message only when it fires.
- ❌ "This needs a state machine" — most flows are 2 stages, not 6. State-machine when there are genuinely 4+ branching states.
- ❌ "Let me add Reanimated worklets for buttery animation" — RN's built-in `Animated` is plenty for a 2-min countdown. Save Reanimated for genuine 60fps requirements.
- ❌ "Let me write a config doc explaining this" — if I need a doc to explain a feature's UX to the next dev, the UX is too complex. Simplify the UX.

**Anti-patterns the FOUNDER keeps catching me on:**

- "I see big bugs you know" → 28 bugs the QA walk would have caught in 5 minutes. I had built without using.
- "Each screen taking more than 10s why that lag" → I shipped backend code in a transaction wrapper that serialised parallel queries. The supervisor sees 12s spinners. Real-user empathy would have caught this on first navigation.
- "Cant get OTP" → backend was fine; mobile env pointed at stale LAN IP. A real walkthrough on day-zero would have caught it.

**Composes with:**
- `feedback_walk_every_screen_as_real_user_before_founder.md` — empathy means walking the surface myself first.
- `feedback_make_it_exist_dont_defer.md` — but only build what the persona actually wants; "make it exist" is not license to overbuild.
- `feedback_visual_first_minimal_text.md` — same family; icons + thumbnails + big numbers, not jargon.
- `feedback_design_quality_bar.md` — Linear / Vercel / Uber tier means EMPATHETIC + simple, not feature-rich.

**Scope:** Permanent. Every fix, every feature, every comment, every error message goes through this lens.
