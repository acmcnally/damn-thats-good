# CLAUDE.md

Context for Claude Code when working in this repo. Read `docs/adr/` for the *why* behind any of this; read `docs/features/` for feature-level requirements before implementing something in the backlog (specs are written per feature as work starts — only the template exists right now).

## What this is

A personal recipe book web app ("Damn That's Good"), built to start single-user and grow into a multi-user app shared with family/friends. Full feature roadmap tracked in Linear (team "Damn That's Good", issues prefixed `DAMN-`), organized into four releases: V1 Foundation, V2 Quality of Life, V3 Bringing People In, V4 App Experience (broadening how the app is reached — responsive web, installable PWA, native-wrapped mobile app; the Linear project was formerly named "Going Public", which is a misnomer — see the visibility note below).

## How decisions are justified

Every decision in this project traces to one or more of four categories. When evaluating or proposing a change, name which category applies.

1. **Skill development** — the choice advances a hands-on learning goal for this project: React, full-stack delivery (frontend → service tier → database), self-hosting on Proxmox / containerization, Linux, and working fluently with an AI coding tool. Applied with a portability lens: favour choices that reflect industry norms and marketable skills, *except* where that would push the project past hobbyist scope. Examples: React, NestJS, PostgreSQL, the self-hosted Proxmox/Docker setup.
2. **Product preference** — how the owner wants the app to work and which features it has. The owner is the product owner; these are settled on preference and are only open to challenge on their *technical consequences*, not their merits. **The recipe versioning model and the four-release roadmap are pure product preference.** The roadmap also serves as forward-context so Claude can avoid choices that would force a later rewrite.
3. **Scope & simplicity** — keep it hobbyist-scale: low ops burden, defer anything heavy until the pain is real. **Strong preference for zero / near-zero ongoing cost**, but not a hard gate — a paid service is fine when it's clearly justified and the cost stays small and controlled. Self-hosting on the existing Proxmox box is the default because it's free *and* serves learning goals, not because paid services are forbidden. This is what "add complexity only when the pain is real" means — it is *this* rule, not a blanket one, and it does not override categories 1 and 2.
4. **External input** — considered because a peer is using it or because an AI was asked to weigh in. **Lowest-weight driver.** A decision resting mainly on this stays open longer and should be revisited rather than treated as locked. (Current example: the WorkOS-vs-Auth0 provider choice in ADR-0003 is kept revisitable on this basis.)

**Presenting decisions to the owner:** for any non-trivial decision, lay out the realistic options with their trade-offs *and then* give a recommendation — not a bare recommendation, not an open-ended menu. Don't unilaterally mark something "decided" on the owner's behalf.

## Stack

