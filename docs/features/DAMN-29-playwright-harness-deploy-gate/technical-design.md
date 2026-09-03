# DAMN-29 — Playwright harness + deploy gate: technical design

Status: **revised after adversarial design review** · light-touch workflow (no UI
surface; this doc stands in for the UX phase). Pre-PR diff review still runs.

## Requirements (frozen — see the Linear issue)

1. Playwright set up as its **own package / config** — not in `verify:fast`
   (ADR-0012).
2. One Chromium **smoke test against staging**: the page loads, `GET /api/health`
   is 200, and data that made the web → API → Postgres round trip renders.
3. An **auth-bypass seam** for workflow tests — a no-op stub now; the real body
   lands with DAMN-1.
4. **Pipeline wiring**: after `deploy-staging` (DAMN-28) deploys to staging, the
   Playwright suite runs against staging.
5. `pnpm verify` runs the workflow tier locally too (ADR-0012 — local-first).

### "Done when" — re-scoped

The Linear text is *"a merge to `main` deploys to staging and then runs the
Playwright smoke test against it; a red result blocks promotion."* Promotion does
not exist until DAMN-30, so the deliverable here is:

> A merge to `main` deploys to staging and then runs the Playwright smoke test
> against it, producing a **per-commit green/red result** (`e2e-staging` job).
> DAMN-30 wires that result into the manual promote-to-prod step as a hard gate.

The "blocks promotion" half is DAMN-30's to build; DAMN-29 owns the signal and
its contract (see § "Signal contract for DAMN-30").

### Narrowing (owner-approved, consistent with ADR-0012)

The PR `verify` job does **not** run the workflow tier. ADR-0012 puts the workflow
gate on the *deploy*, not the PR. The tier runs in two places: locally via
`pnpm verify`, and in CI via the `e2e-staging` job against the real staging
deployment. ADR-0012's body is amended to match (see § "Doc updates").

## No UI surface

A test package, a CI job, and doc updates. Nothing renders.

## What gets added / changed

```
pnpm-workspace.yaml                 + 'e2e' in the packages list
e2e/package.json                    @dtg/e2e — @playwright/test, test + typecheck scripts
e2e/tsconfig.json                   4-line stub extending tsconfig.base.json
e2e/playwright.config.ts            projects (chromium), baseURL, proxy, reporters
e2e/run.ts                          wrapper: skip logic + local stack lifecycle + `playwright test`
e2e/run.test.ts                     tier-1 unit tests for run.ts mode dispatch
e2e/tests/smoke.spec.ts             the one smoke test (SCAFFOLD assertions — DAMN-26 surface)
e2e/support/auth.ts                 loginAsTestUser() no-op stub + the DAMN-1 contract
e2e/README.md                       how to run local / CI; the auth seam; first-run cost
docker-compose.yml (root)           + a healthcheck on the `web` service
package.json (root)                 "e2e" script; "verify" gains a trailing "pnpm e2e"
eslint.config.ts                    + eslint-plugin-playwright (no-focused-test) scoped to e2e/**
.github/workflows/ci.yml            new e2e-staging job (needs: deploy-staging)
.gitignore                          e2e/playwright-report, e2e/test-results
docs/adr/0012-testing-strategy.md   amend the "all three tiers in CI" + "CI on PR" wording
CLAUDE.md / README.md               e2e run notes
```

No `SCAFFOLD(DAMN-29)` on the harness — it is permanent. The **smoke test's
assertions** are scaffold (they target the walking-skeleton surface) and carry
the marker.

## Harness layout — `@dtg/e2e` workspace package

`e2e/` is added to `pnpm-workspace.yaml`'s `packages` list explicitly (neither an
`app` nor a `packages/*` library). Same per-package boilerplate every workspace
already has:

- **`e2e/package.json`** — `@playwright/test` (local dep, not a shared `catalog:`
  tool), `@types/node` + `typescript` from `catalog:`. Scripts: `test` (→
  `node ./run.ts`), `typecheck` (→ `tsc --noEmit`, picked up by root
  `pnpm -r typecheck`).
