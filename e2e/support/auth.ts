import { E2E_BYPASS_COOKIE } from '@dtg/shared';
import type { Page } from '@playwright/test';

/**
 * DAMN-1 E2E auth-bypass seam for the workflow tier.
 *
 * Real contract (see technical-design.md's "E2E auth bypass" section for the full
 * reasoning): the API honours a fixed test credential only when `E2E_AUTH_BYPASS=1` is
 * set on its own process — never client-supplied data, never set on prod. This helper
 * only attaches the credential (a cookie) to `page`; it carries zero trust on its own.
 *
 * Set before any navigation — the cookie is same-origin, so it rides along
 * automatically on every subsequent `/api/*` fetch the SPA makes, and the frontend's
 * own auth gate checks for it to skip the real "redirect to AuthKit" flow (there's no
 * headless way to complete a real email-OTP round trip in CI).
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';
  await page.context().addCookies([{ name: E2E_BYPASS_COOKIE, value: '1', url: baseUrl }]);
}
