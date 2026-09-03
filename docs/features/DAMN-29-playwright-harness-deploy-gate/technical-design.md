# DAMN-29 — Playwright harness + deploy gate: technical design

Status: draft for review · light-touch workflow (no UI surface; this doc stands
in for the UX phase). Adversarial design review + pre-PR diff review still run.

## Requirements (frozen — see the Linear issue)

1. Playwright set up as its **own package / config** — not in `verify:fast`
   (ADR-0012).
2. One Chromium **smoke test against staging**: the page loads, `GET /api/health`
   is 200, and data that made the web → API → Postgres round trip renders.
3. An **auth-bypass seam** for workflow tests — a no-op stub now; the real body
   lands with DAMN-1.
4. **Pipeline wiring**: after `deploy-staging` (DAMN-28) deploys to staging, the
   Playwright suite runs against staging. Green is required before the manual
   promote-to-prod step (built in DAMN-30).
5. `pnpm verify` runs the workflow tier locally too (ADR-0012 — local-first).

**Done when:** a merge to `main` deploys to staging and then runs the Playwright
smoke test against it; a red result blocks promotion.

**Narrowing (owner-approved, consistent with ADR-0012):** the PR `verify` job
does **not** run the workflow tier. ADR-0012 puts the workflow gate on the
*deploy*, not the PR ("A green PR is necessary but not sufficient"). The tier runs
in two places: locally via `pnpm verify`, and in CI via a new `e2e-staging` job
against the real staging deployment. The Linear text ("`pnpm verify` runs the
workflow tier locally too") already says *locally*; this just states the CI
`verify` job's behaviour explicitly.

## No UI surface

A test package, a CI job, and doc updates. Nothing renders.

## What gets added / changed

```
pnpm-workspace.yaml                 + 'e2e' in the packages list
e2e/package.json                    @dtg/e2e — @playwright/test, test + typecheck scripts
e2e/tsconfig.json                   4-line stub extending tsconfig.base.json
e2e/playwright.config.ts            projects (chromium), baseURL, proxy, reporters
e2e/run.ts                          wrapper: skip logic + local stack lifecycle + `playwright test`
e2e/tests/smoke.spec.ts             the one smoke test (SCAFFOLD — asserts the DAMN-26 surface)
e2e/support/auth.ts                 loginAsTestUser() no-op stub + the DAMN-1 contract
e2e/README.md                       how to run local / CI; the auth seam
package.json (root)                 "e2e" script; "verify" gains a trailing "pnpm e2e"
.github/workflows/ci.yml            new e2e-staging job (needs: deploy-staging)
.gitignore                          e2e/playwright-report, e2e/test-results, e2e/blob-report
docs/adr/0012-testing-strategy.md   "workflow tier realized in DAMN-29" note
CLAUDE.md / README.md               e2e run notes
```

No `SCAFFOLD(DAMN-29)` on the harness itself — it is permanent. The **smoke
test's assertions** are scaffold (they target the walking-skeleton surface) and
carry the marker.

## Harness layout — `@dtg/e2e` workspace package

`e2e/` is added to `pnpm-workspace.yaml`'s `packages` list explicitly (it is
neither an `app` nor a `packages/*` library). It carries the same per-package
boilerplate every workspace already has:

- **`e2e/package.json`** — `@playwright/test` (local dep, not a shared `catalog:`
  tool), `@types/node` + `typescript` from `catalog:`. Scripts: `test` (→
  `node ./run.ts`), `typecheck` (→ `tsc --noEmit`, picked up by the root
  `pnpm -r typecheck`).
- **`e2e/tsconfig.json`** — `{ "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] }, "include": ["tests", "support",
  "run.ts", "playwright.config.ts"] }`. Every real compiler setting stays in
  `tsconfig.base.json`; nothing to drift.

Lint (`eslint.config.ts` flat config) and Prettier already cover the whole tree —
no per-package config.

## Execution model

There are two runtime contexts and one script (`e2e/run.ts`) that dispatches
between them:

