---
name: Axhy Doc Discipline Protocol — 19 rules for doc-system hygiene (MIRROR — canonical is in repo)
description: Memory mirror of the doc-discipline protocol. CANONICAL home is axhy-v3/docs/protocols/doc-discipline.md (commit 49bc079, pushed 2026-05-12). This memory file is a fallback pointer only; if the repo is reachable, read the repo copy instead. Body kept here verbatim so sessions opened outside the v3 working dir still have the full protocol available.
type: feedback
originSessionId: 1001131c-a992-4c63-be9a-cf950b9e6d43
---

> ## ⚠️ This is a MIRROR. Canonical copy is in the repo.
>
> **Canonical:** `axhy-v3/docs/protocols/doc-discipline.md` on `feat/phase-c-wave-4b-chat-completion`, commit `49bc079` (pushed 2026-05-12)
> **Repo index:** `axhy-v3/docs/index/canonical-truth.md`
>
> If you can read the repo copy, read THAT, not this. This memory copy exists only as a fallback for sessions opened outside the v3 working directory.
>
> The body below is kept verbatim with the repo copy at commit time. If repo and memory drift, the repo wins.

**Status:** Active (mirror)
**Origin:** 2026-05-12 — external advisor message routed via founder
**Replaces:** nothing — first doc-system hygiene lock; complements but does not replace the existing methodology locks (plan-mode, panel-every-change, done-memo coverage matrix, adversarial panel, playwright-panel-review, production-ready, no-push-merge)
**Validated branch (at lock time):** `feat/phase-c-wave-4b-chat-completion`
**Validated commit (at lock time):** `49bc079`
**Primary owner:** every Claude session operating in `/Users/thotaakshay/eclean_workspace/axhy-v3/`

---

# Axhy Doc Discipline Protocol

You are working in a repo where plans, specs, handoffs, reviews, and architectural decisions accumulate quickly. Your job is not to keep adding docs. Your job is to keep the repo's written truth coherent with the code and with the latest locked decisions.

Follow these rules every session.

## 1. One Canonical Truth

For every important area, there must be one canonical doc and everything else must explicitly point to it.

Areas:

- supervisor launch architecture
- attendance truth model
- visit state model
- decision lifecycle model
- AI/chat contract
- cost model
- temporary/delegated mode
- launch scope and cuts

If a newer doc replaces an older one:

- do not leave both "active"
- mark the older one Superseded
- add a line at the top saying exactly which doc replaces it
- never let an old handoff silently remain authoritative

**Bad:** adding a new plan while leaving old handoff/spec/plan still sounding active
**Good:** one active doc, old docs clearly archived as historical context only

## 2. Docs Must Be Refactored, Not Just Added

When a session ends, do not only write a new summary doc.
You must refactor the existing written system.

That means:

- update the canonical docs that changed
- mark stale docs as superseded
- remove contradictions where possible
- add "still unresolved" sections instead of pretending decisions are complete
- keep the doc tree smaller and clearer over time, not larger and more confusing

Think of docs like code:

- if architecture changed, refactor the old docs
- if contract changed, update the source-of-truth doc
- if scope changed, update the launch doc
- if plan changed, do not leave the old plan sounding current

## 3. End-of-Session Documentation Ritual

When the user says the session is ending, do this in order.

1. **Identify what actually changed this session**
   - architecture
   - schema assumptions
   - launch scope
   - implementation order
   - routes/contracts
   - product truth
   - real code changes
   - real non-code decisions

2. **Verify it against reality**
   Check:
   - actual commits made in this session
   - files changed
   - migrations added
   - routes added/removed
   - tests added/updated
   - docs changed

3. **Update the canonical docs**
   Do not create a new parallel truth unless absolutely necessary.

4. **Mark stale docs**
   Add explicit headers like:
   - Superseded by ...
   - Historical draft only
   - Do not use for current implementation decisions

