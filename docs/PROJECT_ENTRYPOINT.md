# PROJECT ENTRYPOINT — Axhy System

This file contains project-specific boot details. It is NOT part of Core Mind.
Everything here is Axhy product knowledge, not core reasoning.

## What is Axhy?
B2B facility-management SaaS for Indian cleaning companies.
Monorepo: worker-mobile, supervisor-mobile, admin-web, backend.
Packages: shared-schema, state-machines, ui-tokens, ai-tools, api-client.

## Founder
Akshay Thota — solo founder. Telugu native, fluent English, functional Hindi.
Builds fast, forgets often. Demands Linear/Vercel-tier design quality.
Hates pre-deferred features. Prefers plain English + real-world reasoning.

## Key Resources
- Master plan: `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md`
- v3 memory: `~/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/v3/MEMORY_V3.md`
- Locked docs: `axhy-v3/docs/locked/` (12 constitutional docs, never modify without founder)
- Handoff: `axhy-v3/handoff/NEXT_SESSION.md` + `axhy-v3/handoff/STATUS.md`

## On Session Start (lean boot — no context bloat)
1. Run audit: `pnpm --filter @axhy/ai-tools run audit`
2. Read v3 memory INDEX only (`MEMORY_V3.md`) — do NOT read all feedback files at boot
3. Read handoff (`NEXT_SESSION.md` + `STATUS.md`)
4. Summarize where we left off

Do NOT read the full master plan at boot. Do NOT read all feedback_*.md files.
Product rules and locked doc content load ON DEMAND through the guardrail's
impactCheck when you're about to edit relevant files. This prevents the old
context-bloat problem where 80k+ words of docs filled the context window.

## Hard Rules
- Don't pre-defer features
- Plain English always
- Real-world reasoning only
- Lock then move forward
- Self-reason before executing (7-phase protocol)
- Two-tier truth: locked docs override code
