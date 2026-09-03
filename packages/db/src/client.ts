import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

export interface DbHandle {
  /** Drizzle query client, schema-aware. */
  db: Database;
  /** Close the underlying connection pool. Callers own this lifecycle. */
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client bound to `connectionString`.
 *
 * Deliberately a factory, not an import-time singleton: the NestJS DrizzleModule,
 * the migrate script, and Testcontainers-backed tests each construct and dispose
 * their own handle against their own database.
 */
export function createDb(connectionString: string): DbHandle {
  const sql = postgres(connectionString);
  return {
    db: drizzle(sql, { schema }),
    close: () => sql.end(),
  };
}
