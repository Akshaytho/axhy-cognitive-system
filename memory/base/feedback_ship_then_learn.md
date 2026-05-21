---
name: Ship the product, then let real customers drive features
description: Hard rule to stop building speculative features pre-launch — only fix bugs that block shipping, and add features only after a real customer asks for them
type: feedback
originSessionId: 347b6c25-58bd-48ad-b5ea-b9afb772c022
---
**The rule:** until the product has real paying customers, the only work that ships is:

1. **Bugs that make existing features unusable** (crashes, data loss risk, broken flows)
2. **Security + retention** (auth, FK rules, GDPR path, audit log)
3. **Store submission** (iOS/Android builds, metadata, screenshots, review readiness)
4. **Launch infrastructure** (monitoring, alerting, backup, billing)

Do NOT build:
- Features "I imagine customers will want" (site date ranges, contract storage, leave balance tracking, probation periods, custom SLAs, client-facing PDFs, etc.) — **even when they sound obviously useful**
- Admin-side workflows that haven't been blocked in real usage yet
- Analytics dashboards before there's data worth analyzing
- AI capabilities beyond the core verification that's already working

**Why:** 2026-04-15, user self-corrected mid-session: "yes i thought we are rushing i think we need to ship the product and get customer and let them use it and improve according to needs right we create features if they dont use its waste of time and complexity increases more." This is the classic YAGNI failure mode for a pre-launch solo founder — adding complexity based on imagined needs makes the codebase harder to maintain and delays shipping, without improving outcomes. A feature that nobody uses is worse than no feature at all because it still needs maintenance forever.

**How to apply:**
- Before proposing any new feature, ask: is this a bug, security issue, launch blocker, or speculation?
- If it's speculation, SAY SO and ask whether to defer
- When the user mentions "I also forgot X", pause and ask whether it's blocking the demo/launch or just a nice-to-have
- Keep a running "post-launch wishlist" in memory so ideas aren't lost, but don't touch the code
- Default response to new feature ideas: "let's wait until a real user asks for it"

**What still counts as work to do now:**
- Fixing bugs in already-shipped flows
- iPhone end-to-end verification
- App Store / Play Store submission prep
- Monitoring + alerting so we catch launch issues
- Final security audit

**What doesn't:**
- Site start/end dates (proposed today, deferred)
- Reactivate buttons for workers/supervisors (nice-to-have, not blocking)
- Contract storage (already decided OUT)
- Any new feature found during future audits unless it's actively breaking something
