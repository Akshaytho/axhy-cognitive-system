---
name: Must-do items before or just after launch
description: Deferred infrastructure work that is non-negotiable for production stability — flagged by user on 2026-04-20 to track explicitly
type: project
originSessionId: 1a4c25f5-30c9-4353-94d6-883d107148a7
---
Things user has explicitly flagged as "will do, not optional" but deferred for now. Track these so they don't get lost.

### 1. Multiple backend replicas on Railway (zero-downtime deploys)

**Status:** Deferred to before or just after launch. User: "multiple replicas is important and we will do before release or after release ok but we need to do that definitely" (2026-04-20).

**Why:** Single-instance backend has a 30-60s downtime window on every Railway deploy. Worker check-ins during that window fail. At current scale (testing) this is tolerable; at launch it causes visible outages to workers/clients during any deploy.

**Fix shape:** Run 2+ Fastify replicas on Railway. Railway rolls them one at a time → zero downtime deploys. Cost: ~2x the current backend hosting (~₹2000/mo → ~₹4000/mo).

**How to apply:** When planning launch runway, add this as a required sprint item. Don't let it slip past launch + week 2.

### 2. MSG91 delivery webhook (deferred)

**Status:** Explicitly deferred on 2026-04-20. User: "leave msg91 wiring for now".

**Why we'd eventually want it:** MSG91 sends a delivery-confirmation webhook when an SMS actually reaches a phone. Without it, we can't distinguish "SMS queued to MSG91" from "SMS actually delivered to the worker's phone." Worker whose phone was offline at notification time shows as "notified" in our system but never got the push.

**How to apply:** Not a pre-launch blocker. Revisit post-launch if we see "I never got the OTP/notification" reports from workers.
