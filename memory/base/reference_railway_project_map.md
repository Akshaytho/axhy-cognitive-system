---
name: Railway project + service map
description: Map of which Railway project + service hosts each codebase so railway CLI commands target correctly
type: reference
originSessionId: 1a4c25f5-30c9-4353-94d6-883d107148a7
---
Axhy runs on TWO separate Railway projects under `akshaytho's Projects` workspace:

### Project 1: `sublime-contentment`
- Service: `eclean-admin` (Next.js admin portal)
- Hostname: whatever domain admin resolves to (public URL via Railway)

### Project 2: `secure-joy`
- Service: `Eclean_future` (Fastify backend — eclean-v2-b2b/backend)
- Service: `Postgres` (the shared database)
- Service: `Redis` (BullMQ + OTP cache)
- Backend public URL: `https://api.axhy.app`
- Backend internal URL: `ecleanfuture.railway.internal`

### CLI commands

**Link to backend service** (from a scratch dir to avoid polluting repo .railway):
```
cd /tmp/ck  # or any scratch dir
railway link --project secure-joy
railway service Eclean_future
railway variable set KEY=VALUE
```

**Link to admin service**:
```
cd /Users/thotaakshay/eclean_workspace/eclean-admin
railway link --project sublime-contentment   # already done
railway service eclean-admin                 # already done
railway variable set KEY=VALUE
```

**Env vars that must be set on BOTH services:**
- `ADMIN_TRIGGER_SECRET` (backend uses to verify; admin uses to send as `X-Admin-Trigger-Secret` header)

**Env vars on admin only:**
- `BACKEND_URL` = `https://api.axhy.app` (so admin knows where backend lives)

**How to find all services in a project via CLI:**
```
railway status --json | grep -E '"serviceName"'
```
This needs an existing `railway link` in the cwd, so use `/tmp/ck` or similar for non-repo queries.
