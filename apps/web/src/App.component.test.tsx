import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { App } from './App';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('<App>', () => {
  it('renders the values returned by GET /api/meta', async () => {
    server.use(
      http.get('/api/meta', () =>
        HttpResponse.json({ name: 'Test Kitchen', seededAt: '2026-01-01T00:00:00.000Z' }),
      ),
    );

    render(<App />);

    expect(await screen.findByText('Test Kitchen')).toBeInTheDocument();
  });

  it('shows the error state when the API call fails', async () => {
    server.use(http.get('/api/meta', () => new HttpResponse(null, { status: 500 })));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t reach the api/i);
  });
});
