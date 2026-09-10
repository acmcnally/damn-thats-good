import { describe, expect, it, vi } from 'vitest';

import type { UserLookup } from '../auth/user-lookup';
import type { DatabaseService } from '../database/database.service';
import { EmailConflictError, UsersService } from './users.service';

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

    it('lower-cases the email before storing it (WorkOS treats it case-insensitively)', async () => {
      const { database } = databaseWith({
        selectResult: [],
        insertResult: [{ id: 'u3', email: 'mixed@case.com' }],
      });
      const valuesSpy = vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'u3', email: 'mixed@case.com' }]),
        })),
      }));
      (database.db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesSpy });
      const lookup = vi.fn().mockResolvedValue({ email: 'Mixed@Case.com' });
      const service = new UsersService(database, { lookup } as UserLookup);

      await service.findOrProvision('sub_3');

      expect(valuesSpy).toHaveBeenCalledWith({
        workosUserId: 'sub_3',
        email: 'mixed@case.com',
      });
    });

    it('maps a unique-violation on the email constraint to EmailConflictError, not a raw 500', async () => {
      const { database } = databaseWith({ selectResult: [], insertResult: [] });
      const pgError = Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint_name: 'users_email_unique',
      });
      (database.db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn().mockRejectedValue(pgError),
          })),
        })),
      });
      const lookup = vi.fn().mockResolvedValue({ email: 'taken@example.com' });
      const service = new UsersService(database, { lookup } as UserLookup);

      await expect(service.findOrProvision('sub_4')).rejects.toBeInstanceOf(EmailConflictError);
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
