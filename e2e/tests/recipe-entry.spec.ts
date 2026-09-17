import { expect, test } from '@playwright/test';

import { loginAsTestUser } from '../support/auth';

/**
 * Recipe-entry happy path (technical-design.md's test plan): create a recipe
 * through the real entry UI — name, servings, provenance, tags, ingredient/step
 * tokenization including a manual boundary correction — save, find it in the
 * list, open the detail view, edit content, save again, and confirm (via API
 * assertion, since there's no version-history UI yet) that a second version
 * was created.
 */
test('create, list, view, and edit a recipe through the real entry UI', async ({ page }) => {
  // Unique per run — this stack's Postgres persists across local `pnpm e2e`
  // invocations (a named volume, not Testcontainers), so a fixed name would
  // collide with a leftover recipe from an earlier run.
  const recipeName = `E2E Test Chili ${Date.now()}`;

  await loginAsTestUser(page);
  await page.goto('/recipes/new');

  await page.getByLabel('Recipe name').fill(recipeName);
  await page.getByLabel('Servings').fill('Serves 4');
  await page.getByLabel('Provenance').fill('Written for the recipe-entry workflow test.');

  const ingredients = page.getByLabel('Ingredients');
  await ingredients.click();
  await ingredients.fill('2 tbsp olive oil\n1 onion, diced');

  // Manual boundary correction: drag the first line's handle rightward so "olive
  // oil" joins the detected amount, same interaction the mockup's drag-handle
  // affordance exists for.
  const firstHandle = page.locator('[class*="_handle_"]').first();
  const box = await firstHandle.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
  }

  const steps = page.getByLabel('Steps');
  await steps.click();
  await steps.fill('Heat the oil.\nAdd the onion.');

  await page.getByRole('button', { name: 'Add tag' }).click();
  await page.getByPlaceholder('Search or create…').fill('e2e-workflow');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  await expect(page.getByRole('heading', { name: recipeName, level: 1 })).toBeVisible();

  const recipeId = page.url().split('/').pop()!;

  // The manual boundary correction actually persisted — not just a live highlight.
  // "olive" has nowhere else to snap to right of the auto-detected split, and the
  // schema's non-empty-item guarantee caps the boundary one word short of
  // consuming the whole line, so this is deterministic regardless of exact drag
  // distance: quantity picks up "olive", "oil" stays the item.
  const created = await page.request.get(`/api/recipes/${recipeId}`);
  const createdIngredients = (await created.json()).content.ingredients;
  expect(createdIngredients[0]).toMatchObject({ quantity: '2 tbsp olive', item: 'oil' });

  // Appears in the list.
  await page.getByRole('link', { name: 'Recipes' }).click();
  await expect(page.getByRole('link', { name: recipeName })).toBeVisible();

  // Open detail — the initial content round-tripped (currently version 1).
  await page.getByRole('link', { name: recipeName }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
  await expect(page.getByText('Heat the oil.')).toBeVisible();

  // Edit content and save again.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}/edit$`));
  const editSteps = page.getByLabel('Steps');
  await editSteps.click();
  await editSteps.fill('Heat the oil.\nAdd the onion.\nSimmer for 20 minutes.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
  await expect(page.getByText('Simmer for 20 minutes.')).toBeVisible();

  // Second save actually minted a new version (API assertion — there's no
  // version-history UI to check this against yet).
  // `page.request`, not the standalone `request` fixture — it shares the page's
  // browser context, so the e2e bypass cookie `loginAsTestUser` set rides along.
  const detail = await page.request.get(`/api/recipes/${recipeId}`);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).currentVersionNumber).toBe(2);
});
