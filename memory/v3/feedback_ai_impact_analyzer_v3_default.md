---
name: AI-impact-analyzer is the v3 default for cross-file change tracking
description: Locked 2026-05-09 via empirical test (~93% accuracy on enum-conversion scenario). Use Claude grep+reason as the "what files does X touch" tool instead of a formal Connectedness Map. Re-evaluate if accuracy drops below 80%.
type: feedback
originSessionId: e0012b34-b5c7-4010-a084-6301a3c5a14b
---
**Rule:** Before any cross-cutting change in v3 (Wave 2+), the impact analysis pattern is to ASK CLAUDE "if I change X, what files need to update?" Claude greps + reasons + returns file:line citations. Founder verifies in 5 min before proceeding.

**Why:** Founder raised legitimate concern about codebase drift and "tracking changes everywhere" as Phase C grows. Panel debated pause-and-build-Connectedness-Map (~2 days) vs continue-with-AI-grep. Empirical test on hard scenario (β: convert CalendarEntry.kind String → Postgres enum) scored ~93% accuracy in finding all impacted files. Above the 90% bar. Map deferred to Phase D.

**How to apply:**

1. **Pattern when about to make a cross-cutting change:**
   - Founder/agent asks: "if I change X (be specific), what files need to update?"
   - Claude runs grep + reasons about implications
   - Returns: list of files DEFINITELY affected + flagged uncertainties (where Claude isn't sure) + false positives ruled out
   - Founder verifies key files exist + makes the change

2. **What this is sufficient for (~93% accuracy):**
   - TypeScript-detectable changes (rename a field, change a type)
   - Schema migrations affecting consumers
   - Tool-surface contract changes
   - Route signature changes
   - State machine transition modifications

3. **What this is NOT sufficient for:**
   - Cross-package consumer chains beyond ~3 hops (likely missed)
   - Generated code consumers (api-client, prisma client) — depends on regeneration
   - Documentation drift (specs referencing strings that change) — non-functional but stylistic

4. **Defenses still in place that catch what AI misses:**
   - TypeScript strict mode → compile errors at build time
   - Real-DB integration tests → runtime failure on Railway
   - `@derives()` ESLint rule → bidirectional spec-to-code traceability
   - ADRs → re-readable decision context
   - PR template change-set checklist (added 2026-05-09) → "concepts touched" line

5. **Re-evaluation trigger** (DO ESCALATE TO MAP if any of these hit):
   - AI accuracy on a real scenario drops below 80%
   - Bug surfaces from drift that AI grep failed to catch
   - Codebase reaches 100+ packages or 200+ files with cross-cutting state

**Don't:**
- Don't pause a wave to "build the Connectedness Map" preemptively without re-evaluation trigger
- Don't skip the AI-grep step before complex refactors (it's free, takes 30s)
- Don't assume AI's analysis is 100% — verify the listed files exist + tests cover them

**The original Connectedness Map work (`feat/connectedness-map` branch + `packages/knowledge-graph`)** is paused, not abandoned. When trigger hits, resume that work — extends `@axhy/knowledge-graph` to ingest schema + routes + state-machines + tool definitions.
