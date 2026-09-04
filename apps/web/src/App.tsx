import { useAuth } from '@workos-inc/authkit-react';
import { useEffect } from 'react';

import { hasE2eBypassCookie } from './e2eBypass';
import { Landing } from './Landing';

const LOADING = (
  <main style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem' }}>
    <p>Loading…</p>
  </main>
);

/**
 * Triggers the redirect to hosted AuthKit as a side effect, not during render, so
 * React's dev-mode double-render doesn't fire it twice. One component used at both call
 * sites below (`/login`, and the default not-authenticated case) — they're the same
 * "go sign in" action, just reached two different ways.
 */
function SignInRedirect() {
  const { signIn } = useAuth();
  useEffect(() => {
    signIn();
  }, [signIn]);
  return LOADING;
}

/**
 * The whole SPA sits behind this gate — no public routes except the AuthKit flow
 * itself (`/login` — WorkOS's dashboard requires a registered Initiate Login URI that
 * calls `signIn()` for WorkOS-initiated flows like admin impersonation, not our
 * everyday path — and `/callback`, which `AuthKitProvider`'s own redirect handling
 * intercepts before any route component sees it). No router: a plain pathname check is
 * proportionate for one auth-only path. The E2E bypass cookie skips the gate entirely;
 * the server independently enforces the real invariant on every `/api/*` call
 * regardless (see technical-design.md).
 */
export function App() {
  const { isLoading, user, signOut } = useAuth();

  if (hasE2eBypassCookie()) {
    return <Landing onSignOut={signOut} />;
  }

  if (window.location.pathname === '/login') {
    return <SignInRedirect />;
  }

  if (isLoading) {
    return LOADING;
  }

  if (!user) {
    return <SignInRedirect />;
  }

  return <Landing onSignOut={signOut} />;
}