- **`e2e/tsconfig.json`** — `{ "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] }, "include": ["tests", "support",
  "run.ts", "run.test.ts", "playwright.config.ts"] }`.

Lint: `eslint.config.ts` already covers the tree; this PR adds
`eslint-plugin-playwright`'s `no-focused-test` rule scoped to `e2e/**` so a
committed `test.only` fails the required `verify` check (which does not run
Playwright itself). Prettier unchanged.

## Execution model

One script, `e2e/run.ts`, dispatches between three runtime contexts:

| Context | Detected by | What it does |
|---|---|---|
| **CI `e2e-staging` job** | `E2E_BASE_URL` set | `playwright test` against that URL through the tailnet proxy. No stack management. |
| **CI `verify` job** | `GITHUB_ACTIONS=true`, no `E2E_BASE_URL` | Prints a **loud** "workflow tier runs in `e2e-staging`, skipping here" banner, exits 0. |
| **Local `pnpm verify` / `pnpm e2e`** | neither | Stands up the root `docker-compose.yml` stack, runs `playwright test` against it, tears it down (on success). |

Discriminator is `GITHUB_ACTIONS`, not `CI` — some local tooling exports `CI=true`
and must not silently skip the tier.

### `e2e/run.ts` — local path

Mirrors `deploy/deploy.sh`'s ordering (a single `docker compose up --wait` over
the one-shot `migrate` service hangs on older Compose — docker/compose#10596):

```
baseURL from env or default
state = probeStack()                       # docker compose ps --format json  (array OR ndjson)
switch (state) {
  case 'healthy':   weStarted = false      # reuse — dev already has `docker compose up`
  case 'absent':    weStarted = true
                    docker compose build                                   # no wall-clock cap
                    docker compose up -d postgres --wait --wait-timeout 60
                    docker compose run --rm migrate
                    docker compose up -d --wait --wait-timeout 180 api web
  case 'partial':   abort with a message   # "a dtg stack is up but not healthy —
                                           #  inspect it or `docker compose down`, then retry"
}
port = docker compose port web 8080        # authoritative — honours a dev's WEB_PORT override
try {
  playwright test   (E2E_BASE_URL = http://127.0.0.1:<port>)
  if (weStarted && !E2E_KEEP) docker compose down
} catch {
  # leave the stack up on failure so the report/traces/logs are inspectable
  print "stack left running — `docker compose down` when done, or E2E_KEEP=1 to keep it next time"
  rethrow
}
```

- **`probeStack()`** — three states, not two: `healthy` (postgres + api + web all
  `running` and health `healthy`), `absent` (none running), `partial` (anything
  else → abort, never assume ownership of a stack the dev is mid-debugging).
  Parser handles both `docker compose ps --format json` shapes (JSON array
  pre-v2.21, NDJSON after).
- **`docker compose build` is separate from `up`** and uncapped — a cold
  multi-stage `api`+`web` build on a 4-core box is minutes, not the ~1–2 I first
  wrote. `--wait-timeout` then only covers container startup. First-run cost is
  called out in `e2e/README.md`.
- **`up` needs `build`** — plain `docker compose up` only builds when the image is
  *absent*, never on source changes. The explicit `build` step handles that; local
  edits are never published so we can't pull.
- **`run.ts` is TypeScript on Node 24** (`node ./run.ts`, type stripping) — same
  pattern as `deploy/compose.yaml`'s `node …/migrate.ts`. It shells out with
  `node:child_process` (stdio inherited). It resolves the `playwright` binary via
  `node_modules/.bin` explicitly (not bare `PATH`) so it works whether invoked as
  `pnpm e2e` or `node run.ts`.

### Root `docker-compose.yml` — `web` healthcheck

Added (mirrors `deploy/compose.yaml`), so `probeStack()` can tell a healthy `web`
from a starting one:

```yaml
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://localhost:8080/ >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 5s
```

### `e2e/playwright.config.ts`

