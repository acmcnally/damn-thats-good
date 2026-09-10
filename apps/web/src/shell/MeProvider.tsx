/**
 * MeProvider — fetches `GET /api/me` (DAMN-1) exactly once for the whole authed
 * session and shares it. Mounted in `AppShell` (persistent), so the avatar-menu
 * identity line and the Profile placeholder read the same request rather than
 * each firing their own.
 *
 * On error it resolves to `status: 'error'` and consumers stay silent (no error
 * UI in a menu) — the avatar and the Profile / Sign out actions work regardless.
 */

import type { MeResponse } from '@dtg/shared';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../apiClient';

export type MeState =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: MeResponse };

const MeContext = createContext<MeState | null>(null);

interface MeProviderProps {
  getAccessToken: () => Promise<string>;
  children: ReactNode;
}

export function MeProvider({ getAccessToken, children }: MeProviderProps) {
  const [state, setState] = useState<MeState>({ status: 'loading' });

  // `/api/me` (id + email) is stable for the session — fetch it exactly once on
  // mount. `getAccessToken`'s identity changes (AuthKit swaps it in once the
  // client initializes; a re-render can hand a fresh reference) must not
  // re-trigger it, so read it through a ref rather than an effect dep.
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/me', () => getAccessTokenRef.current(), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/me responded ${res.status}`);
        const data = (await res.json()) as MeResponse;
        setState({ status: 'ok', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      });
    return () => controller.abort();
  }, []);

  return <MeContext.Provider value={state}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error('useMe must be used within a <MeProvider>');
  }
  return ctx;
}
