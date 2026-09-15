import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { BooksService } from './books.service';

/** Minimal fluent mock of the two Drizzle chains `BooksService` uses:
 * `select().from().where().limit()` and
 * `insert().values().onConflictDoNothing().returning()`.
 * `selectResults` is consumed in call order — one entry per `SELECT` the test expects. */
function databaseWith(opts: { selectResults: unknown[][]; insertResult: unknown[] }) {
  const selectResults = [...opts.selectResults];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(selectResults.shift() ?? []),
      })),
    })),
  }));
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(opts.insertResult),
      })),
    })),
  }));
  const db = { select, insert } as unknown as DatabaseService['db'];
  return { database: { db } as unknown as DatabaseService, select, insert };
}

describe('BooksService', () => {
  describe('getOrCreateForOwner', () => {
    it('on a hit, returns the existing row without attempting an insert', async () => {
      const { database, insert } = databaseWith({
        selectResults: [[{ id: 'b1', ownerId: 'u1', name: 'My Recipe Book' }]],
        insertResult: [],
      });
      const service = new BooksService(database);

      await expect(service.getOrCreateForOwner('u1')).resolves.toEqual({
        id: 'b1',
        ownerId: 'u1',
        name: 'My Recipe Book',
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it('on a miss, inserts and returns the new row', async () => {
      const { database } = databaseWith({
        selectResults: [[]],
        insertResult: [{ id: 'b2', ownerId: 'u2', name: 'My Recipe Book' }],
      });
      const service = new BooksService(database);

      await expect(service.getOrCreateForOwner('u2')).resolves.toEqual({
        id: 'b2',
        ownerId: 'u2',
        name: 'My Recipe Book',
      });
    });

    it('on a miss where the insert loses a race (conflict), falls back to a second SELECT', async () => {
      const { database, select } = databaseWith({
        selectResults: [[], [{ id: 'b3', ownerId: 'u3', name: 'My Recipe Book' }]],
        insertResult: [], // onConflictDoNothing: the concurrent winner's insert already landed
      });
      const service = new BooksService(database);

      await expect(service.getOrCreateForOwner('u3')).resolves.toEqual({
        id: 'b3',
        ownerId: 'u3',
        name: 'My Recipe Book',
      });
      expect(select).toHaveBeenCalledTimes(2);
    });

    it('throws if the insert conflicted but the fallback SELECT still finds nothing (should be unreachable)', async () => {
      const { database } = databaseWith({
        selectResults: [[], []],
        insertResult: [],
      });
      const service = new BooksService(database);

      await expect(service.getOrCreateForOwner('u4')).rejects.toThrow(
        'getOrCreateForOwner: insert conflicted but no row found',
      );
    });
  });
});
