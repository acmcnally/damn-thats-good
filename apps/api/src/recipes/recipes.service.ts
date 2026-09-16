import { type Database, recipes, recipeTags, recipeVersions, tags } from '@dtg/db';
import {
  CONTENT_SCHEMA_VERSION,
  contentEquals,
  type CreateRecipeRequest,
  type RecipeContent,
  type RecipeDetail,
  type RecipeSummary,
  type SaveContentRequest,
  type UpdateRecipeMetadataRequest,
} from '@dtg/shared';
import { Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { TagsService } from './tags.service';

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;
type RecipeRow = typeof recipes.$inferSelect;
type RecipeVersionRow = typeof recipeVersions.$inferSelect;

@Injectable()
export class RecipesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tags: TagsService,
  ) {}

  async findAllForBook(bookId: string): Promise<RecipeSummary[]> {
    const rows = await this.database.db
      .select()
      .from(recipes)
      .where(eq(recipes.bookId, bookId))
      .orderBy(desc(recipes.updateDtTm));
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const tagRows = await this.database.db
      .select({ recipeId: recipeTags.recipeId, name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(recipeTags.tagId, tags.id))
      .where(inArray(recipeTags.recipeId, ids));
    const tagsByRecipe = new Map<string, string[]>();
    for (const { recipeId, name } of tagRows) {
      const existing = tagsByRecipe.get(recipeId);
      if (existing) existing.push(name);
      else tagsByRecipe.set(recipeId, [name]);
    }

    return rows.map((row) => this.toSummary(row, tagsByRecipe.get(row.id) ?? []));
  }

  async findOne(bookId: string, recipeId: string): Promise<RecipeDetail> {
    return this.buildDetail(bookId, recipeId, this.database.db);
  }

  async create(bookId: string, authorId: string, req: CreateRecipeRequest): Promise<RecipeDetail> {
    return this.database.db.transaction(async (tx) => {
      const tagRows = await this.tags.getOrCreateMany(tx, bookId, req.tags);

      const [recipe] = await tx
        .insert(recipes)
        .values({ bookId, name: req.name, servings: req.servings, provenance: req.provenance })
        .returning();
      if (!recipe) throw new Error('recipes insert returned no row');

      const content: RecipeContent = {
        contentSchemaVersion: CONTENT_SCHEMA_VERSION,
        ...req.content,
      };
      const [version] = await tx
        .insert(recipeVersions)
        .values({ recipeId: recipe.id, versionNumber: 1, content, authorId })
        .returning();
      if (!version) throw new Error('recipe_versions insert returned no row');

      if (tagRows.length > 0) {
        await tx
          .insert(recipeTags)
          .values(tagRows.map((t) => ({ recipeId: recipe.id, tagId: t.id })));
      }

      const [updated] = await tx
        .update(recipes)
        .set({ currentVersionId: version.id })
        .where(eq(recipes.id, recipe.id))
        .returning();
      if (!updated) throw new Error('recipes update returned no row');

      return this.toDetail(updated, version, req.tags);
    });
  }

  async updateMetadata(
    bookId: string,
    recipeId: string,
    req: UpdateRecipeMetadataRequest,
  ): Promise<RecipeDetail> {
    return this.database.db.transaction(async (tx) => {
      const existing = await this.getRecipeInBook(bookId, recipeId, tx);
      if (!existing) throw new NotFoundException();

      const patch: Partial<typeof recipes.$inferInsert> = {
        updateDtTm: new Date(),
        ...(req.name !== undefined && { name: req.name }),
        ...(req.servings !== undefined && { servings: req.servings }),
        ...(req.provenance !== undefined && { provenance: req.provenance }),
        ...(req.visibility !== undefined && { visibility: req.visibility }),
      };

      const [updated] = await tx
        .update(recipes)
        .set({ ...patch, updateCnt: sql`${recipes.updateCnt} + 1` })
        .where(and(eq(recipes.id, recipeId), eq(recipes.updateCnt, req.expectedUpdtCnt)))
        .returning();

      if (!updated) {
        const current = await this.buildDetail(bookId, recipeId, tx);
        throw new PreconditionFailedException({ current });
      }

      if (req.tags !== undefined) {
        await this.tags.syncRecipeTags(tx, recipeId, bookId, req.tags);
      }

      const tagNames = req.tags ?? (await this.getTagNames(recipeId, tx));
      const version = await this.getVersion(updated.currentVersionId!, tx);
      if (!version) throw new Error('recipe has no current version');
      return this.toDetail(updated, version, tagNames);
    });
  }

  async saveContent(
    bookId: string,
    recipeId: string,
    authorId: string,
    req: SaveContentRequest,
  ): Promise<RecipeDetail> {
    return this.database.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(recipes)
        .where(and(eq(recipes.id, recipeId), eq(recipes.bookId, bookId)))
        .for('update');
      if (!locked) throw new NotFoundException();

      if (locked.currentVersionId !== req.baseVersionId) {
        const current = await this.buildDetail(bookId, recipeId, tx);
        throw new PreconditionFailedException({ current });
      }

      const currentVersion = await this.getVersion(locked.currentVersionId!, tx);
      if (!currentVersion) throw new Error('recipe has no current version');

      const submitted: RecipeContent = {
        contentSchemaVersion: CONTENT_SCHEMA_VERSION,
        ...req.content,
      };
      if (contentEquals(currentVersion.content, submitted)) {
        const tagNames = await this.getTagNames(recipeId, tx);
        return this.toDetail(locked, currentVersion, tagNames);
      }

      const [newVersion] = await tx
        .insert(recipeVersions)
        .values({
          recipeId,
          versionNumber: currentVersion.versionNumber + 1,
          content: submitted,
          authorId,
        })
        .returning();
      if (!newVersion) throw new Error('recipe_versions insert returned no row');

      const [updatedRecipe] = await tx
        .update(recipes)
        .set({ currentVersionId: newVersion.id })
        .where(eq(recipes.id, recipeId))
        .returning();
      if (!updatedRecipe) throw new Error('recipes update returned no row');

      const tagNames = await this.getTagNames(recipeId, tx);
      return this.toDetail(updatedRecipe, newVersion, tagNames);
    });
  }

  async remove(bookId: string, recipeId: string): Promise<void> {
    const result = await this.database.db
      .delete(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.bookId, bookId)))
      .returning({ id: recipes.id });
    if (result.length === 0) throw new NotFoundException();
  }

  private async buildDetail(bookId: string, recipeId: string, tx: Executor): Promise<RecipeDetail> {
    const recipe = await this.getRecipeInBook(bookId, recipeId, tx);
    if (!recipe) throw new NotFoundException();
    const tagNames = await this.getTagNames(recipeId, tx);
    const version = await this.getVersion(recipe.currentVersionId!, tx);
    if (!version) throw new Error('recipe has no current version');
    return this.toDetail(recipe, version, tagNames);
  }

  private async getRecipeInBook(
    bookId: string,
    recipeId: string,
    tx: Executor,
  ): Promise<RecipeRow | undefined> {
    const [row] = await tx
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.bookId, bookId)))
      .limit(1);
    return row;
  }

  private async getTagNames(recipeId: string, tx: Executor): Promise<string[]> {
    const rows = await tx
      .select({ name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(recipeTags.tagId, tags.id))
      .where(eq(recipeTags.recipeId, recipeId));
    return rows.map((r) => r.name);
  }

  private async getVersion(versionId: string, tx: Executor): Promise<RecipeVersionRow | undefined> {
    const [row] = await tx
      .select()
      .from(recipeVersions)
      .where(eq(recipeVersions.id, versionId))
      .limit(1);
    return row;
  }

  private toSummary(recipe: RecipeRow, tagNames: string[]): RecipeSummary {
    return {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      tags: tagNames,
      visibility: recipe.visibility,
      updateDtTm: recipe.updateDtTm.toISOString(),
    };
  }

  private toDetail(recipe: RecipeRow, version: RecipeVersionRow, tagNames: string[]): RecipeDetail {
    return {
      ...this.toSummary(recipe, tagNames),
      provenance: recipe.provenance,
      currentVersionId: version.id,
      currentVersionNumber: version.versionNumber,
      content: version.content,
      updateCnt: recipe.updateCnt,
      createDtTm: recipe.createDtTm.toISOString(),
    };
  }
}
