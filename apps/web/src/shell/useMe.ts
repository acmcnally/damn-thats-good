/**
 * `useMe` — fetches `GET /api/me` (DAMN-1) for the signed-in identity line shown
 * in the avatar menu and the Profile placeholder. On error it resolves to
 * `status: 'error'` and callers stay silent (no error UI in a menu) — the avatar
 * and the Profile / Sign out actions work regardless.
 */

import type { MeResponse } from '@dtg/shared';
import { useEffect, useState } from 'react';

import { apiFetch } from '../apiClient';

export type MeState =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: MeResponse };

export function useMe(getAccessToken: () => Promise<string>): MeState {
  const [state, setState] = useState<MeState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/me', getAccessToken, { signal: controller.signal })
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
  }, [getAccessToken]);

  return state;
}
