import type { RecipeDetail } from '@dtg/shared';
import { cleanup, fireEvent, screen } from '@testing-library/react';
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
  http.get('/api/tags', () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

const created: RecipeDetail = {
  id: 'new-1',
  name: 'Weeknight Chili',
  servings: null,
  provenance: null,
  tags: [],
  visibility: 'private',
  currentVersionId: 'v1',
  currentVersionNumber: 1,
  updateCnt: 1,
  updateDtTm: '2026-01-01T00:00:00Z',
  createDtTm: '2026-01-01T00:00:00Z',
  content: { contentSchemaVersion: 1, ingredients: [], steps: [] },
};

describe('<RecipeEntryForm> — create', () => {
  it('submits the tokenized ingredient/step text and navigates to the new recipe', async () => {
    let requestBody: unknown;
    server.use(
      http.post('/api/recipes', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const { router } = renderRoute({ initialEntries: ['/recipes/new'] });

    fireEvent.change(await screen.findByLabelText('Recipe name'), {
      target: { value: 'Weeknight Chili' },
    });
    fireEvent.change(screen.getByLabelText('Ingredients'), {
      target: { value: '2 tbsp olive oil\n1 onion' },
    });
    fireEvent.change(screen.getByLabelText('Steps'), {
      target: { value: 'Heat the oil.\nAdd the onion.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/recipes/new-1'));

    const body = requestBody as {
      name: string;
      content: { ingredients: { item: string; quantity: string }[]; steps: { text: string }[] };
    };
    expect(body.name).toBe('Weeknight Chili');
    expect(body.content.ingredients).toEqual([
      expect.objectContaining({ item: 'olive oil', quantity: '2 tbsp' }),
      expect.objectContaining({ item: 'onion', quantity: '1' }),
    ]);
    expect(body.content.steps).toEqual([
      expect.objectContaining({ text: 'Heat the oil.' }),
      expect.objectContaining({ text: 'Add the onion.' }),
    ]);
  });

  it('requires a name before submitting', async () => {
    renderRoute({ initialEntries: ['/recipes/new'] });
    await screen.findByLabelText('Recipe name');

    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });
});