- **Frontend:** React + TypeScript. Responsive + installable (manifest) from the start. **No service worker in V1.** Offline support is **read-only and V4-only** (ADR-0001 / `DAMN-21`): view already-loaded recipes when disconnected, offline cook mode, a recently-viewed local cache, maybe a downloadable full-book local store. **Offline editing is never in scope, any release.**
- **Backend:** Node.js + NestJS + TypeScript, REST API. HTTP adapter (Express vs Fastify) is **not locked** — ADR-0001 currently leans Express (better-documented, broadest middleware/auth compatibility); confirm during the auth wiring.
- **Database:** PostgreSQL
- **ORM:** Drizzle (not Prisma — chosen for staying close to SQL; note it still has a `drizzle-kit generate` migration step)
- **Auth:** email OTP / passwordless for V1, **Google OAuth deferred to V3**. **Provider decided** (ADR-0003): **WorkOS AuthKit**, free tier — hosted AuthKit on the `*.authkit.app` subdomain (no custom domain in V1), email OTP via "Magic Auth", WorkOS sends the OTP emails. Rolling refresh sessions (short access-token TTL + rotating refresh token, server-side revocation). **Auth0 is the documented fallback** if WorkOS's terms change. Don't hand-roll auth, self-host it, or assume Better Auth.
- **Monorepo:** pnpm workspaces (`@dtg/*` packages). No Turborepo/Nx yet — add Turborepo only if/when builds get noticeably slow. `packages/*` are consumed as raw TS source (no per-package build); apps bundle them via tsup. Shared tool versions (`typescript`, `tsup`, `@types/node`) via the pnpm `catalog:` in `pnpm-workspace.yaml`. TS strict base in `tsconfig.base.json`; per-workspace `tsc --noEmit` typecheck; ESLint flat config (`eslint.config.ts`) + Prettier (Prettier skips `*.md`). Full rationale: ADR-0005.
- **Hosting:** self-hosted on a Proxmox box. **Environments (ADR-0010 § Environments):** dev is local only (no shared or always-on dev server); **staging is a Proxmox LXC**, prod is a dedicated VM; CI uses ephemeral Testcontainers. Promotion: merge to `main` → CI image → staging → workflow tests → manual promote of the same tag to prod. Staging isn't built until the deploy pipeline is. Docker Compose runs Postgres + the NestJS API (settled) plus edge pieces that are **not locked**: an internal reverse proxy (Caddy, if it stays simple) and a tunnel. **Public ingress is undecided — Cloudflare Tunnel vs. Tailscale Funnel** (ADR-0004), to settle before first internet exposure. No open inbound ports either way. A custom domain is registered for the app.
- **Deploy / CI / secrets / observability:** ADR-0010. **Backup & DR:** ADR-0009 (on-box backups are not sufficient — off-site copy required).
- **Testing:** ADR-0012 — three tiers (unit / component / workflow); `pnpm verify` runs all of them locally and is the primary gate, CI is the backstop. Unit + web-component tests run on every build; the component tier uses a real Postgres via Testcontainers. The workflow tier is Playwright (`@dtg/e2e`, `pnpm e2e`) — it stands up a `docker compose` stack locally, self-skips in the CI `verify` job, and runs against the deployed staging environment in the `e2e-staging` CI job (its result gates the prod promote — DAMN-29/30).
- **Photo storage:** ADR-0008 — filesystem blobs (UUID paths, downscaled on upload, no originals kept) + `media` metadata rows, served through an authenticated API route. **V3 feature (`DAMN-24`) — no `media` schema in V1.**

## Conventions

- **Language:** TypeScript everywhere, strict mode. No plain JS.
- **Commands (repo root):** `pnpm verify` is the gate (lint + typecheck + test + build + `pnpm e2e`); run individually as `pnpm lint` / `typecheck` / `test` / `build` / `e2e`. `pnpm verify:fast` is the two fast test tiers only (the `pre-push` hook; ~4s). `pnpm e2e` needs Docker (first run builds images — slow). `pnpm format` writes Prettier. `pnpm dev` runs the local stack (Postgres in Docker + API/web on the host, hot reload); `docker compose up` runs the whole app in containers behind Caddy. Node ≥24, pnpm via `packageManager` / corepack, Docker required.
- **CI (ADR-0010, `.github/workflows/ci.yml`):** the `verify` job runs `pnpm verify` on every PR and is the required check for `main` (the workflow tier self-skips there); a merge to `main` also builds + publishes the `api` / `web` images to GHCR, then the `deploy-staging` job (DAMN-28) deploys them to the staging LXC over Tailscale SSH, then the `e2e-staging` job (DAMN-29) runs the Playwright smoke test against staging. `deploy/` holds the staging/prod compose + deploy script + runbook.
- **API style:** REST, resource-oriented.
- **Shared types:** anything crossing the web/api boundary (request/response DTOs, core entity shapes) belongs in `packages/shared`, imported by both, not duplicated.
- **Data model source of truth:** `packages/db` — Drizzle schema + migrations. Don't hand-write SQL migrations outside Drizzle's migration flow.

## Feature workflow

Claude: for feature-sized work, invoke the `feature-workflow` skill and follow it; skip it for small fixes and chores. `CONTRIBUTING.md` lists this project's tool bindings (tracker, source, design-docs path, testing, release); deploy/promotion rationale is in ADR-0010.

## Data model essentials

