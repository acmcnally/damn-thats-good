/**
 * AuthGate — the layout route the whole authenticated SPA sits behind. Renders
 * `<Outlet />` (with the shell context) only for a signed-in session; otherwise
 * shows Splash on `/` or kicks off the hosted AuthKit flow anywhere else.
 *
 * The server independently enforces the real invariant on every `/api/*` call
 * (see jwt-auth.guard.ts) — this gate is UX, not a security boundary.
 */

import { useAuth } from '@workos-inc/authkit-react';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';

import fullscreen from '../routes/fullscreen.module.css';
import { Splash } from '../routes/Splash';
import type { ShellContext } from '../shell/shellContext';
import { hasE2eBypassCookie } from './bypass';

function Loader({ label }: { label: string }) {
  return (
    <div className={fullscreen.screen}>
      <div className={fullscreen.centered}>
        <span className={fullscreen.spinner} aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Trigger sign-in as an effect (not during render, so dev double-render is safe). */
function SignInRedirect({ signIn }: { signIn: () => void }) {
  useEffect(() => {
    signIn();
  }, [signIn]);
  return <Loader label="Redirecting to sign in…" />;
}

/**
 * No real WorkOS session exists under the E2E bypass, so the real
 * `getAccessToken` would reject — the server-side bypass ignores the header
 * entirely, so any value is fine.
 */
const NO_ACCESS_TOKEN = () => Promise.resolve('');

export function AuthGate() {
  const { isLoading, user, signIn, signOut, getAccessToken } = useAuth();
  const { pathname } = useLocation();

  if (hasE2eBypassCookie()) {
    const context: ShellContext = { signOut, getAccessToken: NO_ACCESS_TOKEN };
    return <Outlet context={context} />;
  }

  if (isLoading) {
    return <Loader label="Loading…" />;
  }

  if (!user) {
    return pathname === '/' ? <Splash onLogIn={signIn} /> : <SignInRedirect signIn={signIn} />;
  }

  const context: ShellContext = { signOut, getAccessToken };
  return <Outlet context={context} />;
}
