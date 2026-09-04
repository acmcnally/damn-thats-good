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
 * `/login` — WorkOS's dashboard requires a registered Initiate Login URI that calls
 * `signIn()` (WorkOS-initiated flows: admin impersonation, shared links — not the
 * everyday path, but AuthKit expects the route to exist). No router: a plain pathname
 * check is proportionate for two auth-only paths (see technical-design.md).
 */
function LoginPage() {
  const { signIn } = useAuth();
  useEffect(() => {
    signIn();
  }, [signIn]);
  return LOADING;
}

/** Not authenticated (and not the E2E bypass) — trigger the redirect to hosted AuthKit
 * as a side effect, not during render, so React's dev-mode double-render doesn't fire
 * it twice. */
function SignInRedirect() {
  const { signIn } = useAuth();
  useEffect(() => {
    signIn();
  }, [signIn]);
  return LOADING;
}

/**
 * The whole SPA sits behind this gate — no public routes except the AuthKit flow
 * itself (`/login`, and `/callback`, which `AuthKitProvider`'s own redirect handling
 * intercepts before any route component sees it). The E2E bypass cookie skips the
 * gate entirely; the server independently enforces the real invariant on every `/api/*`
 * call regardless (see technical-design.md).
 */
export function App() {
  const { isLoading, user, signOut } = useAuth();

  if (window.location.pathname === '/login') {
    return <LoginPage />;
  }

  if (hasE2eBypassCookie()) {
    return <Landing onSignOut={signOut} />;
  }

  if (isLoading) {
    return LOADING;
  }

  if (!user) {
    return <SignInRedirect />;
  }

  return <Landing onSignOut={signOut} />;
}
