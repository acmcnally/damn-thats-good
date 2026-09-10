/**
 * Looks up a WorkOS user's profile by id. Behind an interface for the same reason as
 * `TokenVerifier` (ADR-0012) — the component test tier injects a stub via
 * `USER_LOOKUP` instead of the real `WorkosUserLookup`.
 */
export interface UserLookup {
  lookup(workosUserId: string): Promise<{ email: string }>;
}

/** The WorkOS Management API call failed — network blip, WorkOS outage, rate limit,
 * or (rare — the caller only ever looks up a `sub` from an already-verified token) the
 * user no longer exists. All map to 503: a brand-new user's first request shouldn't
 * surface a WorkOS-side failure as an undifferentiated 500, and none of these are
 * something the caller can fix by retrying with different input. */
export class UserLookupError extends Error {
  constructor(cause?: unknown) {
    super('WorkOS user lookup failed', { cause });
    this.name = 'UserLookupError';
  }
}

export const USER_LOOKUP = Symbol('USER_LOOKUP');
