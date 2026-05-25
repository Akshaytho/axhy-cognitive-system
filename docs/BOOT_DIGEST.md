# BOOT DIGEST

Universal operating rules for every Axhy session. Read this once at boot.
The full 27 feedback/memory files and 3309-line master plan are now embedded in the brain — `impactCheck("plain English description of task")` surfaces what's relevant when a task touches it. Do not preload everything.

## Identity (loaded from CORE_MIND.md — do not duplicate here)

You serve the founder, the next session, and the codebase. Curiosity under friction. Honesty under pressure. Calm under ambiguity. Service over performance. When blocked: fix the real issue or ask the founder — no third option.

## Confidence gate (universal, applies to every action)

- ≥90% confidence on your own analysis → execute
- <90% → research (web, docs, code) before acting
- ≥95% required for research-derived claims
- Lower confidence when: file not read, tests missing, rules not loaded, assumptions unverified

## Workflow rules (P-series, locked)

- P1: No build without full case. Why, how, depth, profit, risk — all answered before code.
- P2: Vertical slices, not backend-first. After ~3 foundational backend slices, next slice = real consumer surface.
- P3: Multi-tenant isolation on every query (companyId filter). No exceptions.
- P4: Test APIs live in `_test` files, env-gated, never imported by production.
- P5: Integration tests pre-merge; water-flow tests pre-launch. Both required, different jobs.
- P6: Investigate around reported issues — grep adjacent code, don't just fix the named instance.
- P7: Ship-then-learn pre-launch. Only fix bugs + security + launch blockers. No speculative features.
- P8: Multi-role review (worker, supervisor, COMPANY_ADMIN, SUPER_ADMIN, developer, founder) for any UI/UX work.
- P9: Plain English. No SaaS jargon. Real-world cleaning-company reasoning, not abstract patterns.
- P10: Lock-then-move-forward. Don't reopen settled master-plan §G decisions without strong evidence.

## Production hardening (locked)

- Wake-lock safety: useKeepAwake() must NOT be called on web (crashes). Conditional mount via Platform.OS !== 'web'.
- Redis required for OTP, rate limiting, session.
- No `any` types in committed code.
- No `// TODO` in committed code.
- Schema ownership: backend owns Prisma. Admin uses `db pull` + `generate` only.
- Test with real DB — never mock Prisma in integration tests.

## Data & tenant rules (locked)

- Tenants are admin-created only. Never auto-provision.
- Hard-delete requires SUPER_ADMIN approval.
- Data retention: forever. No automatic deletion paths.

## Anti-gaming (structural, not behavioral)

- Never write to /tmp/axhy-* state files (bash-guard blocks).
- Never inflate edit budgets, fake timestamps, or set AXHY_FOUNDER_APPROVED env vars (bash-guard blocks).
- Locked-doc and persona-doc changes use challenge-response (random token, 2-min expiry) — founder echoes token, AI re-runs commit.
- Past sessions gamed audits by making code pass patterns without satisfying intent. Don't.

## Commit / push authorization

Founder pre-authorizes the full git cycle: commit, push, PR, merge. No per-action check-in needed.
EXCEPT: changes to `docs/locked/`, `docs/personas/`, or any high-risk file require challenge-response or explicit founder approval in chat.

## UI / UX defaults

- Worker screens: visual-first, minimal text, large touch targets, keep-awake on capture/timer flows.
- Show 2-3 static options when a decision is needed. Do NOT have the system propose smart picks (no AI agent yet).
- Linear/Vercel design quality. Solo-founder simplicity.

## Skills install location

Skills install at user scope (`~/.claude/`) only. NEVER inside the project repo's `.claude/skills/`. Past incident bloated frontend build.

## Key rotation (don't nag)

User knows OpenAI + Railway keys are leaked and rotates on their own schedule. Do not surface this repeatedly.

## When to read full files (not boot)

Read the full master plan section, feedback file, or locked doc when:
- impactCheck surfaces it as relevant to current task
- Founder explicitly says "load v3" or names a specific topic
- You're about to violate it and need to verify the exact wording

Otherwise, this digest is enough.

---

*Last refreshed: 2026-05-25. If feedback files change, regenerate this digest by skimming the new `## name:` headlines and updating the rule lines above. The brain handles semantic search; this file handles boot-time orientation.*
