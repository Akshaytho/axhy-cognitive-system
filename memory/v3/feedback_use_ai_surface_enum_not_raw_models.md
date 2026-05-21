---
name: Use AI surface enum + ADR-0023, never raw model names
description: Every AI invocation goes through @axhy/ai-tools modelFor(surface), not a hardcoded model string
type: feedback
originSessionId: 82c1e765-05aa-4232-adcd-c1cbb65e6360
---
When writing code that invokes any AI model (Anthropic / OpenAI / Sarvam /
Cohere), NEVER pass a model string directly. Always go through:

```ts
import { modelFor, assertWithinBudget } from '@axhy/ai-tools';

const choice = modelFor('voice_change_parse');  // surface enum, not 'claude-sonnet-4-6'
assertWithinBudget('voice_change_parse', estimatedCostInr);
// then call the SDK with choice.model
```

**Why:** Per-surface model policy (ADR-0023) was locked because GPT-5.4-nano is
60× cheaper than Opus 4.7 on cheap surfaces. If a hot loop hardcodes Opus, we
lose ~₹820K/month at scale. The model-policy.ts file is the single source of
truth — gateway throws AICostBudgetError if estimated cost exceeds the surface's
ceiling.

**How to apply:**

- New AI call: define a surface in `packages/ai-tools/src/model-policy.ts`
  FIRST, then add the call site
- Surface name = the WHAT (voice_change_parse, ai_verification, alias_map),
  not the WHO (claude_call, openai_call)
- ESLint custom rule for this is on the deferred-rules list (Day 3+) —
  enforce manually until then
- If proposing a new AI surface in code review, also propose the surface
  enum + cost ceiling, NOT the model name

**Surfaces this rule does NOT cover:**

- Inside `@axhy/ai-tools/model-policy.ts` itself (that's where models ARE named)
- AI eval test fixtures (test code can pin to specific models for reproducibility)
- The cost-projector script (it knows model costs by name)

**Verification:** before any AI-touching commit, grep for hardcoded model strings:
`grep -RE "claude-(opus|sonnet|haiku)-|gpt-5\.|whisper-large" packages/ apps/ tools/`
should return only `model-policy.ts` matches.
