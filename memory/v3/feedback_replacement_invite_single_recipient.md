---
name: replacement-invite-single-recipient
description: ReplacementInvite (F28) is ONE recipient per invite, NOT a multi-worker broadcast. Supervisor sends to one worker; 2-min TTL; if expires/declines, supervisor can re-send to same or different worker. No groupId, no broadcast, no race-safety machinery.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# ReplacementInvite is single-recipient, not broadcast (locked 2026-05-18)

**Rule:** A `ReplacementInvite` is a 1:1 contract between supervisor and one candidate worker. Never a multi-worker broadcast.

- One worker per invite row.
- 2-minute expiry from `sentAt`.
- After ACCEPTED / DECLINED / EXPIRED / CANCELLED, supervisor may send a new invite to the same worker OR a different worker.
- No simultaneous "send to N candidates, first-to-accept wins" pattern.

**Why:** Founder said 2026-05-18 verbatim: *"he can send only 1 invite per assigment not to mu;ltiple persons at same time ok . because if all accept it will create problem so keep it lik this a invite stays for 2 mins and expires after that he can send to someone or again him only ."*

The broadcast pattern (PUBG-squad-style, N candidates, first-accept wins) was assumed from master plan §G:976 + R6 prototype, but the founder's product call is single-recipient. The reasoning is sound: if N candidates all accept simultaneously, the supervisor has to apologise to N-1 of them; real Hyderabad supervisors avoid that politeness debt by calling/messaging one worker at a time.

Real-world parallel: a supervisor on WhatsApp calls Lakshmi first. If she doesn't pick up in 2 minutes, he calls Saira. Not blast-message-everyone.

**How to apply:**

**Route shape:**
- `POST /supervisor/replacement-invites` body: `{ siteId, scheduledStart, candidateUserId, visitId? }` — single candidate, not an array.
- `POST /worker/replacement-invites/:id/accept` — simple conditional UPDATE on `status='PENDING'`. No race-safety machinery needed.
- `POST /worker/replacement-invites/:id/decline`
- `POST /supervisor/replacement-invites/:id/cancel` — cancel by invite ID, not group.
- `GET /supervisor/replacement-invites?status=&limit=&cursor=` — list.

**Schema shape:**
- No `groupId` field.
- No partial unique index on `(groupId) WHERE status='ACCEPTED'`.
- Status enum stays: PENDING / ACCEPTED / DECLINED / EXPIRED / CANCELLED.
- 2-minute default `expiresAt = sentAt + 120s` stays.

**Service layer:**
- Atomic accept: `UPDATE … WHERE id=$1 AND companyId=$2 AND toWorkerId=$3 AND status='PENDING'`. Naturally idempotent. No advisory lock. No sibling-expire. No P2002 handling.
- Decline / cancel are trivial conditional UPDATEs.
- Cron sweep stays: flips PENDING past `expiresAt` to EXPIRED + emits `REPLACEMENT_INVITE_OUTCOME` SupervisorDecision row.

**Composes with:**
- `feedback_make_it_exist_dont_defer.md` — the simpler thing is what to make exist.
- `feedback_40_year_team_world_domination_quality_bar.md` — production-grade ≠ complex. The simpler design IS the production-grade design when it matches the product.
- `feedback_no_build_without_full_case.md` — should have surfaced this question before building the broadcast version.

**Scope:** Permanent. Don't reintroduce broadcast invites in any v3 surface.
