---
name: single-tenant-model-resign-anonymise
description: Founder lock 2026-05-18. One ACTIVE Membership per user at a time. Resignation anonymises the record. Re-registration on the same phone number creates a NEW user (no carry-over). Multi-tenant switching is permanently closed.
type: project
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Single-tenant model + resign-and-anonymise (locked 2026-05-18)

**Decision:** A supervisor / worker / HR user belongs to exactly ONE company at any moment. When they leave (resign / quit / fired), the Membership and User identity are anonymised. If the same person joins again (even on the same phone number), they are registered as a **new User** with a new id. Their prior anonymised record is NOT linked.

**Why:** Founder said 2026-05-18: *"for now we close that multi tenant path so when they resign we will anonomise them ok so when they come again we re register them newly so no multiple working companies at same time .see i think that logic is complex so thats why i said if not you can build it carefully."*

Multi-tenant switching (one user, multiple active companies) is operationally complex and not needed for the launch market (Indian cleaning companies, where most supervisors work for one cleaning operator at a time). The simpler model also makes DPDP compliance easier — anonymisation on exit is a clean operation, not a "remove from this tenant but keep alive in another" puzzle.

**How to apply:**

**Schema:**
- `Membership.status` enum stays. Add or use existing values: `ACTIVE` / `RESIGNED` / `ANONYMISED` (pick the closest existing terminology — check `prisma/schema.prisma` for what already exists).
- Invariant: AT MOST ONE `Membership` per `userId` with `status = 'ACTIVE'`. Enforce via DB partial unique index if not already there.
- When a user resigns:
  - Mark Membership row `status = 'RESIGNED'` (keeps audit trail of who worked where).
  - Anonymise the User row: `name = '(former member)'`, `phone = 'anon:<hashed-old-phone>'`, `locale` cleared. Keep `id` so audit history doesn't dangle.
  - Emit `USER_RESIGNED` AuditEvent.
- On new OTP for a previously-anonymised phone: create a brand-new User row (new id). DO NOT link to the anonymised one.

**Backend routes:**
- `POST /me/resign` — requireAuth + tx. Resigns the caller. Returns `{ ok: true }`. Mobile then clears tokens + onAppLogout + redirects to phone-login.
- OTP-request path: when looking up "does this phone exist?", IGNORE anonymised User rows (their phone is the `anon:...` hash now, so they won't match the new lookup anyway — but be explicit).

**Mobile:**
- Profile tab: REMOVE the "Switch Company" section entirely. Drop the `/auth/switch-company` reference and the honest-"Coming soon" copy that was there.
- Profile tab: ADD a "Resign / Leave company" button at the very bottom (under Sign out), styled destructive (`tokens.color.semantic.bad`). Confirmation modal: typed-phrase "RESIGN" before the POST fires. Body copy explains: "Your record will be anonymised. You can re-register on this number later but it will be a fresh start with no history."
- After successful resign: `onAppLogout()` → `router.replace('/(auth)/phone')`.

**Anti-patterns this rule kills:**
- ❌ Multi-tenant switch UI (no longer exists).
- ❌ Trying to "rejoin" an anonymised account on re-register — it's a new user, period.
- ❌ Linking historical Attendance/Visit rows to the new User on re-registration (they stay attached to the anonymised id).

**Compose with:**
- `feedback_supervisor_no_visit_mark_button` (the "trust the workflow" school).
- DPDP-anonymisation pattern already in `feedback_data_retention_forever.md` (anonymise rather than delete for audit-trail integrity).
