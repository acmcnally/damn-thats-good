/**
 * @dtg/shared — types and pure helpers shared by the web and api apps.
 *
 * Consumed as TypeScript source, not a build artifact (ADR-0005). The recipe
 * content schema, DTOs, and `diffContent` land with DAMN-2 / DAMN-3; for now this
 * holds only the walking-skeleton response shapes.
 */

/** `GET /api/health` response (ADR-0010). 200 when `status: 'ok'`, 503 otherwise. */
export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'up' | 'down';
}

/** SCAFFOLD(DAMN-26): `GET /api/meta` response. Removed with the meta scaffold in DAMN-1 / DAMN-2. */
export interface MetaResponse {
  name: string;
  /** ISO 8601 timestamp. */
  seededAt: string;
}
