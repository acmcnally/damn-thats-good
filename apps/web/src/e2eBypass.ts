import { E2E_BYPASS_COOKIE } from '@dtg/shared';

/**
 * DAMN-1 E2E auth bypass — `loginAsTestUser` (e2e/support/auth.ts) sets this cookie on
 * the browser context before navigation. Present ⇒ skip the "redirect to AuthKit" gate
 * and render the app directly (there's no headless way to complete a real email-OTP
 * round trip in CI). Same-origin, so it also rides along automatically on every
 * `/api/*` fetch — the server enforces the actual invariant (env var is the sole
 * authority, this cookie alone grants nothing); see technical-design.md.
 */
export function hasE2eBypassCookie(): boolean {
  return document.cookie.split('; ').includes(`${E2E_BYPASS_COOKIE}=1`);
}
