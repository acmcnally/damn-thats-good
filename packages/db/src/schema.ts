import type { RecipeContent } from '@dtg/shared';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * DAMN-1: the app-side anchor for authored versions, book ownership, and the 1:1
 * Profile (ADR-0003). Holds only the WorkOS user id + email — no credentials, since
 * auth identity lives at WorkOS. Deliberately minimal: no name/avatar/role columns
 * (that's `profiles`, out of scope here — DAMN-4/DAMN-14) and no credential-type
 * column (ADR-0007 — stays agnostic; a V3 Google identity is a separate association,
 * not a column here).
 *
 * Keyed strictly on `workosUserId` (WorkOS's `sub` claim) for authorization — never on
 * email, which WorkOS itself says can change. `email` is not re-synced after the row is
 * created (see technical-design.md's "known V1 limitation, accepted").
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  workosUserId: text('workos_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  // Renamed from created_at/updated_at (DAMN-2 decision #7) — see the migration plan
  // in docs/features/DAMN-2-recipe-entry-and-versioning/technical-design.md for why.
  createDtTm: timestamp('create_dt_tm', { withTimezone: true }).notNull().defaultNow(),
  updateDtTm: timestamp('update_dt_tm', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Single-owner in V1 — `owner_id` is UNIQUE, not just indexed, so "exactly one book per
 * user" is a real database invariant, not just an API convention. That uniqueness is
 * also what makes `BooksService`'s get-or-create race-safe: the database arbitrates
 * concurrent first-book creation, not application logic.
 *
 * `name` defaults to 'My Recipe Book' and isn't surfaced in any V1 UI — added now only
 * to avoid a later migration if a future feature wants a display name.
 */
export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .unique()
    .references(() => users.id),
  name: text('name').notNull().default('My Recipe Book'),
  // Renamed from created_at/updated_at (DAMN-2 decision #7) — see users' note above.
  createDtTm: timestamp('create_dt_tm', { withTimezone: true }).notNull().defaultNow(),
  updateDtTm: timestamp('update_dt_tm', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * DAMN-2. `private` = owners of the book only; `unlisted` = any signed-in app user
 * with the link; `public` = visible to any signed-in app user. No enforcement logic
 * is built in V1 (decision #9) — there is no route through which one user could ever
 * see another user's book yet.
 */
export const recipeVisibility = pgEnum('recipe_visibility', ['private', 'unlisted', 'public']);

/**
 * Stable identity + every non-versioned, mutable-in-place field (ADR-0007): name,
 * servings, provenance, tags, visibility. Ingredients/steps live on `recipeVersions`.
 *
 * `currentVersionId` is nullable at the DB level only to break the insertion cycle
 * with `recipeVersions` — `RecipesService` is the only writer, and the invariant
 * "every row has a non-null currentVersionId once its creating transaction commits"
 * is enforced there.
 *
 * `updateCnt` is the optimistic-concurrency token for these non-content fields
 * (decision #7, revised) — an integer counter, not `updateDtTm`, to avoid a class of
 * timestamp-precision/serialization bug on the CAS comparison. `updateDtTm` is
 * display/sort only and doesn't participate in concurrency control.
 */
export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id),
  name: text('name').notNull(),
  servings: text('servings'), // free text — "serves 4-6", "makes a dozen" (decision #5)
  provenance: text('provenance'),
  visibility: recipeVisibility('visibility').notNull().default('private'),
  currentVersionId: uuid('current_version_id').references((): AnyPgColumn => recipeVersions.id),
  updateCnt: integer('update_cnt').notNull().default(1),
  createDtTm: timestamp('create_dt_tm', { withTimezone: true }).notNull().defaultNow(),
  updateDtTm: timestamp('update_dt_tm', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Versioned content only — ingredients + steps, as a structured JSONB document
 * (ADR-0006). One row per save; versions are immutable and never updated in place,
 * so unlike every other table here there's no `updateDtTm`/`updateCnt` — `createDtTm`
 * alone is DAMN-3's history UI's only timestamp for "when was this version saved."
 */
export const recipeVersions = pgTable(
  'recipe_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    content: jsonb('content').notNull().$type<RecipeContent>(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    note: text('note'),
    createDtTm: timestamp('create_dt_tm', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('recipe_versions_recipe_version_idx').on(t.recipeId, t.versionNumber)],
);

/**
 * Book-scoped, normalized (decision #6) — trimmed + lowercased at write time so a
 * plain unique index and plain equality everywhere suffice; no case-insensitive
 * queries needed. Display casing (the mockup's all-caps chips) is a pure CSS concern,
 * fully decoupled from the stored value.
 */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    name: text('name').notNull(),
    createDtTm: timestamp('create_dt_tm', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_book_name_idx').on(t.bookId, t.name)],
);

export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    // A tag itself is never cascade-deleted here (still book-scoped, may be used
    // elsewhere) — only its join rows.
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
);
