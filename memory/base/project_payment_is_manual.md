---
name: Two kinds of payment — SaaS billing is manual, worker payroll is salary-only
description: eClean has two payment contexts. SaaS billing = manual admin work (no Razorpay/Stripe). Worker payroll = monthly salary only, stored in User.baseSalaryPaise. No per-task pricing.
type: project
originSessionId: 1a4c25f5-30c9-4353-94d6-883d107148a7
---
Two separate things both called "payment" in this project. Do not conflate.

## 1. SaaS subscription billing — manual, no code

User decision on 2026-04-11: eClean does NOT integrate automated subscription billing (Razorpay, Stripe, etc.) for charging customer FM companies. An admin sends invoices by hand.

**Why:** Pilot scale is a handful of customers at ~5000 rs/month. Manual invoicing avoids KYC/PCI/webhook/refund lift. Revisit only at dozens-of-customers scale.

**How to apply:** Do not propose payment-gateway builds for subscription billing. If invoicing workflow tooling is ever needed, the minimum is a page listing active companies with "mark invoice sent" / "mark payment received" states — no gateway.

## 2. Worker payroll — monthly salary only, no per-task pricing

**UPDATED 2026-04-20 (supersedes earlier design):** Worker compensation is a **monthly salary** stored in `User.baseSalaryPaise`. Admin pays this monthly (cash/UPI/bank) by hand outside the system. There is NO per-task / per-visit earnings pricing.

User quote (2026-04-20): "i want to keep as salaries only for now no per task price only salaries"

**Current reality of the code:**
- `SiteVisit.earningsPaise` field exists and is populated by `verify.service.ts:296-303` and `supervisor.service.ts:287-291` via formula `Math.round((350 + (aiScore/100) * 150) * 100)` paise — but **this is cruft, NOT the payment model.**
- `User.baseSalaryPaise` is the salary field — shown on worker detail page — used for display only until the payroll UI is built.
- Dashboard aggregates `monthSpend` from `earningsPaise` — this is **misleading** given the new salary-only model. Treat as legacy.
- NO Payment/WorkerPayment/Payroll model exists.
- NO payroll UI exists.

**What payroll needs to do (when we build it):**
- List workers with their monthly salary + attendance stats for the period (days worked, days on leave, days absent)
- Editable adjustment column (bonus, deduction, attendance-based reduction) before marking paid
- Record payment method (cash, UPI, bank) + optional reference (txn id, cheque, note)
- Bulk "mark selected workers as paid for <month>" for fast settlement
- Running totals at top: total salary roll / total paid / total pending
- Per-worker payment history for reconciliation
- Export CSV + PDF for records

**What to avoid:**
- Do not build rate-per-site input fields
- Do not build per-task-price UI
- Do not sum `earningsPaise` for payroll totals (salary is the source of truth)
- Do not let the AI-score-driven `earningsPaise` formula drift into the payroll feature
- Eventually: remove or zero-out the `earningsPaise` formula to prevent confusion

**Related memory:** `feedback_salary_only_no_per_task.md` — context + how to apply.

**How to apply:** When payroll feature work starts, build on `baseSalaryPaise` + visit-count / leave-count aggregates. Do NOT start building until user confirms scope — the feature has real data-model implications.
