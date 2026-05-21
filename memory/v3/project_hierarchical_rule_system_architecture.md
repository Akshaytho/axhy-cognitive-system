---
name: Hierarchical Rule System Architecture
description: 4-layer AI rule hierarchy (product→company→HR→supervisor), daily context load, next-day application, 3 chat windows, admin prompt access — locked 2026-05-19
type: project
originSessionId: c3bef54a-22e9-47b2-859c-ada004fb2a17
---
## Core Architecture (founder-locked 2026-05-19)

### 4-Layer Rule Hierarchy
```
Layer 0: PRODUCT RULES (Axhy defaults, apply to all companies)
Layer 1: COMPANY RULES (set by COMPANY_ADMIN, apply to all employees)
Layer 2: HR RULES (set by HR, apply to supervisors under them)
Layer 3: SUPERVISOR RULES (set by supervisor or AI-extracted from chat, apply to their portfolio)
```
Each layer extends/overrides the one above. The AI prompt for any user is composed from ALL applicable layers loaded from DB — never hardcoded.

### Daily Context Load Pattern
- Full rule hierarchy loads ONCE on first chat message of the day
- That context is reused for ALL chat calls throughout the day
- No mid-day cache invalidation, no per-call re-composition
- Cost: one warm-up per user per day, all subsequent calls hit cache
- Personal notes are the exception: can update same-day (small context delta)

### Next-Day Rule Application
- Any new rule added today takes effect TOMORROW when context reloads
- Eliminates mid-day cache busting, race conditions, re-composition complexity
- Simple batch: on first-load each morning, compose fresh context from current DB state
- Admin edits also follow next-day rule

### Three Chat Windows Per User
- Every role (supervisor, HR, admin) gets 3 concurrent chat threads
- Want a 4th? Delete (soft) one of the 3
- "Delete" = hidden from user, but ALL data stays in DB forever
- This bounds context size, cost, and prevents unbounded thread growth
- All 3 windows share the same daily rule context (same role, same rules)

### Admin Full Prompt Access
- Admin can READ all prompts at all levels (product, company, HR, supervisor)
- Admin can WRITE/EDIT rules at company level
- Admin can see and fix any bad rule across the hierarchy
- Safety net: if wrong rule causes damage, admin removes it (takes effect next day)

### Emergency Mid-Day Rule Push (Apply Urgently)
- Admin has an "Apply Urgently" button with explicit confirmation modal
- Sets rule effectiveDate = NOW instead of tomorrow
- Sends notification to all affected users via Decisions tab + WhatsApp:
  "Company rules updated. Reload your context when ready."
- Does NOT auto-push context to users — no race conditions, no WebSocket needed
- Users must manually reload (see below)

### Sidebar "Reload Context" Button (per user, 3x/day)
- Every user (supervisor, HR, admin) has a "Reload Context" button in their sidebar
- Tapping it triggers a fresh context load from DB (same as morning first-load)
- Limited to 3 uses per day per user — prevents abuse and bounds cost
- User explicitly initiates = they know their context changed
- Real-world flow: admin calls meeting or sends WhatsApp → "go reload your context"
- Counter resets at IST midnight (same as daily context load boundary)
- No automatic background reload, no polling, no real-time sync infrastructure needed

### Nothing Truly Deleted
- Soft deletes everywhere
- Chat history, rules, threads — everything preserved in DB
- "Delete" just hides from the user's view
- Required for compliance audit trail

### All Prompts From DB
- Every company gets unique AI behavior
- Prompts composed from their DB-stored rules at load time
- Product-level rules are the only shared baseline
- This is the competitive moat: after 6 months, a company's AI knows 400+ rules specific to them

**Why:** Company customization is the moat. Switching cost = losing all learned rules. ₹8/visit pricing works because the AI makes supervisors 3x more efficient with personalized rules.

**How to apply:** Every AI-related feature must respect this hierarchy. No hardcoded rules in source code except Layer 0 product defaults. Memory screen is the supervisor's transparency window into Layer 3. Admin-web needs a rules management page for Layer 1.
