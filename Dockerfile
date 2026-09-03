# syntax=docker/dockerfile:1
#
# Multi-stage build for the local Compose stack (DAMN-26). Two runnable targets:
#   api  — the NestJS server (also runs the one-shot migrate; see docker-compose.yml)
#   web  — Caddy serving the built SPA + reverse-proxying /api to the api service
#
# Image-size trimming (pnpm deploy / pruned node_modules) is a deliberate later chore —
# the walking skeleton just needs the topology to work.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- deps: install once from the lockfile, cached on manifests only ---
FROM base AS deps
# The image builds api + web only; it never runs Playwright, so skip its
# browser download. (@dtg/e2e's manifest is still needed — pnpm-workspace.yaml
# lists it, and --frozen-lockfile validates the whole workspace.)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- build: compile both apps ---
FROM deps AS build
COPY . .
RUN pnpm -r build

# --- api runtime ---
FROM base AS api
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]

# --- web: static bundle behind Caddy ---
FROM caddy:2 AS web
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
