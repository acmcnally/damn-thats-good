# `@dtg/e2e` — workflow (E2E) test tier

Playwright. The ADR-0012 "workflow" tier: a deliberately small set of critical
end-to-end paths. Today it is one Chromium smoke test; it grows per feature.

**Always run it via `pnpm e2e`** (from the repo root), never `playwright test`
directly — `run.ts` decides whether to stand up a stack, point at staging, or
skip.

## Running it

| Command | What happens |
|---|---|
| `pnpm e2e` | If no `dtg` compose stack is running, builds the images, starts the root `docker-compose.yml` stack, runs the suite against it, tears it down. If a healthy stack is already up, reuses it and leaves it up. |
| `pnpm verify` | Runs `pnpm e2e` as its last step. |
| `E2E_KEEP=1 pnpm e2e` | Keep the stack up afterwards (for iterating). |
| `E2E_BASE_URL=https://… pnpm e2e` | Skip all stack management, run against that URL. |

**First run is slow** — a cold multi-stage `api` + `web` image build on a
modest box is minutes, not seconds. Subsequent runs are layer-cached. Keeping a
stack up (`E2E_KEEP=1`, or your own `docker compose up`) skips the build entirely.

On failure the stack is left running so you can open
`e2e/playwright-report/index.html` and read container logs; `docker compose down`
when done.

Browsers download automatically on `pnpm install` (Playwright's postinstall);
`run.ts` also runs `playwright install chromium` defensively before each local
run.

## CI

- The `verify` job runs `pnpm verify`, in which `run.ts` **self-skips** this tier
  (`GITHUB_ACTIONS` set, no `E2E_BASE_URL`).
- The `e2e-staging` job (`.github/workflows/ci.yml`, `needs: deploy-staging`,
  `main` only) runs the suite against the real staging deployment through the
  tailnet. Its result is the per-commit gate DAMN-30's promote step reads.

## Layout

```
run.ts               entry point — mode dispatch + local stack lifecycle
run.test.ts          unit tests for the pure bits (runs in `pnpm test`)
playwright.config.ts  chromium project, baseURL/proxy from env
tests/smoke.spec.ts   the smoke test (SCAFFOLD assertions — see the file header)
support/auth.ts       loginAsTestUser() — no-op seam until DAMN-1
```

## Auth

`support/auth.ts`'s `loginAsTestUser()` is a no-op until DAMN-1 adds
authentication. The intended real mechanism (a test-only credential gated on a
dedicated env var — not `NODE_ENV`) is documented in that file and in
`docs/features/DAMN-29-playwright-harness-deploy-gate/technical-design.md`.