```ts
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';
// tag:ci runners reach the tailnet only via tailscaled's local proxy (userspace
// networking — DAMN-28). Unset for local runs and if the runner is kernel-mode.
const proxy = process.env.E2E_PROXY ? { server: process.env.E2E_PROXY } : undefined;

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // a retry that then passes still fails the job — a flaky prod gate is a red gate
  // (Playwright >= 1.45)
  ...(process.env.CI ? { failOnFlakyTests: true } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, proxy, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

No `webServer` block — `run.ts` owns the stack (Playwright's own `webServer`
teardown SIGKILLs the process group and would orphan the compose containers).
Chromium only. HTML reporter (a `blob` report needs a `merge-reports` step before
it can be opened — pointless for one unsharded test).

### `e2e/tests/smoke.spec.ts` (SCAFFOLD assertions)

```ts
// SCAFFOLD(DAMN-29): asserts the DAMN-26 walking-skeleton surface — the seeded
// `app_meta` row rendered via GET /api/meta. DAMN-2 drops `app_meta` and
// regenerates the baseline; replace these with the real recipe surface then.
// (DAMN-2's branch will fail this test locally, forcing the rewrite in that PR.)
test('staging serves the app and reaches the database', async ({ page, request }) => {
  await loginAsTestUser(page);                        // no-op until DAMN-1

  const health = await request.get('/api/health');   // unauthenticated by design (ADR-0010)
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'up' });  // not toEqual — DAMN-1 may add fields

  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Damn That's Good" })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: "Damn That's Good" })).toBeVisible();
});
```

Covers the issue's "assert `GET /api/health` and the rendered data": health is
the API + DB probe; the rendered `<dd>` is the browser-observed round trip. Both
the browser navigation **and** the `request` context traverse the CI proxy — they
resolve DNS differently (see § "Transport"), so exercising both is deliberate.

## Auth-bypass seam

`e2e/support/auth.ts` exports `loginAsTestUser(page): Promise<void>` — **a no-op
today**. Every surface the smoke test touches (`/`, `/api/health`, `/api/meta`)
is open, and no recipe view exists yet. No dead env plumbing — just the function
seam so specs call a stable entry point.

### DAMN-1 handoff (contract, not built here)

- The API honours a **test-only credential** (signed bearer or fixed cookie)
  **only** when a dedicated env var — e.g. `E2E_AUTH_BYPASS=1` — is set on its
  process. Set on the local e2e and staging stacks; **never prod**.
- **`NODE_ENV` is not a safe discriminator** — `deploy/compose.yaml` is
  byte-identical for staging and prod and sets `NODE_ENV=production` on both. The
  guard keys on `E2E_AUTH_BYPASS` (present in staging's `deploy/.env`, absent from
  prod's), optionally backed by a startup assert.
- **The test user row is provisioned server-side**, not by the test. The
  `e2e-staging` run executes on the GitHub runner, which has no Postgres path to
  staging (the tailnet ACL is SSH + HTTPS, not 5432). When `E2E_AUTH_BYPASS` is
  on, the API (or a migration/seed) ensures a known `users` row exists;
  `loginAsTestUser` only attaches the static credential to `page`. A sibling
  helper returns headers for `request` calls.
- **`deploy/compose.yaml` change DAMN-1 must make:** add
  `E2E_AUTH_BYPASS: ${E2E_AUTH_BYPASS:-}` to the `x-app-env` anchor (it has no
  `env_file:` — it forwards only what it names). Staging's `.env` sets it; prod's
  does not. `deploy/README.md` documents it.
- **`run.ts` injection point:** the local path passes `E2E_AUTH_BYPASS=1` into the
  `docker compose up` environment for the `api` service.

## CI wiring — `.github/workflows/ci.yml`

New job, after `deploy-staging` (kept **separate** — see § "Why a separate job"):

```yaml
  # Runs the Playwright smoke test against the staging deployment `deploy-staging`
  # just produced. main-only, post-merge. NOT a required status check — it's a
  # per-commit signal DAMN-30's promote step gates on.
  #
  # The job id `e2e-staging` is an API contract: DAMN-30 reads its conclusion via
  # the Checks API. Renaming it breaks that gate silently. (Same footgun as the
  # `verify` job id — see DAMN-27.)
  e2e-staging:
    needs: deploy-staging
    if: ${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') }}
    runs-on: ubuntu-latest
    environment: staging          # scopes TS_OAUTH_* + STAGING_URL; branch rule = main only
    permissions:
      contents: read              # actions/checkout — explicit, not relying on the public-repo default
    concurrency:
      group: deploy-staging       # same group as deploy-staging — consistency; see "Ordering"
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@…              # v7.0.1  (SHA-pinned, like the rest)
      - uses: pnpm/action-setup@…             # v6.0.10
      - uses: actions/setup-node@…            # v7.0.0  (node-version-file: .node-version, cache: pnpm)
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @dtg/e2e exec playwright install --with-deps chromium
      - name: Join the tailnet (ephemeral tag:ci node)
        uses: tailscale/github-action@…       # v4.1.3 — same as deploy-staging
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
          tags: tag:ci
      - name: Smoke test against staging
        env:
          E2E_BASE_URL: ${{ vars.STAGING_URL }}
          E2E_PROXY: ''            # set once the draft-PR loop confirms the value — see "Transport"
        run: pnpm e2e
      - uses: actions/upload-artifact@…       # v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

- **`needs: deploy-staging`** — runs against what `deploy-staging` just put on the
  box. `deploy.sh` already waits healthy + retries `/api/health`, so staging is
  serving when this starts. The runner checks out `github.sha` — the same commit
  whose images staging is now running.
- **`environment: staging`** is required to reach `secrets.TS_OAUTH_*` and
  `vars.STAGING_URL`; its branch rule backstops the `if:`.

### Why a separate job (not folded into `deploy-staging`)

An earlier draft folded the smoke steps into `deploy-staging` to dodge a supposed
cross-run concurrency race. **That race doesn't exist**: `ci.yml`'s
workflow-level `concurrency` (`group: CI-${{ github.ref }}`,
`cancel-in-progress: false`) serialises all `main` runs — run B stays fully
pending (zero jobs) until run A completes, so `A:e2e-staging` always finishes
before `B:deploy-staging` starts. Given correctness is not at stake, a separate
job wins on: distinct diagnostics (deploy broke vs smoke broke), a lean
fast `deploy-staging`, independent re-run from the Actions UI, and a natural home
for a future scheduled smoke.

### Ordering

- **Within a run:** `needs: deploy-staging` sequences deploy → smoke.
- **Across runs:** the workflow-level `main` serialisation above. The shared
  job-level `concurrency: deploy-staging` group is consistency/defence only — it
  is *not* what provides ordering, and it cannot deadlock (`needs` guarantees the
  two never contend for the slot simultaneously).

### Signal contract for DAMN-30

- Gate on `e2e-staging` conclusion **`== success`** (explicit green). A failed
  `deploy-staging` makes `e2e-staging` **skipped**, not failed — "not red" must
  not be read as "passed".
- The job id `e2e-staging` is the Checks-API name DAMN-30 queries. Stable. The
  workflow comment says so.
- `workflow_dispatch` on `main` **redeploys `:latest` first** (via
  `deploy-staging`), then smokes it — it is not a "re-run e2e against current
  staging" button. And if the latest `main` `build-images` failed (not a required
  check), `:latest` may be behind `main`. DAMN-30's promote works off an immutable
  `sha-…` tag, so it should re-verify rather than trust a stale dispatch result.

