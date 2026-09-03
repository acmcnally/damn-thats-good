# DAMN-28 — Staging environment (LXC) + auto-deploy: technical design

Status: draft for review · light-touch workflow (no UI surface). Adversarial
design review + pre-PR diff review still run.

## Requirements (frozen — see the Linear issue)

Stand up staging as a Proxmox LXC; `main` deploys to it automatically. Locked
decisions D1 (CI joins the tailnet as an ephemeral node and SSHes in), D2 (one
`deploy.sh`, run manually first then wrapped by CI), D3 (`tailscale serve` for
HTTPS). No public ingress — that's DAMN-30.

## No UI surface

Compose file, a deploy script, a CI job, docs. Nothing renders.

## The CI ↔ box contract

This is the interface both sides build to. The **box** (owner-provisioned) must
provide:

| On the box | Detail |
|---|---|
| A deploy user, e.g. `deploy` | non-root, in the `docker` group |
| `~/dtg/` — a clone of this repo | `git pull`ed by the deploy step; only `deploy/` is used |
| `~/dtg/deploy/.env` | real values, `chmod 600`, **gitignored**, canonical copy in the password manager |
| Docker + compose v2 | the Docker-in-LXC shakeout |
| `tailscale` up, with `tag:staging` | MagicDNS name is what CI SSHes to |
| `tailscale serve` → `http://127.0.0.1:${WEB_PORT}` | set once; persists across reboots |

**GitHub Actions secrets** (owner-provisioned):

| Secret | Use |
|---|---|
| `STAGING_SSH_KEY` | private key; matching pubkey in the deploy user's `authorized_keys` |
| `STAGING_HOST` | the tailnet MagicDNS name of the LXC (secret to keep the hostname out of the public repo) |
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` | Tailscale OAuth client for the ephemeral CI node (scoped to `tag:ci`) |

The **repo** (this PR) provides `deploy/compose.yaml`, `deploy/deploy.sh`,
`deploy/.env.example`, the `deploy-staging` CI job, and docs.

## `deploy/compose.yaml`

Prod-shaped. Same service graph as `docker-compose.yml` (dev) but:

- `image: ghcr.io/acmcnally/damn-thats-good-{api,web}:${TAG:-latest}` — **no `build:`**
- `migrate` uses the same `…-api:${TAG}` image
- `web` publishes `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}:8080` — localhost by default (`tailscale serve` is the entry point); an `.env` override exposes it on the LAN
- `postgres` named volume `dtg_pgdata` — explicitly named so DAMN-31's restore drills can target it
- everything `restart: unless-stopped` except `migrate` (`restart: "no"`)

Service ordering (unchanged from dev): `postgres` healthy → `migrate` exits 0 →
`api` healthy → `web`.

**This file is byte-identical for staging and prod** (ADR-0010). DAMN-30 points
prod's `.env` at it and runs the same `deploy.sh`; only the host (VM vs LXC) and
env values differ. No `compose.prod.yaml` fork.

## `deploy/deploy.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-latest}"          # ./deploy.sh                -> latest
export TAG                  # ./deploy.sh sha-<40hex>    -> pin / roll back

docker compose --env-file .env pull
docker compose --env-file .env up -d postgres --wait      # DB up + healthy
docker compose --env-file .env run --rm migrate           # explicit; aborts on failure
docker compose --env-file .env up -d --wait               # api + web to the new tag
docker compose --env-file .env ps
```

- **Migrations are an explicit step before `api` is recreated** (ADR-0010). `set -e` + `run --rm migrate` means a bad migration aborts the deploy with the old `api`/`web` still serving.
- **Rollback** = `./deploy.sh sha-<older>`. The runbook notes the caveat: **rolling the image back does not roll migrations back** — safe for the walking skeleton (one trivial migration), a real concern once DAMN-2 lands (ADR-0007 territory).
- Idempotent: re-running with the same `TAG` is a no-op (`up -d` only recreates changed containers; `migrate` reports "up to date").

## The `deploy-staging` CI job

Added to `.github/workflows/ci.yml` (not a separate workflow):

```yaml
  deploy-staging:
    needs: build-images
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-staging
      cancel-in-progress: false        # queue deploys; never kill one mid-compose
    steps:
      - uses: tailscale/github-action@<sha>   # v3, SHA-pinned
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
          tags: tag:ci
      - name: Deploy
        run: |
          install -m600 <(printf '%s' "${{ secrets.STAGING_SSH_KEY }}") "$RUNNER_TEMP/key"
          ssh -i "$RUNNER_TEMP/key" -o StrictHostKeyChecking=accept-new \
            "deploy@${{ secrets.STAGING_HOST }}" \
            "cd ~/dtg && git pull --ff-only && ./deploy/deploy.sh sha-${{ github.sha }}"
      - name: Verify staging health
        run: |
          curl -fsS --retry 5 --retry-delay 3 \
            "https://${{ secrets.STAGING_HOST }}/api/health" | grep -q '"status":"ok"'
