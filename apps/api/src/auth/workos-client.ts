import { WorkOS } from '@workos-inc/node';

/** Injection token for the singleton `WorkOS` SDK client — constructed once per process
 * and shared by the token verifier and the user lookup, never re-created per request. */
export const WORKOS_CLIENT = Symbol('WORKOS_CLIENT');

export type { WorkOS };
