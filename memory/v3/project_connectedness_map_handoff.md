---
name: Connectedness Map — handoff for the next chat (feat/connectedness-map branch)
description: User wants a "better than Figma" living artifact that maps how every table, state machine, route, component, and screen is connected. Panel has framed the approach; next chat picks up implementation spec.
type: project
originSessionId: 82c1e765-05aa-4232-adcd-c1cbb65e6360
---
**Where to start in the next chat:** branch `feat/connectedness-map` is
already checked out. No code yet. The deliverable is a SPEC for an
end-to-end connectedness map — then implementation in a later step.

**The user's request (verbatim, 2026-05-07):**

> "ok go into feature branch and start working on backend conenction
> not code ok how each table and feature componeents screens all of
> them are connected i want that you know with figma maybe or more
> better than that. ask panel memebers this ok"

Translation: User wants a single artifact / system that lets him (and
panel + future Claude sessions) **see**, for any screen / table / route
/ component, what it reads from, what it writes to, what triggers it,
what it mounts, what state it mirrors. Better than Figma because Figma
is paint — this needs to stay synchronized with code as the system
evolves.

**Why now:** Phase B (backend foundations) is about to start. Adding
~10 Prisma tables + ~15 supervisor backend routes blind would silo the
schema from the UI. User wants the connectedness picture FIRST so the
backend tables get designed with the screens that consume them in
mind, and so the panel can audit any change with one-hop visibility
across all 4 layers.

**Panel framing (the panel debate captured 2026-05-07):**

- **Hari (backend, owns the existing knowledge graph):** "We already
  have `axhy_graph` schema in Postgres with 3 graphs — structural
  (Prisma + XState), semantic (chunks + pgvector embeddings),
  provenance (`@derives` annotations). ~480 nodes / ~370 edges / ~120
  chunks today. The structural graph models tables + state machines.
  We need to **extend** it: add Surface nodes (per screen), Component
  nodes (per UI component), Route nodes (per backend route). Edge
  types: MOUNTS (screen→component), READS (screen→table fields),
  TRIGGERS (screen→route), WRITES (route→table), MIRRORS (screen→
  state machine), NAVIGATES_TO (screen→screen)."
- **Aanya (AI):** "Don't build a Figma replica — Figma is paint. What
  the user wants is a LIVING entity-relationship map: 'this screen
  reads these fields from these tables via these routes.' That's
  exactly what an extended knowledge graph gives. Stays current as
  code changes — `@derives()` annotations bind every node to its
  source code path."
- **Sara (UI surface):** "Per-screen UX surface description that maps
  into the graph. Each screen node has edges to (1) components it uses,
  (2) tables it reads, (3) routes it triggers, (4) state machines whose
  state it mirrors. Navigate any direction: 'change Worker table →
  which screens break?'"
- **Aditya (design lead):** "Token system + screen system + table
  system + route system are siloed today. A graph that connects all
  four is the canonical 'design system + architecture' artifact.
  Better than Figma because Figma gives visual fidelity; this gives
  SEMANTIC fidelity."
- **Karthik (founder voice):** "I want to OPEN a thing and SEE: this
  is the supervisor home, here are the fields it reads from the
  database, here are the actions it can take, here are the tables
  those actions write to. End-to-end, without reading 6 files."
- **Rohan (release eng):** "Extend `@axhy/knowledge-graph`, don't
  build a separate tool. The package already has `graph:build` +
  `/system/graph` viewer. Add the new node + edge types. One pnpm
  script + viewer renders it."
- **Priya (UXR):** "The viewer needs minimum 4 navigation modes:
  per-screen, per-table, per-state-machine, per-route. Each shows
  that node + 1-hop neighbors."
- **Megha (CMO/anti-overengineer):** "Don't bikeshed Figma. Just MAP
  what exists. Half a day for the spec, then iterative."

**Panel-locked approach (next chat should follow this, not redebate):**

1. **Extend `@axhy/knowledge-graph`** at
   `packages/knowledge-graph/`. Don't create a new package.
2. **New node types:** `Surface` (one per route/screen), `Component`
   (one per reusable UI component), `Route` (one per backend route),
   plus existing `Table` + `StateMachine` already covered.
3. **New edge types:** `MOUNTS`, `READS`, `TRIGGERS`, `WRITES`,
   `MIRRORS`, `NAVIGATES_TO`.
4. **Each node carries `@derives(file-path:line)`** so it stays bound
   to source code. Existing `@derives()` annotations across the
   codebase already feed the provenance graph — extend the extractor
   to pick up the new node types.
5. **Update `/system/graph` viewer** in `apps/admin-web/app/system/
   graph/` to support filtering by node type + 1-hop expansion.
   Existing viewer is at `app/system/graph/page.tsx`.
6. **Source of truth for surface→table/route/state mapping** is the
   data-flow doc at `~/.claude/plans/v3-system-architecture-and-data-
   flow.md` §5 (per-role action catalog) + §7 (UI surface map). Use
   it as the input for the first pass; extend it as new surfaces ship.

**Deliverable for next chat (in this order):**

1. Read the data-flow doc fully (it's ~6,500 words) to internalize
   the system shape.
2. Inspect the existing `@axhy/knowledge-graph` package — what's
   there, what's exposed, what schema does the existing graph use.
3. Write the SPEC: schema additions, edge types, ingestion pipeline,
   viewer changes. Spec lives as a section appended to the data-flow
   doc OR as a new file at `packages/knowledge-graph/SPEC.md`
   (panel says: prefer the latter, since the spec is implementation-
   level and the data-flow doc is product-level).
4. Bring spec to panel for approval before any code lands.
5. Code in a follow-up commit — atomic per node-type addition.

**Anti-patterns the panel flagged for next chat to avoid:**

- ❌ Building a separate Figma-style canvas tool. Use the existing
  graph viewer.
- ❌ Hand-curating the connectedness map in a static document.
  Extractor must pull from code so it stays current.
- ❌ Trying to capture pixel-perfect visual design in the graph.
  That's Figma's job; this is structure + semantics only.
- ❌ Treating screens that don't exist yet (worker mobile, owner
  mobile, HR + owner web admin) as graph nodes. Only nodes for
  surfaces that have at least a stub committed; otherwise the graph
  becomes wishful thinking.

**Surfaces in scope for v1 of the connectedness map (already exist
or will exist by Phase B end):**

- admin-web routes: `/`, `/pricing`, `/about`, `/contact`, `/login`,
  `/privacy`, `/terms`, `/owner` (stub), `/system/graph`
- supervisor-preview routes: `/`, `/chat`, `/today`, `/summary`,
  `/updates`, `/profile`
- backend routes: 3 today (OTP request, OTP verify, GET /me) + ~15
  supervisor + ~10 worker + ~15 HR routes once Phase B lands

**Surfaces NOT in scope for v1:**

- Worker / supervisor / owner React Native mobile apps (not yet built)
- Email templates (not yet designed)
- Push notifications (not yet designed)
- Voice prompts (not yet recorded)

**Branch state at handoff (2026-05-07):**

- On `feat/connectedness-map` (branched from `main` at 574c4e4)
- Working tree clean except for the untracked
  `apps/admin-web/public/design-review/` (friend's Claude Design output,
  unstaged earlier — leak risk if committed under public/, already
  decided to leave untracked until founder picks archive vs delete)
- No commits yet on the branch

**What the user explicitly said NOT to do:**

- ❌ Don't write code yet. Spec first.
- ❌ Don't reuse this chat. They want a fresh chat for this work.
- ❌ Don't redebate Figma vs graph — panel locked on extending the
  existing knowledge graph.
