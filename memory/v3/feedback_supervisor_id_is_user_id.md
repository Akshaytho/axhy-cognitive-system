---
name: supervisorId columns store User.id, NOT Membership.id
description: 6 schema columns named `supervisorId` store the User.id of the supervisor, scoped by composite key with companyId. Comments previously said "FK Membership.id" — this was a documentation lie. Panel-locked 2026-05-10.
type: feedback
originSessionId: 4d204c5b-c118-4c43-b328-481815a60b2e
---
**Rule:** Every `supervisorId String @db.Uuid` column in the v3 schema stores a `User.id`, NOT a `Membership.id`. The column is composite-keyed with `companyId` so cross-tenant leak is prevented at the query level (every read includes `WHERE companyId = $auth.companyId AND supervisorId = $auth.userId`).

**Why:** Founder asked 2026-05-10 "did you test with multiple companies?" The post-hoc panel review of Wave 4b Phase 2 caught that schema comments said `/// FK Membership.id` but code (in chat.ts and elsewhere) writes `auth.userId`. Two interpretations were on the table:
1. **Code is wrong** — fix code to use Membership.id (3-hour refactor + auth-flow risk)
2. **Comments are wrong** — fix comments to say User.id (30-min docs-only)

A 9-voice panel session (Maya + Vikram + Hari + Aanya + Eric + Naina + Karthik + Mr. Reddy day-365 + Suresh day-365) voted **9/9 for option 2.** Reasoning:

- **Semantic correctness:** LivingDoc + chat history + supervisor decisions are *accumulated learnings of a human within a company*. Suresh-the-person doesn't change his rules when he wears an HR sub-hat for a week. The semantic is "this human in this company" — User.id keying is correct.
- **No security gap:** composite `(companyId, supervisorId)` queries already prevent cross-tenant leak. Membership.id would not improve this.
- **AI moat preservation:** keying by Membership.id would split a single supervisor's accumulated context into role-fragmented pieces, making the AI moat WEAKER, not stronger.
- **Founder + persona day-365 alignment:** Mr. Reddy on day-365 wants Suresh's full context in one place, not split-by-role. Suresh on day-365 doesn't want his notes split.
- **Cost of refactor for non-existent benefit:** Option 2 would refactor JWT + auth + 6 columns + 15 routes + auth tests. Cargo-cult work for a hypothetical scenario the model doesn't have.

**Locked semantic:** `supervisorId` = User.id of the human supervisor; cross-company isolation comes from `companyId` column, not from the supervisorId itself.

**How to apply:**
- New schema columns named `supervisorId String @db.Uuid` MUST add a `///` comment that explicitly states "User.id (composite-keyed with companyId; NOT Membership.id)". Reference this memory file.
- Code touching supervisorId MUST always include `companyId` in the WHERE clause. Composite key is the security boundary.
- Future panel debates that propose "let's refactor to Membership.id keying" are CARGO CULT. Push back, cite this lock.

**The 6 columns covered (as of 2026-05-10):**
1. `CalendarEntry.supervisorId`
2. `ChatThread.supervisorId`
3. `Complaint.supervisorId` (logger)
4. `SwapRequest.supervisorId` (initiator)
5. `SupervisorDecision.supervisorId` (decision-maker)
6. `LivingDoc.supervisorId`

All 6 schema comments now consistently say "User.id (composite-keyed with companyId; NOT Membership.id)".

**Re-debate trigger:** if a real product scenario surfaces where a single User-in-one-company needs role-fragmented supervisor context (e.g., Mr. Reddy hires Suresh for both supervisor AND HR roles in his company AND wants Suresh's supervisor-context separate from his HR-context), surface as a new master-plan-level question. Do NOT silently start storing Membership.id.

**Founder's separate question:** "Why have User+Membership at all? Can't we just use composite IDs per company?" — that's a master-plan-level architectural question, not a supervisorId question. Tracked as a future thread; not addressed by this memory file.
