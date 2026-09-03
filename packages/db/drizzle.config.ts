import { fileURLToPath } from 'node:url';

import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` works offline from the schema; `studio` / `check` need a URL.
// Load the repo-root .env if it exists so those work without extra flags.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // no .env — fine for `generate`
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
