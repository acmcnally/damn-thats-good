import './styles/tokens.css';
import './styles/base.css';

import type { ConfigResponse } from '@dtg/shared';
import { AuthKitProvider } from '@workos-inc/authkit-react';
import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { AppearanceProvider } from './appearance/AppearanceProvider';
import { router } from './router';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root element not found in index.html');
}
const root = createRoot(container);

function Shell({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <div style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem' }}>{children}</div>
    </StrictMode>
  );
}

// First paint shouldn't wait on the network. Only AuthKitProvider (which needs
// config.workosClientId) does.
root.render(<Shell>Loading…</Shell>);

/**
 * `state` round-trips through the OAuth redirect as untrusted URL input (the SDK
 * cannot validate it). DAMN-32 never sets `state.returnTo`, so this resolves to
 * `/` in practice — the origin check is defensive, and the seam for a later
 * deep-link-preserving flow.
 */
function handleRedirectCallback({ state }: { state?: Record<string, unknown> | null }): void {
  let target = '/';
  const returnTo = state && typeof state.returnTo === 'string' ? state.returnTo : null;
  if (returnTo) {
    try {
      const url = new URL(returnTo, window.location.origin);
      if (url.origin === window.location.origin) {
        target = url.pathname + url.search + url.hash;
      }
    } catch {
      // malformed — fall through to '/'
    }
  }
  void router.navigate(target, { replace: true });
}

/**
 * `GET /api/config` before `AuthKitProvider` mounts — it needs the WorkOS Client
 * ID from a runtime source (not a Vite build-time env var): the same built image
 * is promoted staging → prod unchanged. `redirectUri` needs no fetch —
 * `window.location.origin` is already correct wherever the code runs.
 */
async function bootstrap(): Promise<void> {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`GET /api/config responded ${res.status}`);
  }
  const config = (await res.json()) as ConfigResponse;

  root.render(
    <StrictMode>
      <AppearanceProvider>
        <AuthKitProvider
          clientId={config.workosClientId}
          redirectUri={`${window.location.origin}/callback`}
          onRedirectCallback={handleRedirectCallback}
        >
          <RouterProvider router={router} />
        </AuthKitProvider>
      </AppearanceProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  console.error('bootstrap: failed to reach the API', error);
  root.render(
    <Shell>
      <p role="alert">Couldn&apos;t reach the API — try reloading.</p>
    </Shell>,
  );
});
