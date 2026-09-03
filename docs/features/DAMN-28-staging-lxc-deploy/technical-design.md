# DAMN-28 — Staging environment (LXC) + auto-deploy: technical design

Status: revised after adversarial design review + security discussion ·
light-touch workflow (no UI surface). Pre-PR diff review still runs.

## Requirements (frozen — see the Linear issue)

Stand up staging as a Proxmox LXC; `main` deploys to it automatically. Locked:
D1 (CI joins the tailnet as an ephemeral node and connects in), D2 (one
`deploy.sh`, run by hand first then wrapped by CI), D3 (`tailscale serve` for
HTTPS), D4 (Tailscale SSH, fallback SSH key). No public ingress — DAMN-30.

### Decisions from the review + security discussion

| | Decision | Rationale |
|---|---|---|
| **LXC flavor** | **Unprivileged.** Fallback if Docker-in-unprivileged-LXC won't cooperate: a **VM**, not a privileged LXC. | LAN exposure is wanted soon (mobile testing), the box also runs prod, and a privileged-LXC breakout = host root. Unprivileged contains a breakout to a nobody user. Our `pgdata` is a Docker *named volume*, not a host bind-mount, so the worst unprivileged UID-mapping friction doesn't apply. |
| **LAN reachability** | In scope (the issue says "Tailscale / LAN"). `.env` defaults `WEB_BIND=127.0.0.1`; flip to `0.0.0.0` for LAN. | Documented both ways. The threat analysis that drove "unprivileged" *assumes* LAN exposure. |
| **ACL scope** | `tag:ci → tag:staging:22` only. Health check runs **on the box** over the SSH channel. | The runner is in Tailscale userspace-networking mode — plain `curl`/`ssh` to `*.ts.net` don't route, and `:443` isn't granted. DAMN-29 makes its own access decision (likely Playwright-on-box). |
| **X-Forwarded-Proto** | Defer the `trusted_proxies` / `trust proxy` fix to DAMN-1. | Needs a real auth flow to validate against; the skeleton has none. Tracked as a DAMN-1 follow-up. The health check does **not** verify D3's TLS assumptions. |
| **Deploy-path hardening** | Never `pull_request_target`. `tag:ci` ACL minimal. OAuth client scoped to `tag:ci` only. `permissions: {}` on the deploy job. | See "Security model" below. |

## No UI surface

Compose file, a deploy script, a CI job, docs. Nothing renders.

## Security model (why the deploy loop is safe)

The only path for code to reach staging is **a PR the owner squash-merges**:

- `deploy-staging` runs only on `push` to `main` (`github.ref == 'refs/heads/main'`); on any PR event `github.ref` is `refs/pull/N/merge`, so it never runs on PRs — fork or not.
- Fork `pull_request` runs get **no secrets** and a read-only token — they can't read `TS_OAUTH_SECRET`, push images, or trigger the deploy.
- `push` to `main` only happens via merge (branch protection: PR-only, `verify` required, `enforce_admins`).
- **`pull_request_target` is never used** — it's the one trigger that would run trusted (secret-bearing) workflow code against untrusted PR code.

Residual risk, in order: (1) the owner merging an unreviewed diff; (2) **dependency
supply chain** — a hijacked npm package reaches staging on the next merge
regardless of diff review, and `pnpm install` runs lifecycle scripts for
`esbuild`/`@swc/core` — this is the main reason staging is unprivileged; (3)
GitHub/Tailscale infra compromise (ephemeral `tag:ci` node, ~30 s/run, SSH-to-
staging-only).

**The Tailscale OAuth secret is worth "SSH to staging as `deploy`"** — the
`deploy` user is in the `docker` group, so that's LXC root. Guard it like an SSH
key. When D4's SSH-key fallback is used, an `authorized_keys` `command=` forced
command (restricting CI to exactly `deploy.sh`) is worth setting — a mild point
in the fallback's favour that Tailscale SSH can't match cleanly.

## The CI ↔ box contract

The interface both sides build to. The **box** (owner-provisioned):

