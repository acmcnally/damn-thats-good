# Feature: Recipe Book data model

**Tracker:** DAMN-4 · **Depends on:** DAMN-1 (auth, shipped — `users` table this references). **Blocks:** DAMN-2 (recipe schema references `books.id`).

## UX / UI

No UI surface (locked at scope lock-in). No book-switcher, no book-name editing screen — the `name` column exists for future use, not for V1 display. Skipping straight to technical design.

## Summary

A `books` table, single-owner in V1 (no `book_owners` join table — see "Open decisions" below), created lazily on first need rather than eagerly at signup — see "Open decisions" for what "first need" means in practice. No new HTTP routes; `BooksService.getOrCreateForOwner()` is consumed server-side by whatever issue wires book id into the client (DAMN-2 is the first candidate).

## Data model

```ts
export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .unique() // exactly one book per owner in V1 — see "Open decisions"
    .references(() => users.id),
  name: text('name').notNull().default('My Recipe Book'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`owner_id` is `UNIQUE`, not just indexed — it's the mechanism that makes "exactly one book per user" a real invariant (not just a convention the API happens to follow) and is what makes the concurrency-safe get-or-create below work: the database, not application logic, arbitrates a race.

No FK from `books` back to a "current recipe" or similar — `books` only ever needs to be looked up by `owner_id` in this issue.

## Interfaces / API surface

No new HTTP routes. One service method, `apps/api/src/books/books.service.ts`:

```ts
async getOrCreateForOwner(ownerId: string): Promise<Book>
```

`SELECT`-first, not insert-first: once a user's book exists, it exists forever, so every call after the very first is a lookup, not a creation. Leading with `INSERT ... ON CONFLICT` (the `UsersService` idiom this was originally modeled on) would mean every future call attempts a write that's thrown away on conflict — cheap, but pointless on what's actually the overwhelmingly common path. This is also *not* `UsersService`'s "upsert, not check-then-insert" philosophy — there's nothing to update on conflict, only get-or-create, so a plain `SELECT` fallback beats `onConflictDoUpdate`'s no-op write on every hit:

```ts
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
  if (!existingAfterRace) throw new Error('getOrCreateForOwner: insert conflicted but no row found');
  return existingAfterRace;
}
```

Two concurrent first-book requests for the same brand-new owner both miss the initial `SELECT`, both attempt the `INSERT`: one wins, the other's `onConflictDoNothing` returns nothing and falls through to the second `SELECT`, which — per Postgres's `ON CONFLICT` blocking/re-check behavior described above — is guaranteed to see the winner's row.

**Consumption note:** whatever calls this must fetch `book_id` once and cache it for the session — nothing may call `getOrCreateForOwner`, or otherwise hit the database for the book id, on every action. Nearly every authenticated workflow (create, the recipe list, search) needs `book_id` immediately, so the natural trigger is early — e.g. session bootstrap, alongside DAMN-1's JIT `users` provisioning — but the exact trigger point is left to whichever issue wires this in, not fixed by this issue.

## Shared types

None added to `packages/shared` — there's no client-facing DTO yet (no route returns book data to the client). `Book` as a type is just Drizzle's inferred `typeof books.$inferSelect`, used internally by the API. A future issue that actually exposes book data to the client (if any) defines that DTO when it needs it.

## Migration

Additive: add `books` to `packages/db/src/schema.ts`, run `pnpm --filter @dtg/db exec drizzle-kit generate` to produce the next numbered migration (`0003_*.sql`, following `0000`–`0002`). No backfill — no `books` rows exist before this ships. Also add `export { books } from './schema';` to `packages/db/src/index.ts`, alongside the existing `users` export.

## Test plan (ADR-0012 tiers)

### Unit (`apps/api/src/books/books.service.test.ts`)
Mirrors `users.service.test.ts`'s pattern — mock the fluent Drizzle chain:
- `getOrCreateForOwner` on an owner with an existing book: `SELECT` returns the row, insert never attempted.
- `SELECT` miss, insert succeeds: returns the newly inserted row.
- `SELECT` miss, insert conflicts (returns nothing): falls back to the second `SELECT` and returns that row.
- The "insert conflicted but no row found" branch throws (defensive — should be unreachable given the unique constraint, but asserted so it's not silently swallowed).

### Component-api (extends `apps/api/src/app.component.test.ts`'s pattern, or a sibling file — real Nest app + Testcontainers Postgres)
Resolves `BooksService` from the DI container directly (no HTTP route to hit through `supertest`, unlike the existing `/api/me` tests). `books.owner_id` is `NOT NULL` and FKs to `users.id`, so every test case first provisions its owner's `users` row — following the same fixture pattern as the existing `/api/me` component tests (`token-alice` / `token-race` style disjoint `sub`s per case), not a shared fixture user:
- Fresh owner → a row with `name: 'My Recipe Book'`.
- Second call, same owner → same row (`id` matches), not a second insert.
- The concurrent-race case, directly mirroring the existing `/api/me` race test: two parallel `getOrCreateForOwner()` calls for the same brand-new `ownerId` (its `users` row already provisioned, so only the `books` race is under test) produce exactly one row. This is the one thing the unit tier's mocked Drizzle chain *can't* prove — it needs the real unique constraint under real concurrent connections.

Per `packages/db/src/testing.ts`'s existing `TODO(DAMN-2)` about per-test isolation ("migrate-once is enough... walking-skeleton endpoints are read-only"): this issue introduces writes, but follows the existing test file's own precedent (`token-alice` / `token-race` use disjoint `sub`s) rather than solving that TODO — each test case uses a distinct, freshly-provisioned owner, so tests don't collide despite sharing one container/migration for the file. Solving real per-test isolation (truncation/transaction-rollback) stays deferred to whichever issue first can't work around it this way.

## Open decisions from phase 1 — resolved

1. **Single-owner column vs. a `book_owners` join table for multi-owner:** resolved — single `owner_id` column, no join table. DAMN-4's original text argued for building the ownership model now to avoid a costly retrofit; reconsidered because DAMN-19 (multi-owner "household" books) raised its own unresolved design question (does it force multiple-books-per-user and real UI hierarchy? — see the reasoning on DAMN-19). That question led to DAMN-19 being pulled from the roadmap entirely (parked, unscheduled — 2026-09-15), so this is a plain, permanent-for-now single-owner model, not a hedge pending DAMN-19's fate. If multi-owner books are ever revived from the backlog, the join table is the retrofit needed on top of this schema at that point.
2. **`name` field — in or out for V1:** resolved — in, defaulted to `"My Recipe Book"`. Costs nothing today (one column, one default) and avoids a later migration if any future feature wants a display name. Not surfaced in any V1 UI.
3. **Creation timing — eager (at signup) vs. lazy (on first need):** resolved — lazy, but "first need" is deliberately broad, not narrowly "the literal recipe-creation click." Nearly every authenticated workflow (create, the recipe list, search) needs `book_id` as its first step, so scattering `getOrCreateForOwner` calls across each of those entry points would be worse than picking one early trigger. The natural candidate is session bootstrap, alongside DAMN-1's JIT `users` provisioning — which does mean most signed-in users end up with a `books` row almost immediately, functionally close to eager. That's accepted: the actual cost being guarded against was never "a user has an unused row," it was "every action pays a database round trip for the book id." The one hard constraint, regardless of trigger point: the client fetches `book_id` once per session and caches it — see the consumption note in "Interfaces" above. The exact trigger point is left to whichever issue wires this in (DAMN-2 is the first candidate), not fixed here.

## Known limitations — accepted for this issue

- No UI surface — matches locked scope.
- Multi-owner ("household") books are not modeled — DAMN-19 is parked, unscheduled, out of every planned release.
- No `packages/shared` DTOs — nothing client-facing yet.
