import type { RecipeDetail } from '@dtg/shared';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MOBILE_MEDIA_QUERY } from '../shell/breakpoints';
import { stubMatchMedia } from '../test/matchMedia';
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

  it('keeps blank lines between ingredients/steps as their own line instead of an empty item', async () => {
    let requestBody: unknown;
    server.use(
      http.post('/api/recipes', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderRoute({ initialEntries: ['/recipes/new'] });

    fireEvent.change(await screen.findByLabelText('Recipe name'), {
      target: { value: 'Weeknight Chili' },
    });
    fireEvent.change(screen.getByLabelText('Ingredients'), {
      target: { value: 'For the chili:\n2 tbsp olive oil\n\nFor serving:\nLime wedges' },
    });
    fireEvent.change(screen.getByLabelText('Steps'), {
      target: { value: 'Heat the oil.\n\nServe.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }));

    await vi.waitFor(() => expect(requestBody).toBeDefined());

    const body = requestBody as {
      content: { ingredients: { kind: string }[]; steps: { kind: string }[] };
    };
    // 2 headings + 1 blank + 2 ingredient lines — the save doesn't 400 on the blank
    // line, and it isn't silently dropped either.
    expect(body.content.ingredients.map((l) => l.kind)).toEqual([
      'heading',
      'ingredient',
      'blank',
      'heading',
      'ingredient',
    ]);
    expect(body.content.steps.map((l) => l.kind)).toEqual(['step', 'blank', 'step']);
  });

  it('lets arrow keys move through the tag suggestion list and Enter select the highlighted one', async () => {
    server.use(
      http.get('/api/tags', () =>
        HttpResponse.json([
          { id: 't1', name: 'dessert' },
          { id: 't2', name: 'dinner' },
        ]),
      ),
    );
    renderRoute({ initialEntries: ['/recipes/new'] });
    await screen.findByLabelText('Recipe name');

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    const tagInput = screen.getByPlaceholderText('Search or create…');
    fireEvent.change(tagInput, { target: { value: 'd' } });

    // Both suggestions ("dessert", "dinner") plus the "Create" option are
    // keyboard stops, in that on-screen order.
    await screen.findByRole('option', { name: 'dessert' });
    fireEvent.keyDown(tagInput, { key: 'ArrowDown' }); // -> Create "d"
    fireEvent.keyDown(tagInput, { key: 'ArrowDown' }); // -> dessert
    fireEvent.keyDown(tagInput, { key: 'ArrowDown' }); // -> dinner
    fireEvent.keyDown(tagInput, { key: 'ArrowUp' }); // back to dessert
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    expect(screen.getByText('dessert')).toBeInTheDocument();
    expect(screen.queryByText('dinner')).not.toBeInTheDocument();
    expect(tagInput).not.toBeInTheDocument(); // selecting closes the add-tag control
  });

  it('disables Save Recipe until a name is entered', async () => {
    renderRoute({ initialEntries: ['/recipes/new'] });
    await screen.findByLabelText('Recipe name');

    expect(screen.getByRole('button', { name: /save recipe/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Chili' } });
    expect(screen.getByRole('button', { name: /save recipe/i })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /save recipe/i })).toBeDisabled();
  });

  it('shows Ingredients/Steps help behind their own glyphs, not as always-visible text', async () => {
    renderRoute({ initialEntries: ['/recipes/new'] });
    await screen.findByLabelText('Recipe name');

    expect(screen.queryByRole('group', { name: 'Ingredients help' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients help' }));
    expect(screen.getByText(/drag its edge/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Steps help' }));
    expect(screen.getByText(/numbered.*and bulleted.*lists continue/i)).toBeInTheDocument();
  });

  it('renders exactly one Cancel/Save pair on mobile, not both the inline and fixed copies', async () => {
    stubMatchMedia(MOBILE_MEDIA_QUERY, true);
    renderRoute({ initialEntries: ['/recipes/new'] });
    await screen.findByLabelText('Recipe name');

    expect(screen.getAllByRole('button', { name: /^cancel$/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /save recipe/i })).toHaveLength(1);
  });
});

describe('<RecipeEntryForm> — edit', () => {
  const existing: RecipeDetail = {
    ...created,
    id: 'r1',
    servings: 'Serves 4',
    provenance: 'A family recipe',
  };

  it('clearing Servings/Provenance actually clears them, not silently keeps the old value', async () => {
    let patchBody: unknown;
    server.use(
      http.get('/api/recipes/r1', () => HttpResponse.json(existing)),
      http.patch('/api/recipes/r1', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...existing, servings: null, provenance: null, updateCnt: 2 });
      }),
      http.put('/api/recipes/r1/content', () =>
        HttpResponse.json({ ...existing, servings: null, provenance: null, updateCnt: 2 }),
      ),
    );
    const { router } = renderRoute({ initialEntries: ['/recipes/r1/edit'] });

    const servingsInput = await screen.findByLabelText('Servings');
    expect(servingsInput).toHaveValue('Serves 4');
    fireEvent.change(servingsInput, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Provenance'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/recipes/r1'));

    expect(patchBody).toMatchObject({ servings: '', provenance: '' });
  });

  it('keeps a manually confirmed ingredient boundary instead of re-auto-detecting it', async () => {
    const withConfirmedIngredient: RecipeDetail = {
      ...existing,
      id: 'r2',
      content: {
        contentSchemaVersion: 1,
        ingredients: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            kind: 'ingredient',
            raw: '3 large eggs, beaten',
            // Auto-detection alone would only recognize "3" (no unit word
            // follows) — this quantity reflects a user's drag correction.
            quantity: '3 large',
            item: 'eggs, beaten',
            parseStatus: 'confirmed',
          },
        ],
        steps: [],
      },
    };
    server.use(http.get('/api/recipes/r2', () => HttpResponse.json(withConfirmedIngredient)));
    renderRoute({ initialEntries: ['/recipes/r2/edit'] });

    await screen.findByLabelText('Ingredients');

    // The highlight overlay wraps the recognized quantity in a <span> (see
    // IngredientsField); CSS module class names aren't resolved under Vitest,
    // so assert on that structure instead of a class name.
    const line = document.querySelector('[data-eline]');
    expect(line?.querySelector('span')?.textContent).toBe('3 large');
  });

  it('preserves blank-line spacing in the steps field when reopening a saved recipe', async () => {
    const withBlankStep: RecipeDetail = {
      ...existing,
      id: 'r3',
      content: {
        contentSchemaVersion: 1,
        ingredients: [],
        steps: [
          { id: '22222222-2222-2222-2222-222222222222', kind: 'step', text: 'Heat the oil.' },
          { id: '33333333-3333-3333-3333-333333333333', kind: 'blank' },
          { id: '44444444-4444-4444-4444-444444444444', kind: 'step', text: 'Add the onion.' },
        ],
      },
    };
    server.use(http.get('/api/recipes/r3', () => HttpResponse.json(withBlankStep)));
    renderRoute({ initialEntries: ['/recipes/r3/edit'] });

    const stepsField = await screen.findByLabelText('Steps');
    expect(stepsField).toHaveValue('Heat the oil.\n\nAdd the onion.');
  });
});
