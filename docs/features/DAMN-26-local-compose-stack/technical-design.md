# DAMN-26 — Local Compose stack + walking skeleton

**Linear:** [DAMN-26](https://linear.app/acmcnally/issue/DAMN-26/local-compose-stack-walking-skeleton) ·
**Release:** V1 Foundation · milestone "Platform (walking skeleton)"
**Blocked by:** DAMN-25 (merged) · **Blocks:** DAMN-27 (CI)
**Workflow depth:** light touch — this doc stands in for the UX and adversarial-design-review
phases; the pre-PR code review still runs. Implementation is phased with a review pause
between each phase (see [Implementation phases](#implementation-phases)).

---

## Requirements (frozen)

Verbatim scope from the Linear issue — frozen at scope lock-in, further tracking is issue comments.

- Docker Compose stack, local: Postgres + the NestJS API + the web app.
- Drizzle wired to Postgres (ADR-0002); one baseline migration; migrations run as an explicit
  one-shot step, **not on app boot** (ADR-0010).
- `GET /api/health` — lightweight, **unauthenticated**, returns 200 + a trivial DB-connectivity check
  (ADR-0010 flags this as a V1 requirement for the uptime monitor).
- Web renders one page that calls the API.
- `pnpm dev` (hot reload) and `docker compose up` both bring the whole thing up locally.
- Postgres data on a named volume; `.env` conventions established (not committed — ADR-0010).

**Done when:** `docker compose up` serves the web page, `GET /api/health` returns 200, and the page
shows data that came through the API from Postgres.

**Explicitly not in scope:** any recipe/book/version schema (DAMN-2), auth (DAMN-31 / DAMN-1),
CI (DAMN-27), Playwright workflow tests (DAMN-27), staging/deploy (later), the Caddy-vs-cloudflared
edge decision for production (ADR-0004 — this issue only stands up an internal reverse proxy locally).

---

## Decisions locked at scope lock-in

| # | Decision | Rationale |
|---|---|---|
| 1 | **NestJS + Express adapter**, provisionally | ADR-0001's documented leaning. Not marking the ADR settled — that happens at auth wiring (ADR-0001 § "Open"). A one-line note added to ADR-0001. |
| 2 | **Caddy reverse proxy in the Compose stack** now; Vite dev-proxy in `pnpm dev` | Single origin, no CORS, establishes the ADR-0004/0010 target topology (`/api/*` → API, everything else → static web) while it is cheap. Caddyfile stays near-zero-config per ADR-0004's condition. |
| 3 | **Seeded `app_meta` table + `GET /api/meta`** as the round-trip | A real table and a real Drizzle query is a more honest skeleton than a bare `SELECT 1`; trivially additive when DAMN-2 brings the real schema. All of it is marked scaffold (see [Scaffolding & teardown](#scaffolding--teardown)). |
| 4 | **Testcontainers API component-test harness** included | Establishes the ADR-0012 middle tier properly. Runs locally and (DAMN-27) in CI. |
| 5 | **Playwright workflow tier + git `pre-push` hook deferred to DAMN-27** | No auth or real multi-step flow exists yet to protect; the health path is covered by the API component test. |
| 6 | **React 19 + Vite** (latest stable) for `apps/web`; replaces the tsup placeholder | ADR-0005 always had `apps/web`'s "real build is Vite, arriving with DAMN-26". |
| 7 | **Baseline-migration seed** (the one `app_meta` row is inserted by the baseline migration, not a separate seed script) | Deterministic, one fewer step in the bring-up, and it is all scaffold anyway. |
| 8 | **Postgres 17.11**, exact tag, **Debian base** (`postgres:17.11`, not `-alpine`) | ADR-0010 wants the version byte-identical across staging/prod — pin from the start. Debian/glibc over Alpine/musl: matches typical production Postgres and avoids index-collation drift if the base image family ever changes. The API image (Phase D) follows suit — `node:24-bookworm-slim`, not `-alpine`. |

### Still open — to confirm during Phase B

**API build toolchain & decorator metadata — RESOLVED in Phase B.** NestJS DI depends on
`emitDecoratorMetadata`, which esbuild (and therefore `tsup`) does not emit.

**Landed on option (a): `tsup` + a small inline esbuild plugin that routes every `.ts` through
`@swc/core` (`transformFile`) before esbuild bundles.** SWC config in `apps/api/.swcrc`
(`legacyDecorator` + `decoratorMetadata`). The plugin sets `resolveDir` per file — `unplugin-swc`'s
own esbuild adapter did **not** (it left esbuild unable to resolve `@dtg/*`), so the plugin is ~12
hand-written lines instead. ADR-0005 unaffected: the API still bundles `@dtg/*` from source.

Knock-on findings:
- **`nest build` / `nest start` don't fit this repo.** Both emit file-per-file ESM with the
  source's extensionless imports (`./app.module`), which Node's ESM loader rejects
  (`ERR_MODULE_NOT_FOUND`). Bundling sidesteps it entirely.
- So **dev also uses tsup** — `tsup --watch --onSuccess "node dist/main.js"`. Full-restart on
  change (same as `nest start --watch` would give), ~90 ms rebuild.
- **`@nestjs/cli` dropped.** Only `nest g` scaffolding needed it, and its dependency tree is large.
  Modules are hand-authored (also better for the "see what each file does" goal). `pnpm add -D
  @nestjs/cli` any time if `nest g` is wanted.
- Phase E's `component-api` vitest project will use the same SWC path (an `unplugin-swc` vite plugin,
  or the inline approach) — TBD in Phase E, independent of this.

Net `apps/api` toolchain deps: `@swc/core` + `tsup` (+ `typescript`, `@types/node`). No `@nestjs/cli`,
no `unplugin-swc`, no `nest-cli.json`.

---

## Architecture

```
                          docker compose up
  ┌─────────┐   :8080   ┌──────────────┐  /api/*   ┌──────────────┐
  │ browser │──────────▶│  caddy       │──────────▶│  api (Nest)  │
  └─────────┘           │  static web  │  :3000    │              │
                        │  + /api proxy│           └──────┬───────┘
                        └──────────────┘                  │ DATABASE_URL
                                                          ▼
                          ┌───────────┐  runs once  ┌───────────┐
                          │ migrate   │────────────▶│ postgres  │  volume: pgdata
                          │ (one-shot)│  then exits │  :5432    │
                          └───────────┘             └───────────┘

  pnpm dev (host, no Caddy)
  vite :5173  ──/api proxy──▶  nest :3000  ──▶  postgres :5432 (compose: only this service up)
```

- **`docker compose up`**: `postgres` starts → healthcheck passes → `migrate` runs the baseline
  migration and exits `0` → `api` starts (gated on `migrate` completing successfully) → `caddy`
  serves the built web bundle and proxies `/api/*` to `api`. Browser hits `http://localhost:8080`.
- **`pnpm dev`**: brings up only the `postgres` service via Compose, runs the migration once, then
  starts `nest start --watch` and `vite` in parallel. Vite serves the web app on `:5173` and proxies
  `/api` to the Nest process on `:3000`. Hot reload on both. No Caddy, no containers for app code.

---

## Data model impact

One scaffold table. Baseline migration `packages/db/drizzle/0000_*.sql`, with a provisional header:

```sql
-- SCAFFOLD(DAMN-26): provisional baseline. app_meta exists only for the walking-skeleton
-- round-trip. DAMN-2 REGENERATES this baseline from the real schema rather than adding a
-- drop migration on top — safe while no migration has been applied to a persistent DB
-- (no staging/prod yet — ADR-0010; CI uses ephemeral Testcontainers). See technical-design.md.
CREATE TABLE app_meta (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single-row table
  name        text NOT NULL,
  seeded_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_meta (id, name) VALUES (1, 'Damn That''s Good') ON CONFLICT DO NOTHING;
```

Drizzle schema — `packages/db/src/schema.ts`:

```ts
// SCAFFOLD(DAMN-26): walking-skeleton round-trip table, nothing real depends on it.
// DAMN-2 brings the real recipe / version schema and regenerates the baseline migration
// (see "Migration history" below) — app_meta leaves the schema and the history entirely.
export const appMeta = pgTable('app_meta', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
});
```

No `drizzle-kit` config gymnastics — `drizzle.config.ts` points at `src/schema.ts`, migrations land in
`packages/db/drizzle/`, committed. This does **not** pre-empt ADR-0006/DAMN-2; the real content schema
is still owned there.

### Migration history — keep it clean

The DAMN-26 baseline is **provisional**. When DAMN-2 lands the real schema it must *regenerate* the
baseline (delete the DAMN-26 migration files, generate a fresh `0000_*` from the real schema) — **not**
add a `0001_drop_app_meta`. A layered drop would leave "create a table, then drop it" in the
append-only migration ledger forever, replayed by every fresh DB.

Regenerating is safe **only while no migration has been applied to a database that can't be discarded**:

- No staging/prod exists until the deploy-pipeline work (ADR-0010) — well after DAMN-2.
- Local dev DBs are disposable (`docker compose down -v`).
- CI (DAMN-27) runs migrations against ephemeral Testcontainers — state destroyed each run.

If that stops being true before DAMN-2 (a persistent environment appears early), fall back to the
additive `0001_drop_app_meta` migration and accept the history noise. Tracked as a Linear comment on
DAMN-2 (see [Scaffolding & teardown](#scaffolding--teardown)).

---

## Interfaces / API surface

NestJS, global prefix `/api`.

| Route | Auth | Response | Notes |
|---|---|---|---|
| `GET /api/health` | **public, permanent** | `200 {"status":"ok","db":"up"}` / `503 {"status":"error","db":"down"}` | `SELECT 1` via Drizzle with a short timeout. Designed to stay outside any auth guard added in DAMN-31/DAMN-1 (uptime monitor hits it unauthenticated — ADR-0010). Never leaks version/build detail. |
| `GET /api/meta` | public *(scaffold)* | `200 {"name":"Damn That's Good","seededAt":"…"}` | Reads the seeded `app_meta` row via Drizzle. The endpoint the skeleton page renders. **SCAFFOLD** — removed by DAMN-1/2. |

Shared types — `packages/shared/src/`: `HealthResponse`, `MetaResponse` DTOs, imported by `apps/api`
(response typing) now and `apps/web` (fetch typing) in Phase C. First real content in `@dtg/shared`.

Nest module layout (as built):

```
apps/api/
  .swcrc               # SWC transform config (legacyDecorator + decoratorMetadata)
  tsup.config.ts       # tsup + inline SWC esbuild plugin (see build-toolchain note)
  src/
    main.ts            # bootstrap: create app, setGlobalPrefix('api'), enableShutdownHooks, listen
    app.module.ts      # ConfigModule (global, validated, envFilePath ../../.env), Database/Health/Meta
    config/env.ts      # validateEnv(): DATABASE_URL (string), API_PORT (int) — fails boot if bad
    database/
      database.service.ts  # @Injectable — one createDb() pool; onModuleDestroy closes it
      database.module.ts    # @Global — provides + exports DatabaseService
    health/
      health.controller.ts  # GET /api/health → 200 | 503 (ServiceUnavailableException)
      health.service.ts      # execute(sql`select 1`) → {status, db}
      health.service.test.ts # unit (mocked db)
    meta/                     # SCAFFOLD(DAMN-26)
      meta.controller.ts      # GET /api/meta
      meta.service.ts         # select().from(appMeta).limit(1)
```

---

## Environment / config conventions

Single `.env` at repo root, **git-ignored** (already in `.gitignore`). `.env.example` committed.

```dotenv
# .env.example
POSTGRES_USER=dtg
POSTGRES_PASSWORD=dtg_local_dev_only
POSTGRES_DB=dtg
POSTGRES_PORT=5432          # host port for pnpm dev
API_PORT=3000
WEB_PORT=8080               # Caddy, docker compose up

# API reads this. Compose overrides host → "postgres"; pnpm dev uses localhost.
DATABASE_URL=postgres://dtg:dtg_local_dev_only@localhost:5432/dtg
```

- **Compose** loads `.env` (Compose does this automatically) and the `api` / `migrate` services set
  `DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` in their
  `environment:` block (container-internal host).
- **`pnpm dev`** loads `.env` via Node's `--env-file=.env`; `DATABASE_URL` stays `localhost`.
- Nothing secret here — these are throwaway local credentials — but the `.env` / `.env.example` split
  and the "not committed" rule are established now per ADR-0010 so real secrets (WorkOS keys, etc.)
  have a home later.

---

## Test plan (ADR-0012 tiers)

| Tier | What | Where it runs |
|---|---|---|
| **Unit** | `packages/shared` DTO/type helpers (thin — mostly types). `health.service` with a mocked db (returns `up`/`down`). | every build, `pnpm test` |
| **Component — web** (jsdom) | `App.component.test.tsx`: React Testing Library renders `<App/>`, MSW mocks `GET /api/meta`, assert the name renders; assert the error state when the fetch fails. | every build |
| **Component — api** (Testcontainers Postgres) | `health` + `meta` via `supertest` against the real Nest app + real Drizzle against a throwaway Postgres container that the shared helper migrates once. `GET /api/health` → 200 `{db:"up"}`; `GET /api/meta` → the seeded row. | `pnpm verify` (local), CI (DAMN-27) |
| Workflow (Playwright) | — | **deferred to DAMN-27** |

Shared test-DB helper — `packages/db/src/testing.ts`: `startTestDb()` → starts
`@testcontainers/postgresql`, runs `migrate()` against it, returns `{ url, teardown }`. Per-test
isolation (transaction rollback / truncation) is stubbed with a TODO — the skeleton's only endpoints
are read-only, so migrate-once is sufficient; DAMN-2 fleshes out isolation when it adds writes.

DAMN-25's placeholder tests (`apps/*/src/main.test.ts`, `apps/api/src/runtime.component.test.ts`,
`apps/web/src/dom.component.test.ts`, `packages/db/src/index.test.ts`) are **replaced** by the real
tests above — they were explicit scaffold ("RTL + MSW arrive with the real web app in DAMN-26").

---

## Implementation phases

Each phase is one or more commits on the branch, self-contained and runnable. **I pause after each for
you to read the diff and ask questions before starting the next.**

### Phase A — Data layer
- `packages/db`: add `drizzle-orm`, `postgres`; devDep `drizzle-kit`. `drizzle.config.ts`,
  `src/schema.ts` (`appMeta`), `src/client.ts` (`createDb(url)` factory — no import-time singleton, so
  tests inject their own url), `src/migrate.ts` (the one-shot runner, run by Node directly —
  no local imports), baseline migration in `drizzle/`. `src/index.ts` adds schema + client
  exports; `DB_PACKAGE` stays one more phase (the placeholder `apps/api` still imports it) —
  removed in Phase B.
- `docker-compose.yml`: `postgres` service only (pinned tag, named volume `pgdata`, `pg_isready`
  healthcheck). `.env.example`.
- **Verify:** `docker compose up -d postgres`; `pnpm --filter @dtg/db migrate`; `psql` shows
  `app_meta` with one row. ✅ done (commit `3396337`).

**Folded in after Phase A** (commit `ac72928`, owner's call): ESLint gains
`eslint-plugin-simple-import-sort` + `eslint-plugin-unused-imports` — import/export sorting and
`--fix`-able dead-import removal. Repo-wide `eslint --fix` applied (a few import reorders).
`@dtg/*` currently sorts with third-party packages; a dedicated group is a later tune if wanted.

### Phase B — API  ✅ done (commit)
- `apps/api`: real NestJS app — `@nestjs/common` `@nestjs/core` `@nestjs/platform-express`
  `@nestjs/config` `reflect-metadata` `rxjs` `drizzle-orm`. Modules: `config/env`, `database/`
  (`DatabaseService` — one pool, closed on shutdown), `health/` (`GET /api/health`, `SELECT 1`,
  200/503), `meta/` (`GET /api/meta`, reads the seeded row — SCAFFOLD). `main.ts` sets the `/api`
  prefix + shutdown hooks. Build toolchain resolved above; `dev` = `tsup --watch --onSuccess`.
- `packages/shared`: added `HealthResponse` / `MetaResponse` DTOs (imported by api now, web in C).
  `greeting` / `SHARED_PACKAGE` kept until Phase C (placeholder `apps/web` still imports them).
- `packages/db`: `DB_PACKAGE` removed (last consumer gone).
- DAMN-25 placeholder tests removed (`apps/api/src/main.test.ts`, `runtime.component.test.ts`);
  `health.service` unit test added (mocked db, ok/up + error/down paths).
- **Verified:** built API + `pnpm dev` both serve `GET /api/health` → 200 `{status:ok,db:up}` and
  `GET /api/meta` → 200 seeded row; health → 503 `{status:error,db:down}` with Postgres stopped;
  unknown route → 404. `pnpm verify` green (8 tests / 5 files).

### Phase C — Web
- `apps/web`: remove `tsup`; add `react` `react-dom`, devDeps `vite` `@vitejs/plugin-react`
  `@types/react` `@types/react-dom`. `index.html`, `src/main.tsx`, `src/App.tsx` (fetches `/api/meta`,
  renders name + a loading + an error state), `vite.config.ts` (react plugin + `/api` dev-proxy to
  `:3000`). `dev` = `vite`, `build` = `vite build`, `typecheck` unchanged.
- tsconfig: add `"jsx": "react-jsx"`.
- `packages/shared`: drop `greeting` / `SHARED_PACKAGE` (their last consumer, placeholder `apps/web`, is gone).
- **Verify:** `pnpm --filter @dtg/web dev`; browser `:5173` shows the name from Postgres.

### Phase D — Compose stack + orchestration
- Root `Dockerfile` (multi-stage: shared deps → build → `api` runtime target; `web` target =
  `caddy:2-alpine` + built bundle + Caddyfile).
- `docker-compose.yml`: add `migrate` (one-shot, `restart: "no"`, gated on `postgres` healthy),
  `api` (gated on `migrate` completed + `postgres` healthy), `caddy` (`${WEB_PORT}:8080`, gated on
  `api`). `infra/Caddyfile`.
- Root scripts: `dev` (compose up postgres + migrate + `pnpm -r --parallel dev`), `dev:down`.
- **Verify:** `docker compose up` from clean → `:8080` serves the page end-to-end, `/api/health` 200.

### Phase E — Tests + docs
- `packages/db/src/testing.ts` helper; `apps/api` health + meta component tests (`supertest` +
  Testcontainers); `apps/web` `App.component.test.tsx` (RTL + MSW). Wire SWC into the `component-api`
  vitest project so decorator metadata works there (an `unplugin-swc` vite plugin, or reuse the
  inline transform). (`health.service` unit test + placeholder-test removal already done in Phase B.)
- Docs: `README.md` (Getting started → real `pnpm dev` / `docker compose up`; drop the "placeholder
  scaffolds" line), `CLAUDE.md` (Commands + Stack notes), ADR touch-ups below.
- **Verify:** `pnpm verify` fully green (lint + typecheck + all three vitest projects + build);
  `docker compose up` still green.

Then: pre-PR code review (fresh `/code-review`), incorporate findings, open PR, post the
cross-issue follow-up comments on DAMN-1 and DAMN-2 (see [Scaffolding & teardown](#cross-issue-follow-up-linear)).

---

## Scaffolding & teardown

Every temporary artifact carries a `SCAFFOLD(DAMN-26):` comment naming its removal trigger.
`rg 'SCAFFOLD'` lists all of them at any time. This PR also *removes* several DAMN-25 placeholders.

| Artifact | Why it exists | Removed by |
|---|---|---|
| `app_meta` table + baseline-migration seed | one real table for the skeleton round-trip | **DAMN-2** — regenerates the baseline migration from the real schema (see [Migration history](#migration-history--keep-it-clean)); `app_meta` leaves the schema *and* the migration history |
| `apps/api/src/meta/*` + `GET /api/meta` | endpoint the skeleton page reads | **DAMN-1 / DAMN-2** — replaced by real recipe endpoints |
| `apps/web/src/App.tsx` skeleton body (renders the meta row) | proves the round-trip visually | **DAMN-1** — replaced by the real home/recipe-list page |
| `MetaResponse` in `@dtg/shared` | DTO for `/api/meta` | **DAMN-1 / DAMN-2** |
| `packages/db/src/testing.ts` per-test isolation TODO | skeleton endpoints are read-only; migrate-once suffices | **DAMN-2** — fleshes out rollback/truncation isolation when it adds writes |
| _removed here:_ `@dtg/db` `DB_PACKAGE`; `@dtg/shared` `greeting` / `SHARED_PACKAGE`; DAMN-25 placeholder tests | DAMN-25 wiring placeholders | **DAMN-26 (this PR)** |

`GET /api/health` is **not** scaffold — it is a permanent ADR-0010 requirement.

### Cross-issue follow-up (Linear)

The `SCAFFOLD(DAMN-26):` tags are in-code breadcrumbs — only seen by someone already editing that
file. The proactive reminder goes on the issues that inherit the cleanup, posted **when this PR
opens** (so they can link the merged design doc and the real migration filenames):

- **DAMN-2** — comment: regenerate the baseline migration (don't add a drop); remove the `app_meta`
  table/schema; flesh out `packages/db/src/testing.ts` per-test isolation.
- **DAMN-1** — comment: the skeleton `GET /api/meta`, the `App.tsx` body, and `MetaResponse` are
  scaffold to replace with the real home/recipe surface.

---

## ADR / doc updates in this PR

- **ADR-0001** — one line under "Open: Express vs Fastify adapter": Express adapter in use as of
  DAMN-26; the decision is still settled at auth wiring, not here.
- **ADR-0002** — Status note: Drizzle + Postgres wired to a running stack as of DAMN-26; baseline
  migration mechanics established (`drizzle-kit generate` → committed SQL → one-shot `migrate`).
- **ADR-0005** — only if the build open-item lands on `nest build` (option b): update the scaffold
  note that says `apps/api` bundles `@dtg/*` via tsup.
- **ADR-0010** — note the one-shot `migrate` Compose service and `GET /api/health` now exist.
- **README.md**, **CLAUDE.md** — Getting started / Commands.

---

## Risks & watch-items

- **NestJS + ESM + Vitest + decorator metadata** is a known-fiddly combination. Mitigation: the
  `unplugin-swc` recipe is well-trodden; Phase B resolves the build path explicitly and Phase E proves
  the test path. If it turns into a rabbit hole, `nest build` + CommonJS output for the API is the
  documented escape hatch (noted as option b).
- **`pnpm deploy` / workspace resolution in Docker** (only if option b): first time the monorepo is
  containerised. Phase D is where this surfaces; keeping the image naive (copy more than needed) is
  the fallback, image-size optimisation is a later chore.
- **Docker not available in the Claude Code session** until the `docker` group propagates (logout/login
  on the box). Phases A–C are verifiable without it; D and E's Testcontainers need it. If it's still
  unavailable at those phases, you run the verification and I work from the output.
