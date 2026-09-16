import { expect, test } from '@playwright/test';

import { loginAsTestUser } from '../support/auth';

/**
 * DAMN-2 happy path (technical-design.md's test plan): create a recipe through the
 * real entry UI — name, servings, provenance, tags, ingredient/step tokenization
 * including a manual boundary correction — save, find it in the list, open the
 * detail view, edit content, save again, and confirm (via API assertion, since the
 * version-history UI is DAMN-3) that a second version was created.
 */
test('create, list, view, and edit a recipe through the real entry UI', async ({
  page,
  request,
}) => {
  await loginAsTestUser(page);
  await page.goto('/recipes/new');

  await page.getByLabel('Recipe name').fill('E2E Test Chili');
  await page.getByLabel('Servings').fill('Serves 4');
  await page.getByLabel('Provenance').fill('Written for the DAMN-2 workflow test.');

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
  await expect(page.getByRole('heading', { name: 'E2E Test Chili', level: 1 })).toBeVisible();

  const recipeId = page.url().split('/').pop()!;

  // Appears in the list.
  await page.getByRole('link', { name: 'Recipes' }).click();
  await expect(page.getByRole('link', { name: 'E2E Test Chili' })).toBeVisible();

  // Open detail — the initial content round-tripped (currently version 1).
  await page.getByRole('link', { name: 'E2E Test Chili' }).click();
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

  // Second save actually minted a new version (API assertion — the version-history
  // UI itself is DAMN-3's).
  const detail = await request.get(`/api/recipes/${recipeId}`);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).currentVersionNumber).toBe(2);
});
