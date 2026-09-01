# ADR-0009: Backup and disaster recovery

**Status:** Proposed — reasoning complete, no open design questions. Needs an owner go-ahead and a choice of off-site target.
**Decision drivers:** scope & simplicity — but the data-safety requirement itself is non-negotiable

## Context

ADR-0004 runs the entire app — Postgres, API, photo blobs — on a single Proxmox box, with "backups" written to a second disk *in the same machine*. That protects against accidental deletion and nothing else: PSU/disk failure, theft, fire, flood, or ransomware would be a total, unrecoverable loss. This app is meant to hold recipes that family and friends contribute (V3+), so "lost everything" is not an acceptable failure mode.

Cost preference from ADR-0004: free/near-free is preferred, but not mandatory. Off-site backup is exactly the kind of place a few dollars a month is justified — so a paid object store (Backblaze B2, ~cents/GB/month) is a perfectly acceptable target, alongside the free options below.

## Decision

Three tiers:

1. **Local, frequent, on-box** (fast restore from mistakes): `pg_dump` (custom format) **hourly** — a dump of a DB this small takes seconds, and nightly-only would risk losing an evening of recipe entry to a mid-day crash — plus a nightly filesystem snapshot / `rsync` of the blob directory (ADR-0008) to the HDD volume. Keep ~48 hourly + ~14 daily + ~8 weekly for the DB. This extends what ADR-0004 implies.
2. **Off-site, at least daily** (survives loss of the box): encrypted push of the latest DB dump + blob tree to a remote target using `restic` or `rclone` (both free, both do client-side encryption and dedup). Acceptable free/near-free targets: a second machine at another physical location (a friend's/relative's house, a cheap VPS the owner already runs, an old machine at work), or a storage provider's free tier (several object stores offer 5–15 GB free, which comfortably fits this project). Retention: ~7 daily + ~4 weekly + ~3 monthly.
3. **Config as code** (survives loss of everything): the Docker Compose files, Caddy/`cloudflared` config, and infra scripts live in this git repo (`infra/`), pushed to the git remote. Secrets are *not* in git (see ADR-0010) — document where they come from so a rebuild is possible.

**Restore drill:** at least once, and after any major infra change, restore tier 2 into a scratch environment and confirm the app comes up with real data. An untested backup is not a backup.

## Alternatives considered

- **On-box backups only** (the ADR-0004 status quo): rejected — does not survive the most likely total-loss scenarios.
- **Proxmox VM/container backups (vzdump) to the HDD**: useful as an additional local tier (whole-VM rollback), but still on the same box — does not replace tier 2.
- **Paid backup service (Backblaze B2, S3, Tarsnap)**: B2/S3 at cents/GB/month are well within "small and justified" and are a fine primary target, not a last resort — pick this over a fiddly free tier if reliability matters. Tarsnap is trivial to run but pay-per-use.
- **Postgres streaming replication to a second node**: real HA, but requires a second always-on machine and is far more than this project needs. A nightly encrypted dump is sufficient for a recipe app.

## Consequences

- One more moving part: a scheduled `restic`/`rclone` job with its own credentials and monitoring (a failed backup must raise an alert — see ADR-0010 observability).
- The off-site target is a third party that holds app data. `restic`/`rclone` client-side encryption means they hold *ciphertext* only, which keeps this consistent with the project's data-ownership stance (ADR-0011) — the third party never sees plaintext user content.
- Recovery Point Objective ≈ 24 h (last off-site push). Recovery Time Objective depends on rebuild speed — the config-as-code tier keeps it to "provision a box, `docker compose up`, restore dump + blobs."
- Backup encryption key becomes a critical secret: if it is only on the box that dies, the off-site backups are useless. Store the key in the owner's password manager, not just on the server.