| On the box | Detail |
|---|---|
| An **unprivileged** Debian LXC | Proxmox host: `features: nesting=1` (and `keyctl=1` if Docker complains); `br_netfilter` loaded on the *host* |
| Base packages | `ca-certificates`, `curl`, `git` — a slim Debian image ships none guaranteed |
| Docker **from Docker's official apt repo** | `docker-ce` + `docker-compose-plugin`. **Not** Debian's packages — those give old `docker-compose` v1 with **no `--wait` flag**, which `deploy.sh` needs. |
| A `deploy` user | non-root, in the `docker` group |
| GHCR packages already public | verify `docker pull ghcr.io/acmcnally/damn-thats-good-api:latest` works **unauthenticated** before starting — else `deploy.sh` 401s |
| `~/dtg/` — a clone of this repo | the deploy step `git fetch`es + `checkout --detach`s the exact commit; only `deploy/` is used; **never hand-edit tracked files here** |
| `~/dtg/deploy/.env` | real values, `chmod 600`, gitignored (`.env` pattern matches at any depth), canonical copy in the password manager |
| Rootfs sized for image accumulation | fat images (DAMN-26 deferred trimming) × every deploy; `deploy.sh` prunes, but budget ~10–20 GB |
| NTP / time sync | LetsEncrypt (via `tailscale serve`) needs correct time |
| `tailscale` ≥ 1.50, `tailscale up --ssh`, tagged `tag:staging` | Tailscale terminates SSH (D4) |
| `tailscale serve --bg` → `http://127.0.0.1:${WEB_PORT}` | HTTPS via the tailnet cert; enable "HTTPS Certificates" in the admin console first; persists across reboots on ≥ 1.50 |
| Tailscale ACL | an `ssh` rule with **`action: "accept"`** (not `"check"` — a tagged source can't do interactive reauth): `tag:ci` → `tag:staging` as `deploy`; plus `tag:ci → tag:staging:22` in the ACL grants |
| Delete the old tailnet node on every LXC rebuild | else MagicDNS renames to `host-1` and `STAGING_HOST` breaks |
| `cpuunits` weighting (+ optional `cores` cap) | staging yields to dev and prod |

**GitHub Actions secrets / variables** (owner-provisioned):

| Name | Kind | Use |
|---|---|---|
| `STAGING_HOST` | **variable** (not secret — it's in CT logs anyway; a var stays out of git but is visible for debugging) | the LXC's tailnet MagicDNS name |
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` | secret | Tailscale OAuth client, scoped to mint **only** `tag:ci` |

No SSH key secret while D4 (Tailscale SSH) holds. Fallback adds `STAGING_SSH_KEY`
+ `authorized_keys` (with a `command=` forced command) + a documented
`ProxyCommand` (plain `ssh` doesn't route in the runner's userspace-networking
mode).

The **repo** (this PR): `deploy/compose.yaml`, `deploy/deploy.sh`,
`deploy/.env.example`, `deploy/README.md`, the `deploy-staging` CI job, ADR notes.

## `deploy/compose.yaml`

Prod-shaped. Same services as `docker-compose.yml` (dev), but:

- `image: ghcr.io/acmcnally/damn-thats-good-{api,web}:${TAG:-latest}` — **no `build:`**
- **`name: dtg`** at the top + `volumes.pgdata.name: dtg_staging_pgdata` — the literal Docker volume name, pinned so DAMN-31's restore drills aren't reverse-engineering `<projectdir>_pgdata`
- **`api` depends only on `postgres`** (healthy) — migrate is *not* in the compose dependency chain; `deploy.sh` orchestrates it explicitly (S5). Dev keeps its own migrate→api gate for one-command `docker compose up`; this divergence is deliberate.
- `migrate` service present but not depended-on: `command: ["node", "packages/db/src/migrate.ts"]`, `working_dir: /app` — **not** `pnpm --filter … migrate`, because corepack's pnpm binary isn't in the final image and `pnpm` would trigger a live download from npm on every deploy (S4). `migrate.ts` has no local imports; `drizzle-orm`/`postgres` resolve from `/app/node_modules`.
- `web` publishes `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}:8080` + gets a healthcheck (`wget -qO- localhost:8080/ >/dev/null`) — dev's `web` has none, so `--wait` otherwise only confirms "running", not "serving"
- `NODE_ENV=production` on `api` (and `migrate`) — identical staging/prod, keeps "byte-identical" true
- everything `restart: unless-stopped` except `migrate` (`restart: "no"`)

**Byte-identical for staging and prod** — the things that differ (ingress:
`tailscale serve` vs Cloudflare/Funnel; `cpuunits`; `.env` values) all live
*outside* the compose file. The compose file is the container topology, not the
whole deployment definition.

## `deploy/deploy.sh`

`pull → up postgres (--wait --wait-timeout) → run --rm migrate → up -d --wait api web`,
then two guards and a prune. See the file for the exact script.

- **Migrations run as an explicit step before `api` is recreated** (ADR-0010). `set -e` + `run --rm migrate` → a bad migration aborts with old `api`/`web` still serving.
- **`--wait-timeout`** on both `up` calls — a crash-looping service would otherwise hang the deploy (and the CI runner) indefinitely.
- **Image-digest assertion** — the running `api` container's image id must equal what `ghcr.io/…-api:${TAG}` resolves to after the pull. Compares *digests*, not the tag string (a tag-string check is a no-op when `TAG=latest`). Catches a partial pull / stale checkout / no-op recreate that would freeze staging while the health check still passes.
- **On-box end-to-end health check** — `curl` through `web`(Caddy)→`api`, port read from `docker compose port web 8080` (authoritative; immune to `.env` quoting / CRLF), not by parsing `.env`.
- **Rollback** = `./deploy.sh sha-<older>`. Runbook caveats: rolling the image back does **not** roll migrations back (fine for the skeleton; a real concern post-DAMN-2); and **rollback across the DAMN-2 baseline-migration regeneration is unsupported** (breaks `__drizzle_migrations` hashes).
- Idempotent: same `TAG` → `up -d` recreates nothing, `migrate` reports "up to date".

## The `deploy-staging` CI job

Appended to `.github/workflows/ci.yml` (see the file for the exact YAML):

- `needs: build-images`; `environment: staging`; `permissions: {}`; job-level `concurrency: deploy-staging` with `cancel-in-progress: false`.
- **`if: github.ref == 'refs/heads/main' && (push || workflow_dispatch)`** — `main` only, for *both* triggers. A `workflow_dispatch` from a feature branch is skipped here; the `staging` environment's "Selected branches → main" rule is the platform-level backstop (**required**, not decorative — it's what stops an off-branch dispatch from doing the tailnet join + SSH).
- `on: workflow_dispatch: {}` added at the workflow level — a manual "redeploy `:latest` to staging" lever.
- **Auth:** `tailscale/github-action` (SHA-pinned) with `oauth-client-id` / `oauth-secret` (Tailscale OAuth client scoped to `tag:ci`). Fallback if OAuth isn't available on the plan: a tagged reusable+ephemeral `authkey` (expires ≤90 days).
- **Deploy step** (`STAGING_HOST` / `DEPLOY_SHA` / `TAG` via `env:`, not templated into the shell):
  ```
  tailscale ssh "deploy@$STAGING_HOST" \
    "cd ~/dtg && git fetch --quiet origin main && git checkout --quiet --detach $DEPLOY_SHA && ./deploy/deploy.sh $TAG"
  ```
  `TAG` = `sha-<github.sha>` on push, `latest` on dispatch.
- **`git checkout --detach $DEPLOY_SHA`, not `git pull`** — main runs *queue* (workflow-level `concurrency`, `cancel-in-progress: false`), so run A's deploy step would `git pull` the tree of a *later* commit B while deploying `sha-A` images. Checking out the exact commit makes each deploy atomic: that commit's `compose.yaml`/`deploy.sh` against that commit's images. The box is left in detached HEAD (fine for a deploy target).
- **Health check is inside `deploy.sh`** (see above) — the CI job is just "run `deploy.sh`". On-box over the SSH channel (B1); exercises `web`(Caddy)→`api`, **not** `tailscale serve`/TLS (D3, not auth-critical until DAMN-1).
- **`tailscale ssh`, not plain `ssh`** — the runner is in userspace-networking mode; plain `ssh` needs a `ProxyCommand`, `tailscale ssh` dials via netstack (S2).
- **Not a required status check** — a deploy failure shouldn't retro-block an already-merged commit. Surfaces as a red job on `main`; the owner needs GitHub "Actions failure" notifications on. Real alerting is ADR-0010 / prod-scoped.
- **Queued, not cancelled:** because main runs queue (not cancel), a rapid A→B does not skip B's image build — but the deployed SHA still advances monotonically once both runs finish. (DAMN-30's promote step should still not assume *every* historical SHA has an image, since a PR that never triggered a `main` build won't.)

## Division of labor & sequencing

| Step | Owner | Gate |
|---|---|---|
| 6a — `deploy/compose.yaml` + `deploy.sh` + `.env.example` + `README.md`, validated locally against real GHCR images | Claude | `docker compose config` clean; local `deploy.sh` → `/api/health` + `/api/meta` OK; `shellcheck` clean |
| 6b — provision the **unprivileged** LXC (Docker from Docker's apt repo); base packages; `deploy` user; verify unauthenticated `docker pull`; `git clone` to `~/dtg`; write `~/dtg/deploy/.env`; **run `./deploy/deploy.sh` by hand**; write up Docker-in-LXC notes in `deploy/README.md` | owner | skeleton reachable on the tailnet (and, once `WEB_BIND=0.0.0.0`, the LAN) |
| 6c — `tailscale up --ssh` + `tailscale serve`; OAuth client (mints `tag:ci` only); ACL (`ssh` rule `action: accept`, `tag:ci`→`tag:staging` as `deploy`, `tag:ci→tag:staging:22`); `STAGING_HOST` var + `TS_OAUTH_*` secrets | owner | from a `tag:ci`-tagged ephemeral node: `tailscale ssh deploy@<host>` runs a command; `https://<host>.ts.net/` serves |
| 6d — `deploy-staging` job in `ci.yml` | Claude | — |
| 6e — merge to `main`, watch it deploy end to end | both | staging reflects the new commit automatically; tag assertion + on-box health check green |

If unprivileged Docker-in-LXC genuinely won't cooperate after a real attempt →
switch to a **VM** (drops the LXC-specific notes deliverable; staging becomes a
closer prod mirror — a conscious trade, not a mid-implementation surprise).

## Test plan

| What | How |
|---|---|
| `deploy/compose.yaml` valid | `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config` |
| images run as pulled artifacts | local `deploy.sh` against `.env.example` → `curl /api/health`, `/api/meta` |
| `deploy.sh` shell-correct | `bash -n`, `shellcheck` |
| migrate-via-`node` works in the image | the local `deploy.sh` run exercises it — assert "migrate: up to date" in logs |
| migrate-aborts-deploy | `.env` → unreachable DB → `deploy.sh` non-zero, no `api` recreate |
| tag assertion fires | request `TAG=sha-doesnotexist` → pull fails (or) running≠expected → exit 1 |
| rollback | `deploy.sh sha-<prev>` locally → older image runs |
| manual staging deploy | 6b |
| auto deploy + on-box health gate | 6e — trivial `main` commit → `deploy-staging` green → staging updated; break `web` → job red |

No unit/component tests — infra only. `pnpm verify` and the required `verify`
check are untouched.

## Open decisions — resolved

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | deploy in `ci.yml` vs `workflow_run` file | job in `ci.yml`, `needs: build-images` | ordering, one visible run, `github.sha` in hand |
| 2 | box gets `deploy/` via | `git clone` once; the deploy step `git fetch` + `checkout --detach <sha>` | one dir; each deploy is atomic (that commit's compose + that commit's images) |
| 3 | LXC flavor | **unprivileged**, VM fallback, privileged off the table | breakout containment; LAN exposure + shared box |
| 4 | `.env` location | `~/dtg/deploy/.env`, gitignored | one directory |
| 5 | `web` binding | `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}:8080` | loopback default; `.env` opens to LAN; prod-reuse clean |
| 6 | health check | **on the box** over SSH, not runner-side curl | ACL + userspace-networking make runner-side impossible |
| 7 | one compose file staging+prod | yes | ADR-0010; DAMN-30 reuses verbatim |
| 8 | `deploy-staging` required check? | no | shouldn't block an already-merged commit |
| D4 | SSH mechanism | Tailscale SSH (`action: accept` ACL); fallback = key + `command=` + `ProxyCommand` | nothing to rotate on rebuild; auth from the tailnet |
| — | `migrate` invocation | `node packages/db/src/migrate.ts` | no runtime pnpm download |
| — | migrate orchestration | explicit in `deploy.sh`; `api`→`postgres` only in compose | one mechanism |

## Risks

- **Unprivileged Docker-in-LXC** — the real risk (issue's own words). Mitigation: 6b is a hand-run shakeout; named-volume `pgdata` sidesteps the worst UID friction; VM fallback if it truly won't go.
- **`tailscale/github-action` + OAuth + ACL + `tailscale ssh` from an ephemeral node** — first-time, less-trodden. 6c gates on it working before 6d is written. Fallback: SSH key + `ProxyCommand`.
- **Deploy races the image publish** — `needs: build-images`, deploys the exact `sha-${{ github.sha }}`, not `latest`.
- **Silent stale staging** — `git checkout --detach` fails loudly on a dirty tree; the image-digest assertion catches "old container still healthy".
- **`POSTGRES_PASSWORD` must be URL-safe** — it's interpolated unencoded into the `postgres://` `DATABASE_URL`; a `/` `+` or `=` breaks parsing and the `migrate` step throws (uncaught — `migrate.ts` builds the client before its try block). Runbook uses `openssl rand -hex 24`.
- **Migration/rollback asymmetry** and **baseline-regeneration rollback** — documented in the runbook, not solved here (ADR-0007 / DAMN-2).
- **`X-Forwarded-Proto` through `tailscale serve`→Caddy→api** — latent; no auth to break yet; tracked as a DAMN-1 follow-up (`trusted_proxies` + `trust proxy`).
- **ADR-0004 not pre-decided** — Tailscale on the private CI→box path is admin-access use ADR-0004 already assumes; the public Cloudflare-vs-Funnel choice (DAMN-30) is untouched.
