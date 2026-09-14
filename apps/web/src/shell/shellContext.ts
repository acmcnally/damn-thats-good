/**
 * Context handed from `AuthGate` down through `<Outlet />` to the shell and the
 * routed pages — the two `useAuth()`-derived callbacks components need, passed as
 * values rather than read from the hook directly so the shell stays testable
 * without an `<AuthKitProvider>`.
 */

import { useOutletContext } from 'react-router';

export interface ShellContext {
  /** AuthKit `signOut` (or, under the E2E bypass, a no-op-ish stand-in). */
  signOut: () => void;
  /** Bearer-token source for `apiFetch`. Resolves `''` under the E2E bypass. */
  getAccessToken: () => Promise<string>;
}

export function useShellContext(): ShellContext {
  return useOutletContext<ShellContext>();
}
