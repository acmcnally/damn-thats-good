# ADR-0012: Testing strategy

**Status:** Accepted
**Decision drivers:** skill development (a conventional, portable test setup) · scope & simplicity (one runner, local-first to conserve CI)

## Context

The stack is a pnpm-workspace TypeScript monorepo: a React SPA, a NestJS REST API, Drizzle + PostgreSQL. Design and implementation of the V1 features (DAMN-1 … DAMN-6) is about to start and there is no agreed testing approach. ADR-0010 deliberately parked the topic ("Testing approach lives here until it earns its own ADR") — this ADR is that document, and ADR-0010 now points here.

Constraints and forces:

- Solo developer in V1; family-facing once deployed.
- GitHub Actions CI is comparatively slow, and a wasted round-trip costs real wall-clock time. Dev hardware is ample and mostly idle. We want mistakes caught **before** a push, not on the third CI run.
- A large share of the riskiest V1 logic is **only meaningfully testable against a real Postgres**: the optimistic-concurrency guards in DAMN-2 (HTTP 412 on a stale `current_version_id`, the separate row-version guard on non-versioned fields), the save-time structural "did `content` change?" check, and later the DAMN-6 full-text / `pg_trgm` search ranking. Mocking the database there tests the mock.

## Decision

### Three tiers

1. **Unit** — pure logic, no I/O. `packages/shared` (the `content` schema, `diffContent`, the ingredient-line parser, later scaling / unit conversion), NestJS services with mocked collaborators, React hooks and helpers.
2. **Component** — two flavours under one name:
   - *Web:* React Testing Library rendering a component subtree in jsdom, with the network mocked by MSW.
   - *API:* HTTP-level tests via `supertest` against the real Nest application with real Drizzle against a **real Postgres** (Testcontainers); external services (WorkOS) mocked.
3. **Workflow** — Playwright driving web + API + Postgres together (Docker Compose), authentication via a test bypass. A deliberately small set of critical paths: sign in, create a recipe, edit → new version, revert, import from URL, search, and the concurrent-edit 412 reconcile path.

### What runs where — gate on dependencies, not on the tier label

The real question for any test is *what does it need to run* — a browser? a real Postgres? — not which tier it sits in.

- **Every build, watch mode, and the pre-push hook (local):** unit + web component. These need neither Docker nor a browser and must stay fast — target well under ~20 s at pre-push. Enforced by a git `pre-push` hook.
- **`pnpm verify` — one local command, and the same job in CI:** all three tiers, including API component (Testcontainers Postgres) and the Playwright workflow suite. Contributors run `pnpm verify` locally before opening or updating a PR. **The local run is the primary gate; CI is the backstop** — the aim is that CI rarely finds anything the developer could have seen locally.
- **CI on PR:** runs the `verify` equivalent. Required to merge.
- **Before deploy:** the workflow suite runs again against the built artifacts, after migrations and before cutover — a hard gate on the deploy pipeline (ADR-0010). A green PR is necessary but not sufficient; the deploy re-checks end-to-end against exactly what is shipping.

### Tooling

- **Vitest** for tiers 1 and 2 — one configuration and mocking story across web and API. NestJS defaults to Jest but runs on Vitest; the Jest-compatible API makes this cheap.
- **React Testing Library** + **MSW** for web component tests.
- **`@testcontainers/postgresql`** for the API component tier and the workflow Postgres, so full-text search, `pg_trgm`, JSONB, generated columns, and the row-version / 412 logic are exercised against the real engine. A shared test-DB helper migrates once per run and isolates tests by transaction rollback or truncation.
- **Playwright** for the workflow tier.
- Two test runners total (Vitest + Playwright) — the conventional low-maintenance setup.

### Where the weight goes

- No target coverage percentage. `packages/shared` is the crown jewel — everything depends on `diffContent`, the parser, and the schema — so it gets near-exhaustive unit tests.
- Every API route gets at least one component test through the real database.
- The workflow tier stays small on purpose: high-value happy paths plus the concurrency-conflict path. It is the slowest and most brittle tier and is not where coverage is bought.

## Alternatives considered

- **Jest instead of Vitest** — Nest's default. Rejected: a second toolchain alongside the Vite-based web package, slower, with no offsetting benefit. Vitest is API-compatible.
- **Mock the database in the middle tier** (`pg-mem`, Drizzle mocks). Rejected: the V1 logic most worth testing is Postgres-specific behaviour; a fake Postgres verifies the fake.
- **CI-only gating** — a thin local setup leaning on GitHub Actions. Rejected explicitly per the constraints above: Actions is slow, round-trips cost wall-clock time, and local hardware is idle. Local-first, CI-as-backstop.
- **Two tiers (unit + E2E), skip component.** Rejected: pushes too much onto the slow, brittle Playwright tier and localises failures poorly.
- **Contract tests / more tiers.** Disproportionate for one team in one repo.
- **Defer Playwright** (as ADR-0010 originally mused). Superseded — V1 ships real multi-step workflows (versioning, import, reconcile) worth protecting from the start, even though the suite begins tiny.

## Consequences

- A real Postgres via Docker / Testcontainers is now a hard requirement of the dev environment and CI — `docker` must be available in the local dev environment and on the CI runner. Acceptable; ADR-0004 already puts Docker at the centre.
- The `pre-push` hook adds latency to every push, kept tolerable by scoping it to the two fast tiers. `--no-verify` remains available under time pressure, with CI as the net.
- `pnpm verify` intentionally duplicates the CI PR job. That redundancy is the point: failures surface locally first.
- The deploy pipeline gains a workflow-test gate, so deploys are slower and depend on Playwright staying green. Trade accepted for a family-facing app where brief downtime is already tolerated — better than shipping a broken cook mode.
- Turborepo is still not in use (ADR-0005). If `verify` becomes slow as the suite grows, task caching is the first lever to pull, per that ADR.
