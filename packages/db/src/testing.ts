import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Test-only helpers (ADR-0012 middle tier). Not exported from the package index —
 * import from `@dtg/db/testing`. Needs Docker available.
 */

export interface TestDb {
  /** postgres:// connection string for the throwaway container. */
  url: string;
  /** Stop and remove the container. */
  teardown: () => Promise<void>;
}

/**
 * Start a throwaway Postgres container and apply every migration to it once.
 *
 * TODO(DAMN-2): per-test isolation (transaction rollback / truncation between tests).
 * The walking-skeleton endpoints are read-only, so migrate-once is enough for now.
 */
export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17.11',
  ).start();
  const url = container.getConnectionUri();

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await sql.end();
  }

  return {
    url,
    teardown: async () => {
      await container.stop();
    },
  };
}
