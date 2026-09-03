# DAMN-27 — CI pipeline (build & verify): technical design

Status: draft for review · light-touch workflow (no UI surface; this doc stands in
for the UX phase). Adversarial design review + pre-PR diff review still run.

## Requirements (frozen — see the Linear issue)

GitHub Actions that (1) gates every PR on the same `pnpm verify` run locally, and
(2) on merge to `main`, builds and pushes the two SHA-tagged images to GHCR. **No
deploy** (DAMN-28), **no Playwright tier** (DAMN-29).

## No UI surface

CI config, a git hook, and doc updates. Nothing renders.

## What gets added

```
.github/workflows/ci.yml     the pipeline
.githooks/pre-push           fast-tier gate before push
package.json                 "verify:fast" script + "prepare" hook-path wiring
docs/adr/0010-*.md           status line + "build once" section  (already committed: d4a03c5)
docs/adr/0012-*.md           "pre-push hook realized in DAMN-27" note
README.md / CLAUDE.md        CI + verify:fast notes
```

No new scaffolding — CI is permanent. No `SCAFFOLD(DAMN-27)` markers.

## The workflow — `.github/workflows/ci.yml`

### Triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

Push-to-`main` + all PRs. A feature branch with an open PR runs once (the PR
event), not twice. A feature branch with **no** PR yet runs nothing — open the PR
as a **draft** to get CI before review. This is the minutes-efficient choice
(the maintainer's stated concern is CI wall-clock); the alternative (`push:` on
all branches) double-runs every PR'd branch.

### `concurrency`

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Superseded PR runs are cancelled; `main` runs are never cancelled (every merge
builds its own image).

### Job: `verify` — the required check

`ubuntu-latest`. Steps:

1. `actions/checkout@v4`
2. `pnpm/action-setup@v4` — reads the `packageManager` field, no version pin here
3. `actions/setup-node@v4` — `node-version-file: .node-version`, `cache: pnpm`
4. `pnpm install --frozen-lockfile`
5. `pnpm verify`

Env: `TESTCONTAINERS_RYUK_DISABLED: true` (the runner is ephemeral — no reaper
needed; Ryuk is occasionally flaky on GHA). `ubuntu-latest` ships Docker, so the
`component-api` tier's Testcontainers Postgres works unmodified.

`pnpm verify` today = `lint → typecheck → test (3 Vitest tiers) → build`. When
DAMN-29 adds the Playwright tier to `verify`, it flows through here with no
workflow-file change (though DAMN-29 will likely split it to a separate job that
needs a running stack).

### Job: `build-images` — validate on PR, push on `main`

Runs **in parallel with `verify`** (independent concern; max parallelism = fastest
feedback). Matrix:

```yaml
strategy:
  matrix:
    target: [api, web]
```

`permissions: { contents: read, packages: write }` (job-scoped — only this job
touches GHCR).

Steps per target:

1. `actions/checkout@v4`
2. `docker/setup-buildx-action@v3`
3. `docker/login-action@v3` — `ghcr.io`, `${{ github.actor }}` / `${{ secrets.GITHUB_TOKEN }}` — **only when** `github.ref == 'refs/heads/main'`
4. `docker/metadata-action@v5` — images `ghcr.io/${{ github.repository }}/${{ matrix.target }}`; tags `type=sha,format=long` + `type=raw,value=latest,enable={{is_default_branch}}`
5. `docker/build-push-action@v6`:
   - `target: ${{ matrix.target }}`
   - `push: ${{ github.ref == 'refs/heads/main' }}`
   - `cache-from: type=gha,scope=${{ matrix.target }}`
   - `cache-to: type=gha,mode=min,scope=${{ matrix.target }}`

On a PR this builds both targets and stops (Dockerfile validation). On `main` it
pushes `ghcr.io/acmcnally/damn-thats-good/{api,web}:sha-<full>` **and** `:latest`.

**Image path:** nested (`.../damn-thats-good/api`) not suffixed (`...-api`) — keeps
both images grouped under the repo's package list, and it's `metadata-action`'s
natural shape.

**`latest`:** the moving tag DAMN-28's staging auto-deploy follows. The
full-length SHA tag stays the real, immutable identifier for promotion.

### Caching

- **pnpm store** — `setup-node`'s `cache: pnpm`, keyed on `pnpm-lock.yaml` hash. Content-addressed store: a stale hit can only be slower, never wrong.
- **Docker layers** — `type=gha, mode=min, scope=<target>`. `min` keeps us clear of the 10 GB per-repo cache ceiling (two image caches + the pnpm cache share it). The Dockerfile's `deps` layer already gives us a full dependency-install cache hit whenever the lockfile + manifests are unchanged, so the `RUN --mount=type=cache` pnpm-store mount not persisting under `mode=min` costs nothing in the common case.
- **Testcontainers Postgres image** — not cached. `docker pull postgres:17.11` off Docker Hub's CDN is ~5–10 s; the `docker save`/`load`-through-Actions-cache alternative is fragile and not obviously faster.

