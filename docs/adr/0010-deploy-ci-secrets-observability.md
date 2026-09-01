# ADR-0010: Deploy, CI, secrets, and observability

**Status:** Proposed — reasoning complete. Open: how the web frontend is served in production (static artifact via Caddy vs. its own container) — reconcile with ADR-0004. Testing strategy has moved to ADR-0012.
**Decision drivers:** skill development (end-to-end deployment is a project goal) · scope & simplicity

## Context

The other ADRs describe *what* runs (ADR-0004: Docker Compose on a Proxmox VM, or an LXC) but not through which environments code flows, how it gets there, how it is tested before it does, where secrets live, or how the owner finds out the app is down. For a self-hosted app that family depends on, these are not optional. This ADR is deliberately minimal — matching the project's "add complexity only when the pain is real" principle — but it does not skip the questions.

Constraints: solo developer; prefer free/low-cost tooling (not mandatory); self-hosted app.

## Decision

### Environments

Four environments, two of them deployed:

- **Local dev** — the maintainer's local development environment (ADR-0004). `pnpm dev` for web + API, Postgres in a local Docker Compose, WorkOS pointed at its Staging environment. This is the *only* "dev" environment — there is no shared or always-on dev server. Single developer; local dev doubles as the workstation.
- **CI** — GitHub Actions, ephemeral. Postgres via Testcontainers, external services mocked (ADR-0012). Not a persistent environment.
- **Staging** — a **Proxmox LXC** (Debian + Docker) on the same box, separate from both local dev and the prod VM. Runs the prod Compose stack. Auto-deployed on merge to `main`; the Playwright workflow suite runs against it as the pre-prod gate. Its own WorkOS Staging keys, its own tunnel hostname, its own `.env` and Postgres volume.
- **Prod** — the dedicated VM (ADR-0004), WorkOS Production environment.

Promotion flow: merge to `main` → CI builds the image → deploy to staging → workflow suite runs against staging → features park on staging until a release is cut and the *same image tag* is promoted to prod (see Deploy § promotion).

**Why an LXC for staging when prod is a VM (ADR-0004):**

- Prod is a VM specifically to avoid debugging container nesting (Docker-in-LXC: `nesting`, `keyctl` / `fuse`, unprivileged UID mapping, overlayfs quirks) on the family-facing box. Staging is exactly where that gets shaken out — ADR-0004 already flagged an LXC as "a legitimate deliberate experiment."
- On a small box already hosting local dev and a prod VM, an LXC's near-zero idle overhead (shared kernel, no vCPU threads, no VM-exit cost, ~100–300 MB base) beats a full VM for staging. CPU is time-sliced and oversubscribes gracefully; RAM assigned to a VM does not.
- Contention only bites in one window — active dev work plus a staging deploy + Playwright run at the same moment. Mitigated by `cpuunits` weighting (prod > dev > staging), an optional `cores` cap on staging, and triggering staging runs manually / off-hours (which the "start manual, automate once boring" line below implies anyway).

**Discipline:** the Compose file, Postgres version, and deploy script are byte-identical between staging and prod; only the runtime host (LXC vs VM) and the env values differ. A "works on staging, breaks on prod" bug makes the LXC/VM gap suspect #1, and the response is to promote staging to a VM — not to add abstraction.

**Not built yet.** Staging is stood up when the deploy pipeline is (early V1 foundation work), not before; until then local + CI cover everything.

### CI

- **GitHub Actions** (free for this usage) on every push / PR: `pnpm install`, typecheck, lint, `pnpm verify` (all test tiers — ADR-0012), build. This is the gate — nothing deploys that does not pass.
- The full testing strategy — the unit / component / workflow tiers, the local-first gating, and tool choices — is **ADR-0012**. CI runs the same `pnpm verify` a developer runs before pushing; the workflow (Playwright) tier additionally gates the deploy step below.

### Deploy

