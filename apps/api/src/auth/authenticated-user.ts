import type { MeResponse } from '@dtg/shared';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * What `JwtAuthGuard` attaches to `req.user` — the local `users` row. Deliberately the
 * same type as `GET /api/me`'s response (`MeResponse`, `packages/shared`) rather than a
 * separate-but-identical interface: there's no internal field this ever needs beyond
 * what the wire response already carries, so keeping one declaration means a future
 * shape change can't drift between the two without the type system catching it.
 */
interface RequestWithUser extends Request {
  user?: MeResponse;
}

/** `@CurrentUser()` — reads the user the guard already attached. Only valid on a route
 * behind `JwtAuthGuard` (i.e. not `@Public()`); NestJS would throw before a handler
 * using this ever ran on an unauthenticated request, so no undefined-check is exposed
 * here — a route author who slaps `@CurrentUser()` on a `@Public()` route has a bug the
 * type system won't catch, but that combination isn't used anywhere in this app. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user as MeResponse;
});