### Transport (CI runner → staging) — the open mechanism

The runner reaches staging over the tailnet. Plain `curl`/DNS to `*.ts.net` does
not route on a GitHub runner (userspace networking — DAMN-28), so requests go
through `tailscaled`'s local proxy. **Unknowns, each with its own pass/fail check,
resolved on the draft-PR loop (DAMN-28 iterated its tailscale bits the same way):**

| # | Unknown | Check |
|---|---|---|
| 1 | Does `tailscale/github-action` on `ubuntu-latest` come up **userspace** or **kernel** mode? | after the join step: `ip link show tailscale0`. Kernel → an interface exists, leave `E2E_PROXY` unset. Userspace → no interface, a proxy is required. |
| 2 | Proxy **scheme + port** (userspace only) | try `socks5://localhost:1055`; the action also exposes an HTTP proxy — fall back to `http://localhost:1055`. Confirm from the action's startup log / `tailscaled` args. |
| 3 | **DNS through the proxy** — browser vs `request` context | Chromium with a SOCKS5 proxy resolves remotely (tailnet-side, MagicDNS works); undici's `ProxyAgent` (Playwright's `request`) resolves via CONNECT, also remote. The smoke test hits **both** paths against `STAGING_URL` — if only one fails it's this. |
| 4 | **TLS** | `tailscale serve` presents a real Let's Encrypt cert for the `ts.net` name — no `ignoreHTTPSErrors`. Check: no cert error in the run. |
| 5 | **Tailnet ACL** | `tag:ci → tag:staging` must permit **`:443`** (not just `:22`, which DAMN-28 used for SSH). See prerequisite below. |

