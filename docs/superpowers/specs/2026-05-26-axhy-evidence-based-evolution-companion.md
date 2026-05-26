# Evidence-Based Evolution — Companion Specification

**Date:** 2026-05-26
**Status:** Spec only — founder review required before implementation.
**Companion to:** Phase 6 Self-Learning Layer (`docs/superpowers/specs/2026-05-26-axhy-self-learning-layer-design.md`)
**Founder review score on direction:** 9.1/10
**Founder review score on spec:** 9.2/10 (3 corrections applied below)

---

## 1. Purpose

The Phase 6 Self-Learning Layer gives Axhy behavioral memory — scorecards, fingerprints, freshness classes. That layer answers: "what patterns has this system exhibited?"

This companion layer answers a different question: "when Axhy makes a decision, is the decision grounded in evidence or built on assumption?"

LLMs are naturally good at generating ideas, agreeing with users, and sounding confident. None of that is unique. What makes Axhy different is that it does not trust ideas until evidence survives a reality check.

**Core principle:**

> Imagination proposes. Evidence decides.

This is not aspirational. It is operational. Every important claim must declare its evidence type, freshness, assumptions, and cheapest verification path. Claims without evidence are labelled as such and cannot drive decisions.

---

## 2. Relationship to Existing Systems

This spec adds three components. It does not replace or modify anything.

| Existing System | What It Does | What This Spec Adds |
|----------------|-------------|---------------------|
| Brainstorming skill | Generates 2-3 approaches, explores trade-offs | Evidence Decision Card scores the approaches |
| check_before_build (E1-E14) | Validates production readiness of code | Evidence Decision Card validates strategic fitness of ideas |
| Freshness classes (Self-Learning Layer, Section 4.2) | Classifies temporal honesty of memory claims | Claim Classification adds epistemic honesty — is this proven or assumed? |
| Behavioral scorecard (Self-Learning Layer, Section 4.1) | Tracks guardrail compliance and failure patterns | Evidence discipline failures become scorecard entries |
| Guardrails (hooks, scanners) | Mechanical enforcement of rules | Unchanged — evidence discipline is upstream of enforcement |

**The gap this fills:** The brainstorming skill generates approaches. check_before_build validates production readiness. But between "we have three approaches" and "we're building approach B," there is no structured evidence gate. The decision of *which approach to build* currently depends on conversational founder approval alone. The Evidence Decision Card adds a structured intermediate step.

---

## 3. Component 1: Evidence Decision Card

### What

A structured template applied to every major idea, plan, or architectural decision before it becomes a build commitment.

### When Required

The Evidence Decision Card is required when:

- A new feature is being designed (brainstorming phase)
- An architectural change is proposed (schema, state machine, new service)
- A decision reverses or modifies a previously locked choice
- The cost of being wrong exceeds one session of work to undo
- The founder explicitly asks for evidence-based analysis

The Evidence Decision Card is NOT required for:

- Typo fixes, comment updates, formatting
- Bug fixes where the bug is already reproduced and the fix is obvious
- Guardrail compliance (the guardrails already have their own evidence requirements)
- Low/medium-risk reversible tasks where the founder says "just do it"

**Note:** The founder "just do it" escape hatch cannot skip Evidence Decision Cards for:
- Security or privacy decisions
- Data loss risk
- Tenant isolation changes
- AI or personnel decisions
- Architecture changes (schema, state machine, new service)
- Expensive or irreversible decisions (reversal cost > 2 sessions)
- Anything contradicting locked docs

Founder judgment overrides process friction, but not constitutional safety.

### Schema

