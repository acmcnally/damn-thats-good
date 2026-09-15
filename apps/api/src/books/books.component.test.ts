import { users } from '@dtg/db';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TokenVerifier } from '../auth/token-verifier';
import type { UserLookup } from '../auth/user-lookup';
import { DatabaseService } from '../database/database.service';
import { bootstrapComponentApp } from '../test-support/component-app';
import { BooksService } from './books.service';

// Component tier (ADR-0012): real Nest DI + real Drizzle against a throwaway Postgres,
// same container-per-file shape as app.component.test.ts. No HTTP route exists yet, so
// BooksService is resolved from the DI container directly instead of going through
// supertest. WorkOS itself is never touched here — the stub verifier/lookup are only
// present because AppModule wires AuthModule regardless of what this file exercises.
let app: INestApplication;
let teardown: () => Promise<void>;
let booksService: BooksService;
let databaseService: DatabaseService;

const stubVerifier: TokenVerifier = {
  verify: () => Promise.reject(new Error('not used in this file')),
};
const stubUserLookup: UserLookup = {
  lookup: () => Promise.reject(new Error('not used in this file')),
};

beforeAll(async () => {
  ({ app, teardown } = await bootstrapComponentApp({
    tokenVerifier: stubVerifier,
    userLookup: stubUserLookup,
  }));

  booksService = app.get(BooksService);
  databaseService = app.get(DatabaseService);
});

afterAll(async () => {
  await teardown?.();
});

/** `books.owner_id` is NOT NULL and FKs to `users.id` — provision a fresh owner per
 * test case (disjoint ids, same shape as app.component.test.ts's `token-alice` /
 * `token-race` split) rather than sharing one fixture user across cases. */
async function provisionOwner(workosUserId: string): Promise<string> {
  const [row] = await databaseService.db
    .insert(users)
    .values({ workosUserId, email: `${workosUserId}@example.test` })
    .returning({ id: users.id });
  if (!row) throw new Error('failed to provision test owner');
  return row.id;
}

describe('BooksService.getOrCreateForOwner', () => {
  it('creates a book with the default name for a fresh owner', async () => {
    const ownerId = await provisionOwner('workos_books_fresh');

    const book = await booksService.getOrCreateForOwner(ownerId);

    expect(book.ownerId).toBe(ownerId);
    expect(book.name).toBe('My Recipe Book');
  });

  it('returns the same row on a second call, not a second insert', async () => {
    const ownerId = await provisionOwner('workos_books_repeat');

    const first = await booksService.getOrCreateForOwner(ownerId);
    const second = await booksService.getOrCreateForOwner(ownerId);

    expect(second.id).toBe(first.id);
  });

  it('the concurrent-first-call race: two parallel calls for a brand-new owner produce exactly one row', async () => {
    const ownerId = await provisionOwner('workos_books_race');

    const [a, b] = await Promise.all([
      booksService.getOrCreateForOwner(ownerId),
      booksService.getOrCreateForOwner(ownerId),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.ownerId).toBe(ownerId);
  });
});
