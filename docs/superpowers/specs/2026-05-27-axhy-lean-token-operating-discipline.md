# Phase 7: Lean Token Operating Discipline

**Date:** 2026-05-27
**Status:** Pending founder review
**Authority level:** Spec (not locked, not implemented)
**Founder review of architect feedback:** 9/10
**Predecessor:** Phase 6 (Self-Learning Layer + Evidence-Based Evolution)
**Principle:** Before building memory infrastructure, stop obvious context waste.

---

## 0. Why This Phase Exists

Book Architecture (Phase 5) reduced boot from ~25,000t to ~3,600t. That solved the preload problem.

But a shared session on 2026-05-26 showed:

| Metric | Value |
|--------|-------|
| total_processed | ~66.37M |
| cache_read | ~64.97M (98%) |
| cache_creation | ~953K |
| output_tokens | ~438K |
| fresh_input | ~8.8K |

The working panel grows over hundreds of turns and is re-read as cache on every turn. Boot was a small fraction. The real cost drivers are cache_creation, output_tokens, and repeated context growth from large tool outputs staying in chat.

Phase 7 targets working-panel growth, not boot.

### Key correction (architect feedback, founder-approved)

The original Phase 7 proposal had 14 components (Work Pages, Update Pages, Brain zones, Current State Resolver, etc.). The architect review identified:

1. **Thresholds were on the wrong number.** total_processed is 98% cache_read (cheap). Thresholds must track cost-driving parts separately.
2. **Evidence capsules as YAML ceremony may cost more tokens than they save.** Each capsule requires 3-4 extra tool calls. Simpler pattern: redirect output to file, return one-line conclusion.
3. **Simpler alternatives were not explored.** Shorter sessions + guardrail response compression may solve 80% of the problem with no new architecture.

The founder agreed and narrowed Phase 7 to lean operating discipline first.

---

## 1. Measurement Model

### What to measure (per session)

| Metric | Source | Why it matters |
|--------|--------|---------------|
| fresh_input_tokens | JSONL usage blocks | Expensive. Direct API cost. |
| cache_creation_tokens | JSONL usage blocks | Expensive. Fills the cache window. |
| cache_read_tokens | JSONL usage blocks | Cheap (~1/10th cost). Shows context size. |
| output_tokens | JSONL usage blocks | Expensive. Direct API cost. |
| turn_count | Count of usage blocks | Proxy for conversation length. |
| tool_call_count | Count of tool_use blocks | Proxy for overhead per task. |
| full_file_reads | Count of Read tool calls | Each adds file content to context. |
| large_outputs_in_chat | Count of tool results > 2000 chars | These should be in files, not chat. |

### Two pressure scores

**Cost pressure** = what actually costs money:

```
cost_pressure = cache_creation + output_tokens + fresh_input
```

This is the number that maps to API billing. cache_read is excluded because it costs ~1/10th per token.

**Context pressure** = what makes the working panel grow:

```
context_pressure = cache_read growth rate + turn_count + large_outputs_in_chat
```

This is the number that predicts when a session becomes unwieldy. High context pressure means the next turn re-reads more cached context, tool calls take longer, and compaction risk increases.

### Thresholds (on cost_pressure, not total_processed)

| Level | cost_pressure | Action |
|-------|--------------|--------|
| Green | 0 - 2M | Continue normally. |
| Yellow | 2M - 4M | Avoid full-file reads. Redirect large outputs to files. |
| Orange | 4M - 6M | Write checkpoint. Move remaining evidence out of chat. |
| Red | 6M - 8M | Finish current task, write handoff, start fresh session. |
| Black | 8M+ | Emergency/security only. |

Note: These thresholds are initial estimates. Phase 7B implementation will calibrate them against real session data from F1/F31 validation.

---

## 2. Short-Session Policy

### Rule

One session = one slice (or one coherent task).

### When to end a session

At any natural boundary:
- Task complete (code committed, tests passing)
- Phase boundary within a multi-phase task
- After ~50 turns of active work
- When cost_pressure hits Orange

### Session-end protocol

1. Commit all code changes
2. Write evidence files for any large outputs
3. Update handoff (`NEXT_SESSION.md`)
4. Start fresh session

### Why this works now

