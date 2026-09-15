import { startTestDb, type TestDb } from '@dtg/db/testing';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { TOKEN_VERIFIER, type TokenVerifier } from '../auth/token-verifier';
import { USER_LOOKUP, type UserLookup } from '../auth/user-lookup';

/**
 * Component tier (ADR-0012) bootstrap shared across component-api test files: throwaway
 * Postgres container, real `AppModule` with the WorkOS-facing providers swapped for
 * stubs (this tier never needs live WorkOS), a real Nest app. `configure` runs on the
 * app between `createNestApplication` and `init` — e.g. `app.setGlobalPrefix('api')`,
 * which must happen before `init()`.
 */
export interface ComponentApp {
  app: INestApplication;
  db: TestDb;
  teardown: () => Promise<void>;
}

export async function bootstrapComponentApp(opts: {
  tokenVerifier: TokenVerifier;
  userLookup: UserLookup;
  configure?: (app: INestApplication) => void;
}): Promise<ComponentApp> {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.WORKOS_API_KEY = 'sk_test_component_tier';
  process.env.WORKOS_CLIENT_ID = 'client_test_component_tier';

  // Imported dynamically: ConfigModule.forRoot validates the env the moment
  // app.module.ts is evaluated, so DATABASE_URL (and the other required vars) have to
  // be set first.
  const { AppModule } = await import('../app.module');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TOKEN_VERIFIER)
    .useValue(opts.tokenVerifier)
    .overrideProvider(USER_LOOKUP)
    .useValue(opts.userLookup)
    .compile();
  const app = moduleRef.createNestApplication();
  opts.configure?.(app);
  await app.init();

  return {
    app,
    db,
    teardown: async () => {
      await app.close();
      await db.teardown();
    },
  };
}
