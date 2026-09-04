import { E2E_BYPASS_COOKIE, type MeResponse } from '@dtg/shared';
import {
  type CanActivate,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Env } from '../config/env';
import { EmailConflictError, UsersService } from '../users/users.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import {
  JwksUnavailableError,
  TOKEN_VERIFIER,
  TokenExpiredError,
  type TokenVerifier,
  type VerifiedClaims,
} from './token-verifier';
import { UserLookupError } from './user-lookup';

interface RequestWithAuth extends Request {
  user?: MeResponse;
}

/**
 * Global guard (`APP_GUARD`) — every route is authenticated by default; `@Public()`
 * opts a route out. See technical-design.md for the full error-mapping rationale and
 * the E2E-bypass trust invariant (the summary: the bypass cookie carries zero trust on
 * its own — the server-side `E2E_AUTH_BYPASS` env var is the sole authority, and it is
 * never set on prod). No header-based sibling for direct `request.*` calls,
 * deliberately — DAMN-1 has no actual use for one; build it later, scoped to whatever
 * real need creates it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    if (this.config.get('E2E_AUTH_BYPASS', { infer: true }) && isBypassRequest(request)) {
      request.user = await this.usersService.findOrProvisionTestUser();
      return true;
    }

    const bearerToken = extractBearerToken(request);
    if (!bearerToken) {
      throw new UnauthorizedException({ error: 'unauthenticated' });
    }

    const claims = await this.verify(bearerToken);
    request.user = await this.provision(claims.sub);
    return true;
  }

  private async verify(bearerToken: string): Promise<VerifiedClaims> {
    try {
      return await this.tokenVerifier.verify(bearerToken);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new UnauthorizedException({ error: 'token_expired' });
      }
      if (err instanceof JwksUnavailableError) {
        throw new ServiceUnavailableException({ error: 'auth_unavailable' });
      }
      // Anything else from a TokenVerifier — including TokenInvalidError — means the
      // token itself is bad.
      throw new UnauthorizedException({ error: 'invalid_token' });
    }
  }

  private async provision(workosUserId: string): Promise<MeResponse> {
    try {
      return await this.usersService.findOrProvision(workosUserId);
    } catch (err) {
      if (err instanceof UserLookupError) {
        throw new ServiceUnavailableException({ error: 'auth_unavailable' });
      }
      if (err instanceof EmailConflictError) {
        throw new ConflictException({ error: 'email_conflict' });
      }
      throw err;
    }
  }
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

function isBypassRequest(request: Request): boolean {
  const cookies = (request as { cookies?: Record<string, string> }).cookies;
  return cookies?.[E2E_BYPASS_COOKIE] === '1';
}
