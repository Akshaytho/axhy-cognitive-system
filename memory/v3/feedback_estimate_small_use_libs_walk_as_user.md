---
name: estimate-small-use-libs-walk-as-user
description: Founder lock 2026-05-17 PM. Estimates should be honest about how small a slice actually is when libs already do the work. Walk every screen as the supervisor BEFORE shipping — tap every button, document what's broken or stubbed.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Estimate honestly + use libs aggressively + walk every screen as the user (locked 2026-05-17 PM)

**Rule:** When estimating a slice, ask "what does the lib do for me?" before quoting hours. If `expo-av` records audio and Whisper API transcribes it, that's a 1-2h slice — not 4-6h. Inflating estimates makes me defer slices that I should just ship. Also: BEFORE shipping a surface, walk every button on every R6 reference screen and document what's broken. Don't trust "Decisions tab built" until I've tapped through Dismiss, EMPLOYMENT confirm, refresh, empty state, etc.

**Why:** Founder said 2026-05-17 PM verbatim: *"why does whisper take 6 hr its adding api and converting voice to text only right ? and i dont think all screens in supervsior is completed click through each button in design and see whats missing even design is not fully completed right so at that time you need to think through and research online and add whats needed but not complex code at all for those you know we need easy code for scalable and upgradable thats why i told you to use packages lib dependencies already present codes etc."*

**Estimate rule:**
- Search the package ecosystem first. If `expo-av` + OpenAI Whisper REST + a 50-line hook lands voice capture, that's the slice — not a 6-hour platform abstraction.
- Estimates above 2-3h require a real reason (cross-cutting refactor, schema migration, multi-screen rewrite). Otherwise default to <2h and just ship.
- Use what's already in `package.json` first. Then npm packages with >10k weekly downloads + maintained-this-year. Only hand-roll when nothing fits.

**Walk-the-user rule:**
- Before claiming a tab "shipped", tap **every visible button**. Document the result:
  - PASS: does what R6 says it should.
  - STUB: button exists but does nothing on tap.
  - DRIFT: button does something different from R6.
  - BROKEN: throws an error or hangs.
- STUB and DRIFT items are real gaps; don't paper over them.
- Walk both the supervisor's flow AND the cross-persona observers' (worker / HR / admin) where they exist.

**Anti-patterns banned:**
- ❌ "Voice capture is 6h" when expo-av + Whisper API is <2h.
- ❌ "Activity tab shipped" when half the chips don't filter.
- ❌ "Drawer wired" when 7 of 8 items are no-op close.
- ❌ Custom abstractions when a lib + 30 lines of glue works.

**Compose with:** `feedback_simplicity_libraries_latest_versions` and `feedback_100_percent_r6_match_and_working`.
