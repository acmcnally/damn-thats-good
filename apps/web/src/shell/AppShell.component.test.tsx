import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderRoute } from '../test/renderRoute';

vi.mock('@workos-inc/authkit-react', () => ({
  useAuth: () => ({
    isLoading: false,
    user: { email: 'andrew@example.com' },
    signIn: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('t'),
  }),
}));

const server = setupServer(
  http.get('/api/me', () => HttpResponse.json({ id: 'u1', email: 'andrew@example.com' })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
});
afterAll(() => server.close());

const primaryNav = () => screen.getByRole('navigation', { name: /primary/i });

describe('shell routing', () => {
  it('clicking each nav item renders the matching page and updates the URL', async () => {
    const { router } = renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });

    fireEvent.click(screen.getByRole('link', { name: /recipes/i }));
    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes');

    fireEvent.click(screen.getByRole('link', { name: /shopping lists/i }));
    expect(await screen.findByText(/coming soon/i)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/shopping-lists');

    fireEvent.click(screen.getByRole('link', { name: /data/i }));
    expect(await screen.findByRole('heading', { name: 'Data' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/data');
  });

  it('the Data page shows a disabled export control', async () => {
    renderRoute({ initialEntries: ['/data'] });
    const button = await screen.findByRole('button', { name: /export book/i });
    expect(button).toBeDisabled();
  });

  it('an unknown path redirects to /', async () => {
    const { router } = renderRoute({ initialEntries: ['/nope'] });
    await screen.findByRole('navigation', { name: /primary/i });
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps one AppShell mounted across navigations (stable nav-rail node)', async () => {
    renderRoute({ initialEntries: ['/'] });
    const nav = await screen.findByRole('navigation', { name: /primary/i });

    fireEvent.click(screen.getByRole('link', { name: /recipes/i }));
    await screen.findByRole('heading', { name: 'Recipes' });
    fireEvent.click(screen.getByRole('link', { name: /data/i }));
    await screen.findByRole('heading', { name: 'Data' });

    expect(primaryNav()).toBe(nav);
  });
});

describe('search placement (route-derived)', () => {
  const searchbox = () => screen.getByRole('searchbox', { name: /search recipes/i });

  it('renders the hero search on / and exactly one search control', async () => {
    renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });
    expect(screen.getAllByRole('searchbox', { name: /search recipes/i })).toHaveLength(1);
    expect(searchbox().closest('header')).toBeNull();
  });

  it('renders the top-bar search on a deep route (fresh mount)', async () => {
    renderRoute({ initialEntries: ['/recipes'] });
    await screen.findByRole('heading', { name: 'Recipes' });
    expect(screen.getAllByRole('searchbox', { name: /search recipes/i })).toHaveLength(1);
    expect(searchbox().closest('header')).not.toBeNull();
  });

  it('the hero returns when navigating back to /', async () => {
    const { router } = renderRoute({ initialEntries: ['/'] });
    await screen.findByRole('navigation', { name: /primary/i });

    fireEvent.click(screen.getByRole('link', { name: /recipes/i }));
    await screen.findByRole('heading', { name: 'Recipes' });
    expect(searchbox().closest('header')).not.toBeNull();

    await act(async () => {
      await router.navigate('/');
    });
    await waitFor(() => expect(searchbox().closest('header')).toBeNull());
    expect(screen.getAllByRole('searchbox', { name: /search recipes/i })).toHaveLength(1);
  });
});
