# Deployment

`compose.yaml` + `deploy.sh` run the app on staging and prod. They are
**byte-identical** between the two environments — only `deploy/.env` and the host
differ (staging: an unprivileged Proxmox LXC; prod: a VM — ADR-0010). Images are
the SHA-tagged artifacts CI publishes to GHCR (DAMN-27); nothing is built on the
target.

- `compose.yaml` — container topology (pull, don't build)
- `deploy.sh` — `pull → migrate → up`, with a tag argument for rollback
- `.env.example` — copy to `.env`, fill in, `chmod 600`; canonical copy in the password manager

Dev is the repo-root `docker-compose.yml`, a separate file with `build:`.

---

## deploy.sh

```
./deploy.sh                 # deploy :latest
./deploy.sh sha-<40hex>     # deploy / roll back to a specific commit's images
```

It pulls, brings Postgres up, runs the one-shot migrator **explicitly** (a bad
migration aborts here with the old `api`/`web` still serving — ADR-0010), then
recreates `api` + `web`, asserts `api` is actually on the requested tag, and
prunes dangling images.

**Rollback caveats:**

- Rolling the image back does **not** roll migrations back. Fine for the walking
  skeleton (one trivial migration); a real concern once DAMN-2 lands (ADR-0007).
- Rollback **across the DAMN-2 baseline-migration regeneration** is unsupported —
  it breaks Drizzle's `__drizzle_migrations` hash tracking.

---

## First-time staging setup (owner — DAMN-28 step 6b/6c)

Ordered. Each numbered block gates the next.

### 1. The LXC (Proxmox host)

- Create an **unprivileged** Debian LXC. (If Docker genuinely won't run in it
  after a real attempt, switch to a VM — do **not** make it privileged: a
  privileged-LXC breakout is host root, and this box also runs prod.)
- Container options: `features: nesting=1` (add `keyctl=1` if Docker complains).
- On the **host**: `modprobe br_netfilter` (and persist it) if Docker networking
  misbehaves.
- Size the rootfs for image accumulation — budget ~15–20 GB for images + the
  Postgres volume. `deploy.sh` prunes dangling images each run.
- Set `cpuunits` low (and optionally cap `cores`) so staging yields to dev and
  prod under contention.
- Enable NTP / time sync in the container — the TLS cert step needs correct time.

**Write down what nesting/keyctl/AppArmor/overlayfs actually required** — that
writeup is a DAMN-28 deliverable and feeds any future LXC-vs-VM decision. Append
it to the bottom of this file.

### 2. Base packages + Docker (in the LXC)

```sh
apt-get update && apt-get install -y ca-certificates curl git
# Docker from Docker's official apt repo — NOT Debian's packages, which ship an
# old `docker-compose` v1 that lacks the `--wait` flag deploy.sh needs.
install -m0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Verify: `docker compose version` shows v2, and `docker compose up --help | grep -- --wait` prints something.

### 3. Deploy user + repo + env

```sh
useradd -m -G docker deploy
sudo -iu deploy
git clone https://github.com/acmcnally/damn-thats-good.git ~/dtg
cp ~/dtg/deploy/.env.example ~/dtg/deploy/.env
chmod 600 ~/dtg/deploy/.env
$EDITOR ~/dtg/deploy/.env      # real POSTGRES_PASSWORD; PG_VOLUME=dtg_staging_pgdata
```

**Never hand-edit tracked files under `~/dtg`** — the deploy does `git pull
--ff-only` and a dirty tree will abort it (leaving staging silently on the old
version).

### 4. Preflight: images are pullable unauthenticated

```sh
docker pull ghcr.io/acmcnally/damn-thats-good-api:latest
docker pull ghcr.io/acmcnally/damn-thats-good-web:latest
```

Both must succeed with no `docker login`. If they 401/403, the GHCR packages are
still private — make them public in the GitHub package settings first.

### 5. First manual deploy

```sh
cd ~/dtg/deploy && ./deploy.sh
```

Expect: Postgres healthy → `migrate: up to date` (or the baseline applied) → api
healthy → web healthy → `==> api running …`. Then from the LXC:
`curl -s localhost:8080/api/health` → `{"status":"ok","db":"up"}`.

For LAN / mobile testing, set `WEB_BIND=0.0.0.0` in `.env` and re-run `./deploy.sh`.

### 6. Tailscale — SSH + HTTPS

```sh
# In the LXC:
tailscale up --ssh --advertise-tags=tag:staging      # needs tailscale >= 1.50
# Enable "HTTPS Certificates" in the tailnet admin console first, then:
tailscale serve --bg 8080                            # https://<node>.<tailnet>.ts.net -> 127.0.0.1:8080
```

Confirm from another tailnet device: `https://<node>.<tailnet>.ts.net/api/health`.

In the **tailnet ACL** (admin console → Access Controls):

- `tagOwners`: add `tag:ci` and `tag:staging`.
- An `ssh` rule with **`"action": "accept"`** (not `"check"` — a tagged source
  can't do interactive reauth): `src: ["tag:ci"]`, `dst: ["tag:staging"]`,
  `users: ["deploy"]`.
- A grant so `tag:ci` can reach `tag:staging` on `22` (and nothing else).

Create a **Tailscale OAuth client** (admin console → Settings → OAuth clients)
scoped so it can only mint `tag:ci`. Save the id + secret.

### 7. GitHub Actions secrets / variables

Repo → Settings → Secrets and variables → Actions:

| Name | Kind | Value |
|---|---|---|
| `STAGING_HOST` | **variable** | the LXC's `<node>.<tailnet>.ts.net` name |
| `TS_OAUTH_CLIENT_ID` | secret | from step 6 |
| `TS_OAUTH_SECRET` | secret | from step 6 |

Turn on GitHub's "Actions: workflow run failed" email notification for yourself —
that's the only deploy-failure alert until real observability (ADR-0010).

### 8. Hand back to Claude for the CI job (6d)

Once `tailscale ssh deploy@<host> 'echo ok'` works from a `tag:ci`-tagged
ephemeral node, the `deploy-staging` job can be written and wired.

### On every LXC rebuild during the shakeout

Delete the **old** node in the Tailscale admin console before the rebuilt one
joins — otherwise MagicDNS appends `-1` to the name and `STAGING_HOST` breaks.

---

## Docker-in-LXC notes

_(Owner: fill this in as you work through step 1. What feature flags, host-side
changes, and workarounds were actually needed.)_
