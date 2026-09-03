import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * SCAFFOLD(DAMN-26): walking-skeleton round-trip table. Nothing real depends on it — it
 * exists only so the skeleton page can render a row that came from Postgres through the
 * API. DAMN-2 brings the real recipe / version schema and regenerates the baseline
 * migration (see docs/features/DAMN-26-local-compose-stack/technical-design.md
 * § "Migration history"); `app_meta` then leaves the schema and the history entirely.
 */
export const appMeta = pgTable(
  'app_meta',
  {
    id: integer('id').primaryKey().default(1),
    name: text('name').notNull(),
    seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('app_meta_single_row', sql`${t.id} = 1`)],
);
