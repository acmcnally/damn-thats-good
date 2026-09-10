/**
 * Verifies a WorkOS access-token JWT. Behind an interface (not a concrete class) so the
 * component test tier never needs a live WorkOS (ADR-0012) — tests inject a stub via the
 * `TOKEN_VERIFIER` provider token instead of the real `WorkosTokenVerifier`.
 */
export interface TokenVerifier {
  /** Resolves with the verified claims, or throws one of the errors below. */
  verify(bearerToken: string): Promise<VerifiedClaims>;
}

export interface VerifiedClaims {
  /** WorkOS user id (the `sub` claim) — the only claim the app keys anything on. */
  sub: string;
}

/** Signature/claims invalid (bad issuer, malformed, wrong key, etc.) — maps to 401. */
export class TokenInvalidError extends Error {
  constructor(cause?: unknown) {
    super('token is invalid', { cause });
    this.name = 'TokenInvalidError';
  }
}

/** Signature valid, but the token has expired — maps to a distinct 401 code so the
 * frontend can tell "session lapsed" apart from "token was never valid". */
export class TokenExpiredError extends Error {
  constructor(cause?: unknown) {
    super('token is expired', { cause });
    this.name = 'TokenExpiredError';
  }
}

/** The JWKS fetch itself failed (network blip, WorkOS outage) — maps to 503, not 401.
 * Treating this like an invalid token would sign out every active session during a
 * transient WorkOS-side failure. */
export class JwksUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WorkOS JWKS unavailable', { cause });
    this.name = 'JwksUnavailableError';
  }
}

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
