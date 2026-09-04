import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, errors as joseErrors, type JWTPayload, jwtVerify } from 'jose';

import type { Env } from '../config/env';
import {
  JwksUnavailableError,
  TokenExpiredError,
  TokenInvalidError,
  type TokenVerifier,
  type VerifiedClaims,
} from './token-verifier';
import { type WorkOS, WORKOS_CLIENT } from './workos-client';

/**
 * Verifies a WorkOS AuthKit access token against WorkOS's published JWKS.
 *
 * `aud` is deliberately not checked (see technical-design.md) — AuthKit session tokens
 * don't carry one by default, and there's a single first-party API client to check it
 * against. `iss` and `exp` are checked (5s clock tolerance).
 *
 * The remote key set is fetched once and reused for the life of the process — `jose`'s
 * `createRemoteJWKSet` does its own in-memory caching internally, but constructing a new
 * one per request would defeat that and hit WorkOS's JWKS endpoint on every call.
 */
@Injectable()
export class WorkosTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(@Inject(WORKOS_CLIENT) workos: WorkOS, config: ConfigService<Env, true>) {
    const clientId = config.get('WORKOS_CLIENT_ID', { infer: true });
    this.jwks = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(clientId)));
    this.issuer = `https://api.workos.com/user_management/${clientId}`;
  }

  async verify(bearerToken: string): Promise<VerifiedClaims> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(bearerToken, this.jwks, {
        issuer: this.issuer,
        clockTolerance: 5,
        // Pinned explicitly rather than left to whatever the JWKS entries happen to
        // declare — WorkOS signs AuthKit tokens with RS256 (standard for JWKS-published
        // keys); if that ever changes, verification should fail loudly, not silently
        // widen to accept whatever shows up.
        algorithms: ['RS256'],
      }));
    } catch (err) {
      throw classify(err);
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new TokenInvalidError('token has no sub claim');
    }
    return { sub: payload.sub };
  }
}

/**
 * `jose` throws a mix of typed `JOSEError` subclasses and, for the actual
 * "JWKS endpoint unreachable" case, a raw *untyped* error — its remote-JWKS fetcher
 * re-throws the underlying `fetch` failure as-is rather than wrapping it (verified
 * against `jose`'s `jwks/remote.js`). Only a specific, enumerated set of errors mean
 * "this token is bad"; everything else — including an error `jose` doesn't even wrap —
 * is treated as WorkOS/JWKS being unavailable. That's the safer default: 503, not
 * silently signing out every active session on a transient network blip.
 */
export function classify(
  err: unknown,
): TokenInvalidError | TokenExpiredError | JwksUnavailableError {
  if (err instanceof joseErrors.JWTExpired) return new TokenExpiredError(err);

  const tokenIsBad =
    err instanceof joseErrors.JWTClaimValidationFailed ||
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JWTInvalid ||
    err instanceof joseErrors.JWSInvalid ||
    err instanceof joseErrors.JWKSNoMatchingKey ||
    err instanceof joseErrors.JWKSMultipleMatchingKeys ||
    err instanceof joseErrors.JOSEAlgNotAllowed ||
    err instanceof joseErrors.JOSENotSupported ||
    err instanceof joseErrors.JWKInvalid;
  if (tokenIsBad) return new TokenInvalidError(err);

  // JWKSTimeout, JWKSInvalid, the bare JOSEError jose throws for a non-200 or
  // unparseable JWKS HTTP response, and any raw non-JOSE error (DNS/connection
  // failure) all land here.
  return new JwksUnavailableError(err);
}
