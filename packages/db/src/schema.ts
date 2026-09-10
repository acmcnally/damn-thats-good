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
