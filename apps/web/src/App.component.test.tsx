import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const signIn = vi.fn();
const signOut = vi.fn();
let mockAuth: { isLoading: boolean; user: object | null };

vi.mock('@workos-inc/authkit-react', () => ({
  useAuth: () => ({ ...mockAuth, signIn, signOut }),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.clearAllMocks();
  document.cookie = 'e2e_bypass=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  window.history.replaceState({}, '', '/');
});
afterAll(() => server.close());

beforeEach(() => {
  mockAuth = { isLoading: false, user: null };
});

describe('<App>', () => {
  it('shows a loading state while AuthKit is still checking the session', () => {
    mockAuth = { isLoading: true, user: null };
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when loading has finished and there is no user', () => {
    mockAuth = { isLoading: false, user: null };
    render(<App />);
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('renders the Landing page once a user is present', async () => {
    mockAuth = { isLoading: false, user: { email: 'andrew@example.com' } };
    server.use(http.get('/api/me', () => HttpResponse.json({ id: 'u1', email: 'a@b.com' })));

    render(<App />);

    expect(signIn).not.toHaveBeenCalled();
    expect(await screen.findByText('a@b.com')).toBeInTheDocument();
  });

  it('/login always triggers signIn(), regardless of loading/user state', () => {
    window.history.replaceState({}, '', '/login');
    mockAuth = { isLoading: true, user: null };

    render(<App />);

    expect(signIn).toHaveBeenCalledOnce();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('the E2E bypass cookie skips the gate entirely, even while "loading" with no user', async () => {
    document.cookie = 'e2e_bypass=1';
    mockAuth = { isLoading: true, user: null };
    server.use(
      http.get('/api/me', () => HttpResponse.json({ id: 'e2e-1', email: 'e2e@example.test' })),
    );

    render(<App />);

    expect(signIn).not.toHaveBeenCalled();
    expect(await screen.findByText('e2e@example.test')).toBeInTheDocument();
  });
});
