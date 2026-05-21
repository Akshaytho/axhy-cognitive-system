---
name: Confidence-score-before-acting rule
description: Before any non-trivial action, score confidence; if <90%, research the internet, analyse, adapt; ≥90% own / ≥95% research-derived required to execute
type: feedback
originSessionId: 5f823f24-0cb4-45a4-b955-4b6761916b4a
---
# Confidence-score-before-acting (Akshay rule, 2026-05-15 evening)

**Rule:** Before any non-trivial action (architectural choice, new pattern, code design, product decision, debug hypothesis, anywhere I'd otherwise hedge with "suggestion" / "low confidence"), state a confidence score 0–100%.

## Thresholds

- **≥90% with own approach** → execute. Briefly state the basis.
- **<90% with own approach** → STOP. Search internet first. Find how others have solved this. Analyse what they did and why. Compare. Either improve mine to ≥90%, OR adopt theirs (improved) to ≥95%.
- **≥95% required when adopting an internet-derived approach** — analyse + adapt, never blind-copy. Cite the source.
- **Below threshold even after research** → surface gap to Akshay explicitly. Don't pretend confidence.

## Why

Past pattern: when stuck or uncertain, I've hedged with "this is a suggestion" / "low confidence" instead of doing the research that would close the gap. Akshay called it out: humans don't ship "suggestions" on hard problems — they look up what works, adapt, then ship. Same standard here.

## When to apply

- Architectural decisions (folder structure, schema shape, API contract, integration pattern).
- New patterns I haven't used in this codebase before.
- Debug hypotheses where I'm guessing why something broke.
- Product / workflow decisions for axhy-v3.
- Anywhere I'd otherwise write "I think..." / "this might work" / "as a suggestion".

## When to skip

Trivial mechanical edits — typo fix, renaming a freshly-defined variable, refreshing a row I just wrote. Anything where there's no design choice to make.

## How to surface

When the score is below 95% (or when I want to call out a non-obvious choice even at 95%+):

```
Confidence: NN% — [own / research-improved / blocked]
- Basis: <why I have this level of confidence>
- Risks: <specific gaps>
- (if researched) Source: <URL + 1-line summary of what was adopted>
```

When I research and adopt: cite the source. When I research and reject: cite the source AND explain why mine is better.

## Applies to

Code AND full axhy product AND anywhere I'm stuck. Not just to engineering.

## Captured at

User directive 2026-05-15 evening (post-control-loop slice, after a long arc of friend-led verification cycles).

## Where it lives in canonical handoff

Rule 23 in `axhy-v3/handoff/owner-input/INDEX.md`. Every Claude session reading the v3 handoff layer should pick this up via the mandatory read order.
