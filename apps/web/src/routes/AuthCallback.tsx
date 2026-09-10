/**
 * `/callback` — the hosted-AuthKit redirect target. Deliberately inert: it
 * renders a spinner and **never navigates**. `AuthKitProvider` reads the
 * `?code=…` from the URL and, once the exchange completes, its
 * `onRedirectCallback` (wired to `router.navigate` in main.tsx) moves on.
 *
 * Why an explicit route: with a data router, `*` would otherwise match
 * `/callback` and its `<Navigate to="/">` would fire on mount — replacing the
 * URL and dropping `?code=…` before the SDK reads it, so sign-in intermittently
 * bounces back to Splash. Under the E2E bypass there is no real exchange, so
 * redirect straight to `/`.
 */

import { BypassRedirect, hasE2eBypassCookie } from '../auth/bypass';
import styles from './fullscreen.module.css';

export function AuthCallback() {
  if (hasE2eBypassCookie()) {
    return <BypassRedirect />;
  }
  return (
    <div className={styles.screen}>
      <div className={styles.centered}>
        <span className={styles.spinner} aria-hidden="true" />
        <span>Signing you in&hellip;</span>
      </div>
    </div>
  );
}
