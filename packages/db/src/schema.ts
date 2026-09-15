import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
