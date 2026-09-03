import type { Page } from '@playwright/test';

/**
 * SCAFFOLD(DAMN-29) — auth-bypass seam for the workflow tier.
 *
 * Today: a no-op. Nothing the smoke test touches (`/`, `/api/health`,
 * `/api/meta`) is authenticated, and no recipe view exists yet.
 *
 * DAMN-1 fills this in. Intended contract (finalise there):
 *
 *  - The API honours a test-only credential ONLY when a dedicated env var is set
 *    on its process (e.g. `E2E_AUTH_BYPASS=1`). Set on the local e2e stack and on
 *    staging; NEVER on prod. `NODE_ENV` cannot be the discriminator —
 *    `deploy/compose.yaml` is byte-identical for staging and prod and sets
 *    `NODE_ENV=production` on both.
 *  - The test `users` row is provisioned server-side when the bypass is on (the
 *    `e2e-staging` run executes on the CI runner, which has no Postgres path to
 *    staging). This helper only attaches the credential (a cookie) to `page`; a
 *    sibling helper returns headers for `request` calls.
 *  - `deploy/compose.yaml` gains `E2E_AUTH_BYPASS: ${E2E_AUTH_BYPASS:-}` in the
 *    `x-app-env` anchor; `e2e/run.ts` passes `E2E_AUTH_BYPASS=1` into the local
 *    stack's `api` service.
 */
export function loginAsTestUser(_page: Page): Promise<void> {
  // no-op until DAMN-1
  return Promise.resolve();
}
