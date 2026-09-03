# Damn That's Good

A personal recipe book — starts single-user, built to grow into sharing recipes with family and friends.

> **Personal project, single maintainer.** External pull requests aren't being accepted right now. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Stack

- **Frontend:** React + TypeScript, responsive + installable; offline (read-only) deferred to V4 (`apps/web`)
- **Backend:** Node.js + NestJS + TypeScript, REST API (`apps/api`) — Express adapter (still revisitable at auth wiring), see ADR-0001
- **Database:** PostgreSQL 17, via Drizzle ORM (`packages/db`)
- **Auth:** WorkOS AuthKit (managed, free tier) — email OTP for V1, Google OAuth in V3; Auth0 is the documented fallback. See ADR-0003.
- **Monorepo:** pnpm workspaces — `packages/*` consumed as TS source; API bundled with tsup, web built with Vite; Turborepo deferred. See ADR-0005.
- **Hosting:** self-hosted on Proxmox, Docker Compose; public ingress (Cloudflare Tunnel vs. Tailscale Funnel) not yet locked, see ADR-0004

See `docs/adr/` for the reasoning behind each of these.

## Repo layout

```
apps/
  web/      React + TS PWA frontend
  api/      NestJS + TS backend (REST API)
packages/
  db/       Drizzle schema + migrations — source of truth for the data model
  shared/   Shared types/DTOs used by both web and api
infra/      Docker Compose, Caddy reverse proxy config, cloudflared config
docs/
  adr/        Architecture Decision Records — why we chose what we chose
  features/   Per-feature requirement/design specs (written per feature as work starts; only the template exists so far)
```

## Project tracking

Feature backlog lives in Linear — team "Damn That's Good" (issue prefix `DAMN-`), organized into four release Projects: V1 Foundation, V2 Quality of Life, V3 Bringing People In, V4 App Experience (broadening access across modalities — responsive web, installable PWA, native-wrapped mobile app). Every recipe view requires authentication in every release; the app is never public to the open internet.

## Development workflow

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers contributor status and how work happens in this repo. External pull requests aren't being accepted right now.

## Getting started

Requires Node ≥24 (see `.node-version`) and pnpm (via `corepack enable`).

Docker is also required (Postgres, and the Testcontainers-backed test tier — ADR-0012).

```bash
pnpm install
pnpm verify   # lint + typecheck + test + build, across every workspace
```

Individual gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. `pnpm format` applies Prettier.

### Running it locally

```bash
pnpm dev             # Postgres in Docker + API and web on the host (hot reload) → http://localhost:5173
docker compose up    # the whole app in containers, behind Caddy            → http://localhost:8080
```

Copy `.env.example` to `.env` first (git-ignored; local dev values only). `pnpm dev:down` /
`docker compose down` tear the stack down.

The current app is a walking skeleton (`DAMN-26`): one page that round-trips a value from Postgres
through the API, plus `GET /api/health`. Real recipe features start with `DAMN-1`.
