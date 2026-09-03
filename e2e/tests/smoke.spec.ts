import { expect, test } from '@playwright/test';

import { loginAsTestUser } from '../support/auth';

/*
 * SCAFFOLD(DAMN-29): these assertions target the DAMN-26 walking-skeleton surface
 * — the seeded `app_meta` row rendered via GET /api/meta. DAMN-2 drops `app_meta`
 * and regenerates the baseline migration; replace them with the real recipe
 * surface then. The harness itself (playwright.config.ts, run.ts, this file's
 * shape) is permanent.
 */
test('serves the app and reaches the database', async ({ page, request }) => {
  await loginAsTestUser(page); // no-op until DAMN-1

  // API health — unauthenticated by design (ADR-0010); includes a DB round-trip.
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'up' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Damn That's Good" })).toBeVisible();
  // The <time> element only renders when GET /api/meta returned the seeded row —
  // i.e. the full web → API → Postgres → back round trip succeeded.
  await expect(page.locator('dd time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
});
