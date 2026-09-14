import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderRoute } from '../test/renderRoute';

const signOut = vi.fn();

vi.mock('@workos-inc/authkit-react', () => ({
  useAuth: () => ({
    isLoading: false,
    user: { email: 'andrew@example.com' },
    signIn: vi.fn(),
    signOut,
    getAccessToken: vi.fn().mockResolvedValue('t'),
  }),
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});
afterAll(() => server.close());

const okMe = () =>
  http.get('/api/me', () => HttpResponse.json({ id: 'u1', email: 'andrew@example.com' }));

const avatarButton = () => screen.getByRole('button', { name: /account/i });
const avatarMenu = () => screen.queryByRole('group', { name: /account/i });

describe('<AvatarMenu>', () => {
  it('opens on click and shows the Sign out action', async () => {
    server.use(okMe());
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });

    expect(avatarMenu()).not.toBeInTheDocument();
    fireEvent.click(avatarButton());
    expect(avatarMenu()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('shows a skeleton while GET /api/me is pending, then the email', async () => {
    server.use(
      http.get('/api/me', async () => {
        await delay(40);
        return HttpResponse.json({ id: 'u1', email: 'andrew@example.com' });
      }),
    );
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });
    fireEvent.click(avatarButton());

    expect(screen.queryByText('andrew@example.com')).not.toBeInTheDocument();
    expect(await screen.findByText('andrew@example.com')).toBeInTheDocument();
  });

  it('stays silent (no error UI) when GET /api/me fails', async () => {
    server.use(http.get('/api/me', () => new HttpResponse(null, { status: 500 })));
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });
    fireEvent.click(avatarButton());

    // menu still works; no alert / error text
    expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/error|couldn.t/i)).not.toBeInTheDocument();
    });
  });

  it('"Profile" navigates to /profile', async () => {
    server.use(okMe());
    const { router } = renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });
    fireEvent.click(avatarButton());
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'));
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });

  it('fetches GET /api/me once for the whole session (avatar menu + Profile share it)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/me', () => {
        calls += 1;
        return HttpResponse.json({ id: 'u1', email: 'andrew@example.com' });
      }),
    );
    const { router } = renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });
    await waitFor(() => expect(calls).toBe(1));

    await act(async () => {
      await router.navigate('/profile');
    });
    await screen.findByRole('heading', { name: 'Profile' });
    expect(screen.getByText(/signed in as andrew@example\.com/i)).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('"Sign out" calls the injected signOut', async () => {
    server.use(okMe());
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });
    fireEvent.click(avatarButton());
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it('returns focus to the avatar button when a menu item closes the menu', async () => {
    server.use(okMe());
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });

    fireEvent.click(avatarButton());
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));

    expect(avatarMenu()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(avatarButton());
  });

  it('opening the avatar menu closes the settings popover and vice versa', async () => {
    server.use(okMe());
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.queryByRole('group', { name: /appearance/i })).toBeInTheDocument();

    fireEvent.click(avatarButton());
    expect(screen.queryByRole('group', { name: /appearance/i })).not.toBeInTheDocument();
    expect(avatarMenu()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(avatarMenu()).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /appearance/i })).toBeInTheDocument();
  });
});