| Context | How it runs | Stack |
|---|---|---|
| **Local `pnpm verify` / `pnpm e2e`** | `run.ts` brings up the root `docker-compose.yml` stack (built images, migrations via the compose `migrate` service), runs `playwright test` against `http://127.0.0.1:8080`, tears the stack down. | Full container stack, built from the working tree. |
| **CI `e2e-staging` job** | `run.ts` sees `E2E_BASE_URL` set → skips all stack management, runs `playwright test` against staging through the tailnet proxy. | The real staging deployment (already up — `deploy-staging` ran first). |
| **CI `verify` job** | `run.ts` sees `CI=true` and no `E2E_BASE_URL` → logs a one-line "runs in e2e-staging" notice and exits 0. | none |

### `e2e/run.ts` logic

```
if (process.env.E2E_BASE_URL) {
  // CI-against-staging (or a dev pointing at any running instance)
  run('playwright', ['test']);           // inherits stdio; exit code propagates
  exit(code);
}
if (process.env.CI) {
  log('workflow tier runs in the e2e-staging job (against real staging) — skipping here');
  exit(0);
}
// Local full-tier path
const baseURL = 'http://127.0.0.1:8080';
const weStarted = !stackHealthy();                       // `docker compose ps` probe
if (weStarted) run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '180']);
try {
  run('playwright', ['test']);
} finally {
  if (weStarted && !process.env.E2E_KEEP) run('docker', ['compose', 'down']);
}
```

- **`stackHealthy()`** — `docker compose ps --format json` shows `postgres`,
  `api`, `web` all `running` and healthy. A dev who already has
  `docker compose up` going (or ran `pnpm e2e` with `E2E_KEEP=1`) pays no rebuild
  and keeps their stack. This is the `reuseExistingServer` idea, done in the
  wrapper because Playwright's own `webServer` teardown SIGKILLs a process group
  and would leave compose containers running.
- Stack `up` **builds** images from the working tree (root compose has `build:`)
  — local changes are never published, so we can't pull. Cold build ~1–2 min,
  layer-cached after. ADR-0012 accepts that `pnpm verify` is the heavier gate.
- `run.ts` is TypeScript run directly on Node 24 (`node ./run.ts`, type
  stripping) — same pattern as `deploy/compose.yaml`'s `node …/migrate.ts`.

### `e2e/playwright.config.ts`

