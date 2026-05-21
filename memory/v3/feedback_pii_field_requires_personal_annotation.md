---
name: New Prisma field with PII-shaped name requires /// @personal annotation
description: When adding a Prisma field whose name suggests PII, the field MUST carry the /// @personal annotation for DPDP inventory
type: feedback
originSessionId: 82c1e765-05aa-4232-adcd-c1cbb65e6360
---
When adding a new field to `packages/shared-schema/prisma/schema.prisma`, check
if its name suggests it holds personal data. If yes, the field declaration line
MUST be preceded by a `/// @personal <description>` Prisma triple-slash comment
so the DPDP-inventory generator picks it up.

**PII-suggesting field names (auto-flag):**

- `phone`, `mobile`, `whatsapp`
- `name`, `firstName`, `lastName`, `displayName`, `legalName`
- `email`, `mail`
- `address`, `street`, `pincode`, `city` (when paired with a name/phone column)
- `aadhaar`, `pan`, `gstin`
- `bankAcct`, `bankIfsc`, `upi`
- `dob`, `dateOfBirth`
- `latitude`, `longitude` (when on a person, not a site)
- `photoUrl`, `selfieUrl`
- `passportNo`
- `voiceKey` (worker voice transcripts)

**Example — correct:**

```prisma
model Worker {
  /// @personal worker phone (E.164)
  phone String @db.VarChar(16)
}
```

**Example — incorrect:**

```prisma
model Worker {
  phone String @db.VarChar(16)   // missing /// @personal — DPDP audit will miss it
}
```

**Why:** Vinod (DPO) flagged on 2026-04-29 that DPDP requires us to demonstrate
WHY we collect each piece of personal data. Without `/// @personal`, the
DPDP-inventory generator can't auto-list the field for retention/deletion logic.
At customer #5 we'll need a clean DPDP inventory; missing annotations = manual
audit at deal time = lost deal.

**How to apply:**

- Day 3+ work added Worker, Visit, LeaveRequest, etc. — those already have
  /// @personal on appropriate fields
- Going forward, every Prisma schema edit gets self-checked: do any new
  fields need /// @personal? If yes, add it BEFORE the commit
- ESLint cannot easily enforce this (Prisma files aren't TS); the
  knowledge-graph builder Day 7 work will add a check

**Surfaces this rule does NOT cover:**

- Surrogate keys (id, uuid)
- Foreign keys (companyId, userId, siteId, workerId)
- Status / state columns
- Timestamps (createdAt, updatedAt)
- Counts (photosBefore, baseSalaryPaise)
