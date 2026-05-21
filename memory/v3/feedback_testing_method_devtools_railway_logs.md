---
name: testing-method-devtools-and-railway-logs
description: When verifying v3 supervisor mobile / Expo web UI use Chrome DevTools inspect. When verifying v3 backend behaviour use Railway logs. Compose with the confidence-score rule before any decision.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Testing method: DevTools for UI, Railway logs for backend, confidence score before decisions (locked 2026-05-18)

**Rule:** For v3 work, the canonical verification surfaces are:
- **UI / Expo web** → open in Chrome, use DevTools (Elements + Console + Network + Application/Storage). Faster and more accurate than screenshot-only Playwright runs because you see live state, props, requests, and runtime errors.
- **Backend** → Railway logs (`railway logs --service Eclean_future`, or the Railway dashboard). Faster and more accurate than curl + grep because you see request flow, prisma queries, and crashes in real time.
- **Anything better than this is allowed.** If a faster/more-accurate method exists for a specific check (e.g. React DevTools profiler for perf, Reactotron for state, RN debugger for native bridge), use it. The above are the defaults.

**Confidence score before deciding:** Before any non-trivial change or recommendation:
1. State a confidence % that the change works as intended for *every* type of user who will hit it (supervisor + worker + HR + owner + supervisor-on-different-tenant + the supervisor's first-login state + the supervisor-after-anonymise state).
2. ≥90% on own knowledge → execute.
3. <90% → search online (recent articles, GitHub issues, SDK changelogs, Stack Overflow last 12 months), analyse, raise to ≥95% before executing.
4. Compose with `feedback_confidence_score_before_acting.md` (legacy v1/v2 memory but still load-bearing).

**Why:** Founder said 2026-05-18 verbatim: *"when tetsing ui google dveloper inspect for ui and logs for railway backend ans you will move fast and accurate and 100 % right ... and if anything is needed find in online underatand and analyse and see confienece score of it works in my app with evryone who uses it before making desciosns by yourself think of this and have condienece score and execute your new chnages when needed"*

Past failures this prevents:
- Playwright-only verification missed the `window.addEventListener` runtime crash because the test viewport was web (had DOM) — DevTools console on a real iOS bundle would have caught it instantly.
- curl-only backend verification missed prisma N+1 patterns and rate-limit edge cases that show up only under real request flow visible in Railway logs.
- "It probably works on mine" decisions shipped without considering: anon-prefix users, first-login users, role-switched users, locale-Hindi users. Confidence-score forces enumerating the user population.

**How to apply:**

**Before making a UI change — full DevTools playbook (founder 2026-05-18: *"if you can use all of it features we can succeed"*):**

Use every relevant DevTools surface, not just Elements + Console. Each surface answers a *different* question, and skipping any of them is how regressions slip through.

**1. Elements** — layout / accessibility / event-listener questions.
- Live-edit CSS to test fix candidates without reloading.
- "Computed" tab to see why a style won (cascade resolution).
- "Event Listeners" on a node to verify onPress wired correctly.
- "Accessibility" tree to confirm screen-reader labels (matters for Play Store accessibility).
- "Layout" tab for flex / grid debugging.

**2. Console** — runtime errors + live introspection.
- `$0` = currently selected DOM node; `$_` = last expression value.
- **Live Expressions** (pin button) — keep `document.title`, a counter, or a query-cache snapshot visible without re-typing.
- `monitor(fn)` to log every call to a function.
- `queryObjects(Constructor)` to find leaks.
- Filter by source / level / regex.
- "Preserve log" before any nav-heavy bug hunt.

**3. Sources** — debugger, not console.log.
- **Logpoints** (right-click line number → "Add logpoint") drop a console.log without editing code — disappear on next reload.
- Conditional breakpoints to stop only when `worker.status === 'NO_SHOW'`.
- XHR/fetch breakpoints to pause on every `/supervisor/today` request.
- Event Listener breakpoints (pause on `touchstart`, `click`, `popstate`).
- "Snippets" for reusable scripts (e.g. force-logout, fast-forward clock, dump React Query cache).
- Workspace folder → map local source to served files for direct edit-in-DevTools.

**4. Network** — request-level truth + failure simulation.
- Throttle to **Slow 3G** and **Offline** to verify skeleton / retry / error states. Real Indian supervisors are on patchy networks; "works on Mac WiFi" is meaningless.
- **CPU throttling** under the Performance panel: 4×–6× slowdown emulates a ₹8k Android. Catches jank a Mac never sees.
- "Block request URL" → simulate `/supervisor/today` 500ing.
- "Replay XHR" → re-fire a request without page reload.
- Initiator chain → trace why a request fired.
- Copy as cURL / fetch / HAR for backend repro.

**5. Performance** — real frame data.
- Record while scrolling Today/Activity/Decisions. Look for >50 ms tasks on the main thread (the red triangles) and frame drops in the fps strip.
- Verify each new screen at 4× CPU throttle stays at 60 fps. If it dips, fix before merge — see `feedback_play_store_quality_no_lag_no_jank.md`.

**6. Memory** — leaks.
- Take a heap snapshot → switch tabs 20× → take another → compare retained size. Anything growing unboundedly is a leak.
- "Allocation instrumentation on timeline" while interacting → spot per-tap leaks.

**7. Application → Storage** — session / identity state.
- `localStorage`: SecureStore web fallback (JWT, locale, push-prompt state).
- Edit values live to test edge cases: expired token, missing tenant, wrong role, first-launch user. Faster than rebuilding state.
- "Clear site data" → reset to first-launch in one click.

**8. Rendering panel** (Cmd+Shift+P → "Show Rendering").
- "Paint flashing" → see needless repaints.
- "Layout shift regions" → catch CLS during loading.
- "Frame rendering stats" → live fps overlay.
- "Emulate CSS media" — `prefers-reduced-motion`, `prefers-color-scheme`, forced-colors. Verify a11y on real device profiles.
- "Emulate vision deficiencies" — color-blind + low-vision simulators.

**9. Device toolbar** (Cmd+Shift+M).
- iPhone-mini (390×844) is canonical. Also test Pixel 5 (393×851), Galaxy S22 (360×780), iPad mini.
- Touch emulation + sensor simulation (geolocation override = simulate worker at site).

**10. Lighthouse** — score every supervisor screen for Mobile / Performance / Accessibility / Best Practices. Track scores commit-to-commit.

**11. Coverage** (Cmd+Shift+P → "Coverage") — find unused JS bytes, trim bundle for Play Store install size.

**12. Issues panel** — auto-feed of deprecations, mixed content, broken cookies, A11y violations. Glance every PR.

**13. Recorder** (Cmd+Shift+P → "Recorder") — record a real supervisor flow once, replay it after every fix; export to Playwright as needed.

**14. Command menu (Cmd+Shift+P)** — the discoverability shortcut. If unsure which panel, type the keyword (e.g., "throttle", "block", "snapshot").

Take a screenshot of the DevTools surface that proved the fix, not just the rendered output.

**Before making a backend change:**
- Hit Railway dashboard or `railway logs --service Eclean_future -n 200`.
- Trigger the action from the mobile (or curl) and watch the log stream.
- Look for: prisma query count, response time, rate-limit hits, error stacks, auth gate decisions.
- Note pre/post log diff in any commit message that touches request handling.

**Before any decision:**
- State: "Confidence X% this works for: supervisor / worker / HR / owner / anon-prefix-user / first-login / Hindi-locale / network-flaky."
- If <90% on *any* of those personas, research that persona's path before deciding.
- If a recommendation comes from web research, label it: "Confidence 95% per <source URL>, last verified <date>."

**Scope:** Permanent. Applies to every v3 task that involves verification, debugging, or a non-trivial decision.

**Composes with:**
- `feedback_confidence_score_before_acting.md` (v1/v2 memory) — the original rule.
- `feedback_production_grade_workflow_rules.md` — P-rules also assume verification before merge.
- `feedback_playwright_panel_review_before_founder.md` — Playwright still gates founder-visible renders, but is NOT the primary debug surface; DevTools is.
