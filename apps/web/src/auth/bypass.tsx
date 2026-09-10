import { E2E_BYPASS_COOKIE } from '@dtg/shared';
import { Navigate } from 'react-router';

/**
 * DAMN-1 E2E auth bypass — `loginAsTestUser` (e2e/support/auth.ts) sets this
 * cookie on the browser context before navigation. Present ⇒ skip the "redirect
 * to AuthKit" gate and render the app directly (there's no headless way to
 * complete a real email-OTP round trip in CI). Same-origin, so it also rides
 * along automatically on every `/api/*` fetch — the server enforces the actual
 * invariant (`E2E_AUTH_BYPASS=1` on its own process is the sole authority; this
 * cookie alone grants nothing); see technical-design.md.
 *
 * Every client entry point that can trigger an auth check must consult this
 * first: `AuthGate` (the shell), `LoginRedirect` (`/login`), and `AuthCallback`
 * (`/callback`) — the last two live outside `AuthGate` and each acts on mount,
 * so without the guard a stray 401 → `/login` under the bypass would fire a real
 * WorkOS flow instead of rendering the app.
 */
export function hasE2eBypassCookie(): boolean {
  return document.cookie.split('; ').includes(`${E2E_BYPASS_COOKIE}=1`);
}

/** Under the bypass, send every auth entry point to `/` (→ the shell). */
export function BypassRedirect() {
  return <Navigate to="/" replace />;
}