**Prerequisite (owner, during implementation):** confirm the tailnet policy allows
`tag:ci` → `tag:staging` on `:443`. DAMN-28's README left the default allow-all
rule in place (so it already works); DAMN-28's *design doc* proposed tightening to
`:22`-only. If you tightened it, add `:443`. This contradiction in the DAMN-28
docs is noted for cleanup.

**Fallback if the proxy path can't be made to work:** run Playwright **on the
box** in a container, over the SSH channel that already works:

```
tailscale ssh deploy@$STAGING_HOST \
  "cd ~/dtg && docker run --rm --network dtg_default --pull=always \
     -v \$PWD:/work -w /work mcr.microsoft.com/playwright:v1.<x>-noble \
     sh -c 'corepack enable && pnpm install --frozen-lockfile --filter @dtg/e2e && \
            E2E_BASE_URL=http://web:8080 pnpm --filter @dtg/e2e exec playwright test'"
```

Reaches `web:8080` directly on the compose network — **zero transport unknowns.**
Cost: a ~1.5 GB Playwright image on the box (tagged, survives `docker image prune
-f`), transient browser RAM during a brief run on a 2 GB LXC, and a per-run
in-container `pnpm install` (~30–60 s, cacheable in a volume later). Documented
now so a failed loop is a pivot, not a redesign.

### New Actions variable

`STAGING_URL` (environment `staging`) = `https://<staging-host>.<tailnet>.ts.net`
— the `tailscale serve` HTTPS URL. A **variable, not a secret** (same call as
`STAGING_HOST` in DAMN-28); not in git. It is a *separate* var rather than derived
from `STAGING_HOST` because the `.ts.net` FQDN embeds the tailnet name, which must
stay out of the workflow YAML (public repo).

## `pnpm verify` change

```jsonc
"e2e":    "pnpm --filter @dtg/e2e test",
"verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e",
```

- Local `pnpm verify` ends with the workflow tier against a real stack
  (ADR-0012 parity).
- CI `verify` job: `run.ts` self-skips (`GITHUB_ACTIONS`, no `E2E_BASE_URL`) — the
  required PR check stays fast, no duplicate stack build.
- `pnpm -r typecheck` picks up `@dtg/e2e`; `pnpm -r build` skips it (no `build`
  script).

## Doc updates — `docs/adr/0012-testing-strategy.md`

Not just an appended note — two sentences in the body are made accurate:

- *"**`pnpm verify` — one local command, and the same job in CI:** all three
  tiers…"* → the **local** `pnpm verify` runs all three; the CI **`verify` job**
  runs unit + component only — the workflow tier self-skips there and runs in the
  `e2e-staging` job against the deployed staging environment.
- *"The Playwright tier is not in `pnpm verify` yet — it arrives with DAMN-29,
  which will also sort out how CI stands up a stack for it."* → **Realized in
  DAMN-29.** `pnpm verify` runs the tier locally against a `docker compose` stack;
  CI runs it against staging (`e2e-staging`, `needs: deploy-staging`), not on the
  PR.
