# Cognitive System v2 Upgrades — Design Spec

**Date:** 2026-05-22
**Status:** Approved
**Scope:** 5 upgrades, implemented together

## 1. Centralized Configuration

Single config at `.axhy/config.json`. Loader at `src/shared/config.mjs` with fallback defaults.
Replaces hardcoded WORKSPACE_ROOTS in 7 files.

## 2. Identity Rewrite

Purpose-first framing replacing defensive prohibitions in CLAUDE.md.

## 3. Check-Order Fix

Reorder main section of pre-edit-guard.mjs: expiry before scope.

## 4. Session-Retro Skill

7 reflection questions at session end. Output to docs/retros/. Brain-embedded.

## 5. Structured Evidence Validator

Replace keyword regex with evidence fields by risk level.

## Implementation: config -> check-order -> evidence -> retro -> identity
