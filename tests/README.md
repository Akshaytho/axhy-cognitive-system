# Cognitive System Tests

## Running tests

Always use the canonical command:

```bash
npm test
```

This runs with `--test-concurrency=1`, which is **required**.

### Why concurrency=1 is required

Multiple test files (`integration.test.mjs`, `deep-audit.test.mjs`, `layer-1-hook.test.mjs`) share the same `/tmp/axhy-{hash}-*` state files. These state files simulate the guardrail's approval/enforcement lifecycle. Under concurrent execution, one test's `beforeEach` cleanup deletes state that another test is still using, causing false failures.

Do NOT run:
```bash
# WRONG — runs files concurrently, causes false failures
node --test tests/*.test.mjs
```

If running manually, always include the concurrency flag:
```bash
node --test --test-concurrency=1 tests/*.test.mjs
```

### Retrieval quality tests

The 18 retrieval quality tests (`retrieval-quality.test.mjs`) require a live Railway Postgres connection with pgvector. Without `DATABASE_PUBLIC_URL`, they skip gracefully.

To run with live DB:
```bash
export $(grep OPENAI_API_KEY /path/to/axhy-v3/apps/backend/.env.local) && \
  railway run --service Postgres -- npm run test:retrieval
```

### Brain health preflight

Standalone check that the brain is healthy before a Book Architecture phase:
```bash
export $(grep OPENAI_API_KEY /path/to/axhy-v3/apps/backend/.env.local) && \
  railway run --service Postgres -- npm run test:brain-health
```