Book Architecture made boot cheap (~3,600t). Four short sessions cost ~14,400t extra boot but keep each session under the Yellow threshold. One long session saves 10,800t of boot but accumulates 60M+ of context growth.

The math is clear: short sessions win.

---

## 3. Tool-Output-to-File Discipline

### Problem

Large tool outputs (psql results, test logs, grep scans, audit output, brain:build logs) enter the chat context and stay there for the rest of the session. A single psql query result can be 5,000+ characters that get re-read on every subsequent turn.

### Rule

If a tool output exceeds ~2,000 characters, save the full output to a file and keep only a one-line evidence reference in chat.

### Evidence file location

```
docs/evidence/YYYY-MM-DD/EVID-NNN-short-description.md
```

Create the date directory if it does not exist.

### Evidence line format (in chat)

```
EVID-NNN | type | conclusion | full: docs/evidence/YYYY-MM-DD/EVID-NNN.md
```

Examples:

```
EVID-031 | psql | 7 orphan workers with null userId | full: docs/evidence/2026-05-27/EVID-031.md
EVID-032 | test-run | 469/469 green, 0 failures | full: docs/evidence/2026-05-27/EVID-032.md
EVID-033 | grep | requireRole used in 14 route files | full: docs/evidence/2026-05-27/EVID-033.md
```

### What does NOT need evidence files

- Short tool outputs (< 2,000 chars) — keep in chat
- Simple confirmations ("file written", "commit created")
- Single-line grep results
- Screenshot references

### No YAML ceremony

Do not wrap evidence lines in YAML blocks, capsule objects, or structured templates unless the evidence is genuinely complex (multi-part investigation with dependencies). The one-line format is the default.

---

## 4. Guardrail Compact Mode

### Problem

Guardrail responses (check_before_build, check_before_edit, check_before_done) are verbose. An approved response can be 2,000+ characters with full JSON. Over a session with 20+ guardrail interactions, this adds significant context.

### Target: compact approved responses

Approved responses should be compact:

```json
{"decision": "approved", "risk": "medium", "edits_remaining": 3, "expires": "5 min"}
```

### Target: focused blocked responses

Blocked responses should include only the blocker and the exact action needed:

```json
{"decision": "blocked", "reason": "file not read recently", "action": "read timer.tsx lines 140-180"}
```

### Verbose mode

Full explanation only when:
- Explicitly requested ("explain the block")
- The block involves a locked doc conflict
- The block involves a security boundary

### Implementation note

This requires changes to the guardrail MCP server response format. It is a separate implementation slice (Phase 7D) that needs its own check_before_build. This spec defines the target; it does not authorize the change.

---

## 5. Minimal Checkpoint Rollup

### When to write a checkpoint

- At session end (always)
- At phase boundaries within multi-phase work
- When cost_pressure hits Orange
- After completing a major sub-task

### Checkpoint format

```markdown
## Checkpoint: [task name] — [timestamp]

**Done:**
- [what was completed]

**Evidence:**
- EVID-031, EVID-032 (paths in evidence dir)

**Open risks:**
- [what could still break]

**Next action:**
- [exactly what the next session should do first]

**Token snapshot:**
- cost_pressure: ~2.1M (Green)
- turns: 34
- large outputs redirected: 3
```

### What this is NOT

This is not a full typed rollup system with separate work/code/evidence/decision/risk/founder/token rollups. That was the original Phase 7D proposal. It is deferred.

This is a single flat checkpoint that captures the minimum a fresh session needs to resume.

---

## 6. Validation Plan

### Validation tasks

Use F1 (JWT trust gap fix) and F31 (anonymize PII leak fix) as real validation targets.

### What to measure

For each validation task, record:

| Metric | F1 baseline | F31 baseline | Target |
|--------|------------|-------------|--------|
| cost_pressure | (measure) | (measure) | < 4M (Yellow) |
| context_pressure | (measure) | (measure) | < 20M cache_read |
| turn_count | (measure) | (measure) | < 60 |
| tool_call_count | (measure) | (measure) | (informational) |
| large_outputs_in_chat | (measure) | (measure) | 0 (all redirected) |
| full_file_reads | (measure) | (measure) | (informational) |
| quality regressions | (measure) | (measure) | 0 |
| missed dependencies | (measure) | (measure) | 0 |
| guardrail behavior | (measure) | (measure) | no bypasses |
| evidence completeness | (measure) | (measure) | all findings documented |

