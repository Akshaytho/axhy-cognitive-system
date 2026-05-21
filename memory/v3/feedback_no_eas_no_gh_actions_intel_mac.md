---
name: no-eas-no-gh-actions-intel-mac
description: Mac is Intel. No EAS native builds, no GitHub-Actions-based mobile build pipelines. Mobile dev/test loop is Expo Web + Playwright + mobile viewport, pointed at deployed Railway backend.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# No EAS / no GitHub-Actions builds; Playwright + Expo Web only (locked 2026-05-17 PM)

**Rule:** All mobile development and testing runs through Expo Web + Playwright on the Intel Mac. Do not invoke `eas build`, do not propose a GitHub Actions workflow for mobile builds, do not propose Xcode/Android-Studio native builds. The dev loop is local-only for code execution; the **backend** under test is the deployed Railway service.

**Why:** Founder said 2026-05-17 PM: *"feel r6 design as a human and supervsior and see thought playwright +expo fast dont go building eas build dont ok no eas or github because my mac is intel so dont waste time only use rhis both playwright and expo fast and mobile view in them."* Intel-Mac native toolchain (EAS, Xcode simulators) is slow / hits arch mismatches; Apple Silicon's the supported target. Pretending otherwise wastes hours.

**How to apply:**
- Mobile feature dev: `pnpm --filter @axhy/mobile web` → opens Expo Web bundler. Edit code → Fast Refresh.
- Mobile feature test: Playwright headed or headless against `http://localhost:8081` (or whatever the Expo Web port is), with mobile viewport set (e.g. `viewport: { width: 390, height: 844 }` for iPhone 13/14 mini-ish).
- Backend under test: the **deployed** Railway URL — NOT a local Fastify dev server — once we're verifying production-class behavior. Local dev server is fine for in-loop iteration but production verification must hit the deployed API.
- Composes with `feedback_expo_fast_refresh_plus_playwright.md` (2026-05-09) — that rule said Playwright + Expo Fast Refresh together is the human-style flow; this rule adds the Intel-Mac constraint that rules out the alternative paths.
- If a feature truly needs native (camera, push notifications, file system), surface as a blocker — don't silently switch to EAS.
