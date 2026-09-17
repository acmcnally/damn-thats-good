import { cleanup, screen } from '@testing-library/react';
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
});
afterAll(() => server.close());

describe('<RecipesPage>', () => {
  it('renders a card per recipe, with servings and tags', async () => {
    server.use(
      http.get('/api/recipes', () =>
        HttpResponse.json([
          {
            id: 'r1',
            name: 'Chili',
            servings: 'Serves 4',
            tags: ['dinner'],
            visibility: 'private',
            updateDtTm: '2026-01-01T00:00:00Z',
          },
        ]),
      ),
    );
    renderRoute({ initialEntries: ['/recipes'] });

    expect(await screen.findByRole('link', { name: /chili/i })).toBeInTheDocument();
    expect(screen.getByText('Serves 4')).toBeInTheDocument();
    expect(screen.getByText('dinner')).toBeInTheDocument();
  });

  it('shows an empty state when there are no recipes', async () => {
    server.use(http.get('/api/recipes', () => HttpResponse.json([])));
    renderRoute({ initialEntries: ['/recipes'] });

    expect(await screen.findByText(/no recipes yet/i)).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    server.use(http.get('/api/recipes', () => HttpResponse.json({}, { status: 500 })));
    renderRoute({ initialEntries: ['/recipes'] });

    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument();
  });
});
