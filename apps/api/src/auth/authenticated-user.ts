import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** What `JwtAuthGuard` attaches to `req.user` on success — the local `users` row,
 * never raw WorkOS claims (callers should never need `sub` beyond provisioning). */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** `@CurrentUser()` — reads the user the guard already attached. Only valid on a route
 * behind `JwtAuthGuard` (i.e. not `@Public()`); NestJS would throw before a handler
 * using this ever ran on an unauthenticated request, so no undefined-check is exposed
 * here — a route author who slaps `@CurrentUser()` on a `@Public()` route has a bug the
 * type system won't catch, but that combination isn't used anywhere in this app. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user as AuthenticatedUser;
});
