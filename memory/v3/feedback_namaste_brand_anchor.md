---
name: Namaste is the brand-voice anchor
description: Profile/greeting copy uses "Namaste, {name}" regardless of UI language toggle — never switch to "Hi" or "Hello"
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
Greetings in Axhy v3 always start with **"Namaste, {name}."** — never "Hi", "Hello", or "Good morning". This holds even when the Language toggle is set to English.

**Why:** Founder locked it 2026-05-18 as a brand-voice anchor. Axhy is built for Indian cleaning companies; the cultural greeting is a deliberate signal of who the product is for. It's a marketing+UX choice, not an i18n bug.

**How to apply:**
- Don't conditionally swap the greeting based on `user.language` / `locale` / system locale.
- Greetings on Profile, Today eyebrows, Decisions empty-state, AI agent intros — all use "Namaste".
- Surface area: anywhere a human-name greeting is shown, this rule applies.
- If a panel member proposes "switch to time-of-day greeting" or "localise the greeting", reject — the founder has already decided.
- The QA-round3 walker flagged `g-profile/02-after-load.png` "Namaste, Suresh." while Language="English ›" — that's correct as-shipped, not a bug.
