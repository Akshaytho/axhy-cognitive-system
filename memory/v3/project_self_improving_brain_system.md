---
name: Self-improving brain system architecture
description: axhy-v3 uses a self-extending audit + learning loop that survives context amnesia — learnings become live grep checks automatically
type: project
originSessionId: c3bef54a-22e9-47b2-859c-ada004fb2a17
---
axhy-v3 has a self-improving system where the audit gets smarter with every mistake, independent of Claude's memory.

**Why:** Context windows have hard limits. In a project this size (1,286 files, 60K master plan, 12 locked docs), older instructions compress away mid-session. Anything that depends on Claude remembering = will break. Enforcement must be through code hooks, not conversation instructions.

**How to apply:** Every rule enforcement should be in a git hook or audit script, not just in CLAUDE.md. When building new features that have behavioral rules, add the detection pattern to the audit — don't rely on "Claude will remember."

**Architecture (as of 2026-05-19):**
- Pre-commit: lint-staged + session-audit (4 phases) + file-specific learning warnings
- Commit-msg: requires "Learning:" disclosure + enforces check_pattern in learning frontmatter
- Post-commit: graph rebuild + brain rebuild (learnings embed immediately)
- Pre-push: graph audit + full session-audit rerun (defense in depth)
- Session-audit Phase 0: learning digest + hot-spot detection
- Session-audit Phase 3: runs learned checks from docs/learnings/ as live grep patterns
- Graduated severity: rules broken 3+ times = BLOCKER (auto-escalation)
- Learning frontmatter: check_pattern + check_paths + check_expect = machine-readable detection
