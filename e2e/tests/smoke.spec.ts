import { expect, test } from '@playwright/test';

import { loginAsTestUser } from '../support/auth';

test('serves the app, gets past auth, reaches the database, and renders the shell', async ({
  page,
  request,
}) => {
  await loginAsTestUser(page);

  // API health — unauthenticated by design (ADR-0010); includes a DB round-trip.
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'up' });

  await page.goto('/');

  // The persistent shell renders (DAMN-32): left nav rail + top-bar controls.
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

  // Auth chain (DAMN-1): the avatar-menu identity line is GET /api/me returning
  // the fixed e2e user — a full web → API → Postgres round trip through the
  // JIT-provisioned `users` row. Sign-out itself is not exercised here (under the
  // bypass cookie signOut() can't clear it, and it would fire a live WorkOS
  // logout) — Splash-on-sign-out is covered in the component tier.
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByText('e2e@example.test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Client-side routing: a nav click swaps the page and updates the URL.
  await page.getByRole('link', { name: 'Recipes' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();

  // Theming: toggle Dark → data-theme on <html> + a real repaint (guards the
  // :root vs .app selector trap), and it survives a reload (localStorage).
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // A real repaint, not just the attribute (guards the :root vs .app selector trap).
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(28, 20, 16)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Palette switch repaints live.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Theme').selectOption('plum');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'plum');
});
