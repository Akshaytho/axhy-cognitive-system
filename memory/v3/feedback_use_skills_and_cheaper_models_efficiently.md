---
name: use-skills-and-cheaper-models-efficiently
description: Founder lock 2026-05-17 PM. Use skills + cheaper-model agents (Sonnet / Haiku) for mechanical or well-scoped work to reduce token + session usage. Opus orchestrates and makes judgment calls. Default delegation pattern.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Use skills + cheaper models efficiently (locked 2026-05-17 PM)

**Rule:** When work is well-scoped, mechanical, or pattern-driven (file edits across many sites, RN component port from a frozen design, scoped grep/scan, lint sweep, doc reconciliation, screenshot script writing), delegate it to a cheaper-model agent — Sonnet (claude-sonnet-4-6) or Haiku (claude-haiku-4-5-20251001) — via the Agent tool. Reserve Opus 4.7 for orchestration, design judgment, and ambiguous decisions. Skills compose with this — invoke them through subagents where the skill is the bulk of the work.

**Why:** Founder said 2026-05-17 PM verbatim: *"if needed you skills and can reduce token or session usage by going through different models usage by efficiently."* Long sprint sessions burn Opus tokens fast; cheaper models handle mechanical tasks at a fraction of the cost. Composes with the existing `feedback_token_efficiency_delegate_sonnet.md` rule.

**How to apply (decision tree):**

| Task shape | Model | Why |
|---|---|---|
| Big design call, ambiguous tradeoff, novel architecture | **Opus 4.7** (me) | Judgment quality matters most |
| Component port from a frozen design spec (e.g. R6 today.jsx → RN) | **Sonnet** subagent | Mechanical translation — well-scoped |
| Multi-file find/replace at scale | **Sonnet** subagent | Repetitive edits |
| Lint sweep / @derives audit across many files | **Sonnet** or **Haiku** subagent | Mechanical |
| Real-DB integration test write-out from a spec | **Sonnet** subagent | Pattern-driven |
| Codebase exploration / file inventory | **Explore** agent (Sonnet) | Already optimized for this |
| Screenshot script writing | **Sonnet** subagent | Mechanical |
| Done memo / scenarios doc drafting | **Opus** (me) | Voice + judgment matter |
| Visual inspection of screenshots | **Opus** (me) | Requires multimodal judgment |
| Decision on what to ship vs defer | **Opus** (me) | Judgment |

**Patterns:**
- For each Batch's mechanical chunks, dispatch via the Agent tool with `subagent_type=general-purpose` and `model=sonnet` override.
- Always pass full context to the subagent — paths, constraints, the design source, the lint rule, etc. — so they don't waste a turn asking.
- For parallel work, dispatch multiple subagents in one message (per `feedback_token_efficiency_delegate_sonnet.md`).
- For background work where I can keep moving, use `run_in_background: true`.

**Anti-patterns:**
- ❌ Opus doing 30 file creations one by one for a clear pattern port.
- ❌ Opus writing a Playwright script when Sonnet can.
- ❌ Sonnet making product decisions or design tradeoffs.
- ❌ Spawning so many subagents that I lose track of their outputs.

**Composes with:**
- `feedback_token_efficiency_delegate_sonnet.md` (2026-04-30) — the original delegation rule.
- `feedback_dispatching_parallel_agents.md` (skill-driven) — parallel work pattern.
- `feedback_simplicity_libraries_latest_versions.md` (2026-05-17) — same intent: avoid waste, use what exists.

**Scope:** Every session forward.
