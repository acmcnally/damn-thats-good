# Deployment

`compose.yaml` + `deploy.sh` run the app on **staging** and **prod**. They are
**byte-identical** between the two — only `deploy/.env` and the host differ
(staging: an unprivileged Proxmox LXC; prod: a VM — ADR-0010). Images are the
SHA-tagged artifacts CI publishes to GHCR (DAMN-27); nothing is built on the
target.

- `compose.yaml` — container topology (pull, don't build)
- `deploy.sh` — `pull → migrate → up`, with a tag argument for rollback
- `.env.example` — copy to `.env`, fill in, `chmod 600`; canonical copy in the password manager

Dev is the repo-root `docker-compose.yml` (a separate file, with `build:`).

Each command block below is tagged with where it runs:
**`[host]`** Proxmox host · **`[lxc-root]`** root shell in the LXC · **`[lxc-deploy]`**
the `deploy` user in the LXC · **`[tailscale]`** admin console (web) · **`[github]`** repo settings (web).

---

## deploy.sh

```
./deploy.sh                 # deploy :latest
./deploy.sh sha-<40hex>     # deploy / roll back to a specific commit's images
```

Pulls, brings Postgres up, runs the one-shot migrator **explicitly** (a bad
migration aborts here with the old `api`/`web` still serving — ADR-0010), then
recreates `api` + `web`, asserts `api` is on the requested tag, and prunes
dangling images.

**Rollback caveats:**

- Rolling the image back does **not** roll migrations back.
- Rollback **across the DAMN-2 baseline-migration regeneration** is unsupported
  (breaks Drizzle's `__drizzle_migrations` hash tracking).

---

## First-time staging setup

Ordered. Each numbered section gates the next.

### 1. Create the LXC (all `[host]`)

**1a. Host kernel modules** — Docker needs `br_netfilter`; Tailscale needs `tun`.
Neither is auto-loaded on a stock Proxmox host.

```sh
modprobe br_netfilter tun
printf 'br_netfilter\ntun\n' > /etc/modules-load.d/dtg.conf   # persist across reboot
ls -l /dev/net/tun                    # want: crw------- ... 10, 200
```

_(If `/dev/net/tun` is still missing after `modprobe tun`: `mkdir -p /dev/net && mknod /dev/net/tun c 10 200 && chmod 600 /dev/net/tun`.)_

**1b. Host time sync** — an unprivileged LXC inherits the host clock and can't set
its own. TLS cert issuance and `apt` both fail on a skewed clock.

```sh
timedatectl                           # want: "System clock synchronized: yes"
# if not: apt install -y chrony
```

**1c. Create the container.** `cpuunits` is a *relative* weight — staging should
sit below dev and prod. On cgroup v2 (Proxmox 8 default) the baseline is 100, so
use ~50; on cgroup v1 the baseline is 1024, so use ~512. Check with
`cat /sys/fs/cgroup/cgroup.controllers` (exists ⇒ v2).

```sh
pct create 200 local:vztmpl/debian-13-standard_13.6-1_amd64.tar.zst \
  --hostname dtg-staging --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --rootfs local-lvm:20 \
  --cores 2 --cpuunits 50 --memory 2048 --swap 512 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --ostype debian --onboot 1
```

**1d. Pass the TUN device into the container.** Append to `/etc/pve/lxc/200.conf`:

```
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

**1e. Start and verify.**

```sh
pct start 200
pct enter 200
#   inside: ls -l /dev/net/tun      -> crw-rw-rw- 1 nobody nogroup 10, 200
#   inside: date                    -> correct time
#   inside: hostname                -> dtg-staging
```

Optional: add a DHCP reservation for the CT's MAC on your router so its LAN IP is
stable (matters once you expose it to the LAN — section 6).

### 2. Base packages + Docker (`[lxc-root]`)

Work from `pct enter 200` — **not** `pct exec` one command at a time (env/PATH
gets muddled across the host↔container boundary). Confirm `hostname` says
`dtg-staging` before you start.

```sh
apt-get update && apt-get install -y ca-certificates curl git
install -m0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Verify:

```sh
systemctl is-active docker                 # active
docker run --rm hello-world                # pull + run + network OK
docker compose up --help | grep -- --wait  # prints a line (the flag deploy.sh needs)
```

`docker compose version` will report something like `v5.x` — that's just where
Compose is now; it's the plugin (`docker compose`, a space), which is what
matters, not the version string.

If `docker` won't start: `journalctl -u docker -u containerd -b` — usual suspects
in an unprivileged LXC are `keyctl` (you set `keyctl=1` at create, so unlikely),
cgroup, or overlayfs. Record what it took in **LXC gotchas** at the bottom.

### 3. Deploy user (`[lxc-root]`)

```sh
useradd -m -G docker deploy
```

### 4. Repo + env (`[lxc-deploy]`)

```sh
sudo -iu deploy        # or: su - deploy
```

`deploy/` is **not on `main` yet** — it lives on the DAMN-28 branch until that PR
merges. Clone the branch:

```sh
git clone -b acmcnally/damn-28-staging-environment-lxc-auto-deploy \
  https://github.com/acmcnally/damn-thats-good.git ~/dtg
cd ~/dtg/deploy
cp .env.example .env
chmod 600 .env
```

**Set the one value that needs setting** — `POSTGRES_PASSWORD`. Nano over four
nested PTYs (`ssh → pct enter → sudo -iu → nano`) misbehaves; do it
non-interactively:

```sh
pw=$(openssl rand -hex 24)     # hex only — base64 can emit / + = which break the postgres:// URL
grep -v '^POSTGRES_PASSWORD=' .env > .env.tmp && echo "POSTGRES_PASSWORD=$pw" >> .env.tmp && mv .env.tmp .env
chmod 600 .env
echo "SAVE TO PASSWORD MANAGER (DTG staging Postgres): $pw"
```

Everything else in `.env` has a correct staging default. The password's **only**
other home is your password manager — `deploy/.env` is gitignored and not backed
up (DAMN-31), and the Postgres data volume can outlive it.

**Never hand-edit tracked files under `~/dtg`** — the automated deploy does
`git pull --ff-only` and a dirty tree aborts it.

### 5. First manual deploy (`[lxc-deploy]`)

```sh
cd ~/dtg/deploy && ./deploy.sh
```

Expect: postgres healthy → `migrate: up to date` (or the baseline applied) → api
healthy → web healthy → `==> api running …`. Then:

```sh
curl -s localhost:8080/api/health      # {"status":"ok","db":"up"}
curl -s localhost:8080/api/meta        # {"name":"Damn That's Good", ...}
```

### 6. Reach it from the LAN (optional, `[lxc-deploy]`)

```sh
sed -i 's/^WEB_BIND=.*/WEB_BIND=0.0.0.0/' .env
./deploy.sh                             # recreates the web container
ss -tlnp | grep 8080                    # want 0.0.0.0:8080, NOT 127.0.0.1:8080
```

Then from any LAN device: `http://<lxc-lan-ip>:8080/` (plain HTTP, port 8080 —
HTTPS is section 8). Find the IP with `ip -4 addr show eth0`.

No firewall changes needed: a stock Debian LXC has no active firewall, Docker
manages its own iptables rules for the published port, and the Proxmox firewall
is off by default (your `--net0` line didn't enable it). Only touch this if
*you* enabled `ufw` / the Proxmox firewall.

**Trade-off:** with `0.0.0.0`, any LAN device can hit the (currently
unauthenticated) skeleton endpoints. This is the exposure that put the LXC on
unprivileged.

### 7. Tailscale ACL — do this BEFORE section 8 (`[tailscale]`)

Admin console → **Access Controls**. Merge into the existing policy — leave the
default allow-all network rule (`acls` or `grants`, whichever your tailnet's
default policy uses) exactly as-is for now:

```json
	"tagOwners": {
		"tag:staging": ["autogroup:admin"],
		"tag:ci":      ["autogroup:admin"]
	},
	"ssh": [
		{
			"action": "accept",
			"src":    ["tag:ci"],
			"dst":    ["tag:staging"],
			"users":  ["deploy"]
		}
		// keep the default check-mode ssh rule below this, if present
	],
```

`action` **must** be `accept`, not `check` — a tagged source can't do
interactive reauth. Save.

Then create a **Tailscale OAuth client** (Settings → **Trust credentials** →
Generate OAuth client):

- **Scope:** write access to auth keys (the only scope `tailscale/github-action` needs)
- **Tags:** `tag:ci`

Save the **client ID** and **secret** for section 9. (An OAuth client doesn't
expire. A tagged reusable+ephemeral auth key is the fallback if OAuth isn't
available on your plan — it expires every ≤90 days and needs periodic
regeneration; the job change is `oauth-client-id`/`oauth-secret` → `authkey`.)

### 8. Tailscale on the box (`[lxc-root]`)

```sh
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh --advertise-tags=tag:staging      # prints an auth URL — approve in a browser
```

If you get `requested tags ... invalid or not permitted`, section 7's
`tagOwners` isn't saved yet.

Then expose the app over HTTPS (needs "HTTPS Certificates" enabled in the tailnet
admin console first):

```sh
tailscale serve --bg 8080          # https://dtg-staging.<tailnet>.ts.net -> 127.0.0.1:8080
```

Verify from another tailnet device: `https://dtg-staging.<tailnet>.ts.net/api/health`.

From here on you can `ssh deploy@dtg-staging` straight from your workstation
(one clean hop — no more `pct enter` nesting) for manual `deploy.sh` runs.

### 9. GitHub Actions environment (`[github]`)

Repo → Settings → **Environments → New environment** → `staging`.

- **Protection rule (required):** Deployment branches and tags → **Selected
  branches** → `main`. This is load-bearing, not optional: a `workflow_dispatch`
  of the deploy job from a feature branch is skipped by the job's `if:` guard,
  but this rule is the platform-level backstop for the tailnet join + SSH.
- On that environment:

  | Name | Kind | Value |
  |---|---|---|
  | `STAGING_HOST` | **variable** | `dtg-staging` (the short MagicDNS name) |
  | `TS_OAUTH_CLIENT_ID` | **secret** | from section 7 |
  | `TS_OAUTH_SECRET` | **secret** | from section 7 |

Environment secrets reach only the job that declares `environment: staging`
(the deploy job) — `verify` and `build-images` never see them.

Enable GitHub's "a workflow run failed" email notification for yourself — the
only deploy-failure alert until real observability (ADR-0010).

### 10. Hand back for the CI job

When `tailscale ssh deploy@dtg-staging 'echo ok'` works from a `tag:ci`-tagged
ephemeral node, the `deploy-staging` job (DAMN-28 step 6d) can be written and
wired, then tested end to end (6e), then the PR opens.

---

## After DAMN-28 merges

On the box, once:

```sh
cd ~/dtg && git checkout main && git pull --ff-only
```

The CI deploy job then `git checkout --detach <commit>`s each deploy, so the box
sits in **detached HEAD** at the last deployed commit — expected for a deploy
target. For a **manual** `deploy.sh` run, `git checkout main && git pull` first
to pick up the newest compose/script, then `./deploy/deploy.sh <tag>`.

## On every LXC rebuild during the shakeout

Delete the **old** node in the Tailscale admin console before the rebuilt one
joins — otherwise MagicDNS appends `-1` and `STAGING_HOST` breaks.

---

## LXC gotchas

What Docker/Tailscale-in-unprivileged-LXC actually required on this host. Feeds
any future LXC-vs-VM decision (ADR-0004 / ADR-0010).

- **`tun` kernel module** was not loaded on the Proxmox host by default —
  `modprobe tun` + persist, and `/dev/net/tun` passed into the CT via two
  `lxc.*` lines in `/etc/pve/lxc/200.conf`. Without it Tailscale silently falls
  back to userspace-networking mode, which breaks `tailscale serve` and the SSH
  server.
- **`br_netfilter`** — same story (not auto-loaded); needed for Docker's bridge
  networking / iptables rules.
- **`keyctl=1`** set alongside `nesting=1` at `pct create` — containerd in an
  unprivileged LXC needs the keyring.
- _(add anything else you hit: AppArmor, overlayfs, cgroup…)_
