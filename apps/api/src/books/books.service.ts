import { books } from '@dtg/db';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';

/** No `packages/shared` DTO yet — nothing client-facing returns book data. */
type Book = typeof books.$inferSelect;

/** The get-or-create race lost *and* the post-race re-lookup still found nothing —
 * should be unreachable given `owner_id`'s unique constraint and Postgres's
 * ON CONFLICT blocking/re-check guarantee (see `getOrCreateForOwner`). Named, not a
 * bare `Error`, so if it ever does fire — an isolation-level change, a pooler that
 * doesn't preserve per-statement snapshot semantics — it's greppable/alertable rather
 * than an undifferentiated 500. */
export class BookProvisioningRaceError extends Error {
  constructor(ownerId: string) {
    super(`getOrCreateForOwner: insert conflicted but no row found for owner ${ownerId}`);
    this.name = 'BookProvisioningRaceError';
  }
}

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
    const existing = await this.findByOwner(ownerId);
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
    // visible to this re-lookup under read committed. No retry loop needed.
    const existingAfterRace = await this.findByOwner(ownerId);
    if (!existingAfterRace) throw new BookProvisioningRaceError(ownerId);
    return existingAfterRace;
  }

  private async findByOwner(ownerId: string): Promise<Book | undefined> {
    const [row] = await this.database.db
      .select()
      .from(books)
      .where(eq(books.ownerId, ownerId))
      .limit(1);
    return row;
  }
}
