/**
 * @dtg/db — Drizzle schema and client, the source of truth for the data model.
 *
 * Consumed as TypeScript source, not a build artifact (ADR-0005). The recipe /
 * version schema itself is owned by DAMN-2.
 */

export type { Database, DbHandle, Schema } from './client';
export { createDb } from './client';
export * as schema from './schema';
export { users } from './schema';
