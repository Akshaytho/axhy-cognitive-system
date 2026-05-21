---
name: never-assume-check-entire-codebase-and-docs
description: Never assume designs or workflows. Many were updated; old ones still live alongside. Scan the entire codebase AND the entire docs folder before any design / workflow / implementation decision. Inventory old vs new explicitly.
type: feedback
originSessionId: 67121b70-5be1-4df0-940e-340301c2fd1e
---
# Never assume designs or workflows — scan entire codebase + docs first (locked 2026-05-17 PM)

**Rule:** Before any design call, workflow decision, or implementation step, I scan the **entire codebase + entire `docs/` folder** to inventory which artifacts are current and which are stale-but-still-present. I do not assume continuity between an old artifact and a new one. I surface contradictions explicitly to the founder rather than silently picking one.

**Why:** Founder said 2026-05-17 PM: *"dont assume things for designs at all or workdlows i am saying to check the all codebase because many were updated and old ones are still present i just dont want you to confuse and cause confilct while bilidng code so check entire codebase and many check the docs folder you will find many things."* The repo holds: R1 + R6 designs (R6 supersedes); multiple spec revisions (some Draft, some Active, some superseded); workflow-maps + execution-state docs that sometimes lag specs; persona docs; ADRs; plans; protocols; canonical-truth index. Quietly choosing one without checking the others creates the very R1-↔-R6 drift the founder is trying to prevent.

**How to apply:**

**Mandatory scan before any design / workflow / implementation step:**

1. **`docs/specs/`** — every spec; check status (Draft / Active / Superseded). Check `docs/index/canonical-truth.md` (or wherever the canonical index lives) for the authoritative status.
2. **`docs/plans/`** — every plan; check whether referenced as still in flight or archived.
3. **`docs/prototypes/`** — every prototype rev; identify which is the canonical visual source (e.g. R6 for supervisor; check whether R1/R2/R3 still live).
4. **`docs/protocols/`** — every protocol; particularly `doc-discipline.md` which sits above other discipline locks.
5. **`docs/adrs/`** (if present) — every ADR; check supersession chains.
6. **`handoff/execution-state/`** — per-persona implementation status; verify it reflects current code.
7. **`handoff/workflow-maps/`** — per-persona flow diagrams; verify alignment with specs.
8. **`apps/` codebase scan** — what's actually shipped vs designed; surface drift.
9. **Migrations + Prisma schema** — what fields exist vs documented vs designed.

**Surface contradictions explicitly:**
- If two artifacts disagree on a workflow, name both, name the source-of-truth, and ask which to follow.
- If a doc looks updated but the code still implements an older version, name both and ask the order to converge.

**Never silently pick one path** between old and new. The founder explicitly does not want silent conflicts.

**Compose with the doc-discipline protocol** (`axhy-v3/docs/protocols/doc-discipline.md`, the META rule for written-truth coherence) — this rule is operational; doc-discipline is governance.

**Scope:** Every session. Every meaningful workflow or design step. Trivial typo-fix work is exempt.
