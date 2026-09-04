import { describe, expect, it, vi } from 'vitest';

import type { UserLookup } from '../auth/user-lookup';
import type { DatabaseService } from '../database/database.service';
import { UsersService } from './users.service';

/** Minimal fluent mock of the two Drizzle chains `UsersService` uses:
 * `select({...}).from().where().limit()` and
 * `insert().values().onConflictDoUpdate().returning()`. */
function databaseWith(opts: { selectResult: unknown[]; insertResult: unknown[] }) {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(opts.selectResult),
      })),
    })),
  }));
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(opts.insertResult),
      })),
    })),
  }));
  const db = { select, insert } as unknown as DatabaseService['db'];
  return { database: { db } as unknown as DatabaseService, select, insert };
}

describe('UsersService', () => {
  describe('findOrProvision', () => {
    it('on a hit, returns the existing row without calling WorkOS', async () => {
      const { database } = databaseWith({
        selectResult: [{ id: 'u1', email: 'a@b.com' }],
        insertResult: [],
      });
      const lookup = vi.fn();
      const service = new UsersService(database, { lookup } as UserLookup);

      await expect(service.findOrProvision('sub_1')).resolves.toEqual({
        id: 'u1',
        email: 'a@b.com',
      });
      expect(lookup).not.toHaveBeenCalled();
    });

    it('on a miss, looks up the email via WorkOS then upserts', async () => {
      const { database, insert } = databaseWith({
        selectResult: [],
        insertResult: [{ id: 'u2', email: 'new@b.com' }],
      });
      const lookup = vi.fn().mockResolvedValue({ email: 'new@b.com' });
      const service = new UsersService(database, { lookup } as UserLookup);

      await expect(service.findOrProvision('sub_2')).resolves.toEqual({
        id: 'u2',
        email: 'new@b.com',
      });
      expect(lookup).toHaveBeenCalledWith('sub_2');
      expect(insert).toHaveBeenCalledOnce();
    });
  });

  describe('findOrProvisionTestUser', () => {
    it('provisions the fixed e2e user without any WorkOS call', async () => {
      const { database } = databaseWith({
        selectResult: [],
        insertResult: [{ id: 'e2e-1', email: 'e2e@example.test' }],
      });
      const lookup = vi.fn();
      const service = new UsersService(database, { lookup } as UserLookup);

      await expect(service.findOrProvisionTestUser()).resolves.toEqual({
        id: 'e2e-1',
        email: 'e2e@example.test',
      });
      expect(lookup).not.toHaveBeenCalled();
    });
  });
});
