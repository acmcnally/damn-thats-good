import type { RecipeDetail } from '@dtg/shared';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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

const detail: RecipeDetail = {
  id: 'r1',
  name: 'Chili',
  servings: 'Serves 4',
  provenance: 'A test fixture',
  tags: ['dinner'],
  visibility: 'private',
  currentVersionId: 'v1',
  currentVersionNumber: 1,
  updateCnt: 1,
  updateDtTm: '2026-01-01T00:00:00Z',
  createDtTm: '2026-01-01T00:00:00Z',
  content: {
    contentSchemaVersion: 1,
    ingredients: [
      { id: 'i1', kind: 'heading', text: 'For the chili' },
      {
        id: 'i2',
        kind: 'ingredient',
        raw: '2 tbsp oil',
        quantity: '2 tbsp',
        item: 'oil',
        parseStatus: 'auto',
      },
    ],
    steps: [{ id: 's1', kind: 'step', text: 'Heat the oil.' }],
  },
};

describe('<RecipeDetailPage>', () => {
  it('renders the recipe, its sectioned ingredients, and steps', async () => {
    server.use(http.get('/api/recipes/r1', () => HttpResponse.json(detail)));
    renderRoute({ initialEntries: ['/recipes/r1'] });

    expect(await screen.findByRole('heading', { name: 'Chili', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('For the chili')).toBeInTheDocument();
    expect(screen.getByText('oil')).toBeInTheDocument();
    expect(screen.getByText('2 tbsp')).toBeInTheDocument();
    expect(screen.getByText('Heat the oil.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute('href', '/recipes/r1/edit');
  });

  it('renders a URL in the provenance field as a clickable link', async () => {
    server.use(
      http.get('/api/recipes/r1', () =>
        HttpResponse.json({
          ...detail,
          provenance: 'See https://grandma-recipes.example/chili for the original.',
        }),
      ),
    );
    renderRoute({ initialEntries: ['/recipes/r1'] });

    await screen.findByRole('heading', { name: 'Chili', level: 1 });
    const link = screen.getByRole('link', { name: 'https://grandma-recipes.example/chili' });
    expect(link).toHaveAttribute('href', 'https://grandma-recipes.example/chili');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/^See/)).toBeInTheDocument();
    expect(screen.getByText(/for the original\.$/)).toBeInTheDocument();
  });

  it('deletes the recipe on confirm and navigates back to the list', async () => {
    server.use(
      http.get('/api/recipes/r1', () => HttpResponse.json(detail)),
      http.delete('/api/recipes/r1', () => new HttpResponse(null, { status: 204 })),
    );
    const { router } = renderRoute({ initialEntries: ['/recipes/r1'] });

    await screen.findByRole('heading', { name: 'Chili', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete/i }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/recipes'));
  });

  it('does not delete when the confirm dialog is dismissed', async () => {
    server.use(http.get('/api/recipes/r1', () => HttpResponse.json(detail)));
    const { router } = renderRoute({ initialEntries: ['/recipes/r1'] });

    await screen.findByRole('heading', { name: 'Chili', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/recipes/r1');
  });

  it('shows an error and resets the button instead of failing silently when delete fails', async () => {
    server.use(
      http.get('/api/recipes/r1', () => HttpResponse.json(detail)),
      http.delete('/api/recipes/r1', () => HttpResponse.json({}, { status: 500 })),
    );
    renderRoute({ initialEntries: ['/recipes/r1'] });

    await screen.findByRole('heading', { name: 'Chili', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong deleting/i);
    expect(screen.getByRole('button', { name: /^delete$/i })).not.toBeDisabled();
  });
});
