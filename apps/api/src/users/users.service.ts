import { users } from '@dtg/db';
import type { MeResponse } from '@dtg/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { USER_LOOKUP, type UserLookup } from '../auth/user-lookup';
import { DatabaseService } from '../database/database.service';

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/** A provisioning insert collided on `users_email_unique`, not `workos_user_id` (the
 * conflict target `upsert()` already handles). Means two different WorkOS identities
 * resolved to the same email — rare (WorkOS treats email as unique per environment),
 * but not impossible (e.g. a WorkOS account deleted and recreated with a reused
 * address) and not something a retry fixes on its own, so it gets its own error rather
 * than surfacing as an unhandled 500. */
export class EmailConflictError extends Error {
  constructor(cause?: unknown) {
    super('email already associated with a different WorkOS identity', { cause });
    this.name = 'EmailConflictError';
  }
}

/** Just-in-time provisioning (DAMN-1, no webhook — no public ingress until DAMN-30). */
@Injectable()
export class UsersService {
  private static readonly E2E_TEST_USER_ID = 'e2e-test-user';
  private static readonly E2E_TEST_EMAIL = 'e2e@example.test';

  constructor(
    private readonly database: DatabaseService,
    @Inject(USER_LOOKUP) private readonly userLookup: UserLookup,
  ) {}

  /**
   * `SELECT` by `workos_user_id`. Hit → return as-is, no re-sync of `email` from WorkOS
   * (known V1 limitation, accepted — see technical-design.md). Miss → look up the email
   * via WorkOS, then upsert.
   */
  async findOrProvision(workosUserId: string): Promise<MeResponse> {
    const existing = await this.find(workosUserId);
    if (existing) return existing;

    const { email } = await this.userLookup.lookup(workosUserId);
    return this.upsert(workosUserId, email);
  }

  /**
   * E2E auth bypass only (`JwtAuthGuard`) — provisions the fixed deterministic test
   * user without any WorkOS call at all, since the whole point of the bypass is that
   * tests never need live WorkOS.
   */
  async findOrProvisionTestUser(): Promise<MeResponse> {
    const existing = await this.find(UsersService.E2E_TEST_USER_ID);
    return existing ?? this.upsert(UsersService.E2E_TEST_USER_ID, UsersService.E2E_TEST_EMAIL);
  }

  private async find(workosUserId: string): Promise<MeResponse | undefined> {
    const [row] = await this.database.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.workosUserId, workosUserId))
      .limit(1);
    return row;
  }

  /**
   * Upsert, not check-then-insert — two concurrent first-requests for the same
   * brand-new `workosUserId` (e.g. two tabs) must not race into a duplicate-row error
   * or a lost update. The conflicting `set` is a harmless idempotent overwrite in that
   * race (both callers just resolved the same email), not a resync path.
   *
   * `onConflictDoUpdate` only arbitrates on the `workos_user_id` conflict target;
   * `email` carries its own separate unique constraint that a fresh insert can also
   * collide with (see `EmailConflictError`) — caught explicitly rather than left to
   * surface as a raw, unhandled Postgres error.
   */
  private async upsert(workosUserId: string, email: string): Promise<MeResponse> {
    // WorkOS treats email as case-insensitive per environment; match that here so the
    // DB-level unique constraint actually enforces the uniqueness the schema documents.
    const normalizedEmail = email.toLowerCase();
    try {
      const [row] = await this.database.db
        .insert(users)
        .values({ workosUserId, email: normalizedEmail })
        .onConflictDoUpdate({ target: users.workosUserId, set: { email: normalizedEmail } })
        .returning({ id: users.id, email: users.email });
      if (!row) throw new Error('upsert into users returned no row');
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_unique')) {
        throw new EmailConflictError(err);
      }
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint_name?: string } | undefined;
  return pgErr?.code === UNIQUE_VIOLATION && pgErr.constraint_name === constraintName;
}
