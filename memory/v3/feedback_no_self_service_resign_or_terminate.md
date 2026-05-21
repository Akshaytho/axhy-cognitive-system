---
name: no-self-service-resign-or-terminate
description: Founder lock 2026-05-18. No worker-facing app ever has a self-service "Resign" / "Terminate myself" / "Quit" button. Termination always flows through HR. The app exposes the OUTCOME (you've been removed) but never the trigger.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# No self-service resign / termination buttons in worker-facing apps (locked 2026-05-18)

**Rule:** No supervisor / worker / HR / owner app exposes a "Resign" or "Terminate myself" button. Termination always originates from HR (or owner-level admin) via the HR / admin surface. The supervisor's mobile app exposes only:
- The **outcome** (e.g. when HR has removed them, their next login shows "Your account has been removed by HR.")
- Sign out (session-level only, not destructive).

No exception. The previous "Resign" button I'd built was a real-world product mistake — companies don't ship that.

**Why:** Founder said 2026-05-18 verbatim: *"what resign button think like a company bro will anyone provide such button its goes from hr right."* Self-service termination is alien to how cleaning companies (or any service org) actually operate. A supervisor doesn't fire themselves through an app — they tell HR, HR processes it. Showing a Resign button on the supervisor's app:
- Confuses the workflow (workers think they can quit by tapping a button).
- Creates a destructive action surface where one accidental tap (even with typed-phrase confirm) can wipe their record.
- Doesn't match the mental model of any product in the market (Zomato delivery partner app doesn't have "Fire myself"; Uber driver app doesn't either).

**How to apply:**

**Where termination originates:**
- HR portal: `POST /memberships/:id/terminate` (or whatever the HR-side route ends up being). HR user with appropriate role calls it.
- Backend service runs the anonymisation logic (the same logic that was behind /me/resign — just triggered by HR, not by the user themselves).
- AuditEvent kind is `MEMBERSHIP_TERMINATED_BY_HR` or similar (HR is the actor, not the worker).
- The terminated user, on next OTP login, sees an honest message: "Your account has been removed by {Company}." with a contact-HR line. They do NOT see the supervisor app surface.

**Where it does NOT originate:**
- Supervisor mobile Profile — no Resign button, no "Leave company" button, no "Quit" link.
- Worker mobile Profile — same. (Worker mobile doesn't exist yet, but lock this in for Phase D too.)

**Code consequences:**
- Profile.tsx: REMOVE the Resign button + ResignSheet + use-resign hook + any related state.
- Backend `POST /me/resign`: delete the route OR repurpose as `POST /memberships/:id/terminate` with HR-role auth gate (admin scope check). For now, deleting is the simplest correct move; rebuild as an HR portal endpoint when HR portal lands.
- Tests at apps/backend/test/me-resign.test.ts: delete (or rewrite as HR-initiated when that route exists).

**Compose with:**
- `project_single_tenant_model_resign_anonymise.md` (2026-05-18) — the anonymisation logic itself stays canonical (one ACTIVE Membership; HR-triggered anonymise; re-register = new user). Only the trigger moves from self-service to HR-initiated.
- `feedback_make_it_exist_dont_defer.md` — but ALSO compose with the product common-sense check: building a feature doesn't equal shipping a feature that any real user would use.
- `feedback_supervisor_no_visit_mark_button.md` — same family of rule: certain destructive / lifecycle actions never live on the actor's own surface.

**Scope:** Permanent. Don't ship a self-service termination button in any v3 surface, ever.
