---
name: make-it-exist-dont-defer
description: Founder lock 2026-05-17 PM. When a feature R6 specifies "doesn't exist yet" in my codebase, the answer is to BUILD it now (so the scenario passes), not to mark it DEFERRED. Use parallel subagents to ship multiple slices at once.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Make it exist, don't defer (locked 2026-05-17 PM)

**Rule:** When the gap audit or scenarios verification says "DEFERRED because the surface doesn't exist," the default response is to **build the surface now**, not to keep deferring. Use parallel Sonnet subagents to ship multiple slices at once. The 100% R6 match + 100% scenarios PASS bar is reached by closing gaps, not by counting them.

**Why:** Founder said 2026-05-17 PM: *"yaa continue with work use parallel agents and multi agents and do fatsly continue follow whatever were discussed dont ignore because something doesnt exist make them exist and finish the work."* My prior pattern was to honestly mark DEFERRED and stop. The founder wants me to instead pick up the work and build the missing pieces. DEFERRED was an honest status; it shouldn't be a permanent stopping point.

**How to apply:**
- When a slice is DEFERRED because a downstream surface is missing (Drawer / MicFAB / Decisions read API / language picker / etc.), check if the missing piece can be built in ~1-3h. If yes, **build it**.
- When the missing piece is bigger (worker mobile shell, HR portal, cron job system), surface it explicitly with an estimate and a clear ping for "should I start this now?"
- Use parallel subagents for independent slices. Per `feedback_use_skills_and_cheaper_models_efficiently`, dispatch 3-5 Sonnet subagents in parallel for mechanical/well-scoped work with clean file-boundary ownership. Avoid conflicts by partitioning at the file level.
- Verify each subagent's output: typecheck, lint, screenshot, side-by-side compare to R6 before claiming done.

**Compose with:**
- `feedback_100_percent_r6_match_and_working` — 100% bar still applies.
- `feedback_dont_claim_match_without_side_by_side` — each new surface gets a side-by-side verification.
- `feedback_real_life_scenarios_before_implementation` — when adding a surface, walk the relevant scenes for actual PASS evidence.
- `feedback_simplicity_libraries_latest_versions` — use libs (Feather icons, react-native-modal, etc.) before hand-rolling.

**Scope:** Forward. No more "DEFERRED because precondition missing" as a stopping point — instead, build the precondition and verify the dependent scene.
