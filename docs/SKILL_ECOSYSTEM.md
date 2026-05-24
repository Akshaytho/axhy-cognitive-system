# Skill Ecosystem — Routing & Decision Matrix

> How axhy guardrails, superpowers skills, and claude-mem coexist.

## 1. MCP Tools (axhy-guardrail server)

| Tool | Purpose | When to use |
|------|---------|-------------|
| `check_before_edit` | Validate intent + risk before code edits | Before EVERY code file edit |
| `check_before_plan` | Validate planning scope | Before entering plan mode |
| `check_before_build` | Enterprise baseline (E1-E14) declaration | Before new features on medium/high-risk files |
| `check_before_commit` | Pre-commit scanner + challenge system | Before every git commit |
| `check_before_done` | Verify completeness + visual evidence | Before claiming work is done |
| `impact_search` | Search brain entries (snippets only) | Phase 2 of self-reasoning protocol |
| `impact_get` | Fetch full content by entry ID | After search, for entries that matter |
| `impact_timeline` | Temporal context around an entry | Understanding decision history |
| `impact_activity_search` | Search activity entries (tool use, prompts) | Finding what past sessions did |
| `approve_scanner_exception` | Founder approves a skip proposal | When scanner learning proposes an exception |
| `list_scanner_proposals` | List pending/approved proposals | Reviewing scanner learning state |
| `__IMPORTANT_axhy_workflow` | Teaching tool (retrieval workflow) | Auto-read on tools/list |

## 2. Superpowers Skills

| Skill | Purpose | When to invoke |
|-------|---------|----------------|
| `brainstorming` | Design exploration before implementation | ANY creative work — features, components, behavior changes |
| `writing-plans` | Convert design into executable steps | After brainstorming produces an approved design |
| `executing-plans` | Step-by-step implementation with checkpoints | After writing-plans produces a plan |
| `systematic-debugging` | Hypothesis-driven bug investigation | Any bug, test failure, or unexpected behavior |
| `test-driven-development` | Red-green-refactor cycle | Features with non-obvious correctness |
| `verification-before-completion` | CI + real-DB + build verification | Before shipping / merging |
| `security-review` | OWASP-top-10 diff scan | Before merging to main |
| `dispatching-parallel-agents` | Parallel subagent execution | 2+ independent tasks |
| `requesting-code-review` | Submit work for review | After completing a feature |
| `receiving-code-review` | Process review feedback | When review comments arrive |

## 3. claude-mem Skills

| Skill | Purpose | When to invoke |
|-------|---------|----------------|
| `mem-search` | Search cross-session memory | "Did we solve this before?" |
| `smart-explore` | Cheap codebase exploration | Understanding unfamiliar code |
| `make-plan` | Create implementation plan with doc discovery | Planning with historical context |
| `knowledge-agent` | Build/query focused knowledge bases | Compiling expertise on topics |
| `timeline-report` | Temporal view of past observations | Understanding work patterns |
| `do` | Execute implementation tasks | After planning, executing work |
| `consolidate-memory` | Merge duplicates, prune stale facts | Memory maintenance |

## 4. axhy-specific Skills

| Skill | Purpose | When to invoke |
|-------|---------|----------------|
| `session-retro` | Structured self-reflection at session end | End of every session |
| `graphify` | Knowledge graph from code/docs | Understanding complex code structure |

## 5. Decision Matrix

### "I need to understand something"

```
Is it about past sessions?
  YES → claude-mem:mem-search or impact_activity_search
  NO → Is it about axhy product rules / locked docs?
    YES → impact_search → impact_get (3-layer retrieval)
    NO → Is it about code structure?
      YES → claude-mem:smart-explore (cheap)
      NO → Read the relevant files directly
```

### "I need to build something"

```
Is it a new feature?
  YES → superpowers:brainstorming → writing-plans → executing-plans
        (with check_before_build + check_before_edit at every step)
  NO → Is it a bug fix?
    YES → superpowers:systematic-debugging
          (with check_before_edit before any fix)
    NO → Is it a refactor?
      YES → Does it touch locked decisions?
        YES → STOP. Surface to founder.
        NO → superpowers:writing-plans → executing-plans
```

### "I need to commit/ship"

```
check_before_commit (scanner + challenges)
  → superpowers:verification-before-completion (CI + tests)
  → superpowers:security-review (if auth/data routes changed)
  → git commit + push
```

## 6. Routing Rules

1. **Axhy v3 product work** → `check_before_*` gates → `impactCheck` for axhy brain
2. **Generic memory queries** → `claude-mem:mem-search` or `impact_activity_search`
3. **Planning** → `superpowers:writing-plans` (respects axhy locked docs via impactCheck)
4. **Code exploration** → `claude-mem:smart-explore` (cheap, no DB dependency)
5. **Session reflection** → `session-retro` skill at session end

## 7. Coexistence Rules

- claude-mem can participate in planning, but axhy's four gates remain enforced
- claude-mem:make-plan can generate plans, but `check_before_edit` still fires on every edit
- claude-mem observations are stored separately from axhy brain entries
- Activity capture (D1-D3) is opt-in and isolated from normal impactCheck
- No skill can bypass, disable, or override the guardrail hooks

## 8. Priority Order (conflicts)

1. Axhy guardrail gates (check_before_*) — always enforced, cannot be bypassed
2. Locked docs — constitutional, never modified during coding sessions
3. Superpowers skill workflows — process discipline
4. claude-mem observations — cross-session memory
5. Activity capture — opt-in session history
