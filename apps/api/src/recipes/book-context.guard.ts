import { books } from '@dtg/db';
import type { MeResponse } from '@dtg/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { BooksService } from '../books/books.service';

export type Book = typeof books.$inferSelect;

interface RequestWithBook extends Request {
  user?: MeResponse;
  book?: Book;
}

/**
 * Registered per-controller, running after the global `JwtAuthGuard` (DAMN-2). No
 * route ever takes a `bookId` param — V1 has exactly one book per user (DAMN-4) — so
 * this resolves the caller's book server-side via `BooksService.getOrCreateForOwner`
 * and attaches it to the request; `@CurrentBook()` reads it back, the same shape as
 * `@CurrentUser()`/`JwtAuthGuard`.
 */
@Injectable()
export class BookContextGuard implements CanActivate {
  constructor(private readonly books: BooksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBook>();
    // JwtAuthGuard has already run (global guard) and attached `user` — a route
    // reaching this guard is never `@Public()`.
    const user = request.user!;
    request.book = await this.books.getOrCreateForOwner(user.id);
    return true;
  }
}