```ts
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';
// tag:ci runners reach the tailnet only via tailscaled's local proxy
// (userspace networking — DAMN-28). Unset for local runs.
const proxy = process.env.E2E_PROXY ? { server: process.env.E2E_PROXY } : undefined;

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['blob']] : [['list']],
  use: { baseURL, proxy, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

No `webServer` block — `run.ts` owns the stack. Chromium only; more browsers are
a per-need addition, not a smoke-test cost.

### `e2e/tests/smoke.spec.ts` (SCAFFOLD assertions)

```ts
// SCAFFOLD(DAMN-29): asserts the DAMN-26 walking-skeleton surface — the seeded
// `app_meta` row rendered via GET /api/meta. DAMN-2 drops `app_meta` and
// regenerates the baseline; replace these with the real recipe surface then.
test('staging serves the app and reaches the database', async ({ page, request }) => {
  await loginAsTestUser(page);                       // no-op until DAMN-1

  const health = await request.get('/api/health');  // unauthenticated by design (ADR-0010)
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok', db: 'up' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Damn That's Good" })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: "Damn That's Good" })).toBeVisible();
});
```

That covers the issue's "assert `GET /api/health` and the rendered data": health
is the API + DB probe; the rendered `<dd>` is the browser-observed web → API →
Postgres round trip.

## Auth-bypass seam

`e2e/support/auth.ts` exports `loginAsTestUser(page): Promise<void>` — **a no-op
today**. Every surface the smoke test touches (`/`, `/api/health`, `/api/meta`)
is open, and no recipe view exists yet.

### DAMN-1 handoff (contract, not built here)

DAMN-1 fills `loginAsTestUser` in. The intended shape, for DAMN-1 to finalise:

- The API honours a **test-only credential** (a signed bearer or a fixed session
  cookie) **only** when an explicit opt-in env var is set on its process — e.g.
  `E2E_AUTH_BYPASS=1`. Set on the **local e2e** and **staging** stacks; never on
  prod.
- **`NODE_ENV` is not a safe discriminator** — `deploy/compose.yaml` is
  byte-identical for staging and prod and sets `NODE_ENV=production` on both. The
  guard must key on its own dedicated var (present in `deploy/.env` on staging,
  absent on prod), backed by a startup assert if DAMN-1 wants belt-and-braces.
- `loginAsTestUser(page)` seeds/reuses a known `users` row and attaches the
  credential to the Playwright `page` (cookie) so navigations are authed; a sibling
  helper returns headers for `request` calls.
- The staging `deploy/.env` gains that var as part of DAMN-1, documented in
  `deploy/README.md`.

Nothing in DAMN-29 plumbs a dead env var — the stub is just the function seam so
the smoke test and future specs call a stable entry point.

## CI wiring — `.github/workflows/ci.yml`

New job, after `deploy-staging`:

```yaml
  e2e-staging:
    needs: deploy-staging
    if: ${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') }}
    runs-on: ubuntu-latest
    environment: staging          # scopes TS_OAUTH_* + STAGING_URL; branch rule = main only
    permissions: {}
    concurrency:
      group: deploy-staging       # SAME group as deploy-staging (see "Concurrency")
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@…              # v7.0.1 (SHA-pinned, like the rest)
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
      - name: Playwright smoke against staging
        env:
          E2E_BASE_URL: ${{ vars.STAGING_URL }}
          E2E_PROXY: socks5://localhost:1055  # tailscaled userspace proxy — confirm on the draft PR
        run: pnpm e2e
      - uses: actions/upload-artifact@…       # v4 — the blob report, if: '!cancelled()'
        with: { name: playwright-report, path: e2e/blob-report/, retention-days: 7 }
```

- **`needs: deploy-staging`** — the suite runs against what `deploy-staging` just
  put on the box. `deploy.sh` already waits for healthy + retries `/api/health`,
  so staging is serving by the time this starts.
- **Not a required status check.** Like `deploy-staging`, it only runs
  post-merge on `main` (on a PR `github.ref` is `refs/pull/N/merge`). It surfaces
  as a red/green job on the `main` commit; DAMN-30's promote step reads it.
- **`environment: staging`** is required to reach `secrets.TS_OAUTH_*` and
  `vars.STAGING_URL`, and its branch rule is the backstop on the `if:`.
- **New Actions variable:** `STAGING_URL` (environment `staging`) =
  `https://<staging-host>.<tailnet>.ts.net` — the `tailscale serve` HTTPS URL.
  A **variable, not a secret** (same call as `STAGING_HOST` in DAMN-28); it is not
  in git. Owner adds it during setup.
- **Transport:** the runner uses userspace networking (DAMN-28), so plain
  `curl`/DNS to `*.ts.net` does not route — the tailscale action runs `tailscaled`
  with a local proxy. Chromium and Playwright's `request` context both honour
  `use.proxy`. The exact proxy (`socks5://localhost:1055` vs an HTTP proxy port)
  is confirmed on the draft-PR loop — DAMN-28 iterated its tailscale bits the same
  way. `tailscale serve` presents a real Let's Encrypt cert for the `ts.net` name,
  so no TLS-ignore.

### Concurrency

`deploy-staging` uses `concurrency: { group: deploy-staging,
cancel-in-progress: false }` so whole deploys serialise. `e2e-staging` joins the
**same group** so a deploy and a verify never overlap on the one staging box:

- Within a run: `needs: deploy-staging` already sequences them; sharing the group
  is a no-op there (no deadlock — they never want the slot simultaneously).
- Across runs (merge A then a fast merge B): run A's `e2e-staging` is queued for
  the group the moment run A starts, before run B's `deploy-staging` is queued.
  GitHub serves the group's queue roughly FIFO, so A-verify runs before B-deploy.

**Residual risk:** GitHub does not *document* strict FIFO for a `cancel-in-progress:
false` queue, so a pathological A/B interleave (B deploys while A verifies) is not
100% excluded. For a solo one-PR-at-a-time flow (already the assumption in DAMN-27)
this is acceptable. If it ever bites, the fix is to fold `e2e-staging` into the
`deploy-staging` job as trailing steps — one job, one slot, zero ambiguity — at
the cost of a combined red/green signal.

## `pnpm verify` change

```jsonc
"e2e":    "pnpm --filter @dtg/e2e test",
"verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e",
```

- Local `pnpm verify` now ends with the workflow tier against a real stack
  (ADR-0012 parity).
- CI `verify` job: `run.ts` self-skips (`CI=true`, no `E2E_BASE_URL`) — the
  required PR check stays fast and does not duplicate `build-images`' work.
- `pnpm -r typecheck` picks up `@dtg/e2e`; `pnpm -r build` skips it (no `build`
  script).

## Test plan

| What | How |
|---|---|
| harness runs locally, stack down | `docker compose down` first, then `pnpm e2e` → builds, boots, passes, tears down |
| running stack is reused | `docker compose up -d --wait` then `pnpm e2e` → no rebuild, stack left up |
| `pnpm verify` includes it locally | full `pnpm verify` green |
| CI `verify` self-skips | draft PR → `verify` job log shows the skip line, timing unchanged |
| `e2e-staging` green on `main` | first post-merge run — job green after `deploy-staging` |
| red e2e is visible on `main` | `workflow_dispatch` on the branch with a deliberately broken assertion → `e2e-staging` red; fix before merge |
| tailnet proxy wiring | draft-PR loop (DAMN-28 precedent) |
| report artifact | download it from the run, open the blob report |
| `playwright typecheck` in the fan-out | `pnpm -r typecheck` green |

## Open decisions — resolved

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Harness location | `e2e/` explicit workspace package (`@dtg/e2e`) | ADR-0012 "own package / config"; keeps `@playwright/test` out of other workspaces; 4-line tsconfig stub, no config duplication |
| 2 | Workflow tier in `pnpm verify`? | yes, trailing `pnpm e2e`; `run.ts` self-skips in the CI `verify` job | ADR-0012 local-first parity, without doubling the required check or rebuilding the stack CI already builds |
| 3 | CI runs Playwright from where | the runner, via the tailscale proxy to staging | browsers stay on the disposable runner; the LXC stays lean (no Chromium + libs on a 1 GB box) |
| 4 | Deploy + verify: one job or two | two jobs, shared concurrency group | clean separate signals for DAMN-30's gate; group-sharing serialises them on the one box |
| 5 | Browsers | Chromium only | smoke test; more is a per-need add |
| 6 | Local stack: rebuild every run? | reuse if already healthy (`run.ts` probe) | a dev with `docker compose up` running pays nothing; fresh clone still gets a full stand-up |
| 7 | Auth bypass now | no-op function seam; contract written for DAMN-1 | nothing is authed yet; no dead env plumbing |

## Risks

- **Tailscale proxy specifics** (SOCKS5 vs HTTP, port) unverified until the
  draft-PR loop. Mitigated by DAMN-28 precedent — the same iterate-in-CI approach.
- **Playwright browser install in CI** adds ~30–45 s (`chromium --with-deps`).
  Off the required-check path; acceptable. Cache lever if it ever matters:
  `~/.cache/ms-playwright` keyed on the Playwright version.
- **Cross-run deploy/verify ordering** — see § Concurrency. Accepted; fold-to-one-job
  is the fallback.
- **SCAFFOLD assertions break at DAMN-2** when `app_meta` goes away. Intentional
  and marked; DAMN-2 already regenerates the baseline and owns that update.
- **Local `pnpm verify` now needs Docker + an image build.** ADR-0012 accepts the
  heavier local gate; `reuseExistingServer` mitigates for an active session. A dev
  who skips local e2e and merges a broken workflow test is caught at the
  `e2e-staging` gate (pre-promote), not pre-merge — which is exactly the issue's
  "a red result blocks promotion".
