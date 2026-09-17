import { type Database, recipeTags, tags } from '@dtg/db';
import type { TagSummary } from '@dtg/shared';
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';

/** The transaction handle `Database.transaction`'s callback receives — used so the
 * upsert/sync helpers below work identically inside `RecipesService`'s transactions
 * and against the plain pool for read-only queries. */
type Executor = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;

@Injectable()
export class TagsService {
  constructor(private readonly database: DatabaseService) {}

  async findAllForBook(bookId: string): Promise<TagSummary[]> {
    return this.database.db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.bookId, bookId))
      .orderBy(tags.name);
  }

  /**
   * Get-or-create every (already-normalized) name in one bulk statement — a
   * multi-row `INSERT ... ON CONFLICT DO NOTHING`, then a re-select, is race-safe
   * the same way `BooksService.getOrCreateForOwner`'s single-row upsert is: two
   * concurrent calls for the same book/name both attempt the insert, one wins per
   * name, and the re-select sees whichever row is now committed either way.
   */
  async getOrCreateMany(
    tx: Executor,
    bookId: string,
    names: string[],
  ): Promise<{ id: string; name: string }[]> {
    if (names.length === 0) return [];
    await tx
      .insert(tags)
      .values(names.map((name) => ({ bookId, name })))
      .onConflictDoNothing({ target: [tags.bookId, tags.name] });
    return tx
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.bookId, bookId), inArray(tags.name, names)));
  }

  /** Diffs `names` against the recipe's currently-linked tags, upserting anything
   * new and dropping link rows for anything no longer present — used by both
   * `RecipesService.create` and `.updateMetadata`. */
  async syncRecipeTags(
    tx: Executor,
    recipeId: string,
    bookId: string,
    names: string[],
  ): Promise<void> {
    const resolved = await this.getOrCreateMany(tx, bookId, names);
    const resolvedIds = resolved.map((t) => t.id);

    if (resolvedIds.length > 0) {
      await tx
        .insert(recipeTags)
        .values(resolvedIds.map((tagId) => ({ recipeId, tagId })))
        .onConflictDoNothing();
    }
    await tx
      .delete(recipeTags)
      .where(
        resolvedIds.length > 0
          ? and(eq(recipeTags.recipeId, recipeId), notInArray(recipeTags.tagId, resolvedIds))
          : eq(recipeTags.recipeId, recipeId),
      );
  }
}