- **User** — a local `users` row is the foreign-key anchor for authored versions, book ownership, and profiles. It holds the WorkOS user id + email — no credentials; auth identity lives at the provider (ADR-0003). Keep it credential-type-agnostic so V3 can add a Google identity association without a schema rework.
- **Profile** — 1:1 with User, optional/presentational (display name, avatar, location, bio). Separate from auth identity.
- **Recipe Book** — owned by one or more Users, flat/equal ownership (no roles). Contains Recipes.
- **Recipe** — belongs to exactly one Book. Stable/mutable fields live directly on it: title, servings/yield, provenance, tags, visibility (`private` / `unlisted` / `public`). Photo (a `media` FK — ADR-0008) is a **V3** addition (`DAMN-24`); the V1 schema has no photo field.
  - **`provenance`**: a free-text note on where the recipe came from — a source book or cook, a website, a person ("Grandma's card"). Candidate fourth search-weight tier (name > tags > ingredients > provenance) — open, not yet decided; see `DAMN-10` / ADR-0002, which flag that provenance may not earn its own tier and a description/notes field could take that slot instead. Distinct from `forked_from`, which is the structured pointer set by an in-app "Copy to Recipe Book".
  - **Every recipe view requires authentication. Always. This is a permanent, explicit design decision — not release-gated, and no release (V4 included) changes it.** The app has no anonymous / public-to-the-internet access to any recipe. Do not build unauthenticated recipe routes.
  - `private` = owners of the book only. `unlisted` = any signed-in app user who has the link; not browsable or search-indexed. `public` = visible to any signed-in app user ("public" is *within the app*, never on the open internet).
- **RecipeVersion** — versioned content only: ingredients + steps, stored as a structured JSONB `content` column (ADR-0006 — not a text blob, not Cooklang). One row per save. Only changes to ingredients/steps create a new version — title/photo/servings/tags/notes/visibility do NOT. Revert = new version pointing at old content (history stays linear, no branching). Diff / version comparison is structural / field-level, keyed by stable per-line ids — not a plain-text diff.
- **Collection Reference** — explicit "Add to Collection" action, lightweight link back to someone else's recipe (not a copy), user-deletable.
- **Copy (via "Copy to Recipe Book")** — full independent copy, sets a `forked_from` pointer for lineage tracking only, no live sync back to source.
- **Recent Views** — rolling last-10 log of any recipe viewed, any source, passive/automatic.

Full reasoning for all of this: `docs/adr/0007-recipe-versioning-model.md` and the feature specs in `docs/features/`.

## Open / pinned decisions — read `docs/adr/0006` + `0007` before building recipe entry/versioning

- **Recipe content representation is DECIDED (ADR-0006):** structured content in a JSONB `content` column on `RecipeVersion` — not Cooklang, not a text blob. **The concrete field-level schema is a per-feature deliverable** (`DAMN-2`, which owns the recipe/version data model and versioning mechanics; `DAMN-3` is the version-history/diff/revert UI on top), evolves additively, and does NOT reopen ADR-0006. Standing requirements from the ADR: stable per-line ids (for diff/merge), a `content_schema_version` tag, and the schema defined once in `packages/shared`. Interop: JSON-LD is the primary import/export format; Cooklang import/export is best-effort and lossy. Scaling + like-for-like unit conversion via TS libraries in V2; volume↔weight via a seeded density table (USDA FDC + King Arthur), degrade gracefully.
- **Ingredient/step sectioning** ("For the sauce:") is an open flag for `DAMN-2` — decide in-or-out deliberately; retrofitting it into a flat list is expensive.
- **Rust/WASM via `cooklang-rs`**: rejected (ADR-0006) — TypeScript. Revisit only if the V2 TS scaling/conversion work hits a wall.
- **Concurrent-edit handling is DECIDED (ADR-0007):** optimistic concurrency — a content save carries the base `current_version_id`, server rejects (412) if stale; non-versioned `Recipe` fields carry a separate row-version guard; on rejection the client preserves the draft and prompts to reconcile. This no-data-loss floor is permanent. An assisted-merge UI is planned for V3 (with shared books) but may be scoped out. Real-time/CRDT co-editing is rejected.

## Search

Postgres full-text search (`tsvector`/`ts_rank`) + `pg_trgm` for fuzzy matching. No dedicated search engine (Meilisearch, etc.) planned — deferred because it's an extra always-on service, not because of row count (ADR-0002). Prefix matching for filter-as-you-type and blending FTS rank with trigram similarity in one query are the fiddly parts — design them during the V1 search build, don't assume they're trivial.
