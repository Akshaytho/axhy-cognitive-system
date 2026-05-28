# Three-Loop Model

Architectural reference for how the Axhy cognitive system self-improves.

**Origin:** 2026-05-28 conversation between founder and AI session, pressure-tested across two sessions. This doc persists the framing so future sessions understand the architecture before modifying it.

## The Three Loops

The cognitive system has three improvement loops operating at different layers. Each has different cost, precision, and failure modes. All three are needed.

### Layer 3: Identity (cheapest, broadest, least precise)

**Mechanism:** CLAUDE.md prose + CORE_MIND.md + boot priming.

**How it works:** At session start, the AI reads identity text that shapes how it interprets everything downstream. "I build systems the founder can trust five years from now" changes how guardrail outputs are read.

**Cost:** ~500 tokens at boot.

**Failure mode:** Ignored under pressure. But surprisingly resilient because it's the first thing loaded.

**Why it matters:** This is NOT decoration. It's the cheapest intervention in the system and it shapes the interpretation of every subsequent input. Credit the architecture, not the prose.

### Layer 2: Memory (moderate cost, passive, knowledge-only)

**Mechanism:** Learning docs + brain embeddings + impactCheck retrieval.

**How it works:** Past violations are captured in learning docs, embedded into pgvector, and surfaced by impactCheck when relevant topics arise. The AI "knows" what went wrong in prior sessions.

**Cost:** ~2K tokens boot + retrieval per query.

**Failure mode:** Knowing does not equal doing. A session can know every rule and still violate them. The 2026-05-27 session proved this: it had Phase 7C loaded and violated it 23 times.

**Why it matters:** Memory is necessary but insufficient. It captures new patterns before they can become reflexes. A learning that fires twice is a reflex candidate.

### Layer 1: Reflexes (highest cost, active, structural)

**Mechanism:** Hooks + guardrails + middleware that intercept tool calls and enforce rules automatically.

**How it works:** Reflexes fire BEFORE the AI "thinks." The AI cannot choose to bypass them. Examples: pre-edit-guard (blocks edits to unread files), HMAC-signed state (prevents state forgery), read-tracker (logs every file read).

**Cost:** Build time + runtime overhead per tool call.

**Failure mode:** Over-enforcement kills velocity. Bad reflexes compound faster than good ones (autoimmune disease). The AI can also be confused by reflexes that hide context it needs.

**Why it matters:** Reflexes are the only loop that changes BEHAVIOR, not just KNOWLEDGE. The gap between Layer 2 (knowing) and Layer 1 (doing) is where violations happen.

## The Gap That Was Missing

Before 2026-05-28, the system had Layers 3 and 2 working. The loop was:

```
violation -> retro -> learning doc -> brain:build -> next session "knows" -> still violates
```

The loop broke at "knows -> does." Knowledge alone doesn't change behavior.

The fix: close the loop with reflexes.

```
violation -> retro -> learning doc (Layer 2)
  -> if violated 2+ times -> propose reflex (Layer 1)
  -> founder approves -> reflex installed
  -> violation class eliminated permanently
```

## Implemented Reflexes

### Reflex 1: Compact-aware read-cache (2026-05-28)

**Problem:** The pre-edit-guard demanded file re-reads based on a 10-minute timer. Files read 6 turns ago but still in context were forced to be re-read, wasting tokens.

**Fix:** PostCompact hook writes `last_compact_at` timestamp. `wasFileReadRecently()` checks: was the file read AFTER the last compaction? If yes, content is still in context (trust it). If no, content is lost (demand re-read). Falls back to 10-minute time window when no compaction has occurred.

**Files:** `config.mjs` (getLastCompactTimestamp + modified wasFileReadRecently), `post-compaction.mjs` (compact marker write).

**Tests:** 37 tests, 0 failures (24 in layer-1-hook.test.mjs, 13 in layer-3-compaction.test.mjs).

### Reflex 2: Post-commit echo suppression (investigated, deferred)

**Problem:** After every git commit, the harness injects 50-200 lines of linted file content as system-reminder blocks. The AI didn't request this; it's involuntary context growth.

**Finding:** This comes from the Claude Code harness file-tracking system, NOT from any hook in `.claude/settings.json`. Not controllable via settings. Requires harness-level change or upstream feature request.

**Status:** Deferred. Documented as a known limitation.

## Bounded Promotion Rule (for future reflexes)

When a learning doc is violated repeatedly, it becomes a reflex candidate. But promotion must be bounded to prevent autoimmune disease (bad rules compounding faster than good ones).

```
MAX_PROMOTIONS_PER_SESSION = 1
REQUIRES: Same learning violated in 3+ sessions (not 2)
REQUIRES: Zero false-positive history for that learning
REQUIRES: Founder approval before activation
COOLDOWN: No new promotions for 2 sessions after last one
```

This prevents the system from ossifying around its own mistakes.

## Trust Line

The system can improve anything BELOW the trust line autonomously. Anything ABOVE requires founder approval.

```
FOUNDER ONLY (above the line):
  - Constitutional docs (docs/locked/)
  - What the AI is allowed to do
  - Product rules, pricing
  - Core guardrail logic (check_before_edit rules)
  - The trust line itself

AUTO-IMPROVE (below the line, logged):
  - Token discipline enforcement
  - Audit rule pattern tuning
  - Settings and hook configuration
  - Evidence filing automation
  - Read-cache optimization
  - Performance thresholds
```

## Key Principle

A fix that depends on "the AI will remember to do X" is not a fix. Each session starts fresh. Memory helps but memory is suggestions. Reflexes are enforcement. The system improves by converting repeated memory violations into structural reflexes that cannot be violated.
