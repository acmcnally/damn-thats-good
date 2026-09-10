/**
 * @dtg/shared — types and pure helpers shared by the web and api apps.
 *
 * Consumed as TypeScript source, not a build artifact (ADR-0005). The recipe content
 * schema, DTOs, and `diffContent` land with DAMN-2 / DAMN-3; for now this holds the
 * walking-skeleton + auth (DAMN-1) response shapes.
 */

/** `GET /api/health` response (ADR-0010). 200 when `status: 'ok'`, 503 otherwise. */
export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'up' | 'down';
}

/** `GET /api/config` response (DAMN-1), `@Public()`. Runtime (not build-time) config the
 * SPA needs to construct `AuthKitProvider` — see technical-design.md's "Config / env
 * changes" for why this can't be a Vite build-time env var. Not a secret: a WorkOS
 * Client ID is meant to be public in an OAuth public client. */
export interface ConfigResponse {
  workosClientId: string;
}

/** `GET /api/me` response (DAMN-1) — the local `users` row for the authenticated caller. */
export interface MeResponse {
  id: string;
  email: string;
}

/**
 * DAMN-1 E2E auth bypass cookie name — crosses the web/api boundary (set by
 * `e2e/support/auth.ts`, read by the frontend's auth gate and the API's `JwtAuthGuard`),
 * so it's declared once here rather than as three independent string literals that
 * could silently drift apart.
 */
export const E2E_BYPASS_COOKIE = 'e2e_bypass';
