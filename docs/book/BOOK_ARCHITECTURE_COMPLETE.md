---
type: milestone
date: 2026-05-26
status: complete
founder_signed_off: true
founder_score: 9.6/10
embed: true
---

# Book Architecture Migration — Complete

> Founder-signed off 2026-05-26. The lighter boot is validated for current use.

## What Changed

The Axhy cognitive system moved from preloading ~25,000 tokens of context at boot (48 memory files + full master plan) to a four-layer architecture that keeps ~3,600 tokens hot and retrieves the rest on demand.

**Before:** Load everything, hope context window survives.
**After:** Keep identity hot, keep current state hot, retrieve the Book when needed, verify with guardrails.

## The Four Layers

1. **Identity Seed (~2,600t, hot):** CORE_MIND.md + ENTERPRISE_PRODUCTION_STANDARD.md. WHO the AI is, HOW it thinks, WHAT bar it holds. Loaded every session. Never compressed.

2. **The Book (~96,000t, cold):** All product rules, feedback files, locked docs, specs, and master plan content indexed in pgvector (brain_entries table). Retrieved via `impactCheck("plain English description of task")` when needed. Section-level embeddings via field fanout.

3. **Working Focus (<5,000t, hot):** Current slice handoff (NEXT_SESSION.md + STATUS.md), memory index (pointers only), and master plan digest (navigation summary). Loaded at boot.

4. **Self-Questioning Retrieval:** The AI decides when to open the Book. impactCheck surfaces relevant brain content for the current task. The AI does not preload — it asks.

## Phase Summary

| Phase | What | Key Outcome |
|-------|------|-------------|
| 0 | Retrieval quality baseline | 15 intent tests created. Discovered all brain embeddings were fake PRNG (OPENAI_API_KEY missing from brain:build). Fixed with hard guard + correct command. |
| 1 | CLAUDE.md slimming | Removed preloaded memory file references. Added digest-first workflow. |
| 2 | Memory index compression | Memory index became pointers-only (read index, not files). |
| 3 | Memory index-only boot | Boot loads index headers only. Content retrieved via brain when needed. |
| 4 | Hot/cold split | CLAUDE.md hot/cold diff table approved. Identity seed stays hot. Everything else is cold or digest. |
| 5 | Real-session validation | 5 sessions across 5 task types. All CLEAN PASS. Zero critical regressions. |

## Phase 5 Validation Results

| Session | Type | Verdict | Key Brain Retrievals |
|---------|------|---------|---------------------|
| A | Backend / Security | CLEAN PASS | E1/E2 enterprise rules, tenant isolation, security gaps |
| B | Mobile / Worker | CLEAN PASS | Wake-lock safety, 48pt tap targets, capture flow, known CRITs |
| C | Documentation / Planning | CLEAN PASS | Open questions Q1-Q13, locked iteration status, source-of-truth hierarchy |
| D | Bugfix / Refactor | CLEAN PASS | Exact token values, guardrail challenge/approval cycle, sibling pattern detection |
| E | Full Slice Review | CLEAN PASS | Enterprise E4/E5 locked docs, visitMachine spec, CRIT-1/HIGH-3/HIGH-4, verification checklists |

## Major Safety Discoveries

1. **Fake PRNG embeddings (Phase 0):** The embed() function silently fell back to deterministic PRNG vectors when OPENAI_API_KEY was missing. Brain appeared to work but retrieval was random noise (~0.08 cosine similarity). Fix: hard guard in brain-builder.ts that exits on missing key. PRNG preserved only behind explicit `BRAIN_ALLOW_FAKE_EMBEDDINGS=true` gate.

2. **MCP server also needed OPENAI_API_KEY (Phase 5, Session A):** Brain content had real embeddings (from brain:build), but query embeddings were fake because the MCP guardrail server process did not have the API key. The MCP server is a separate process — its ONLY env source is the `.mcp.json` env block. Fix: added OPENAI_API_KEY to .mcp.json (untracked, never committed).

3. **Field fanout required for section-level retrieval:** Without `FIELD_FANOUT_ENABLED=true`, large documents are embedded as single vectors. Section-level splitting (at H1-H3 headings) produces more precise retrieval for specific rules within large docs.

4. **Digest must remain navigation, not authority:** The master plan digest has `authority_level: digest` and `promote_to_locked: false`. It is a ~2,000-token navigation summary. It must never be treated as a source of truth for implementation decisions. The hierarchy: digest (navigation) < impactCheck (detail) < full master plan (authority) < locked docs (constitutional).

## Current Boot Model

**Hot (loaded every session, ~3,600t):**
- `CORE_MIND.md` — temperament, maturity modes, learning lifecycle
- `ENTERPRISE_PRODUCTION_STANDARD.md` — E1-E14 non-negotiable baseline
- `BOOT_DIGEST.md` — universal rules at-a-glance
- `MASTER_PLAN_DIGEST.md` — navigation summary of the master plan
- Memory index (headers only, no file content)
- Handoff: `NEXT_SESSION.md` + `STATUS.md`

**Cold (retrieved via impactCheck on demand):**
- 19 feedback/learning memory files
- Full master plan content (3,309 lines)
- All locked docs (18 files in docs/locked/)
- All specs, personas, retros, audits
- Session activity and learnings

## Product Issues Discovered (Not Book Architecture Regressions)

The validation sessions surfaced real product bugs that the improved retrieval correctly exposed. These are backlog items for dedicated fix slices:

1. **CRIT-1:** R2 object key userId vs workerId mismatch — every photo uploaded goes to the wrong path, resulting in 404 on view
2. **HIGH-3:** No visit ownership check before generating presigned upload URLs — any worker can get URLs for any visitId
3. **HIGH-4:** verify-status endpoint bypasses tenant context (withTenantContext not used)
4. **CRIT-4:** Timer elapsed state not persisted on back navigation — accidental back press loses all timing data
5. **review.tsx:** Missing wake-lock on FinalReviewScreen (mandatory per feedback_keep_awake_work_screens.md)

## What Must Not Change

- Identity seed files (CORE_MIND.md, ENTERPRISE_PRODUCTION_STANDARD.md) are never compressed
- Guardrails, hooks, brain schema, and config are unchanged
- Digest authority level stays at `digest` — never promoted to `locked`
- CLAUDE.md is not compressed further without founder approval
- No new compression phases without explicit founder decision
