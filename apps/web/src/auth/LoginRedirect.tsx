/**
 * `/login` — the registered Initiate Login URI (WorkOS requires one for
 * provider-initiated flows like admin impersonation; it's also where
 * `apiClient.ts` sends a stray 401). Kicks off the hosted AuthKit flow on mount
 * (as a side effect, not during render, so dev-mode double-render doesn't fire
 * it twice). Under the E2E bypass there is no real flow — redirect to `/`.
 */

import { useAuth } from '@workos-inc/authkit-react';
import { useEffect } from 'react';

import styles from '../routes/fullscreen.module.css';
import { BypassRedirect, hasE2eBypassCookie } from './bypass';

export function LoginRedirect() {
  const { signIn } = useAuth();
  const bypass = hasE2eBypassCookie();

  useEffect(() => {
    if (bypass) return;
    signIn();
  }, [bypass, signIn]);

  if (bypass) {
    return <BypassRedirect />;
  }
  return (
    <div className={styles.screen}>
      <div className={styles.centered}>
        <span className={styles.spinner} aria-hidden="true" />
        <span>Redirecting to sign in&hellip;</span>
      </div>
    </div>
  );
}
