---
name: root-cause-first-walkthrough-pattern
description: During testing / walkthrough / sim runs, don't fix bugs as found. Complete the full pass, collect every bug, cluster by shared root cause, fix at the root not the symptom. Bugs come from shared causes; fix-as-found masks them.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Walkthrough discipline: full-pass first, root-cause cluster, then fix (locked 2026-05-18)

**Rule:** When running a test sweep, sim walkthrough, regression pass, or any multi-screen verification:

1. **Run the entire pass first.** Log every bug, error, missing feature, ugly state, unexpected behaviour. Don't fix anything mid-pass.
2. **After the pass: cluster.** Sort bugs by likely shared root cause. Multiple symptoms with one cause is the norm — for example, ten "screen crashes on null data" bugs almost always trace to one missing default in a shared query hook or one missing empty-state component.
3. **Fix at the root.** One root-level fix should resolve all clustered symptoms. Verify by re-running the affected screens after the root fix.
4. **Single-symptom bugs are fixed individually**, but only after the clusters are handled.
5. **Document the cluster analysis** in the findings memo: each cluster gets a "shared root cause" line + the one fix that resolved N symptoms.

**Why:** Founder said 2026-05-18 verbatim: *"first run tests or what ever then see where bugs are coming from analsyse them understand them why they exist because bugs dont come from single place they come from multiple places because of single things . so fix bugs that way"*.

This is real engineering hygiene. Fix-as-found has three failure modes:
- **Masks the cause.** You fix the symptom (add a null-check in screen A), miss the root (the query hook returns undefined under condition X), and the same bug returns in screens B, C, D — each fixed independently, codebase becomes a quilt of defensive patches.
- **Wastes time.** Three rounds of "find symptom → patch → re-verify" cost more than one round of "find all symptoms → find root → fix once → re-verify all."
- **Hides design problems.** When ten symptoms cluster, the cluster is itself information: the shared abstraction is wrong (or absent). A null-check storm means an empty-state contract is missing. A no-op-button storm means prop-drilling is broken. The root fix is often a design fix.

**How to apply:**

**During a sim walkthrough:**
- Open a `findings/2026-XX-XX-walkthrough.md` doc. Two columns: `Day · Screen · Action · Symptom · Severity`.
- Resist the urge to context-switch to fix. Note. Move on.
- After full pass, add a `Root cause` column. Empty initially. Then cluster.
- Common cluster patterns to watch for:
  - **Null-data crashes** → root: missing query default / missing empty-state component / typing-allows-undefined
  - **No-op button family** → root: prop drilling lost / missing route / disabled-flag stuck
  - **Same string in three places** → root: missing i18n key / hardcoded copy that should be tokenised
  - **Inconsistent loading states** → root: missing shared LoadingFrame / inconsistent isFetching wiring
  - **Photo / file upload failures** → root: missing retry policy / missing chunk upload / missing CDN slice
  - **Slow scroll on multiple screens** → root: ScrollView+map pattern instead of FlatList / missing React.memo on shared row component
  - **Wrong data after refresh** → root: missing query invalidation key / staleTime miscalibration / cache-key collision
  - **State persists across role switch** → root: missing on-app-logout cleanup hook
  - **Decisions don't update** → root: missing optimistic update / missing query subscription / missing event-source wiring

**During a regular bug-triage session:**
- Same pattern. Before fixing the first bug on the list, scan the full list for siblings. Look for shared file paths, shared types, shared error messages.
- If two bugs even *might* share a cause, treat the cluster as one ticket.

**Sole exception: production outages.** If a bug is actively breaking prod for users, fix it now, root-cause later in a follow-up. Note the temporary patch + open the root-cause ticket in the same commit message.

**Composes with:**
- `feedback_production_grade_workflow_rules.md` — P-rule against documented limitations passing as features
- `feedback_40_year_team_world_domination_quality_bar.md` — quilt-of-patches violates the permanence rule
- `feedback_make_it_exist_dont_defer.md` — root-fix often means making the missing abstraction exist
- `feedback_simulator_trace_based_verification.md` — trace through full lifecycle, not just row existence

**Scope:** Permanent. Default mode for every multi-screen verification, sim walkthrough, regression pass, or triage session.
