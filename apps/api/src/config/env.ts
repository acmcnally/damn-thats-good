/**
 * Environment validation for `ConfigModule` (app.module.ts). Runs once at startup;
 * a missing or malformed value fails the boot loudly rather than at first use.
 */
export interface Env {
  DATABASE_URL: string;
  API_PORT: number;
  /** WorkOS Secret/API key (`sk_...`) — DAMN-1. Used server-side only (WorkOS API calls). */
  WORKOS_API_KEY: string;
  /** WorkOS Client ID (`client_...`) — DAMN-1. Scopes the JWKS URL and is re-served to the
   * frontend via `GET /api/config` (not a secret — see technical-design.md). */
  WORKOS_CLIENT_ID: string;
  /** DAMN-1 E2E auth bypass. Gated to `1` exactly; anything else (including unset) is off.
   * Never set on prod — see technical-design.md's "E2E auth bypass" invariant. */
  E2E_AUTH_BYPASS: boolean;
}

function requireString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const databaseUrl = requireString(raw, 'DATABASE_URL');
  const workosApiKey = requireString(raw, 'WORKOS_API_KEY');
  const workosClientId = requireString(raw, 'WORKOS_CLIENT_ID');

  const apiPort = Number(raw.API_PORT ?? 3000);
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error(`API_PORT must be a positive integer (got ${String(raw.API_PORT)})`);
  }

  return {
    DATABASE_URL: databaseUrl,
    API_PORT: apiPort,
    WORKOS_API_KEY: workosApiKey,
    WORKOS_CLIENT_ID: workosClientId,
    E2E_AUTH_BYPASS: raw.E2E_AUTH_BYPASS === '1',
  };
}
