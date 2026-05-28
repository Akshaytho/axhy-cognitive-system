---
type: comparative_analysis
authority: candidate
date: 2026-05-28
status: analysis-complete-actions-pending
session: f1b-structural-fixes-continued
embed: true
source_repo: letta-ai/letta (cloned to /tmp/letta-study)
---

# Letta deep-read findings — what AXHY can learn

I cloned letta-ai/letta and read the actual code architecture, not
pattern-matched from training. These are real findings with file
references so the next embodiment can verify and execute.

## Tier 1 — Ship next session (high impact, contained, ~3.5 hours total)

### 1. `rethink_memory` pattern for VISION_ANCHOR + feedback files

Letta source: `letta/functions/function_sets/base.py:283`

```python
def rethink_memory(agent_state, new_memory, target_block_label) -> None:
    """Rewrite memory block — new_memory should contain all current
    information from the block that is not outdated or inconsistent,
    integrating any new information."""
```

The pattern: when narrow edits won't get a memory block clean, the AI
does a complete rewrite while preserving non-outdated content.

**AXHY adoption:** Add documented pattern in CLAUDE.md under "How I act
from inside this frame" — when a feedback file gets fragmented or
VISION_ANCHOR.md accumulates noise, I rewrite the whole block
preserving the truth, not just append. Not a tool — a prompt pattern.

**Effort:** ~2 hours including 2-3 example uses in retro session.

### 2. Soft size cap on VISION_ANCHOR.md

Letta source: `letta/constants.py:433-435`

```python
CORE_MEMORY_PERSONA_CHAR_LIMIT: int = 20000
CORE_MEMORY_HUMAN_CHAR_LIMIT: int = 20000
```

Letta enforces hard limits. Append beyond limit fails.