```

- **Why a job in `ci.yml`, not a `workflow_run`-triggered `deploy.yml`:** `needs: build-images` gives correct ordering on the same commit with `github.sha` in hand and the whole thing visible in one run. `workflow_run` runs detached, off the default-branch workflow version, and doesn't surface on the triggering run. Trade-off: `ci.yml` grows a third job. Accepted.
- **Not a required status check** — a deploy failure shouldn't retroactively block the merge that's already in. Surfaces as a red job on `main` + (later, DAMN-10 of ADR-0010) an alert.
- The health check hits the `tailscale serve` HTTPS path, so it also verifies D3.

## Division of labor & sequencing

| Step | Owner | Gate |
|---|---|---|
| 6a — `deploy/compose.yaml` + `deploy.sh` + `.env.example`, validated locally against real GHCR images | Claude | `docker compose config` clean; local up→health OK |
| 6b — provision LXC; Docker-in-LXC shakeout; `git clone` repo; write `.env`; **run `deploy.sh` by hand** | owner | skeleton reachable at `http://<lxc>:8080` over the tailnet |
| 6c — `tailscale serve` for HTTPS; Tailscale OAuth client + ACL tags; SSH deploy user + `authorized_keys`; GH secrets | owner | `https://<host>.ts.net/api/health` OK from another tailnet device |
| 6d — `deploy-staging` job in `ci.yml` | Claude | — |
| 6e — merge to `main`, watch it deploy end to end | both | staging reflects the new commit automatically |

Docker-in-LXC notes (`nesting`, `keyctl`/`fuse`, UID mapping, overlayfs) get
written up in `deploy/README.md` as the owner works through 6b — that writeup is
a deliverable (feeds any future LXC-vs-VM call).

## Test plan

| What | How |
|---|---|
| `deploy/compose.yaml` valid | `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config` |
| Images run as pulled artifacts | local `deploy.sh` against `deploy/.env.example` (a throwaway local Postgres) → curl `/api/health`, `/api/meta` |
| `deploy.sh` shell-correct | `bash -n`, `shellcheck` |
| migrate-aborts-deploy | point `.env` at an unreachable DB → `deploy.sh` exits non-zero, no `api` recreate |
| rollback | `deploy.sh sha-<prev>` locally → older image runs |
| manual staging deploy | 6b — owner runs it on the LXC |
| auto deploy | 6e — trivial commit to `main` → `deploy-staging` green → staging updated |
| health-check gate | temporarily break the web container → `Verify staging health` step fails |

No unit/component tests — infra only. `pnpm verify` is untouched; the CI
`verify` job and its required-check status are unaffected.

## Open decisions — resolved with recommendations

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | deploy in `ci.yml` job vs separate `workflow_run` file | **job in `ci.yml`**, `needs: build-images` | correct ordering, one visible run, `github.sha` in hand |
| 2 | box gets `deploy/` via `git clone`+`pull` vs `scp`/`rsync` | **git clone + `git pull --ff-only`** | one dir, always consistent with `main`, normal pattern |
| 3 | SSH host-key policy | **`StrictHostKeyChecking=accept-new`** | tailnet transport; MITM isn't the threat model; pre-seeding `known_hosts` is fussy for solo |
| 4 | `.env` location on box | **`~/dtg/deploy/.env`**, gitignored | one directory to reason about |
| 5 | `web` port binding | **`${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}:8080`** | localhost default (tailscale serve is the entry); `.env` opens it to LAN; prod-reuse stays clean |
| 6 | post-deploy health check in CI | **yes** — curl the `tailscale serve` HTTPS path | real signal; also verifies D3 |
| 7 | one compose file for staging + prod | **yes** | ADR-0010 "byte-identical"; DAMN-30 reuses verbatim |
| 8 | `deploy-staging` a required check? | **no** | a deploy failure shouldn't block an already-merged commit |

## Risks

- **Docker-in-LXC is the real risk** (issue's own words). Mitigation: 6b is a hand-run shakeout before any automation; if it fights hard, ADR-0004's escape hatch is "promote staging to a VM" — not more abstraction.
- **`tailscale/github-action` + OAuth + ACL tags** — first-time setup friction. Mitigation: D3 falls back to plain HTTP over the tailnet; the ephemeral-node pattern is well documented and DAMN-29 needs it regardless.
- **Deploy races the image publish** — mitigated by `needs: build-images` (same run) and deploying the exact `sha-${{ github.sha }}` tag, not `latest`.
- **`git pull` on the box hits a conflict** — mitigated by `--ff-only` (fails loudly) and `.env` being the only untracked file.
- **Migration/rollback asymmetry** — real once DAMN-2 ships; documented now, not solved here.
- **ADR-0004 not pre-decided** — using Tailscale for the private CI→box path is an admin-access use ADR-0004 already assumes; it does not bias the open Cloudflare-vs-Funnel choice for *public* visitor traffic (that's DAMN-30). Stated so the design reviewer doesn't read it as scope creep.
