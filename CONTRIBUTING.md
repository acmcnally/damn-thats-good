# Contributing

## Not open to outside contributions right now

This is a personal project with a single maintainer, in early foundation build.

- **Pull requests from outside collaborators are not being accepted at this time.**
- The issue tracker is a private Linear workspace, so there is no external issue queue either.
- You're welcome to fork and explore.

## Tools

| Role | This project |
|---|---|
| Issue tracking | Linear, team "Damn That's Good" (issues prefixed `DAMN-`) — private |
| Source | GitHub; `main` is the mainline; **squash merges only** |
| Design docs | `docs/features/<issue-key>-<slug>/` — requirements, `technical-design.md`, `mockups/` |
| Architecture rationale | `docs/adr/` |
| Testing | ADR-0012 — `pnpm verify` runs all tiers locally (primary gate); CI is the backstop |
| Deploy & release | ADR-0010 — merge → staging; promotion to prod is **per-release, not per-feature** |
