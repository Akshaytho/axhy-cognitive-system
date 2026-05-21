---
name: UX principles (consolidated)
description: Solo founder design patterns + worker cognitive load + lightweight indicators + visual-first minimal text. Universal across v1/v2/v3.
type: feedback
---

# UX Principles (4 files consolidated)

## Solo founder + forgetful
Default to automation over manual checks. Build self-documenting systems (live admin pages, inline JSDoc with PURPOSE/SCHEDULE/"what breaks", Slack alerts with what/why/what-to-check/link). AI-discoverable patterns (AGENTS.md, centralized cross-cutting concerns, typed unions). Trust delegation — make the decision, explain briefly, build it.

## Worker cognitive load
Minimize what workers need to process. Fewer screens, bigger buttons, one action per screen where possible. Workers are using phones on the job — not sitting at a desk.

## Lightweight indicators, not dialogs
Recurring checks = inline icons (checkmark/warning/X) with hover tooltip, not modal dialogs. Indicators pull attention when needed; dialogs interrupt flow.

## Visual-first, minimal text
Icons, thumbnails, big numbers, spatial layouts tell the story. No state-machine jargon in admin UI. No paragraphs where a badge suffices. Design for scanning, not reading.