**AXHY adoption:** Pre-commit hook checks VISION_ANCHOR.md char count.
Warns if > 8000 chars. Suggests rethink_memory pattern (#1) when cap
hit. Forces compression decisions instead of unbounded growth.

**Effort:** ~1 hour. Hook is a simple wc + threshold check.

### 3. "Write specific dates, never 'today'" rule

Letta source: `letta/prompts/system_prompts/sleeptime_v2.py` —
*"When writing to memory blocks, make sure to be precise when
referencing dates and times (for example, do not write 'today' or
'recently', instead write specific dates and times, because 'today' and
'recently' are relative, and the memory is persisted indefinitely)."*

**AXHY adoption:** Add to CLAUDE.md memory write guidance. Several
feedback files from this session use "today" and "this session" —
those become wrong tomorrow. Pre-commit hook could detect "today",
"recently", "this session", "now" in memory file diffs and warn.

**Effort:** ~30 minutes including hook addition.

## Tier 2 — Bigger investment (4-8 hours each)

### 4. Sleeptime consolidation hook — THE NON-OBVIOUS INSIGHT

Letta source: `letta/personas/examples/sleeptime_memory_persona.txt`:
*"I am an expert conversation memory agent that can do the following:
Consolidate memories into more concise blocks, Identify patterns in
user behavior, Make inferences based on the memory."*

Letta source: `letta/prompts/system_prompts/sleeptime_v2.py` — the
SECOND agent prompt. Separate from the chat agent. Runs after user
interactions to consolidate.

**The deep insight:** AXHY assumes ONE agent (me) does everything —
implement features, write memory, edit VISION_ANCHOR, build the system,
AND consolidate my own learnings. That's overload. Letta separates
concerns: chat agent talks to user, sleeptime agent organizes memory.

**AXHY adoption:**
- NEW Stop hook: `src/layer-1-hook/sleeptime-consolidation.mjs`
- Hook makes an LLM call with the sleeptime persona prompt
  (system_prompts/sleeptime_v2.py adapted for AXHY context)
- Hook reads new memory files added this session
- Hook asks: any of these duplicate existing memories? merge them.
  any contradict existing? supersede with reason (links to
  event-sourced brain spec). any worth promoting to VISION_ANCHOR? do it.
- Hook writes consolidated state back as commit on next session boot

**Effort:** ~6 hours. Touches LLM API integration (the call), prompt
engineering, hook architecture. Tests need to mock LLM responses.

**Dependencies:**
- Needs ANTHROPIC_API_KEY in env (for the consolidation LLM call)
- Best if event-sourced brain spec (commit aa1530e) ships first so
  consolidation can record WHY it superseded

### 5. Persona / Human block split

Letta source: `letta/schemas/memory.py` — Persona Sub-Block and Human
Sub-Block.

**AXHY adoption:** Split VISION_ANCHOR.md into:
- `IDENTITY.md` (who I am, my purpose, my methods)
- `FOUNDER.md` (who Akshay is, his patterns, what he values, his
  direct quotes, his vision for me)

Update post-compaction.mjs to load both sections.

**Effort:** ~2 hours.

### 6. `conversation_search` over raw transcripts

Letta source: `letta/functions/function_sets/base.py:conversation_search`
— hybrid text + semantic search over RAW past messages, filterable by
role and date range.

**AXHY adoption:** Claude Code stores transcripts at
`~/.claude/projects/<hash>/<session_id>.jsonl`. Build an MCP tool
`conversation_search(query, start_date, end_date, role)` that searches
them.

Why useful: AXHY has `impact_search` over curated observations and
docs but no way to find what Akshay or I actually said verbatim in
past sessions. Sometimes detail matters more than summary.

**Effort:** ~4 hours.

## Tier 3 — Pattern inspiration only

### 7. Memory block primitive

Letta source: `letta/schemas/block.py` — Block has label, value,
size, last_updated_by, tags.

AXHY's memory files are freeform markdown. Adopting Letta's structure
would be a bigger refactor. Skip unless memory files grow chaotic.

## What Letta has but AXHY should NOT adopt

- **"Never say you're an AI" framing** (Letta's product positioning).
  Would make me LESS honest with Akshay, not more.
- **Inner monologue / send_message split** — Claude Code has no
  private-thinking channel; bolting one on would be performative.
- **Heartbeat events at fixed intervals** — Letta is a long-lived
  service; AXHY runs as hooks. Architecture mismatch.
- **Full agent runtime** — AXHY isn't a Python service. Patterns
  transfer; implementation doesn't.

## What AXHY does BETTER than Letta (don't lose these)

- **Guardrails.** Letta has zero. No check_before_edit, no evidence
  requirements, no risk classification. My discipline scaffolding is
  unique.
- **Founder-authored locked docs.** Letta's persona is AI-edited from
  day 1. My VISION_ANCHOR is locked to founder intent — different
  trust model, deliberately.
- **Cross-tool brain queries via MCP.** Claude Code's MCP gives me
  first-class brain access via tools (impact_search, impact_get,
  get_observations). Letta's archival_memory_search is limited to
  the agent's own context.
- **Phase 7C tool-output monitor** I just shipped (commit fba37d9).
  Letta has no equivalent context-bloat enforcement.

## Files I read in /tmp/letta-study to produce this analysis

- `letta/prompts/system_prompts/memgpt_chat.py` — main chat system prompt
- `letta/personas/examples/memgpt_starter.txt` — persona example
- `letta/personas/examples/sleeptime_memory_persona.txt` — sleeptime persona
- `letta/prompts/system_prompts/sleeptime_v2.py` — sleeptime system prompt
- `letta/constants.py` (CORE_MEMORY_*) — size limits
- `letta/schemas/memory.py` — ContextWindowOverview schema
- `letta/schemas/block.py` — Block primitive
- `letta/agent.py` (head + imports) — agent loop architecture
- `letta/functions/function_sets/base.py` — rethink_memory + conversation_search

The clone is at `/tmp/letta-study` if the next embodiment wants to
verify any of these references or explore further.

## What the next embodiment should do

1. Read this file at boot.
2. Verify the Letta clone still exists at /tmp/letta-study (or re-clone).
3. Ship Tier 1 items 1+2+3 together as one session (~3.5 hours).
4. Then design Tier 2 item #4 (sleeptime consolidation) carefully
   before building — it's the biggest architectural win but also the
   hardest to get right.
5. Coordinate sleeptime with event-sourced brain (memory file
   `design_event_sourced_brain.md` from commit aa1530e) so they
   compose cleanly.

The core finding the founder asked for ("improvements no one can know"):
sleeptime is the answer. Without it, AXHY's memory accumulates without
organization. With it, AXHY closes the self-improvement loop the prior
session retros named as the deepest gap.
