---
name: Verification rules (consolidated)
description: Visual verification before founder sees UI. Playwright + panel critique. Walk every screen as real user. Deploy verification via actual bundle. Never accept "can't from CLI." Expo Fast Refresh + Playwright together. Merged from 6 files.
type: feedback
---

# Verification Rules (6 locks consolidated)

## 1. Visual verification, not curl
Never give the founder a UI screen blind. Before any "go look at this URL": boot the surface, navigate as a real user, capture screenshots, READ them yourself. curl/API tests/response-shape/bundle-grep are NOT visual verification.

## 2. Playwright + panel critique before founder
After visual change deployed: (1) capture screenshots via Playwright at mobile 390x844 + desktop 1280x800, (2) read every screenshot yourself, (3) run 4+ voice panel critique (Aditya/Sara/Megha/Priya/Karthik), (4) categorize findings Tier 1/2/3, (5) fix Tier 1 + re-screenshot + re-panel until "ship to founder", (6) only then surface URLs.

## 3. Walk every screen as real user
Before showing founder any surface, personally walk it screen-by-screen as the target persona via Playwright (`scripts/devtools-capture/`). Tap every button, scroll every list, watch every loading state. Log every bug. Cluster by root cause. Fix at root. THEN show founder.

**Hard rule:** Never "tell me what you see on your phone" before I've done the same walk myself. Founder is NOT the first human user.

## 4. Deploy verification via actual bundle
Before claiming "Phase X is live": (1) curl the production URL, (2) extract CSS/JS bundle path, (3) curl the bundle, (4) grep for the specific change expected. HTML title alone is not sufficient — old deploys can serve new titles with old CSS.

## 5. Never accept "can't from CLI"
"Live server not reachable" / "DevTools screenshots pending" / "browser not available" is a giving-up answer. Playwright drives real Chromium headlessly — captures network, console, perf traces, computed styles, everything DevTools does via CDP. Web-search for the 2025-current tool before accepting any limitation. If a tool doesn't exist, write it.

## 6. Expo Fast Refresh + Playwright together
During mobile UI dev, run BOTH: (1) Expo dev server with Fast Refresh for live hot-reload iteration, (2) Playwright for systematic flow capture when "done." Don't use Playwright alone in batch mode — miss live-interaction issues (hover states, animation jank, loading flicker). Don't skip Fast Refresh for "speed."
