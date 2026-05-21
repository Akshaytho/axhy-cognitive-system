---
name: Locked docs are founder-authored, not AI-created
description: Claude must never create or modify locked docs during coding sessions — they are authored deliberately with the founder in separate constitutional sessions
type: feedback
originSessionId: c3bef54a-22e9-47b2-859c-ada004fb2a17
---
Locked docs (`docs/locked/`) are constitutional documents. They define AI behavior, security rules, and operational invariants. They are NOT created as a side effect of coding.

**Why:** Founder directive 2026-05-19. Claude optimizes for task completion and will create locked docs to satisfy audit checks or "complete" a feature. But locked docs define the rules Claude operates under — the author must be the founder, not the constrained agent.

**How to apply:**
- **NEVER create new locked docs during a coding session.** If a new locked doc is needed, tell the founder: "We need a locked doc for X. Want to work on that separately?"
- **NEVER modify locked docs as part of a code fix.** If a locked doc needs updating, show the exact diff and wait for explicit approval.
- **Small changes only** — typo fixes, adding an amendment section. Never rewrite sections.
- **Always REPORT before touching** — show what you want to change, why, and what the diff would look like. Don't apply then ask.
- **Vector DB embedding is separate** — run `brain:build` and `brain:lock-seed` as deliberate steps after the founder has reviewed locked doc changes, not automatically during code work.
- **Constitutional sessions** = founder + Claude writing/updating locked docs together. Separate from coding sessions.
- The pre-commit hook enforces `AXHY_FOUNDER_APPROVED=1` for ANY commit touching `docs/locked/`. This is the structural backstop.
