---
name: Data and tenant rules (consolidated)
description: Tenant invariant (admin-only creation), delete authorization (SUPER_ADMIN hard-delete only), data retention forever. Universal.
type: feedback
---

# Data & Tenant Rules (3 files consolidated)

## Tenant creation is admin-only
Worker login must NEVER create Company rows. Tenant provisioning is a SUPER_ADMIN action. If a worker's phone number isn't found, the system returns "not registered" — never auto-creates.

## Hard-delete is SUPER_ADMIN only
COMPANY_ADMIN can soft-delete (set deletedAt). SUPER_ADMIN can hard-delete (physical row removal). No other role gets delete authority.

## Worker history retained forever
Once child records exist (visits, photos, GPS trails, audit events), the parent User row is undeletable. GDPR/DPDPA compliance = anonymize (blank PII fields), never delete the record chain.