### Success criteria

Phase 7 lean discipline is validated if:

1. F1 and F31 each complete with cost_pressure < 4M (Yellow threshold)
2. No quality regressions compared to prior heavy sessions
3. All evidence is captured in files, not lost in chat
4. Session length stays under ~60 turns

### Failure criteria (triggers deeper infrastructure)

If after applying lean discipline:
- Heavy sessions still exceed 6M cost_pressure (Orange), OR
- Dependencies are repeatedly missed due to short sessions losing context, OR
- Evidence files become unmanageable without indexing

Then implement Phase 8 (Work Pages, brain zones, typed compaction).

---

## 7. Deferred Architecture (Phase 8+)

The following components from the original Phase 7 proposal are deferred. They are good ideas. They are not needed yet.

### Deferred components

| Component | What it does | Trigger for building |
|-----------|-------------|---------------------|
| Work Pages | Detailed cold page per work item, brain-indexed | Evidence files > 20 per task, context loss between sessions |
| Update Pages | Append-only change log per work item | Work items with 3+ scope changes mid-task |
| Typed checkpoint rollups | Separate work/code/evidence/decision/risk rollups | Flat checkpoints proven insufficient for complex tasks |
| Active Work View | Structured hot context for current task only | Short sessions repeatedly missing dependencies |
| Working/Canonical/Archive brain zones | Three-tier retrieval with temporal decay | Brain retrieval returning stale results consistently |
| Current State Resolver | Priority-based truth resolver across pages | Update Pages + Work Pages exist and sometimes conflict |
| Project Ledger | Cross-session project state tracker | 5+ sessions on same feature losing continuity |
| Decision Cards | Structured decision records per choice | Phase 6 Evidence Decision Card proves insufficient |

### How to revisit

After F1/F31 validation:
1. Review measurement data
2. If cost_pressure > 6M or quality regressions occur, identify which deferred component addresses the gap
3. Build only that component, not the full set
4. Re-validate

---

## 8. Scope Boundaries

### This spec does NOT authorize

- Changes to CLAUDE.md
- Changes to guardrail behavior or MCP tools
- Changes to brain schema or retrieval
- Changes to hook commands in settings.json
- Changes to .axhy/config.json budgets/timeouts
- Changes to locked docs
- Changes to CORE_MIND.md or ENTERPRISE_PRODUCTION_STANDARD.md
- Deletion of any memory files

### This spec DOES authorize (after founder review)

- Phase 7B: Token measurement tool (new script in packages/ai-tools/)
- Phase 7C: Tool-output-to-file discipline (behavioral, no code required)
- Phase 7D: Guardrail compact mode (MCP server response format change — separate slice)
- Phase 7E: Short-session policy (behavioral, no code required)

### Implementation order

```
7A: This spec (write and stop)          ← you are here
7B: Token measurement tool              ← first code change
7C: Tool-output discipline              ← behavioral, start using immediately
7D: Guardrail compact mode              ← separate slice with own preflight
7E: Short-session policy                ← behavioral, start using immediately
    ↓
    Validate on F1 + F31
    ↓
    Return to product work
    ↓
    Phase 8 only if measurement proves needed
```

---

## 9. Relationship to Prior Phases

| Phase | What it solved | Status |
|-------|---------------|--------|
| Phase 5 (Book Architecture) | Boot bloat: 25K → 3,600t | Complete, validated |
| Phase 6A (Failure Fingerprint) | Behavioral awareness at boot | Complete, validated |
| Phase 6 (Evidence-Based Evolution) | Evidence discipline for decisions | Spec complete, validation pending |
| **Phase 7 (Lean Token Discipline)** | **Working-panel growth during sessions** | **This spec** |
| Phase 8 (Brain-Native Work Memory) | Complex multi-session work tracking | Deferred |

The principle connecting them:

```
Phase 5: Don't preload what the brain can retrieve.
Phase 6: Don't claim what evidence can't support.
Phase 7: Don't keep in chat what a file can hold.
Phase 8: Don't keep in files what the brain can index.
```

---

*Spec ends here. Do not implement until founder reviews and approves.*