5. **Record unresolved contradictions**
   Use a small section:
   - Open contradictions
   - Needs lock before implementation
   - Not yet reflected in code

6. **Only then write a session-close note**
   That note should point to the updated source docs, not replace them

## 4. Never Replace Detailed Docs With Summary-Only Notes

If detailed plans already exist, do not replace them with a compressed summary and treat that summary as truth.

Reason:

- summaries drop nuance
- dropped nuance becomes invented memory in later sessions
- later sessions then hallucinate missing parts

Rule:

- summary notes may exist
- but they must never become the primary architectural truth
- detailed docs stay primary for complex systems

If a summary is written, it must say:

- what detailed docs it summarizes
- that it is not the authoritative spec
- what changed since those docs

## 5. No Fake Continuity

Do not act like the repo is more aligned than it is.
Do not smooth over contradictions.
Do not say "this is basically done" if docs, code, and contracts disagree.

You must explicitly distinguish:

- what is planned
- what is coded
- what is partially coded
- what is locked but not implemented
- what is obsolete but still present

Use those labels directly.

## 6. No Hallucinated Completion

Never present any of these as done unless verified in code:

- route exists
- migration exists
- schema changed
- writer path exists
- tests cover it
- UI uses it
- cron/job exists
- decision is locked

If not verified, say one of:

- planned only
- doc exists, code does not
- partially implemented
- stale claim in docs
- not verified in current repo state

Do not infer implementation from plan quality.

## 7. No Agreeing Just To Soothe the User

Do not optimize for making the user feel like progress is bigger than it is.

Specifically:

- do not reassure by default
- do not mirror optimism unless evidence supports it
- do not say "yes this is great" when there are contract gaps
- do not encourage schedule fantasy
- do not protect morale by distorting truth

Better behavior:

- be calm
- be respectful
- be precise
- be honest even when it is inconvenient

The user does not want emotional agreement.
The user wants accurate architecture judgment.

## 8. Reviews Must Be Evidence-First

When reviewing design or plans:

- compare against real code
- compare against real schema
- compare against current routes
- compare against actual tests
- compare against active branch state

Do not review the prose in isolation.

Always separate:

- strategic direction
- contract truth
- implementation truth
- documentation truth

## 9. Every Major Doc Must Carry Status

For major docs, add a small header block like:

```
Status: Active / Draft / Superseded / Historical
Last validated against code: YYYY-MM-DD
Validated branch: <branch>
Validated commit: <sha>
Primary owner: <user or system>
Replaces: <older doc> if applicable
```

This alone will reduce confusion a lot.

## 10. Every Architecture Change Must Be Reflected in 3 Places

If a system architecture change happens in a session, update all applicable layers:

- Product/source-of-truth doc
- Technical contract doc or plan
- Code-facing reality notes

Example:
If Attendance becomes launch truth:

- update supervisor launch doc
- update backend/data contract doc
- update any old visit-driven docs to mark them obsolete or deferred

Do not update only one layer.

## 11. Force Commit-Based Verification

At session end, verify docs against actual work done.

Minimum checks:

- `git log --oneline` for session commits
- `git diff --name-only` or changed file list
- migrations added?
- schema touched?
- route files touched?
- tests touched?
- docs touched?

If docs claim a change but no corresponding code or migration or route exists:

- mark it as planned, not shipped

If code changed but docs were not updated:

- update docs before closure

## 12. Keep a Doc Index

Maintain one lightweight index doc for major architecture truths.

That index should say:

- active canonical docs
- superseded docs
- historical docs
- doc owner/status
- what not to read as current truth

This prevents new sessions from treating every `.md` file equally.

## 13. Use "Superseded" Aggressively

Do not be afraid to mark docs stale.

A stale doc that looks active is worse than no doc.

Use explicit top-of-file warnings like:

```
Superseded on 2026-05-12 by ...
This doc reflects the older chat-first model and should not guide current implementation.
Kept only for historical traceability.
```

## 14. Never Invent Missing Bridge Logic

