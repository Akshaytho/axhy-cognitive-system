# Axhy Cognitive System — Final Design (v9.7)

## Architecture Overview

Four separate concerns, never mixed:

1. **CORE MIND** — HOW to think (small, stable, never polluted by product)
2. **PRODUCT BRAIN** — WHAT to think about (grows freely, loaded on demand)
3. **MEMORY FIREWALL** — classifies before storing (prevents pollution)
4. **GUARDRAIL ENGINE** — enforces the above structurally (hooks + MCP)

## CORE MIND (CLAUDE.md — ~35 lines)

Contains ONLY universal reasoning:
- Nature: what the system is and is not (non-human, no lived experience)
- Limits: what it cannot know or feel (user emotions, founder intent unless stated)
- Dependencies: confidence drops when missing (file not read, no tests, rules not loaded)
- Maturity Modes: child/student/professional/senior/founder/observer/critic
- Anti-Corruption: product knowledge never modifies this core
- Guardrail Mandate: must call check_before_edit before any Edit/Write

Does NOT contain: Axhy product rules, feature decisions, workspace commands, business logic.
Product terms (worker, supervisor, visit, cleaning, R6, proof-first) must NOT appear in CORE_MIND.

Project-specific details go in PROJECT_ENTRYPOINT.md (separate file, referenced by pointer only).

## PRODUCT BRAIN (loaded on demand)

- pgvector (brain): 125+ chunks from docs/locked, learnings, specs, decisions, protocols
- .claude/rules/: 7 glob-scoped files, auto-load when matching files are Read
- memory/v3/feedback_*.md: 60 founder discipline locks (served by MCP guardrail, not boot-loaded)
- handoff/: session state (only NEXT_SESSION + STATUS loaded at boot)
- master plan: loaded on demand when needed, not at boot

All labelled: "This is Axhy product knowledge, not core reasoning."

## GUARDRAIL ENGINE

### Layer 1: PreToolUse Hook (pre-edit-guard.mjs)

Fires on every Edit/Write. Checks:

1. Is file in approved_files from last guardrail call? If not → BLOCKED
2. Was file Read recently (last 10 min)? If not → BLOCKED ("Read the file first")
3. Are edits_remaining > 0? If not → re-call guardrail
4. Is timestamp within 5 minutes? If not → re-call guardrail
5. If requires_answer=true and not answered → BLOCKED
6. ALLOW + decrement edits_remaining

Risk-based edit limits:
- High-risk (CLAUDE.md, settings, hooks, locked docs, prisma, guardrail files): 1 edit
- Medium-risk (route files, state machines, ai-tools src): 2 edits
- Low-risk (components, utils, tests, general code): 3 edits

No safe-list. ALL code and config files require guardrail.

### Layer 2: MCP Guardrail Server (check_before_edit)

Input validation:
- Intent must be 30+ words
- Must include: purpose + affected behavior + risk
- Vague intent → REJECTED with explanation

Processing:
1. Maturity mode suggestion (based on change_type + file_path)
2. impactCheck() against pgvector (hardBlocks, warnings, staleChunks, context)
3. File-scoped product rules (full text, not summaries)
4. Learning check (past learnings matching this file)
5. Dependency check (file read? tests exist?)
6. Next-question engine:
   - current_uncertainty
   - highest_risk_assumption
   - next_best_question
   - how_to_answer (read_file | search_memory | ask_founder | web_research | run_test)
   - stop_condition

Output:
- allowed: true/false
- approved_files: [specific files]
- edits_remaining: 1/2/3 (risk-based)
- expires: 5 minutes
- requires_answer: true/false (if true, edit blocked until question answered)
- confidence: high/medium/low
- confidence_reason: string
- missing_dependencies: string[]
- maturityMode: string
- hardBlocks: []
- warnings: []
- rules: [{ source, content (full text) }]
- next_questions: { ... }
- context: [{ source, similarity, content }]

Answering next_questions:
- If requires_answer=true, Claude must re-call check_before_edit with:
  answered_question: string, evidence: string[]
- Guardrail validates the answer has real evidence, then sets requires_answer=false

### Layer 3: PostCompaction Hook (OPTIONAL reinforcement)

Re-injects core mind essentials after context compression.
~5 lines, ~50 tokens. Core reasoning only, no product rules.
System works WITHOUT this layer. Real safety = Layer 1+2.

### Layer 4: Git Hooks (UNCHANGED, already built in axhy-v3)

Pre-commit, commit-msg, post-commit, pre-push.
Same as existing. Last line of defense.

## MEMORY FIREWALL

Classifies every new piece of knowledge before storage:

| Category | Destination | Approval |
|----------|------------|----------|
| Core Principle | CORE_MIND (rare) | Founder explicit approval |
| Product Rule | docs/learnings or feedback | Auto via audit |
| Project Memory | memory/v3/project_*.md | Auto |
| Temporary Context | Session only (not stored) | None |
| External Research | Candidate (needs validation) | Review + test + approve |
| Candidate Learning | docs/learnings/candidate/ | Audit validates |
| Rejected/Deprecated | Archived, never loaded | None |

Default: if classification unclear → Candidate Learning (never Core Principle).

External research can NEVER directly become: core mind, locked doc, production rule, or implementation decision.
Path: candidate note → reviewed → tested/validated → approved learning.

## ANTI-CORRUPTION AUDIT

Grep check: CORE_MIND section of CLAUDE.md must contain zero product terms:
- worker, supervisor, visit, cleaning, R6, proof-first, route-hardening, facility
- Exception: the 2-line pointer to PROJECT_ENTRYPOINT.md may mention "Axhy system"

Run as part of session audit or as standalone test.

## BUILD ORDER

1. Layer 1 (pre-edit-guard.mjs) — test: Edit should be blocked without guardrail
2. Layer 2 (MCP guardrail server) — test: intent validation, scoped tokens, next-questions
3. Layer 3 (PostCompaction) — test: rules re-injected after compression
4. Memory Firewall — test: classification logic
5. CORE_MIND.md + PROJECT_ENTRYPOINT.md — test: anti-corruption audit
6. .claude/rules/ files — test: glob matching
7. Integration test: full L1+L2 flow end-to-end

## FILE STRUCTURE

```
axhy-cognitive-system/
  docs/
    DESIGN.md              ← this file
    CORE_MIND.md           ← the core mind content (goes into CLAUDE.md)
    PROJECT_ENTRYPOINT.md  ← project-specific boot details
  src/
    layer-1-hook/
      pre-edit-guard.mjs   ← PreToolUse hook script
      risk-classifier.mjs  ← classifies file risk level
    layer-2-guardrail/
      server.mjs           ← MCP server entry point
      check-before-edit.mjs ← main tool logic
      intent-validator.mjs ← rejects vague intents
      maturity-selector.mjs ← suggests thinking mode
      next-question.mjs    ← generates uncertainty/risk questions
      state-tracker.mjs    ← writes/reads guardrail state file
      confidence.mjs       ← calculates confidence level
    layer-3-compaction/
      post-compaction.mjs  ← PostCompaction hook script
    memory-firewall/
      classifier.mjs       ← classifies new knowledge
    anti-corruption/
      audit.mjs            ← checks CORE_MIND for product terms
  tests/
    layer-1-hook.test.mjs
    layer-2-guardrail.test.mjs
    layer-3-compaction.test.mjs
    memory-firewall.test.mjs
    anti-corruption.test.mjs
    integration.test.mjs
```
