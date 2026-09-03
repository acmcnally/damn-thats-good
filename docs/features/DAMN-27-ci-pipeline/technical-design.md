# DAMN-27 — CI pipeline (build & verify): technical design

Status: revised after adversarial design review · light-touch workflow (no UI
surface; this doc stands in for the UX phase). Pre-PR diff review still runs.

## Requirements (frozen — see the Linear issue)

GitHub Actions that:

1. gates every PR on the same `pnpm verify` run locally (the required check for merging to `main`);
2. on merge to `main`, builds and pushes two SHA-tagged images (`api`, `web`) to GHCR;
3. adds the ADR-0012 `pre-push` hook (fast test tiers, local-first half of the gate);
4. adds the ADR-0005-assigned `pnpm.onlyBuiltDependencies` allowlist.

**No deploy** (DAMN-28), **no Playwright / workflow tier** (DAMN-29).

Trigger model: `push` to `main` + all `pull_request`s — **not** every branch push.
A branch with no PR gets no CI; open a draft PR for pre-review feedback. This is a
deliberate, owner-approved narrowing of the issue's "every push / PR" wording,
chosen for CI wall-clock economy (the Linear text is being reconciled to match).

## No UI surface

CI config, a git hook, dependency-manifest and doc updates. Nothing renders.

## What gets added / changed

```
.github/workflows/ci.yml     the pipeline
.github/dependabot.yml       weekly bumps for the github-actions ecosystem
.githooks/pre-push           fast-tier gate before push (committed mode 100755)
package.json                 "verify:fast" script + "prepare" hook wiring + pnpm.onlyBuiltDependencies
docs/adr/0010-*.md           status line + "build once" section  (already committed: d4a03c5)
docs/adr/0012-*.md           "pre-push hook realized in DAMN-27" note
docs/adr/0005-*.md           onlyBuiltDependencies item marked done
README.md / CLAUDE.md        CI + verify:fast notes
```

No new scaffolding — CI is permanent. No `SCAFFOLD(DAMN-27)` markers.

## The workflow — `.github/workflows/ci.yml`

### Top matter

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
permissions:
  contents: read
```

- **Triggers:** push-to-`main` + all PRs. A PR'd branch runs once (the PR event), not twice; the `push:` side fires only for the post-merge `main` run that publishes images.
- **`concurrency`:** superseded PR runs cancel; `main` runs never cancel (each merge publishes its own image).
- **`permissions`:** workflow default is read-only; the publish job re-grants `packages: write` for itself.
- Third-party actions are **pinned to commit SHAs** (comment carries the human-readable tag). `.github/dependabot.yml` keeps them current.

### Job: `verify` — the required check

`ubuntu-latest`. Steps:

1. `actions/checkout`
2. `pnpm/action-setup` — reads the `packageManager` field, no version pin here
3. `actions/setup-node` — `node-version-file: .node-version`, `cache: pnpm` (ordered after pnpm is on PATH)
4. `pnpm install --frozen-lockfile`
5. `pnpm verify`

Env: `TESTCONTAINERS_RYUK_DISABLED: true` — the runner is ephemeral, so the reaper
is unnecessary (and occasionally flaky on GHA). `ubuntu-latest` ships Docker, so
the `component-api` tier's Testcontainers Postgres works unmodified; the existing
60 s / 120 s Vitest timeouts absorb the ~15 s cold image pull.

`pnpm verify` today = `lint → typecheck → test (3 Vitest tiers) → build`.

**Forward note (DAMN-29):** ADR-0012 has `pnpm verify` eventually running the
Playwright/workflow tier too. That tier needs a running web+API+Postgres stack,
which this `verify` job does not stand up. DAMN-29 will therefore **restructure
how this job invokes verify** — either splitting the sub-steps so the workflow
tier runs in its own job with a stack, or env-gating the workflow tier out of the
CI `verify` call. This design does not pre-build that; it just doesn't block it
(the job is a plain sequence of documented steps, not a black box).

### Job: `build-images` — validate on PR, publish on `main`

```yaml
build-images:
  needs: verify
  runs-on: ubuntu-latest
  permissions:
    contents: read
    packages: write
