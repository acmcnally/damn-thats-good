import { Inject, Injectable } from '@nestjs/common';

import { type UserLookup, UserLookupError } from './user-lookup';
import { type WorkOS, WORKOS_CLIENT } from './workos-client';

@Injectable()
export class WorkosUserLookup implements UserLookup {
  constructor(@Inject(WORKOS_CLIENT) private readonly workos: WorkOS) {}

  async lookup(workosUserId: string): Promise<{ email: string }> {
    try {
      const user = await this.workos.userManagement.getUser(workosUserId);
      return { email: user.email };
    } catch (err) {
      throw new UserLookupError(err);
    }
  }
}
