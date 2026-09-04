import { users } from '@dtg/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import { USER_LOOKUP, type UserLookup } from '../auth/user-lookup';
import { DatabaseService } from '../database/database.service';

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
  async findOrProvision(workosUserId: string): Promise<AuthenticatedUser> {
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
  async findOrProvisionTestUser(): Promise<AuthenticatedUser> {
    const existing = await this.find(UsersService.E2E_TEST_USER_ID);
    return existing ?? this.upsert(UsersService.E2E_TEST_USER_ID, UsersService.E2E_TEST_EMAIL);
  }

  private async find(workosUserId: string): Promise<AuthenticatedUser | undefined> {
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
   */
  private async upsert(workosUserId: string, email: string): Promise<AuthenticatedUser> {
    const [row] = await this.database.db
      .insert(users)
      .values({ workosUserId, email })
      .onConflictDoUpdate({ target: users.workosUserId, set: { email } })
      .returning({ id: users.id, email: users.email });
    if (!row) throw new Error('upsert into users returned no row');
    return row;
  }
}
