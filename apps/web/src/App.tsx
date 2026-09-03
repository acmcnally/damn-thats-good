import type { MetaResponse } from '@dtg/shared';
import { useEffect, useState } from 'react';

type Fetch =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: MetaResponse };

async function fetchMeta(signal: AbortSignal): Promise<MetaResponse> {
  const res = await fetch('/api/meta', { signal });
  if (!res.ok) {
    throw new Error(`API responded ${res.status}`);
  }
  return (await res.json()) as MetaResponse;
}

export function App() {
  const [state, setState] = useState<Fetch>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchMeta(controller.signal)
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
      <p>Walking skeleton — this value made the round trip web → API → Postgres → back:</p>

      {state.status === 'loading' && <p>Loading…</p>}

      {state.status === 'error' && <p role="alert">Couldn&apos;t reach the API: {state.message}</p>}

      {state.status === 'ok' && (
        <dl>
          <dt>name</dt>
          <dd>{state.data.name}</dd>
          <dt>seeded at</dt>
          <dd>
            <time dateTime={state.data.seededAt}>
              {new Date(state.data.seededAt).toLocaleString()}
            </time>
          </dd>
        </dl>
      )}
    </main>
  );
}