- The "Before deploy" bullet: reframe from "before cutover" to "after the staging
  deploy; green gates the **prod promote** (DAMN-30)".

## Test plan

| What | How |
|---|---|
| harness runs locally, stack down | `docker compose down` first, then `pnpm e2e` → builds, boots, passes, tears down |
| running stack is reused | `docker compose up -d --wait` then `pnpm e2e` → no rebuild, stack left up |
| partial stack aborts cleanly | kill `api`, `pnpm e2e` → clear abort message, stack untouched |
| failure leaves the stack up | break the assertion locally → `pnpm e2e` red, `docker compose ps` still up, report openable |
| local red path against staging | `E2E_BASE_URL=<staging> pnpm e2e` from the tailnet with a broken assertion → red (validates Playwright fails loudly) |
| `pnpm verify` includes it locally | full `pnpm verify` green |
| CI `verify` self-skips | draft PR → `verify` job log shows the loud skip banner, timing unchanged |
| `run.ts` mode dispatch | `e2e/run.test.ts` — env in → decision out, `child_process` mocked |
| `test.only` is caught | commit a `.only` → `pnpm lint` fails (no stack needed) |
| `e2e-staging` green on `main` | first post-merge run — job green after `deploy-staging` |
| transport unknowns | draft-PR loop, table above, one check each |
| report artifact | download from the run, open `index.html` |

## Open decisions — resolved

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Harness location | `e2e/` explicit workspace package (`@dtg/e2e`) | ADR-0012 "own package / config"; 4-line tsconfig stub, no config duplication |
| 2 | Workflow tier in `pnpm verify`? | yes, trailing `pnpm e2e`; `run.ts` self-skips in the CI `verify` job (keyed on `GITHUB_ACTIONS`) | ADR-0012 local-first parity without doubling the required check |
| 3 | CI runs Playwright from where | the runner, via the tailscale proxy to staging; **on-box container documented as the fallback** | browsers on the disposable runner keep the LXC lean; fallback removes the redesign risk if the proxy path fails |
| 4 | Deploy + smoke: one job or two | **two** — separate `e2e-staging` | the concurrency race that motivated combining doesn't exist (workflow-level `main` serialisation); separate wins on diagnostics + independent re-run |
| 5 | Browsers | Chromium only | smoke test; more is a per-need add |
| 6 | Local stack: rebuild every run? | reuse if healthy, own if absent, **abort if partial**; always `build` before `up` | a dev with `docker compose up` pays nothing; a debug stack is never torn down; stale-image false greens are impossible |
| 7 | Auth bypass now | no-op function seam; contract (incl. server-side row provisioning + the compose-anchor change) written for DAMN-1 | nothing is authed yet |
| 8 | Reporter | HTML | `blob` needs a merge step to open |
| 9 | Retries on the gate | `1` + `failOnFlakyTests` in CI | one retry absorbs a deploy-warmup blip; a retry-pass still reds the gate |

## Risks

- **Transport specifics** unverified until the draft-PR loop — but now enumerated
  (table) with a documented on-box fallback, so a failed loop is a pivot.
- **Playwright browser install in CI** adds ~30–45 s (`chromium --with-deps`).
  Off the required-check path. Cache lever if needed: `~/.cache/ms-playwright`
  keyed on the Playwright version.
- **Local `pnpm verify` now needs Docker + an image build** (cold: minutes on a
  4-core box). ADR-0012 accepts the heavier local gate; reuse-if-healthy mitigates
  for an active session; first-run cost documented in `e2e/README.md`. A dev who
  skips local e2e and merges a broken workflow test is caught at `e2e-staging`
  (pre-promote), which is the issue's actual bar.
- **SCAFFOLD assertions break at DAMN-2** when `app_meta` goes away — intentional,
  marked, and DAMN-2's own local `pnpm verify` forces the rewrite in that PR.
- **`workflow_dispatch` on `main` redeploys `:latest`** before smoking — semantics
  documented; DAMN-30's gate should re-verify against the immutable tag.
