---
name: Expert friend reviews architecture
description: User has a software expert friend who reviews all major decisions. Always translate his advice into concrete plans before coding.
type: feedback
---

User's friend is a senior expert in software + AI. User shares Claude's plans with him and brings back detailed feedback.

**Why:** Friend catches architectural gaps (e.g. idempotency, state machine, evidence persistence) that prevent production bugs.

**How to apply:** When making architectural decisions, prepare a detailed plan with file-by-file breakdown. Expect the friend to refine it with 5-10% adjustments (e.g. "add submissionId unique constraint, not just index"). Don't start coding until the friend approves. Commit in logical chunks per friend's recommendation (schema → state machine → submit → queue → admin → mobile).
