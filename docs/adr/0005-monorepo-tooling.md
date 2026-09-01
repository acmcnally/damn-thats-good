# ADR-0005: Monorepo tooling — pnpm workspaces only, Turborepo deferred

**Status:** Accepted. Build-graph specifics (source-vs-`dist` imports, TS project references, cross-package watch) to be pinned when scaffolding `packages/shared` — see "What pnpm workspaces does *not* solve".
**Decision drivers:** skill development (portability lens) · scope & simplicity

## Context

Frontend (`apps/web`) and backend (`apps/api`) need to share TypeScript types/DTOs without duplication or a manual sync process. Solo developer, small number of packages.

## Decision

**Plain pnpm workspaces** (`pnpm-workspace.yaml`, `workspace:*` protocol) as the foundational mechanism — this is required regardless of any task-runner choice, since it's what lets `apps/web` and `apps/api` depend on `packages/shared` and `packages/db` by name, resolved locally. **No Turborepo, no Nx** for now.

## Alternatives considered

- **Turborepo**: adds content-hash task caching and a task graph on top of workspaces — genuinely useful once CI/build times get slow from redundant rebuilds, but that problem doesn't exist yet at this repo's size. Explicitly deferred, not rejected — designed to layer onto an existing pnpm workspace setup incrementally (just add a `turbo.json`) whenever it's actually needed.
- **Nx**: a full architectural platform (import-level dependency graph, code generators, enforced boundaries, "affected" commands) aimed at multi-team, multi-app repos. Judged clearly the wrong tool for a solo project — solves governance problems that don't exist here.

## Consequences

- No build caching yet — full rebuilds every time. Acceptable at current repo size; revisit (add Turborepo) the first time local builds or CI start feeling slow from unrelated-package rebuilds.
- Minimal tooling surface to learn/maintain, consistent with the project's general "add complexity only when the pain is real" approach.

### What pnpm workspaces does *not* solve (address during scaffold)

Name-resolution (`apps/*` depending on `packages/*` via `workspace:*`) is the easy part. The parts that still need an explicit decision:

- **Source vs. build output:** do `apps/web` / `apps/api` import `packages/shared` and `packages/db` as raw `.ts`, or as compiled `dist/`? Raw TS is simplest in dev but the API's production `tsc`/bundler build must then be configured to compile them too.
- **TypeScript project references** (`composite: true`, `references: [...]`) — needed for correct incremental builds and editor go-to-definition across packages.
- **Dev-mode watch across packages** — editing `packages/shared` should hot-reload both apps without a manual rebuild.
- **Build ordering** — `packages/*` before `apps/*`.

These are the reasons projects eventually reach for `tsc` references / `tsup` / Turborepo. Deferring the *task runner* is fine; pick a concrete answer for source-vs-output and watch mode when scaffolding `packages/shared`, and record it here.
