---
name: Comprehensive panel-team production-test before surfacing production code
description: For code shipping to production within ~1 month, run a comprehensive panel test (9-11 voices, P1-P10 checklist) on the approved plan BEFORE surfacing scope+code work. Surface findings to friend; friend decides what folds in. Locked 2026-05-16.
type: feedback
originSessionId: 5f823f24-0cb4-45a4-b955-4b6761916b4a
---

**Rule:** When a plan is approved and the code will ship to production within ~1 month, run a COMPREHENSIVE panel-team production-readiness test on the approved plan BEFORE starting the scope-artifact + tracker + code work. This is a stronger test than the brief 3-4-voice panel passes done during plan iteration.

**Why:** Owner directive 2026-05-16 21:35 (after F-007 v11 plan approval): "properly test it with panel team ok dont forget ths is production code which we will release in 1 month time our app."

The brief panel passes during plan iteration (~3-4 voices, 1 bullet each) catch logic gaps in the delta. They are NOT enough for production readiness — they miss compound debt, 1-year-of-real-use scenarios, P1–P10 production-grade rule violations, and cross-slice operational concerns that only emerge under sustained production load.

**Distinction from existing panel rules:**

- [feedback_panel_every_change_only_important_decisions_surface.md](feedback_panel_every_change_only_important_decisions_surface.md): panel for every change (even tiny ones). Tactical, fast.
- [feedback_panel_thinks_one_year_horizon.md](feedback_panel_thinks_one_year_horizon.md): every panel voice frames day-365 reality.
- [feedback_adversarial_panel_at_wave_end.md](feedback_adversarial_panel_at_wave_end.md): adversarial end-of-wave check ("what's missing?"). For shipped waves.
- **THIS rule** (production-test): comprehensive 9-11-voice test on an approved plan, BEFORE the implementation work begins, when production launch is ~1 month away. Strategic, slower, deeper.

**How to apply:**

1. **Trigger:** any plan or scope that will result in production code shipping within ~1 month. Especially: workflow/lifecycle slices, multi-actor slices, anything touching billing/security/PII, anything with a managed provider integration.

2. **Voice selection (9-11 voices, comprehensive):** at minimum Maya / Eric / Aanya / Naina / Vikram / Sara / Suresh Pillai + 3-4 personas (Suresh / Reddy / Kavitha / Ravi). Pick voices relevant to the slice's domain.

3. **Per-voice frame:**
   - Maya (architect, 10-yr arc): atomicity, P3, invariant-enforcement, future migration cost.
   - Eric (compound debt): ghost values, dead code, schema-evolution pain.
   - Aanya (AI/voice/localization): Telugu/Hindi/Tamil rendering, template safety, AI-cost.
   - Naina (pricing): MAU-counting, free-tier ceiling, hidden commercial gotchas.
   - Vikram (multi-tenant): cross-tenant safety, tenant-scoped keys, partial unique indexes.
   - Sara (UX day-365): notification storm, screen scan-cost, gesture-busy state.
   - Suresh Pillai (FM ops): real field reality — workers without User accounts, paper-form workflows.
   - Personas (Suresh worker, Reddy owner, Kavitha HR, Ravi supervisor): "in my day-365, would I notice this?" + "in my day-30 launch month, would the system look broken?"

4. **Production-grade P1–P10 compliance check** in parallel with the panel test. Use [feedback_production_grade_workflow_rules.md](../feedback_production_grade_workflow_rules.md).

5. **Output:** N material findings + cross-slice observations. Classify each as:
   - **Material** = should fold into the plan.
   - **Code-stage note** = informational, no plan change.
   - **Cross-slice** = belongs in a different slice's tracker entry.

6. **Surface findings to friend BEFORE folding into plan.** Friend's verdict determines what folds in vs what defers. DO NOT auto-apply panel findings to the plan — owner observed 2026-05-16 21:36 (verbatim): "i didnt say to chnage the plan you need to provide first to my frd."

**F-007 worked example (2026-05-16):**

After v11 plan approval, ran 11-voice production test (Maya / Eric / Aanya / Naina / Vikram / Rohit / Sara / Suresh Pillai / Suresh persona / Reddy persona / Kavitha persona) + P1–P10 checklist. Surfaced 5 material findings + 2 cross-slice observations to friend WITHOUT auto-applying. Friend's verdict: "Fold all 5 material findings into v11. Defer neither. This panel pass improved the plan. It did not expose a new architecture reset." Then folded.

**What this rule does NOT change:**

- Plan-iteration brief panel passes are still required for each plan revision (per existing panel-every-change rule).
- This rule adds a comprehensive production-readiness test BETWEEN plan approval and implementation start.
- For non-production code (research spikes, prototypes, demos), the brief panel pass is enough — this rule is specifically for production-bound code with a near-term launch.

**Anti-patterns:**

- ❌ Skip the comprehensive test because "we already did panel passes during plan iteration."
- ❌ Auto-apply panel findings to the plan without surfacing to friend first.
- ❌ Mix the comprehensive test into the plan iteration cycle (it sits BETWEEN approved plan and code work, not inside iteration).
- ❌ Cherry-pick voices to confirm the plan. Include voices that will adversarially stress the design (Eric on compound debt is especially important).
