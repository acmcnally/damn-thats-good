import type { ConfigResponse } from '@dtg/shared';
import { AuthKitProvider } from '@workos-inc/authkit-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root element not found in index.html');
}
const root = createRoot(container);

const LOADING = (
  <StrictMode>
    <main style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem' }}>
      <p>Loading…</p>
    </main>
  </StrictMode>
);
// Render immediately, synchronously — first paint shouldn't wait on the network. Only
// AuthKitProvider (needing config.workosClientId below) does.
root.render(LOADING);

/**
 * `GET /api/config` before `AuthKitProvider` mounts — it needs the WorkOS Client ID,
 * and that has to come from a runtime source (not a Vite build-time env var): the same
 * built image is promoted from staging to prod unchanged, so anything baked in at
 * build time would carry staging's value into prod. `redirectUri` needs no fetch at
 * all — `window.location.origin` is already correct in every environment, since it's
 * derived from wherever the code is actually executing.
 */
async function bootstrap(): Promise<void> {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`GET /api/config responded ${res.status}`);
  }
  const config = (await res.json()) as ConfigResponse;

  root.render(
    <StrictMode>
      <AuthKitProvider
        clientId={config.workosClientId}
        redirectUri={`${window.location.origin}/callback`}
      >
        <App />
      </AuthKitProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  console.error('bootstrap: failed to reach the API', error);
  root.render(
    <StrictMode>
      <main style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem' }}>
        <p role="alert">Couldn&apos;t reach the API — try reloading.</p>
      </main>
    </StrictMode>,
  );
});
