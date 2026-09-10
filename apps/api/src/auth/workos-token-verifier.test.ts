import { errors as joseErrors } from 'jose';
import { describe, expect, it } from 'vitest';

import { JwksUnavailableError, TokenExpiredError, TokenInvalidError } from './token-verifier';
import { classify } from './workos-token-verifier';

describe('classify', () => {
  it('maps JWTExpired to TokenExpiredError', () => {
    expect(classify(new joseErrors.JWTExpired('expired', {}))).toBeInstanceOf(TokenExpiredError);
  });

  it.each([
    ['JWTClaimValidationFailed', new joseErrors.JWTClaimValidationFailed('bad', {})],
    ['JWSSignatureVerificationFailed', new joseErrors.JWSSignatureVerificationFailed()],
    ['JWTInvalid', new joseErrors.JWTInvalid('bad')],
    ['JWSInvalid', new joseErrors.JWSInvalid('bad')],
    ['JWKSNoMatchingKey', new joseErrors.JWKSNoMatchingKey()],
    ['JWKSMultipleMatchingKeys', new joseErrors.JWKSMultipleMatchingKeys()],
    ['JOSEAlgNotAllowed', new joseErrors.JOSEAlgNotAllowed()],
    ['JOSENotSupported', new joseErrors.JOSENotSupported()],
    ['JWKInvalid', new joseErrors.JWKInvalid('bad')],
  ])('maps %s to TokenInvalidError', (_name, err) => {
    expect(classify(err)).toBeInstanceOf(TokenInvalidError);
  });

  it.each([
    ['JWKSTimeout', new joseErrors.JWKSTimeout()],
    ['JWKSInvalid', new joseErrors.JWKSInvalid('bad')],
    // The bare JOSEError jose throws for a non-200/unparseable JWKS HTTP response.
    ['bare JOSEError', new joseErrors.JOSEError('Expected 200 OK')],
    // A raw, non-JOSE error — jose's remote-JWKS fetcher re-throws network/DNS
    // failures as-is rather than wrapping them (the case this whole function exists
    // to get right).
    ['raw network error', new TypeError('fetch failed')],
  ])('maps %s to JwksUnavailableError, not TokenInvalidError', (_name, err) => {
    expect(classify(err)).toBeInstanceOf(JwksUnavailableError);
  });
});