- **Build once, deploy an artifact.** CI builds the API as a container image pushed to **GitHub Container Registry** (free for private images at this scale). **Open — the web frontend:** either (a) build the static SPA bundle in CI, ship it as a versioned tarball/artifact, and have Caddy serve it (simpler, matches ADR-0004's "Caddy routes `/api/*` vs. static frontend"), or (b) bake it into its own tiny nginx/Caddy image. Leaning (a). Reconcile with ADR-0004 before building the deploy pipeline.
- **Deploy is pull-based on the box**: a small script (or [Watchtower](https://containrrr.dev/watchtower/), or a `systemd` timer) pulls the new tagged image and runs `docker compose up -d`. Trigger manually or via a GitHub Actions step that SSHes in — start manual, automate once it is boring.
- **Workflow tests gate the deploy** (ADR-0012): the Playwright suite runs against the built artifacts after migrations and before cutover. A green PR is necessary but the deploy re-checks end-to-end against exactly what is shipping.
- **Promotion to prod is release-scoped, not per-feature.** Merged features accumulate on staging. When the maintainer judges the parked set ready, a release is tagged (`vX.Y.Z`) and that exact image is promoted to prod via a manual `workflow_dispatch`. This keeps prod deploys — and their brief downtime — batched and deliberate, and lets a solo maintainer review a coherent set rather than making a promote decision on every merge. The per-feature path stays available as the mechanism for a hotfix that needs to jump the release queue.
- **Migrations** (Drizzle, ADR-0002) run as an explicit step before the API container starts the new version — a one-shot `migrate` service in the Compose file, not on app boot, so a bad migration fails loudly and does not race multiple app instances.
- Brief downtime on deploy is acceptable (single instance, family-scale, no SLA). No blue/green.

### Secrets

- **Not in git. Not in the Compose file.** A single `.env` file on the box, `chmod 600`, owned by the deploy user, referenced by Compose via `env_file`. Its canonical copy lives in the owner's password manager (also required for backup restore — ADR-0009).
- CI secrets (registry token, SSH key, backup credentials) live in GitHub Actions encrypted secrets.
- If secret sprawl ever gets painful, the upgrade path is [SOPS](https://github.com/getsops/sops) with an `age` key (encrypted secrets *can* then live in git). Not now.

### Observability

- **Uptime**: an external check (UptimeRobot free tier, or a cron on a *different* machine hitting `/api/health`) that alerts the owner (email / push / Telegram) when the app is unreachable. This is the one piece that must exist from day one — the owner should not learn the app is down from a family member. (Implies a lightweight unauthenticated `GET /api/health` endpoint — a V1 requirement, add it to the DAMN-1 / deploy work.)
- **Logs**: `docker compose logs` / journald on the box is enough initially. Add a lightweight aggregator (Loki + Grafana, or Dozzle for a live view) only if debugging via raw logs becomes painful.
- **Errors**: [self-hosted GlitchTip](https://glitchtip.com/) (Sentry-compatible, runs in a container) if/when silent runtime errors become a problem. Deferred.
- **Backups**: the ADR-0009 job must alert on failure through the same channel as the uptime check.

## Alternatives considered

- **No CI, deploy by `git pull` + `docker compose up` on the box**: the implied status quo. Rejected — it means untested code reaches the machine family uses, and "works on my machine" is the only gate.
- **Build on the box** instead of building images in CI: simpler registry story, but couples deploy to build toolchain drift on the server and makes rollback ("run the previous image tag") harder. Rejected.
- **Full GitOps (Argo/Flux) / Kubernetes / Nomad**: wildly disproportionate for one small app on one box.
- **Managed error/APM (Sentry SaaS, Datadog)**: not the cost (Sentry has a usable free tier) — it's external data + not needed yet. Self-hosted equivalents (GlitchTip) deferred until silent runtime errors are a real problem.
- **Push-based deploy** (CI SSHes in and runs everything): fine, and probably the end state; starting manual just to keep the first deploys observable by hand.
- **Staging as a second Docker Compose project alongside local dev** (instead of its own LXC): zero new infra and the lowest overhead, but it shares the Docker daemon, kernel, and network host with dev work, does not exercise the "deploy onto a fresh isolated host" path that is half the point of staging, and risks `.env` / volume / network bleed between dev and staging. Rejected for the LXC's clean break.
- **Staging as a full VM**: an exact prod mirror with no Docker-in-LXC caveats, but costs ~1–2 GB RAM better spent elsewhere and teaches nothing the prod VM won't. Reconsider only if Docker-in-LXC proves more trouble than it is worth.
- **No staging (local → prod)**: rejected — the workflow-test gate (ADR-0012) needs a prod-like target, and prod-only failures (TLS, token `iss`, tunnel routing, migrations against a prod-shaped DB) would otherwise surface first on the family-facing box.
- **Per-feature promotion to prod** (every merge that passes staging goes straight to prod): rejected — it puts a promote / no-promote decision on every merge and scatters prod's brief downtime across many small deploys. Release-scoped promotion lets the maintainer review a coherent parked set; the per-feature path remains as the hotfix mechanism.

## Consequences

- GitHub is now load-bearing for CI, image hosting, and config backup — an accepted single-vendor dependency for the *build* path (distinct from the *runtime* path, which ADR-0004 already routes through Cloudflare). Both are recoverable: the repo is cloned locally, images can be rebuilt.
- The uptime check requires something *outside* the box — a free external monitor or a second machine. This is the minimum viable "is it up" and is non-negotiable.
- Deploy causes a few seconds of downtime. Acceptable now; if it ever is not, that is the trigger to add a second API container + reload, not before.
- The box now runs local dev plus a staging LXC and a prod VM — on limited cores and RAM. RAM is the binding constraint; staging as an LXC rather than a VM is what keeps that comfortable. A fourth long-lived guest is the trigger to revisit sizing.
- Staging diverges from prod in exactly one dimension (LXC vs VM). Accepted and tracked; the mitigation is promotion to a VM, which is cheap.
- Docker-in-LXC setup (nesting + feature flags on the container) is a one-time cost paid on staging — where it also yields firsthand data for any future LXC-vs-VM decision.
