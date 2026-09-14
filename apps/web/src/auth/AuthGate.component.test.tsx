import { cleanup, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderRoute } from '../test/renderRoute';

const signIn = vi.fn();
const signOut = vi.fn();
const getAccessToken = vi.fn().mockResolvedValue('test-token');
let mockAuth: { isLoading: boolean; user: object | null };

vi.mock('@workos-inc/authkit-react', () => ({
  useAuth: () => ({ ...mockAuth, signIn, signOut, getAccessToken }),
}));

const server = setupServer(
  http.get('/api/me', () => HttpResponse.json({ id: 'u1', email: 'a@b.com' })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.clearAllMocks();
  document.cookie = 'e2e_bypass=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  localStorage.clear();
});
afterAll(() => server.close());

beforeEach(() => {
  mockAuth = { isLoading: false, user: null };
});

describe('<AuthGate>', () => {
  it('shows a loading state while AuthKit is still checking the session', () => {
    mockAuth = { isLoading: true, user: null };
    renderRoute({ initialEntries: ['/'] });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('renders Splash (not signIn) for a logged-out visitor on /', () => {
    renderRoute({ initialEntries: ['/'] });
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /damn that.s good/i })).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('redirects a logged-out visitor on a deep route straight to signIn()', () => {
    renderRoute({ initialEntries: ['/recipes'] });
    expect(signIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('renders the shell once a user is present', async () => {
    mockAuth = { isLoading: false, user: { email: 'andrew@example.com' } };
    renderRoute({ initialEntries: ['/'] });
    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /recipes/i })).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('/login always triggers signIn(), regardless of loading/user state', () => {
    mockAuth = { isLoading: true, user: null };
    renderRoute({ initialEntries: ['/login'] });
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('the E2E bypass cookie renders the shell even while loading with no user', async () => {
    document.cookie = 'e2e_bypass=1';
    mockAuth = { isLoading: true, user: null };
    renderRoute({ initialEntries: ['/'] });
    expect(await screen.findByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('/callback', () => {
  it('renders an inert spinner while the exchange is in flight — no Splash, no navigation away', async () => {
    mockAuth = { isLoading: true, user: null };
    renderRoute({ initialEntries: ['/callback?code=abc'] });
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
    // Give any errant mount-effect navigation a chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('shows a retry link if the exchange settles with no user (a failed code exchange)', () => {
    mockAuth = { isLoading: false, user: null };
    renderRoute({ initialEntries: ['/callback?code=abc'] });
    expect(screen.getByText(/didn.t go through/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/signing you in/i)).not.toBeInTheDocument();
  });

  it('redirects to / under the E2E bypass', async () => {
    document.cookie = 'e2e_bypass=1';
    renderRoute({ initialEntries: ['/callback?code=abc'] });
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/signing you in/i)).not.toBeInTheDocument();
  });
});