We read the actual run times off the first PR and decide in review whether the
Docker layer cache earns its place.

## The pre-push hook (ADR-0012 local-first half)

ADR-0012: *"Every build, watch mode, and the pre-push hook (local): unit + web
component … target well under ~20 s … Enforced by a git `pre-push` hook."*

### Mechanism: native `core.hooksPath`, no dependency

- `.githooks/pre-push` — committed shell script, `runs vitest run --project unit --project component-web`.
- Root `package.json`: `"prepare": "git config core.hooksPath .githooks || true"` — runs on every `pnpm install`, so a fresh clone is wired after the first install. The `|| true` keeps CI installs (and non-git contexts) from failing.
- `"verify:fast": "vitest run --project unit --project component-web"` — the hook calls this; also runnable by hand.

**Alternative — husky:** the industry-standard choice (portability lens), but it's
a dependency + its own `prepare` step + a `.husky/` dir, to wrap what
`core.hooksPath` does natively in one config line. ADR-0005's "add complexity only
when the pain is real" points at the native approach for a solo repo. Recommend
native; husky remains a trivial swap if hook management ever gets fiddly.

The hook is **advisory** — `git push --no-verify` skips it (ADR-0012 explicitly
keeps that escape hatch; CI is the real gate).

Scope note: `verify:fast` is deliberately *just the two test tiers* — not lint or
typecheck. ADR-0012 scopes the pre-push gate to "unit + web component" to protect
the <20 s budget. Lint/typecheck run in `pnpm verify` and in CI.

## Branch protection

`main` is already protected (PR-only, squash). This adds `verify` as a required
status check. Applied during implementation via:

```
gh api --method PATCH repos/acmcnally/damn-thats-good/branches/main/protection/required_status_checks \
  -f 'strict=true' -F 'checks[][context]=verify'
```

The before/after of the protection config goes in the PR body. `build-images` is
**not** a required check — a registry/Docker-Hub hiccup shouldn't block a merge
that `verify` passed, and nothing consumes the images until DAMN-28.

## Test plan

CI can't be meaningfully unit-tested; it's verified by running it.

| What | How |
|---|---|
| `verify` job green on a clean branch | push branch, open draft PR, observe |
| `verify` blocks a red test | temporary failing test in the branch → PR check red → revert |
| `component-api` (Testcontainers) works on the runner | it's in `pnpm verify`; confirmed by the run above |
| Dockerfile builds under buildx | `docker buildx build --target api .` and `--target web .` locally (matches the CI builder, unlike plain `docker build`) |
| image push + tags on `main` | first post-merge run; inspect the GHCR package page for `sha-<full>` + `latest` on both images |
| pre-push hook fires | local: break a unit test, `git push` → rejected; `git push --no-verify` → allowed; fix |
| `prepare` wires a fresh clone | `git clone` to a temp dir, `pnpm install`, check `git config core.hooksPath` |
| branch protection | `gh api …/branches/main/protection` before/after; try to merge the draft PR with `verify` pending → blocked |

Local `act` (nektos/act) is **not** used — Testcontainers-in-`act` needs
Docker-in-Docker gymnastics and the real runner is the honest test.

## Open decisions — all resolved

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Trigger model | `push:[main]` + `pull_request` | no double-runs; draft PR covers pre-review feedback |
| 2 | `build-images` vs `verify` ordering | parallel | fastest feedback; independent concerns |
| 3 | GHCR image path | nested `.../repo/{api,web}` | grouped under the repo, `metadata-action`-native |
| 4 | `latest` tag now? | yes, on `main` builds | DAMN-28 needs a moving tag; SHA stays canonical |
| 5 | Hook mechanism | native `core.hooksPath` + `prepare` | zero-dep; husky is a swap-in later |
| 6 | `verify:fast` contents | unit + component-web only | ADR-0012's <20 s pre-push budget |
| 7 | Branch-protection change | `gh api` during impl, documented in PR | it's in scope; show the diff |
| 8 | Docker layer cache `mode` | `min` | 10 GB shared cache ceiling |
| 9 | Cache the PG image? | no | plain pull is fast; save/load is fragile |

## Risks

- **First green run needs iteration** — YAML/action-version/permission mistakes surface only on the runner. Mitigated by the draft-PR loop.
- **`type=gha` cache overhead may wash out its benefit** for images this small. Acceptable — we measure and can drop `cache-from/to` in review.
- **`prepare` running `git config` in odd contexts** (CI, tarball installs, no `.git`). Mitigated by `|| true`.
- **GHA free-tier minutes** — public repo = unlimited Actions minutes on GitHub-hosted runners, so no quota concern; the concern is only wall-clock, addressed by caching.