```yaml
evidence_decision_card:
  idea: "Short description of the proposal"
  problem_it_solves: "What real user/business problem does this address?"

  positive_evidence:
    - type: "source-proven"        # evidence type (see Claim Classification)
      claim: "Workers complete capture in 3 taps"
      source: "code path count in capture/[visitId]/ — 8 screens, 3 mandatory taps"
    - type: "test-proven"
      claim: "R2 upload pipeline handles network interruption"
      source: "integration test upload-queue.test.ts lines 45-89"
    - type: "user-proven"
      claim: "Supervisors need faster replacement workflow"
      source: "founder interview notes, master plan §D persona analysis"

  negative_risks:
    - risk: "Could increase capture flow to 5 taps"
      severity: "medium"
      mitigation: "Prototype with 3-tap constraint first, measure"
      mitigation_cost: "low — 1 session spike"
    - risk: "Could break existing upload queue state"
      severity: "high"
      mitigation: "Integration test covers queue recovery"
      mitigation_cost: "zero — test already exists"

  assumptions:
    - claim: "Workers will understand the new timer screen"
      evidence_type: "reasoned-assumption"
      cheapest_verification: "Screenshot walkthrough with 3 workers (founder can do in 1 day)"

  unknowns:
    - claim: "AI verification latency under real photo load"
      why_unknown: "No production load data yet"
      cheapest_verification: "Load test with 50 concurrent uploads on Railway staging"

  cost_of_being_wrong: "If upload queue breaks, workers lose captured photos mid-visit. Recovery requires manual re-capture. Severity: HIGH."

  cheapest_test: "Build the upload change behind a feature flag. Test with 5 visits before enabling for all workers."

  evidence_score: 7          # see Grounded 8:2 Scoring (Section 5)
  risk_score: 3              # see Grounded 8:2 Scoring (Section 5)
  decision: "prototype"      # proceed | prototype | research | reject
  decision_reasoning: "Evidence is strong on happy path (code-proven + test-proven) but worker usability is an assumption. Prototype first, verify with founder walkthrough."
```

### Rules

