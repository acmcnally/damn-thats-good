import type { MeResponse } from '@dtg/shared';
import { useEffect, useState } from 'react';

import { apiFetch } from './apiClient';

type Fetch =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: MeResponse };

async function fetchMe(signal: AbortSignal): Promise<MeResponse> {
  const res = await apiFetch('/api/me', { signal });
  if (!res.ok) {
    throw new Error(`API responded ${res.status}`);
  }
  return (await res.json()) as MeResponse;
}

interface LandingProps {
  /** Not read from `useAuth()` directly so this stays testable without an
   * `AuthKitProvider` — the caller (`App`) wires it from the hook. */
  onSignOut: () => void;
}

/**
 * DAMN-1's minimal authenticated landing — deliberately bare scaffolding, replaced by
 * the real recipe surface in DAMN-2. Proves the auth round trip: `GET /api/me` only
 * succeeds behind the guard, so rendering the email here confirms the whole chain
 * (AuthKit → JWT → guard → JIT-provisioned `users` row) actually worked.
 */
export function Landing({ onSignOut }: LandingProps) {
  const [state, setState] = useState<Fetch>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal)
      .then((data) => setState({ status: 'ok', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    return () => controller.abort();
  }, []);

  return (
    <main style={{ maxWidth: '32rem', margin: '4rem auto', padding: '0 1rem', lineHeight: 1.5 }}>
      <h1>Damn That&apos;s Good</h1>

      {state.status === 'loading' && <p>Loading…</p>}

      {state.status === 'error' && <p role="alert">Couldn&apos;t reach the API: {state.message}</p>}

      {state.status === 'ok' && (
        <>
          <p>
            Signed in as <strong>{state.data.email}</strong>.
          </p>
          <button type="button" onClick={onSignOut}>
            Sign out
          </button>
        </>
      )}
    </main>
  );
}