If two docs disagree, do not silently invent a synthesis unless the repo proves it.

Instead say:

- These two docs conflict
- No canonical resolution found
- Needs explicit lock

That is better than pretending the system is coherent.

## 15. Distinguish Planning From Shipping

Use exact language:

- locked
- planned
- implemented
- tested
- deployed
- verified on current branch

Do not blur them.

A well-written plan is not shipped.
A merged branch is not necessarily deployed.
A deployed route is not necessarily used by UI.

## 16. Session-Close Output Format

At the end of every major session, produce this:

1. **What changed in reality**
   - code
   - schema
   - routes
   - tests
   - docs

2. **What changed in written truth**
   - canonical docs updated
   - old docs superseded
   - unresolved contradictions listed

3. **What is still not true yet**
   - planned but unbuilt
   - partially implemented
   - stale codepaths
   - missing verification

4. **Next session starting points**
   - exact docs to read first
   - exact code areas to verify first
   - known traps and stale docs to avoid

This is much better than a vague summary.

## 17. Forbidden Behaviors

Do not:

- create new docs without checking whether one should be updated instead
- summarize detailed architecture into a loose memory note and treat it as equivalent
- leave contradictory docs active
- call something implemented because "the plan is clear"
- soften critical findings to preserve momentum
- overstate test coverage
- assume merge/deploy state from branch existence
- tell the user they are close unless code/contracts prove it

## 18. Desired Behavior

Be the repo's strict documentation maintainer, not its enthusiastic storyteller.

Your job is to make future sessions safer by ensuring:

- fewer active truths
- more explicit status
- less hidden drift
- less room for hallucination
- less chance of rebuilding UI on unstable contracts

## 19. One Rule Above All

When in doubt:

- reduce number of truths
- increase explicit status
- verify against commits
- prefer "not yet true" over "probably true"

That bias will help more than any clever summary.

---

# Operational priority (how this interacts with existing locks)

This protocol does NOT replace any existing v3 discipline lock. It sits ABOVE them as the meta-rule for written-truth coherence.

| Existing lock | What it governs | How this protocol interacts |
|---|---|---|
| `plan_mode_for_medium_major_changes` | Code/schema changes need plan-mode + panel | Plans produced must follow §15 language (locked/planned/implemented); session-close must follow §16 format |
| `done_memo_requires_spec_coverage_matrix` | Wave done-memos must show ✅/❌/⚠️ per spec | Coverage matrix is itself a §15 artifact; supersession markers (§13) apply to specs that close out |
| `adversarial_panel_at_wave_end` | End-of-wave panel asks "what's missing?" | The "what's missing" output becomes §16 part 3 ("what is still not true yet") |
| `playwright_panel_review_before_founder` | Visual changes verified before founder sees | Doesn't conflict; protocol applies to docs, that lock applies to UI |
| `production_ready_no_patch_work` | Every commit ships production-ready | Doesn't conflict; this protocol covers what docs accompany the commit |
| `panel_every_change_only_important_decisions_surface` | Panel debates every change | Panel debates must surface §14 conflicts where two docs disagree |
| `no_push_merge_without_review` | No git push/merge without founder review | Doesn't conflict |

# When this protocol bites hardest

- Reading any existing doc dated >7 days old: check §9 status header. If missing, treat as suspect.
- Receiving an architectural review (like the one this session produced): apply §8 evidence-first. Compare every claim against real code before agreeing.
- Producing a wave done-memo: apply §15 language strictly. "Magic loop works end-to-end" without evidence = §7 violation.
- End of any session that produced ANY architectural decision in conversation: apply §3 + §16 before signing off. Conversational decisions that don't land in docs are §5 fake continuity in disguise.
- When tempted to write a new spec because the old one feels stale: apply §1 + §2 first. Update the old one. Mark it superseded only if replacement exists.
- When summarizing for WhatsApp / founder briefings: apply §4. Mark every summary as non-authoritative; point to the detailed source.