```

`needs: verify` — a `main` merge whose tests regress (something local `pnpm
verify` missed, caught by the CI backstop) must **not** publish `:latest`, because
DAMN-28 auto-deploys `:latest` to staging. On a PR this also means the image build
only runs once `verify` is green — no wasted build minutes on a failing PR.

**Single job, not a matrix.** `api` and `web` share the whole `base → deps →
build` chain of the Dockerfile (`pnpm install`, `pnpm -r build`). A matrix runs
that chain twice on two runners. One job building the two targets sequentially
lets BuildKit reuse the shared stages within the run.

Steps:

1. `actions/checkout`
2. `docker/setup-buildx-action`
3. `docker/login-action` → `ghcr.io`, `${{ github.actor }}` / `${{ secrets.GITHUB_TOKEN }}` — **guarded** `if: github.event_name == 'push'` (i.e. `main` only)
4. For each of `api`, `web`:
   - `docker/metadata-action` — image `ghcr.io/${{ github.repository }}-<target>`; tags `type=sha,format=long` (→ `sha-<40hex>`) + `type=raw,value=latest,enable={{is_default_branch}}`
   - `docker/build-push-action`:
     - `target: <target>`
     - `push: ${{ github.event_name == 'push' }}`
     - `provenance: false`, `sbom: false` (single-arch; avoids the `unknown/unknown` attestation entry on the GHCR package page and keeps digest-pinned pulls simple for DAMN-28)
     - `cache-from: type=gha,scope=build`
     - `cache-to: type=gha,mode=max,scope=build` (shared scope — the `api` build populates `deps`+`build`; the `web` build reads them back)

On a PR: builds both targets, no push (Dockerfile + assembly validation). On
`main`: publishes `ghcr.io/acmcnally/damn-thats-good-api` and
`…-web`, each tagged `sha-<40hex>` **and** `latest`.

**Image naming:** suffixed — `<repo>-api`, `<repo>-web` — matching the frozen
Linear scope. DAMN-28's deploy pulls `ghcr.io/acmcnally/damn-thats-good-web:latest`
etc.

**`latest`:** the moving tag DAMN-28's staging auto-deploy follows. `sha-<40hex>`
is the immutable identifier used for release promotion to prod.

**GHCR visibility:** the first `GITHUB_TOKEN` push creates both packages
**private**, even though the repo is public. Immediately after the first `main`
publish, set both packages to public (the repo is public anyway) — otherwise
DAMN-28's staging host needs a read PAT. This one-time step is called out in the
PR body and flagged on DAMN-28.

### Caching

- **pnpm store** — `setup-node`'s `cache: pnpm`, keyed on `pnpm-lock.yaml` hash. Content-addressed: a stale hit is only slower, never wrong.
- **Docker layers** — `type=gha, mode=max, scope=build` (one shared scope for both targets). `mode=max` exports the intermediate `deps` and `build` stages — the expensive ones — so a lockfile-unchanged run skips `pnpm install` entirely. Two small Node images + the pnpm cache stay well under the 10 GB per-repo ceiling, so `mode=min`'s ceiling rationale doesn't apply.
- **Testcontainers Postgres image** — not cached. `docker pull postgres:17.11` off Docker Hub's CDN is ~15 s; the `docker save`/`load`-through-Actions-cache alternative is fragile and not obviously faster.

First-PR run times get read off the actual runs; if the Docker layer cache
turns out not to pay for these image sizes, dropping `cache-from/to` is a
one-line follow-up. The cache is *correctly configured* now, so that measurement
is meaningful.

## The pre-push hook (ADR-0012 local-first half)

ADR-0012: *"Every build, watch mode, and the pre-push hook (local): unit + web
component … target well under ~20 s … Enforced by a git `pre-push` hook."*

### Mechanism: native `core.hooksPath`, no dependency

- `.githooks/pre-push` — committed shell script (mode `100755`, set via `git update-index --chmod=+x`), runs `pnpm verify:fast`.
- Root `package.json`: `"prepare": "git config core.hooksPath .githooks || true"` — runs on every `pnpm install`, so a fresh clone is wired after the first install. `|| true` keeps it from failing where there is no git (CI's `--frozen-lockfile` install, the Docker `deps` stage on `node:24-bookworm-slim` which has no `git` — a harmless stderr line there).
- `"verify:fast": "vitest run --project unit --project component-web"` — the two Docker-free, browser-free tiers. The hook calls this; also runnable by hand.

**Not husky.** Husky's own `prepare` step just sets `core.hooksPath`; doing it
directly is one config line with no dependency and no `.husky/` wrapper dir.
ADR-0005's "add complexity only when the pain is real" points at native for a solo
repo. The trigger to adopt husky would be wanting `lint-staged` (staged-file-only
pre-commit linting) — its documented pairing. Trivial swap if that day comes.

The hook is **advisory** — `git push --no-verify` skips it (ADR-0012 keeps that
escape hatch; CI is the real gate). `verify:fast` is deliberately *just the two
test tiers* — not lint/typecheck — to protect the <20 s budget; those run in full
`pnpm verify` and in CI.

## `pnpm.onlyBuiltDependencies`

ADR-0005 (final line) assigns this to DAMN-27: pnpm 10 blocks dependency lifecycle
scripts by default; pnpm 9 (our current `packageManager`) does not. Setting the
allowlist now is forward-compatible and de-risks the eventual pnpm 10 bump.

Implementation: run `pnpm install` and inspect which dependencies have build
scripts (`esbuild`'s binary-fetch postinstall is the known one; `@swc/core` and
others may appear), then add exactly those to `pnpm.onlyBuiltDependencies` in the
root `package.json`. pnpm 9 reads and honours the field, so `pnpm verify` in this
same PR confirms nothing is missing.

## Branch protection

`main` is already protected. **Live config today has no `required_status_checks`
key at all** — so a `PATCH` on that sub-resource 404s. Adding it means a `PUT` of
the *whole* protection object. Applied during implementation as:

1. `gh api repos/acmcnally/damn-thats-good/branches/main/protection` — capture current state.
2. Build the full payload = current settings + `required_status_checks: { strict: false, checks: [{ context: "verify" }] }`.
   - `strict: false` — don't force "branch up to date before merge"; a solo one-PR-at-a-time flow doesn't need the rebase churn, and the post-merge `main` run is the backstop.
   - Preserve: `enforce_admins`, `required_pull_request_reviews` (count 0), `required_linear_history: true`, `required_conversation_resolution: true`, `allow_force_pushes: false`, `allow_deletions: false`, `block_creations`, `lock_branch`, `allow_fork_syncing` as currently set.
3. `gh api --method PUT … --input <payload.json>`.
4. `gh api … /branches/main/protection` again — capture new state.

Before/after both go in the PR body. `build-images` is **not** added as a required
check — a registry hiccup shouldn't block a merge that `verify` passed, and
nothing consumes the images until DAMN-28.

**Consequence to accept:** with `enforce_admins: true` (already on) + `verify`
required, a GitHub Actions outage or a wedged/flaky `verify` blocks *all* merges,
including an emergency fix, until protection is toggled off. Acceptable at this
scale; noted so it's not a surprise.

**`verify` job id is load-bearing** — it *is* the required-check context string.
Renaming the job, or wrapping it in a matrix, silently makes `main` unmergeable
(check stuck "pending"). A comment in the workflow says so.

## Test plan

CI can't be meaningfully unit-tested; it's verified by running it.

| What | How |
|---|---|
| `verify` green on a clean branch | push branch, open a **draft** PR, observe |
| `verify` blocks a red test | temporary failing unit test → mark PR ready → merge button disabled while `verify` red → revert |
| `component-api` (Testcontainers) on the runner | it's in `pnpm verify`; confirmed by the run above (watch the timing) |
| Dockerfile builds under buildx | `docker buildx build --target api .` and `--target web .` locally (matches the CI builder) |
| both images build on a PR, no push | inspect the PR run logs — build steps run, no `push` |
| publish + tags on `main` | first post-merge run; GHCR package pages show `sha-<40hex>` + `latest` on both `-api` and `-web` |
| GHCR packages made public | manual, right after; `docker pull` from an unauthenticated context |
| pre-push hook fires | break a unit test, `git push` → rejected; `git push --no-verify` → allowed; fix |
| `prepare` wires a fresh clone | `git clone` to a temp dir, `pnpm install`, check `git config core.hooksPath` returns `.githooks` |
| `onlyBuiltDependencies` complete | `pnpm install` clean + `pnpm verify` green in this PR |
| branch protection blocks merge | ready (non-draft) PR + red `verify` → merge blocked; `gh api` before/after captured |

`act` (nektos/act) is **not** used — Testcontainers-in-`act` needs Docker-in-Docker
gymnastics; the real runner is the honest test.

## Open decisions — all resolved

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Trigger model | `push:[main]` + `pull_request` | no double-runs; draft PR covers pre-review feedback; owner-approved narrowing of "every push / PR" |
| 2 | `build-images` vs `verify` | `needs: verify` | a CI-caught regression must not publish `:latest` (DAMN-28 auto-deploys it) |
| 3 | api/web build structure | single job, sequential, shared `type=gha` scope | share the `deps`+`build` stages instead of doubling them |
| 4 | Docker layer cache mode | `mode=max`, shared `scope=build` | exports the expensive intermediate stages; well under the 10 GB ceiling |
| 5 | GHCR image naming | suffixed `<repo>-{api,web}` | matches frozen Linear scope; DAMN-28 depends on it |
| 6 | `latest` tag now? | yes, on `main` builds | DAMN-28 needs a moving tag; `sha-<40hex>` stays canonical |
| 7 | Hook mechanism | native `core.hooksPath` + `prepare` | zero-dep; husky is a swap-in when `lint-staged` is wanted |
| 8 | `verify:fast` contents | unit + component-web only | ADR-0012's <20 s pre-push budget |
| 9 | `strict` on branch protection | `false` | solo one-PR flow; avoids rebase churn |
| 10 | Third-party action pinning | SHA-pinned + Dependabot | public-repo supply-chain hygiene |
| 11 | `onlyBuiltDependencies` | done here, list derived from `pnpm install` | ADR-0005 assigned it to DAMN-27 |
| 12 | Cache the PG image? | no | plain pull is fast; save/load is fragile |
| 13 | `provenance`/`sbom` on build-push | `false` | single-arch; cleaner GHCR package page for DAMN-28 |

## Risks

- **First green run needs iteration** — YAML / action-version / permission mistakes surface only on the runner. Mitigated by the draft-PR loop.
- **`type=gha` cache overhead may still not pay** for images this small even at `mode=max`. Now at least measurable; dropping it is one line.
- **`prepare` running `git config` in odd contexts** (CI, tarball installs, no `.git`). Mitigated by `|| true`.
- **Emergency-merge lockout** — `enforce_admins` + required `verify` means no merge during a GHA outage without toggling protection. Accepted.
- **GHA minutes** — public repo = unlimited GitHub-hosted minutes; the only concern is wall-clock, addressed by caching.
