import { startTestDb, type TestDb } from '@dtg/db/testing';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOKEN_VERIFIER, TokenInvalidError, type TokenVerifier } from './auth/token-verifier';
import { USER_LOOKUP, type UserLookup } from './auth/user-lookup';

// Component tier (ADR-0012): the real Nest app + real Drizzle against a throwaway
// Postgres. One container for the file — starting it is the slow part. WorkOS itself
// stays mocked throughout (stub TokenVerifier + stub UserLookup) — this tier never
// needs a live WorkOS.
//
// AppModule is imported *dynamically* inside beforeAll: `ConfigModule.forRoot` validates
// the env the moment app.module.ts is evaluated, so DATABASE_URL (and the other
// required vars) have to be set first.
let db: TestDb;
let app: INestApplication;

/** Bearer tokens this stub understands, `sub` → token. Anything else is "invalid". */
const KNOWN_TOKENS: Record<string, string> = {
  'Bearer token-alice': 'workos_alice',
  'Bearer token-race': 'workos_race',
};

const stubVerifier: TokenVerifier = {
  verify(bearerToken) {
    const sub = KNOWN_TOKENS[`Bearer ${bearerToken}`];
    if (!sub) return Promise.reject(new TokenInvalidError('unknown test token'));
    return Promise.resolve({ sub });
  },
};

const stubUserLookup: UserLookup = {
  lookup(workosUserId) {
    return Promise.resolve({ email: `${workosUserId}@example.test` });
  },
};

beforeAll(async () => {
  db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.WORKOS_API_KEY = 'sk_test_component_tier';
  process.env.WORKOS_CLIENT_ID = 'client_test_component_tier';

  const { AppModule } = await import('./app.module');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TOKEN_VERIFIER)
    .useValue(stubVerifier)
    .overrideProvider(USER_LOOKUP)
    .useValue(stubUserLookup)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await db?.teardown();
});

describe('GET /api/health', () => {
  it('is reachable with no Authorization header (@Public)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});

describe('GET /api/config', () => {
  it('is reachable with no Authorization header (@Public) and returns the Client ID', async () => {
    const res = await request(app.getHttpServer()).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workosClientId: 'client_test_component_tier' });
  });
});

describe('GET /api/me', () => {
  it('401s with no Authorization header', async () => {
    const res = await request(app.getHttpServer()).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthenticated' });
  });

  it('401s with a token the verifier rejects', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid_token' });
  });

  it('JIT-provisions on first sight and returns the local user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', 'Bearer token-alice');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'workos_alice@example.test' });
    expect(typeof res.body.id).toBe('string');
  });

  it('returns the same row on a second request (no duplicate provisioning)', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', 'Bearer token-alice');
    const second = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', 'Bearer token-alice');
    expect(second.body.id).toBe(first.body.id);
  });

  it('the concurrent-first-request race: two parallel requests for a brand-new sub produce exactly one row', async () => {
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).get('/api/me').set('Authorization', 'Bearer token-race'),
      request(app.getHttpServer()).get('/api/me').set('Authorization', 'Bearer token-race'),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.id).toBe(b.body.id);
    expect(a.body.email).toBe('workos_race@example.test');
  });
});
