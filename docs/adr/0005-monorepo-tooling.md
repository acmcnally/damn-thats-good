# ADR-0005: Monorepo tooling — pnpm workspaces only, Turborepo deferred

**Status:** Accepted. Build-graph specifics (source-vs-`dist` imports, TS project references, cross-package watch) were resolved when the workspace was scaffolded (DAMN-25) — see "Resolved during scaffold".
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

### Resolved during scaffold (DAMN-25)

Name-resolution (`apps/*` depending on `packages/*` via `workspace:*`) is the easy part pnpm gives us. The rest was decided when the workspace was stood up:

- **Source, not build output.** `packages/shared` and `packages/db` expose `"exports": { ".": "./src/index.ts" }` — apps import the raw TypeScript. There is no per-package `dist/` and no build step for `packages/*`.
- **No TypeScript project references.** Each workspace runs its own `tsc --noEmit` for type-checking (`pnpm -r typecheck`); `moduleResolution: "bundler"` plus the pnpm symlink and the `exports` field resolve cross-package imports in the editor and in `tsc`. Project references (`composite`, `tsc -b`) are deferred on the same "add complexity when the pain is real" basis as Turborepo — revisit if cross-package incremental type-checking gets slow.
- **Cross-package watch is automatic.** Because apps consume source, editing `packages/shared` re-triggers the consuming app's dev server with no extra watcher process.
- **App production builds bundle the workspace packages.** `apps/api` and `apps/web` build with **tsup** (esbuild), configured `noExternal: [/^@dtg\//]` so the `@dtg/*` source is inlined into the output. This is the one real cost of the source-consumption model — a `tsc`-only build cannot reach source that resolves under `node_modules` — and it is a single small config file per app. (`apps/web`'s tsup build is a scaffold placeholder; its real build is Vite, arriving with DAMN-26.)
- **Build ordering is a non-issue** here: `pnpm -r build` only builds the apps (`packages/*` declare no `build` script), and each app bundles what it needs.

Trade-off accepted: the app build toolchain (tsup) is a deliberate choice made now rather than inherited from a framework default. It is a conventional pick for TypeScript monorepos and is swappable.

Deferred, to be picked up with CI (DAMN-27): a `pnpm.onlyBuiltDependencies` allowlist for dependency lifecycle scripts (pnpm 10 blocks them by default; pnpm 9 does not).
