import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { Book } from './book-context.guard';

interface RequestWithBook extends Request {
  book?: Book;
}

/** `@CurrentBook()` — reads the book `BookContextGuard` already attached. Only valid
 * on a route behind that guard, the same contract `@CurrentUser()` has with
 * `JwtAuthGuard`. */
export const CurrentBook = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithBook>();
  return request.book as Book;
});
