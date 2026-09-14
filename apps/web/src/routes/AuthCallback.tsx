/**
 * `/callback` — the hosted-AuthKit redirect target. Renders a spinner while
 * `AuthKitProvider` exchanges the `?code=…` for a session; once that
 * completes, its `onRedirectCallback` (wired to `router.navigate` in
 * main.tsx) moves the user on.
 *
 * If the exchange fails instead — a network/CORS error, or a stale/missing
 * PKCE code_verifier (e.g. mobile Chrome discarding sessionStorage while the
 * tab was backgrounded to read an OTP email) — the SDK never calls
 * onRedirectCallback and exposes no public error signal; it only
 * console.errors internally. `isLoading` settling to `false` with no `user`
 * is the only externally-observable sign a failed exchange happened, so
 * that's what triggers the fallback below instead of spinning forever with
 * no feedback.
 *
 * Why an explicit route: with a data router, `*` would otherwise match
 * `/callback` and its `<Navigate to="/">` would fire on mount — replacing the
 * URL and dropping `?code=…` before the SDK reads it, so sign-in intermittently
 * bounces back to Splash. Under the E2E bypass there is no real exchange, so
 * redirect straight to `/`.
 */

import { useAuth } from '@workos-inc/authkit-react';
import { Link } from 'react-router';

import { BypassRedirect, hasE2eBypassCookie } from '../auth/bypass';
import styles from './fullscreen.module.css';

export function AuthCallback() {
  const { isLoading, user } = useAuth();

  if (hasE2eBypassCookie()) {
    return <BypassRedirect />;
  }

  if (!isLoading && !user) {
    return (
      <div className={styles.screen}>
        <div className={styles.centered}>
          <span>Sign-in didn&rsquo;t go through.</span>
          <Link to="/">Try again</Link>
        </div>
      </div>
    );
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
