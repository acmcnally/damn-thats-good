import { expect, test } from '@playwright/test';

import { loginAsTestUser } from '../support/auth';

test('serves the app, gets past auth, and reaches the database', async ({ page, request }) => {
  await loginAsTestUser(page);

  // API health — unauthenticated by design (ADR-0010); includes a DB round-trip.
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'up' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Damn That's Good" })).toBeVisible();
  // Confirms the whole auth chain (DAMN-1): the bypass cookie got past the guard,
  // GET /api/me returned the fixed e2e user, and it rendered — a full
  // web → API → Postgres round trip through the JIT-provisioned `users` row.
  await expect(page.getByText('e2e@example.test')).toBeVisible();
});
