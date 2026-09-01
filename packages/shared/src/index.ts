/**
 * @dtg/shared — types and pure helpers shared by the web and api apps.
 *
 * Consumed as TypeScript source, not a build artifact (ADR-0005). The real
 * content schema, DTOs, and `diffContent` land with DAMN-2 / DAMN-3.
 */

/** Placeholder export so the package resolves and has something to test. */
export const SHARED_PACKAGE = '@dtg/shared';

export function greeting(name: string): string {
  return `Hello from ${name}`;
}
