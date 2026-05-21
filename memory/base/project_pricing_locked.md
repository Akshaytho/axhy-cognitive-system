---
name: Axhy pricing — locked at ₹8 per completed visit
description: Client pricing is per-task (per completed visit) at ₹8 with a ₹2,000/month minimum. Usage-based, scales with client, includes all AI features.
type: project
originSessionId: ae10a9e4-4289-4889-8a2d-5c091a896996
---
**Axhy's client pricing model — locked 2026-04-21.**

User decided: **₹8 per completed cleaning visit**. No per-seat, no per-worker, no tiered plans.

## Full pricing spec — two tiers

### Tier 1 — Pay-as-you-go (PAYG, self-serve default)
- **₹8 per visit** where `lifecycleStatus` reaches a `COMPLETED_*` terminal state
- **₹2,000/month minimum** floor
- **AI Operations Assistant:** included at no extra cost
- **Not charged:** CANCELLED, UNCOVERED, NOT_ATTEMPTED visits
- Signed up directly through the product, no sales involved
- Target: small FM shops (10-50 workers) and mid-size (50-200 workers)

### Tier 2 — Enterprise Flat (sales-negotiated)
- **Flat ₹40,000/month** starting point, scales with volume (up to ~₹80,000 for very large)
- **Unlimited visits** — no per-visit charge
- **Unlimited AI Assistant usage**
- **Priority support, dedicated onboarding, custom SLA**
- Sales conversation required — founder quotes based on volume + needs
- Target: 200+ worker companies who want budget predictability
- Trigger for sales outreach: clients on PAYG hitting 2,000+ visits/month

### Upgrade path
Clients auto-start on PAYG. When they hit ~2,000 visits/month (roughly ₹16k on PAYG), we reach out proactively with a flat quote. Most will move to flat for cost predictability + priority support.

### Rejected pricing options
- ₹10-15k flat for all — prices out small shops (their PAYG would be ₹3-7k)
- Per-worker-per-month at ₹8 — loses money at all scales
- Per-worker-per-month at ₹200-500 — works but less flexible than PAYG
- Single ₹8/visit with no enterprise tier — large clients demand flat for budget

## Math at scale

| Scale | Visits/mo | Revenue | Infra | Team | Net |
|---|---|---|---|---|---|
| 1 client | 4,500 | ₹36,000 | ₹16,800 | solo | +₹19,200 |
| 5 | 22,500 | ₹1,80,000 | ₹70,500 | ~₹30k | +₹79,500 |
| 10 | 45,000 | ₹3,60,000 | ₹1,50,000 | ₹1,50,000 | +₹60,000 |
| 50 | 225,000 | ₹18,00,000 | ₹6,35,500 | ₹7,34,000 | +₹4,30,500 |
| 100 | 450,000 | ₹36,00,000 | ₹12,00,000 | ₹12,00,000 | +₹12,00,000 |

**Break-even: ~2 clients.** Real profitability from client #10.

## Client pitch

> ₹8 per completed cleaning. No monthly fee, no seat fee, no minimums (except a floor of ₹2,000/month for very small ops). You pay for work done.

## Why this model was chosen

- **Fair:** client only pays for work that actually happened
- **Low risk for prospect:** no upfront commitment, scales with their business
- **Aligns with industry mental model:** FM buyers think about "cost per cleaning"
- **Self-scaling:** small FM shops get small bills, big enterprises get big bills — no separate tier management

## Risks to watch for

1. **Seasonality** — monsoon/festivals drop MRR 10-20%. Plan cash flow.
2. **AI over-usage** — if one client's admin runs AI assistant heavily but visit count is low, margin compresses. Monitor at client 20+.
3. **Unit-cost at scale** — per-visit infra cost is ~₹3 at 50 clients. Per-visit revenue ₹8. Gross margin ~62%. Healthy.

## Rejected alternatives

- **Per-worker/month at ₹8** — too low, loses money at all scales (revenue < infra cost)
- **Per-worker/month at ₹200-500** — works financially but feels heavier to sell; deferred as fallback
- **Flat enterprise** — locks into fixed revenue, doesn't scale with client growth
- **Free tier** — too risky for SaaS cost structure

## How to apply

- Billing in eclean-admin: add `BillingLine` records for each `COMPLETED_*` visit transition
- Monthly invoice = count of completed visits × ₹8 (or ₹2,000 floor)
- Export monthly summary CSV for clients showing visit count + amount
- Do NOT charge cancellations / uncovered — they happen, shouldn't hurt trust
