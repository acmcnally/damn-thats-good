import { z } from 'zod';

import { type RecipeContent, recipeContentSchema } from './recipe-content';

export const visibilitySchema = z.enum(['private', 'unlisted', 'public']);

// Trim + lowercase + de-dupe once, here, so both apps and every write path (create,
// metadata update) get normalized tag names for free (phase 5 fix — findings 6, 7).
const tagsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()))]);

export const createRecipeRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  servings: z.string().trim().max(120).optional(),
  provenance: z.string().trim().max(2000).optional(),
  tags: tagsSchema,
  content: recipeContentSchema.omit({ contentSchemaVersion: true }),
});
export type CreateRecipeRequest = z.infer<typeof createRecipeRequestSchema>;

export const updateRecipeMetadataRequestSchema = z.object({
  expectedUpdtCnt: z.number().int().positive(), // was expectedUpdatedAt (phase 5 fix — finding 9)
  name: z.string().trim().min(1).max(200).optional(),
  servings: z.string().trim().max(120).optional(),
  provenance: z.string().trim().max(2000).optional(),
  tags: tagsSchema.optional(),
  visibility: visibilitySchema.optional(),
});
export type UpdateRecipeMetadataRequest = z.infer<typeof updateRecipeMetadataRequestSchema>;

export const saveContentRequestSchema = z.object({
  baseVersionId: z.uuid(),
  content: recipeContentSchema.omit({ contentSchemaVersion: true }),
});
export type SaveContentRequest = z.infer<typeof saveContentRequestSchema>;

export interface RecipeSummary {
  id: string;
  name: string;
  servings: string | null;
  tags: string[];
  visibility: z.infer<typeof visibilitySchema>;
  updateDtTm: string;
}

export interface RecipeDetail extends RecipeSummary {
  provenance: string | null;
  currentVersionId: string;
  currentVersionNumber: number;
  content: RecipeContent;
  updateCnt: number; // the client echoes this back as expectedUpdtCnt on the next PATCH
  createDtTm: string;
}

/** `GET /tags` response entry. */
export interface TagSummary {
  id: string;
  name: string;
}

/** 412 body for both `PATCH /recipes/:id` and `PUT /recipes/:id/content` — the
 * client preserves its draft and prompts to reconcile against this (ADR-0007),
 * rather than losing the in-progress edit. Both guards throw the same shape. */
export interface ConflictResponse {
  current: RecipeDetail;
}
