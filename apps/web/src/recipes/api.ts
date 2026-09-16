/**
 * `/api/recipes` + `/api/tags` client. Every function takes `getAccessToken`
 * directly (not read from a hook) so it stays a plain testable function, same as
 * `apiFetch` itself.
 */

import type {
  CreateRecipeRequest,
  RecipeContent,
  RecipeDetail,
  RecipeSummary,
  SaveContentRequest,
  TagSummary,
  UpdateRecipeMetadataRequest,
} from '@dtg/shared';

import { apiFetch } from '../apiClient';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
  }
}

/** `412`'s body is `{ current: RecipeDetail }` (metadata) or the version-conflict
 * shape directly (content) — both carry enough to reconcile. */
export interface ConflictError extends ApiError {
  status: 412;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

type GetAccessToken = () => Promise<string>;

export function listRecipes(getAccessToken: GetAccessToken): Promise<RecipeSummary[]> {
  return apiFetch('/api/recipes', getAccessToken).then((r) => json(r));
}

export function getRecipe(getAccessToken: GetAccessToken, id: string): Promise<RecipeDetail> {
  return apiFetch(`/api/recipes/${id}`, getAccessToken).then((r) => json(r));
}

export function createRecipe(
  getAccessToken: GetAccessToken,
  body: CreateRecipeRequest,
): Promise<RecipeDetail> {
  return apiFetch('/api/recipes', getAccessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json(r));
}

export function updateRecipeMetadata(
  getAccessToken: GetAccessToken,
  id: string,
  body: UpdateRecipeMetadataRequest,
): Promise<RecipeDetail> {
  return apiFetch(`/api/recipes/${id}`, getAccessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json(r));
}

export function saveRecipeContent(
  getAccessToken: GetAccessToken,
  id: string,
  baseVersionId: string,
  content: Omit<RecipeContent, 'contentSchemaVersion'>,
): Promise<RecipeDetail> {
  const body: SaveContentRequest = { baseVersionId, content };
  return apiFetch(`/api/recipes/${id}/content`, getAccessToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json(r));
}

export function deleteRecipe(getAccessToken: GetAccessToken, id: string): Promise<void> {
  return apiFetch(`/api/recipes/${id}`, getAccessToken, { method: 'DELETE' }).then((r) => {
    if (!r.ok) return json(r);
    return undefined;
  });
}

export function listTags(getAccessToken: GetAccessToken, query = ''): Promise<TagSummary[]> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiFetch(`/api/tags${qs}`, getAccessToken).then((r) => json(r));
}
