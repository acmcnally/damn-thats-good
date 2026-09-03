/**
 * Environment validation for `ConfigModule` (app.module.ts). Runs once at startup;
 * a missing or malformed value fails the boot loudly rather than at first use.
 */
export interface Env {
  DATABASE_URL: string;
  API_PORT: number;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const databaseUrl = raw.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required');
  }

  const apiPort = Number(raw.API_PORT ?? 3000);
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error(`API_PORT must be a positive integer (got ${String(raw.API_PORT)})`);
  }

  return { DATABASE_URL: databaseUrl, API_PORT: apiPort };
}
