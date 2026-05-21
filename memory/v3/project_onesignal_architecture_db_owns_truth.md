---
name: OneSignal architecture rule — DB owns truth; OneSignal owns push transport
description: Locked 2026-05-16 with v8 plan. Our Notification table is the source of truth for notification history, audit trail, unread/read state, and in-app panel. OneSignal owns push subscription plumbing and delivery transport only.
type: project
originSessionId: 5f823f24-0cb4-45a4-b955-4b6761916b4a
---

# OneSignal architecture rule (locked 2026-05-16 with F-007 v8 plan)

**Rule:**

- **Our DB owns truth, audit, unread/read history, app notification panel.**
- **OneSignal owns push subscription plumbing and push delivery transport.**
- **Future grouping/coalescing stays read-side (UI aggregation) or send-time (digest job), NOT write-side.**

**Why this rule exists:**

Owner chose OneSignal as the managed push provider for F-011 (replacing the original FCM/Expo direct-integration plan). The rule separates concerns:

- Notification persistence + idempotency + audit = our DB. F-007 writes one immutable Notification row per (source event × recipient × channel × site).
- Push transport (FCM under the hood for Android, APNs for iOS, OneSignal manages both) = OneSignal. F-011 adapter calls OneSignal REST API with `external_id = User.id`.
- App notification panel (F-006) reads from OUR Notification table, NOT OneSignal's "in-app messages" feature. OneSignal in-app messages are useful for marketing pop-ups, not for our product-native notification inbox.

**Concrete implications:**

1. **No raw push-token storage on our side.** The earlier plan to add `pushToken` / `pushPlatform` / `tokenUpdatedAt` columns to `Device` is DROPPED. OneSignal SDK manages subscription/token lifecycle end-to-end.
2. **`external_id = User.id` (UUID).** Tenant-scoped via User.companyId FK. Stable across reinstalls. F-011 calls `OneSignal.login(external_id)` on every identified app open / login.
3. **Push reachability is checked at dispatch time, not at write time.** F-007 writes a `push` row for every user-backed recipient (recipient has a derivable User.id). F-011 adapter inspects OneSignal subscription state immediately before dispatch and stamps a typed `failureReason` if unreachable.
4. **`failureReason` enum (round-1 behavioral contract, locked v11):**
   - Terminal: `'no_active_subscription'`, `'recipient_inactive'`, `'recipient_removed'`.
   - Transient: `'rate_limited'`, `'provider_error'`, `'network_error'`.
   - `'expired_token'` is reserved for future use; not emitted in round 1.
5. **Pricing is a business concern, not architecture.** OneSignal billing is per active mobile subscription (1 user × 2 devices = 2 MAUs). Free/Growth/Professional tier boundaries are commercial details that can change. Verify current OneSignal billing before go-live and at every scale-up decision. Do NOT lock specific MAU thresholds into the architecture artifact.
6. **`Worker.userId IS NULL` recipients have no user-visible delivery path** via F-007/F-011/F-006 (no derivable `external_id`; push row skipped; in_app_banner not reachable until a user-backed worker app/login exists). Real resolution: F-012 SMS via `Worker.phone` (paid) OR a future user-creation/login flow.
7. **Provider-lock risk is contained.** F-007 persistence is provider-agnostic — if OneSignal is ever swapped, only F-011's thin adapter changes. The DB-as-source-of-truth design means we own the notification history regardless of provider.

**Slice mapping:**

- **F-007** (this slice): Notification persistence + audience resolution. Provider-agnostic.
- **F-011** (queued): OneSignal mobile SDK install + identity linking (`OneSignal.login(external_id = User.id)`) + push delivery adapter + delivery-time `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit emit + pre-dispatch eligibility re-check (User active? + OneSignal subscription count ≥ 1?). 6-value `failureReason` enum.
- **F-007b** (queued, optional): supervisor burst-grouping digest. Send-time aggregation if F-006 UI grouping proves insufficient.
- **F-006** (queued): our own in-app notification panel / banner consumer / unread-read state / supervisor-burst grouping UI — backed by OUR Notification table, NOT OneSignal in-app messages.
- **F-012** (queued, AWAITING_OWNER_GO_ON_PAID_CHANNELS): SMS + WhatsApp adapter (paid). Primary use: deliver to `Worker.userId IS NULL` recipients via `Worker.phone`.

**Anti-patterns (do NOT do these):**

- ❌ Mirror raw FCM/Expo tokens locally on Device. OneSignal owns the subscription lifecycle.
- ❌ Use OneSignal in-app messages as the notification panel. Our DB + F-006 own that.
- ❌ Compute or store push reachability at F-007 write time. F-011 adapter inspects at dispatch.
- ❌ Lock MAU pricing thresholds into the architecture artifact. Pricing is verified separately.
- ❌ Add a "is this user logged out?" check anywhere. The unobservable question is logout-state; the observable + actionable question is "any active subscription right now?" (covered by `no_active_subscription` enum value).

**Related memory + canonical sources:**

- [feedback_re_derive_from_invariants_not_patch.md](feedback_re_derive_from_invariants_not_patch.md) — Rule C; F-007 v7 reset locked this architecture.
- F-007 v11 plan at `/Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md`.
- F-007 scope artifact at `axhy-v3/handoff/feature-queue/scopes/F-007.md` (post-implementation).
- Future F-011 / F-006 / F-007b / F-012 INDEX entries at `axhy-v3/handoff/feature-queue/INDEX.md`.
