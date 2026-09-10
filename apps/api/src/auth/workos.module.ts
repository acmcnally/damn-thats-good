import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkOS } from '@workos-inc/node';

import type { Env } from '../config/env';
import { TOKEN_VERIFIER } from './token-verifier';
import { USER_LOOKUP } from './user-lookup';
import { WORKOS_CLIENT } from './workos-client';
import { WorkosTokenVerifier } from './workos-token-verifier';
import { WorkosUserLookup } from './workos-user-lookup.service';

/**
 * Everything that talks to WorkOS, in one leaf module with no imports of its own —
 * both `UsersModule` (needs `USER_LOOKUP`) and `AuthModule` (needs `TOKEN_VERIFIER`)
 * import this, rather than either owning WorkOS wiring the other also needs.
 */
@Module({
  providers: [
    {
      provide: WORKOS_CLIENT,
      useFactory: (config: ConfigService<Env, true>) =>
        new WorkOS(config.get('WORKOS_API_KEY', { infer: true }), {
          clientId: config.get('WORKOS_CLIENT_ID', { infer: true }),
        }),
      inject: [ConfigService],
    },
    { provide: TOKEN_VERIFIER, useClass: WorkosTokenVerifier },
    { provide: USER_LOOKUP, useClass: WorkosUserLookup },
  ],
  exports: [TOKEN_VERIFIER, USER_LOOKUP],
})
export class WorkosModule {}
