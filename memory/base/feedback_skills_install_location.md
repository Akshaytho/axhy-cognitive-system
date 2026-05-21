---
name: Never install skills/plugins inside the project repo
description: Install Claude skills/plugins at user scope (~/.claude/), never inside project .claude/skills/ — past incident bloated frontend build
type: feedback
originSessionId: 8a3da20a-8781-46bf-9c37-687c215bf350
---
Install Claude Code skills and plugins at **user scope** (`~/.claude/plugins/` via `claude plugin install`), never inside the project's `.claude/skills/` directory.

**Why:** Previously installed UI/UX Pro Max skill at `eclean-admin/.claude/skills/ui-ux-pro-max/` inside the repo. It got committed and added ~10 minutes to the user's frontend build time. User was frustrated waiting on builds.

**How to apply:**
- For Claude Code plugins: use `claude plugin marketplace add <repo>` + `claude plugin install <name>@<marketplace>` — these go to `~/.claude/plugins/` automatically (user scope), NOT the repo
- Never `git clone` a skill/plugin into the project directory
- Never copy skill files into `<project>/.claude/skills/`
- If a skill MUST live in-repo, add it to `.gitignore` first and confirm with user
- Today (2026-04-13) installed Superpowers correctly via `claude plugin install superpowers@superpowers-marketplace` — user scope, no repo impact
