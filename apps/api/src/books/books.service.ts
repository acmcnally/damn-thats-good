import { books } from '@dtg/db';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';

/** No `packages/shared` DTO yet — nothing client-facing returns book data. */
type Book = typeof books.$inferSelect;

@Injectable()
export class BooksService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * `SELECT`-first, not insert-first: once a user's book exists, it exists forever, so
   * every call after the very first is a lookup, not a creation — leading with an insert
   * attempt would mean every call after that attempts a write that's thrown away on
   * conflict.
   */
  async getOrCreateForOwner(ownerId: string): Promise<Book> {
    const [existing] = await this.database.db
      .select()
      .from(books)
      .where(eq(books.ownerId, ownerId))
      .limit(1);
    if (existing) return existing;

    // Fast path missed — this owner has no book yet. Race window: another
    // concurrent call may be inserting the same owner's first book right now.
    const [inserted] = await this.database.db
      .insert(books)
      .values({ ownerId })
      .onConflictDoNothing({ target: books.ownerId })
      .returning();
    if (inserted) return inserted;

    // We lost the race: the other insert committed between our SELECT and our
    // INSERT. Postgres blocks our INSERT on the conflicting row until the
    // winner's transaction commits, then re-checks ON CONFLICT and no-ops —
    // so by the time control reaches here, the winner's row is guaranteed
    // visible to this re-SELECT under read committed. No retry loop needed.
    const [existingAfterRace] = await this.database.db
      .select()
      .from(books)
      .where(eq(books.ownerId, ownerId))
      .limit(1);
    if (!existingAfterRace) {
      throw new Error('getOrCreateForOwner: insert conflicted but no row found');
    }
    return existingAfterRace;
  }
}
