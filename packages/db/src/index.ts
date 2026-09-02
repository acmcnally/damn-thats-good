/**
 * @dtg/db — Drizzle schema and client, the source of truth for the data model.
 *
 * Consumed as TypeScript source, not a build artifact (ADR-0005). The recipe /
 * version schema itself is owned by DAMN-2.
 */

export type { Database, DbHandle, Schema } from './client';
export { createDb } from './client';
export * as schema from './schema';
export { appMeta } from './schema';

/**
 * SCAFFOLD(DAMN-26): DAMN-25 placeholder, still imported by the placeholder
 * `apps/api/src/main.ts`. Removed in Phase B when the real NestJS app replaces it.
 */
export const DB_PACKAGE = '@dtg/db';
