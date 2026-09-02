import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * One-shot migration runner (ADR-0010: migrations run as an explicit step, never on
 * app boot). Invoked by `pnpm --filter @dtg/db migrate` locally and by the `migrate`
 * service in docker-compose.yml. Applies every pending migration in ./drizzle, then exits.
 *
 * No local imports on purpose — Node runs this .ts file directly, and the migrator does
 * not need the schema, only the SQL files.
 */

// Local dev: pick up the repo-root .env. In Compose the vars are set directly, and there
// is no .env in the image — the missing-file case is expected there.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // no .env file — rely on the ambient environment
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('migrate: DATABASE_URL is not set');
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const sql = postgres(connectionString, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log('migrate: up to date');
} catch (err) {
  console.error('migrate: failed', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