1. Every field must be filled. Empty fields are not allowed — use "None identified" if genuinely nothing applies, but that itself is a signal (if you cannot identify risks, you haven't thought hard enough).

2. `positive_evidence` entries must each declare their evidence type. "It would be nice" is not evidence. "The code shows X at path Y" is evidence.

3. `assumptions` must each include `cheapest_verification` — the lowest-cost way to turn the assumption into proof. If verification is expensive, that's a signal the assumption is risky.

4. `cost_of_being_wrong` is mandatory. If you cannot articulate what breaks when you're wrong, you don't understand the decision well enough to make it.

5. The card is written BEFORE the founder approves an approach, not after. It is an input to the decision, not documentation of a decision already made.

---

## 4. Component 2: Claim Classification

### What

A labelling system for every important claim made during design, planning, or decision-making. Forces epistemic honesty — distinguishing what is proven from what is assumed.

### Relationship to Freshness Classes

The Self-Learning Layer's freshness classes (Section 4.2) handle *temporal* honesty:
- Is this claim from this session or a prior session?
- Can a prior-session observation prove current external state? (No.)

Claim Classification handles *epistemic* honesty:
- Is this claim proven by source, code, test, user feedback, or data?
- Or is it a reasoned assumption, speculation, or unknown?

These are orthogonal dimensions. A claim can be `verified_now` (fresh) but `speculation` (unproven). A claim can be `historical` (old) but `source-proven` (the locked doc says so).

| Freshness (temporal) | Classification (epistemic) | Example |
|---------------------|---------------------------|---------|
| verified_now | code-proven | "The capture flow has 8 screens" (just read the code) |
| verified_now | speculation | "Workers will prefer the new layout" (no user data) |
| prior_session_claim | test-proven | "Upload queue handled 50 concurrent uploads in S339" (need to re-verify) |
| historical | source-proven | "Pricing is Rs 8/visit" (locked doc, always valid) |

### Classification Labels

| Label | Definition | Can drive decisions? |
|-------|-----------|---------------------|
| `source-proven` | Documented in a locked doc, master plan, or founder-authored spec | Yes |
| `code-proven` | Verifiable by reading current code (with file path and line reference) | Yes |
| `test-proven` | Verified by a passing test (with test file and assertion reference) | Yes |
| `user-proven` | Confirmed by real user behavior, founder feedback, or field observation | Yes |
| `data-proven` | Supported by measurable data (metrics, logs, cost figures, usage counts) | Yes |
| `reasoned-assumption` | Logically plausible but not yet verified by any of the above | **No** — must be flagged and cheapest verification identified |
| `speculation` | No supporting evidence; based on intuition or pattern-matching | **No** — cannot be used as decision truth |
| `unknown` | Explicitly acknowledged gap in knowledge | **No** — must be flagged and cheapest verification identified |

### Rules

1. **Speculation cannot be used as decision truth.** A speculative claim can be stated, discussed, and explored. But it cannot appear in the `positive_evidence` section of an Evidence Decision Card. It can only appear in `assumptions` or `unknowns`.

2. **Reasoned assumptions must include a verification path.** Every `reasoned-assumption` must answer: "What is the cheapest way to upgrade this to proven?" If the cheapest verification is too expensive, that's a signal the assumption carries unacceptable risk.

3. **Claims can be upgraded.** An assumption that gets verified by a test becomes `test-proven`. The Evidence Decision Card should be updated when this happens (during implementation, not retroactively).

4. **Classification applies to important claims, not every sentence.** A casual statement like "this function returns a string" does not need classification. A statement like "workers will understand voice onboarding" does — because it drives a build decision.

5. **When in doubt, classify conservatively.** If you think a claim is `code-proven` but haven't actually read the code in this session, it is `reasoned-assumption` until you read it. Freshness classes reinforce this: `prior_session_claim` + `code-proven` downgrades to `reasoned-assumption` until re-verified.

---

## 5. Component 3: Grounded 8:2 Scoring

### What

A scoring rubric for Evidence Decision Cards that uses countable evidence types, not subjective assessment.

### Why Grounding Matters

The founder identified a critical risk: if the model scores its own evidence as "8/10 because it feels strong," that is hallucination with numbers. The score must come from countable, verifiable criteria.

**Bad:** "Evidence score: 8/10 — this approach has strong support."
**Good:** "Evidence score: 8/10 — 4 of 5 evidence types are proven (source, code, test, user). Data-proven pending load test."

### Evidence Score (0-10)

The evidence score counts how many evidence types support the positive claims:

| Evidence Types Proven | Score |
|----------------------|-------|
| 5 of 5 (source + code + test + user + data) | 10 |
| 4 of 5 | 8 |
| 3 of 5 | 6 |
| 2 of 5 | 4 |
| 1 of 5 | 2 |
| 0 of 5 (all claims are assumptions/speculation) | 0 |

**Adjustments:**
- If any proven evidence is `prior_session_claim` (not re-verified this session), subtract 1 from score
- If `cost_of_being_wrong` is HIGH and evidence is not `test-proven`, subtract 1 from score

**Evidence maturity note (early-stage product decisions):**

In early-stage product work, some evidence types may not yet exist. A strong early-stage decision may have `source-proven` + `code-proven` + `user-proven` but no test yet (code not written) and no usage data (product not launched). Lack of `test-proven` or `data-proven` does not automatically reject the idea, but it prevents a "proceed fully" decision. Early-stage ideas with 3 of 5 evidence types (score 6) should default to "prototype/test first" unless risk is very low (0-1). This keeps Axhy practical for a pre-launch product while still requiring evidence honesty about what is not yet proven.

### Risk Score (0-10)

The risk score counts unmitigated negative factors:

| Factor | +2 to risk score |
|--------|-----------------|
| No mitigation identified for a medium/high risk | +2 per unmitigated risk |
| Mitigation exists but is expensive (> 1 session to implement) | +1 per expensive mitigation |
| Assumption in a critical path (security, data loss, user trust) | +2 per critical assumption |
| Unknown that blocks rollback if wrong | +2 |
| Reversal cost exceeds 2 sessions of work | +1 |

Cap at 10.

### Decision Rules

| Evidence Score | Risk Score | Decision |
|---------------|-----------|----------|
| 8-10 | 0-2 | **Proceed.** Strong evidence, low risk. |
| 6-7 | 0-3 | **Prototype/test first.** Evidence is good but not complete. Run the cheapest test before committing. |
| 8-10 | 3-5 | **Proceed only with mitigation proof.** Evidence is strong but risk needs active management. Verify mitigations work before full build. |
| Below 6 | Any | **Research more.** Not enough evidence to justify building. Use impactCheck, web search, code review, or founder consultation to upgrade claims. |
| Any | 6+ | **Reject or redesign.** Risk is too high regardless of evidence. Unless founder explicitly accepts the risk with reasoning. |

### Examples Using Axhy Product Decisions

**Example 1: AI personnel suggestions (REJECTED)**

```yaml
evidence_decision_card:
  idea: "Use AI to suggest best worker for replacement shift"
  problem_it_solves: "Supervisors need faster replacement decisions"

  positive_evidence:
    - type: "source-proven"
      claim: "System has availability, site distance, skill data"
      source: "master plan §D, Prisma schema Worker/Site/Assignment models"
    - type: "user-proven"
      claim: "Supervisors spend 10-15 min finding replacements"
      source: "founder interview notes"

  negative_risks:
    - risk: "Violates founder rule: no AI personnel suggestions"
      severity: "critical"
      mitigation: "None — rule is constitutional (locked doc)"
      mitigation_cost: "N/A — cannot mitigate a constitutional violation"
    - risk: "Could create bias/unfairness perception"
      severity: "high"
      mitigation: "Show rule-based eligible list, human picks"
      mitigation_cost: "low"

  assumptions:
    - claim: "AI ranking would be more accurate than supervisor judgment"
      evidence_type: "speculation"
      cheapest_verification: "Cannot verify — violates locked rule before testing begins"

  unknowns: []

  cost_of_being_wrong: "Constitutional violation. Breaks founder trust. Violates locked doc feedback_no_ai_suggestions_admin_decides.md."

  cheapest_test: "N/A — the rule prohibits this approach"

  evidence_score: 4    # 2 of 5 types proven (source + user)
  risk_score: 8         # critical constitutional violation (+2), unmitigated (+2), critical assumption (+2)
  decision: "reject"
  decision_reasoning: "Violates locked rule. No amount of evidence overcomes a constitutional constraint. Build rule-based candidate shortlist with human choice instead."
```

**Example 2: Timer elapsed state persistence (PROCEED)**

```yaml
evidence_decision_card:
  idea: "Persist timer elapsed state to AsyncStorage on back navigation"
  problem_it_solves: "CRIT-4: Accidental back press loses all timing data"

  positive_evidence:
    - type: "code-proven"
      claim: "Timer state is useState only — lost on unmount"
      source: "apps/mobile/app/(worker)/capture/[visitId]/timer.tsx line 56"
    - type: "code-proven"
      claim: "AsyncStorage persist/restore pattern exists in capture flow"
      source: "r2-upload-queue.ts uses same persist/restore pattern — proves the pattern works in this codebase, but no dedicated test for timer persistence exists yet"
    - type: "source-proven"
      claim: "Timer data loss is a known CRIT-4 issue"
      source: "BOOK_ARCHITECTURE_COMPLETE.md Section 'Product Issues Discovered'"
    - type: "user-proven"
      claim: "Workers accidentally hit back — field observation"
      source: "founder field notes, master plan §D worker persona"

  negative_risks:
    - risk: "AsyncStorage write could fail silently"
      severity: "medium"
      mitigation: "try/catch with console.warn, timer continues regardless"
      mitigation_cost: "zero — 3 lines"

  assumptions:
    - claim: "Workers hit back often enough to justify the fix"
      evidence_type: "user-proven"
      cheapest_verification: "Already verified by founder field observation"

  unknowns: []

  cost_of_being_wrong: "Low. Worst case: AsyncStorage write fails, timer behaves as before (no regression)."

  cheapest_test: "Unit test: persist on unmount, restore on remount."

  evidence_score: 6    # 3 of 5 types proven (source + code + user). No test-proven (no passing test for timer persistence). No data-proven (no usage metrics).
  risk_score: 1         # one medium risk with zero-cost mitigation
  decision: "proceed"
  decision_reasoning: "3 evidence types proven (source + code + user). Normally score 6 would mean 'prototype first,' but risk is very low (1) and cost of being wrong is near-zero (no regression). Per evidence maturity note: early-stage idea with low risk can proceed. Write the unit test during implementation to upgrade to test-proven."
```

---

## 6. Avoiding Hallucination

The entire purpose of this spec is to prevent Axhy from building on fake confidence. Here is how each component contributes:

| Hallucination Type | How Axhy Falls Into It | What Stops It |
|-------------------|----------------------|---------------|
| Agreeing with user | LLMs naturally confirm ideas that sound good | Evidence Decision Card forces negative_risks and assumptions — you must articulate what could go wrong |
| Fake confidence | "This approach has strong support" with no specifics | Grounded scoring: count evidence types, don't score feelings |
| Treating assumption as fact | "Workers will prefer voice onboarding" stated as truth | Claim Classification: that's `reasoned-assumption`, not `user-proven` |
| Speculation as evidence | "Similar companies do X so we should too" | Classification rule: speculation cannot appear in positive_evidence |
| Numerically-dressed hallucination | "Evidence score: 9/10" with no backing | Score is mechanically computed from evidence type count, not assessed |
| Ignoring cost of failure | Building something expensive to undo without acknowledging it | cost_of_being_wrong is a mandatory field |
| Skipping cheap verification | Assuming instead of testing when a test is easy | cheapest_verification is mandatory for every assumption and unknown |

**The key insight:** Axhy's evidence discipline is not about being conservative. It is about being honest. A bold idea with strong evidence (score 8+, risk 0-2) should proceed without hesitation. A bold idea with weak evidence should be tested, not killed. Only ideas with unacceptable risk or constitutional violations get rejected.

Generate boldly. Filter with evidence. Implement carefully. Learn permanently.

---

## 7. Avoiding Boot Bloat

This spec adds zero tokens to hot boot context right now. During implementation:

- The governing principle ("Imagination proposes. Evidence decides. Every important claim must declare its evidence type, freshness, assumptions, and cheapest verification path.") becomes one line (~30 tokens) in BOOT_DIGEST.md.
- The Evidence Decision Card schema lives in this spec (cold, retrieved via impactCheck when needed during brainstorming).
- The Claim Classification table lives in this spec (cold, retrieved when needed).
- The 8:2 scoring rubric lives in this spec (cold, retrieved when needed).

**Nothing from this spec enters CLAUDE.md.** The Self-Learning Layer spec already adds the failure fingerprint pointer to CLAUDE.md (one line). This companion spec needs no additional CLAUDE.md changes.

**Boot budget impact:** +30 tokens in BOOT_DIGEST.md. Total boot stays under ~4,230t (well within the ~4,200t ceiling from the Self-Learning Layer spec).

---

## 8. Integration with Existing Workflow

The Evidence Decision Card integrates into the existing brainstorming → planning → implementation pipeline:

```
1. User requests a feature / design
2. Brainstorming skill activates
   - Explores context, asks questions, proposes approaches
3. Evidence Decision Card written for the recommended approach    <-- NEW
   - Positive evidence, negative risks, assumptions, unknowns
   - Grounded 8:2 scoring
   - Claim Classification applied to key claims
4. Founder reviews card + design together
5. If approved: writing-plans skill creates implementation plan
6. check_before_build validates production readiness (E1-E14)
7. Implementation proceeds
8. Session retro scorecard records evidence discipline quality
```

Steps 1-2 and 4-8 already exist. Step 3 is the only addition. It slots between "we have a design" and "founder approves" — adding structured evidence before the approval decision, not after.

---

## 9. Scope Boundaries

All scope boundaries from the Self-Learning Layer spec (Section 6) remain in force. Additionally:

1. **Do not create a new memory system.** Evidence Decision Cards are written in design docs and brainstorming artifacts. They are not a separate storage layer. They get embedded in the brain via the normal `brain:build` process when the spec/design doc is indexed.

2. **Do not modify the brainstorming skill.** The Evidence Decision Card is a manual template applied during brainstorming, not an automated skill modification. Skill integration is a future consideration.

3. **Do not modify check_before_build.** The E1-E14 enterprise preflight is unchanged. The Evidence Decision Card operates at a different level (strategic fitness of ideas, not production readiness of code).

4. **Do not automate scoring.** The 8:2 score is computed manually by counting evidence types. Automated scoring (e.g., a guardrail that validates evidence scores) is deferred — it requires enough card examples to calibrate.

5. **Founder "just do it" escape hatch — narrowed.** The founder can skip Evidence Decision Cards for low/medium-risk reversible tasks. The escape hatch cannot bypass evidence review for security/privacy, data loss, tenant isolation, AI/personnel decisions, architecture changes, expensive/irreversible decisions, or anything contradicting locked docs. Founder judgment overrides process friction, but not constitutional safety.

---

## 10. Deferred Components

These were discussed in the ChatGPT conversation but are explicitly deferred per founder direction:

| Component | Why Deferred | When to Revisit |
|-----------|-------------|-----------------|
| Pattern Graph | Needs 15+ sessions of scorecard data to be meaningful | After Phase 6D |
| Research Engine | The tools exist (impactCheck, WebSearch); what's needed is protocol, not system | Phase 6C (behavioral retrieval) |
| Reality Filter | Overlaps with check_before_build E1-E14; needs clear separation before building | After Evidence Decision Card proves useful |
| Future Direction Memory | Quarterly founder review artifact, not hot boot content | After 20+ sessions of evolution data |
| Graduated Friction | Needs evidence that friction actually changes behavior | Phase 6D (15+ sessions minimum) |
| Experiment Loop (automated) | Manual experimentation already works; automation needs volume | Post-Phase 6D |
| Possibility Generator | Brainstorming skill already does this; no new component needed | N/A — covered by existing skill |

---

## 11. Validation Plan

Validation happens during Phase 6A implementation (defined in the Self-Learning Layer spec). The Evidence Decision Card is tested alongside the scorecard and fingerprint:

**Additional validation criteria for the companion spec:**

| Session | Evidence Discipline Check |
|---------|-------------------------|
| F1 | At least one Evidence Decision Card written for a non-trivial decision during the session. Card uses correct claim classification. Grounded scoring applied (not subjective). |
| F2 | Claims in the session's work are classified when they drive decisions. Speculation is not treated as proof. Assumptions include cheapest_verification. |
| F3 | Evidence discipline quality scored in the session retro scorecard. Founder reviews whether the card improved decision quality vs. added friction. |

**Exit criteria:**
- At least 2 Evidence Decision Cards written across F1-F3
- All cards use grounded scoring (evidence type count, not feeling)
- No speculation treated as decision truth
- Founder confirms the card adds value without excessive friction
- Boot stays under ~4,230t

---

## 12. What Happens After This Spec

1. Founder reviews this companion spec alongside the Self-Learning Layer spec.
2. If both approved, Phase 6A implementation begins as a single slice.
3. Phase 6A builds: scorecard, fingerprint, CLAUDE.md pointer (from Self-Learning Layer) + Evidence Decision Card template, Claim Classification reference, BOOT_DIGEST.md one-liner (from this spec).
4. Phase 6A validation runs 3 sessions (F1-F3) testing both behavioral memory and evidence discipline.
5. Founder signs off on Phase 6A.
6. Phase 6B-6D proceed per the Self-Learning Layer spec timeline.

**This companion spec does not have its own separate implementation phase.** It integrates into the Self-Learning Layer's Phase 6A. The three components here are lightweight enough to ship alongside the scorecard and fingerprint.
