import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Landing } from './Landing';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  // RTL's auto-cleanup registers against a global `afterEach` this project's explicit
  // (non-`globals`) vitest config doesn't expose — without this, each `it()`'s render
  // stacks on top of the previous one's leftover DOM instead of replacing it.
  cleanup();
});
afterAll(() => server.close());

describe('<Landing>', () => {
  it('renders the signed-in email from GET /api/me', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json({ id: 'u1', email: 'andrew@example.com' })),
    );

    render(<Landing onSignOut={vi.fn()} />);

    expect(await screen.findByText('andrew@example.com')).toBeInTheDocument();
  });

  it('shows the error state when the API call fails', async () => {
    server.use(http.get('/api/me', () => new HttpResponse(null, { status: 500 })));

    render(<Landing onSignOut={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t reach the api/i);
  });

  it('calls onSignOut when the sign-out button is clicked', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json({ id: 'u1', email: 'a@b.com' })));
    const onSignOut = vi.fn();

    render(<Landing onSignOut={onSignOut} />);
    fireEvent.click(await screen.findByRole('button', { name: /sign out/i }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  // The apiFetch wrapper's 401 → navigate-to-/login behaviour isn't exercised here
  // (jsdom's window.location.assign isn't meaningfully testable, and navigation would
  // tear the test down anyway) — it's covered by the Playwright workflow tier instead.
});
