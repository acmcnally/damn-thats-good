import type { ExecutionContext } from '@nestjs/common';
import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../config/env';
import { EmailConflictError, type UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  JwksUnavailableError,
  TokenExpiredError,
  TokenInvalidError,
  type TokenVerifier,
} from './token-verifier';
import { UserLookupError } from './user-lookup';

function contextWith(request: Partial<Request>, isPublic = false) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const context = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

function guardWith(opts: {
  bypassEnv?: boolean;
  verify?: TokenVerifier['verify'];
  findOrProvision?: UsersService['findOrProvision'];
  findOrProvisionTestUser?: UsersService['findOrProvisionTestUser'];
  reflector: Reflector;
}) {
  const config = {
    get: vi.fn().mockReturnValue(opts.bypassEnv ?? false),
  } as unknown as ConfigService<Env, true>;
  const tokenVerifier: TokenVerifier = { verify: opts.verify ?? vi.fn() };
  const usersService = {
    findOrProvision: opts.findOrProvision ?? vi.fn(),
    findOrProvisionTestUser: opts.findOrProvisionTestUser ?? vi.fn(),
  } as unknown as UsersService;
  return new JwtAuthGuard(opts.reflector, config, tokenVerifier, usersService);
}

describe('JwtAuthGuard', () => {
  it('lets a @Public() route through without touching the verifier', async () => {
    const { reflector, context } = contextWith({ headers: {} }, true);
    const verify = vi.fn();
    const guard = guardWith({ reflector, verify });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('401s with "unauthenticated" when there is no Authorization header', async () => {
    const { reflector, context } = contextWith({ headers: {} });
    const guard = guardWith({ reflector });

    await expect(guard.canActivate(context)).rejects.toMatchObject(
      new UnauthorizedException({ error: 'unauthenticated' }),
    );
  });

  it('401s with "invalid_token" when verification fails on signature/claims', async () => {
    const { reflector, context } = contextWith({ headers: { authorization: 'Bearer bad' } });
    const verify = vi.fn().mockRejectedValue(new TokenInvalidError());
    const guard = guardWith({ reflector, verify });

    await expect(guard.canActivate(context)).rejects.toMatchObject(
      new UnauthorizedException({ error: 'invalid_token' }),
    );
  });

  it('401s with "token_expired" when verification fails on expiry', async () => {
    const { reflector, context } = contextWith({ headers: { authorization: 'Bearer old' } });
    const verify = vi.fn().mockRejectedValue(new TokenExpiredError());
    const guard = guardWith({ reflector, verify });

    await expect(guard.canActivate(context)).rejects.toMatchObject(
      new UnauthorizedException({ error: 'token_expired' }),
    );
  });

  it('503s, not 401s, when the JWKS fetch itself is unavailable', async () => {
    const { reflector, context } = contextWith({ headers: { authorization: 'Bearer x' } });
    const verify = vi.fn().mockRejectedValue(new JwksUnavailableError());
    const guard = guardWith({ reflector, verify });

    await expect(guard.canActivate(context)).rejects.toMatchObject(
      new ServiceUnavailableException({ error: 'auth_unavailable' }),
    );
  });

  it('503s, not 500s, when JIT provisioning fails to reach WorkOS', async () => {
    const { reflector, context } = contextWith({ headers: { authorization: 'Bearer x' } });
    const verify = vi.fn().mockResolvedValue({ sub: 'user_123' });
    const findOrProvision = vi.fn().mockRejectedValue(new UserLookupError());
    const guard = guardWith({ reflector, verify, findOrProvision });

    await expect(guard.canActivate(context)).rejects.toMatchObject(
      new ServiceUnavailableException({ error: 'auth_unavailable' }),
    );
  });

  it('409s, not 500s, when provisioning collides on email (a different WorkOS identity already owns it)', async () => {
    const { reflector, context } = contextWith({ headers: { authorization: 'Bearer x' } });
    const verify = vi.fn().mockResolvedValue({ sub: 'user_123' });
    const findOrProvision = vi.fn().mockRejectedValue(new EmailConflictError());
    const guard = guardWith({ reflector, verify, findOrProvision });

    await expect(guard.canActivate(context)).rejects.toMatchObject(
      new ConflictException({ error: 'email_conflict' }),
    );
  });

  it('on success, attaches the provisioned user to the request', async () => {
    const request: Partial<Request> = { headers: { authorization: 'Bearer good' } };
    const { reflector, context } = contextWith(request);
    const verify = vi.fn().mockResolvedValue({ sub: 'user_123' });
    const findOrProvision = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const guard = guardWith({ reflector, verify, findOrProvision });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findOrProvision).toHaveBeenCalledWith('user_123');
    expect((request as { user?: unknown }).user).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  describe('E2E auth bypass — the invariant the whole mechanism rests on', () => {
    it('with E2E_AUTH_BYPASS unset, the bypass cookie alone grants nothing: real verification still runs and still fails', async () => {
      const { reflector, context } = contextWith({
        headers: {},
        cookies: { e2e_bypass: '1' },
      } as unknown as Partial<Request>);
      const verify = vi.fn().mockRejectedValue(new TokenInvalidError());
      const findOrProvisionTestUser = vi.fn();
      const guard = guardWith({ reflector, bypassEnv: false, verify, findOrProvisionTestUser });

      // No Authorization header either — falls straight to the unauthenticated 401,
      // proving the cookie was never even inspected (env gate short-circuits first).
      await expect(guard.canActivate(context)).rejects.toMatchObject(
        new UnauthorizedException({ error: 'unauthenticated' }),
      );
      expect(findOrProvisionTestUser).not.toHaveBeenCalled();
    });

    it('with E2E_AUTH_BYPASS=1 and the cookie present, skips WorkOS entirely and provisions the fixed test user', async () => {
      const request: Partial<Request> = {
        headers: {},
        cookies: { e2e_bypass: '1' },
      } as Partial<Request>;
      const { reflector, context } = contextWith(request);
      const verify = vi.fn();
      const findOrProvisionTestUser = vi
        .fn()
        .mockResolvedValue({ id: 'e2e-1', email: 'e2e@example.test' });
      const guard = guardWith({ reflector, bypassEnv: true, verify, findOrProvisionTestUser });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(verify).not.toHaveBeenCalled();
      expect(findOrProvisionTestUser).toHaveBeenCalledOnce();
      expect((request as { user?: unknown }).user).toEqual({
        id: 'e2e-1',
        email: 'e2e@example.test',
      });
    });

    it('with E2E_AUTH_BYPASS=1 but no cookie, falls through to normal verification', async () => {
      const { reflector, context } = contextWith({ headers: {} });
      const findOrProvisionTestUser = vi.fn();
      const guard = guardWith({ reflector, bypassEnv: true, findOrProvisionTestUser });

      await expect(guard.canActivate(context)).rejects.toMatchObject(
        new UnauthorizedException({ error: 'unauthenticated' }),
      );
      expect(findOrProvisionTestUser).not.toHaveBeenCalled();
    });
  });
});
