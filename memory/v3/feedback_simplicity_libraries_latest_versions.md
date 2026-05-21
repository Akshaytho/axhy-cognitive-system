---
name: simplicity-libraries-latest-versions
description: Prefer simple code over clever code. Use well-maintained libraries / packages / dependencies before writing custom code for the same job. Latest stable versions only — no deferred, no old versions, no half-supported betas unless explicitly approved. Search online for the best approach before designing one in-head. Test all types so nothing breaks for real users.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Simplicity + libraries + latest versions (locked 2026-05-17 PM)

**Rule:** Before writing custom code, check if a well-maintained library, package, or dependency already does the job. Prefer the ecosystem solution unless there's a real reason not to (license clash, footprint blowup, an actual security concern). When code is needed, write the simplest form that works — complex code for small (or big) things is a code smell. All dependencies stay on the latest stable version; never pin to deferred or old versions.

**Why:** Founder said 2026-05-17 PM verbatim: *"if needed search online and follow best possible solutions only no over enginering no complicated path , no wrirting complex code just to get small things or big things this product i have seen it doesnt need to make it complicated while wirit gcode search online for solutions and make complex code simple and easy use libs , dpeendcies , packages availanle in online and reduce the code while wrirting code and use ipdated versions only no deffered or old versions."* This is a strategic call: the product wins by shipping the right shape fast — not by inventing primitives that already exist in the npm ecosystem. Custom code is liability; mature libs are leverage.

**How to apply:**

**Before writing code:**
1. **Ask: is there a library that does this?** Search npm, github, official Expo / React Native / Fastify ecosystems. Examples worth knowing:
   - Sheets / modals on RN web → `@gorhom/bottom-sheet` (native) + RN `Modal` (web).
   - Pull-to-refresh → built-in RN `RefreshControl`.
   - Skeleton loading → `expo-skeleton-loader` or `moti` keyframes.
   - Date helpers → `date-fns` (already in tree if used; check) over hand-rolled.
   - Forms → `react-hook-form` over hand-rolled state.
   - State → `@tanstack/react-query` for server state (already in tree).
   - Charts → `victory-native` or `react-native-svg-charts`.
   - Toasts → `react-native-toast-message` or `sonner-native`.
2. **If yes**: use it (latest stable version). Pin to `^x.y.z` or `~x.y.z` per project convention.
3. **If no, or the lib is over-kill for one screen**: hand-roll, but minimize lines.
4. **Reduce code while writing.** Prefer one-liner expressive forms over 30-line procedural unless it hurts readability. Less code = fewer bugs.

**Latest stable versions only:**
- Every `package.json` dep gets the current stable release. No `pnpm add foo@1.x` when 2.x is GA.
- Pinned old versions need an explicit comment with the reason (peer-dep conflict, known regression in newer version, etc.).
- Run `pnpm outdated --recursive` periodically; surface drift before it grows.

**Anti-patterns banned:**
- ❌ Hand-rolling a state machine when xstate already covers it.
- ❌ Hand-rolling a debounce when lodash.debounce / use-debounce exist.
- ❌ Reinventing `Promise.allSettled` semantics with hand-rolled `try/catch` loops.
- ❌ A 50-line custom hook when 10 lines of `useQuery` would do it.
- ❌ Beta / RC versions of core libs without a written reason.
- ❌ Old versions silently lingering because "if it ain't broke."

**Testing all types so nothing breaks for real users:**
- **Typecheck** — `pnpm typecheck` clean.
- **Lint** — `pnpm exec eslint` clean (including `axhy/require-derives` etc.).
- **Unit / pure-function** — Vitest for derivations, helpers, pure logic.
- **Integration / real-DB** — Vitest against Railway sandbox (no mocks for service-layer or route tests).
- **E2E visual** — Playwright (mobile viewport) against the deployed backend; capture screenshots; READ them myself per `feedback_visual_verification_not_curl.md`.
- **Water-flow / real-life scenarios** — walk the scenarios doc end-to-end; PASS/FAIL each scene.
- **Cross-persona ripples** — verify the worker / HR / admin side observes what the spec says (where the surface exists; mark DEFERRED where it doesn't).
- **Scale** — measure p95 latency at the 2K-worker scenario floor.

If a verification cannot run in the current environment (e.g., a flow needs the un-built worker mobile), mark **DEFERRED** with the unmet precondition. Never pretend.

**Search-online policy:**
- When unsure of best practice: search before coding. Pattern: "react native expo web bottom sheet 2026" / "fastify route 410 gone best practice" / etc.
- Bring the named source back into the commit message or doc when adopting (e.g., "per `@gorhom/bottom-sheet` v5 docs, web fallback uses RN Modal").

**Scope:** Every code change forward. No exceptions for "just this small thing."
